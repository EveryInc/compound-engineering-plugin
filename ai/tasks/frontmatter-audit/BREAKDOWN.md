---
id: frontmatter-audit.BREAKDOWN
module: frontmatter-audit
priority: 0
status: pending
version: 1
origin: spec-workflow
dependsOn: []
tags: [smart-ralph, compound-engineering]
---
# Frontmatter Audit

## Context

14 of 24 commands have `disable-model-invocation: true`, but 10 do not -- including all 5 workflow commands and 4 utility commands. This directly contributes to the 316% context budget bloat issue by allowing the model to auto-load command instructions unnecessarily. Additionally, 1 command (`deploy-docs.md`) is missing `argument-hint`. This module performs the lowest-effort, highest-impact change: 11 single-line YAML frontmatter edits.

## Tasks

1. **Add `disable-model-invocation: true` to `commands/deepen-plan.md`** -- Insert `disable-model-invocation: true` into the YAML frontmatter block (between the `---` delimiters). Value must be boolean `true`, not string `"true"`.

2. **Add `disable-model-invocation: true` to `commands/feature-video.md`** -- Same single-line frontmatter addition.

3. **Add `disable-model-invocation: true` to `commands/resolve_todo_parallel.md`** -- Same single-line frontmatter addition.

4. **Add `disable-model-invocation: true` to `commands/test-browser.md`** -- Same single-line frontmatter addition.

5. **Add `disable-model-invocation: true` to `commands/workflows/brainstorm.md`** -- Same single-line frontmatter addition.

6. **Add `disable-model-invocation: true` to `commands/workflows/compound.md`** -- Same single-line frontmatter addition.

7. **Add `disable-model-invocation: true` to `commands/workflows/plan.md`** -- Same single-line frontmatter addition.

8. **Add `disable-model-invocation: true` to `commands/workflows/review.md`** -- Same single-line frontmatter addition.

9. **Add `disable-model-invocation: true` to `commands/workflows/work.md`** -- Same single-line frontmatter addition.

10. **Add `argument-hint` to `commands/deploy-docs.md`** -- Insert `argument-hint: "[optional: --dry-run to preview changes]"` into the YAML frontmatter.

11. **Verify all 24 commands now have both fields** -- Run a quick scan to confirm 24/24 commands have `argument-hint` and 24/24 have `disable-model-invocation: true`.

## Acceptance Criteria

- AC-1 (from QA): All 24 commands have valid YAML frontmatter with name, description, argument-hint, and disable-model-invocation. Verified by `bun test` (command-validation.test.ts) once CI module is complete.
- All frontmatter values use boolean `true`, not string `"true"`. The existing CLI parser checks `data["disable-model-invocation"] === true`.
- The `disable-model-invocation` flag only prevents model-initiated invocation, not explicit `/slash-command` invocation. The lfg/slfg chains use explicit slash syntax and must continue to work.
- Context budget does not regress (AC-7 from QA, verified during integration-testing module).

## Files to Create/Modify

### Modified Files (10 commands + 1 argument-hint)

| File | Change |
|------|--------|
| `plugins/compound-engineering/commands/deepen-plan.md` | Add `disable-model-invocation: true` |
| `plugins/compound-engineering/commands/feature-video.md` | Add `disable-model-invocation: true` |
| `plugins/compound-engineering/commands/resolve_todo_parallel.md` | Add `disable-model-invocation: true` |
| `plugins/compound-engineering/commands/test-browser.md` | Add `disable-model-invocation: true` |
| `plugins/compound-engineering/commands/deploy-docs.md` | Add `argument-hint: "[optional: --dry-run to preview changes]"` |
| `plugins/compound-engineering/commands/workflows/brainstorm.md` | Add `disable-model-invocation: true` |
| `plugins/compound-engineering/commands/workflows/compound.md` | Add `disable-model-invocation: true` |
| `plugins/compound-engineering/commands/workflows/plan.md` | Add `disable-model-invocation: true` |
| `plugins/compound-engineering/commands/workflows/review.md` | Add `disable-model-invocation: true` |
| `plugins/compound-engineering/commands/workflows/work.md` | Add `disable-model-invocation: true` |
