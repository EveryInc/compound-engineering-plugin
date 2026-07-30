---
title: Sync Upstream PR #17 (Scope-Narrowed) - Plan
type: chore
date: 2026-07-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Sync Upstream PR #17 (Scope-Narrowed) - Plan

> Upstream PR: https://github.com/boltcoder/compound-engineering-fe-plugin/pull/17
> Brings 80 upstream commits (`1129`..`1236`, head `3422ea0`) into this FE fork (`2e1875d`, v3.21.3).
> Strategy: merge upstream preserving per-commit history, then one scope-narrowing commit that drops what's outside FE-fork scope.

## Goal Capsule

- **Objective:** Land the 80 upstream commits from PR #17 while keeping the FE-fork's scope boundary intact: no new skills, no `src/` changes, adopt upstream's removal of the shared repo-profile-cache. Keep the cross-model/elevation/elevation-dispatch scripts because the kept skills load them.
- **Authority:** Owner-directed. Fork is a frontend-scoped fork of `EveryInc/compound-engineering-plugin`; AGENTS.md claims converter/marketplace/release infra removed (aspirational; `src/` still present).
- **Execution profile:** `git merge` + scope commit. Verified with `bun test` and `bun run plugin:validate`.
- **Stop conditions:** Any test red after the scope commit is a signal of a stale reference, not a passable gate. Do not paper over failures; each points at a `repo-profile-cache` invocation or removed-skill file still referenced.
- **Cardinal rule:** Preserve upstream per-commit history so future syncs are `git fetch upstream && git merge upstream/main`. One reviewable scope commit documents exactly what was excluded.

---

## Decision Log

| Item | Decision | Rationale |
|---|---|---|
| Strategy | Merge + scope commit | Preserves upstream history; future syncs stay trivial; one reviewable exclusion commit |
| New skills (`ce-handoff`, `ce-sweep`, `ce-product-pulse`, `ce-promote`, `ce-proof`, `ce-riffrec-feedback-analysis`) | Drop all | FE-fork scope; AGENTS.md says 24 skills |
| `src/` (converters, utils, release, targets) | Keep fork's current state; discard upstream's `src/` changes | Fork's `src/` is its own layout; upstream's converter/marketplace path is out of scope |
| Shared repo-profile-cache (commit #29 `fix(grounding): remove shared repo profile cache`) | Adopt upstream removal | Owner decision; AGENTS.md's cache section becomes stale and must be updated |
| Cross-model/elevation scripts (`peer-job-runner.py`, `elevation-dispatch.sh`, `cross-model-*.sh`, `unit-workspace*.py`) | Keep | Load-bearing infra for kept skills (see dependency map); removing them forfeits the fix commits |

---

## Cross-Model Script Dependency Map

The PR updates SKILL.md for skills being kept to load scripts it adds. These are infra for existing skills, not new skills — removing them forfeits the fix commits that motivate the sync.

| Skill | References added by PR | Loaded as |
|---|---|---|
| `ce-code-review` | `references/cross-model-review.md`, `references/cross-model-eval.md`, `scripts/cross-model-adversarial-review.sh`, `scripts/peer-job-runner.py` | Stage 3d adversarial routing (#26, #39, #55, #59-64) |
| `ce-pov` | `references/cross-model-panel.md`, `scripts/cross-model-pov.sh`, `scripts/peer-job-runner.py` | Panel feature (#12, #17, #19, #24, #25, #32, #43, #68) |
| `ce-work` | `references/cross-model-execution.md`, `references/cross-model-work-eval.md`, `scripts/cross-model-work.sh`, `scripts/peer-job-runner.py`, `scripts/unit-workspace*.py` | Cross-model engine (#52) + fix (#77) |
| `ce-plan` | `references/reasoning-elevation.md`, `references/settled-decisions.md`, `scripts/elevation-dispatch.sh`, `scripts/peer-job-runner.py` | Model-elevation (#57) + settled-decisions (#5) |
| `ce-brainstorm` | `references/reasoning-elevation.md`, `references/settled-decisions.md`, `scripts/elevation-dispatch.sh`, `scripts/peer-job-runner.py` | Elevation (#57) + brainstorm fixes (#20, #22, #23, #58) |

---

## Execution Plan

### Pre-conditions

- On `main`, clean tree, at `2e1875d` (v3.21.3). Confirmed.
- Fork-only skills to preserve (untouched by PR): `ce-fix-bugs`, `ce-jira-update`, `ce-polish`, plus their tests and `antigravity*`/`cline*` tests.
- No `upstream` remote configured today.

### Step 1 - Wire upstream + sync branch

```
git remote add upstream https://github.com/EveryInc/compound-engineering-plugin.git
git fetch upstream
git checkout -b sync/upstream-pr17 main
```

Alternative (no persistent remote): `git fetch origin pull/17/head:sync-upstream-pr17` and merge that ref. The persistent `upstream` remote is recommended for future syncs.

### Step 2 - Merge and resolve conflicts

```
git merge upstream/main   # or: git merge 3422ea0
```

Expected conflicts and resolution:

- **`AGENTS.md`** - keep fork content as base. Because #29 was adopted, delete the "## Shared Repo-Grounding Profile Cache" section (it documents the cache as load-bearing - now removed). Replace with a one-liner: "The FE-fork does not carry the shared repo-profile cache; skills derive project context fresh." Update any `repo-profile-cache` / `PROFILE_SCHEMA_VERSION` / byte-duplicated-asset references. Reconcile any upstream prose-rule additions.
- **`README.md`, `package.json`, `plugin.json`, `.claude-plugin/plugin.json`, `CLAUDE.md`, `.gitignore`** - keep fork values (name `compound-engineering-fe-plugin`, homepage `boltcoder/compound-engineering-fe-plugin`, paths). Take only upstream's substantive inventory copy if relevant, re-checking the count after Step 3 drops.
- **`.github/workflows/ci.yml`** - keep fork's. Upstream runs converter/marketplace/repo-profile-cache tests being deleted in Step 3; taking theirs guarantees CI red. Trim test references in Step 3.
- **`docs/skills/README.md`** - keep structure; drop rows for the 6 new skills after Step 3.

### Step 3 - Scope-narrowing commit

One commit `chore(scope): drop upstream changes outside FE-fork scope`:

**3a. Drop 6 new skills + their docs/plans/tests:**
```
git rm -r skills/ce-handoff skills/ce-sweep  # verify each dir was added first
git rm docs/skills/ce-handoff.md docs/skills/ce-sweep.md \
       docs/skills/ce-product-pulse.md docs/skills/ce-promote.md \
       docs/skills/ce-proof.md docs/skills/ce-riffrec-feedback-analysis.md
git rm docs/plans/2026-07-16-001-feat-ce-handoff-session-continuity-plan.md
git rm tests/skills/ce-handoff-contract.test.ts tests/skills/ce-sweep-analyzer-parity.test.ts 2>/dev/null || true
```
Update `docs/skills/README.md` + `README.md` skill inventory: remove the 6 dropped rows; recompute count by `ls skills/ | wc -l`.

**3b. Revert upstream's `src/` changes (keep fork's current `src/`):**
```
git checkout main -- src/ scripts/codex-dev.ts
git rm -f scripts/codex-dev.ts 2>/dev/null || true   # drop duplicate root copy if merge added it
```
PR adds root `scripts/codex-dev.ts` and modifies `src/converters/{droid,kiro,pi,copilot}.ts`, `src/utils/{codex-content,frontmatter,slash-command}.ts`, `src/dev/codex-dev.ts`. `git checkout main --` restores fork versions.

**3c. Adopt #29 - remove the shared repo-profile-cache:**
```
git rm skills/ce-{pov,brainstorm,code-review,compound,explain,debug,ideate,optimize,plan}/references/repo-profile-cache.md
git rm skills/ce-{pov,brainstorm,code-review,compound,explain,debug,ideate,optimize,plan}/scripts/repo-profile-cache.py
git rm tests/repo-profile-cache.test.ts tests/repo-profile-cache-parity.test.ts
```
Then patch each affected SKILL.md to remove its cache get/put invocation block (each has an inline `SKILL_DIR`-anchored `python .../repo-profile-cache.py get|put` call). Cleanest path: pull upstream's #29 SKILL.md edits that already removed those calls - verify each skill's PR-head SKILL.md no longer invokes the cache before finalizing, rather than hand-editing 8 files.

**3d. Drop converter/marketplace-only test additions:**

Review `tests/` added by PR - keep cross-model/peer/elevation (infra for kept skills), drop tests that target only removed converters/specs. Where a test's PR modification targets upstream-only converter behavior but the fork kept its own `src/converters/`, restore fork version: `git checkout main -- tests/<file>`.

### Step 4 - Verify

```
bun install                              # deps unchanged in scope, but confirm
bun test                                 # expect red on stale cache/cross-model tests
bun run plugin:validate                  # if claude CLI present
git diff main..sync/upstream-pr17 --stat # eyeball the shape
ls skills/ | wc -l                       # confirm skill count matches expectation
```

Red tests = signal: each failure points at a cache-invocation line or removed-skill file still referenced in Step 3. Do not paper over them.

### Step 5 - Open PR

```
gh pr create --base main --head sync/upstream-pr17 \
  --title "Sync upstream compound-engineering (PR #17 scope-narrowed)" \
  --body "..."
```

PR body lists: 80 upstream commits merged; 6 new skills dropped; `src/` unchanged from fork; shared repo-profile-cache removed (adopted #29); cross-model/elevation scripts kept (load-bearing for ce-code-review/ce-pov/ce-plan/ce-work/ce-brainstorm); AGENTS.md cache section removed.

---

## Risks / Watch-Items

- **AGENTS.md drift** - after adopting #29, search AGENTS.md for `repo-profile-cache` / `PROFILE_SCHEMA_VERSION` / `byte-duplicated` / `repo-profiler` - every mention must go or be rewritten. The section also references the per-skill `repo-profiler.md` persona; check whether it still has a purpose post-removal.
- **SKILL.md cache calls** - 8 skills invoked the cache inline. Confirm upstream's #29 also patched those SKILL.md calls out (not just deleted the files). If not, hand-remove each invocation block.
- **Test count** - `tests/repo-profile-cache-parity.test.ts` and `repo-profile-cache.test.ts` go; but `tests/skills/ce-*-cross-model-routes.test.ts` stay (cross-model is kept).
- **Future syncs** - with `upstream` remote added, next sync is `git fetch upstream && git merge upstream/main`. This is the main upside of merge-over-cherry-pick.
