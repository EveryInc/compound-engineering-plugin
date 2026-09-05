---
title: "Multi-surface skill output needs a shared, parity-tested rendering floor"
date: 2026-07-23
category: skill-design
module: compound-engineering / ce-doc-review
problem_type: design_pattern
component: development_workflow
severity: medium
tags:
  - skill-design
  - presentation-contract
  - cross-surface-parity
  - legibility
  - ce-doc-review
applies_when:
  - A skill renders the same finding/result data on more than one output surface (interactive, batch/report, headless envelope, one-line preview)
  - You are strengthening how one surface presents results and the sibling surfaces have their own copy of a weaker rule
  - A routing or authority rule is restated in several files, including the always-loaded skill body
---

# Multi-surface skill output needs a shared, parity-tested rendering floor

## Context

`ce-doc-review` renders a finding on four surfaces (walkthrough, batch report, headless envelope, bulk preview). Each surface once carried its **own** copy of a "self-contained references" rule. The walkthrough's copy was strengthened over time while the other three kept the original weaker rule, and nothing flagged the drift because each copy was internally consistent. The failure surfaced only when `ce-plan` re-narrated a headless envelope: a correct finding reached the user as one paragraph naming eight opaque tokens of three kinds, undecidable without opening the reviewed codebase. Per-token glossing alone would not have fixed it — the output also needed a decision-first structure.

The contract now lives once, in `skills/ce-doc-review/references/rendering-floor.md` (decision-first field order; opaque tokens classified by function as navigation, provenance, or mechanism anchors), every surface points at it and maps only its own layout, and `tests/skills/ce-doc-review-rendering-floor.test.ts` asserts the floor's invariant tokens and that every surface references it.

## Two rationales

**1. A per-surface rule set drifts invisibly, so the guard must be a parity assertion, not a review.** Each copy stays internally consistent, the strong surface's own tests keep passing, and whoever consumes the weak surface inherits and can amplify the defect. One source referenced by every consumer, plus a test that every consumer references it, converts an invisible drift class into a failing build. Do not rewrite the surface that already works to route it through the extraction — the walkthrough keeps its rich inline prose and adds a pointer noting it *is* the floor's expression; an additive guard beats replacing an implementation that works. Deterministic tests pin the contract (field order, floor referenced, invariant strings); whether model-generated prose actually chose the true consequence stays a behavioral eval, seeded with the real bad output as a regression fixture.

**2. The same shape bites harder for behavior rules than for presentation rules.** The skill's routing rules — which findings apply unattended, which are batched, which become questions — were restated in roughly eight places, and changing routing drifted three times in a row: the table was updated and the acting phase left stale; the phase fixed and an apply gate left stale; the gate fixed and the envelope vocabulary left stale; a later check found `SKILL.md` still claiming a class of finding was returned rather than applied. Two things make this worse than the presentation case: a stale presentation rule produces ugly output while a stale routing rule produces wrong *action*; and the always-loaded file is the most dangerous copy, because it is in context for every run, competes with the reference the agent is told to load, and is the copy least likely to be reread precisely because it is always there. Treat a routing or authority rule the same way: one source, every other mention a pointer. When you change one, grep for the *behavior* it describes rather than the rule's name, since restatements paraphrase — and check the always-loaded file first.

## When to Apply

- A skill emits the same result data through two or more surfaces and you are about to strengthen one of them, or you find yourself copy-editing the "same" rule in more than one reference file.
- Not when a skill has a single surface, or when surfaces genuinely need *different* contracts rather than different layouts — the floor unifies the rules; each surface still owns its visual form.

The general form: any contract duplicated across surfaces that evolve independently is a latent divergence, the same shape as the count-invariant fix in [[ce-doc-review-calibration-patterns]] (one `dependents` array as the source of truth for both coverage and rendering). Remedy: one source, referenced by every consumer, guarded by a parity assertion.

Related authoring principles: [[portable-agent-skill-authoring]] (smallest mechanism; parity-test duplicated contracts; CI-vs-behavioral split) and [[post-menu-routing-belongs-inline]] (what must stay in the always-loaded body).
