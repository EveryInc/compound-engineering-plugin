# `ce-optimize`

> Define a measurable goal, build a harness, try many variants, keep the ones that score better.

`ce-optimize` is an on-demand **experimentation** skill. Use it when the right change is not obvious, you can try several variants, and "better" is a number or a judged score. If you already know the change, make it. If you need a root cause, that is `ce-debug`.

It writes a spec (or loads yours), measures a baseline, then runs experiments in isolated worktrees (or via Codex when the spec says so). Wins stay on an `optimize/<spec-name>` branch. Losses revert. Every result is written to disk so a long run can survive a crash or a compacted context.

Karpathy's autoresearch is the nearest ancestor. This version is for multi-file code changes and for non-ML work: clustering, search, prompts, build time, latency, anything you can score the same way twice.

Skip it when you already know the change, when you are hunting a root cause, or when nothing can be measured.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Writes or loads a spec, measures a baseline, runs experiments against gates and (when needed) an LLM judge, keeps the best, stops on a rule you set |
| When to use it | Many plausible variants, a repeatable harness, and a metric or rubric that "better" can be scored against |
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

Guess-and-check tries one change at a time and never sees the wider set. A convenient proxy (cluster count, response length) can improve while real quality falls. Degenerate answers look perfect on paper: one giant cluster, a 100% score that means nothing. Multi-hour runs die in chat and take the results with them.

A bug hunt is a different job. If you need a causal chain, that is `ce-debug`.

## The Solution

The loop is spec, baseline, experiments, keep or revert:

- A YAML spec names the metric, gates, mutable files, measurement command, and stop rules. A description in the prompt becomes that spec through a short interview.
- Evaluation is three layers: cheap degenerate gates, then the real metric or judge, then diagnostics that are logged and not gated.
- Independent variants run in their own worktrees. If worktrees are unavailable, the same experiments run one at a time.
- After a batch, the best merge lands on the optimization branch. A runner-up that touched different files can be cherry-picked and re-measured.
- The experiment log on disk is the record. Chat is for you; it is not storage.
- Phase 1 is a hard gate. Baseline, harness, parallelism probe, worktree budget, and any judge-cost estimate need an explicit go-ahead before experiments start.

---

## What Makes It Novel

### Three-layer scoring, so a proxy cannot win alone

Gates run first and are cheap. "Everything in one cluster" or "0% tests pass" dies there, before a judge is paid. For qualitative work the loop then scores sampled outputs against a rubric. Diagnostics (counts, timing, cost) explain a score change without becoming the thing being optimized.

Hard metrics belong on targets where higher or lower is unambiguously better: build time, latency, test pass rate, memory. Judge mode belongs on clustering, search, prompts, and anything a human would have to look at. If you insist on a hard metric for a qualitative target, the skill warns and continues.

### A judge that sees the output space, not one lucky slice

Judge runs bucket the output (large, mid, small, singletons, or the equivalent for search or summaries), sample across buckets, and score on a 1-5 rubric with concrete levels. Singletons are sampled on their own when coverage matters, so missed groupings show up. `max_total_cost_usd` caps spend; uncapped spend needs an explicit yes.

### Disk is the run, not the chat

Each result is appended to the experiment log as soon as it is measured, then read back. A `result.yaml` in the experiment worktree covers the gap if the orchestrator dies before the log update. On resume the log is the source of truth; leftover markers are recovered into it.

The files under `.context/compound-engineering/ce-optimize/<spec-name>/` are local scratch. They are gitignored, so they survive a resume on this machine and do not travel with the branch.

### Parallel isolation, then file-disjoint combines

Each experiment owns a worktree and a branch. Merges are serial. After the winner lands, runners-up that edited completely different files can be combined and scored again, up to a cap. A combo that is not strictly better is reverted and logged as promising alone but neutral or harmful together.

After each batch a strategy digest (categories tried, what worked, what is still untried, current best) steers the next hypotheses. The digest is working state for the loop, not a kept deliverable.

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

- Several variants are plausible and you do not already know which one wins
- You have a repeatable measurement command, or you can build one
- "Better" is a hard metric or a rubric two judges would score similarly
- A naive proxy would be easy to game (one giant cluster, a longer summary that is worse)

Skip it when:

- You already know the change → make it, or use `/ce-work`
- You are tracing a bug to its cause → `/ce-debug`
- Nothing can be measured or judged the same way twice
- There is only one plausible answer, so a search is theater
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
- Resume or fresh start: `/ce-optimize .context/compound-engineering/ce-optimize/<spec-name>/spec.yaml`

Templates live next to the skill: `references/example-hard-spec.yaml` and `references/example-judge-spec.yaml`. The friendly overview of hard vs judge, plus longer kickoff prompts, is `references/usage-guide.md`.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks "What would you like to optimize?" then writes the spec with you |
| `<description>` | Same interview, seeded with that goal |
| `<spec.yaml path>` | Loads and validates the spec, then starts setup |
| Existing `.context/.../spec.yaml` | If `optimize/<spec-name>` already exists, offers Resume (continue from the log) or Fresh Start (archive the old branch) |

In-scope files must be clean before measurement. Uncommitted changes in the spec's mutable or immutable paths have to be committed or stashed.

`execution.backend: codex` (in the spec, not as a prompt flag) sends each experiment to `codex exec`. If you are already inside a Codex sandbox, or `.git` is not writable, it falls back to subagents. Three Codex failures in a row disable that backend for the rest of the run.

First-run defaults worth keeping until the harness is trusted: `execution.mode: serial`, `max_concurrent: 1`, `max_iterations: 4`, `max_hours: 1`. For judge mode: `sample_size: 10`, `batch_size: 5`, `max_total_cost_usd: 5`.

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
The `optimize/<spec-name>` branch, with a commit per kept experiment. The spec and experiment log stay under `.context/compound-engineering/ce-optimize/<spec-name>/` on this machine. That directory is gitignored.

**Does it debug?**
No. It searches a scored design space. A failing test, a stack trace, or "why is this wrong" is `/ce-debug`.

---

## See Also

- [`ce-debug`](./ce-debug.md): root-cause a known failure; do not use optimize as a substitute
- [`ce-code-review`](./ce-code-review.md): wrap-up option for the cumulative diff
- [`ce-compound`](./ce-compound.md): write the winning strategy down as a learning
- [`ce-retune`](./ce-retune.md): measurement-first retuning of a skill corpus, not a generic optimize loop
- [`ce-worktree`](./ce-worktree.md): manual worktrees if you want isolation outside this loop
