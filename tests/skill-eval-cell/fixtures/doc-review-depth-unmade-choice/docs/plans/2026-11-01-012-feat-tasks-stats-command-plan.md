---
title: "feat: Add `tasks stats`"
type: feat
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Add `tasks stats`

## Goal Capsule

- **Objective:** a new `tasks stats` command prints how many tasks were completed today.
- **Authority:** issue #57, where the requester asked for "a quick way to see how many tasks I finished today".
- **Stop when:** `tasks stats` prints today's count and a completion streak.

---

## Product Contract

### Summary

Add a `tasks stats` command. It prints today's completed count, and also a completion streak: the number of consecutive days, ending today, with at least one completed task. Streaks are meant to encourage a daily habit.

### Requirements

- R1. `tasks stats` prints `Completed today: <n>`.
- R2. `tasks stats` prints `Streak: <n> days`. A day with no completed task resets the streak to zero.
- R3. Existing commands do not change.

### Scope Boundaries

- Deferred: a "streak freeze" that lets a user skip one day without losing the streak.

---

## Implementation Units

### U1. Add the command

**Goal:** Count today's completions and the current streak.

**Requirements:** R1, R2, R3

**Files:**
- Create: `src/commands/stats.ts`
- Test: `tests/commands/stats.test.ts`

**Approach:** Group done tasks by the local date of `completedAt`. Today's count is the size of today's group; the streak walks back one day at a time until a day has no group.

**Test scenarios:**
- Two tasks completed today -> `Completed today: 2`.
- Completions today and yesterday but not the day before -> `Streak: 2 days`.
- No completion today -> `Streak: 0 days`.

**Verification:** `bun test tests/commands/stats.test.ts` passes.
