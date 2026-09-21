# `ce-optimize`

> Keep confirmed improvements to a measurable target. Attribute a named-workload cost, or search a scored variant space.

`ce-optimize` is an on-demand **optimization** skill. The goal is confirmed improvements on an `optimize/<spec-name>` branch, not a one-shot edit. A first run stays short and serial until the harness is trusted; a harder target spends longer in the same phases. On a cost target (latency, CPU, memory, throughput, I/O, wall time), it attributes shares before it tries implementation experiments. On a scored variant space (judge, clustering, search, prompts, a multi-objective that is not a single hotspot), it searches and keeps. If you already know the change, make it. If you need a root cause, that is `ce-debug`.

It writes a spec (or loads yours) and measures a baseline. Then it runs the next cheapest action that would change what gets implemented: a locating measurement, or experiments in isolated worktrees (or via Codex when the spec says so). Wins stay on an `optimize/<spec-name>` branch. Losses revert. It writes every result to disk, so a long run survives a crash or a compacted context.

It handles multi-file code changes and non-ML work alike: clustering, search, prompts, build time, latency, anything you can score the same way twice.

Skip it when you already know the change, when the job is diagnosis, or when nothing can be measured.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Writes or loads a spec, measures a baseline, attributes cost or searches scored variants against gates and (when needed) an LLM judge, keeps the best, stops on a rule you set |
| When to use it | A named-workload cost you can attribute, or many plausible variants, plus a repeatable harness and a metric or rubric that "better" can be scored against |
| What it produces | An `optimize/<spec-name>` branch with kept commits, plus a spec and experiment log under `.context/compound-engineering/ce-optimize/<spec-name>/` |
| What's next | Review the cumulative diff, capture the winning strategy, open a PR, keep experimenting, or stop |

---

## Example invocations

Plain-language goals build a spec with you. A YAML path skips that conversation and runs the file you already reviewed.

```text
# Asks what to optimize, then writes the spec with you
/ce-optimize

# Hard metric: smaller is better, as long as the build stays green
/ce-optimize reduce build time by 30%

# Expensive suite: several required hard targets, cheap screening first
/ce-optimize reduce full-suite wall time without raising CI critical path or runner-minutes

# Smallest memory limit that stays stable under the same load test
/ce-optimize find the smallest memory setting that keeps this service stable under our load test

# Qualitative target. Expect type: judge, not "more clusters"
/ce-optimize improve clustering quality for notification categories

# Cheaper prompt, judged for the downstream job, not for length
/ce-optimize cheaper summarization prompt that still clusters related issues correctly

# Existing spec: validate it, then start from setup
/ce-optimize path/to/clustering-quality.yaml

# Resume vs fresh start if optimize/<spec-name> already exists
/ce-optimize .context/compound-engineering/ce-optimize/clustering-quality/spec.yaml
```

Pass a spec when the metric, gates, budget, or stop rule need a review before any experiment runs. First runs should stay serial and short until the harness is trusted.

---

## The Problem

Guess-and-check tries one change at a time and never sees the wider set. Repeating an end-to-end total without attributing shares spends the same measurement on work that cannot move the number. A convenient proxy (cluster count, response length) can improve while real quality falls. Degenerate answers look perfect on paper: one giant cluster, a 100% score that means nothing. Multi-hour runs die in chat and take the results with them.

A bug hunt is a different job. If you need a causal chain, that is `ce-debug`.

## The Solution

The next action is the cheapest step that would change what gets implemented. The loop is spec, baseline, then either locating work or experiments, then keep or revert:

- A YAML spec names the metric, optional extra required objectives, gates, mutable files, measurement command, and stop rules. A description in the prompt becomes that spec through a short interview.
- Evaluation is three layers: cheap degenerate gates, then the real metric or judge, then diagnostics that are logged and not gated. When the spec lists `metric.objectives`, an experiment is eligible if it improves one required objective without violating the others; the run is not done until every declared required target is met.
- Expensive harnesses use `stability.mode: ladder`: smoke, one paired exploratory sample, extra samples only when promising or inconclusive, and the full confirmation protocol only before a keep.
- Independent variants run in their own worktrees. If worktrees are unavailable, the same experiments run one at a time.
- After a batch, the best merge lands on the optimization branch. A runner-up that touched different files can be cherry-picked and re-measured.
- The experiment log on disk is the record. Chat focuses on findings, decisions, blockers, and results, with occasional updates during longer work. Approval requests explain scope, evidence, and limits in plain language and link the saved details.
- Before experiments start, you approve the starting measurements, behavior checks, planned scope, and any scoring cost. The measurement method and full execution checks remain available in the linked evidence.

---

## What Makes It Novel

### Three-layer scoring, so a proxy cannot win alone

Gates run first and are cheap. "Everything in one cluster" or "0% tests pass" dies there, before a judge is paid. For qualitative work the loop then scores sampled outputs against a rubric. Diagnostics (counts, timing, cost) explain a score change without becoming the thing being optimized.

Hard metrics belong on targets where higher or lower is unambiguously better: build time, latency, test pass rate, memory. Judge mode belongs on clustering, search, prompts, and anything a human would have to look at. If you insist on a hard metric for a qualitative target, the skill warns and continues.

### A judge that sees the output space, not one lucky slice

Judge runs bucket the output (large, mid, small, singletons, or the equivalent for search or summaries), sample across buckets, and score on a 1-5 rubric with concrete levels. Singletons are sampled on their own when coverage matters, so missed groupings show up. `max_total_cost_usd` caps spend; uncapped spend needs an explicit yes.

### Disk is the run, not the chat

The loop appends each result to the experiment log the moment it is measured, then reads it back. A `result.yaml` in the experiment worktree covers the gap if the orchestrator dies before the log update. On resume the log is the source of truth; leftover markers are recovered into it.

The spec, log, and digest live under the run's state root. When the harness names a durable store that outlives the session and the checkout, that is the root; otherwise it is `.context/compound-engineering/ce-optimize/<spec-name>/`, which is gitignored and survives a resume on this machine only. Neither root travels with the branch; the wrap-up report does.

### Long runs: ticks, wakes, and two clocks

Phase 3 runs in ticks. A tick is one batch: select, dispatch, collect, decide, checkpoint, check the stop rules. In an ordinary session the ticks follow one another and the run looks exactly as it always did. On a harness that can wake the agent after its turn ends (an event subscription, a durable timer), a tick whose experiments are still running may end the turn instead of blocking on them: the log records each pending wait and what to do when it lands, the wake fires, and the next turn resumes from the log without asking you again. Your Phase 1 approval is recorded in the log, bound to a digest of the spec and the caps you approved; the gate comes back only if the spec or a cap changed.

Two clocks bound such a run. `stopping.max_hours` counts active time inside ticks. `stopping.max_wall_hours` (default 72) is a calendar backstop from the moment experiments begin; nothing extends it. A judge run that waits between ticks must carry a `max_total_cost_usd` cap, because nobody is watching the spend.

### Parallel isolation, then file-disjoint combines

Each experiment owns a worktree and a branch. Merges are serial. After the winner lands, the loop combines runners-up that edited completely different files and scores them again, up to a cap. A combo that is not eligible on the re-measurement is reverted and logged as promising alone but neutral or harmful together.

After each batch a strategy digest (categories tried, what worked, what is still untried, current best) steers the next hypotheses. The digest is working state for the loop, not a kept deliverable.

### Opportunity estimates carried through to measured results

Before implementation, every hypothesis carries an opportunity record: workload, observed cost or rubric evidence, expected benefit with units and a comparison baseline, confidence, and implementation/measurement cost and behavioral risk. Estimates can be ranges or upper bounds. Unknown benefits stay unknown with a proposed measurement to resolve them. An unknown may sit on the backlog; it is not a runnable implementation experiment on a cost target while a cheaper locating measurement would change keep or skip. A scored variant space uses rubric evidence and does not require a performance profile or invented numerical forecasts.

Selection favors credible benefit relative to cost and risk. The priority label does not rank the backlog, and there is no required hypothesis count. Each experiment retains its original forecast and the actual measured comparison identities. Standalone and combined results remain separate, so a runner-up's isolated improvement is not mistaken for its contribution after integration.

Wrap-up reports every required objective from original baseline to confirmed final, each retained change's estimate versus measured contribution, uncertainty and correctness evidence, and remaining opportunities. Percentages are used only where meaningful, and successive gains are not added. Older logs still work: missing estimates and attribution evidence are reported as unrecorded.

### The harness is checked before it is trusted

Before the baseline, Phase 1 checks that the harness does not reward a trivial shortcut: the agent builds an empty or constant output itself and confirms it scores worse than real output. You are asked for nothing when the target is measured objectively (CI time, bundle size, a pass rate over fixed cases). Where the score is a judgment, the check also uses the good and bad examples the project already has, and asks you only for what is missing. Checking a judge against your own scores is optional and the run assumes you want it automated. Once the baseline has been judged the agent offers the check once, before it tells you any of the judge's scores. Say yes and it shows you the baseline outputs in plain chat, two or three at a time, and you reply with a score for each and a few words on why if you like; it records the answers and compares them with the judge's (80% agreement by default). About ten items and a few minutes is enough, you can stop whenever you like, and you never edit a file. Decline and the approval message tells you in plain terms what was skipped. The one exception is a judge run that continues unattended between ticks, which needs the labels or your explicit waiver. The result is recorded in the log as `harness_validation`, and the approval message states which checks ran.

A held-out set (`measurement.holdout.command`, or a second judge seed via `metric.judge.confirmation_seed`) is scored only before a keep and at final confirmation. The loop never selects from it or generates hypotheses from it, so a gain that only exists on the selection sample does not get kept. It is required for judge runs and for runs that wait between ticks on a wake after the turn ends; elsewhere it is optional and the approval message says plainly when it is missing.

Judge output carries a `feedback` line per item saying what is wrong and what would fix it. The strategy digest groups that feedback into failure themes, and the next hypotheses come from the themes rather than from a rule per failing item. Identical outputs are judged once per run (a content-hash cache), and cost, tokens, and latency are logged per experiment when the harness reports them.

### Optimizing instruction text

A skill, an agent-instructions file, a persona, or a tool description can be the mutable scope like any other file. What changes is the eval: `references/text-targets.md` covers building the case set from recorded failures (input, what you wanted, what went wrong, the output), the coverage rule that every rule you want kept needs a case that fails without it, and the hypothesis moves (add examples, bootstrap examples from passing runs, rewrite from feedback, shorten under a token objective, restructure, decompose, vote, or run an external optimizer as one experiment when the project has one). The task model the text will run under is pinned by the harness; the proposer may be stronger. A perfect score means the case set is too easy, and the run stops and says so rather than tightening the rubric. `references/example-text-target-spec.yaml` is a complete spec of this shape, with per-case regression reporting and a holdout case file.


---

## Quick Example

You want better clustering on notification categories. Today's run makes 12 clusters and some of them look weak.

You invoke `/ce-optimize clustering quality on notification categorization`. The skill treats this as qualitative and recommends `type: judge`, because optimizing cluster count would reward the wrong thing. You set strata (largest, mid, small, plus singletons), a 1-5 rubric, and gates such as `solo_pct <= 0.95` and `max_cluster_size <= 500`. For a first run it recommends serial mode and a 4-iteration cap.

Phase 1 measures the baseline, looks up prior optimization learnings, probes parallelism, and asks you to approve the judge-cost estimate. You approve.

Phase 2 proposes a backlog of hypotheses (signal extraction, embeddings, algorithm, parameters). One needs a new dependency; you approve the list in bulk.

Phase 3 runs in batches. Each experiment gets a worktree, applies the change, runs gates, then the judge if the gates pass. Results hit disk immediately. The best of the batch merges; file-disjoint runners-up are re-measured on top of it.

After four iterations the judge score is up 1.2 and three experiments sit on the kept branch. Wrap-up offers review, a learning write-up, a PR, more experiments, or stop.

---

## When to Reach For It

Use `ce-optimize` when:

- A named workload has a cost you can attribute, even if the first action is locating rather than a batch of variants
- Several variants are plausible and you do not already know which one wins
- You have a repeatable measurement command, or you can build one
- "Better" is a hard metric or a rubric two judges would score similarly
- A naive proxy would be easy to game (one giant cluster, a longer summary that is worse)

Skip it when:

- You already know the change → make it, or use `/ce-work`
- You are tracing a bug, or why something is slow → `/ce-debug`
- Nothing can be measured or judged the same way twice
- The target is a scored variant space with only one plausible answer, so a search decides nothing
- Each evaluation is so expensive that multiple runs cannot pay for themselves

---

## Use as Part of the Workflow

This skill is its own loop. It still hands off:

- A brainstorm or plan that is really "make X better" is the usual reason to come here
- It reads prior optimization learnings before inventing a strategy
- After the loop: `/ce-code-review` on baseline-to-final, `/ce-compound` for the winning strategy, or a PR from `optimize/<spec-name>`
- You can resume later from the branch and the local experiment log

---

## Use Standalone

Most runs start here, not from another skill.

- Description: `/ce-optimize reduce build time by 30%`
- Reviewed spec: `/ce-optimize path/to/spec.yaml`
- Resume or fresh start: `/ce-optimize <state-root>/spec.yaml` (the state root is `.context/compound-engineering/ce-optimize/<spec-name>/` unless the harness gave the run a durable store)

Templates live next to the skill: `references/example-hard-spec.yaml` for a cheap single metric, `references/example-judge-spec.yaml` when quality needs a rubric, `references/example-expensive-benchmark-spec.yaml` when each run costs minutes or several hard targets must all hold, and `references/example-text-target-spec.yaml` when the mutable files are instruction text. The overview of hard vs judge, plus longer kickoff prompts, is `references/usage-guide.md`.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks "What would you like to optimize?" then writes the spec with you |
| `<description>` | Same interview, seeded with that goal |
| `<spec.yaml path>` | Loads and validates the spec, then starts setup |
| Existing `<state-root>/spec.yaml` | If the run's log already exists, offers Resume (continue from the log) or Fresh Start (archive the old branch). A run parked between ticks resumes without asking |

In-scope files must be clean before measurement. Uncommitted changes in the spec's mutable or immutable paths have to be committed or stashed.

`execution.backend: codex` (in the spec, not as a prompt flag) sends each experiment to `codex exec`. If you are already inside a Codex sandbox, or `.git` is not writable, it falls back to subagents. Three Codex failures in a row disable that backend for the rest of the run.

`execution.backend: remote` sends each experiment to a detached worker with its own checkout, on a harness that offers one (a cloud-agent launch whose work lands as a pushed branch or a store file). The worker implements the hypothesis, measures baseline and candidate paired on its own machine, and pushes `optimize-exp/<spec-name>/exp-NNN` with a `result.yaml`. The orchestrator collects that, runs `decide.mjs` on the pair, and before any keep re-measures the candidate itself or through a worker that did not write it. The spec must use a `relative` or `paired` comparison, because absolute numbers from different machines are not comparable. `max_concurrent` caps dispatched workers, and the parallelism probe and worktree budget do not apply. Without a detached-worker capability the run uses `worktree`.

First-run limits are ceilings, not estimates of how long the work will take. The one-hour limit starts when experiments begin, excluding setup and baseline measurement, and counts only active time inside ticks. `stopping.max_wall_hours` (default 72) is the calendar backstop for runs that park between ticks; `execution.max_experiments_per_tick` optionally caps how much one tick dispatches. Defaults worth keeping until the measurement method is trusted: `execution.mode: serial`, `max_concurrent: 1`, `max_iterations: 4`, `max_hours: 1`. For judge mode: `sample_size: 10`, `batch_size: 5`, `max_total_cost_usd: 5`.

Spec schema: `references/optimize-spec-schema.yaml`. Experiment log schema: `references/experiment-log-schema.yaml`.

---

## FAQ

**When should I use a hard metric vs an LLM judge?**
Hard metrics when higher or lower is unambiguously better (build time, pass rate, latency). Judge when a person would have to look at the output (clustering, search, prompts). For qualitative work, a hard metric alone will optimize a proxy.

**What is a degenerate gate?**
A cheap check that rejects a broken solution before the expensive score. "All items in one cluster" is the classic. If any gate fails, the experiment is `degenerate` and the judge does not run.

**What if an experiment needs a new dependency?**
Hypothesis generation collects unique new deps and asks for one bulk approval. Unapproved hypotheses stay in the backlog, are skipped during the loop, and come back at wrap-up.

**Can it run on Codex instead of subagents?**
Yes, via `execution.backend: codex` in the spec. It falls back to subagents when Codex sandboxing is not usable from this context.

**What is still there after the run?**
The `optimize/<spec-name>` branch, with a commit per kept experiment and the wrap-up report at `<docs root>/optimize/<spec-name>-report.md`. The spec and experiment log stay under the run's state root: `.context/compound-engineering/ce-optimize/<spec-name>/` on this machine (gitignored), or the harness's durable store when it named one.

**Can a run outlive my session?**
Only on a harness that can wake the agent after its turn ends. There the loop parks between ticks with its pending waits in the log and resumes on the wake; your Phase 1 approval is not asked again unless the spec or a cap changed. Everywhere else the loop runs inside the session as before, and a wait it cannot hold ends the turn with a resume invocation you can run later or from a scheduler.

**Can I optimize several hard targets at once?**
Yes. Put them in `metric.objectives` as `role: required`. An experiment that improves one required target without regressing the others is eligible. The loop is not done until every declared required target is met. A spec that omits `objectives` still uses the single primary metric.

**What if each measurement takes minutes?**
Use `stability.mode: ladder` and a relative or paired comparison. The five-run protocol is for baseline, a candidate you are about to keep, and final confirmation, not for every exploratory try. See `references/example-expensive-benchmark-spec.yaml`.

**Why does it want a held-out set?**
Every experiment is selected on the same sample, so over many experiments the kept changes drift toward whatever scores well on that sample. Scoring the winner once more on data the loop never saw before keeping it is what separates a real gain from a fit to the sample. Judge runs, and runs that wait between ticks on a wake after the turn ends, require one; other runs get a plain warning at approval when it is missing.

**Why calibrate the judge?**
A rubric is a guess about what a person would score until it has been checked against people. Scoring about ten real outputs yourself is enough to see whether the judge agrees with you often enough (80% by default) to be optimized against, and twenty to fifty makes that figure dependable; without the check the loop will learn the judge's quirks as readily as real quality. It only applies to judge-scored targets, the agent walks you through it, and it is optional: skip it and the approval message says what was skipped. A judge run that continues unattended needs the labels or an explicit waiver, which is recorded in the log.

**Which model does the judge use?**
`metric.judge.model` is a capability tier, `cheap` or `strong`, and the harness you are running in picks the concrete model. Specs that still say `haiku` or `sonnet` are read as `cheap` and `strong`.

**Are numbers from remote workers comparable?**
Only within one machine. Each remote worker measures the baseline commit and its candidate on the same machine, so its pair is a valid comparison; two workers' absolute numbers are not compared to each other or to yours. That is why `remote` requires a `relative` or `paired` comparison, and why a keep needs a second pairing the candidate's author did not produce; when a held-out set is configured, that same independent measurement is where the holdout runs.

**Does it debug?**
No. It attributes a named-workload cost or searches a scored variant space. A failing test, a stack trace, or "why is this wrong" is `/ce-debug`.

---

## See Also

- [`ce-debug`](./ce-debug.md): root-cause a known failure; do not use optimize as a substitute
- [`ce-code-review`](./ce-code-review.md): wrap-up option for the cumulative diff
- [`ce-compound`](./ce-compound.md): write the winning strategy down as a learning
- [`ce-retune`](./ce-retune.md): measurement-first retuning of a skill corpus, not a generic optimize loop
- [`ce-worktree`](./ce-worktree.md): manual worktrees if you want isolation outside this loop
