---
name: workflows:work
description: Execute work plans efficiently while maintaining quality and finishing features
argument-hint: "[plan file, specification, or todo file path]"
disable-model-invocation: true
---

# Work Plan Execution Command

Execute a work plan efficiently while maintaining quality and finishing features.

## Introduction

This command takes a work document (plan, specification, or todo file) and executes it systematically. The focus is on **shipping complete features** by understanding requirements quickly, following existing patterns, and maintaining quality throughout.

## Input Document

<input_document> #$ARGUMENTS </input_document>

## Execution Workflow

## Input Validation

Before proceeding, validate the input:

<input_validation>

**If `$ARGUMENTS` is provided, validate the plan file path:**

```bash
PLAN_PATH="$ARGUMENTS"

# Check file exists
if [[ ! -f "$PLAN_PATH" ]]; then
  echo "Error: Plan file not found."
  echo ""
  echo "  \"$PLAN_PATH\" does not exist."
  echo ""
  echo "Why: The /workflows:work command requires a valid plan file path."
  echo "  Plan files are created by /workflows:plan in docs/plans/."
  echo ""
  echo "Fix: Check the path and try again:"
  echo "  /workflows:work docs/plans/2026-02-09-feat-example-plan.md"
  echo ""
  echo "Available plans:"
  ls -1t docs/plans/*.md 2>/dev/null | head -5
  # STOP - do not proceed
fi

# Check file ends in .md
if [[ "$PLAN_PATH" != *.md ]]; then
  echo "Error: Invalid file type."
  echo ""
  echo "  \"$PLAN_PATH\" is not a Markdown file."
  echo ""
  echo "Why: Work plans must be Markdown (.md) files created by /workflows:plan."
  echo ""
  echo "Fix: Provide a .md file path:"
  echo "  /workflows:work docs/plans/2026-02-09-feat-example-plan.md"
  echo ""
  echo "Available plans:"
  ls -1t docs/plans/*.md 2>/dev/null | head -5
  # STOP - do not proceed
fi

# Check file is in docs/plans/
if [[ "$PLAN_PATH" != docs/plans/* ]]; then
  echo "Error: Plan file is not in docs/plans/."
  echo ""
  echo "  \"$PLAN_PATH\" is outside the expected directory."
  echo ""
  echo "Why: Plan files are expected to be in docs/plans/ where /workflows:plan creates them."
  echo ""
  echo "Fix: Use a plan file from docs/plans/:"
  echo "  /workflows:work docs/plans/2026-02-09-feat-example-plan.md"
  echo ""
  echo "Available plans:"
  ls -1t docs/plans/*.md 2>/dev/null | head -5
  # STOP - do not proceed
fi
```

**If validation passes:** Proceed to Phase 1.

</input_validation>

## Input Handling

<input_handling>

**If `$ARGUMENTS` is non-empty (autonomous mode):**
Validate the plan path and proceed directly to Phase 1: Quick Start. Do not ask questions.

**If `$ARGUMENTS` is empty (interactive mode):**
Help the user select a plan.

1. Scan for recent plans:
   ```bash
   ls -1t docs/plans/*.md 2>/dev/null | head -10
   ```

2. Scan for state files with saved progress:
   ```bash
   ls -1 .*.local.md 2>/dev/null
   ```

3. Use **AskUserQuestion** to present a plan picker:

   **Question:** "Which plan would you like to work on?"
   **Options** (max 5, state-files first, then most recent):
   1. `docs/plans/2026-02-08-feat-user-auth-plan.md` (yesterday) -- has saved progress (recommended)
   2. `docs/plans/2026-02-07-fix-checkout-bug-plan.md` (2 days ago)
   3. `docs/plans/2026-02-05-refactor-api-client-plan.md` (4 days ago)
   4. Enter a file path manually
   5. Browse all plans

   **Special cases:**
   - If only 1 plan exists: "Found one plan: [name]. Work on this? (y/n)"
   - If no plans exist: "No plans found in docs/plans/. Create one first with /workflows:plan"

4. Set the selected plan as the input and proceed to Phase 1.

</input_handling>

### State Discovery

Before starting work, check for saved progress from a previous session:

<state_discovery>

1. **Scan for state files** in the project root:
   ```bash
   ls -1a .*.local.md 2>/dev/null
   ```

2. **Match state to selected plan:**

   For each `.*.local.md` file found, read its YAML frontmatter and check if the `plan_file` field matches the selected plan path. If a match is found:

   - Read the state file contents
   - Extract `phase`, `branch`, `updated`, and `feature` from frontmatter
   - Parse the progress checklist to determine completed steps

3. **Staleness detection:**

   When a matching state file is found, calculate its age:

   ```bash
   STATE_FILE=".feature-slug.local.md"
   UPDATED=$(grep '^updated:' "$STATE_FILE" | sed 's/updated: //')
   AGE_SECONDS=$(( $(date +%s) - $(date -jf "%Y-%m-%dT%H:%M:%SZ" "$UPDATED" +%s 2>/dev/null || date -d "$UPDATED" +%s 2>/dev/null) ))
   AGE_DAYS=$(( AGE_SECONDS / 86400 ))
   ```

   | Age | Behavior |
   |-----|----------|
   | < 24 hours | Resume prompt with "recommended" label |
   | 1-7 days | Resume prompt with neutral framing |
   | > 7 days | Warning: "This saved state is [N] days old and may be outdated" |
   | > 30 days | "Start fresh" becomes the recommended option |

4. **Branch divergence check:**

   If the state file records a branch, check for new commits since the state was saved:

   ```bash
   BRANCH=$(grep '^branch:' "$STATE_FILE" | sed 's/branch: //')
   if [ -n "$BRANCH" ]; then
     COMMITS_SINCE=$(git log --oneline "$BRANCH" --since="$UPDATED" 2>/dev/null | wc -l | tr -d ' ')
     if [ "$COMMITS_SINCE" -gt 0 ]; then
       echo "Note: Branch '$BRANCH' has $COMMITS_SINCE new commit(s) since state was saved."
     fi
   fi
   ```

   If divergence is detected, include a note in the resume prompt: "Branch has [N] new commits since last session."

5. **Resume prompt (matching state found):**

   Use **AskUserQuestion** to present resume options:

   **For states < 24 hours old:**

   **Question:** "Found previous session for '[feature]' (last updated [time ago])"
   **Options:**
   1. Resume from where you left off (recommended)
   2. Start fresh (discards saved progress)
   3. View saved state before deciding

   **For states 1-7 days old:**

   **Question:** "Found previous session for '[feature]' (last updated [N] days ago)"
   **Options:**
   1. Resume from where you left off
   2. Start fresh (discards saved progress)
   3. View saved state before deciding

   **For states > 7 days old:**

   **Question:** "Found previous session for '[feature]' ([N] days old -- may be outdated)"
   **Options:**
   1. Resume from where you left off
   2. Start fresh (recommended -- state is stale)
   3. View saved state before deciding

   **For states > 30 days old:**

   **Question:** "Found previous session for '[feature]' ([N] days old -- likely outdated)"
   **Options:**
   1. Start fresh (recommended)
   2. Resume anyway
   3. View saved state before deciding

   **If "Resume" is selected:**
   - Update the state file's `updated` timestamp to now
   - Set `phase: work`
   - If the state records a branch, check it out: `git checkout $BRANCH`
   - Skip to the appropriate Phase based on progress (e.g., if "Branch created" is checked, skip to Phase 2)

   **If "Start fresh" is selected:**
   - Delete the state file: `rm "$STATE_FILE"`
   - Proceed to Phase 1 as if no state existed

   **If "View saved state" is selected:**
   - Display the state file contents
   - Then re-present the Resume/Start fresh options

6. **No matching state file:**

   If no `.*.local.md` file matches the selected plan, proceed normally to Phase 1. This is the default path for new workflows.

7. **Edge Cases:**

   **Case 1: Corrupt state file (invalid YAML)**

   If a `.*.local.md` file exists but its YAML frontmatter fails to parse (missing delimiters, invalid syntax, malformed fields):

   - Warn: "State file '[filename]' is corrupt (invalid YAML). Cannot read saved progress."
   - Delete the corrupt file: `rm "$STATE_FILE"`
   - Announce: "Deleted corrupt state file. Starting fresh."
   - Proceed to Phase 1 as if no state existed.

   **Case 2: Multiple state files for different features**

   If multiple `.*.local.md` files are found and none match the selected plan (or no plan is selected yet):

   ```bash
   STATE_FILES=$(ls -1a .*.local.md 2>/dev/null)
   STATE_COUNT=$(echo "$STATE_FILES" | wc -l | tr -d ' ')
   ```

   If `STATE_COUNT` > 1 and no plan is selected:

   Use **AskUserQuestion** to present all discovered state files:

   **Question:** "Found [N] saved sessions. Which one would you like to resume?"
   **Options** (max 5, most recent first by `updated` field):
   1. [feature-1] -- last updated [time ago] (recommended)
   2. [feature-2] -- last updated [time ago]
   3. [feature-3] -- last updated [time ago]
   4. Start a new session (ignore saved state)
   5. Enter a plan file path manually

   After selection, proceed with the chosen state file or plan.

   **Case 3: Plan file deleted (state references missing plan)**

   If a matching state file is found but its `plan_file` path no longer exists on disk:

   ```bash
   PLAN_FILE=$(grep '^plan_file:' "$STATE_FILE" | sed 's/plan_file: //')
   if [ ! -f "$PLAN_FILE" ]; then
     echo "Warning: Plan file '$PLAN_FILE' referenced in state has been deleted or moved."
   fi
   ```

   Use **AskUserQuestion**:

   **Question:** "Saved session for '[feature]' references plan '[plan_file]', but that file no longer exists."
   **Options:**
   1. Start fresh (recommended -- delete state, proceed to plan selection)
   2. Enter the new path to the plan file
   3. View saved state before deciding

   If "Enter new path" is selected, validate the new path exists and update the state file's `plan_file` field.

   **Case 4: Phase mismatch (state phase doesn't match current command)**

   If a matching state file is found but the `phase` field indicates work that belongs to a different command:

   | State Phase | Expected Command | Suggestion |
   |-------------|-----------------|------------|
   | `plan-complete` | /workflows:work | Correct -- proceed normally |
   | `work` | /workflows:work | Correct -- resume work |
   | `review` | /workflows:review | Warn: "This feature is in review phase" |
   | `shipped` | (none) | Warn: "This feature has already been shipped" |

   If phase mismatch is detected:

   - Warn: "State file shows phase '[phase]'. You may want to use /workflows:[suggested-command] instead."
   - Still allow the user to proceed if they choose to (don't block).

**Autonomous mode:** When `$ARGUMENTS` is non-empty, skip the resume prompt. If a matching state file exists, auto-resume (update timestamp, checkout branch if recorded). If no state file exists, proceed normally.

</state_discovery>

### Phase 1: Quick Start

1. **Read Plan and Clarify**

   - Read the work document completely
   - Review any references or links provided in the plan
   - If anything is unclear or ambiguous, ask clarifying questions now
   - Get user approval to proceed
   - **Do not skip this** - better to ask questions now than build the wrong thing

2. **Setup Environment**

   First, check the current branch:

   ```bash
   current_branch=$(git branch --show-current)
   default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')

   # Fallback if remote HEAD isn't set
   if [ -z "$default_branch" ]; then
     default_branch=$(git rev-parse --verify origin/main >/dev/null 2>&1 && echo "main" || echo "master")
   fi
   ```

   **If already on a feature branch** (not the default branch):
   - Ask: "Continue working on `[current_branch]`, or create a new branch?"
   - If continuing, proceed to step 3
   - If creating new, follow Option A or B below

   **If on the default branch**, choose how to proceed:

   **Option A: Create a new branch**
   ```bash
   git pull origin [default_branch]
   git checkout -b feature-branch-name
   ```
   Use a meaningful name based on the work (e.g., `feat/user-authentication`, `fix/email-validation`).

   **Option B: Use a worktree (recommended for parallel development)**
   ```bash
   skill: git-worktree
   # The skill will create a new branch from the default branch in an isolated worktree
   ```

   **Option C: Continue on the default branch**
   - Requires explicit user confirmation
   - Only proceed after user explicitly says "yes, commit to [default_branch]"
   - Never commit directly to the default branch without explicit permission

   **Recommendation**: Use worktree if:
   - You want to work on multiple features simultaneously
   - You want to keep the default branch clean while experimenting
   - You plan to switch between branches frequently

3. **Create Todo List**
   - Use TodoWrite to break plan into actionable tasks
   - Include dependencies between tasks
   - Prioritize based on what needs to be done first
   - Include testing and quality check tasks
   - Keep tasks specific and completable

### Phase 2: Execute

1. **Task Execution Loop**

   For each task in priority order:

   ```
   while (tasks remain):
     - Mark task as in_progress in TodoWrite
     - Read any referenced files from the plan
     - Look for similar patterns in codebase
     - Implement following existing conventions
     - Write tests for new functionality
     - Run tests after changes
     - Mark task as completed in TodoWrite
     - Mark off the corresponding checkbox in the plan file ([ ] → [x])
     - Evaluate for incremental commit (see below)
   ```

   **IMPORTANT**: Always update the original plan document by checking off completed items. Use the Edit tool to change `- [ ]` to `- [x]` for each task you finish. This keeps the plan as a living document showing progress and ensures no checkboxes are left unchecked.

2. **Incremental Commits**

   After completing each task, evaluate whether to create an incremental commit:

   | Commit when... | Don't commit when... |
   |----------------|---------------------|
   | Logical unit complete (model, service, component) | Small part of a larger unit |
   | Tests pass + meaningful progress | Tests failing |
   | About to switch contexts (backend → frontend) | Purely scaffolding with no behavior |
   | About to attempt risky/uncertain changes | Would need a "WIP" commit message |

   **Heuristic:** "Can I write a commit message that describes a complete, valuable change? If yes, commit. If the message would be 'WIP' or 'partial X', wait."

   **Commit workflow:**
   ```bash
   # 1. Verify tests pass (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # 2. Stage only files related to this logical unit (not `git add .`)
   git add <files related to this logical unit>

   # 3. Commit with conventional message
   git commit -m "feat(scope): description of this unit"
   ```

   **Handling merge conflicts:** If conflicts arise during rebasing or merging, resolve them immediately. Incremental commits make conflict resolution easier since each commit is small and focused.

   **Note:** Incremental commits use clean conventional messages without attribution footers. The final Phase 4 commit/PR includes the full attribution.

3. **Follow Existing Patterns**

   - The plan should reference similar code - read those files first
   - Match naming conventions exactly
   - Reuse existing components where possible
   - Follow project coding standards (see CLAUDE.md)
   - When in doubt, grep for similar implementations

4. **Test Continuously**

   - Run relevant tests after each significant change
   - Don't wait until the end to test
   - Fix failures immediately
   - Add new tests for new functionality

5. **Figma Design Sync** (if applicable)

   For UI work with Figma designs:

   - Implement components following design specs
   - Use figma-design-sync agent iteratively to compare
   - Fix visual differences identified
   - Repeat until implementation matches design

6. **Track Progress**
   - Keep TodoWrite updated as you complete tasks
   - Note any blockers or unexpected discoveries
   - Create new tasks if scope expands
   - Keep user informed of major milestones

### Phase 3: Quality Check

1. **Run Core Quality Checks**

   Always run before submitting:

   ```bash
   # Run full test suite (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # Run linting (per CLAUDE.md)
   # Use linting-agent before pushing to origin
   ```

2. **Consider Reviewer Agents** (Optional)

   Use for complex, risky, or large changes:

   - **code-simplicity-reviewer**: Check for unnecessary complexity
   - **kieran-rails-reviewer**: Verify Rails conventions (Rails projects)
   - **performance-oracle**: Check for performance issues
   - **security-sentinel**: Scan for security vulnerabilities
   - **cora-test-reviewer**: Review test quality (Rails projects with comprehensive test coverage)

   Run reviewers in parallel with Task tool:

   ```
   Task(code-simplicity-reviewer): "Review changes for simplicity"
   Task(kieran-rails-reviewer): "Check Rails conventions"
   ```

   Present findings to user and address critical issues.

3. **Final Validation**
   - All TodoWrite tasks marked completed
   - All tests pass
   - Linting passes
   - Code follows existing patterns
   - Figma designs match (if applicable)
   - No console errors or warnings

### Phase 4: Ship It

1. **Create Commit**

   ```bash
   git add .
   git status  # Review what's being committed
   git diff --staged  # Check the changes

   # Commit with conventional format
   git commit -m "$(cat <<'EOF'
   feat(scope): description of what and why

   Brief explanation if needed.

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```

2. **Capture and Upload Screenshots for UI Changes** (REQUIRED for any UI work)

   For **any** design changes, new views, or UI modifications, you MUST capture and upload screenshots:

   **Step 1: Start dev server** (if not running)
   ```bash
   bin/dev  # Run in background
   ```

   **Step 2: Capture screenshots with agent-browser CLI**
   ```bash
   agent-browser open http://localhost:3000/[route]
   agent-browser snapshot -i
   agent-browser screenshot output.png
   ```
   See the `agent-browser` skill for detailed usage.

   **Step 3: Upload using imgup skill**
   ```bash
   skill: imgup
   # Then upload each screenshot:
   imgup -h pixhost screenshot.png  # pixhost works without API key
   # Alternative hosts: catbox, imagebin, beeimg
   ```

   **What to capture:**
   - **New screens**: Screenshot of the new UI
   - **Modified screens**: Before AND after screenshots
   - **Design implementation**: Screenshot showing Figma design match

   **IMPORTANT**: Always include uploaded image URLs in PR description. This provides visual context for reviewers and documents the change.

3. **Create Pull Request**

   ```bash
   git push -u origin feature-branch-name

   gh pr create --title "Feature: [Description]" --body "$(cat <<'EOF'
   ## Summary
   - What was built
   - Why it was needed
   - Key decisions made

   ## Testing
   - Tests added/modified
   - Manual testing performed

   ## Before / After Screenshots
   | Before | After |
   |--------|-------|
   | ![before](URL) | ![after](URL) |

   ## Figma Design
   [Link if applicable]

   ---

   [![Compound Engineered](https://img.shields.io/badge/Compound-Engineered-6366f1)](https://github.com/EveryInc/compound-engineering-plugin) 🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

4. **Notify User**
   - Summarize what was completed
   - Link to PR
   - Note any follow-up work needed
   - Suggest next steps if applicable

---

## Swarm Mode (Optional)

For complex plans with multiple independent workstreams, enable swarm mode for parallel execution with coordinated agents.

### When to Use Swarm Mode

| Use Swarm Mode when... | Use Standard Mode when... |
|------------------------|---------------------------|
| Plan has 5+ independent tasks | Plan is linear/sequential |
| Multiple specialists needed (review + test + implement) | Single-focus work |
| Want maximum parallelism | Simpler mental model preferred |
| Large feature with clear phases | Small feature or bug fix |

### Enabling Swarm Mode

To trigger swarm execution, say:

> "Make a Task list and launch an army of agent swarm subagents to build the plan"

Or explicitly request: "Use swarm mode for this work"

### Swarm Workflow

When swarm mode is enabled, the workflow changes:

1. **Create Team**
   ```
   Teammate({ operation: "spawnTeam", team_name: "work-{timestamp}" })
   ```

2. **Create Task List with Dependencies**
   - Parse plan into TaskCreate items
   - Set up blockedBy relationships for sequential dependencies
   - Independent tasks have no blockers (can run in parallel)

3. **Spawn Specialized Teammates**
   ```
   Task({
     team_name: "work-{timestamp}",
     name: "implementer",
     subagent_type: "general-purpose",
     prompt: "Claim implementation tasks, execute, mark complete",
     run_in_background: true
   })

   Task({
     team_name: "work-{timestamp}",
     name: "tester",
     subagent_type: "general-purpose",
     prompt: "Claim testing tasks, run tests, mark complete",
     run_in_background: true
   })
   ```

4. **Coordinate and Monitor**
   - Team lead monitors task completion
   - Spawn additional workers as phases unblock
   - Handle plan approval if required

5. **Cleanup**
   ```
   Teammate({ operation: "requestShutdown", target_agent_id: "implementer" })
   Teammate({ operation: "requestShutdown", target_agent_id: "tester" })
   Teammate({ operation: "cleanup" })
   ```

See the `orchestrating-swarms` skill for detailed swarm patterns and best practices.

---

## Key Principles

### Start Fast, Execute Faster

- Get clarification once at the start, then execute
- Don't wait for perfect understanding - ask questions and move
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
- Run linting before pushing
- Use reviewer agents for complex/risky changes only

### Ship Complete Features

- Mark all tasks completed before moving on
- Don't leave features 80% done
- A finished feature that ships beats a perfect feature that doesn't

## Quality Checklist

Before creating PR, verify:

- [ ] All clarifying questions asked and answered
- [ ] All TodoWrite tasks marked completed
- [ ] Tests pass (run project's test command)
- [ ] Linting passes (use linting-agent)
- [ ] Code follows existing patterns
- [ ] Figma designs match implementation (if applicable)
- [ ] Before/after screenshots captured and uploaded (for UI changes)
- [ ] Commit messages follow conventional format
- [ ] PR description includes summary, testing notes, and screenshots
- [ ] PR description includes Compound Engineered badge

## When to Use Reviewer Agents

**Don't use by default.** Use reviewer agents only when:

- Large refactor affecting many files (10+)
- Security-sensitive changes (authentication, permissions, data access)
- Performance-critical code paths
- Complex algorithms or business logic
- User explicitly requests thorough review

For most features: tests + linting + following patterns is sufficient.

## Common Pitfalls to Avoid

- **Analysis paralysis** - Don't overthink, read the plan and execute
- **Skipping clarifying questions** - Ask now, not after building wrong thing
- **Ignoring plan references** - The plan has links for a reason
- **Testing at the end** - Test continuously or suffer later
- **Forgetting TodoWrite** - Track progress or lose track of what's done
- **80% done syndrome** - Finish the feature, don't move on early
- **Over-reviewing simple changes** - Save reviewer agents for complex work
