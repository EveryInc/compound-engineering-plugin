---
title: "feat: Tiered Proven Budget + Probe Confirmation Note"
type: feat
status: completed
date: 2026-03-18
amends: docs/plans/2026-03-03-feat-audit-response-skill-level-amendments-plan.md
---

# feat: Tiered Proven Budget + Probe Confirmation Note

## Overview

Implement two audit findings from run 12 as lightweight skill amendments:

1. **A1: Tiered Proven Budget** -- Scale browser MCP budget by consecutive pass count (3/2/1 calls) instead of flat 3 for all Proven areas.
2. **A2: Probe Confirmation Note** -- Require 2 consecutive passes for non-deterministic probes before treating them as genuinely passing.

Both are behavioral guidance changes (+11 lines across 3 reference files), not schema or machinery changes.

**Relationship to existing plan:** The full audit plan (`2026-03-03-feat-audit-response-skill-level-amendments-plan.md`) covers A1-A5 targeting schema v10 / v2.52.0. This plan implements a **lightweight subset** of A1 and A2 only, deferring the schema-level changes (determinism field, register variation, scroll verification) to the full plan.

## Problem Statement / Motivation

**A1:** All Proven areas get 3 browser MCP calls regardless of stability. An area at 15 consecutive passes gets the same budget as one at 3. For mature test files, the majority of MCP calls confirm things that haven't changed in months.

**A2:** When a probe testing LLM-dependent behavior flips from failing to passing, 1 pass is indistinguishable from model variance. The operator handles this by judgment, but the skill should say so explicitly.

## Proposed Solution

### A1: Tiered Budget Table

Add to `run-targeting.md` after the existing Proven area budget rule:

```markdown
### Proven Area Budget by Stability

| Consecutive Passes | Browser MCP Budget |
|---|---|
| 2-5 | 3 calls |
| 6-9 | 2 calls |
| 10+ | 1 call |

Failing/untested probes remain uncapped at all tiers. The tier only
constrains passing probe spot-checks and exploration calls.

Tier follows the area's consecutive pass count in the Areas table.
The tier only resets when the consecutive pass count resets, which
occurs on demotion from Proven. If the area stays Proven despite a
soft score (agent judgment: cosmetic issue), the tier stays too.

Stable queries (CLI-only) do not count against the browser budget.
Journey steps and cross-area probes are separate from per-area budgets.

Freed calls redistribute to novelty budget and areas with active
variance. Report in SIGNALS: "+ N calls freed from ultra-stable
areas."
```

### A1: SKILL.md Reword

Replace the Proven area budget line in Phase 3 Area Selection Priority:

**Current (~line 104):**
```
Proven areas at score 5 get max 3 MCP calls regardless of run focus.
```

**New:**
```
Proven areas: spot-check scaled by stability (see run-targeting.md for tiered budget), plus any failing/untested probes.
```

### A1: Cross-File Reference Updates

Update all 12 hardcoded "3 MCP" references across 4 files to point to the tiered system. See the full reference index in the parent plan (lines 80-96).

Key files requiring updates beyond run-targeting.md and SKILL.md:

| File | Lines | Change |
|------|-------|--------|
| `probes.md` | 23 | `3-call MCP budget` -> `tiered MCP budget` |
| `queries-and-multiturn.md` | 51, 55-59, 156, 166, 253, 299 | 6 references to `3-call cap` -> tiered references |
| `SKILL.md` | 104, 126, 145 | 3 references -> tiered pointers |

### A1: Report Display

Per-area assessment includes tier context:

```
browse/product-grid  Proven (15 passes, 1-call budget)  UX 5  2s
```

### A2: Probe Confirmation Note

Add to `probes.md` after the Status Definitions section (~line 191):

```markdown
### Non-Deterministic Probe Confirmation

When a probe testing LLM-dependent behavior (agent reasoning,
scored_output quality, search ranking) flips from failing to passing,
treat the first pass as unconfirmed. Note "passing (unconfirmed)" in
the report. Require a 2nd consecutive pass before updating probe
status to passing in the test file during commit. If the next run
fails, revert to failing -- the first pass was variance.
```

### A2: Report Display

Unconfirmed probes display with an asterisk:

```
Probe Results:
| Area | Query | Status | Detail |
|------|-------|--------|--------|
| agent/search-query | "boots under $50" | passing* | First pass after 8 fails -- needs confirmation |
```

## Technical Considerations

### Gap 1: Cross-File Consistency (Critical)

The original feature spec proposed updating only run-targeting.md and SKILL.md. However, `queries-and-multiturn.md` contains 6 references to "3-call cap" including a **worked example** (lines 55-59) that the agent treats as canonical. If these aren't updated, the agent will follow the concrete example over the abstract tiered rule.

**Resolution:** Update all 12 references. The worked example at `queries-and-multiturn.md:55-59` must be updated to show tier-aware budgeting.

### Gap 2: Novelty Budget at Reduced Tiers

The novelty budget is currently defined as "exactly 1 MCP call (30% of 3 calls)" for Proven areas. At the 2-call tier, 30% = 0.6. At the 1-call tier, 30% = 0.3.

**Resolution:** Add a note to run-targeting.md: "Novelty allocation within the tiered budget is at agent discretion. At the 1-call tier, the single call may be used for probe spot-check OR novelty -- the mandatory novelty probe rule is waived when the budget is 1 call."

### Gap 3: A2 Determinism Identification

The +3 lines of guidance rely on agent judgment to identify which probes are non-deterministic. The full audit plan proposes a `deterministic`/`non-deterministic` field per probe with defaults by trigger type.

**Resolution for this plan:** Keep it lightweight. The agent already knows which probes target LLM-dependent behavior from the area's `scored_output` flag and probe generation context. Explicit classification deferred to the full plan's schema v10.

### Gap 4: Failure Reset Semantics

"Failure resets to 3-call tier" means area-level demotion from Proven, NOT individual probe failure. Probe failures are independent signals and do not affect the tier. The tier follows the consecutive pass count in the Areas table -- if the area stays Proven despite a soft score (agent judgment: cosmetic issue, not functional regression), the tier stays too. The tier only resets when consecutive passes resets to 0, which occurs on demotion.

### Gap 5: Progressive Narrowing Interaction

- **SKIP areas**: No browser calls -- tier is irrelevant (CLI queries still run)
- **PROBES-ONLY areas**: 1 exploration call + all probes -- tier budget does not apply (probes are uncapped)
- **FULL areas**: Tiered budget applies normally

The tier only governs the budget for Proven areas in FULL classification.

### Gap 6: Probe Graduation Interaction

For non-deterministic probes: the `passing*` (unconfirmed) pass does NOT count toward the 2-consecutive-pass graduation requirement. Graduation requires 2 confirmed passes (minimum 3 total passes for non-deterministic probes: 1 unconfirmed + 2 confirmed).

The unconfirmed pass rule applies only to probes transitioning from `failing` or `flaky` to `passing`. Probes transitioning from `untested` to `passing` follow the standard 1-pass threshold -- they have no failure history to create variance concern.

## Acceptance Criteria

### A1: Tiered Proven Budget

- [x] Tiered budget table added to `run-targeting.md` (+8 lines)
- [x] 2-5 passes: 3 calls; 6-9 passes: 2 calls; 10+ passes: 1 call
- [x] Failure resets consecutive passes to 0 (returns to 3-call tier)
- [x] Failing/untested probes uncapped at all tiers
- [x] Freed calls redistribute to novelty and active areas
- [x] Tier shown in per-area report line: `Proven (N passes, M-call budget)`
- [x] All 12 cross-file "3 MCP" references updated to tiered system
- [x] Worked example in `queries-and-multiturn.md:55-59` updated
- [x] SKILL.md reworded (net 0 lines)
- [x] Novelty budget note for 1-call tier added

### A2: Probe Confirmation Note

- [x] 3-line confirmation note added to `probes.md` after Status Definitions
- [x] Unconfirmed probes display as `passing*` in report
- [x] Commit mode holds unconfirmed probes -- doesn't write `passing` to test file until 2nd consecutive pass
- [x] Fail after unconfirmed pass reverts to `failing`
- [x] Graduation clock starts at confirmed `passing`, not `passing*`

## Line Budget

| File | Change | Delta |
|------|--------|-------|
| `run-targeting.md` | Tiered budget table + rules + novelty note | +10 |
| `probes.md` | Non-deterministic confirmation note | +3 |
| `queries-and-multiturn.md` | Update 6 references + worked example | ~0 (rewording) |
| `SKILL.md` | Reword 3 Proven budget references | 0 |
| **Total new lines** | | **+13** |

## Dependencies & Risks

**Dependencies:**
- Consecutive pass count already tracked in test file Areas table -- no new tracking needed
- `scored_output` flag already exists per area -- used to identify LLM-dependent probes

**Risks:**
- **Low:** Existing high-pass-count areas immediately get reduced budget. Mitigated by: the areas are genuinely stable (that's what 10+ passes means).
- **Low:** Agent judgment for non-deterministic probe identification may be inconsistent. Mitigated by: deferred to full plan's explicit classification field.

## Sources & References

- **Parent plan:** [docs/plans/2026-03-03-feat-audit-response-skill-level-amendments-plan.md](docs/plans/2026-03-03-feat-audit-response-skill-level-amendments-plan.md) -- A1-A5 full audit response
- **Iterate efficiency (completed):** [docs/plans/2026-03-01-perf-iterate-efficiency-progressive-narrowing-plan.md](docs/plans/2026-03-01-perf-iterate-efficiency-progressive-narrowing-plan.md)
- **Probe lifecycle (completed):** [docs/plans/2026-03-01-feat-probe-lifecycle-research-quality-plan.md](docs/plans/2026-03-01-feat-probe-lifecycle-research-quality-plan.md)
- **Cross-file reference index:** Parent plan lines 80-96
