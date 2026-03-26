---
title: "feat: Add ce:* command aliases with backwards-compatible deprecation of workflows:*"
type: feat
status: complete
date: 2026-03-01
---

# feat: Add `ce:*` Command Aliases with Backwards-Compatible Deprecation of `workflows:*`

## Overview

Rename the five `workflows:*` commands to `ce:*` to make it clearer they belong to compound-engineering. Keep `workflows:*` working as thin deprecation wrappers that warn users and forward to the new commands.

## Problem Statement / Motivation

The current `workflows:plan`, `workflows:work`, `workflows:review`, `workflows:brainstorm`, and `workflows:compound` commands are prefixed with `workflows:` — a generic namespace that doesn't signal their origin. Users don't immediately associate them with the compound-engineering plugin.

The `ce:` prefix is shorter, more memorable, and unambiguously identifies these as compound-engineering commands — consistent with how other plugin commands already use `compound-engineering:` as a namespace.

## Proposed Solution

### 1. Create New `ce:*` Commands (Primary)

Create a `commands/ce/` directory with five new command files. Each file gets the full implementation content from the current `workflows:*` counterpart, with the `name:` frontmatter updated to the new name.

| New Command | Source Content |
|-------------|---------------|
| `ce:plan` | `commands/workflows/plan.md` |
| `ce:work` | `commands/workflows/work.md` |
| `ce:review` | `commands/workflows/review.md` |
| `ce:brainstorm` | `commands/workflows/brainstorm.md` |
| `ce:compound` | `commands/workflows/compound.md` |

### 2. Convert `workflows:*` to Deprecation Wrappers (Backwards Compatibility)

Replace the full content of each `workflows:*` command with a thin wrapper that:
1. Displays a visible deprecation warning to the user
2. Invokes the new `ce:*` command with the same `$ARGUMENTS`

Example wrapper body:

```markdown
---
name: workflows:plan
description: "[DEPRECATED] Use /ce:plan instead. Renamed for clarity."
argument-hint: "[feature description]"
---

> ⚠️ **Deprecated:** `/workflows:plan` has been renamed to `/ce:plan`.
> Please update your workflow to use `/ce:plan` instead.
> This alias will be removed in a future version.

/ce:plan $ARGUMENTS
```

### 3. Update All Internal References

The grep reveals `workflows:*` is referenced in **many more places** than just `lfg`/`slfg`. All of these must be updated to point to the new `ce:*` names:

**Orchestration commands (update to new names):**
- `commands/lfg.md` — `/workflows:plan`, `/workflows:work`, `/workflows:review`
- `commands/slfg.md` — `/workflows:plan`, `/workflows:work`, `/workflows:review`

**Command bodies that cross-reference (update to new names):**
- `commands/workflows/brainstorm.md` — references `/workflows:plan` multiple times (will be in the deprecated wrapper, so should forward to `/ce:plan`)
- `commands/workflows/compound.md` — self-references and references `/workflows:plan`
- `commands/workflows/plan.md` — references `/workflows:work` multiple times
- `commands/deepen-plan.md` — references `/workflows:work`, `/workflows:compound`

**Agents (update to new names):**
- `agents/review/code-simplicity-reviewer.md` — references `/workflows:plan` and `/workflows:work`
- `agents/research/git-history-analyzer.md` — references `/workflows:plan`
- `agents/research/learnings-researcher.md` — references `/workflows:plan`

**Skills (update to new names):**
- `skills/document-review/SKILL.md` — references `/workflows:brainstorm`, `/workflows:plan`
- `skills/git-worktree/SKILL.md` — references `/workflows:review`, `/workflows:work` extensively
- `skills/setup/SKILL.md` — references `/workflows:review`, `/workflows:work`
- `skills/brainstorming/SKILL.md` — references `/workflows:plan` multiple times
- `skills/file-todos/SKILL.md` — references `/workflows:review`

**Other commands (update to new names):**
- `commands/test-xcode.md` — references `/workflows:review`

**Historical docs (leave as-is — they document the old names intentionally):**
- `docs/plans/*.md` — old plan files, historical record
- `docs/brainstorms/*.md` — historical
- `docs/solutions/*.md` — historical
- `tests/fixtures/` — test fixtures for the converter (intentionally use `workflows:*` to test namespace handling)
- `CHANGELOG.md` historical entries — don't rewrite history

### 4. Update Documentation

- `CHANGELOG.md` — add new entry documenting the rename and deprecation
- `plugins/compound-engineering/README.md` — update command table to list `ce:*` as primary, note `workflows:*` as deprecated aliases
- `plugins/compound-engineering/CLAUDE.md` — update command listing and the "Why `workflows:`?" section
- Root `README.md` — update the command table (lines 133–136)

### 5. Converter / bunx Install Script Considerations

The `bunx` install script (`src/commands/install.ts`) **only writes files, never deletes them**. This has two implications:

**Now (while deprecated wrappers exist):** No stale file problem. Running `bunx install compound-engineering --to gemini` after this change will:
- Write `commands/ce/plan.toml` (new primary)
- Write `commands/workflows/plan.toml` (deprecated wrapper, with deprecation content)

Both coexist correctly. Users who re-run install get both.

**Future (when deprecated wrappers are eventually removed):** The old `commands/workflows/` files will remain stale in users' converted targets. At that point, a cleanup step will be needed — either:
- Manual instructions: "Delete `.gemini/commands/workflows/` after upgrading"
- OR add a cleanup pass to the install script that removes known-renamed command directories

For now, document in the plan that stale cleanup is a known future concern when `workflows:*` wrappers are eventually dropped.

## Technical Considerations

### Command Naming

The `ce:` prefix maps to a `commands/ce/` directory. This follows the existing convention where `workflows:plan` maps to `commands/workflows/plan.md`.

### Deprecation Warning Display

Since commands are executed by Claude, the deprecation message in the wrapper body will be displayed to the user as Claude's response before the new command runs. The `>` blockquote markdown renders as a styled callout.

The deprecated wrappers should **not** use `disable-model-invocation: true` — Claude needs to process the body to display the warning and invoke the new command.

### Deprecation Wrapper Mechanism

The deprecated wrappers **must** use `disable-model-invocation: true`. This is the same mechanism `lfg.md` uses — the CLI runtime parses the body and executes slash command invocations directly. Without it, Claude reads the body as text and cannot actually invoke `/ce:plan`.

The deprecation notice in the wrapper body becomes a printed note (same as `lfg` step descriptions), not a styled Claude response. That's acceptable — it still communicates the message.

### Context Token Budget

The 5 new `ce:*` commands add descriptions to the context budget. Keep descriptions short (under 120 chars). The 5 deprecated `workflows:*` wrappers have minimal descriptions (tagged as deprecated) to minimize budget impact.

### Count Impact

Command count remains 22 (5 new `ce:*` + 5 updated `workflows:*` wrappers = net zero change). No version bump required for counts.

## Acceptance Criteria

- [ ] `commands/ce/` directory created with 5 new command files
- [ ] Each `ce:*` command has the full implementation from its `workflows:*` counterpart
- [ ] Each `ce:*` command frontmatter `name:` field set to `ce:plan`, `ce:work`, etc.
- [ ] Each `workflows:*` command replaced with a thin deprecation wrapper
- [ ] Deprecation wrapper shows a clear ⚠️ warning with the new command name
- [ ] Deprecation wrapper invokes the new `ce:*` command with `$ARGUMENTS`
- [ ] `lfg.md` updated to use `ce:plan`, `ce:work`, `ce:review`
- [ ] `slfg.md` updated to use `ce:plan`, `ce:work`, `ce:review`
- [ ] All agent `.md` files updated (code-simplicity-reviewer, git-history-analyzer, learnings-researcher)
- [ ] All skill `SKILL.md` files updated (document-review, git-worktree, setup, brainstorming, file-todos)
- [ ] `commands/deepen-plan.md` and `commands/test-xcode.md` updated
- [ ] `CHANGELOG.md` updated with deprecation notice
- [ ] `plugins/compound-engineering/README.md` command table updated
- [ ] `plugins/compound-engineering/CLAUDE.md` command listing updated
- [ ] Root `README.md` command table updated
- [ ] Validate: `/ce:plan "test feature"` works end-to-end
- [ ] Validate: `/workflows:plan "test feature"` shows deprecation warning and continues
- [ ] Re-run `bunx install compound-engineering --to [target]` and confirm both `ce/` and `workflows/` output dirs are written correctly

## Implementation Steps

### Step 1: Create `commands/ce/` directory with 5 new files

For each command, copy the source file and update only the `name:` frontmatter field:

- `commands/ce/plan.md` — copy `commands/workflows/plan.md`, set `name: ce:plan`
- `commands/ce/work.md` — copy `commands/workflows/work.md`, set `name: ce:work`
- `commands/ce/review.md` — copy `commands/workflows/review.md`, set `name: ce:review`
- `commands/ce/brainstorm.md` — copy `commands/workflows/brainstorm.md`, set `name: ce:brainstorm`
- `commands/ce/compound.md` — copy `commands/workflows/compound.md`, set `name: ce:compound`

### Step 2: Replace `commands/workflows/*.md` with deprecation wrappers

Use `disable-model-invocation: true` so the CLI runtime directly invokes `/ce:<command>`. The deprecation note is printed as a step description.

Template for each wrapper:

```markdown
---
name: workflows:<command>
description: "[DEPRECATED] Use /ce:<command> instead — renamed for clarity."
argument-hint: "[...]"
disable-model-invocation: true
---

NOTE: /workflows:<command> is deprecated. Please use /ce:<command> instead. This alias will be removed in a future version.

/ce:<command> $ARGUMENTS
```

### Step 3: Update all internal references

**Orchestration commands:**
- `commands/lfg.md` — replace `/workflows:plan`, `/workflows:work`, `/workflows:review`
- `commands/slfg.md` — same

**Command bodies:**
- `commands/deepen-plan.md` — replace `/workflows:work`, `/workflows:compound`
- `commands/test-xcode.md` — replace `/workflows:review`
- The deprecated `workflows/brainstorm.md`, `workflows/compound.md`, `workflows/plan.md` wrappers — references in their body text pointing to other `workflows:*` commands should also be updated to `ce:*` (since users reading them should see the new names)

**Agents:**
- `agents/review/code-simplicity-reviewer.md`
- `agents/research/git-history-analyzer.md`
- `agents/research/learnings-researcher.md`

**Skills:**
- `skills/document-review/SKILL.md`
- `skills/git-worktree/SKILL.md`
- `skills/setup/SKILL.md`
- `skills/brainstorming/SKILL.md`
- `skills/file-todos/SKILL.md`

### Step 4: Update documentation

**`plugins/compound-engineering/CHANGELOG.md`** — Add under new version section:
```
### Changed
- `workflows:plan`, `workflows:work`, `workflows:review`, `workflows:brainstorm`, `workflows:compound` renamed to `ce:plan`, `ce:work`, `ce:review`, `ce:brainstorm`, `ce:compound` for clarity

### Deprecated
- `workflows:*` commands — use `ce:*` equivalents instead. Aliases remain functional and will be removed in a future version.
```

**`plugins/compound-engineering/README.md`** — Update the commands table to list `ce:*` as primary, show `workflows:*` as deprecated aliases.

**`plugins/compound-engineering/CLAUDE.md`** — Update command listing and the "Why `workflows:`?" section to reflect new `ce:` namespace.

**Root `README.md`** — Update the commands table (lines 133–136).

### Step 5: Verify converter output

After updating, re-run the bunx install script to confirm both targets are written:

```bash
bunx @every-env/compound-plugin install compound-engineering --to gemini --output /tmp/test-output
ls /tmp/test-output/.gemini/commands/
# Should show both: ce/ and workflows/
```

The `workflows/` output will contain the deprecation wrapper content. The `ce/` output will have the full implementation.

**Future cleanup note:** When `workflows:*` wrappers are eventually removed, users must manually delete the stale `workflows/` directories from their converted targets (`.gemini/commands/workflows/`, `.codex/commands/workflows/`, etc.). Consider adding a migration note to the CHANGELOG at that time.

### Step 6: Run `/release-docs` to update the docs site

## Dependencies & Risks

- **Risk:** Users with saved references to `workflows:*` commands in their CLAUDE.md files or scripts. **Mitigation:** The deprecation wrappers remain functional indefinitely.
- **Risk:** Context token budget slightly increases (5 new command descriptions). **Mitigation:** Keep all descriptions short. Deprecated wrappers get minimal descriptions.
- **Risk:** `lfg`/`slfg` orchestration breaks if update is partial. **Mitigation:** Update both in the same commit.

## Sources & References

- Existing commands: `plugins/compound-engineering/commands/workflows/*.md`
- Orchestration commands: `plugins/compound-engineering/commands/lfg.md`, `plugins/compound-engineering/commands/slfg.md`
- Plugin metadata: `plugins/compound-engineering/.claude-plugin/plugin.json`
- Changelog: `plugins/compound-engineering/CHANGELOG.md`
- README: `plugins/compound-engineering/README.md`
