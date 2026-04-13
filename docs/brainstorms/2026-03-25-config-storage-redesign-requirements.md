---
date: 2026-03-25
topic: config-storage-redesign
---

# Config and Worktree-Safe Storage Redesign

## Problem Frame

The current branch improves `/ce-doctor` and `/ce-setup`, but it still assumes two foundations that do not hold up:

1. Plugin state lives inside the repo under `.context/compound-engineering/` or `todos/`, which breaks across git worktrees and Conductor-managed parallel checkouts.
2. Older plugin flows wrote `compound-engineering.local.md`, and parts of the repo still reference it, but main no longer treats review-agent selection as an active setup concern. Any new repo/user-level config system should not revive that removed model.

This work is broader than dependency setup alone. It needs one coherent model for:

- user-level defaults
- repo-level overrides
- machine-local overrides
- worktree-safe durable storage
- setup and doctor behavior
- skill instructions, docs, and tests that currently hardcode `compound-engineering.local.md` or `.context/compound-engineering/...`

Terminology for this document:

- `user_state_dir` = the user-level Compound Engineering directory, defaulting to `~/.compound-engineering`
- `repo_state_dir` = the repo-local Compound Engineering directory at `<repo>/.compound-engineering`
- per-project storage path = `<user_state_dir>/projects/<project-slug>/`

## Consolidation Notes

This document is the active consolidated requirements doc for the setup, config, and worktree-safe storage work. It replaces the earlier setup-dependency-management and todo-path-consolidation brainstorm docs and incorporates the external worktree-safe storage draft from the parallel `gwangju` workspace.

It changes the direction of two earlier efforts:

- The dependency-management work remains in scope, but `/ce-setup` can no longer write `compound-engineering.local.md`; any surviving YAML config is optional and minimal.
- The todo-path consolidation work is superseded by home-directory storage. The dual-read migration logic still matters for durable todo files, but `.context/compound-engineering/todos/` is no longer the end state.

## Requirements

- R1. Any new plugin config introduced by this work must use plain YAML files under `repo_state_dir`, specifically `config.yaml` and `config.local.yaml`. Config is data, not a markdown document.
- R2. Config must support a three-layer cascade with `local > project > global` precedence and first-found wins per key:
  - `<user_state_dir>/config.yaml`
  - `<repo_state_dir>/config.yaml`
  - `<repo_state_dir>/config.local.yaml`
- R3. The config model must persist only active plugin-level behavior that truly needs durable storage, starting with minimal compatibility metadata if such metadata is still needed after planning. Deterministic path derivation under `user_state_dir` is runtime logic, not config data.
- R4. The new config model must not reintroduce removed review-agent selection or review-context storage behavior. Reviewer selection is now automatic in `/ce:review`, and project-specific guidance belongs in `CLAUDE.md` or `AGENTS.md`, not plugin-managed config files.
- R5. The YAML config shape may reorganize keys (for example, grouping review-related settings under a `review` object), but any such reshape must be applied consistently across all skills, docs, and tests that read or write config.
- R6. The new config format must include only the minimum compatibility metadata needed for the plugin to decide whether `/ce-setup` must be run again.
- R7. Compatibility checks must not rely only on plugin semver. If explicit versioning is needed, prefer a single setup or config contract revision that answers the practical question "is rerunning `/ce-setup` required?" Optional diagnostic metadata may be stored separately, but the requirements should not assume multiple independent version counters unless planning proves they are necessary.
- R8. `/ce-setup` must treat legacy `compound-engineering.local.md` as obsolete. If the surviving CE contract still requires machine-local persisted state, `/ce-setup` may write `repo_state_dir/config.local.yaml`; otherwise it should not invent stored values just to mirror deterministic runtime path derivation. Because the legacy file no longer contains any valid first-class CE settings, `/ce-setup` should explain that it is obsolete and delete it as part of cleanup rather than attempting a semantic migration.
- R9. `/ce-setup` must be the canonical place that executes config cleanup and any remaining compatibility migration. This flow should be safe to re-run, and it should handle at least these cases:
  - legacy `compound-engineering.local.md` exists and no repo-local CE files exist yet
  - legacy `compound-engineering.local.md` exists alongside `repo_state_dir/config.local.yaml`
  - no repo-local CE files exist yet, but deterministic storage derivation still works
- R10. When legacy `compound-engineering.local.md` and new repo-local CE files both exist, the new CE contract is authoritative. `/ce-setup` should explain that the legacy file is obsolete and delete it rather than attempting to merge removed settings back into the new model.

- R11. `AGENTS.md` must define the config/storage contract section as a standard skill authoring criterion: every skill should include the approved compact header even if that specific skill does not currently consume config values, so the contract stays consistent across the plugin.
- R12. The standard config section and its instructions must be coding-agent cross-compatible. They must not assume Claude Code-only or Codex-only tool names, interaction patterns, or permission models.
- R13. The standard config section must be written to optimize for speed and execution reliability:
  - prefer a minimal number of reads/tool calls
  - avoid unnecessary shell fallbacks once config is established
  - reduce permission prompts where the platform makes that possible
  - keep wording concise so agents are more likely to execute it correctly
- R14. Independently invocable skills that depend on config or storage must use one standard full preamble that:
  - prefers caller-passed resolved values
  - deterministically resolves `repo_state_dir`, `user_state_dir`, and the per-project storage path
  - reads local, project, and global YAML layers with the same precedence rules when those layers exist
  - warns and routes to `/ce-setup` when migration or rerun is needed
  - continues with degraded behavior rather than writing to legacy or guessed fallback paths when canonical config or storage cannot be resolved safely
  `AGENTS.md` must also define and enforce the delegation rule: when a parent skill spawns an agent that needs configuration or storage values, the parent skill must pass the resolved values into the agent prompt rather than making the spawned agent re-resolve them unless that agent is independently invocable.
- R15. Migration warning behavior must be centralized rather than duplicated across the entire plugin. A small set of core entry skills, including `/ce-setup`, `/ce-doctor`, `/ce:brainstorm`, `/ce:plan`, `/ce:work`, and `/ce:review`, must detect legacy-only or conflicting config states and direct the user to run `/ce-setup` to migrate. Non-core skills should not each implement their own migration flow.
- R16. Core entry skills and `/ce-doctor` must use the compatibility metadata to distinguish the actionable states that matter to the user:
  - no new config exists yet
  - legacy-only or conflicting config exists and `/ce-setup` must migrate it
  - new config exists but is below the required contract and `/ce-setup` must be rerun
  - config is current and no rerun is needed

- R17. All durable plugin storage must resolve outside the repo tree under `user_state_dir`, with this fallback chain for determining `user_state_dir`:
  - `$COMPOUND_ENGINEERING_HOME`
  - `$XDG_DATA_HOME/compound-engineering` when `XDG_DATA_HOME` is set
  - `~/.compound-engineering`
- R18. Durable per-project storage must live under `<user_state_dir>/projects/<project-slug>/`, where the slug is deterministic and stable across worktrees of the same repo.
- R19. Project identity must resolve from shared repo identity so all worktrees for the same repo share the same per-project storage path under `user_state_dir`. The primary identity source is `git rev-parse --path-format=absolute --git-common-dir`, and the directory-safe slug should be derived as `<sanitized-repo-name>-<short-hash>`. Non-git contexts must have a deterministic fallback.
- R20. The standard full preamble must be sufficient for independently invocable skills to deterministically resolve the canonical per-project storage path without requiring `/ce-setup` to pre-write that path into config.
- R21. Skills that read or write durable plugin state must use the per-project storage path under `user_state_dir` instead of repo-local `.context/compound-engineering/...` or `todos/` paths.
- R22. Durable todo files must retain legacy read compatibility from repo-local `todos/` and `.context/compound-engineering/todos/` until they drain naturally. New todo writes must go only to `<user_state_dir>/projects/<project-slug>/todos/`.
- R23. Per-run scratch and run-artifact directories do not need active migration from repo-local `.context/compound-engineering/...`; new writes move to `<user_state_dir>/projects/<project-slug>/<workflow>/...`.

- R24. `/ce-doctor` must remain a standalone entry point and expand from dependency/env checks to also report config and storage health:
  - resolved config layers
  - resolved `user_state_dir`
  - resolved `repo_state_dir`
  - resolved per-project storage path
  - presence of legacy `compound-engineering.local.md`
  - whether no repo-local CE file exists yet
  - whether setup attention is needed because a legacy file still exists or compatibility metadata is stale
  - whether rerunning setup is required because the stored compatibility metadata is below the required contract
  - whether `.compound-engineering/config.local.yaml` is safely gitignored
- R25. `/ce-doctor` must continue to use a centralized dependency registry that lists known CLIs, MCP-backed capabilities, related environment variables, install guidance, tiering, and the skills/agents that depend on them.
- R26. `/ce-doctor` remains informational only. It reports dependency, env, config, and storage status, but it does not install tools or mutate user config beyond diagnostics.
- R27. `/ce-setup` must continue to include the dependency and environment flow already designed in this branch, but its output and guidance must target the new storage contract and any surviving YAML config state without inventing persisted path values that skills can derive deterministically.
- R28. If `.compound-engineering/config.local.yaml` is part of the surviving CE contract and is not safely gitignored, `/ce-setup` must explain why that file is machine-local and offer to add an appropriate `.gitignore` entry for it.
- R29. `/ce-setup` must present missing installable dependencies by tier, offer installation one item at a time with user approval, verify each install, and prompt for related environment variables at the appropriate point in the flow.
- R30. For dependencies with both MCP and CLI paths, diagnostics and setup must detect MCP availability first, then CLI availability, and only offer CLI installation if neither satisfies the dependency.
- R31. Dependency and env checks must always scan fresh on each run rather than relying on persisted installation state.

- R32. Skill content, docs, and tests must stop treating `.context/compound-engineering/...` and `compound-engineering.local.md` as the stable contract.
- R33. The config and storage contract must stay tool-agnostic across Claude Code, Codex, Gemini CLI, OpenCode, Copilot, and Conductor worktrees. This work should not introduce new provider-specific config paths.

## Success Criteria

- A user can run `/ce-setup` in the main checkout or any worktree and end up with the same resolved project storage location.
- Independently invocable skills that need CE state can derive the same canonical per-project storage path without requiring `/ce-setup` to pre-write that path.
- Users on the legacy config format get a clear migration path through `/ce-setup` without needing every individual skill to invent its own migration behavior.
- Core skills and `/ce-doctor` can determine whether `/ce-setup` must run again without relying on raw plugin semver comparisons or multiple unnecessary version counters.
- Todos and other durable workflow artifacts remain available across worktrees without symlinks, git hooks, or manual copying.
- Existing users with repo-local todo files do not lose access to unresolved work.
- Legacy `compound-engineering.local.md` files are cleaned up by `/ce-setup` after a brief explanation, without reviving removed review-agent selection behavior.
- `/ce-doctor` can explain both dependency gaps and config/storage misconfiguration in one report.
- `/ce-setup` can bring `.compound-engineering/config.local.yaml` under gitignore safely instead of only warning later.
- The dependency registry remains the single source of truth for `/ce-doctor` and `/ce-setup` rather than splitting dependency metadata across multiple docs or skills.
- Provider conversion tests and plugin docs reflect the new contract instead of the old file/path names.

## Scope Boundaries

- Do not add a full team-managed authoring workflow for tracked project config in `/ce-setup`; reading the project layer is in scope, authoring it is a separate effort.
- Do not auto-migrate per-run scratch or historical run artifacts out of `.context/compound-engineering/...`.
- Do not add storage garbage collection or project-directory pruning in this change.
- Do not preserve markdown-frontmatter config as a long-term supported format after migration; legacy support is for import/migration, not dual-write.
- Do not introduce provider-specific config directories for this feature.
- Do not auto-install dependencies without explicit user approval.
- Do not expand this work into project dependency management such as `bundle install`, `npm install`, or app-specific environment setup.

## Key Decisions

- **Home-directory storage is the durable answer:** repo-local `.context` is fine for scratch in a single checkout, but it is the wrong primitive for shared multi-worktree state.
- **Plain YAML replaces the legacy markdown config format:** if this work introduces plugin-managed config, it should do so with files in `repo_state_dir`, not by extending `compound-engineering.local.md`.
- **Legacy review config is not the target model:** main has already removed setup-managed reviewer selection. The new config system should focus on current setup-owned state such as storage and compatibility metadata, not on recreating reviewer preferences in a new file.
- **Compatibility metadata should stay minimal:** plugin semver alone is too coarse, but the fix is not to add version fields everywhere. Keep only the metadata needed to answer whether `/ce-setup` must run again.
- **Migration should have one owner:** `/ce-setup` should perform migration, `/ce-doctor` should report migration state, and a small set of entry skills should warn. Spreading migration logic across every skill creates drift and inconsistent user experience.
- **Todo migration deserves special handling:** unlike per-run artifacts, todo files have a multi-session lifecycle. Read compatibility is worth keeping during the transition.
- **Standard preamble, not universal prompt bloat:** use one shared config-loading pattern for independently invocable config/storage consumers and have parent skills pass resolved values to delegates. Requiring every skill to load config even when it does nothing with it adds carrying cost without enough value.
- **Standard section belongs in AGENTS.md:** the skill-level config instructions should be codified as a repo authoring rule so future skills inherit the same structure instead of drifting.
- **Cross-agent and low-friction wording matters:** the config section should be written against capability classes, minimal reads, and low-prompt execution patterns so it works well across Claude Code, Codex, Gemini, OpenCode, Copilot, and Conductor.
- **`/ce-doctor` and `/ce-setup` stay coupled but distinct:** doctor diagnoses; setup installs/configures. The new architecture should deepen that relationship, not replace it.
- **The dependency design from this branch carries forward:** registry-driven checks, tiered installs, env var prompting, and MCP-first detection still belong in scope. They just need to target the new config/storage contract.
- **Gitignore safety is part of the feature, not a follow-up:** if `/ce-setup` writes `.compound-engineering/config.local.yaml` into repos, the plugin must also verify that users will not accidentally commit it. The gitignore rule should target that machine-local file, not the entire `.compound-engineering/` directory.

## Dependencies / Assumptions

- The current `/ce-doctor` dependency registry and install flow remain the starting point for the dependency portion of this work.
- Skills and docs that currently reference `.context/compound-engineering/...` or `compound-engineering.local.md` will need an inventory-based update pass.
- Converter and contract tests that assert old config names or old storage paths are part of the affected surface, not incidental cleanup.
- `git worktree` metadata is available in normal git repos; planning still needs to define the exact fallback behavior for non-git contexts and edge cases.

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Choose the exact YAML shape for any surviving setup-owned config such as compatibility metadata and any future plugin-level keys that still belong in plugin-managed config.
- [Affects R5][Technical] Define the smallest compatibility metadata shape that reliably tells the plugin whether `/ce-setup` must run again, and add extra diagnostic metadata only if it materially improves behavior.
- [Affects R15][Technical] Decide when a plugin change should bump the setup or migration requirement versus when it should be treated as backward-compatible.
- [Affects R17][Technical] Define the precise slugging and fallback algorithm for git repos, linked worktrees, and non-git directories.
- [Affects R21][Technical] Decide how long legacy todo read compatibility remains and where to document eventual removal.
- [Affects R13][Technical] Build the inventory of independently invocable skills that need direct config/storage loading versus parent-passed values.
- [Affects R23][Technical] Define the doctor output format for config/storage warnings and migration guidance.
- [Affects R30][Needs research] Inventory all docs, tests, and conversion fixtures that encode the old config/storage contract.

## Next Steps

-> `/ce:plan` for a phased implementation plan that starts by codifying the new config schema and migration strategy, then updates `/ce-setup` and `/ce-doctor`, then migrates storage consumers and tests.
