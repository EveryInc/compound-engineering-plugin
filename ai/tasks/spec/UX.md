# UX Analysis: Smart-Ralph Command Scaffolding Improvements

**Author:** agent-foreman:ux
**Date:** 2026-02-09
**Plugin:** compound-engineering v2.x (24 commands, 5 workflow + 19 utility)

---

## UX Analysis

### Design Philosophy

The compound-engineering plugin serves a power-user audience: developers who already chose a CLI-first AI coding workflow over an IDE. Every UX decision must respect two competing forces:

1. **Speed-first principle.** The existing `lfg` and `slfg` commands embody the plugin's ethos: "start fast, execute faster." Any added interaction (questions, confirmations, prompts) that slows the happy path will be rejected by users. Progressive disclosure must default to *less* interaction, not more.

2. **Safety-when-it-matters principle.** The PM analysis identified real pain points -- silent failures, non-resumable workflows, unguarded destructive operations. These are not theoretical risks; they cost users 30+ minutes per incident. The UX challenge is to add safety without adding friction.

### Core UX Tension

The plugin has two distinct user modes that must be designed for simultaneously:

| Mode | Trigger | UX Expectation |
|------|---------|----------------|
| **Interactive mode** | User types `/workflows:plan`, `/workflows:review`, etc. directly | Conversational, guided, progressive disclosure is welcome |
| **Autonomous mode** | `lfg`/`slfg` chains invoke workflow commands programmatically | Zero interaction, maximum throughput, questions are blockers |

**Design principle:** Every AskUserQuestion gate, every hook confirmation, and every state resumption prompt must have an **automatic bypass** when the command is invoked within an autonomous chain. The presence of `$ARGUMENTS` (non-empty) or a parent orchestrator context serves as the bypass signal.

### Progressive Disclosure Layers

Following the three-level progressive disclosure model used by Claude Code's own skill system (metadata -> instructions -> resources), the plugin's UX should operate in three disclosure layers:

| Layer | What the User Sees | When |
|-------|-------------------|------|
| **L1: Default path** | Command runs with provided arguments, no questions asked | Arguments are valid and complete |
| **L2: Lightweight prompt** | Single question with smart defaults and multiple-choice options | Arguments are missing or ambiguous |
| **L3: Guided interview** | Multi-round AskUserQuestion dialogue | Command is invoked with no arguments in interactive mode |

**Rule:** Never jump to L3 when L2 would suffice. Never use L2 when L1 is possible.

---

## Research Findings

### 1. CLI Error Message UX

The best CLI tools follow a three-part error message structure (source: [UX patterns for CLI tools](https://www.lucasfcosta.com/blog/ux-patterns-cli-tools)):

- **What happened:** A clear, jargon-free statement of the error
- **Why it happened:** Context about the root cause
- **How to fix it:** Actionable next step the user can take immediately

Git exemplifies this by suggesting similar commands when a user mistypes. NPM exemplifies this by distinguishing "this is a network problem, not an NPM bug" from "this is a dependency conflict." The key insight: **error messages should eliminate the user's next question**, not create one.

### 2. Progressive Disclosure in AI Agent Tools

Progressive disclosure for AI coding agents has evolved from a simple UX pattern to a core architectural principle (sources: [Progressive Disclosure Matters](https://aipositive.substack.com/p/progressive-disclosure-matters); [Anthropic: Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)). The Claude Code skill system itself uses three-level progressive disclosure:

1. **Metadata level:** Agent loads only name + description at startup
2. **Instructions level:** Full SKILL.md loads only when triggered
3. **Resources level:** Scripts/references/assets load only when the task demands them

This same principle applies to command interaction design. Commands should load only the interaction complexity the current invocation demands.

### 3. AskUserQuestion Patterns

The feature-interview skill pattern (source: [Claude Code Skills Examples](https://www.neonwatty.com/posts/interview-skills-claude-code/)) recommends 5-10 rounds of questioning for feature specification. However, this is explicitly for *discovery* workflows (brainstorming, planning) where the user has not yet decided what to build. For *execution* workflows (work, review, compound), the recommended pattern is an **approval gate**: propose, confirm, execute.

Key principles from current best practices (source: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)):

- Ask questions that reveal hidden assumptions, not obvious facts
- Prefer multiple-choice over open-ended questions
- Always provide a "proceed with defaults" escape hatch
- Never ask more than 1 question before showing progress

### 4. Agent Guardrail UX

The emerging consensus for AI agent guardrails in 2025-2026 (sources: [Guardrails for AI Agents - UX Planet](https://uxplanet.org/guardrails-for-ai-agents-24349b93caeb); [Agent UX Guardrails - Zypsy](https://llms.zypsy.com/agent-ux-guardrails)) is:

- **Reversible-by-default design:** Every action should be undoable unless explicitly destructive
- **Pre-flight summary:** Before destructive operations, show who/what/when/where
- **Dry-run toggles:** Preview actions before execution
- **Confirmation calibrated to risk:** Low-risk actions proceed automatically; high-risk actions require explicit confirmation
- **No hard blocks:** "Ask" mode (user confirms) is preferred over "deny" mode (hard block) because developers need to be able to override guardrails when they know what they are doing

### 5. State Resumption UX

Workflow resumability is an active area of development across the industry (sources: [MCP Resumability Discussion](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/982); [Addy Osmani: AI coding workflow 2026](https://addyosmani.com/blog/ai-coding-workflow/)). Key UX patterns:

- **Checkpoint-based recovery:** Record workflow state after each major step
- **Explicit resume prompt:** When a user returns, clearly state "Found state from [timestamp]. Resume or start fresh?"
- **State should be visible:** Users must be able to inspect what was saved
- **Staleness detection:** State older than a configurable threshold should warn, not auto-resume

### 6. CI Feedback UX

For PR-time validation errors, the best developer experience (sources: [CI on Every Pull Request - NamasteDev](https://namastedev.com/blog/ci-on-every-pull-request-2/); [Error Message UX - Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-error-feedback)) comes from:

- **Inline annotations:** GitHub Actions can leave annotations on specific lines
- **Structured summaries:** A summary table at the top of the check output
- **Fix suggestions:** Tell the author exactly how to fix each issue
- **Severity differentiation:** Errors block merge; warnings do not

---

## Interaction Design

### Area 1: Input Validation UX

**Design goal:** Catch bad input early with clear, actionable messages. Never let bad input cascade into cryptic errors 15 steps into a workflow.

**Pattern: Validate-then-proceed (not validate-then-block)**

Input validation should happen in the first 3 lines of command execution, before any expensive operations (agent spawning, git operations, API calls). When validation fails, the message must follow the three-part structure.

**Validation categories by command type:**

| Input Type | Validation | Commands |
|------------|-----------|----------|
| Plan file path | File exists, is `.md`, is in `docs/plans/` | `workflows:work`, `deepen-plan` |
| PR number | Numeric, PR exists on remote | `workflows:review`, `test-browser` |
| Branch name | Valid git ref, exists locally or on remote | `workflows:review`, `test-browser` |
| Feature description | Non-empty string | `workflows:plan`, `workflows:brainstorm` |
| Brief context | Non-empty string (optional) | `workflows:compound` |

**Validation should be permissive, not strict.** If the user passes `847` to `/workflows:review`, treat it as a PR number. If they pass `feature/auth`, treat it as a branch. If they pass a URL, extract the PR number from it. Only fail if no reasonable interpretation exists.

**Template:**

```
Error: [What happened]
  [argument] is not a valid [expected type].

Why: [Context]
  [explanation of what the command expected]

Fix: [Actionable next step]
  /[command] [correct usage example]

Hint: [Optional - similar valid values]
  Did you mean: [suggestion]?
```

### Area 2: AskUserQuestion Patterns

**Design goal:** Ask the minimum number of questions needed to avoid building the wrong thing. Never ask when arguments make the intent clear.

**Question budget per command:**

| Command | Max Questions (Interactive) | Max Questions (Autonomous) |
|---------|---------------------------|---------------------------|
| `workflows:plan` | 3-5 (idea refinement) | 0 (description is the argument) |
| `workflows:work` | 1 (plan selection when empty) | 0 (plan path is the argument) |
| `workflows:review` | 0-1 (already well-scoped) | 0 |
| `workflows:compound` | 1 (category confirmation) | 0 (auto-classify) |
| `workflows:brainstorm` | 3-7 (this IS the dialogue) | N/A (never autonomous) |

**Progressive disclosure logic for questions:**

```
IF $ARGUMENTS is non-empty AND valid:
    -> L1: Proceed immediately, no questions
ELSE IF $ARGUMENTS is non-empty but ambiguous:
    -> L2: One clarifying question with multiple-choice
ELSE (empty arguments, interactive mode):
    -> L2 or L3: Lightweight prompt or guided interview
```

**Multiple-choice design rules:**

1. Lead with the recommended option (mark it with "recommended" label)
2. Maximum 5 options (4 specific + 1 "Other")
3. Number each option for quick selection
4. Include a "skip/proceed with defaults" option when defaults are sensible
5. Frame questions as decisions, not information requests

### Area 3: Hook Confirmation UX

**Design goal:** Protect users from costly mistakes without slowing them down on routine operations. Confirmation should feel like a safety net, not a speedbump.

**Confirmation prompt template:**

```
[icon] [Operation Type] detected

  Command:  [the exact command being run]
  Impact:   [what this will do, in plain language]
  Scope:    [what files/branches/data are affected]

  Allow this operation? (y/n)
```

**Risk calibration matrix:**

| Operation | Mode | Prompt Text |
|-----------|------|-------------|
| `git push --force` | ask | "Force push will overwrite remote history on [branch]. Allow?" |
| `git reset --hard` | ask | "Hard reset will discard all uncommitted changes. Allow?" |
| `rm -rf` (non-trivial path) | ask | "Recursive delete of [path] ([N] files). Allow?" |
| `.env` file edit | ask | "Editing .env file which may contain secrets. Allow?" |
| `rm -rf /` or similar | deny | Hard block. No prompt. This is never legitimate. |

**UX rules for hook confirmations:**

1. **Show the actual command**, not an abstraction. Users need to see exactly what will run.
2. **Show scope/impact** in concrete terms (file count, branch name, not "some files").
3. **Default to "no"** for destructive operations. Pressing Enter without typing should NOT allow the operation.
4. **Single keypress response.** `y` or `n`, not "yes" or "no". Speed matters.
5. **Remember context.** If the user confirms `git push --force` once in a session, do not ask again for the same branch in that session. (Future enhancement -- not in v1.)

### Area 4: State Management UX

**Design goal:** Make resumable state feel like a feature, not a bug. Users should never be surprised by stale state, and starting fresh should be effortless.

**State file location:** `.feature-name.local.md` in the project root (gitignored).

**Resume prompt template (shown when state exists):**

```
Found previous session for "[feature name]"
  Started:  [date/time]
  Phase:    [plan|work|review|compound]
  Progress: [X/Y tasks completed]

  1. Resume from where you left off (recommended)
  2. Start fresh (discards saved progress)
  3. View saved state before deciding
```

**State visibility rules:**

1. **On command start:** If state exists for this feature, ALWAYS show the resume prompt. Never silently resume.
2. **On command completion:** Show a brief "Progress saved to [file]" message. Do not ask for confirmation.
3. **State staleness:** If the state file is older than 7 days, add a warning: "This state is [N] days old and may be outdated."
4. **State conflicts:** If the git branch has changed significantly since the state was written (use `git log --oneline` count), warn: "The branch has [N] new commits since this state was saved. Starting fresh may be safer."
5. **Cleanup:** State files are automatically deleted when the workflow completes successfully (compound phase). They persist only for interrupted workflows.

**State file structure (for the user-visible section):**

```markdown
---
feature: [feature name]
phase: [plan|work|review|compound]
started: [ISO 8601 timestamp]
updated: [ISO 8601 timestamp]
branch: [git branch name]
plan_file: [path to plan file]
---

## Progress
- [x] Plan created: docs/plans/2026-02-09-feat-example-plan.md
- [x] Branch created: feat/example
- [ ] Implementation (3/7 tasks completed)
- [ ] Tests passing
- [ ] Review complete
- [ ] Compound documented
```

### Area 5: CI Failure UX

**Design goal:** When a PR fails command validation CI, the author should know exactly what to fix without reading the full CI log.

**CI output structure:**

```
== Command Validation Results ==

PASS  24/24 commands have 'name' field
PASS  24/24 commands have 'description' field
PASS  24/24 commands have 'argument-hint' field
FAIL  2/24 commands missing 'disable-model-invocation' field
PASS  0 broken tool/agent references found

-- Failures --

commands/new-command.md:
  Missing: disable-model-invocation
  Fix: Add 'disable-model-invocation: true' to frontmatter
  Why: Commands without this flag are auto-loaded into context,
       consuming token budget unnecessarily.

commands/workflows/new-workflow.md:
  Missing: disable-model-invocation
  Fix: Add 'disable-model-invocation: true' to frontmatter

== 1 error, 0 warnings ==
```

**CI feedback design rules:**

1. **Summary first.** Show pass/fail counts before details. Most of the time, everything passes and the author needs to see that instantly.
2. **Failures include file path + fix instruction.** The author should be able to fix the issue without understanding the validation script.
3. **Warnings vs. errors.** Missing `argument-hint` is a warning (does not block merge). Missing `name` or `description` is an error (blocks merge). Missing `disable-model-invocation` is an error for commands that should have it.
4. **GitHub annotations.** Use `::error file=` syntax so GitHub shows annotations inline on the PR diff.

---

## AskUserQuestion Flow Designs

### Flow 1: `/workflows:work` (Lightweight Plan Picker)

**Trigger:** `$ARGUMENTS` is empty when `/workflows:work` is invoked.

**Goal:** Help the user select which plan to work on with minimum friction. This is NOT a brainstorming session -- the user has already decided to work, they just forgot to specify what.

```
[System detects $ARGUMENTS is empty]
[System scans docs/plans/ for recent .md files]

AskUserQuestion:
  Question: "Which plan would you like to work on?"
  Options:
    1. docs/plans/2026-02-08-feat-user-auth-plan.md (yesterday)
    2. docs/plans/2026-02-07-fix-checkout-bug-plan.md (2 days ago)
    3. docs/plans/2026-02-05-refactor-api-client-plan.md (4 days ago)
    4. Enter a file path manually
    5. Browse all plans

  [If state files exist for any plan, annotate:]
    1. docs/plans/2026-02-08-feat-user-auth-plan.md (yesterday) -- has saved progress
```

**Flow logic:**

```
IF $ARGUMENTS is non-empty:
    validate_plan_path($ARGUMENTS)
    -> proceed to Phase 1: Quick Start

ELSE:
    plans = list_recent_plans("docs/plans/", limit=5)
    states = find_matching_states(plans)

    IF plans is empty:
        -> "No plans found in docs/plans/. Create one first with /workflows:plan"
        -> EXIT

    IF len(plans) == 1:
        -> "Found one plan: [plan]. Work on this? (y/n)"
        -> IF yes: proceed
        -> IF no: "Enter a plan path or run /workflows:plan first"

    ELSE:
        -> AskUserQuestion with plan list
        -> annotate plans that have saved state
        -> proceed with selection
```

**Design rationale:** Listing recent plans is better than asking "what do you want to work on?" because it constrains the answer space to valid options. The user picks from a list rather than typing a path from memory. Plans with saved state are highlighted to encourage resumption.

### Flow 2: `/workflows:review` (Review Depth Selection)

**Current state:** The review command already works well with arguments (PR number, branch, URL, or "latest"). The main UX gap is when arguments are empty or when the user might want to customize agent selection.

**Design decision: Do NOT add a review depth selector by default.**

The current `/workflows:review` command runs all 13+ agents in parallel by default. This is the correct default -- a comprehensive review is the whole point. Adding a depth selector ("quick review" vs. "deep review") would:

1. Create decision fatigue at a moment when the user just wants to review
2. Undermine the command's value proposition (it is comprehensive by design)
3. Slow down autonomous chains (`lfg`/`slfg`)

**Instead, add a minimal argument-empty handler:**

```
[System detects $ARGUMENTS is empty]
[System checks for current branch and recent PRs]

AskUserQuestion:
  Question: "What would you like to review?"
  Options:
    1. PR #892 - "feat: Add user auth flow" (opened 2h ago by you)
    2. PR #891 - "fix: Checkout total calc" (opened yesterday by you)
    3. Current branch: feat/api-refactor (no PR yet)
    4. Enter PR number or branch name manually

  [Auto-detect context:]
    - If on a feature branch with an open PR: default to that PR
    - If on a feature branch without a PR: default to current branch
    - If on main/master: show recent PRs list
```

**Why no depth selector:** Power users who want a lighter review can invoke specific agents directly (`Task kieran-rails-reviewer(...)`). The slash command should do the comprehensive thing. The progressive disclosure principle says: the common action should be the default action.

**Future consideration (not in v1):** If user feedback reveals demand for lighter reviews, add a `--quick` flag that runs only 4 core agents (code-simplicity-reviewer, security-sentinel, performance-oracle, architecture-strategist) rather than all 13+. Flags are better than questions for optional behavior.

### Flow 3: `/workflows:compound` (Solution Categorization)

**Current state:** The compound command uses parallel subagents including a "Category Classifier" that auto-detects the solution category. The current categories are well-defined (build-errors, test-failures, runtime-errors, etc.).

**Design decision: Add a lightweight confirmation, not a question.**

The auto-classification should run first, then present its result for confirmation. This respects the user's time (they just solved a problem and want to document it quickly) while ensuring the classification is correct.

```
[Category Classifier subagent returns result]

AskUserQuestion:
  Question: "Classified as '[category]'. Does this look right?"
  Options:
    1. Yes, proceed (recommended)
    2. Change category
    3. This is actually two problems -- document separately

  [If "Change category":]
    AskUserQuestion:
      Question: "Select the correct category:"
      Options:
        1. build-errors
        2. test-failures
        3. runtime-errors
        4. performance-issues
        5. database-issues
        6. security-issues
        7. ui-bugs
        8. integration-issues
        9. logic-errors
```

**Flow logic:**

```
IF running in autonomous mode (part of lfg/slfg chain):
    -> auto-classify, skip confirmation, proceed
    -> trust the classifier -- misclassification is fixable later

ELSE (interactive mode):
    -> auto-classify, show confirmation prompt
    -> single question, 3 options
    -> "Yes" is the first option for quick selection
```

**Design rationale:** Compound is the final step in the workflow lifecycle. The user has just spent significant effort solving a problem. The UX should be "confirm and finish" not "answer more questions." One confirmation question with the default being "yes" is the right balance.

### Flow 4: `/workflows:plan` (Existing -- Minor Refinement)

**Current state:** The plan command already has the best AskUserQuestion implementation in the plugin. It uses collaborative dialogue for idea refinement, checks for brainstorm documents, and offers skip options for clear descriptions. The PM analysis correctly identified this as a model for other commands.

**Recommended refinement: Add L1/L2/L3 layer awareness.**

```
L1: $ARGUMENTS is a detailed description (>50 words or references a brainstorm)
    -> Skip idea refinement, announce "Description is detailed, proceeding to research"
    -> User can interrupt if they want refinement

L2: $ARGUMENTS is brief (1-50 words)
    -> Current behavior: offer "Your description is clear. Proceed or refine?"
    -> Single question, then proceed

L3: $ARGUMENTS is empty
    -> Current behavior: full idea refinement dialogue
    -> 3-5 questions, multiple choice where possible
```

### Flow 5: `/workflows:brainstorm` (Existing -- No Changes Needed)

**Current state:** The brainstorm command is inherently conversational. Its entire purpose is the dialogue. The existing AskUserQuestion usage (Phase 0 clarity assessment, Phase 1 collaborative dialogue, Phase 2 approach selection, Phase 4 handoff) is well-designed.

**No UX changes recommended.** This command is already the gold standard for interactive AskUserQuestion usage in the plugin. Its only improvement would be adding the bypass for clear requirements (Phase 0), which already exists.

---

## Error Message Templates

### Template 1: Missing Required Argument

```
No [argument type] provided.

Usage: /[command] [argument-hint]

Example:
  /workflows:work docs/plans/2026-02-09-feat-example-plan.md
  /workflows:review 892
  /test-browser current
```

### Template 2: Invalid Argument Type

```
"[user input]" is not a valid [expected type].

Expected: [description of valid input]
  - PR number (e.g., 892)
  - GitHub PR URL (e.g., https://github.com/org/repo/pull/892)
  - Branch name (e.g., feat/user-auth)
  - "current" for the current branch

Got: "[user input]" which looks like [detected type]

Fix: /[command] [corrected usage]
```

### Template 3: Valid Argument, Resource Not Found

```
[Resource type] "[identifier]" not found.

Checked:
  - [location 1]: not found
  - [location 2]: not found

Did you mean:
  - [similar resource 1] (closest match)
  - [similar resource 2]

Fix: Verify the [resource type] exists, or create one with /[related command]
```

### Template 4: Stale Tool Reference (for reproduce-bug migration)

```
This command uses tools that are no longer available.

Removed:  mcp__plugin_compound-engineering_pw__navigate
Replaced: agent-browser open [url]

The command will be updated to use the agent-browser CLI.
See: /test-browser for a working example of browser automation.
```

### Template 5: Hook Confirmation (Destructive Operation)

```
Destructive operation detected.

  Command:  git push --force origin feat/user-auth
  Impact:   Overwrites remote history for branch 'feat/user-auth'
  Warning:  Other collaborators on this branch will need to force-pull

  Allow? [y/N]
```

Note: The capital N indicates the default is "no" (deny). The user must explicitly type `y` to proceed.

### Template 6: State Resumption

```
Previous session found for "user-auth-flow"

  File:     .user-auth-flow.local.md
  Phase:    work (implementation)
  Progress: 3/7 tasks completed
  Age:      2 hours ago
  Branch:   feat/user-auth (current)

  1. Resume from task 4  (recommended)
  2. Start fresh (discards saved progress)
  3. View saved state
```

### Template 7: CI Validation Failure (GitHub Actions Output)

```
::error file=commands/new-command.md,line=1::Missing required field 'disable-model-invocation' in frontmatter. Add 'disable-model-invocation: true' if this command should not be auto-invoked by the model.

== Command Validation Summary ==

  Checked: 24 command files
  Passed:  23
  Failed:  1
  Warnings: 0

  FAIL commands/new-command.md
    - Missing: disable-model-invocation (required for non-workflow commands)
    - Fix: Add to YAML frontmatter:
      disable-model-invocation: true
```

---

## State Resumption UX

### Lifecycle

```
/workflows:plan [feature]
    -> Creates .feature-name.local.md with phase: plan
    -> On completion: updates phase to plan-complete

/workflows:work [plan-path]
    -> Reads existing .local.md OR creates new one
    -> Updates phase to work, tracks task progress
    -> On completion: updates phase to work-complete

/workflows:review [PR]
    -> Updates phase to review
    -> On completion: updates phase to review-complete

/workflows:compound [context]
    -> Updates phase to compound
    -> On completion: DELETES the .local.md file (lifecycle complete)
```

### State File Naming Convention

```
.{feature-slug}.local.md

Examples:
  .user-auth-flow.local.md
  .checkout-bug-fix.local.md
  .api-client-refactor.local.md
```

The feature slug is derived from the plan filename by stripping the date prefix, type prefix, and `-plan` suffix:
- `2026-02-09-feat-user-auth-flow-plan.md` -> `.user-auth-flow.local.md`

### Discovery Logic

When any workflow command starts:

```
1. Check for .local.md files in project root
2. IF exact match for current feature:
     -> Show resume prompt (Template 6)
3. ELSE IF related files exist (same branch name):
     -> Show "Found related state from [feature]. Is this the same work?"
4. ELSE:
     -> Proceed without state (new workflow)
```

### Gitignore Rule

Add to `.gitignore`:
```
# Workflow state files (compound-engineering plugin)
.*.local.md
```

### Staleness Rules

| Age | Behavior |
|-----|----------|
| < 24 hours | Resume prompt, "recommended" label on resume option |
| 1-7 days | Resume prompt, no "recommended" label, neutral framing |
| > 7 days | Resume prompt with warning: "This state is [N] days old and may be outdated" |
| > 30 days | Auto-suggest "Start fresh" as the recommended option |

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Multiple .local.md files exist | List all, ask user which one to resume |
| Branch was deleted/rebased | Warn: "Branch [name] has been modified since state was saved" |
| Plan file was edited externally | Warn: "Plan file has been modified since state was saved" |
| State file is corrupted/unparseable | Warn: "Could not read state file. Starting fresh." Delete the corrupt file. |
| User runs `/workflows:plan` but state says phase is `work` | Warn: "State shows this feature is in the work phase. Did you mean `/workflows:work`?" |

---

## Appendix: Research Sources

1. [UX patterns for CLI tools](https://www.lucasfcosta.com/blog/ux-patterns-cli-tools) -- Error messages, input validation, progressive disclosure patterns
2. [Progressive Disclosure Matters: Applying 90s UX Wisdom to 2026 AI Agents](https://aipositive.substack.com/p/progressive-disclosure-matters) -- Three-level disclosure for agent systems
3. [Anthropic: Equipping agents with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) -- Metadata-first discovery pattern
4. [Claude Code Skills Examples: Using AskUserQuestion](https://www.neonwatty.com/posts/interview-skills-claude-code/) -- Multi-round interview patterns
5. [Skill authoring best practices - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) -- Official skill design guidance
6. [Guardrails for AI Agents - UX Planet](https://uxplanet.org/guardrails-for-ai-agents-24349b93caeb) -- Pre-flight summary, reversible-by-default design
7. [Agent UX Guardrails - Zypsy](https://llms.zypsy.com/agent-ux-guardrails) -- Dry-run toggles, confirmation calibration
8. [6 things developer tools must have in 2026 - Evil Martians](https://evilmartians.com/chronicles/six-things-developer-tools-must-have-to-earn-trust-and-adoption) -- Discoverability as core navigation
9. [MCP Resumability Discussion](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/982) -- Resume tokens for long-running operations
10. [CI on Every Pull Request - NamasteDev](https://namastedev.com/blog/ci-on-every-pull-request-2/) -- CI feedback loop design
11. [Error Message UX - Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-error-feedback) -- Three-part error message structure
12. [Addy Osmani: AI coding workflow 2026](https://addyosmani.com/blog/ai-coding-workflow/) -- Checkpoint-based state, agent memory
13. [RedMonk: 10 Things Developers Want from Agentic IDEs](https://redmonk.com/kholterhoff/2025/12/22/10-things-developers-want-from-their-agentic-ides-in-2025/) -- Resumable workflows, pattern recognition
14. [State of UX 2026 - NN/g](https://www.nngroup.com/articles/state-of-ux-2026/) -- Design deeper to differentiate

---

## Questions for PM / Implementation Team

---QUESTIONS FOR USER---

1. **Autonomous chain detection: How should commands detect they are running inside `lfg`/`slfg`?**
   - Why: Every AskUserQuestion gate needs a bypass mechanism for autonomous mode. Commands need a reliable signal to skip interactive prompts.
   - Options:
     - (a) Check for a `--non-interactive` flag passed as part of $ARGUMENTS
     - (b) Check for an environment variable set by the parent orchestrator (e.g., `COMPOUND_AUTONOMOUS=true`)
     - (c) Check for the ralph-loop completion promise context (already present in lfg/slfg)
     - (d) Infer from $ARGUMENTS presence -- if arguments are provided, skip prompts; if empty, ask
   - Recommend: (d) -- simplest, requires no orchestrator changes. Arguments already encode intent. The only edge case is `/workflows:compound` which has an optional argument, but "optional argument present" vs. "argument absent" is still a valid signal.

2. **Hook confirmation scope: Should hook confirmations apply to operations triggered by subagents?**
   - Why: `/workflows:review` spawns 13+ parallel subagents. If a subagent triggers a destructive operation (unlikely but possible in `/resolve_todo_parallel`), should the hook fire? Subagents cannot interact with the user via the parent's terminal.
   - Options:
     - (a) Hooks fire for all operations regardless of invocation context
     - (b) Hooks fire only for the main conversation thread (not subagents)
     - (c) Hooks fire for subagents but auto-deny (safe default)
   - Recommend: (a) -- hooks are a system-level safety net. If a subagent is about to force-push, the user should know. Claude Code handles this by surfacing the prompt to the main thread.

3. **State file naming: Should state files use the plan filename slug or the git branch name?**
   - Why: The plan filename and git branch may not always match (e.g., plan is `2026-02-09-feat-user-auth-plan.md` but branch is `pk/auth-flow`). Using one consistently avoids ambiguity.
   - Options:
     - (a) Derive from plan filename: `.user-auth-plan.local.md`
     - (b) Derive from git branch name: `.pk-auth-flow.local.md`
     - (c) Derive from plan filename but cross-reference branch in the state file
   - Recommend: (c) -- plan filename is the canonical identifier (it is the artifact that persists), but the branch name inside the file enables the "branch has changed" warning. This also works when the user has not created a branch yet (plan phase).

4. **Error message verbosity: Should validation errors include the "Why" section or keep it minimal?**
   - Why: Power users may find "Why" explanations condescending. New users may need them. The three-part error message (What/Why/Fix) is best practice but adds visual noise.
   - Options:
     - (a) Always show What/Why/Fix (full three-part message)
     - (b) Show What/Fix by default, show Why only on first occurrence or with `--verbose`
     - (c) Show What/Fix inline, put Why in a collapsible `<details>` block (only works in CI output, not terminal)
   - Recommend: (a) -- for a CLI tool running inside an AI agent, the "Why" section is critical context for the agent itself. Even if the human user skips it, the agent reads it and can self-correct. The marginal cost of 1 extra line is negligible compared to the cost of a confused agent.

5. **Plan picker sort order: When listing recent plans for `/workflows:work`, what sort order and how many?**
   - Why: Users may have dozens of plans. The list needs to be short enough to scan but comprehensive enough to find the right one.
   - Options:
     - (a) Most recent first, show 3 plans
     - (b) Most recent first, show 5 plans
     - (c) Most recent first, show 5 plans, but prioritize plans with saved state
   - Recommend: (c) -- plans with saved state represent interrupted work, which is the most likely thing the user wants to resume. Show those first, then recent plans, capped at 5 total.

---END QUESTIONS---

---

## Questions & Answers

### Q1: Autonomous chain detection mechanism
**Answer**: Infer from $ARGUMENTS presence — if arguments provided, skip prompts; if empty, ask
**Impact**: No orchestrator changes needed. lfg/slfg already pass arguments to workflow commands. Commands check for non-empty $ARGUMENTS to bypass AskUserQuestion gates.

### Q2: Hook confirmation scope for subagents
**Answer**: Fire for all operations regardless of invocation context
**Impact**: System-level safety net applies everywhere. If a subagent spawned by resolve_todo_parallel attempts a force-push, the hook surfaces the prompt to the main thread.

### Q3: State file naming derivation
**Answer**: Derive from plan filename, cross-reference branch name inside the state file
**Impact**: Plan filename is the canonical identifier (persists before branch exists). Branch name stored inside the file enables "branch has changed" warnings. Format: `.{feature-slug}.local.md`

### Q4: Error message verbosity
**Answer**: Always show What/Why/Fix (full three-part message)
**Impact**: Every validation error includes Why section. Critical for agent self-correction — the AI reads the Why to understand what went wrong and fix it.

### Q5: Plan picker sort and count
**Answer**: 5 plans, state-first then recent — plans with saved state shown first, then recent, capped at 5
**Impact**: Interrupted work surfaces first in the plan picker for /workflows:work. Users are more likely to resume interrupted work than start new work.
