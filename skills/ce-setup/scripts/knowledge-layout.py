#!/usr/bin/env python3
"""Knowledge-layout helper for ce-setup.

Expands a layout template into the `knowledge:` block of
`.compound-engineering/config.yaml`, validates a block fail-closed, answers
"where does a <role|type> go", and dry-runs the moves a folder would need to
match its layout. Pure Python 3 stdlib.

Every operational failure prints a STATUS WORD on line 1 and exits 0; only CLI
misuse exits non-zero via argparse.

STATUS WORDS:
  OK          success; payload follows (JSON on line 2, or the YAML block for
              `expand`)
  NO-CONFIG   validate/resolve/audit: the config file does not exist
  UNSET       validate/resolve/audit: config has no `knowledge:` block
  UNSET-ROLE  resolve: the layout leaves that role (or type) unset
  AMBIGUOUS   resolve --type: several non-inbox roles claim the type
  INVALID     the template or block fails validation (JSON errors on line 2)
  ERROR       unexpected internal error (never a traceback)

YAML subset accepted (templates and the expanded block): block mappings,
scalars (bare, "double-quoted", 'single-quoted', ints, true/false/null),
inline flow lists `[a, "b c"]`, block sequences of scalars (`- item`), and
`#` comments.
"""
import argparse
import json
import os
import re
import sys
import tempfile
from datetime import date

ROLES = (
    "inbox", "sources", "ideas", "themes", "projects", "notes", "learnings",
    "writing", "memory", "scratch", "archive", "templates",
)
REQUIRED_ROLES = ("inbox", "learnings", "memory")
ID_SCHEMES = ("sequential", "date", "johnny-decimal", "none")
GIT_MODES = ("none", "commit", "commit+push")
INDEXES = ("none",)
TEMPLATE_KEYS = ("name", "description", "id_scheme", "docs_root", "roles",
                 "frontmatter", "promotion", "retention", "git", "index")
BLOCK_ORDER = ("layout", "root", "id_scheme", "roles", "frontmatter",
               "promotion", "retention", "git", "index", "recurring")
ROLE_ORDER = ("path", "filename", "types", "retention", "tracked")
DEFAULT_FILENAME = "{date}-{slug}.md"
SKIP_DIRS = {".git", "node_modules", ".compound-engineering"}
PLACEHOLDER = re.compile(r"\{[a-z_]+(?::[^}]*)?\}")


# --------------------------------------------------------------------------- #
# YAML subset parser
# --------------------------------------------------------------------------- #

def _scalar(tok):
    tok = tok.strip()
    if tok == "" or tok == "~" or tok == "null":
        return None
    if tok == "true":
        return True
    if tok == "false":
        return False
    if tok[0] == '"':
        return json.loads(tok)
    if tok[0] == "'" and tok.endswith("'") and len(tok) >= 2:
        return tok[1:-1].replace("''", "'")
    if re.fullmatch(r"-?\d+", tok):
        return int(tok)
    if re.fullmatch(r"-?\d+\.\d+", tok):
        return float(tok)
    return tok


def _strip_comment(line):
    out, quote = [], None
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#" and (i == 0 or line[i - 1] in " \t"):
            break
        out.append(ch)
    return "".join(out).rstrip()


def _flow_list(text):
    body = text.strip()[1:-1].strip()
    if not body:
        return []
    items, cur, quote = [], [], None
    for ch in body:
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            cur.append(ch)
        elif ch == ",":
            items.append(_scalar("".join(cur)))
            cur = []
        else:
            cur.append(ch)
    items.append(_scalar("".join(cur)))
    return items


def _value(rest):
    rest = rest.strip()
    if rest.startswith("[") and rest.endswith("]"):
        return _flow_list(rest)
    if rest.startswith("{") and rest.endswith("}"):
        return json.loads(rest)
    return _scalar(rest)


def _split_key(content):
    if content[0] in "\"'":
        q = content[0]
        end = content.index(q, 1)
        key = content[1:end]
        rest = content[end + 1:]
    else:
        idx = content.find(":")
        if idx == -1:
            raise ValueError("expected ':' in mapping line: %r" % content)
        key, rest = content[:idx], content[idx:]
    if not rest.startswith(":") or (len(rest) > 1 and rest[1] not in " \t"):
        raise ValueError("expected ': ' in mapping line: %r" % content)
    return key.strip(), rest[1:]


def _rows(text):
    rows = []
    for raw in text.split("\n"):
        line = _strip_comment(raw.replace("\t", "  "))
        if not line.strip():
            continue
        rows.append((len(line) - len(line.lstrip(" ")), line.strip()))
    return rows


def _parse_block(rows, pos, indent):
    if rows[pos[0]][1].startswith("- "):
        return _parse_seq(rows, pos, indent)
    result = {}
    while pos[0] < len(rows):
        cur_indent, content = rows[pos[0]]
        if cur_indent < indent:
            break
        if cur_indent > indent:
            raise ValueError("unexpected indent: %r" % content)
        pos[0] += 1
        key, rest = _split_key(content)
        if rest.strip() in (">", ">-", "|", "|-", ">+", "|+"):
            # Block scalar: every deeper-indented row is one line of text.
            parts = []
            while pos[0] < len(rows) and rows[pos[0]][0] > indent:
                parts.append(rows[pos[0]][1])
                pos[0] += 1
            result[key] = (" " if rest.strip().startswith(">") else "\n").join(parts)
        elif rest.strip() == "":
            if pos[0] < len(rows) and rows[pos[0]][0] > indent:
                result[key] = _parse_block(rows, pos, rows[pos[0]][0])
            elif pos[0] < len(rows) and rows[pos[0]][0] == indent and rows[pos[0]][1].startswith("- "):
                result[key] = _parse_seq(rows, pos, indent)
            else:
                result[key] = None
        else:
            result[key] = _value(rest)
    return result


def _parse_seq(rows, pos, indent):
    items = []
    while pos[0] < len(rows):
        cur_indent, content = rows[pos[0]]
        if cur_indent != indent or not content.startswith("- "):
            break
        pos[0] += 1
        items.append(_value(content[2:]))
    return items


def parse_yaml(text):
    rows = _rows(text)
    if not rows:
        return {}
    return _parse_block(rows, [0], rows[0][0])


# --------------------------------------------------------------------------- #
# YAML subset emitter (block mappings + inline lists + JSON scalars)
# --------------------------------------------------------------------------- #

_BARE = re.compile(r"^[A-Za-z0-9_.][A-Za-z0-9_./+-]*$")


def _emit_scalar(v):
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v)
    if _BARE.match(s) and s not in ("true", "false", "null") and not re.fullmatch(r"-?\d+(\.\d+)?", s):
        return s
    return json.dumps(s, ensure_ascii=False)


def _ordered(d, preferred):
    return [k for k in preferred if k in d] + sorted(k for k in d if k not in preferred)


def emit_mapping(d, indent, preferred=()):
    pad = "  " * indent
    lines = []
    for key in _ordered(d, preferred):
        val = d[key]
        if isinstance(val, dict):
            lines.append("%s%s:" % (pad, key))
            child = {"knowledge": BLOCK_ORDER, "roles": ROLES}.get(key, ROLE_ORDER if key in ROLES else ())
            lines.extend(emit_mapping(val, indent + 1, child) if val else [pad + "  {}"])
        elif isinstance(val, list):
            lines.append("%s%s: [%s]" % (pad, key, ", ".join(_emit_scalar(x) for x in val)))
        else:
            lines.append("%s%s: %s" % (pad, key, _emit_scalar(val)))
    return lines


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #

def _is_list_of_str(v):
    return isinstance(v, list) and all(isinstance(x, str) and x for x in v)


def _safe_rel_path(p):
    if not isinstance(p, str) or not p or p.startswith("/") or p.startswith("~"):
        return False
    if re.match(r"^[A-Za-z]:[\\/]", p):
        return False
    parts = [x for x in p.replace("\\", "/").split("/") if x]
    return ".." not in parts and ".git" not in parts


def validate_layout(block, *, is_template):
    """Return a list of error strings; empty means valid."""
    errors = []
    if not isinstance(block, dict):
        return ["layout must be a mapping"]
    if is_template:
        if not isinstance(block.get("name"), str) or not block["name"]:
            errors.append("name: required string")
        for k in block:
            if k not in TEMPLATE_KEYS:
                errors.append("%s: unknown key" % k)
    else:
        if not isinstance(block.get("layout"), str) or not block["layout"]:
            errors.append("layout: required string naming the template")
        root = block.get("root", ".")
        if root != "." and not _safe_rel_path(root):
            errors.append("root: %r must be a repo-relative directory" % (root,))
        for k in block:
            if k not in BLOCK_ORDER:
                errors.append("%s: unknown key" % k)
    scheme = block.get("id_scheme", "none")
    if scheme not in ID_SCHEMES:
        errors.append("id_scheme: %r not one of %s" % (scheme, "|".join(ID_SCHEMES)))
    docs_root = block.get("docs_root")
    if docs_root is not None and not _safe_rel_path(docs_root):
        errors.append("docs_root: %r must be a repo-relative directory" % (docs_root,))
    roles = block.get("roles")
    if not isinstance(roles, dict) or not roles:
        errors.append("roles: required mapping")
        roles = {}
    for name, spec in roles.items():
        if name not in ROLES:
            errors.append("roles.%s: not a known role (%s)" % (name, ", ".join(ROLES)))
            continue
        if not isinstance(spec, dict):
            errors.append("roles.%s: must be a mapping with `path`" % name)
            continue
        if not _safe_rel_path(spec.get("path")):
            errors.append("roles.%s.path: %r must be a relative path inside the folder" % (name, spec.get("path")))
        fn = spec.get("filename", DEFAULT_FILENAME)
        if not isinstance(fn, str) or not fn or "/" in fn:
            errors.append("roles.%s.filename: %r must be a bare filename pattern" % (name, fn))
        if "types" in spec and not _is_list_of_str(spec["types"]):
            errors.append("roles.%s.types: must be a list of type names" % name)
        if spec.get("retention", "keep") not in ("keep", "discard"):
            errors.append("roles.%s.retention: %r not keep|discard" % (name, spec.get("retention")))
        if not isinstance(spec.get("tracked", True), bool):
            errors.append("roles.%s.tracked: must be true|false" % name)
        for k in spec:
            if k not in ROLE_ORDER:
                errors.append("roles.%s.%s: unknown key" % (name, k))
    for req in REQUIRED_ROLES:
        if req not in roles:
            errors.append("roles.%s: required (every layout sets inbox, learnings, memory)" % req)
    fm = block.get("frontmatter")
    if not isinstance(fm, dict):
        errors.append("frontmatter: required mapping")
        fm = {}
    for key in ("required", "type_enum"):
        if not _is_list_of_str(fm.get(key)) or not fm.get(key):
            errors.append("frontmatter.%s: required non-empty list" % key)
    for key in ("provenance", "source_keys", "source_access_enum"):
        if key in fm and not _is_list_of_str(fm[key]):
            errors.append("frontmatter.%s: must be a list" % key)
    if _is_list_of_str(fm.get("type_enum")):
        enum = set(fm["type_enum"])
        for name, spec in roles.items():
            if isinstance(spec, dict) and _is_list_of_str(spec.get("types")):
                for t in spec["types"]:
                    if t not in enum:
                        errors.append("roles.%s.types: %r not in frontmatter.type_enum" % (name, t))
    promotion = block.get("promotion", {})
    if not isinstance(promotion, dict):
        errors.append("promotion: must be a mapping of role -> [roles or pack-rule]")
    else:
        for src, targets in promotion.items():
            if src not in roles:
                errors.append("promotion.%s: source role is unset in this layout" % src)
            if not _is_list_of_str(targets):
                errors.append("promotion.%s: must be a list" % src)
                continue
            for t in targets:
                if t != "pack-rule" and t not in roles:
                    errors.append("promotion.%s: target %r is unset in this layout" % (src, t))
    retention = block.get("retention", {})
    if not isinstance(retention, dict):
        errors.append("retention: must be a mapping")
    elif "inbox_flag_after_days" in retention and not (
        isinstance(retention["inbox_flag_after_days"], int) and retention["inbox_flag_after_days"] > 0
    ):
        errors.append("retention.inbox_flag_after_days: must be a positive integer")
    git = block.get("git", {"mode": "none", "allow": []})
    if not isinstance(git, dict):
        errors.append("git: must be a mapping with mode and allow")
    else:
        if git.get("mode", "none") not in GIT_MODES:
            errors.append("git.mode: %r not one of %s" % (git.get("mode"), "|".join(GIT_MODES)))
        allow = git.get("allow", [])
        if not isinstance(allow, list) or not all(_safe_rel_path(p) for p in allow):
            errors.append("git.allow: must be a list of relative paths inside the folder")
    if block.get("index", "none") not in INDEXES:
        errors.append("index: %r not one of %s (external indexes are not part of this release)" % (block.get("index"), "|".join(INDEXES)))
    recurring = block.get("recurring", {})
    if recurring is not None and not isinstance(recurring, dict):
        errors.append("recurring: must be a mapping")
    return errors


# --------------------------------------------------------------------------- #
# Config file access
# --------------------------------------------------------------------------- #

def _block_span(text):
    """(start, end) line indexes of the top-level `knowledge:` block, or None."""
    lines = text.split("\n")
    start = None
    for i, line in enumerate(lines):
        if re.match(r"^knowledge:\s*(#.*)?$", line):
            start = i
            break
    if start is None:
        return None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j] and not lines[j][0].isspace() and not lines[j].startswith("#"):
            end = j
            break
    return start, end


def read_knowledge(config_path):
    """('no-config'|'unset'|'corrupt'|'ok', block)."""
    try:
        with open(config_path, encoding="utf-8") as f:
            text = f.read()
    except FileNotFoundError:
        return "no-config", None
    except (OSError, UnicodeDecodeError):
        return "corrupt", None
    span = _block_span(text)
    if span is None:
        return "unset", None
    chunk = "\n".join(text.split("\n")[span[0]:span[1]])
    try:
        parsed = parse_yaml(chunk)
    except Exception:
        return "corrupt", None
    block = parsed.get("knowledge") if isinstance(parsed, dict) else None
    if block is None:
        return "corrupt", None
    return "ok", block


def write_knowledge(config_path, block_text):
    try:
        with open(config_path, encoding="utf-8") as f:
            text = f.read()
    except FileNotFoundError:
        text = ""
    span = _block_span(text)
    lines = text.split("\n")
    new_lines = block_text.rstrip("\n").split("\n")
    if span is None:
        if text and not text.endswith("\n"):
            lines.append("")
        if lines and lines[-1] == "":
            lines = lines[:-1]
        if lines:
            lines.append("")
        lines.extend(new_lines)
        lines.append("")
    else:
        lines[span[0]:span[1]] = new_lines
    out = "\n".join(lines)
    if not out.endswith("\n"):
        out += "\n"
    d = os.path.dirname(os.path.abspath(config_path))
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tmp-knowledge-", suffix=".yaml")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(out)
        os.replace(tmp, config_path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# --------------------------------------------------------------------------- #
# Role helpers
# --------------------------------------------------------------------------- #

def role_info(block, name):
    spec = block["roles"][name]
    return {
        "role": name,
        "path": os.path.normpath(os.path.join(block.get("root", "."), spec["path"])).replace(os.sep, "/") + "/",
        "filename": spec.get("filename", DEFAULT_FILENAME),
        "types": spec.get("types", []),
        "retention": spec.get("retention", "keep"),
        "tracked": spec.get("tracked", True),
    }


def roles_for_type(block, type_name):
    hits = [n for n, s in block["roles"].items() if type_name in (s.get("types") or [])]
    non_inbox = [n for n in hits if n != "inbox"]
    return non_inbox or hits


def _path_regex(path_pattern):
    parts = re.split(r"(\{[a-z_]+(?::[^}]*)?\})", path_pattern.strip("/"))
    out = "^"
    for part in parts:
        if PLACEHOLDER.fullmatch(part):
            out += r"[^/]+"
        else:
            out += re.escape(part)
    return re.compile(out + "(/|$)")


def _frontmatter(path):
    try:
        with open(path, encoding="utf-8") as f:
            head = f.read(4096)
    except (OSError, UnicodeDecodeError):
        return {}
    if not head.startswith("---"):
        return {}
    end = head.find("\n---", 3)
    if end == -1:
        return {}
    fm = {}
    for line in head[3:end].split("\n"):
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$", line)
        if m:
            fm[m.group(1)] = _scalar(m.group(2)) if m.group(2) else None
    return fm


# --------------------------------------------------------------------------- #
# Subcommands
# --------------------------------------------------------------------------- #

def emit(word, payload=None):
    print(word)
    if payload is not None:
        print(json.dumps(payload, ensure_ascii=False))
    return 0


def _load_template(ref, layouts_dir):
    path = ref if ref.endswith((".yaml", ".yml")) or os.sep in ref or "/" in ref else os.path.join(layouts_dir, ref + ".yaml")
    try:
        with open(path, encoding="utf-8") as f:
            data = parse_yaml(f.read())
    except FileNotFoundError:
        return None, ["layout: %r is not a built-in template or a readable template file" % ref]
    except Exception as exc:
        return None, ["layout: %r does not parse: %s" % (ref, exc)]
    errors = validate_layout(data, is_template=True)
    return (data if not errors else None), errors


def expand_block(template, layout_ref, root, recurring):
    block = {"layout": layout_ref, "root": root}
    for k in ("id_scheme", "roles", "frontmatter", "promotion", "retention", "git", "index"):
        if k in template:
            block[k] = template[k]
    block.setdefault("id_scheme", "none")
    block.setdefault("promotion", {})
    block.setdefault("retention", {})
    block.setdefault("git", {"mode": "none", "allow": []})
    block.setdefault("index", "none")
    if recurring:
        block["recurring"] = recurring
    return block


def cmd_expand(args):
    layouts_dir = args.layouts_dir or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "references", "layouts")
    template, errors = _load_template(args.layout, layouts_dir)
    if errors:
        return emit("INVALID", {"errors": errors})
    recurring = {}
    for item in (args.recurring or "").split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            recurring[k.strip()] = v.strip()
    block = expand_block(template, args.layout, args.root, recurring)
    errors = validate_layout(block, is_template=False)
    if errors:
        return emit("INVALID", {"errors": errors})
    text = "\n".join(emit_mapping({"knowledge": block}, 0)) + "\n"
    header = "# --- Knowledge layout (expanded from template %r by ce-setup) ---\n" % args.layout
    if args.write:
        write_knowledge(args.write, header + text)
    if template.get("docs_root"):
        print("OK")
        print("# docs_root hint: this template expects `docs_root: %s`" % template["docs_root"])
    else:
        print("OK")
    sys.stdout.write(text)
    return 0


def _load_block(args):
    st, block = read_knowledge(args.config)
    if st == "no-config":
        return None, "NO-CONFIG", None
    if st == "unset":
        return None, "UNSET", None
    if st == "corrupt":
        return None, "INVALID", {"errors": ["knowledge: block does not parse as YAML"]}
    errors = validate_layout(block, is_template=False)
    if errors:
        return None, "INVALID", {"errors": errors}
    return block, None, None


def cmd_validate(args):
    block, word, payload = _load_block(args)
    if word:
        return emit(word, payload)
    return emit("OK", {
        "layout": block["layout"],
        "root": block.get("root", "."),
        "roles": sorted(block["roles"]),
        "git": block.get("git", {"mode": "none", "allow": []}),
        "index": block.get("index", "none"),
    })


def cmd_resolve(args):
    block, word, payload = _load_block(args)
    if word:
        return emit(word, payload)
    if args.role:
        if args.role not in ROLES:
            return emit("INVALID", {"errors": ["role: %r is not a known role" % args.role]})
        if args.role not in block["roles"]:
            return emit("UNSET-ROLE", {"role": args.role})
        return emit("OK", role_info(block, args.role))
    hits = roles_for_type(block, args.type)
    if not hits:
        return emit("UNSET-ROLE", {"type": args.type})
    if len(hits) > 1:
        return emit("AMBIGUOUS", {"type": args.type, "roles": hits})
    return emit("OK", role_info(block, hits[0]))


def cmd_audit(args):
    block, word, payload = _load_block(args)
    if word:
        return emit(word, payload)
    folder = os.path.abspath(args.folder or os.path.dirname(os.path.dirname(os.path.abspath(args.config))))
    root = os.path.normpath(os.path.join(folder, block.get("root", ".")))
    infos = {n: role_info(block, n) for n in block["roles"]}
    regexes = {n: _path_regex(block["roles"][n]["path"]) for n in block["roles"]}
    skip_roles = {n for n, i in infos.items() if not i["tracked"] or i["retention"] == "discard"}
    today = date.fromisoformat(args.today) if args.today else date.today()
    flag_days = block.get("retention", {}).get("inbox_flag_after_days")

    missing_dirs = []
    for n, info in infos.items():
        if n in skip_roles or PLACEHOLDER.search(block["roles"][n]["path"]):
            continue
        if not os.path.isdir(os.path.join(root, info["path"])):
            missing_dirs.append(info["path"])

    unfiled, stale_inbox = [], []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root).replace(os.sep, "/")
        rel_dir = "" if rel_dir == "." else rel_dir
        dirnames[:] = sorted(
            d for d in dirnames
            if d not in SKIP_DIRS and not d.startswith(".")
            and not any(regexes[n].match((rel_dir + "/" + d).strip("/")) for n in skip_roles)
        )
        for fn in sorted(filenames):
            if not fn.endswith(".md"):
                continue
            rel = (rel_dir + "/" + fn).strip("/")
            fm = _frontmatter(os.path.join(dirpath, fn))
            t = fm.get("type")
            in_inbox = "inbox" in regexes and regexes["inbox"].match(rel)
            if in_inbox and flag_days and isinstance(fm.get("date"), str):
                try:
                    if (today - date.fromisoformat(fm["date"][:10])).days > flag_days:
                        stale_inbox.append(rel)
                except ValueError:
                    pass
            if not isinstance(t, str) or in_inbox:
                continue
            hits = roles_for_type(block, t)
            if not hits or len(hits) > 1:
                continue
            if not regexes[hits[0]].match(rel):
                unfiled.append({"file": rel, "type": t, "expected_role": hits[0], "expected_path": infos[hits[0]]["path"]})
    return emit("OK", {"root": root, "missing_dirs": sorted(missing_dirs), "unfiled": unfiled, "stale_inbox": sorted(stale_inbox)})


def build_parser():
    p = argparse.ArgumentParser(description="ce-setup knowledge layout helper")
    sub = p.add_subparsers(dest="cmd", required=True)

    ex = sub.add_parser("expand")
    ex.add_argument("--layout", required=True, help="built-in template name or path to a template .yaml")
    ex.add_argument("--root", default=".")
    ex.add_argument("--recurring", default="", help="e.g. capture=daily,dream=weekly (documentation only)")
    ex.add_argument("--layouts-dir")
    ex.add_argument("--write", help="config.yaml to merge the block into (replaces an existing knowledge: block)")

    for name in ("validate", "resolve", "audit"):
        sp = sub.add_parser(name)
        sp.add_argument("--config", required=True)
        if name == "resolve":
            g = sp.add_mutually_exclusive_group(required=True)
            g.add_argument("--role")
            g.add_argument("--type")
        if name == "audit":
            sp.add_argument("--folder", help="folder the layout applies to (default: parent of the config dir)")
            sp.add_argument("--today", help="ISO date pinning 'today' for stale-inbox detection")
    return p


_HANDLERS = {"expand": cmd_expand, "validate": cmd_validate, "resolve": cmd_resolve, "audit": cmd_audit}


def main(argv):
    args = build_parser().parse_args(argv[1:])
    try:
        return _HANDLERS[args.cmd](args)
    except Exception as exc:  # never leak a traceback
        sys.stderr.write("knowledge-layout: internal error: %s\n" % exc)
        return emit("ERROR")


if __name__ == "__main__":
    sys.exit(main(sys.argv))
