---
name: ce:optimize
description: "Run metric-driven iterative optimization loops. Define a measurable goal, build measurement scaffolding, then run parallel experiments that try many approaches, measure each against hard gates and/or LLM-as-judge quality scores, keep improvements, and converge toward the best solution. Use when optimizing clustering quality, search relevance, build performance, prompt quality, or any measurable outcome that benefits from systematic experimentation. Inspired by Karpathy's autoresearch, generalized for multi-file code changes and non-ML domains."
argument-hint: "[path to optimization spec YAML, or describe the optimization goal]"
---

# Iterative Optimization Loop

Run metric-driven iterative optimization. Define a goal, build measurement scaffolding, then run parallel experiments that converge toward the best solution.

## Interaction Method

Use the platform's blocking question tool when available (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present numbered options in chat and wait for the user's reply before proceeding.

## Input

<optimization_input> #$ARGUMENTS </optimization_input>

If the input above is empty, ask: "What would you like to optimize? Describe the goal, or provide a path to an optimization spec YAML file."

## Optimization Spec Schema

Reference the spec schema for validation:

`references/optimize-spec-schema.yaml`

## Experiment Log Schema

Reference the experiment log schema for state management:

`references/experiment-log-schema.yaml`

---

## Persistence Discipline

**The experiment log on disk is the single source of truth. The agent's in-memory context is expendable.**

This skill runs for hours. Context windows compact, sessions crash, and agents restart. Every piece of state that matters must live on disk, not in the agent's memory.

### Core Rules

1. **Write each experiment result to disk IMMEDIATELY after measurement** — not after the batch, not after evaluation, IMMEDIATELY. Append the experiment entry to the experiment log file the moment its metrics are known, before evaluating the next experiment. This is the #1 crash-safety rule.

2. **Re-read from disk at every phase boundary and before every decision** — never trust in-memory state across phase transitions, batch boundaries, or after any operation that might have taken significant time. Re-read the experiment log and strategy digest from disk.

3. **The experiment log is append-only during Phase 3** — never rewrite the full file. Append new experiment entries. Update the `best` section in place only when a new best is found. This prevents data loss if a write is interrupted.

4. **Per-experiment result markers for crash recovery** — each experiment writes a `result.yaml` marker in its worktree immediately after measurement. On resume, scan for these markers to recover experiments that were measured but not yet logged.

5. **Strategy digest is written after every batch, before generating new hypotheses** — the agent reads the digest (not its memory) when deciding what to try next.

### File Locations (all under `.context/compound-engineering/ce-optimize/<spec-name>/`)

| File | Purpose | Written When |
|------|---------|-------------|
| `spec.yaml` | Optimization spec (immutable during run) | Phase 0 |
| `experiment-log.yaml` | Full history of all experiments | Appended after EACH experiment measurement |
| `strategy-digest.md` | Compressed learnings for hypothesis generation | After each batch completes |
| `<worktree>/result.yaml` | Per-experiment crash-recovery marker | Immediately after measurement, before log append |

### On Resume

When Phase 0.4 detects an existing run:
1. Read the experiment log from disk — this is the ground truth
2. Scan worktree directories for `result.yaml` markers not yet in the log
3. Recover any measured-but-unlogged experiments
4. Continue from where the log left off

---

## Phase 0: Setup

### 0.1 Determine Input Type

Check whether the input is:
- **A spec file path** (ends in `.yaml` or `.yml`): read and validate it
- **A description of the optimization goal**: help the user create a spec interactively

### 0.2 Load or Create Spec

**If spec file provided:**
1. Read the YAML spec file. The orchestrating agent parses YAML natively -- no shell script parsing.
2. Validate against `references/optimize-spec-schema.yaml`:
   - All required fields present
   - `metric.primary.type` is `hard` or `judge`
   - If type is `judge`, `metric.judge` section exists with `rubric` and `scoring`
   - At least one degenerate gate defined
   - `measurement.command` is non-empty
   - `scope.mutable` and `scope.immutable` each have at least one entry
   - Gate check operators are valid (`>=`, `<=`, `>`, `<`, `==`, `!=`)
   - `execution.max_concurrent` does not exceed 6 when backend is `worktree`
3. If validation fails, report errors and ask the user to fix them

**If description provided:**
1. Analyze the project to understand what can be measured
2. Guide the user through creating a spec:
   - What is the optimization target? (metric name, direction, type)
   - What degenerate cases should be rejected? (gates)
   - If judge type: what rubric should the judge use?
   - What command runs the measurement?
   - What files can be modified? What is immutable?
   - Any constraints or dependencies?
3. Write the spec to `.context/compound-engineering/ce-optimize/<spec-name>/spec.yaml`
4. Present the spec to the user for approval before proceeding

### 0.3 Search Prior Learnings

Dispatch `compound-engineering:research:learnings-researcher` to search for prior optimization work on similar topics. If relevant learnings exist, incorporate them into the approach.

### 0.4 Run Identity Detection

Check if `optimize/<spec-name>` branch already exists:

```bash
git rev-parse --verify "optimize/<spec-name>" 2>/dev/null
```

**If branch exists**, check for an existing experiment log at `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml`.

Present the user with a choice via the platform question tool:
- **Resume**: read ALL state from the experiment log on disk (do not rely on any in-memory context from a prior session). Recover any measured-but-unlogged experiments by scanning worktree directories for `result.yaml` markers. Continue from the last iteration number in the log.
- **Fresh start**: archive the old branch to `optimize/<spec-name>/archived-<timestamp>`, clear the experiment log, start from scratch

### 0.5 Create Optimization Branch and Scratch Space

```bash
git checkout -b "optimize/<spec-name>"  # or switch to existing if resuming
```

Create scratch directory:
```bash
mkdir -p .context/compound-engineering/ce-optimize/<spec-name>/
```

---

## Phase 1: Measurement Scaffolding

**This phase is a HARD GATE. The user must approve baseline and parallel readiness before Phase 2.**

### 1.1 Clean-Tree Gate

Verify no uncommitted changes to files within `scope.mutable` or `scope.immutable`:

```bash
git status --porcelain
```

Filter the output against the scope paths. If any in-scope files have uncommitted changes:
- Report which files are dirty
- Ask the user to commit or stash before proceeding
- Do NOT continue until the working tree is clean for in-scope files

### 1.2 Build or Validate Measurement Harness

**If user provides a measurement harness** (the `measurement.command` already exists):
1. Run it once via the measurement script:
   ```bash
   bash scripts/measure.sh "<measurement.command>" <timeout_seconds> <working_directory>
   ```
2. Validate the JSON output:
   - Contains keys for all degenerate gate metric names
   - Contains keys for all diagnostic metric names
   - Values are numeric or boolean as expected
3. If validation fails, report what is missing and ask the user to fix the harness

**If agent must build the harness:**
1. Analyze the codebase to understand the current approach and what should be measured
2. Build an evaluation script (e.g., `evaluate.py`, `evaluate.sh`, or equivalent)
3. Add the evaluation script path to `scope.immutable` -- the experiment agent must not modify it
4. Run it once and validate the output
5. Present the harness and its output to the user for review

### 1.3 Establish Baseline

Run the measurement harness on the current code.

**If stability mode is `repeat`:**
1. Run the harness `repeat_count` times
2. Aggregate results using the configured aggregation method (median, mean, min, max)
3. Calculate variance across runs
4. If variance exceeds `noise_threshold`, warn the user and suggest increasing `repeat_count`

Record the baseline in the experiment log:
```yaml
baseline:
  timestamp: "<current ISO 8601 timestamp>"
  gates:
    <gate_name>: <value>
    ...
  diagnostics:
    <diagnostic_name>: <value>
    ...
```

If primary type is `judge`, also run the judge evaluation on baseline output to establish the starting judge score.

### 1.4 Parallelism Readiness Probe

Run the parallelism probe script:
```bash
bash scripts/parallel-probe.sh "<project_directory>" "<measurement.command>"
```

Read the JSON output. Present any blockers to the user with suggested mitigations.

### 1.5 Worktree Budget Check

Count existing worktrees:
```bash
bash scripts/experiment-worktree.sh count
```

If count + `execution.max_concurrent` would exceed 12:
- Warn the user
- Suggest cleaning up existing worktrees or reducing `max_concurrent`
- Do NOT block -- the user may proceed at their own risk

### 1.6 User Approval Gate

Present to the user via the platform question tool:

- **Baseline metrics**: all gate values, diagnostic values, and judge scores (if applicable)
- **Parallel readiness**: probe results, any blockers, mitigations applied
- **Clean-tree status**: confirmed clean
- **Worktree budget**: current count and projected usage

**Options:**
1. **Proceed** -- approve baseline and parallel config, move to Phase 2
2. **Adjust spec** -- modify spec settings before proceeding
3. **Fix issues** -- user needs to resolve blockers first

Do NOT proceed to Phase 2 until the user explicitly approves.

**State re-read:** After gate approval, re-read the spec and baseline from disk. Do not carry stale in-memory values forward.

---

## Phase 2: Hypothesis Generation

### 2.1 Analyze Current Approach

Read the code within `scope.mutable` to understand:
- The current implementation approach
- Obvious improvement opportunities
- Constraints and dependencies between components

Optionally dispatch `compound-engineering:research:repo-research-analyst` for deeper codebase analysis if the scope is large or unfamiliar.

### 2.2 Generate Hypothesis List

Generate an initial set of hypotheses. Each hypothesis should have:
- **Description**: what to try
- **Category**: one of the standard categories (signal-extraction, graph-signals, embedding, algorithm, preprocessing, parameter-tuning, architecture, data-handling) or a domain-specific category
- **Priority**: high, medium, or low based on expected impact and feasibility
- **Required dependencies**: any new packages or tools needed

Include user-provided hypotheses if any were given as input.

Aim for 10-30 hypotheses in the initial backlog. More can be generated during the loop based on learnings.

### 2.3 Dependency Pre-Approval

Collect all unique new dependencies across all hypotheses.

If any hypotheses require new dependencies:
1. Present the full dependency list to the user via the platform question tool
2. Ask for bulk approval
3. Mark each hypothesis's `dep_status` as `approved` or `needs_approval`

Hypotheses with unapproved dependencies remain in the backlog but are skipped during batch selection. They are re-presented at wrap-up for potential approval.

### 2.4 Record Hypothesis Backlog

Write the initial backlog to the experiment log file:
```yaml
hypothesis_backlog:
  - description: "Remove template boilerplate before embedding"
    category: "signal-extraction"
    priority: high
    dep_status: approved
    required_deps: []
  - description: "Try HDBSCAN clustering algorithm"
    category: "algorithm"
    priority: medium
    dep_status: needs_approval
    required_deps: ["scikit-learn"]
```

---

## Phase 3: Optimization Loop

This phase repeats in batches until a stopping criterion is met.

### 3.1 Batch Selection

Select hypotheses for this batch:
- `batch_size = min(backlog_size, execution.max_concurrent)`
- Skip hypotheses with `dep_status: needs_approval`
- Prefer diversity: select from different categories when possible
- Within a category, select by priority (high first)

If the backlog is empty and no new hypotheses can be generated, proceed to Phase 4 (wrap-up).

### 3.2 Dispatch Experiments

For each hypothesis in the batch, dispatch in parallel:

**Worktree backend:**
1. Create experiment worktree:
   ```bash
   WORKTREE_PATH=$(bash scripts/experiment-worktree.sh create "<spec_name>" <exp_index> "optimize/<spec_name>" <shared_files...>)
   ```
2. Apply port parameterization if configured (set env vars for the measurement script)
3. Fill the experiment prompt template (`references/experiment-prompt-template.md`) with:
   - Iteration number, spec name
   - Hypothesis description and category
   - Current best and baseline metrics
   - Mutable and immutable scope
   - Constraints and approved dependencies
   - Rolling window of last 10 experiments (concise summaries)
4. Dispatch a subagent with the filled prompt, working in the experiment worktree

**Codex backend:**
1. Check environment guard -- do NOT delegate if already inside a Codex sandbox:
   ```bash
   # If these exist, we're already in Codex -- fall back to subagent
   test -n "${CODEX_SANDBOX:-}" || test -n "${CODEX_SESSION_ID:-}" || test ! -w .git
   ```
2. Fill the experiment prompt template
3. Write the filled prompt to a temp file
4. Dispatch via Codex:
   ```bash
   cat /tmp/optimize-exp-XXXXX.txt | codex exec --skip-git-repo-check - 2>&1
   ```
5. Security posture: use the user's selection (ask once per session if not set in spec)

### 3.3 Collect and Persist Results

Process experiments as they complete — do NOT wait for the entire batch to finish before writing results.

For each completed experiment, **immediately**:

1. **Run measurement** in the experiment's worktree:
   ```bash
   bash scripts/measure.sh "<measurement.command>" <timeout_seconds> "<worktree_path>" <env_vars...>
   ```

2. **Write crash-recovery marker** — immediately after measurement, write `result.yaml` in the experiment worktree containing the raw metrics. This ensures the measurement is recoverable even if the agent crashes before updating the main log.

3. **Read raw JSON output** from the measurement script

4. **Evaluate degenerate gates**:
   - For each gate in `metric.degenerate_gates`, parse the operator and threshold
   - Compare the metric value against the threshold
   - If ANY gate fails: mark outcome as `degenerate`, skip judge evaluation, save money

5. **If gates pass AND primary type is `judge`**:
   - Read the experiment's output (cluster assignments, search results, etc.)
   - Apply stratified sampling per `metric.judge.stratification` config (using `sample_seed`)
   - Group samples into batches of `metric.judge.batch_size`
   - Fill the judge prompt template (`references/judge-prompt-template.md`) for each batch
   - Dispatch `ceil(sample_size / batch_size)` parallel judge sub-agents
   - Each sub-agent returns structured JSON scores
   - Aggregate scores: compute `scoring.primary` (e.g., mean_score) and `scoring.secondary` values
   - If `singleton_sample > 0`: also dispatch singleton evaluation sub-agents

6. **If gates pass AND primary type is `hard`**:
   - Use the metric value directly from the measurement output

7. **IMMEDIATELY append to experiment log on disk** — do not defer this to batch evaluation. Write the experiment entry (iteration, hypothesis, outcome, metrics, learnings) to `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml` right now. The outcome may be preliminary (e.g., `gates_passed` but not yet compared to best) — that is fine. Update the outcome to `kept` or `reverted` in the evaluation step, but the raw metrics are on disk and safe from context compaction.

**Why immediately?** The agent's context window is NOT a durable store. Context compaction, session crashes, and restarts are expected during long runs. If results only exist in the agent's memory, they are lost. Karpathy's autoresearch writes to `results.tsv` after every single experiment — this skill must do the same with the experiment log.

### 3.4 Evaluate Batch

After all experiments in the batch have been measured:

1. **Rank** experiments by primary metric improvement:
   - For hard metrics: compare to current best value
   - For judge metrics: compare `mean_score` to current best, must exceed `minimum_improvement`

2. **Identify the best experiment** that passes all gates and improves the primary metric

3. **If best improves on current best: KEEP**
   - Merge the experiment branch to the optimization branch
   - Commit with message: `optimize(<spec-name>): <hypothesis description>`
   - This is now the new baseline for subsequent batches

4. **Check file-disjoint runners-up** (up to `max_runner_up_merges_per_batch`):
   - For each runner-up that also improved, check file-level disjointness with the kept experiment
   - **File-level disjointness**: two experiments are disjoint if they modified completely different files. Same file = overlapping, even if different lines.
   - If disjoint: cherry-pick the runner-up onto the new baseline, re-run full measurement
   - If combined measurement is strictly better: keep the cherry-pick (outcome: `runner_up_kept`)
   - Otherwise: revert the cherry-pick, log as "promising alone but neutral/harmful in combination" (outcome: `runner_up_reverted`)
   - Stop after first failed combination

5. **Handle deferred deps**: experiments that need unapproved dependencies get outcome `deferred_needs_approval`

6. **Revert all others**: cleanup worktrees, log as `reverted`

### 3.5 Update State

By this point, individual experiment results are already on disk (written in step 3.3). This step updates aggregate state.

1. **Re-read the experiment log from disk** — do not trust in-memory state. The log is the source of truth.

2. **Finalize outcomes** — update experiment entries from step 3.4 evaluation (mark `kept`, `reverted`, `runner_up_kept`, etc.). Write these outcome updates to disk immediately.

3. **Update the `best` section** in the experiment log if a new best was found. Write to disk.

4. **Write strategy digest** to `.context/compound-engineering/ce-optimize/<spec-name>/strategy-digest.md`:
   - Categories tried so far (with success/failure counts)
   - Key learnings from this batch and overall
   - Exploration frontier: what categories and approaches remain untried
   - Current best metrics and improvement from baseline

5. **Generate new hypotheses** based on learnings:
   - Re-read the strategy digest from disk (not from memory)
   - Read the rolling window (last 10 experiments from the log on disk)
   - Do NOT read the full experiment log -- use the digest for broad context
   - Add new hypotheses to the backlog and write the updated backlog to disk

6. **Write updated hypothesis backlog to disk** — the backlog section of the experiment log must reflect newly added hypotheses and removed (tested) ones.

**Checkpoint: at this point, all state for this batch is on disk. If the agent crashes and restarts, it can resume from the experiment log without loss.**

### 3.6 Check Stopping Criteria

Stop the loop if ANY of these are true:
- **Target reached**: primary metric meets or exceeds `stopping.target` (if set in spec)
- **Max iterations**: total experiments run >= `stopping.max_iterations`
- **Max hours**: wall-clock time since Phase 3 start >= `stopping.max_hours`
- **Plateau**: no improvement for `stopping.plateau_iterations` consecutive experiments
- **Manual stop**: user interrupts (save state and proceed to Phase 4)
- **Empty backlog**: no hypotheses remain and no new ones can be generated

If no stopping criterion is met, proceed to the next batch (step 3.1).

### 3.7 Cross-Cutting Concerns

**Codex failure cascade**: Track consecutive Codex delegation failures. After 3 consecutive failures, auto-disable Codex for remaining experiments and fall back to subagent dispatch. Log the switch.

**Error handling**: If an experiment's measurement command crashes, times out, or produces malformed output:
- Log as outcome `error` or `timeout` with the error message
- Revert the experiment (cleanup worktree)
- The loop continues with remaining experiments in the batch

**Progress reporting**: After each batch, report:
- Batch N of estimated M (based on backlog size)
- Experiments run this batch and total
- Current best metric and improvement from baseline
- Cumulative judge cost (if applicable)

**Crash recovery**: See Persistence Discipline section. Per-experiment `result.yaml` markers are written in step 3.3. Individual experiment results are appended to the log immediately in step 3.3. Batch-level state (outcomes, best, digest) is written in step 3.5. On resume (Phase 0.4), the log on disk is the ground truth — scan for any `result.yaml` markers not yet reflected in the log.

---

## Phase 4: Wrap-Up

### 4.1 Present Deferred Hypotheses

If any hypotheses were deferred due to unapproved dependencies:
1. List them with their dependency requirements
2. Ask the user whether to approve, skip, or save for a future run
3. If approved: add to backlog and offer to re-enter Phase 3 for one more round

### 4.2 Summarize Results

Present a comprehensive summary:

```
Optimization: <spec-name>
Duration: <wall-clock time>
Total experiments: <count>
  Kept: <count> (including <runner_up_kept_count> runner-up merges)
  Reverted: <count>
  Degenerate: <count>
  Errors: <count>
  Deferred: <count>

Baseline -> Final:
  <primary_metric>: <baseline_value> -> <final_value> (<delta>)
  <gate_metrics>: ...
  <diagnostics>: ...

Judge cost: $<total_judge_cost_usd> (if applicable)

Key improvements:
  1. <kept experiment 1 hypothesis> (+<delta>)
  2. <kept experiment 2 hypothesis> (+<delta>)
  ...
```

### 4.3 Preserve and Offer Next Steps

The optimization branch (`optimize/<spec-name>`) is preserved with all commits from kept experiments.

Present post-completion options via the platform question tool:

1. **Run `/ce:review`** on the cumulative diff (baseline to final). Load the `ce:review` skill with `mode:autofix` on the optimization branch.
2. **Run `/ce:compound`** to document the winning strategy as an institutional learning.
3. **Create PR** from the optimization branch to the default branch.
4. **Continue** with more experiments: re-enter Phase 3 with the current state. State re-read first.
5. **Done** -- leave the optimization branch for manual review.

### 4.4 Cleanup

Clean up scratch space:
```bash
# Keep the experiment log (it moves with the branch)
# Remove temporary batch artifacts
rm -f .context/compound-engineering/ce-optimize/<spec-name>/strategy-digest.md
```

Do NOT delete the experiment log -- it is part of the optimization branch's history.
Do NOT delete experiment worktrees that are still being referenced.
