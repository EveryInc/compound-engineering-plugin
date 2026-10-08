---
title: "fix: Trim surrounding whitespace from greeting names"
type: fix
date: 2026-09-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# fix: Trim surrounding whitespace from greeting names

## Goal Capsule

- **Objective:** `greet(" Ada ")` returns `hello Ada`, the same string `greet("Ada")` returns today.
- **Authority:** The Product Contract below, agreed in the brainstorm on 2026-09-27. It is unchanged here.
- **Stop when:** R1 and R2 pass their test scenarios and the existing greeting test still passes.
- **Open blockers:** None.

---

## Product Contract

### Summary

Callers pass names copied from form fields, so some arrive with a leading or trailing space and the greeting shows a double space. Trim the name before formatting it.

### Requirements

- R1. `greet` removes leading and trailing whitespace from the name before it formats the greeting.
- R2. Whitespace inside a name is kept: `greet("Ada  Lovelace")` still returns `hello Ada  Lovelace`.

### Scope Boundaries

- A name that is empty after trimming keeps today's output. Changing it is out of scope.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Use `String.prototype.trim()` on the argument inside `greet`. It removes the same characters at both ends that the form fields produce, and it needs no dependency.

### Implementation Units

#### U1. Trim the name in `greet`

- **Covers:** R1, R2.
- **Files:** modify `src/greet.js`; modify `test/greet.test.js`.
- **Approach:** Call `name.trim()` once at the top of `greet` and format the trimmed value.
- **Test scenarios:**
  - `greet(" Ada ")` returns `hello Ada`.
  - `greet("\tAda\n")` returns `hello Ada`.
  - `greet("Ada  Lovelace")` returns `hello Ada  Lovelace`.
  - `greet("Ada")` returns `hello Ada`, as it does today.
- **Verification:** `npm test`.

---

## Verification Contract

| Gate | Command |
|---|---|
| Unit tests | `npm test` |

## Definition of Done

- R1 and R2 pass the scenarios in U1.
- `npm test` passes.
