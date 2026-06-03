# Cross-Model Critique Evaluation — Decision Record (template)

Fill this from the U6 aggregate output at the end of a run, then write the completed file
under `docs/` (a `docs/solutions/`-style doc if the conclusion is durable guidance, or a
date-prefixed decision record). "Test expectation: none" — this artifact is authored from
the run's aggregates, not unit-tested.

Framing note: this evaluates a **cross-model critique** lever, not an "independent review"
(the independence claim is an overclaim — see origin R10).

---

**Date:** <run date>
**Corpus:** <N> documents (<k> known-failure, <m> forward-rated, 1 negative-control)
**Pre-registered before running:** go_threshold = <t>, minimum_corpus_n = <n>, trials_per_arm = <≥3>, arm_c_context_rule = <rule>
**Judge model family:** <family> (<"same family as baseline/self-critic — blind-integrity risk" | "distinct">)

## Outcome

> **<build:`<arm>`  |  build nothing  |  inconclusive>**

<One paragraph: what the result means and the immediate next step. If `build:<arm>`, name
the winning arm and that the deferred cross-model build is shaped by it. If `inconclusive`,
say why — below minimum N, or blind-integrity confounded, or the negative control moved —
and what a re-run needs.>

## Primary signal — known-failure subset

Per-arm count of confirmed, unique, decision-changing findings that surfaced the issue each
known-failure document's post-hoc failure proved mattered:

| Arm | Known-failure hits | Forward-rated (corroborating) | Trial variance |
|-----|--------------------|-------------------------------|----------------|
| a_baseline | <n> | <n> | <determinism note> |
| b_isolated | <n> | <n> | <determinism note> |
| c_fixed_context | <n> | <n> | <determinism note> |
| d_self_critic | <n> | <n> | <determinism note> |

## Validity checks

- **Blind-integrity:** judge arm-guess accuracy <x> vs chance <1/n_arms> — <"held" | "confounded → result is inconclusive">.
- **Negative control:** <"did not move" | "MOVED → harness stability problem, result is inconclusive">.
- **Power:** corpus_n <N> vs minimum_corpus_n <n> — <"met" | "below → inconclusive">.

## Secondary metrics (tie-breakers, not primary)

- Latency per arm: <...> (note: measured on one already-working machine; does not predict
  cross-machine auth fragility a shipped feature would face).
- Setup/auth friction: <...>
- Generic/duplicate (noise) rate per arm: <...>

## What this does and does not conclude

- It concludes whether a cross-model-critique lever produced unique, decision-changing
  findings often enough to justify its carrying cost, on this corpus.
- It does **not** decompose a self-critic win into "fresh pass" vs "failure-modes-supplied"
  (per origin R3), and it does not measure cross-machine setup fragility.
