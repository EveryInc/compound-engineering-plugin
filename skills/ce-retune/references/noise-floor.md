# Noise Floor and the Registered Bar

Phase 2 protocol. Measure what changing nothing produces, then write down the bar before a change exists.

## What the A/A run buys

Two builds of the corpus at the same commit, run under one harness on one task, produce a distribution rather than a result. That distribution is the floor: any later claim smaller than it is unsupported no matter how confidently it was reported. In the engagement this was the single most valuable measurement of the session — 12 runs across two identical builds gave workflow adherence 7 of 12 and output tokens from 21,872 to 155,682, a 7.12x spread on identical code. It retired every small-sample claim in flight, including an outside analyst's "2 of 8 improved to 5 of 8", which sits entirely inside the envelope of doing nothing.

The A/A also tests the instrument. Identical builds that differ significantly are not evidence about the corpus; they are a harness, provenance, or scoring bug. Chase that before continuing.

## Setup

Required capability: a harness that can point a run at a specific source checkout of the corpus (Phase 0's build selector) and writes a per-run artifact you can parse. Both arms must go through the *same* runner, task, and model configuration.

1. Materialize two checkouts of the corpus at the same commit. Record the commit for each arm.
2. Hash both trees and assert equality before the first run (`find <dir> -type f | sort` then a checksum over the file list and contents). An accidental difference between arms gets read as noise and poisons the floor silently.
3. Label the arms concretely by path, not by intent (`build-a`, `build-b`). Nothing downstream should be able to guess an arm from a filename that also encodes a hypothesis.
4. **Prove the selector is honored, in one run, before planning any.** Point a single run at `build-a`, then open the finished artifact and confirm it names `build-a` in the durable field below. Two failures both look like a normal run: a harness that silently falls back to its installed copy of the corpus, and one that records the arm nowhere. Either makes all 12 runs unlabeled and unusable, and both are invisible until you try to score. If you want a positive control, put a harmless unique string in a **third**, throwaway checkout and confirm it reaches that run's trace — never in either arm, which step 2 requires to stay byte-identical, and re-assert the hashes before the counted runs begin.
5. Plan 12 or more runs total, split evenly. Below about 10 the floor estimate is itself noise; the spread ratio in particular needs the tails.

## Interleave, never batch

Alternate arms run by run — A, B, A, B — and alternate which arm goes first across pairs (A/B, then B/A). Never run all of arm A and then all of arm B.

Batching confounds the comparison with API load, rate-limit backoff, transient service degradation, and time of day. Those effects are large and they are indistinguishable after the fact from a real difference between builds: there is no post-hoc correction, because the confound and the effect are the same column. Interleaving costs nothing — the same number of runs, reordered — and it makes each pair a matched observation you can analyze paired if you want the extra power.

If a run dies for an infrastructure reason, re-run *that arm's* slot rather than dropping the pair, and mark the row so the archive's broken-run taxonomy (`references/baseline-mining.md`) still classifies it correctly.

## Provenance per row

Every scored row must carry which build produced it, **read from the artifact the harness wrote**, never inferred from run order, timestamp, or the order you launched things.

The engagement's first scorer read the field the harness exposes for the source-checkout override *while a run is in flight*. On completion the harness folds that value into the run's metadata and clears the live field, so every finished row had an empty build column and the arms were unverifiable from the scored data. The runs were fine; the measurement was worthless until re-scored.

The rule that generalizes: **read the durable post-completion field first, fall back to the transient in-flight one.**

```
build = run.metadata.<override-field> or run.<live-override-field> or None
```

Then gate on it. Assert every row has a non-empty build value before computing anything, and fail loud with the offending run ids rather than scoring a partially-labeled table. A row whose arm you cannot establish is not a data point.

Minimum row schema:

| field | why it is here |
|---|---|
| `run_id` | join key back to the raw trace |
| `build` | arm, from the durable field |
| `commit` | proves the arms were the same source |
| `pair_index`, `position_in_pair` | recovers the interleave for paired analysis |
| `adherence` | followed the workflow (separate from outcome) |
| `outcome` | did the job |
| `broken` | empty transcript / error exit / infra death |
| `output_tokens` | the variance channel, and usually the noisier one |
| `terminal_marker` | how the run ended, verbatim |

Adherence and outcome stay separate columns here for the same reason they do in Phase 1.

## Statistics that survive small n

Required capability: a scripting environment with an exact-test library, or the closed forms. Wilson and the risk difference are arithmetic on the counts; Fisher's exact is a sum of hypergeometric terms. If neither the library nor the patience is available, do not substitute a normal approximation — use the streak below, which needs only `p^N`.

At n = 6 per arm the normal approximation to a proportion is wrong in ways that matter — it produces intervals that exclude values the data plainly permit, including 0 and 1. Use:

- **Wilson score intervals** for each arm's rate. Not Wald, not "plus or minus 1.96 times the standard error".
- **Risk difference with a confidence interval** as the headline comparison. Report the interval, not the point estimate. An interval that spans zero *is* the finding.
- **Fisher's exact test** for the 2x2, not chi-square, at these counts.
- **A spread ratio** for continuous channels: max over min of output tokens, per arm and pooled. In this corpus the token spread moved earlier and further than the completion rate, and it is what makes a corpus unmeasurable.

Report both channels. A build whose rate is unchanged but whose spread halved is a real result, and the reverse — a rate that improved while the spread widened — is a warning that you got lucky.

### Make "inconclusive" a printed outcome

The summarizer must, whenever a result is not significant, print the runs-per-arm that *would* have been needed for 80% power at the observed effect. Otherwise "no significant difference" reads as an empty slot in the report and someone fills it with narrative.

Two-proportion sample size at 80% power, alpha 0.05, two-sided:

```
n_per_arm = 7.849 * (p1*(1-p1) + p2*(1-p2)) / (p2 - p1)^2
```

Against the engagement's 58% baseline, detecting +30 points gives about 31 per arm from that formula, and the power tool used reported about 39 once it applied a continuity correction. **Take the larger.** Corrections differ by method and land roughly 20-40% above the plain figure at these rates, so with no tool to hand, plan on the plain figure inflated by a third rather than treating 31 as the budget. Print the number next to the non-result, in the same line, so the cost of the claim is visible where the claim is.

## The cheap one-armed alternative

Once the baseline rate `p` is independently established — from the A/A plus the archive mining — a control arm becomes optional. N consecutive clean runs has probability `p^N` under the null that nothing changed, and that is an exact test needing no second arm.

At `p = 0.58`:

| consecutive clean runs | probability under the null | odds |
|---|---|---|
| 3 | 0.195 | 1 in 5 |
| 5 | 0.066 | 1 in 15 |
| 8 | 0.0128 | 1 in 78 |

Eight runs bought p = 0.0128 where the two-armed design wanted roughly 39 per arm. Two conditions make it valid, and both are easy to lose:

- **The baseline must be established independently, before the change.** If you estimate `p` from the same runs you are testing, the test is circular and means nothing.
- **The runner must stop at the first failure.** A broken streak *is* the answer; continuing past it to collect "8 clean out of 11" converts an exact test into a rate comparison you are not powered for. Do not restart the streak after a failure without treating the failure as a finding and changing something.

The streak is a one-sided instrument: it can show a change is unlikely to be noise, and it cannot estimate effect size. Do not report a streak as a percentage improvement.

**Separate diagnostic runs from streak runs, or the loop costs eight runs a pass.** After a cut pass, one or two runs are enough to answer Phase 5's only question — which phase it died in now. Those are diagnostic: they locate the next target and they do **not** count toward any streak. Attempt the streak only once a diagnostic run comes back clean, and only on a build you will not touch until it finishes. Any edit lands on a new build, so it restarts the count at zero — a streak assembled across edits is not a streak, and no honest bar is cleared by one.

## Registering the bar

The registration is a written artifact at a path you can point a skeptic at, not an intention (`references/workflow-shapes.md` for where the engagement's artifacts live). It must name:

- the metric, in the exact form the summarizer computes it;
- the effect size worth detecting, and why that size and not a smaller one;
- the design (two-armed with n per arm, or streak with N) and the significance level it buys;
- the stopping rule, including what counts as a broken run that does not consume the streak;
- the phases the probe task traverses, from the validation below.

**When the affordable n cannot detect the effect you care about, say so and change the design — not the interpretation.** Options, in preference order: pick a cheaper metric that moves more per run (token spread usually moves before completion rate), target a bigger effect, or use the streak. Running an underpowered two-armed test and reporting its point estimate is the failure mode this whole phase exists to prevent, and it is exactly what the outside analyst's 2-of-8 versus 5-of-8 was.

## Sizing the probe task

A full realistic task costs too much to repeat 12 to 40 times. Build a probe whose **work** is small but whose **path** is complete: it must cross every phase boundary of the corpus, produce each phase's artifact, and require each handoff — with the substance of each step shrunk to near-nothing.

Then validate that it does, before spending n on it:

1. Run it once with tracing on.
2. For each phase, check the trace for its boundary marker — the dispatch, the artifact write, the gate. Score against the phase-marker map Phase 1 already built (`references/baseline-mining.md`) rather than re-deriving markers here; a probe scored against a second, differently-derived map is not comparable to the archive baseline.
3. List the phases the probe never entered.

**A probe that structurally cannot enter a phase can never fail in it.** Its green result certifies only the phases it traversed, and the unentered ones stay unmeasured while the streak makes the corpus look verified. Two of the engagement's landed cut passes came out of auditing exactly those unreachable phases; none of them could have come from the runs. That is why Phase 5 requires reading the phases the instrument cannot reach, and why the unentered list belongs in the registration rather than in a footnote afterward.

## Reading a tie honestly

If both builds succeed on a capable model, that shows **no regression**, not improvement. A ceiling result on the strong axis is compatible with the change having done nothing, and it says nothing at all about a more literal model or a different harness. Report it as "no regression detected, effect indistinguishable from zero at n = X" and keep the improvement claim unmade.
