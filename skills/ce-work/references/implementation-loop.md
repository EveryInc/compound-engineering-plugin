# Implementation Loop

1. **Task Execution Loop**

For each task in priority order:

When the selected engine is cross-model execution, this loop still owns unit ordering, evidence selection, actual-scope inspection, authoritative verification, and incremental canonical commits, but worker authoring follows the serial external-unit protocol in `references/cross-model-execution.md`. Detached process completion is only authoring evidence; do not mark the task complete until the controller records the host-owned canonical commit. A preserved or restoration-blocked unit stops this loop before fallback, retry, or the next unit.

```
while (tasks remain):
  - Mark task as in-progress
  - Read any referenced files from the plan or discovered during Phase 0
  - **If the unit's work is already present and matches the plan's intent** (files exist with the expected capability, or the unit's `Verification` criteria are already satisfied by the current code), the work has likely shipped on a prior branch or session. Verify it matches, mark the task complete, and move on. Do not silently reimplement.
  - Look for similar patterns in codebase
  - Find existing test files for implementation files being changed (Test Discovery — see below)
  - Choose the evidence strategy for this task before changing behavior: use an existing failing test, update or strengthen an existing test, add a new failing test, add characterization coverage, or record a deliberate no-test exception with replacement verification
  - For behavior-bearing changes, default to test-first or characterization-first when the current code and test surface make that practical, even if the plan has no `Execution note`
  - When the evidence strategy calls for pre-implementation proof, create/update/strengthen the test or characterization coverage now and verify the expected failure or baseline capture before changing production code
  - Implement following existing conventions
  - Add, update, or remove any remaining tests needed to match implementation changes (see Test Discovery below)
  - Run System-Wide Test Check (see below)
  - Run tests after changes
  - Assess testing coverage: did this task change behavior? If yes, were existing tests inspected and were tests written, updated, strengthened, or deliberately left unchanged with a reason? If no tests were added or changed, is the justification deliberate (e.g., pure config, no behavioral change, manual-only surface) and paired with replacement verification?
  - Record verification evidence for the task: behavior-change signal, existing tests inspected, tests added/changed/used unchanged, red failure or characterization observed when applicable, verification run, and any exception reason
  - Mark task as completed
  - Evaluate for incremental commit (see below)
```

Batch independent reads within a task: the plan's referenced files, pattern searches, and test discovery don't depend on one another — request them all in one response rather than one per turn. Only the write-and-verify steps are inherently sequential.

For a parallel wave, the loop pauses at a host-owned integration stop after every canonical result. Inspect the actual result rather than its declared scope, re-run the independence judgment against the advancing tree, and recompute readiness from committed prerequisites. Affected dependents remain queued. An unaffected sibling may continue only after any failed apply or verification has been restored exactly and the prior integration lock released. Re-dispatch a stale or colliding result on the new base, resolve it explicitly, or finish it serially; never treat a conflict-free apply as semantic proof. Repeated collision or broad edits disable further parallel waves for the run.

When a unit carries an `Execution note`, honor its intent rather than matching a fixed vocabulary. For notes that ask for proof-first work, write or identify the relevant failing test before implementation for that unit. For notes that ask for characterization, capture existing behavior before changing it. For notes that point away from unit coverage, run the named replacement verification and record why ordinary tests were not the right proof. For units without an `Execution note`, make the same decision from code and test discovery: upgrade to proof-first or characterization-first when behavior changes and the seam is practical; proceed pragmatically only when the task is non-behavioral or the exception is deliberate.

Guardrails for execution evidence:
- Do not write the test and implementation in the same step when working proof-first
- Do not skip verifying that a new or changed test fails for the expected reason before implementing the fix or feature
- Do not over-implement beyond the current behavior slice when working proof-first
- Do not add a duplicate regression test when an existing test is the right home; update or strengthen that test instead, then observe the failure before changing code
- Skip proof-first discipline for trivial renames, pure configuration, pure styling, generated artifacts, and manual-only surfaces, but record the reason and replacement verification while continuing execution

**Test Discovery** — Before implementing changes to a file, find its existing test files (search for test/spec files that import, reference, or share naming patterns with the implementation file). When a plan specifies test scenarios or test files, start there, then check for additional test coverage the plan may not have enumerated. Changes to implementation files should be accompanied by corresponding test updates — new tests for new behavior, modified tests for changed behavior, removed or updated tests for deleted behavior.

**Evidence Strategy** — Test discovery decides where proof belongs:

| Situation | Action |
|-----------|--------|
| Existing test already fails for the intended behavior | Use that as the red evidence; do not add a duplicate test |
| Existing test covers the contract but asserts the old or wrong expectation | Update that test, run it, and verify the expected failure before implementation |
| Existing test is over-mocked or misses the real chain | Strengthen/refactor it narrowly, then verify it fails for the right reason |
| No existing test covers the behavior | Add the smallest focused failing test or characterization test that proves the behavior slice |
| Testing is inappropriate for the task | Record the no-test exception and replacement verification before marking the task complete |

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

# 3. Commit with conventional message, limited to those same paths
git commit -m "feat(scope): description of this unit" -- <files related to this logical unit>
```

**Handling merge conflicts:** If conflicts arise during rebasing or merging, resolve them immediately. Incremental commits make conflict resolution easier since each commit is small and focused.

**Note:** Incremental commits use clean conventional messages without attribution footers. The final Phase 4 handoff passes `branding:on` so `ce-commit-push-pr` can add generic Compound Engineering branding to the PR.

**Parallel subagent mode:** commit ownership follows the isolation mode chosen at dispatch — see `references/execution-strategy.md`.

3. **Follow Existing Patterns**

- The plan should reference similar code - read those files first
- Match naming conventions exactly
- Reuse existing components where possible
- Follow the project's coding standards already in your context
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

If **`ce-simplify-code`** is available, invoke it at phase boundaries (especially before Phase 3 when the accumulated cluster has >=30 substantive changed code lines — count human-authored code, not total diff lines, so a mostly test-fixture/config/generated/mechanical cluster does not trip the gate). Otherwise, review the changed files yourself for reuse and consolidation opportunities.

When the plan carries `session-settled:`-labeled KTDs or Key Decisions, pass the plan path as structure-pin context, not as the simplification scope, with the one-line constraint that labeled entries are structure pins the simplification must preserve (e.g., deliberate duplication stays duplicated).

6. **Figma Design Sync** (if applicable)

For UI work with Figma designs:

- Implement components following design specs
- Read `references/agents/figma-design-sync.md` and dispatch a generic subagent seeded with that local prompt to compare implementation against the Figma design. Do not dispatch a standalone agent by type/name.
- Fix visual differences identified
- Repeat until implementation matches design

7. **Frontend Design Guidance** (if applicable)

For UI tasks without a Figma design -- where the implementation touches view, template, component, layout, or page files, creates user-visible routes, or the plan contains explicit UI/frontend/design language:

- Apply the frontend guidance embedded in this skill and the active repo instructions: preserve existing design-system conventions, use real UI controls and states, keep layouts responsive, and verify text does not overflow or overlap.
- When browser tooling is available, inspect the changed UI at desktop and mobile widths before final validation. If no browser access is available, do a code-level responsive/layout review and record that browser verification was unavailable.
- Phase 4's screenshot capture still applies when the change is user-visible.

8. **Track Progress**
- Keep the task list updated as you complete tasks
- Note any blockers or unexpected discoveries
- Create new tasks if scope expands
- Keep user informed of major milestones
- When the plan defines U-IDs for Implementation Units, or the plan or origin document carries stable R-IDs (and optionally A/F/AE IDs), reference them in blockers, deferred-work notes, task summaries, and final verification — not routine status updates. U-IDs anchor units across plan edits; R/A/F/AE anchor product intent across the brainstorm-plan handoff. Use the IDs the plan supplies and do not invent ones it does not. This preserves traceability without burying signal under noise.

## Settled decisions during implementation

A KTD or Product Contract Key Decision carrying a `session-settled:` annotation (classes `user-directed` / `user-approved`) records a decision the user already made — it is not yours to improve. A product decision's label arrives through the Key Decision whose `Governs R…` links name your unit's Rs, not through a KTD. This scopes to labeled entries only: details the plan leaves open remain your judgment, and a real defect discovered inside a settled approach is still surfaced at full strength — the label never suppresses defect evidence. If implementation reveals a labeled decision is invalidating-grade unworkable (infeasible, wrong-thing, destructive), that is a genuine blocker: surface it rather than silently working around or "fixing" the decision.
