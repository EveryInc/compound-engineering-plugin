# Subagent Orchestration Templates

Load this reference when dispatching subagents for plan execution. It provides the implementer prompt template, status vocabulary with escalation decision trees, and model-tier routing guidance.

Adapted from [Superpowers](https://github.com/obra/superpowers) `subagent-driven-development` skill.

## Implementer Prompt Template

When dispatching a subagent for a plan task, use this template structure:

```
You are implementing Task N: [task name]

## Task Description

[FULL TEXT of the implementation unit from the plan — paste it here, don't make the subagent read the file]

## Context

[Scene-setting: where this fits in the larger plan, what was completed before, architectural context]

## Before You Begin

If you have questions about the requirements, approach, dependencies, or anything unclear — ask them now. Raise concerns before starting work. It's always OK to pause and clarify. Don't guess.

## Your Job

1. Implement exactly what the task specifies
2. Write tests following TDD (write failing test first, then minimal code to pass)
3. Verify implementation works
4. Commit your work
5. Self-review (see below)
6. Report back with status

## Self-Review Before Reporting

Review your work with fresh eyes:

**Completeness:** Did I implement everything in the spec? Miss any requirements or edge cases?
**Quality:** Is this my best work? Are names clear? Is the code clean and maintainable?
**Discipline:** Did I avoid overbuilding (YAGNI)? Did I follow existing codebase patterns?
**Testing:** Do tests verify behavior (not mock behavior)? Did I follow TDD? Are tests comprehensive?

If you find issues during self-review, fix them before reporting.

## When You're In Over Your Head

It is always OK to stop and escalate. Bad work is worse than no work.

STOP and escalate when:
- The task requires architectural decisions with multiple valid approaches
- You need to understand code beyond what was provided
- You feel uncertain about whether your approach is correct
- The task involves restructuring code the plan didn't anticipate

## Report Format

- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented (or attempted, if blocked)
- What you tested and test results
- Files changed
- Self-review findings (if any)
- Issues or concerns
```

## Status Vocabulary

Subagents report one of four statuses. Handle each with the decision tree below.

### DONE

Subagent completed the task successfully. Proceed to per-task review (spec-compliance, then code-quality).

### DONE_WITH_CONCERNS

Subagent completed the work but flagged doubts.

**Decision tree:**
- Read the concerns before proceeding
- If concerns are about **correctness or scope** → address them before review
- If concerns are **observations** (e.g., "this file is getting large") → note them and proceed to review

### NEEDS_CONTEXT

Subagent needs information that wasn't provided.

**Decision tree:**
- Read what context is missing
- Provide the missing context (file contents, architectural decisions, API details)
- Re-dispatch the same subagent with the additional context

### BLOCKED

Subagent cannot complete the task.

**Decision tree:**
1. **Context problem** → Provide more context and re-dispatch with the same model
2. **Reasoning limit** → Re-dispatch with a more capable model
3. **Task too large** → Break into smaller pieces and dispatch separately
4. **Plan is wrong** → Escalate to the user — the plan needs revision

**Never** ignore an escalation or force the same model to retry without changes. If the subagent said it's stuck, something needs to change.

## Model-Tier Routing

Use the least powerful model that can handle each role to conserve cost and increase speed.

| Task Type | Model Tier | Signals |
|-----------|-----------|---------|
| **Mechanical implementation** | Fast/cheap | Touches 1-2 files, clear spec, isolated function, well-defined inputs/outputs |
| **Integration and judgment** | Standard | Touches multiple files, pattern matching, coordination between components, debugging |
| **Architecture, design, review** | Most capable | Requires design judgment, broad codebase understanding, review quality assessment |

**Heuristic:** If the plan unit has a complete spec with exact file paths, test scenarios, and patterns to follow — it's mechanical. If it requires the agent to make design decisions — use a more capable model.

### Model Selection Scoring

When the task type isn't immediately obvious, score these signals to decide:

| Signal | Fast/cheap (Haiku) | Standard (Sonnet) | Most capable (Opus) |
|--------|-------------------|-------------------|---------------------|
| **File count** | 1-2 files | 3-8 files | 9+ files |
| **Test complexity** | Unit tests only | Integration tests | Cross-service or E2E tests |
| **Domain** | Config, styling, renaming, docs | Business logic, API endpoints, UI components | Auth, payments, migrations, data integrity |
| **Pattern availability** | Exact pattern exists to copy | Similar pattern exists to adapt | Novel implementation required |
| **Execution note** | None or "trivial" | Standard | "Complex", "cross-cutting", or security-related |
| **Error handling** | No failure modes | Known failure modes | Distributed failures, partial rollback |

**Scoring:** Default to Standard (Sonnet). Upgrade to Most capable (Opus) when 2+ signals point to it. Downgrade to Fast/cheap (Haiku) when all signals point to mechanical work with an exact pattern to follow.

## Per-Task Review Pipeline

After each subagent completes with DONE status:

1. **Spec-compliance review** — Dispatch the `ce-spec-compliance-reviewer` agent. Does the output match the plan unit's Goal, Files, Approach, and Test scenarios? The reviewer explicitly distrusts the implementer's self-report and verifies by reading actual code.

2. **Code-quality review** — Only after spec-compliance passes. Dispatch the `ce-code-quality-per-task-reviewer` agent. Is the code clean, tested, and maintainable?

3. **Fix-and-re-review loop** — If either reviewer raises critical issues, the implementer fixes them and the reviewer re-reviews. Repeat until approved.

**Important:** Do not start code-quality review before spec-compliance passes. Wrong order wastes review effort on code that doesn't meet the spec.

## Red Flags

- Dispatching multiple implementation subagents in parallel on overlapping files (conflicts)
- Making subagent read the plan file (provide full text instead)
- Skipping scene-setting context (subagent needs to know where the task fits)
- Ignoring subagent questions (answer before letting them proceed)
- Accepting "close enough" on spec compliance (issues found = not done)
- Skipping re-review after fixes (reviewer found issues → implementer fixes → review again)
- Letting implementer self-review replace actual review (both are needed)
- Moving to next task while either review has open issues
