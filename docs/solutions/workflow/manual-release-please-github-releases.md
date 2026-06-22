---
title: "Manual release-please with GitHub Releases for plugin and marketplace releases"
category: workflow
date: 2026-03-17
last_refreshed: 2026-06-20
created: 2026-03-17
severity: process
component: release-automation
tags:
  - release-please
  - github-releases
  - marketplace
  - plugin-versioning
  - ci
  - automation
  - release-process
---

# Manual release-please with GitHub Releases for plugin and marketplace releases

## Problem

The repo had one automated release path for the npm CLI, but the actual release model was fragmented across root package metadata, plugin manifests, marketplace catalogs, and release-note surfaces. That made it easy for plugin manifests, marketplace metadata, and computed counts to drift out of sync.

## Solution

Use release-please manifest mode with one standing release PR and explicit component ownership.

Current components:

- `compound-engineering` package/plugin at root package path `.`
- `marketplace` for `.claude-plugin/marketplace.json`
- `cursor-marketplace` for `.cursor-plugin/marketplace.json`

The root `compound-engineering` package is now the plugin package. It owns the CLI/tooling code, root plugin manifests, native harness metadata, and `skills/`.

Key decisions:

- Keep release timing manual: the actual release happens when the generated release PR is merged.
- Keep release PR maintenance automatic on pushes to `main`.
- Use GitHub release PRs and GitHub Releases as the canonical release-notes surface.
- Keep PR title scopes optional; use file paths to determine affected components.
- Keep `AGENTS.md` canonical and `CLAUDE.md`/`GEMINI.md` as compatibility shims.

## Critical constraint discovered

Release-please does not allow package changelog paths that traverse upward with `..`. A multi-component repo cannot force subpackage release entries back into one shared root changelog file using `../../CHANGELOG.md` or `../CHANGELOG.md`.

The practical fix:

- Treat GitHub Releases as the canonical release-notes surface.
- Keep root `CHANGELOG.md` as a pointer to GitHub Releases.
- Validate `.github/release-please-config.json` in CI so unsupported changelog paths fail before the workflow reaches GitHub Actions.

## Resulting release process

1. Normal feature PRs merge to `main`.
2. The `Release PR` workflow updates one standing release PR for the repo.
3. Additional releasable merges accumulate into that release PR.
4. Maintainers can inspect the standing release PR or run the manual preview flow.
5. The actual release happens only when the generated release PR is merged.
6. Component-specific release notes are published via GitHub Releases such as `compound-engineering-vX.Y.Z`, `marketplace-vX.Y.Z`, and `cursor-marketplace-vX.Y.Z`.

## Component rules

PR title determines release intent:

- `feat` -> minor
- `fix`, `perf`, `revert` -> patch
- `refactor` -> visible in release notes under `Refactoring`, but not release-driving unless breaking or explicitly overridden
- `!` -> major; do not use without explicit maintainer confirmation

File paths determine component ownership:

| Component | Paths |
|---|---|
| `compound-engineering` | `skills/`, `src/`, `tests/`, `package.json`, root plugin manifests, `.opencode/`, `.pi/`, `gemini-extension.json`, `README.md`, instruction shims |
| `marketplace` | `.claude-plugin/marketplace.json` |
| `cursor-marketplace` | `.cursor-plugin/marketplace.json` |

Docs-only, CI-only, and build-only changes are non-releasable unless their conventional type says otherwise and a releasable component path changed.

## Examples

### Plugin-only release

- A `fix:` PR changes `skills/ce-plan/SKILL.md`
- `compound-engineering` bumps
- marketplace versions remain untouched

### Root packaging release

- A `fix:` PR changes `.codex-plugin/plugin.json` or `gemini-extension.json`
- `compound-engineering` bumps because those files are root package/plugin extra-files
- `bun run release:validate` must pass so all root package/plugin versions remain aligned

### Marketplace-only release

- A marketplace catalog entry changes in `.claude-plugin/marketplace.json`
- `marketplace` bumps
- plugin versions do not need to bump just because the catalog changed

## Release notes model

- Pending release state is visible in one standing release PR.
- Published release history is canonical in GitHub Releases.
- Root `CHANGELOG.md` is only a pointer to GitHub Releases and is not the canonical source for new releases.

## Key files

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
- `GEMINI.md`

## Prevention

- Keep release authority in CI only.
- Do not reintroduce local maintainer-only release flows or hand-managed version bumps.
- Keep root package/plugin manifests aligned through release-please extra-files, not manual edits.
- Do not try to force multi-component release notes back into one committed changelog file.
- Run `bun run release:validate` whenever plugin inventories, release-owned descriptions, marketplace entries, or root plugin manifests may have changed.
- Prefer maintained CI actions over custom validation when a generic concern does not need repo-specific logic.

## Validation checklist

Before merge:

- Confirm PR title passes semantic validation.
- Run `bun test`.
- Run `bun run release:validate`.
- Run `bun run release:preview ...` for representative changed files when release-component selection is non-obvious.

Before merging a generated release PR:

- Verify untouched components are unchanged.
- Verify marketplace components only bump for marketplace-level changes.
- Verify root package/plugin extra-files share the same version.

After merging a generated release PR:

- Confirm no recursive follow-up release PR appears containing only generated churn.
- Confirm the expected component GitHub Releases were created and release-owned metadata matches the released components.

## Related docs

- `docs/solutions/plugin-versioning-requirements.md`
- `docs/solutions/adding-converter-target-providers.md`
- `AGENTS.md`
