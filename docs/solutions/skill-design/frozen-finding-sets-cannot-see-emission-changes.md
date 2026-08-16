---
title: "A frozen finding set cannot measure a change to how findings are produced"
date: 2026-08-13
category: skill-design
module: skill-evaluation
problem_type: workflow_issue
component: evaluation
severity: medium
tags:
  - skill-eval
  - evaluation-design
  - variance-control
  - unmeasurable-change
---

# A frozen finding set cannot measure a change to how findings are produced

## What happened

Evaluating `ce-doc-review`'s synthesis layer meant fighting reviewer variance: dispatch the same document twice and the reviewers return different findings, so a downstream difference could not be attributed to the change under test. The fix was to capture the reviewer output once and replay that frozen set into every trial. It worked — it removed the variance and made synthesis-layer differences legible.

Two later changes were then measured on the same harness and appeared to do nothing:

- **Identifier glossing** — a reviewer must write `U1 (the load gate)` rather than bare `U1`, so the human-facing handle arrives with the finding instead of being reconstructed at render time.
- **The report-versus-question grammar** — a reviewer must not phrase a settled correction as a question.

Both are instructions to the **reviewer**. The frozen set was captured before either landed, from reviewers that never saw them. Replaying it means replaying pre-change reviewer output, so the trials could not have registered the change no matter how well it worked.

## Why it happened

Freezing removes reviewer *variance* by removing reviewer *execution*. Those are the same act. The harness is valid for anything downstream of the freeze point and blind to everything upstream of it — not partially blind, structurally blind, by construction.

The subtle part is that the harness reports normally. There is no error and no signal that the change was skipped; the trials complete and show no effect, which reads exactly like a change that does not work. That is the trap: an unmeasurable change and an ineffective change produce the same output.

## What to do instead

- **Locate your change relative to the freeze point before running.** If it alters what the frozen stage emits, the harness cannot see it. Decide that in advance, not after reading a null result.
- **Record which changes a run does not cover.** When several changes ship together and only some are measurable, say so where the results are written down. Silence here becomes a false "we tested it" later.
- **Re-capture the frozen set when the emitting layer changes.** It is an artifact with a provenance, not a fixture; a set captured under an older prompt is stale input.
- **Measure emission-layer changes against real output.** Grep captured runs for the shape you are trying to eliminate — bare identifiers, questions with one option. Cheaper than a trial matrix, and it looks at the layer that actually changed.

## The general form

A harness that controls a variable cannot measure a change to the thing it controls. Freezing reviewer output, pinning a model, fixing a seed, stubbing a service — each buys attribution power downstream by making an upstream region invisible. Know which region your change lives in before you trust the number.

## Related

- The corpus was also unrepresentative: [`authored-eval-corpora-contain-the-happy-path.md`](authored-eval-corpora-contain-the-happy-path.md).
- Harness construction: `paired-old-vs-new-injection-skill-evals.md`.
