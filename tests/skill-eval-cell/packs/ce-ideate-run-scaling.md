# CE Ideate Run-Scaling Behavioral Eval

Use this evaluator-owned pack after a change to how `ce-ideate` sizes and shapes a run: the Fleet section of `skills/ce-ideate/references/divergent-ideation.md`, tactical scope and `go deep` in `references/scope-gates.md` Phase 0.5, issue-tracker detection in Phase 0.2, the issue-lens fallback, the Phase 3 verifier payload, or the §5.3 refine step in `references/post-ideation-workflow.md`. It is not a runtime reference and must not be injected into the agent under test.

`ce-ideate` dispatches its frames to subagents, so every cell runs the skill for real against a throwaway repository and is graded on what was dispatched and written, not on the agent's account of it.

## Method

1. The rows are `ce-ideate/run-scaling-*` in `tests/skill-eval-cell/catalog.ts`, on the `ideate-jot` fixture. Run them pre and post on Claude and Codex:

   ```bash
   bun run test:skill-eval-pack -- --skill ce-ideate --arm ab --hosts claude,codex --out <run-dir>
   ```

   The pack runs rows serially and each live cell takes 10-30 minutes per host, so run one `--id` per invocation side by side, each with its own `--out`. Run at least three trials of `run-scaling-default-fleet` and `run-scaling-tactical` per arm and host. Launch from a Claude Code shell under `env -u CLAUDECODE`. The catalog grade only checks that the run dispatched subagents and printed a `docs/ideation/` path; the contract is graded in the next steps.
2. Collect blinded grading bundles:

   ```bash
   bun tests/skill-eval-cell/packs/ce-ideate-run-scaling/collect.ts --out <bundle-dir> <run-dir>...
   ```

   Each bundle holds the cell's final answer, every ideation deliverable under the workspace's `docs/ideation/`, and every subagent dispatch the host logged. For Claude that is each dispatch's model and full prompt from the session log under `~/.claude/projects/`. Codex encrypts the spawn payload in its rollouts under `~/.codex/sessions/`, so a Codex bundle carries each spawn's task name and model, each child's model and final answer, and the orchestrator transcript instead. Every bundle also copies the run's scratch directory (briefs and checkpoints the orchestrator wrote) under `scratch/`. Bundles are named by an anonymous ID; `key.json` maps IDs to scenario, arm, host, and run directory and stays out of the graders' reach.
3. Dispatch a fresh grader per bundle with the rubric below and the bundle's scenario expectations. Graders must not see `key.json`, the arm, or the host.
4. Compare arms per host and scenario. A post-arm FAIL on an item the pre arm passed on the same host and scenario is a regression; rerun that cell once before changing prose, and treat the same failure twice as a defect in the restated condition. Fix the condition, not by adding a case back.

## Rubric

You grade one `ce-ideate` run. You do not know how it was produced. Read `expectations.md`, then `dispatches.json` (one entry per subagent dispatch: the model it asked for and either its full prompt or, where the prompt was not logged, its task name and final answer), the deliverable files, `answer.txt`, and `orchestrator-transcript.txt` and `scratch/` when present. When an item can only be shown by a prompt that was not logged and nothing else in the bundle shows it, mark it N/A rather than guessing.

Classify each ideation dispatch by the frame or frames its prompt assigns. Grounding, research-distiller, issue-analyst, and verifier dispatches are not ideation agents; an axis-coverage recovery agent is not part of the fleet count. On Claude, a dispatch that names `sonnet` is generation tier, `haiku` is extraction tier, and one that names no model inherits the orchestrator (ceiling tier). Otherwise read the model the spawn call passed: a smaller or cheaper model than the orchestrator's is a lower tier, and a spawn that names none inherits the orchestrator. When no spawn names a model, the run could not tier and every tier item is N/A.

For each item in the scenario's expectations, return `PASS`, `FAIL`, or `N/A` with one line of evidence quoted from the bundle. Return `ITEMS_FAILED: <n>` first.

## Expectations

Every scenario except `merge` and `non-software` also expects: the run wrote a ranked ideation file under `docs/ideation/`, and every survivor in it carries a basis.

- **default-fleet** — (1) all six frames are assigned; (2) 5 ideation agents; (3) Pain, Inversion, and Leverage on generation tier, Analogy and Assumption-breaking plus Constraint-flipping on ceiling tier; (4) per-frame target about 6-8 ideas; (5) a basis verifier was dispatched and asked to judge the meeting-test.
- **tactical** — (1) all six frames; (2) 5 ideation agents, tiered as default; (3) per-frame target 3-4 ideas; (4) verification budget 2-3 reads per agent; (5) at most 3 axes and no per-axis evidence scouts; (6) the verifier prompt says the meeting-test floor is waived.
- **go-deep** — (1) all six frames; (2) 6 ideation agents, one frame each; (3) all on ceiling tier; (4) verification budget 10 reads; (5) a second, ceiling-tier critic in the filtering phase; (6) the verifier judges the meeting-test.
- **tactical-go-deep** — (1) all six frames; (2) 6 ideation agents, one frame each, all ceiling tier; (3) per-frame target about 6-8 ideas, not 3-4; (4) verification budget 10 reads; (5) the verifier is not told the meeting-test is waived.
- **surprise-me** — (1) all six frames; (2) 6 ideation agents, one frame each; (3) all on ceiling tier; (4) no axis list was produced or passed to the agents; (5) each ideation prompt lets the frame choose its own subject.
- **issue-tracker-unreachable** — (1) the run detected issue-tracker intent and attempted the tracker; (2) it reported the tracker unavailable and continued; (3) all six default frames; (4) 5 ideation agents, tiered as default; (5) per-frame target 3-4 ideas and 2-3 reads per agent; (6) the verifier prompt says the meeting-test floor is waived.
- **non-software** — (1) the run treated the topic as non-software and used the universal frames, not a codebase scan; (2) all six frames were applied, inline or dispatched; (3) a fresh-context basis verifier was dispatched; (4) a ranked ideation file was written under `docs/ideation/`.
- **merge** — (1) the final file has one combined entry drawing on both top-ranked ideas; (2) neither source idea remains as a separate entry; (3) the ranked list is renumbered with no gap or duplicate; (4) the combined entry has its own axis and confidence; (5) the file was rewritten in place, not written as a second deliverable.

## Fixture

`tests/skill-eval-cell/fixtures/ideate-jot`: a small Node notes CLI with documented rough edges (slow search, unquoted CSV export, no edit or delete, a lock-free JSON store) and an empty `docs/ideation/`, so both repo-mode and elsewhere-mode runs write their deliverable inside the workspace. The issue-tracker row sets `GH_TOKEN` and `GH_HOST` to values no tracker accepts, so the issue lens cannot reach one.
