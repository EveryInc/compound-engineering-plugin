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
    <resolved-cache-root>/repo-profile-v1/<root-sha>/<inputs-digest>.json
  root-sha = lexicographically-first `git rev-list --max-parents=0 HEAD`
             (deterministic even for multi-root histories) — the repo identity,
             shared across worktrees and clones.
  inputs-digest = sha256 over (1) every committed blob path (shape — catches
             topology/module-layout changes such as a new directory or file)
             and (2) (path, blob-sha) for every profile-input file at HEAD.
             Content edits to non-input files keep the same entry; adding or
             removing any path, or changing a profile-input's content, does not.

Validity (HIT) requires ALL of:
  - the cache file exists and parses as JSON,
  - stored `inputs_digest` == current inputs digest,
  - stored `profile_schema_version` == PROFILE_SCHEMA_VERSION,
  - no profile-input path is dirty or newly-added per `git status --porcelain`
    (the schema-derived superset in `is_profile_input`, which also catches
    untracked `??` files — a newly-added manifest or AGENTS.md must invalidate).

Cardinal rule: this cache is an optimization, never a correctness dependency.
Every failure mode (not a git repo, unreadable/malformed cache, no writable
cache root, git errors) degrades to NO-CACHE/MISS and exits 0 — it never raises and
never serves a profile it cannot prove fresh.

Pure stdlib. No third-party dependencies.
"""
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

# Bump when the profile schema changes so a newer reader never reuses an
# entry written under an older (narrower) schema.
PROFILE_SCHEMA_VERSION = "1"
os.umask(0o077)


def resolve_cache_root() -> str:
    """Load the co-located owner-scoped cache resolver.

    Skill assets are self-contained, so each cache consumer carries an
    identical resolver copy beside this helper. Any resolver failure disables
    the optional cache instead of falling back to an unsafe shared path.
    """
    helper = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scratch-root.py")
    spec = importlib.util.spec_from_file_location("ce_scratch_root", helper)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load scratch resolver: {helper}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return str(module.ensure_cache_subdir("repo-profile-v1"))


try:
    CACHE_ROOT = resolve_cache_root()
except Exception:
    CACHE_ROOT = ""

# --- Profile-input set (the schema-derived superset, per the plan's R3) -------
# Any change to one of these — including a NEW untracked file — must invalidate
# the cached profile. Conservative by design: over-invalidating costs a
# re-derive; under-invalidating serves a stale profile (a cardinal-rule break).

# Dependency manifests + lockfiles. Matched by basename at ANY depth so a
# monorepo workspace's manifest also invalidates. The profiler derives
# stack/deps for ANY language, so this list must span ecosystems, not just JS —
# an omitted manifest means a dirty dep bump at unchanged HEAD serves a stale
# profile (a cardinal-rule break).
_MANIFEST_LOCKFILE = {
    # JavaScript / TypeScript / Deno
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "pnpm-workspace.yaml", "bun.lock", "bun.lockb", "npm-shrinkwrap.json",
    "deno.json", "deno.jsonc", "deno.lock",
    # Monorepo / workspace orchestrators
    "nx.json", "lerna.json", "turbo.json", "rush.json",
    # Go (incl. workspaces)
    "go.mod", "go.sum", "go.work", "go.work.sum",
    # Rust
    "Cargo.toml", "Cargo.lock",
    # Ruby
    "Gemfile", "Gemfile.lock", "gems.rb", "gems.locked",
    # Python
    "pyproject.toml", "poetry.lock", "Pipfile", "Pipfile.lock",
    "requirements.txt", "setup.py", "setup.cfg",
    "uv.lock", "pdm.lock", "environment.yml", "environment.yaml",
    # PHP
    "composer.json", "composer.lock",
    # JVM (Maven / Gradle incl. version catalogs)
    "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle",
    "settings.gradle.kts", "libs.versions.toml", "build.sbt",
    # Elixir / Dart
    "mix.exs", "mix.lock", "pubspec.yaml", "pubspec.lock",
    # Swift / iOS (a live target for this project)
    "Package.swift", "Package.resolved", "Podfile", "Podfile.lock",
    "Cartfile", "Cartfile.resolved",
    # .NET
    "packages.config", "Directory.Packages.props", "Directory.Build.props",
    "paket.dependencies", "paket.lock",
    # C / C++
    "CMakeLists.txt", "conanfile.txt", "conanfile.py", "vcpkg.json",
    # Haskell
    "stack.yaml", "stack.yaml.lock", "cabal.project",
}

# Project-file extensions whose presence or version edit changes the stack
# profile. Suffix-matched at any depth (e.g. Foo.csproj, App.sln).
_PROJECT_FILE_SUFFIXES = (
    ".csproj", ".fsproj", ".vbproj", ".sln", ".cabal", ".tf", ".tfvars",
)

_LICENSE = {"LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "COPYING"}

# Topology / deployment sources. Basename match at any depth — these determine
# the derived deployment model (monolith / multi-service / serverless).
_TOPOLOGY = {
    "Dockerfile", "Containerfile",
    "docker-compose.yml", "docker-compose.yaml",
    "vercel.json", "netlify.toml", "fly.toml", "render.yaml",
    "serverless.yml", "serverless.yaml", "app.yaml", "Procfile",
    # IaC descriptors that define the deployment topology.
    "Pulumi.yaml", "Pulumi.yml", "Chart.yaml",
    # CI descriptors outside .github/workflows/ (that prefix is handled below).
    ".gitlab-ci.yml", "Jenkinsfile", "azure-pipelines.yml",
    # Submodule map — topology/dependency surface when gitlinks are present.
    ".gitmodules",
}

# Path prefixes whose contents shape the profile (conventions / CI / deploy).
_INPUT_PREFIXES = (
    ".cursor/", ".github/workflows/", ".circleci/",
    "terraform/", "k8s/", "kubernetes/",
)

# Root-level instruction/doc files cached in the profile. Matched ONLY at the
# repo root — subdirectory-scoped instruction files (e.g. nested CLAUDE.md /
# AGENTS.md) are NOT cached; consumers re-glob those fresh, so a subdir change
# must not invalidate the root profile.
_ROOT_DOCS = {
    "AGENTS.md", "CLAUDE.md", "GEMINI.md",
    "CONCEPTS.md", "STRATEGY.md",
    "ARCHITECTURE.md", "README.md", "CONTRIBUTING.md",
    ".cursorrules",  # legacy root-level Cursor rules (the profiler reads it)
}

# Runtime / tool version selectors that pin a language or tool version OUTSIDE
# the manifests (the profiler reads these for stack versions). Basename match.
_VERSION_SELECTORS = {
    ".nvmrc", ".node-version", ".python-version", ".ruby-version",
    ".java-version", ".go-version", ".terraform-version",
    ".tool-versions", "mise.toml", ".mise.toml", ".sdkmanrc",
}


def is_profile_input(path: str) -> bool:
    """True when a changed path is one the cached profile derives from.

    Deliberately a conservative superset: anything plausibly feeding the
    stack/deps/topology/conventions profile invalidates. Over-matching costs a
    re-derive; under-matching serves a stale profile (a cardinal-rule break).
    """
    base = os.path.basename(path)
    if (
        base in _MANIFEST_LOCKFILE
        or base in _LICENSE
        or base in _TOPOLOGY
        or base in _VERSION_SELECTORS
    ):
        return True
    if base.endswith(_PROJECT_FILE_SUFFIXES):
        return True
    if "/" not in path and base in _ROOT_DOCS:
        return True
    if path.startswith(_INPUT_PREFIXES):
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


def _parse_ls_tree() -> "list[tuple[str, str, str, str]] | None":
    """Parse `git ls-tree -r -z HEAD` into (mode, obj_type, obj, path) rows."""
    try:
        result = subprocess.run(
            ["git", "ls-tree", "-r", "-z", "HEAD"],
            capture_output=True,
            check=False,
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None

    rows: list[tuple[str, str, str, str]] = []
    for entry in result.stdout.split(b"\0"):
        if not entry:
            continue
        try:
            meta, path_b = entry.split(b"\t", 1)
        except ValueError:
            continue
        parts = meta.split()
        if len(parts) < 3:
            continue
        mode, obj_type, obj = parts[0], parts[1], parts[2]
        path = path_b.decode("utf-8", errors="surrogateescape")
        rows.append(
            (
                mode.decode("ascii"),
                obj_type.decode("ascii"),
                obj.decode("ascii"),
                path,
            )
        )
    return rows


def _resolve_symlink_target(link_path: str, target: str) -> "str | None":
    """Resolve a symlink target relative to link_path; None if outside the tree."""
    import posixpath

    target = target.strip()
    if not target or target.startswith("/"):
        return None
    base = posixpath.dirname(link_path)
    resolved = posixpath.normpath(
        posixpath.join(base, target) if base else target
    )
    if resolved.startswith("../") or resolved == "..":
        return None
    return resolved


def _follow_symlink_chain(
    start_path: str,
    by_path: "dict[str, tuple[str, str, str]]",
) -> "tuple[str, str, set[str]] | None":
    """Follow symlink chain from start_path to a regular blob.

    Returns (final_path, final_blob_sha, intermediate_paths) where
    intermediate_paths are every symlink path visited after start (not including
    start or the final regular file). None if the chain cannot be resolved
    (missing entry, cycle, escaped tree, or non-blob).
    """
    seen: set[str] = set()
    path = start_path
    intermediates: set[str] = set()
    for _ in range(32):
        if path in seen:
            return None
        seen.add(path)
        entry = by_path.get(path)
        if entry is None:
            return None
        mode, typ, obj = entry
        if typ != "blob":
            return None
        if mode != "120000":
            return path, obj, intermediates
        target_raw = git("cat-file", "-p", obj)
        if target_raw is None:
            return None
        resolved = _resolve_symlink_target(path, target_raw)
        if not resolved:
            return None
        if path != start_path:
            intermediates.add(path)
        path = resolved
    return None


def profile_input_symlink_targets() -> "set[str] | None":
    """Paths whose dirtiness affects a profile-input symlink chain at HEAD.

    Includes intermediate symlink paths and the final regular-file target.
    None if the tree could not be listed — callers treat that as dirty/miss.
    """
    rows = _parse_ls_tree()
    if rows is None:
        return None
    by_path = {path: (mode, typ, obj) for mode, typ, obj, path in rows}
    targets: set[str] = set()
    for mode, typ, _obj, path in rows:
        if typ != "blob" or mode != "120000" or not is_profile_input(path):
            continue
        followed = _follow_symlink_chain(path, by_path)
        if followed is None:
            return None
        final_path, _final_obj, intermediates = followed
        targets.update(intermediates)
        targets.add(final_path)
    return targets


def head_gitlink_paths() -> "set[str] | None":
    """Paths of submodule gitlinks at HEAD. None if the tree could not be listed."""
    rows = _parse_ls_tree()
    if rows is None:
        return None
    return {path for _mode, typ, _obj, path in rows if typ == "commit"}


def profile_inputs_affected(changed: list[str]) -> "bool | None":
    """True if any changed path affects the cached profile's freshness.

    Covers ordinary profile inputs, profile-input symlink-chain paths, and
    HEAD gitlink (submodule) paths — so an uncommitted submodule pointer
    advance cannot serve a HIT keyed on the old committed gitlink.

    None if symlink/gitlink metadata could not be resolved (caller treats as miss).
    """
    if any(is_profile_input(p) for p in changed):
        return True
    targets = profile_input_symlink_targets()
    if targets is None:
        return None
    if any(p in targets for p in changed):
        return True
    gitlinks = head_gitlink_paths()
    if gitlinks is None:
        return None
    return any(p in gitlinks for p in changed)


def inputs_digest() -> "str | None":
    """Sha256 covering committed tree shape + profile-input contents at HEAD.

    Layers (committed state only via `git ls-tree`; working-tree dirtiness is a
    separate HIT gate via `changed_paths`):

    - Every blob **path** (no content) — so adding/removing/renaming a file
      (e.g. a new `src/db/migrations/` module) changes the digest and busts a
      cached topology/module_layout, without invalidating on content edits to
      existing non-input files.
    - `(path, blob-sha)` for every **profile-input** blob — so manifest/docs/CI
      content changes still invalidate.
    - For profile-input **symlinks** (mode 120000), the final in-repo regular
      blob after following the full symlink chain — so
      `README.md -> docs/link.md -> docs/README.md` invalidates when the final
      file content changes.
    - `(path, commit-sha)` for every **gitlink** (`160000 commit` submodule
      entry) — so adding a submodule or advancing its pointer invalidates.

    None if git could not list the tree.
    """
    rows = _parse_ls_tree()
    if rows is None:
        return None
    by_path = {path: (mode, typ, obj) for mode, typ, obj, path in rows}

    pairs: list[str] = []
    for mode, typ, obj, path in rows:
        if typ == "blob":
            pairs.append(f"path\0{path}")
            if is_profile_input(path):
                pairs.append(f"blob\0{path}\0{obj}")
                if mode == "120000":
                    followed = _follow_symlink_chain(path, by_path)
                    if followed is None:
                        return None
                    final_path, final_obj, _intermediates = followed
                    pairs.append(
                        f"symlink-target\0{path}\0{final_path}\0{final_obj}"
                    )
        elif typ == "commit":
            pairs.append(f"gitlink\0{path}\0{obj}")

    pairs.sort()
    h = hashlib.sha256()
    for pair in pairs:
        h.update(pair.encode("utf-8", errors="surrogateescape"))
        h.update(b"\n")
    return h.hexdigest()


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
    def clean(token: str) -> str:
        token = token.strip()
        # git quotes paths containing special characters.
        if len(token) >= 2 and token[0] == '"' and token[-1] == '"':
            token = token[1:-1]
        return token

    paths: list[str] = []
    for line in result.stdout.split("\n"):
        if not line.strip():
            continue
        rest = line[3:]
        # Rename/copy entries are "old -> new"; BOTH endpoints changed. A
        # profile input renamed *away* (e.g. `package.json -> pkg.json`) must
        # still invalidate, so keep the source path, not just the destination.
        if " -> " in rest:
            for token in rest.split(" -> ", 1):
                p = clean(token)
                if p:
                    paths.append(p)
            continue
        p = clean(rest)
        if p:
            paths.append(p)
    return paths


def cache_path(root: str, digest: str) -> str:
    return os.path.join(CACHE_ROOT, root, f"{digest}.json")


def resolve_keys() -> "tuple[str, str, str] | None":
    """The (root-sha, head-sha, inputs-digest) key, or None if unusable."""
    root = root_sha()
    head = git("rev-parse", "HEAD")
    digest = inputs_digest()
    if not root or not head or not digest:
        return None
    return root, head, digest


_PROFILE_KEYS = ("stack", "dependencies", "topology", "conventions", "vocabulary")


def is_valid_profile(profile: object) -> bool:
    """A profile must be an object carrying every expected top-level key. This
    rejects a profiler failure that still returned JSON — a wrapper/error object
    or a partial result — which would otherwise be cached and served as a HIT,
    leaving consumers to skip fresh derivation and read missing fields from a
    broken object."""
    return isinstance(profile, dict) and all(k in profile for k in _PROFILE_KEYS)


def do_get() -> int:
    if not CACHE_ROOT:
        print("NO-CACHE")
        return 0
    keys = resolve_keys()
    if keys is None:
        print("NO-CACHE")
        return 0
    root, _head, digest = keys
    path = cache_path(root, digest)

    def miss() -> int:
        print("MISS")
        print(path)
        return 0

    # A missing file raises FileNotFoundError (an OSError) and degrades to the
    # same MISS, so no separate existence check is needed.
    try:
        with open(path) as f:
            # /tmp is world-shared, so reject a cache file not owned by us: a
            # co-tenant could plant an entry that passes the gates below and
            # feed attacker-controlled text into the agent as the "profile"
            # (indirect prompt injection). Skip where geteuid is unavailable
            # (non-POSIX), where this shared-tmp threat does not apply.
            geteuid = getattr(os, "geteuid", None)
            if geteuid is not None and os.fstat(f.fileno()).st_uid != geteuid():
                return miss()
            doc = json.load(f)
    except (OSError, ValueError):
        return miss()

    profile = doc.get("profile") if isinstance(doc, dict) else None
    if (
        not isinstance(doc, dict)
        or doc.get("inputs_digest") != digest
        or doc.get("profile_schema_version") != PROFILE_SCHEMA_VERSION
        or not is_valid_profile(profile)
    ):
        return miss()

    changed = changed_paths()
    # Could not determine cleanliness, or a profile input (or symlink target) changed.
    affected = None if changed is None else profile_inputs_affected(changed)
    if changed is None or affected is None or affected:
        return miss()

    print("HIT")
    print(json.dumps(profile))
    return 0


def do_put(profile_file: str) -> int:
    if not CACHE_ROOT:
        print("NO-CACHE")
        return 0
    keys = resolve_keys()
    if keys is None:
        print("NO-CACHE")
        return 0
    root, head, digest = keys

    try:
        with open(profile_file) as f:
            profile = json.load(f)
    except (OSError, ValueError) as exc:
        sys.stderr.write(f"repo-profile-cache: cannot read profile: {exc}\n")
        print("NO-CACHE")  # nothing persisted; keep the stdout contract
        return 0  # degrade — never block the caller

    # Shape guard: the profile must be an object carrying the expected top-level
    # keys. A misbehaving profiler that returns garbage JSON (`{}`, `"oops"`,
    # `[]`, `42`) or a partial/error object must not be cached and then served
    # to every skill as the agnostic profile. Reject it (the caller already has
    # its own derived profile for this run; the next run re-derives).
    if not is_valid_profile(profile):
        sys.stderr.write(
            "repo-profile-cache: profile is not a valid profile object; not caching\n"
        )
        print("NO-CACHE")
        return 0

    # Do not cache a profile derived from a DIRTY tree: it reflects uncommitted
    # edits to profile inputs, yet it would be stored under the clean inputs
    # digest and served as a HIT after those edits are reverted — stale. Only
    # persist a profile that matches the committed profile inputs.
    changed = changed_paths()
    affected = None if changed is None else profile_inputs_affected(changed)
    if changed is None or affected is None or affected:
        sys.stderr.write(
            "repo-profile-cache: profile inputs are dirty; not caching\n"
        )
        print("NO-CACHE")
        return 0

    doc = {
        "profile_schema_version": PROFILE_SCHEMA_VERSION,
        "root_sha": root,
        "head_sha": head,  # provenance only — not part of the HIT key
        "inputs_digest": digest,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
    }

    path = cache_path(root, digest)
    try:
        semantic_dir = os.path.dirname(path)
        os.makedirs(semantic_dir, mode=0o700, exist_ok=True)
        os.chmod(semantic_dir, 0o700)
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
    except Exception as exc:  # never block the caller, whatever the failure
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
