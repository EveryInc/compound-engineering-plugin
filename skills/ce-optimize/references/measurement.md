# Phase 0.3-1.7: prior learnings, identity, and measurement scaffolding

Read this after the spec is saved and follow it through the approval gate. A gate is a check that stops the run until its condition holds. The SKILL.md body states the two gates in here that stop the run (the clean-tree gate and the user approval gate). This file carries the procedure around them: prior-learnings search, run identity and resume detection, the branch and scratch space, the measurement harness, the baseline, the parallelism probe, and the worktree budget.

### 0.3 Search Prior Learnings

Resolve `<root>` first (the body's Artifact Root rule); this read of `<root>/solutions/` counts as composing a path under it. Read `references/agents/learnings-researcher.md` and dispatch a generic subagent seeded with that local prompt to search for prior optimization work on similar topics, passing it the resolved `<root>` path, not the config. Do not dispatch a standalone agent by type/name. If relevant learnings exist, incorporate them into the approach.

### 0.4 Run Identity Detection

Check if `optimize/<spec-name>` branch already exists:

```bash
git rev-parse --verify "optimize/<spec-name>" 2>/dev/null
```

Resolve `<state-root>` by the rule in `references/persistence.md` (The State Root), then check for an existing experiment log at `<state-root>/experiment-log.yaml`. A log found under `.context/compound-engineering/ce-optimize/<spec-name>/` when a durable root is now available is still this run's root; do not move it. A run whose ledger still exists is an existing run even when the branch does not exist in this checkout, so check the log independently of the branch.

When an existing run's `run_state.status` is `waiting` and this entry is a wake, a scheduler fire, or a resume invocation of that same run, it is a resume: do not ask. Otherwise present the user with a choice via the platform question tool:
- **Resume**: read ALL state from the experiment log on disk (do not rely on any in-memory context from a prior session). Recover any measured-but-unlogged experiments by scanning worktree directories for `result.yaml` markers. Then apply the SKILL.md body's resume rule to decide what is skipped and which approval checks run again.
- **Fresh start**: archive the old branch to `optimize-archive/<spec-name>/archived-<timestamp>`, clear the experiment log, start from scratch

### 0.5 Create Optimization Branch and State Root

```bash
git checkout -b "optimize/<spec-name>"  # or switch to existing if resuming
```

Create `<state-root>` if it does not exist:
```bash
mkdir -p "<state-root>"
```

---

## Phase 1: Measurement Scaffolding

**This phase stops the run until the user approves the baseline and parallel readiness. Phase 2 does not start before that.**

**Bundled scripts.** Phases 1 and 3 call helper scripts that ship in this skill's `scripts/` directory (`measure.sh`, `decide.mjs`, `parallel-probe.sh`, `experiment-worktree.sh`). The Bash tool's working directory is the user's project, not the skill directory, so a bare `scripts/<name>` path will not resolve. Invoke each by the skill's own absolute path. Every runnable block below already sets `SKILL_DIR` inline (shell state does not persist between Bash tool calls, so each block must carry it). Replace the `<absolute path …>` placeholder with the directory you loaded this `ce-optimize` SKILL.md from before running. The shape:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/<name>"
```

### 1.1 Clean-Tree Gate

The SKILL.md body states this gate. Run `git status --porcelain`, filter the output against `scope.mutable` and `scope.immutable`, and apply the body's rule to the result. Name the dirty in-scope files, ask the user to commit or stash them, and do not continue until they are clean.

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
   - Contains keys for every required hard objective (`metric.primary` when it is hard, plus every `metric.objectives` entry)
   - Values are numeric or boolean as expected
3. If validation fails, report what is missing and ask the user to fix the harness

**If agent must build the harness:**
1. Analyze the codebase to understand the current approach and what should be measured
2. Build an evaluation script (e.g., `evaluate.py`, `evaluate.sh`, or equivalent)
3. Add the evaluation script path to `scope.immutable` -- the experiment agent must not modify it
4. Run it once and validate the output
5. Include the measurement method and validated output in the Phase 1 approval presentation, with a link to the script for inspection.

**The eval set the harness scores against.** The set is the artifact the run keeps; the optimizer is replaceable. Build it from observed failures, not from what would be convenient to score: categorize the failures the user has seen, then cover each category with several items, because a category that appears once can either select or confirm but not both. Ten to twenty items is enough to start; fifty to a hundred labeled items is the range where a judge becomes trustworthy; beyond that, quality of the items matters more than count. The set is fixed for the run and listed in `scope.immutable`. When a holdout is configured, split the set so the held-out part is not in the selection command's inputs. When the target is instruction text (a skill, an agent-instructions file, a persona, a tool description), read `references/text-targets.md` before building the set: it carries the coverage rule that decides whether a rule you want kept survives the run.

**Validity gate (before the baseline).** Run the probes the run has inputs for; a probe with no inputs is recorded as not run and stated at approval, never asked for here. The harness does not reward a trivial shortcut: build an empty, constant, or copied output yourself and confirm it does not score as well as real output. When known-good and known-bad exemplars exist (`references/spec.md`), the harness separates them in the metric's direction. When `metric.judge.calibration.labels` is set, the judge's scores agree with the labels at or above `min_agreement` (default 0.8). A harness that fails a probe it ran stops the run before the baseline; report which probe failed and the values it produced. One case requires calibration rather than offering it: a judge run that waits between ticks through a wake after turn end does not leave Phase 1 with neither labels nor the user's explicit waiver. Record the outcome as `harness_validation` in the experiment log at CP-1, including the waiver text when calibration was waived.

### 1.3 Establish Baseline

Run the measurement harness on the current code. Baseline and final confirmation always use the full configured protocol (`repeat_count` samples when mode is `repeat` or `ladder`; one run when mode is `stable`). Exploratory experiments later may spend less; the baseline must not.

**If stability mode is `repeat` or `ladder`:**
Do not start this protocol until the counts that mode uses are coherent. Repeat needs a positive `repeat_count`. Ladder needs positive `exploratory_pairs` and `confirmation_repeats` (falling back to `repeat_count`) with confirmation at least the exploratory count. That is the same rule `scripts/decide.mjs` uses. A repeat-mode spec does not need ladder fields.
1. Run the harness that many times (`repeat_count` in repeat mode; the coherent confirmation count in ladder mode)
2. Aggregate results using the configured aggregation method (median, mean, min, max)
3. Calculate variance across runs
4. If variance exceeds the configured comparison threshold, warn the user and suggest increasing `repeat_count`

**Spend only the measurement the current decision needs.** After Phase 1, a smoke failure is degenerate; one paired exploratory sample can reject a clearly worse candidate or mark it inconclusive; add samples only while the result is promising or inconclusive; run the full configured protocol only before keeping a candidate and for the run's final confirmation. `scripts/decide.mjs` returns that next step. When mode is `stable` or `repeat`, keep the existing full-protocol behavior.

The Phase 1 baseline total is the number later comparisons score against. It is not the cost shares of a named workload. When a cost target needs to know where the cost goes, Phase 2 finds that by locating the work; do not run a second Phase 1 baseline for it.

Record the baseline in the experiment log. Persist every required hard objective under `metrics` (or `judge` when the primary is a judge score) so `decide.mjs` can load the same snapshot shape later experiments use. Gates and diagnostics stay in their own containers.
```yaml
baseline:
  timestamp: "<current ISO 8601 timestamp>"
  gates:
    <gate_name>: <value>
    ...
  metrics:
    <required_hard_objective>: { aggregate: <value>, samples: [<value>, ...] }
    ...
  diagnostics:
    <diagnostic_name>: <value>
    ...
```

If primary type is `judge`, also run the judge evaluation on baseline output to establish the starting judge score.

### 1.4 Parallelism Readiness Probe

1.4 and 1.5 apply when experiments share this machine (`execution.backend` is `worktree` or `codex`, or `remote` has fallen back to `worktree`). With `remote` workers each on their own checkout, skip both, record "not applicable: detached workers" in the approval evidence, and let `execution.max_concurrent` cap dispatched workers instead.

Run the parallelism probe script:
```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/parallel-probe.sh" "<project_directory>" "<measurement.command>" "<measurement.working_directory>" <shared_files...>
```

Read the JSON output. Present any blockers to the user with suggested mitigations. Treat the probe as intentionally narrow. It should inspect the measurement command, the measurement working directory, and explicitly declared shared files, not the entire repository.

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

1. Create the experiment log file at `<state-root>/experiment-log.yaml`
2. Include all required top-level sections from `references/experiment-log-schema.yaml`: `spec`, `run_id`, `started_at`, `baseline`, `experiments`, and `best`, plus the `harness_validation` record from the validity gate
3. Seed `experiments` as an empty array and seed `best` from the baseline snapshot (use `iteration: 0`, baseline metrics, and baseline judge scores if present) so later phases have a valid current-best state to compare against
4. Optionally seed `hypothesis_backlog: []` here as well so the log shape is stable before Phase 2 populates it
5. **Verify**: read the file back and confirm the required sections are present and the baseline values match
6. Only THEN present results to the user

### 1.7 User Approval Gate

The SKILL.md body states this gate and its user-facing reporting rule. Present what Phase 1 assembled and offer three options: proceed, fix issues, and adjust spec. Adjusting the spec sends the run back through Phase 1 so the baseline matches the new spec. It is available only while the log holds nothing derived from the spec (no hypothesis backlog and no experiments); when this gate is presented again on a resume, `references/persistence.md` (The Approval Record) decides what a changed spec means. Disclose uncapped spend: when `metric.judge.max_total_cost_usd` is null, say so and get an explicit yes for it, and when a wake after turn end is in use, uncapped judge spend is not approvable at all, so set the cap before presenting the gate. **Do not enter Phase 2 until the user explicitly approves.**

Explain the starting measurements, whether behavior checks passed, any measurement limitations or execution blockers, the planned experiment scope, the caps in force including `stopping.max_wall_hours`, and estimated scoring cost against the configured cap. Link the experiment log and measurement script for inspection. Keep the full degenerate-gate values, diagnostics, judge scores, probe results and mitigations, clean-tree confirmation, and worktree count and projection in the saved evidence. Report those details to the user when they affect the user's decision.

The moment the user approves, write the approval record to the experiment log as `references/persistence.md` (The Approval Record) specifies, verify it, then re-read the spec and baseline from disk before Phase 2. A resume whose record is absent, or whose spec digest or caps no longer match the spec on disk, presents this gate again.

**Evidence quality line.** State the validity-gate result: which probes passed and which were not run. For a judge primary, give the agreement fraction against the labels, or say plainly that the judge has not been checked against a person, so a gain may partly reflect what this judge rewards; the user is approving that limitation. State whether a holdout is configured. When it is not, say plainly that selection and reporting will share one sample, so the reported gain may be partly fit to that sample; the user is approving that limitation. Where the schema requires a holdout (a judge primary, or a run that waits between ticks through a wake after turn end), its absence is a spec failure caught at load, not a question this gate can approve past.

---
