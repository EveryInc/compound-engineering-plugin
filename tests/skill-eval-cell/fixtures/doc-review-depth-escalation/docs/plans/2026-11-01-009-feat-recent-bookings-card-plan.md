---
title: "feat: Add a recent-bookings card to the dashboard"
type: feat
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Add a recent-bookings card to the dashboard

## Goal Capsule

- **Objective:** the dashboard data includes the five most recent bookings alongside the upcoming ones.
- **Authority:** issue #61, where the requester asked for "recent bookings next to upcoming."
- **Stop when:** `buildDashboard` returns a `recent` list of five bookings, newest first.

---

## Product Contract

### Summary

Add a `recent` field to the dashboard data next to `upcoming`.

### Requirements

- R1. Dashboard data includes `recent`: the five most recent bookings, newest first.
- R2. `upcoming` is unchanged.

---

## Implementation Units

### U1. Query and return recent bookings

**Files:**
- Modify: `src/bookings/repo.ts`, `src/dashboard/build.ts`
- Test: `tests/dashboard/build.test.ts`

**Approach:** Add `recentBookings()` to the repo: `SELECT id, slot, status FROM bookings ORDER BY created_at DESC LIMIT 5`. In `buildDashboard`, add `recent: await recentBookings()`.

**Test scenarios:**
- `recent` has at most five rows, newest first.
- `upcoming` matches the current snapshot.

**Verification:** `bun test tests/dashboard` passes.
