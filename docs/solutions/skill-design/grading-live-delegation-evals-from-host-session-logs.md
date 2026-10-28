---
title: "Grading a live-delegation skill eval from Claude and Codex session logs"
date: 2026-10-28
category: skill-design
module: compound-engineering-plugin skill evaluation
problem_type: developer_experience
component: testing_framework
severity: medium
applies_when:
  - "Evaluating a skill whose key behavior is dispatching subagents (fleet size, model tier, or what each subagent was told)"
  - Grading eval-cell runs on Codex, where the subagent payload is not readable from the logs
  - Handing pre/post eval artifacts to a blind grader
  - "A catalog grade on the DELEGATES_DISPATCHED trailer fails for a Claude run that visibly dispatched"
tags:
  - skill-evals
  - live-delegation
  - codex
  - claude-code
  - session-logs
  - blind-grading
  - ce-ideate
related_components:
  - tests/skill-eval-cell/packs/ce-ideate-run-scaling/collect.ts
  - tests/skill-eval-cell/packs/ce-ideate-run-scaling.md
  - tests/skill-eval-cell/grade.ts
---

# Grading a live-delegation skill eval from Claude and Codex session logs

## Context

A skill that dispatches subagents has to be evaluated with real dispatch, and the grade has to come from what was dispatched, not from the model's account of it (`.agents/skills/ce-skill-work/references/evaluate.md`). The `ce-ideate` run-scaling eval needed to check, per run, how many ideation agents ran, which frames and model tier each got, and whether the Phase 3 verifier was told the meeting-test was waived. The eval-cell driver (`tests/skill-eval-cell/run.ts`) records only each host's stdout, stderr, workspace, and git state. None of that holds the dispatch payloads, so the evidence had to come from the hosts' own session logs, and the two hosts log very differently.

## Guidance

**Claude Code (`claude -p`).** Every `Agent`/`Task` dispatch is in the session log under `~/.claude/projects/<dir>/<session>.jsonl`, where `<dir>` is the cell workspace's real path with every non-alphanumeric character replaced by `-` (a `/tmp` workspace resolves to `/private/tmp/...` on macOS). Each `tool_use` entry carries `input.model` (absent means it inherits the orchestrator), `input.description`, and the full `input.prompt`. The same `tool_use` can appear more than once in the file, so deduplicate by its `id`.

**Codex (`codex exec`).** Rollouts live under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Find the root by `session_meta.payload.cwd` matching the workspace (compare real paths) with no `parent_thread_id`, then collect children whose `session_meta.payload.parent_thread_id` points into that tree. What is readable:

- the parent's `function_call` named `spawn_agent`: `task_name` and `model`
- each child's model, from its `thread_settings_applied` event
- each child's final answer, from `task_complete.last_agent_message`

What is not: the task message. It is encrypted both in the parent's `spawn_agent` arguments and in the child's `agent_message` payload. Parent calls are also replayed into child rollouts, so deduplicate spawns by `call_id`.

So on Codex, a contract item that only the prompt shows (a read budget, a waiver line) has to be judged from other evidence. That means the skill's own scratch files (in this eval the Codex orchestrator wrote a shared `brief.md` under the run's scratch directory) and the children's answers. Otherwise grade the item N/A rather than guessing.

**Blind the arm.** Cell paths contain `/pre/` or `/post/`, and they leak into answers, trailers, and logs. Replace the run directory prefix in every copied file before a grader sees it.

**Do not trust the trailer for dispatch.** A Claude `-p` run that schedules a wakeup ends on a later turn that prints `DELEGATES_DISPATCHED: none`, and the grader reads the last trailer, so a catalog `delegates: "some"` grade false-fails. In this session's `go deep` run, the trailer read `none` after an earlier turn listed fourteen dispatches. Treat the catalog grade as a smoke check and grade dispatch from the logs.

## Why This Matters

Without these, the eval either grades narration (which a delegating skill's eval cannot use as evidence) or produces wrong counts. In this session, duplicate log entries roughly doubled the Claude fleet count and tripled the Codex count on the first collection pass. A grader that sees `/pre/` in a path is no longer blind. And a Codex tier or waiver item graded from a guessed prompt is invented evidence. The host formats are not documented, so each of these took a probe run to find.

## When to Apply

- Any new eval pack for a skill that fans out subagents, such as `ce-ideate`, `ce-code-review`, or `ce-doc-review`
- Reading Codex results where a grader wants to quote a subagent prompt
- Any pre/post comparison handed to a model grader

## Examples

`tests/skill-eval-cell/packs/ce-ideate-run-scaling/collect.ts` implements all of the above:

- `claudeDispatches()` reads the session log and deduplicates by `tool_use` id.
- `codexDispatches()` walks the rollout thread tree, deduplicates spawns by `call_id`, and records the child model and final answer.
- `copyScratch()` copies the skill's scratch directory into the bundle.
- `redactCellPaths()` replaces the run directory before grading.

A Claude bundle from the tactical scenario lists five ideation dispatches (three `sonnet`, two inheriting) plus scouts on `haiku` and a `sonnet` verifier whose prompt says the floor is waived. Some Codex tactical runs show the same split (three spawns naming a smaller model, two inheriting), with the waiver visible only in the orchestrator's scratch brief. Others leave every spawn on the orchestrator's model, so tier items are judged per run and graded N/A when no spawn names a model.

## Related

- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md`: the pre/post eval-cell method this grading step plugs into
- `docs/solutions/skill-design/requested-vs-verified-model-identity.md`: the same rule applied to models, which is to trust the receipt rather than the requested value
- `docs/solutions/skill-design/codex-login-shell-bypasses-path-shimmed-eval-fakes.md`: another Codex-only eval-harness gap that silently changes what a cell measures
- `docs/solutions/skill-design/size-driven-skill-restructure.md`: eval-cell host gotchas
