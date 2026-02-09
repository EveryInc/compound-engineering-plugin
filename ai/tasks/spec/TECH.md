# Technical Architecture: Smart-Ralph Command Scaffolding Improvements

**Author:** agent-foreman:tech
**Date:** 2026-02-09
**Plugin:** compound-engineering v2.31.0 (24 commands, 29 agents, 18 skills, 0 hooks)

---

## Technical Architecture

### System Context

The compound-engineering plugin is a Claude Code plugin installed at `plugins/compound-engineering/` within the `compound-engineering-plugin` repository. The repository also contains:

- A **Bun/TypeScript CLI** at `src/` that parses plugin components (agents, commands, skills, hooks) and converts them to other formats (OpenCode, Codex). The CLI already has `parseFrontmatter()`, `loadCommands()`, and `loadHooks()` functions, plus TypeScript types for `ClaudeCommand`, `ClaudeHooks`, `ClaudeHookMatcher`, etc.
- **GitHub Actions CI** at `.github/workflows/ci.yml` running `bun test` with 8 existing test files.
- A **documentation site** at `plugins/compound-engineering/docs/` (static HTML, GitHub Pages).

Commands are Markdown files with YAML frontmatter. The plugin uses `${CLAUDE_PLUGIN_ROOT}` for portable path references. Hooks are configured in `hooks/hooks.json` at the plugin root, which Claude Code auto-discovers.

### Architecture Principles

1. **Additive-only changes to command behavior.** Frontmatter edits, validation preambles, and AskUserQuestion gates are added to existing command files. No command instructions are rewritten.
2. **Plugin-scoped hooks, not project-scoped.** Hooks live in the plugin's `hooks/hooks.json`, not in the user's `.claude/settings.json`. This means they travel with the plugin installation.
3. **CI validates plugin artifacts, not user projects.** The command validation CI runs against the 24 command markdown files in this repository, not against user codebases.
4. **State files are user-project artifacts.** `.local.md` files are created in the user's working directory (project root), not in the plugin directory. They are gitignored.
5. **Autonomous mode bypass via $ARGUMENTS.** Commands detect autonomous invocation (from lfg/slfg chains) by checking if `$ARGUMENTS` is non-empty, skipping interactive prompts when it is.

---

## Research Findings

### 1. Claude Code Hooks API (2025-2026)

**Configuration format:** Plugin hooks are defined in `hooks/hooks.json` with a wrapper format:

```json
{
  "description": "Safety guardrails for compound-engineering",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/validate-bash.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**Key findings:**
- `PreToolUse` hooks receive JSON on stdin with `tool_name`, `tool_input` (including `command` for Bash, `file_path` for Write/Edit), `session_id`, `cwd`, `permission_mode`.
- Decision options for PreToolUse: `"allow"` (bypass permission), `"deny"` (block + tell Claude why), `"ask"` (surface to user for confirmation). These go in `hookSpecificOutput.permissionDecision`.
- Exit code 0 with no JSON output = allow. Exit code 2 = block (stderr fed to Claude). Exit code 0 + JSON = structured decision.
- Matcher is a regex: `"Bash"` matches Bash tool, `"Write|Edit"` matches either.
- `${CLAUDE_PLUGIN_ROOT}` resolves to the plugin's install directory at runtime.
- Hooks fire for all tool calls including those from subagents. This matches the PM decision (Q2: fire for all operations).
- Three hook types: `command` (bash scripts), `prompt` (LLM evaluation), `agent` (subagent with tool access). We will use `command` for deterministic validations.

**Sources:**
- [Hooks Reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Automate workflows with hooks - Claude Code Docs](https://code.claude.com/docs/en/hooks-guide)
- [Hook Development Skill - anthropics/claude-code](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md)
- [Bash Command Validator Example - anthropics/claude-code](https://github.com/anthropics/claude-code/blob/main/examples/hooks/bash_command_validator_example.py)
- [Claude Code Hooks Complete Guide - DataCamp](https://www.datacamp.com/tutorial/claude-code-hooks)

### 2. YAML Frontmatter Validation for CI

**Key findings:**
- The repository already has a `parseFrontmatter()` function in `src/utils/frontmatter.ts` that uses `js-yaml` to parse YAML frontmatter from markdown files. The `loadCommands()` function in `src/parsers/claude.ts` already extracts `name`, `description`, `argumentHint`, `disableModelInvocation`, `allowedTools`, and `model`.
- Rather than adding an external tool (markdownlint, remark-lint-frontmatter-schema), we can write a focused Bun test that uses the existing parser to validate all 24 command files.
- This approach: (a) reuses existing code, (b) runs as part of `bun test` (no new CI job needed), (c) has zero new dependencies, (d) is testable locally.
- For richer validation (checking tool/agent references in command bodies), we can add a dedicated test file that loads all commands and runs assertions.

**Sources:**
- [markdownlint-cli2 - GitHub](https://github.com/DavidAnson/markdownlint-cli2)
- [remark-lint-frontmatter-schema - GitHub](https://github.com/JulianCataldo/remark-lint-frontmatter-schema)
- [frontmatter-validator - GitHub](https://github.com/vinicioslc/frontmatter-validator)

### 3. Claude Code Plugin Hooks Directory Convention

**Key findings:**
- The plugin directory structure places hooks at `hooks/hooks.json` with scripts in `hooks/scripts/`.
- The CLI's `loadHooks()` function (in `src/parsers/claude.ts`) already looks for `hooks/hooks.json` by default at line 124: `const defaultPath = path.join(root, "hooks", "hooks.json")`.
- The `ClaudeHooks` type is already defined in `src/types/claude.ts`.
- Plugin hooks merge with user hooks and run in parallel. Plugin hooks appear as `[Plugin]` in the `/hooks` menu and are read-only from the user's perspective.
- The `description` field in hooks.json is optional and provides context in the hooks menu.

**Sources:**
- [Plugin Structure - Claude Skills](https://claude-plugins.dev/skills/@anthropics/claude-code/plugin-structure)
- [Hooks Reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)

---

## Implementation Plan

### Area 1+8: Frontmatter Audit

**Objective:** Add `disable-model-invocation: true` to 10 commands missing it, and add `argument-hint` to the 1 command missing it (`deploy-docs.md`).

**Current state audit (24 commands):**

| Command | Has `disable-model-invocation`? | Has `argument-hint`? | Action |
|---------|---|----|--------|
| `agent-native-audit.md` | Yes | Yes | None |
| `changelog.md` | Yes | Yes | None |
| `create-agent-skill.md` | Yes | Yes | None |
| `deepen-plan.md` | **No** | Yes | Add flag |
| `deploy-docs.md` | Yes | **No** | Add argument-hint |
| `feature-video.md` | **No** | Yes | Add flag |
| `generate_command.md` | Yes | Yes | None |
| `heal-skill.md` | Yes | Yes | None |
| `lfg.md` | Yes | Yes | None |
| `release-docs.md` | Yes | Yes | None |
| `report-bug.md` | Yes | Yes | None |
| `reproduce-bug.md` | Yes | Yes | None |
| `resolve_parallel.md` | Yes | Yes | None |
| `resolve_todo_parallel.md` | **No** | Yes | Add flag |
| `slfg.md` | Yes | Yes | None |
| `technical_review.md` | Yes | Yes | None |
| `test-browser.md` | **No** | Yes | Add flag |
| `test-xcode.md` | Yes | Yes | None |
| `triage.md` | Yes | Yes | None |
| `workflows:brainstorm` | **No** | Yes | Add flag |
| `workflows:compound` | **No** | Yes | Add flag |
| `workflows:plan` | **No** | Yes | Add flag |
| `workflows:review` | **No** | Yes | Add flag |
| `workflows:work` | **No** | Yes | Add flag |

**Exact changes (10 frontmatter edits + 1 argument-hint):**

1. `deepen-plan.md` -- Add `disable-model-invocation: true`
2. `feature-video.md` -- Add `disable-model-invocation: true`
3. `resolve_todo_parallel.md` -- Add `disable-model-invocation: true`
4. `test-browser.md` -- Add `disable-model-invocation: true`
5. `workflows/brainstorm.md` -- Add `disable-model-invocation: true`
6. `workflows/compound.md` -- Add `disable-model-invocation: true`
7. `workflows/plan.md` -- Add `disable-model-invocation: true`
8. `workflows/review.md` -- Add `disable-model-invocation: true`
9. `workflows/work.md` -- Add `disable-model-invocation: true`
10. `deploy-docs.md` -- Add `argument-hint: "[optional: --dry-run to preview changes]"`

**Verification:** After changes, all 24 commands will have both `argument-hint` and `disable-model-invocation: true`. The `disable-model-invocation` flag prevents the model from auto-loading command instructions into context. Slash-command invocation (`/workflows:plan $ARGUMENTS`) from lfg/slfg chains still works -- the flag only blocks *model-initiated* invocation, not explicit slash-command calls.

**Technical notes:**
- Each edit is a single line addition to YAML frontmatter (between the `---` delimiters).
- The flag value must be `true` (boolean), not `"true"` (string). YAML parses bare `true` as boolean.
- The existing CLI parser (`src/parsers/claude.ts:86`) already checks `data["disable-model-invocation"] === true`, so the boolean type is validated.

### Area 2: Input Validation

**Objective:** Add bash validation preambles to commands that accept arguments, catching bad input early with What/Why/Fix error messages.

**Validation template pattern:**

Input validation is implemented as **instructional text** within the command markdown, not as executable bash scripts. Commands are markdown instructions that Claude follows -- they don't execute directly. The validation pattern is a section at the top of the command body that tells Claude to validate before proceeding.

```markdown
## Input Validation

Before proceeding, validate the input:

<input_validation>

**If $ARGUMENTS is empty:**
[Command-specific empty-argument handling -- either AskUserQuestion or error]

**If $ARGUMENTS is provided, validate:**

[Command-specific validation logic as bash checks]

```bash
# Example: Validate plan file path
PLAN_PATH="$ARGUMENTS"
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
```

**If validation passes:** Proceed to Phase 1.

</input_validation>
```

**Commands and their validation requirements:**

| Command | Input Type | Validation |
|---------|-----------|------------|
| `workflows:work` | Plan file path | File exists, ends in `.md`, is in `docs/plans/` |
| `workflows:review` | PR number / branch / URL / "latest" | Numeric = check `gh pr view`; branch = check `git rev-parse --verify`; URL = extract PR number |
| `workflows:plan` | Feature description | Non-empty string (already handles empty via AskUserQuestion) |
| `workflows:brainstorm` | Feature idea | Non-empty string (already handles empty) |
| `workflows:compound` | Optional context | No validation needed (optional argument) |
| `deepen-plan` | Plan file path | File exists, ends in `.md` |
| `test-browser` | PR number / branch / "current" | Same as review: numeric, branch, or keyword |
| `feature-video` | PR number + optional URL | First token numeric or "current"; optional second token is URL |
| `reproduce-bug` | GitHub issue number | Numeric, check `gh issue view` |
| `technical_review` | Plan file path or content | File exists if path-like |
| `resolve_todo_parallel` | Optional todo ID/pattern | No strict validation (optional) |
| `resolve_parallel` | Optional pattern | No strict validation (optional) |

**Commands that need validation added (8):**

1. `workflows/work.md` -- Plan file path validation
2. `workflows/review.md` -- PR number/branch/URL validation
3. `deepen-plan.md` -- Plan file path validation
4. `test-browser.md` -- PR number/branch validation
5. `feature-video.md` -- PR number validation
6. `reproduce-bug.md` -- Issue number validation
7. `technical_review.md` -- Plan file validation
8. `resolve_todo_parallel.md` -- Light validation (optional)

**Error message format (three-part, per UX spec):**

```
Error: [What happened]
  [argument] is not a valid [expected type].

Why: [Context]
  [explanation of what the command expected]

Fix: [Actionable next step]
  /[command] [correct usage example]
```

### Area 3: Command Validation CI

**Objective:** Add a validation test that runs as part of `bun test` in CI, checking all 24 command files for frontmatter completeness and correctness.

**Design decision: Bun test, not separate GitHub Action.**

The existing CI runs `bun test`. Rather than adding a separate workflow or a bash script, we add a new test file `tests/command-validation.test.ts` that:

1. Uses the existing `parseFrontmatter()` utility.
2. Globs all `.md` files in `plugins/compound-engineering/commands/` (including `commands/workflows/`).
3. Runs assertions on each file.

**Test assertions:**

```typescript
// tests/command-validation.test.ts

// For each command file:
// 1. YAML frontmatter parses without error
// 2. Required fields present:
//    - name (string, non-empty)
//    - description (string, non-empty)
// 3. Expected fields present (error-level):
//    - argument-hint (string)
//    - disable-model-invocation (boolean true)
// 4. No broken tool references:
//    - No references to mcp__plugin_compound-engineering_pw__*
//      (removed Playwright MCP tools)
// 5. Name format validation:
//    - Workflow commands: name starts with "workflows:"
//    - Other commands: name matches filename (kebab-case)
```

**Integration:** This test file is automatically picked up by `bun test` (which runs all `tests/*.test.ts`). No changes to `.github/workflows/ci.yml` needed.

**CI output format (per UX spec):** Bun test output naturally shows pass/fail per assertion. For GitHub Actions inline annotations, we can add `console.error()` with `::error file=` prefix for failures:

```typescript
if (!data["argument-hint"]) {
  console.error(
    `::error file=${relPath},line=1::Missing 'argument-hint' in frontmatter`
  );
}
```

**Validation schema (severity levels):**

| Field | Severity | Action on Missing |
|-------|----------|-------------------|
| `name` | Error | Fail test |
| `description` | Error | Fail test |
| `argument-hint` | Error | Fail test |
| `disable-model-invocation` | Error | Fail test |
| `allowed-tools` | None | Not validated (only 2 commands use it) |
| `model` | None | Not validated (no commands use it) |

**Broken reference detection:**

```typescript
const REMOVED_TOOL_PATTERNS = [
  /mcp__plugin_compound-engineering_pw__/,  // Removed Playwright MCP
];

for (const pattern of REMOVED_TOOL_PATTERNS) {
  expect(body).not.toMatch(pattern);
}
```

### Area 4: AskUserQuestion Patterns

**Objective:** Add interactive scope selection to `workflows:work` (plan picker), `workflows:review` (target selection), and `workflows:compound` (category confirmation) with autonomous mode bypass.

**Autonomous mode detection:**

The `$ARGUMENTS` variable is populated by Claude Code when a user types `/command arguments` or when a command is invoked via slash-command syntax in another command (e.g., `/workflows:work docs/plans/...` in lfg.md). The detection logic:

```markdown
**Autonomous mode detection:**
- If `$ARGUMENTS` is non-empty: Proceed directly (L1 path). Do not ask questions.
- If `$ARGUMENTS` is empty: Enter interactive mode (L2/L3 path).
```

This is implemented as instructional text within each command's markdown body, not as bash code.

**Command-specific implementations:**

#### 4a. `/workflows:work` -- Plan Picker (new section before Phase 1)

```markdown
## Input Handling

<input_handling>

**If $ARGUMENTS is non-empty (autonomous mode):**
Validate the plan path and proceed directly to Phase 1: Quick Start. Do not ask questions.

**If $ARGUMENTS is empty (interactive mode):**
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
   1. `docs/plans/2026-02-08-feat-user-auth-plan.md` (yesterday) -- has saved progress
   2. `docs/plans/2026-02-07-fix-checkout-bug-plan.md` (2 days ago)
   3. `docs/plans/2026-02-05-refactor-api-client-plan.md` (4 days ago)
   4. Enter a file path manually
   5. Browse all plans

   If only 1 plan exists: "Found one plan: [name]. Work on this? (y/n)"
   If no plans exist: "No plans found in docs/plans/. Create one first with /workflows:plan"

4. Set the selected plan as the input and proceed to Phase 1.

</input_handling>
```

#### 4b. `/workflows:review` -- Target Selection (new section before Main Tasks)

```markdown
## Input Handling

<input_handling>

**If $ARGUMENTS is non-empty (autonomous mode):**
Parse the argument as PR number, GitHub URL, branch name, or "latest". Proceed to Main Tasks.

**If $ARGUMENTS is empty (interactive mode):**
Help the user select a review target.

1. Check current context:
   ```bash
   current_branch=$(git branch --show-current)
   # Check if current branch has a PR
   gh pr list --head "$current_branch" --json number,title,url --jq '.[0]' 2>/dev/null
   # List recent PRs by the current user
   gh pr list --author @me --json number,title,updatedAt --jq '.[:5]' 2>/dev/null
   ```

2. Use **AskUserQuestion**:

   **Question:** "What would you like to review?"
   **Options** (context-dependent):
   - If on feature branch with PR: default to that PR
   - If on feature branch without PR: default to current branch
   - If on main/master: show recent PRs list
   - Always include: "Enter PR number or branch name manually"

3. Set the selected target as the input and proceed to Main Tasks.

</input_handling>
```

#### 4c. `/workflows:compound` -- Category Confirmation (added to Phase 1)

```markdown
### Category Confirmation (Interactive Mode Only)

<category_confirmation>

**If running in autonomous mode** (invoked by lfg/slfg with $ARGUMENTS non-empty):
Skip this step. Auto-classify and proceed.

**If running in interactive mode** ($ARGUMENTS is empty or user-invoked):
After the Category Classifier subagent returns, show a confirmation:

Use **AskUserQuestion**:

**Question:** "Classified as '[category]'. Does this look right?"
**Options:**
1. Yes, proceed (recommended)
2. Change category
3. This is actually two problems -- document separately

If "Change category": present the category list as a second AskUserQuestion.

</category_confirmation>
```

#### 4d. `/workflows:plan` -- Layer-Awareness Refinement

The plan command already has good AskUserQuestion usage. The refinement adds explicit L1/L2/L3 detection:

```markdown
### Layer Detection (added to Idea Refinement section)

Before running idea refinement, assess the input quality:

- **L1 (>50 words or references a brainstorm doc):** Skip idea refinement. Announce: "Description is detailed, proceeding to research." User can interrupt.
- **L2 (1-50 words):** Current behavior: single "Your description is clear. Proceed or refine?" question.
- **L3 (empty):** Current behavior: full idea refinement dialogue with AskUserQuestion.
```

### Area 5: State Management

**Objective:** Implement `.local.md` state files for workflow resumability, starting with `workflows:plan` as proof of concept.

**State file specification:**

**Location:** Project root (user's working directory), not plugin directory.

**Naming:** `.{feature-slug}.local.md` where feature-slug is derived from the plan filename:
- `2026-02-09-feat-user-auth-flow-plan.md` -> `.user-auth-flow.local.md`
- Derivation: strip date prefix (`YYYY-MM-DD-`), strip type prefix (`feat-`, `fix-`, `refactor-`), strip `-plan` suffix, use remaining slug.

**Canonical ID:** The plan filename path (e.g., `docs/plans/2026-02-09-feat-user-auth-flow-plan.md`) is the canonical identifier. Branch name is stored as a cross-reference inside the file.

**File format:**

```markdown
---
feature: user-auth-flow
plan_file: docs/plans/2026-02-09-feat-user-auth-flow-plan.md
phase: plan-complete
branch: feat/user-auth
started: 2026-02-09T14:30:00Z
updated: 2026-02-09T15:45:00Z
---

## Progress
- [x] Plan created: docs/plans/2026-02-09-feat-user-auth-flow-plan.md
- [ ] Branch created
- [ ] Implementation
- [ ] Tests passing
- [ ] Review complete
- [ ] Compound documented
```

**YAML frontmatter schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `feature` | string | Yes | Feature slug (used for file naming) |
| `plan_file` | string | Yes | Canonical plan file path |
| `phase` | enum | Yes | `plan`, `plan-complete`, `work`, `work-complete`, `review`, `review-complete`, `compound`, `compound-complete` |
| `branch` | string | No | Git branch name (may not exist during plan phase) |
| `started` | ISO 8601 | Yes | When the workflow started |
| `updated` | ISO 8601 | Yes | Last modification timestamp |

**Lifecycle operations (implemented as command instructions):**

**Write state (in `workflows:plan`):**

After plan file is written successfully, add:

```markdown
### State Checkpoint

After writing the plan file:

1. Derive the feature slug from the plan filename
2. Create `.{feature-slug}.local.md` in the project root with:
   - `phase: plan-complete`
   - `plan_file:` pointing to the plan
   - `started:` and `updated:` set to current timestamp
   - Progress section with "Plan created" checked

```bash
# Derive slug from plan filename
PLAN_FILE="docs/plans/2026-02-09-feat-user-auth-flow-plan.md"
SLUG=$(echo "$PLAN_FILE" | sed 's|.*/||; s|^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-||; s|^feat-\|^fix-\|^refactor-||; s|-plan\.md$||')
STATE_FILE=".$SLUG.local.md"
```

3. Report: "Progress saved to $STATE_FILE"
```

**Read state (in `workflows:work`):**

Before Phase 1, add a state discovery section:

```markdown
### State Discovery

Before starting work:

1. Check for .local.md files in project root:
   ```bash
   ls -1a .*.local.md 2>/dev/null
   ```

2. If a state file matches the selected plan (by `plan_file` field):
   - Read the state file
   - If phase is `plan-complete` or `work`: show resume prompt
   - Use **AskUserQuestion**:
     Question: "Found previous session for '[feature]'"
     Options:
     1. Resume from where you left off (recommended)
     2. Start fresh (discards saved progress)
     3. View saved state before deciding

3. If no matching state file: proceed normally (new workflow).
```

**Staleness detection:**

```markdown
### Staleness Detection

When reading a state file, check age:

```bash
UPDATED=$(grep '^updated:' "$STATE_FILE" | sed 's/updated: //')
AGE_DAYS=$(( ($(date +%s) - $(date -d "$UPDATED" +%s 2>/dev/null || date -jf "%Y-%m-%dT%H:%M:%SZ" "$UPDATED" +%s)) / 86400 ))
```

| Age | Behavior |
|-----|----------|
| < 24 hours | Resume prompt, "recommended" label |
| 1-7 days | Resume prompt, neutral framing |
| > 7 days | Warning: "This state is [N] days old and may be outdated" |
| > 30 days | "Start fresh" is the recommended option |
```

**Branch divergence check:**

```markdown
When resuming, check if the branch has diverged:

```bash
BRANCH=$(grep '^branch:' "$STATE_FILE" | sed 's/branch: //')
if [ -n "$BRANCH" ]; then
  COMMITS_SINCE=$(git log --oneline "$BRANCH" --since="$UPDATED" 2>/dev/null | wc -l)
  if [ "$COMMITS_SINCE" -gt 0 ]; then
    echo "Warning: Branch '$BRANCH' has $COMMITS_SINCE new commits since state was saved."
  fi
fi
```
```

**Cleanup:** State file is deleted when `workflows:compound` completes successfully (lifecycle complete).

**Gitignore entry:**

```
# Workflow state files (compound-engineering plugin)
.*.local.md
```

This entry should be documented in the plugin README and mentioned when state files are first created. The `.gitignore` modification is in the **user's project**, not the plugin directory.

### Area 6: Hooks

**Objective:** Create a `hooks/` directory with safety guardrails using PreToolUse hooks for destructive operations.

**Directory structure:**

```
plugins/compound-engineering/
  hooks/
    hooks.json              # Hook configuration
    scripts/
      validate-bash.sh      # PreToolUse hook for Bash commands
      protect-env-files.sh  # PreToolUse hook for Write/Edit on .env files
```

**hooks/hooks.json:**

```json
{
  "description": "Safety guardrails for compound-engineering plugin. Prompts for confirmation before destructive operations.",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/validate-bash.sh",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/protect-env-files.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**hooks/scripts/validate-bash.sh:**

```bash
#!/bin/bash
# PreToolUse hook: Validate bash commands for destructive operations
# Decision: "ask" for all destructive operations (per PM Q2)
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0  # No command to validate
fi

# Pattern 1: git push --force (any variant)
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force|git\s+push\s+-f\b'; then
  # Extract branch name for context
  BRANCH=$(echo "$COMMAND" | grep -oE '[^ ]+$' || echo "unknown")
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Force push will overwrite remote history. Branch: '"$BRANCH"'"
    }
  }'
  exit 0
fi

# Pattern 2: git reset --hard
if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Hard reset will discard all uncommitted changes"
    }
  }'
  exit 0
fi

# Pattern 3: rm -rf (with meaningful paths, not just node_modules/.cache)
if echo "$COMMAND" | grep -qE 'rm\s+-rf\s+' | grep -vqE 'node_modules|\.cache|tmp|__pycache__|\.next' 2>/dev/null; then
  # Only flag rm -rf that's NOT on well-known safe targets
  TARGET=$(echo "$COMMAND" | grep -oE 'rm\s+-rf\s+\S+' | sed 's/rm -rf //')
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Recursive delete of '"$TARGET"'. Verify this is intended."
    }
  }'
  exit 0
fi

# Pattern 4: rm -rf / or rm -rf ~ (catastrophic -- hard deny)
if echo "$COMMAND" | grep -qE 'rm\s+-rf\s+(/|~|\$HOME)\s*$'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Catastrophic delete blocked: '"$COMMAND"'"
    }
  }'
  exit 0
fi

# All other commands: allow
exit 0
```

**hooks/scripts/protect-env-files.sh:**

```bash
#!/bin/bash
# PreToolUse hook: Protect .env files from unintended modification
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Check if the file is an env file
if echo "$FILE_PATH" | grep -qE '\.env($|\.)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Editing .env file which may contain secrets: '"$(basename "$FILE_PATH")"'"
    }
  }'
  exit 0
fi

exit 0
```

**Hook behavior summary:**

| Pattern | Tool | Decision | Reason |
|---------|------|----------|--------|
| `git push --force` / `git push -f` | Bash | ask | Force push will overwrite remote history |
| `git reset --hard` | Bash | ask | Hard reset discards uncommitted changes |
| `rm -rf /` or `rm -rf ~` | Bash | deny | Catastrophic delete blocked |
| `rm -rf [meaningful-path]` | Bash | ask | Recursive delete confirmation |
| `.env` file edit | Write/Edit | ask | May contain secrets |

**Note on rm -rf logic:** The validate-bash.sh script needs careful implementation of the rm -rf pattern matching. The current design uses a two-stage check: first match `rm -rf`, then exclude known-safe targets (node_modules, .cache, etc.). The catastrophic patterns (`/`, `~`, `$HOME`) get a hard deny. Everything else gets an "ask" confirmation.

**Revised validate-bash.sh rm -rf logic (corrected):**

```bash
# Pattern 3: rm -rf (general)
if echo "$COMMAND" | grep -qE 'rm\s+-r[f]?\s+' || echo "$COMMAND" | grep -qE 'rm\s+-fr\s+'; then
  TARGET=$(echo "$COMMAND" | sed -E 's/.*rm\s+-[rf]+\s+//' | awk '{print $1}')

  # Hard deny catastrophic targets
  case "$TARGET" in
    /|~|'$HOME'|'$CLAUDE_PROJECT_DIR'|.)
      jq -n '{
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Catastrophic delete blocked. Target: '"$TARGET"'"
        }
      }'
      exit 0
      ;;
  esac

  # Allow safe targets silently
  case "$TARGET" in
    */node_modules|*/node_modules/*|*/.cache|*/.cache/*|*/tmp|*/tmp/*|*/__pycache__|*/.next|*/.next/*)
      exit 0
      ;;
  esac

  # Ask for everything else
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Recursive delete of '"$TARGET"'. Verify this is intended."
    }
  }'
  exit 0
fi
```

### Area 7: Fix reproduce-bug

**Objective:** Replace all `mcp__plugin_compound-engineering_pw__*` references in `reproduce-bug.md` with `agent-browser` CLI equivalents.

**Current stale references (6 distinct MCP calls in reproduce-bug.md):**

| Line(s) | Current (stale) | Replacement |
|---------|-----------------|-------------|
| 32-33 | `mcp__plugin_compound-engineering_pw__browser_navigate({ url: "..." })` / `mcp__plugin_compound-engineering_pw__browser_snapshot({})` | `agent-browser open "..."` / `agent-browser snapshot -i` |
| 43-44 | `mcp__plugin_compound-engineering_pw__browser_navigate({ url: "..." })` / `mcp__plugin_compound-engineering_pw__browser_snapshot({})` | `agent-browser open "..."` / `agent-browser snapshot -i` |
| 52 | `mcp__plugin_compound-engineering_pw__browser_take_screenshot({ filename: "..." })` | `agent-browser screenshot "bug-[issue]-step-1.png"` |
| 61-65 | `browser_click`, `browser_type`, `browser_snapshot`, `browser_take_screenshot` references | `agent-browser click @ref`, `agent-browser fill @ref "text"`, `agent-browser snapshot -i`, `agent-browser screenshot` |
| 68 | `mcp__plugin_compound-engineering_pw__browser_console_messages({ level: "error" })` | No direct equivalent -- note in instructions to check console via snapshot |
| 80 | `mcp__plugin_compound-engineering_pw__browser_take_screenshot({ filename: "..." })` | `agent-browser screenshot "bug-[issue]-reproduced.png"` |

**Pattern from test-browser.md (reference implementation):**

The `test-browser.md` command provides the established pattern:
- Critical header: `## CRITICAL: Use agent-browser CLI Only`
- Warning against Chrome MCP tools
- Setup section with install check
- All interactions via `agent-browser` CLI commands

**Replacement structure for reproduce-bug.md:**

1. Add `## CRITICAL: Use agent-browser CLI Only` section after the title
2. Add `## Prerequisites` section with agent-browser install check
3. Replace Phase 2 entirely with agent-browser CLI equivalents
4. Add a `## agent-browser CLI Reference` section (copied from test-browser.md)
5. For console messages (no direct `agent-browser` equivalent): instruct to check snapshot output for error indicators and use `agent-browser snapshot -i` to inspect page state

**Console error detection workaround:**

The Playwright MCP had `browser_console_messages({ level: "error" })` which has no direct agent-browser equivalent. The replacement approach:

```markdown
### Check for Console Errors

agent-browser does not have a direct console log reader. Instead:
1. Use `agent-browser snapshot -i` to check for visible error states
2. Look for error boundaries, toast messages, or red error text in snapshots
3. Check the terminal output from agent-browser for any reported errors
4. If deeper console inspection is needed, suggest the user open browser DevTools manually
```

---

## File Change Manifest

### New Files (4)

| File | Purpose |
|------|---------|
| `plugins/compound-engineering/hooks/hooks.json` | Hook configuration for safety guardrails |
| `plugins/compound-engineering/hooks/scripts/validate-bash.sh` | PreToolUse hook: validate destructive bash commands |
| `plugins/compound-engineering/hooks/scripts/protect-env-files.sh` | PreToolUse hook: protect .env files |
| `tests/command-validation.test.ts` | CI test: validate all command frontmatter |

### Modified Files (15)

| File | Changes |
|------|---------|
| **Area 1+8: Frontmatter (10 files)** | |
| `plugins/compound-engineering/commands/deepen-plan.md` | Add `disable-model-invocation: true` to frontmatter |
| `plugins/compound-engineering/commands/feature-video.md` | Add `disable-model-invocation: true` to frontmatter |
| `plugins/compound-engineering/commands/resolve_todo_parallel.md` | Add `disable-model-invocation: true` to frontmatter |
| `plugins/compound-engineering/commands/test-browser.md` | Add `disable-model-invocation: true` to frontmatter |
| `plugins/compound-engineering/commands/deploy-docs.md` | Add `argument-hint: "[optional: --dry-run to preview changes]"` to frontmatter |
| `plugins/compound-engineering/commands/workflows/brainstorm.md` | Add `disable-model-invocation: true` to frontmatter |
| `plugins/compound-engineering/commands/workflows/compound.md` | Add `disable-model-invocation: true` to frontmatter |
| `plugins/compound-engineering/commands/workflows/plan.md` | Add `disable-model-invocation: true` to frontmatter |
| `plugins/compound-engineering/commands/workflows/review.md` | Add `disable-model-invocation: true` to frontmatter |
| `plugins/compound-engineering/commands/workflows/work.md` | Add `disable-model-invocation: true` to frontmatter |
| **Area 2: Input Validation (3 files -- highest-value subset)** | |
| `plugins/compound-engineering/commands/workflows/work.md` | Add Input Validation section before Phase 1 |
| `plugins/compound-engineering/commands/workflows/review.md` | Add Input Validation section before Main Tasks |
| `plugins/compound-engineering/commands/reproduce-bug.md` | Add Input Validation for issue number |
| **Area 4: AskUserQuestion (3 files)** | |
| `plugins/compound-engineering/commands/workflows/work.md` | Add Input Handling section with plan picker |
| `plugins/compound-engineering/commands/workflows/review.md` | Add Input Handling section with target selector |
| `plugins/compound-engineering/commands/workflows/compound.md` | Add Category Confirmation section |
| **Area 5: State Management (2 files)** | |
| `plugins/compound-engineering/commands/workflows/plan.md` | Add State Checkpoint section at end |
| `plugins/compound-engineering/commands/workflows/work.md` | Add State Discovery section before Phase 1 |
| **Area 7: Fix reproduce-bug (1 file)** | |
| `plugins/compound-engineering/commands/reproduce-bug.md` | Replace all MCP tool refs with agent-browser CLI |

**Note:** Several files appear in multiple areas (e.g., `work.md` gets frontmatter, validation, AskUserQuestion, and state management changes). These are additive -- each change targets a different section of the file.

**Total unique files modified:** 13 command files + 1 test file + 3 new hook files = **17 files touched**.

### Files NOT Changed (verification)

These command files need no modifications:

- `agent-native-audit.md` -- Already complete
- `changelog.md` -- Already complete
- `create-agent-skill.md` -- Already complete
- `generate_command.md` -- Already complete
- `heal-skill.md` -- Already complete
- `lfg.md` -- Already complete (intentionally autonomous, no gates)
- `release-docs.md` -- Already complete
- `report-bug.md` -- Already complete
- `resolve_parallel.md` -- Already complete
- `slfg.md` -- Already complete (intentionally autonomous, no gates)
- `technical_review.md` -- Already complete (gets no changes in this iteration)
- `test-xcode.md` -- Already complete
- `triage.md` -- Already complete

---

## Dependencies & Prerequisites

### Runtime Dependencies

| Dependency | Required By | Already Available? |
|-----------|-------------|-------------------|
| `jq` | Hook scripts (parse JSON from stdin) | Yes -- standard on macOS/Linux, available in CI |
| `bash` | Hook scripts | Yes -- universal |
| `agent-browser` | reproduce-bug.md (Area 7) | Yes -- already used by test-browser.md, feature-video.md |
| `gh` CLI | Input validation (PR/issue checks) | Yes -- already used by review, test-browser |
| `git` | Input validation (branch checks), state management | Yes -- universal |

### Build/Test Dependencies

| Dependency | Required By | Already Available? |
|-----------|-------------|-------------------|
| `bun` | CI test runner, command-validation.test.ts | Yes -- already in CI (oven-sh/setup-bun@v2) |
| `js-yaml` | parseFrontmatter() in tests | Yes -- already a dependency (`src/utils/frontmatter.ts`) |

### No New Dependencies Required

All 4 new files (hooks.json, 2 bash scripts, 1 test file) use only tools and libraries already present in the repository. Zero `npm install` or `bun add` commands needed.

### Prerequisites Checklist

- [ ] `plugins/compound-engineering/hooks/` directory created
- [ ] `plugins/compound-engineering/hooks/scripts/` directory created
- [ ] Hook scripts made executable (`chmod +x hooks/scripts/*.sh`)
- [ ] All frontmatter changes use boolean `true`, not string `"true"`
- [ ] Test file uses correct relative path to plugin commands directory

---

## Technical Risks

### Risk 1: Hook scripts fail on different platforms (macOS vs Linux CI)

**Likelihood:** Medium
**Impact:** Hooks silently fail or behave differently in CI vs local.
**Mitigation:**
- Use POSIX-compatible bash (no bashisms like `[[ ]]` -- actually, `[[ ]]` is fine in bash, but avoid `zsh`-specific syntax).
- Test hooks on both macOS (local development) and Ubuntu (CI runner).
- The `jq` dependency is the main risk -- it must be available. On CI, add `sudo apt-get install -y jq` if not present (though it's standard on ubuntu-latest).
- Use `set -euo pipefail` in all scripts for consistent error handling.

### Risk 2: rm -rf pattern matching has false positives or false negatives

**Likelihood:** Medium
**Impact:** Either blocks legitimate cleanup operations (false positive) or misses a destructive command (false negative).
**Mitigation:**
- Use "ask" mode, not "deny" mode, for all rm -rf except catastrophic targets. This means false positives only add a confirmation prompt, not a hard block.
- Maintain an allowlist of safe targets (node_modules, .cache, tmp, __pycache__, .next) that bypass the hook.
- Hard-deny only `/`, `~`, and `$HOME`.
- Log all hook decisions (future enhancement) for tuning the patterns.

### Risk 3: Command validation CI has false failures on valid patterns

**Likelihood:** Low
**Impact:** CI blocks PRs that add legitimate new command patterns.
**Mitigation:**
- Validate only fields that are universally required (`name`, `description`).
- The `argument-hint` and `disable-model-invocation` checks can use warnings (console.warn) rather than test failures for the first release, then upgrade to failures once all commands comply.
- Add an `ALLOW_MISSING` set for commands that have intentional exceptions (none currently, but forward-compatible).

### Risk 4: State files accumulate in user projects

**Likelihood:** Medium
**Impact:** Users end up with stale `.local.md` files in their project root, causing confusion.
**Mitigation:**
- Automatic cleanup: `workflows:compound` (lifecycle end) deletes the state file.
- Staleness warnings at 7+ days.
- "Start fresh" option always available in resume prompt, which deletes the stale file.
- State files are gitignored, so they don't appear in `git status`.
- Future enhancement: periodic cleanup of state files older than 30 days.

### Risk 5: AskUserQuestion in autonomous mode is not correctly bypassed

**Likelihood:** Low
**Impact:** lfg/slfg chains get stuck on interactive prompts.
**Mitigation:**
- The bypass logic is simple: check if `$ARGUMENTS` is non-empty. Claude evaluates this at runtime -- it's a markdown instruction, not code.
- Test the lfg and slfg chains end-to-end after adding AskUserQuestion gates.
- The lfg.md chain explicitly passes `$ARGUMENTS` to `/workflows:plan`: `/workflows:plan $ARGUMENTS`. So $ARGUMENTS will be non-empty for all commands in the chain.
- For `/workflows:work` in the lfg chain, it's invoked as `/workflows:work` (no arguments). This means it WILL enter interactive mode to select a plan. However, at that point in the lfg chain, there should be exactly one recent plan (just created). The plan picker will auto-suggest it: "Found one plan: [name]. Work on this? (y/n)". This is acceptable -- it's a single confirmation, not a multi-round interview.

### Risk 6: validate-bash.sh performance on every Bash tool call

**Likelihood:** Low
**Impact:** Hooks add latency to every bash command Claude runs.
**Mitigation:**
- The script is simple grep/regex matching on stdin. Expected execution time: <50ms.
- Timeout set to 10 seconds as safety net (never reached in practice).
- The script exits immediately on non-matching commands (exit 0 with no JSON = allow).
- No external API calls or file I/O beyond reading stdin.

---

## Implementation Order

Based on PM priorities and technical dependencies:

```
Phase 1 (P0): Frontmatter Audit
  1. Edit 10 command files: add disable-model-invocation
  2. Edit deploy-docs.md: add argument-hint
  3. Run bun test to verify no regressions
  Time estimate: 15 minutes

Phase 2 (P1): Fix reproduce-bug + Input Validation + Hooks
  4. Rewrite reproduce-bug.md Phase 2 with agent-browser CLI
  5. Add input validation sections to work.md, review.md, reproduce-bug.md
  6. Create hooks/ directory, hooks.json, and 2 bash scripts
  7. chmod +x the bash scripts
  8. Test hooks locally with /hooks menu
  Time estimate: 2-3 hours

Phase 3 (P2): CI Validation + AskUserQuestion
  9.  Create tests/command-validation.test.ts
  10. Run bun test to verify CI passes
  11. Add AskUserQuestion sections to work.md, review.md, compound.md
  12. Add L1/L2/L3 layer detection to plan.md
  Time estimate: 2-3 hours

Phase 4 (P3): State Management
  13. Add State Checkpoint section to plan.md
  14. Add State Discovery section to work.md
  15. Document .gitignore entry in README
  16. Test state creation and resume flow
  Time estimate: 1-2 hours

Total estimate: 5-8 hours of implementation
Ship as one release per PM Q5 decision
```

---

## Questions & Answers (from PM/UX)

### Already Decided (Summary)

| Decision | Answer | Source |
|----------|--------|--------|
| Workflow commands get `disable-model-invocation`? | Yes, all 5 | PM Q1 |
| Hook decision mode? | "ask" for all operations | PM Q2 |
| Plan picker sort? | 5 plans, state-first then recent | PM Q5 / UX Q5 |
| Autonomous detection? | $ARGUMENTS presence | UX Q1 |
| Hook scope for subagents? | Fire for all operations | UX Q2 |
| State file naming? | Plan filename slug, branch cross-ref inside | UX Q3 |
| Error message verbosity? | Always What/Why/Fix | UX Q4 |
| Ship strategy? | All 4 phases as one release | PM Q5 |

---QUESTIONS FOR USER---

1. **Should the command validation CI test use hard failures or warnings for `disable-model-invocation`?**
   - Why: After the frontmatter audit, all 24 commands will have the flag. But future PRs might add new commands that forget it. A hard failure (test fails, CI blocks merge) enforces compliance but could surprise contributors. A warning (test passes but logs a message) is gentler but might be ignored.
   - Options:
     - (a) Hard failure: `expect(data["disable-model-invocation"]).toBe(true)` -- CI blocks merge if missing
     - (b) Warning only: `console.warn()` but test passes -- CI shows warning but allows merge
     - (c) Hard failure with documented escape hatch: if a command legitimately needs model invocation, add `# ci-allow: model-invocation` comment in frontmatter
   - Recommend: (c) -- enforces the default while allowing documented exceptions. No current commands need the exception, but it's forward-compatible.

2. **Should hooks validate `rm -rf` only or also catch `rm -r` (without -f)?**
   - Why: `rm -r` without `-f` already prompts the user in some cases (depending on file permissions). Adding hook validation for `rm -r` increases safety coverage but also increases false-positive prompts for low-risk operations like `rm -r node_modules`.
   - Options:
     - (a) Only `rm -rf` and `rm -fr` (the truly dangerous variants)
     - (b) All `rm -r*` variants (including `rm -r`, `rm -ri`, `rm -rf`)
     - (c) Only `rm -rf` and `rm -fr` for now, expand later based on user feedback
   - Recommend: (a) -- `rm -rf` is the dangerous pattern because `-f` suppresses all confirmations. `rm -r` without `-f` already has OS-level safety prompts. Fewer false positives.

3. **Should the `protect-env-files.sh` hook also protect credentials files beyond `.env`?**
   - Why: There are other sensitive files (`.credentials.json`, `secrets.yml`, `id_rsa`, etc.) that could benefit from the same "ask before edit" protection. Adding them now is low effort but broadens the scope.
   - Options:
     - (a) Only `.env` files (minimal scope, ship fast)
     - (b) `.env` + a curated list: `.env*`, `*.pem`, `*.key`, `*credentials*`, `*secret*`
     - (c) `.env` only now, add a configurable allowlist mechanism later
   - Recommend: (b) -- the curated list covers the most common secret file patterns without needing configuration. The regex is simple: `\.env($|\.)|\.pem$|\.key$|credentials|secret.*\.(json|yml|yaml)`.

4. **For the command validation test, should we also validate that no command body references removed agents or tools?**
   - Why: The `reproduce-bug.md` stale Playwright MCP reference was caught by manual audit. A body-content scan could catch similar drift automatically. However, maintaining a "removed tools" list adds maintenance burden.
   - Options:
     - (a) Frontmatter-only validation (name, description, argument-hint, disable-model-invocation) -- simpler
     - (b) Frontmatter + body scan for known removed patterns (mcp__plugin_compound-engineering_pw__*) -- catches the reproduce-bug class of bugs
     - (c) Frontmatter + body scan + agent/tool reference resolution (check that referenced agents actually exist) -- most comprehensive but significantly more complex
   - Recommend: (b) -- adds one regex check per known-removed pattern. Low maintenance (just add patterns to a list when tools are removed). Catches the exact class of bug that motivated Area 7. Option (c) is too complex for this iteration.

5. **Should the `.local.md` state file creation be opt-in or automatic?**
   - Why: Some users may not want state files in their project root. Automatic creation matches the "progressive disclosure" principle (state is there when you need it), but some developers are very particular about their project root cleanliness.
   - Options:
     - (a) Automatic: `workflows:plan` always creates a state file after plan completion
     - (b) Opt-in: Ask "Save progress for later resumption?" after plan completion
     - (c) Automatic with announcement: create the file, announce "Progress saved to .feature-name.local.md (gitignored)" -- user knows it exists but didn't have to ask for it
   - Recommend: (c) -- automatic creation matches the UX principle "state should be visible" and the announcement respects the user's awareness. The file is gitignored so it doesn't pollute their repo. If a user explicitly doesn't want it, they can delete it (and we can add an opt-out setting later).

---END QUESTIONS---

---

## Questions & Answers

### Q1: CI failure severity for disable-model-invocation
**Answer**: Hard fail with escape hatch — CI blocks merge if missing, but `# ci-allow: model-invocation` comment overrides
**Impact**: All new commands must include `disable-model-invocation: true` by default. The escape hatch comment documents intentional exceptions without modifying the test.

### Q2: rm pattern scope
**Answer**: Only `rm -rf` and `rm -fr` (the truly dangerous variants)
**Impact**: Hook only triggers on forced recursive deletes. `rm -r` without `-f` already has OS-level prompts. Fewer false positives.

### Q3: Secrets file protection scope
**Answer**: `.env` + curated secrets list (`.env*`, `*.pem`, `*.key`, `*credentials*`, `*secret*.json/yml`)
**Impact**: Broader secret file protection. Regex: `\.env($|\.)|\.pem$|\.key$|credentials|secret.*\.(json|yml|yaml)`

### Q4: CI body content scanning
**Answer**: Frontmatter + removed pattern scan (regex for known-removed tools like `mcp__plugin_compound-engineering_pw__*`)
**Impact**: Catches stale tool references automatically. Low maintenance — just add patterns to list when tools are removed.

### Q5: State file creation mode
**Answer**: Automatic with announcement — creates file, announces "Progress saved to .feature-name.local.md (gitignored)"
**Impact**: Zero-friction state management. User is informed of the file but doesn't need to opt in. File is gitignored so no repo pollution.
