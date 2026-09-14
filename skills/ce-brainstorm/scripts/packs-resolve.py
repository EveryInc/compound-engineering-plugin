#!/usr/bin/env python3
"""Resolve the Compound Packs declared in this repo's CE config into pack roots.

Reads the `packs:` list from `<repo-root>/.compound-engineering/config.yaml`
and `config.local.yaml` (both layers concatenate; local adds, never replaces),
validates each entry, resolves path and git sources, enumerates the packs each
source publishes, applies selection, and prints one JSON object to stdout:

    {"roots": [{"id": "...", "dir": "/abs/path", "nested_rule_shaped": 0}],
     "warnings": [...], "errors": [...], "entries": <number of parsed packs entries>}

`nested_rule_shaped` counts the rule-shaped `.md` files one level below the
pack's top level. Discovery never reads them (subdirectories are storage), so
the count is informational and is reported by the health check, not warned.

Exit 0 whenever resolution ran (per-entry failures are data in `errors` /
`warnings`); non-zero only when the resolver itself cannot run. Consumers treat
`errors` as loud per-entry configuration problems and `warnings` as degraded
availability (e.g. an unreachable git source skipped per the warn-and-continue
contract).

`--declared-only` answers the config-only question without touching git or the
cache: it parses both config layers, shape-checks each entry, and prints

    {"declared": <bool|null>, "entries": <n>, "errors": [...]}

where `declared` is true when any entry parsed or the `packs:` block is
malformed (a broken declaration is still a declaration the consumer should
surface), false when neither config layer names packs, and null when no
repository -- and so no config -- could be located.

Entry shape (documented subset -- anything else under `packs:` is a loud error):

    packs:
      - source: packs/local-rules              # repo-relative path
      - source: ~/packs/kk-style               # ~ or absolute path
      - source: https://github.com/o/r         # git URL: ref required
        ref: v1.2.0                            # tag, sha, or branch
        path: packs                            # optional subfolder (git only)
        pack: [rails, inertia]                 # one id, a list, or omit = all
        id: rails-core                         # rename (single-pack entries)
      - source: https://github.com/o/r/tree/main/packs   # tree-URL sugar

Git sources cache under `<scratch-root>/ce-packs/<sha256(url\\nref)>` with an
atomic temp-clone-then-rename, so a keyed path's existence proves a complete
clone. All git subprocesses run non-interactively (GIT_TERMINAL_PROMPT=0, ssh
BatchMode, bounded timeout): missing credentials degrade to a warning, never a
hang. A missing `git` binary degrades git sources only (each warns and is
skipped); path sources still resolve, with the repository located by walking up
from the working directory to the nearest `.git` entry. Environment overrides:
CE_PACKS_CACHE_ROOT (cache base for tests), CE_PACKS_GIT_TIMEOUT (seconds,
default 60).

A published pack is a directory a consumer lists and reads itself, so nothing
in it may link outside its source: a pack whose tree holds such a link is not
published (a loud per-entry error), never trimmed a file at a time.
"""

from __future__ import annotations

import argparse
import functools
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile

IS_WINDOWS = os.name == "nt"
_uid_getter = getattr(os, "geteuid", None) or getattr(os, "getuid", None)
_EFFECTIVE_UID = _uid_getter() if _uid_getter is not None else None
GIT_TIMEOUT = float(os.environ.get("CE_PACKS_GIT_TIMEOUT") or 60)

CONFIG_FILES = ("config.yaml", "config.local.yaml")
KNOWN_KEYS = {"source", "ref", "path", "pack", "id"}
SCALAR_KEYS = ("source", "ref", "path", "id")  # every known key but the list-valued `pack`
_TREE_URL_RE = re.compile(
    r"^(?P<base>https?://github\.com/[^/\s]+/[^/\s]+?)(?:\.git)?/tree/(?P<ref>[^/\s]+)(?:/(?P<path>[^\s]*))?/?$"
)


def _is_git_url(source: str) -> bool:
    return bool(
        re.match(r"^(https?|ssh|git|file)://", source) or re.match(r"^[\w.-]+@[\w.-]+:", source)
    )


def _within(path: str, parent: str) -> bool:
    """True when `path` is `parent` or lies below it (both already realpath'd)."""
    return path == parent or path.startswith(parent + os.sep)


# --- scratch root (peer-job-runner shape: probe /tmp, fall back to TMPDIR) ---

def _owned_dir(path: str) -> bool:
    """Directory, not a symlink, owned by the effective uid (POSIX)."""
    try:
        st = os.lstat(path)
    except OSError:
        return False
    if not stat.S_ISDIR(st.st_mode):
        return False
    if _EFFECTIVE_UID is not None and st.st_uid != _EFFECTIVE_UID:
        return False
    return True


def _private_root_usable(path: str) -> bool:
    """Create or repair `path` as a private (0700) root owned by this user."""
    try:
        os.mkdir(path, 0o700)
    except FileExistsError:
        pass
    except OSError:
        return False
    if not IS_WINDOWS:
        if not _owned_dir(path):
            return False
        try:
            os.chmod(path, 0o700)
        except OSError:
            return False
    return os.path.isdir(path) and os.access(path, os.W_OK)


def _trusted_checkout(path: str) -> bool:
    """A real directory (never a symlink) that this user owns; ownership is POSIX-only."""
    if os.path.islink(path) or not os.path.isdir(path):
        return False
    return IS_WINDOWS or _owned_dir(path)


@functools.lru_cache(maxsize=None)
def cache_base() -> str | None:
    configured = os.environ.get("CE_PACKS_CACHE_ROOT")
    if configured:
        root = os.path.abspath(configured)
        os.makedirs(root, exist_ok=True)
        return root
    if IS_WINDOWS:
        base = os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()
        root = os.path.join(base, "compound-engineering-packs")
        return root if _private_root_usable(root) else None
    if _EFFECTIVE_UID is None:
        return None
    for base in ("/tmp", os.environ.get("TMPDIR") or "/tmp"):
        root = os.path.join(base, f"compound-engineering-{_EFFECTIVE_UID}")
        if _private_root_usable(root):
            packs = os.path.join(root, "ce-packs")
            if _private_root_usable(packs):
                return packs
    return None


# --- minimal YAML reader for the documented packs: subset --------------------

def _strip_comment(line: str) -> str:
    """Drop a trailing comment (a # preceded by whitespace, outside quotes).

    A quote toggles quoted state only when it opens a value (start of line or
    after `: `/`- `/`[`/`,`) or closes one it opened -- a mid-word apostrophe
    (``it's``) is ordinary content and must not absorb a later comment.
    """
    out, quote = [], ""
    for i, ch in enumerate(line):
        prev = line[i - 1] if i else " "
        if quote:
            if ch == quote:
                quote = ""
        elif ch in "'\"" and prev in " \t[,:":
            quote = ch
        elif ch == "#" and prev in " \t":
            break
        out.append(ch)
    return "".join(out).rstrip()


def _scalar(raw: str):
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "'\"":
        return raw[1:-1]
    if raw.lower() in ("true", "false"):
        return raw.lower() == "true"
    return raw


def _parse_value(raw: str):
    raw = raw.strip()
    if raw.startswith("[") and raw.endswith("]"):
        inner = raw[1:-1].strip()
        return [] if not inner else [_scalar(part) for part in inner.split(",")]
    return _scalar(raw)


def parse_packs_block(path: str, errors: list) -> list:
    """Return the entry dicts under this file's top-level `packs:` key."""
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8-sig", errors="replace") as fh:
        lines = fh.read().splitlines()
    entries, in_packs, current, pending_list_key = [], False, None, None
    for lineno, raw in enumerate(lines, 1):
        line = _strip_comment(raw)
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        if indent == 0 and not (in_packs and line.lstrip().startswith("-")):
            # A new top-level key ends the packs block; a zero-indent list item
            # (`- source: ...`) is still part of it -- YAML allows both styles.
            key, sep, rest = line.partition(":")
            in_packs = bool(sep) and key.strip() == "packs" and rest.strip() in ("", "[]")
            if sep and key.strip() == "packs" and not in_packs:
                # `packs: <inline value>` is malformed, not absent: say so rather
                # than letting a flow list or a bare path declare nothing.
                errors.append(
                    f"{os.path.basename(path)}:{lineno}: `packs:` must be a block list of"
                    f" `- source: ...` entries (got `{line.strip()}`)"
                )
            current, pending_list_key = None, None
            continue
        if not in_packs:
            continue
        stripped = line.strip()
        loc = f"{os.path.basename(path)}:{lineno}"
        if stripped.startswith("- ") or stripped == "-":
            body = stripped[1:].strip()
            if pending_list_key and current is not None and ":" not in body:
                current[pending_list_key].append(_scalar(body))
                continue
            current, pending_list_key = {"_origin": os.path.basename(path), "_line": lineno}, None
            entries.append(current)
            if body:
                if ":" not in body:
                    errors.append(f"{loc}: unrecognized packs entry `{stripped}` -- expected `key: value`")
                    continue
                key, _, val = body.partition(":")
                _set_key(current, key.strip(), val, loc, errors)
            continue
        if current is None:
            errors.append(f"{loc}: unrecognized line under packs: `{stripped}` -- expected a `- source: ...` entry")
            continue
        if ":" not in stripped:
            errors.append(f"{loc}: unrecognized line under packs: `{stripped}` -- expected `key: value`")
            continue
        key, _, val = stripped.partition(":")
        key = key.strip()
        if val.strip() == "" and key == "pack":
            current[key] = []
            pending_list_key = key
            continue
        pending_list_key = None
        _set_key(current, key, val, loc, errors)
    return entries


def _set_key(entry: dict, key: str, raw_val: str, loc: str, errors: list) -> None:
    if key not in KNOWN_KEYS:
        errors.append(f"{loc}: unknown packs entry key `{key}:` -- accepted keys: {', '.join(sorted(KNOWN_KEYS))}")
        return
    entry[key] = _parse_value(raw_val)


# --- git ---------------------------------------------------------------------

@functools.lru_cache(maxsize=None)
def _git_env() -> dict:
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_ASKPASS"] = env.get("GIT_ASKPASS") or "true"
    ssh = env.get("GIT_SSH_COMMAND") or "ssh"
    if "BatchMode" not in ssh:
        env["GIT_SSH_COMMAND"] = ssh + " -o BatchMode=yes"
    return env


def _run_git(args: list, cwd: str | None = None):
    return subprocess.run(
        ["git", *args], cwd=cwd, env=_git_env(), timeout=GIT_TIMEOUT,
        capture_output=True, text=True,
    )


def resolve_git_source(url: str, ref: str, warnings: list, label: str) -> str | None:
    """Return the cached checkout dir for url@ref, cloning on miss. None = warn+skip."""
    if shutil.which("git") is None:
        warnings.append(f"{label}: git binary not found; source skipped")
        return None
    base = cache_base()
    if base is None:
        warnings.append(f"{label}: no writable cache root for git sources; source skipped")
        return None
    key = hashlib.sha256(f"{url}\n{ref}".encode()).hexdigest()
    dest = os.path.join(base, key)
    if os.path.lexists(dest):
        if _trusted_checkout(dest):
            return dest
        warnings.append(f"{label}: cached checkout {dest} is a symlink or not owned by this user; refetching")
        # rmtree refuses to follow a symlink (and ignores a plain file); unlink
        # those explicitly so a planted link is removed, never its target.
        shutil.rmtree(dest, ignore_errors=True)
        if os.path.islink(dest) or os.path.isfile(dest):
            try:
                os.unlink(dest)
            except OSError:
                pass
        if os.path.lexists(dest):
            warnings.append(f"{label}: cannot replace untrusted cached checkout {dest}; source skipped")
            return None
    tmp = tempfile.mkdtemp(prefix=f"{key}.part-", dir=base)
    try:
        try:
            proc = _run_git(["clone", "--quiet", "--depth", "1", "--no-recurse-submodules",
                             "--branch", ref, "--end-of-options", url, tmp])
        except subprocess.TimeoutExpired:
            warnings.append(f"{label}: git clone timed out after {int(GIT_TIMEOUT)}s; source skipped")
            return None
        if proc.returncode != 0:
            # tag/branch clone failed -- retry treating ref as a commit sha
            try:
                fetched = (
                    _run_git(["init", "--quiet", tmp]).returncode == 0
                    and _run_git(["fetch", "--quiet", "--depth", "1", "--end-of-options", url, ref], cwd=tmp).returncode == 0
                    and _run_git(["checkout", "--quiet", "FETCH_HEAD"], cwd=tmp).returncode == 0
                )
                if not fetched:
                    warnings.append(f"{label}: cannot fetch `{ref}` from {url}; source skipped")
                    return None
            except subprocess.TimeoutExpired:
                warnings.append(f"{label}: git fetch timed out after {int(GIT_TIMEOUT)}s; source skipped")
                return None
        if not os.path.lexists(dest):
            try:
                os.replace(tmp, dest)
            except OSError:
                # Expected when another resolver published the same key
                # concurrently; anything else leaves no checkout to return.
                if not os.path.lexists(dest):
                    warnings.append(f"{label}: could not publish the clone to {dest}; source skipped")
                    return None
        if _trusted_checkout(dest):
            return dest
        warnings.append(
            f"{label}: cached checkout {dest} appeared during the clone and is a symlink or not owned by this user; source skipped"
        )
        return None
    finally:
        if os.path.isdir(tmp):
            shutil.rmtree(tmp, ignore_errors=True)


# --- pack enumeration --------------------------------------------------------

_FRONTMATTER_KEYS = ("title:", "applies_when:")
_FRONTMATTER_CAP = 64 * 1024  # frontmatter must close within this many characters
# A pack's README is its description, never a rule, whatever frontmatter it
# carries: it is not published, not reported as skipped, and not counted.
_README = "readme.md"


@functools.lru_cache(maxsize=None)
def _is_knowledge_file(path: str) -> bool:
    """True when the file opens with a `---` frontmatter block, closed by a `---`
    line within the cap, that carries `title:` and `applies_when:`. A UTF-8 BOM
    is not part of the content."""
    try:
        with open(path, encoding="utf-8-sig", errors="replace") as fh:
            lines = fh.read(_FRONTMATTER_CAP).splitlines()
    except OSError:
        return False
    if not lines or lines[0].strip() != "---":
        return False
    for end, line in enumerate(lines[1:], 1):
        if line.strip() == "---":
            fm = "\n".join(lines[1:end])
            break
    else:
        return False
    return all(re.search(rf"^\s*{re.escape(k)}", fm, re.MULTILINE) for k in _FRONTMATTER_KEYS)


def _contained_md_files(directory: str, boundary: str, escaped: list) -> list:
    """Paths of the `.md` entries directly under `directory`, minus its README,
    whose real path stays within `boundary` (a realpath). An entry that links
    outside it is appended to `escaped` and never opened, so a pack cannot read
    files off the user's machine."""
    try:
        names = sorted(os.listdir(directory))
    except OSError:
        return []
    files = []
    for name in names:
        if not name.endswith(".md") or name.lower() == _README:
            continue
        child = os.path.join(directory, name)
        if _within(os.path.realpath(child), boundary):
            files.append(child)
        else:
            escaped.append(child)
    return files


def _contained_child_dirs(directory: str, boundary: str, escaped: list) -> list:
    """`(name, path)` of the non-hidden directories directly under `directory`
    whose real path stays within `boundary`; one that links outside it is
    appended to `escaped` and never entered."""
    try:
        names = sorted(os.listdir(directory))
    except OSError:
        return []
    dirs = []
    for name in names:
        child = os.path.join(directory, name)
        if name.startswith(".") or not os.path.isdir(child):
            continue
        if _within(os.path.realpath(child), boundary):
            dirs.append((name, child))
        else:
            escaped.append(child)
    return dirs


def _has_knowledge_files(directory: str, boundary: str, escaped: list) -> bool:
    return any(_is_knowledge_file(f) for f in _contained_md_files(directory, boundary, escaped))


def _escaping_links(root: str, boundary: str) -> list:
    """Symlinks anywhere under `root` (walked without following links) whose real
    path leaves `boundary`, sorted. Only a link can leave: every other entry sits
    under `root`, which is already inside the boundary."""
    leaks = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        for name in dirnames + filenames:
            child = os.path.join(dirpath, name)
            if os.path.islink(child) and not _within(os.path.realpath(child), boundary):
                leaks.append(child)
    return sorted(leaks)


def enumerate_packs(source_root: str, boundary: str, escaped: list, self_name: str | None = None) -> dict:
    """Map published pack id -> dir. Immediate children only; self = single pack.

    `boundary` is the realpath every child directory and rule file must stay
    within (the git checkout, the repository, or the source root itself); a
    child that links outside it is recorded in `escaped` and skipped. Symlinks
    that stay inside the boundary are ordinary content.
    """
    if _has_knowledge_files(source_root, boundary, escaped):
        name = self_name or os.path.basename(os.path.abspath(source_root))
        return {name: source_root}
    return {
        name: child
        for name, child in _contained_child_dirs(source_root, boundary, escaped)
        if _has_knowledge_files(child, boundary, escaped)
    }


def nested_rule_shaped(pack_dir: str, boundary: str) -> tuple:
    """`(total, subdirs)`: how many rule-shaped files sit in the immediate
    subdirectories of `pack_dir`, and which subdirectories hold them. Scans one
    level down only, inside `boundary`, so the pack's data is never walked.
    Subdirectories are storage, so these files are counted, never published."""
    hits, total = [], 0
    for name, child in _contained_child_dirs(pack_dir, boundary, []):
        count = sum(1 for f in _contained_md_files(child, boundary, []) if _is_knowledge_file(f))
        if count:
            hits.append(name)
            total += count
    return total, hits


def nested_rules_warning(pack_id: str, pack_dir: str, boundary: str) -> str | None:
    """The warning for a pack directory with no rule at its top level whose
    subdirectories hold rule-shaped files: it registers, yet nothing can ever be
    discovered. None when the subdirectories hold none. The caller establishes
    that the top level is empty of rules; a pack with top-level rules keeps its
    nested files as storage and gets `nested_rule_shaped` instead."""
    total, hits = nested_rule_shaped(pack_dir, boundary)
    if not hits:
        return None
    where = ", ".join(f"`{name}/`" for name in hits)
    return (
        f"pack `{pack_id}` has {total} rule-shaped file(s) under {where} that discovery"
        " never reads -- move rules to the pack's top level (see https://everyinc.github.io/compound-engineering-plugin/guides/packs/, Pack layout)"
    )


# --- entry resolution --------------------------------------------------------

def _entry_label(entry: dict) -> str:
    return f"{entry.get('_origin', 'config')}:{entry.get('_line', '?')}"


def _entry_shape_ok(entry: dict, label: str, errors: list) -> bool:
    """I/O-free checks on one parsed entry: `source:` present, and the scalar
    keys actually scalar. False after appending the error."""
    for key in SCALAR_KEYS:
        val = entry.get(key)
        if val is not None and not isinstance(val, str):
            errors.append(f"{label}: `{key}:` must be a single string (got {val!r})")
            return False
    if not entry.get("source"):
        errors.append(f"{label}: entry has no `source:`")
        return False
    return True


def resolve_entry(entry: dict, repo_root: str, roots: list, warnings: list, errors: list) -> None:
    label = _entry_label(entry)
    if not _entry_shape_ok(entry, label, errors):
        return
    source, ref, sub_path = entry["source"], entry.get("ref"), entry.get("path")

    tree = _TREE_URL_RE.match(source)
    if tree:
        t_ref, t_path = tree.group("ref"), tree.group("path") or ""
        if isinstance(ref, str) and ref != t_ref:
            errors.append(f"{label}: tree URL pins ref `{t_ref}` but entry says `ref: {ref}` -- remove one")
            return
        if isinstance(sub_path, str) and sub_path.strip("/") != t_path.strip("/"):
            errors.append(f"{label}: tree URL path `{t_path}` conflicts with `path: {sub_path}` -- remove one")
            return
        source, ref, sub_path = tree.group("base"), t_ref, t_path or None

    if _is_git_url(source):
        if not isinstance(ref, str) or not ref:
            errors.append(f"{label}: git source `{source}` requires `ref:` (tag, sha, or branch)")
            return
        if ref.startswith("-") or source.startswith("-"):
            errors.append(f"{label}: git source/ref may not begin with `-`")
            return
        checkout = resolve_git_source(source, ref, warnings, label)
        if checkout is None:
            if tree:
                warnings.append(
                    f"{label}: if the branch name contains `/`, tree-URL parsing splits it wrong -- use explicit `ref:` and `path:` fields"
                )
            return
        git_meta = {"url": source, "ref": ref}
        source_root = os.path.join(checkout, sub_path) if sub_path else checkout
        real_root, real_checkout = os.path.realpath(source_root), os.path.realpath(checkout)
        if not _within(real_root, real_checkout):
            errors.append(f"{label}: path `{sub_path}` escapes the source checkout")
            return
        source_root, boundary = real_root, real_checkout
        if not os.path.isdir(source_root):
            errors.append(f"{label}: path `{sub_path}` does not exist in {source}@{ref}")
            return
    else:
        git_meta = None
        if ref is not None:
            errors.append(f"{label}: `ref:` is only valid on git sources; path sources are read live")
            return
        if sub_path is not None:
            errors.append(f"{label}: `path:` is only valid on git sources; point `source:` at the directory instead")
            return
        expanded = os.path.expanduser(source)
        if os.path.isabs(expanded):
            source_root = os.path.realpath(expanded)
            boundary = source_root
        else:
            source_root = os.path.realpath(os.path.join(repo_root, expanded))
            repo_real = os.path.realpath(repo_root)
            if not _within(source_root, repo_real) or _within(source_root, os.path.join(repo_real, ".git")):
                errors.append(f"{label}: repo-relative source `{source}` resolves outside the repository")
                return
            boundary = repo_real
        if not os.path.isdir(source_root):
            errors.append(f"{label}: source directory `{source}` does not exist")
            return

    if git_meta:
        # Display name for a single-pack git source: the path: subfolder's
        # basename, else the URL's last path segment (never the cache key).
        tail = (sub_path or source).rstrip("/").rsplit("/", 1)[-1]
        self_name = re.sub(r"\.git$", "", tail.split(":")[-1]) or None
    else:
        self_name = None
    escaped = []
    published = enumerate_packs(source_root, boundary, escaped, self_name)
    for link in escaped:
        warnings.append(
            f"{label}: skipped `{os.path.relpath(link, source_root)}` in `{source}` -- it links outside the source"
        )
    if not published:
        warnings.append(f"{label}: source `{source}` publishes no packs (no directories with valid knowledge files)")
        # Each child directory is a would-be pack with no top-level rule (one
        # with a rule would have published); say when its rules sit one level
        # too deep, so the author learns why nothing published.
        for name, child in _contained_child_dirs(source_root, boundary, []):
            nested = nested_rules_warning(name, child, boundary)
            if nested:
                warnings.append(f"{label}: {nested}")
        return

    selection = entry.get("pack")
    if selection is None:
        selected = dict(published)
    else:
        wanted = selection if isinstance(selection, list) else [selection]
        if not wanted:
            warnings.append(f"{label}: `pack:` lists no ids; nothing installed from `{source}`")
            return
        missing = [w for w in wanted if w not in published]
        if missing:
            errors.append(
                f"{label}: pack id(s) {', '.join(map(str, missing))} not published by `{source}`"
                f" -- available: {', '.join(sorted(published)) or 'none'}"
            )
            return
        selected = {w: published[w] for w in wanted}

    override = entry.get("id")
    if override is not None:
        if len(selected) != 1:
            errors.append(f"{label}: `id:` override requires the entry to install exactly one pack")
            return
        selected = {str(override): next(iter(selected.values()))}

    for pack_id, pack_dir in selected.items():
        # Consumers list the pack directory themselves, so a link that leaves
        # the source anywhere inside it would let pack content read files off
        # the user's machine: refuse the whole pack. (Top-level escapes were
        # already named as skipped during enumeration.)
        leaks = _escaping_links(pack_dir, boundary)
        if leaks:
            names = ", ".join(f"`{os.path.relpath(p, pack_dir)}`" for p in leaks)
            errors.append(f"{label}: pack `{pack_id}` not published -- {names} link(s) outside the source")
            continue
        for child in _contained_md_files(pack_dir, boundary, []):
            name = os.path.basename(child)
            if os.path.isfile(child) and not _is_knowledge_file(child):
                warnings.append(
                    f"{label}: skipped pack file `{pack_id}/{name}` (missing `title`/`applies_when` frontmatter)"
                )
        # A published pack has a rule at its top level, so rule-shaped files in
        # its subdirectories are storage: counted for the health report, not warned.
        nested_total, _ = nested_rule_shaped(pack_dir, boundary)
        root = {"id": pack_id, "dir": pack_dir, "nested_rule_shaped": nested_total, "_label": label}
        if git_meta:
            root.update(git_meta)
        roots.append(root)


def _emit(declared_only: bool, entries: list, roots: list, warnings: list, errors: list,
          declared: bool | None = None) -> int:
    if declared_only:
        print(json.dumps({"declared": declared, "entries": len(entries), "errors": errors}))
    else:
        print(json.dumps({
            "roots": [{k: v for k, v in r.items() if not k.startswith("_")} for r in roots],
            "warnings": warnings,
            "errors": errors,
            "entries": len(entries),
        }))
    return 0


def _repo_root() -> str | None:
    """The enclosing checkout's top level: git's answer when git is on PATH,
    otherwise the nearest ancestor of the working directory holding a `.git`
    entry (a directory, or the file a worktree or submodule leaves). None when
    the working directory is not inside a checkout."""
    if shutil.which("git") is not None:
        proc = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        return proc.stdout.strip() if proc.returncode == 0 else None
    current = os.getcwd()
    while True:
        if os.path.lexists(os.path.join(current, ".git")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def _main(argv: list) -> int:
    parser = argparse.ArgumentParser(description="Resolve the Compound Packs declared in CE config.")
    parser.add_argument(
        "--declared-only", action="store_true",
        help="parse and shape-check the packs: entries only; no git or cache work",
    )
    args = parser.parse_args(argv)
    warnings, errors, roots, entries = [], [], [], []

    repo_root = _repo_root()
    if repo_root is None:
        warnings.append("not inside a git repository; no CE config to read")
        return _emit(args.declared_only, entries, roots, warnings, errors)
    cfg_dir = os.path.join(repo_root, ".compound-engineering")
    for name in CONFIG_FILES:
        entries.extend(parse_packs_block(os.path.join(cfg_dir, name), errors))

    if args.declared_only:
        for entry in entries:
            _entry_shape_ok(entry, _entry_label(entry), errors)
        return _emit(True, entries, roots, warnings, errors, declared=bool(entries or errors))

    for entry in entries:
        try:
            resolve_entry(entry, repo_root, roots, warnings, errors)
        except Exception as exc:  # one entry's surprise is that entry's error, not everyone's
            errors.append(f"{_entry_label(entry)}: unexpected error resolving entry: {exc}")

    # First declaration wins: config.yaml entries precede config.local.yaml in
    # CONFIG_FILES, so a personal pack can never displace the team's.
    by_id = {}
    final = []
    for root in roots:
        prev = by_id.get(root["id"])
        if prev is not None:
            errors.append(
                f"duplicate pack id `{root['id']}`: {root['_label']} ignored, {prev['_label']} kept"
                " -- rename one with `id:`"
            )
            continue
        by_id[root["id"]] = root
        final.append(root)
    return _emit(False, entries, final, warnings, errors)


def main() -> int:
    try:
        return _main(sys.argv[1:])
    except Exception as exc:  # never a traceback: consumers need valid JSON
        print(json.dumps({
            "roots": [], "warnings": [], "errors": [f"packs resolver failed unexpectedly: {exc}"], "entries": 0,
        }))
        return 0


if __name__ == "__main__":
    sys.exit(main())
