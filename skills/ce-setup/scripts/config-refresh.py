#!/usr/bin/env python3
"""Bring a repo's Compound Engineering config files up to date with the bundled template.

Subcommands (each prints one JSON object on stdout):

  status                     version and refresh state of config.yaml and config.local.yaml
  draft  --layer L [--changes F]
                             write a rebuilt copy of the layer's file to a temp directory,
                             applying the registry's removals plus the decisions in F
  verify --layer L --draft D --changes C
                             re-read the layer's file and the draft from disk and confirm that
                             every difference is one the changes file records and allows
  apply  --layer L --draft D --changes C
                             verify again, then replace the layer's file with the draft

L is `tracked` (config.yaml) or `local` (config.local.yaml). `--repo DIR` overrides
the repository root (default: the git top level of the working directory).

Exit 0 when the command did its job (status always; draft drafted or found nothing
to do; verify and apply passed). Exit 1 when the file is refused, a change is not
allowed, or verification failed; the JSON says why and the file is untouched.

The changes file is {"changes": [...]} with one entry per decision:

  {"type": "remove",  "key": K, "reason": R}            registry key, or a migrate key whose target already wins
  {"type": "migrate", "key": K, "value": V, "reason": R} registry migrate key, written to its target
  {"type": "rename",  "from": K, "to": T, "reason": R}   unrecognized key to one of its typo candidates
  {"type": "comment-remove", "line": TEXT, "reason": R}  drop one comment line the team wrote
  {"type": "comment-move", "line": TEXT, "key": K, "reason": R}
                                                         place one comment line above setting K

Only a subset of YAML is read: top-level `key:` lines with indented or `- ` continuation
lines and comments. Anything else (duplicate keys, anchors, block scalars, tabs in
indentation, flow collections spanning lines) is refused with its file and line.
Standard library only.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFERENCES = os.path.join(SKILL_DIR, "references")
TEMPLATE_PATH = os.path.join(REFERENCES, "config-template.yaml")
REGISTRY_PATH = os.path.join(REFERENCES, "retired-config-keys.yaml")
TEMPLATE_LINES_PATH = os.path.join(REFERENCES, "config-template-lines.txt")

LAYER_FILES = {"tracked": "config.yaml", "local": "config.local.yaml"}
DRAFT_PREFIX = "ce-config-refresh-"

KEY_LINE = re.compile(r"^([A-Za-z_][A-Za-z0-9_.-]*)[ ]*:(?=\s|$)(.*)$")
SLOT_LINE = re.compile(r"^# ([A-Za-z][A-Za-z0-9_]*):(?:\s|$)")
SLOT_CONTINUATION = re.compile(r"^# {3,}\S")
VERSION_LINE = re.compile(r"^# ce-config-template-version:(.*)$")
ANCHOR_OR_ALIAS = re.compile(r"(?:^|:\s+|-\s+|[\[{,]\s*)[&*][A-Za-z0-9_-]")
BLOCK_SCALAR = re.compile(r"(?:^|:\s+|-\s+)[|>][-+0-9]*\s*$")
LEGACY_LOCAL_MARKERS = (
    "# Compound Engineering -- local config",
    "# Copy to .compound-engineering/config.local.yaml",
)

MARKER = "# --- Kept from the previous file: settings this plugin does not recognize, and notes ---"
LOCAL_HEADER = [
    "# Compound Engineering -- checkout-local overrides. Keep this file gitignored.",
    "# A setting here wins over config.yaml for this checkout; docs_root is read",
    "# only from config.yaml. config.example.yaml lists every setting.",
]


class Refused(Exception):
    pass


# --- line helpers ----------------------------------------------------------------


def split_comment(line):
    """Return (code, gap, comment) for a trailing `# ...` comment outside quotes."""
    quote = ""
    for i, ch in enumerate(line):
        prev = line[i - 1] if i else " "
        if quote:
            if ch == quote:
                quote = ""
        elif ch in "'\"" and prev in " \t[{,:-":
            quote = ch
        elif ch == "#" and prev in " \t":
            code = line[:i].rstrip()
            return code, line[len(code):i], line[i:].rstrip()
    return line.rstrip(), "", ""


def normalize_comment(comment):
    return " ".join(comment.split())


def is_comment(line):
    return line.lstrip().startswith("#")


# --- parsing ---------------------------------------------------------------------


class Item:
    def __init__(self, kind, lines, lineno, key=None):
        self.kind = kind  # "block" | "comment" | "blank"
        self.lines = lines
        self.lineno = lineno
        self.key = key
        self.attached = []  # comment Items directly above a block


class Parsed:
    def __init__(self, path, text):
        self.path = path
        self.name = os.path.basename(path)
        self.bom = text.startswith("﻿")
        body = text[1:] if self.bom else text
        self.eol = "\r\n" if "\r\n" in body else "\n"
        self.raw_lines = [line.rstrip() for line in body.splitlines()]
        self.items = []
        self.errors = []
        self._parse()

    def error(self, lineno, message):
        self.errors.append(f"{self.name}:{lineno}: {message}")

    def _check_code(self, code, lineno):
        if ANCHOR_OR_ALIAS.search(code):
            self.error(lineno, "anchors and aliases are not supported")
        if BLOCK_SCALAR.search(code):
            self.error(lineno, "`|` and `>` block scalars are not supported")
        depth = 0
        quote = ""
        for ch in code:
            if quote:
                if ch == quote:
                    quote = ""
            elif ch in "'\"":
                quote = ch
            elif ch in "[{":
                depth += 1
            elif ch in "]}":
                depth -= 1
        if depth != 0:
            self.error(lineno, "flow collections must open and close on one line")

    def _parse(self):
        block = None
        pending = []
        for lineno, line in enumerate(self.raw_lines, 1):
            if not line.strip() or is_comment(line):
                item = Item("blank" if not line.strip() else "comment", [line], lineno)
                if block is not None:
                    pending.append(item)
                else:
                    self.items.append(item)
                continue
            indent = len(line) - len(line.lstrip(" \t"))
            if "\t" in line[:indent]:
                self.error(lineno, "tabs in indentation are not supported")
                continue
            code = split_comment(line)[0]
            if indent > 0 or line.startswith("- ") or line == "-":
                if block is None:
                    self.error(lineno, "indented line outside any setting")
                    continue
                block.lines.extend(p.lines[0] for p in pending)
                pending = []
                block.lines.append(line)
                self._check_code(code.strip(), lineno)
                continue
            match = KEY_LINE.match(line)
            if not match:
                self.error(lineno, f"not a `key: value` line: `{line}`")
                continue
            self.items.extend(pending)
            pending = []
            block = Item("block", [line], lineno, match.group(1))
            self.items.append(block)
            self._check_code(code.strip(), lineno)
        self.items.extend(pending)

        seen = {}
        for item in self.items:
            if item.kind != "block":
                continue
            if item.key in seen:
                self.error(item.lineno, f"duplicate setting `{item.key}` (first at line {seen[item.key]})")
            else:
                seen[item.key] = item.lineno

    def blocks(self):
        return [item for item in self.items if item.kind == "block"]

    def block(self, key):
        for item in self.blocks():
            if item.key == key:
                return item
        return None

    def version(self):
        """(value, lineno) of the template version line, or (None, None)."""
        for lineno, line in enumerate(self.raw_lines, 1):
            match = VERSION_LINE.match(line)
            if match:
                return match.group(1).strip(), lineno
        return None, None

    def is_legacy_local(self):
        return any(line.startswith(marker) for line in self.raw_lines for marker in LEGACY_LOCAL_MARKERS)


def read_parsed(path):
    with open(path, encoding="utf-8", errors="strict", newline="") as fh:
        return Parsed(path, fh.read())


def block_is_set(block):
    if block is None:
        return False
    rest = split_comment(KEY_LINE.match(block.lines[0]).group(2))[0].strip()
    return bool(rest) or any(not is_comment(line) and line.strip() for line in block.lines[1:])


# --- bundled data ----------------------------------------------------------------


class Bundle:
    def __init__(self):
        with open(TEMPLATE_PATH, encoding="utf-8") as fh:
            self.template = [line.rstrip() for line in fh.read().splitlines()]
        with open(TEMPLATE_LINES_PATH, encoding="utf-8") as fh:
            self.known = {line.rstrip() for line in fh.read().splitlines() if line.strip()}
        self.known.update(line for line in self.template if line.strip())
        self.registry = parse_registry(REGISTRY_PATH)

        self.version = None
        for line in self.template:
            match = VERSION_LINE.match(line)
            if match:
                self.version = int(match.group(1).strip())
        if self.version is None:
            raise SystemExit("bundled config-template.yaml has no version line")

        # slot key -> (start index, end index exclusive, current inline comment)
        self.slots = {}
        index = 0
        while index < len(self.template):
            match = SLOT_LINE.match(self.template[index])
            if not match:
                index += 1
                continue
            end = index + 1
            while end < len(self.template) and SLOT_CONTINUATION.match(self.template[end]):
                end += 1
            comment = split_comment(self.template[index][2:])[2]
            self.slots[match.group(1)] = (index, end, comment)
            index = end

        # key -> every inline comment any shipped template gave that key
        self.known_inline = {}
        for line in self.known:
            match = SLOT_LINE.match(line)
            if match:
                comment = split_comment(line[2:])[2]
                if comment:
                    self.known_inline.setdefault(match.group(1), set()).add(normalize_comment(comment))

    def is_known(self, line):
        return line in self.known or line == MARKER or bool(VERSION_LINE.match(line))

    def candidates(self, key):
        return difflib.get_close_matches(key, sorted(self.slots), n=3, cutoff=0.75)

    def classify(self, key):
        if key in self.slots:
            return "current"
        if key in self.registry:
            return "retired"
        return "unrecognized"


def _unquote(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1]
    return value


def parse_registry(path):
    entries = {}
    current = None
    in_values = False
    with open(path, encoding="utf-8") as fh:
        for raw in fh.read().splitlines():
            line = raw.rstrip()
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            top = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):\s*$", line)
            if top:
                current = {"values": {}}
                entries[top.group(1)] = current
                in_values = False
                continue
            field = re.match(r"^  ([a-z_]+):\s*(.*)$", line)
            if field and current is not None:
                name, value = field.group(1), field.group(2)
                in_values = name == "values" and not value.strip()
                if name == "values" and value.strip().startswith("{"):
                    for pair in value.strip()[1:-1].split(","):
                        if ":" in pair:
                            old, new = pair.split(":", 1)
                            current["values"][_unquote(old)] = _unquote(new)
                elif name != "values":
                    current[name] = _unquote(value)
                continue
            nested = re.match(r"^    ([^:]+):\s*(.*)$", line)
            if nested and in_values and current is not None:
                current["values"][_unquote(nested.group(1))] = _unquote(nested.group(2))
    return entries


# --- analysis --------------------------------------------------------------------


def unknown_comment(bundle, item):
    return item.kind == "comment" and not bundle.is_known(item.lines[0])


def attach_comments(bundle, parsed):
    """Attach each run of team comments that sits directly above a setting to it."""
    attached_ids = set()
    run = []
    for item in parsed.items:
        if unknown_comment(bundle, item):
            run.append(item)
            continue
        if item.kind == "block":
            item.attached = list(run)
            attached_ids.update(id(c) for c in run)
        run = []
    return attached_ids


def value_lines(bundle, key, lines):
    """A block's value: its lines with a known template inline comment dropped from the key line."""
    out = list(lines)
    code, _gap, comment = split_comment(out[0])
    if comment and normalize_comment(comment) in bundle.known_inline.get(key, set()):
        out[0] = code
    return out


def winning_layer(bundle, repo, layer, target):
    """Name the layer whose active `target` would win over a migration into `layer`."""
    order = ["local", "tracked"] if layer == "tracked" else ["local"]
    for name in order:
        path = os.path.join(repo, ".compound-engineering", LAYER_FILES[name])
        if os.path.isfile(path) and block_is_set(read_parsed(path).block(target)):
            return LAYER_FILES[name]
    return None


def key_report(bundle, repo, layer, parsed):
    report = {"current": [], "retired": [], "unrecognized": []}
    for block in parsed.blocks():
        kind = bundle.classify(block.key)
        if kind == "current":
            report["current"].append(block.key)
        elif kind == "retired":
            entry = bundle.registry[block.key]
            row = {"key": block.key, "kind": entry.get("kind"), "reason": entry.get("reason", "")}
            if entry.get("kind") == "migrate":
                row["target"] = entry.get("target")
                row["values"] = entry.get("values", {})
                row["target_winning"] = winning_layer(bundle, repo, layer, entry.get("target"))
            report["retired"].append(row)
        else:
            report["unrecognized"].append({"key": block.key, "candidates": bundle.candidates(block.key)})
    return report


def layer_state(bundle, parsed, layer):
    raw_version, lineno = parsed.version()
    if raw_version is not None:
        if not re.fullmatch(r"\d+", raw_version):
            return "malformed-version", f"{parsed.name}:{lineno}: template version `{raw_version}` is not a whole number"
        if int(raw_version) > bundle.version:
            return "newer", f"written by a newer plugin (template version {raw_version}; this plugin has {bundle.version})"
    if parsed.errors:
        return "unrefreshable", "; ".join(parsed.errors)
    version = int(raw_version) if raw_version is not None else 0
    retired = [b.key for b in parsed.blocks() if bundle.classify(b.key) == "retired"]
    if layer == "tracked" and version < bundle.version:
        return "outdated", f"template version {version if raw_version is not None else 'missing'}; this plugin has {bundle.version}"
    if layer == "local" and parsed.is_legacy_local():
        return "legacy", "a full copy of the old local config template"
    if retired:
        return "retired-keys", "retired settings: " + ", ".join(retired)
    return "current", "up to date"


# --- changes ---------------------------------------------------------------------


def load_changes(path):
    if not path:
        return []
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    changes = data.get("changes") if isinstance(data, dict) else data
    if not isinstance(changes, list):
        raise Refused("changes file must hold {\"changes\": [...]}")
    return changes


def check_change_shapes(bundle, repo, layer, original, changes):
    """Reject any change the registry, the typo candidates, or the file does not allow."""
    required = {
        "remove": ("key",),
        "migrate": ("key", "value"),
        "rename": ("from", "to"),
        "comment-remove": ("line",),
        "comment-move": ("line", "key"),
    }
    comments = [item.lines[0] for item in original.items if unknown_comment(bundle, item)]
    for change in changes:
        kind = change.get("type") if isinstance(change, dict) else None
        if kind not in required:
            raise Refused(f"unknown change type in {json.dumps(change)}")
        for field in required[kind] + ("reason",):
            if not isinstance(change.get(field), str) or (field != "value" and not change[field].strip()):
                raise Refused(f"{kind} change is missing `{field}`: {json.dumps(change)}")
        if kind == "remove":
            key = change["key"]
            entry = bundle.registry.get(key)
            if entry is None:
                raise Refused(f"`{key}` is not a retired setting, so it cannot be removed")
            if entry.get("kind") == "migrate" and not winning_layer(bundle, repo, layer, entry.get("target")):
                raise Refused(f"`{key}` must be migrated to `{entry.get('target')}`, which is not already set")
            if original.block(key) is None:
                raise Refused(f"`{key}` is not set in {original.name}")
        elif kind == "migrate":
            key = change["key"]
            entry = bundle.registry.get(key)
            if entry is None or entry.get("kind") != "migrate":
                raise Refused(f"`{key}` has no migration in the registry")
            target = entry.get("target")
            if winning_layer(bundle, repo, layer, target):
                raise Refused(f"`{target}` is already set, so `{key}` must be removed, not migrated")
            source = original.block(key)
            if source is None:
                raise Refused(f"`{key}` is not set in {original.name}")
            old = _unquote(split_comment(KEY_LINE.match(source.lines[0]).group(2))[0])
            expected = entry.get("values", {}).get(old, old) if entry.get("values") else old
            if len(source.lines) > 1 or change["value"] != expected:
                raise Refused(f"`{key}: {old}` migrates to `{target}: {expected}`, not `{change['value']}`")
        elif kind == "rename":
            source, target = change["from"], change["to"]
            if original.block(source) is None or bundle.classify(source) != "unrecognized":
                raise Refused(f"`{source}` is not an unrecognized setting in {original.name}")
            if target not in bundle.candidates(source):
                raise Refused(f"`{target}` is not a typo candidate for `{source}`")
            if original.block(target) is not None:
                raise Refused(f"`{target}` is already set in {original.name}")
        else:
            if change["line"] not in comments:
                raise Refused(f"no team comment `{change['line']}` in {original.name}")
            if kind == "comment-move" and change["key"] not in [b.key for b in original.blocks()] + [
                c["to"] for c in changes if c.get("type") == "rename"
            ] + [bundle.registry.get(c.get("key"), {}).get("target") for c in changes if c.get("type") == "migrate"]:
                raise Refused(f"comment-move names `{change['key']}`, which is not set in the rebuilt file")


def auto_changes(bundle, original, changes):
    """Registry removals the draft makes on its own, unless the agent already recorded them."""
    recorded = {c.get("key") for c in changes if c.get("type") == "remove"}
    out = []
    for block in original.blocks():
        entry = bundle.registry.get(block.key)
        if entry and entry.get("kind") == "remove" and block.key not in recorded:
            out.append({"type": "remove", "key": block.key, "reason": entry.get("reason", "")})
    return out


# --- rendering -------------------------------------------------------------------


class CommentPool:
    """Comment lines the changes take out of their original place (dropped or moved)."""

    def __init__(self, changes):
        self.pool = [c["line"] for c in changes if c["type"] in ("comment-remove", "comment-move")]
        self.moved_to = {}
        for change in changes:
            if change["type"] == "comment-move":
                self.moved_to.setdefault(change["key"], []).append(change["line"])

    def keep(self, line):
        if line in self.pool:
            self.pool.remove(line)
            return False
        return True


def rename_line(line, old, new):
    return new + line[len(old):] if new != old else line


def replace_inline(bundle, key, lines):
    """Swap a known template inline comment on the key line for the current one."""
    if key not in bundle.slots:
        return lines
    code, gap, comment = split_comment(lines[0])
    if not comment or normalize_comment(comment) not in bundle.known_inline.get(key, set()):
        return lines
    current = bundle.slots[key][2]
    return [code + (gap + current if current else "")] + lines[1:]


def render(bundle, layer, original, changes):
    attached = attach_comments(bundle, original)
    removed = {c["key"] for c in changes if c["type"] == "remove"}
    migrated = {c["key"]: c for c in changes if c["type"] == "migrate"}
    renamed = {c["from"]: c["to"] for c in changes if c["type"] == "rename"}
    comments = CommentPool(changes)

    def new_block(item):
        """(key, lines) a kept or migrated setting becomes; None when it is removed."""
        if item.key in migrated:
            target = bundle.registry[item.key]["target"]
            return target, [f"{target}: {migrated[item.key]['value']}"]
        if item.key in removed:
            return None
        key = renamed.get(item.key, item.key)
        return key, [rename_line(item.lines[0], item.key, key)] + item.lines[1:]

    if layer == "local" and not original.is_legacy_local():
        # Keep the layout: every line stays where it was, minus what the changes take out.
        out = []
        for item in original.items:
            if item.kind == "block":
                result = new_block(item)
                if result:
                    out.extend(comments.moved_to.get(result[0], []))
                    out.extend(result[1])
            elif not unknown_comment(bundle, item) or comments.keep(item.lines[0]):
                out.append(item.lines[0])
        return out

    # Rebuild: settings with their team comments, and loose team comments, in original order.
    groups = []  # [key or None, lines]
    last_loose = None
    for item in original.items:
        if item.kind == "block":
            head = [c.lines[0] for c in item.attached if comments.keep(c.lines[0])]
            result = new_block(item)
            if result is None:
                if head:
                    groups.append([None, head])
            else:
                key, lines = result
                groups.append([key, head + comments.moved_to.get(key, []) + replace_inline(bundle, key, lines)])
            last_loose = None
        elif unknown_comment(bundle, item) and id(item) not in attached:
            if comments.keep(item.lines[0]):
                if last_loose == item.lineno - 1 and groups and groups[-1][0] is None:
                    groups[-1][1].append(item.lines[0])
                else:
                    groups.append([None, [item.lines[0]]])
                last_loose = item.lineno
        else:
            last_loose = None

    if layer == "local":
        out = list(LOCAL_HEADER)
        for _key, lines in groups:
            out.extend([""] + lines)
        return out

    placed = {}
    leftover = []
    for key, lines in groups:
        if key in bundle.slots and key not in placed:
            placed[key] = lines
        else:
            leftover.append(lines)
    starts = {start: (key, end) for key, (start, end, _comment) in bundle.slots.items()}
    out = []
    index = 0
    while index < len(bundle.template):
        slot = starts.get(index)
        if slot and slot[0] in placed:
            out.extend(placed[slot[0]])
            index = slot[1]
            continue
        out.append(bundle.template[index])
        index += 1
    if leftover:
        out.extend(["", MARKER])
        for lines in leftover:
            out.extend([""] + lines)
    return out


def to_text(original, lines):
    text = original.eol.join(lines) + original.eol
    return ("﻿" if original.bom else "") + text


# --- verification ----------------------------------------------------------------


def team_comment_counts(bundle, parsed):
    counts = {}
    for item in parsed.items:
        if unknown_comment(bundle, item):
            counts[item.lines[0]] = counts.get(item.lines[0], 0) + 1
    return counts


def verify(bundle, repo, layer, original, draft, changes):
    """Return None when every difference is recorded and allowed, else the first problem."""
    if draft.errors:
        return "draft is not refreshable: " + "; ".join(draft.errors)
    try:
        check_change_shapes(bundle, repo, layer, original, changes)
    except Refused as exc:
        return str(exc)
    if layer == "tracked" and draft.version()[0] != str(bundle.version):
        return f"draft template version is {draft.version()[0]}, expected {bundle.version}"

    removed = {c["key"] for c in changes if c["type"] == "remove"}
    migrated = {c["key"]: c for c in changes if c["type"] == "migrate"}
    renamed = {c["from"]: c["to"] for c in changes if c["type"] == "rename"}
    introduced = {bundle.registry[k]["target"]: [f"{bundle.registry[k]['target']}: {c['value']}"]
                  for k, c in migrated.items()}

    for block in original.blocks():
        key = block.key
        if key in removed or key in migrated:
            if draft.block(key) is not None:
                return f"`{key}` is recorded as removed but is still in the draft"
            continue
        if bundle.classify(key) == "retired" and bundle.registry[key].get("kind") == "remove":
            return f"retired setting `{key}` is still in the draft without a recorded removal"
        new_key = renamed.get(key, key)
        if new_key != key and draft.block(key) is not None:
            return f"`{key}` is recorded as renamed to `{new_key}` but is still in the draft"
        kept = draft.block(new_key)
        if kept is None:
            return f"`{key}` is missing from the draft"
        want = [rename_line(block.lines[0], key, new_key)] + block.lines[1:]
        if value_lines(bundle, new_key, kept.lines) != value_lines(bundle, new_key, want):
            return f"the value of `{key}` changed"
        introduced[new_key] = None

    for block in draft.blocks():
        if block.key not in introduced:
            return f"the draft adds `{block.key}`, which no recorded change explains"
        expected = introduced[block.key]
        if expected is not None and block.lines != expected:
            return f"the draft writes `{block.key}` differently from the recorded migration"

    before = team_comment_counts(bundle, original)
    after = team_comment_counts(bundle, draft)
    dropped = {}
    for change in changes:
        if change["type"] == "comment-remove":
            dropped[change["line"]] = dropped.get(change["line"], 0) + 1
    for line, count in before.items():
        kept = count - dropped.get(line, 0)
        if after.get(line, 0) < kept:
            return f"team comment `{line}` is missing from the draft"
        if after.get(line, 0) > kept:
            return f"comment `{line}` is recorded as removed but is still in the draft"
    allowed = set(LOCAL_HEADER) if layer == "local" else set()
    for line in after:
        if line not in before and line not in allowed:
            return f"the draft adds comment `{line}`, which was not in {original.name}"
    return None


# --- commands --------------------------------------------------------------------


def repo_root(arg):
    if arg:
        return os.path.abspath(arg)
    try:
        out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, timeout=10)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    path = os.getcwd()
    while True:
        if os.path.exists(os.path.join(path, ".git")):
            return path
        parent = os.path.dirname(path)
        if parent == path:
            return None
        path = parent


def layer_path(repo, layer):
    return os.path.join(repo, ".compound-engineering", LAYER_FILES[layer])


def emit(payload, code=0):
    print(json.dumps(payload, indent=2))
    return code


def describe_layer(bundle, repo, layer):
    path = layer_path(repo, layer)
    if not os.path.isfile(path):
        return {"file": LAYER_FILES[layer], "state": "missing"}
    try:
        parsed = read_parsed(path)
    except UnicodeDecodeError as exc:
        return {"file": LAYER_FILES[layer], "state": "unrefreshable", "reason": f"not UTF-8 text ({exc.reason})"}
    state, reason = layer_state(bundle, parsed, layer)
    return {"file": LAYER_FILES[layer], "state": state, "reason": reason,
            "keys": key_report(bundle, repo, layer, parsed)}


def cmd_status(bundle, repo, _args):
    return emit({
        "ok": True,
        "bundled_version": bundle.version,
        "tracked": describe_layer(bundle, repo, "tracked"),
        "local": describe_layer(bundle, repo, "local"),
    })


def prepare(bundle, repo, layer):
    path = layer_path(repo, layer)
    if not os.path.isfile(path):
        raise Refused(f"{LAYER_FILES[layer]} does not exist")
    try:
        original = read_parsed(path)
    except UnicodeDecodeError as exc:
        raise Refused(f"{LAYER_FILES[layer]} is not UTF-8 text ({exc.reason})")
    state, reason = layer_state(bundle, original, layer)
    if state in ("newer", "malformed-version", "unrefreshable"):
        raise Refused(f"{LAYER_FILES[layer]} is {state}: {reason}")
    return path, original, state


def cmd_draft(bundle, repo, args):
    layer = args.layer
    try:
        path, original, state = prepare(bundle, repo, layer)
        changes = load_changes(args.changes)
        changes = changes + auto_changes(bundle, original, changes)
        check_change_shapes(bundle, repo, layer, original, changes)
    except (Refused, OSError, ValueError) as exc:
        return emit({"ok": False, "layer": layer, "refused": str(exc)}, 1)

    report = key_report(bundle, repo, layer, original)
    if state == "current" and not changes:
        return emit({"ok": True, "layer": layer, "state": state, "action": "none", "keys": report})

    lines = render(bundle, layer, original, changes)
    # Team comments the rebuild could not tie to a setting it kept; they land in the kept section.
    gone = {c.get("key") for c in changes if c["type"] == "remove"}
    tied = {id(c) for b in original.blocks() if b.key not in gone for c in b.attached}
    unplaced = [
        {"line": item.lines[0], "lineno": item.lineno}
        for item in original.items
        if unknown_comment(bundle, item) and id(item) not in tied
    ]
    workdir = tempfile.mkdtemp(prefix=DRAFT_PREFIX)
    draft_path = os.path.join(workdir, LAYER_FILES[layer])
    changes_path = os.path.join(workdir, "changes.json")
    text = to_text(original, lines)
    with open(draft_path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)
    with open(changes_path, "w", encoding="utf-8") as fh:
        json.dump({"changes": changes}, fh, indent=2)
        fh.write("\n")

    draft = read_parsed(draft_path)
    problem = verify(bundle, repo, layer, original, draft, changes)
    with open(path, encoding="utf-8", newline="") as fh:
        before = fh.read()
    diff = "".join(difflib.unified_diff(
        before.splitlines(True), text.splitlines(True), LAYER_FILES[layer], LAYER_FILES[layer] + " (draft)"))
    action = "rebuild" if layer == "tracked" else ("cut-down" if original.is_legacy_local() else "edit")
    if before == text:
        action = "none"
    return emit({
        "ok": problem is None,
        "layer": layer,
        "state": state,
        "action": action,
        "draft": draft_path,
        "changes": changes_path,
        "changes_recorded": changes,
        "keys": report,
        "unplaced_comments": unplaced,
        "verify": problem or "ok",
        "diff": diff,
    }, 0 if problem is None else 1)


def run_verify(bundle, repo, args):
    path, original, _state = prepare(bundle, repo, args.layer)
    changes = load_changes(args.changes)
    draft = read_parsed(os.path.abspath(args.draft))
    return path, verify(bundle, repo, args.layer, original, draft, changes)


def cmd_verify(bundle, repo, args):
    try:
        _path, problem = run_verify(bundle, repo, args)
    except (Refused, OSError, ValueError) as exc:
        return emit({"ok": False, "layer": args.layer, "verify": str(exc)}, 1)
    return emit({"ok": problem is None, "layer": args.layer, "verify": problem or "ok"}, 0 if problem is None else 1)


def cmd_apply(bundle, repo, args):
    try:
        path, problem = run_verify(bundle, repo, args)
    except (Refused, OSError, ValueError) as exc:
        return emit({"ok": False, "layer": args.layer, "applied": False, "verify": str(exc)}, 1)
    if problem is not None:
        return emit({"ok": False, "layer": args.layer, "applied": False, "verify": problem}, 1)
    with open(os.path.abspath(args.draft), "rb") as fh:
        data = fh.read()
    fd, tmp = tempfile.mkstemp(prefix=".refresh-", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        shutil.copymode(path, tmp)
        os.replace(tmp, path)
    except OSError as exc:
        if os.path.exists(tmp):
            os.unlink(tmp)
        return emit({"ok": False, "layer": args.layer, "applied": False, "verify": str(exc)}, 1)
    workdir = os.path.dirname(os.path.abspath(args.draft))
    if os.path.basename(workdir).startswith(DRAFT_PREFIX):
        shutil.rmtree(workdir, ignore_errors=True)
    return emit({"ok": True, "layer": args.layer, "applied": True, "file": path,
                 "sha256": hashlib.sha256(data).hexdigest()})


def main(argv=None):
    parser = argparse.ArgumentParser(description="Refresh Compound Engineering config files.")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("status", "draft", "verify", "apply"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--repo")
        if name != "status":
            cmd.add_argument("--layer", choices=sorted(LAYER_FILES), required=True)
            cmd.add_argument("--changes", required=name != "draft")
        if name in ("verify", "apply"):
            cmd.add_argument("--draft", required=True)
    args = parser.parse_args(argv)
    repo = repo_root(args.repo)
    if repo is None:
        return emit({"ok": False, "error": "not inside a git repository"}, 1)
    bundle = Bundle()
    return {"status": cmd_status, "draft": cmd_draft, "verify": cmd_verify, "apply": cmd_apply}[args.command](
        bundle, repo, args)


if __name__ == "__main__":
    sys.exit(main())
