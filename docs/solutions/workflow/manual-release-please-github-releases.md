---
title: "Manual release-please with GitHub Releases for plugin and marketplace releases"
category: workflow
date: 2026-03-17
last_refreshed: 2026-09-02
created: 2026-03-17
severity: medium
module: release-automation
problem_type: workflow_issue
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

The repo uses release-please manifest mode with one standing release PR: release PR maintenance is automatic on pushes to `main`, the release itself happens only when a maintainer merges that PR, and GitHub Releases (`compound-engineering-vX.Y.Z`, `marketplace-vX.Y.Z`, `cursor-marketplace-vX.Y.Z`) are the canonical release-notes surface. AGENTS.md "Release versioning" and "Commit Conventions" state the contributor-facing rules; this doc keeps the two constraints behind them.

## Why GitHub Releases is canonical: the `..` changelog-path constraint

Release-please does not allow a package `changelog-path` that traverses upward with `..`. A multi-component repo therefore cannot force subpackage release entries back into one shared root changelog with `../../CHANGELOG.md` or `../CHANGELOG.md`. Rather than maintain three committed changelogs, GitHub Releases became the canonical surface and root `CHANGELOG.md` is only a pointer to it. `src/release/config.ts` (`validateReleasePleaseConfig`, run by `bun run release:validate`) rejects an upward-relative path so the mistake fails in CI before the workflow reaches GitHub Actions. Do not try to route multi-component release notes back into one committed file.

## Component ownership

File paths, not PR-title scopes, decide which component a change bumps (`FILE_COMPONENT_MAP` in `src/release/components.ts`):

| Component | Paths |
|---|---|
| `compound-engineering` (root package = the plugin: CLI, root and native harness manifests, `skills/`) | `skills/`, `src/`, `tests/`, `package.json`, `plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.codex-plugin/`, `.kimi-plugin/plugin.json`, `.grok-plugin/`, `.devin-plugin/plugin.json`, `.opencode/`, `.cline/`, `.pi/`, `.agy/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`. Extra-files such as `.omp-plugin/marketplace.json` ride a root bump; they do not themselves schedule one. |
| `marketplace` | `.claude-plugin/marketplace.json` |
| `cursor-marketplace` | `.cursor-plugin/marketplace.json` |

Consequences worth knowing:

- A `fix:` touching `.codex-plugin/plugin.json`, `.kimi-plugin/plugin.json`, or root `plugin.json` bumps `compound-engineering`, and `release:validate` requires every root package/plugin manifest version to stay aligned.
- A marketplace catalog edit bumps only `marketplace`; plugin versions do not bump because the catalog changed.
- `refactor:` appears in release notes under Refactoring but is not release-driving unless breaking or explicitly overridden. Docs-only, CI-only, and build-only changes are non-releasable unless a releasable component path also changed.

## Plugin-scoped contributor rule

Embedded plugin versions across every root and native manifest, the `compound-engineering` entry in `.claude-plugin/marketplace.json`, and release sections in `CHANGELOG.md` are release-owned. Multiple PRs may merge before a release, so a version guessed inside a feature PR is wrong more often than right and produced the drift in `release-please-version-drift-recovery.md`. Feature PRs change inventory (`README.md` counts and tables, `plugin.json` description) and run `bun run release:validate`; they never pick the version.

## Related docs

- `docs/solutions/workflow/release-please-version-drift-recovery.md`
- `docs/solutions/adding-converter-target-providers.md`
- `AGENTS.md`
