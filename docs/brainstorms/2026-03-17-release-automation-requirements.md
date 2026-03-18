---
date: 2026-03-17
topic: release-automation
---

# Release Automation and Changelog Ownership

## Problem Frame

The repository currently has one automated release flow for the npm CLI, but the broader release story is split across CI, manual maintainer workflows, stale docs, and multiple version surfaces. That makes it hard to batch releases intentionally, hard for multiple maintainers to share release responsibility, and easy for changelogs, plugin manifests, and derived metadata like component counts to drift out of sync. The goal is to move to a release model that supports intentional batching, independent component versioning, centralized history, and CI-owned release authority without forcing version bumps for untouched plugins.

## Requirements

- R1. The release process must be manually triggered; merging to `main` must not automatically publish a release.
- R2. The release system must support batching: releasable merges may accumulate on `main` until maintainers decide to cut a release.
- R3. The release system must maintain a single release PR for the whole repo that stays open until merged and automatically accumulates additional releasable changes merged to `main`.
- R4. The release system must support independent version bumps for these components: `cli`, `compound-engineering`, `coding-tutor`, and `marketplace`.
- R5. The release system must not bump untouched plugins or unrelated components.
- R6. The release system must preserve one centralized root `CHANGELOG.md` as the canonical changelog for the repository.
- R7. The root changelog must record releases as top-level entries per component version, rather than requiring separate changelog files per plugin.
- R8. Existing root changelog history must be preserved during the migration; the new release model must not discard or rewrite historical entries in a way that loses continuity.
- R9. `plugins/compound-engineering/CHANGELOG.md` must no longer be treated as the canonical changelog after the migration.
- R10. The release process must replace the current `release-docs` workflow; `release-docs` must no longer act as a release authority or required release step.
- R11. Narrow scripts must replace `release-docs` responsibilities, including metadata synchronization, count calculation, docs generation where still needed, and validation.
- R12. Release automation must be the sole authority for version bumps, changelog writes, and computed metadata updates such as counts of agents, skills, commands, or similar release-owned descriptions.
- R13. The release flow must support a dry-run mode that summarizes what would happen without publishing, tagging, or committing release changes.
- R14. Dry run output must clearly summarize which components would release, the proposed version bumps, the changelog entries that would be added, and any blocking validation failures.
- R15. Marketplace version bumps must happen only for marketplace-level changes, such as marketplace metadata changes or adding/removing plugins from the catalog.
- R16. Updating a plugin version alone must not require a marketplace version bump.
- R17. Plugin-only content changes must be releasable without requiring a CLI version bump when the CLI code itself has not changed.
- R18. The release model must remain compatible with the current install behavior where `bunx @every-env/compound-plugin install ...` runs the npm CLI but fetches named plugin content from the GitHub repository at runtime.
- R19. The release process must be triggerable by a maintainer or an AI agent through CI without requiring a local maintainer-only skill.
- R20. The resulting model must scale to future plugins without requiring the repo to special-case `compound-engineering` forever.
- R21. The release model must continue to rely on conventional release intent signals (`feat`, `fix`, breaking changes, etc.), but component scopes in commit or PR titles must remain optional rather than required.
- R22. Release automation must infer component ownership primarily from changed files, not from commit or PR title scopes alone.
- R23. The repo should enforce parseable conventional PR or merge titles strongly enough for release tooling to classify change type, while avoiding mandatory component scoping on every change.
- R24. The manual CI-driven release workflow must support explicit bump overrides for exceptional cases, at least `patch`, `minor`, and `major`, without requiring maintainers to create fake or empty commits purely to coerce a release.
- R25. Bump overrides must be expressible per component rather than only as a repo-wide override.
- R26. Dry run output must clearly show both the inferred bump and any applied manual override for each affected component.

## Success Criteria

- Maintainers can let multiple PRs merge to `main` without immediately cutting a release.
- At any point, maintainers can inspect a release PR or dry run and understand what would ship next.
- A change to `coding-tutor` does not force a version bump to `compound-engineering`.
- A plugin version bump does not force a marketplace version bump unless marketplace-level files changed.
- Release-owned metadata and counts stay in sync without relying on a local slash command.
- The root changelog remains readable and continuous before and after the migration.

## Scope Boundaries

- This work does not require changing how Claude Code itself consumes plugin and marketplace versions.
- This work does not require solving end-user auto-update discovery for non-Claude harnesses in v1.
- This work does not require adding dedicated per-plugin changelog files as the canonical history model.
- This work does not require immediate future automation of release timing; manual release remains the default.

## Key Decisions

- **Use `release-please` rather than a single release-line flow**: The repo now has multiple independently versioned components, and the release PR model matches the need to batch merges on `main` until a release is intentionally cut.
- **One release PR for the whole repo**: Centralized release visibility matters more than separate PRs per component, and a single release PR can still carry multiple component bumps.
- **Manual release timing**: The release process should prepare and accumulate the next release automatically, but the decision to cut that release should remain explicit.
- **Root changelog stays canonical**: Centralized history is more important than per-plugin changelog isolation for the current repo shape.
- **Top-level changelog entries per component version**: This preserves one changelog file while keeping independent component version history readable.
- **Retire `release-docs`**: Its responsibilities are too broad, stale, and conflated. Release logic, docs logic, and metadata synchronization should be separated.
- **Scripts for narrow responsibilities**: Explicit scripts are easier to validate, automate, and reuse from CI than a local repo-maintenance skill.
- **Marketplace version is catalog-scoped**: Plugin version bumps alone should not imply a marketplace release.
- **Conventional type required, component scope optional**: Release intent should still come from conventional commit semantics, but requiring `(compound-engineering)` on most repo changes would add unnecessary wording overhead. Component detection should remain file-driven.
- **Manual bump override is an explicit escape hatch**: Automatic bump inference remains the default, but maintainers should be able to override a component's release level in CI for exceptional cases without awkward synthetic commits.

## Dependencies / Assumptions

- The current install flow for named plugins continues to fetch plugin content from GitHub at runtime, so plugin content releases can remain independent from CLI releases unless CLI behavior also changes.
- Claude Code already respects marketplace and plugin versions, so those version surfaces remain meaningful release signals.

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Should the release PR be updated automatically on every push to `main`, or via a manually triggered maintenance workflow that refreshes the release PR state on demand?
- [Affects R7][Technical] What exact root changelog format best balances readability and automation for multiple component-version entries in one file?
- [Affects R11][Technical] Which responsibilities should become distinct scripts versus steps embedded directly in the CI workflow?
- [Affects R12][Technical] Which release-owned metadata fields should be computed automatically versus validated and left untouched when no count change is needed?
- [Affects R9][Technical] Should `plugins/compound-engineering/CHANGELOG.md` be deleted, frozen, or replaced with a short pointer note after the migration?
- [Affects R21][Technical] Should conventional-format enforcement happen on PR titles, squash-merge titles, commits, or some combination of them?
- [Affects R24][Technical] Should manual bump overrides be implemented as workflow inputs that shape the generated release PR directly, or as an internal generated release-control commit on the release branch only?

## Next Steps

→ `/ce:plan` for structured implementation planning
