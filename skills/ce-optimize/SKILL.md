---
name: ce-optimize
description: "Run metric-driven optimization loops. Use when improving measurable outcomes such as search relevance, clustering quality, build performance, prompt quality, or scored behavior through experiments."
argument-hint: "[path to optimization spec YAML, or describe the optimization goal]"
---

# Iterative Optimization Loop

Run metric-driven iterative optimization. Define a goal, build measurement scaffolding, then run parallel experiments that converge toward the best solution.

## Interaction Method

Use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi. Fall back to numbered options in chat when no blocking tool exists in the harness or the call errors — not because a schema load is required. If no human is attached (headless or piped run), take the safest default, state the assumption, and keep going.

## Input

The **optimization input** is the input this skill was invoked with — present in the current prompt or conversation, whether the user provided it directly or a calling skill passed it: a goal to optimize, or a path to an optimization spec YAML file.

If no optimization input was provided, ask: "What would you like to optimize? Describe the goal, or provide a path to an optimization spec YAML file."

## State

All run state lives under `.context/compound-engineering/ce-optimize/<spec-name>/`: `spec.yaml`, `experiment-log.yaml` (append-only during the loop; update `best` in place), `strategy-digest.md`, plus a `result.yaml` marker in each experiment worktree. `.context/` is gitignored — results do not travel with the branch, commits, or a PR; export them if the user needs a durable artifact.

Append each experiment entry to `experiment-log.yaml` the moment its metrics are known, before evaluating the next experiment — long runs get compacted and restarted, and an unwritten result is a lost result. Write the worktree `result.yaml` marker at the same moment so a crash between measurement and log-append is recoverable. On resume, the log on disk is ground truth; scan worktrees for `result.yaml` markers not yet in it.

---

## Phase 0: Setup

### 0.1 Determine Input Type

Check whether the input is:
- **A spec file path** (ends in `.yaml` or `.yml`): read and validate it
- **A description of the optimization goal**: help the user create a spec interactively

### 0.2 Load or Create Spec

**If spec file provided:**
1. Read the YAML spec file. The orchestrating agent parses YAML natively -- no shell script parsing.
2. Validate the spec against **every** rule in the `validation_rules` section of `references/optimize-spec-schema.yaml` (that section is the single source of truth for what a valid spec requires — do not rely on a remembered subset; conditional rules such as the singleton-rubric and exclusive-resources requirements live only there).
3. If any rule fails, report the specific failures and ask the user to fix them before proceeding

**If description provided:**
1. Analyze the project to understand what can be measured
2. **Detect whether the optimization target is qualitative or quantitative** — this determines `type: hard` vs `type: judge` and is the single most important spec decision:

   **Use `type: hard`** when:
   - The metric is a scalar number with a clear "better" direction
   - The metric is objectively measurable (build time, test pass rate, latency, memory usage)
   - No human judgment is needed to evaluate "is this result actually good?"
   - Examples: reduce build time, increase test coverage, reduce API latency, decrease bundle size

   **Use `type: judge`** when:
   - The quality of the output requires semantic understanding to evaluate
   - A human reviewer would need to look at the results to say "this is better"
   - Proxy metrics exist but can mislead (e.g., "more clusters" does not mean "better clusters")
   - The optimization could produce degenerate solutions that look good on paper
   - Examples: clustering quality, search relevance, summarization quality, code readability, UX copy, recommendation relevance

   **IMPORTANT**: If the target is qualitative, **strongly recommend `type: judge`**. Explain that hard metrics alone will optimize proxy numbers without checking actual quality. Show the user the three-tier approach:
   - **Degenerate gates** (hard, cheap, fast): catch obviously broken solutions — e.g., "all items in 1 cluster" or "0% coverage". Run first. If gates fail, skip the expensive judge step.
   - **LLM-as-judge** (the actual optimization target): sample outputs, score them against a rubric, aggregate. This is what the loop optimizes.
   - **Diagnostics** (logged, not gated): distribution stats, counts, timing — useful for understanding WHY a judge score changed.

   If the user insists on `type: hard` for a qualitative target, proceed but warn that the results may optimize a misleading proxy.

3. **Design the sampling strategy** (for `type: judge`):

   Guide the user through defining stratified sampling. The key question is: "What parts of the output space do you need to check quality on?"

   Walk through these questions:
   - **What does one "item" look like?** (a cluster, a search result page, a summary, etc.)
   - **What are the natural size/quality strata?** (e.g., large clusters vs small clusters vs singletons)
   - **Where are quality failures most likely?** (e.g., very large clusters may be degenerate merges; singletons may be missed groupings)
   - **What total sample size balances cost vs signal?** (default: 30 items, adjust based on output volume)

   Example stratified sampling for clustering:
   ```yaml
   stratification:
     - bucket: "top_by_size"     # largest clusters — check for degenerate mega-clusters
       count: 10
     - bucket: "mid_range"       # middle of non-solo cluster size range — representative quality
       count: 10
     - bucket: "small_clusters"  # clusters with 2-3 items — check if connections are real
       count: 10
   singleton_sample: 15          # singletons — check for false negatives (items that should cluster)
   ```

   The sampling strategy is domain-specific. For search relevance, strata might be "top-3 results", "results 4-10", "tail results". For summarization, strata might be "short documents", "long documents", "multi-topic documents".

   **Singleton evaluation is critical when the goal involves coverage** — sampling singletons with the singleton rubric checks whether the system is missing obvious groupings.

4. **Design the rubric** (for `type: judge`):

   Help the user define the scoring rubric. A good rubric:
   - Has a 1-5 scale (or similar) with concrete descriptions for each level
   - Includes supplementary fields that help diagnose issues (e.g., `distinct_topics`, `outlier_count`)
   - Is specific enough that two judges would give similar scores
   - Does NOT assume bigger/more is better — "3 items per cluster average" is not inherently good or bad

   Example for clustering:
   ```yaml
   rubric: |
     Rate this cluster 1-5:
     - 5: All items clearly about the same issue/feature
     - 4: Strong theme, minor outliers
     - 3: Related but covers 2-3 sub-topics that could reasonably be split
     - 2: Weak connection — items share superficial similarity only
     - 1: Unrelated items grouped together
     Also report: distinct_topics (integer), outlier_count (integer)
   ```

5. Guide the user through the remaining spec fields:
   - What degenerate cases should be rejected? (gates — e.g., "solo_pct <= 0.95" catches all-singletons, "max_cluster_size <= 500" catches mega-clusters)
   - What command runs the measurement?
   - What files can be modified? What is immutable?
   - Any constraints or dependencies?
   - If this is the first run: recommend `execution.mode: serial`, `execution.max_concurrent: 1`, `stopping.max_iterations: 4`, `stopping.max_hours: 1`, and no new dependencies until the baseline and measurement harness are trusted
   - If `type: judge`: recommend `sample_size: 10`, `batch_size: 5`, and `max_total_cost_usd: 5` until the rubric and harness are trusted
6. Write the spec to `.context/compound-engineering/ce-optimize/<spec-name>/spec.yaml`, modeled on `references/example-hard-spec.yaml` (objective, cheap metric) or `references/example-judge-spec.yaml` (quality requires semantic judgment)
7. Present the spec to the user for approval before proceeding. If no human is attached, record the spec as assumed-approved and continue.

### 0.3 Search Prior Learnings

Read `references/agents/learnings-researcher.md` and dispatch a generic subagent seeded with that local prompt to search for prior optimization work on similar topics. Do not dispatch a standalone agent by type/name. If relevant learnings exist, incorporate them into the approach.

### 0.4 Run Identity Detection

Check if `optimize/<spec-name>` branch already exists:

```bash
git rev-parse --verify "optimize/<spec-name>" 2>/dev/null
```

**If branch exists**, check for an existing experiment log at `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml`.

Present the user with a choice via the platform question tool:
- **Resume**: read ALL state from the experiment log on disk (do not rely on any in-memory context from a prior session). Recover any measured-but-unlogged experiments by scanning worktree directories for `result.yaml` markers. Continue from the last iteration number in the log.
- **Fresh start**: archive the old branch to `optimize-archive/<spec-name>/archived-<timestamp>`, clear the experiment log, start from scratch

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

**Bundled scripts.** Phases 1 and 3 call `measure.sh`, `parallel-probe.sh`, and `experiment-worktree.sh` from this skill's `scripts/` directory. Every runnable block below sets `SKILL_DIR` inline because shell state does not persist between Bash tool calls; replace the `<absolute path …>` placeholder with the directory you loaded this SKILL.md from.

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
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   bash "$SKILL_DIR/scripts/measure.sh" "<measurement.command>" <timeout_seconds> "<measurement.working_directory or .>"
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
5. Report the harness path and its output

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
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/parallel-probe.sh" "<project_directory>" "<measurement.command>" "<measurement.working_directory>" <shared_files...>
```

Read the JSON output. Present any blockers to the user with suggested mitigations. Treat the probe as intentionally narrow: it should inspect the measurement command, the measurement working directory, and explicitly declared shared files, not the entire repository.

### 1.5 Worktree Budget Check

Count existing worktrees:
```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/experiment-worktree.sh" count
```

If count + `execution.max_concurrent` would exceed 12, warn and suggest cleaning up worktrees or reducing `max_concurrent`. Do NOT block — the user may proceed at their own risk.

### 1.6 Write Baseline to Disk

Write the initial experiment log with baseline metrics before reporting results:

1. Create the experiment log file at `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml`
2. Include all required top-level sections from `references/experiment-log-schema.yaml`: `spec`, `run_id`, `started_at`, `baseline`, `experiments`, and `best`
3. Seed `experiments` as an empty array and seed `best` from the baseline snapshot (use `iteration: 0`, baseline metrics, and baseline judge scores if present) so later phases have a valid current-best state to compare against
4. Optionally seed `hypothesis_backlog: []` here as well so the log shape is stable before Phase 2 populates it

### 1.7 User Approval Gate

Present to the user via the platform question tool:

- **Baseline metrics**: all gate values, diagnostic values, and judge scores (if applicable)
- **Experiment log location**: show the file path so the user knows where results are saved
- **Parallel readiness**: probe results, any blockers, mitigations applied
- **Clean-tree status**: confirmed clean
- **Worktree budget**: current count and projected usage
- **Judge budget**: estimated per-experiment judge cost and configured `max_total_cost_usd` cap (or an explicit note that spend is uncapped)

**Options:**
1. **Proceed** -- approve baseline and parallel config, move to Phase 2
2. **Adjust spec** -- modify spec settings before proceeding
3. **Fix issues** -- user needs to resolve blockers first

Do NOT proceed to Phase 2 until the user explicitly approves.

If primary type is `judge` and `max_total_cost_usd` is null, call that out as uncapped spend and require explicit approval before proceeding.

If no human is attached, do not halt here: proceed when the harness validated, the probe found no blockers, and judge spend is capped (or the primary type is `hard`) — recording those as assumed approvals. Stop and report instead when a blocker is open or judge spend is uncapped.

---

## Phase 2: Hypothesis Generation

### 2.1 Analyze Current Approach

Read the code within `scope.mutable` to understand:
- The current implementation approach
- Obvious improvement opportunities
- Constraints and dependencies between components

Optionally read `references/agents/repo-research-analyst.md` and dispatch a generic subagent seeded with that local prompt for deeper codebase analysis if the scope is large or unfamiliar. Do not dispatch a standalone agent by type/name. Pass the active project and optimization context, request only question-specific scopes such as `patterns`, and go directly to current owning code. If the optimization cannot be scoped, allow one targeted root or workspace probe.

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
3. Mark each hypothesis's `dep_status` as `approved` or `needs_approval`. If no human is attached, leave every new dependency `needs_approval` and continue with the rest of the backlog.

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
- Build a runnable backlog by excluding hypotheses with `dep_status: needs_approval`
- If `execution.mode` is `serial`, force `batch_size = 1`
- Otherwise, `batch_size = min(runnable_backlog_size, execution.max_concurrent)`
- Prefer diversity: select from different categories when possible
- Within a category, select by priority (high first)

If the backlog is empty and no new hypotheses can be generated, proceed to Phase 4 (wrap-up).
If the backlog is non-empty but no runnable hypotheses remain because everything needs approval or is otherwise blocked, proceed to Phase 4 so the user can approve dependencies instead of spinning forever.

### 3.2 Dispatch Experiments

For each hypothesis in the batch, dispatch according to `execution.mode`. In `serial` mode, run exactly one experiment to completion before selecting the next hypothesis. In `parallel` mode, dispatch the batch concurrently.

**Bounded dispatch.** Do not assume the host will accept all concurrent subagents at once; the active-subagent cap varies by host and profile and is independent of `execution.max_concurrent` (which caps worktrees, a separate budget). Queue the selected experiments, dispatch only as many as the host accepts, and when a capacity or active-agent-limit error appears, treat it as backpressure — retry the queued experiment after a slot frees rather than marking it failed. Mark an experiment failed only when dispatch fails for a non-capacity reason or a successfully dispatched experiment errors/times out.

**Worktree backend:**
1. Create experiment worktree:
   ```bash
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   WORKTREE_PATH=$(bash "$SKILL_DIR/scripts/experiment-worktree.sh" create "<spec_name>" <exp_index> "optimize/<spec_name>" <shared_files...>)  # creates optimize-exp/<spec_name>/exp-<NNN>
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

**Codex backend:** fill the same prompt template, write it to a temp file, and dispatch with `cat <file> | codex exec --skip-git-repo-check -` under the `execution.codex_security` posture. Skip Codex and fall back to subagent dispatch when already inside a Codex sandbox (`CODEX_SANDBOX` or `CODEX_SESSION_ID` set, or `.git` not writable).

### 3.3 Collect and Persist Results

Process experiments as they complete — do NOT wait for the entire batch to finish before writing results.

For each completed experiment, **immediately**:

1. **Run measurement** in the experiment's worktree:
   ```bash
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   bash "$SKILL_DIR/scripts/measure.sh" "<measurement.command>" <timeout_seconds> "<worktree_path>/<measurement.working_directory or .>" <env_vars...>
   ```
   - If stability mode is `repeat`, run the measurement harness `repeat_count` times in that working directory and aggregate the results exactly as in Phase 1 before evaluating gates or ranking the experiment.
   - Use the aggregated metrics as the experiment's score; if variance exceeds `noise_threshold`, record that in learnings so the operator knows the result is noisy.

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
   - Dispatch the `ceil(sample_size / batch_size)` judge sub-agents using the same bounded dispatch as Phase 3.2 — queue them, dispatch to whatever concurrency the host accepts, and treat a capacity error as backpressure (retry the queued batch after a slot frees) rather than a scoring failure. These judge sub-agents are a separate budget from the experiment worktrees.
   - Each sub-agent returns structured JSON scores
   - Aggregate scores: compute the configured primary judge field from `metric.judge.scoring.primary` (which should match `metric.primary.name`) plus any `scoring.secondary` values
   - If `singleton_sample > 0`: also dispatch singleton evaluation sub-agents

6. **If gates pass AND primary type is `hard`**:
   - Use the metric value directly from the measurement output

7. **IMMEDIATELY append to the experiment log on disk** — do not defer this to batch evaluation. Write the experiment entry (iteration, hypothesis, outcome, metrics, learnings) to `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml` right now. Use the transitional outcome `measured` once the experiment has valid metrics but has not yet been compared to the current best. Update the outcome to `kept`, `reverted`, or another terminal state in the evaluation step, but the raw metrics are on disk and safe from context compaction.

### 3.4 Evaluate Batch

After all experiments in the batch have been measured:

1. **Rank** experiments by primary metric improvement:
   - For hard metrics: compare to the current best using `metric.primary.direction` (`maximize` means higher is better, `minimize` means lower is better), and require the absolute improvement to exceed `measurement.stability.noise_threshold` before treating it as a real win
   - For judge metrics: compare the configured primary judge score (`metric.judge.scoring.primary` / `metric.primary.name`) to the current best, and require it to exceed `minimum_improvement`

2. **Identify the best experiment** that passes all gates and improves the primary metric

3. **If best improves on current best: KEEP**
   - Commit the experiment branch first so the winning diff exists as a real commit before any merge or cherry-pick
   - Include only mutable-scope changes in that commit; if no eligible diff remains, treat the experiment as non-improving and revert it
   - Merge the committed experiment branch into the optimization branch
   - Use the message `optimize(<spec-name>): <hypothesis description>` for the experiment commit
   - After the merge succeeds, clean up the winner's experiment worktree and branch; the integrated commit on the optimization branch is the durable artifact
   - This is now the new baseline for subsequent batches

4. **Check file-disjoint runners-up** (up to `max_runner_up_merges_per_batch`):
   - For each runner-up that also improved, check file-level disjointness with the kept experiment
   - **File-level disjointness**: two experiments are disjoint if they modified completely different files. Same file = overlapping, even if different lines.
   - If disjoint: cherry-pick the runner-up onto the new baseline, re-run full measurement
   - If combined measurement is strictly better: keep the cherry-pick (outcome: `runner_up_kept`), then clean up that runner-up's experiment worktree and branch
   - Otherwise: revert the cherry-pick, log as "promising alone but neutral/harmful in combination" (outcome: `runner_up_reverted`), then clean up the runner-up's experiment worktree and branch
   - Stop after first failed combination

5. **Handle deferred deps**: experiments that need unapproved dependencies get outcome `deferred_needs_approval`

6. **Revert all others**: cleanup worktrees, log as `reverted`

### 3.5 Update State

Individual experiment results are already on disk (written in step 3.3). This step updates aggregate state.

1. **Finalize outcomes** — update experiment entries from step 3.4 evaluation (mark `kept`, `reverted`, `runner_up_kept`, etc.). Write these outcome updates to disk immediately.

2. **Update the `best` section** in the experiment log if a new best was found. Write to disk.

3. **Write strategy digest** to `.context/compound-engineering/ce-optimize/<spec-name>/strategy-digest.md`:
   - Categories tried so far (with success/failure counts)
   - Key learnings from this batch and overall
   - Exploration frontier: what categories and approaches remain untried
   - Current best metrics and improvement from baseline

4. **Generate new hypotheses** based on learnings:
   - Re-read the strategy digest from disk (not from memory)
   - Read the rolling window (last 10 experiments from the log on disk)
   - Do NOT read the full experiment log -- use the digest for broad context
   - Write the updated backlog to disk, reflecting newly added hypotheses and removed (tested) ones

### 3.6 Check Stopping Criteria

Stop the loop if ANY of these are true:
- **Target reached**: `stopping.target_reached` is true, `metric.primary.target` is set, and the primary metric reaches that target according to `metric.primary.direction` (`>=` for `maximize`, `<=` for `minimize`)
- **Max iterations**: total experiments run >= `stopping.max_iterations`
- **Max hours**: wall-clock time since Phase 3 start >= `stopping.max_hours`
- **Judge budget exhausted**: cumulative judge spend >= `metric.judge.max_total_cost_usd` (if set)
- **Plateau**: no improvement for `stopping.plateau_iterations` consecutive experiments
- **Manual stop**: user interrupts (save state and proceed to Phase 4)
- **Empty backlog**: no hypotheses remain and no new ones can be generated

If no stopping criterion is met, proceed to the next batch (step 3.1).

### 3.7 Error Handling

If an experiment's measurement command crashes, times out, or produces malformed output, log outcome `error` or `timeout` with the message, revert that experiment (cleanup worktree), and continue with the remaining experiments in the batch.

---

## Phase 4: Wrap-Up

### 4.1 Present Deferred Hypotheses

If any hypotheses were deferred due to unapproved dependencies:
1. List them with their dependency requirements
2. Ask the user whether to approve, skip, or save for a future run
3. If approved: add to backlog and offer to re-enter Phase 3 for one more round

### 4.2 Summarize Results

Report duration, experiment counts by terminal outcome, baseline -> final on the primary metric and gates, cumulative judge spend, and the kept hypotheses with their deltas.

### 4.3 Preserve and Offer Next Steps

The optimization branch (`optimize/<spec-name>`) is preserved with all commits from kept experiments.
The experiment log and strategy digest remain in local `.context/...` scratch space for resume and audit on this machine only; they do not travel with the branch because `.context/` is gitignored.

Present post-completion options via the platform question tool:

1. **Run `ce-code-review`** on the cumulative diff (baseline to final). Load the `ce-code-review` skill on the optimization branch (interactive or `mode:agent`). Review is report-only for callers — apply authority is yours: land findings with a concrete `suggested_fix` that are clear and reversible, push back when the reviewer is wrong, and defer anything whose right fix needs a design or product decision. Do not commit or push from this step — leave the diff on the optimization branch for the Create PR option.
2. **Run `ce-compound`** to document the winning strategy as an institutional learning.
3. **Create PR** from the optimization branch to the default branch.
4. **Continue** with more experiments: re-enter Phase 3 with the current state.
5. **Done** -- leave the optimization branch for manual review.
