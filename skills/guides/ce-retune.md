# `ce-retune`

> Retune a skill corpus for a new model, measurement-first.

`ce-retune` is an on-demand **corpus** skill. Use it when a model upgrade made an agent workflow worse: it stalls, stops mid-run, or burns far more tokens than before, or someone wants to rewrite skill prose to "fix" the new model.

It is not a general skill editor. Reading the corpus and rewriting what looks wrong produces a plausible fix list and no way to tell whether any item mattered. This skill mines the run archive, measures a noise floor on two identical builds, audits with an adversary that defends the existing prose, then cuts in measured passes until a bar you registered in advance clears.

Hard requirement: a benchmark harness that can A/B two builds of the corpus. Without one, the skill stops and names what to build. It will not pretend a static audit is a retune.

The skill is user-invoked only. It spends many paid runs, so an agent is not allowed to route into it on its own.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Mines an existing run archive, measures a noise floor on two identical builds, audits the corpus with a defender, then cuts in measured passes until a pre-registered bar clears |
| When to use it | A model upgrade made a skill corpus worse, or a rewrite is proposed and you need to know whether it actually helps |
| What it produces | A retuned corpus, one commit per pass, plus the measurement record: baseline table, noise floor, and the run-by-run log behind the bar |
| What's next | `/ce-compound` for the mechanism you found; `/ce-commit-push-pr` to ship the passes |
| Hard requirement | A harness that can point a run at a specific checkout of the corpus. The skill refuses without one |

---

## Example invocations

The first argument is a symptom or a target model. The corpus defaults to `./skills`. `bar:<n>` is consecutive clean runs, registered before any cut.

```text
# Start from what broke. Corpus defaults to ./skills
/ce-retune the pipeline stops partway through on the new model

# Token blow-up on the same pipeline, same task
/ce-retune the pipeline uses several times more tokens on the new model

# Name the model and the bar up front
/ce-retune target-model bar:8

# Point at a corpus that is not ./skills
/ce-retune ./agents bar:12

# Audit only. Cheaper, and honest that it cannot say whether a cut helped
/ce-retune audit the skills corpus, do not run the measurement loop
```

If any of the three measurement pieces is missing (archive or a harness that produces one, a build selector, a repeatable end-to-end task), the skill stops and tells you what to build.

---

## The Problem

A model upgrade can make a working corpus worse. The instinct is to read the skills and rewrite what looks off. That fails because the corpus is large enough that nobody can reason about its prose reliably, including the people who wrote it.

The failure is usually stochastic. Identical inputs produce a wide spread of outcomes. One run tells you nothing. A small sample tells you nothing. A before-and-after drawn from a handful of runs is indistinguishable from doing nothing. Fix lists assembled this way feel rigorous and are not.

## The Solution

Measure first, in a fixed order. Each step buys the right to take the next.

1. **Gate on measurability.** No archive, no build selector, no repeatable task: stop and say what to build. An audit-only pass is a legitimate request and a different one.
2. **Mine the archive.** Historical runs are a free baseline, usually larger than any experiment you can afford this week.
3. **Find the noise floor.** Two identical builds, same commit. Whatever difference appears is the floor every later claim must clear, and it sets the sample size. Register the bar in writing before any change exists.
4. **Audit adversarially.** One agent per unit proposes cuts. A second defends the existing prose from the project's learnings, tests, and git history. A defended keep leaves the list.
5. **Cut in surgical passes.** One problem per agent, disjoint file ownership, reconcile after every edit.
6. **Let the failure choose the next fix.** Where a run failed matters more than whether it did. Loop until the bar clears.

Done is a cleared bar, or a report of the claim the run could not support. A green test suite is not done. It proves nothing broke, not that behavior improved.

Word count is not the result. Leanness and performance share a corpus and are separate programs.

---

## What Makes It Novel

### Broken runs are their own bucket

Empty transcripts and error exits look like model failures and silently inflate every effect. In the engagement this skill came from, 20% of an archive was broken runs, and excluding them falsified the first headline finding. `broken` is excluded from both numerator and denominator. If broken runs pile up on one arm, that is a harness fault wearing a model-effect costume.

### Two metrics, never collapsed

"Followed the process" and "did the job" stay separate. A run can finish the task while skipping the workflow. Folded into one number, that reads as success. Kept apart, it is a distinct defect, which is how the skill caught a regression the cutting itself introduced.

### The noise floor comes before the claim

Two identical builds are compared before anything is credited. That is the step most retuning skips, and skipping it is why those results do not survive scrutiny. It also yields the cheap one-armed test: once the baseline rate is known, N consecutive clean runs has an exact probability under it, so a streak can clear a bar without a control arm.

### An adversary defends the prose

Every proposed cut faces an agent whose job is to find why that line exists. "A weaker model might need it" is not grounds for keeping. Only a citable source is. A cut with no provenance after a real search is a confident cut. A defended keep is not relitigated.

Proposal and defense need separate contexts. If the host cannot run them as separate agents, the audit stops rather than arguing both sides in one conversation and calling that an audit.

### It expects to be wrong

The write-up has to report what contradicts the premise: where defenders won, which unit was leaner than its word count implied, and where the corpus already argued against its own ceremony. Confirming a thesis you already hold teaches nothing. Hypotheses that died are recorded on purpose, so the next attempt does not rerun a dead end.

### It audits what the instrument cannot reach

A probe that never enters a phase can never fail in it. A green streak certifies only what it exercised. Unentered phases are listed and those files are read directly. Findings there weigh the same as findings from the runs.

---

## Quick Example

A pipeline that used to finish now stops partway on the new model. You invoke `/ce-retune the pipeline stops partway through on the new model`.

The skill checks for an archive, a build selector, and a repeatable task. All three are present, so it mines the archive first. Broken runs are split out. "Followed the process" and "did the job" stay separate columns. The table shows which phase runs die in.

It then runs the same commit against itself. The spread on identical builds becomes the floor. You register `bar:8` consecutive clean runs before any file is edited.

The audit proposes cuts. The defender keeps several lines with citations from tests and git history. The remaining cuts go out as one-problem, one-agent passes. After each pass the harness runs. A failure that moved to a later phase names the next target. A failure at the same site means the last cut missed.

Eight clean runs later the bar clears. Each pass is its own commit. The measurement artifacts stay with the work. `/ce-compound` gets the mechanism and the hypotheses that died.

---

## When to Reach For It

Use `ce-retune` when:

- A model upgrade made a skill corpus stall, halt, skip the workflow, or burn far more tokens
- Someone wants to rewrite skill prose to fix that behavior, and you need a measured answer
- You have (or will build) a harness that can point a run at a specific checkout of the corpus

Skip it when:

- There is no way to measure. The skill refuses rather than degrading into a static audit presented as retuning
- You want a corpus audit, not a retune. Ask for the audit directly. It is cheaper and honest about what it can conclude
- The goal is word reduction. This skill reports completion, not leanness
- The thing being optimized is not a skill corpus → `/ce-optimize`
- You already know the one-line fix in one file and do not need a measurement program. Edit it

---

## Use as Part of the Workflow

Upstream: a model upgrade, or a run archive that already shows degradation.

Downstream: `/ce-compound` records the mechanism and the hypotheses that died. `/ce-commit-push-pr` ships the per-pass commits.

Adjacent: `/ce-optimize` is a generic metric-driven loop. It knows nothing about corpora, halt classes, or noise floors.

---

## Use Standalone

Most runs start from a symptom in chat. The default corpus is `./skills`. Name another tree when that is not the one that degraded.

The skill will not be suggested by the model. You have to invoke it.

---

## Reference

| Argument | Effect |
|----------|--------|
| `<symptom>` | Starts from the failure (stall, mid-run halt, token blow-up) |
| `<target model>` | Names the model the bar will be measured on |
| `<path>` | Corpus root. Default is `./skills` |
| `bar:<n>` | Pre-register a streak of N consecutive clean runs |
| Audit-only wording | Runs the cheaper audit. It cannot say whether a cut helped |

The three pieces the gate checks:

1. A run archive, or a harness that produces one (tool-call trace, terminal marker, token counts, final message)
2. A build selector (`--plugin-dir`-style override, configurable skills path, or env var) so two checkouts are comparable
3. A repeatable task the corpus actually executes end to end

---

## FAQ

**Why not just read the skills and edit them?**
Because you cannot tell whether the edit mattered. The corpus is large, the failure is noisy, and a small before-and-after sits inside the envelope of doing nothing.

**What if I have no harness?**
The skill stops and names the missing piece. Build the harness (archive, build selector, repeatable task), then invoke again. Do not ask it to "just audit and apply."

**Is an audit-only pass allowed?**
Yes, if you ask for it as an audit. That pass can say what looks cuttable. It cannot say whether cutting helped.

**What does `bar:8` mean?**
Eight consecutive clean runs under the one-armed test, once the baseline rate is known. The bar is written down before any change exists. A bar chosen after seeing results is not a bar.

**Is a green test suite enough?**
No. Tests prove the suite still passes. They do not prove the new model finishes the workflow.

**Will another skill start this for me?**
No. `disable-model-invocation` is on. The run is expensive and refuses without a harness, so routing it automatically would turn a cheap request into a paid measurement program.

---

## See Also

- [`ce-optimize`](./ce-optimize.md): generic scored search over code or config. Use that when the thing being optimized is not a skill corpus
- [`ce-compound`](./ce-compound.md): record the mechanism and the hypotheses that died
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): ship the per-pass commits
