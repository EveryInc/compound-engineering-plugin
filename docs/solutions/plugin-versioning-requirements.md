---
title: Plugin Versioning and Documentation Requirements
category: workflow
tags: [versioning, changelog, readme, plugin, documentation]
created: 2025-11-24
date: 2026-03-17
severity: process
component: plugin-development
---

# Plugin Versioning and Documentation Requirements

## Problem

When making changes to the compound-engineering plugin, documentation can get out of sync with the actual components (agents, commands, skills). This leads to confusion about what's included in each version and makes it difficult to track changes over time.

This document applies to release-owned plugin metadata and changelog surfaces for the `compound-engineering` plugin, not ordinary feature work.

The broader repo-level release model now lives in:

- `docs/solutions/workflow/manual-release-please-and-centralized-changelog.md`

That doc covers the standing release PR, component ownership across `cli`, `compound-engineering`, `coding-tutor`, and `marketplace`, and the canonical root changelog model. This document stays narrower: it is the plugin-scoped reminder for contributors changing `plugins/compound-engineering/**`.

## Solution

**Routine PRs should not cut plugin releases.**

Embedded plugin versions are release-owned metadata. Release automation prepares the next versions and changelog entries after deciding which merged changes ship together. Because multiple PRs may merge before release, contributors should not guess release versions inside individual PRs.

Contributors should:

1. **Avoid release bookkeeping in normal PRs**
   - Do not manually bump `plugins/compound-engineering/.claude-plugin/plugin.json`
   - Do not manually bump the `compound-engineering` entry in `.claude-plugin/marketplace.json`
   - Do not cut release sections in the root `CHANGELOG.md`

2. **Keep substantive docs accurate**
   - Verify component counts match actual files
   - Verify agent/command/skill tables are accurate
   - Update descriptions if functionality changed
   - Run `bun run release:validate` when plugin inventories or release-owned descriptions may have changed

## Checklist for Plugin Changes

```markdown
Before committing changes to compound-engineering plugin:

- [ ] No manual version bump in `plugins/compound-engineering/.claude-plugin/plugin.json`
- [ ] No manual version bump in the `compound-engineering` entry inside `.claude-plugin/marketplace.json`
- [ ] No manual release section added to `CHANGELOG.md`
- [ ] README.md component counts verified
- [ ] README.md tables updated (if adding/removing/renaming)
- [ ] plugin.json description updated (if component counts changed)
- [ ] `bun run release:validate` passes
```

## File Locations

- Plugin version is release-owned: `plugins/compound-engineering/.claude-plugin/plugin.json`
- Marketplace entry is release-owned: `.claude-plugin/marketplace.json`
- Changelog release sections are release-owned: root `CHANGELOG.md`
- Readme: `plugins/compound-engineering/README.md`

## Example Workflow

When adding a new agent:

1. Create the agent file in `plugins/compound-engineering/agents/[category]/`
2. Update `plugins/compound-engineering/README.md`
3. Leave plugin version selection and canonical changelog generation to release automation
4. Run `bun run release:validate`

## Prevention

This documentation serves as a reminder. When maintainers or agents work on this plugin, they should:

1. Check this doc before committing changes
2. Follow the checklist above
3. Do not guess release versions in feature PRs
4. Refer to the repo-level release learning when the question is about batching, release PR behavior, or multi-component ownership rather than plugin-only bookkeeping

## Related Files

- `plugins/compound-engineering/.claude-plugin/plugin.json`
- `plugins/compound-engineering/README.md`
- `package.json`
- `CHANGELOG.md`
- `docs/solutions/workflow/manual-release-please-and-centralized-changelog.md`
