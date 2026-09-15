# ce-code-review spine cost: live eval report (U7)

Plan: `docs/plans/2026-09-15-1322-fix-review-spine-cost-and-ci-floor-plan.md`. Branch `tmchow/review-spine-cost`, on top of merged PR #1719.

Two live runs per host, Claude Code and Codex CLI, through `tests/skill-eval-cell/run.ts` with real subagent dispatch and a real cross-model peer. Each run is graded on the ordered tool trace (which files the orchestrator read and when), the orchestrator's turn count against the measured baseline of 68, `stages.jsonl`, and the `cost` block in `metadata.json`.

## Fixtures

| Run | Fixture | Staged change | Gate result |
|---|---|---|---|
| Focused | `review-depth-focused-live` (37 executable lines, no hard block) | `src/landing.ts` | `focused`, size band small |
| Full | `review-live-full` (migration plus 24 executable lines) | `db/migrate/002_add_ledger_entries.sql`, `src/ledger.ts` | `full` by the migrations hard block; `unclassified_lines` reports the 7 `.sql` lines |

## Full path

| Measure | Baseline (2026-09-15 hagfish run) | Claude, this branch | Codex, this branch |
|---|---|---|---|
| Orchestrator turns | 68 | 66 | 29 tool calls |
| Orchestrator cache-write tokens | 942k | 739k | not exposed |
| Orchestrator cache-read tokens | 12.5M | 6.49M | not exposed |
| Peer wait turns | several slices plus notifications | 3 (status, one wait slice, result) | 1 wait |
| Peer input tokens | 1.3M | 705k (635k cached) | not exposed (Claude peer) |
| Reviewers dispatched | 6 | 4 | 4 |
| Elapsed | not recorded | 1,100 s | 685 s |

Reference reads by the Claude orchestrator, in order, with the turn on which each happened:

1. Turn 2 SKILL.md; turn 3 modes-and-output.md; turn 6 scope.md; turn 11 intent-and-plan.md.
2. Turn 14 persona-catalog.md and select-and-route.md; turn 17 cross-model-review.md.
3. Turns 24 to 35 dispatch-reviewers.md, subagent-template.md, findings-schema.json, action-class-rubric.md, diff-scope.md, four persona files.
4. Turn 44 finish-input.md; turn 58 validator-batch-template.md.

Never opened by either orchestrator on the full path: `finish-review.md` (the leaves read it; Codex's trailer lists it as "(leaves)"), `cross-model-recovery.md` (the peer folded on both hosts), `depth-paths.md`. That is the plan's intended shape: the finish body, the recovery branches, and the lite and focused procedures stay out of the orchestrator's context on a full run that takes no failure branch.

Where the Claude turns went. The read-in-order rule held, but turns 24 to 35 are twelve turns for what the plan expected to be two reads. The headless Claude orchestrator concatenated several large files into one `cat` call, the tool result was truncated, and it re-read the truncated tail and then the individual files: `subagent-template.md` was read three times and `dispatch-reviewers.md` twice. The baseline run showed the same pattern. This is a harness output limit, not a reference-load defect, and the fix would be one reference per read call at the Stage 4 pointer. Not changed in this PR; recorded as follow-up.

Cost block, Claude full run (`cost.status` complete, host claude):

| Stage | Elapsed s | Reviewers | Candidates |
|---|---|---|---|
| scope | 9 | | |
| select | 112 | 4 | |
| peer | 349 | | |
| dispatch | 285 | | 12 |
| merge | 192 | | 5 |
| validate | 65 | 1 | 2 |
| report | 87 | | |

Peer usage folded from `adversarial-codex-usage.json`: 704,504 input, 12,956 output, 634,624 cached. Artifact bytes 304,289 with the job directory excluded.

Defect found and fixed from this run: `totals.candidates` summed dispatch, merge, and validate (19) though merge and validate only filter the twelve dispatch produced. The summarizer now totals candidates over the producing stages (review, peer, dispatch) only; per-stage counts are unchanged. Commit `b026f1a4f`, pinned in `tests/ce-code-review-run-log.test.ts`. The Codex full run above ran the pre-fix script and shows the same double count (12 from 4 + 4 + 4).

## Focused path

| Measure | Claude | Codex |
|---|---|---|
| Orchestrator turns | 37 | not counted (Codex session log) |
| Orchestrator cache-write / cache-read | 298k / 2.14M | not exposed |
| Peer | Codex, 743k input (654k cached) | Claude, usage not exposed |
| Elapsed | 907 s | 171 s |
| Verdict | Not ready | Not ready |

Reads by both orchestrators: SKILL.md, modes-and-output.md, scope.md, `depth-paths.md` (opened at the gate, after the depth decision), cross-model-review.md, action-class-rubric.md, intent-and-plan.md, the fixture README and diff, and the peer's return file. Not opened on either host: `cross-model-recovery.md` (peer folded), `finish-input.md`, `finish-review.md`, `dispatch-reviewers.md`, `subagent-template.md`, `select-and-route.md`, `persona-catalog.md`. The focused run stays in the dispatch context as the plan requires, and the stage log records scope, review, peer, receipt with summarize as the last action.

The first Claude focused attempts answered correctly but did not open `depth-paths.md`; naming it in the body's Stage 1 step (commit `569bb06c5`) fixed that on four of four retrials and on both live runs.

## Unexercised paths

- `cross-model-recovery.md` on a real peer failure. The eval cells `cross-model-fold-in-recovery` and `cross-model-fold-in-folded` cover the branch with fixture job state on both hosts; no live run took it.
- A lite-gated live run. The `depth-gate-lite-procedure` cell covers the `depth-paths.md` read; no live lite run with a receipt write.
- Token usage on Codex. Codex exposes no per-turn usage to the skill, so its cost block carries elapsed, reviewers, candidates, and artifact bytes only, as the plan allows.
- A `partial` cost block from a killed run. Covered by the run-log unit test only.
