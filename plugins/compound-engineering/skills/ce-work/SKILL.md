---
name: ce-work
description: Execute work efficiently while maintaining quality and finishing features
argument-hint: "[Plan doc path or description of work. Blank to auto use latest plan doc] [delegate:codex]"
---

# Work Execution Command

## Introduction

Takes a work document (plan or specification) or a bare prompt describing the work, and executes it systematically. The focus is **shipping complete features**: understand requirements quickly, follow existing patterns, hold quality throughout.

## Input Document

<input_document> #$ARGUMENTS </input_document>

## Argument Parsing

Parse `$ARGUMENTS` for the optional tokens below. Strip each recognized token before interpreting the remainder as the plan file path or bare prompt. When absent, fall back to the resolution chain below.

| Token | Example | Effect |
|-------|---------|--------|
| `delegate:codex` | `delegate:codex` | Activate Codex delegation mode for plan execution |
| `delegate:local` | `delegate:local` | Deactivate delegation even if enabled in config |

**Fuzzy activation:** Also recognize imperative delegation-intent phrases ("use codex", "delegate to codex", "codex mode", "delegate mode") as equivalent to `delegate:codex`. A bare mention of "codex" (e.g., "fix codex converter bugs") must NOT activate delegation; only clear delegation intent triggers it.

**Fuzzy deactivation:** Also recognize "no codex", "local mode", "standard mode" as equivalent to `delegate:local`.

### Settings Resolution Chain

After extracting tokens, resolve the delegation state by this precedence:

1. **Argument flag** -- `delegate:codex` or `delegate:local` from the current invocation (highest priority)
2. **Config file** -- settings from the config block below. `work_delegate: codex` activates delegation; `false` deactivates.
3. **Hard default** -- `false` (delegation off)

**Config (pre-resolved):**
!`cat "$(git rev-parse --show-toplevel 2>/dev/null)/.compound-engineering/config.local.yaml" 2>/dev/null || echo '__NO_CONFIG__'`

If the block above contains YAML key-value pairs, extract values for the keys below.
If it shows `__NO_CONFIG__`, the file does not exist; all settings fall through to defaults.
If it shows an unresolved command string, read `.compound-engineering/config.local.yaml` from the repo root via the native file-read tool (Read in Claude Code, read_file in Codex). Missing file means all settings fall through to defaults.

An unrecognized value falls through to that setting's hard default. For optional settings without a hard default (`work_delegate_model`, `work_delegate_effort`), an unrecognized or unparseable value resolves to **unset**: its flag is omitted from `codex exec` so Codex resolves from `~/.codex/config.toml`. Never substitute an invalid value into the CLI flags.

Config keys:
- `work_delegate` -- `codex` or default `false`
- `work_delegate_consent` -- `true` or default `false`
- `work_delegate_sandbox` -- `yolo` (default) or `full-auto`
- `work_delegate_decision` -- `auto` (default) or `ask`
- `work_delegate_model` -- Codex model. Optional; passthrough (any non-empty string is valid). Unset on YAML parse failure or empty value, deferring to `~/.codex/config.toml`.
- `work_delegate_effort` -- one of `minimal`, `low`, `medium`, `high`, `xhigh`. Optional; a value outside this enum resolves to unset, deferring to `~/.codex/config.toml`.

Store the resolved state for downstream consumption:
- `delegation_active` -- boolean, whether delegation mode is on
- `delegation_source` -- `argument`, `config`, or `default`; how delegation was resolved (the environment guard uses it for notification verbosity)
- `sandbox_mode` -- `yolo` or `full-auto` (config or default `yolo`)
- `consent_granted` -- boolean (config `work_delegate_consent`)
- `delegate_model` -- string from config, or unset (defer to Codex config)
- `delegate_effort` -- string from config, or unset (defer to Codex config). Floor for per-batch effort selection; not passed directly to `codex exec`.
- `effective_effort` -- per-batch derived value (`default | medium | high | xhigh`), computed before each batch from `delegate_effort` and the picked level per `references/codex-delegation-workflow.md` ("Per-Batch Effort"). Feeds `codex exec` in place of `delegate_effort`.

---

## Execution Workflow

### Phase 0: Input Triage

Determine how to proceed based on what was provided in `<input_document>`.

**Plan document** (input is a file path to an existing plan or specification): read the plan's metadata first (YAML frontmatter for a markdown plan, or the visible header text for an HTML plan; both formats carry the same fields). If it carries `execution: knowledge-work`, this is a **non-code plan**: read `references/non-code-execution.md` and follow that carve-out instead of the rest of this workflow. Otherwise (field absent or `execution: code`), skip to Phase 1 and run the normal code lifecycle. The marker check lives here, inside plan-document handling, because detecting it requires already having a file; "Bare prompt" below is unaffected.

**Bare prompt** (input is a description of work, not a file path):

1. **Scan the work area**

   - Identify files likely to change from the prompt
   - Find existing test files for those areas (test/spec files that import, reference, or share names with the implementation files)
   - Note local patterns and conventions in the affected areas

2. **Assess complexity and route**

   | Complexity | Signals | Action |
   |-----------|---------|--------|
   | **Trivial** | 1-2 files, no behavioral change (typo, config, rename) | Proceed to Phase 1 step 2 (environment setup), then implement directly; no task list, no execution loop. Apply Test Discovery if the change touches behavior-bearing code |
   | **Small / Medium** | Clear scope, under ~10 files | Build a task list from discovery. Proceed to Phase 1 step 2 |
   | **Large** | Cross-cutting, architectural decisions, 10+ files, touches auth/payments/migrations | Tell the user this would benefit from `/ce-brainstorm` or `/ce-plan` to surface edge cases and scope boundaries. Honor their choice. If proceeding, build a task list and continue to Phase 1 step 2 |

---

### Phase 1: Quick Start

1. **Read Plan and Clarify** _(skip if arriving from Phase 0 with a bare prompt)_

   - Read the work document completely. Plans may be markdown (`.md`) or HTML (`.html`); both are read as text linearly. HTML plans carry the same section names and IDs as markdown plans, wrapped in semantic HTML elements (`<section>`, `<article>`, etc.); section-finding is the same (substring match on section names, ignoring HTML wrapper noise).
   - When auto-detecting the latest plan (blank invocation), glob `docs/plans/*.md` AND `docs/plans/*.html` and pick the most recent regardless of extension.
   - Treat the plan as a decision artifact, not an execution script
   - When the plan includes sections such as `Implementation Units`, `Work Breakdown`, `Requirements` (or legacy `Requirements Trace`), `Files`, `Test Scenarios`, or `Verification`, use those as the primary source material for execution
   - Check each implementation unit for `Execution note` (the plan's execution-posture signal for that unit, e.g. test-first or characterization-first) and note them when creating tasks
   - Check for a `Deferred to Implementation` or `Implementation-Time Unknowns` section: questions the planner left for you to resolve during execution. Note them before starting so they inform your approach rather than surprising you mid-task
   - Check for a `Scope Boundaries` section (explicit non-goals); refer back to it if implementation starts pulling toward adjacent work
   - Review any references or links in the plan
   - If the user explicitly asks for TDD, test-first, or characterization-first execution this session, honor it even when the plan has no `Execution note`
   - If anything is unclear, ask clarifying questions now, then get user approval on the resolved answers. If no clarifications were needed, proceed without a separate approval step: plan scope is the plan's authority, not something to renegotiate
   - **Do not skip this** - asking now beats building the wrong thing
   - **Do not edit the plan body during execution.** The plan is a decision artifact; progress lives in git commits and the task tracker. The only plan mutation during ce-work is the final `status: active → completed` flip at shipping (see `references/shipping-workflow.md` Phase 4 Step 2). Ignore legacy `- [ ]` / `- [x]` marks on unit headings as state; per-unit completion is determined during execution by reading the current file state.

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

   Check whether the branch name is **meaningful**: `feat/crowd-sniff` or `fix/email-validation` tells future readers what the work is; auto-generated worktree names (e.g., `worktree-jolly-beaming-raven`) and other opaque names do not.

   If the name is meaningless or auto-generated, suggest renaming before continuing, deriving the new name from the plan title or work description:
   ```bash
   git branch -m <meaningful-name>
   ```
   Present the rename as a recommended option alongside continuing as-is.

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
   skill: ce-worktree
   # The skill will create a new branch from the default branch in an isolated worktree
   ```

   **Option C: Continue on the default branch**
   - Requires explicit user confirmation: proceed only after the user says "yes, commit to [default_branch]". Never commit directly to the default branch without explicit permission.

   **Recommendation**: use a worktree for working on multiple features at once, keeping the default branch clean while experimenting, or frequent branch switching.

3. **Create Task List** _(skip if Phase 0 already built one, or routed as Trivial)_
   - Use the platform's task-tracking tool (`TaskCreate`/`TaskUpdate`/`TaskList` in Claude Code, `update_plan` in Codex, or the equivalent) to break the plan into actionable tasks
   - Derive tasks from the plan's implementation units, dependencies, files, test targets, and verification criteria
   - When the plan defines U-IDs for Implementation Units, prefix the task subject with the unit's U-ID (e.g., "U3: Add parser coverage"). This anchors blocker references, deferred-work notes, and final summaries to the plan's identifier, keeping traceability unambiguous across plan edits
   - Carry each unit's `Execution note` into the task when present
   - For each unit, read the `Patterns to follow` field before implementing (specific files or conventions to mirror)
   - Use each unit's `Verification` field as that task's primary "done" signal
   - Do not expect the plan to contain implementation code, micro-step TDD instructions, or exact shell commands
   - Include inter-task dependencies and testing/quality-check tasks; prioritize by what comes first; keep tasks specific and completable

4. **Choose Execution Strategy**

   **Delegation routing gate:** If `delegation_active` is true AND the input is a plan file (not a bare prompt), read `references/codex-delegation-workflow.md` and follow its Pre-Delegation Checks and Delegation Decision flow. If all checks pass and delegation proceeds, force **serial execution** and go directly to Phase 2 using the workflow's batched execution loop. If any check disables delegation, fall through to the standard strategy table below. If delegation is active but the input is a bare prompt (no plan file), set `delegation_active` to false with the note "Codex delegation requires a plan file -- using standard mode." and continue with the standard strategy selection below.

   After creating the task list, decide how to execute based on the plan's size and dependency structure:

   | Strategy | When to use |
   |----------|-------------|
   | **Inline** | 1-2 small tasks, or tasks needing mid-flight user interaction. **Default for bare-prompt work** (bare prompts rarely produce enough structured context to justify subagent dispatch) |
   | **Serial subagents** | 3+ tasks with dependencies. Each subagent gets a fresh context window on one unit, preventing context degradation across many tasks. Requires plan-unit metadata (Goal, Files, Approach, Test scenarios) |
   | **Parallel subagents** | 3+ tasks that pass the Parallel Safety Check (below). Dispatch independent units simultaneously; run dependent units after their prerequisites. Requires plan-unit metadata |

   **Parallel Safety Check** -- required before choosing parallel dispatch:

   1. Build a file-to-unit mapping from every candidate unit's `Files:` section (Create, Modify, Test paths)
   2. Any file path appearing in 2+ units is an overlap
   3. **Overlap AND worktree isolation unavailable**: downgrade to serial subagents, logging the reason (e.g., "Units 2 and 4 share `config/routes.rb` -- serial dispatch"). Serial still gives context-window isolation without shared-directory write races.
   4. **Overlap AND worktree isolation available**: parallel is still safe; subagents work in isolation and the overlap surfaces as a predictable merge conflict the post-batch flow below handles. Log the predicted overlap so that flow knows which merges to expect conflicts on.

   Even with no file overlap, parallel subagents sharing the orchestrator's working directory face git index contention (concurrent staging/committing corrupts the index) and test interference (concurrent runs pick up each other's in-progress changes). Worktree isolation eliminates both; the shared-directory fallback constraints below mitigate them.

   **Subagent isolation** -- give each parallel subagent its own working tree:
   - **Claude Code (`Agent` tool):** pass `isolation: "worktree"` and `run_in_background: true`. The harness creates a per-subagent worktree under `.claude/worktrees/agent-<id>` on its own branch. Verify `.claude/worktrees/` is gitignored first.
   - **Other platforms** without built-in worktree isolation (e.g., Codex `spawn_agent`, Pi `subagent`): subagents share the orchestrator's directory.

   **Subagent dispatch** uses your available subagent/task spawning mechanism. Give each subagent:
   - The full plan file path (for context)
   - The unit's Goal, Files, Approach, Execution note, Patterns, Test scenarios, Verification
   - Any resolved deferred questions relevant to that unit
   - Instruction to check whether the unit's test scenarios cover all applicable categories (happy paths, edge cases, error paths, integration) and supplement gaps before writing tests

   **Shared-directory fallback constraints** -- apply only when worktree isolation is unavailable:
   - Instruct each subagent: "Do not stage files (`git add`), create commits, or run the project test suite. The orchestrator handles testing, staging, and committing after all parallel units complete." This prevents git index contention and test interference between concurrent subagents.
   - With worktree isolation active, omit these constraints; subagents may stage, commit, and run their unit's tests within their own worktree branch.

   **Permission mode:** Omit the `mode` parameter when dispatching subagents so the user's configured permission settings apply. Do not pass `mode: "auto"`; it overrides user-level settings like `bypassPermissions`.

   **After each subagent completes (serial mode):**
   1. Review the diff: verify changes match the unit's scope and `Files:` list
   2. Run the relevant test suite to confirm the tree is healthy
   3. If tests fail, diagnose and fix before proceeding; do not dispatch dependent units on a broken tree
   4. Update the task list (do not edit the plan body; progress is carried by the commit)
   5. Dispatch the next unit

   **After all parallel subagents in a batch complete (worktree-isolated mode):**
   1. Wait for every subagent in the batch to finish.
   2. For each completed subagent, in dependency order: review the worktree's diff against the orchestrator's branch. If the subagent did not commit its own work, stage and commit it inside that worktree.
   3. Merge each subagent's branch into the orchestrator's branch sequentially in dependency order. **On a merge conflict, abort (`git merge --abort`) and re-dispatch the conflicting unit serially against the now-merged tree**; hand-resolving silently picks a side and discards one unit's intent. (Predicted overlap from the Parallel Safety Check surfaces here as a conflict, not silent data loss as in shared-directory mode.)
   4. After each merge, run the relevant test suite. If tests fail, diagnose and fix before merging the next branch.
   5. Update the task list (progress is carried by the merge commits).
   6. After merging, remove each subagent's worktree and delete its branch, using the absolute path and branch name from the subagent's result:
      - Unlock first (the harness locks per-subagent worktrees): `git worktree unlock <absolute-path>`
      - Remove: `git worktree remove <absolute-path>`
      - Delete branch: `git branch -d <branch-name>`. The branch outlives the worktree and accumulates as orphans otherwise; lowercase `-d` refuses unmerged branches, which is the safety we want. If it fails, investigate before forcing.
   7. Dispatch the next batch of independent units, or the next dependent unit.

   **After all parallel subagents in a batch complete (shared-directory fallback):**
   1. Wait for every subagent in the batch to finish before acting on any result
   2. Cross-check for discovered file collisions: compare the files actually modified by all subagents (not just declared `Files:` lists). Subagents may touch files not anticipated during planning; plans describe *what*, not *how*. A collision matters only when 2+ subagents modified the same file: in a shared directory only the last writer survives, losing the other unit's changes. On a collision, commit all non-colliding files from all units first, then re-run the affected units serially for the shared file so each builds on the other's committed work
   3. For each completed unit, in dependency order: review the diff, run the relevant test suite, stage only that unit's files, commit with a conventional message from the unit's Goal
   4. If tests fail after committing a unit, diagnose and fix before committing the next unit
   5. Update the task list (do not edit the plan body; progress is carried by the commits just made)
   6. Dispatch the next batch of independent units, or the next dependent unit

### Phase 2: Execute

1. **Task Execution Loop**

   **Delegation mode bypass:** If `delegation_active` is true, execute the Codex Delegation Execution Loop from `references/codex-delegation-workflow.md` now; all tasks are processed there as one or more batches. Skip the per-task loop below and return here for Phase 3 after the delegation loop completes.

   For each task in priority order:

   ```
   while (tasks remain):
     - Mark task as in-progress
     - Read any referenced files from the plan or discovered during Phase 0
     - **If the unit's work is already present and matches the plan's intent** (files exist with the expected capability, or the unit's `Verification` criteria are already satisfied by the current code), the work has likely shipped on a prior branch or session. Verify it matches, mark the task complete, and move on. Do not silently reimplement.
     - Look for similar patterns in codebase
     - Find existing test files for implementation files being changed (Test Discovery, see below)
     - Implement following existing conventions
     - Add, update, or remove tests to match implementation changes (see Test Discovery below)
     - Run System-Wide Test Check (see below)
     - Run tests after changes
     - Assess testing coverage: did this task change behavior? If yes, were tests written or updated? If no tests were added, is the justification deliberate (e.g., pure config, no behavioral change)?
     - Mark task as completed
     - Evaluate for incremental commit (see below)
   ```

   When a unit carries an `Execution note`, honor it: for test-first units, write the failing test before implementation; for characterization-first units, capture existing behavior before changing it. Without an `Execution note`, proceed pragmatically.

   Guardrails for execution posture:
   - When test-first, do not write test and implementation in the same step, do not skip verifying the new test fails before implementing, and do not over-implement beyond the current behavior slice
   - Skip test-first discipline for trivial renames, pure configuration, and pure styling work

   **Test Discovery** -- Before changing a file, find its existing test files (search for test/spec files that import, reference, or share naming with the implementation file). When a plan specifies test scenarios or files, start there, then check for additional coverage the plan may not have enumerated. Accompany implementation changes with corresponding test updates: new tests for new behavior, modified for changed behavior, removed or updated for deleted behavior.

   **Test Scenario Completeness** -- Before writing tests for a feature-bearing unit, check whether the plan's `Test scenarios` cover all applicable categories. If a category is missing or scenarios are vague (e.g., "validates correctly" without naming inputs and expected outcomes), supplement from the unit's context before writing tests:

   | Category | When it applies | How to derive if missing |
   |----------|----------------|------------------------|
   | **Happy path** | Always for feature-bearing units | Read the unit's Goal and Approach for core input/output pairs |
   | **Edge cases** | When the unit has meaningful boundaries (inputs, state, concurrency) | Identify boundary values, empty/nil inputs, and concurrent access patterns |
   | **Error/failure paths** | When the unit has failure modes (validation, external calls, permissions) | Enumerate invalid inputs the unit should reject, permission/auth denials it should enforce, and downstream failures it should handle |
   | **Integration** | When the unit crosses layers (callbacks, middleware, multi-service) | Identify the cross-layer chain and write a scenario that exercises it without mocks |

   **System-Wide Test Check** -- Before marking a task done, pause and ask:

   | Question | What to do |
   |----------|------------|
   | **What fires when this runs?** Callbacks, middleware, observers, event handlers; trace two levels out from your change. | Read the actual code (not docs) for callbacks on models you touch, middleware in the request chain, `after_*` hooks. |
   | **Do my tests exercise the real chain?** If every dependency is mocked, the test proves your logic in *isolation* and says nothing about the interaction. | Write at least one integration test using real objects through the full callback/middleware chain. No mocks for the interacting layers. |
   | **Can failure leave orphaned state?** If code persists state (DB row, cache, file) before calling an external service, what happens when the service fails? Does retry duplicate? | Trace the failure path with real objects. If state is created before the risky call, test that failure cleans up or that retry is idempotent. |
   | **What other interfaces expose this?** Mixins, DSLs, alternative entry points (Agent vs Chat vs ChatMethods). | Grep for the method/behavior in related classes. If parity is needed, add it now, not as a follow-up. |
   | **Do error strategies align across layers?** Retry middleware, application fallback, framework error handling: do they conflict or double-execute? | List the specific error classes at each layer. Verify your rescue list matches what the lower layer actually raises. |

   **When to skip:** leaf-node changes with no callbacks, no state persistence, no parallel interfaces. Purely additive changes (new helper, new view partial) take 10 seconds: "nothing fires, skip."

   **When this matters most:** changes touching models with callbacks, error handling with fallback/retry, or functionality exposed through multiple interfaces.


2. **Incremental Commits**

   After completing each task, evaluate whether to create an incremental commit:

   | Commit when... | Don't commit when... |
   |----------------|---------------------|
   | Logical unit complete (model, service, component) | Small part of a larger unit |
   | Tests pass + meaningful progress | Tests failing |
   | About to switch contexts (backend -> frontend) | Purely scaffolding with no behavior |
   | About to attempt risky/uncertain changes | Would need a "WIP" commit message |

   **Heuristic:** "Can I write a commit message describing a complete, valuable change? If yes, commit. If the message would be 'WIP' or 'partial X', wait."

   If the plan has Implementation Units, use them as a starting guide for commit boundaries, adapting to what you find. A unit might need multiple commits if larger than expected; small related units might land together. Use each unit's Goal for the commit message.

   **Commit workflow:**
   ```bash
   # 1. Verify tests pass (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # 2. Stage only files for this logical unit (not `git add .`)
   git add <files related to this logical unit>

   # 3. Commit with conventional message
   git commit -m "feat(scope): description of this unit"
   ```

   **Merge conflicts:** resolve immediately during rebase/merge. Small, focused incremental commits make resolution easier.

   **Note:** Incremental commits use clean conventional messages without attribution footers. The final Phase 4 commit/PR includes full attribution.

   **Parallel subagent mode:** commit ownership splits by isolation mode (see Phase 1 Step 4):
   - **Worktree-isolated:** subagents may stage and commit inside their own worktree branch; the orchestrator merges those branches in dependency order after the batch.
   - **Shared-directory fallback:** subagents do not commit; the orchestrator stages and commits each unit after the entire parallel batch completes.

3. **Follow Existing Patterns**

   - The plan should reference similar code; read those files first
   - Match naming conventions exactly; reuse existing components where possible
   - Follow project coding standards (see AGENTS.md; use CLAUDE.md only if the repo keeps a compatibility shim)
   - When in doubt, grep for similar implementations

4. **Test Continuously**

   - Run relevant tests after each significant change; don't wait until the end; fix failures immediately
   - Add tests for new behavior, update for changed, remove for deleted
   - **Unit tests with mocks prove logic in isolation; integration tests with real objects prove the layers work together.** Changes touching callbacks, middleware, or error handling need both.

5. **Simplify as You Go**

   After a cluster of related implementation units (or every 2-3 units), review recently changed files for simplification: consolidate duplicated patterns, extract shared helpers, improve reuse and efficiency. This matters most with subagents, since each works with isolated context and can't see patterns emerging across units.

   Don't simplify after every single unit; early patterns may look duplicated but diverge intentionally later. Wait for a natural phase boundary or accumulated complexity.

   If **`ce-simplify-code`** is available, invoke it at phase boundaries (especially before Phase 3 when the diff is >=30 lines). Otherwise review the changed files yourself for reuse and consolidation.

6. **Figma Design Sync** (if applicable)

   For UI work with Figma designs:

   - Implement components following design specs
   - Capture the Figma reference, then drive the agent-browser CLI (`agent-browser open <url>`, `agent-browser screenshot`) to capture the implementation and compare against the design screenshot
   - Fix identified visual differences and repeat until implementation matches. The `ce-frontend-design` skill (next step) covers the same detection and verification flow when no Figma reference exists

7. **Frontend Design Guidance** (if applicable)

   For UI tasks without a Figma design -- the implementation touches view, template, component, layout, or page files, creates user-visible routes, or the plan carries explicit UI/frontend/design language:

   - Load the `ce-frontend-design` skill before implementing and follow its detection, guidance, and verification flow
   - A verification screenshot from the skill satisfies Phase 4's screenshot requirement (no separate capture). If the skill fell back to mental review (no browser access), Phase 4's screenshot capture still applies

8. **Track Progress**
   - Keep the task list updated; note blockers or unexpected discoveries; create new tasks if scope expands; keep the user informed of major milestones
   - When the plan defines U-IDs for Implementation Units, or the plan or origin document carries stable R-IDs (and optionally A/F/AE IDs), reference them in blockers, deferred-work notes, task summaries, and final verification, not routine status updates. U-IDs anchor units across plan edits; R/A/F/AE anchor product intent across the brainstorm-plan handoff. Use the IDs the plan supplies; do not invent ones it does not. This preserves traceability without burying signal under noise.

### Phase 3-4: Quality Check and Finishing Work

When all Phase 2 tasks are complete and execution transitions to quality check, read `references/shipping-workflow.md` for the full shipping workflow. Do not skip this.

**Code review tiers:** Tier 1 when the harness has built-in review. Tier 2 only when escalation criteria in `shipping-workflow.md` match, not because Tier 1 is missing.

**Tier 2 is two steps, review then fix.** `ce-code-review` is review-only: it returns findings (markdown or `mode:agent` JSON) and never edits the checkout, commits, or applies fixes.

When Tier 2 applies:

1. **Review** -- Invoke the `ce-code-review` skill (invocation command in `references/review-findings-followup.md` § Fallback). Use `mode:agent` in orchestrated workflows; pass `plan:<path>` when you have a plan and `base:<ref>` when the merge base is known.
2. **Apply fixes** -- Load `references/review-findings-followup.md`. Filter eligibility on JSON only, **batch applicable findings by file**, dispatch fix subagents (parallel when file sets are disjoint). The orchestrator merges diffs, runs tests, and commits; it does not pre-investigate findings.
3. **Residual Work Gate** -- Only after followup; unresolved actionable findings go through the gate in `shipping-workflow.md`.

Tier 1 harness-native review may fix inline; Tier 2 always separates review from apply.

---

## Codex Delegation Mode

When `delegation_active` is true after argument parsing, read `references/codex-delegation-workflow.md` for the complete delegation workflow: pre-checks, batching, prompt template, execution loop, and result classification.

---

## Key Principles

### Start Fast, Execute Faster

- Get clarification once at the start, then execute; don't wait for perfect understanding
- The goal is to **finish the feature**, not perfect the process

### The Plan is Your Guide

- Work documents reference similar code and patterns; load those references and follow them
- Don't reinvent; match what exists

### Test As You Go

- Run tests after each change, not at the end; fix failures immediately
- Continuous testing prevents big surprises

### Quality is Built In

- Follow existing patterns; write tests for new code; run linting before pushing
- Review when Tier 1 is available or Tier 2 criteria match (see `shipping-workflow.md`)

### Ship Complete Features

- Mark all tasks completed before moving on; don't leave features 80% done
- A finished feature that ships beats a perfect feature that doesn't

## Common Pitfalls to Avoid

- **Analysis paralysis** - read the plan and execute
- **Skipping clarifying questions** - ask now, not after building the wrong thing
- **Ignoring plan references** - the plan has links for a reason
- **Testing at the end** - test continuously or suffer later
- **Forgetting to track progress** - update task status as you go
- **80% done syndrome** - finish the feature, don't move on early
- **Skipping review without reason** - use Tier 1 when available; escalate to Tier 2 only on criteria in `shipping-workflow.md`; document when both are skipped
- **Re-scoping the plan into human-time phases** - the plan's Implementation Units define execution scope. Do not estimate human-hours per unit, propose multi-day breakdowns, or ask the user to pick a subset of units for "this session". Agents execute at agent speed, and context-window pressure is handled by subagent dispatch (Phase 1 Step 4), not phased sessions. If a plan-file input is genuinely too large for one execution, say so plainly and suggest returning to `/ce-plan` to reduce scope; don't invent session phases. For bare-prompt input, Phase 0's Large routing already handles oversized work
