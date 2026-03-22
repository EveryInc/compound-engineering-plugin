---
title: "feat: Unified /go Workflow Skill"
type: feat
status: active
date: 2026-03-21
origin: docs/brainstorms/2026-03-21-unified-go-workflow-brainstorm.md
---

# feat: Unified /go Workflow Skill

## Overview

Replace 9 separate go-* workflow skills with a single parameterized `/go` skill. The unified skill is marketplace-ready — no hardcoded usernames, repos, test runners, or auth setups. Auto-detects project settings with config override support.

## Problem Statement / Motivation

The current go-* workflow system has 9 separate files sharing ~85% identical content:
- **Drift**: Local versions diverge from marketplace copies and from each other
- **Maintenance**: Every bug fix or improvement must be applied 9 times
- **Portability**: Files contain hardcoded references to `t851029`, `options-v2`, `project 10`, Clerk auth, pytest, and `dashboard/`
- **Bloat**: `-auto` variants are full copies with one extra phase prepended

(see brainstorm: `docs/brainstorms/2026-03-21-unified-go-workflow-brainstorm.md`)

## Proposed Solution

A single `plugins/compound-engineering/skills/go/SKILL.md` that:

1. **Parses mode** from the first word of `$ARGUMENTS` (`ham`, `lite`, `lite-noweb`, `bug`, `bug-parallel`, plus `-auto` suffix)
2. **Auto-detects** test command and frontend directory from project files
3. **Reads config overrides** from `compound-engineering.local.md` frontmatter
4. **Executes phases** based on a mode → phase feature-flag table
5. **Documents BYO** patterns for task tracking and auth

### File Changes

| Action | File |
|--------|------|
| **CREATE** | `plugins/compound-engineering/skills/go/SKILL.md` |
| **DELETE** | `plugins/compound-engineering/skills/go-ham/SKILL.md` |
| **DELETE** | `plugins/compound-engineering/skills/go-lite/SKILL.md` |
| **DELETE** | `plugins/compound-engineering/skills/go-lite-noweb/SKILL.md` |
| **UPDATE** | `plugins/compound-engineering/.claude-plugin/plugin.json` |
| **UPDATE** | `.claude-plugin/marketplace.json` |
| **UPDATE** | `plugins/compound-engineering/README.md` |
| **UPDATE** | `plugins/compound-engineering/CHANGELOG.md` |
| **UPDATE** | `README.md` (root) |
| **UPDATE** | `setup.sh` (OpenCode symlink installer) |

## Implementation

### Step 1: Create the unified SKILL.md

Create `plugins/compound-engineering/skills/go/SKILL.md` with the following structure:

**Frontmatter:**
```yaml
---
name: go
description: Autonomous development workflow — plan, implement, review, and push. Modes: ham (full), lite (balanced), lite-noweb (fast), bug (lightweight fix), bug-parallel (multi-issue).
argument-hint: "<mode> [description or issue #]"
disable-model-invocation: true
---
```

**Section 1: Mode Parsing**

Parse the first token of `$ARGUMENTS` to determine mode and extract remaining args:

```
Supported modes:
  ham          — Full: brainstorm? → plan → deepen → implement → review → fix → simplify → compound → browser test → push
  lite         — Balanced: brainstorm? → plan → implement → review → fix → simplify → compound → browser test → push
  lite-noweb   — Fast: brainstorm? → plan → implement → review → fix → simplify → compound → push
  bug          — Lightweight: quick RCA → single subagent → verify → push
  bug-parallel — Dispatcher: spawn /go bug per issue in parallel

Add -auto suffix to any mode for autonomous brainstorm (e.g., ham-auto, lite-auto, bug-auto).

If no mode provided: show usage help with mode descriptions.
If unrecognized mode: show "Unknown mode '<X>'. Available: ham, lite, lite-noweb, bug, bug-parallel" and stop.
```

The mode parser should:
1. Extract first whitespace-delimited token from `$ARGUMENTS`
2. Match against known modes (with and without `-auto` suffix)
3. Set `MODE` variable (e.g., `ham`, `lite`, `bug`)
4. Set `AUTO_MODE` boolean (true if `-auto` suffix detected)
5. Set `REMAINING_ARGS` to everything after the mode token

**Section 2: Runtime Configuration**

Auto-detect project settings, then check for overrides:

```
## Runtime Configuration

### Auto-Detection

Detect test command:
- If `package.json` exists → `npm test`
- If `pyproject.toml` exists → `python -m pytest tests/ -v`
- If `Gemfile` exists → `bundle exec rspec`
- If `go.mod` exists → `go test ./...`
- If `Cargo.toml` exists → `cargo test`
- If `Makefile` exists with `test` target → `make test`
- Fallback: skip test phase, warn "No test command detected"

Detect frontend directory:
- Scan for directories: `frontend/`, `dashboard/`, `client/`, `web/`, `app/` (with package.json inside)
- Use first match
- Fallback: no frontend dir (browser testing phase skipped)

### Config Override

Read `compound-engineering.local.md` frontmatter for overrides:
- `test_command:` — overrides auto-detected test command
- `frontend_dir:` — overrides auto-detected frontend directory

Example compound-engineering.local.md:
  ```yaml
  ---
  test_command: "npm run test:ci"
  frontend_dir: "dashboard"
  review_agents: [kieran-typescript-reviewer]
  ---
  ```
```

**Section 3: Phase Table**

A reference table showing which phases each mode includes. This drives all conditional logic:

```
| Phase                        | lite-noweb | lite | ham  | bug  |
|------------------------------|:---:|:---:|:---:|:---:|
| Brainstorm (if -auto)        | yes | yes | yes | yes |
| Worktree setup               | yes | yes | yes | -   |
| Planning (ce:plan)           | yes | yes | yes | inline RCA |
| Deepen plan                  | -   | -   | yes | -   |
| Implementation               | yes | yes | yes | single subagent |
| Review (ce:review)           | yes | yes | yes | -   |
| Resolve TODOs                | yes | yes | yes | -   |
| Simplify code (if installed) | yes | yes | yes | -   |
| Compound (conditional)       | yes | yes | yes | -   |
| Browser testing (conditional)| -   | yes | yes | conditional |
| Push                         | yes | yes | yes | yes |
```

**Section 4: Bug-Parallel Dispatcher**

If `MODE == bug-parallel`:
- Parse all issue numbers from `REMAINING_ARGS` (accept `#674 #540`, `674 540`, `#674, #540`)
- If zero issues: show usage
- If one issue: suggest `/go bug #NNN` instead
- If 2-5 issues: spawn one Agent per issue with `isolation: worktree`, `mode: auto`, `run_in_background: true`
- If >5 issues: reject, tell user to batch
- Report results as each agent completes
- Final summary table

This section is self-contained — it does NOT use the phase table.

**Section 5: Bug Mode Phases**

If `MODE == bug`:
- Phase 1: Quick RCA (Opus, main thread, ~30 seconds)
  - Search `docs/solutions/` for prior fixes
  - Read 2-3 relevant files
  - Write inline plan (root cause, files, fix approach, test, verify command)
  - 2-minute planning cap — escalate to `/go lite` if exceeded
- Phase 2: Execute (single Sonnet subagent)
  - Dispatch ONE agent with the plan text only
  - TDD: write failing test first, then fix, then verify
  - Run project test suite using detected `TEST_COMMAND`
  - Commit: `fix: <description>`
- Phase 3: Verify + Ship
  - Run test suite if not already done
  - Real data validation (run the verify command from the plan)
  - Frontend check if `FRONTEND_DIR` files changed: build check, optional screenshot
  - Push via `/push` skill if installed, otherwise manual git commands
  - Report: PR URL, fix summary, test results

Guardrails: max 3 files changed, max 1 subagent, no plan file, 2-minute cap.

**Section 6: Standard Mode Phases (ham, lite, lite-noweb)**

The core workflow shared by all three standard modes. Each phase is conditional based on the phase table.

Phase 0 (if -auto): Brainstorm
```
skill: "compound-engineering:ce:brainstorm"
args: "--auto $REMAINING_ARGS"
```
Wait. Note brainstorm doc path.

Phase 0.5: Worktree Setup
- Derive branch name from `$REMAINING_ARGS`
- `bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create <branch>`
- `cd .worktrees/<branch>`

Phase 1: Planning
```
skill: "compound-engineering:ce:plan"
args: "<brainstorm doc path OR $REMAINING_ARGS>"
```
Note plan file path.

Phase 2 (ham only): Deepen Plan
```
skill: "compound-engineering:deepen-plan"
args: "<plan file path>"
```

Phase 3: Implementation
```
Task tool:
  subagent_type: work-executor
  description: "Implement plan"
  prompt: |
    Plan file: <plan file path>
    Execute the plan completely using the work workflow.
    The user's original request: $REMAINING_ARGS
```

Phase 4: Review
```
skill: "compound-engineering:ce:review"
args: "latest"
```

Phase 5: Resolve TODOs
```
Task tool:
  subagent_type: general-purpose
  model: sonnet
  description: "Fix review findings"
  prompt: |
    Fix all review findings from the todos/ directory.
    1. List pending todo files: ls todos/*-pending-*.md
    2. For each, in priority order: read, fix, test, rename to complete
    3. After all fixes: run test suite
    4. Report what was fixed
```

Phase 6 (conditional): Simplify Code
- If `simplifycode` skill is installed, invoke it
- Otherwise skip

Phase 7 (conditional): Compound
- If work resolved a bug, non-obvious problem, or required investigation: document
- If straightforward feature: skip
```
skill: "compound-engineering:ce:compound"
```

Phase 8 (lite and ham only, conditional): Browser Testing
- Only if changes touch files in `FRONTEND_DIR`
- Generic browser testing prompt — no Clerk auth, no hardcoded URLs
```
Task tool:
  subagent_type: general-purpose
  model: sonnet
  description: "Browser testing"
  prompt: |
    Run browser tests on pages affected by recent changes.
    Frontend directory: <FRONTEND_DIR>

    1. Check git diff to identify changed frontend files
    2. Determine which pages/routes are affected
    3. Ensure the dev server is running in the frontend directory
    4. For each affected page:
       - agent-browser open http://localhost:3000/<route>
       - agent-browser snapshot -i
       - agent-browser screenshot <route-name>.png
    5. Report any issues found
    6. agent-browser close

    Note: If the project requires authentication for browser testing,
    follow the auth setup documented in the project's CLAUDE.md.
```

Phase 9: Push
- If `push` skill installed: `skill: "push"`
- Otherwise: `git add -A && git commit && git push && gh pr create`

**Section 7: BYO Task Tracking**

Document how users can add their own task tracking:

```
## BYO: Task Tracking (Optional)

This skill does not include built-in task tracking. To add your own:

### Option 1: Project-level command override
Create `.claude/commands/go.md` in your project that wraps this skill
and adds issue tracking before Phase 1.

### Option 2: CLAUDE.md instructions
Add a "Pre-workflow" section to your project CLAUDE.md with tracking commands.

### Option 3: Fork
Fork the plugin and add Step 0.1 with your tracker's commands.

### Example: GitHub Projects v2
<!--
  ISSUE_NUMBER=$(echo "$ARGUMENTS" | grep -oE '#[0-9]+' | head -1 | tr -d '#')
  PROJECT_ID=$(gh project view <NUMBER> --owner <OWNER> --format json --jq '.id')
  ITEM_ID=$(gh project item-list <NUMBER> --owner <OWNER> --limit 200 --format json \
    | python3 -c "import json,sys; ...")
  field_updater.sh set-status "$PROJECT_ID" "$ITEM_ID" "Implementation" || true
-->
```

**Section 8: Enforcement Rules**

Keep the enforcement rules from the current skills — these are valuable and generic:
- No phase skipping (for standard modes)
- No substitutions
- Echo before execute
- Per-task isolation (for per-task dispatch variant)

**Section 9: Completion Summary**

Mode-aware completion summary that only lists phases the mode actually ran.

### Step 2: Delete old skill directories

Remove the three marketplace skill directories:
- `plugins/compound-engineering/skills/go-ham/`
- `plugins/compound-engineering/skills/go-lite/`
- `plugins/compound-engineering/skills/go-lite-noweb/`

### Step 3: Update plugin metadata

**`plugins/compound-engineering/.claude-plugin/plugin.json`:**
- Decrement skill count by 2 (3 removed, 1 added = net -2)
- Update description string with new count

**`.claude-plugin/marketplace.json`:**
- Update description string with new skill count
- Bump version

### Step 4: Update README.md

**`plugins/compound-engineering/README.md`:**
- Replace the three separate go-* skill entries with one `/go` entry
- Document modes and usage examples
- Update component counts

**Root `README.md`:**
- Update the "Three Workflows" section to reflect unified `/go` with modes
- Update the installation and usage examples
- Update the "Task Tracking (BYO)" section
- Update the model routing table
- Update the "Compound Engineering Skills Used" table

### Step 5: Update setup.sh

Update the OpenCode symlink installer to create a single `go.md` symlink instead of three separate ones.

### Step 6: Update CHANGELOG.md

Add entry documenting the unification:
- Unified 3 go-* skills into single `/go` skill with mode parameter
- Added auto-detection for test command and frontend directory
- Added config override via `compound-engineering.local.md`
- Removed hardcoded project-specific references
- Added BYO task tracking documentation

### Step 7: Run verification

```bash
# Verify new skill exists
ls plugins/compound-engineering/skills/go/SKILL.md

# Verify old skills removed
! ls plugins/compound-engineering/skills/go-ham/SKILL.md 2>/dev/null
! ls plugins/compound-engineering/skills/go-lite/SKILL.md 2>/dev/null
! ls plugins/compound-engineering/skills/go-lite-noweb/SKILL.md 2>/dev/null

# Verify JSON is valid
cat plugins/compound-engineering/.claude-plugin/plugin.json | jq .
cat .claude-plugin/marketplace.json | jq .

# Count skills and verify description matches
ls -d plugins/compound-engineering/skills/*/ | wc -l
grep -o "and [0-9]* skill" plugins/compound-engineering/.claude-plugin/plugin.json
```

## Acceptance Criteria

- [ ] Single `/go` SKILL.md replaces three separate go-* SKILL.md files
- [ ] `/go ham`, `/go lite`, `/go lite-noweb` modes work with correct phase subsets
- [ ] `/go bug` mode included with lightweight RCA flow
- [ ] `/go bug-parallel` dispatcher mode included
- [ ] `-auto` suffix triggers brainstorm on any mode
- [ ] No hardcoded usernames, repos, project numbers, or auth setups
- [ ] Test command auto-detected from project files (package.json, pyproject.toml, etc.)
- [ ] Frontend directory auto-detected from common dir names
- [ ] Config overrides read from `compound-engineering.local.md` frontmatter
- [ ] BYO task tracking documented with GitHub Projects v2 example
- [ ] Old go-ham, go-lite, go-lite-noweb directories deleted
- [ ] plugin.json and marketplace.json updated with correct counts
- [ ] README.md (both root and plugin) updated
- [ ] CHANGELOG.md updated
- [ ] setup.sh updated for OpenCode
- [ ] All JSON files pass `jq .` validation

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-21-unified-go-workflow-brainstorm.md](docs/brainstorms/2026-03-21-unified-go-workflow-brainstorm.md) — Key decisions carried forward: single `/go` skill with mode param, auto-detect + config override, BYO task tracking

### Internal References

- Existing go-ham SKILL.md: `plugins/compound-engineering/skills/go-ham/SKILL.md`
- Existing go-lite SKILL.md: `plugins/compound-engineering/skills/go-lite/SKILL.md`
- Existing go-lite-noweb SKILL.md: `plugins/compound-engineering/skills/go-lite-noweb/SKILL.md`
- Setup skill (config pattern): `plugins/compound-engineering/skills/setup/SKILL.md`
- Git worktree skill: `plugins/compound-engineering/skills/git-worktree/scripts/worktree-manager.sh`
- User's local go-bug command: `~/.claude/commands/go-bug.md`
- User's local go-bug-parallel command: `~/.claude/commands/go-bug-parallel.md`
