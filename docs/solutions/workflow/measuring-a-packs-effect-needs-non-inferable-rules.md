---
title: "Measuring a Compound Pack's effect: rules must be non-inferable from the repo, and the token effect is model-dependent"
date: 2026-09-09
category: workflow
module: compound-packs / evaluation
problem_type: best_practice
component: testing_framework
severity: medium
applies_when:
  - "Benchmarking whether a Compound Pack (or any injected knowledge source) changed what an agent shipped"
  - "Designing pack rules or fixtures for an eval that compares with-pack against no-pack"
  - "Reporting a pack's token cost or saving across models"
tags:
  - compound-packs
  - evaluation
  - benchmark
  - token-usage
  - cloud-agents
---

# Measuring a Compound Pack's effect: rules must be non-inferable from the repo, and the token effect is model-dependent

## Context

Two rounds of paired cloud-agent runs (same fixture, same `lfg` feature request, same model, with vs. without a declared pack; 4
models, 18 pairs and arms) measured whether Compound Packs change what gets shipped and what they cost. The first round's rules
("use `envelope()`", "ids from `newId()`") had helper modules already in the tree; three of four models honored them *without* the pack
by exploring the repo, so the pack's code-level effect looked small. The first round also read "no pack tax, modest saving" from one
pair per model; replication showed that was a Claude-specific effect.

## Guidance

1. **A rule whose artifact exists in the repo measures exploration, not the pack.** To measure the pack's effect on shipped code,
   choose rules whose natural implementation differs from the rule and that leave no trace in the tree — a normalization the model
   would not apply unprompted, a status code convention (`409 {"error":"email_taken"}` rather than 400), a timestamp unit (epoch
   seconds rather than the ISO string). With such rules the paired result was 3/3 with the pack and 0/3 without on every model; with
   inferable rules it was 3/3 vs 3/3 on three models.
2. **Score behaviorally, not by grep.** Start the service and exercise it (create, duplicate, invalid); implementations vary too much
   in shape for a text search to be trusted, and a probe also catches a no-pack arm that ships without validation.
3. **Keep the with-pack and no-pack prompts byte-identical except the arm token, and never mention packs in either**; the with-pack
   arm must discover the pack through config the way a user's run would, and the no-pack arm must not be primed to look for one.
4. **Keep pack variants out of the workspace under test.** A fixture directory holding every variant (including an injection pack) is
   reachable by an exploring agent; put variants in a tarball or a path outside the checkout.
5. **Report token effects per model, never as a property of packs.** Across 10 pairs: Claude Opus 5 and Fable 5.1 used 12–41% fewer
   total tokens with a pack (they deliberate less when decisions are settled: narration roughly halved, fewer subagent dispatches and
   re-edits); GPT-5.6 Sol used 9–31% more in 3 of 4 pairs (it does more work because the rules add requirements it would not
   otherwise implement); Grok 4.6 was within noise. A single pair per model is direction only.
6. **The reliable, model-independent effects are traceability and enforcement**: `(pack: <id>, <file>)` citations in the plan
   (0 without, 3–7 with, and 0 decoy citations from a 15-rule pack), and review findings citing the contradicted rule.
7. **Include an instruction-file arm before claiming a pack beats the obvious alternative.** The same three rules as `AGENTS.md`
   bullets matched the pack's 3/3 compliance on all four models — but produced zero citations and zero review findings, and cost
   more total tokens than the pack arm on three of four (an always-loaded file is paid on every turn). The pack's advantage is
   traceability, enforcement, and scaling past a handful of rules, not raw compliance on three of them; say so rather than implying
   the instruction file fails.
8. **A rule that names a helper should also state the helper's observable output.** With `src/ids.js` deleted from the fixture, both
   models recreated it from the rule's prose; one dropped the `u_` separator (`ubnbq6najvb52`), and no review stage can check a
   regenerated helper against one that no longer exists. An example output in the rule (`u_1a1b2fjc3mq7`) makes the recreation
   checkable.

## Why This Matters

Without (1) a pack eval can report "no effect" for a pack that works, or "works" for a pack the model never read. Without (5) a cost
claim measured on one model family becomes a product claim that the next model refutes. Both mistakes were made in the first round
here and corrected only by replication and by redesigning the rules.

## When to Apply

- Any A/B of injected knowledge (packs, learnings corpora, instruction files) where "did it change the output" is the question.
- Any report of a pack's cost.

## Examples

Non-inferable rule set used in round 2 (`title` + `applies_when` frontmatter, prescriptive body): emails trimmed and lowercased before
store/compare; duplicate email → `409 {"error":"email_taken"}`; `createdAt` as integer epoch seconds. Behavioral probe: `POST /users`
with `"  ADA.Two@Example.com "` → expect 201 and `ada.two@example.com`; same email again → expect 409; `{"name":"","email":"x"}` →
expect 400.

## Related

- `docs/guides/packs.md` — "Writing `applies_when` that actually fires", "How discovery works"
- `docs/solutions/skill-design/authored-eval-corpora-contain-the-happy-path.md` — the same trap at the eval-corpus level
- `docs/solutions/skill-design/new-knowledge-source-re-derives-persona-gate-and-route.md` — the review-gate defect the first dogfood found
- PR #1656 (the runs, fixtures, and scorer are recorded in its cloud-agent dogfood artifacts)
- `EveryInc/frontier-experiments-kieran`, `experiments/002-ce-packs/` — every run's report, the raw scores and usage, the prompts,
  the fixture, and the three findings write-ups (`COMPOUND-BENCH.md`, `EXPERIMENTS.md`, `EXPERIMENTS-ROUND3.md`)
