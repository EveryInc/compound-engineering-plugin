---
id: input-validation.BREAKDOWN
module: input-validation
priority: 2
status: pending
version: 1
origin: spec-workflow
dependsOn: [reproduce-bug-fix]
tags: [smart-ralph, compound-engineering]
---
# Input Validation

## Context

Commands accept `$ARGUMENTS` but never validate them before executing multi-step workflows. A missing PR number or invalid file path silently cascades through git and gh CLI calls, producing cryptic errors deep in workflows instead of clear early messages. This module adds instructional validation sections to the three highest-value commands, using the three-part What/Why/Fix error message format.

## Tasks

1. **Add Input Validation section to `workflows/work.md`** -- Insert an `## Input Validation` section before Phase 1. When `$ARGUMENTS` is provided, validate the plan file path: check file exists, ends in `.md`, is in `docs/plans/`. On failure, show What/Why/Fix error with `ls -1t docs/plans/*.md | head -5` to list available plans.

2. **Add Input Validation section to `workflows/review.md`** -- Insert an `## Input Validation` section before Main Tasks. Parse the argument as PR number (numeric), GitHub URL (extract PR number), branch name (check `git rev-parse --verify`), or keyword ("latest", "current"). On unrecognizable input, show What/Why/Fix error listing valid formats.

3. **Add Input Validation section to `reproduce-bug.md`** -- Insert an `## Input Validation` section early in the command. Validate that `$ARGUMENTS` is a numeric GitHub issue number. On non-numeric input, show What/Why/Fix error with correct usage example (`/reproduce-bug 42`). Optionally verify issue exists with `gh issue view`.

4. **Ensure validation is permissive** -- Each validation section must attempt to infer the argument type from its format before rejecting. For example, `/workflows:review` should accept `892`, `https://github.com/org/repo/pull/892`, `feat/user-auth`, and `current` -- only failing if no reasonable interpretation exists.

5. **Ensure all error messages include three parts** -- Every validation error must include: (a) What happened (clear statement), (b) Why (context about what the command expected), (c) Fix (actionable next step with usage example). This is critical for agent self-correction -- Claude reads the Why to understand and fix the issue.

6. **Wrap validation in `<input_validation>` tags** -- Use the tag pattern from TECH spec to clearly delineate the validation section in the command markdown. Include "If validation passes: Proceed to Phase 1" at the end.

## Acceptance Criteria

- Manual test 3.3 (from QA): Running `/workflows:work nonexistent.md` produces a What/Why/Fix error with file-not-found message, explanation of plan file expectations, and path suggestion.
- Manual test 3.6 (from QA): Running `/workflows:review abc` produces a What/Why/Fix error for invalid PR number with correct format examples.
- Manual test 3.12 (from QA): Running `/reproduce-bug notanumber` produces a What/Why/Fix error for invalid issue number.
- NG-1 (from QA): Error messages follow What/Why/Fix format for all validation failures.
- Validation does not interfere with the happy path -- valid arguments proceed immediately with no additional prompts or delays.

## Files to Create/Modify

### Modified Files (3)

| File | Change |
|------|--------|
| `plugins/compound-engineering/commands/workflows/work.md` | Add `## Input Validation` section with plan file path validation before Phase 1 |
| `plugins/compound-engineering/commands/workflows/review.md` | Add `## Input Validation` section with PR number/branch/URL validation before Main Tasks |
| `plugins/compound-engineering/commands/reproduce-bug.md` | Add `## Input Validation` section with issue number validation |
