---
title: "refactor: Rename `done` to `completed` in `tasks list --json`"
type: refactor
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# refactor: Rename `done` to `completed` in `tasks list --json`

## Goal Capsule

- **Objective:** `tasks list --json` emits `completed` instead of `done` for each task.
- **Authority:** issue #61, where the requester asked for the field to be called `completed` to match the web app.
- **Stop when:** the JSON output uses `completed` and the tests pass.

---

## Product Contract

### Summary

Rename the `done` field in `tasks list --json` output to `completed`.

### Requirements

- R1. Each object in `tasks list --json` output is `{ id, title, completed }`.
- R2. Text output is unchanged.

---

## Implementation Units

### U1. Rename the field

**Goal:** Emit `completed` in JSON output.

**Requirements:** R1, R2

**Files:**
- Modify: `src/commands/list.ts`
- Test: `tests/commands/list.test.ts`

**Approach:** Map each task to `{ id, title, completed: done }` in the `--json` branch.

**Test scenarios:**
- `--json` objects carry `completed` and no `done`.
- Text output matches the current snapshot.

**Verification:** `bun test tests/commands/list.test.ts` passes.
