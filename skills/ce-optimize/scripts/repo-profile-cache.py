#!/usr/bin/env python3
"""Shared repo-grounding project-profile cache: deterministic get/put.

This helper owns the *deterministic* cache I/O for the question-agnostic
project profile that repo-grounding skills reuse. The non-deterministic
derivation (reading manifests, summarizing conventions) is done by the
`repo-profiler` persona only on a miss — never here.

Usage:
    python3 repo-profile-cache.py get
    python3 repo-profile-cache.py put <profile-json-file>

`get` prints exactly one of:
    HIT\\n<profile-json>     a valid entry exists for the current repo state;
                            the profile JSON follows on subsequent lines
    MISS\\n<write-path>      git repo, no valid entry — caller derives the
                            profile and calls `put <write-path-or-any-file>`
    NO-CACHE                no git repo or no writable cache — caller derives
                            the profile fresh and skips `put`

`put <file>` reads the profile JSON from <file>, wraps it with a validity
stamp, and writes it atomically to the computed cache path. Prints the path
on success, `NO-CACHE` when the repo/cache is unavailable.

Cache path:
    /tmp/compound-engineering/repo-profile/<root-sha>/<head-sha>.json
  root-sha = lexicographically-first `git rev-list --max-parents=0 HEAD`
             (deterministic even for multi-root histories) — the repo identity,
             shared across worktrees and clones.
  head-sha = `git rev-parse HEAD` — the working state.

Validity (HIT) requires ALL of:
  - the cache file exists and parses as JSON,
  - stored `head_sha` == current HEAD,
  - stored `profile_schema_version` == PROFILE_SCHEMA_VERSION,
  - no profile-input path is dirty or newly-added per `git status --porcelain`
    (the schema-derived superset in `is_profile_input`, which also catches
    untracked `??` files — a newly-added manifest or AGENTS.md must invalidate).

Cardinal rule: this cache is an optimization, never a correctness dependency.
Every failure mode (not a git repo, unreadable/malformed cache, no writable
/tmp, git errors) degrades to NO-CACHE/MISS and exits 0 — it never raises and
never serves a profile it cannot prove fresh.

Pure stdlib. No third-party dependencies.
"""
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

# Bump when the profile schema changes so a newer reader never reuses an
# entry written under an older (narrower) schema.
PROFILE_SCHEMA_VERSION = "1"

CACHE_ROOT = "/tmp/compound-engineering/repo-profile"

# --- Profile-input set (the schema-derived superset, per the plan's R3) -------
# Any change to one of these — including a NEW untracked file — must invalidate
# the cached profile. Conservative by design: over-invalidating costs a
# re-derive; under-invalidating serves a stale profile (a cardinal-rule break).

# Dependency manifests + lockfiles. Matched by basename at ANY depth so a
# monorepo workspace's manifest also invalidates.
_MANIFEST_LOCKFILE = {
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "bun.lock", "bun.lockb", "npm-shrinkwrap.json",
    "go.mod", "go.sum",
    "Cargo.toml", "Cargo.lock",
    "Gemfile", "Gemfile.lock", "gems.rb", "gems.locked",
    "pyproject.toml", "poetry.lock", "Pipfile", "Pipfile.lock",
    "requirements.txt", "setup.py", "setup.cfg",
    "composer.json", "composer.lock",
    "pom.xml", "build.gradle", "build.gradle.kts",
    "build.sbt", "mix.exs", "mix.lock", "pubspec.yaml", "pubspec.lock",
}

_LICENSE = {"LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "COPYING"}

# Topology / deployment sources. Basename match at any depth.
_TOPOLOGY = {
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "Containerfile",
}

# Root-level instruction/doc files cached in the profile. Matched ONLY at the
# repo root — subdirectory-scoped instruction files (e.g. nested CLAUDE.md /
# AGENTS.md) are NOT cached; consumers re-glob those fresh, so a subdir change
# must not invalidate the root profile.
_ROOT_DOCS = {
    "AGENTS.md", "CLAUDE.md", "GEMINI.md",
    "CONCEPTS.md", "STRATEGY.md",
    "ARCHITECTURE.md", "README.md", "CONTRIBUTING.md",
}


def is_profile_input(path: str) -> bool:
    """True when a changed path is one the cached profile derives from."""
    base = path.rsplit("/", 1)[-1]
    if base in _MANIFEST_LOCKFILE or base in _LICENSE or base in _TOPOLOGY:
        return True
    if "/" not in path and base in _ROOT_DOCS:
        return True
    if path.startswith(".cursor/"):
        return True
    if path.startswith(".github/workflows/"):
        return True
    return False


def git(*args: str) -> "str | None":
    """Run a git command; return stripped stdout, or None on any failure."""
    try:
        result = subprocess.run(
            ["git", *args], capture_output=True, text=True, check=False
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def root_sha() -> "str | None":
    out = git("rev-list", "--max-parents=0", "HEAD")
    if not out:
        return None
    # Multi-root histories print several SHAs; pick a deterministic one.
    return sorted(out.split("\n"))[0]


def changed_paths() -> "list[str] | None":
    """Paths from `git status --porcelain`, or None if it could not run.

    Includes untracked (`??`) entries so a newly-added profile input is seen.
    None signals "could not determine cleanliness" — the caller treats that
    conservatively as a miss rather than serving an unverified profile.
    """
    # --untracked-files=all lists individual untracked files; without it git
    # collapses a fully-untracked new directory to a single `?? dir/` entry,
    # which would hide a newly-added manifest inside it.
    #
    # Call subprocess directly rather than via git(): porcelain's status
    # columns include a significant LEADING space (e.g. " M path"), and
    # git()'s .strip() would eat it and shift the path slice.
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=all"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None
    paths: list[str] = []
    for line in result.stdout.split("\n"):
        if not line.strip():
            continue
        rest = line[3:] if len(line) > 3 else ""
        # Rename/copy entries are "old -> new"; the new path is what matters.
        if " -> " in rest:
            rest = rest.split(" -> ", 1)[1]
        rest = rest.strip()
        # git quotes paths containing special characters.
        if len(rest) >= 2 and rest[0] == '"' and rest[-1] == '"':
            rest = rest[1:-1]
        if rest:
            paths.append(rest)
    return paths


def cache_path(root: str, head: str) -> str:
    return os.path.join(CACHE_ROOT, root, f"{head}.json")


def do_get() -> int:
    root = root_sha()
    head = git("rev-parse", "HEAD")
    if not root or not head:
        print("NO-CACHE")
        return 0

    path = cache_path(root, head)

    # No entry yet — caller derives and may persist.
    if not os.path.isfile(path):
        print("MISS")
        print(path)
        return 0

    try:
        with open(path) as f:
            doc = json.load(f)
    except (OSError, ValueError):
        print("MISS")
        print(path)
        return 0

    if (
        not isinstance(doc, dict)
        or doc.get("head_sha") != head
        or doc.get("profile_schema_version") != PROFILE_SCHEMA_VERSION
        or "profile" not in doc
    ):
        print("MISS")
        print(path)
        return 0

    changed = changed_paths()
    # Could not determine cleanliness, or a profile input changed/was added.
    if changed is None or any(is_profile_input(p) for p in changed):
        print("MISS")
        print(path)
        return 0

    print("HIT")
    print(json.dumps(doc["profile"]))
    return 0


def do_put(profile_file: str) -> int:
    root = root_sha()
    head = git("rev-parse", "HEAD")
    if not root or not head:
        print("NO-CACHE")
        return 0

    try:
        with open(profile_file) as f:
            profile = json.load(f)
    except (OSError, ValueError) as exc:
        sys.stderr.write(f"repo-profile-cache: cannot read profile: {exc}\n")
        return 0  # degrade — never block the caller

    # Shape guard: a profile is a non-empty JSON object. A misbehaving profiler
    # that returns well-formed-but-garbage JSON (`{}`, `"oops"`, `[]`, `42`)
    # must not be cached and then served to every skill as the agnostic
    # profile. Reject it rather than persist it (the caller already has its
    # own derived profile for this run; the next run re-derives).
    if not isinstance(profile, dict) or not profile:
        sys.stderr.write(
            "repo-profile-cache: profile is not a non-empty object; not caching\n"
        )
        print("NO-CACHE")
        return 0

    doc = {
        "profile_schema_version": PROFILE_SCHEMA_VERSION,
        "root_sha": root,
        "head_sha": head,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
    }

    path = cache_path(root, head)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # Atomic write: temp file in the same dir + os.replace (atomic on
        # POSIX) so a concurrent reader never sees a torn JSON.
        fd, tmp = tempfile.mkstemp(
            dir=os.path.dirname(path), prefix=".tmp-", suffix=".json"
        )
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(doc, f)
            os.replace(tmp, path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
    except OSError as exc:
        sys.stderr.write(f"repo-profile-cache: cannot write cache: {exc}\n")
        print("NO-CACHE")
        return 0

    print(path)
    return 0


def usage() -> int:
    sys.stderr.write(
        "usage: repo-profile-cache.py get | put <profile-json-file>\n"
    )
    return 2


def main(argv: "list[str]") -> int:
    if len(argv) < 2:
        return usage()
    cmd = argv[1]
    if cmd == "get":
        return do_get()
    if cmd == "put":
        if len(argv) != 3:
            return usage()
        return do_put(argv[2])
    return usage()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
