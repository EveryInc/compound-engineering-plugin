---
title: "feat: Migrate repo releases to manual release-please with centralized changelog"
type: feat
status: active
date: 2026-03-17
origin: docs/brainstorms/2026-03-17-release-automation-requirements.md
---

# feat: Migrate repo releases to manual release-please with centralized changelog

## Overview

Replace the current single-line `semantic-release` flow and maintainer-local `release-docs` workflow with a repo-owned release system built around `release-please`, a single accumulating release PR, explicit component version ownership, release automation-owned metadata/count updates, and a centralized root `CHANGELOG.md`. The new model keeps release timing manual by making merge of the generated release PR the release action while allowing dry-run previews and automatic release PR maintenance as new merges land on `main`.

## Problem Frame

The current repo mixes one automated root CLI release line with manual plugin release conventions and stale docs/tooling. `publish.yml` publishes on every push to `main`, `.releaserc.json` only understands the root package, `release-docs` still encodes outdated repo structure, and plugin-level version/changelog ownership is inconsistent. The result is drift across root changelog history, plugin manifests, computed counts, and contributor guidance. The origin requirements define a different target: manual release timing, one release PR for the whole repo, independent component versions, no bumps for untouched plugins, centralized changelog ownership, and CI-owned release authority. (see origin: docs/brainstorms/2026-03-17-release-automation-requirements.md)

## Requirements Trace

- R1. Manual release; no publish on every merge to `main`
- R2. Batched releasable changes may accumulate on `main`
- R3. One release PR for the whole repo that auto-accumulates releasable merges
- R4. Independent version bumps for `cli`, `compound-engineering`, `coding-tutor`, and `marketplace`
- R5. Untouched components do not bump
- R6. Root `CHANGELOG.md` remains canonical
- R7. Root changelog uses top-level component-version entries
- R8. Existing changelog history is preserved
- R9. `plugins/compound-engineering/CHANGELOG.md` is no longer canonical
- R10. Retire `release-docs` as release authority
- R11. Replace `release-docs` with narrow scripts
- R12. Release automation owns versions, counts, and release metadata
- R13. Support dry run with no side effects
- R14. Dry run summarizes proposed component bumps, changelog entries, and blockers
- R15. Marketplace version bumps only for marketplace-level changes
- R16. Plugin version changes do not imply marketplace version bumps
- R17. Plugin-only content changes do not force CLI version bumps
- R18. Preserve compatibility with current install behavior where the npm CLI fetches plugin content from GitHub at runtime
- R19. Release flow is triggerable through CI by maintainers or AI agents
- R20. The model must scale to additional plugins
- R21. Conventional release intent signals remain required, but component scopes in titles remain optional
- R22. Component ownership is inferred primarily from changed files, not title scopes alone
- R23. The repo enforces parseable conventional PR or merge titles without requiring component scope on every change
- R24. Manual CI release supports explicit bump overrides for exceptional cases without fake commits
- R25. Bump overrides are per-component rather than repo-wide only
- R26. Dry run shows inferred bump and applied override clearly

## Scope Boundaries

- No change to how Claude Code consumes marketplace/plugin version fields
- No end-user auto-update discovery flow for non-Claude harnesses in v1
- No per-plugin canonical changelog model
- No fully automatic timed release cadence in v1

## Context & Research

### Relevant Code and Patterns

- `.github/workflows/publish.yml` currently runs `npx semantic-release` on every push to `main`; this is the behavior being retired.
- `.releaserc.json` is the current single-line release configuration and only writes `CHANGELOG.md` and `package.json`.
- `package.json` already exposes repo-maintenance scripts and is the natural place to add release preview/validation script entrypoints.
- `src/commands/install.ts` resolves named plugin installs by cloning the GitHub repo and reading `plugins/<name>` at runtime; this means plugin content releases can remain independent from npm CLI releases when CLI code is unchanged.
- `.claude-plugin/marketplace.json`, `plugins/compound-engineering/.claude-plugin/plugin.json`, and `plugins/coding-tutor/.claude-plugin/plugin.json` are the current version-bearing metadata surfaces that need explicit ownership.
- `.claude/commands/release-docs.md` is stale and mixes docs generation, metadata synchronization, validation, and release guidance; it should be replaced rather than modernized in place.
- Existing planning docs in `docs/plans/` use one file per plan, frontmatter with `origin`, and dependency-ordered implementation units with explicit file paths; this plan follows that pattern.

### Institutional Learnings

- `docs/solutions/plugin-versioning-requirements.md` already encodes an important constraint: version bumps and changelog entries should be release-owned, not added in routine feature PRs. The migration should preserve that principle while moving the authority into CI.

### External References

- `release-please` release PR model supports maintaining a standing release PR that updates as more work lands on the default branch.
- `release-please` manifest mode supports multi-component repos and per-component extra file updates, which is a strong fit for plugin manifests and marketplace metadata.
- GitHub Actions `workflow_dispatch` provides a stable manual trigger surface for dry-run preview workflows.

## Key Technical Decisions

- **Use `release-please` for version planning and release PR lifecycle**: The repo needs one accumulating release PR with multiple independently versioned components; that is closer to `release-please`'s native model than to `semantic-release`.
- **Keep one centralized root changelog**: The root `CHANGELOG.md` remains the canonical changelog. Release automation must render component-labeled entries into that one file rather than splitting canonical history across plugin-local changelog files.
- **Use top-level component-version entries in the root changelog**: Each released component version gets its own top-level entry in `CHANGELOG.md`, including the component name, version, and release date in the heading. This keeps one centralized file while preserving readable independent version history.
- **Treat component versioning and changelog rendering as related but separate concerns**: `release-please` can own component version bumps and release PR state, but root changelog formatting may require repo-specific rendering logic to preserve a single readable canonical file.
- **Use explicit release scripts for repo-specific logic**: Count computation, metadata sync, dry-run summaries, and root changelog shaping should live in versioned scripts rather than hidden maintainer-local command prompts.
- **Preserve current plugin delivery assumptions**: Plugin content updates do not force CLI version bumps unless the converter/installer behavior in `src/` changes.
- **Marketplace is catalog-scoped**: Marketplace version bumps depend on marketplace file changes such as plugin additions/removals or marketplace metadata edits, not routine plugin release version updates.
- **Use conventional type as release intent, not mandatory component scope**: `feat`, `fix`, and explicit breaking-change markers remain important release signals, but component scope in PR or merge titles is optional and should not be required for common compound-engineering work.
- **File ownership is authoritative for component selection**: Optional title scope can help notes and validation, but changed-file ownership rules should decide which components bump.
- **Support manual bump overrides as an explicit escape hatch**: Inferred bumping remains the default, but the CI-driven release flow should allow per-component `patch` / `minor` / `major` overrides for exceptional cases without requiring synthetic commits on `main`.
- **Deprecate, do not rely on, legacy changelog/docs surfaces**: `plugins/compound-engineering/CHANGELOG.md` and `release-docs` should stop being live authorities; they should be removed, frozen, or reduced to pointer guidance only after the new flow is in place.

## Root Changelog Format

The root `CHANGELOG.md` should remain the only canonical changelog and should use component-version entries rather than repo-wide release-event entries.

### Format Rules

- Each released component gets its own top-level entry.
- Entry headings include the component name, version, and release date.
- Entries are ordered newest-first in the single root file.
- When multiple components release from the same merged release PR, they appear as adjacent entries with the same date.
- Each entry contains only changes relevant to that component.
- The file keeps a short header note explaining that it is the canonical changelog for the repo and that versions are component-scoped.
- Historical root changelog entries remain in place; the migration adds a note and changes formatting only for new entries after cutover.

### Recommended Heading Shape

```md
## compound-engineering v2.43.0 - 2026-04-10

### Features
- ...

### Fixes
- ...
```

Additional examples:

```md
## coding-tutor v1.2.2 - 2026-04-18

### Fixes
- ...

## marketplace v1.3.0 - 2026-04-18

### Changed
- Added `new-plugin` to the marketplace catalog.

## cli v2.43.1 - 2026-04-21

### Fixes
- Correct OpenClaw install path handling.
```

### Migration Rules

- Preserve all existing root changelog history as published.
- Add a short migration note near the top stating that, starting with the cutover release, entries are recorded per component version in the root file.
- Do not attempt to rewrite or normalize all older entries into the new structure.
- `plugins/compound-engineering/CHANGELOG.md` should no longer receive new canonical entries after cutover.

## Component Release Rules

The release system should use explicit file-to-component ownership rules so unchanged components do not bump accidentally.

### Component Definitions

- **`cli`**: The npm-distributed `@every-env/compound-plugin` package and its release-owned root metadata.
- **`compound-engineering`**: The plugin rooted at `plugins/compound-engineering/`.
- **`coding-tutor`**: The plugin rooted at `plugins/coding-tutor/`.
- **`marketplace`**: Marketplace-level metadata rooted at `.claude-plugin/` and any future repo-owned marketplace-only surfaces.

### File-to-Component Mapping

#### `cli`

Changes that should trigger a `cli` release:

- `src/**`
- `package.json`
- `bun.lock`
- CLI-only tests or fixtures that validate root CLI behavior:
  - `tests/cli.test.ts`
  - other top-level tests whose subject is the CLI itself
- Release-owned root files only when they reflect a CLI release rather than another component:
  - root `CHANGELOG.md` entry generation for the `cli` component

Changes that should **not** trigger `cli` by themselves:

- Plugin content changes under `plugins/**`
- Marketplace metadata changes under `.claude-plugin/**`
- Docs or brainstorm/plan documents unless the repo explicitly decides docs-only changes are releasable for the CLI

#### `compound-engineering`

Changes that should trigger a `compound-engineering` release:

- `plugins/compound-engineering/**`
- Tests or fixtures whose primary purpose is validating compound-engineering content or conversion results derived from that plugin
- Release-owned metadata updates for the compound-engineering plugin:
  - `plugins/compound-engineering/.claude-plugin/plugin.json`
- Root `CHANGELOG.md` entry generation for the `compound-engineering` component

Changes that should **not** trigger `compound-engineering` by themselves:

- `plugins/coding-tutor/**`
- Root CLI implementation changes in `src/**`
- Marketplace-only metadata changes

#### `coding-tutor`

Changes that should trigger a `coding-tutor` release:

- `plugins/coding-tutor/**`
- Tests or fixtures whose primary purpose is validating coding-tutor content or conversion results derived from that plugin
- Release-owned metadata updates for the coding-tutor plugin:
  - `plugins/coding-tutor/.claude-plugin/plugin.json`
- Root `CHANGELOG.md` entry generation for the `coding-tutor` component

Changes that should **not** trigger `coding-tutor` by themselves:

- `plugins/compound-engineering/**`
- Root CLI implementation changes in `src/**`
- Marketplace-only metadata changes

#### `marketplace`

Changes that should trigger a `marketplace` release:

- `.claude-plugin/marketplace.json`
- Future marketplace-only docs or config files if the repo later introduces them
- Adding a new plugin directory under `plugins/` when that addition is accompanied by marketplace catalog changes
- Removing a plugin from the marketplace catalog
- Marketplace metadata changes such as owner info, catalog description, or catalog-level structure changes

Changes that should **not** trigger `marketplace` by themselves:

- Routine version bumps to existing plugin manifests
- Plugin-only content changes under `plugins/compound-engineering/**` or `plugins/coding-tutor/**`
- Root CLI implementation changes in `src/**`

### Multi-Component Rules

- A single merged PR may trigger multiple components when it changes files owned by each of those components.
- A plugin content change plus a CLI behavior change should release both the plugin and `cli`.
- Adding a new plugin should release at least the new plugin and `marketplace`; it should release `cli` only if the CLI behavior, plugin discovery logic, or install UX also changed.
- Root `CHANGELOG.md` should not itself be used as the primary signal for component detection; it is a release output, not an input.
- Release-owned metadata writes generated by the release flow should not recursively cause unrelated component bumps on subsequent runs.

### Release Intent Rules

- The repo should continue to require conventional release intent markers such as `feat:`, `fix:`, and explicit breaking change notation.
- Component scopes such as `feat(coding-tutor): ...` are optional and should remain optional.
- When a scope is present, it should be treated as advisory metadata that can improve release note grouping or mismatch detection.
- When no scope is present, release automation should still work correctly by using changed-file ownership to determine affected components.
- Docs-only, planning-only, or maintenance-only titles such as `docs:` or `chore:` should remain parseable even when they do not imply a releasable component bump.

### Manual Override Rules

- Automatic bump inference remains the default for all components.
- The manual CI workflow should support override values of at least `patch`, `minor`, and `major`.
- Overrides should be selectable per component rather than only as one repo-wide override.
- Overrides should be treated as exceptional operational controls, not the normal release path.
- When an override is present, release output should show both:
  - inferred bump
  - override-applied bump
- Overrides should affect the prepared release state without requiring maintainers to add fake commits to `main`.

### Ambiguity Resolution Rules

- If a file exists primarily to support one plugin's content or fixtures, map it to that plugin rather than to `cli`.
- If a shared utility in `src/` changes behavior for all installs/conversions, treat it as a `cli` change even if the immediate motivation came from one plugin.
- If a change only updates docs, brainstorms, plans, or repo instructions, default to no release unless the repo intentionally adds docs-only release semantics later.
- When a new plugin is introduced in the future, add it as its own explicit component rather than folding it into `marketplace` or `cli`.

## Release Workflow Behavior

The release flow should have three distinct modes that share the same component-detection and metadata-rendering logic.

### Release PR Maintenance

- Runs automatically on pushes to `main`.
- Creates one release PR for the repo if none exists.
- Updates the existing open release PR when additional releasable changes land on `main`.
- Includes only components selected by release-intent parsing plus file ownership rules.
- Updates release-owned files only on the release PR branch, not directly on `main`.
- Never publishes npm, creates final GitHub releases, or tags versions as part of this maintenance step.

The maintained release PR should make these outputs visible:
- component version bumps
- draft root changelog entries
- release-owned metadata changes such as plugin version fields and computed counts

### Manual Dry Run

- Runs only through `workflow_dispatch`.
- Computes the same release result the current open release PR would contain, or would create if none exists.
- Produces a human-readable summary in workflow output and optionally an artifact.
- Validates component ownership, conventional release intent, metadata sync, count updates, and root changelog rendering.
- Does not push commits, create or update branches, merge PRs, publish packages, create tags, or create GitHub releases.

The dry-run summary should include:
- detected releasable components
- current version -> proposed version for each component
- draft root changelog entries
- metadata files that would change
- blocking validation failures and non-blocking warnings

### Actual Release Execution

- Happens only when the generated release PR is intentionally merged.
- The merge writes the release-owned version and changelog changes into `main`.
- Post-merge release automation then performs publish steps only for components included in that merged release.
- npm publish runs only when the `cli` component is part of the merged release.
- Non-CLI component releases still update canonical version surfaces and release notes even when no npm publish occurs.

### Safety Rules

- Ordinary feature merges to `main` must never publish by themselves.
- Dry run must remain side-effect free.
- Release PR maintenance, dry run, and post-merge release must use the same underlying release-state computation.
- Release-generated version and metadata writes must not recursively trigger a follow-up release that contains only its own generated churn.
- The release PR merge remains the auditable manual boundary; do not replace it with direct-to-main release commits from a manual workflow.

## Open Questions

### Resolved During Planning

- **Should release timing remain manual?** Yes. The release PR may be maintained automatically, but release happens only when the generated release PR is intentionally merged.
- **Should the release PR update automatically as more merges land on `main`?** Yes. This is a core batching behavior and should remain automatic.
- **Should release preview be distinct from release execution?** Yes. Dry run should be a side-effect-free manual workflow that previews the same release state without mutating branches or publishing anything.
- **Should root changelog history stay centralized?** Yes. The root `CHANGELOG.md` remains canonical to avoid fragmented history.
- **What changelog structure best fits the centralized model?** Top-level component-version entries in the root changelog are the preferred format. This keeps the file centralized while making independent version history readable.
- **What should drive component bumps?** Explicit file-to-component ownership rules. `src/**` drives `cli`, each `plugins/<name>/**` tree drives its own plugin, and `.claude-plugin/marketplace.json` drives `marketplace`.
- **How strict should conventional formatting be?** Conventional type should be required strongly enough for release tooling and release-note generation, but component scope should remain optional to match the repo's work style.
- **Should exceptional manual bumping be supported?** Yes. The release workflow should expose per-component patch/minor/major override controls rather than forcing synthetic commits to manipulate inferred versions.
- **Should marketplace version bump when only a listed plugin version changes?** No. Marketplace bumps are reserved for marketplace-level changes.
- **Should `release-docs` remain part of release authority?** No. It should be retired and replaced with narrow scripts.

### Deferred to Implementation

- What exact combination of `release-please` config and custom post-processing yields the chosen root changelog output without fighting the tool too hard?
- Should conventional-format enforcement happen on PR titles, squash-merge titles, commit messages, or a combination of them?
- Should `plugins/compound-engineering/CHANGELOG.md` be deleted outright or replaced with a short pointer note after the migration is stable?
- Should release preview be implemented by invoking `release-please` in dry-run mode directly, or by a repo-owned script that computes the same summary from component rules and current git state?
- Should final post-merge release execution live in a dedicated publish workflow keyed off merged release PR state, or remain in a renamed/adapted version of the current `publish.yml`?
- Should override inputs be encoded directly into release workflow inputs only, or also persisted into the generated release PR body for auditability?

## Implementation Units

- [x] **Unit 1: Define the new release component model and config scaffolding**

**Goal:** Replace the single-line semantic-release configuration with release-please-oriented repo configuration that expresses the four release components and their version surfaces.

**Requirements:** R1, R3, R4, R5, R15, R16, R17, R20

**Dependencies:** None

**Files:**
- Create: `.release-please-config.json`
- Create: `.release-please-manifest.json`
- Modify: `package.json`
- Modify: `.github/workflows/publish.yml`
- Delete or freeze: `.releaserc.json`

**Approach:**
- Define components for `cli`, `compound-engineering`, `coding-tutor`, and `marketplace`.
- Use manifest configuration so version lines are independent and untouched components do not bump.
- Rework the existing publish workflow so it no longer releases on every push to `main` and instead supports the release-please-driven model.
- Add package scripts for release preview, metadata sync, and validation so CI can call stable entrypoints instead of embedding release logic inline.
- Define the repo's release-intent contract: conventional type required, breaking changes explicit, component scope optional, file ownership authoritative.
- Define the override contract: per-component `auto | patch | minor | major`, with `auto` as the default.

**Patterns to follow:**
- Existing repo-level config files at the root (`package.json`, `.releaserc.json`, `.github/workflows/*.yml`)
- Current release ownership documented in `docs/solutions/plugin-versioning-requirements.md`

**Test scenarios:**
- A plugin-only change maps to that plugin component without implying CLI or marketplace bump.
- A marketplace metadata/catalog change maps to marketplace only.
- A `src/` CLI behavior change maps to the CLI component.
- A combined change yields multiple component updates inside one release PR.
- A title like `fix: adjust ce:plan-beta wording` remains valid without component scope and still produces the right component mapping from files.
- A manual override can promote an inferred patch bump for one component to minor without affecting unrelated components.

**Verification:**
- The repo contains a single authoritative release configuration model for all versioned components.
- The old automatic-on-push semantic-release path is removed or inert.
- Package scripts exist for preview/sync/validate entrypoints.
- Release intent rules are documented without forcing repetitive component scoping on routine CE work.

- [x] **Unit 2: Build repo-owned release scripts for metadata sync, counts, and preview**

**Goal:** Replace `release-docs` and ad-hoc release bookkeeping with explicit scripts that compute release-owned metadata updates and produce dry-run summaries.

**Requirements:** R10, R11, R12, R13, R14, R18, R19

**Dependencies:** Unit 1

**Files:**
- Create: `scripts/release/sync-metadata.ts`
- Create: `scripts/release/render-root-changelog.ts`
- Create: `scripts/release/preview.ts`
- Create: `scripts/release/validate.ts`
- Modify: `package.json`

**Approach:**
- `sync-metadata.ts` should own count calculation and synchronized writes to release-owned metadata fields such as manifest descriptions and version mirrors.
- `render-root-changelog.ts` should generate the centralized root changelog entries in the agreed component-version format.
- `preview.ts` should summarize proposed component bumps, generated changelog entries, affected files, and validation blockers without mutating the repo or publishing anything.
- `validate.ts` should provide a stable CI check for component counts, manifest consistency, and changelog formatting expectations.
- `preview.ts` should accept optional per-component overrides and display both inferred and effective bump levels in its summary output.

**Patterns to follow:**
- TypeScript/Bun scripting already used elsewhere in the repo
- Root package scripts as stable repo entrypoints

**Test scenarios:**
- Count calculation updates plugin descriptions correctly when agents/skills change.
- Preview output includes only changed components.
- Preview mode performs no file writes.
- Validation fails when manifest counts or version ownership rules drift.
- Root changelog renderer produces component-version entries with stable ordering and headings.
- Preview output clearly distinguishes inferred bump from override-applied bump when an override is used.

**Verification:**
- `release-docs` responsibilities are covered by explicit scripts.
- Dry run can run in CI without side effects.
- Metadata/count drift can be detected deterministically before release.

- [x] **Unit 3: Wire release PR maintenance and manual release execution in CI**

**Goal:** Establish one standing release PR for the repo that updates automatically as new releasable work lands, while keeping the actual release action manual.

**Requirements:** R1, R2, R3, R13, R14, R19

**Dependencies:** Units 1-2

**Files:**
- Create: `.github/workflows/release-pr.yml`
- Create: `.github/workflows/release-preview.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/publish.yml`

**Approach:**
- `release-pr.yml` should run on push to `main` and maintain the standing release PR for the whole repo.
- The actual release event should remain merge of that generated release PR; no automatic publish should happen on ordinary merges to `main`.
- `release-preview.yml` should use `workflow_dispatch` with explicit dry-run inputs and publish a human-readable summary to workflow logs and/or artifacts.
- Decide whether npm publish remains in `publish.yml` or moves into the release-please-driven workflow, but ensure it runs only when the CLI component is actually releasing.
- Keep normal `ci.yml` focused on verification, not publishing.
- Add lightweight validation for release-intent formatting on PR or merge titles, without requiring component scopes.
- Ensure release PR maintenance, dry run, and post-merge publish all call the same underlying release-state computation so they cannot drift.
- Add workflow inputs for per-component bump overrides and ensure they can shape the prepared release state when explicitly invoked by a maintainer or AI agent.

**Patterns to follow:**
- Existing GitHub workflow layout in `.github/workflows/`
- Current manual `workflow_dispatch` presence in `publish.yml`

**Test scenarios:**
- A normal merge to `main` updates or creates the release PR but does not publish.
- A manual dry-run workflow produces a summary with no tags, commits, or publishes.
- Merging the release PR results in release creation for changed components only.
- A release that excludes CLI does not attempt npm publish.
- A PR titled `feat: add new plan-beta handoff guidance` passes validation without a component scope.
- A PR titled with an explicit contradictory scope can be surfaced as a warning or failure if file ownership clearly disagrees.
- A second releasable merge to `main` updates the existing open release PR instead of creating a competing release PR.
- A dry run executed while a release PR is open reports the same proposed component set and versions as the PR contents.
- Merging a release PR does not immediately create a follow-up release PR containing only release-generated metadata churn.
- A manual workflow can override one component to `major` while leaving other components on inferred `auto`.

**Verification:**
- Maintainers can inspect the current release PR to see the pending release batch.
- Dry-run and actual-release paths are distinct and safe.
- The release system is triggerable through CI without local maintainer-only tooling.
- The same proposed release state is visible consistently across release PR maintenance, dry run, and post-merge release execution.
- Exceptional release overrides are possible without synthetic commits on `main`.

- [x] **Unit 4: Centralize changelog ownership and retire plugin-local canonical release history**

**Goal:** Make the root changelog the only canonical changelog while preserving history and preventing future fragmentation.

**Requirements:** R6, R7, R8, R9

**Dependencies:** Units 1-3

**Files:**
- Modify: `CHANGELOG.md`
- Modify or replace: `plugins/compound-engineering/CHANGELOG.md`
- Optionally create: `plugins/coding-tutor/CHANGELOG.md` only if needed as a non-canonical pointer or future placeholder

**Approach:**
- Add a migration note near the top of the root changelog clarifying that it is the canonical changelog for the repo and future releases.
- Render future canonical entries into the root file as top-level component-version entries using the agreed heading shape.
- Stop writing future canonical entries into `plugins/compound-engineering/CHANGELOG.md`.
- Replace the plugin-local changelog with either a short pointer note or a frozen historical file, depending on the least confusing path discovered during implementation.
- Keep existing root changelog entries intact; do not attempt to rewrite historical releases into a new structure retroactively.

**Patterns to follow:**
- Existing Keep a Changelog-style root file
- Brainstorm decision favoring centralized history over fragmented per-plugin changelogs

**Test scenarios:**
- Historical root changelog entries remain intact after migration.
- New generated entries appear in the root changelog in the intended component-version format.
- Multiple components released on the same day appear as separate adjacent entries rather than being merged into one release-event block.
- Component-specific notes do not leak unrelated changes into the wrong entry.
- Plugin-local CE changelog no longer acts as a live release target.

**Verification:**
- A maintainer reading the repo can identify one canonical changelog without ambiguity.
- No history is lost or silently rewritten.

- [x] **Unit 5: Remove legacy release guidance and replace it with the new authority model**

**Goal:** Update repo instructions and docs so contributors follow the new release system rather than obsolete semantic-release or `release-docs` guidance.

**Requirements:** R10, R11, R12, R19, R20

**Dependencies:** Units 1-4

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `plugins/compound-engineering/AGENTS.md`
- Modify: `docs/solutions/plugin-versioning-requirements.md`
- Delete: `.claude/commands/release-docs.md` or replace with a deprecation stub

**Approach:**
- Update all contributor-facing docs so they describe release PR maintenance, manual release merge, centralized root changelog ownership, and the new scripts for sync/preview/validate.
- Remove references that tell contributors to run `release-docs` or to rely on stale docs-generation assumptions.
- Keep the contributor rule that release-owned metadata should not be hand-bumped in ordinary PRs, but point that rule at release automation rather than a local maintainer slash command.
- Document the release-intent policy explicitly: conventional type required, component scope optional, breaking changes explicit.

**Patterns to follow:**
- Existing contributor guidance files already used as authoritative workflow docs

**Test scenarios:**
- No user-facing doc still points to `release-docs` as a required release workflow.
- No contributor guidance still claims plugin-local changelog authority for CE.
- Release ownership guidance is consistent across root and plugin-level instruction files.

**Verification:**
- A new maintainer can understand the release process from docs alone without hidden local workflows.
- Docs no longer encode obsolete repo structure or stale release surfaces.

- [x] **Unit 6: Add automated coverage for component detection, metadata sync, and release preview**

**Goal:** Protect the new release model against regression by testing the component rules, metadata updates, and preview behavior.

**Requirements:** R4, R5, R12, R13, R14, R15, R16, R17

**Dependencies:** Units 1-5

**Files:**
- Create: `tests/release-metadata.test.ts`
- Create: `tests/release-preview.test.ts`
- Create: `tests/release-components.test.ts`
- Modify: `package.json`

**Approach:**
- Add fixture-driven tests for file-change-to-component mapping.
- Snapshot or assert dry-run summaries for representative release cases.
- Verify metadata sync updates only expected files and counts.
- Cover the marketplace-specific rule so plugin-only version changes do not trigger marketplace bumps.
- Encode ambiguity-resolution cases explicitly so future contributors can add new plugins without guessing which component should bump.
- Add validation coverage for release-intent parsing so conventional titles remain required but optional scopes remain non-blocking when omitted.
- Add override-path coverage so manual bump overrides remain scoped, visible, and side-effect free in preview mode.

**Patterns to follow:**
- Existing top-level Bun test files under `tests/`
- Current fixture-driven testing style used by converters and writers

**Test scenarios:**
- Change only `plugins/coding-tutor/**` and confirm only `coding-tutor` bumps.
- Change only `plugins/compound-engineering/**` and confirm only CE bumps.
- Change only marketplace catalog metadata and confirm only marketplace bumps.
- Change only `src/**` and confirm only CLI bumps.
- Combined `src/**` + plugin change yields both component bumps.
- Change docs only and confirm no component bumps by default.
- Add a new plugin directory plus marketplace catalog entry and confirm new-plugin + marketplace bump without forcing unrelated existing plugin bumps.
- Dry-run preview lists the same components that the component detector identifies.
- Conventional `fix:` / `feat:` titles without scope pass validation.
- Explicit breaking-change markers are recognized.
- Optional scopes, when present, can be compared against file ownership without becoming mandatory.
- Override one component in preview and confirm only that component's effective bump changes.
- Override does not create phantom bumps for untouched components.

**Verification:**
- The release model is covered by automated tests rather than only CI trial runs.
- Future plugin additions can follow the same component-detection pattern with low risk.

## System-Wide Impact

- **Interaction graph:** Release config, CI workflows, metadata-bearing JSON files, contributor docs, and changelog generation are all coupled. The plan deliberately separates configuration, scripting, release PR maintenance, and documentation cleanup so one layer can change without obscuring another.
- **Error propagation:** Release metadata drift should fail in preview/validation before a release PR or publish path proceeds. CI needs clear failure reporting because release mistakes affect user-facing version surfaces.
- **State lifecycle risks:** Partial migration is risky. Running old and new release authorities simultaneously could double-write changelog entries, version fields, or publish flows. The migration should explicitly disable the old path before trusting the new one.
- **API surface parity:** Contributor-facing workflows in `AGENTS.md`, `CLAUDE.md`, and plugin-level instructions must all describe the same release authority model or maintainers will continue using legacy local commands.
- **Integration coverage:** Unit tests for scripts are not enough. The workflow interaction between release PR maintenance, dry-run preview, and conditional CLI publish needs at least one integration-level verification path in CI.

## Risks & Dependencies

- `release-please` may not natively express the exact root changelog shape you want; custom rendering may be required.
- If old semantic-release and new release-please flows overlap during migration, duplicate or conflicting release writes are likely.
- The distinction between version-bearing metadata and descriptive/count-bearing metadata must stay explicit; otherwise scripts may overwrite user-edited documentation that should remain manual.
- Release preview quality matters. If dry run is vague or noisy, maintainers will bypass it and the manual batching goal will weaken.
- Removing `release-docs` may expose other hidden docs/deploy assumptions, especially if GitHub Pages or docs generation still depend on stale paths.

## Documentation / Operational Notes

- Document one canonical release path: release PR maintenance on push to `main`, dry-run preview on manual dispatch, actual release on merge of the generated release PR.
- Document one canonical changelog: root `CHANGELOG.md`.
- Document one rule for contributors: ordinary feature PRs do not hand-bump release-owned versions or changelog entries.
- Add a short migration note anywhere old release instructions are likely to be rediscovered, especially around `plugins/compound-engineering/CHANGELOG.md` and the removed `release-docs` command.
- After merge, run one live GitHub Actions validation pass to confirm `release-please` tag/output wiring and conditional CLI publish behavior end to end.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-17-release-automation-requirements.md](docs/brainstorms/2026-03-17-release-automation-requirements.md)
- Existing release workflow: `.github/workflows/publish.yml`
- Existing semantic-release config: `.releaserc.json`
- Existing release-owned guidance: `docs/solutions/plugin-versioning-requirements.md`
- Legacy repo-maintenance command to retire: `.claude/commands/release-docs.md`
- Install behavior reference: `src/commands/install.ts`
- External docs: `release-please` manifest and release PR documentation, GitHub Actions `workflow_dispatch`
