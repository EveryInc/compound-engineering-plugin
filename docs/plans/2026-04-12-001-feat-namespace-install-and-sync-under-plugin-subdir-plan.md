---
title: "feat: Namespace install/sync output under a compound-engineering subdirectory"
type: feat
status: completed
date: 2026-04-12
---

> **Implementation note (2026-04-12):** Shipped with narrower scope than drafted. Only **skill directories** are namespaced — agents, commands, prompts, and steering files stay flat. `openclaw` is excluded because its outputRoot already IS the plugin package. `pluginName` is not plumbed as a parameter; a single `PLUGIN_NAMESPACE = "compound-engineering"` constant lives in `src/utils/plugin-namespace.ts` (YAGNI for the multi-plugin future). Legacy flat-layout cleanup runs inline in each writer and in `syncSkills`, scoped to names that appear in the bundle so user-authored siblings are untouched.

# feat: Namespace Install/Sync Output Under a `compound-engineering/` Subdirectory

## Overview

`compound-plugin install --to <target>` and `compound-plugin sync` currently dump all skills (47 of them today), prompts, and agents directly into the target tool's top-level directory (e.g., `~/.codex/skills/<skill-name>/`, `~/.config/opencode/agent/<agent-name>.md`). This produces hard-to-search sprawl: a user scanning `~/.codex/skills/` sees compound-engineering content intermixed with their own skills, OpenAI's `.system` skills, and anything installed by other tools.

This plan introduces a namespace subdirectory — `<skills-root>/compound-engineering/<skill-name>/SKILL.md` — for every target whose host tool supports recursive skill discovery, so compound-engineering artifacts are grouped on disk without breaking discovery.

## Problem Statement

### 1. Sprawl in shared directories

The plugin currently ships **47 skills**, **24 agents**, and **13 commands**. After running `compound-plugin install compound-engineering --to codex`, `~/.codex/skills/` contains dozens of top-level folders with no visual grouping:

```
~/.codex/skills/
├── .system/                            # openai-shipped
├── agent-browser/                      # compound-engineering
├── agent-native-architecture/          # compound-engineering
├── andrew-kane-gem-writer/             # compound-engineering
├── brainstorming/                      # compound-engineering
├── ce-brainstorm/                      # compound-engineering
├── ... 42 more compound-engineering skills ...
├── my-personal-skill/                  # user-authored
└── team-onboarding/                    # user-authored
```

Finding a personal skill amidst 47 plugin skills is a usability problem. Bulk-removing the plugin requires knowing which of those 60+ folders came from where.

### 2. No visual ownership

There's no way to glance at `~/.codex/skills/` and say "these belong to compound-engineering." The manifest (once the 2026-03-11 non-destructive install plan lands) will record ownership in `.compound-manifest.json`, but filesystem browsing, shell completion, and `grep -r` don't consult the manifest.

### 3. Same problem in every target

This is not codex-specific. `opencode`, `copilot`, `gemini`, `pi`, `droid`, `windsurf`, `kiro`, `qwen`, and `openclaw` all accept copies of the same skills/agents/prompts. Any target whose host tool recursively discovers skills (or whose users tolerate grouping) benefits from the same namespacing.

### 4. `sync` has the same sprawl

`compound-plugin sync` symlinks every skill in `~/.claude/skills/` into each detected tool's skills dir. Same sprawl applies, plus symlinks obscure provenance further.

## Proposed Solution

Introduce a single namespace constant — `PLUGIN_NAMESPACE = "compound-engineering"` — and route all skill/prompt/agent writes for `install` and `sync` through `<root>/<dir>/compound-engineering/<name>/...` instead of `<root>/<dir>/<name>/...`.

```
# Before
~/.codex/skills/agent-browser/SKILL.md
~/.codex/skills/ce-brainstorm/SKILL.md
~/.codex/prompts/ce-plan.md

# After
~/.codex/skills/compound-engineering/agent-browser/SKILL.md
~/.codex/skills/compound-engineering/ce-brainstorm/SKILL.md
~/.codex/prompts/compound-engineering/ce-plan.md   (if the target supports nested prompts)
```

The namespace is the plugin name, not a fixed literal. Passing it through the writer signature keeps the door open for a future marketplace where other plugins could install with their own namespace without colliding.

### Why this works (the previous plan's assumption was wrong)

The 2026-03-11 plan rejected this approach saying "Codex looks for skills in `~/.codex/skills/`, not in subdirectories." That was wrong. Evidence from `openai/codex` (`codex-rs/core-skills/src/loader.rs`):

- `const MAX_SCAN_DEPTH: usize = 6` — recursive walk up to six levels deep
- OpenAI itself ships skills under `~/.codex/skills/.system/` — a namespaced subfolder
- The loader walks roots looking for any `SKILL.md` within the depth budget

So `~/.codex/skills/compound-engineering/agent-browser/SKILL.md` is discovered correctly. No symlink trick, no dual-write, no fan-out layer is needed for codex.

The same recursive pattern needs to be verified per target before rollout (see Phase 0), but the precedent is encouraging: most tools that support skills adopted Anthropic's Claude Code SKILL.md convention, which is inherently directory-based.

## Technical Approach

### Architecture

```
src/
├── targets/
│   ├── codex.ts          # Modified: join PLUGIN_NAMESPACE into skill/prompt paths
│   ├── opencode.ts       # Modified: same
│   ├── copilot.ts        # Modified: same
│   ├── gemini.ts         # Modified: same
│   ├── pi.ts             # Modified: same
│   ├── droid.ts          # Modified: same
│   ├── kiro.ts           # Modified: same
│   ├── qwen.ts           # Modified: same
│   ├── windsurf.ts       # Modified: same
│   ├── openclaw.ts       # Modified: same
│   └── index.ts          # No change (handler registration)
├── sync/
│   ├── skills.ts         # Modified: accept pluginNamespace param; join into skillsDir
│   ├── commands.ts       # Modified: same for prompt/command paths where applicable
│   ├── codex.ts          # Modified: pass namespace into syncSkills + prompt path
│   ├── opencode.ts       # Modified: pass namespace through
│   ├── copilot.ts        # Modified: same
│   ├── gemini.ts         # Modified: same
│   ├── pi.ts             # Modified: same
│   ├── droid.ts          # Modified: same
│   ├── kiro.ts           # Modified: same
│   ├── qwen.ts           # Modified: same
│   ├── windsurf.ts       # Modified: same
│   └── openclaw.ts       # Modified: same
├── commands/
│   ├── install.ts        # Modified: pass plugin.manifest.name as namespace to writers
│   └── sync.ts           # Modified: pass "compound-engineering" (or detected plugin name)
├── utils/
│   ├── plugin-namespace.ts  # NEW: single source of truth for the namespace + path helper
│   └── legacy-flat-cleanup.ts  # NEW: one-shot migration that detects & removes flat-layout leftovers
└── types/
    └── codex.ts, opencode.ts, etc.  # Possibly extend bundle types with pluginName (if not already)
```

### Key decision: plumb the namespace, don't hardcode it

A single exported constant `export const PLUGIN_NAMESPACE = "compound-engineering"` is tempting but wrong. `install` already knows the plugin name from `plugin.manifest.name` (`src/commands/install.ts:138`). Passing that as a parameter through the writer signature gives three benefits:

1. Tests can exercise any namespace without monkey-patching
2. Future multi-plugin marketplaces work without refactor
3. `sync` can use a constant (`compound-engineering`, since sync today is hardcoded for this repo) while `install` uses the actual plugin name

Writer signatures change from `write(root, bundle)` to `write(root, bundle, { pluginName })`. The sync functions gain the same parameter.

### Key decision: prompts follow the same rule, per-target

For targets that discover prompts recursively, `prompts/compound-engineering/ce-plan.md` is fine. For targets where prompts are flat-only, the plan falls back to a filename prefix: `prompts/compound-engineering_ce-plan.md`. This isn't ideal for searchability but it's better than clobbering. Phase 0 audits each target and picks a strategy per-target.

### Interaction with the in-flight manifest plan

`docs/plans/2026-03-11-001-fix-codex-install-non-destructive-uninstall-plan.md` adds `.compound-manifest.json` listing relative paths. That plan is orthogonal: when both plans land, the manifest naturally records the namespaced paths (`skills/compound-engineering/agent-browser` instead of `skills/agent-browser`), and orphan cleanup Just Works because it walks whatever the manifest says.

**Coordination note:** Whichever plan lands second must carry a **legacy-flat-cleanup** step — see Phase 3 — to remove the old top-level folders that the previous install left behind. Without that, users end up with both layouts simultaneously.

### Sync namespacing and symlinks

Today, `src/sync/skills.ts:18` writes `path.join(skillsDir, skill.name)` as a symlink to `skill.sourceDir`. The change is minimal:

```typescript
// Before
const target = path.join(skillsDir, skill.name)
await forceSymlink(skill.sourceDir, target)

// After
const nsDir = pluginNamespace
  ? path.join(skillsDir, pluginNamespace)
  : skillsDir
await ensureDir(nsDir)
const target = path.join(nsDir, skill.name)
await forceSymlink(skill.sourceDir, target)
```

Critical: the **symlink target** stays absolute (`skill.sourceDir` is already absolute from the parser), so nesting the symlink one directory deeper does not break the link. Verified: `forceSymlink` in `src/utils/symlink.ts` does not compute relative paths.

### Implementation Phases

#### Phase 0: Per-target discovery audit (research only, no code)

Before touching any writer, verify recursive skill/prompt discovery for each target. This is the phase most likely to produce surprises.

**Tasks:**

- [ ] **Codex** — already verified: `codex-rs/core-skills/src/loader.rs` uses `MAX_SCAN_DEPTH = 6`. Prompts discovery TBD — check whether `~/.codex/prompts/<ns>/<file>.md` works.
- [ ] **OpenCode** — read opencode's agent/skill loader. Look at `~/.config/opencode/agent/` discovery rules.
- [ ] **Copilot** — investigate `.github/skills/` and global copilot skills location.
- [ ] **Gemini CLI** — check `~/.gemini/extensions/` and skill scanning.
- [ ] **Pi** — check `~/.pi/agent/` loader — Pi may already namespace internally.
- [ ] **Droid** — check `~/.factory/` skill loader.
- [ ] **Windsurf, Kiro, Qwen, OpenClaw** — same drill.
- [ ] For each target, record:
  - Does skill discovery recurse? Max depth?
  - Does prompt discovery recurse?
  - Are there any naming or path-length constraints?
  - Is `.ignore-this-folder`-style metadata supported?

**Output:** A table in this plan document summarizing what each target supports. Targets that don't support recursion fall back to filename-prefix strategy or get deferred.

**Success criteria:** Every target has a documented namespacing strategy (recursive subdir, filename prefix, or deferred) before Phase 1 starts.

#### Phase 1: Introduce `pluginName` parameter end-to-end

Plumb a `pluginName` option through writers and sync functions without changing any output paths yet. This is a refactor-first phase to keep behavior identical and make the Phase 2 diff small and reviewable.

**Tasks:**

- [ ] Create `src/utils/plugin-namespace.ts`:
  ```typescript
  export const DEFAULT_PLUGIN_NAMESPACE = "compound-engineering"

  /** Join a root directory with an optional plugin namespace. */
  export function namespaced(root: string, pluginName: string | null): string {
    return pluginName ? path.join(root, pluginName) : root
  }
  ```
- [ ] Extend `TargetHandler` type (`src/targets/index.ts`) so `write(root, bundle, scope, { pluginName })` accepts an options object.
- [ ] Update every writer in `src/targets/*.ts` to accept `{ pluginName }` — but ignore it for now (no path change).
- [ ] Update `src/sync/skills.ts` and each `src/sync/<target>.ts` to accept and forward the same option.
- [ ] Update `src/commands/install.ts:141` and `:176` to pass `{ pluginName: plugin.manifest.name }`.
- [ ] Update `src/commands/sync.ts` to pass `{ pluginName: DEFAULT_PLUGIN_NAMESPACE }`.
- [ ] **No test output should change in this phase.** Existing tests must pass unchanged.

**Success criteria:**
- All writers and sync functions accept `pluginName` without using it.
- `bun test` passes with zero changes to snapshots.

#### Phase 2: Apply namespace to paths, per-target

For each target whose Phase 0 audit confirmed recursive discovery, wire the namespace into the output path. Targets that failed the audit get a per-target fallback (prefix) or are deferred.

**Example for codex (`src/targets/codex.ts`):**

```typescript
// Before
const skillsRoot = path.join(codexRoot, "skills")
for (const skill of bundle.skillDirs) {
  await copyDir(skill.sourceDir, path.join(skillsRoot, skill.name))
}

// After
const skillsRoot = namespaced(path.join(codexRoot, "skills"), options.pluginName)
for (const skill of bundle.skillDirs) {
  await copyDir(skill.sourceDir, path.join(skillsRoot, skill.name))
}
```

Apply the same `namespaced(...)` wrap to:
- `skillDirs` output root
- `generatedSkills` output root
- `prompts` output root (iff the target supports recursive prompt discovery)

**Tasks:**

- [ ] codex: namespace `skills/` and (per Phase 0 audit) `prompts/`
- [ ] opencode: namespace `agent/`, `command/`, and skills location per audit
- [ ] copilot: namespace global and `.github/skills`, `.github/agents` per audit
- [ ] gemini: namespace per audit
- [ ] pi: namespace per audit
- [ ] droid: namespace per audit
- [ ] windsurf: namespace per audit
- [ ] kiro: namespace per audit
- [ ] qwen: namespace per audit
- [ ] openclaw: namespace per audit
- [ ] Update all snapshot tests and fixture paths in `tests/`
- [ ] Update `src/sync/skills.ts` to namespace the symlink parent directory
- [ ] Update `src/sync/commands.ts` similarly
- [ ] Run the plugin end-to-end against each detected target in a disposable home dir and confirm the host tool still discovers every artifact

**Success criteria:**
- Every target supporting recursion writes under `<root>/<dir>/compound-engineering/...`
- Every target requiring a fallback uses the documented fallback from Phase 0
- Running the target tool (codex, opencode, etc.) after install still exposes all skills, agents, commands, and prompts
- All existing tests updated to new paths pass

#### Phase 3: Legacy flat-layout cleanup

Users who installed the plugin before this change have files at the old top-level paths. Phase 3 detects and removes those orphans on the next install/sync.

**Strategy:** inspect the old flat layout in the same root and compare against the plugin's known skill/prompt/agent names. Delete the old top-level entries before writing the new namespaced ones. This is safe because we're only removing names the plugin itself introduced — user-authored siblings with different names are untouched.

```typescript
// src/utils/legacy-flat-cleanup.ts
export async function removeLegacyFlatEntries(
  parentDir: string,
  entryNames: string[],
): Promise<{ removed: string[]; skipped: string[] }> {
  // For each name in entryNames:
  //   - resolve parentDir/name
  //   - if it's a symlink (sync-created), rm it
  //   - if it's a directory with SKILL.md, rm -rf it
  //   - if it's a file .md, rm it
  //   - otherwise skip (treat as user-owned)
  // Return lists for summary logging.
}
```

**Tasks:**

- [ ] Create `src/utils/legacy-flat-cleanup.ts`
- [ ] Wire it into each `src/targets/*.ts` writer before writing the new namespaced paths
- [ ] Wire it into each `src/sync/<target>.ts` function before `syncSkills` / `syncCommands`
- [ ] Print a one-line summary: `Migrated N skills and M prompts to compound-engineering/ namespace`
- [ ] If the 2026-03-11 manifest plan lands first: read the old manifest, use its `files[]` as the authoritative list of "things the plugin owns" instead of guessing from plugin bundle. This is strictly safer — only cleans up what the plugin recorded installing.
- [ ] Test the migration path: install old version → apply Phase 2 changes → install new version → verify old top-level folders are gone and new namespaced folders exist
- [ ] Test the pure-new-install path: empty target dir → install → verify only namespaced layout exists, no migration noise

**Success criteria:**
- Running `install`/`sync` once against a pre-namespace state leaves only the namespaced layout
- User-authored sibling folders in the same skills dir are untouched
- Migration is one-shot: running twice is a no-op (no legacy entries found on second run)

### Edge cases and gotchas

- **`~/.agents/skills/` vs `~/.codex/skills/`.** The codex loader treats `$CODEX_HOME/skills` as "deprecated but supported" and prefers `$HOME/.agents/skills`. This plan keeps writing to `~/.codex/skills` to match the current behavior; migrating to `~/.agents/skills` is a separate (larger) change and should be a follow-up plan.
- **Symlink chains.** `sync` creates symlinks. Putting them inside a deeper directory must not break relative links. Current `forceSymlink` writes absolute targets — verified safe.
- **Name collisions between plugin and user skills.** Today, a user-authored `~/.codex/skills/brainstorming/` collides with the plugin's `brainstorming/`. After this change, they live at different paths (`.../compound-engineering/brainstorming/` vs `.../brainstorming/`) — collision resolved automatically. Document this as a secondary benefit.
- **Convert command.** `src/commands/convert.ts` shares writer code with `install`. If convert needs different behavior (no namespace), the writer must accept an opt-out — or convert can pass `{ pluginName: null }` to get the flat layout. Lean toward "convert stays flat" since it's a one-shot format translation, not a managed install.
- **Short `--to <target>` default paths.** `resolveTargetOutputRoot` in `src/utils/resolve-output.ts` may already join some subpath (e.g., `plugins/compound-engineering/`). Audit this per target to avoid double-namespacing like `compound-engineering/compound-engineering/`.
- **Host tool caches.** Codex caches skill discovery; restart may be required after the move. Phase 2 should print a reminder when it detects a running process for that tool.

## Alternative Approaches Considered

### 1. Filename-prefix only (e.g., `compound-engineering_agent-browser/`)

**Approach:** Prefix every folder with `compound-engineering_` instead of using a subdirectory.

**Why rejected:** The user explicitly asked for subdirectory scaffolding. Prefixing still alphabetizes the 47 skills together but keeps them at top level — worse for searchability (`ls` is cluttered, tab completion is noisier) and requires renaming every skill on install. Only useful as a fallback for targets that can't recurse.

### 2. Symlink fan-out (real files in subfolder, top-level symlinks)

**Approach:** Write real files to `<root>/skills/compound-engineering/<skill>/` and create top-level symlinks like `<root>/skills/<skill>` → `compound-engineering/<skill>/`.

**Why rejected:** Doubles the filesystem footprint (entries-wise), confuses users who `cd` into a symlinked directory, and doubles orphan cleanup complexity. Only worth it if target tools cannot recurse — and the Phase 0 audit suggests most can.

### 3. Put skills in `~/.agents/skills/compound-engineering/` (the new codex location)

**Approach:** Use codex's non-deprecated `~/.agents/skills/` path, which is shared across tools.

**Why rejected (for this plan):** It's a bigger change with unclear cross-tool semantics and should be its own plan. File as a follow-up.

### 4. Hardcode `PLUGIN_NAMESPACE = "compound-engineering"`

**Approach:** One constant, used everywhere, no plumbing.

**Why rejected:** `install` already has the plugin name in context (`plugin.manifest.name`). Plumbing it through costs a single parameter and makes tests trivial. Hardcoding optimizes for the single-plugin present at the expense of the multi-plugin future.

## System-Wide Impact

### Interaction Graph

- `install` command → builds `{ pluginName }` from `plugin.manifest.name` → calls `target.write(root, bundle, scope, { pluginName })` → writer calls `namespaced()` helper when joining skill/prompt paths → `copyDir` / `writeText` → files land under `<root>/<dir>/compound-engineering/...`
- Before writing, writer calls `removeLegacyFlatEntries(parentDir, entryNames)` → removes pre-namespace leftovers
- `sync` command → resolves `pluginName = "compound-engineering"` → calls `syncToCodex(config, root, { pluginName })` → `syncSkills(skills, namespaced(path.join(root, "skills"), pluginName))` → `forceSymlink` writes symlinks at nested path
- `convert` command → passes `{ pluginName: null }` to keep one-shot conversions flat
- `uninstall` (from the 2026-03-11 plan) → reads manifest, which now records namespaced paths → removes `<root>/<dir>/compound-engineering/...` entries → safe because nothing else lives there

### Error Propagation

- `ensureDir` failure on the new namespaced parent → surfaces as a standard write error; caller fails loud. No silent fallback.
- Legacy cleanup failure → warn per entry, continue; don't block install on failed migration (files are idempotently re-removable on next run).
- Target host tool can't discover namespaced skill → caught in Phase 0 audit before shipping to users.

### State Lifecycle Risks

- **Partial migration + crash.** User runs new install, legacy cleanup removes old `agent-browser/`, then crashes before writing new `compound-engineering/agent-browser/`. Re-running install finishes the job (cleanup is idempotent, write is idempotent).
- **Old + new layout simultaneously.** If a user runs the new install, then accidentally runs the old CLI version after upgrading their global bin, they'd re-create the flat layout while the namespaced layout still exists. Acceptable: next new-CLI run cleans up. Document in release notes.
- **User-authored skill with name colliding with plugin skill.** Pre-change, plugin install destroys the user skill. Post-change, they live at different paths and both coexist. Strictly better.

### API Surface Parity

- Writer signature change: every `target.write(...)` gains an options bag. All 10 targets updated in Phase 1. No external consumers of these types exist today (internal-only).
- Sync function signature change: every `syncTo<Tool>(config, root)` becomes `syncTo<Tool>(config, root, options)`. Same story.
- CLI surface: **no changes**. `--to`, `--output`, etc. behave identically. This is a pure output-path refactor.

### Integration Test Scenarios

1. **Fresh install, namespaced layout.** Empty target dir → `install --to codex` → confirm `~/.codex/skills/compound-engineering/<skill>/SKILL.md` exists for every skill in the plugin; top level is empty of plugin content.
2. **Migration from flat.** Pre-populate a target dir with the old flat layout → run new `install` → confirm flat entries removed and namespaced entries present; user-authored siblings untouched.
3. **Sync then install idempotency.** `sync` first (creates namespaced symlinks) → then `install` (namespaced copies) → confirm one wins cleanly and the other is detected; document the resolution.
4. **Discovery smoke test.** After install, actually launch the target tool against the modified home dir and verify it lists compound-engineering skills (at minimum: codex and opencode).
5. **Convert command stays flat.** `convert --to codex <plugin>` → output at old flat paths → confirm no namespace applied to one-shot conversions.

## Acceptance Criteria

### Functional Requirements

- [ ] `install --to codex` writes skills to `<codex-root>/skills/compound-engineering/<skill>/SKILL.md`
- [ ] `install --to codex` writes prompts per the Phase 0 decision (nested subdir or prefix)
- [ ] `install --to <other-target>` applies the namespace strategy chosen for that target in Phase 0
- [ ] `sync` symlinks skills into `<tool-root>/skills/compound-engineering/<skill>/`
- [ ] Codex (and every other supported target) still discovers every installed skill after the change
- [ ] A legacy flat layout from a previous install is cleaned up on the first namespaced install/sync
- [ ] User-authored sibling skills/agents/prompts in the same target dir are never touched
- [ ] `convert` command output is unchanged (no namespace applied)
- [ ] The manifest from the 2026-03-11 plan, if present, records namespaced paths

### Non-Functional Requirements

- [ ] Writer and sync function signatures accept a `pluginName` option; no hardcoded namespace literal in writer code
- [ ] `DEFAULT_PLUGIN_NAMESPACE` lives in one place (`src/utils/plugin-namespace.ts`) and is imported where needed
- [ ] No breaking CLI changes (`--to`, `--output`, `--codex-home`, etc. unchanged)
- [ ] Phase 1 ships with zero output changes; Phase 2 carries all user-visible changes in one reviewable commit per target

### Quality Gates

- [ ] `bun test` green after each phase
- [ ] Manual smoke test per target: run the host tool after install, confirm skill discovery
- [ ] Migration smoke test: flat → namespaced on a disposable home dir
- [ ] Phase 0 audit table published in this plan before Phase 2 code lands
- [ ] CHANGELOG entry noting the layout change and the one-shot migration

## Success Metrics

- **Searchability:** `ls ~/.codex/skills/compound-engineering/ | wc -l` shows exactly the plugin's skills, no others.
- **Clean uninstall (once 2026-03-11 lands):** removing the plugin deletes one namespace subdirectory, no scattered cleanup required.
- **No regressions:** all target tools continue to discover all 47 skills, 24 agents, 13 commands after upgrade.
- **Zero surprise migrations:** users upgrading from flat to namespaced see a one-line summary log; no interactive prompts, no data loss.

## Dependencies & Prerequisites

- **Phase 0 audit is a hard prerequisite** for Phase 2 — do not ship namespaced writes for a target without confirming discovery.
- Coordination with `docs/plans/2026-03-11-001-fix-codex-install-non-destructive-uninstall-plan.md`: either plan can land first. If that one lands first, Phase 3 migration should prefer reading its manifest over guessing from the plugin bundle.
- No external dependencies. No new npm packages.
- Requires every target tool to be installable in CI or a disposable dev environment for smoke tests.

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A target tool doesn't recurse into skill subdirs | Medium | High | Phase 0 audits every target before Phase 2 writes anything. Fallback: filename prefix per-target. |
| Migration deletes user-authored skill because of name collision | Low | High | Only delete entries whose names match the plugin bundle's skills; document the guarantee. Bonus safety when manifest lands: prefer manifest over bundle-name guess. |
| Host tool caches stale discovery state after migration | Medium | Low | Print a "restart <tool> to pick up the new layout" hint on migration. |
| Double namespacing (`.../compound-engineering/compound-engineering/`) | Low | Medium | Audit `resolveTargetOutputRoot` for targets that already inject a plugin-name path segment; skip namespacing in those. |
| Phase 1 refactor leaks behavior changes | Low | Medium | Phase 1 acceptance criterion is zero diff in snapshot tests. Any change there means Phase 1 is wrong. |
| Symlink-based sync breaks when nested | Very low | High | `forceSymlink` writes absolute targets; verified. Phase 2 adds a test that reads the symlink and confirms target resolves. |
| Convert command accidentally inherits namespacing | Medium | Low | Convert explicitly passes `{ pluginName: null }`; add a test asserting flat output. |

## Resource Requirements

- **Files to create:** `src/utils/plugin-namespace.ts`, `src/utils/legacy-flat-cleanup.ts`, `tests/plugin-namespace.test.ts`, `tests/legacy-flat-cleanup.test.ts`, `tests/install-namespaced.test.ts`, `tests/sync-namespaced.test.ts`
- **Files to modify:** `src/commands/install.ts`, `src/commands/sync.ts`, every `src/targets/*.ts`, every `src/sync/<target>.ts`, `src/sync/skills.ts`, `src/sync/commands.ts`, `src/targets/index.ts` (handler type), test fixtures and snapshots
- **Files NOT modified:** `src/commands/convert.ts` (stays flat), `src/converters/*` (emit same bundle content; only the writer's path join changes), `src/parsers/*` (no change to input parsing)
- **Infrastructure:** per-target smoke-test fixtures — ideally one disposable home-dir setup per target tool for Phase 2 verification

## Future Considerations

- **Multi-plugin marketplace.** Once another plugin (say `my-team-plugin`) exists, the existing parameter-based design supports it with zero changes: pass `plugin.manifest.name` through.
- **Per-user override.** A future CLI flag `--namespace <custom>` (or `--no-namespace`) lets power users opt out or rename. Don't build it now; wait for the first user request.
- **Migrate to `~/.agents/skills/`.** Codex's loader prefers this non-deprecated location. A separate plan should investigate whether compound-engineering should write there, and whether it's shared cleanly with other tools.
- **Cross-target uninstall.** Once manifest lands, `uninstall --to all` plus namespacing makes "remove compound-engineering from everywhere" a single command that deletes N directories.
- **Docs site links.** The `/release-docs` process generates reference pages listing install paths — update those to reflect the namespaced layout when Phase 2 lands.

## Documentation Plan

- [ ] Update `plugins/compound-engineering/README.md` to show the new installed layout
- [ ] Add a migration note to `plugins/compound-engineering/CHANGELOG.md` when the change lands
- [ ] Update `CLAUDE.md` structure diagram if any root-level src paths change
- [ ] Document the `PLUGIN_NAMESPACE` convention in `src/utils/plugin-namespace.ts` for maintainers
- [ ] Update the docs site install instructions after `/release-docs`

## Sources & References

### Internal References

- Flat-layout writer (the code to change): `src/targets/codex.ts:17-29`
- Sync skill symlinks: `src/sync/skills.ts:6-21`
- Sync codex entry: `src/sync/codex.ts:13-64`
- Install command wiring: `src/commands/install.ts:141`, `:176`
- Sync command wiring: `src/commands/sync.ts:70-85`
- Target handler registration: `src/targets/index.ts`
- Symlink helper (verified absolute target): `src/utils/symlink.ts`
- Related plan (manifest + uninstall): `docs/plans/2026-03-11-001-fix-codex-install-non-destructive-uninstall-plan.md`
- Previous plan's rejected alternative (the one this plan overturns): section "Alternative Approaches Considered → 1. Namespaced Install Directories" in the 2026-03-11 plan

### External References

- Codex skills loader (confirms recursive scan, `MAX_SCAN_DEPTH = 6`): `openai/codex` → `codex-rs/core-skills/src/loader.rs`
- Codex-shipped namespaced skills (`.system`): `openai/codex` → `codex-rs/skills/src/lib.rs` (`SYSTEM_SKILLS_DIR_NAME = ".system"`)
- Codex Agent Skills overview: https://developers.openai.com/codex/skills
- Simon Willison on skills across ChatGPT and Codex CLI: https://simonw.substack.com/p/openai-are-quietly-adopting-skills
- Codex CLI skills guide: https://tokrepo.com/en/guide/codex-cli-skills

### Related Work

- `docs/plans/2026-03-11-001-fix-codex-install-non-destructive-uninstall-plan.md` — manifest tracking and uninstall command (orthogonal, compatible)
- `plugins/compound-engineering/.claude-plugin/plugin.json` — source of `plugin.manifest.name` used as the namespace value

Sources:
- [Agent Skills – Codex](https://developers.openai.com/codex/skills)
- [Skills in OpenAI Codex – fsck.com](https://blog.fsck.com/2025/12/19/codex-skills/)
- [OpenAI are quietly adopting skills](https://simonw.substack.com/p/openai-are-quietly-adopting-skills)
- [Codex CLI skills guide – TokRepo](https://tokrepo.com/en/guide/codex-cli-skills)
