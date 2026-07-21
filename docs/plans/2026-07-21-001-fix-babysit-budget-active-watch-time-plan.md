---
title: Babysit Budget as Active Watch Time - Plan
type: fix
date: 2026-07-21
topic: babysit-budget-active-watch-time
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Babysit Budget as Active Watch Time - Plan

## Goal Capsule

**Objective:** Make `ce-babysit-pr`'s invocation budget measure active watch-capability time instead of raw wall-clock, so that time the machine spent suspended (laptop asleep) does not silently drain the cap — while still bounding total autonomous work to prevent infinite back-and-forth.

**Product authority:** The repository owner defined the budget's intended meaning as *active watch-capability time, not a wall-clock lease*. This plan owns the budget-accounting change only. The liveness alert-floor (notify the human on a stall) is an explicit non-goal here and a possible separate follow-up.

**Open blockers:** None. The direction is settled; remaining items are implementation choices deferred to planning.

## Product Contract

### Summary

Change the babysit budget so its 8-hour default is consumed in *active* watch time. A coarse mechanism keyed on activity gaps in the watch process — spans where neither the detector polled nor the agent worked — excludes suspended time (the machine was asleep and nothing was watching) from elapsed time, keeps normal watching, active agent work, and human-blocked waits counted, and caps every invocation with an absolute 3-calendar-day backstop.

### Problem Frame

The budget is currently pure wall-clock: `invocation_elapsed_seconds = now - invocation_started_at` (`skills/ce-babysit-pr/scripts/pr-snapshot:1218-1265,1323-1327`), recomputed each snapshot and never paused. In a real session the watch was interrupted and the machine sat idle for hours; because the clock is wall-clock, that dead time was charged against the 8-hour cap identically to active watching, and the budget hit zero having delivered only a fraction of the intended coverage.

The dominant source of this is ordinary, not exotic: a closed laptop suspends the whole process — the token-free detector included — so nothing polls and nothing is watched, yet on resume the wall-clock has advanced. A budget that promises "8 hours of babysitting" but delivers two hours of coverage because six hours were spent suspended does not match what the owner authorized.

### Key Decisions

**Budget means active watch-capability time, not wall-clock** (session-settled: user-directed — chosen over the wall-clock/authorization-lease model: the owner authorized coverage delivered, not a calendar lease; suspended time is a service not rendered). The intended cap is roughly 8 hours of the agent actually being able to watch.

**Detect dead time coarsely from the detector's poll cadence** (session-settled: user-directed — chosen over the two-heartbeat, phase-aware, jitter-counting mechanism: micro-precision raises implementation cost and bug risk for little benefit). The detector already polls on a fixed interval; a poll gap far larger than that interval is dead time. One persisted "last poll" timestamp is the whole signal.

**Keep human-blocked time counted** (session-settled: user-approved — the agent proposed it and surfaced the tradeoff; the owner assented). While parked on a `needs-human` or `blocked-external` decision the watch still services CI/base/other streams, so the agent *can* act and that time is not dead.

**Absolute 3-calendar-day backstop** (session-settled: user-directed — chosen over 24h and 7d: generous enough to survive a weekend/laptop-sleep, tight enough to bound the "closed for a week" zombie-watch risk).

**Alert-floor and crash-case precision are out of scope** (session-settled: user-directed — chosen over bundling them: the alert-floor cannot fire while the laptop is closed, so it does not address the dominant dead-time case, and adds harness-dependent notification code).

### Requirements

**Budget accounting**

R1. In the self-sustaining in-session watch, the invocation budget measures active watch-capability time: elapsed excludes detected dead time rather than counting raw wall-clock from invocation start.

R2. Dead time means time when the whole watch process was not running — neither the detector polling nor the agent working, i.e. the machine was suspended. It is detected coarsely from activity timestamps: a span with no detector poll and no agent activity that exceeds a threshold well above the normal poll interval is excluded from elapsed. Active agent work between watch cycles is never counted as dead time, even though the detector does not poll during it.

R3. Normal armed waiting and active agent work are never excluded: while the detector polls on its interval or the agent is mid-tick, elapsed accrues normally, and ordinary tick/fetch latency below the threshold is not treated as dead time.

R4. Time spent blocked on a human or external decision (`needs-human`, `blocked-external`) continues to count against the budget, because the watch keeps servicing other streams.

**Bounding and safety**

R5. An absolute 3-calendar-day backstop caps every invocation: once 3 calendar days elapse from invocation start, the invocation expires regardless of how much dead time was excluded. This backstop is intentionally wall-clock — it counts suspended time, unlike the active-time cap — because it is the stale-PR / zombie-watch ceiling, deliberately coarser than the 8-hour active cap.

R6. The default budget stays 8 hours, now consumed as active watch time, and remains non-rolling and non-extendable — re-arms, mutations, retries, and managed-stack transitions still share one budget and can neither reset nor extend it.

### Acceptance Examples

AE1. **Laptop closed mid-watch.** **Covers R1, R2.** The machine is suspended for ~6 hours during a watch; on resume the process observes one activity gap (no poll and no agent work) far larger than the poll interval. That gap is excluded from elapsed, the budget reflects only active time, and the watch continues instead of reporting near-exhaustion.

AE2. **Steady light watching.** **Covers R3.** The detector polls normally for 2 hours with only sparse work; no gap exceeds the threshold, so the full 2 hours counts against the budget.

AE3. **Parked on a human decision.** **Covers R4.** A `needs-human` thread stays open for 3 hours while the watch keeps checking CI and base currency; those 3 hours count against the budget.

AE4. **Closed across a long weekend.** **Covers R5.** The laptop is closed for more than 3 calendar days; the invocation expires at the backstop even though excluded dead time means little active watching occurred.

AE5. **Re-arm after partial consumption.** **Covers R6.** After several hours of active time are consumed, a re-arm, mutation, or managed-stack transition continues on the same budget; none resets the clock or extends the cap.

### Scope Boundaries

Non-goals:

- Per-second or phase-aware precision — the two-heartbeat, jitter-counting mechanism is explicitly rejected.
- Exact accounting for an agent crash while the machine stays on and the detector keeps polling — the coarse detection does not refund it; this is an accepted imperfection, and re-invoking mints a fresh budget.
- Dead-time exclusion outside the self-sustaining in-session watch — checkpoint mode and the durable/cron path run a fresh snapshot with no poll cadence to measure and retain wall-clock accounting.
- The liveness alert-floor / stall notification — deferred to a possible separate plan.
- Durable auto-resume as a default recovery mode.
- Rolling or extendable budgets.

### Outstanding Questions

Deferred to Planning:

- The exact threshold value (a small multiple of the ~150s poll interval, e.g. ~15 minutes).
- The coarse discriminator that separates a long active agent tick from a machine suspend — the detector stops polling during a tick, so both show up as an activity gap. Options include advancing the activity heartbeat on agent ticks plus a tick-active guard, or capping the maximum single excluded span. The requirement intent (never refund active work) is fixed in R2/R3; the mechanism is planning's choice.
- The durable-state schema addition for a last-poll heartbeat — current state records the invocation anchor and watcher identity but no poll heartbeat (`skills/ce-babysit-pr/scripts/pr-snapshot:628-645`).
- Which existing wall-clock-expiry tests to replace and the shape of the new active-time and backstop tests (`tests/ce-babysit-pr-snapshot.test.ts:1514-1569` pins wall-clock expiry and the no-extend contract).
- How the backstop and active-time accounting interact with a managed-stack `--continue-invocation` transition, which already shares the one budget.

### Sources / Research

- Current wall-clock elapsed/remaining computation: `skills/ce-babysit-pr/scripts/pr-snapshot:1218-1265,1323-1327`.
- Fixed detector poll cadence (default `--interval 150`) and the watch loop's max-runtime exit: `skills/ce-babysit-pr/scripts/pr-snapshot:1755-1791`.
- Durable state lacks any poll heartbeat or phase field: `skills/ce-babysit-pr/scripts/pr-snapshot:628-645`.
- Budget as a non-rolling "blunt cost floor" and the in-session, no-magic-re-invoke watch model: `skills/ce-babysit-pr/SKILL.md:70-76,192`.
- `needs-human` does not end the watch: `skills/ce-babysit-pr/SKILL.md:20`.
- Direction validated by a cross-model panel (Codex GPT-5.6 and Grok, independent): both initially favored keeping pure wall-clock, then both moved to active-watch-time accounting after the owner's usage-meter intent and the portable poll-gap detection point were introduced.

---

## Planning Contract

**Product Contract preservation:** Product Contract unchanged. Planning enriches this artifact in place; all R/AE IDs and scope are preserved.

### Key Technical Decisions

KTD1. **Budget measures active watch-capability time, not wall-clock** (session-settled: user-directed — chosen over pure wall-clock / authorization-lease: the owner authorized coverage delivered, not calendar time). Implements R1. Effective elapsed = wall-clock since invocation start minus accumulated dead time; both existing emit sites derive from one shared value.

KTD2. **Dead time is detected coarsely from an activity heartbeat, not a phase-aware model** (session-settled: user-directed — chosen over the two-heartbeat, jitter-counting mechanism: micro-precision raises cost and bug risk). One persisted `last_activity_at` timestamp plus one `dead_time_seconds` accumulator. A span between activity marks that exceeds a threshold well above the poll interval is added to the accumulator. Implements R2.

KTD3. **The activity heartbeat is bumped by both detector polls and agent-driven snapshot/mark calls; active agent work is never refunded** (session-settled: user-directed — chosen over treating any long poll gap as dead time). Because every agent tick issues at least one `snapshot`/`mark`, tick boundaries advance the heartbeat, so ordinary ticks never register as dead time. Implements R3, R7. The residual case (a single agent tick longer than the threshold with no intermediate `pr-snapshot` call) is bounded by the discriminator chosen in OQ (below); the intent — never refund active work — is fixed here.

KTD4. **Dead-time accounting is scoped to the self-sustaining in-session watch** (session-settled: user-directed — chosen over global active-time). The heartbeat and accumulator are advanced by the `watch` loop and by agent `snapshot`/`mark` calls that carry the invocation anchor; checkpoint and durable/cron re-runs that start a fresh process with no continuous cadence retain wall-clock accounting. Implements R1 scope, D2.

KTD5. **The 3-calendar-day backstop is a separate wall-clock ceiling** (session-settled: user-directed — chosen over 24h/7d and over making it suspend-aware). A dedicated `invocation_backstop_seconds` (default 259200) fires `max-runtime` when raw wall-clock since invocation start reaches it, regardless of dead time. Implements R5.

KTD6. **Human-blocked time keeps counting with no special-casing** (session-settled: user-approved — chosen over refunding it). During `needs-human` / `blocked-external` the watch keeps polling other streams, so the heartbeat stays fresh and no gap accrues — the existing behavior already yields the desired result. Implements R4.

KTD7. **Dead time is monotonic and clock-backward-safe.** Each gap contribution is `max(0, now − last_activity_at − expected_interval)`; the accumulator only ever increases; effective elapsed is floored at 0. This absorbs NTP/resume clock adjustments without under-counting the budget.

### High-Level Technical Design

```
invocation start ──► wall-clock T ─────────────────────────────────────────►
                     │
   each watch poll / agent snapshot|mark:
     gap = now − last_activity_at
     if gap > THRESHOLD:  dead_time += (gap − interval)      # suspended span
     last_activity_at = now
                     │
   effective_elapsed = max(0, (now − started_at) − dead_time)   # the 8h active cap
   wall_elapsed       = now − started_at                        # the 3-day backstop
                     │
   max-runtime  when  effective_elapsed ≥ budget (28800)  OR  wall_elapsed ≥ backstop (259200)
```

Two clocks from one anchor: the **active** clock (wall minus dead time) drives the 8h cap; the **raw wall** clock drives the 3-day backstop. Both read the same persisted `started_at`, `dead_time_seconds`, and `last_activity_at`, so the `diff()` emit site and the `watch` loop never disagree.

---

## Implementation Units

### U1. Persisted-state fields and legacy migration

- **Goal:** Add the durable fields the accounting needs, with safe migration of existing on-disk state.
- **Requirements:** R1, R2, R5 (KTD2, KTD5, KTD7).
- **Dependencies:** none.
- **Files:** `skills/ce-babysit-pr/scripts/pr-snapshot`, `tests/ce-babysit-pr-snapshot.test.ts`.
- **Approach:** In `_empty_state` (~`pr-snapshot:628`) add `last_activity_at` (seed to `created_at`), `dead_time_seconds` (0.0), and `invocation_backstop_seconds` (default 259200). In the state-load/migration path (`_session_started_at` / `state.setdefault` block ~`pr-snapshot:1354`) `setdefault` these fields so legacy state without them migrates on first observation: seed `last_activity_at` from `started_at`, `dead_time_seconds` to 0, `invocation_backstop_seconds` to the default. Preserve them across `--continue-invocation` exactly as `started_at`/`invocation_budget_seconds` are preserved today.
- **Patterns to follow:** the existing `setdefault` migration for `state_created_at` (`pr-snapshot:1356`); the `_empty_state` dict shape.
- **Test scenarios:** fresh `_empty_state` carries the three new fields with correct defaults; legacy state JSON missing them gains them on load with `dead_time_seconds == 0` and `last_activity_at == started_at`; `--continue-invocation` preserves an existing non-zero `dead_time_seconds` and the backstop rather than resetting them.
- **Verification:** state round-trips through snapshot/mark with the new fields present and stable.

### U2. Dead-time accounting core (pure functions)

- **Goal:** Add the heartbeat-advance + accumulator logic and the effective-elapsed helper as pure, unit-tested functions.
- **Requirements:** R2, R3, R7 (KTD2, KTD3, KTD7).
- **Dependencies:** U1.
- **Files:** `skills/ce-babysit-pr/scripts/pr-snapshot`, `tests/ce-babysit-pr-snapshot.test.ts`.
- **Approach:** Add `_advance_activity(state, now, threshold)` that computes `gap = _elapsed(state["last_activity_at"], now)`, and when `gap > threshold` adds `max(0, gap - threshold)` (or `gap - interval`; pick one in OQ) to `state["dead_time_seconds"]`, then sets `state["last_activity_at"] = _iso(now)`. Add `_active_elapsed(state, now)` returning `max(0, _elapsed(state["started_at"], now) - state.get("dead_time_seconds", 0))`. Define the threshold constant (`DEAD_TIME_THRESHOLD_SECONDS`, ~900) near `DEFAULT_INVOCATION_BUDGET_SECONDS`. Clock-backward safe: `_elapsed` already floors via try/except; ensure `gap` and the contribution are floored at 0.
- **Test scenarios:** gap below threshold adds nothing; a single gap far above threshold accumulates ~gap; `last_activity_at` advances to `now` after each call; two consecutive sub-threshold polls accumulate nothing; a backward clock jump (now < last_activity_at) adds 0 and never decreases the accumulator; `_active_elapsed` returns wall minus accumulated dead time and never goes negative.
- **Verification:** the accounting functions are exercised directly by unit tests with injected `now` values.

### U3. Wire active elapsed into both emit sites and advance on each poll/tick

- **Goal:** Make `invocation_elapsed_seconds` / `invocation_remaining_seconds` reflect active time, and advance the heartbeat on every in-session watch poll and agent snapshot/mark.
- **Requirements:** R1, R3, R4 (KTD1, KTD3, KTD4, KTD6).
- **Dependencies:** U1, U2.
- **Files:** `skills/ce-babysit-pr/scripts/pr-snapshot`, `tests/ce-babysit-pr-snapshot.test.ts`.
- **Approach:** Call `_advance_activity` when a snapshot/mark carrying the invocation anchor runs and in the `watch` loop before reading elapsed. Replace the two `invocation_elapsed = _elapsed(state.get("started_at"), now)` computations (`diff()` ~`pr-snapshot:1218`; watch loop ~`pr-snapshot:1756`) with `_active_elapsed(state, now)` so both agree. Keep `persisted_state_age_seconds` on raw wall-clock (it must not change). Decide the `session_seconds` alias (`pr-snapshot:1271`) — keep it aliased to active elapsed for compatibility. Scope: only advance/accumulate when the invocation anchor is present (the in-session watch), leaving anchorless checkpoint/durable snapshots on wall-clock (KTD4).
- **Execution note:** add a failing test first for the suspend-gap-excluded contract (AE1), then wire the sites.
- **Test scenarios:** **Covers AE1.** a persisted state whose `last_activity_at` is ~6h stale but whose `started_at` is ~6h old emits `invocation_elapsed_seconds` near 0 after one poll (the gap is excluded) and the watch continues (no `max-runtime`). **Covers AE2.** steady sub-threshold polls over a simulated 2h accrue the full 2h. **Covers AE3.** a `needs-human` residual state polled repeatedly accrues elapsed normally (no refund). both emit sites return the same elapsed for identical state/now.
- **Verification:** snapshot JSON and the watch loop agree on elapsed/remaining for the same state.

### U4. 3-calendar-day wall-clock backstop

- **Goal:** Expire an invocation at the raw wall-clock backstop regardless of dead time, keeping the 8h active cap.
- **Requirements:** R5, R6 (KTD5).
- **Dependencies:** U1, U3.
- **Files:** `skills/ce-babysit-pr/scripts/pr-snapshot`, `tests/ce-babysit-pr-snapshot.test.ts`.
- **Approach:** In the watch loop (~`pr-snapshot:1767`) and the snapshot max-runtime path, fire `max-runtime` when `_active_elapsed(state, now) >= budget` **or** `_elapsed(state["started_at"], now) >= state["invocation_backstop_seconds"]`. Emit the same `max-runtime` payload; include a field distinguishing which ceiling fired for observability. Do not let the backstop reset or extend on re-arm/continue (shares the anchor).
- **Test scenarios:** **Covers AE4.** state with `started_at` > 3 days ago and small active elapsed → `watch` reason is `max-runtime` (backstop fired). **Covers AE5.** after partial active consumption, a re-arm / mutation / `--continue-invocation` with the same anchor keeps the same `dead_time_seconds` and backstop and neither resets nor extends the cap. active elapsed ≥ 8h with wall-clock < 3 days → `max-runtime` (active cap fired). the reconciled `max-runtime` payload reports which ceiling fired.
- **Verification:** both ceilings independently trigger `max-runtime`; neither resets on re-arm.

### U5. Docs and wall-clock-expiry test reconciliation

- **Goal:** Update the skill prose to the active-time contract and reconcile the existing wall-clock-expiry tests.
- **Requirements:** R1–R6 (documentation of the contract).
- **Dependencies:** U1–U4.
- **Files:** `skills/ce-babysit-pr/SKILL.md`, `skills/ce-babysit-pr/references/watch-loop.md`, `tests/ce-babysit-pr-snapshot.test.ts`.
- **Approach:** Update the budget description in `SKILL.md` (~`:98`, `:192`) and `watch-loop.md` (~`:78`, `:180`) to state that the budget is active watch-capability time, that a coarse activity-gap excludes suspended time, that the 3-day backstop is a separate wall-clock ceiling, and that checkpoint/durable modes retain wall-clock. Reconcile the two existing wall-clock-expiry tests (`tests/ce-babysit-pr-snapshot.test.ts:622-635`) so they assert active-time semantics (a backdated `started_at` with a *fresh* `last_activity_at` no longer max-runtimes on the active cap, but still does on the backstop when > 3 days), and confirm the resume test (~`:1387-1442`) still holds under the new fields.
- **Test scenarios:** the updated expiry tests pass under active-time semantics; a greppable SKILL.md contract line for "active watch" / backstop is present; no test still asserts pure wall-clock elapsed for the in-session watch.
- **Verification:** `bun test` green; `bun run release:validate` and `bun run plugin:validate` pass.

---

## Verification Contract

- `bun test` passes, including the new active-time, backstop, migration, and reconciled expiry tests.
- `bun run release:validate` and `bun run plugin:validate` pass (skill content changed).
- The two budget emit sites (`diff()` and the `watch` loop) return identical elapsed/remaining for the same state and `now`.
- AE1–AE5 each have a corresponding passing test.
- No remaining test asserts pure wall-clock elapsed for the in-session watch; checkpoint/durable wall-clock behavior is unchanged.

## Definition of Done

- Active-time accounting (dead-time accumulator + activity heartbeat) is wired into both emit sites, scoped to the in-session watch, with checkpoint/durable retaining wall-clock.
- The 3-calendar-day wall-clock backstop and the 8h active cap both independently trigger `max-runtime`, neither resets on re-arm/continue.
- Legacy on-disk state migrates safely; `--continue-invocation` preserves the accumulator and backstop.
- Active agent work and human-blocked waits are never refunded; suspended time is excluded.
- Docs (`SKILL.md`, `watch-loop.md`) describe the active-time budget, the backstop, and the mode scoping.
- Full suite and both validators green.

## Open Questions (deferred to implementation)

- **Gap contribution formula:** subtract the full over-threshold gap (`gap − threshold`) or `gap − interval`? Both are coarse and acceptable; pick the one that reads cleanest in `_advance_activity`.
- **Single-tick-longer-than-threshold discriminator:** whether to additionally bump the heartbeat from other in-tick `pr-snapshot` calls, cap the maximum single refunded span, or set a tick-active flag. The intent (never refund active work) is fixed by KTD3; choose the lightest mechanism that holds it without reintroducing phase-aware accounting.
- **`max-runtime` payload field** naming for which ceiling fired (active cap vs backstop).
