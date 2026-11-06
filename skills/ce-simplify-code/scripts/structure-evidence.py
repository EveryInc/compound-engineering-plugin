#!/usr/bin/env python3
"""Gather structural evidence for ce-simplify-code's structural pass.

Prints one JSON object: how often each file in scope changed, which pairs of
files changed in the same commits, and which imports point from a file that
changes less often to one that changes more often. The numbers are leads for
the structure reviewer, not findings.
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

JS_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts")
PY_EXT = (".py",)
PARSED_EXT = JS_EXT + PY_EXT
CODE_EXT = JS_EXT + PY_EXT + (
    ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cc", ".cpp", ".h",
    ".cs", ".php", ".scala", ".ex", ".exs", ".dart", ".vue", ".svelte", ".sh",
)
# Commits touching more files than this are usually renames, formatting, or
# dependency bumps; their pairs would swamp the real co-change signal.
BULK_COMMIT_FILES = 25

JS_IMPORT = re.compile(
    r"""(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]"""
    r"""|import\s*\(\s*['"]([^'"]+)['"]\s*\)"""
    r"""|require\s*\(\s*['"]([^'"]+)['"]\s*\)"""
    r"""|^\s*import\s+['"]([^'"]+)['"]""",
    re.M,
)
PY_IMPORT = re.compile(r"^\s*(?:from\s+([.\w]+)\s+import\s+(\([^)]*\)|[^\n]*)|import\s+([\w.]+))", re.M)


def git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        check=True, capture_output=True, text=True,
    ).stdout


def in_scope(path: str, scopes: list[str]) -> bool:
    return any(s in ("", ".") or path == s or path.startswith(s.rstrip("/") + "/") for s in scopes)


TEST_MARKER = re.compile(r"\.(test|spec)(?=\.)|^test_|_test(?=\.)")


def unit_key(path: str) -> str:
    return os.path.join(os.path.dirname(path), os.path.splitext(TEST_MARKER.sub("", os.path.basename(path)))[0])


def load_aliases(root: Path) -> list[tuple[str, str]]:
    aliases: list[tuple[str, str]] = []
    for name in ("tsconfig.json", "jsconfig.json"):
        f = root / name
        if not f.is_file():
            continue
        text = re.sub(r"//[^\n]*|/\*.*?\*/", "", f.read_text(errors="ignore"), flags=re.S)
        text = re.sub(r",(\s*[}\]])", r"\1", text)
        try:
            opts = json.loads(text).get("compilerOptions", {})
        except json.JSONDecodeError:
            continue
        base = opts.get("baseUrl", ".")
        for pattern, targets in (opts.get("paths") or {}).items():
            if targets:
                aliases.append((pattern.rstrip("*"), os.path.normpath(os.path.join(base, targets[0].rstrip("*")))))
    return aliases


def resolve_js(spec: str, importer: str, files: set[str], aliases: list[tuple[str, str]]) -> str | None:
    if spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(importer), spec))
    else:
        base = None
        for prefix, target in aliases:
            if prefix and spec.startswith(prefix):
                base = os.path.normpath(os.path.join(target, spec[len(prefix):]))
                break
        if base is None:
            return None
    stem = re.sub(r"\.(m|c)?js$", "", base)
    for cand in (base, *(stem + e for e in JS_EXT), *(os.path.join(base, "index" + e) for e in JS_EXT)):
        if cand in files:
            return cand
    return None


def resolve_py(spec: str, importer: str, files: set[str], roots: list[str]) -> str | None:
    if spec.startswith("."):
        dots = len(spec) - len(spec.lstrip("."))
        pkg = Path(importer).parent
        for _ in range(dots - 1):
            pkg = pkg.parent
        rel = spec.lstrip(".").replace(".", "/")
        bases = [str(pkg / rel) if rel else str(pkg)]
    else:
        rel = spec.replace(".", "/")
        bases = [os.path.normpath(os.path.join(r, rel)) for r in roots]
    for b in bases:
        for cand in (b + ".py", os.path.join(b, "__init__.py")):
            if cand in files:
                return cand
    return None


def resolve_py_import(m: re.Match, importer: str, files: set[str], roots: list[str]) -> list[str | None]:
    if m.group(3):
        return [resolve_py(m.group(3), importer, files, roots)]
    spec = m.group(1)
    names = [n.split()[0] for n in re.sub(r"#[^\n]*", "", m.group(2)).strip("()\\ ").split(",") if n.split()]
    # `from pkg import mod` names a submodule when one exists; other names live in the module itself.
    subs = [resolve_py(spec + ("" if spec.endswith(".") else ".") + n, importer, files, roots) for n in names if n != "*"]
    found = [t for t in subs if t]
    return found if found and len(found) == len(names) else [*found, resolve_py(spec, importer, files, roots)]


def log_changes(root: Path, max_commits: int, paths: list[str], *extra: str) -> list[tuple[int, list[str]]]:
    log = git(root, "log", "--no-merges", "--no-renames", f"-n{max_commits}", *extra,
              "--format=%x00%ct", "--name-only", "--", *paths)
    return [(int(b.splitlines()[0]), b.splitlines()[1:]) for b in log.split("\0")[1:]]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--max-commits", type=int, default=400)
    ap.add_argument("--top", type=int, default=40)
    ap.add_argument("scope", nargs="*", default=["."])
    a = ap.parse_args()

    root = Path(git(Path(a.repo), "rev-parse", "--show-toplevel").strip())
    scopes = [os.path.relpath((Path(a.repo) / s).resolve(), root) for s in a.scope]
    scopes = ["" if s == "." else s for s in scopes]

    tracked = set(git(root, "ls-files").splitlines())
    files = sorted(f for f in tracked if f.endswith(CODE_EXT) and in_scope(f, scopes))
    # A test counts as part of the file it tests, so the pair or import between them is not reported.
    subject_of = {unit_key(f): f for f in sorted(tracked) if f.endswith(CODE_EXT) and not TEST_MARKER.search(os.path.basename(f))}

    def unit(f: str) -> str:
        return subject_of.get(unit_key(f), f) if TEST_MARKER.search(os.path.basename(f)) else f

    history = log_changes(root, a.max_commits, [s or "." for s in scopes])
    churn: Counter[str] = Counter()
    pairs: Counter[tuple[str, str]] = Counter()
    commits = bulk = 0
    for _, changed in history:
        lines = [l for l in changed if l and l in tracked and in_scope(l, scopes)]
        code = sorted({unit(l) for l in lines if l.endswith(CODE_EXT)})
        if not code:
            continue
        commits += 1
        churn.update(code)
        if len(code) > BULK_COMMIT_FILES:
            bulk += 1
            continue
        pairs.update(itertools.combinations(code, 2))

    aliases = load_aliases(root)
    py_roots = sorted({"."} | {s for s in scopes if s} | {str(Path(s).parent) for s in scopes if s})
    tracked_code = {f for f in tracked if f.endswith(PARSED_EXT)}
    edges: set[tuple[str, str]] = set()
    unparsed: Counter[str] = Counter()
    for f in files:
        ext = os.path.splitext(f)[1]
        if ext not in PARSED_EXT:
            unparsed[ext] += 1
            continue
        try:
            text = (root / f).read_text(errors="ignore")
        except OSError:
            continue
        if ext in JS_EXT:
            targets = (resolve_js(next(g for g in m.groups() if g), f, tracked_code, aliases) for m in JS_IMPORT.finditer(text))
        else:
            targets = (t for m in PY_IMPORT.finditer(text) for t in resolve_py_import(m, f, tracked_code, py_roots))
        edges.update((unit(f), t) for t in targets if t and t != unit(f))

    outside = sorted({t for _, t in edges if not in_scope(t, scopes)})
    if outside:
        # Count an out-of-scope import target over the same window the scope's history covered.
        window = [f"--since=@{history[-1][0]}"] if len(history) >= a.max_commits else []
        for _, changed in log_changes(root, a.max_commits, outside, *window):
            churn.update({unit(l) for l in changed if l in outside})

    co_change = [
        {"files": [x, y], "together": n, "changes": [churn[x], churn[y]],
         "cross_directory": os.path.dirname(x) != os.path.dirname(y)}
        for (x, y), n in pairs.most_common() if n >= 2
    ][: a.top]
    toward_volatile = sorted(
        ({"importer": i, "imported": t, "changes": [churn[i], churn[t]]}
         for i, t in sorted(edges) if churn[t] > churn[i] + 1),
        key=lambda e: e["changes"][1] - e["changes"][0], reverse=True,
    )[: a.top]

    json.dump({
        "scope": [s or "." for s in scopes],
        "commits_read": commits,
        "bulk_commits_skipped_for_pairs": bulk,
        "files_in_scope": len(files),
        "most_changed": [{"file": f, "changes": n} for f, n in churn.most_common(a.top)],
        "co_change": co_change,
        "import_edges": len(edges),
        "imports_toward_more_changed": toward_volatile,
        "imports_not_parsed": dict(unparsed),
    }, sys.stdout, indent=1)
    print()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as e:
        print(f"git failed: {e.stderr.strip()}", file=sys.stderr)
        sys.exit(2)
