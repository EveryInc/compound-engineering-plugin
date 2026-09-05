---
title: "ce-doc-review confidence scoring: anchored rubric over continuous floats"
date: 2026-04-21
category: skill-design
module: compound-engineering / ce-doc-review
problem_type: design_pattern
component: tooling
severity: medium
tags:
  - ce-doc-review
  - ce-code-review
  - scoring
  - calibration
  - personas
  - persona-rubric
---

# ce-doc-review confidence scoring: anchored rubric over continuous floats

Persona review originally used a continuous `confidence` (0.0-1.0) against per-severity gates (0.50 / 0.60 / 0.65 / 0.75) and a 0.40 FYI floor. The scale invited false precision: personas clustered on round values (0.60, 0.65, 0.72, 0.80, 0.85) and gate boundaries became coin-flip bands where trivial shifts moved findings in and out of the actionable tier. The model cannot calibrate self-reported confidence at that granularity.

Both review skills now use 5 discrete anchors (`0`, `25`, `50`, `75`, `100`), each tied to a behavioral criterion, ported from Anthropic's code-review plugin (`anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md`). The live anchor definitions, routing, and promotion rules are in each skill's `references/findings-schema.json`, `subagent-template.md`, and synthesis reference, pinned by `tests/pipeline-review-contract.test.ts` and `tests/review-skill-contract.test.ts`. This doc keeps the threshold reasoning those files do not carry.

## Why the doc-review threshold is `>= 50`, not Anthropic's `>= 80`

Anthropic's `>= 80` is load-bearing for code review because of three constraints that invert for document review:

| | Code review | Document review |
|---|---|---|
| Backstop | CI linters, typecheckers, tests catch the 50-75 tier; the LLM only adds value by being more selective | There is no linter for a plan's premise gaps or scope drift; a missed finding derails implementation weeks later |
| Frequency and visibility | Every finding is a public PR comment; a reviewer who cries wolf gets muted | One private review per plan |
| Verifiability | "The code does X" is provable; a 75 often means "could not verify" | "Is the motivation valid?" has no ground truth, so premise/strategy personas legitimately cap at 50-75; `>= 80` would silence them |

So `ce-doc-review` gates at `>= 50` and `ce-code-review` at `>= 75` (with P0 escaping at 50). Anthropic's `>= 80` on a discrete scale would collapse to "anchor 100 only," which silences findings where a persona can construct the trace but cannot literally read the bug off the code, hence 75 rather than 80 for code.

**Correction (2026-08-13).** This reasoning originally continued "let the routing menu handle volume; dismissing a surfaced finding is cheap." That second half was wrong, and it produced a 34-finding review no human would read. Dismissing one finding is cheap; being asked thirty times is not, because the cost is the reader holding thirty open questions at once. A permissive gate is only safe when something downstream converts volume into few decisions. The threshold survives because settled corrections are batched into one grouped confirmation, so a low gate feeds a short question list. Keep `>= 50`; do not keep the reasoning that the menu absorbs volume.

## The anchor-75 boundary

Evaluation on large plans showed personas emitting 75 for premise-strength concerns ("motivation is thin") whose "will be hit in practice" claim was the reviewer's opinion, not a concrete downstream outcome. The template's 75 bullet now requires naming a concrete consequence someone will hit; strength-of-argument critique lands at 50. On the plan that surfaced it, this moved 21 Decisions / 4 FYI to 10 / 23 without suppressing grounded premise challenges (one still promoted to 100 because its consequence was explicit).

## Porting the rubric elsewhere

- A persona-based review skill with no linter backstop and one-shot consumption **that batches settled items** defaults to `>= 50`. Without batching, a low gate hands the reader every finding individually.
- A skill with externalizing modes (PR comments, autofix, headless callers) wants `>= 75` plus an independent validation pass; `ce-code-review` is the reference.
- A pipeline where anchor `25` ("couldn't verify") is most findings may want to surface 25 as "needs human triage" rather than drop it.
- Skip the pattern when the skill produces a single value rather than a population of findings, or the user is the source of truth (interactive Q&A).

Evidence for the migration is thin on purpose: four documents, no labeled corpus, so whether an anchor-75 finding hits 75% of the time is unmeasured. What was confirmed is that score dispersion collapsed from 7-12 distinct floats per document to 2-3 anchors, and that the `>= 50` gate admitted genuine concerns the old graduated gates suppressed at boundaries.
