---
title: "feat: Add --json output to `tasks list`"
type: feat
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Add --json output to `tasks list`

## Goal Capsule

- **Objective:** `tasks list --json` prints the same tasks `tasks list` prints today, as a JSON array, so scripts stop parsing tab-separated text.
- **Authority:** issue #42, where the requester asked for exactly this flag and this output shape.
- **Stop when:** `--json` works with and without `--done`, and the default text output is byte-identical to today.

---

## Product Contract

### Summary

Add a `--json` flag to the existing `tasks list` command. Output is a JSON array of `{ id, title, done }` objects in the same order and with the same filtering as the text output.

### Requirements

- R1. `tasks list --json` prints a JSON array of the tasks the text output would show.
- R2. `--json` combines with `--done`.
- R3. Without `--json`, output is unchanged.

### Scope Boundaries

- Out: JSON output for other commands; a `--format` option.

---

## Implementation Units

### U1. Add the flag

**Goal:** Emit JSON when `--json` is present.

**Requirements:** R1, R2, R3

**Files:**
- Modify: `src/commands/list.ts`
- Test: `tests/commands/list.test.ts`

**Approach:** Filter as today, then `JSON.stringify` the filtered array when `argv` includes `--json`; otherwise join lines as today.

**Test scenarios:**
- `--json` prints a parseable array with the open tasks.
- `--json --done` prints only done tasks.
- No flag: output matches the current snapshot.

**Verification:** `bun test tests/commands/list.test.ts` passes.
