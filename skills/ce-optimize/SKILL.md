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

### Resolve Once Per Run

After the approved spec is written at CP-0 and before any baseline judge or experiment dispatch, load `references/execution-routing.md`. For a judge run, issue one `ce-routing/v1` `resolve_batch` containing `ce-optimize.experiment-author` and `ce-optimize.semantic-judge`; resolve their bindings independently but freeze both from that one snapshot. A hard-metric run resolves only `ce-optimize.experiment-author` and never activates a judge because a route exists. Include the current harness/serving family, normalized current-task routing intent, and an inherited parent snapshot when present. Write the request to an effective-user-private file and, from this skill's directory, invoke `SKILL_DIR="<absolute path of this ce-optimize skill>"; python3 -I -S "$SKILL_DIR/scripts/ce-routing.py" --request-file <request-path>`. Use the same co-located resolver for `finalize_attempt` and remove the request file afterward. Routing control data stays private and never enters a hypothesis, prompt, sampled item, rubric, result, or measurement command.

Persist `snapshot_id`, source revisions, every selected binding, and a `constraints_digest` in the run's `routing-context.json` before dispatch. Build the digest from the approved spec's backend, mutable/immutable scope, measurement command and stability policy, judge configuration and separation, execution mode and `max_concurrent`, `codex_security`, sanctioned shared inputs/environment, and stopping criteria: normalize those fields to canonical JSON (UTF-8, recursively sorted keys, compact separators) and record `sha256:<lowercase-hex>`. Write and read back this file before proceeding, then copy the same fields into `experiment-log.yaml` at CP-1.

On resume, read the frozen routing context and bindings from disk; do not re-resolve or reread live routing configuration. Compare the approved spec to `constraints_digest` and block on mismatch. Later config drift applies only to a fresh run. A result marker, route receipt, commit, merge, or checkpoint without its matching frozen context is not permission to mint a replacement snapshot or recipient.

Normalize the legacy `metric.judge.model` at this owning seam as the built-in judge-model candidate, not as prompt text or a generalized task binding. An applicable task/role/class profile may select another judge model. `ce-default` and no routing preserve v3.20.0 author/judge model selection, backend choice, security posture, scheduling, and fallback, including the legacy judge model. Canonical path, symlink, scope, and result-marker checks apply to every run; credential-minimized egress applies when a profile selects a new recipient.

### Qualify Without Changing Backend

The optimization spec has higher authority than generalized routing. A route cannot change `execution.backend`, `execution.mode`, `execution.max_concurrent`, `execution.codex_security`, mutable or immutable scope, `parallel` resource policy, `measurement.command` or stability settings, judge sampling/rubric/separation, checkpoint ownership, or any `stopping` criterion. Only a model selector may differ. An author model must use the experiment backend the approved spec already selected; a judge model must use the existing separate native judge-dispatch boundary:

- **Author, worktree backend:** eligible profile candidates use the current host's existing generic-subagent primitive inside the experiment worktree. The candidate harness must be the current host, and that primitive must support the requested model selector without changing tools, permission mode, workspace, or environment isolation. A different harness, a route/effort override, or no model selector on a configured model candidate makes that candidate unavailable; it never invokes another CLI or switches to Codex.
- **Author, Codex backend:** eligible profile candidates have `harness: codex`, pass the existing nested-Codex and writable-Git guards, and use the existing `codex exec` adapter with a safe model token. Any other harness, unsupported selector, or incompatible backend is unavailable; it never falls back to a worktree subagent.
- **Semantic judge:** eligible profile candidates use the current host's existing native generic-subagent judge dispatch with read-only evaluation material and no worktree. The candidate harness must be the current host and its model selector must be supported. It never inherits the author backend, opens an external CLI, or receives author tools merely because the author uses Codex.
- **Built-in/CE-default:** use the backend's unchanged v3.20.0 model behavior. Do not require a selector to preserve an unconfigured run.

Backend incompatibility or an unsupported selector follows the binding policy non-interactively. `require` blocks the affected author or judge call without prompt or substitute. `prefer` may inspect only its next declared candidate; there is no undeclared backend or native fallback.

### Sanction, Execute, and Finalize

Before each configured candidate receives material, independently authorize its recipient/intermediary, the canonical in-scope material, and a credential-minimized environment. A profile is not egress authority. `parallel.shared_files` is the complete explicit extra-input allowlist: each entry must pass canonical path and symlink checks, be covered by `scope.immutable`, and contain no `.env*` or hidden reference material. Do not copy undeclared files. Start a newly selected recipient environment empty and add only adapter-required non-secret basics plus names explicitly approved in `execution.sanctioned_env`; `execution.sanctioned_env` is the only spec source for forwarded environment names, and ambient credentials are never inherited. If the adapter cannot enforce this material or environment boundary, the candidate is unavailable. Freshly sanction the recipient, material, and environment for every declared alternative.

Keep each profile-candidate author or judge result quarantined and call `finalize_attempt` with the exact snapshot, candidate `attempt_lock`, typed adapter outcome, terminal/unintegrated state, complete prior receipt history, and adapter-owned serving evidence; never send a binding. A top-level `ce-default` binding has no candidate attempt and preserves the built-in optimize path. Author acceptance happens before scope inspection, orchestrator measurement, `result.yaml`, CP-3, commit, or merge. Judge acceptance happens before parsing, aggregation, cost accounting, or checkpointing scores. Only a successful `prefer` attempt with an `ok` outcome and missing identity evidence may be accepted as `accepted_unverified`; `require` blocks unavailable, failed, mismatched, or unverified identity without prompt and leaves output isolated.

A preferred route may advance only after the prior attempt is terminal and unintegrated, its output is discarded, and the next recipient/material/environment is freshly sanctioned. Integration locks are role-and-instance specific: orchestrator measurement, a `result.yaml` marker, commit, cherry-pick, or merge locks that experiment's author recipient; parsing/aggregation or a score checkpoint locks that judge batch's recipient; CP-3 locks every recorded attempt for the experiment. No recipient change is allowed for the same role/instance after its result marker, commit, merge, or checkpoint integration. Never switch an in-flight author or judge.

The semantic judge is always a fresh verification dispatch, separate from the experiment author's session, prompt, tools, workspace, mutable authority, and receipt. It receives only the rubric and sampled candidate output; it receives no hidden reference paths or answer fields. Author and judge profiles may resolve to the same model token, but their identities, attempts, serving evidence, and receipts remain independent, and an author never judges its own output.

Write each redacted routing receipt or blocker to `routing-events.jsonl` and verify the append before displaying it. At CP-1 import the journal into the experiment log's `route_events`; after CP-1 append and verify both in lockstep. Preserve bounded dispatch and backpressure for both experiment and judge queues; routing changes neither queue membership nor concurrency.

---

## Persistence Discipline

**CRITICAL: After CP-1, the experiment log on disk is the single source of truth for experiment state; `routing-context.json` and `routing-events.jsonl` are the routing sources of truth from CP-0 onward. The conversation context is NOT durable storage. Results that exist only in the conversation WILL be lost.**

The files under `.context/compound-engineering/ce-optimize/<spec-name>/` are local scratch state. They are ignored by git, so they survive local resumes on the same machine but are not preserved by commits, branches, or pushes unless the user exports them separately.

Every piece of state that matters MUST live on disk, not in the agent's memory.

**If you produce a results table in the conversation without writing those results to disk first, you have a bug.** The conversation is for the user's benefit. The experiment log file is for durability.

### Core Rules

1. **Write each experiment result to disk IMMEDIATELY after measurement** — not after the batch, not after evaluation, IMMEDIATELY. Append the experiment entry to the experiment log file the moment its metrics are known, before evaluating the next experiment. This is the #1 crash-safety rule.

2. **VERIFY every critical write** — after writing the experiment log, read the file back and confirm the entry is present. This catches silent write failures. Do not proceed to the next experiment until verification passes.

3. **Re-read from disk at every phase boundary and before every decision** — never trust in-memory state across phase transitions, batch boundaries, or after any operation that might have taken significant time. Re-read the experiment log and strategy digest from disk.

4. **The experiment log is append-only during Phase 3** — never rewrite the full file. Append new experiment entries. Update the `best` section in place only when a new best is found. This prevents data loss if a write is interrupted.

5. **Per-experiment result markers for crash recovery** — each experiment writes a `result.yaml` marker in its worktree immediately after measurement. Include `routing_snapshot_id` and the accepted author-receipt digest. On resume, scan for these markers to recover experiments that were measured but not yet logged; a snapshot/digest mismatch blocks recovery.

6. **Strategy digest is written after every batch, before generating new hypotheses** — the agent reads the digest (not its memory) when deciding what to try next.

7. **Never present results to the user without writing them to disk first** — the pattern is: measure -> write to disk -> verify -> THEN show the user. Not the reverse.

8. **Routing state is durable control state** — write and verify immutable `routing-context.json` plus an empty append-only `routing-events.jsonl` before the first author or judge dispatch. For each monotonically numbered event, append and read back the JSONL journal first, then append and read back the same sequence in the log after CP-1; do not report or start another attempt until both required writes agree. On resume, reconcile a journal-only event into the log by sequence before dispatch. Never reconstruct routing from conversation context.

### Mandatory Disk Checkpoints

These are non-negotiable write-then-verify steps. At each checkpoint, the agent MUST write the specified file and then read it back to confirm the write succeeded.

| Checkpoint | File Written | Phase |
|---|---|---|
| CP-0: Spec and route frozen | `spec.yaml` + `routing-context.json` + `routing-events.jsonl` | Phase 0, after user approval and before author/judge dispatch |
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
| `routing-context.json` | Frozen snapshot, author/judge bindings, source revisions, and constraints digest | Phase 0 (CP-0), then read-only |
| `routing-events.jsonl` | Append-only redacted route receipts and blockers before/after the main log exists | Phase 0 onward, before each route disclosure |
| `experiment-log.yaml` | Full history of all experiments | Initialized at CP-1, appended at CP-3, updated at CP-4 |
| `strategy-digest.md` | Compressed learnings for hypothesis generation | Written at CP-4 after each batch |
| `<worktree>/result.yaml` | Per-experiment crash-recovery marker | Immediately after measurement, before CP-3 |

### On Resume

When Phase 0.4 detects an existing run:
1. Read the experiment log from disk — this is the ground truth
2. Read `routing-context.json` and `routing-events.jsonl`; verify the snapshot and constraints digest match the log and immutable spec, and never re-resolve from current configuration
3. Scan worktree directories for `result.yaml` markers not yet in the log
4. Recover only measured-but-unlogged experiments whose `routing_snapshot_id` and author receipt match the frozen context
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

### 0.6 Freeze Routing and Task Constraints (CP-0)

For a fresh run, compute the task `constraints_digest`, issue the one role batch described in **Frozen Experiment and Judge Routing**, write `routing-context.json` with mode `0600`, and create an empty `routing-events.jsonl` with mode `0600`. Reject symlinked scratch components or pre-existing files for a fresh run. Read back `spec.yaml`, `routing-context.json`, and the empty event journal; verify the digest, snapshot, source revisions, author binding, and judge binding (when selected). Do not begin baseline judging or Phase 2/3 authoring until this check succeeds.

For Resume, load those existing files instead. Do not invoke `resolve_batch`, adopt a newly configured model, or replace a missing context after a result marker, route event, commit, merge, or checkpoint exists. If this is a legacy pre-routing run with no such integrated state, no generalized route is configured, and the approved spec is unchanged, record an explicit one-time CE-default context before proceeding; otherwise block and ask for a fresh run rather than guessing a recipient.

---

## Phase 1: Measurement Scaffolding

**This phase is a HARD GATE. The user must approve baseline and parallel readiness before Phase 2.**

**Bundled scripts.** Phases 1 and 3 call helper scripts that ship in this skill's `scripts/` directory (`measure.sh`, `parallel-probe.sh`, `experiment-worktree.sh`). The Bash tool's working directory is the user's project, not the skill directory, so a bare `scripts/<name>` path will not resolve — invoke each by the skill's own absolute path. Every runnable block below already sets `SKILL_DIR` inline (shell state does not persist between Bash tool calls, so each block must carry it); just replace the `<absolute path …>` placeholder with the directory you loaded this `ce-optimize` SKILL.md from before running. The shape:

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
1. Select the next candidate only from the frozen author binding. Qualify it against the current host's existing worktree-subagent adapter; a configured model with no supported selector, another harness, or any requested route/effort change is unavailable.
2. Sanction the recipient, canonical workspace scope, exact `parallel.shared_files`, and `execution.sanctioned_env`. Then create the experiment worktree. The helper defaults to routed isolation and rejects path escapes, symlinks, `.env*`, undeclared inputs, and reuse of a measured worktree. Pass `--routed` explicitly for a profile binding; pass `--legacy-no-routing` only when the frozen binding itself is CE-default/built-in:
   ```bash
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   WORKTREE_PATH=$(bash "$SKILL_DIR/scripts/experiment-worktree.sh" create "<spec_name>" <exp_index> "optimize/<spec_name>" --routed <shared_files...>)  # profile binding
   ```
3. Apply port parameterization only to the later orchestrator-owned measurement process. Do not forward measurement environment to the author.
4. Fill the experiment prompt template (`references/experiment-prompt-template.md`) with:
   - Iteration number, spec name
   - Hypothesis description and category
   - Current best and baseline metrics
   - Mutable and immutable scope
   - Canonical sanctioned shared inputs (names only; empty when none)
   - Constraints and approved dependencies
   - Rolling window of last 10 experiments (concise summaries)
<!-- ce-dispatch-site:ce-optimize.worktree-experiment -->
5. Dispatch a generic subagent with the qualified model selector outside the prompt, working in the experiment worktree. Preserve the existing tools, permission mode, and bounded scheduling. Supply only the freshly constructed sanctioned environment; if the host cannot prevent ambient credential inheritance for a newly selected recipient, mark that candidate unavailable.

**Codex backend:**
1. Select the next candidate only from the frozen author binding. It is eligible only with `harness: codex` and a safe model selector accepted by the existing `codex exec` adapter.
2. Check the existing environment guard. Do NOT delegate if already inside a Codex sandbox or if Git metadata is not writable. For a profile binding this makes the candidate unavailable and cannot switch the spec backend; CE-default/no-routing retains the shipped v3.20.0 subagent fallback:
   ```bash
   # Any true condition makes the configured Codex backend unavailable.
   test -n "${CODEX_SANDBOX:-}" || test -n "${CODEX_SESSION_ID:-}" || test ! -w .git
   ```
3. Map only the approved spec's `execution.codex_security` to its existing flag: `full-auto` -> `--full-auto`; `yolo` -> `--dangerously-bypass-approvals-and-sandbox`. A route cannot select, remove, or weaken this flag. If the spec value is null, retain the existing once-per-session user choice before dispatch; routing never answers that question.
4. Sanction recipient/material/environment, fill the experiment prompt template, and write it to a private temp file. Launch from an empty environment populated only with adapter-required non-secret basics, isolated harness authentication, and explicitly approved `execution.sanctioned_env`; do not inherit ambient credentials. If authenticated Codex cannot run under that boundary, the route is unavailable.
<!-- ce-dispatch-site:ce-optimize.codex-experiment -->
5. Dispatch via Codex with `--skip-git-repo-check`, the unchanged security flag, and the qualified safe model selector. Use the matching form only:
   ```bash
   codex exec --skip-git-repo-check --full-auto --model "<model>" - < "<prompt-file>"
   codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --model "<model>" - < "<prompt-file>"
   ```
   For CE-default/no-routing behavior with no model override, omit only `--model`; never alter the backend or security flag.

### 3.3 Collect and Persist Results

Process experiments as they complete — do NOT wait for the entire batch to finish before writing results.

For each completed experiment, **immediately**:

1. **Finalize author identity while output is isolated.** Use adapter-owned serving evidence with the experiment's frozen `ce-optimize.experiment-author` binding. Call `finalize_attempt` with `{terminal:true, integrated:false}` before reading or measuring the changes. Append and verify the redacted receipt before reporting it. `accept` permits inspection; `next_candidate` discards this worktree/output and requires fresh sanction; `block` preserves it as quarantined diagnostic state but forbids measurement, result markers, checkpoints, commits, and merges.

2. **Verify scope before measurement.** Inspect actual changed paths and modes against canonical `scope.mutable`. Reject any immutable, shared-input, hidden-reference, out-of-scope, symlink, or path-escape change. Re-hash the immutable measurement harness and sanctioned shared inputs against the CP-0 constraints digest. A violation is an experiment failure, not route unavailability; it is terminal for this experiment and never authorizes another recipient.

3. **Run measurement** in the experiment's worktree through the immutable orchestrator-owned harness:
   ```bash
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   bash "$SKILL_DIR/scripts/measure.sh" "<measurement.command>" <timeout_seconds> "<worktree_path>/<measurement.working_directory or .>" <env_vars...>
   ```
   - If stability mode is `repeat`, run the measurement harness `repeat_count` times in that working directory and aggregate the results exactly as in Phase 1 before evaluating gates or ranking the experiment.
   - Use the aggregated metrics as the experiment's score; if variance exceeds `noise_threshold`, record that in learnings so the operator knows the result is noisy.

4. **Write crash-recovery marker** — immediately after measurement, write `result.yaml` in the experiment worktree containing `routing_snapshot_id`, the accepted `author_receipt_digest`, immutable `constraints_digest`, measurement timestamp, and raw metrics. Read it back. This ensures the measurement is recoverable even if the agent crashes before updating the main log.

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
   - Dispatch the `ceil(sample_size / batch_size)` judge sub-agents from the independently frozen `ce-optimize.semantic-judge` binding using the same bounded dispatch as Phase 3.2 — queue them, dispatch to whatever concurrency the host accepts, and treat a capacity error as backpressure (retry the queued batch after a slot frees) rather than a scoring failure. These fresh judge sub-agents are a separate budget from the experiment worktrees and receive no worktree or author session.
   - Keep each structured JSON response quarantined. Call `finalize_attempt` with that judge attempt's own serving evidence before parsing it. Discard `next_candidate` output; a `block` makes the experiment unscored and cannot be treated as a hard-metric success.
   - After every required judge response is accepted, aggregate scores: compute the configured primary judge field from `metric.judge.scoring.primary` (which should match `metric.primary.name`) plus any `scoring.secondary` values
<!-- ce-dispatch-site:ce-optimize.singleton-judges -->
   - If `singleton_sample > 0`: also dispatch fresh singleton evaluation sub-agents through the same semantic-judge binding and finalization gate

8. **If gates pass AND primary type is `hard`**:
   - Use the metric value directly from the measurement output

9. **IMMEDIATELY append to experiment log on disk (CP-3)** — do not defer this to batch evaluation. Write the experiment entry (iteration, routing snapshot, author receipt, judge receipts, hypothesis, outcome, metrics, learnings) to `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml` right now. Use the transitional outcome `measured` once the experiment has valid metrics but has not yet been compared to the current best. Update the outcome to `kept`, `reverted`, or another terminal state in the evaluation step, but the raw metrics are on disk and safe from context compaction.

10. **VERIFY the write (CP-3 verification)** — read the experiment log back from disk and confirm the entry, snapshot, metrics, and receipts just written are present. If verification fails, retry the write. Do NOT proceed to the next experiment until this entry is confirmed on disk. Only after this succeeds may cleanup remove `result.yaml`, using `experiment-worktree.sh cleanup ... --result-recorded`.

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
   - After the merge succeeds, clean up the winner's experiment worktree and branch with `--result-recorded`; the integrated commit on the optimization branch is the durable artifact
   - This is now the new baseline for subsequent batches
   - The author recipient is permanently fixed for this experiment once its result marker, CP-3 entry, commit, or merge exists

4. **Check file-disjoint runners-up** (up to `max_runner_up_merges_per_batch`):
   - For each runner-up that also improved, check file-level disjointness with the kept experiment
   - **File-level disjointness**: two experiments are disjoint if they modified completely different files. Same file = overlapping, even if different lines.
   - If disjoint: cherry-pick the runner-up onto the new baseline, re-run full measurement
   - If combined measurement is strictly better: keep the cherry-pick (outcome: `runner_up_kept`), then clean up that runner-up's experiment worktree and branch with `--result-recorded`
   - Otherwise: revert the cherry-pick, log as "promising alone but neutral/harmful in combination" (outcome: `runner_up_reverted`), then clean up that runner-up's experiment worktree and branch with `--result-recorded`
   - Stop after first failed combination

5. **Handle deferred deps**: experiments that need unapproved dependencies get outcome `deferred_needs_approval`

6. **Revert all others**: after their CP-3 entries are verified, clean up worktrees with `--result-recorded` and log as `reverted`

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

**Crash recovery**: See Persistence Discipline section. Per-experiment `result.yaml` markers are written in step 3.3. Individual experiment results are appended to the log immediately in step 3.3. Batch-level state (outcomes, best, digest) is written in step 3.5. On resume (Phase 0.4), the log on disk is the ground truth — scan for markers not yet reflected in the log and recover only those matching the frozen routing snapshot, constraints digest, and accepted author receipt. Altered live configuration never changes the resumed recipient.

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
