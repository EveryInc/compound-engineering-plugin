---
title: "refactor: Redesign config and worktree-safe storage for compound-engineering"
type: refactor
status: active
date: 2026-03-25
deepened: 2026-03-25
origin: docs/brainstorms/2026-03-25-config-storage-redesign-requirements.md
---

# Redesign Config and Worktree-Safe Storage for Compound Engineering

## Overview

Replace the legacy repo-local config and storage assumptions with a two-scope state model:

- `user_state_dir` for user-level CE state and per-project durable storage
- `repo_state_dir` for repo-local CE config

The work preserves the new `/ce-doctor` + `/ce-setup` dependency flow already added on this branch, but repoints it at the new state contract and migrates durable plugin state out of `.context/compound-engineering/...` and `todos/`.

## Problem Frame

The current plugin still treats repo-local `.context/compound-engineering/...` and legacy `compound-engineering.local.md` as stable runtime contracts. That breaks across git worktrees, leaves setup migration undefined, and leaks old assumptions into docs, tests, and converter fixtures. Main has also removed setup-managed reviewer selection, so this refactor must not recreate that model in a new config file. (see origin: `docs/brainstorms/2026-03-25-config-storage-redesign-requirements.md`)

## Requirements Trace

- R1-R10. Introduce YAML config under `repo_state_dir`, keep compatibility metadata minimal, and make `/ce-setup` the sole migration owner for legacy config.
- R11-R16. Codify the standard config/storage contract section in `AGENTS.md`, keep it cross-agent and low-friction, and centralize migration warnings in core entry skills plus `/ce-doctor`.
- R17-R23. Resolve durable CE state under `user_state_dir/projects/<project-slug>/`, preserve legacy todo reads, and move future durable writes there.
- R24-R31. Expand `/ce-doctor` and `/ce-setup` around the new config/storage contract while preserving the registry-driven dependency flow and fresh scans.
- R32-R33. Remove the old config/storage contract from skills, tests, and converter surfaces without introducing provider-specific paths.

## Scope Boundaries

- Do not reintroduce review-agent selection or review-context storage into plugin-managed config.
- Do not actively migrate historical per-run scratch directories out of repo-local `.context/compound-engineering/...`.
- Do not add garbage collection or pruning for orphaned per-project directories.
- Do not keep `compound-engineering.local.md` as a long-term dual-write format; treat it as legacy migration input only.
- Do not expand this work into project dependency management such as `bundle install`, app setup, or team-authored config workflows beyond laying the repo-local config structure.

## Context & Research

### Relevant Code and Patterns

- [plugins/compound-engineering/skills/ce-setup/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-setup/SKILL.md) now focuses on dependency setup only; review-agent configuration is already gone on main.
- [plugins/compound-engineering/skills/ce-doctor/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-doctor/SKILL.md) and [plugins/compound-engineering/skills/ce-doctor/scripts/check-health](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-doctor/scripts/check-health) already provide the shared diagnostic surface and script-first dependency checks.
- [plugins/compound-engineering/skills/ce-brainstorm/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-brainstorm/SKILL.md), [plugins/compound-engineering/skills/ce-plan/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-plan/SKILL.md), and [plugins/compound-engineering/skills/ce-work/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-work/SKILL.md) are the concrete core entry skills that currently lack any shared migration-warning contract.
- [plugins/compound-engineering/skills/todo-create/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/todo-create/SKILL.md), [plugins/compound-engineering/skills/todo-triage/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/todo-triage/SKILL.md), and [plugins/compound-engineering/skills/todo-resolve/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/todo-resolve/SKILL.md) encode the current todo path contract and legacy-drain semantics.
- [plugins/compound-engineering/skills/ce-review/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-review/SKILL.md), [plugins/compound-engineering/skills/feature-video/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/feature-video/SKILL.md), and [plugins/compound-engineering/skills/deepen-plan/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/deepen-plan/SKILL.md) are the highest-signal per-run artifact consumers still hardcoding `.context/compound-engineering/...`.
- Converter/test surfaces still encode the old contract in [tests/converter.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/converter.test.ts), [tests/codex-converter.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/codex-converter.test.ts), [tests/copilot-converter.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/copilot-converter.test.ts), [tests/pi-converter.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/pi-converter.test.ts), [tests/review-skill-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/review-skill-contract.test.ts), [src/utils/codex-agents.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/src/utils/codex-agents.ts), and [src/converters/claude-to-pi.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/src/converters/claude-to-pi.ts).
- [docs/solutions/skill-design/beta-skills-framework.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/docs/solutions/skill-design/beta-skills-framework.md) is an active solution doc that still references the old config contract, so the doc sweep cannot be limited to tests and plugin README alone.
- Repo-level instruction surfaces live in [AGENTS.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/AGENTS.md) and [plugins/compound-engineering/AGENTS.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/AGENTS.md).

### Institutional Learnings

- [docs/solutions/skill-design/compound-refresh-skill-improvements.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/docs/solutions/skill-design/compound-refresh-skill-improvements.md): keep skill instructions platform-agnostic, avoid hardcoded tool names, and prefer dedicated file tools over shell exploration to reduce prompts.
- [docs/solutions/workflow/todo-status-lifecycle.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/docs/solutions/workflow/todo-status-lifecycle.md): todo status is load-bearing; any path migration must preserve the pending/ready/complete pipeline rather than flattening it.
- [docs/solutions/codex-skill-prompt-entrypoints.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/docs/solutions/codex-skill-prompt-entrypoints.md): copied `SKILL.md` content is often passed through mostly as-is, so skill wording must remain meaningful without target-specific rewriting assumptions.

### External References

- None. The repo already contains sufficient current patterns for this planning pass.

## Key Technical Decisions

- **Keep the state vocabulary to two named directories.** Use `user_state_dir` and `repo_state_dir`, and treat the per-project storage path as the derived subpath `<user_state_dir>/projects/<project-slug>/` rather than naming a third root.
- **Standardize on header plus selective preamble.** Every skill carries one compact config/storage header so the vocabulary and fallback behavior stay consistent. Only independently invocable skills that diagnose config state or read/write durable CE state carry the full config-resolution preamble. Parent skills pass resolved values to spawned agents unless the child is itself independently invocable.
- **Do not revive legacy review config.** `compound-engineering.local.md` is obsolete cleanup input only. Any surviving YAML config should store only real persisted CE state such as minimal compatibility metadata, not values that the runtime can derive deterministically.
- **Keep migration state user-action oriented.** The runtime only needs to distinguish four practical states: no new config yet, legacy/conflicting config that needs migration, stale compatibility contract that requires rerunning `/ce-setup`, and current config. Do not split “migration version” and “setup version” unless execution discovers a real user-visible difference in remediation.
- **Make `/ce-setup` the only writer of migration state.** `/ce-doctor` diagnoses and entry skills warn, but only `/ce-setup` reconciles legacy and new config.
- **Treat path derivation as runtime contract, not persisted config.** Independently invocable config/storage consumers should derive `user_state_dir`, `repo_state_dir`, and the per-project path directly from the standard preamble. `/ce-setup` should not pre-write the derived per-project path just to make later skills work.
- **Treat project identity as a shared-storage guarantee.** The per-project path must resolve from shared repo identity, not current checkout identity. Use `git rev-parse --path-format=absolute --git-common-dir` as the primary identity source so linked worktrees map to the same CE project. Derive the directory slug as `<sanitized-repo-name>-<short-hash>`, where the repo name comes from the basename of `${git_common_dir%/.git}` and the hash comes from the full absolute `git_common_dir`. If git identity cannot be resolved, execution may use a deterministic absolute-path fallback, but the worktree-safe path must be the default contract.
- **Degrade instead of blocking on missing CE state.** Core entry skills should emit a short migration warning and point to `/ce-setup`, but missing CE config or storage should not block the main workflow by default. Full-preamble skills should derive canonical paths when possible and otherwise degrade locally: do not write to legacy or guessed fallback paths, report what could not be persisted, and continue when the main task is still safe to complete.
- **Preserve todo migration semantics, not per-run artifact history.** Todos retain dual-read compatibility during the drain period; per-run artifact directories only change future writes.
- **Keep one active planning chain.** Current operational surfaces should adopt the new contract directly, and earlier setup/todo requirements and plan docs should be folded into this plan rather than left as competing active guidance.
- **Use contract tests for prompt surfaces that now matter operationally.** Existing converter and review contract tests already validate prompt text; add setup/ce-doctor or storage-focused contract coverage rather than relying only on manual inspection.

## Open Questions

### Resolved During Planning

- **Should this plan assume review-agent config still exists?** No. Main has already removed setup-managed reviewer selection, so this refactor must not recreate it.
- **Should the storage vocabulary keep a named project root variable?** No. Use `user_state_dir` and `repo_state_dir`; refer to `<user_state_dir>/projects/<project-slug>/` directly.
- **How is the per-project slug derived?** Use the shared git identity from `git rev-parse --path-format=absolute --git-common-dir`, then derive a human-friendly directory-safe slug as `<sanitized-repo-name>-<short-hash>`. This is intentionally stable across linked worktrees of the same repo and intentionally different across separate clones.
- **Which skills should carry migration warnings?** The concrete warning surfaces are [plugins/compound-engineering/skills/ce-setup/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-setup/SKILL.md), [plugins/compound-engineering/skills/ce-doctor/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-doctor/SKILL.md), [plugins/compound-engineering/skills/ce-brainstorm/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-brainstorm/SKILL.md), [plugins/compound-engineering/skills/ce-plan/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-plan/SKILL.md), [plugins/compound-engineering/skills/ce-work/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-work/SKILL.md), and [plugins/compound-engineering/skills/ce-review/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-review/SKILL.md). Non-core skills should inherit the contract only when they are independently invocable and actually need config or durable storage.
- **Should every old reference be rewritten?** No. Active docs and tests should adopt the new contract. Historical requirements/plans should be preserved for traceability and only annotated when they could plausibly be mistaken for current runtime guidance.
- **Is external research needed?** No. The repo already contains the relevant prompt, converter, and lifecycle patterns.

### Deferred to Implementation

- **Compatibility metadata shape:** The plan assumes a minimal compatibility contract, but execution should finalize whether that is a single revision key or a small structured object once the surrounding prompt text is updated.
- **Shared reference artifact vs. AGENTS-only wording:** The plan assumes `AGENTS.md` is the primary source of truth for the config/storage contract section. Execution can decide whether a separate reference file materially reduces duplication.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
user_state_dir/
  config.yaml                      # optional global defaults / compatibility state if needed
  projects/
    <project-slug>/
      todos/
      ce-review/<run-id>/
      deepen-plan/<run-id>/
      feature-video/<run-id>/
      ...

<repo>/repo_state_dir/
  config.yaml                      # optional tracked repo-level CE config (reserved / future)
  config.local.yaml                # optional machine-local CE config; gitignore this file, not the whole directory

Resolution flow:
1. Resolve repo_state_dir as `<repo>/.compound-engineering`
2. Resolve user_state_dir from the documented fallback chain
3. Derive the per-project path under user_state_dir/projects/<project-slug>/
4. Read config layers only when they exist and the skill needs persisted CE values
5. If compatibility or migration state is stale, route the user to /ce-setup

Project slug:
- identity source: `git rev-parse --path-format=absolute --git-common-dir`
- readable prefix: sanitized basename of `${git_common_dir%/.git}`
- stable suffix: short hash of the full absolute `git_common_dir`
- format: `<sanitized-repo-name>-<short-hash>`

Action model:
- no repo-local CE file yet -> warn only when relevant, `/ce-doctor` explains current state, `/ce-setup` initializes or refreshes if needed
- legacy `compound-engineering.local.md` present -> warn in core entry skills, `/ce-doctor` explains that it is obsolete, `/ce-setup` deletes it after explanation
- new config below required contract -> warn in core entry skills, `/ce-doctor` explains rerun requirement, `/ce-setup` refreshes
- current config -> proceed with no migration warning
- canonical storage can be derived but CE state is incomplete -> proceed using canonical paths and warn when relevant
- canonical storage cannot be derived safely -> do not write to legacy or guessed fallback paths; degrade locally, report what could not be persisted, and direct the user to `/ce-setup`
```

## Implementation Units

- [ ] **Unit 1: Codify the state contract and authoring rules**

**Goal:** Establish `user_state_dir` / `repo_state_dir` terminology and the standard config/storage contract section as a single prompt-authoring contract before touching individual skills.

**Requirements:** R1-R5, R11-R14, R31-R32

**Dependencies:** None

**Files:**
- Modify: [AGENTS.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/AGENTS.md)
- Modify: [plugins/compound-engineering/AGENTS.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/AGENTS.md)
- Modify: [plugins/compound-engineering/README.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/README.md)

**Approach:**
- Update the repo and plugin instruction surfaces so skill authors have one stable vocabulary and one two-tier authoring contract to copy:
  - compact header required in every skill
  - full config-resolution preamble required only in independently invocable config/storage consumers
- Clarify that `repo_state_dir` is for repo-local CE config, `user_state_dir` is for user-level CE state, and the per-project path derives from the latter.
- Define the compact header contents explicitly: state vocabulary, whether the skill resolves config itself or expects caller-passed values, and the rule to warn or route to `/ce-setup` when required config/storage cannot be resolved safely.
- Define the full preamble trigger explicitly: use it only in independently invocable skills that diagnose migration/config state or that read/write durable CE-owned state.
- Define the full preamble contents explicitly:
  - prefer caller-passed resolved values
  - resolve `repo_state_dir`, `user_state_dir`, and the per-project path deterministically
  - read config layers only when needed and when present
  - warn and route to `/ce-setup` when migration or rerun is needed
  - do not write to legacy or guessed fallback paths when canonical storage cannot be derived
  - degrade locally and report what could not be persisted instead of blocking the main task by default
- Keep the guidance capability-first and cross-platform, following current plugin AGENTS conventions.

**Patterns to follow:**
- [plugins/compound-engineering/AGENTS.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/AGENTS.md)
- [docs/solutions/skill-design/compound-refresh-skill-improvements.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/docs/solutions/skill-design/compound-refresh-skill-improvements.md)

**Test scenarios:**
- New skill author can determine where config is read from and where durable project state lives without inferring hidden terminology.
- A skill author can tell from the contract whether a skill needs only the compact header or the full config-resolution preamble.
- A spawned helper/delegate skill can rely on caller-passed resolved values rather than re-reading the config layers.
- The documented config section still makes sense in Claude Code, Codex, Gemini, and copied-skill targets.

**Verification:**
- Both AGENTS files describe the same contract without conflicting path terminology.
- The plan no longer leaves “header vs full preamble” as an implementation-time choice.
- README no longer implies that CE runtime state belongs in repo-local `.context/compound-engineering/...`.

- [ ] **Unit 2: Move `/ce-setup` and `/ce-doctor` to the new config and migration contract**

**Goal:** Make `/ce-setup` own obsolete-file cleanup plus any surviving compatibility migration work, make `/ce-doctor` diagnose compatibility, storage state, and gitignore safety in addition to dependencies, and give core entry skills one consistent migration-warning contract.

**Requirements:** R6-R10, R15-R16, R20, R24-R31

**Dependencies:** Unit 1

**Files:**
- Modify: [plugins/compound-engineering/skills/ce-setup/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-setup/SKILL.md)
- Modify: [plugins/compound-engineering/skills/ce-doctor/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-doctor/SKILL.md)
- Modify: [plugins/compound-engineering/skills/ce-brainstorm/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-brainstorm/SKILL.md)
- Modify: [plugins/compound-engineering/skills/ce-plan/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-plan/SKILL.md)
- Modify: [plugins/compound-engineering/skills/ce-work/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-work/SKILL.md)
- Modify: [plugins/compound-engineering/skills/ce-review/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-review/SKILL.md)
- Modify: [plugins/compound-engineering/skills/ce-doctor/scripts/check-health](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-doctor/scripts/check-health)
- Modify: [plugins/compound-engineering/skills/ce-doctor/references/dependency-registry.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-doctor/references/dependency-registry.md)
- Create: [tests/ce-setup-skill-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/ce-setup-skill-contract.test.ts)
- Create: [tests/ce-doctor-skill-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/ce-doctor-skill-contract.test.ts)
- Create: [tests/entry-skill-config-warning-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/entry-skill-config-warning-contract.test.ts)

**Approach:**
- Replace the current “dependency-only setup” language with a flow that also removes obsolete `compound-engineering.local.md` files after explaining why they are no longer used, and writes machine-local config only if the surviving CE contract truly requires persisted state.
- Extend the doctor script and wrapper skill to report resolved config layers when present, the derived per-project storage path, whether a legacy file still needs cleanup, and repo-local gitignore safety for `.compound-engineering/config.local.yaml` when that file exists or is expected.
- Make `/ce-setup` the remediation path for gitignore safety as well as diagnostics: if `.compound-engineering/config.local.yaml` should exist and is not ignored, `/ce-setup` should explain why the file is machine-local and offer to add the `.gitignore` entry.
- Add a short shared warning contract to the core entry skills so they all route users toward `/ce-setup` from the same states, while full-preamble skills degrade locally rather than blocking or writing to stale paths when canonical CE storage cannot be resolved.
- Keep dependency detection registry-driven and MCP-aware, but update the output model so dependency gaps and config/storage gaps share one diagnostic report.

**Patterns to follow:**
- [plugins/compound-engineering/skills/ce-doctor/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-doctor/SKILL.md)
- [plugins/compound-engineering/skills/ce-doctor/scripts/check-health](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-doctor/scripts/check-health)
- [tests/review-skill-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/review-skill-contract.test.ts)

**Test scenarios:**
- Legacy `compound-engineering.local.md` exists; `/ce-doctor` reports obsolete-file cleanup needed and `/ce-setup` becomes the next action.
- Legacy file and new repo-local CE files both exist; `/ce-doctor` reports that the legacy file is obsolete and `/ce-setup` deletes it without attempting a semantic merge.
- New config exists but compatibility metadata is stale; `/ce-doctor` asks for rerun without relying on raw plugin semver.
- `.compound-engineering/config.local.yaml` is required but not gitignored; `/ce-doctor` reports the issue and `/ce-setup` offers to add the `.gitignore` entry.
- `ce:brainstorm` and `ce:plan` warn and continue because they can still read or write durable docs safely without project-state writes.
- `ce:work` and `ce:review` share the same warning vocabulary, derive canonical paths when possible, and otherwise report degraded persistence instead of writing to legacy paths.
- Dependency checks still distinguish CLI-present, MCP-present, and missing states.

**Verification:**
- `/ce-setup` prompt no longer implies a legacy markdown config target.
- `/ce-doctor` output contract covers config/storage state in addition to dependency health.
- `/ce-doctor` checks `.compound-engineering/config.local.yaml` gitignore safety rather than the old repo-local storage paths.
- `/ce-setup` can remediate `.compound-engineering/config.local.yaml` gitignore safety instead of only surfacing the problem.
- Core entry skills no longer invent their own migration wording or remediation instructions.
- Canonical per-project storage is derivable without `/ce-setup` having to pre-write that path into config.
- New contract tests pin the migration/reporting language so future edits do not regress it.

- [ ] **Unit 3: Move the todo system to per-project durable storage with legacy reads**

**Goal:** Re-home the durable todo lifecycle under `<user_state_dir>/projects/<project-slug>/todos/` while preserving the existing legacy-drain behavior from `todos/` and `.context/compound-engineering/todos/`.

**Requirements:** R17-R23, R31-R32

**Dependencies:** Unit 2

**Files:**
- Modify: [plugins/compound-engineering/skills/todo-create/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/todo-create/SKILL.md)
- Modify: [plugins/compound-engineering/skills/todo-triage/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/todo-triage/SKILL.md)
- Modify: [plugins/compound-engineering/skills/todo-resolve/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/todo-resolve/SKILL.md)
- Modify: [plugins/compound-engineering/skills/ce-review/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-review/SKILL.md)
- Modify: [plugins/compound-engineering/skills/test-browser/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/test-browser/SKILL.md)
- Modify: [plugins/compound-engineering/skills/test-xcode/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/test-xcode/SKILL.md)
- Create: [tests/todo-storage-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/todo-storage-contract.test.ts)

**Approach:**
- Update `todo-create` to treat the per-project path under `user_state_dir` as canonical, but keep both legacy directories in the read/ID-generation story until the drain period ends.
- Keep the status lifecycle unchanged: `pending` and `ready` remain load-bearing, only the storage location changes.
- Update all todo-producing skills to defer to `todo-create` conventions instead of hardcoding canonical paths inline.

**Patterns to follow:**
- [docs/solutions/workflow/todo-status-lifecycle.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/docs/solutions/workflow/todo-status-lifecycle.md)
- [plugins/compound-engineering/skills/todo-create/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/todo-create/SKILL.md)

**Test scenarios:**
- New todo creation writes to the per-project path under `user_state_dir`.
- Next-ID generation avoids collisions when IDs exist across both legacy directories and the new canonical path.
- `todo-triage` and `todo-resolve` still find pending/ready items from both legacy locations.
- `ce:review`, `test-browser`, and `test-xcode` continue to create actionable todos without embedding stale paths.

**Verification:**
- Todo contract tests prove canonical-write + legacy-read behavior.
- No todo-producing skill still claims `.context/compound-engineering/todos/` is the long-term canonical location.

- [ ] **Unit 4: Move per-run artifact skills to derived per-project paths**

**Goal:** Repoint per-run artifact instructions from repo-local `.context/compound-engineering/...` to `<user_state_dir>/projects/<project-slug>/<workflow>/...` without attempting historical migration.

**Requirements:** R17-R23, R31-R32

**Dependencies:** Unit 2

**Files:**
- Modify: [plugins/compound-engineering/skills/ce-review/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-review/SKILL.md)
- Modify: [plugins/compound-engineering/skills/deepen-plan/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/deepen-plan/SKILL.md)
- Modify: [plugins/compound-engineering/skills/feature-video/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/feature-video/SKILL.md)
- Modify: [tests/review-skill-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/review-skill-contract.test.ts)
- Create: [tests/storage-skill-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/storage-skill-contract.test.ts)

**Approach:**
- Update the run-artifact instructions to use the derived per-project path terminology rather than hardcoded `.context/compound-engineering/...`.
- Keep report-only prohibitions path-agnostic where possible so the policy survives future directory changes.
- Do not add active migration logic for old artifact directories; simply change future-write instructions.

**Patterns to follow:**
- [plugins/compound-engineering/skills/ce-review/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-review/SKILL.md)
- [tests/review-skill-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/review-skill-contract.test.ts)

**Test scenarios:**
- `ce:review` contract tests still enforce artifact-writing rules, but against the new path vocabulary.
- `feature-video` and `deepen-plan` examples no longer require repo-local `.context/compound-engineering/...`.
- Report-only guidance still forbids externalized writes regardless of exact path wording.

**Verification:**
- The highest-signal per-run artifact skills no longer treat `.context/compound-engineering/...` as their runtime contract.
- Storage contract tests pin the new path expectations for future edits.

- [ ] **Unit 5: Remove the old contract from converter and compatibility surfaces**

**Goal:** Update converter instructions, fixtures, and contract tests so installed targets no longer assert `compound-engineering.local.md`, `todos/`, or `.context/compound-engineering/...` as the stable CE contract.

**Requirements:** R31-R32

**Dependencies:** Units 1-4

**Files:**
- Modify: [src/utils/codex-agents.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/src/utils/codex-agents.ts)
- Modify: [src/converters/claude-to-pi.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/src/converters/claude-to-pi.ts)
- Modify: [docs/solutions/skill-design/beta-skills-framework.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/docs/solutions/skill-design/beta-skills-framework.md)
- Modify: [tests/converter.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/converter.test.ts)
- Modify: [tests/codex-converter.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/codex-converter.test.ts)
- Modify: [tests/copilot-converter.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/copilot-converter.test.ts)
- Modify: [tests/pi-converter.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/pi-converter.test.ts)

**Approach:**
- Replace literal assertions about legacy config/todo paths with assertions about the new state vocabulary or about skill text that remains platform-agnostic after conversion.
- Update PI/Codex helper text so converted skill guidance does not teach stale todo/config locations.
- Update active solution docs that still present the old runtime contract as current guidance, while leaving clearly historical plan/requirements docs intact unless they need a brief superseded note.
- Keep path rewriting logic minimal; if the new wording is sufficiently target-agnostic, prefer updating fixtures/tests over adding new target-specific rewriting behavior.

**Patterns to follow:**
- [docs/solutions/codex-skill-prompt-entrypoints.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/docs/solutions/codex-skill-prompt-entrypoints.md)
- Existing converter tests in [tests/converter.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/converter.test.ts)

**Test scenarios:**
- Converted command/skill bodies no longer assert `compound-engineering.local.md` as the canonical config target.
- PI conversion no longer describes todo workflows as `todos/ + /skill:todo-create`.
- Copilot/Codex tests still prove target-specific rewriting where that target genuinely owns a path transformation.

**Verification:**
- `bun test` passes for converter and skill-contract suites.
- Active docs that describe current CE runtime behavior no longer teach `compound-engineering.local.md` or repo-local durable storage as the live contract.
- No test fixture still encodes the old CE runtime contract as expected behavior.

## System-Wide Impact

- **Interaction graph:** `/ce-setup` becomes the only migration writer; `/ce-doctor` and core workflow skills become migration-state readers; todo/review/media/planning skills become consumers of the derived per-project storage path.
- **Error propagation:** Incorrect compatibility metadata or repo-identity resolution can cause stale-path fallbacks, false “rerun setup” warnings, or storage fragmentation across worktrees.
- **State lifecycle risks:** Todo ID collisions, stale obsolete-file cleanup behavior, and accidental commits of `.compound-engineering/config.local.yaml` are the main durable-state hazards.
- **User-experience risks:** If warning wording drifts between entry skills, users will receive contradictory guidance about whether they can proceed or must rerun `/ce-setup`.
- **API surface parity:** Converter outputs and copied skills must continue to make sense across Claude Code, Codex, Copilot, PI, and other pass-through targets without assuming one platform’s shell/tool naming.
- **Integration coverage:** Unit tests alone will not prove prompt-contract correctness; contract tests plus the converter suite need to cover the text surfaces that now encode the runtime model.

## Risks & Dependencies

- Legacy `compound-engineering.local.md` cleanup is intentionally destructive; the setup messaging has to be explicit so users understand the file is obsolete and no longer carries supported CE state.
- The path derivation contract depends on stable project slug resolution across worktrees; if that is underspecified, users can end up with split project state.
- The entry-skill warning contract spans multiple high-traffic workflows; if the copy is not kept deliberately short, this refactor could add prompt bloat to the plugin's most-used surfaces.
- Root and plugin AGENTS changes are part of the runtime contract now; if they drift from skill bodies, future skills will regress into mixed terminology and shell-heavy config loading.
- The converter/test cleanup depends on the final wording chosen for the new state vocabulary. Churn here is likely if execution changes the vocabulary again.

## Documentation / Operational Notes

- Update [plugins/compound-engineering/README.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/README.md) when setup/ce-doctor/storage behavior changes.
- Run `bun test` because the converter and contract-test surfaces are directly affected.
- Run `bun run release:validate` because skill descriptions and plugin docs are being updated.
- Do not hand-edit release-owned versions or changelogs.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-25-config-storage-redesign-requirements.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/docs/brainstorms/2026-03-25-config-storage-redesign-requirements.md)
- Related code: [plugins/compound-engineering/skills/ce-doctor/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-doctor/SKILL.md)
- Related code: [plugins/compound-engineering/skills/ce-setup/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/plugins/compound-engineering/skills/ce-setup/SKILL.md)
- Related tests: [tests/review-skill-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/freetown-v1/tests/review-skill-contract.test.ts)
