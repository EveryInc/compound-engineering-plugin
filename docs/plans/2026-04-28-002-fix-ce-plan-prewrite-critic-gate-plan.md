---
title: Add ce-plan Pre-Write Critic Gate
type: fix
status: complete
date: 2026-04-28
---

# Add ce-plan Pre-Write Critic Gate

## Summary

Enhance `ce-plan` with the useful part of the local `/pln` flow: a bounded pre-write critic pass that catches blocking executability issues before the plan is saved. Keep `ce-plan`'s existing post-write confidence check and `ce-doc-review` gate.

## Requirements

- R1. `ce-plan` runs a pre-write critic gate after the plan draft exists and before writing `docs/plans/...`.
- R2. The critic returns `OKAY` or `REJECT`, with max three blocking issues and max two revision loops.
- R3. The critic uses CE-portable instructions, not local-only `metis`, `prometheus`, or `momus` agents.
- R4. Runtime-path plans include a 1000-user scalability baseline.
- R5. Non-empty `$ARGUMENTS` remains source of truth despite command rendering artifacts.

## Implementation Units

- U1. **Skill Contract Tests**
  - **Files:** `tests/pipeline-review-contract.test.ts`
  - **Goal:** Lock in the pre-write critic and scalability/argument guard behavior.
  - **Verification:** Targeted Bun test fails before the skill update and passes after it.

- U2. **ce-plan Skill Update**
  - **Files:** `plugins/compound-engineering/skills/ce-plan/SKILL.md`, `plugins/compound-engineering/skills/ce-plan/references/plan-critic.md`
  - **Goal:** Add a concise pre-write critic phase and put detailed rubric in a reference file.
  - **Verification:** Contract tests and release validation pass; local OpenCode reinstall exposes updated `ce-plan` skill body.

## Verification Notes

- `bun test tests/pipeline-review-contract.test.ts` passed.
- `bun run release:validate` passed.
- Reinstalled the local fork with `bun run src/index.ts install ./plugins/compound-engineering --to opencode`.
- Verified installed OpenCode `ce-plan` contains Phase 5.1.7, the `$ARGUMENTS` guard, the 1000-user scalability baseline, and `references/plan-critic.md`.
