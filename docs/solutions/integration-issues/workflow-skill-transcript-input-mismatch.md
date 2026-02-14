---
title: "/workflows:research process stalls on inline transcript with empty plans directory"
date: 2026-02-13
category: integration-issues
tags: [workflow-automation, research-workflow, transcript-processing, state-handling, first-use-failure]
severity: high
component: plugins/compound-engineering/commands/workflows/research.md + plugins/compound-engineering/skills/transcript-insights/SKILL.md
resolution_time: 30 minutes
---

# /workflows:research process stalls on inline transcript with empty plans directory

## Problem

`/workflows:research process this transcript [content]` stalls when used as the first research action. Claude creates directories but never produces output. Brainstorm and plan workflows are unaffected.

**Symptom:** The model appears stuck after creating `docs/research/` directories. No transcript is saved, no interview snapshot is generated.

**Trigger:** Empty research directories (no prior transcripts, plans, or interviews).

## Root Cause

Two cascading bugs at the integration boundary between the workflow command and its downstream skill:

**Bug 1: Workflow command doesn't pass inline content to the skill.**
Phase 2 of `research.md` only checks for `.md` files in `docs/research/transcripts/`. When the directory is empty, it reports "no transcripts found" and exits. The `transcript-insights` skill supports inline content (Step 1: "If content is pasted directly, proceed"), but the workflow command never provides a path for inline content to reach the skill.

**Bug 2: Skill stalls on empty plans directory.**
Even if Bug 1 were fixed, `transcript-insights` Step 2 tries to list research plans from `docs/research/plans/` with no empty-state fallback. On first use, the directory is empty and the model stalls trying to reconcile the instruction to "list plans" with nothing to list.

**Pattern:** This is a "first-use failure" — everything works once artifacts exist from prior runs, but the first invocation with empty directories fails.

## Solution

### Fix 1: research.md — Add inline content handling

Added a "Check for Inline Content" section before "Check for Transcripts" in Phase 2:

```markdown
### Check for Inline Content

If the research phase argument contains more than just the word "process"
(i.e., transcript content was provided inline):

1. Extract the transcript content from the argument (everything after "process")
2. Look for a meeting title or date in the content to generate a filename.
   Use the format: YYYY-MM-DD_<meeting-title-slug>_transcript.md
3. Save the content to docs/research/transcripts/[filename]
4. Skip the transcript selection step — proceed directly to Process Selected Transcript
```

Updated "Check for Transcripts" with a guard: "If inline content was already saved above, skip this section." Also updated the error message to mention the inline option.

### Fix 2: transcript-insights/SKILL.md — Add empty-state handling

Replaced the unconditional plan listing in Step 2 with:

```markdown
Check for files in docs/research/plans/.

**If no plans exist:**
Set research_plan: ad-hoc in frontmatter and proceed to Step 3.

**If plans exist:**
List existing research plans...
[existing flow unchanged]
```

Removed the AskUserQuestion confirmation for empty state — the user already committed to processing by providing a transcript. Just default to ad-hoc silently.

## Why It Works

- **Inline content becomes first-class:** The workflow now extracts, saves, and passes inline content through to the skill, matching what the skill already documented as supported input.
- **Empty state is a non-event:** When no plans exist, the skill defaults to ad-hoc without blocking. The user can create plans later.
- **Backward compatible:** The existing file-based flow is untouched. The inline path only activates when the argument contains more than "process".
- **Converges at the same point:** Both the inline and file-based paths meet at "Process Selected Transcript" with a file path, so all downstream logic is shared.

## Why Other Workflows Were Unaffected

| Workflow | Why it works |
|----------|-------------|
| `/workflows:brainstorm` | Accepts inline descriptions directly — no file dependency |
| `/workflows:plan` | Has explicit fallback: "If no brainstorm found, run idea refinement" |
| `/workflows:research` (phase menu) | Just counts files — 0 is valid |
| `/workflows:research plan` | Creates from scratch — no dependency on existing artifacts |
| `/workflows:research personas` | Explicitly handles empty state: "No processed interviews found" |

## Prevention: First-Use Failure Checklist

This class of bug happens when workflow commands and skills have mismatched input handling or missing empty-state fallbacks. When writing new workflow commands or skills, check:

### Input Contract
- [ ] Every supported input format (file path, inline content, empty) is documented in both the workflow command AND the skill
- [ ] If a skill says it accepts inline content, the workflow command has a path to pass it through
- [ ] Empty input is handled explicitly (not silently ignored)

### Empty-State Handling
- [ ] Every instruction that reads from a directory has an "If empty" branch
- [ ] Empty-state messages guide the user to a next action (not just "not found")
- [ ] Default behavior exists for first-use (e.g., ad-hoc tagging, skip to next step)

### First-Run Test
- [ ] Can a user run this workflow with NO prior artifacts and succeed?
- [ ] All directories are created upfront (mkdir -p in Directory Setup)
- [ ] File selection handles 0, 1, and N files explicitly

### Integration Boundary
- [ ] Workflow command documents what it passes to the skill
- [ ] Skill documents what it expects to receive
- [ ] Return contract is documented (what file gets created, what frontmatter fields)

**Core insight:** Design workflows for the worst case (empty, first-run) first, then optimize for the common case (existing artifacts).

## Files Changed

| File | Change |
|------|--------|
| `plugins/compound-engineering/commands/workflows/research.md` | Added inline content handling before file check |
| `plugins/compound-engineering/skills/transcript-insights/SKILL.md` | Added empty-state handling for plans directory |
| `plugins/compound-engineering/.claude-plugin/plugin.json` | Version 2.32.0 → 2.32.1 |
| `plugins/compound-engineering/CHANGELOG.md` | Added Fixed section for 2.32.1 |

## References

- Issue: [EveryInc/compound-engineering-plugin#187](https://github.com/EveryInc/compound-engineering-plugin/issues/187)
- Fix plan: `docs/plans/2026-02-13-fix-research-process-first-action-plan.md`
- Original feature plan: `docs/plans/2026-02-11-feat-user-research-workflow-plan.md`
- Plugin versioning guide: `docs/solutions/plugin-versioning-requirements.md`
