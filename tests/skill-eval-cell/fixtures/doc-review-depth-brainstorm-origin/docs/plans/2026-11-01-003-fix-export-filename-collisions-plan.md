---
title: "fix: Avoid overwriting notes with the same title on export"
type: fix
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# fix: Avoid overwriting notes with the same title on export

## Goal Capsule

- **Objective:** `exportNotes` writes every note, even when two notes share a title, instead of the second overwriting the first.
- **Product authority:** the Product Contract below was settled in the brainstorm on 2026-10-30.
- **Stop when:** two same-titled notes produce two files and unique titles keep today's filenames.

---

## Product Contract

### Summary

Exporting two notes titled "Ideas" writes `Ideas.md` twice, so one note is lost. Suffix later duplicates with ` (2)`, ` (3)`, and so on.

### Requirements

- R1. Every exported note produces its own file.
- R2. The first note with a title keeps the plain filename; later duplicates get ` (n)` suffixes in export order.
- R3. Unique titles keep today's filenames.

### Key Decisions

- KD1. Suffix duplicates rather than prompting. (session-settled: user-approved; rejected: prompting per collision)

---

## Implementation Units

### U1. Track used names during export

**Goal:** Give each note a unique filename within one export.

**Requirements:** R1, R2, R3

**Files:**
- Modify: `src/export.ts`
- Test: `tests/export.test.ts`

**Approach:** Keep a `Map<string, number>` of titles seen in this call; on a repeat, append ` (n)` before `.md`.

**Test scenarios:**
- Two "Ideas" notes produce `Ideas.md` and `Ideas (2).md`.
- Three duplicates produce `(2)` and `(3)`.
- Unique titles produce today's filenames.

**Verification:** `bun test tests/export.test.ts` passes.
