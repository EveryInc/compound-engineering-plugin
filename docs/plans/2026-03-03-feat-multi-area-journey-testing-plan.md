---
title: "feat: Multi-Area Journey Testing"
type: feat
status: completed
date: 2026-03-03
schema_version_target: 9
plugin_version_target: 2.51.0
---

# feat: Multi-Area Journey Testing

## Problem Statement

The skill tests areas in isolation. Every run is a series of independent
spot-checks: test area A, reset, test area B, reset, test area C. Real
users don't reset between actions. They search for something, filter the
results, click a product, add it to cart, go back, search again. State
accumulates across every transition.

Cross-area probes (v2.49.0) partially address this -- they test state
carry-over between two specific areas (trigger -> observation). But a
two-area probe is a seam test, not a journey. A bug that only manifests
after a 4-step sequence (search -> filter -> detail -> back -> filter
state stale) would not be caught by any two-area probe, because the
staleness requires the intermediate steps to accumulate.

The skill needs multi-step journeys executed without resets, where state
accumulates naturally and verification happens at checkpoints along the
way -- not just at the end.

## How Journeys Differ From Existing Constructs

| Construct | Scope | Reset | Tests |
|-----------|-------|-------|-------|
| Per-area probe | 1 area | N/A | Specific claim within an area |
| Cross-area probe | 2 areas | No reset | State carry-over at one seam |
| Multi-turn sequence | 1 area, N turns | No reset | Conversational context retention |
| **Journey** | **3+ areas** | **No reset** | **Accumulated state across a full user flow** |

Journeys are a third testing layer alongside per-area and cross-area
probes. They catch bugs requiring accumulated state -- invisible to
isolated testing.

## Design

### Journey Definition

A journey is a sequence of 3-8 steps across different areas, executed
without resets, with checkpoints verifying state at intermediate points.

**Schema in test file (new `## Journeys` section):**

```markdown
## Journeys

<!-- Multi-area user flows without resets. Run after cross-area probes,
     before per-area testing. See journeys.md for lifecycle and budget. -->

### J001: Primary user flow

**Steps:**

| Step | Area | Action | Checkpoint |
|------|------|--------|-----------|
| 1 | <area-slug-1> | <natural language action> | <what to verify> |
| 2 | <area-slug-2> | <natural language action> | <what to verify> |
| 3 | <area-slug-3> | <natural language action> | <what to verify> |
| 4 | <area-slug-4> | <natural language action> | <what to verify> |
| 5 | <area-slug-1> | <natural language action> | <state clean from earlier steps> |

**Status:** untested
**Last Run:** ---
**Run History:** ---
**Generated From:** manual (initial scenario definition)
```

**Column definitions:**

- **Step:** Execution order (1, 2, 3...). Positional index, not a stable ID.
- **Area:** Which area this step operates in (area slug from ## Areas).
- **Action:** What to do (natural language, same as probe queries).
- **Checkpoint:** What to verify at THIS step before proceeding. A
  checkpoint failure at step 3 means the journey failed at step 3,
  not just "failed." Use `---` to skip verification (sparingly).

**Journey-level fields:**

- **Status:** `untested` / `passing` / `failing-at-N` / `flaky` / `stable`
- **Last Run:** Date of last execution
- **Run History:** Compact pass/fail (e.g., `P P F:3 P F:5 P`). Failures
  include step number after colon for escalation tracking. The colon
  delimiter avoids ambiguity with count-based formats (F:3 = "failed at
  step 3", not "failed 3 times").
- **Generated From:** `manual`, `orientation`, `cross-area-escalation`,
  `weakness-class-synthesis`
- **on_failure:** `abort` (default) or `continue` (opt-in, per-journey)

### Checkpoint Types

| Type | Example | How to check |
|------|---------|-------------|
| Result state | "Results include matching items" | javascript_tool read of first 3 results |
| Count change | "Counter increments by 1" | Read element, compare to pre-action value |
| Element present | "Details match listing" | Check 2-3 attributes match between views |
| State clean | "No stale filters from prior steps" | Read active state, verify none from prior steps |
| No check | `---` | Skip verification at this step (use sparingly) |

Checkpoints are 1 MCP call each (batched `javascript_tool`). A 5-step
journey = ~10 MCP calls (5 actions + 5 checkpoint reads). This is
separate from the per-area MCP budget -- journey steps do NOT consume
per-area call budgets.

### Execution Slot

```
Phase 3 execution order:
  1. Cross-area probes (seam tests)
  2. Journeys (accumulated state tests)     <-- NEW
  3. Per-area testing (isolated area tests)
```

Journeys run after cross-area probes because cross-area results inform
whether a journey's seams are already known broken. Journeys run before
per-area testing because journey failures provide context for per-area
exploration (e.g., "area-X has state management issues after navigation").

**Inter-journey reset:** Navigate to the app's entry URL between
journeys. Each journey starts from a clean navigation state. Journeys
are independent of each other and can be authored without considering
execution order. (Within a journey, no resets between steps.)

**Execution order when multiple journeys exist:**
1. `failing-at-N` journeys first (highest signal value)
2. `untested` journeys second
3. `flaky` journeys third
4. `passing` journeys fourth
5. `stable` journeys last (and only every other run)

### Journey Lifecycle

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
                         (as multi-area bug)
```

**Status definitions:**

| Status | Meaning |
|--------|---------|
| `untested` | Defined, not yet run |
| `passing` | All checkpoints passed on last run |
| `failing-at-N` | Failed at step N specifically |
| `flaky` | Fails at different steps across 3+ runs |
| `stable` | Passing 5+ consecutive runs |

**`failing-at-N`** is the key innovation. Step 2 failure = the individual
area is broken (per-area testing would catch this). Step 5 failure after
steps 1-4 passed = accumulated state bug (the journey's unique value).

**`flaky`:** Failing at step 3, then step 5, then step 3 = different
causes. Status becomes `flaky`. The consecutive-same-step counter resets
on each step change. Flaky is not inherently bad -- it means the journey
has multiple fragile points worth investigating.

**Escalation:** Journey failing at the SAME step for 3+ consecutive runs
auto-escalates to bugs.md. Bug entry format:

```
| ID | Area | Summary | Journey |
|... | <failing-step-area> | Journey <ID> fails at step N: <checkpoint detail> | J001 (steps 1-N context: <preceding area slugs>) |
```

The failing step's area is primary. Preceding areas provide context.

**Stable frequency:** `stable` journeys run every other run (derived
from Run History length -- odd run count = run, even = skip).

**Stable revert:** When a stable journey fails, set status to
`failing-at-N` (not `passing`). The stable consecutive counter resets.
Journey runs every time again until re-stabilized.

### Checkpoint Failure: Abort vs. Continue

**Abort (default):** Stop at failing step. Record `failing-at-N`.
Remaining steps not executed. Correct for most failures -- if step 3
state is wrong, step 4 on wrong state is unpredictable.

**Continue (opt-in):** Add `on_failure: continue` to journey definition.
Log each checkpoint failure but execute all remaining steps. Useful when
steps test independent state dimensions.

**Continue-mode status:** When multiple checkpoints fail, status is
`failing-at-N` where N = the FIRST failing step. Run History records
all failing steps: `F:2,5` (failed at steps 2 and 5). Escalation uses
the first failing step only -- subsequent failures may be cascading
effects.

### Definition Change Detection

When commit mode reads the existing journey to update status, it
compares the current step count and area slugs against the stored
values. If either changed (steps added/removed/reordered, area slugs
changed), reset status to `untested` and clear Run History.

Detection key: `<step-count>:<area-slug-1>,<area-slug-2>,...`

This is conservative but prevents stale `failing-at-3` pointing at a
step that no longer exists or has moved.

### Known-Bug Area Interaction

Journey steps execute regardless of an area's Known-bug status. Rationale:
the journey tests accumulated state across the full sequence, not the
individual area. A Known-bug area may behave differently in a journey
context than in isolation. If a Known-bug area causes a journey checkpoint
to fail, the journey records `failing-at-N` normally -- this is useful
signal (confirms the bug affects multi-area flows, not just isolated use).

Journey failures involving Known-bug areas do NOT auto-escalate to
bugs.md (the bug is already filed). Escalation is suppressed when the
failing step's area has an active Known-bug entry.

### Generation

**1. Manual definition (primary).** User writes journeys for real user
flows. Skill prompts on first run if none defined. If orientation (source
2) generated journey suggestions this run, present those suggestions AS
the first-run prompt rather than asking for manual definition from scratch:

> "Based on code reading, I found these state boundaries crossing 3+
> areas. Here's a suggested journey: [steps]. Would you like to use
> this, modify it, or define your own?"

If no orientation results exist, fall back to the generic prompt:

> "No journeys defined. Journeys test multi-area flows without resets.
> Define 1-2 journeys based on your app's primary user flows? (y/n)"

If yes, agent suggests steps from the area map. If no, skip.

**2. Orientation.** Code reading identifies state boundaries crossing
3+ areas -> journey hypothesis. Orientation completes before the
first-run prompt so its findings can be incorporated into suggestions.

**3. Cross-area probe escalation.** 2+ cross-area probes pass individually
but per-area issues persist -> suggest journey covering all affected areas.

**4. Weakness-class synthesis.** Weakness class spans 3+ areas -> suggest
journey probing state transitions across affected areas.

Sources 2-4 generate **suggestions requiring user confirmation**. Journeys
are expensive; auto-generation without confirmation wastes budget.

### Journey Budget

- **Max 5 active journeys** per test file
- **3-8 steps** per journey. If a flow exceeds 8 steps, split into two
  overlapping journeys (1-6 and 5-10) with shared transition. Splitting
  counts against the 5-journey cap. If splitting would exceed the cap,
  prefer a single 8-step journey over two overlapping ones. Only split
  when the flow genuinely exceeds 8 steps.
- **~2 minutes per journey.** 5 journeys = ~10 minutes maximum.
- **Stable skip:** stable journeys run every other run, halving budget
  for mature test files.
- **Time pressure:** If session time is tight, run only failing/untested
  journeys (same priority as probes).

### Interaction With Existing Features

**Proactive restart:** Suppressed during journey execution (same rule as
cross-area probes). MCP counter increments but restart is deferred until
the current journey completes. Counter resets between journeys (each
starts fresh after inter-journey navigation).

**Progressive narrowing:** Applies to per-area testing only. Journey
steps execute regardless of area narrowing classification (SKIP,
PROBES-ONLY, FULL). A SKIP area can still be a journey step.

**Cross-area probes:** Complementary. Cross-area probes test 1 seam.
Journeys test accumulated state across 3+ seams. No dedup between them
-- a 2-area cross-area probe and a journey step covering the same seam
test different things (isolation vs. accumulation).

**Adversarial mode:** Does NOT apply to journey steps. Journey steps
execute the defined action and checkpoint, not the adversarial variant.
Adversarial mode is a per-area testing concern.

**Per-area MCP budgets:** Journey MCP calls are separate from per-area
budgets. A journey visiting an area does not consume that area's per-area
call budget. Per-area testing runs independently after all journeys.

**`--no-commit` flag:** Journey results are recorded in
`.user-test-last-run.json` regardless of commit flag. But journey status
in the test file is only updated during commit mode. The `--no-commit`
run does NOT count toward the consecutive failure counter for escalation.

**Iterate mode:** Each iterate iteration counts as a separate run for
journey Run History. Stable "every other run" applies per iteration.

**Partial run safety:** If a run is interrupted mid-journey, uncommitted
journey results are discarded. Only fully-completed journeys have their
status written during commit mode. Partially-executed journeys retain
their pre-run status.

### Report Section

New section in Phase 4 report, after cross-area probes and before
per-area details:

```
JOURNEYS
| ID   | Name                   | Status       | Failed At         | Detail                          |
|------|------------------------|--------------|-------------------|---------------------------------|
| J001 | Primary user flow      | failing-at-5 | <area-slug-1>     | Stale state after navigation    |
| J002 | Secondary flow         | passing      | ---               | All 4 checkpoints passed        |

Journey J001 checkpoint detail:
  + Step 1: <area-slug-1> -- <checkpoint description>
  + Step 2: <area-slug-2> -- <checkpoint description>
  + Step 3: <area-slug-3> -- <checkpoint description>
  + Step 4: <area-slug-4> -- <checkpoint description>
  x Step 5: <area-slug-1> -- STALE state from step 2
```

Checkpoint detail shown for failing/flaky journeys only. Passing
journeys show summary line only.

**SIGNALS addition:**
```
~ 1 journey failing: J001 at step 5 (<area-slug-1>) — accumulated state
```

**N-run summary:** Add "Journeys stabilized" and "Journeys with
persistent issues" to the N-run summary format.

### `.user-test-last-run.json` Schema

```json
"journeys_run": [
  {
    "id": "J001",
    "name": "Primary user flow",
    "status": "failing-at-5",
    "on_failure": "abort",
    "checkpoints": [
      { "step": 1, "area": "<area-slug-1>", "passed": true },
      { "step": 2, "area": "<area-slug-2>", "passed": true },
      { "step": 3, "area": "<area-slug-3>", "passed": true },
      { "step": 4, "area": "<area-slug-4>", "passed": true },
      { "step": 5, "area": "<area-slug-1>", "passed": false,
        "detail": "stale state from step 2 still active" }
    ],
    "time_seconds": 45
  }
]
```

### Commit Mode Additions

Journey commit mode runs after per-area commit mode (step 4 updates
probe tables, step 8 updates queries). Journey updates are a new step:

1. Update journey **Status**, **Last Run**, **Run History** in test file
2. Auto-escalate at 3+ consecutive same-step failures (→ bugs.md as
   multi-area bug). Suppress if failing step's area has active Known-bug.
3. Mark `stable` at 5+ consecutive passes
4. Detect definition changes (step count or area slug changes → reset
   to `untested`, clear Run History)
5. Journey results do NOT affect per-area maturity scores

## Design Decisions

### D1. Journeys are scenario-level, not area-level
Lives in `## Journeys` alongside `## Cross-Area Probes` and `## Areas`.
Not owned by any single area.

### D2. Checkpoints at every step, not just the end
A journey verifying only at the end is just a long cross-area probe.
Checkpoints pinpoint WHERE state goes wrong.

### D3. Journey failure does NOT affect per-area scores
Journey failure = accumulated state bug. Per-area score = isolated
area health. Mixing them makes maturity tracking unreliable.

### D4. failing-at-N is more useful than failing
8-step journey reporting "failing" tells you nothing. "failing-at-5"
tells you steps 1-4 work and the bug is at the step 5 transition.

### D5. Manual definition is primary
The user knows which flows matter. Auto-generation produces suggestions
requiring confirmation, not automatic entries.

### D6. Journey steps can revisit areas
Step 1 uses area X. Step 5 uses area X again. The value is testing
whether the area behaves differently after intermediate steps modified
state.

### D7. Abort is the default on checkpoint failure
Wrong state at step 3 makes step 4 unpredictable. Continue exists as
opt-in for independent state dimensions.

### D8. Step drift prevents premature escalation
Failing at different steps = different causes = flaky, not a single
consistent bug worth auto-filing.

### D9. Inter-journey reset to entry URL
Journeys are independent. Each starts from a clean navigation state.
Without this, journey ordering becomes a first-class authoring concern
and journey 2's results depend on journey 1's side effects.

### D10. Known-bug areas still execute in journeys
Journeys test accumulated state, not individual areas. A Known-bug area
in a journey provides useful signal about multi-area impact. But
Known-bug journey failures don't auto-escalate (bug already filed).

### D11. Journey MCP calls are separate from per-area budgets
Journeys and per-area testing serve different purposes. Sharing budgets
would force trade-offs between journey thoroughness and per-area depth.

### D12. Definition changes reset to untested
Conservative but safe. Prevents stale `failing-at-3` from pointing at
a step that moved or no longer exists.

### D13. Continue-mode uses first failing step for status
Multiple checkpoint failures in continue mode may be cascading. The
first failure is the root cause signal. Run History records all failures
for investigation.

## Line Budget

| File | Baseline | Delta | After | Notes |
|------|----------|-------|-------|-------|
| SKILL.md | 368 | +5 (pointer + execution slot) -3 (trim) | 370 | Well under 420 ceiling |
| journeys.md | NEW | +65 | 65 | All journey behavioral detail |
| test-file-template.md | 549 | +25 | ~574 | Journey section template + v8→v9 migration |
| last-run-schema.md | 136 | +15 | ~151 | journeys_run schema |
| probes.md | ~490 | +3 | ~493 | Cross-ref to journey escalation |
| Total new content | | ~110 | | |

SKILL.md stays well under ceiling. All journey behavioral detail lives
in `references/journeys.md`. SKILL.md holds only the execution slot
pointer and commit mode bullet.

## Schema Changes

### Test file: v8 -> v9
- New `## Journeys` section (optional, may be empty)
- Journey entry schema: ID, Name, Steps table, Status, Last Run,
  Run History, Generated From, optional on_failure

### `.user-test-last-run.json`
- New `journeys_run` array field

### Migration: v8 -> v9
- Missing `## Journeys` = empty (no journeys defined). Do not create.
- Additive only. v8 files work unchanged.
- Bump `schema_version: 9` on first commit.
- Forward compatible: v8 skill reads v9 files safely (preserves
  unknown sections).

## Acceptance Criteria

### Journey Definition
- [ ] `## Journeys` section in test file template (`test-file-template.md`)
- [ ] Schema: ID, Name, Steps table, Status, Last Run, Run History,
      Generated From, optional on_failure
- [ ] Steps table columns: Step / Area / Action / Checkpoint
- [ ] 3-8 steps per journey, max 5 journeys
- [ ] Same area can appear multiple times in a journey

### Execution
- [ ] Run after cross-area probes, before per-area testing
- [ ] No reset between steps within a journey
- [ ] Inter-journey reset to app entry URL
- [ ] Checkpoint at each step (1 MCP call via batched javascript_tool)
- [ ] Abort on checkpoint failure (default)
- [ ] `on_failure: continue` option (first failing step = status)
- [ ] Proactive restart suppressed during journey execution
- [ ] Progressive narrowing does not affect journey steps
- [ ] Known-bug areas still execute in journey steps
- [ ] Adversarial mode does NOT apply to journey steps
- [ ] Journey MCP calls separate from per-area budgets
- [ ] Execution order: failing > untested > flaky > passing > stable
- [ ] Failing/untested journeys before stable

### Status & Lifecycle
- [ ] `failing-at-N` records which step failed
- [ ] Step drift across runs → status becomes `flaky`
- [ ] Escalation: same step 3+ consecutive → bugs.md (multi-area bug)
- [ ] Escalation suppressed when failing step area has Known-bug
- [ ] Bug entry: failing step area primary, preceding areas as context
- [ ] `stable`: 5+ consecutive passes, every other run
- [ ] Stable revert on failure → `failing-at-N`, counter resets
- [ ] Definition change detection → reset to `untested`
- [ ] Journey results do NOT affect per-area maturity scores

### Report
- [ ] JOURNEYS section after cross-area, before per-area details
- [ ] Failing/flaky: full checkpoint detail (+ and x markers)
- [ ] Passing: summary line only
- [ ] SIGNALS entry for failing journeys
- [ ] `journeys_run` in JSON with per-step checkpoint data
- [ ] N-run summary includes journey stabilization/persistence

### Generation
- [ ] First-run prompt if no journeys defined
- [ ] Manual primary, auto sources suggest only
- [ ] Suggestions require user confirmation

### Commit Mode
- [ ] Status + Last Run + Run History updated
- [ ] Auto-escalation at 3+ consecutive same-step failures
- [ ] Stable at 5+ consecutive passes
- [ ] Definition change detection resets status
- [ ] `--no-commit` runs don't count toward escalation
- [ ] Partial runs: only fully-completed journeys written

### Schema & Migration
- [ ] v8 → v9 additive migration
- [ ] Missing `## Journeys` = empty
- [ ] Forward compatible
- [ ] SKILL.md stays under 420-line ceiling

## Implementation Order

All changes ship together as schema v9.

- [x] 1. **Schema & template** — `## Journeys` section in `test-file-template.md` + v8→v9 migration notes
- [x] 2. **Reference file** — create `references/journeys.md` (lifecycle, budget, execution rules, checkpoint types, generation, interactions)
- [x] 3. **Last-run schema** — add `journeys_run` to `last-run-schema.md`
- [x] 4. **SKILL.md pointer** — Phase 3 execution slot + commit mode bullet + trim
- [x] 5. **Report** — journey results format in Phase 4 (pointer to journeys.md)
- [x] 6. **Commit mode** — status updates, escalation, stable, definition change detection
- [x] 7. **Version bump + install** — plugin.json 2.50.0→2.51.0, CHANGELOG, local install

## Verification: Would This Have Caught Real Bugs?

| Bug pattern | Without journeys | With journeys |
|-------------|-----------------|---------------|
| Stale state after multi-step navigation (4+ steps) | Not testable (accumulated state) | `failing-at-N`: pinpoints which step's state leaked |
| State contamination visible only after round-trip | Cross-area probe (2 steps, one seam) | Journey revisits area after 3 intermediate steps |
| Counter/badge wrong after add→remove→add sequence | Per-area test starts clean each time | Journey checkpoints verify at each transition |
| Filter/search state leaking across unrelated flows | Per-area tests pass in isolation | Journey exposes that state persists across areas |

## Sources

- Phase 3 execution: `SKILL.md:98-152`
- Cross-area probes: probes.md (lines 322-489), v2.49.0 plan
- Proactive restart: cross-area plan D5, `connection-resilience.md`
- Progressive narrowing: `run-targeting.md` (lines 74-107)
- Weakness-class synthesis: compounding quality plan Change 2
- Multi-turn sequences: `queries-and-multiturn.md`
- Probe lifecycle: `probes.md`
- Known-bug handling: `bugs-registry.md`
- Schema migration pattern: `test-file-template.md` (lines 168-176)
- Line budget learnings: `docs/solutions/2026-02-26-monolith-to-skill-split-anti-patterns.md`
