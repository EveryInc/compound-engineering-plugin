#!/usr/bin/env python3
"""Compute fail-closed, deterministic scope facts for ce-code-review.

The helper never awards lite. It reports counts, path classes, and floors
the skill's Review depth gate reads. `hard_block_full` forces the full
spine; a clear floor still needs the agent to confirm no high-consequence
class before lite.
"""

from __future__ import annotations

import argparse
import functools
import json
import os
import re
import subprocess
import sys
from pathlib import Path


CODE_EXTENSIONS = {
    ".rb", ".py", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".go", ".rs",
    ".java", ".swift", ".kt", ".c", ".cc", ".cpp", ".cs", ".php",
    ".ex", ".exs", ".scala",
}

SIGNAL_PATTERNS = {
    "migrations": re.compile(
        r"db/migrate/|schema\.(rb|sql)|/migrations?/|alembic|flyway|liquibase",
        re.I,
    ),
    "frontend": re.compile(
        r"\.(tsx|jsx|vue|svelte|css|scss|html|erb|haml)$|/components?/|stimulus|turbo",
        re.I,
    ),
    "api": re.compile(
        r"/(routes?|controllers?|api|serializers?|graphql)/|\.proto$|openapi|swagger",
        re.I,
    ),
    "swift-ios": re.compile(r"\.(swift|kt|pbxproj|xcconfig|entitlements)$", re.I),
}

# Classes the script can name from paths alone. These force full; they do not
# award lite. Silent-pass guards outside these paths are the agent's question.
HARD_BLOCK_PATTERNS = {
    "ci": re.compile(
        r"(^|/)\.github/workflows/|(^|/)\.gitlab-ci\.yml$|(^|/)\.gitlab-ci/"
        r"|(^|/)Jenkinsfile$|(^|/)\.circleci/|(^|/)\.buildkite/",
        re.I,
    ),
    "migrations": SIGNAL_PATTERNS["migrations"],
}

SMALL_LINE_MAX = 39

TEST_PATTERN = re.compile(
    r"(^|/)(tests?|spec|__tests__)/|(^|/)[^/]+[._-](test|spec)\.[^/]+$",
    re.I,
)
AGENT_SURFACE_PATTERN = re.compile(
    r"(^|/)(skills?|agents?|prompts?|tools?|mcp|commands?)(/|$)|SKILL\.md$|"
    r"(^|/)(AGENTS|CLAUDE|GEMINI)\.md$|\.cursor/|\.codex-plugin/|\.claude-plugin/",
    re.I,
)


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=False
    )


def valid_commit(ref: str | None) -> bool:
    if not ref:
        return False
    return git("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}").returncode == 0


def unique_merge_base(base: str, head: str) -> str | None:
    result = git("merge-base", "--all", base, head)
    candidates = [line for line in result.stdout.splitlines() if line]
    if result.returncode != 0 or len(candidates) != 1:
        return None
    return candidates[0]


DEFAULT_DOCS_ROOT = "docs"


def normalize_docs_root(docs_root: str | None) -> str:
    """Fall back to the default root for an unset, empty, or unsubstituted value.

    The calling skill substitutes a resolved path for the ``<root>`` placeholder
    before invoking this script. If that substitution is missing — the value is
    empty, or still contains angle brackets (a literal ``<root>``) — treat it as
    unset and use the default ``docs``, which is exactly the block's unset
    behavior. This keeps the common default-config case correct even when the
    caller forgets to substitute.
    """
    if not docs_root or "<" in docs_root or ">" in docs_root:
        return DEFAULT_DOCS_ROOT
    return docs_root


@functools.lru_cache(maxsize=None)
def repo_root() -> Path:
    """The repository root, matching how docs_root is resolved everywhere else.

    docs_root is repo-relative (``<repo-root>/<docs_root>``), so the corpus
    check must resolve against the git toplevel, not the current working
    directory. ce-code-review can run from a subdirectory (``git diff`` still
    works there), where ``Path.cwd()`` would join docs_root under the subdir and
    wrongly report the corpus absent. Fall back to cwd when git can't answer.
    """
    result = git("rev-parse", "--show-toplevel")
    if result.returncode == 0 and result.stdout.strip():
        return Path(result.stdout.strip()).resolve()
    return Path.cwd().resolve()


def has_learnings_corpus(docs_root: str | None) -> bool:
    """Whether a `<docs_root>/solutions` learnings corpus exists.

    docs_root is the artifact root resolved by the calling skill (default
    ``docs``). Guard it the way the skill-prose rule does: normalize an
    unset/placeholder value to the default, and treat a value that is absolute
    or escapes the repository as absent rather than probing an out-of-repo path.
    """
    docs_root = normalize_docs_root(docs_root)
    if os.path.isabs(docs_root):
        return False
    repo = repo_root()
    candidate = (repo / docs_root / "solutions").resolve()
    if repo not in candidate.parents and candidate != repo:
        return False
    return candidate.is_dir()


PACKS_RESOLVER = Path(__file__).resolve().parent / "packs-resolve.py"
# Parse-only mode does no git or cache work, so this bound only guards against a
# wedged interpreter; the helper is meant to be cheap and must never hang scope.
PACKS_RESOLVER_TIMEOUT = 30.0


def declared_packs() -> tuple[bool | None, int]:
    """Whether the local CE config declares Compound Packs, from the config alone.

    Runs the sibling resolver in `--declared-only` mode, which parses the
    `packs:` list from both CE config layers and shape-checks each entry with no
    git or cache work. Its `declared` is true when any entry parsed or the block
    is malformed -- a broken declaration is still one the learnings pass must
    surface in Coverage. ``None`` means the helper could not tell (resolver
    missing, crashed, timed out, or answered without `declared`); the caller
    then falls closed to reading the config's `packs:` key itself. The second
    value keeps the `pack_roots` output slot and is always 0: nothing resolves
    here.
    """
    if not PACKS_RESOLVER.is_file():
        return None, 0
    try:
        proc = subprocess.run(
            [sys.executable, str(PACKS_RESOLVER), "--declared-only"],
            capture_output=True,
            text=True,
            check=False,
            cwd=repo_root(),
            timeout=PACKS_RESOLVER_TIMEOUT,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None, 0
    if proc.returncode != 0:
        return None, 0
    try:
        data = json.loads(proc.stdout)
    except ValueError:
        return None, 0
    declared = data.get("declared") if isinstance(data, dict) else None
    if not isinstance(declared, bool):
        return None, 0
    return declared, 0


def repo_signals(docs_root: str | None, local_scope: bool) -> dict[str, object]:
    """Facts about the repo, not the diff: present in every result shape.

    `declared_packs` describes the local checkout's config, which is not the
    reviewed tree's config in remote scope, so it is evaluated only when
    `local_scope` is true and reported as ``None`` otherwise.
    """
    learnings_corpus = has_learnings_corpus(docs_root)
    declared, pack_roots = declared_packs() if local_scope else (None, 0)
    return {
        "has_learnings_corpus": learnings_corpus,
        "declared_packs": declared,
        "pack_roots": pack_roots,
    }


def fail_closed(reason: str, signals: dict[str, object]) -> dict[str, object]:
    return {
        "status": "unknown",
        "reason": reason,
        "exec_lines": None,
        "changed_lines": None,
        "uncounted_files": 1,
        "changed_files": [],
        "signals": [],
        "hard_block_classes": ["unknown-scope"],
        "hard_block_full": True,
        "size_band": "unknown",
        "test_files_changed": False,
        "agent_surface": False,
        **signals,
    }


def size_band_for(changed_lines: int | None) -> str:
    if changed_lines is None:
        return "unknown"
    if 1 <= changed_lines <= SMALL_LINE_MAX:
        return "small"
    return "large"


def matching_classes(
    files: list[str], patterns: dict[str, re.Pattern[str]]
) -> list[str]:
    return [
        name
        for name, pattern in patterns.items()
        if any(pattern.search(file) for file in files)
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--head")
    parser.add_argument("--docs-root", default="docs")
    args = parser.parse_args()

    # Remote scope (pr-remote / branch-remote) always passes --head, even when a
    # best-effort fetch left it empty; the local config is not that tree's config.
    repo = repo_signals(args.docs_root, local_scope=args.head is None)

    if not valid_commit(args.base):
        print(json.dumps(fail_closed("invalid base endpoint", repo), sort_keys=True))
        return 0
    if args.head is not None and not valid_commit(args.head):
        print(json.dumps(fail_closed("invalid head endpoint", repo), sort_keys=True))
        return 0

    diff_args = [args.base]
    if args.head:
        merge_base = unique_merge_base(args.base, args.head)
        if merge_base is None:
            print(json.dumps(fail_closed("merge base unavailable or ambiguous", repo), sort_keys=True))
            return 0
        diff_args = [merge_base, args.head]

    names = git("diff", "--name-only", *diff_args)
    numstat = git("diff", "--numstat", *diff_args)
    if names.returncode != 0 or numstat.returncode != 0:
        print(json.dumps(fail_closed("git diff failed", repo), sort_keys=True))
        return 0

    files = sorted(line for line in names.stdout.splitlines() if line)
    executable_lines = 0
    changed_lines = 0
    uncounted = 0
    for line in numstat.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        added, deleted, name = parts[0], parts[1], parts[2]
        if added == "-" or deleted == "-":
            uncounted += 1
            continue
        try:
            total = int(added) + int(deleted)
        except ValueError:
            uncounted += 1
            continue
        changed_lines += total
        if Path(name).suffix.lower() in CODE_EXTENSIONS:
            executable_lines += total

    signals = matching_classes(files, SIGNAL_PATTERNS)
    hard_block_classes = matching_classes(files, HARD_BLOCK_PATTERNS)
    if uncounted:
        hard_block_classes.append("uncounted")
    band = size_band_for(changed_lines)

    result = {
        "status": "complete",
        "reason": None,
        "exec_lines": executable_lines,
        "changed_lines": changed_lines,
        "uncounted_files": uncounted,
        "changed_files": files,
        "signals": signals,
        "hard_block_classes": hard_block_classes,
        "hard_block_full": bool(hard_block_classes) or band != "small",
        "size_band": band,
        "test_files_changed": any(TEST_PATTERN.search(file) for file in files),
        "agent_surface": any(AGENT_SURFACE_PATTERN.search(file) for file in files),
        **repo,
    }
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
