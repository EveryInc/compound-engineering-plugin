---
name: ce:work
description: Execute work efficiently while maintaining quality and finishing features
argument-hint: "[Plan doc path or description of work. Blank to auto use latest plan doc] [delegate:codex]"
---

# Work Execution Command

Execute work efficiently while maintaining quality and finishing features.

## Introduction

This command takes a work document (plan, specification, or todo file) or a bare prompt describing the work, and executes it systematically. The focus is on **shipping complete features** by understanding requirements quickly, following existing patterns, and maintaining quality throughout.

## Input Document

<input_document> #$ARGUMENTS </input_document>

## Argument Parsing

Parse `$ARGUMENTS` for the following optional tokens. Strip each recognized token before interpreting the remainder as the plan file path or bare prompt.

| Token | Example | Effect |
|-------|---------|--------|
| `delegate:codex` | `delegate:codex` | Activate Codex delegation mode for plan execution |
| `delegate:local` | `delegate:local` | Deactivate delegation even if enabled in local.md |

All tokens are optional. When absent, fall back to the resolution chain below.

**Fuzzy activation:** Also recognize imperative delegation-intent phrases such as "use codex", "delegate to codex", "codex mode", or "delegate mode" as equivalent to `delegate:codex`. A bare mention of "codex" in a prompt (e.g., "fix codex converter bugs") must NOT activate delegation -- only clear delegation intent triggers it.

**Fuzzy deactivation:** Also recognize phrases such as "no codex", "local mode", "standard mode" as equivalent to `delegate:local`.

### Settings Resolution Chain

After extracting tokens from arguments, resolve the delegation state using this precedence chain:

1. **Argument flag** -- `delegate:codex` or `delegate:local` from the current invocation (highest priority)
2. **local.md setting** -- Read `.claude/compound-engineering.local.md` and extract `work_delegate` from YAML frontmatter. Value `codex` activates delegation; `false` deactivates.
3. **Hard default** -- `false` (delegation off)

To read local.md: open the file, extract content between the opening and closing `---` delimiters (YAML frontmatter), and interpret the keys. If the file is missing, empty, or has malformed frontmatter, treat all settings as absent and fall through to hard defaults.

Also read from local.md when present:
- `work_codex_consent` -- `true` if the user has completed the one-time consent flow
- `work_codex_sandbox` -- `yolo` (default) or `full-auto` -- sandbox posture for codex exec

Store the resolved state for downstream consumption:
- `delegation_active` -- boolean, whether delegation mode is on
- `delegation_source` -- `argument` or `local.md` or `default` -- how delegation was resolved (used by environment guard to decide notification verbosity)
- `sandbox_mode` -- `yolo` or `full-auto` (from local.md or default `yolo`)
- `consent_granted` -- boolean (from local.md `work_codex_consent`)

---

## Execution Workflow

### Phase 0: Input Triage

Determine how to proceed based on what was provided in `<input_document>`.

**Plan document** (input is a file path to an existing plan, specification, or todo file) → skip to Phase 1.

**Bare prompt** (input is a description of work, not a file path):

1. **Scan the work area**

   - Identify files likely to change based on the prompt
   - Find existing test files for those areas (search for test/spec files that import, reference, or share names with the implementation files)
   - Note local patterns and conventions in the affected areas

2. **Assess complexity and route**

   | Complexity | Signals | Action |
   |-----------|---------|--------|
   | **Trivial** | 1-2 files, no behavioral change (typo, config, rename) | Proceed to Phase 1 step 2 (environment setup), then implement directly — no task list, no execution loop. Apply Test Discovery if the change touches behavior-bearing code |
   | **Small / Medium** | Clear scope, under ~10 files | Build a task list from discovery. Proceed to Phase 1 step 2 |
   | **Large** | Cross-cutting, architectural decisions, 10+ files, touches auth/payments/migrations | Inform the user this would benefit from `/ce:brainstorm` or `/ce:plan` to surface edge cases and scope boundaries. Honor their choice. If proceeding, build a task list and continue to Phase 1 step 2 |

---

### Phase 1: Quick Start

1. **Read Plan and Clarify** _(skip if arriving from Phase 0 with a bare prompt)_

   - Read the work document completely
   - Treat the plan as a decision artifact, not an execution script
   - If the plan includes sections such as `Implementation Units`, `Work Breakdown`, `Requirements Trace`, `Files`, `Test Scenarios`, or `Verification`, use those as the primary source material for execution
   - Check for `Execution note` on each implementation unit — these carry the plan's execution posture signal for that unit (for example, test-first or characterization-first). Note them when creating tasks.
   - Check for a `Deferred to Implementation` or `Implementation-Time Unknowns` section — these are questions the planner intentionally left for you to resolve during execution. Note them before starting so they inform your approach rather than surprising you mid-task
   - Check for a `Scope Boundaries` section — these are explicit non-goals. Refer back to them if implementation starts pulling you toward adjacent work
   - Review any references or links provided in the plan
   - If the user explicitly asks for TDD, test-first, or characterization-first execution in this session, honor that request even if the plan has no `Execution note`
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

   First, check whether the branch name is **meaningful** — a name like `feat/crowd-sniff` or `fix/email-validation` tells future readers what the work is about. Auto-generated worktree names (e.g., `worktree-jolly-beaming-raven`) or other opaque names do not.

   If the branch name is meaningless or auto-generated, suggest renaming it before continuing:
   ```bash
   git branch -m <meaningful-name>
   ```
   Derive the new name from the plan title or work description (e.g., `feat/crowd-sniff`). Present the rename as a recommended option alongside continuing as-is.

   Then ask: "Continue working on `[current_branch]`, or create a new branch?"
   - If continuing (with or without rename), proceed to step 3
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

3. **Create Todo List** _(skip if Phase 0 already built one, or if Phase 0 routed as Trivial)_
   - Use your available task tracking tool (e.g., TodoWrite, task lists) to break the plan into actionable tasks
   - Derive tasks from the plan's implementation units, dependencies, files, test targets, and verification criteria
   - Carry each unit's `Execution note` into the task when present
   - For each unit, read the `Patterns to follow` field before implementing — these point to specific files or conventions to mirror
   - Use each unit's `Verification` field as the primary "done" signal for that task
   - Do not expect the plan to contain implementation code, micro-step TDD instructions, or exact shell commands
   - Include dependencies between tasks
   - Prioritize based on what needs to be done first
   - Include testing and quality check tasks
   - Keep tasks specific and completable

4. **Choose Execution Strategy**

   **Delegation routing gate:** If `delegation_active` is true AND the input is a plan file (not a bare prompt), force **serial inline execution** for all units. Delegation mode requires serial execution because each unit must start from a clean working tree after the prior unit's commit or rollback. Skip the strategy table below and proceed directly to Phase 2. If delegation is active but the input is a bare prompt (no plan file), set `delegation_active` to false with a brief note: "Delegation requires a plan file -- using standard mode." and continue with the standard strategy selection below.

   After creating the task list, decide how to execute based on the plan's size and dependency structure:

   | Strategy | When to use |
   |----------|-------------|
   | **Inline** | 1-2 small tasks, or tasks needing user interaction mid-flight. **Default for bare-prompt work** — bare prompts rarely produce enough structured context to justify subagent dispatch |
   | **Serial subagents** | 3+ tasks with dependencies between them. Each subagent gets a fresh context window focused on one unit — prevents context degradation across many tasks. Requires plan-unit metadata (Goal, Files, Approach, Test scenarios) |
   | **Parallel subagents** | 3+ tasks where some units have no shared dependencies and touch non-overlapping files. Dispatch independent units simultaneously, run dependent units after their prerequisites complete. Requires plan-unit metadata |

   **Subagent dispatch** uses your available subagent or task spawning mechanism. For each unit, give the subagent:
   - The full plan file path (for overall context)
   - The specific unit's Goal, Files, Approach, Execution note, Patterns, Test scenarios, and Verification
   - Any resolved deferred questions relevant to that unit
   - Instruction to check whether the unit's test scenarios cover all applicable categories (happy paths, edge cases, error paths, integration) and supplement gaps before writing tests

   **Permission mode:** Omit the `mode` parameter when dispatching subagents so the user's configured permission settings apply. Do not pass `mode: "auto"` — it overrides user-level settings like `bypassPermissions`.

   After each subagent completes, update the plan checkboxes and task list before dispatching the next dependent unit.

   For genuinely large plans needing persistent inter-agent communication (agents challenging each other's approaches, shared coordination across 10+ tasks), see Swarm Mode below which uses Agent Teams.

### Phase 2: Execute

1. **Task Execution Loop**

   For each task in priority order:

   ```
   while (tasks remain):
     - Mark task as in-progress
     - Read any referenced files from the plan or discovered during Phase 0
     - Look for similar patterns in codebase
     - Find existing test files for implementation files being changed (Test Discovery — see below)
     - If delegation_active: branch to the Codex Delegation Execution Loop
       (see Codex Delegation Mode section below)
     - Otherwise: implement following existing conventions
     - Add, update, or remove tests to match implementation changes (see Test Discovery below)
     - Run System-Wide Test Check (see below)
     - Run tests after changes
     - Assess testing coverage: did this task change behavior? If yes, were tests written or updated? If no tests were added, is the justification deliberate (e.g., pure config, no behavioral change)?
     - Mark task as completed
     - Evaluate for incremental commit (see below)
   ```

   When a unit carries an `Execution note`, honor it. For test-first units, write the failing test before implementation for that unit. For characterization-first units, capture existing behavior before changing it. For units without an `Execution note`, proceed pragmatically.

   Guardrails for execution posture:
   - Do not write the test and implementation in the same step when working test-first
   - Do not skip verifying that a new test fails before implementing the fix or feature
   - Do not over-implement beyond the current behavior slice when working test-first
   - Skip test-first discipline for trivial renames, pure configuration, and pure styling work

   **Test Discovery** — Before implementing changes to a file, find its existing test files (search for test/spec files that import, reference, or share naming patterns with the implementation file). When a plan specifies test scenarios or test files, start there, then check for additional test coverage the plan may not have enumerated. Changes to implementation files should be accompanied by corresponding test updates — new tests for new behavior, modified tests for changed behavior, removed or updated tests for deleted behavior.

   **Test Scenario Completeness** — Before writing tests for a feature-bearing unit, check whether the plan's `Test scenarios` cover all categories that apply to this unit. If a category is missing or scenarios are vague (e.g., "validates correctly" without naming inputs and expected outcomes), supplement from the unit's own context before writing tests:

   | Category | When it applies | How to derive if missing |
   |----------|----------------|------------------------|
   | **Happy path** | Always for feature-bearing units | Read the unit's Goal and Approach for core input/output pairs |
   | **Edge cases** | When the unit has meaningful boundaries (inputs, state, concurrency) | Identify boundary values, empty/nil inputs, and concurrent access patterns |
   | **Error/failure paths** | When the unit has failure modes (validation, external calls, permissions) | Enumerate invalid inputs the unit should reject, permission/auth denials it should enforce, and downstream failures it should handle |
   | **Integration** | When the unit crosses layers (callbacks, middleware, multi-service) | Identify the cross-layer chain and write a scenario that exercises it without mocks |

   **System-Wide Test Check** — Before marking a task done, pause and ask:

   | Question | What to do |
   |----------|------------|
   | **What fires when this runs?** Callbacks, middleware, observers, event handlers — trace two levels out from your change. | Read the actual code (not docs) for callbacks on models you touch, middleware in the request chain, `after_*` hooks. |
   | **Do my tests exercise the real chain?** If every dependency is mocked, the test proves your logic works *in isolation* — it says nothing about the interaction. | Write at least one integration test that uses real objects through the full callback/middleware chain. No mocks for the layers that interact. |
   | **Can failure leave orphaned state?** If your code persists state (DB row, cache, file) before calling an external service, what happens when the service fails? Does retry create duplicates? | Trace the failure path with real objects. If state is created before the risky call, test that failure cleans up or that retry is idempotent. |
   | **What other interfaces expose this?** Mixins, DSLs, alternative entry points (Agent vs Chat vs ChatMethods). | Grep for the method/behavior in related classes. If parity is needed, add it now — not as a follow-up. |
   | **Do error strategies align across layers?** Retry middleware + application fallback + framework error handling — do they conflict or create double execution? | List the specific error classes at each layer. Verify your rescue list matches what the lower layer actually raises. |

   **When to skip:** Leaf-node changes with no callbacks, no state persistence, no parallel interfaces. If the change is purely additive (new helper method, new view partial), the check takes 10 seconds and the answer is "nothing fires, skip."

   **When this matters most:** Any change that touches models with callbacks, error handling with fallback/retry, or functionality exposed through multiple interfaces.


2. **Incremental Commits**

   After completing each task, evaluate whether to create an incremental commit:

   | Commit when... | Don't commit when... |
   |----------------|---------------------|
   | Logical unit complete (model, service, component) | Small part of a larger unit |
   | Tests pass + meaningful progress | Tests failing |
   | About to switch contexts (backend → frontend) | Purely scaffolding with no behavior |
   | About to attempt risky/uncertain changes | Would need a "WIP" commit message |

   **Heuristic:** "Can I write a commit message that describes a complete, valuable change? If yes, commit. If the message would be 'WIP' or 'partial X', wait."

   If the plan has Implementation Units, use them as a starting guide for commit boundaries — but adapt based on what you find during implementation. A unit might need multiple commits if it's larger than expected, or small related units might land together. Use each unit's Goal to inform the commit message.

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
   - Follow project coding standards (see AGENTS.md; use CLAUDE.md only if the repo still keeps a compatibility shim)
   - When in doubt, grep for similar implementations

4. **Test Continuously**

   - Run relevant tests after each significant change
   - Don't wait until the end to test
   - Fix failures immediately
   - Add new tests for new behavior, update tests for changed behavior, remove tests for deleted behavior
   - **Unit tests with mocks prove logic in isolation. Integration tests with real objects prove the layers work together.** If your change touches callbacks, middleware, or error handling — you need both.

5. **Simplify as You Go**

   After completing a cluster of related implementation units (or every 2-3 units), review recently changed files for simplification opportunities — consolidate duplicated patterns, extract shared helpers, and improve code reuse and efficiency. This is especially valuable when using subagents, since each agent works with isolated context and can't see patterns emerging across units.

   Don't simplify after every single unit — early patterns may look duplicated but diverge intentionally in later units. Wait for a natural phase boundary or when you notice accumulated complexity.

   If a `/simplify` skill or equivalent is available, use it. Otherwise, review the changed files yourself for reuse and consolidation opportunities.

6. **Figma Design Sync** (if applicable)

   For UI work with Figma designs:

   - Implement components following design specs
   - Use figma-design-sync agent iteratively to compare
   - Fix visual differences identified
   - Repeat until implementation matches design

7. **Frontend Design Guidance** (if applicable)

   For UI tasks without a Figma design -- where the implementation touches view, template, component, layout, or page files, creates user-visible routes, or the plan contains explicit UI/frontend/design language:

   - Load the `frontend-design` skill before implementing
   - Follow its detection, guidance, and verification flow
   - If the skill produced a verification screenshot, it satisfies Phase 4's screenshot requirement -- no need to capture separately. If the skill fell back to mental review (no browser access), Phase 4's screenshot capture still applies

8. **Track Progress**
   - Keep the task list updated as you complete tasks
   - Note any blockers or unexpected discoveries
   - Create new tasks if scope expands
   - Keep user informed of major milestones

### Phase 3: Quality Check

1. **Run Core Quality Checks**

   Always run before submitting:

   ```bash
   # Run full test suite (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # Run linting (per AGENTS.md)
   # Use linting-agent before pushing to origin
   ```

2. **Code Review** (REQUIRED)

   Every change gets reviewed before shipping. The depth scales with the change's risk profile, but review itself is never skipped.

   **Tier 2: Full review (default)** — REQUIRED unless Tier 1 criteria are explicitly met. Invoke the `ce:review` skill with `mode:autofix` to run specialized reviewer agents, auto-apply safe fixes, and surface residual work as todos. When the plan file path is known, pass it as `plan:<path>`. This is the mandatory default — proceed to Tier 1 only after confirming every criterion below.

   **Tier 1: Inline self-review** — A lighter alternative permitted only when **all four** criteria are true. Before choosing Tier 1, explicitly state which criteria apply and why. If any criterion is uncertain, use Tier 2.
   - Purely additive (new files only, no existing behavior modified)
   - Single concern (one skill, one component — not cross-cutting)
   - Pattern-following (implementation mirrors an existing example with no novel logic)
   - Plan-faithful (no scope growth, no deferred questions resolved with surprising answers)

3. **Final Validation**
   - All tasks marked completed
   - Testing addressed -- tests pass and new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)
   - Linting passes
   - Code follows existing patterns
   - Figma designs match (if applicable)
   - No console errors or warnings
   - If the plan has a `Requirements Trace`, verify each requirement is satisfied by the completed work
   - If any `Deferred to Implementation` questions were noted, confirm they were resolved during execution

4. **Prepare Operational Validation Plan** (REQUIRED)
   - Add a `## Post-Deploy Monitoring & Validation` section to the PR description for every change.
   - Include concrete:
     - Log queries/search terms
     - Metrics or dashboards to watch
     - Expected healthy signals
     - Failure signals and rollback/mitigation trigger
     - Validation window and owner
   - If there is truly no production/runtime impact, still include the section with: `No additional operational monitoring required` and a one-line reason.

### Phase 4: Ship It

1. **Capture and Upload Screenshots for UI Changes** (REQUIRED for any UI work)

   For **any** design changes, new views, or UI modifications, capture and upload screenshots before creating the PR:

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

2. **Commit and Create Pull Request**

   Load the `git-commit-push-pr` skill to handle committing, pushing, and PR creation. The skill handles convention detection, branch safety, logical commit splitting, adaptive PR descriptions, and attribution badges.

   When providing context for the PR description, include:
   - The plan's summary and key decisions
   - Testing notes (tests added/modified, manual testing performed)
   - Screenshot URLs from step 1 (if applicable)
   - Figma design link (if applicable)
   - The Post-Deploy Monitoring & Validation section (see Phase 3 Step 4)

   If the user prefers to commit without creating a PR, load the `git-commit` skill instead.

3. **Update Plan Status**

   If the input document has YAML frontmatter with a `status` field, update it to `completed`:
   ```
   status: active  →  status: completed
   ```

4. **Notify User**
   - Summarize what was completed
   - Link to PR (if one was created)
   - Note any follow-up work needed
   - Suggest next steps if applicable

---

## Codex Delegation Mode

When delegation is active (resolved via the Argument Parsing section above), code implementation for each plan unit is delegated to the Codex CLI (`codex exec`) instead of being implemented directly. The current agent retains control of planning, review, git operations, and orchestration.

### Pre-Delegation Checks

Run these checks in order when `delegation_active` is true. If any check fails, fall back to standard mode for the remainder of the plan execution.

**1. Environment Guard**

Check whether the current agent is already running inside a Codex sandbox:

```bash
# If either variable is set, delegation would recurse or fail
test -n "$CODEX_SANDBOX" || test -n "$CODEX_SESSION_ID"
```

If inside a sandbox:
- If `delegation_source` is `argument` (user explicitly requested delegation): emit "Already inside Codex sandbox -- using standard mode." and set `delegation_active` to false.
- If `delegation_source` is `local.md` or `default` (delegation enabled implicitly): set `delegation_active` to false silently -- no notification.

**2. Availability Check**

```bash
command -v codex
```

If the Codex CLI is not on PATH: emit "Codex CLI not found -- using standard mode." and set `delegation_active` to false.

**3. Consent Flow**

If `consent_granted` is not true (from local.md `work_codex_consent`):

Present a one-time consent warning using the platform's blocking question tool (AskUserQuestion in Claude Code, request_user_input in Codex, ask_user in Gemini). If no question tool is available, present numbered options and wait for the user's reply before proceeding.

The consent warning explains:
- Delegation sends each implementation unit to `codex exec` as a structured prompt
- **yolo mode** (`--yolo` / `--dangerously-bypass-approvals-and-sandbox`): Full system access including network. Required for verification steps that run tests or install dependencies. **Recommended.**
- **full-auto mode** (`--full-auto`): Workspace-write sandbox, no network access. Tests and installs that need network will fail. Suitable for pure code-writing tasks without verification dependencies.

Present the sandbox mode choice: (1) yolo (recommended), (2) full-auto.

On acceptance:
- Write `work_codex_consent: true` and `work_codex_sandbox: <chosen-mode>` to `.claude/compound-engineering.local.md` YAML frontmatter
- To write local.md: (1) if file does not exist, create it with YAML frontmatter wrapper; (2) if file exists with valid frontmatter, merge new keys preserving existing keys; (3) if file exists without frontmatter or with malformed frontmatter, prepend a valid frontmatter block and preserve existing body content below the closing `---`
- Update `consent_granted` and `sandbox_mode` in the resolved state

On decline:
- Ask whether to disable delegation entirely for this project
- If yes: write `work_delegate: false` to local.md, set `delegation_active` to false, proceed in standard mode
- If no: set `delegation_active` to false for this invocation only, proceed in standard mode

**Headless consent:** If running in a headless or non-interactive context, delegation proceeds only if `work_codex_consent` is already `true` in local.md. If consent is not recorded, set `delegation_active` to false silently. Headless runs never prompt for consent and never silently escalate to unsandboxed mode without prior interactive consent.

### Prompt Template

Before each delegated unit, write a prompt file to `.context/compound-engineering/codex-delegation/prompt-<unit-id>.md`. Create the directory if it does not exist.

Build the prompt from the plan's implementation unit using these XML-tagged sections:

```xml
<task>
[Goal from the implementation unit. State the concrete job, the relevant
repository context, and the expected end state.]
</task>

<files>
[File list from the implementation unit -- files to create, modify, or read.]
</files>

<patterns>
[File paths from the unit's "Patterns to follow" field. List the paths so
Codex can read them for reference. If the unit has no patterns, note:
"No explicit patterns referenced -- follow existing conventions in the
modified files."]
</patterns>

<approach>
[Approach from the implementation unit. Key design or sequencing decisions.]
</approach>

<constraints>
- Do NOT run git commit, git push, or create PRs -- the orchestrating agent handles all git operations
- Restrict all modifications to files within the repository root
- Keep changes tightly scoped to the stated task -- avoid unrelated refactors, renames, or cleanup
- If you discover mid-execution that you need to modify files outside the repo root, complete what you can within the repo and report what you could not do via the result schema issues field
- You MUST fill in the result schema honestly: status "completed" only if all changes were made, "partial" if incomplete, "failed" if no meaningful progress
</constraints>

<verify>
[Test and lint commands from the project. Examples: bun test, npm test,
bin/rails test, etc. If the unit specifies verification commands, use those.
If none are specified: "Run any available test suite or lint command to
verify changes."]
</verify>

<output_contract>
Report your result via the --output-schema mechanism. Fill in every field:
- status: "completed" | "partial" | "failed"
- files_modified: array of file paths you changed
- issues: array of strings describing any problems, gaps, or out-of-scope
  work discovered
- summary: one-paragraph description of what was done
</output_contract>

<completeness_contract>
Resolve the task fully before stopping.
Do not stop at the first plausible answer.
Check whether there are follow-on fixes, edge cases, or cleanup needed
for a correct result.
</completeness_contract>

<action_safety>
Keep changes tightly scoped to the stated task.
Avoid unrelated refactors, renames, or cleanup unless they are required
for correctness.
Call out any risky or irreversible action before taking it.
</action_safety>
```

### Result Schema

Write the result schema to `.context/compound-engineering/codex-delegation/result-schema.json` once at the start of delegated execution (reused across all units):

```json
{
  "type": "object",
  "properties": {
    "status": { "enum": ["completed", "partial", "failed"] },
    "files_modified": { "type": "array", "items": { "type": "string" } },
    "issues": { "type": "array", "items": { "type": "string" } },
    "summary": { "type": "string" }
  },
  "required": ["status", "files_modified", "issues", "summary"],
  "additionalProperties": false
}
```

Each unit's result is written to `.context/compound-engineering/codex-delegation/result-<unit-id>.json` via the `-o` flag. Both prompt and result files are cleaned up after each successful unit. On failure, leave files in place for debugging.

**Known limitation:** `--output-schema` only works with `gpt-5` family models (e.g., `o4-mini`, `gpt-5.4`), not `gpt-5-codex` or `codex-` prefixed models (Codex CLI bug #4181). If the result JSON is absent or malformed after a successful exit code, classify as task failure.

### Execution Loop

This loop replaces the "implement following existing conventions" step in Phase 2 for each unit when delegation is active. Initialize a `consecutive_failures` counter at 0 before the first delegated unit.

**Clean-baseline preflight:** Before the first delegated unit, verify the working tree is clean:

```bash
test -z "$(git status --short)"
```

If dirty, stop and present options using the platform's blocking question tool: (1) commit current changes, (2) stash explicitly (`git stash push -m "pre-delegation"`), (3) continue in standard mode (sets `delegation_active` to false). Do not auto-stash user changes.

**Per-unit eligibility check:** Before delegating each unit, assess eligibility:
- If the unit requires modifications outside the repository root -> execute locally in standard mode, state: "Unit <id> requires out-of-repo changes -- executing locally."
- If the unit is trivially small (single-file config change, simple substitution where delegation overhead exceeds the work) -> execute locally in standard mode, state: "Unit <id> is trivial -- executing locally."
- Otherwise -> delegate to Codex.

State the execution mode (delegated or local) for each unit before execution.

**Delegation invocation:** For each eligible unit:

1. Write the prompt file using the Prompt Template above
2. Execute the Codex CLI verbatim:

```bash
# Resolve sandbox flag from settings
if [ "$SANDBOX_MODE" = "full-auto" ]; then
  SANDBOX_FLAG="--full-auto"
else
  SANDBOX_FLAG="--yolo"
fi

codex exec \
  $SANDBOX_FLAG \
  --output-schema .context/compound-engineering/codex-delegation/result-schema.json \
  -o .context/compound-engineering/codex-delegation/result-<unit-id>.json \
  - < .context/compound-engineering/codex-delegation/prompt-<unit-id>.md
```

Do not improvise CLI flags or modify this invocation template.

**Result classification:** After `codex exec` returns, classify using multiple signals:

| # | Signal | Classification | Action |
|---|--------|---------------|--------|
| 1 | Exit code != 0 | CLI failure | Rollback current unit to HEAD. Hard fall back to standard mode for ALL remaining units. |
| 2 | Exit code 0, result JSON missing or malformed | Task failure | Rollback current unit to HEAD. Increment `consecutive_failures`. |
| 3 | Exit code 0, `status: "failed"` | Task failure | Rollback current unit to HEAD. Increment `consecutive_failures`. |
| 4 | Exit code 0, `status: "partial"` | Partial success | Keep the diff. Switch to local completion for this same unit -- finish the work, verify, and commit before moving on. Increment `consecutive_failures`. |
| 5 | Exit code 0, `status: "completed"`, VERIFY fails | Verify failure | Rollback current unit to HEAD. Increment `consecutive_failures`. |
| 6 | Exit code 0, `status: "completed"`, VERIFY passes | Success | Commit changes. Reset `consecutive_failures` to 0. Clean up prompt and result files. |

**Rollback procedure:** Rollback restores the working tree to HEAD:

```bash
git checkout -- . && git clean -fd
```

This is safe because delegated mode starts from a clean baseline and never auto-stashes user-owned local changes.

**Commit on success:** After each successful unit, commit the changes immediately:

```bash
git add <files from result's files_modified>
git commit -m "feat(<scope>): <unit goal summary>"
```

This enforces a clean working tree for the next unit.

**Partial success handling:** When `status: "partial"`:
1. Keep Codex's diff in place
2. Read the result's `issues` field to understand gaps
3. Complete the remaining work for this same unit locally in standard mode
4. Run VERIFY commands
5. If local completion succeeds: commit all changes for this unit, clean up scratch files
6. If local completion fails: rollback the entire unit to HEAD
7. Do not advance to the next unit until the current unit is fully committed or rolled back

**Circuit breaker:** After 3 consecutive failures (`consecutive_failures >= 3`), set `delegation_active` to false and emit: "Codex delegation disabled after 3 consecutive failures -- completing remaining units in standard mode." A successful delegation resets the counter to 0. The counter persists across units within a single plan execution because repeated failures are likely environmental (codex auth, model issues), not unit-specific.

### Mixed-Model Attribution

When some units are executed by Codex and others locally, the PR attribution in Phase 4 should credit both models:
- If all units used delegation: attribute to the Codex model
- If all units used standard mode: attribute to the current agent's model
- If mixed: note which units were delegated in the PR description and credit both models

---

## Swarm Mode with Agent Teams (Optional)

For genuinely large plans where agents need to communicate with each other, challenge approaches, or coordinate across 10+ tasks with persistent specialized roles, use agent team capabilities if available (e.g., Agent Teams in Claude Code, multi-agent workflows in Codex).

**Agent teams are typically experimental and require opt-in.** Do not attempt to use agent teams unless the user explicitly requests swarm mode or agent teams, and the platform supports it.

**Mutual exclusion with delegation mode:** Delegation mode and swarm mode are mutually exclusive. When `delegation_active` is true, serial execution is enforced and swarm mode is unavailable -- even if the user or a calling skill requests swarm mode. Delegation takes precedence because it requires serial execution (each unit must start from a clean working tree). If swarm mode would otherwise activate but delegation is on, emit: "Delegation mode active -- serial execution enforced, swarm mode unavailable."

### When to Use Agent Teams vs Subagents

| Agent Teams | Subagents (standard mode) |
|-------------|---------------------------|
| Agents need to discuss and challenge each other's approaches | Each task is independent — only the result matters |
| Persistent specialized roles (e.g., dedicated tester running continuously) | Workers report back and finish |
| 10+ tasks with complex cross-cutting coordination | 3-8 tasks with clear dependency chains |
| User explicitly requests "swarm mode" or "agent teams" | Default for most plans |

Most plans should use subagent dispatch from standard mode. Agent teams add significant token cost and coordination overhead — use them when the inter-agent communication genuinely improves the outcome.

### Agent Teams Workflow

1. **Create team** — use your available team creation mechanism
2. **Create task list** — parse Implementation Units into tasks with dependency relationships
3. **Spawn teammates** — assign specialized roles (implementer, tester, reviewer) based on the plan's needs. Give each teammate the plan file path and their specific task assignments
4. **Coordinate** — the lead monitors task completion, reassigns work if someone gets stuck, and spawns additional workers as phases unblock
5. **Cleanup** — shut down all teammates, then clean up the team resources

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
- Review every change — inline for simple additive work, full review for everything else

### Ship Complete Features

- Mark all tasks completed before moving on
- Don't leave features 80% done
- A finished feature that ships beats a perfect feature that doesn't

## Quality Checklist

Before creating PR, verify:

- [ ] All clarifying questions asked and answered
- [ ] All tasks marked completed
- [ ] Testing addressed -- tests pass AND new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)
- [ ] Linting passes (use linting-agent)
- [ ] Code follows existing patterns
- [ ] Figma designs match implementation (if applicable)
- [ ] Before/after screenshots captured and uploaded (for UI changes)
- [ ] Commit messages follow conventional format
- [ ] PR description includes Post-Deploy Monitoring & Validation section (or explicit no-impact rationale)
- [ ] Code review completed (inline self-review or full `ce:review`)
- [ ] PR description includes summary, testing notes, and screenshots
- [ ] PR description includes Compound Engineered badge with accurate model and harness

## Code Review Tiers

Every change gets reviewed. The tier determines depth, not whether review happens.

**Tier 2 (full review)** — REQUIRED default. Invoke `ce:review mode:autofix` with `plan:<path>` when available. Safe fixes are applied automatically; residual work surfaces as todos. Always use this tier unless all four Tier 1 criteria are explicitly confirmed.

**Tier 1 (inline self-review)** — permitted only when all four are true (state each explicitly before choosing):
- Purely additive (new files only, no existing behavior modified)
- Single concern (one skill, one component — not cross-cutting)
- Pattern-following (mirrors an existing example, no novel logic)
- Plan-faithful (no scope growth, no surprising deferred-question resolutions)

## Common Pitfalls to Avoid

- **Analysis paralysis** - Don't overthink, read the plan and execute
- **Skipping clarifying questions** - Ask now, not after building wrong thing
- **Ignoring plan references** - The plan has links for a reason
- **Testing at the end** - Test continuously or suffer later
- **Forgetting to track progress** - Update task status as you go or lose track of what's done
- **80% done syndrome** - Finish the feature, don't move on early
- **Skipping review** - Every change gets reviewed; only the depth varies
