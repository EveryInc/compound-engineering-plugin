---
name: go-lite
description: Balanced workflow with conditional browser testing, no web research
disable-model-invocation: true
---

# Go Lite - Balanced Development Workflow

Skips web research for speed. Includes conditional browser testing.

**Model routing**: Opus for strategic phases (plan, review) via Skill tool. Sonnet for execution phases (work, fix, test) via custom agents / Task tool.

**MANDATORY**: You MUST execute ALL phases below in order. Do NOT skip phases, combine phases, or decide the task is "too simple" for the workflow. The user explicitly chose this workflow — respect that choice. Even trivial tasks MUST go through plan → work → review → fix.

## Input

<user_request>
$ARGUMENTS
</user_request>

---

## Step 0: Initialize Ralph Loop (Conditional)

If the `ralph-loop` skill is installed, invoke it:

```
skill: "ralph-loop:ralph-loop"
args: "finish running all tasks --completion-promise DONE"
```

If not installed, skip this step and proceed.

---

<!-- ## Step 0.1: Task Tracking (BYO)

This is where you'd wire in your project's task tracking.

The original workflows used GitHub Projects v2 for issue lifecycle:

```bash
# Parse $ARGUMENTS for issue number: #(\d+)
ISSUE_NUMBER=<parsed>
PROJECT_ID=$(gh project view <NUMBER> --owner <OWNER> --format json --jq '.id')
ITEM_ID=$(gh issue view $ISSUE_NUMBER --repo <OWNER>/<REPO> --json projectItems --jq '.projectItems[0].id')
field_updater.sh set-status "$PROJECT_ID" "$ITEM_ID" "Implementation"
```

To add your own:
- Create a project-level `.claude/commands/go-lite.md` that overrides this skill
- Or add a pre-phase hook in your CLAUDE.md
-->

---

## Phase 0.5: Worktree Setup

Create an isolated worktree for this work:

1. Derive a branch name from the user request (`$ARGUMENTS`):
   - Slugify: lowercase, spaces → hyphens, strip special chars, max 50 chars
   - Prefix: `feat/`, `fix/`, or `chore/` based on request intent
   - Example: "add volume alerts" → `feat/add-volume-alerts`

2. Create the worktree:
   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create <branch-name>
   ```

3. `cd` into the new worktree:
   ```bash
   cd .worktrees/<branch-name>
   ```

4. Confirm you are on the new branch before proceeding.

---

## Phase 1: Planning (Opus — Skill tool)

Use the Skill tool to invoke the planning workflow:

```
skill: "compound-engineering:ce:plan"
args: "$ARGUMENTS"
```

Wait for Phase 1 to complete. Note the plan file path (e.g. `docs/plans/...plan.md`) for Phase 2.

---

## Phase 2: Implementation (Sonnet — work-executor agent)

Use the Task tool to spawn the work-executor agent. This agent has the full /ce:work skill pre-loaded and runs on Sonnet by default.

```
Task tool parameters:
  subagent_type: work-executor
  description: "Implement plan"
  prompt: |
    Plan file: <plan file path from Phase 1>

    Execute the plan completely using the work workflow in your context.
    The user's original request: $ARGUMENTS
```

Wait for Phase 2 to complete before proceeding.

---

## Phase 3: Review (Opus — Skill tool)

Use the Skill tool to invoke the review workflow:

```
skill: "compound-engineering:ce:review"
args: "latest"
```

Wait for Phase 3 to complete before proceeding.

---

## Phase 4: Resolve TODOs (Sonnet — Task tool)

Use the Task tool to spawn a Sonnet subagent for fixing review findings:

```
Task tool parameters:
  subagent_type: general-purpose
  model: sonnet
  description: "Fix review findings"
  prompt: |
    Fix all review findings from the todos/ directory.

    Instructions:
    1. List all pending todo files: ls todos/*-pending-*.md
    2. For each todo file, in priority order (p1 first, then p2, then p3):
       - Read the todo file
       - Understand the problem and proposed solution
       - Implement the fix
       - Run relevant tests to verify
       - Rename the file from pending to complete (e.g. 001-pending-p1-foo.md → 001-complete-p1-foo.md)
    3. After all fixes: run full test suite
    4. Report what was fixed and any remaining issues
```

Wait for Phase 4 to complete before proceeding.

---

## Phase 5: Simplify Code (Sonnet — Skill tool) - Conditional

If the `simplifycode` skill is installed, invoke it:

```
skill: "simplifycode"
```

If not installed, skip this phase — code simplicity review can be done during Phase 3 (review) or manually.

Wait for Phase 5 to complete before proceeding.

---

## Phase 6: Compound (Sonnet — Skill tool) - Conditional

If this workflow resolved a bug, integration issue, or non-obvious problem, use the Skill tool to document the solution:

```
skill: "compound-engineering:ce:compound"
```

If the work was straightforward feature implementation with no novel solutions, skip this phase.

Wait for Phase 6 to complete before proceeding.

---

## Phase 7: Browser Testing (Sonnet — Task tool) - Conditional

Only run if changes touch dashboard files (`dashboard/`). Use the Task tool:

```
Task tool parameters:
  subagent_type: general-purpose
  model: sonnet
  description: "Browser testing"
  prompt: |
    Run browser tests on pages affected by recent changes using agent-browser CLI.

    Instructions:
    1. Check git diff to identify changed dashboard files
    2. Determine which pages/routes are affected
    3. Ensure the dashboard dev server is running (cd dashboard && npm run dev)
    4. For each affected page:
       - agent-browser open http://localhost:3000/<route>
       - agent-browser snapshot -i  (check interactive elements render)
       - agent-browser screenshot <route-name>.png
    5. Report any issues found (missing elements, errors in snapshot)
    6. agent-browser close
```

If no dashboard files were changed, skip this phase and note it in the summary.

Wait for Phase 7 to complete before proceeding.

---

## Phase 8: Commit & Push

Commit all changes, push to remote, and open a PR:

```bash
# Stage all changes
git add -A

# Create commit with descriptive message
git commit -m "feat: <description based on work done>"

# Push branch to remote
git push -u origin $(git branch --show-current)

# Open PR
gh pr create --title "<title>" --body "## Summary

<description>

## Changes

<list of changes>"
```

If the `push` skill is installed, you may use it instead:

```
skill: "push"
```

---

## Completion

After all phases complete, summarize:

1. **Phase 0.5**: Worktree setup - Branch created?
2. **Phase 1 (Opus)**: ce:plan - Plan created?
3. **Phase 2 (Sonnet)**: work-executor - What was built?
4. **Phase 3 (Opus)**: ce:review - Issues found?
5. **Phase 4 (Sonnet)**: Fix findings - What was fixed?
6. **Phase 5 (Sonnet)**: Simplify code - Simplified? (or skipped)
7. **Phase 6 (Sonnet)**: Compound - Solution documented? (or skipped)
8. **Phase 7 (Sonnet)**: Browser test - Tests passed? (or skipped)
9. **Phase 8**: Commit & Push - PR opened? Worktree removed?

List all files created/modified during this workflow.

Output `<promise>DONE</promise>` when all phases complete successfully.
