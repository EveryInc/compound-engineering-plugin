# `ce-optimize`

> Run metric-driven iterative optimization loops — define a measurable goal, build measurement scaffolding, run parallel experiments that try many approaches, keep improvements, converge toward the best.

`ce-optimize` is the **measurement-driven experimentation** skill. It's for problems where the right change isn't obvious, you can generate several plausible variants, you have a repeatable measurement harness, and "better" can be expressed as a hard metric or an LLM-as-judge evaluation. The skill defines a goal, builds the measurement loop, runs experiments in parallel worktrees (or via Codex), keeps wins, reverts losses, and persists every result to disk so a multi-hour run survives context compaction and crashes.

Inspired by Karpathy's autoresearch, generalized for multi-file code changes and non-ML domains. Real uses include clustering quality, search relevance, build performance, prompt quality, latency tuning, and anywhere the optimization target benefits from systematic experimentation rather than guess-and-check.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Defines an optimization spec, establishes a baseline, runs parallel experiments measured against gates and/or an LLM judge, keeps the best, iterates until a stopping criterion fires |
| When to use it | Clustering, search, prompts, build performance — any measurable outcome where the right change isn't obvious and many approaches are worth trying |
| What it produces | A `optimize/<spec-name>` git branch with kept experiments merged in, plus an experiment log and strategy digest in `.context/compound-engineering/ce-optimize/<spec-name>/` |
| What's next | `/ce-code-review` on the cumulative diff; `/ce-compound` to capture the winning strategy; create a PR |

---

## The Problem

For optimization-shaped problems, the common failure modes:

- **Guess-and-check** — try one change, measure, tweak; never see the wider design space
- **Optimizing the proxy, not the target** — improve a hard metric (cluster count, response length) that doesn't actually correlate with quality
- **Lost results** — multi-hour runs crash, context compacts, results live only in the chat and are gone
- **Symptom over root cause** — a fix improves the metric but doesn't generalize because it tuned a flaky proxy
- **Degenerate solutions** — "100% accuracy" because the algorithm groups everything into one bucket
- **Sequential when parallel would work** — running experiments one at a time when worktree isolation could test five in parallel

## The Solution

`ce-optimize` runs experimentation as a structured loop with explicit gates:

- **Spec-driven** — a YAML spec defines the metric, gates, scope, measurement command, and stopping criteria (or the skill helps you write one interactively)
- **Three-tier evaluation** — degenerate gates (cheap, hard) → LLM-as-judge (when quality requires semantic understanding) → diagnostics (logged, not gated)
- **Persistence discipline** — the experiment log on disk is the source of truth; every result is written and verified before the next experiment starts
- **Worktree-isolated parallel experiments** — independent variants run concurrently in their own worktrees, each on its own branch
- **File-disjoint runner-up cherry-picks** — multiple winning experiments that touched different files are combined and re-measured to find compounding improvements
- **Strategy digest** — compressed learnings from each batch feed into hypothesis generation for the next
- **Crash recovery** — per-experiment `result.yaml` markers in worktrees enable resume after any kind of interruption

---

## What Makes It Novel

### 1. Three-tier evaluation — degenerate gates, judge, diagnostics

Rather than a single metric, `ce-optimize` evaluates each experiment in three layers:

- **Degenerate gates** (hard, cheap, fast) — catch obviously broken solutions before paying for expensive evaluation. Examples: "all items in 1 cluster", "0% test pass rate". Run first; if any gate fails, skip the rest.
- **LLM-as-judge** (the actual optimization target for qualitative work) — sample outputs, score them against a rubric, aggregate. This is what the loop optimizes when "better" requires semantic understanding.
- **Diagnostics** (logged, not gated) — distribution stats, counts, timing, cost. Useful for understanding *why* a judge score changed without polluting the optimization signal.

The three-tier approach prevents the most common failure: optimizing a proxy that doesn't track real quality.

### 2. LLM-as-judge for qualitative outputs

For problems like clustering, search relevance, or prompt quality where hard metrics mislead, the skill uses stratified sampling and a rubric to evaluate outputs:

- **Stratified sampling** — bucket the output space (e.g., "top by size", "mid range", "small clusters", "singletons"), sample across all buckets so the judge sees representative quality
- **Rubric-driven scoring** — 1-5 scale with concrete level descriptions; supplementary fields (`distinct_topics`, `outlier_count`) for diagnostic value
- **Singleton evaluation** — when coverage matters, sample singletons separately to catch false negatives (items that should have been grouped)
- **Cost capping** — `max_total_cost_usd` caps total judge spend; uncapped spend requires explicit user approval

### 3. Persistence discipline — disk is the source of truth

Multi-hour runs cannot trust in-memory state. The skill enforces six mandatory disk checkpoints (CP-0 through CP-5): spec saved, baseline recorded, hypothesis backlog written, each experiment result appended **immediately** after measurement, batch summaries with strategy digest, final state. After every write, the file is read back to verify — silent write failures are caught, not propagated.

> **If you produce a results table without writing those results to disk first, you have a bug.** Conversation context is for the user; the experiment log file is for durability.

### 4. Parallel experiments in worktree isolation

For independent hypotheses, the skill creates per-experiment worktrees on their own branches. Each subagent works in isolation; merges happen serially in dependency order; predicted overlaps surface as merge conflicts the orchestrator handles explicitly. No shared-directory git index contention, no test interference between concurrent experiments.

When worktree isolation isn't available (some platforms), execution falls back to serial subagents — same correctness, less parallelism.

### 5. File-disjoint runner-up cherry-picks

After a batch finishes, the skill ranks experiments by improvement. The best is kept on the optimization branch. Then runners-up are checked for **file-level disjointness** with the kept experiment — if a runner-up touched completely different files, it's cherry-picked onto the new baseline and re-measured. If the combined measurement is strictly better, it's kept; otherwise reverted with a "promising alone but neutral/harmful in combination" log entry. Up to a configurable cap per batch.

### 6. Strategy digest — compressed learnings drive hypothesis generation

After each batch, a strategy digest is written to disk: categories tried with success/failure counts, key learnings, exploration frontier (untried categories), current best metrics. The next batch's hypothesis generation reads the digest (not the agent's memory) — keeping the loop steered by accumulated evidence rather than recency bias.

### 7. Crash recovery and resume

Every experiment writes a `result.yaml` marker in its worktree immediately after measurement, before the orchestrator updates the main log. On resume (Phase 0.4), the skill scans worktrees for markers not yet in the log and recovers any measured-but-unlogged experiments. The optimization branch survives; the experiment log on disk survives; you pick up where you left off.

### 8. Hard-gate before Phase 2

Phase 1 is a hard gate — the skill establishes baseline metrics, validates the measurement harness, runs a parallelism readiness probe, checks the worktree budget, and surfaces the judge cost estimate (or flags uncapped spend) for explicit approval before any experiments dispatch. No surprise cost or runaway loops.

---

## Quick Example

You want to improve clustering quality on a notification-categorization feature. The current approach groups everything into 12 clusters; some look weak.

You invoke `/ce-optimize "clustering quality on notification categorization"`. The skill detects this is qualitative — recommends `type: judge` because hard metrics like cluster count would optimize a misleading proxy. Walks you through defining stratified sampling (top by size, mid range, small clusters, plus singletons), the rubric (1-5 with concrete level descriptions), and the gates (`solo_pct <= 0.95`, `max_cluster_size <= 500`). Recommends serial mode and 4-iteration cap for the first run.

Phase 1 runs the measurement harness on baseline, dispatches `ce-learnings-researcher` for prior optimization context, runs the parallelism probe, and asks for explicit approval given the judge cost estimate. You approve.

Phase 2 generates 18 hypotheses (signal-extraction, embedding, algorithm, parameter-tuning categories). One needs a new dependency; you bulk-approve.

Phase 3 runs in batches. Each experiment gets its own worktree, applies the change, runs the measurement harness, evaluates degenerate gates first (cheap), runs the judge on stratified samples (when gates pass), writes results to disk immediately, then proceeds to evaluation. The best of each batch merges to the optimization branch; file-disjoint runners-up are cherry-picked and re-measured.

After 4 iterations, the judge score has improved by 1.2 points and three experiments combined into the kept branch. Phase 4 surfaces post-completion options: code review, capture the winning strategy via `/ce-compound`, or create a PR.

---

## When to Reach For It

Reach for `ce-optimize` when:

- The right change isn't obvious up front
- You can generate several plausible variants
- You have a repeatable measurement harness (or can build one)
- "Better" can be expressed as a hard metric or an LLM-as-judge evaluation
- The optimization target risks proxy gaming (qualitative outputs, degenerate solutions)

Skip `ce-optimize` when:

- You already know the right change — just make it
- The change is one-shot with no measurement harness possible
- "Better" can't be measured or judged consistently — optimization needs a signal

---

## Use as Part of the Workflow

`ce-optimize` is its own loop, but it interlocks with the chain:

- **Triggered from a brainstorm or plan** — when the work is "make X better" rather than "build X new", the brainstorm or plan often surfaces optimization as the right shape
- **Calls `ce-learnings-researcher`** during Phase 0.3 to consult `docs/solutions/` for prior optimization work on similar topics
- **Hands off to `/ce-code-review`** at Phase 4.3 — the cumulative diff (baseline to final) gets reviewed before merging
- **Hands off to `/ce-compound`** to document the winning strategy as institutional learning

The branch (`optimize/<spec-name>`) and experiment log are preserved through Phase 4 — you can resume, audit, or extend the optimization later.

---

## Use Standalone

`ce-optimize` is most often standalone — long-running optimization is its own activity:

- **From a spec** — `/ce-optimize path/to/spec.yaml` (use `references/example-hard-spec.yaml` or `references/example-judge-spec.yaml` as starting points)
- **From a description** — `/ce-optimize "reduce build time by 30%"` walks you through writing the spec interactively
- **Resume an existing run** — `/ce-optimize <spec-name>` detects the existing branch and offers Resume vs Fresh Start

For a friendly overview of what the skill is for, when to use hard metrics vs LLM-as-judge, and example kickoff prompts, see `references/usage-guide.md`.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks for the optimization goal |
| `<spec.yaml path>` | Loads and validates the spec, runs from Phase 0 |
| `<description>` | Walks through interactive spec creation |

Spec schema: `references/optimize-spec-schema.yaml`. Experiment log schema: `references/experiment-log-schema.yaml`. Example specs: `references/example-hard-spec.yaml` (hard metric), `references/example-judge-spec.yaml` (LLM-as-judge).

For first runs, recommended starting point: `execution.mode: serial`, `max_concurrent: 1`, `max_iterations: 4`, `max_hours: 1`. For judge mode: `sample_size: 10`, `batch_size: 5`, `max_total_cost_usd: 5`. Tighten once the measurement harness is trusted.

---

## FAQ

**When should I use hard metrics vs LLM-as-judge?**
Hard metrics for objective targets where higher/lower is unambiguously better (build time, test pass rate, latency). LLM-as-judge for qualitative targets where a human reviewer would need to look at the output to say "this is better" (clustering quality, search relevance, prompt quality). When in doubt for qualitative work, use judge — hard metrics alone optimize misleading proxies.

**Why six disk checkpoints?**
Because the skill runs for hours and context can be lost at any moment. Every checkpoint writes the file and reads it back to verify — silent write failures don't propagate. The most important is CP-3 (each experiment result appended immediately after measurement, before evaluating the next).

**What's a degenerate gate?**
A cheap, hard, fast check that catches obviously broken solutions. "All items in 1 cluster" is a degenerate gate for clustering — it would score perfectly on some hard metrics but is clearly wrong. Gates run first; if any fail, the experiment is rejected without paying for the expensive judge evaluation.

**What if my optimization needs a new dependency?**
The hypothesis generation phase collects all unique new dependencies and asks for bulk approval before the loop starts. Hypotheses with unapproved deps are skipped and re-presented at wrap-up.

**Can it run on Codex instead of subagents?**
Yes — `execution.backend: codex` dispatches each experiment to a Codex sandbox via `codex exec`. Falls back to subagent dispatch if Codex sandboxing isn't usable from the current context (already inside a Codex sandbox, no write permission to `.git`).

**What gets preserved after the run?**
The optimization branch (`optimize/<spec-name>`) with all kept-experiment commits is preserved. The experiment log and strategy digest stay in `.context/compound-engineering/ce-optimize/<spec-name>/` for local resume and audit (`.context/` is gitignored, so they don't travel with the branch).

---

## See Also

- [`ce-code-review`](./ce-code-review.md) — Phase 4.3 hand-off for reviewing the cumulative diff
- [`ce-compound`](./ce-compound.md) — capture the winning strategy as institutional learning
- [`ce-worktree`](./ce-worktree.md) — manual worktree creation if you want to set up isolation outside the optimize loop
