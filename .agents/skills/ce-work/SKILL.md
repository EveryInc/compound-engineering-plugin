---
name: ce-work
description: "Execute work efficiently while maintaining quality and finishing features"
argument-hint: "[Plan doc path or description of work. Blank to auto use latest plan doc]"
target: zed
---

# Work Execution Command

Execute work efficiently while maintaining quality and finishing features.

## Introduction

This command takes a work document (plan or specification) or a bare prompt describing the work, and executes it systematically. The focus is on **shipping complete features** by understanding requirements quickly, following existing patterns, and maintaining quality throughout.

## Input Document

<input_document> #$ARGUMENTS </input_document>

## Execution Workflow

### Phase 0: Input Triage

Determine how to proceed based on what was provided in `<input_document>`.

**Plan document** (input is a file path to an existing plan or specification): read the plan's metadata first. If it carries `execution: knowledge-work`, this is a **non-code plan** -- read `references/non-code-execution.md` and follow that carve-out instead of the rest of this workflow. Otherwise (the field is absent or `execution: code`) -> skip to Phase 1 and run the normal code lifecycle.

**Bare prompt** (input is a description of work, not a file path):

1. **Scan the work area**

   - Identify files likely to change based on the prompt
   - Find existing test files for those areas (search for test/spec files that import, reference, or share names with the implementation files)
   - Note local patterns and conventions in the affected areas

2. **Assess complexity and route**

   | Complexity | Signals | Action |
   |-----------|---------|--------|
   | **Trivial** | 1-2 files, no behavioral change (typo, config, rename) | Proceed to Phase 1 step 2 (environment setup), then implement directly -- no task list, no execution loop. Apply Test Discovery if the change touches behavior-bearing code |
   | **Small / Medium** | Clear scope, under ~10 files | Build a task list from discovery. Proceed to Phase 1 step 2 |
   | **Large** | Cross-cutting, architectural decisions, 10+ files, touches auth/payments/migrations | Inform the user this would benefit from `/ce-brainstorm` or `/ce-plan` to surface edge cases and scope boundaries. Honor their choice. If proceeding, build a task list and continue to Phase 1 step 2 |

---

### Phase 1: Quick Start

1. **Read Plan and Clarify** _(skip if arriving from Phase 0 with a bare prompt)_

   - Read the work document completely.
   - Treat the plan as a decision artifact, not an execution script
   - If the plan includes sections such as `Implementation Units`, `Work Breakdown`, `Requirements` (or legacy `Requirements Trace`), `Files`, `Test Scenarios`, or `Verification`, use those as the primary source material for execution
   - Check for `Execution note` on each implementation unit -- note them when creating tasks
   - Check for a `Deferred to Implementation` or `Implementation-Time Unknowns` section -- note them before starting so they inform your approach
   - Check for a `Scope Boundaries` section -- refer back to them if implementation starts pulling you toward adjacent work
   - If anything is unclear or ambiguous, ask clarifying questions now
   - **Do not edit the plan body during execution.** The plan is a decision artifact. The only plan mutation during ce-work is the final status flip at shipping (see `references/shipping-workflow.md` Phase 4 Step 2).

2. **Setup Environment**

   First, check the current branch:

   ```bash
   current_branch=$(git branch --show-current)
   default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')

   if [ -z "$default_branch" ]; then
     default_branch=$(git rev-parse --verify origin/main >/dev/null 2>&1 && echo "main" || echo "master")
   fi
   ```

   **If already on a feature branch** (not the default branch):

   First, check whether the branch name is **meaningful**. Auto-generated worktree names do not.

   If the branch name is meaningless or auto-generated, suggest renaming it before continuing:

   ```bash
   git branch -m <meaningful-name>
   ```

   Derive the new name from the plan title or work description (e.g., `feat/crowd-sniff`). Present the rename as a recommended option alongside continuing as-is.

   Then ask: "Continue working on `[current_branch]`, or create a new branch?"

3. **Create Task List** _(skip if Phase 0 already built one, or if Phase 0 routed as Trivial)_

   - Break the plan into actionable tasks
   - Derive tasks from the plan's implementation units, dependencies, files, test targets, and verification criteria
   - Preserve U-ID prefixes when the plan defines them
   - Carry each unit's `Execution note` into the task when present
   - Include dependencies between tasks
   - Keep tasks specific and completable

4. **Choose Execution Strategy**

   After creating the task list, decide how to execute based on the plan's size and dependency structure:

   | Strategy | When to use |
   |----------|-------------|
   | **Inline** | 1-2 small tasks, or tasks needing user interaction mid-flight. **Default for bare-prompt work** |
   | **Serial subagents** | 3+ tasks with dependencies between them. Each subagent gets a fresh context window focused on one unit |

   For Zed-native execution:

   - Use `spawn_agent` when you need isolated context on one unit or one concern.
   - Keep orchestration in the main session so the plan's guardrails remain visible.

   If execution reveals overlap or scope that benefits from parallelism, prefer splitting the work into serial `spawn_agent` batches instead of broad parallel dispatch.

### Phase 2: Execute

1. **Task Execution Loop**

   For each task in priority order:

   ```
   while (tasks remain):
     - Mark task as in-progress
     - Read any referenced files from the plan or discovered during Phase 0
     - **If the unit's work is already present and matches the plan's intent** (files exist with the expected capability, or the unit's `Verification` criteria are already satisfied by the current code), verify it matches, mark the task complete, and move on.
     - Look for similar patterns in codebase
     - Find existing test files for implementation files being changed (Test Discovery)
     - Implement following existing conventions
     - Add, update, or remove tests to match implementation changes
     - Run tests after changes
     - Mark task as completed
   ```

   When a unit carries an `Execution note`, honor it. For test-first units, write the failing test before implementation for that unit. For characterization-first units, capture existing behavior before changing it.

   **Test Discovery** -- Before implementing changes to a file, find its existing test files (search for test/spec files that import, reference, or share naming patterns with the implementation file). Changes to implementation files should be accompanied by corresponding test updates.

   **Test Scenario Completeness** -- Before writing tests for a feature-bearing unit, check whether the plan's `Test scenarios` cover all categories that apply to this unit. If a category is missing or scenarios are vague, supplement from the unit's own context before writing tests:

   | Category | When it applies | How to derive if missing |
   |----------|----------------|------------------------|
   | **Happy path** | Always for feature-bearing units | Read the unit's Goal and Approach for core input/output pairs |
   | **Edge cases** | When the unit has meaningful boundaries | Identify boundary values, empty/nil inputs, and concurrent access patterns |
   | **Error/failure paths** | When the unit has failure modes | Enumerate invalid inputs the unit should reject, permission/auth denials it should enforce, and downstream failures it should handle |
   | **Integration** | When the unit crosses layers | Identify the cross-layer chain and write a scenario that exercises it without mocks |

   **System-Wide Test Check** -- Before marking a task done, ask:

   | Question | What to do |
   |----------|------------|
   | **What fires when this runs?** Callbacks, middleware, observers, event handlers -- trace two levels out from your change. | Read the actual code for callbacks on models you touch, middleware in the request chain, hooks. |
   | **Do my tests exercise the real chain?** If every dependency is mocked, the test proves your logic works in isolation -- it says nothing about the interaction. | Write at least one integration test that uses real objects through the full callback/middleware chain. |
   | **Can failure leave orphaned state?** If your code persists state before calling an external service, what happens when the service fails? | Trace the failure path with real objects. Verify failure cleans up or that retry is idempotent when state is created before the risky call. |
   | **What other interfaces expose this?** Mixins, DSLs, alternative entry points. | Grep for the method/behavior in related classes. If parity is needed, add it now. |
   | **Do error strategies align across layers?** Retry middleware + application fallback + framework error handling -- do they conflict or create double execution? | Verify your rescue list matches what the lower layer actually raises. |

   **When to skip:** Leaf-node changes with no callbacks, no state persistence, no parallel interfaces.

   **When this matters most:** Changes that touch models with callbacks, error handling with fallback/retry, or functionality exposed through multiple interfaces.

2. **Incremental Commits**

   After completing each task, evaluate whether to create an incremental commit:

   | Commit when... | Don't commit when... |
   |----------------|---------------------|
   | Logical unit complete (model, service, component) | Small part of a larger unit |
   | Tests pass + meaningful progress | Tests failing |
   | About to switch contexts (backend -> frontend) | Purely scaffolding with no behavior |
   | About to attempt risky/uncertain changes | Would need a "WIP" commit message |

### Phase 3-4: Quality Check and Finishing Work

When all Phase 2 tasks are complete and execution transitions to quality check, you must read `references/shipping-workflow.md` for the full shipping workflow. Do not skip this.

## Key Principles

### Start Fast, Execute Faster

- Get clarification once at the start, then execute
- The goal is to **finish the feature**, not create perfect process

### The Plan is Your Guide

- Work documents should reference similar code and patterns
- Load those references and follow them
- Don't reinvent - match what exists

### Test As You Go

- Run tests after each change, not at the end
- Fix failures immediately
- Continuous testing prevents big surprises

### Quality is Built In

- Follow existing patterns
- Write tests for new code
- Run linting before shipping
- Review when Tier 1 is available or Tier 2 criteria match (see `references/shipping-workflow.md`)

### Ship Complete Features

- Mark all tasks completed before moving on
- Don't leave features 80% done

## Common Pitfalls to Avoid

- **Analysis paralysis** - Don't overthink, read the plan and execute
- **Skipping clarifying questions** - Ask now, not after building wrong thing
- **Ignoring plan references** - The plan has links for a reason
- **Testing at the end** - Test continuously or suffer later
- **Forgetting to track progress** - Update task status as you go or lose track of what's done
- **80% done syndrome** - Finish the feature, don't move on early
- **Skipping review without reason** -- Use Tier 1 when available; escalate to Tier 2 only on criteria in `references/shipping-workflow.md`; document when both are skipped
