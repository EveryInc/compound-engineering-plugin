---
title: "Manual release-please with GitHub Releases for multi-component plugin and marketplace releases"
category: workflow
date: 2026-03-17
created: 2026-03-17
severity: process
component: release-automation
tags:
  - release-please
  - semantic-release
  - github-releases
  - marketplace
  - plugin-versioning
  - ci
  - automation
  - release-process
---

# Manual release-please with GitHub Releases for multi-component plugin and marketplace releases

## Problem

The repo had one automated release path for the npm CLI, but the actual release model was fragmented across:

- root-only `semantic-release`
- a local maintainer workflow via `release-docs`
- multiple version-bearing metadata files
- inconsistent release-note ownership

That made it hard to batch merges on `main`, hard for multiple maintainers to share release responsibility, and easy for release notes, plugin manifests, marketplace metadata, and computed counts to drift out of sync.

## Root Cause

Release intent, component ownership, release-note ownership, and metadata synchronization were split across different systems:

- PRs merged to `main` were too close to an actual publish event
- only the root CLI had a real CI-owned release path
- plugin and marketplace releases depended on local knowledge and stale docs
- the repo had multiple release surfaces (`cli`, `compound-engineering`, `coding-tutor`, `marketplace`) but no single release authority

An adjacent contributor-guidance problem made this worse: root `CLAUDE.md` had become a large, stale, partially duplicated instruction file, while `AGENTS.md` was the better canonical repo guidance surface.

## Solution

Move the repo to a manual `release-please` model with one standing release PR and explicit component ownership.

Key decisions:

- Use `release-please` manifest mode for four release components:
  - `cli`
  - `compound-engineering`
  - `coding-tutor`
  - `marketplace`
- Keep release timing manual: the actual release happens when the generated release PR is merged.
- Keep release PR maintenance automatic on pushes to `main`.
- Use GitHub release PRs and GitHub Releases as the canonical release-notes surface for new releases.
- Replace `release-docs` with repo-owned scripts for preview, metadata sync, and validation.
- Keep PR title scopes optional; use file paths to determine affected components.
- Make `AGENTS.md` canonical and reduce root `CLAUDE.md` to a compatibility shim.

## Critical Constraint Discovered

`release-please` does not allow package changelog paths that traverse upward with `..`.

The failed first live run exposed this directly:

- `release-please failed: illegal pathing characters in path: plugins/compound-engineering/../../CHANGELOG.md`

That means a multi-component repo cannot force subpackage release entries back into one shared root changelog file using `changelog-path` values like:

- `../../CHANGELOG.md`
- `../CHANGELOG.md`

The practical fix was:

- set `skip-changelog: true` for all components in `.github/release-please-config.json`
- treat GitHub Releases as the canonical release-notes surface
- reduce `CHANGELOG.md` to a simple pointer file
- add repo validation to catch illegal upward changelog paths before merge

## Resulting Release Process

After the migration:

1. Normal feature PRs merge to `main`.
2. The `Release PR` workflow updates one standing release PR for the repo.
3. Additional releasable merges accumulate into that same release PR.
4. Maintainers can inspect the standing release PR or run the manual preview flow.
5. The actual release happens only when the generated release PR is merged.
6. npm publish runs only when the `cli` component is part of that release.
7. Component-specific release notes are published via GitHub releases such as `cli-vX.Y.Z` and `compound-engineering-vX.Y.Z`.

## Component Rules

- PR title determines release intent:
  - `feat` => minor
  - `fix` / `perf` / `refactor` / `revert` => patch
  - `!` => major
- File paths determine component ownership:
  - `src/**`, `package.json`, `bun.lock`, `tests/cli.test.ts` => `cli`
  - `plugins/compound-engineering/**` => `compound-engineering`
  - `plugins/coding-tutor/**` => `coding-tutor`
  - `.claude-plugin/marketplace.json` => `marketplace`
- Optional title scopes are advisory only.

This keeps titles simple while still letting the release system decide the correct component bump.

## Examples

### One merge lands, but no release is cut yet

- A `fix:` PR merges to `main`
- The standing release PR updates
- Nothing is published yet

### More work lands before release

- A later `feat:` PR merges to `main`
- The same open release PR updates to include both changes
- The pending bump can increase based on total unreleased work

### Plugin-only release

- A change lands only under `plugins/coding-tutor/**`
- Only `coding-tutor` should bump
- `compound-engineering`, `marketplace`, and `cli` should remain untouched
- npm publish should not run unless `cli` is also part of that release

### Marketplace-only release

- A new plugin is added to the catalog or marketplace metadata changes
- `marketplace` bumps
- Existing plugin versions do not need to bump just because the catalog changed

### Exceptional manual bump

- Maintainers decide the inferred bump is too small
- They use the preview/release override path instead of making fake commits
- The release still goes through the same CI-owned process

## Release Notes Model

- Pending release state is visible in one standing release PR.
- Published release history is canonical in GitHub Releases.
- Component identity is carried by component-specific tags such as:
  - `cli-vX.Y.Z`
  - `compound-engineering-vX.Y.Z`
  - `coding-tutor-vX.Y.Z`
  - `marketplace-vX.Y.Z`
- Root `CHANGELOG.md` is only a pointer to GitHub Releases and is not the canonical source for new releases.

## Key Files

- `.github/release-please-config.json`
- `.github/.release-please-manifest.json`
- `.github/workflows/release-pr.yml`
- `.github/workflows/release-preview.yml`
- `.github/workflows/ci.yml`
- `src/release/components.ts`
- `src/release/metadata.ts`
- `scripts/release/preview.ts`
- `scripts/release/sync-metadata.ts`
- `scripts/release/validate.ts`
- `AGENTS.md`
- `CLAUDE.md`

## Prevention

- Keep release authority in CI only.
- Do not reintroduce local maintainer-only release flows or hand-managed version bumps.
- Keep `AGENTS.md` canonical. If a tool still needs `CLAUDE.md`, use it only as a compatibility shim.
- Do not try to force multi-component release notes back into one committed changelog file if the tool does not support it natively.
- Validate `.github/release-please-config.json` in CI so unsupported changelog-path values fail before the workflow reaches GitHub Actions.
- Run `bun run release:validate` whenever plugin inventories, release-owned descriptions, or marketplace entries may have changed.
- Prefer maintained CI actions over custom validation when a generic concern does not need repo-specific logic.

## Validation Checklist

Before merge:

- Confirm PR title passes semantic validation.
- Run `bun test`.
- Run `bun run release:validate`.
- Run `bun run release:preview ...` for representative changed files.

After merging release-system changes to `main`:

- Verify exactly one standing release PR is created or updated.
- Confirm ordinary merges to `main` do not publish npm directly.
- Inspect the release PR for correct component selection, versions, and metadata updates.

Before merging a generated release PR:

- Verify untouched components are unchanged.
- Verify `marketplace` only bumps for marketplace-level changes.
- Verify plugin-only changes do not imply `cli` unless `src/` also changed.

After merging a generated release PR:

- Confirm npm publish runs only when `cli` is part of the release.
- Confirm no recursive follow-up release PR appears containing only generated churn.
- Confirm the expected component GitHub releases were created and that release-owned metadata matches the released components.

## Related Docs

- `docs/solutions/plugin-versioning-requirements.md`
- `docs/solutions/adding-converter-target-providers.md`
- `AGENTS.md`
- `plugins/compound-engineering/AGENTS.md`
- `docs/specs/kiro.md`
