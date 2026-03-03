# Journeys

Multi-area user flows executed without resets. Journeys test accumulated state across 3+ areas — bugs invisible to isolated per-area testing or two-area cross-area probes.

## Journey Schema

Each journey lives in the test file's `## Journeys` section:

```markdown
### J001: <journey name>

**Steps:**

| Step | Area | Action | Checkpoint |
|------|------|--------|-----------|
| 1 | <area-slug> | <natural language action> | <what to verify> |
| 2 | <area-slug> | <natural language action> | <what to verify> |
| 3 | <area-slug> | <natural language action> | <state clean check> |

**Status:** untested
**Last Run:** ---
**Run History:** ---
**Generated From:** manual
```

**Column definitions:**
- **Step:** Execution order (1, 2, 3...). Positional index, not a stable ID.
- **Area:** Area slug from `## Areas`. Same area can appear multiple times.
- **Action:** What to do (natural language, same as probe queries).
- **Checkpoint:** What to verify at THIS step before proceeding. Use `---` to skip (sparingly).

**Journey-level fields:**
- **Status:** `untested` / `passing` / `failing-at-N` / `flaky` / `stable`
- **Last Run:** Date of last execution
- **Run History:** Compact pass/fail, e.g. `P P F:3 P F:5 P`. Failures include step number after colon — `F:3` = "failed at step 3" (colon avoids ambiguity with count formats).
- **Generated From:** `manual`, `orientation`, `cross-area-escalation`, `weakness-class-synthesis`
- **on_failure:** `abort` (default) or `continue` (opt-in, per-journey)

## Checkpoint Types

| Type | Example | How to check |
|------|---------|-------------|
| Result state | "Results include matching items" | javascript_tool read of first 3 results |
| Count change | "Counter increments by 1" | Read element, compare to pre-action value |
| Element present | "Details match listing" | Check 2-3 attributes match between views |
| State clean | "No stale filters from prior steps" | Read active state, verify none from prior steps |
| No check | `---` | Skip verification (use sparingly) |

Checkpoints are 1 MCP call each (batched `javascript_tool`). A 5-step journey = ~10 MCP calls (5 actions + 5 reads). Journey MCP calls are separate from per-area budgets.

## Execution

**Phase 3 order:** (1) Cross-area probes, (2) Journeys, (3) Per-area testing.

**Inter-journey reset:** Navigate to the app's entry URL between journeys. Each journey starts from clean navigation state. Within a journey, no resets between steps.

**Execution order when multiple journeys exist:**
1. `failing-at-N` (highest signal)
2. `untested`
3. `flaky`
4. `passing`
5. `stable` (every other run only)

## Lifecycle

```
untested -> [run] -> passing / failing-at-N
                       |           |
               [5+ consecutive]  [mixed steps across 3+ runs]
                       |           |
                    stable       flaky
               (every other run)
                                   |
                       [3+ consecutive SAME step]
                                   |
                         escalate to bugs.md
```

- **`failing-at-N`:** Pinpoints which step failed. Step 2 failure = area broken. Step 5 failure after 1-4 passed = accumulated state bug.
- **`flaky`:** Fails at different steps across 3+ runs. Consecutive-same-step counter resets on step change.
- **Escalation:** Same step 3+ consecutive runs → auto-escalate to bugs.md. Failing step's area is primary, preceding areas are context. Suppressed when failing step's area has active Known-bug.
- **Stable frequency:** Run every other run (odd Run History length = run, even = skip).
- **Stable revert:** On failure, set status to `failing-at-N`, reset consecutive counter. Journey runs every time again.

## Abort vs. Continue

**Abort (default):** Stop at failing step. Record `failing-at-N`. If step 3 state is wrong, step 4 is unpredictable.

**Continue (opt-in):** `on_failure: continue`. Log each failure, execute all remaining steps. Status = `failing-at-N` where N = first failing step. Run History records all failing steps: `F:2,5` (failed at steps 2 and 5). Escalation uses first failing step only.

## Definition Change Detection

Commit mode compares current step count and area slugs against stored values. Key: `<step-count>:<area-slug-1>,<area-slug-2>,...`. If changed, reset status to `untested` and clear Run History.

## Known-Bug Area Interaction

Journey steps execute regardless of area Known-bug status — journeys test accumulated state, not individual areas. Journey failures involving Known-bug areas do NOT auto-escalate (bug already filed).

## Generation

**1. Manual (primary).** If orientation generated journey suggestions this run, present those as the first-run prompt:

> "Based on code reading, I found state boundaries crossing 3+ areas. Here's a suggested journey: [steps]. Use this, modify it, or define your own?"

If no orientation results, fall back to:

> "No journeys defined. Journeys test multi-area flows without resets. Define 1-2 journeys based on your app's primary user flows? (y/n)"

**2. Orientation.** Code reading identifies state boundaries crossing 3+ areas. Completes before first-run prompt so findings feed into suggestions.

**3. Cross-area probe escalation.** 2+ cross-area probes pass individually but per-area issues persist → suggest journey.

**4. Weakness-class synthesis.** Class spans 3+ areas → suggest journey.

Sources 2-4 generate suggestions requiring user confirmation.

## Budget

- **Max 5 active journeys** per test file
- **3-8 steps** per journey. Splitting counts against the 5-journey cap. If splitting would exceed the cap, prefer a single 8-step journey. Only split when a flow genuinely exceeds 8 steps.
- **~2 minutes per journey.** 5 journeys = ~10 minutes maximum.
- **Stable skip:** Stable journeys run every other run.
- **Time pressure:** Run only failing/untested journeys.

## Interactions With Existing Features

**Proactive restart:** Suppressed during journey execution (same as cross-area probes). Counter resets between journeys (each starts fresh after inter-journey navigation).

**Progressive narrowing:** Applies to per-area testing only. Journey steps execute regardless of narrowing classification (SKIP, PROBES-ONLY, FULL).

**Cross-area probes:** Complementary. No dedup — a cross-area probe and journey step covering the same seam test different things (isolation vs. accumulation).

**Adversarial mode:** Does NOT apply to journey steps. Journey steps execute defined action and checkpoint.

**Per-area MCP budgets:** Journey calls are separate. Visiting an area in a journey does not consume its per-area budget.

**`--no-commit`:** Journey results recorded in `.user-test-last-run.json` regardless. Status in test file only updated during commit. No-commit runs don't count toward escalation.

**Iterate mode:** Each iteration counts as a separate run for journey Run History. Stable "every other run" applies per iteration.

**Partial run safety:** Interrupted journeys discarded. Only fully-completed journeys have status written during commit.

## Report Format

```
JOURNEYS
| ID   | Name              | Status       | Failed At       | Detail                       |
|------|-------------------|--------------|-----------------|------------------------------|
| J001 | Primary user flow | failing-at-5 | <area-slug>     | Stale state after navigation |
| J002 | Secondary flow    | passing      | ---             | All checkpoints passed       |

Journey J001 checkpoint detail:
  + Step 1: <area-slug-1> -- <checkpoint description>
  + Step 2: <area-slug-2> -- <checkpoint description>
  x Step 5: <area-slug-1> -- STALE state from step 2
```

Checkpoint detail shown for failing/flaky journeys only. Passing journeys show summary.

**SIGNALS:** `~ 1 journey failing: J001 at step 5 (<area-slug>) — accumulated state`

**N-run summary:** Add "Journeys stabilized" and "Journeys with persistent issues."

## Commit Mode

Journey commit runs after per-area commit steps:

1. Update **Status**, **Last Run**, **Run History** in test file
2. Auto-escalate at 3+ consecutive same-step failures → bugs.md. Suppress if failing step's area has active Known-bug.
3. Mark `stable` at 5+ consecutive passes
4. Detect definition changes (step count or area slug changes → reset to `untested`, clear Run History)
5. Journey results do NOT affect per-area maturity scores
