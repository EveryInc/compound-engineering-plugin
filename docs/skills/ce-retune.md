# `ce-retune`

Retune a skill corpus for a new model, measurement-first.

A corpus that degrades on a model upgrade is a measurement problem before it is a writing problem. Reading the prose and rewriting what looks wrong produces a plausible fix list and no way to tell whether any item mattered.

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Mines an existing run archive for a baseline, establishes a noise floor on two identical builds, audits the corpus with an adversary defending the existing prose, then cuts in measured passes until a pre-registered bar clears |
| When to use it | A model upgrade made an agent workflow worse: it stalls, halts mid-run, burns far more tokens than before, or someone proposes rewriting skill prose to fix behavior |
| What it produces | A retuned corpus, one commit per pass, plus the measurement artifacts: baseline table, noise floor, and the run-by-run record behind the bar |
| What's next | `/ce-compound` to capture the mechanism you found; `/ce-commit-push-pr` to ship the passes |
| Hard requirement | A benchmark harness that can A/B two builds of the corpus. The skill refuses without one |

## Example invocations

```bash
# Start from the symptom
/ce-retune the pipeline stops partway through on the new model

# Name the target and the bar up front
/ce-retune target-model bar:8

# Point at a corpus that is not ./skills
/ce-retune ./agents bar:12
```

## The Problem

A model upgrade can make a working corpus worse. The instinct is to read the skills and rewrite what looks wrong, and it fails for a specific reason: the corpus is large enough that nobody can reason about its prose reliably, including the people who wrote it.

Worse, the failure is usually stochastic. A corpus can produce a wide spread of outcomes on identical inputs, which means a single run tells you nothing, a small sample tells you nothing, and any "before and after" comparison drawn from a handful of runs is indistinguishable from doing nothing at all. Fix lists assembled this way feel rigorous and are not.

## The Solution

Measure first, in a fixed order, with each step buying the right to take the next one.

1. **Gate on measurability.** No archive, no build selector, no repeatable task: stop and say what to build. An audit-only pass is a legitimate request and a different one.
2. **Mine the archive.** Historical runs are a free baseline, usually a larger sample than any experiment you can afford this week.
3. **Find the noise floor.** Two identical builds, same commit. Whatever difference appears is the floor every later claim must clear, and it determines the sample size. Register the bar before any change exists.
4. **Audit adversarially.** One agent per unit proposes cuts; a second defends the existing prose using the project's own learnings, tests, and git history. A defended keep leaves the list.
5. **Cut in surgical passes.** One problem per agent, disjoint file ownership, reconcile after every edit.
6. **Let the failure choose the next fix.** Where a run failed matters more than whether it did. Loop until the bar clears.

## What Makes It Novel

### 1. Broken runs are a first-class outcome

Empty transcripts and error exits score as model failures and silently inflate every effect. In the engagement this skill came from, 20% of an archive was broken runs, and excluding them falsified the first headline finding. The skill treats `broken` as its own bucket, excluded from both numerator and denominator, and checks whether broken runs land evenly across arms — a lopsided split is a harness fault wearing a model-effect costume.

### 2. Two metrics, never collapsed

"Followed the process" and "did the job" are tracked separately, because a run can complete the task while skipping the workflow entirely. Collapsed into one number, that reads as success. Kept apart, it reads as a distinct defect — which is how the skill caught a regression the cutting itself introduced.

### 3. The noise floor comes before the claim

Two identical builds are compared before anything is credited. This is the step most retuning efforts skip, and skipping it is why their results do not survive scrutiny. It also yields the cheap one-armed test: once the baseline rate is known, N consecutive clean runs has an exact probability under it, so a streak can clear a bar without a control arm.

### 4. An adversary defends the prose

Every proposed cut faces an agent whose job is to find the reason that line exists, using the project's documented learnings, its tests, and git blame. "A weaker model might need it" is not grounds for keeping; only citable provenance is. This is what separates an audit from a demolition, and it routinely saves prose the starting premise called junk.

### 5. It expects to be wrong

The synthesis is instructed to report what contradicts the premise: where defenders won, which unit was leaner than its word count implied, and where the corpus already contained a documented argument against its own ceremony that nobody had grepped for. Confirmation of a thesis you already hold teaches nothing.

### 6. It audits what the instrument cannot reach

A probe that structurally cannot enter a phase can never fail in it, so a green streak certifies only what it exercised. The skill requires listing the unentered phases and reading those files directly, and weights what it finds there equally with what the runs found.

## Chain Position

Upstream: a model upgrade, or a run archive showing degradation.

Downstream: `/ce-compound` to record the mechanism and the hypotheses that died, `/ce-commit-push-pr` to ship the passes.

Adjacent: `/ce-optimize` runs a generic metric-driven loop from a spec and knows nothing about corpora, halt classes, or noise floors. Use it when the thing being optimized is not a skill corpus.

## When Not To Use It

- **No way to measure.** The skill refuses rather than degrading into a static audit presented as retuning.
- **You want a corpus audit, not a retune.** Ask for the audit directly; it is cheaper and honest about what it can conclude.
- **The goal is word reduction.** Leanness and performance are separate programs that happen to share a corpus. This skill optimizes completion and reports it; word count is not the result.

## Notes

Reference files, loaded conditionally:

| File | Carries |
|------|---------|
| `references/baseline-mining.md` | Fields to extract, the outcome taxonomy, the confounds that fool careful analysts |
| `references/noise-floor.md` | The A/A protocol, interleaving, statistics that survive small samples, registering the bar |
| `references/corpus-audit.md` | Dispatch shape, finding schema, the classes worth hunting, what is protocol regardless of model tier |
| `references/cut-passes.md` | The surgical loop, isolation rules, the shared-asset trap, the over-cut failure mode |
| `references/halt-taxonomy.md` | The regression classes with greppable patterns and before/after, plus the stops that must survive |
| `references/workflow-shapes.md` | Which orchestration shape fits each phase, and what breaks when you pick wrong |

The skill is user-invoked only (`disable-model-invocation: true`). It spends many paid runs and refuses without a harness, so model-routing it would let a cheap request escalate into an expensive measurement program.
