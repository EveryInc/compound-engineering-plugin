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
