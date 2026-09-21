# Phases 2-3: hypotheses and the optimization loop

Read this before generating hypotheses and follow it for the whole loop. The SKILL.md body states the dependency pre-approval gate (the check that stops the run until the user has approved new dependencies) and the stopping criteria. This file carries hypothesis generation, batch selection, experiment dispatch, result collection and persistence, batch evaluation, the state update, the tick boundary, and the cross-cutting concerns. `<state-root>` is the run's ledger directory resolved in Phase 0 (`references/persistence.md`).

## Phase 2: Hypothesis Generation

### 2.1 Analyze Current Approach

Read the code within `scope.mutable` to understand:
- The current implementation approach
- Obvious improvement opportunities
- Constraints and dependencies between components

The next action is the cheapest executable step that would change what gets implemented. A locating measurement is one that finds where the cost actually sits (a profile, per-stage timing, a query count) rather than testing a change. It belongs in this phase when it is cheaper than an implementation experiment, would change whether a hypothesis is worth keeping or skipping, and can be taken. For a named workload's cost, the locating measurement is attribution: shares by stage, query, or call. Take it before an implementation experiment when the Phase 1 baseline total cannot say which hypothesis is worth keeping and those same conditions hold. The baseline total stays the scoring reference; the shares only decide what to try. A scored variant space does not require a performance profile: rubric evidence decides what to try, and numerical benefit may stay unknown.

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

An unknown opportunity may sit on the backlog. It is not a runnable implementation experiment while a cheaper locating measurement would change whether it is kept or skipped.

The backlog contains the credible opportunities supported by current evidence, not a required number of ideas. Rank by expected target benefit, confidence, implementation and measurement cost, and behavioral risk. Persist and verify the ranked opportunities and estimates at CP-2. Follow the SKILL.md body's reporting rule when you tell the user the findings that explain the chosen direction. The full backlog remains available on disk.

### 2.3 Dependency Pre-Approval

The SKILL.md body states this gate. A dependency the user does not approve stays in the backlog, is skipped in batch selection, and comes back at wrap-up. Record its outcome on each hypothesis as `dep_status: approved` or `needs_approval`, which is what batch selection reads.

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

This phase runs in ticks until a stopping criterion is met. One tick is one batch: select (3.1), dispatch (3.2), collect and persist each result as it lands (3.3), evaluate (3.4), update state (3.5), check the stopping criteria (3.6). The tick boundary after 3.6 is the only place the loop may leave work outstanding; what that requires is stated there. In a session with no wake capability, ticks follow one another in this session exactly as batches did before, and nothing in this file asks you to do anything else.

### 3.1 Batch Selection

Select hypotheses for this batch:
- Build a runnable backlog by excluding hypotheses with `dep_status: needs_approval`
- A hypothesis is not runnable while a cheaper locating measurement would still change whether it is kept or skipped
- If `execution.mode` is `serial`, or the current decision needs to attribute a cost change to one lever, force `batch_size = 1`
- Otherwise, `batch_size = min(runnable_backlog_size, execution.max_concurrent)`, further capped by `execution.max_experiments_per_tick` when the spec sets it
- Select by the ranked expected benefit, confidence, cost, and risk above; the priority label does not decide order. Category diversity breaks remaining ties.

When a cheaper locating measurement can be taken and would still change whether a hypothesis is kept or skipped, take that measurement and update the backlog before selecting a batch. Do not treat that state as an empty backlog.

When no executable next action remains, proceed to Phase 4 (wrap-up). An action is executable only if it can be taken now. A locating measurement that would change a keep-or-skip decision but cannot be obtained is a blocker, not a reason to keep the loop open. Wrap up and say what blocked it. Deferred dependencies are presented at wrap-up instead of the loop spinning forever.

### 3.2 Dispatch Experiments

The experiment's forecast is the backlog `opportunity` as of dispatch. Do not reconstruct it from later results. Copy that backlog value into the experiment entry at its first CP-3 write, including when that write recovers a `result.yaml` marker that has no forecast. Revised estimates for later experiments must not overwrite an earlier experiment's forecast. Missing forecasts in resumed legacy runs stay unrecorded.

For each hypothesis in the batch, dispatch according to `execution.mode`. In `serial` mode, run exactly one experiment to completion before selecting the next hypothesis. In `parallel` mode, dispatch the batch concurrently.

**Bounded dispatch.** Do not assume the host will accept all concurrent subagents at once; the active-subagent cap varies by host and profile and is independent of `execution.max_concurrent` (which caps worktrees, a separate budget). Queue the selected experiments, dispatch only as many as the host accepts, and when a capacity or active-agent-limit error appears, treat it as backpressure: retry the queued experiment after a slot frees rather than marking it failed. Mark an experiment failed only when dispatch fails for a non-capacity reason that survives correcting the invocation, or a successfully dispatched experiment errors/times out.

The Phase 3 blocks below each set `SKILL_DIR` inline as well (the loaded `ce-optimize` skill directory; see the Bundled scripts note in Phase 1). Shell state does not persist from Phase 1, so each block carries its own assignment.

**One dispatch recipe, per experiment.** The backend changes where the experiment runs and how its result comes back, not what the worker is told.

1. **Isolate.** For `worktree` and `codex`, create the experiment worktree on the optimization branch:
   ```bash
   SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
   WORKTREE_PATH=$(bash "$SKILL_DIR/scripts/experiment-worktree.sh" create "<spec_name>" <exp_index> "optimize/<spec_name>" <shared_files...>)  # creates optimize-exp/<spec_name>/exp-<NNN>
   ```
   Apply port parameterization if configured (set env vars for the measurement script). For `remote`, isolation is the worker's own checkout: record `base_sha` (`git rev-parse optimize/<spec_name>`) and make sure that commit is pushed to the remote the worker will fetch from.
2. **Brief.** Fill the experiment prompt template (`references/experiment-prompt-template.md`): iteration number and spec name; hypothesis description and category; current best and baseline metrics; mutable and immutable scope; constraints and approved dependencies; the rolling window of the last 10 experiments as concise summaries. For `remote`, append the template's measure-and-report delta with `base_sha`, the result ref `optimize-exp/<spec_name>/exp-<NNN>`, the measurement command, and the paired sample count the current ladder step needs.
3. **Dispatch** by `execution.backend`, then record the return shape.

| Backend | Dispatch | What returns |
|---|---|---|
| `worktree` | A subagent with the filled prompt, working in the experiment worktree | The subagent's completion, with its edits in the worktree |
| `codex` | Write the filled prompt to a temp file and run `cat /tmp/optimize-exp-XXXXX.txt \| codex exec --skip-git-repo-check - 2>&1`, with the security posture from `execution.codex_security` (ask once per session when unset) | The process exit, with its edits in the worktree |
| `remote` | The detached-worker dispatch the body's Execution Surface names, with the filled prompt; when no such capability is in the tool list, use the `worktree` row for the whole run and log the fallback | A receipt naming the launch. The result is the pushed result ref (`result.yaml` at its root) or, when the host delivers results as a store file or terminal message, that file or message |

**Codex delegation condition.** Delegate to `codex exec` only when this session is not itself running inside a Codex sandbox and `.git` is writable; otherwise use the `worktree` row for that experiment and log the fallback. A set sandbox marker in your environment is proof you are inside one; an unset marker proves nothing on its own, which is why the writable-`.git` check stays in the test:
```bash
# any true branch means: do not delegate this experiment to codex
test -n "${CODEX_SANDBOX:-}" || test -n "${CODEX_SESSION_ID:-}" || test ! -w .git
```

**Return shape.** A dispatch returns either a **result** (the work is done and its edits are where the table says) or a **receipt** (a handle for work that will finish after this call returns). A result goes straight to 3.3. A receipt is a pending wait: record it in `run_state.pending_waits` as `references/persistence.md` specifies, including the observable that will carry the result and the action to take (collect it through 3.3), and verify the write before dispatching the next experiment. Collect a receipt's result when that observable arrives, never by polling in a foreground loop.

### 3.3 Collect and Persist Results

Persist a `comparisons` record for each distinct reference, candidate, and workload pairing used in a decision. Each side's identity must uniquely identify the bytes that were measured; a shared HEAD is not enough when the candidate is uncommitted. Record the workload, both snapshots, and the decision's uncertainty and correctness evidence. Standalone and integrated pairings stay distinct in this array; a later in-place update must not replace a previously persisted distinct pairing. A runner-up's contribution is its confirmed change against the branch it was added to, not its standalone gain. These records explain results. `decide.mjs` still makes the accept or revert decision, using the existing snapshot fields.

Process experiments as they complete: do NOT wait for the entire batch to finish before writing results. An experiment dispatched as a receipt completes when its recorded observable arrives; collect it through the same steps, then clear its `pending_waits` entry in the CP-3 write.

**Collecting a `remote` result.** Fetch the result ref and read `result.yaml` from it. Accept it only when `base_sha` equals the `base_sha` you dispatched, the commit range `base_sha..head_sha` touches only `scope.mutable` plus `result.yaml`, and both `baseline` and `candidate` snapshots are present with the required objectives. A result failing any of these is `error` with the reason, logged and closed like a failed measurement; never repair a worker's numbers. An accepted result replaces steps 1 and 2 below: the worker's paired snapshots are the measurement and its `result.yaml` is the marker (copy it into `<state-root>/exp-<NNN>-result.yaml` so recovery does not depend on the remote ref). Continue from step 3 with the worker's `baseline` as the reference snapshot for `decide.mjs`, and record `machine` and `measured_by: worker` on the `comparisons` entry. A worker's `result.yaml` carries only the selection pairing, so a configured holdout answers a would-be keep with `next_measurement: holdout` exactly as for any other backend; that holdout is collected by the independent confirmation in 3.4, on the confirming machine, never by the worker that wrote the candidate. When `decide.mjs` asks for more selection samples (`add_sample`, `confirm`), re-dispatch the same worker (or a new one from the same `head_sha`) for that count; the entry stays one experiment.

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
   - **Judge cache.** Before filling a batch, hash each sampled item's bytes and look the hash up in `judge-cache.yaml` beside the experiment log. An item already scored in this run under this rubric reuses its cached result (scores, `feedback`, `ambiguous`); only uncached items are dispatched, and their results are written to the cache as they land. Identical output is scored once per run.
   - Fill the judge prompt template (`references/judge-prompt-template.md`) for each batch
   - Dispatch the `ceil(sample_size / batch_size)` judge sub-agents using the same bounded dispatch as Phase 3.2: queue them, dispatch to whatever concurrency the host accepts, and treat a capacity error as backpressure (retry the queued batch after a slot frees) rather than a scoring failure. These judge sub-agents are a separate budget from the experiment worktrees.
   - Each sub-agent returns structured JSON scores with a `feedback` string per item. A batch that comes back without `feedback` is re-dispatched once; persist what the second call returns. Store every item under the entry's `judge.items[]` with its `content_hash`; the digest reads that feedback in step 3.5.
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

   **Held-out confirmation.** When the spec configures a holdout, `decide.mjs` answers a would-be keep with `next_measurement: holdout` until the payload carries a `holdout` snapshot pair. Collect it then and not before: the holdout depends on the selection decision, so it is never dispatched alongside the selection measurement, however independent the two calls look. Scoring it early spends on candidates that would have been rejected anyway and puts held-out feedback in front of you before the next hypothesis. Run `measurement.holdout.command` (or, for a judge primary, the judge sample under `metric.judge.confirmation_seed`) on the reference and on the candidate, persist the pairing as `kind: holdout` in `comparisons`, and decide again. The holdout result decides keep or not; it does not enter the digest, the rolling window summaries, or hypothesis generation. A holdout that does not confirm the gain withholds the keep; record the outcome the script returned.

   **Per-experiment diagnostics.** When the harness or the judge dispatch reports cost, tokens, or latency, record them under the entry's `cost`. When `measurement.per_case` is true, record the script's `regressions` on the entry. Neither changes the decision.

7. **IMMEDIATELY persist this experiment on disk (CP-3).** Do not defer this to batch evaluation. The durable unit is one log entry per experiment at `<state-root>/experiment-log.yaml`. After the first measurement, append that entry. After every later ladder sample for the same experiment, write the accumulated metrics and current outcome onto that same entry. Do not append a second entry for the same hypothesis, and do not rewrite a different experiment's samples. Write a decide terminal only when `next_measurement` is `none`. Until then the entry stays nonterminal, `promising` while the keep path still needs samples and `measured` otherwise (including an inconclusive result that still wants samples). When `next_measurement` is `none`, an eligible result stays `measured` until its diff is on the optimization branch; a non-eligible result gets the decide terminal (`reverted`, `inconclusive`, `censored`, `degenerate`). `kept` and `runner_up_kept` wait until that integration. The raw metrics are on disk and safe from context compaction.

8. **VERIFY the write (CP-3 verification).** Read the experiment log back from disk and confirm the entry just written is present. If verification fails, retry the write. Do NOT proceed to the next experiment until this entry is confirmed on disk.

**Why immediately + verify?** The agent's context window is NOT a durable store. Context compaction, session crashes, and restarts are expected during long runs, so results that exist only in the agent's memory are lost. The verification step catches silent write failures that would otherwise lose data.

### 3.4 Evaluate Batch

After all experiments in the batch have been measured:

1. **Decide eligibility from `decide.mjs`, not from the primary metric alone.** An experiment is eligible when it improves at least one required objective beyond the configured comparison threshold and does not violate any other required objective. When `metric.objectives` is absent, the primary is the only required objective. `inconclusive` is not a keep.

2. **Rank** the eligible experiments in the batch by the script's `rank_score` (primary relative gain when the primary moved; otherwise the strongest required-objective relative gain). Identify that winner as the experiment to keep. An eligible experiment may be kept even if the ranking primary did not move.

3. **If `decide.mjs` returns `keep` for that winner: KEEP**
   - A `keep` has already passed held-out confirmation when the spec configures one; an entry whose last decision is `promising` with `next_measurement: holdout` is not a keep until the holdout pair is collected and the script decides again
   - For a `remote` winner, one independent measurement owns both the confirmation and the holdout: obtain a pairing the candidate's author did not produce by fetching `head_sha`, inspecting the diff against `base_sha`, and measuring it paired on this checkout or through a fresh confirmation worker that did not implement it, at the full configured protocol; when the last decision asked for `holdout`, that same measurement also runs the holdout on the reference and the candidate. Persist each pairing in `comparisons` (`kind: standalone` for the confirmation pair, `kind: holdout` for the holdout pair), every one with the `machine` and `measured_by` that produced it, and run `decide.mjs` on the payload built from those independent snapshots, never from the worker's. Keep only when it is eligible and `next_measurement` is `none`; otherwise the experiment takes that decide terminal and the worker's own claim is recorded as unconfirmed. The same independence that makes judge scores usable makes a self-measured keep usable.
   - Commit the experiment branch first so the winning diff exists as a real commit before any merge or cherry-pick (a `remote` winner is already a commit at `head_sha`; strip `result.yaml` from what gets merged)
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

6. **Close the rest.** Cleanup worktrees; a `remote` result ref may be deleted once its entry is verified in the log and its `result.yaml` copy is in `<state-root>`. `kept` and `runner_up_kept` are only for diffs on the optimization branch. Eligible candidates that were not integrated become `not_selected`. Leave `inconclusive`, `censored`, and `degenerate` as `decide.mjs` returned them.

### 3.5 Update State (CP-4)

**MANDATORY CHECKPOINT.** By this point, individual experiment results are already on disk (written in step 3.3). This step updates aggregate state and verifies.

1. **Re-read the experiment log from disk.** Do not trust in-memory state. The log is the source of truth.

2. **Finalize outcomes.** Update experiment entries from the step 3.4 evaluation (mark `kept`, `reverted`, `runner_up_kept`, etc.). Write these outcome updates to disk immediately.

3. **Update the `best` section** in the experiment log if a new best was found. Write to disk.

4. **Write strategy digest** to `<state-root>/strategy-digest.md`:
   - Categories tried so far (with success/failure counts)
   - Key learnings from this batch and overall
   - Remaining opportunities, their supporting evidence, and whether current measurements still support their estimates; mark stale estimates for reassessment before selecting them
   - Current best metrics and improvement from baseline
   - **Failure themes:** the recurring `feedback` strings from the current best's `judge.items[]` (or its failing `cases` when `measurement.per_case` is set), grouped by what is wrong, each with a count and one representative item. Selection-sample items only; holdout items never enter the digest

5. **Generate new hypotheses** based on learnings:
   - Re-read the strategy digest from disk (not from memory)
   - Read the rolling window (last 10 experiments from the log on disk)
   - Do NOT read the full experiment log -- use the digest for broad context
   - Start from the failure themes: a theme with a count worth acting on becomes at most one hypothesis that addresses the theme, with the representative item as its evidence. A rule per failing item is not a hypothesis; it is the pattern that overfits the selection sample
   - After a keep on a cost target, re-measure how the cost divides among the parts before adding implementation hypotheses only when the keep leaves the current shares unable to say whether the next hypothesis is worth keeping
   - Add new hypotheses to the backlog and write the updated backlog to disk

6. **Write the updated hypothesis backlog to disk.** The backlog section of the experiment log must reflect newly added hypotheses and removed (tested) ones.

7. **Write `run_state`.** Add this tick's in-tick time to `active_seconds`, increment `tick`, set `status`, and leave `pending_waits` holding exactly the receipts not yet collected (`references/persistence.md`).

**CP-4 Verification:** Read the experiment log back from disk. Confirm: (a) all experiment outcomes from this batch are finalized, (b) the `best` section reflects the current best, (c) the hypothesis backlog is updated, (d) `run_state` reflects this tick. Read `strategy-digest.md` back and confirm it exists. Only THEN proceed to the stopping criteria check.

**Checkpoint: at this point, all state for this tick is on disk. If the agent crashes and restarts, it can resume from the experiment log without loss.**

### 3.6 Check Stopping Criteria

Stop the loop as soon as any one of these holds. Two clocks are involved: `run_state.active_seconds` counts time spent inside ticks since Phase 3 started, summed across ticks and excluding time spent waiting between them; `run_state.phase3_started_at` anchors calendar time. In a single uninterrupted session the two clocks read the same.

- **Target reached**: `stopping.target_reached` is true and the current best meets every declared required target (`decide.mjs` `target_reached` on the current-best snapshot). When `metric.objectives` is absent, that is the single `metric.primary.target` if set. Do not stop for a primary-only hit while another required target is still unmet.
- **Max iterations**: total experiments run >= `stopping.max_iterations`
- **Max active hours**: `run_state.active_seconds` (not time since the invocation, not time spent waiting) >= `stopping.max_hours`
- **Wall-clock backstop**: calendar time since `run_state.phase3_started_at` >= `stopping.max_wall_hours`. No wake extends it. A wake that fires after it has passed collects any arrived results, then goes to Phase 4.
- **Judge budget exhausted**: `metric.judge.max_total_cost_usd` is set and cumulative judge spend has reached it
- **Plateau**: no improvement for `stopping.plateau_iterations` **consecutive** experiments
- **Manual stop**: the user interrupts. Save state, then go to Phase 4.
- **No runnable hypothesis left**: no executable next action remains

If none is met, cross the tick boundary.

**Tick boundary.** With no receipts pending, the next tick starts at 3.1 in this session. With receipts pending, the SKILL.md body's rule decides whether this turn may end: it may only when every pending item waits on an event a registered wake will deliver and `run_state.pending_waits` records each wait and its on-arrival action. When that holds, write `run_state.status: waiting`, verify it, register any wake not yet registered, and end the turn; the wake re-enters through Phase 0.4 and `references/persistence.md` On Resume. When it does not hold and this session can wait for the result (a subagent still running, a process still attached), wait here and continue at 3.3 as results land. When it does not hold and this session cannot hold the wait, take the checkpoint hand-back that `references/persistence.md` states: verified ledger, `status: waiting`, the user told monitoring is paused, and the resume invocation printed.

### 3.7 Cross-Cutting Concerns

**Codex failure cascade**: Track consecutive Codex delegation failures. After 3 consecutive failures, auto-disable Codex for remaining experiments and fall back to subagent dispatch. Log the switch.

**Error handling**: Classify a failed measurement from what `measure.sh` actually signaled. The censored stderr marker (with exit 125) is `censored`. Exit 124 is `timeout`. Any other non-zero exit (including 125 without that marker) is `error`. Log that outcome with the error message, revert the experiment, and continue the batch.

**Progress reporting:** follow the SKILL.md body's reporting rule. Base any reported improvement on persisted, verified measurements, distinguish preliminary from confirmed results, and state what was measured and any limits on the claim. Batch counts and cumulative scoring cost remain in the log for wrap-up. Report them to the user during the run when they affect a decision.

**Crash recovery**: See the Persistence Discipline section. Per-experiment `result.yaml` markers are written in step 3.3. Individual experiment results are appended to the log immediately in step 3.3. Tick-level state (outcomes, best, digest, `run_state`) is written in step 3.5. On resume (Phase 0.4), the log at `<state-root>` is the ground truth. Scan for any `result.yaml` markers not yet reflected in the log, then collect any pending wait whose result has arrived.

---
