# Phases 2-3: hypotheses and the optimization loop

Read this before generating hypotheses and follow it for the whole loop. The body owns the dependency pre-approval gate and the stopping criteria; this file carries hypothesis generation, batch selection, experiment dispatch, result collection and persistence, batch evaluation, the state update, and the cross-cutting concerns.

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

The body owns this gate. Record its outcome on each hypothesis as `dep_status: approved` or `needs_approval`, which is what batch selection reads.

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

When no runnable hypothesis is left — the backlog is empty and no new one can be generated, or everything remaining is blocked or awaiting approval — proceed to Phase 4 (wrap-up), where the user can approve deferred dependencies instead of the loop spinning forever.

### 3.2 Dispatch Experiments

For each hypothesis in the batch, dispatch according to `execution.mode`. In `serial` mode, run exactly one experiment to completion before selecting the next hypothesis. In `parallel` mode, dispatch the batch concurrently.

**Bounded dispatch.** Do not assume the host will accept all concurrent subagents at once; the active-subagent cap varies by host and profile and is independent of `execution.max_concurrent` (which caps worktrees, a separate budget). Queue the selected experiments, dispatch only as many as the host accepts, and when a capacity or active-agent-limit error appears, treat it as backpressure — retry the queued experiment after a slot frees rather than marking it failed. Mark an experiment failed only when dispatch fails for a non-capacity reason that survives correcting the invocation, or a successfully dispatched experiment errors/times out.

The Phase 3 blocks below each set `SKILL_DIR` inline as well (the loaded `ce-optimize` skill directory; see the Bundled scripts note in Phase 1) — shell state does not persist from Phase 1, so each block carries its own assignment.

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

1. **Run measurement** in the experiment's worktree. Spend only the measurement the current decision needs (see Phase 1). When `stability.mode` is `ladder` and a smoke command is set, run that smoke check first: failure is terminally `degenerate`, and success proceeds to the first exploratory sample of `measurement.command` before comparison. Otherwise start with one exploratory sample. Pass `CE_OPTIMIZE_CENSOR_AFTER` to `measure.sh` only when elapsed wall time itself proves the candidate cannot become eligible — every required objective is already hopeless, not merely the primary. Otherwise let measurement finish so other required objectives can still win, and let `decide.mjs` assess futility after the payload is complete.
   ```bash
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   bash "$SKILL_DIR/scripts/measure.sh" "<measurement.command>" <timeout_seconds> "<worktree_path>/<measurement.working_directory or .>" <env_vars...>
   ```
   When mode is `repeat`, keep running `repeat_count` times and aggregating as in Phase 1. When mode is `stable`, run once.

2. **Write crash-recovery marker** — immediately after measurement, write `result.yaml` in the experiment worktree containing the raw metrics. This ensures the measurement is recoverable even if the agent crashes before updating the main log.

3. **Read raw JSON output** from the measurement script

4. **Evaluate degenerate gates**:
   - For each gate in `metric.degenerate_gates`, parse the operator and threshold
   - Compare the metric value against the threshold
   - If ANY gate fails: mark outcome as `degenerate`, skip judge evaluation, save money

5. **If gates pass AND primary type is `judge`**:
   - **Independence gate — check before dispatching.** A judge must not have authored the hypothesis or run the experiment it is scoring, and must not see other judges' results; that independence is what makes these scores usable as an accept/revert gate. If the host exposes no way to dispatch judges as separate agents, do **not** score inline: mark the experiment's outcome `error` with the reason (judges undispatchable), skip judge evaluation exactly as a failed degenerate gate does, and continue to the log-and-append step so the entry is still written to disk. An experiment stopped here never carries judge metrics, so it is not eligible to become `best` and does not enter the accept/revert comparison — it is unmeasured, not poor-scoring. Report the blocker to the user at the batch summary.
   - Read the experiment's output (cluster assignments, search results, etc.)
   - Apply stratified sampling per `metric.judge.stratification` config (using `sample_seed`)
   - Group samples into batches of `metric.judge.batch_size`
   - Fill the judge prompt template (`references/judge-prompt-template.md`) for each batch
   - Dispatch the `ceil(sample_size / batch_size)` judge sub-agents using the same bounded dispatch as Phase 3.2 — queue them, dispatch to whatever concurrency the host accepts, and treat a capacity error as backpressure (retry the queued batch after a slot frees) rather than a scoring failure. These judge sub-agents are a separate budget from the experiment worktrees.
   - Each sub-agent returns structured JSON scores
   - Aggregate scores: compute the configured primary judge field from `metric.judge.scoring.primary` (which should match `metric.primary.name`) plus any `scoring.secondary` values
   - If `singleton_sample > 0`: also dispatch singleton evaluation sub-agents

6. **Compare with `decide.mjs`.** Invoke it only after gates pass and the payload holds every required objective value — hard metrics from measurement, and judge scores when those were collected. The payload is the spec as loaded plus the baseline and candidate snapshots. The script reads the nested spec (`metric`, `measurement.stability`) and owns eligibility, noise, and the ladder next step. Do not reconstruct a flattened payload, and do not re-derive the threshold in prose.
   ```bash
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
   [ -n "$NODE" ] || { echo "no working Node runtime on PATH (tried node, nodejs)" >&2; exit 1; };
   "$NODE" "$SKILL_DIR/scripts/decide.mjs" "<payload.json>"
   ```
   If that probe finds no runtime, do not invoke an empty command: mark the experiment `error` with that reason and continue the batch. Use `decision` and `next_measurement`. Collect the requested measurement and repeat this sequence whenever `next_measurement` is not `none`. Do not keep a candidate until `next_measurement` is `none`. Record `inconclusive` and `censored` as those outcomes, not as `reverted`. Each extra sample belongs to this same experiment: write it onto the existing entry at CP-3, then decide again.

7. **IMMEDIATELY persist this experiment on disk (CP-3)** — do not defer this to batch evaluation. The durable unit is one log entry per experiment at `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml`. After the first measurement, append that entry. After every later ladder sample for the same experiment, write the accumulated metrics and current outcome onto that same entry. Do not append a second entry for the same hypothesis, and do not rewrite a different experiment's samples. Write a decide terminal only when `next_measurement` is `none`. Until then the entry stays nonterminal: `promising` while the keep path still needs samples, `measured` otherwise (including an inconclusive result that still wants samples). When `next_measurement` is `none`, an eligible result stays `measured` until its diff is on the optimization branch; a non-eligible result gets the decide terminal (`reverted`, `inconclusive`, `censored`, `degenerate`). `kept` and `runner_up_kept` wait until that integration. The raw metrics are on disk and safe from context compaction.

8. **VERIFY the write (CP-3 verification)** — read the experiment log back from disk and confirm the entry just written is present. If verification fails, retry the write. Do NOT proceed to the next experiment until this entry is confirmed on disk.

**Why immediately + verify?** The agent's context window is NOT a durable store. Context compaction, session crashes, and restarts are expected during long runs — results that exist only in the agent's memory are lost. The verification step catches silent write failures that would otherwise lose data.

### 3.4 Evaluate Batch

After all experiments in the batch have been measured:

1. **Decide eligibility from `decide.mjs`, not from the primary metric alone.** An experiment is eligible when it improves at least one required objective beyond the configured comparison threshold and does not violate any other required objective. When `metric.objectives` is absent, the primary is the only required objective. `inconclusive` is not a keep.

2. **Rank** the eligible experiments in the batch by the script's `rank_score` (primary relative gain when the primary moved; otherwise the strongest required-objective relative gain). Identify that winner as the experiment to keep. An eligible experiment may be kept even if the ranking primary did not move.

3. **If `decide.mjs` returns `keep` for that winner: KEEP**
   - Commit the experiment branch first so the winning diff exists as a real commit before any merge or cherry-pick
   - Include only mutable-scope changes in that commit; if no eligible diff remains, treat the experiment as non-improving and revert it
   - Merge the committed experiment branch into the optimization branch
   - Use the message `optimize(<spec-name>): <hypothesis description>` for the experiment commit
   - After the merge succeeds, clean up the winner's experiment worktree and branch; the integrated commit on the optimization branch is the durable artifact
   - This is now the new baseline for subsequent batches

4. **Check file-disjoint runners-up** (up to `max_runner_up_merges_per_batch`):
   - For each runner-up that also improved, check file-level disjointness with the kept experiment
   - **File-level disjointness**: two experiments are disjoint if they modified completely different files. Same file = overlapping, even if different lines.
   - If disjoint: cherry-pick the runner-up onto the new baseline and run the same decide loop as step 3.3 against a fresh sample set for that combined snapshot — do not reuse the standalone experiment's accumulated samples, whose meaning is against the previous baseline. Collect further measurement whenever `next_measurement` is not `none`. Keep the original standalone log entry for audit.
   - Keep the cherry-pick only when that result is eligible and `next_measurement` is `none` (outcome: `runner_up_kept`); then clean up that runner-up's experiment worktree and branch
   - Otherwise: revert the cherry-pick, log as "promising alone but neutral/harmful in combination" (outcome: `runner_up_reverted`), then clean up the runner-up's experiment worktree and branch
   - Stop after first failed combination

5. **Handle deferred deps**: experiments that need unapproved dependencies get outcome `deferred_needs_approval`

6. **Close the rest.** Cleanup worktrees. `kept` and `runner_up_kept` are only for diffs on the optimization branch. Eligible candidates that were not integrated become `not_selected`. Leave `inconclusive`, `censored`, and `degenerate` as `decide.mjs` returned them.

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

Stop the loop as soon as any one of these holds:

- **Target reached**: `stopping.target_reached` is true and the current best meets every declared required target (`decide.mjs` `target_reached` on the current-best snapshot). When `metric.objectives` is absent, that is the single `metric.primary.target` if set. Do not stop for a primary-only hit while another required target is still unmet.
- **Max iterations**: total experiments run >= `stopping.max_iterations`
- **Max hours**: wall-clock time since Phase 3 started — not since the invocation — >= `stopping.max_hours`
- **Judge budget exhausted**: `metric.judge.max_total_cost_usd` is set and cumulative judge spend has reached it
- **Plateau**: no improvement for `stopping.plateau_iterations` **consecutive** experiments
- **Manual stop**: the user interrupts. Save state, then go to Phase 4.
- **No runnable hypothesis left**: the backlog is empty and no new one can be generated, or every hypothesis still in it is blocked or awaiting approval

If none is met, proceed to the next batch (3.1).

### 3.7 Cross-Cutting Concerns

**Codex failure cascade**: Track consecutive Codex delegation failures. After 3 consecutive failures, auto-disable Codex for remaining experiments and fall back to subagent dispatch. Log the switch.

**Error handling**: Classify a failed measurement from what `measure.sh` actually signaled. The censored stderr marker (with exit 125) is `censored`. Exit 124 is `timeout`. Any other non-zero exit — including 125 without that marker — is `error`. Log that outcome with the error message, revert the experiment, and continue the batch.

**Progress reporting**: After each batch, report:
- Batch N of estimated M (based on backlog size)
- Experiments run this batch and total
- Current best metric and improvement from baseline
- Cumulative judge cost (if applicable)

**Crash recovery**: See Persistence Discipline section. Per-experiment `result.yaml` markers are written in step 3.3. Individual experiment results are appended to the log immediately in step 3.3. Batch-level state (outcomes, best, digest) is written in step 3.5. On resume (Phase 0.4), the log on disk is the ground truth — scan for any `result.yaml` markers not yet reflected in the log.

---
