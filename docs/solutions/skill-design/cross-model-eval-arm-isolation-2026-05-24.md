---
title: "Cross-model review eval: isolate all arms to identical context, or context masquerades as model diversity"
date: 2026-05-24
last_updated: 2026-05-24
category: skill-design
module: compound-engineering / cross-model-review-eval
problem_type: design_pattern
component: scripts/eval/cross_model_review
severity: medium
tags:
  - eval
  - eval-methodology
  - cross-model
  - blinding
  - fairness
  - confound
  - subagent-dispatch
related_plan: docs/plans/2026-05-24-001-feat-cross-model-review-eval-plan.md
related_brainstorm: docs/brainstorms/2026-05-24-multi-model-plan-review-requirements.md
---

## Context

The cross-model review eval compares review "arms" on the same document: a Claude
baseline (a), a cross-model CLI with no repo context (b), a cross-model CLI with a fixed
context set (c), and a same-model self-critic (d). The comparison is only meaningful if
every arm receives **identical, controlled context** — the design's whole point is to
isolate *model* and *context* as separate variables.

A live run on two real plans from a separate internal repo violated this and produced a confidently-wrong
conclusion. The cross-model arms (b, c) were correctly isolated — `codex` ran from a clean
CWD with the plan piped via stdin, no repo access. But the in-process Claude arms (a, d)
were dispatched as general-purpose subagents **given a path into the live repo**, so they
explored sibling files and discovered that both plans were already implemented and had
drifted from the plan. That made the Claude arms look impressively decorrelated — they
"found" things the codex arms missed.

It was an artifact, not a result. Re-running with the Claude arms isolated to a
**standalone copy of just the plan in OS temp** (no surrounding repo) plus a hard "read
ONLY this file, do not explore the filesystem or any repo" instruction produced none of
the drift findings. Fairly matched, the models mostly **agreed** on premise-level issues;
the biggest finding-count delta came from **context** (codex +context produced 35 findings
vs 10 without on one plan), not from model identity. The isolation re-run overturned the
contaminated run's apparent "build cross-model review" conclusion.

## Guidance

When evaluating multiple review configs (models, with/without context, self-critic),
isolate every arm to the same input shape before comparing:

- **CLI arms:** clean CWD + document via stdin only. For `codex`, add
  `--skip-git-repo-check` (it refuses to run from a clean dir without it) and do **not**
  strip `HOME` (that kills the CLI's auth — isolate via a clean CWD, not by overriding
  `HOME`). `agy --print` is the keyless Gemini path; the `gemini` CLI needs `GEMINI_API_KEY`.
- **In-process subagent arms:** pass a **standalone copy of the document in OS temp**, never
  a path into the live repo. A subagent handed a repo path will explore siblings and gain
  context the other arms lack. Add an explicit "read ONLY this file; do not read, search,
  glob, or list any other file; do not inspect any repository" instruction.
- The **arm-b vs arm-c context delta is the experimental control** — nothing else should
  differ between them.
- Run the **blind-integrity probe** (have the judge guess each finding's arm); treat
  above-chance accuracy as confounded and the per-arm metric as untrusted.
- **Operational notes from the run:** keep per-arm staging files **outside** the shared run
  dir, or `pool` (which globs `*.json`) double-counts; only count canonically-named records.

## Why This Matters

Unequal context across arms doesn't just add noise — it can invert the conclusion. The
contaminated run made the expensive cross-model lever look clearly justified (Claude found
drift codex missed). The isolated run showed the opposite: the apparent "model diversity"
was mostly a context difference, which a **cheaper same-model-with-context pass could also
deliver**. An eval whose entire purpose is a build/no-build decision must not let a context
confound decide it. This is the eval-first approach working — it caught the confound the
moment it ran on real inputs.

## When to Apply

Any multi-arm evaluation that compares models or review configurations on the same input —
especially when some arms are subprocess CLIs (no ambient context) and others are in-process
subagents (ambient tool/repo access). The asymmetry is the trap.

## Related

- `docs/solutions/skill-design/safe-auto-rubric-calibration-2026-04-25.md` — N≥3 trials and
  variance-as-signal; the same harness-discipline family (single trials and unequal context
  both produce confidently-wrong, reversed conclusions).
- `docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md` — per-finding
  (not batched) blinded judging; the blind-integrity rationale.
- `docs/plans/2026-05-24-001-feat-cross-model-review-eval-plan.md` — the harness this lesson
  governs (arm isolation, fair b-vs-c context, blind-integrity check are all requirements there).
