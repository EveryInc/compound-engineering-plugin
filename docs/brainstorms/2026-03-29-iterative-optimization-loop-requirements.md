# Iterative Optimization Loop Skill — Requirements Brainstorm

## Problem Statement

CE has strong knowledge-compounding (learn from past work) and multi-agent review (quality gates), but no skill for **metric-driven iterative optimization** — the pattern where you define a measurable goal, build measurement scaffolding, then run an automated loop that tries many approaches, measures each, keeps improvements, and converges toward the best solution.

### Motivating Example

A project builds issue/PR clusters for a large open-source repo. Currently only ~20% of issues/PRs land in clusters with >1 item. The suspected achievable target is ~95%. Getting there requires testing many hypotheses:

- Extracting signal (unique user-entered text) from noise (PR/issue template boilerplate that makes all vectors too similar)
- Using issue-to-PR links as a new clustering signal
- Adjusting similarity thresholds
- Trying different embedding models or chunking strategies
- Combining multiple signals (text similarity + link graph + label overlap + author patterns)
- Pre-filtering or normalizing template sections before embedding

No single hypothesis will get from 20% to 95%. It requires systematic experimentation — trying dozens or hundreds of variations, measuring each, and building on successes.

## Landscape Analysis

### Karpathy's AutoResearch (March 2026, 21k+ stars)

The simplest and most influential model. Core design:

- **One mutable file** (`train.py`) — the agent edits only this
- **One immutable evaluator** (`prepare.py`) — the agent cannot touch measurement
- **One instruction file** (`program.md`) — defines objectives, constraints, stopping criteria
- **One metric** (`val_bpb`) — scalar, lower is better
- **Linear keep/revert loop**: modify -> commit -> run -> measure -> if improved keep, else `git reset`
- **History**: `results.tsv` accumulates all experiment results; git log preserves successful commits
- **Result**: 700 experiments in 2 days, 20 discovered optimizations, ~12 experiments/hour

**Strengths**: Dead simple. Git-native history. Easy to understand and debug.
**Weaknesses**: Linear — can't explore multiple directions simultaneously. Single scalar metric. No backtracking to earlier promising states.

### AIDE / WecoAI

- **Tree search** in solution space — each script is a node, LLM patches spawn children
- Can backtrack to any previous node and explore alternatives
- 4x more Kaggle medals than linear agents on MLE-Bench
- More complex but better at escaping local optima

### Sakana AI Scientist v2

- **Agentic tree search** with parallel experiment execution
- VLM feedback for analyzing figures
- Full paper generation with automated peer review
- Overkill for code optimization but shows the value of tree-structured exploration

### DSPy (Stanford)

- Automated prompt/weight optimization for LLM programs
- Bayesian optimization (MIPROv2), iterative feedback (GEPA), coordinate ascent (COPRO)
- Shows that different optimization strategies suit different problem shapes

### Existing Claude Code AutoResearch Forks

- `uditgoenka/autoresearch` — packages the pattern as a Claude Code skill
- `autoexp` — generalized for any project with a quantifiable metric
- Multiple teams report 50-80% improvements over 30-70 iterations overnight

## Key Design Decisions

### 1. Linear vs. Tree Search

| Approach | Pros | Cons |
|---|---|---|
| Linear (autoresearch) | Simple, easy to understand, git-native | Can't explore multiple directions, stuck in local optima |
| Tree search (AIDE) | Can backtrack, explore alternatives | More complex state management, harder to review |
| Hybrid: linear with manual branch points | Best of both — simple default, user chooses when to fork | Requires user interaction to fork |

**Recommendation**: Start with linear keep/revert (Karpathy model) as the default. Add optional "branch point" support where the user can snapshot the current best and start a new exploration direction. Each direction is its own branch. This keeps the core loop simple while allowing multi-direction exploration when needed.

### 2. What Gets Measured — The Three-Tier Metric Architecture

AutoResearch uses a single scalar metric (val_bpb). That works when you have an objective function with clear ground truth. Most real-world optimization problems don't — especially when the quality of the output requires human judgment.

**Key insight**: Hard scalar metrics are often the wrong optimization target. For clustering, "bigger clusters" isn't inherently better. "Fewer singletons" isn't inherently better. A solution with 35% singletons where every cluster is coherent beats a solution with 5% singletons where clusters are garbage. Hard metrics catch *degenerate* solutions; *quality* requires judgment.

**Three tiers**:

1. **Degenerate-case gates** (hard, cheap, fully automated):
   - Catch obviously broken solutions before expensive evaluation
   - Examples: "all items in 1 cluster" (degenerate merge), "all singletons" (degenerate split), "runtime > 10 minutes" (performance regression)
   - These are fast boolean checks: pass/fail. If any gate fails, the experiment is immediately reverted without running the expensive judge
   - Think of these as "sanity checks" not "optimization targets"

2. **LLM-as-judge quality score** (the actual optimization target):
   - For problems where quality requires judgment, this IS the primary metric
   - Cost-controlled via stratified sampling (not exhaustive)
   - Produces a scalar score the loop can optimize against
   - Can include multiple dimensions (coherence, granularity, completeness)
   - See detailed design below

3. **Diagnostics** (logged for understanding, not gated on):
   - Distribution stats, counts, histograms
   - Useful for understanding WHY a judge score changed
   - Examples: median cluster size, singleton %, largest cluster size, cluster count
   - Logged in the experiment record but never used for keep/revert decisions

**When to use which configuration**:

| Problem Type | Degenerate Gates | Primary Metric | Example |
|---|---|---|---|
| Objective function exists | Yes | Hard metric (scalar) | Build time, test pass rate, API latency |
| Quality requires judgment | Yes | LLM-as-judge score | Clustering quality, search relevance, content generation |
| Hybrid | Yes | Hard metric + LLM-judge as guard rail | Latency (optimize) + response quality (must not drop) |

**Recommendation**: Support all three tiers. The user declares whether the primary optimization target is a hard metric or an LLM-judge score. Degenerate gates always run first (cheap). Judge runs only on experiments that pass gates.

### 3. What the Agent Can Edit

AutoResearch constrains the agent to one file. This is elegant but too restrictive for most software projects.

**Recommendation**: Define an explicit allowlist of mutable files/directories and an explicit denylist (measurement harness, test fixtures, evaluation data). The agent operates within the allowlist. The measurement harness is immutable — the agent cannot game the metric by changing how it's measured.

### 4. Measurement Scaffolding First

This is critical and distinguishes this from "just run the code in a loop":

1. **Define the measurement spec** before any optimization begins
2. **Build and validate the measurement harness** — ensure it produces reliable, reproducible results
3. **Establish baseline** — run the harness on the current code to get starting metrics
4. Only then begin the optimization loop

**Recommendation**: Make this a hard phase gate. The skill refuses to enter the optimization loop until the measurement harness passes a validation check (runs successfully, produces expected metric types, baseline is recorded).

### 5. History and Memory

What gets remembered across iterations:

- **Results log**: Every experiment's metrics, hypothesis, and outcome (kept/reverted)
- **Git history**: Successful experiments are commits; branches are preserved
- **Hypothesis log**: What was tried, why, what was learned — prevents re-trying failed approaches
- **Strategy evolution**: As the agent learns what works, it should adapt its exploration strategy

**Recommendation**: A structured experiment log (YAML or JSON) that captures: iteration number, hypothesis, changes made, metrics before/after, outcome (kept/reverted/error), and learnings. The agent reads this before proposing the next hypothesis. Git branches are preserved for all kept experiments.

### 6. How Long It Runs

- AutoResearch runs "indefinitely until manually stopped"
- Real-world needs: time budgets, iteration budgets, metric targets, or "until no improvement for N iterations"

**Recommendation**: Support multiple stopping criteria (any can trigger stop):
- Target metric reached
- Max iterations
- Max wall-clock time
- No improvement for N consecutive iterations
- Manual stop (user interrupts)

### 7. Parallelism

AutoResearch is single-threaded. AIDE and AI Scientist run parallel experiments. For CE:

- **Phase 1 (v1)**: Single-threaded linear loop. Simple, debuggable, works with git worktrees.
- **Phase 2 (future)**: Parallel experiments using multiple worktrees or Codex sandboxes. Each experiment is independent.

**Recommendation**: Start single-threaded. Design the experiment log and branching model to support parallelism later.

### 8. Integration with Existing CE Skills

The optimization loop should compose with existing CE capabilities:

- **`/ce:ideate`** or **`/ce:brainstorm`** to generate initial hypothesis space
- **Learnings researcher** to check if similar optimization was done before
- **`/ce:compound`** to capture the winning strategy as institutional knowledge after the loop completes
- **`/ce:review`** optionally on the final winning diff before it's merged

## Proposed Skill: `/ce-optimize`

### Workflow Phases

```
Phase 0: Setup
  |-- Read/create optimization spec (target metric, guard rails, mutable files, constraints)
  |-- Search learnings for prior related optimization attempts
  '-- Validate spec completeness

Phase 1: Measurement Scaffolding (HARD GATE - user must approve before Phase 2)
  |-- If user provides harness:
  |     |-- Review docs (or document usage if undocumented)
  |     |-- Run harness once against current implementation
  |     '-- Confirm baseline measurement is accurate with user
  |-- If agent builds harness:
  |     |-- Build measurement harness (immutable evaluator)
  |     |-- Run validation: harness executes, produces expected metric types
  |     '-- Establish baseline metrics
  |-- Parallelism readiness probe:
  |     |-- Check for hardcoded ports -> parameterize via env var
  |     |-- Check for shared DB files (SQLite, etc.) -> plan copy strategy
  |     |-- Check for shared external services -> warn user
  |     |-- Check for exclusive resource needs (GPU, etc.)
  |     '-- Produce parallel_readiness assessment
  |-- Stability validation (if mode: repeat):
  |     |-- Run harness repeat_count times
  |     |-- Verify variance is within noise_threshold
  |     '-- Confirm aggregation method produces stable baseline
  '-- GATE: Present baseline + parallel readiness to user. Refuse to proceed until approved.

Phase 2: Hypothesis Generation + Dependency Approval
  |-- Analyze the problem space (read code, understand current approach)
  |-- Generate initial hypothesis list (agent + optionally /ce:ideate)
  |-- Prioritize by expected impact and feasibility
  |-- Identify new dependencies across ALL planned hypotheses
  |-- Present dependency list for bulk approval
  '-- Record hypothesis backlog (with dep approval status per hypothesis)

Phase 3: Optimization Loop (repeats in parallel batches)
  |-- Select batch of hypotheses (batch_size = min(backlog, max_concurrent))
  |     '-- Prefer diversity: mix different hypothesis categories per batch
  |-- For each experiment in batch (PARALLEL by default):
  |     |-- Create worktree or Codex sandbox
  |     |-- Copy shared resources (DB files, data files)
  |     |-- Apply parameterization (ports, env vars)
  |     |-- Implement hypothesis (within mutable scope)
  |     |-- Run measurement harness (respecting stability config)
  |     '-- Collect metrics + diff
  |-- Wait for batch completion
  |-- Evaluate results:
  |     |-- Rank by primary metric improvement
  |     |-- Filter by guard rails (reject any that violate)
  |     |-- If best > current: KEEP (merge to optimization branch)
  |     |-- If best has unapproved dep: mark deferred_needs_approval
  |     '-- All others: REVERT (log results, clean up worktrees)
  |-- Handle unapproved deps:
  |     '-- Set aside, don't block pipeline, batch-ask at end or check-in
  |-- Update experiment log with ALL results (kept + reverted)
  |-- Re-baseline: remaining hypotheses evaluated against new best
  |-- Generate new hypotheses based on learnings from this batch
  |-- Check stopping criteria
  '-- Next batch

Phase 4: Wrap-Up
  |-- Present deferred hypotheses needing dep approval (if any)
  |-- Summarize results: baseline -> final metrics, total iterations, kept improvements
  |-- Preserve ALL experiment branches for reference
  |-- Optionally run /ce:review on cumulative diff
  |-- Optionally run /ce:compound to capture winning strategy as learning
  '-- Report to user
```

### Optimization Spec File Format

See "Updated Spec File Format" in the Resolved Design Decisions section below for the full spec with parallel execution and stability config.

### Experiment Log Format

```yaml
# .context/compound-engineering/optimize/experiment-log.yaml
spec: "improve-issue-clustering"

baseline:
  timestamp: "2026-03-29T10:00:00Z"
  gates:
    largest_cluster_pct: 0.02
    singleton_pct: 0.79
    cluster_count: 342
    runtime_seconds: 45
  diagnostics:
    singleton_pct: 0.79
    median_cluster_size: 2
    cluster_count: 342
    avg_cluster_size: 2.8
    p95_cluster_size: 7
  judge:
    mean_score: 3.1
    pct_scoring_4plus: 0.33
    mean_distinct_topics: 1.8
    singleton_false_negative_pct: 0.45   # 45% of sampled singletons should be clustered
    sample_seed: 42
    judge_cost_usd: 0.42

experiments:
  - iteration: 1
    batch: 1
    hypothesis: "Remove PR template boilerplate before embedding to reduce noise"
    category: "signal-extraction"
    changes:
      - file: "src/preprocessing/text_cleaner.py"
        summary: "Added template detection and removal using common PR template patterns"
    gates:
      largest_cluster_pct: 0.03
      singleton_pct: 0.62
      cluster_count: 489
      runtime_seconds: 48
    gates_passed: true
    diagnostics:
      singleton_pct: 0.62
      median_cluster_size: 3
      cluster_count: 489
      avg_cluster_size: 3.4
    judge:
      mean_score: 3.8
      pct_scoring_4plus: 0.57
      mean_distinct_topics: 1.4
      singleton_false_negative_pct: 0.31
      judge_cost_usd: 0.38
    outcome: "kept"
    primary_delta: "+0.7"       # mean_score: 3.1 -> 3.8
    learnings: "Template removal significantly improved coherence. Clusters now group by actual issue content rather than shared boilerplate. Singleton rate dropped 17pp."
    commit: "abc123"

  - iteration: 2
    batch: 1                    # same batch as iteration 1 (ran in parallel)
    hypothesis: "Lower similarity threshold from 0.85 to 0.75"
    category: "clustering-algorithm"
    changes:
      - file: "config/clustering.yaml"
        summary: "Changed similarity_threshold from 0.85 to 0.75"
    gates:
      largest_cluster_pct: 0.08
      singleton_pct: 0.35
      cluster_count: 210
      runtime_seconds: 47
    gates_passed: true
    diagnostics:
      singleton_pct: 0.35
      median_cluster_size: 5
      cluster_count: 210
    judge:
      mean_score: 2.4
      pct_scoring_4plus: 0.13
      mean_distinct_topics: 3.1   # clusters covering too many unrelated topics
      singleton_false_negative_pct: 0.12
      judge_cost_usd: 0.41
    outcome: "reverted"
    primary_delta: "-0.7"       # mean_score: 3.1 -> 2.4
    learnings: "Lower threshold pulled in more items but destroyed coherence. Clusters became grab-bags. The hard metrics looked good (fewer singletons!) but judge correctly identified the quality drop. Validates that singleton_pct alone is a misleading optimization target."

  - iteration: 3
    batch: 2                    # new batch, runs on top of iteration 1's changes
    hypothesis: "Use issue-to-PR link graph as additional clustering signal"
    category: "graph-signals"
    changes:
      - file: "src/clustering/signals.py"
        summary: "Added link-graph signal extraction from issue-PR references"
      - file: "src/clustering/merger.py"
        summary: "Combined text similarity with link-graph signal using weighted average"
    gates:
      largest_cluster_pct: 0.04
      singleton_pct: 0.48
      cluster_count: 520
      runtime_seconds: 52
    gates_passed: true
    diagnostics:
      singleton_pct: 0.48
      median_cluster_size: 3
      cluster_count: 520
    judge:
      mean_score: 4.1
      pct_scoring_4plus: 0.70
      mean_distinct_topics: 1.2
      singleton_false_negative_pct: 0.22
      judge_cost_usd: 0.39
    outcome: "kept"
    primary_delta: "+0.3"       # mean_score: 3.8 -> 4.1 (from iteration 1 baseline)
    learnings: "Link graph is a strong complementary signal. Issues referencing the same PR are almost always related. Judge scores jumped — 70% of clusters now score 4+. Singleton false negatives dropped further."
    commit: "def456"

  - iteration: 4
    batch: 2
    hypothesis: "Add scikit-learn HDBSCAN for hierarchical density clustering"
    category: "clustering-algorithm"
    changes: []
    gates_passed: false         # not evaluated — deferred
    outcome: "deferred_needs_approval"
    deferred_reason: "Requires unapproved dependency: scikit-learn"
    learnings: "Set aside for batch approval at end of loop."

best:
  iteration: 3
  judge:
    mean_score: 4.1
    pct_scoring_4plus: 0.70
  total_judge_cost_usd: 1.60   # running total across all experiments
```

## Hypothesis Generation Strategies

For the clustering example, here's the kind of hypothesis space the agent should explore:

### Signal Extraction
- Remove PR/issue template boilerplate before embedding
- Extract only user-authored text (strip auto-generated sections)
- Weight title more heavily than body
- Use code snippets / file paths mentioned as signals
- Extract error messages and stack traces as high-signal features

### Graph-Based Signals
- Issue-to-PR links (issues referencing same PR are related)
- Cross-references between issues (`#123` mentions)
- Author patterns (same author filing similar issues)
- Label co-occurrence
- Milestone/project board grouping

### Embedding & Similarity
- Try different embedding models (different size/quality tradeoffs)
- Chunk long issues before embedding vs. truncate vs. summarize
- Weighted combination of multiple similarity signals
- Asymmetric similarity (issue-to-PR vs. issue-to-issue)

### Clustering Algorithm
- Adjust similarity thresholds (per-signal or combined)
- Try hierarchical clustering vs. graph-based community detection
- Two-pass: coarse clusters then split/merge refinement
- Minimum cluster size constraints
- Handle outlier issues that genuinely don't cluster

### Pre-processing
- Normalize markdown formatting
- Deduplicate near-identical issues before clustering
- Language detection and translation for multilingual repos
- Time-decay weighting (recent issues weighted more)

## Resolved Design Decisions

### D1: Measurement Harness Ownership -> DECIDED: Agent builds, user validates

The agent builds the measurement harness in Phase 1 and evaluates it against the current implementation. If the user provides an existing harness, the agent documents how to use it (or reviews existing docs), runs it once, and confirms the baseline measurement is accurate. Either way, the user reviews and approves before the loop starts. This is a hard gate.

### D2: Flaky Metrics -> DECIDED: User-configurable, default stable

The spec supports a `stability` block:

```yaml
measurement:
  command: "python evaluate.py"
  stability:
    mode: "stable"          # default: run once, trust the result
    # mode: "repeat"        # run N times, aggregate
    # repeat_count: 5       # how many runs
    # aggregation: "median" # median | mean | min | max | custom
    # noise_threshold: 0.02 # improvement must exceed this to count
```

When `mode: repeat`, the harness runs `repeat_count` times. The `aggregation` function reduces results to a single value per metric. The `noise_threshold` prevents accepting improvements within the noise floor. Default is `stable` — run once, trust it.

### D3: New Dependencies -> DECIDED: Pre-approve expected, defer surprises

During Phase 2 (Hypothesis Generation), the agent outlines expected new dependencies across all planned variations and gets bulk approval up front. If an experiment during the loop discovers it needs an unapproved dependency, the agent:
1. Sets that hypothesis aside (marks it `deferred_needs_approval` in the experiment log)
2. Continues with other hypotheses that don't need new deps
3. At the end of the loop (or at a user check-in), presents the deferred hypotheses and their dep requirements for batch approval
4. If approved, those hypotheses enter the next iteration batch

This prevents blocking the pipeline on interactive approval during long unattended runs.

### D4: LLM-as-Judge -> DECIDED: Include in v1 (cost-controlled via sampling)

LLM-as-judge is essential for problems where quality requires judgment — it's often the *actual* optimization target, not a nice-to-have. Hard metrics catch degenerate cases but can't tell you whether clusters are coherent or search results are relevant.

**Cost control via stratified sampling**:
- Don't judge every output item — sample a representative set
- Stratified sampling ensures coverage of edge cases (small clusters, large clusters, singletons)
- Default: ~30 samples per evaluation (configurable)
- At ~$0.01-0.03 per judgment call, 30 samples = ~$0.30-0.90 per experiment
- Over 100 experiments = $30-90 total — manageable

**Sampling strategy**:
```yaml
judge:
  sample_size: 30
  stratification:
    - bucket: "small"       # 2-3 items
      count: 10
    - bucket: "medium"      # 4-10 items
      count: 10
    - bucket: "large"       # 11+ items
      count: 10
  # For singletons: sample 10 and ask "should any of these be in a cluster?"
  singleton_sample: 10
```

**Rubric-based scoring** (user-defined, per problem):
```yaml
judge:
  rubric: |
    Rate this cluster 1-5:
    - 5: All items clearly about the same issue/feature
    - 4: Strong theme, minor outliers
    - 3: Related but covers 2-3 sub-topics
    - 2: Weak connection
    - 1: Unrelated items grouped together

    Also answer:
    - How many distinct sub-topics does this cluster represent?
    - Should any items be removed from this cluster?

  scoring:
    primary: "mean_score"          # mean of 1-5 ratings
    secondary: "pct_scoring_4plus" # % of samples scoring 4 or 5
    output_format: "json"          # {"score": 4, "distinct_topics": 1, "remove_items": []}
```

**Judge execution order**:
1. Run degenerate-case gates (fast, free) -- reject obviously broken solutions
2. Run hard metrics (fast, free) -- collect diagnostics
3. Only if gates pass: run LLM-as-judge on sampled outputs (slow, costs money)
4. Keep/revert decision uses judge score as primary metric

**Judge consistency**:
- Use the same sample indices across experiments when possible (same random seed)
- This reduces noise from sample variance — you're comparing the same clusters across runs
- When the output structure changes (different number of clusters), re-sample but log the seed change

**Judge model selection**:
- Default: Haiku (fast, cheap, good enough for rubric-based scoring)
- Option: Sonnet for nuanced judgment (2-3x cost)
- The judge prompt is part of the immutable measurement harness — the agent cannot modify it

**Singleton evaluation** (the non-obvious case):
- Low singleton % isn't automatically good. High singleton % isn't automatically bad.
- Sample singletons and ask the judge: "Given these other clusters, should this item be in one of them? Which one? Or is it genuinely unique?"
- This catches false-negative clustering (items that should cluster but don't) AND validates true singletons

### D5: Codex Support -> DECIDED: Include from v1

Based on patterns from PRs #364/#365 in the compound-engineering plugin:

**Dispatch pattern**: Write experiment prompt to a temp file, pipe to `codex exec` via stdin:
```bash
cat /tmp/optimize-exp-XXXXX.txt | codex exec --skip-git-repo-check - 2>&1
```

**Security posture**: User selects once per session (same as ce-work-beta):
- Workspace write (`--full-auto`)
- Full access (`--dangerously-bypass-approvals-and-sandbox`)

**Result collection**: Inspect working directory diff after `codex exec` completes. No structured result format — Codex writes files, orchestrator reads the diff and runs the measurement harness.

**Guard rails**:
- Check for `CODEX_SANDBOX` / `CODEX_SESSION_ID` env vars to prevent recursive delegation
- 3 consecutive delegate failures auto-disable Codex for remaining experiments
- Orchestrator retains control of git operations, measurement, and keep/revert decisions

### D6: Parallel Execution -> DECIDED: Parallel by default

Experiments run in parallel by default. The user can specify serial execution if the system under test requires it. The skill actively probes for parallelism blockers.

See full parallel execution design below.

---

## Parallel Execution Design

### Default: Parallel Experiments

The optimization loop dispatches multiple experiments simultaneously unless the user explicitly requests serial execution. This is the primary throughput lever — running 4-8 experiments in parallel vs. 1 at a time means 4-8x more iterations per hour.

### Isolation Strategy

Each parallel experiment needs full filesystem isolation. Two mechanisms, selectable per session:

**Local worktrees** (default):
```
.claude/worktrees/optimize-exp-001/   # full repo copy
.claude/worktrees/optimize-exp-002/
.claude/worktrees/optimize-exp-003/
```
- Created via `git worktree add` with a unique branch per experiment
- Each worktree gets its own copy of shared resources (see below)
- Cleaned up after measurement: kept experiments merge to the optimization branch, reverted experiments have their worktree removed

**Codex sandboxes** (opt-in):
- Each experiment dispatched as an independent `codex exec` invocation
- Codex provides built-in filesystem isolation
- Orchestrator collects diffs after completion
- Best for maximizing parallelism (no local resource limits)

**Hybrid** (future):
- Use Codex for implementation, local worktree for measurement
- Useful when measurement requires local resources (GPU, specific hardware, large datasets)

### Parallelism Blocker Detection (Phase 1)

During Phase 1 (Measurement Scaffolding), the skill actively probes for common parallelism blockers:

**Port conflicts**:
- Run the measurement harness and check if it binds to fixed ports
- Search config and code for hardcoded port numbers
- If found: parameterize via environment variable (e.g., `PORT=0` for random, or `BASE_PORT + experiment_index`)
- Add to spec: `parallel.port_strategy: "parameterized"` with the env var name

**Shared database files**:
- Check for SQLite databases, local file-based stores
- If found: each experiment gets a copy of the database in its worktree
- Cleanup: remove copies after measurement
- Add to spec: `parallel.shared_files: ["data/clusters.db"]` with copy strategy

**Shared external services**:
- Check if the system writes to a shared external database, API, or queue
- If found: warn user, suggest serial mode or test database isolation
- This is a hard blocker for parallel unless the user confirms isolation

**Resource contention**:
- Check for GPU usage, large memory requirements
- If the system needs exclusive access to a resource, serial mode is required
- Add to spec: `parallel.exclusive_resources: ["gpu"]`

**Detection output**: Phase 1 produces a `parallel_readiness` assessment:
```yaml
parallel:
  mode: "parallel"            # parallel | serial | user-decision
  max_concurrent: 4           # default, adjustable
  blockers_found: []          # or list of issues
  mitigations_applied:
    - type: "port_parameterization"
      env_var: "EVAL_PORT"
      strategy: "base_port_plus_index"
      base: 9000
    - type: "database_copy"
      source: "data/clusters.db"
      strategy: "copy_per_worktree"
  blockers_unresolved: []     # these force serial unless user resolves
```

### Parallel Loop Mechanics

```
Orchestrator (main branch)
  |
  |-- Batch N experiments from hypothesis backlog
  |     (batch_size = min(backlog_size, max_concurrent))
  |
  |-- For each experiment in batch (parallel):
  |     |-- Create worktree / Codex sandbox
  |     |-- Copy shared resources (DB files, etc.)
  |     |-- Apply parameterization (ports, env vars)
  |     |-- Implement hypothesis (agent edits mutable files)
  |     |-- Run measurement harness
  |     |-- Collect metrics + diff
  |     |-- Clean up shared resource copies
  |
  |-- Wait for all experiments in batch to complete
  |
  |-- Evaluate results:
  |     |-- Rank by primary metric improvement
  |     |-- Filter by guard rails
  |     |-- Select best experiment that passes all guards
  |     |-- If best > current best: KEEP (merge to optimization branch)
  |     |-- All others: REVERT (remove worktrees, log results)
  |     |-- If none improve: log all results, advance to next batch
  |
  |-- Update experiment log with all results (kept + reverted)
  |-- Update hypothesis backlog based on learnings from ALL experiments
  |-- Check stopping criteria
  |-- Next batch
```

### Parallel-Aware Keep/Revert

With parallel experiments, multiple experiments might improve the metric but conflict with each other (they modify the same files in incompatible ways). Resolution strategy:

1. **Non-overlapping changes**: If the best experiment's changes don't overlap with the second-best, consider keeping both (merge sequentially, re-measure after merge to confirm)
2. **Overlapping changes**: Keep only the best. Log the second-best as "promising but conflicts with experiment N" for potential future retry on top of the new baseline
3. **Re-baseline**: After keeping any experiment, all remaining experiments in the batch that were reverted get re-measured mentally against the new baseline — their hypotheses go back into the backlog for potential retry

### Experiment Prompt Template (for Codex dispatch)

```markdown
# Optimization Experiment #{iteration}

## Context
You are running experiment #{iteration} for optimization target: {spec.name}
Current best metrics: {current_best_metrics}
Baseline metrics: {baseline_metrics}

## Your Hypothesis
{hypothesis.description}

## What To Change
Modify ONLY files in the mutable scope:
{spec.scope.mutable}

DO NOT modify:
{spec.scope.immutable}

## Constraints
{spec.constraints}
{approved_dependencies}

## Previous Experiments (for context)
{recent_experiment_summaries}

## Instructions
1. Implement the hypothesis
2. Do NOT run the measurement harness (orchestrator handles this)
3. Do NOT commit (orchestrator handles this)
4. Run `git diff --stat` when done so the orchestrator can see your changes
```

### Concurrency Limits

```yaml
parallel:
  max_concurrent: 4           # default for local worktrees
  # max_concurrent: 8         # default for Codex (no local resource limits)
  codex_rate_limit: 10        # max Codex invocations per minute
  worktree_cleanup: "immediate"  # or "batch" (clean up after full batch)
```

---

## Updated Spec File Format

### Example A: Hard-Metric Primary (build performance, test pass rate)

```yaml
# .context/compound-engineering/optimize/spec.yaml
name: "reduce-build-time"
description: "Reduce CI build time while maintaining test pass rate"

metric:
  primary:
    type: "hard"               # hard | judge
    name: "build_time_seconds"
    direction: "minimize"
    baseline: null             # filled by Phase 1
    target: 60                 # optional target to stop at

  degenerate_gates:            # fast boolean checks, run first
    - name: "test_pass_rate"
      check: ">= 1.0"         # all tests must pass
    - name: "build_exits_zero"
      check: "== true"

  diagnostics:
    - name: "cache_hit_rate"
    - name: "slowest_step"
    - name: "total_test_count"

measurement:
  command: "python evaluate.py"
  timeout_seconds: 600
  output_format: "json"
  stability:
    mode: "stable"
```

### Example B: LLM-Judge Primary (clustering quality, search relevance)

```yaml
# .context/compound-engineering/optimize/spec.yaml
name: "improve-issue-clustering"
description: "Improve coherence and coverage of issue/PR clusters"

metric:
  primary:
    type: "judge"
    name: "cluster_coherence"
    direction: "maximize"
    baseline: null
    target: 4.2               # mean judge score (1-5 scale)

  degenerate_gates:            # cheap checks that reject obviously broken solutions
    - name: "largest_cluster_pct"
      description: "% of all items in the single largest cluster"
      check: "<= 0.10"        # if >10% of items are in one cluster, it's degenerate
    - name: "singleton_pct"
      description: "% of items that are singletons"
      check: "<= 0.80"        # if >80% singletons, clustering isn't working at all
    - name: "cluster_count"
      check: ">= 10"          # fewer than 10 clusters for 18k items is degenerate
    - name: "runtime_seconds"
      check: "<= 600"

  diagnostics:                 # logged for understanding, never gated on
    - name: "singleton_pct"    # note: same metric can be diagnostic AND gate
    - name: "median_cluster_size"
    - name: "cluster_count"
    - name: "avg_cluster_size"
    - name: "p95_cluster_size"

  judge:
    model: "haiku"             # haiku (cheap) | sonnet (nuanced)
    sample_size: 30
    stratification:
      - bucket: "small"       # 2-3 items per cluster
        count: 10
      - bucket: "medium"      # 4-10 items
        count: 10
      - bucket: "large"       # 11+ items
        count: 10
    singleton_sample: 10       # also sample singletons to check false negatives
    sample_seed: 42            # fixed seed for cross-experiment consistency
    rubric: |
      Rate this cluster 1-5:
      - 5: All items clearly about the same issue/feature
      - 4: Strong theme, minor outliers
      - 3: Related but covers 2-3 sub-topics
      - 2: Weak connection
      - 1: Unrelated items grouped together

      Also answer in JSON:
      - "score": your 1-5 rating
      - "distinct_topics": how many distinct sub-topics this cluster represents
      - "outlier_count": how many items don't belong
    singleton_rubric: |
      This item is currently a singleton (not in any cluster).
      Given the cluster titles listed below, should this item be in one of them?

      Answer in JSON:
      - "should_cluster": true/false
      - "best_cluster_id": cluster ID it belongs in (or null)
      - "confidence": 1-5 how confident you are
    scoring:
      primary: "mean_score"              # what the loop optimizes
      secondary:
        - "pct_scoring_4plus"            # % of samples scoring 4+
        - "mean_distinct_topics"         # lower is better (tighter clusters)
        - "singleton_false_negative_pct" # % of sampled singletons that should be clustered

measurement:
  command: "python evaluate.py"          # outputs JSON with gate + diagnostic metrics
  timeout_seconds: 600
  output_format: "json"
  stability:
    mode: "stable"

scope:
  mutable:
    - "src/clustering/"
    - "src/preprocessing/"
    - "config/clustering.yaml"
  immutable:
    - "evaluate.py"
    - "tests/fixtures/"
    - "data/"

execution:
  mode: "parallel"
  backend: "worktree"
  max_concurrent: 4
  codex_security: null

parallel:
  port_strategy: null
  shared_files: ["data/clusters.db"]
  exclusive_resources: []

dependencies:
  approved: []

constraints:
  - "Do not change the output format of clusters"
  - "Preserve backward compatibility with existing cluster consumers"

stopping:
  max_iterations: 100
  max_hours: 8
  plateau_iterations: 10
  target_reached: true
```

### Evaluation Execution Order (per experiment)

```
1. Run measurement command (evaluate.py)
   -> Produces JSON with gate metrics + diagnostics
   -> Fast, free

2. Check degenerate gates
   -> If ANY gate fails: REVERT immediately, log as "degenerate"
   -> Do NOT run the judge (saves money)

3. If primary type is "judge": Run LLM-as-judge
   -> Sample outputs according to stratification config
   -> Send each sample to judge model with rubric
   -> Aggregate scores per scoring config
   -> This is the number the loop optimizes against

4. Keep/revert decision
   -> Based on primary metric (hard or judge score)
   -> Must also pass all degenerate gates (already checked in step 2)
```

---

## Open Questions (Remaining)

1. **Should the agent propose hypotheses, or should the user provide them?**
   - Both — agent generates from analysis, user can inject ideas, agent prioritizes

2. **Judge calibration across experiments**
   - LLM judges can drift or be inconsistent across calls
   - Should we include "anchor samples" — a fixed set of clusters with known scores — in every judge batch to detect drift?
   - If anchor scores shift >0.5 from baseline, re-calibrate or flag for user review

3. **Judge rubric iteration**
   - The rubric itself might need improvement after seeing early results
   - But changing the rubric mid-loop invalidates comparisons to earlier experiments
   - Solution: if rubric changes, re-judge the current best with the new rubric to re-baseline?

4. **Relationship to `/lfg` and `/slfg`?**
   - `/lfg` is autonomous execution of a single task
   - `/ce-optimize` is autonomous execution of an iterative search
   - `/ce-optimize` can delegate each experiment to Codex (decided D5)
   - Local experiments use subagent dispatch similar to `/ce:review`

5. **Branch strategy details?**
   - Main optimization branch: `optimize/<spec-name>`
   - Each kept experiment is a commit on that branch
   - Branch points create `optimize/<spec-name>/direction-<N>`
   - All branches preserved for later reference and comparison

6. **Batch size adaptation?**
   - Should the batch size grow/shrink based on success rate?
   - High success rate -> larger batches (more exploration)
   - Low success rate -> smaller batches (more focused)
   - Or keep it simple and let the user tune `max_concurrent`

7. **Hypothesis diversity within a batch?**
   - Should parallel experiments in the same batch be intentionally diverse?
   - E.g., one threshold tweak + one new signal + one preprocessing change
   - Or let the prioritization algorithm decide naturally?

8. **Judge cost budgets?**
   - Should the spec include a `max_judge_cost_usd` budget?
   - When budget is exhausted, switch to hard-metrics-only mode or stop?
   - Or just track cost in the log and let the user decide?

## What Makes This Different From "Just Using AutoResearch"

AutoResearch is designed for ML training on a single GPU. CE's version needs to handle:

1. **Multi-file changes** — real code changes span multiple files
2. **Complex metrics** — not just one scalar, but primary + guard rails + diagnostics
3. **Varied execution environments** — not just `python train.py` but arbitrary commands
4. **Integration with existing workflows** — learnings, review, ideation
5. **User-in-the-loop** — pause for approval on scope-expanding changes, inject new hypotheses
6. **Knowledge capture** — document what worked and why for the team, not just for the agent's context
7. **Non-ML domains** — clustering, search quality, API performance, test coverage, build times, etc.

## Success Criteria for This Skill

- User can define an optimization target in <15 minutes
- Measurement scaffolding is validated before the loop starts
- Loop runs unattended for hours, producing measurable improvement
- All experiments are preserved in git for later reference
- The winning strategy is documented as a learning
- A human reviewing the experiment log can understand what was tried and why
- The skill handles failures gracefully (bad experiments don't corrupt state)

## Lessons from First Run (2026-03-30)

The skill was tested on the clustering problem for ~90 minutes. Results:

**What worked:**
- Ran 16 experiments, improved multi_member_pct from 31.4% to 72.1%
- Explored multiple algorithm modes (basic, refine, bounded union-find)
- Correctly identified size-bounded union-find as the winning approach
- Hypothesis diversity across parameter sweeps was reasonable

**What failed:**

1. **No LLM-as-judge evaluation** -- The skill defaulted to `type: hard` and optimized `multi_member_pct` as the primary metric. This is a proxy metric that can mislead. A solution that puts 72% of items in clusters is useless if the clusters are incoherent. The Phase 0.2 interactive spec creation did not actively probe whether the target was qualitative or guide toward judge mode.

   **Fix applied**: Phase 0.2 now includes explicit qualitative vs quantitative detection, concrete examples of when to use each type, sampling strategy guidance with walkthrough questions, and rubric design guidance. The skill now strongly recommends `type: judge` for qualitative targets.

2. **No disk persistence** -- Experiment results existed only in the conversation context (as a table dumped to chat). If the session had been compacted or crashed, all 90 minutes of results would have been lost. This directly contradicts the Karpathy model where `results.tsv` is written after every single experiment.

   **Fix applied**: Added mandatory disk checkpoints (CP-0 through CP-5) at every phase boundary. Each checkpoint requires a write-then-verify cycle: write the file, read it back, confirm the content is present. The persistence discipline section now explicitly states "If you produce a results table in the conversation without writing those results to disk first, you have a bug."

3. **Sampling strategy not prompted** -- Even if `type: judge` had been used, the skill didn't guide the user through designing a sampling strategy. For clustering, the user wants stratified sampling across: top clusters by size (check for mega-clusters), mid-range clusters (representative quality), small clusters (check if connections are real), and singletons (check for false negatives). This domain-specific guidance was missing.

   **Fix applied**: Phase 0.2 now walks through sampling strategy design with concrete questions and domain-specific examples.

**Key takeaway**: The skill had all the right machinery in the schema and templates but the SKILL.md instructions didn't forcefully enough guide the agent toward using that machinery. Instructions that say "if judge type, do X" are ignored when the skill silently defaults to hard type. Instructions need to actively detect the right path and guide toward it.

## Next Steps

1. Re-test with the clustering use case using `type: judge` to validate the judge loop works end-to-end
2. Verify disk persistence works on a long run (2+ hours) with context compaction
3. Test with a second use case (e.g., prompt optimization, build performance) to validate generality
4. Consider adding anchor samples for judge calibration across experiments (Open Question #2)
5. Consider judge cost budgets (Open Question #8)
