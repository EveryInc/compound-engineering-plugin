---
title: Plugin Versioning and Documentation Requirements
category: workflow
tags: [versioning, changelog, readme, plugin, documentation]
created: 2025-11-24
severity: process
component: plugin-development
---

# Plugin Versioning and Documentation Requirements

## Problem

When making changes to the compound-engineering plugin, documentation can get out of sync with the actual components (agents, commands, skills). This leads to confusion about what's included in each version and makes it difficult to track changes over time.

This document applies to the embedded marketplace plugin metadata, not the root CLI package release version. The root CLI package (`package.json`, root `CHANGELOG.md`, repo `v*` tags) is managed by semantic-release and follows the repository tag line.

## Solution

**Routine PRs should not cut plugin releases.**

The embedded plugin version is release-owned metadata. The maintainer uses a local slash command to choose the next version and generate release changelog entries after deciding which merged changes ship together. Because multiple PRs may merge before release, contributors should not guess release versions inside individual PRs.

Contributors should:

1. **Avoid release bookkeeping in normal PRs**
   - Do not manually bump `.claude-plugin/plugin.json`
   - Do not manually bump `.claude-plugin/marketplace.json`
   - Do not cut release sections in `CHANGELOG.md`

2. **Keep substantive docs accurate**
   - Verify component counts match actual files
   - Verify agent/command/skill tables are accurate
   - Update descriptions if functionality changed

## Checklist for Plugin Changes

```markdown
Before committing changes to compound-engineering plugin:

- [ ] No manual version bump in `.claude-plugin/plugin.json`
- [ ] No manual version bump in `.claude-plugin/marketplace.json`
- [ ] No manual release section added to `CHANGELOG.md`
- [ ] README.md component counts verified
- [ ] README.md tables updated (if adding/removing/renaming)
- [ ] plugin.json description updated (if component counts changed)
```

## File Locations

- Version is release-owned: `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
- Changelog release sections are release-owned: `CHANGELOG.md`
- Readme: `README.md`

## Example Workflow

When adding a new agent:

1. Create the agent file in `agents/[category]/`
2. Update README agent table
3. Update README component count
4. Update plugin metadata description with new counts if needed
5. Leave version selection and release changelog generation to the maintainer's release command

## Prevention

This documentation serves as a reminder. When Claude Code works on this plugin, it should:

1. Check this doc before committing changes
2. Follow the checklist above
3. Do not guess release versions in feature PRs

## Related Files

- `/Users/kieranklaassen/compound-engineering-plugin/plugins/compound-engineering/.claude-plugin/plugin.json`
- `/Users/kieranklaassen/compound-engineering-plugin/plugins/compound-engineering/CHANGELOG.md`
- `/Users/kieranklaassen/compound-engineering-plugin/plugins/compound-engineering/README.md`
- `/Users/kieranklaassen/compound-engineering-plugin/package.json`
- `/Users/kieranklaassen/compound-engineering-plugin/CHANGELOG.md`
