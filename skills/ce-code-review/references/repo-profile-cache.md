# Shared Repo-Grounding Profile Cache

Read this when a repo-grounding skill needs the question-agnostic **project profile** (stack, deps, conventions, structure). The profile is derived once and reused within a session and across sessions, skills, and commits whose **profile inputs are unchanged** — only the *question-specific* grounding for the current run is ever re-derived.

This file is **byte-duplicated** into every consuming skill (the plugin has no cross-skill import mechanism). All copies must stay identical; `tests/repo-profile-cache-parity.test.ts` enforces it. The deterministic cache I/O lives in the co-located `scripts/repo-profile-cache.py`; the derivation-on-miss is done by the co-located `references/agents/repo-profiler.md` persona.

## What is cached (the agnostic profile)

A single JSON object, versioned by `profile_schema_version`:

- **Stack & versions** — languages, major frameworks + versions, build/test tooling.
- **Dependency surface** — manifest + lockfile paths, top-level dependencies, project license + dependency licenses.
- **Topology** — monorepo/workspace map, deployment model, API styles, data stores, module layout.
- **Conventions & instruction files** — paths + digests of the *root* `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`/`ARCHITECTURE.md`/`README.md`/`CONTRIBUTING.md`/`STRATEGY.md`.
- **Vocabulary** — `CONCEPTS.md` canonical terms.

## What is NOT cached (always re-globbed fresh)

Never read from the cache — recompute every run:

- The `docs/solutions/` enumeration (a new learning, even uncommitted, must be visible — re-globbing it is ~free and the match reads files fresh anyway).
- Subdirectory-scoped instruction files (area-scoped `CLAUDE.md`/`AGENTS.md`).
- All question-specific grounding: a candidate's call-sites/footprint, prior-decision matches, feature patterns, git history of touched files, tracker/PR activity, external research.

## Cache location & key

```
/tmp/compound-engineering/repo-profile/<root-sha>/<inputs-digest>.json
```

- `<root-sha>` = lexicographically-first `git rev-list --max-parents=0 HEAD` — the repo identity (stable, shared across worktrees and clones).
- `<inputs-digest>` = sha256 over (1) every committed blob **path** at `HEAD` (tree shape — so a new module/directory invalidates topology), (2) `(path, blob-sha)` for every **profile-input** file (filtered by the helper's `is_profile_input`), (3) for profile-input **symlinks**, the final in-repo regular blob after following the full symlink chain, and (4) `(path, commit-sha)` for every **gitlink** (submodule) entry. Content edits to existing non-input files keep the same entry; adding/removing any path, changing a profile-input's content (including through a symlink chain), or moving a submodule pointer does not.

Two checkouts whose committed path set and profile-input contents match share the same entry, even across different `HEAD` SHAs. Lookup hashes those; on a hit, only this one file is read.

## Protocol — how a skill uses it

Invoke the helper via the `SKILL_DIR` anchor (set `SKILL_DIR` to the absolute path of the directory containing the SKILL.md you just read; the Bash tool's cwd is the user's project, not the skill dir):

```bash
SKILL_DIR="<absolute path of this skill's directory>";
python3 "$SKILL_DIR/scripts/repo-profile-cache.py" get
```

`get` prints exactly one of:

- `HIT` then the profile JSON on the following lines → load it as the agnostic profile; skip derivation.
- `MISS` then a write-path on the next line → dispatch the `repo-profiler` persona to derive the profile, write its JSON output to a file, then persist it. This `put` runs after the profiler, so it is a **separate Bash-tool call** from the `get` above — shell variables do not persist between calls, so **re-set `SKILL_DIR` in the same command**:
  ```bash
  SKILL_DIR="<absolute path of this skill's directory>";
  python3 "$SKILL_DIR/scripts/repo-profile-cache.py" put <profile-json-file>
  ```
- `NO-CACHE` → no git repo or no writable cache. Derive the profile fresh for this run and **skip** `put` (nothing to persist).

In all three cases, after the agnostic profile is in hand, run **this skill's question-specific grounding fresh** on top of it.

## Freshness (delta-aware)

A cached entry is a `HIT` only when its `inputs_digest` matches the current committed profile inputs, its `profile_schema_version` matches, and **no profile-input path** (nor the resolved in-repo target of a profile-input symlink) is dirty or newly-added. Freshness is checked with `git status --porcelain --untracked-files=all`, so untracked (`??`) new inputs invalidate too. The profile-input set is a conservative **superset** of every file the schema derives from — dependency manifests + lockfiles (any depth), license, root instruction/doc files, `CONCEPTS.md`/`STRATEGY.md`, topology sources (`Dockerfile`, `.github/workflows/`, `.cursor/rules`). A dirty source file, `docs/plans/*`, or other non-input path does **not** invalidate. Completeness of this set is the cardinal-rule safety requirement: over-invalidating costs a re-derive; under-invalidating would serve a stale profile.

## Degradation

The cache is an optimization, never a correctness dependency. Outside a git repo, with no writable `/tmp`, or on an unreadable/malformed entry, the helper returns `NO-CACHE`/`MISS` (exit 0) and the skill derives fresh. It never blocks and never serves a profile it cannot prove fresh. And if the helper *invocation itself* fails — a non-zero exit, empty output, or an unresolved `SKILL_DIR` so the script isn't found — treat it exactly like `NO-CACHE`: derive the profile fresh this run and proceed. Never stall waiting on the cache.
