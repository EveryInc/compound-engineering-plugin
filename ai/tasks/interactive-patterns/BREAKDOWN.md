---
id: interactive-patterns.BREAKDOWN
module: interactive-patterns
priority: 5
status: pending
version: 1
origin: spec-workflow
dependsOn: [input-validation]
tags: [smart-ralph, compound-engineering]
---
# Interactive Patterns (AskUserQuestion)

## Context

The 5 core workflow commands lack AskUserQuestion gates for scope/agent selection. When invoked without arguments in interactive mode, they have no way to help the user specify what to work on, review, or document. This module adds AskUserQuestion flows to three commands (`work.md`, `review.md`, `compound.md`) and refines the existing flow in `plan.md`, with autonomous mode bypass when `$ARGUMENTS` is non-empty.

## Tasks

1. **Add Input Handling section to `workflows/work.md` -- Plan Picker** -- Insert an `## Input Handling` section (wrapped in `<input_handling>` tags) before Phase 1:
   - **Autonomous mode** (`$ARGUMENTS` non-empty): Validate plan path, proceed directly to Phase 1 with no questions.
   - **Interactive mode** (`$ARGUMENTS` empty): Use AskUserQuestion to present a plan picker:
     - Scan `docs/plans/` for recent `.md` files (`ls -1t docs/plans/*.md | head -10`)
     - Scan for `.*.local.md` state files with saved progress
     - Present max 5 options: state-files first, then most recent plans
     - Include "Enter a file path manually" and "Browse all plans" options
     - Special cases: single plan -> "Found one plan: [name]. Work on this? (y/n)"; no plans -> "No plans found. Create one with /workflows:plan"
   - Set selected plan as input, proceed to Phase 1.

2. **Add Input Handling section to `workflows/review.md` -- Target Selector** -- Insert an `## Input Handling` section (wrapped in `<input_handling>` tags) before Main Tasks:
   - **Autonomous mode** (`$ARGUMENTS` non-empty): Parse argument as PR number, GitHub URL, branch name, or "latest". Proceed to Main Tasks.
   - **Interactive mode** (`$ARGUMENTS` empty): Use AskUserQuestion:
     - Check current branch: `git branch --show-current`
     - Check if current branch has a PR: `gh pr list --head "$current_branch"`
     - List recent PRs by current user: `gh pr list --author @me --json number,title,updatedAt`
     - Context-dependent options: feature branch with PR -> default to that PR; feature branch without PR -> default to branch; main/master -> show recent PRs
     - Always include "Enter PR number or branch name manually"
   - Set selected target as input, proceed to Main Tasks.
   - **No review depth selector** -- comprehensive review is the default (per UX decision).

3. **Add Category Confirmation to `workflows/compound.md`** -- Insert a `### Category Confirmation` section (wrapped in `<category_confirmation>` tags) in Phase 1 after the Category Classifier subagent returns:
   - **Autonomous mode** (`$ARGUMENTS` non-empty, from lfg/slfg chain): Skip confirmation, auto-classify, proceed.
   - **Interactive mode** (`$ARGUMENTS` empty): Use AskUserQuestion:
     - Question: "Classified as '[category]'. Does this look right?"
     - Options: (1) Yes, proceed (recommended), (2) Change category, (3) This is actually two problems -- document separately
     - If "Change category": present full category list as second AskUserQuestion

4. **Refine layer detection in `workflows/plan.md`** -- Add explicit L1/L2/L3 detection to the Idea Refinement section:
   - **L1** (`$ARGUMENTS` >50 words or references a brainstorm document): Skip idea refinement, announce "Description is detailed, proceeding to research." User can interrupt.
   - **L2** (`$ARGUMENTS` 1-50 words): Current behavior -- single "Your description is clear. Proceed or refine?" question.
   - **L3** (`$ARGUMENTS` empty): Current behavior -- full idea refinement dialogue with AskUserQuestion (3-5 rounds).

5. **Apply multiple-choice design rules consistently** -- Across all AskUserQuestion prompts:
   - Lead with the recommended option (mark with "recommended" label)
   - Maximum 5 options (4 specific + 1 "Other")
   - Number each option for quick selection
   - Include "skip/proceed with defaults" when defaults are sensible
   - Frame questions as decisions, not information requests

6. **Verify autonomous mode bypass** -- Confirm that all added AskUserQuestion sections check `$ARGUMENTS` non-empty before displaying any prompts. The lfg/slfg chains pass arguments to workflow commands via explicit `/slash-command $ARGUMENTS` syntax.

## Acceptance Criteria

- AC-9 (from QA): AskUserQuestion bypasses correctly when arguments provided. Verified by manual bypass tests 6.1-6.5.
- Manual test 3.1 (from QA): `/workflows:work` with no arguments shows plan picker with recent plans, max 5, state-files first.
- Manual test 3.2 (from QA): `/workflows:work docs/plans/some-plan.md` proceeds directly without questions.
- Manual test 3.4 (from QA): `/workflows:review` with no arguments on feature branch auto-detects PR and shows target selector.
- Manual test 3.5 (from QA): `/workflows:review 123` proceeds directly without questions.
- Manual test 3.7 (from QA): `/workflows:compound` with no arguments shows category confirmation after auto-classification.
- Manual test 3.8 (from QA): `/workflows:plan` with >50 word description skips idea refinement (L1 path).
- Manual test 3.10 (from QA): `/workflows:plan` with no arguments enters full refinement dialogue (L3 path).
- NG-2 (from QA): Plan picker shows max 5 plans with state-first sort.
- Manual test 6.5 (from QA): lfg chain sub-commands all bypass interactive prompts (except the acknowledged single-confirmation for `/workflows:work` when invoked without arguments).

## Files to Create/Modify

### Modified Files (4)

| File | Change |
|------|--------|
| `plugins/compound-engineering/commands/workflows/work.md` | Add `## Input Handling` section with plan picker AskUserQuestion flow |
| `plugins/compound-engineering/commands/workflows/review.md` | Add `## Input Handling` section with target selector AskUserQuestion flow |
| `plugins/compound-engineering/commands/workflows/compound.md` | Add `### Category Confirmation` section with AskUserQuestion confirmation |
| `plugins/compound-engineering/commands/workflows/plan.md` | Add L1/L2/L3 layer detection to Idea Refinement section |
