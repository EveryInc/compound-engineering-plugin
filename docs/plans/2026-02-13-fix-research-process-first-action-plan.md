---
title: "fix: Research process fails when transcript is first action"
type: fix
status: completed
date: 2026-02-13
---

# fix: Research process fails when transcript is first action

## Overview

`/workflows:research` stalls when a user tries to process a transcript as their first research action. Two cascading bugs: (1) Phase 2 doesn't handle inline transcript content, and (2) the transcript-insights skill has no empty-state handling for the plans directory.

Related issue: EveryInc/compound-engineering-plugin#187

## Problem Statement

When a user runs `/workflows:research process this transcript [content]` with empty research directories:

1. Phase 2 checks `docs/research/transcripts/` for files → finds nothing → reports "no transcripts found" and exits
2. Even if the transcript were saved first, the transcript-insights skill tries to list research plans from an empty `docs/research/plans/` directory with no fallback

The workflow command and the skill have **mismatched input handling** — the skill supports inline content (Step 1: "If content is pasted directly, proceed with that content") but the workflow command never passes inline content through.

## Proposed Solution

Two targeted edits to two files. No new files needed.

### Fix 1: `plugins/compound-engineering/commands/workflows/research.md`

**Location:** Phase 2: Process section (lines 82-114)

**Change:** Add an inline content check before the file-based transcript check. Insert a new subsection before "### Check for Transcripts":

```markdown
### Check for Inline Content

If the research phase argument contains more than just the word "process" (i.e., transcript content was provided inline):
1. Extract the transcript content from the argument (everything after "process")
2. Generate a filename from the meeting title or date: `YYYY-MM-DD_<meeting-title-slug>_transcript.md`
3. Save to `docs/research/transcripts/[filename]`
4. Skip the transcript selection step — proceed directly to "Process Selected Transcript" with this file path
```

Then update the existing "Check for Transcripts" section to say:

```markdown
### Check for Transcripts

**If inline content was already handled above, skip this section.**

Look for `.md` files in `docs/research/transcripts/`.
[... rest unchanged ...]
```

### Fix 2: `plugins/compound-engineering/skills/transcript-insights/SKILL.md`

**Location:** Step 2: Link to Research Plan (lines 31-40)

**Change:** Add empty-state handling before the existing list instruction. Replace the current Step 2 opening with:

```markdown
### Step 2: Link to Research Plan

Check for files in `docs/research/plans/`.

**If no plans exist:**
Skip the plan listing. Use AskUserQuestion to confirm: "No research plans found. This will be tagged as ad-hoc research. Continue?"
If confirmed, set `research_plan: ad-hoc` in frontmatter and proceed to Step 3.

**If plans exist:**
List existing research plans by reading frontmatter from files in `docs/research/plans/`:
- Show title, date, and status for each plan
- Most recent first, cap at 7 entries
- Include "Ad-hoc / no plan" as the final option

Use AskUserQuestion to ask which plan this transcript belongs to. Store the plan slug (filename without date prefix and extension) in the output frontmatter.

If "Ad-hoc" is selected, set `research_plan: ad-hoc` in frontmatter.
```

## Acceptance Criteria

- [x] `/workflows:research process this transcript [inline content]` saves transcript to file and processes it — even with empty research directories
- [x] `/workflows:research process` (no inline content) still works with existing file-based flow
- [x] transcript-insights skill handles empty `docs/research/plans/` gracefully by defaulting to ad-hoc
- [x] transcript-insights skill still lists plans when they exist
- [x] No changes to brainstorm, plan, or other workflow commands

## Files to Edit

| File | Lines | Change |
|------|-------|--------|
| `plugins/compound-engineering/commands/workflows/research.md` | 82-90 | Add inline content handling before file check |
| `plugins/compound-engineering/skills/transcript-insights/SKILL.md` | 31-40 | Add empty-state handling for plans directory |

## Plugin Metadata Updates

This is a patch fix (no new components), so:

- [x] Bump patch version in `plugins/compound-engineering/.claude-plugin/plugin.json`
- [x] Add CHANGELOG entry under `### Fixed`
- [x] No README or marketplace.json changes needed (component counts unchanged)

## References

- Issue: EveryInc/compound-engineering-plugin#187
- Workflow command: `plugins/compound-engineering/commands/workflows/research.md:82-114`
- Skill: `plugins/compound-engineering/skills/transcript-insights/SKILL.md:31-40`
- Good empty-state pattern: `plugins/compound-engineering/agents/research/user-research-analyst.md` (Step 8)
