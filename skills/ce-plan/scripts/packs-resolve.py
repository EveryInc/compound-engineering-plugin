#!/usr/bin/env python3
"""Resolve the CE Packs declared in this repo's CE config into pack roots.

Reads the `packs:` list from `<repo-root>/.compound-engineering/config.yaml`
and `config.local.yaml` (both layers concatenate; local adds, never replaces),
validates each entry, resolves path and git sources, enumerates the packs each
source publishes, applies selection, and prints one JSON object to stdout:

    {"roots": [{"id": "...", "dir": "/abs/path"}], "warnings": [...], "errors": [...]}

Exit 0 whenever resolution ran (per-entry failures are data in `errors` /
`warnings`); non-zero only when the resolver itself cannot run. Consumers treat
`errors` as loud per-entry configuration problems and `warnings` as degraded
availability (e.g. an unreachable git source skipped per the warn-and-continue
contract).

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
hang. Environment overrides: CE_PACKS_CACHE_ROOT (cache base for tests),
CE_PACKS_GIT_TIMEOUT (seconds, default 60).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

IS_WINDOWS = os.name == "nt"
_uid_getter = getattr(os, "geteuid", None) or getattr(os, "getuid", None)
_EFFECTIVE_UID = _uid_getter() if _uid_getter is not None else None
GIT_TIMEOUT = float(os.environ.get("CE_PACKS_GIT_TIMEOUT") or 60)

CONFIG_FILES = ("config.yaml", "config.local.yaml")
KNOWN_KEYS = {"source", "ref", "path", "pack", "id"}
_TREE_URL_RE = re.compile(
    r"^(?P<base>https?://github\.com/[^/\s]+/[^/\s]+?)(?:\.git)?/tree/(?P<ref>[^/\s]+)(?:/(?P<path>[^\s]*))?/?$"
)


def _is_git_url(source: str) -> bool:
    return bool(
        re.match(r"^(https?|ssh|git|file)://", source) or re.match(r"^[\w.-]+@[\w.-]+:", source)
    )


# --- scratch root (peer-job-runner shape: probe /tmp, fall back to TMPDIR) ---

def _owned_dir(path: str) -> bool:
    """Directory, not a symlink, owned by the effective uid (POSIX)."""
    try:
        st = os.lstat(path)
    except OSError:
        return False
    if not __import__("stat").S_ISDIR(st.st_mode):
        return False
    if _EFFECTIVE_UID is not None and st.st_uid != _EFFECTIVE_UID:
        return False
    return True


def _private_root_usable(path: str) -> bool:
    try:
        os.mkdir(path, 0o700)
    except FileExistsError:
        pass
    except OSError:
        return False
    if not IS_WINDOWS and not _owned_dir(path):
        return False
    return os.path.isdir(path) and os.access(path, os.W_OK)


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
    with open(path, encoding="utf-8", errors="replace") as fh:
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
            in_packs = line.rstrip() in ("packs:", "packs: []")
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
        if val.strip() == "" and key in ("pack",):
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
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
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
    if os.path.isdir(dest):
        if IS_WINDOWS or _owned_dir(dest):
            return dest
        warnings.append(f"{label}: cached checkout {dest} is a symlink or not owned by this user; refetching")
        shutil.rmtree(dest, ignore_errors=True)
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
                if _run_git(["init", "--quiet", tmp]).returncode == 0 \
                        and _run_git(["fetch", "--quiet", "--depth", "1", "--end-of-options", url, ref], cwd=tmp).returncode == 0 \
                        and _run_git(["checkout", "--quiet", "FETCH_HEAD"], cwd=tmp).returncode == 0:
                    pass  # resolved by treating ref as a commit sha
                else:
                    warnings.append(f"{label}: cannot fetch `{ref}` from {url}; source skipped")
                    return None
            except subprocess.TimeoutExpired:
                warnings.append(f"{label}: git fetch timed out after {int(GIT_TIMEOUT)}s; source skipped")
                return None
        if not os.path.isdir(dest):
            try:
                os.replace(tmp, dest)
            except OSError:
                pass  # another resolver published the same key concurrently
        return dest
    finally:
        if os.path.isdir(tmp) and tmp != dest:
            shutil.rmtree(tmp, ignore_errors=True)


# --- pack enumeration --------------------------------------------------------

_FRONTMATTER_KEYS = ("title:", "applies_when:")


def _is_knowledge_file(path: str) -> bool:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            head = fh.read(4096)
    except OSError:
        return False
    if not head.startswith("---"):
        return False
    body = head.split("---", 2)
    if len(body) < 3:
        return False
    fm = body[1]
    return all(re.search(rf"^\s*{re.escape(k)}", fm, re.MULTILINE) for k in _FRONTMATTER_KEYS)


def _has_knowledge_files(directory: str) -> bool:
    try:
        names = sorted(os.listdir(directory))
    except OSError:
        return False
    return any(n.endswith(".md") and _is_knowledge_file(os.path.join(directory, n)) for n in names)


def enumerate_packs(source_root: str, self_name: str | None = None) -> dict:
    """Map published pack id -> dir. Immediate children only; self = single pack."""
    if _has_knowledge_files(source_root):
        name = self_name or os.path.basename(os.path.abspath(source_root))
        return {name: source_root}
    packs = {}
    try:
        children = sorted(os.listdir(source_root))
    except OSError:
        return packs
    for name in children:
        child = os.path.join(source_root, name)
        if os.path.isdir(child) and not name.startswith(".") and _has_knowledge_files(child):
            packs[name] = child
    return packs


# --- entry resolution --------------------------------------------------------

def resolve_entry(entry: dict, repo_root: str, roots: list, warnings: list, errors: list) -> None:
    label = f"{entry.get('_origin', 'config')}:{entry.get('_line', '?')}"
    source = entry.get("source")
    if not isinstance(source, str) or not source:
        errors.append(f"{label}: entry has no `source:`")
        return
    ref, sub_path = entry.get("ref"), entry.get("path")

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
        tree_sugar = True
    else:
        tree_sugar = False

    if _is_git_url(source):
        if not isinstance(ref, str) or not ref:
            errors.append(f"{label}: git source `{source}` requires `ref:` (tag, sha, or branch)")
            return
        if ref.startswith("-") or source.startswith("-"):
            errors.append(f"{label}: git source/ref may not begin with `-`")
            return
        checkout = resolve_git_source(source, ref, warnings, label)
        if checkout is None:
            if tree_sugar:
                warnings.append(
                    f"{label}: if the branch name contains `/`, tree-URL parsing splits it wrong -- use explicit `ref:` and `path:` fields"
                )
            return
        git_meta = {"url": source, "ref": ref}
        source_root = os.path.join(checkout, sub_path) if sub_path else checkout
        real_root, real_checkout = os.path.realpath(source_root), os.path.realpath(checkout)
        if not (real_root == real_checkout or real_root.startswith(real_checkout + os.sep)):
            errors.append(f"{label}: path `{sub_path}` escapes the source checkout")
            return
        source_root = real_root
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
        else:
            source_root = os.path.realpath(os.path.join(repo_root, expanded))
            repo_real = os.path.realpath(repo_root)
            if not (source_root == repo_real or source_root.startswith(repo_real + os.sep)) \
                    or os.path.join(repo_real, ".git") == source_root \
                    or source_root.startswith(os.path.join(repo_real, ".git") + os.sep):
                errors.append(f"{label}: repo-relative source `{source}` resolves outside the repository")
                return
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
    published = enumerate_packs(source_root, self_name)
    if not published:
        warnings.append(f"{label}: source `{source}` publishes no packs (no directories with valid knowledge files)")
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
        root = {"id": pack_id, "dir": pack_dir, "_label": label}
        if git_meta:
            root.update(git_meta)
        roots.append(root)


def _main() -> int:
    if shutil.which("git") is None:
        print(json.dumps({"roots": [], "warnings": ["git binary not found; packs unavailable"], "errors": []}))
        return 0
    proc = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    warnings, errors, roots = [], [], []
    if proc.returncode != 0:
        print(json.dumps({"roots": [], "warnings": ["not inside a git repository; no CE config to read"], "errors": []}))
        return 0
    repo_root = proc.stdout.strip()
    cfg_dir = os.path.join(repo_root, ".compound-engineering")
    entries = []
    for name in CONFIG_FILES:
        entries.extend(parse_packs_block(os.path.join(cfg_dir, name), errors))
    for entry in entries:
        resolve_entry(entry, repo_root, roots, warnings, errors)

    by_id = {}
    final = []
    for root in roots:
        prev = by_id.get(root["id"])
        if prev is not None:
            errors.append(
                f"duplicate pack id `{root['id']}` declared by {prev['_label']} and {root['_label']}; neither installs"
            )
            final = [r for r in final if r["id"] != root["id"]]
            continue
        by_id[root["id"]] = root
        final.append(root)

    print(json.dumps({
        "roots": [{k: v for k, v in r.items() if not k.startswith("_")} for r in final],
        "warnings": warnings,
        "errors": errors,
    }))
    return 0


def main() -> int:
    try:
        return _main()
    except Exception as exc:  # never a traceback: consumers need valid JSON
        print(json.dumps({"roots": [], "warnings": [], "errors": [f"packs resolver failed unexpectedly: {exc}"]}))
        return 0


if __name__ == "__main__":
    sys.exit(main())
