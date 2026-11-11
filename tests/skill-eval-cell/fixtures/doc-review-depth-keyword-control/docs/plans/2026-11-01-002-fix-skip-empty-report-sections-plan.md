---
title: "fix: Skip empty sections in the weekly report"
type: fix
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# fix: Skip empty sections in the weekly report

## Goal Capsule

- **Objective:** `renderReport` omits a section whose `rows` array is empty, so the weekly report no longer prints bare headings.
- **Authority:** bug #88, filed by the report's maintainer, who asked for empty sections to be dropped.
- **Stop when:** empty sections are gone and non-empty output is unchanged.

---

## Product Contract

### Summary

The weekly report prints a `## Heading` with nothing under it when a section has no rows. Drop those sections. Anyone who can run the report today sees the same report minus the empty headings; who can run it does not change.

### Requirements

- R1. A section with no rows is not rendered.
- R2. Sections with rows render exactly as today.

### Scope Boundaries

- Deferred: a "nothing to report" placeholder line. The maintainer deferred it in bug #88 until someone asks for it.
- Out: changing section order or titles.

---

## Implementation Units

### U1. Filter empty sections

**Goal:** Skip sections with zero rows before rendering.

**Requirements:** R1, R2

**Files:**
- Modify: `src/report.ts`
- Test: `tests/report.test.ts`

**Approach:** Add `.filter((s) => s.rows.length > 0)` before the `map`.

**Test scenarios:**
- A report with one empty and one full section renders only the full one.
- An all-empty report renders an empty string.
- A report with no empty sections matches the current snapshot.

**Verification:** `bun test tests/report.test.ts` passes.
