---
title: "ce:work-beta promotion needs manual-handoff cleanup and contract migration"
category: skill-design
date: 2026-03-31
module: plugins/compound-engineering/skills
component: SKILL.md
tags:
  - skill-design
  - beta-testing
  - workflow
  - rollout-safety
severity: medium
description: "Promoting ce:work-beta requires more than copying SKILL.md content: stable handoffs, contract tests, beta-only wording, and planning neutrality must all flip together."
related:
  - docs/solutions/skill-design/beta-skills-framework.md
  - docs/solutions/skill-design/beta-promotion-orchestration-contract.md
---

## Problem

`ce:work-beta` is intentionally a manual-invocation beta skill. During beta, `ce:plan`, `ce:brainstorm`, `lfg`, `slfg`, and other workflow handoffs remain pointed at stable `ce:work` so the repo does not need to support two execution paths at once.

That means promoting `ce:work-beta` to stable is not just a content copy. The rollout flips multiple contracts at once:

- the active implementation surface moves from `ce:work-beta` to `ce:work`
- beta-only manual invocation caveats become wrong
- planner and workflow handoffs can start acknowledging the promoted path
- tests need to assert the stable surface, not the beta surface

If those changes do not happen together, the repo ends up teaching the wrong skill, keeping stale beta caveats, or preserving duplicate active paths that drift apart.

## Current Beta Limitation

During beta, the intended behavior is:

- `ce:work-beta` contains the experimental implementation
- users invoke `ce:work-beta` manually when they want the new behavior
- `ce:plan` stays neutral and continues to offer stable `ce:work`
- workflow orchestrators stay pointed at stable `ce:work`

This limitation is deliberate. It avoids pushing beta-specific branching into every planning and orchestration surface.

## Promotion Checklist

When `ce:work-beta` is ready to promote:

1. Copy the validated implementation from `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` into `plugins/compound-engineering/skills/ce-work/SKILL.md`.
2. Restore stable frontmatter on `ce:work`:
   - stable `name:`
   - stable description without `[BETA]`
   - remove `disable-model-invocation: true`
3. Remove beta-only manual invocation wording from the promoted stable skill.
4. Rework or remove `ce:work-beta` so it no longer looks like an active parallel implementation:
   - delete it, or
   - reduce it to a thin redirect/deprecation note
5. Update planning and workflow handoffs atomically:
   - `ce:plan`
   - `ce:brainstorm`
   - any other skills or workflows that recommend or invoke `ce:work`
6. Revisit planner wording so it can safely mention the promoted stable behavior if needed.
7. Move contract tests from the beta surface to the stable surface.
8. Re-run release validation and any workflow-level tests that exercise the handoff chain.

## Unique Gotchas

### Manual-invocation caveats must be removed

The beta skill intentionally says it must be invoked manually and that handoffs remain pointed at stable `ce:work`. After promotion, that wording becomes false and will actively mislead users.

### `ce:plan` should stay neutral during beta, then flip intentionally

While beta is manual-only, `ce:plan` should not teach beta-only invocation details. After promotion, the planner can acknowledge the promoted stable path, but that should happen in the promotion PR, not earlier.

### Test ownership must migrate

During beta, contract tests should assert delegation behavior on `ce:work-beta`. After promotion, those assertions belong on `ce:work`. Copying the skill content without moving the tests leaves the wrong surface protected.

### Do not leave two active delegation paths

If both `ce:work` and `ce:work-beta` retain live delegation logic after promotion, they will drift. Promotion should end with exactly one canonical implementation surface.

### Promotion is both a beta-to-stable change and an orchestration change

This promotion is unusual because the beta skill was intentionally isolated from workflow handoffs. The promotion PR must therefore do both:

- normal beta-to-stable file/content promotion
- workflow contract cleanup now that the stable surface can own the feature

See `docs/solutions/skill-design/beta-promotion-orchestration-contract.md` for the caller-update principle.

## Verification

Before merging the promotion PR, confirm:

- stable `ce:work` contains the implementation
- `ce:work-beta` no longer reads like the active implementation path
- no beta-only manual invocation caveats remain on the stable path
- workflow handoffs point where intended
- contract tests assert the right surface
- release validation passes

## Prevention

- Treat `ce:work-beta` promotion as a coordinated workflow change, not just a text replacement.
- Update skill content, planner wording, workflow handoffs, and tests in the same PR.
- Leave a durable note like this one at beta time so later promotion work does not rely on memory.
