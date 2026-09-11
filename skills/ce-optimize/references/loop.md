# Phases 2-3: hypotheses and the optimization loop

Read this before generating hypotheses and follow it for the whole loop. The SKILL.md body states the dependency pre-approval gate (the check that stops the run until the user has approved new dependencies) and the stopping criteria. This file carries hypothesis generation, batch selection, experiment dispatch, result collection and persistence, batch evaluation, the state update, and the cross-cutting concerns.

## Phase 2: Hypothesis Generation

### 2.1 Analyze Current Approach

Read the code within `scope.mutable` to understand:
- The current implementation approach
- Obvious improvement opportunities
- Constraints and dependencies between components

The next action is the cheapest executable step that would change what gets implemented. A locating measurement is one that finds where the cost actually sits (a profile, per-stage timing, a query count) rather than testing a change. It belongs in this phase when it is cheaper than an implementation experiment, would change whether a hypothesis is worth keeping or skipping, and can be taken. Named-workload cost needs attributed shares before implementation when a Phase 1 baseline total cannot decide whether a hypothesis is worth keeping; that total is the scoring reference, not those shares. A scored variant space does not require a performance profile.

Do not treat the implementation backlog as empty, and do not proceed to wrap-up, while a cheaper locating measurement can still be taken and would change whether a hypothesis is kept or skipped. If such a measurement would change that decision but cannot be obtained, wrap up and say what blocked it. Do not implement without that measurement.

Optionally read `references/agents/repo-research-analyst.md` and dispatch a generic subagent seeded with that local prompt for deeper codebase analysis if the scope is large or unfamiliar. Do not dispatch a standalone agent by type/name. Pass the active project and optimization context, request only question-specific scopes such as `patterns`, and go directly to current owning code. If the optimization cannot be scoped, allow one targeted root or workspace probe.

### 2.2 Generate Hypothesis List

Generate an initial set of hypotheses. Each hypothesis should have:
- **Description**: what to try
- **Category**: one of the standard categories (signal-extraction, graph-signals, embedding, algorithm, preprocessing, parameter-tuning, architecture, data-handling) or a domain-specific category
- **Priority**: high, medium, or low as a summary label
- **Required dependencies**: any new packages or tools needed
- **Opportunity**: the log schema's `opportunity` record (estimate or explicit unknown)

Include user-provided hypotheses if any were given as input.

Record an `opportunity` on every hypothesis using the log schema before implementation. Connect whatever observed cost or rubric evidence exists to the expected change in the target metric, with units, a comparison baseline, and the assumptions behind the estimate. Prefer a supported range or upper bound over a point estimate. If the benefit or the cost share cannot be estimated, record it as unknown and name the cheapest measurement that would resolve the uncertainty. A subjective priority score is not a measured benefit. The `priority` field does not rank the backlog.

An unknown opportunity may sit on the backlog. It is not a runnable implementation experiment while a cheaper locating measurement would change whether it is kept or skipped. A scored variant space may leave numerical benefit unknown and does not require a performance profile.

The backlog contains the credible opportunities supported by current evidence, not a required number of ideas. Rank by expected target benefit, confidence, implementation and measurement cost, and behavioral risk. Persist and verify the ranked opportunities and estimates at CP-2. Follow the SKILL.md body's reporting rule when you tell the user the findings that explain the chosen direction. The full backlog remains available on disk.

### 2.3 Dependency Pre-Approval

The SKILL.md body states this gate. Record its outcome on each hypothesis as `dep_status: approved` or `needs_approval`, which is what batch selection reads.

### 2.4 Record Hypothesis Backlog (CP-2)

**MANDATORY CHECKPOINT.** Write the initial backlog to the experiment log file and verify. CP-2 is incomplete until each hypothesis in that write carries its opportunity record.
```yaml
hypothesis_backlog:
  - description: "Remove template boilerplate before embedding"
    category: "signal-extraction"
    priority: high
    dep_status: approved
    required_deps: []
    opportunity:
      workload: "notification-clustering fixture"
      baseline: "CP-1 baseline"
      evidence: "judge rubric: boilerplate dilutes embeddings; no profile"
      expected_benefit: "unknown; cheapest resolve: one judged stripped-vs-current sample"
      confidence: "low: unmeasured"
      cost_and_risk: "small edit; judge sample; no new deps"
  - description: "Try HDBSCAN clustering algorithm"
    category: "algorithm"
    priority: medium
    dep_status: needs_approval
    required_deps: ["scikit-learn"]
    opportunity:
      workload: "notification-clustering fixture"
      baseline: "CP-1 baseline"
      evidence: "algorithm family untried on this fixture"
      expected_benefit: "unknown; cheapest resolve: one exploratory run after dep approval"
      confidence: "low: unmeasured"
      cost_and_risk: "new dependency scikit-learn; judge sample"
```

---

## Phase 3: Optimization Loop

This phase repeats in batches until a stopping criterion is met.

### 3.1 Batch Selection

Select hypotheses for this batch:
- Build a runnable backlog by excluding hypotheses with `dep_status: needs_approval`
- A hypothesis is not runnable while a cheaper locating measurement would still change whether it is kept or skipped
- If `execution.mode` is `serial`, or the current decision needs to attribute a cost change to one lever, force `batch_size = 1`
- Otherwise, `batch_size = min(runnable_backlog_size, execution.max_concurrent)`
- Select by the ranked expected benefit, confidence, cost, and risk above; the priority label does not decide order. Category diversity breaks remaining ties.

When a cheaper locating measurement can be taken and would still change whether a hypothesis is kept or skipped, take that measurement and update the backlog before selecting a batch. Do not treat that state as an empty backlog.

When no executable next action remains, proceed to Phase 4 (wrap-up). An action is executable only if it can be taken now. A locating measurement that would change a keep-or-skip decision but cannot be obtained is a blocker, not a reason to keep the loop open. Wrap up and say what blocked it. Deferred dependencies are presented at wrap-up instead of the loop spinning forever.

### 3.2 Dispatch Experiments

The experiment's forecast is the backlog `opportunity` as of dispatch. Do not reconstruct it from later results. Copy that backlog value into the experiment entry at its first CP-3 write, including when that write recovers a `result.yaml` marker that has no forecast. Revised estimates for later experiments must not overwrite an earlier experiment's forecast. Missing forecasts in resumed legacy runs stay unrecorded.

For each hypothesis in the batch, dispatch according to `execution.mode`. In `serial` mode, run exactly one experiment to completion before selecting the next hypothesis. In `parallel` mode, dispatch the batch concurrently.

**Bounded dispatch.** Do not assume the host will accept all concurrent subagents at once; the active-subagent cap varies by host and profile and is independent of `execution.max_concurrent` (which caps worktrees, a separate budget). Queue the selected experiments, dispatch only as many as the host accepts, and when a capacity or active-agent-limit error appears, treat it as backpressure: retry the queued experiment after a slot frees rather than marking it failed. Mark an experiment failed only when dispatch fails for a non-capacity reason that survives correcting the invocation, or a successfully dispatched experiment errors/times out.

The Phase 3 blocks below each set `SKILL_DIR` inline as well (the loaded `ce-optimize` skill directory; see the Bundled scripts note in Phase 1). Shell state does not persist from Phase 1, so each block carries its own assignment.

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

Persist a `comparisons` record for each distinct reference, candidate, and workload pairing used in a decision. Each side's identity must uniquely identify the bytes that were measured; a shared HEAD is not enough when the candidate is uncommitted. Record the workload, both snapshots, and the decision's uncertainty and correctness evidence. Standalone and integrated pairings stay distinct in this array; a later in-place update must not replace a previously persisted distinct pairing. A runner-up's contribution is its confirmed change against the branch it was added to, not its standalone gain. These records explain results. `decide.mjs` still makes the accept or revert decision, using the existing snapshot fields.

Process experiments as they complete: do NOT wait for the entire batch to finish before writing results.

For each completed experiment, **immediately**:

1. **Run measurement** in the experiment's worktree. Spend only the measurement the current decision needs (see Phase 1). When `stability.mode` is `ladder` and a smoke command is set, run that smoke check first. A smoke failure is terminally `degenerate`, and success proceeds to the first exploratory sample of `measurement.command` before comparison. Otherwise start with one exploratory sample. Pass `CE_OPTIMIZE_CENSOR_AFTER` to `measure.sh` only when elapsed wall time itself proves the candidate cannot become eligible, meaning every required objective is already hopeless, not merely the primary. Otherwise let measurement finish so other required objectives can still win, and let `decide.mjs` assess futility after the payload is complete.
   ```bash
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   bash "$SKILL_DIR/scripts/measure.sh" "<measurement.command>" <timeout_seconds> "<worktree_path>/<measurement.working_directory or .>" <env_vars...>
   ```
   When mode is `repeat`, keep running `repeat_count` times and aggregating as in Phase 1. When mode is `stable`, run once.

2. **Write crash-recovery marker.** Immediately after measurement, write `result.yaml` in the experiment worktree containing the raw metrics. This keeps the measurement recoverable even if the agent crashes before updating the main log.

3. **Read raw JSON output** from the measurement script

4. **Evaluate degenerate gates** (the cheap hard checks in `metric.degenerate_gates` that reject obviously broken output):
   - For each gate in `metric.degenerate_gates`, parse the operator and threshold
   - Compare the metric value against the threshold
   - If ANY gate fails, mark the outcome `degenerate` and skip judge evaluation. This saves money.

5. **If the degenerate gates pass AND primary type is `judge`**:
   - **Check judge independence before dispatching.** A judge must not have authored the hypothesis or run the experiment it is scoring, and must not see other judges' results. That independence is what makes these scores usable for the accept or revert decision. If the host exposes no way to dispatch judges as separate agents, do **not** score inline. Mark the experiment's outcome `error` with the reason (judges undispatchable), skip judge evaluation exactly as a failed degenerate gate does, and continue to the log-and-append step so the entry is still written to disk. An experiment stopped here never carries judge metrics, so it is not eligible to become `best` and does not enter the accept/revert comparison. It is unmeasured, not poor-scoring. Report the blocker and its effect on the run to the user.
   - Read the experiment's output (cluster assignments, search results, etc.)
   - Apply stratified sampling per `metric.judge.stratification` config (using `sample_seed`)
   - Group samples into batches of `metric.judge.batch_size`
   - Fill the judge prompt template (`references/judge-prompt-template.md`) for each batch
   - Dispatch the `ceil(sample_size / batch_size)` judge sub-agents using the same bounded dispatch as Phase 3.2: queue them, dispatch to whatever concurrency the host accepts, and treat a capacity error as backpressure (retry the queued batch after a slot frees) rather than a scoring failure. These judge sub-agents are a separate budget from the experiment worktrees.
   - Each sub-agent returns structured JSON scores
   - Aggregate scores: compute the configured primary judge field from `metric.judge.scoring.primary` (which should match `metric.primary.name`) plus any `scoring.secondary` values
   - If `singleton_sample > 0`: also dispatch singleton evaluation sub-agents

6. **Compare with `decide.mjs`.** Invoke it only after the degenerate gates pass and the payload holds every required objective value, meaning the hard metrics from measurement and the judge scores when those were collected. The payload is the spec as loaded plus the baseline and candidate snapshots. The script reads the nested spec (`metric`, `measurement.stability`) and decides eligibility, noise, and the ladder next step. Do not reconstruct a flattened payload, and do not re-derive the threshold in prose.
   ```bash
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
   [ -n "$NODE" ] || { echo "no working Node runtime on PATH (tried node, nodejs)" >&2; exit 1; };
   "$NODE" "$SKILL_DIR/scripts/decide.mjs" "<payload.json>"
   ```
   If that probe finds no runtime, do not invoke an empty command. Mark the experiment `error` with that reason and continue the batch. Use `decision` and `next_measurement`. Collect the requested measurement and repeat this sequence whenever `next_measurement` is not `none`. Do not keep a candidate until `next_measurement` is `none`. Record `inconclusive` and `censored` as those outcomes, not as `reverted`. Each extra sample belongs to this same experiment: write it onto the existing entry at CP-3, then decide again.

7. **IMMEDIATELY persist this experiment on disk (CP-3).** Do not defer this to batch evaluation. The durable unit is one log entry per experiment at `.context/compound-engineering/ce-optimize/<spec-name>/experiment-log.yaml`. After the first measurement, append that entry. After every later ladder sample for the same experiment, write the accumulated metrics and current outcome onto that same entry. Do not append a second entry for the same hypothesis, and do not rewrite a different experiment's samples. Write a decide terminal only when `next_measurement` is `none`. Until then the entry stays nonterminal, `promising` while the keep path still needs samples and `measured` otherwise (including an inconclusive result that still wants samples). When `next_measurement` is `none`, an eligible result stays `measured` until its diff is on the optimization branch; a non-eligible result gets the decide terminal (`reverted`, `inconclusive`, `censored`, `degenerate`). `kept` and `runner_up_kept` wait until that integration. The raw metrics are on disk and safe from context compaction.

8. **VERIFY the write (CP-3 verification).** Read the experiment log back from disk and confirm the entry just written is present. If verification fails, retry the write. Do NOT proceed to the next experiment until this entry is confirmed on disk.

**Why immediately + verify?** The agent's context window is NOT a durable store. Context compaction, session crashes, and restarts are expected during long runs, so results that exist only in the agent's memory are lost. The verification step catches silent write failures that would otherwise lose data.

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
   - If disjoint, cherry-pick the runner-up onto the new baseline and run the same decide loop as step 3.3 against a fresh sample set for that combined snapshot. Do not reuse the standalone experiment's accumulated samples; they were measured against the previous baseline. Collect further measurement whenever `next_measurement` is not `none`. Persist the combined pairing as `kind: integrated` on that same log entry without replacing the standalone comparison. Keep the original standalone log entry for audit.
   - Keep the cherry-pick only when that result is eligible and `next_measurement` is `none` (outcome: `runner_up_kept`); then clean up that runner-up's experiment worktree and branch
   - Otherwise revert the cherry-pick, log it as "promising alone but neutral/harmful in combination" (outcome: `runner_up_reverted`), then clean up the runner-up's experiment worktree and branch
   - Stop after first failed combination

5. **Handle deferred dependencies.** Experiments that need unapproved dependencies get outcome `deferred_needs_approval`

6. **Close the rest.** Cleanup worktrees. `kept` and `runner_up_kept` are only for diffs on the optimization branch. Eligible candidates that were not integrated become `not_selected`. Leave `inconclusive`, `censored`, and `degenerate` as `decide.mjs` returned them.

### 3.5 Update State (CP-4)

**MANDATORY CHECKPOINT.** By this point, individual experiment results are already on disk (written in step 3.3). This step updates aggregate state and verifies.

1. **Re-read the experiment log from disk.** Do not trust in-memory state. The log is the source of truth.

2. **Finalize outcomes.** Update experiment entries from the step 3.4 evaluation (mark `kept`, `reverted`, `runner_up_kept`, etc.). Write these outcome updates to disk immediately.

3. **Update the `best` section** in the experiment log if a new best was found. Write to disk.

4. **Write strategy digest** to `.context/compound-engineering/ce-optimize/<spec-name>/strategy-digest.md`:
   - Categories tried so far (with success/failure counts)
   - Key learnings from this batch and overall
   - Remaining opportunities, their supporting evidence, and whether current measurements still support their estimates; mark stale estimates for reassessment before selecting them
   - Current best metrics and improvement from baseline

5. **Generate new hypotheses** based on learnings:
   - Re-read the strategy digest from disk (not from memory)
   - Read the rolling window (last 10 experiments from the log on disk)
   - Do NOT read the full experiment log -- use the digest for broad context
   - After a keep on a cost target, re-measure how the cost divides among the parts before adding implementation hypotheses only when the keep leaves the current shares unable to say whether the next hypothesis is worth keeping
   - Add new hypotheses to the backlog and write the updated backlog to disk

6. **Write the updated hypothesis backlog to disk.** The backlog section of the experiment log must reflect newly added hypotheses and removed (tested) ones.

**CP-4 Verification:** Read the experiment log back from disk. Confirm: (a) all experiment outcomes from this batch are finalized, (b) the `best` section reflects the current best, (c) the hypothesis backlog is updated. Read `strategy-digest.md` back and confirm it exists. Only THEN proceed to the next batch or stopping criteria check.

**Checkpoint: at this point, all state for this batch is on disk. If the agent crashes and restarts, it can resume from the experiment log without loss.**

### 3.6 Check Stopping Criteria

Stop the loop as soon as any one of these holds:

- **Target reached**: `stopping.target_reached` is true and the current best meets every declared required target (`decide.mjs` `target_reached` on the current-best snapshot). When `metric.objectives` is absent, that is the single `metric.primary.target` if set. Do not stop for a primary-only hit while another required target is still unmet.
- **Max iterations**: total experiments run >= `stopping.max_iterations`
- **Max hours**: wall-clock time since Phase 3 started (not since the invocation) >= `stopping.max_hours`
- **Judge budget exhausted**: `metric.judge.max_total_cost_usd` is set and cumulative judge spend has reached it
- **Plateau**: no improvement for `stopping.plateau_iterations` **consecutive** experiments
- **Manual stop**: the user interrupts. Save state, then go to Phase 4.
- **No runnable hypothesis left**: no executable next action remains

If none is met, proceed to the next batch (3.1).

### 3.7 Cross-Cutting Concerns

**Codex failure cascade**: Track consecutive Codex delegation failures. After 3 consecutive failures, auto-disable Codex for remaining experiments and fall back to subagent dispatch. Log the switch.

**Error handling**: Classify a failed measurement from what `measure.sh` actually signaled. The censored stderr marker (with exit 125) is `censored`. Exit 124 is `timeout`. Any other non-zero exit (including 125 without that marker) is `error`. Log that outcome with the error message, revert the experiment, and continue the batch.

**Progress reporting:** follow the SKILL.md body's reporting rule. Base any reported improvement on persisted, verified measurements, distinguish preliminary from confirmed results, and state what was measured and any limits on the claim. Batch counts and cumulative scoring cost remain in the log for wrap-up. Report them to the user during the run when they affect a decision.

**Crash recovery**: See the Persistence Discipline section. Per-experiment `result.yaml` markers are written in step 3.3. Individual experiment results are appended to the log immediately in step 3.3. Batch-level state (outcomes, best, digest) is written in step 3.5. On resume (Phase 0.4), the log on disk is the ground truth. Scan for any `result.yaml` markers not yet reflected in the log.

---
