---
title: "feat(ce-optimize): Add iterative optimization loop skill"
type: feat
status: active
date: 2026-03-29
origin: docs/brainstorms/2026-03-29-iterative-optimization-loop-requirements.md
---

# feat(ce-optimize): Add iterative optimization loop skill

## Overview

Add a new `/ce:optimize` skill that implements metric-driven iterative optimization — the pattern where you define a measurable goal, build measurement scaffolding first, then run an automated loop that tries many parallel experiments, measures each against hard gates and/or LLM-as-judge quality scores, keeps improvements, and converges toward the best solution. Inspired by Karpathy's autoresearch but generalized for multi-file code changes, complex metrics, and non-ML domains.

## Problem Frame

CE has knowledge-compounding and quality gates but no skill for systematic experimentation. When a developer needs to improve a measurable outcome (clustering quality, build performance, search relevance), they currently iterate manually — one change at a time, eyeballing results. This skill automates the modify-measure-decide cycle, runs experiments in parallel via worktrees or Codex sandboxes, and preserves all experiment history in git for later reference. (see origin: `docs/brainstorms/2026-03-29-iterative-optimization-loop-requirements.md`)

## Requirements Trace

- R1. User can define an optimization target (spec file) in <15 minutes
- R2. Measurement scaffolding is validated before the loop starts (hard phase gate)
- R3. Three-tier metric architecture: degenerate gates (cheap boolean checks) -> LLM-as-judge quality score (sampled, cost-controlled) -> diagnostics (logged, not gated)
- R4. LLM-as-judge with stratified sampling and user-defined rubric is a first-class primary metric type, not deferred
- R5. Experiments run in parallel by default using worktree isolation or Codex sandboxes
- R6. Parallelism blockers (ports, shared DBs, exclusive resources) are actively detected and mitigated during Phase 1
- R7. Dependencies are pre-approved in bulk during hypothesis generation; unapproved deps defer the hypothesis without blocking the pipeline
- R8. Flaky metrics are configurable (repeat N times, aggregate via median/mean, noise threshold)
- R9. All experiments preserved in git for later reference; experiment log captures hypothesis, metrics, outcome, and learnings
- R10. The winning strategy is documented via `/ce:compound` integration
- R11. Codex support from v1 using established `codex exec` stdin-pipe pattern
- R12. Loop handles failures gracefully (bad experiments don't corrupt state)
- R13. Multiple stopping criteria: target reached, max iterations, max hours, plateau (N iterations no improvement), manual stop

## Scope Boundaries

- No tree search / backtracking in v1 — linear keep/revert with optional manual branch points only
- No batch size adaptation — fixed `max_concurrent`, user-tunable
- No LLM-as-judge calibration anchors in v1 — deferred to future iteration
- No rubric mid-loop iteration protocol in v1
- No judge cost budget enforcement — cost tracked in log, user decides
- This plan covers the skill, reference files, and scripts. It does not cover changes to the CLI converter or other targets

## Context & Research

### Relevant Code and Patterns

- **Skill format**: `plugins/compound-engineering/skills/ce-work/SKILL.md` — multi-phase skill with YAML frontmatter, `#$ARGUMENTS` input, parallel subagent dispatch
- **Parallel dispatch**: `plugins/compound-engineering/skills/ce-review/SKILL.md` — spawns N reviewers in parallel, merges structured JSON results
- **Subagent template**: `plugins/compound-engineering/skills/ce-review/references/subagent-template.md` — confidence rubric, false-positive suppression
- **Codex delegation**: `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` — `codex exec` stdin pipe, security posture, 3-failure auto-disable, environment guard
- **Worktree management**: `plugins/compound-engineering/skills/git-worktree/SKILL.md` + `scripts/worktree-manager.sh`
- **Scratch space**: `.context/compound-engineering/<skill-name>/` with per-run subdirs for concurrent runs
- **State file patterns**: YAML frontmatter in plan files, JSON schemas in ce:review references
- **Skill-to-skill references**: `Load the <skill> skill` for pass-through; `/ce:compound` slash syntax for published commands

### Institutional Learnings

- **State machine design is mandatory** for multi-phase workflows — re-read state after every transition, never carry stale values (`docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`)
- **Script-first for measurement harnesses** — 60-75% token savings by moving mechanical work (parsing, classification, aggregation) into bundled scripts (`docs/solutions/skill-design/script-first-skill-architecture.md`)
- **Confidence rubric pattern** — use 0.0-1.0 scale with explicit suppression threshold (0.60 proven in production), define false-positive categories (`ce:review subagent-template.md`)
- **Pass paths not content to sub-agents** — orchestrator discovers paths, workers read what they need (`docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`)
- **State transitions must be load-bearing** — if experiment states exist (proposed/running/measured/evaluated), at least one consumer must branch on them (`docs/solutions/workflow/todo-status-lifecycle.md`)
- **Branch name sanitization** — `/` to `~` is injective for filesystem paths (`docs/solutions/developer-experience/branch-based-plugin-install-and-testing-2026-03-26.md`)

## Key Technical Decisions

- **Linear keep/revert with parallel batches**: Each batch runs N experiments in parallel, best-in-batch is kept if it improves on current best, all others reverted. Simpler than tree search, compatible with git-native workflows. (see origin: Decision 1)
- **Three-tier metrics**: Degenerate gates (fast, free, boolean) -> LLM-as-judge or hard primary metric -> diagnostics (logged only). Gates run first to avoid wasting judge calls on obviously broken solutions. (see origin: Decision 2)
- **LLM-as-judge via stratified sampling**: ~30 samples per evaluation, stratified by output category (small/medium/large clusters), with user-defined rubric. Cost: ~$0.30-0.90 per experiment. Judge prompt is immutable (part of measurement harness). (see origin: D4)
- **Script-first measurement**: Mechanical work (run command, parse JSON, check gates, aggregate repeats) lives in a bundled shell script. The model handles only judgment and decision-making. This follows the script-first architecture learning.
- **Worktree isolation for parallel experiments**: Each experiment gets a git worktree with copied shared resources. Codex sandboxes as opt-in alternative. Orchestrator retains git control. (see origin: D6)
- **Codex dispatch via stdin pipe**: Write prompt to temp file, pipe to `codex exec`, collect diff after completion. Security posture selected once per session. (see origin: D5)

## Open Questions

### Resolved During Planning

- **Skill naming**: `ce:optimize` with directory `ce-optimize/`. Uses `ce:` prefix per naming convention.
- **Where does experiment state live**: `.context/compound-engineering/ce-optimize/<spec-name>/` — contains spec, experiment log, and per-batch scratch. Cleaned after successful completion except the final experiment log which moves to the optimization branch.
- **How are experiment branches named**: `optimize/<spec-name>` for the main optimization branch. Per-experiment worktree branches: `optimize/<spec-name>/exp-<NNN>`. Sanitized with `/` to `~` for filesystem paths.
- **Judge model selection**: Haiku by default (fast, cheap), Sonnet optional. Specified in spec file.

### Deferred to Implementation

- **Exact gate check parsing**: The spec uses operator strings like `">= 0.85"` and `"<= 300"`. Parsing these in the measurement script will be straightforward but the exact implementation depends on what edge cases arise.
- **Codex exec flag compatibility**: The exact `codex exec` flags may change. The skill should check `codex --version` and adapt.
- **Worktree cleanup timing**: Whether to clean up worktrees immediately after each batch or defer to end-of-loop may depend on disk space constraints discovered at runtime.
- **Judge prompt template specifics**: The exact judge dispatch mechanism (subagent vs direct API call) depends on what the model can do within the skill context. The template structure is defined but invocation details are deferred.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                    +-----------------+
                    |  User provides  |
                    |  goal + scope   |
                    +--------+--------+
                             |
                    +--------v--------+
                    | Phase 0: Setup  |
                    | Create/load spec|
                    +--------+--------+
                             |
                    +--------v-----------+
                    | Phase 1: Scaffold  |
                    | Build/validate     |
                    | harness + baseline |
                    | Probe parallelism  |
                    +--------+-----------+
                             |
                      [USER GATE]
                             |
                    +--------v-----------+
                    | Phase 2: Hypotheses|
                    | Generate + approve |
                    | deps in bulk       |
                    +--------+-----------+
                             |
              +--------------v--------------+
              |   Phase 3: Optimize Loop    |
              |                             |
              |  +--- Batch N hypotheses    |
              |  |                          |
              |  |  +--+ Worktree/Codex     |
              |  |  |  | per experiment     |
              |  |  |  |  implement         |
              |  |  |  |  measure           |
              |  |  |  |  collect metrics   |
              |  |  +--+                    |
              |  |                          |
              |  +--- Evaluate batch        |
              |  |    gates -> judge -> rank |
              |  |    KEEP best / REVERT    |
              |  |                          |
              |  +--- Update log + backlog  |
              |  +--- Check stop criteria   |
              |  +--- Next batch            |
              +--------------+--------------+
                             |
                    +--------v--------+
                    | Phase 4: Wrap-Up|
                    | Summarize       |
                    | /ce:compound    |
                    | /ce:review      |
                    +--------+--------+
                             |
                        [DONE]
```

## Implementation Units

### Phase A: Reference Files and Scripts (no dependencies between units)

- [ ] **Unit 1: Optimization spec schema**

**Goal:** Define the YAML schema for the optimization spec file that users create to configure an optimization run.

**Requirements:** R1, R3, R4, R5, R8, R13

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-optimize/references/optimize-spec-schema.yaml`

**Approach:**
- Define a commented YAML schema document (not JSON Schema — YAML is more readable for skill-authoring context) that the skill references to validate user-provided specs
- Cover all three metric tiers: `metric.primary` (type: hard|judge), `metric.degenerate_gates`, `metric.diagnostics`, `metric.judge`
- Include `measurement` (command, timeout, stability), `scope` (mutable/immutable), `execution` (mode, backend, max_concurrent), `parallel` (port strategy, shared files, exclusive resources), `dependencies`, `constraints`, `stopping`
- Include inline comments explaining each field, valid values, and defaults
- Use the two example specs from the brainstorm (hard-metric primary and LLM-judge primary) as validation targets

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-review/references/findings-schema.json` for structured schema reference
- `plugins/compound-engineering/skills/ce-compound/references/schema.yaml` for YAML schema with inline comments

**Test scenarios:**
- Schema covers all fields from both example specs in the brainstorm
- Required vs optional fields are clearly marked
- Default values are documented for every optional field

**Verification:**
- A user reading only this file can create a valid spec without consulting other docs

---

- [ ] **Unit 2: Experiment log schema**

**Goal:** Define the YAML schema for the experiment log that accumulates across the optimization run.

**Requirements:** R9, R12

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-optimize/references/experiment-log-schema.yaml`

**Approach:**
- Define the structure: baseline metrics, experiments array (iteration, batch, hypothesis, category, changes, gates, diagnostics, judge, outcome, primary_delta, learnings, commit), and best-so-far summary
- Include all experiment outcome states: `kept`, `reverted`, `degenerate`, `error`, `deferred_needs_approval`, `timeout`
- These states are load-bearing — the loop branches on them (per todo-status-lifecycle learning)

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-compound/references/schema.yaml`

**Test scenarios:**
- Schema covers the full experiment log example from the brainstorm
- All outcome states documented with transition rules

**Verification:**
- An implementer reading this schema can produce or parse an experiment log without ambiguity

---

- [ ] **Unit 3: Experiment worker prompt template**

**Goal:** Define the prompt template used to dispatch each experiment to a subagent or Codex.

**Requirements:** R5, R11

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-optimize/references/experiment-prompt-template.md`

**Approach:**
- Template with variable substitution slots: `{iteration}`, `{spec.name}`, `{current_best_metrics}`, `{hypothesis.description}`, `{scope.mutable}`, `{scope.immutable}`, `{constraints}`, `{approved_dependencies}`, `{recent_experiment_summaries}`
- Include explicit instructions: implement only, do NOT run harness, do NOT commit, do NOT modify immutable files
- Include `git diff --stat` instruction at end for orchestrator to collect changes
- Follow the path-not-content pattern — pass file paths for large context, inline only small structural data

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-review/references/subagent-template.md` for variable substitution pattern and output contract

**Test scenarios:**
- Template produces a clear, unambiguous prompt when all slots are filled
- Immutable file constraints are prominent and unambiguous
- Works for both subagent and Codex dispatch (no platform-specific assumptions in template body)

**Verification:**
- An implementer can fill this template and dispatch it without needing to read other reference files

---

- [ ] **Unit 4: Judge evaluation prompt template**

**Goal:** Define the prompt template for LLM-as-judge evaluation of sampled outputs.

**Requirements:** R3, R4

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-optimize/references/judge-prompt-template.md`

**Approach:**
- Two template sections: cluster/item evaluation (using the user's rubric from the spec) and singleton evaluation (using the user's singleton_rubric)
- Template includes: the rubric text, the sample data to evaluate, and explicit JSON output format instructions
- Include confidence calibration guidance adapted from ce:review's rubric pattern: each judge call returns a score + structured metadata
- Template is designed for Haiku by default — keep prompts concise and well-structured for smaller models
- Include the false-positive suppression concept: judge should flag if a sample is ambiguous rather than forcing a score

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-review/references/subagent-template.md` — confidence rubric structure, JSON output contract

**Test scenarios:**
- Template works with both the cluster coherence rubric and a generic quality rubric
- JSON output format is unambiguous and parseable
- Template handles edge cases: empty clusters, single-item clusters, very large clusters

**Verification:**
- Filling this template with a rubric and sample data produces a prompt that a model can respond to with valid JSON

---

- [ ] **Unit 5: Measurement runner script**

**Goal:** Create a script that runs the measurement command, parses JSON output, checks degenerate gates, and handles stability repeats.

**Requirements:** R2, R3, R8, R12

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-optimize/scripts/measure.sh`

**Approach:**
- Script-first architecture per institutional learning — all mechanical work in the script, model handles only judgment
- Input: spec file path, working directory, experiment index (for port parameterization)
- Steps: apply environment parameterization (ports) -> run measurement command -> capture JSON output -> parse gate checks -> if stability mode is repeat, run N times and aggregate -> output structured result JSON
- Output: JSON with fields: `gates_passed` (bool), `gate_results` (per-gate pass/fail), `metrics` (all metric values), `diagnostics`, `error` (if command failed or timed out)
- Handle: command timeout, non-zero exit, malformed JSON output, missing expected metric fields
- Gate check parsing: support operators `>=`, `<=`, `>`, `<`, `==`, `!=` against numeric or boolean values
- Stability aggregation: support `median`, `mean`, `min`, `max` across repeated runs

**Patterns to follow:**
- `plugins/compound-engineering/skills/git-worktree/scripts/worktree-manager.sh` for script structure and error handling
- `plugins/compound-engineering/skills/claude-permissions-optimizer/` for script-first pattern

**Test scenarios:**
- Command succeeds: JSON parsed, gates evaluated, result returned
- Command fails (non-zero exit): error captured, gates_passed = false
- Command times out: timeout handled, error recorded
- Gate fails: gates_passed = false, specific gate failure identified
- Stability mode: N runs aggregated correctly with median/mean
- Malformed JSON: error captured gracefully

**Verification:**
- Script can be run standalone with a spec file and produces valid JSON output

---

- [ ] **Unit 6: Parallelism probe script**

**Goal:** Create a script that detects common parallelism blockers in the target project.

**Requirements:** R5, R6

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-optimize/scripts/parallel-probe.sh`

**Approach:**
- Input: spec file path (for measurement command and mutable scope), project directory
- Checks:
  1. Port detection: search measurement command output and config files for hardcoded port patterns (`:\d{4,5}`, `PORT=`, `--port`, `bind`, `listen`)
  2. Shared file detection: check for SQLite files (`.db`, `.sqlite`, `.sqlite3`), local file stores in mutable/measurement paths
  3. Lock file detection: check for `.lock`, `.pid` files created by the measurement command
  4. Resource contention: check for GPU references (`cuda`, `torch.device`, `gpu`), large memory markers
- Output: JSON with `mode` (parallel|serial|user-decision), `blockers_found` array, `mitigations` array, `unresolved` array
- This is advisory — the skill presents results to the user for approval, does not auto-mitigate

**Patterns to follow:**
- `plugins/compound-engineering/skills/git-worktree/scripts/worktree-manager.sh`

**Test scenarios:**
- No blockers found: mode = parallel
- Port hardcoded: detected and reported with suggested mitigation
- SQLite file in scope: detected and reported
- Multiple blockers: all listed

**Verification:**
- Script can be run against a sample project directory and produces valid JSON

---

- [ ] **Unit 7: Experiment worktree manager script**

**Goal:** Create a script that manages experiment worktrees — creation with shared file copying, and cleanup.

**Requirements:** R5, R6, R12

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-optimize/scripts/experiment-worktree.sh`

**Approach:**
- Subcommands: `create`, `cleanup`, `cleanup-all`
- `create`: takes spec name, experiment index, list of shared files to copy, base branch
  - Creates worktree at `.claude/worktrees/optimize-<spec>-exp-<NNN>/` on branch `optimize/<spec>/exp-<NNN>`
  - Copies shared files from main repo into worktree
  - Copies `.env`, `.env.local` if they exist (per existing worktree convention)
  - Applies port parameterization if configured (writes env var to worktree's `.env`)
  - Returns worktree path
- `cleanup`: removes a single experiment worktree and its branch
- `cleanup-all`: removes all experiment worktrees for a given spec name
- Error handling: verify git repo, check for existing worktrees, handle cleanup of partially created worktrees

**Patterns to follow:**
- `plugins/compound-engineering/skills/git-worktree/scripts/worktree-manager.sh` — worktree creation, `.env` copying, branch management

**Test scenarios:**
- Create worktree: directory exists, branch created, shared files copied
- Create with port parameterization: env var written to worktree
- Cleanup: worktree removed, branch deleted
- Cleanup-all: all experiment worktrees for spec removed
- Partial failure: cleanup handles partially created state

**Verification:**
- Script can create and clean up worktrees in a test git repo

---

### Phase B: Core Skill (depends on all Phase A units)

- [ ] **Unit 8: Core SKILL.md**

**Goal:** Create the main `/ce:optimize` skill file implementing the full four-phase workflow.

**Requirements:** R1-R13 (all)

**Dependencies:** Units 1-7 (all reference files and scripts must exist)

**Files:**
- Create: `plugins/compound-engineering/skills/ce-optimize/SKILL.md`

**Approach:**

The SKILL.md is the primary artifact. It orchestrates all phases using the reference files and scripts. Key design points:

*Frontmatter:*
- `name: ce:optimize`
- `description:` — rich description covering what it does (iterative optimization), when to use it (measurable improvement goals), and key capabilities (parallel experiments, LLM-as-judge, git-native history)
- No `disable-model-invocation` — this is a v1 skill, not beta

*Phase 0: Setup*
- Accept spec file path as argument, or interactively create one guided by the schema reference
- Validate spec against schema (required fields, valid metric types, valid operators)
- Search learnings via `compound-engineering:research:learnings-researcher` for prior optimization work on similar topics
- Create optimization branch: `optimize/<spec-name>`
- Create scratch directory: `.context/compound-engineering/ce-optimize/<spec-name>/`

*Phase 1: Measurement Scaffolding (HARD GATE)*
- If user provides measurement harness: run it once, validate JSON output matches expected metric names, present baseline to user
- If agent must build harness: analyze codebase, build `evaluate.py` (or equivalent), validate it, present baseline to user
- Run parallelism probe script, present results
- If stability mode is repeat: run harness N times, validate variance within noise threshold
- GATE: Present baseline metrics + parallel readiness to user. Use platform question tool. Refuse to proceed until approved.
- State re-read: after gate approval, re-read spec and baseline from disk (per state-machine learning)

*Phase 2: Hypothesis Generation*
- Analyze mutable scope code to understand current approach
- Generate hypothesis list — optionally via `compound-engineering:research:repo-research-analyst` for deeper codebase analysis
- Categorize hypotheses (signal-extraction, graph-signals, embedding, algorithm, preprocessing, etc.)
- Identify new dependencies across all hypotheses
- Present dependency list for bulk approval via platform question tool
- Record hypothesis backlog in experiment log file
- Include user-provided hypotheses if any were given as input

*Phase 3: Optimization Loop*
- For each batch:
  1. Select hypotheses (batch_size = min(backlog_size, max_concurrent))
  2. Prefer diversity across categories within each batch
  3. Dispatch experiments in parallel:
     - **Worktree backend**: create worktree per experiment (via script), dispatch subagent with experiment prompt template
     - **Codex backend**: write prompt to temp file, dispatch via `codex exec` stdin pipe (per ce-work-beta pattern)
     - Environment guard: check for `CODEX_SANDBOX`/`CODEX_SESSION_ID` to prevent recursive delegation
  4. Wait for batch completion
  5. For each completed experiment:
     - Run measurement script in the experiment's worktree
     - If gates pass and primary type is judge: run LLM-as-judge evaluation
     - Record all results in experiment log
  6. Evaluate batch:
     - Rank by primary metric improvement (hard metric value or judge mean_score)
     - If best improves on current best: KEEP (merge experiment branch to optimization branch, commit)
     - Handle deferred deps: mark hypothesis, continue pipeline
     - All others: REVERT (log, cleanup worktree)
     - For non-overlapping runners-up that also improved: consider keeping if merge is clean and re-measurement confirms
  7. Update experiment log with all results
  8. Generate new hypotheses based on learnings from this batch
  9. Check stopping criteria (target reached, max iterations, max hours, plateau, manual stop)
  10. State re-read: re-read current best from experiment log before next batch

*Phase 4: Wrap-Up*
- Present deferred hypotheses needing dep approval (if any)
- Summarize: baseline -> final metrics, total iterations run, kept count, reverted count, judge cost total
- Preserve optimization branch with all commits
- Offer post-completion options via platform question tool:
  1. Run `/ce:review` on cumulative diff (baseline -> final)
  2. Run `/ce:compound` to document the winning strategy
  3. Create PR from optimization branch
  4. Continue with more experiments (re-enter Phase 3)
  5. Done

*Cross-cutting concerns:*
- **Codex failure cascade**: 3 consecutive delegate failures auto-disable Codex for remaining experiments, fall back to subagent
- **Error handling**: experiment errors (command crash, timeout, malformed output) are logged as `outcome: error` and the experiment is reverted. The loop continues.
- **Progress reporting**: after each batch, report: batch N of ~M, experiments run, current best metric, improvement from baseline
- **Manual stop**: if user interrupts, save current experiment log state and offer wrap-up

**Execution note:** Execution target: external-delegate for the SKILL.md writing itself (it is large and well-specified)

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-work/SKILL.md` — multi-phase structure, progress reporting, error handling
- `plugins/compound-engineering/skills/ce-review/SKILL.md` — parallel subagent dispatch, structured result merging
- `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` — Codex delegation section
- `plugins/compound-engineering/skills/ce-ideate/SKILL.md` — hypothesis generation, categorization, iterative refinement

**Test scenarios:**
- Spec with hard primary metric: gates + hard metric evaluation, no judge calls
- Spec with judge primary metric: gates -> judge -> keep/revert based on judge score
- Parallel batch of 4 experiments: all dispatched, results collected, best kept, others reverted
- Experiment that violates degenerate gate: immediately reverted, no judge call
- Experiment needing unapproved dep: deferred, pipeline continues
- Codex dispatch failure: fallback to subagent after 3 failures
- Plateau stopping: 10 consecutive batches with no improvement -> stop
- Flaky metric with repeat mode: 5 runs, median aggregation, noise threshold applied

**Verification:**
- Skill loads without errors in Claude Code
- YAML frontmatter passes `bun test tests/frontmatter.test.ts`
- All reference file paths use backtick syntax (no markdown links)
- Cross-platform question tool pattern used for all user interactions
- Script references use relative paths (`bash scripts/measure.sh`)
- No hardcoded tool names — capability-class descriptions with platform hints

---

### Phase C: Registration (depends on Unit 8)

- [ ] **Unit 9: Plugin registration and validation**

**Goal:** Register the new skill in plugin documentation and validate consistency.

**Requirements:** R1

**Dependencies:** Unit 8

**Files:**
- Modify: `plugins/compound-engineering/README.md`

**Approach:**
- Add `ce:optimize` to the skills table in README.md with description
- Update skill count in README.md
- Run `bun run release:validate` to verify plugin consistency
- Do NOT bump version in plugin.json or marketplace.json (per versioning rules)

**Patterns to follow:**
- Existing skill table entries in `plugins/compound-engineering/README.md`

**Test scenarios:**
- `bun run release:validate` passes
- Skill count in README matches actual skill count
- Skill table entry is alphabetically placed and has accurate description

**Verification:**
- `bun run release:validate` exits 0
- `bun test` passes (especially frontmatter tests)

## System-Wide Impact

- **Interaction graph:** The skill dispatches to learnings-researcher (Phase 0), repo-research-analyst (Phase 2), and optionally ce:review and ce:compound (Phase 4). It creates git worktrees and branches. It invokes Codex as an external process.
- **Error propagation:** Experiment failures are contained — each runs in an isolated worktree. Failures are logged and reverted. The optimization branch only advances on successful, validated improvements.
- **State lifecycle risks:** The experiment log is the critical state artifact. It must be written atomically (write to temp, rename) to prevent corruption from mid-write interrupts. Worktree cleanup must handle partial creation states.
- **API surface parity:** This is a new skill, no existing surface to maintain parity with.
- **Integration coverage:** The parallelism readiness probe should be validated against real projects with known blockers (SQLite DBs, hardcoded ports) to ensure detection works.

## Risks & Dependencies

- **Codex exec flags may change** — the skill should detect `codex` version and adapt. Mitigate by checking `codex --version` before first dispatch.
- **Worktree disk usage** — parallel experiments with large repos consume disk. Mitigate by cleaning up worktrees immediately after measurement and offering a `worktree_cleanup: immediate` option.
- **LLM-as-judge consistency** — judge scores may vary across calls for the same input. Mitigate by using fixed sample seeds and logging per-sample scores for post-hoc analysis. v2 can add anchor-based calibration.
- **Long-running unattended execution** — the loop may run for hours. Mitigate by saving experiment log after every batch (not just at end) and designing for graceful resume from saved state.

## Documentation / Operational Notes

- Update `plugins/compound-engineering/README.md` skill table
- No new MCP servers or external dependencies for the plugin itself
- The skill will appear in Claude Code's skill list automatically once the SKILL.md exists

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-29-iterative-optimization-loop-requirements.md](docs/brainstorms/2026-03-29-iterative-optimization-loop-requirements.md)
- Related code: `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` (Codex delegation), `plugins/compound-engineering/skills/ce-review/SKILL.md` (parallel dispatch)
- Related PRs: #364 (Codex security posture), #365 (Codex exec pitfalls)
- External: Karpathy autoresearch (github.com/karpathy/autoresearch), AIDE/WecoAI (github.com/WecoAI/aideml)
- Learnings: `docs/solutions/skill-design/script-first-skill-architecture.md`, `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`, `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`, `docs/solutions/workflow/todo-status-lifecycle.md`
