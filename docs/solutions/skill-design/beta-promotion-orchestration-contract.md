---
title: “Beta-to-stable promotions must update orchestration callers atomically”
category: skill-design
date: 2026-03-23
module: plugins/compound-engineering/skills
component: SKILL.md
tags:
  - skill-design
  - beta-testing
  - rollout-safety
  - orchestration
severity: medium
description: “When promoting a beta skill to stable, update all orchestration callers in the same PR so they pass correct mode flags instead of inheriting defaults.”
related:
  - docs/solutions/skill-design/beta-skills-framework.md
---

## Problem

When a beta skill introduces new invocation semantics (e.g., explicit mode flags), promoting it over its stable counterpart without updating orchestration callers causes those callers to silently inherit the wrong default behavior.

## Solution

Treat promotion as an orchestration contract change, not a file rename.

1. Replace the stable skill with the promoted content
2. Update every workflow that invokes the skill in the same PR
3. Hardcode the intended mode at each callsite instead of relying on the default
4. Add or update contract tests so the orchestration assumptions are executable

## Applied: ce:review-beta -> ce:review (2026-03-24)

This pattern was applied when promoting `ce:review-beta` to stable. The caller contract:

- `lfg` -> `/ce:review mode:autofix`
- `slfg` parallel phase -> `/ce:review mode:report-only`
- Contract test in `tests/review-skill-contract.test.ts` enforces these mode flags

## Prevention

- When a beta skill changes invocation semantics, its promotion plan must include caller updates as a first-class implementation unit
- Promotion PRs should be atomic: promote the skill and update orchestrators in the same branch
- Add contract coverage for the promoted callsites so future refactors cannot silently drop required mode flags
- Do not rely on “remembering later” for orchestration mode changes; encode them in docs, plans, and tests
