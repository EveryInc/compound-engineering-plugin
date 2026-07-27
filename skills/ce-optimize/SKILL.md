---
name: ce-optimize
description: "Run metric-driven optimization loops. Use when improving measurable outcomes such as search relevance, clustering quality, build performance, prompt quality, or scored behavior through experiments."
argument-hint: "[path to optimization spec YAML, or describe the optimization goal]"
---

# Iterative Optimization Loop

Run metric-driven iterative optimization. Define a goal, build measurement scaffolding, then run parallel experiments that converge toward the best solution.

## Interaction Method

Use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

## Input

The **optimization input** is the input this skill was invoked with — present in the current prompt or conversation, whether the user provided it directly or a calling skill passed it: a goal to optimize, or a path to an optimization spec YAML file.

If no optimization input was provided, ask: "What would you like to optimize? Describe the goal, or provide a path to an optimization spec YAML file."

## Optimization Spec Schema

Reference the spec schema for validation:

`references/optimize-spec-schema.yaml`

## Experiment Log Schema

Reference the experiment log schema for state management:

`references/experiment-log-schema.yaml`

## Quick Start

For a first run, optimize for signal and safety, not maximum throughput:

- Start from `references/example-hard-spec.yaml` when the metric is objective and cheap to measure
- Use `references/example-judge-spec.yaml` only when actual quality requires semantic judgment
- Prefer `execution.mode: serial` and `execution.max_concurrent: 1`
- Cap the first run with `stopping.max_iterations: 4` and `stopping.max_hours: 1`
- Avoid new dependencies until the baseline and measurement harness are trusted
- For judge mode, start with `sample_size: 10`, `batch_size: 5`, and `max_total_cost_usd: 5`

For a friendly overview of what this skill is for, when to use hard metrics vs LLM-as-judge, and example kickoff prompts, see:

`references/usage-guide.md`

---

## Frozen Experiment and Judge Routing

Generalized routing may select execution identity for exactly two optimization roles: `ce-optimize.experiment-author` (implementation) and `ce-optimize.semantic-judge` (verification). It does not select hypotheses, activate judge mode, or own any optimization decision.

### Mandatory Controller

After the approved spec is written and before CP-0, load `references/execution-routing.md` and `references/controller-protocol.md`. Drive every fresh start, resume, author/judge attempt lock, Codex or host receipt, finalization, measurement marker, checkpoint, abandonment, and worktree reset through the co-located `scripts/optimize-controller.py`; do not assemble resolver or lifecycle state in conversation or worker-authored files.

The controller issues one `ce-routing/v1` `resolve_batch` for the already-active roles, persists the complete self-validating resolver snapshot and source revisions in effective-user-private state, and validates every binding and attempt-lock digest on resume. It never rereads live routing after start. A hard-metric run resolves only the author. A judge run resolves author and judge independently in that one request. `ce-default` and no routing preserve built-in model behavior while still receiving controller-owned lifecycle locks.

The approved optimization spec remains higher authority than routing. A route cannot change backend, sandbox flags, mutable/immutable scope, measurement command or stability settings, shared inputs, judge sampling/rubric/separation, concurrency, checkpoint ownership, or stopping criteria. Backend incompatibility follows frozen policy non-interactively: `require` blocks; `prefer` can advance only through controller-verified terminal, unintegrated, discarded history to the next declared ordinal.

Every author and judge attempt is locked before dispatch and bound to role, experiment/judge instance, recipient, backend, worktree, approved spec and constraints digests, exact measurement command/digest, mutable/immutable scopes, execution policy, and stopping criteria. Required output remains quarantined until identity and scope verification accepts it. The controller derives adapter outcome, terminal/integrated state, serving model/effort evidence, and cumulative prior history from its own process/host receipts, result markers, and checkpoints; callers and workers do not supply these fields to finalization.

All Codex author or judge commands and every controller measurement run through the controller's co-located Linux Landlock/network-denial adapter with a fresh empty environment, isolated HOME/XDG/temp/backend roots, and only explicit private JSON backend auth. Real home, ambient tokens, `.env*`, SSH/cloud stores, hidden references, canonical checkout, controller results, unrelated paths, and network sockets remain inaccessible. A launch barrier records authority before child code runs, and a child subreaper kills/reaps double-forked or `setsid` descendants before terminal evidence. If the exact executable, interpreter, confinement, auth, environment, or receipt boundary cannot be preserved, preflight is unavailable. The semantic judge remains a distinct instance with no experiment worktree or mutable authority and receives only rubric plus sampled candidate output.

The controller appends each redacted event before returning it. Import and verify events in `routing-events.jsonl`/`route_events` sequence before display, and preserve existing bounded dispatch and backpressure; routing never changes queue membership or concurrency.

---

## Persistence Discipline

**CRITICAL: After CP-1, the experiment log on disk is the source of truth for optimization results; controller state is the source of truth for routing, processes, receipts, quarantine, result markers, checkpoints, and worktree leases from CP-0 onward. The conversation context is NOT durable storage. Results that exist only in the conversation WILL be lost.**

The files under `.context/compound-engineering/ce-optimize/<spec-name>/` are local scratch state. They are ignored by git, so they survive local resumes on the same machine but are not preserved by commits, branches, or pushes unless the user exports them separately.

Every piece of state that matters MUST live on disk, not in the agent's memory.

**If you produce a results table in the conversation without writing those results to disk first, you have a bug.** The conversation is for the user's benefit. The experiment log file is for durability.

### Core Rules

1. **Write each experiment result to disk IMMEDIATELY after measurement** — not after the batch, not after evaluation, IMMEDIATELY. Append the experiment entry to the experiment log file the moment its metrics are known, before evaluating the next experiment. This is the #1 crash-safety rule.

2. **VERIFY every critical write** — after writing the experiment log, read the file back and confirm the entry is present. This catches silent write failures. Do not proceed to the next experiment until verification passes.

3. **Re-read from disk at every phase boundary and before every decision** — never trust in-memory state across phase transitions, batch boundaries, or after any operation that might have taken significant time. Re-read the experiment log and strategy digest from disk.

4. **The experiment log is append-only during Phase 3** — never rewrite the full file. Append new experiment entries. Update the `best` section in place only when a new best is found. This prevents data loss if a write is interrupted.

5. **Per-experiment result markers for crash recovery** — `optimize-controller.py measure` executes the exact frozen stability repeats under confinement and writes one controller-owned `result-marker.json` plus the bound `result.yaml` mirror after deterministic aggregation. On resume, recover only a marker that controller state validates against the snapshot, attempt lock, constraints/measurement digests, accepted author receipt, repeat policy, and supervised process evidence.

6. **Strategy digest is written after every batch, before generating new hypotheses** — the agent reads the digest (not its memory) when deciding what to try next.

7. **Never present results to the user without writing them to disk first** — the pattern is: measure -> write to disk -> verify -> THEN show the user. Not the reverse.

8. **Controller state is durable control state** — complete `optimize-controller.py start` before the first author or judge dispatch. It writes and verifies the immutable routing snapshot, attempt state, and append-only event journal under the private run root. Import each monotonically numbered event into the log after CP-1; do not report or start another attempt until required writes agree. On resume, reconcile a controller-journal-only event into the log by sequence. Never reconstruct routing, receipts, process state, or leases from conversation context.

### Mandatory Disk Checkpoints

These are non-negotiable write-then-verify steps. At each checkpoint, the agent MUST write the specified file and then read it back to confirm the write succeeded.

| Checkpoint | File Written | Phase |
|---|---|---|
| CP-0: Spec and route frozen | `spec.yaml` + private controller `state.json` + controller `routing-events.jsonl` | Phase 0, after user approval and before author/judge dispatch |
| CP-1: Baseline recorded | `experiment-log.yaml` (initial with baseline) | Phase 1, after baseline measurement |
| CP-2: Hypothesis backlog saved | `experiment-log.yaml` (hypothesis_backlog section) | Phase 2, after hypothesis generation |
| CP-3: Each experiment result | `experiment-log.yaml` (append experiment entry) | Phase 3.3, immediately after each measurement |
| CP-4: Batch summary | `experiment-log.yaml` (outcomes + best) + `strategy-digest.md` | Phase 3.5, after batch evaluation |
| CP-5: Final summary | `experiment-log.yaml` (final state) | Phase 4, at wrap-up |

**Format of a verification step:**
1. Write the file using the native file-write tool
2. Read the file back using the native file-read tool
3. Confirm the expected content is present
4. If verification fails, retry the write. If it fails twice, alert the user.

### File Locations (all under `.context/compound-engineering/ce-optimize/<spec-name>/`)

| File | Purpose | Written When |
|------|---------|-------------|
| `spec.yaml` | Optimization spec (immutable during run) | Phase 0 (CP-0) |
| private controller `state.json` | Frozen snapshot/bindings plus process, receipt, quarantine, marker, checkpoint, and lease state | Phase 0 onward; controller-owned |
| private controller `routing-events.jsonl` | Append-only redacted route/process/checkpoint events | Phase 0 onward, before each route disclosure |
| `experiment-log.yaml` | Full history of all experiments | Initialized at CP-1, appended at CP-3, updated at CP-4 |
| `strategy-digest.md` | Compressed learnings for hypothesis generation | Written at CP-4 after each batch |
| private `result-marker.json` + `<worktree>/result.yaml` | Controller-owned marker and recovery mirror | Immediately after controller measurement, before CP-3 |

### On Resume

When Phase 0.4 detects an existing run:
1. Read the experiment log from disk — this is the ground truth
2. Call controller `status`; verify the complete snapshot, source revisions, binding/attempt-lock digests, constraints, process/receipt state, and spec digest without rereading live routing
3. Inspect controller-owned result markers not yet in the log; treat a worktree-only `result.yaml` as untrusted recovery input
4. Recover only measured-but-unlogged experiments whose controller marker validates against the frozen attempt and accepted author receipt
5. Continue from where the log left off with the same author and judge bindings

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
   - Which ignored/untracked shared inputs are explicitly sanctioned, and are all of them canonical, symlink-free, `.env*`-free, and covered by `scope.immutable`?
   - Which environment names, if any, are explicitly sanctioned for an experiment recipient? Default `execution.sanctioned_env` to empty; never infer it from the ambient process.
   - Are there hidden reference/answer paths? Record them under `metric.judge.hidden_reference_paths` and keep them host-only, untracked, and absent from both recipient prompts and worktrees.
   - Any constraints or dependencies?
   - If this is the first run: recommend `execution.mode: serial`, `execution.max_concurrent: 1`, `stopping.max_iterations: 4`, and `stopping.max_hours: 1`
   - If `type: judge`: recommend `sample_size: 10`, `batch_size: 5`, and `max_total_cost_usd: 5` until the rubric and harness are trusted
6. Write the spec to `.context/compound-engineering/ce-optimize/<spec-name>/spec.yaml`
7. Present the spec to the user for approval before proceeding
8. After approval, read it back, validate every path against the canonical repository root, and complete CP-0 by freezing routing as Phase 0.6 describes

### 0.3 Search Prior Learnings

<!-- ce-dispatch-site:ce-optimize.learnings-research -->
Read `references/agents/learnings-researcher.md` and dispatch a generic subagent seeded with that local prompt to search for prior optimization work on similar topics. Do not dispatch a standalone agent by type/name. If relevant learnings exist, incorporate them into the approach.

### 0.4 Run Identity Detection

Check if `optimize/<spec-name>` branch already exists:

```bash
git rev-parse --verify "optimize/<spec-name>" 2>/dev/null
```

**If branch exists**, check for an existing experiment log at `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml`.

Present the user with a choice via the platform question tool:
- **Resume**: read optimization results from the experiment log and lifecycle/routing authority from controller `status` (never in-memory context). Recover measured-but-unlogged experiments only from controller-validated result markers; a worktree-only `result.yaml` has no authority. Continue from the last verified iteration.
- **Fresh start**: archive the old branch to `optimize-archive/<spec-name>/archived-<timestamp>`, clear the experiment log, start from scratch

### 0.5 Create Optimization Branch and Scratch Space

```bash
git checkout -b "optimize/<spec-name>"  # or switch to existing if resuming
```

Create scratch directory:
```bash
mkdir -p .context/compound-engineering/ce-optimize/<spec-name>/
```

### 0.6 Freeze Routing and Task Constraints (CP-0)

For a fresh run, follow `references/controller-protocol.md`: materialize the approved constraints and host-owned intents in private files and call `optimize-controller.py start`. Read back `spec.yaml` and controller `status`; verify the complete snapshot, source revisions, author/judge role instances, per-resolution binding/attempt-lock digests, spec/constraints/measurement digests, and empty attempt set. Do not begin baseline judging or Phase 2/3 authoring until this succeeds.

For Resume, call the same controller `start` request so spec/constraints/host/intent drift is checked before `status`. Do not invoke the resolver directly, adopt a newly configured model, accept a caller-supplied snapshot/binding/lock, or replace missing state after any dispatch, route event, marker, commit, merge, or checkpoint. A legacy pre-controller run may continue only as a fresh run with no dispatched/integrated state; otherwise block rather than guessing process or recipient state.

---

## Phase 1: Measurement Scaffolding

**This phase is a HARD GATE. The user must approve baseline and parallel readiness before Phase 2.**

**Bundled scripts.** Phases 0, 1, and 3 call helpers that ship in this skill's `scripts/` directory (`optimize-controller.py`, `optimize-landlock.py`, `measure.sh`, `parallel-probe.sh`, `experiment-worktree.sh`). The Bash tool's working directory is the user's project, not the skill directory, so a bare `scripts/<name>` path will not resolve — invoke each by the skill's own absolute path. Every runnable block below already sets `SKILL_DIR` inline (shell state does not persist between Bash tool calls, so each block must carry it); just replace the `<absolute path …>` placeholder with the directory you loaded this `ce-optimize` SKILL.md from before running. The shape:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/<name>"
```

### 1.1 Clean-Tree Gate

Verify no uncommitted changes to files within `scope.mutable` or `scope.immutable`:

```bash
git status --porcelain
```

Filter the output against the scope paths. If any in-scope files have uncommitted changes:
- Report which files are dirty
- Ask the user to commit or stash before proceeding
- Do NOT continue until the working tree is clean for in-scope files

Git status is only an operator preview. Before every attempt lock, the controller walks and digests the complete worktree, including ignored/untracked material, and rejects symlinks, special files, undeclared shared inputs, and every out-of-scope path. That inventory, not this preview, is dispatch authority.

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

If primary type is `judge`, use the frozen `ce-optimize.semantic-judge` binding and withhold hidden reference answers.
<!-- ce-dispatch-site:ce-optimize.baseline-judge -->
Run the judge evaluation on baseline output, keep each response quarantined, finalize its identity independently, and only then parse and aggregate it into the starting judge score. Do not let baseline judging share the author identity.

### 1.4 Parallelism Readiness Probe

Run the parallelism probe script:
```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/parallel-probe.sh" "<project_directory>" "<measurement.command>" "<measurement.working_directory>" <shared_files...>
```

Read the JSON output. Present any blockers to the user with suggested mitigations. Treat the probe as intentionally narrow: it should inspect the measurement command, the canonical symlink-free measurement working directory, and explicitly declared shared files, not the entire repository. Any unsafe or escaping path forces serial/blocking review rather than widening the scan.

### 1.5 Worktree Budget Check

Count existing worktrees:
```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/experiment-worktree.sh" count
```

If count + `execution.max_concurrent` would exceed 12:
- Warn the user
- Suggest cleaning up existing worktrees or reducing `max_concurrent`
- Do NOT block -- the user may proceed at their own risk

### 1.6 Write Baseline to Disk (CP-1)

**MANDATORY CHECKPOINT.** Before presenting results to the user, write the initial experiment log with baseline metrics to disk:

1. Create the experiment log file at `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml`
2. Include all required top-level sections from `references/experiment-log-schema.yaml`: `spec`, `run_id`, `started_at`, `routing_context`, `route_events`, `baseline`, `experiments`, and `best`; import every verified event already present in `routing-events.jsonl`
3. Seed `experiments` as an empty array and seed `best` from the baseline snapshot (use `iteration: 0`, baseline metrics, and baseline judge scores if present) so later phases have a valid current-best state to compare against
4. Optionally seed `hypothesis_backlog: []` here as well so the log shape is stable before Phase 2 populates it
5. **Verify**: read the file back and confirm the required sections are present and the baseline values match
6. Only THEN present results to the user

### 1.7 User Approval Gate

Present to the user via the platform question tool:

- **Baseline metrics**: all gate values, diagnostic values, and judge scores (if applicable)
- **Experiment log location**: show the file path so the user knows where results are saved
- **Parallel readiness**: probe results, any blockers, mitigations applied
- **Clean-tree status**: confirmed clean
- **Worktree budget**: current count and projected usage
- **Judge budget**: estimated per-experiment judge cost and configured `max_total_cost_usd` cap (or an explicit note that spend is uncapped)
- **Routing**: redacted author/judge profiles, policies, requested selectors, and backend-eligibility blockers; write and verify these route events before displaying them

**Options:**
1. **Proceed** -- approve baseline and parallel config, move to Phase 2
2. **Adjust spec** -- modify spec settings before proceeding
3. **Fix issues** -- user needs to resolve blockers first

Do NOT proceed to Phase 2 until the user explicitly approves.

If primary type is `judge` and `max_total_cost_usd` is null, call that out as uncapped spend and require explicit approval before proceeding.

**State re-read:** After gate approval, re-read the spec and baseline from disk. Do not carry stale in-memory values forward.

---

## Phase 2: Hypothesis Generation

### 2.1 Analyze Current Approach

Read the code within `scope.mutable` to understand:
- The current implementation approach
- Obvious improvement opportunities
- Constraints and dependencies between components

<!-- ce-dispatch-site:ce-optimize.repo-research -->
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
3. Mark each hypothesis's `dep_status` as `approved` or `needs_approval`

Hypotheses with unapproved dependencies remain in the backlog but are skipped during batch selection. They are re-presented at wrap-up for potential approval.

### 2.4 Record Hypothesis Backlog (CP-2)

**MANDATORY CHECKPOINT.** Write the initial backlog to the experiment log file and verify:
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

The Phase 3 blocks below each set `SKILL_DIR` inline as well (the loaded `ce-optimize` skill directory; see the Bundled scripts note in Phase 1) — shell state does not persist from Phase 1, so each block carries its own assignment.

**Worktree backend:**
1. Select the next candidate only from controller status. Qualify it against the current host's existing worktree-subagent adapter; a configured model with no supported selector, another harness, or any requested route/effort change is unavailable.
2. Sanction the recipient, canonical workspace scope, exact `parallel.shared_files`, and `execution.sanctioned_env`. Then create the experiment worktree. The helper defaults to routed isolation, rejects path escapes/symlinks/`.env*`/undeclared inputs, and consults controller leases before any reuse/reset. Pass `--routed` for a profile binding; pass `--legacy-no-routing` only when the frozen binding itself is CE-default/built-in:
   ```bash
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   WORKTREE_PATH=$(bash "$SKILL_DIR/scripts/experiment-worktree.sh" create "<spec_name>" <exp_index> "optimize/<spec_name>" --routed <shared_files...>)  # profile binding
   ```
3. Immediately call controller `lock-attempt` for this author role/experiment instance with `--adapter host` and the returned worktree. The lock must succeed before constructing recipient material. Call `authorize-host` immediately before dispatch; do not release the host launch barrier until its durable token is recorded. Apply port parameterization only to the later controller-owned measurement process; do not forward measurement environment to the author.
4. Fill the experiment prompt template (`references/experiment-prompt-template.md`) into a private file with:
   - Iteration number, spec name
   - Hypothesis description and category
   - Current best and baseline metrics
   - Mutable and immutable scope
   - Canonical sanctioned shared inputs (names only; empty when none)
   - Constraints and approved dependencies
   - Rolling window of last 10 experiments (concise summaries)
<!-- ce-dispatch-site:ce-optimize.worktree-experiment -->
5. Dispatch a generic subagent with the qualified model selector outside the prompt, working in the experiment worktree. Preserve existing tools, permission mode, bounded scheduling, and the controller lock. Supply only the freshly constructed sanctioned environment under inherited Landlock. The owning host, not the worker, supervises/reaps every descendant and writes the launch-token-bound terminal/serving receipt described in `references/controller-protocol.md`, then records it with controller `record-host`. If the host cannot enforce the barrier, confinement, descendant supervision, or receipt, preflight is unavailable; an unknown launch cannot be abandoned.

**Codex backend:**
1. Select the next candidate only from controller status. It is eligible only with `harness: codex` and a safe model selector accepted by the fixed controller adapter.
2. Check the existing environment guard. Do NOT delegate if already inside a Codex sandbox or if Git metadata is not writable. For a profile binding this makes the candidate unavailable and cannot switch the spec backend; CE-default/no-routing retains the shipped v3.20.0 subagent fallback:
   ```bash
   # Any true condition makes the configured Codex backend unavailable.
   test -n "${CODEX_SANDBOX:-}" || test -n "${CODEX_SESSION_ID:-}" || test ! -w .git
   ```
3. Map only the approved spec's `execution.codex_security` to its existing flag: `full-auto` -> `--full-auto`; `yolo` -> `--dangerously-bypass-approvals-and-sandbox`. A route cannot select, remove, or weaken this flag. If the spec value is null, retain the existing once-per-session user choice before dispatch; routing never answers that question.
4. Sanction recipient/material/environment, create the worktree, and write the filled experiment prompt plus explicit JSON auth manifest to private files. Call controller `lock-attempt` with the exact Codex executable, worktree, candidate ordinal, and auth manifest. This performs confinement/auth preflight and creates the durable attempt lease before dispatch.
<!-- ce-dispatch-site:ce-optimize.codex-experiment -->
5. Dispatch the author only through the controller's frozen Codex adapter. It supplies `--skip-git-repo-check`, the unchanged security flag, and the lock-bound model selector under its sanitized Landlock environment:
    ```bash
    SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
    python3 -I -S "$SKILL_DIR/scripts/optimize-controller.py" dispatch --run-id "<run-id>" --attempt-id "<attempt-id>" --prompt "<private-prompt-file>"
    ```
    Never invoke `codex` directly. CE-default/no-routing omits only the model override inside the controller; backend, security flag, environment isolation, and attempt locking remain enforced.

### 3.3 Collect and Persist Results

Process experiments as they complete — do NOT wait for the entire batch to finish before writing results.

For each completed experiment, **immediately**:

1. **Finalize author identity while output is isolated.** Call controller `finalize` with only run and attempt IDs. It validates the exact frozen snapshot/lock and derives serving evidence, typed outcome, terminal/unintegrated state, and cumulative history from controller receipts. Append and verify the redacted receipt before reporting it. `ACCEPT` releases inspection; `NEXT_CANDIDATE` records terminal abandonment and requires controller-authorized worktree reset plus fresh sanction; `BLOCK` preserves quarantined diagnostic state and forbids measurement, result markers, checkpoints, commits, and merges.

2. **Verify scope before measurement.** Inspect actual changed paths and modes against canonical `scope.mutable`. Reject any immutable, shared-input, hidden-reference, out-of-scope, symlink, or path-escape change. Re-hash the immutable measurement harness and sanctioned shared inputs against the CP-0 constraints digest. A violation is an experiment failure, not route unavailability; it is terminal for this experiment and never authorizes another recipient.

3. **Run measurement** in the experiment's worktree through the controller-owned frozen harness:
    ```bash
    SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
    python3 -I -S "$SKILL_DIR/scripts/optimize-controller.py" measure --run-id "<run-id>" --attempt-id "<attempt-id>"
    ```
   - The controller runs exactly `repeat_count` executions from the frozen stability policy and applies the frozen aggregation before publishing one marker. Never invoke `measure` again to add a repeat or aggregate in conversation.
   - Use the controller's aggregated metrics as the experiment's score; if its spread evidence exceeds `noise_threshold`, record that in learnings so the operator knows the result is noisy.

4. **Verify the crash-recovery marker** — controller measurement writes private `result-marker.json` and the bound worktree `result.yaml` mirror containing snapshot, attempt-lock, accepted author receipt, constraints/measurement digests, process result, and raw-output digests. Read controller status and the marker back. Never mint or repair marker authority from a worktree file.

5. **Read raw JSON output** from the measurement script

6. **Evaluate degenerate gates**:
   - For each gate in `metric.degenerate_gates`, parse the operator and threshold
   - Compare the metric value against the threshold
   - If ANY gate fails: mark outcome as `degenerate`, skip judge evaluation, save money

7. **If gates pass AND primary type is `judge`**:
   - Read the experiment's output (cluster assignments, search results, etc.)
   - Apply stratified sampling per `metric.judge.stratification` config (using `sample_seed`)
   - Remove hidden answer/reference fields and never read or include `metric.judge.hidden_reference_paths` in recipient material
   - Group samples into batches of `metric.judge.batch_size`
   - Fill the judge prompt template (`references/judge-prompt-template.md`) for each batch
<!-- ce-dispatch-site:ce-optimize.judge-batches -->
    - For each of the `ceil(sample_size / batch_size)` judge instances, call controller `lock-attempt`, then dispatch each judge from its independent frozen binding. Use the same bounded queue/backpressure policy. Each judge has a fresh attempt ID/environment/receipt, no experiment worktree or author session, and only its private rubric/sample prompt.
    - Route Codex judges through controller `dispatch`; native judges return an owning host receipt through `record-host`. Keep each structured JSON response quarantined and call controller `finalize` before parsing it. Discard `NEXT_CANDIDATE` output; `BLOCK` makes the experiment unscored and cannot be treated as a hard-metric success.
   - After every required judge response is accepted, aggregate scores: compute the configured primary judge field from `metric.judge.scoring.primary` (which should match `metric.primary.name`) plus any `scoring.secondary` values
<!-- ce-dispatch-site:ce-optimize.singleton-judges -->
   - If `singleton_sample > 0`: also dispatch fresh singleton evaluation sub-agents through the same semantic-judge binding and finalization gate

8. **If gates pass AND primary type is `hard`**:
   - Use the metric value directly from the measurement output

9. **IMMEDIATELY append to experiment log on disk (CP-3)** — do not defer this to batch evaluation. Write the experiment entry (iteration, routing snapshot, attempt lock, author receipt, judge receipts, hypothesis, outcome, metrics, learnings) to `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml` right now. Use the transitional outcome `measured` once the experiment has valid metrics but has not yet been compared to the current best. Update the outcome to `kept`, `reverted`, or another terminal state in the evaluation step, but the raw metrics are on disk and safe from context compaction.

10. **VERIFY and checkpoint CP-3** — read the experiment log back and confirm the entry, snapshot, lock, metrics, and receipts. Call controller `checkpoint --checkpoint-path <approved-experiment-log>` for the author plus every accepted judge instance. The row must include the controller's run/attempt/snapshot/spec/lock/receipt/constraints/measurement/marker/metrics digests; the controller reopens and parses the exact bytes rather than trusting a caller hash. If verification fails, retry the write and do not checkpoint. Only controller `completed`/`abandoned` state permits `experiment-worktree.sh cleanup`; destructive cleanup remains inside the controller's per-worktree lock.

**Why immediately + verify?** The agent's context window is NOT a durable store. Context compaction, session crashes, and restarts are expected during long runs — results that exist only in the agent's memory are lost. The verification step catches silent write failures that would otherwise lose data.

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
   - After the merge succeeds and the controller checkpoint is completed, clean up the winner's experiment worktree and branch; the integrated commit on the optimization branch is the durable artifact
   - This is now the new baseline for subsequent batches
   - The author recipient is permanently fixed for this experiment once its result marker, CP-3 entry, commit, or merge exists

4. **Check file-disjoint runners-up** (up to `max_runner_up_merges_per_batch`):
   - For each runner-up that also improved, check file-level disjointness with the kept experiment
   - **File-level disjointness**: two experiments are disjoint if they modified completely different files. Same file = overlapping, even if different lines.
   - If disjoint: cherry-pick the runner-up onto the new baseline, re-run full measurement
   - If combined measurement is strictly better: keep the cherry-pick (outcome: `runner_up_kept`), then clean up that controller-checkpointed runner-up's experiment worktree and branch
   - Otherwise: revert the cherry-pick, log as "promising alone but neutral/harmful in combination" (outcome: `runner_up_reverted`), then clean up that controller-checkpointed runner-up's experiment worktree and branch
   - Stop after first failed combination

5. **Handle deferred deps**: experiments that need unapproved dependencies get outcome `deferred_needs_approval`

6. **Revert all others**: after CP-3 append/read-back and controller checkpoint, clean up their worktrees and log as `reverted`

### 3.5 Update State (CP-4)

**MANDATORY CHECKPOINT.** By this point, individual experiment results are already on disk (written in step 3.3). This step updates aggregate state and verifies.

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

**CP-4 Verification:** Read the experiment log back from disk. Confirm: (a) all experiment outcomes from this batch are finalized, (b) the `best` section reflects the current best, (c) the hypothesis backlog is updated. Read `strategy-digest.md` back and confirm it exists. Only THEN proceed to the next batch or stopping criteria check.

**Checkpoint: at this point, all state for this batch is on disk. If the agent crashes and restarts, it can resume from the experiment log without loss.**

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

### 3.7 Cross-Cutting Concerns

**Codex failure cascade**: Track consecutive Codex delegation failures. For a profile binding, after 3 consecutive failures stop further author dispatches and record the configured Codex backend as unavailable; routing cannot fall back to a worktree subagent or change backend. CE-default/no-routing retains the shipped v3.20.0 fallback behavior. The user may start a fresh routed run with a different approved spec.

**Error handling**: If an experiment's measurement command crashes, times out, or produces malformed output:
- Log as outcome `error` or `timeout` with the error message
- Revert the experiment (cleanup worktree)
- The loop continues with remaining experiments in the batch

**Progress reporting**: After each batch, report:
- Batch N of estimated M (based on backlog size)
- Experiments run this batch and total
- Current best metric and improvement from baseline
- Cumulative judge cost (if applicable)
- Redacted author/judge routing outcomes, with every fallback, mismatch, or blocker shown separately

**Crash recovery**: See Persistence Discipline section. Controller-owned result markers are written in step 3.3, individual results are appended immediately, and batch state is written in step 3.5. On resume, the log is ground truth for recorded metrics and controller state is ground truth for process/receipt/marker/checkpoint authority. Recover only controller-validated markers not yet reflected in the log. Altered live configuration never changes the resumed recipient.

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
The experiment log and strategy digest remain in local `.context/...` scratch space for resume and audit on this machine only; they do not travel with the branch because `.context/` is gitignored.

Present post-completion options via the platform question tool:

1. **Run `ce-code-review`** on the cumulative diff (baseline to final). Load the `ce-code-review` skill on the optimization branch (interactive or `mode:agent`). To land eligible fixes before the next option, apply the mechanical-apply bar below.

   **Mechanical-apply bar:** apply any finding with a concrete `suggested_fix` that is a clear, reversible improvement; push back (keep, don't apply) when the reviewer is wrong, noting why. Defer anything whose right fix needs a design or product decision (architecture direction, contract shape, behavior change needing sign-off) and any finding with no concrete fix to act on — surface what was deferred. Confirm evidence still matches at `file:line` before editing. After applying, run tests (at least targeted tests for what changed; broader suite for multi-file edits). Do not commit or push from this step — leave the diff on the optimization branch for the Create PR option.
2. **Run `ce-compound`** to document the winning strategy as an institutional learning.
3. **Create PR** from the optimization branch to the default branch.
4. **Continue** with more experiments: re-enter Phase 3 with the current state. State re-read first.
5. **Done** -- leave the optimization branch for manual review.

### 4.4 Cleanup

Clean up scratch space:
```bash
# Keep the experiment log for local resume/audit on this machine
# Remove temporary batch artifacts
rm -f .context/compound-engineering/ce-optimize/<spec-name>/strategy-digest.md
```

Do NOT delete the experiment log if the user may resume locally or wants a local audit trail. If they need a durable shared artifact, summarize or export the results into a tracked path before cleanup.
Do NOT delete experiment worktrees that are still being referenced.
