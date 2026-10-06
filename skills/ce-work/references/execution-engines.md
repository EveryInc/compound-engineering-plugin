# Execution Engines

`ce-work` has two implementation engines: native execution (inline or subagents, scheduled by `references/execution-strategy.md`) and cross-model execution. The engine decides who authors the code. It never changes who runs the finishing steps (final simplify, review, PR, and CI; see "Resume the correct tail" below). Native execution is the default: it stays selected unless applicable live intent, a caller binding, or an enabled standing preference selects cross-model execution.

Engine selection applies only to code execution. Knowledge-work keeps its carve-out. Legacy plans and bare code prompts may select cross-model execution; otherwise they use the inline/subagent flow in `references/execution-strategy.md`.

Invocation origin supplies no routing authority and may not be detectable. Resolve the same inputs whether `ce-work` was explicitly invoked or selected by the host: current-task intent, still-active session intent, typed caller binding, active project instructions, enabled checkout configuration, then native execution.

## Decide whether an external route applies

Resolve one implementation binding from applicable authority and scope; do not reduce routing to keyword matching or a closed state machine. Obey the host's instruction hierarchy first. Within the same authority, prefer narrower and more current intent, using these sources:

1. an explicit assignment or constraint in the current task;
2. a still-active session preference or constraint;
3. a typed caller binding at its recorded provenance (for example, an LFG current-task assignment keeps current-task authority when it reaches `ce-work`);
4. the project's active instructions and conventions already in context;
5. enabled per-checkout configuration; then
6. native execution.

Lower sources may fill an unspecified detail but cannot contradict or broaden a higher source. Incidental mentions in feature prose, quoted material, examples, comparisons, filenames, or discussion do not activate routing. If two applicable instructions of equal authority genuinely conflict on which external worker receives the work, or on whether work leaves the host at all, tell the user about the conflict instead of guessing.

For example, current-task strict Composer resolves to Composer with `require` even when a caller Codex binding and config Cursor preference are both present. Without that task instruction, a caller Codex binding sourced from the current LFG task keeps that provenance. Without applicable live or caller intent, the ordered config candidates apply only when standing mode is enabled.

### Typed caller binding

Input triage passes only a fully validated and normalized typed caller binding. Treat it as one already-selected candidate; preserve its caller-visible provenance in the durable run record and never send its fields into planning or review input. Downstream consumers and workers may narrow its authority or restrictions but never broaden them.

A validated recovery run id selects durable state. It never authorizes a fresh dispatch or a different route.

### Standing configuration

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->



Standing configuration selects cross-model execution only when `work_engine_mode` resolves to `prefer` or `require` (`off | prefer | require`) from the two repo files, `config.local.yaml` then `config.yaml`. `off` disables only the standing preference. It does not cancel applicable live intent or a typed caller binding.

When no source applies, run native execution and do not load the cross-model reference. When one does, read `references/cross-model-execution.md` and resolve the route there before any content or authority leaves the host. It owns route strength, the target vocabulary, the `work_engine_preferences` and `work_engine_effort` schema, candidate traversal, and preflight. If no candidate qualifies there, continue natively as that reference directs.

For a bare prompt, cross-model execution is eligible only after Phase 0 has established a concrete goal, bounded scope, and authoritative verification. The cross-model reference turns that discovery into a private prompt brief and conservative P-unit packet. An unclear bare prompt returns to clarification or planning before any work is sent to an external worker; it does not fall through to a smarter external worker and ask that worker to invent the scope.

## Run the chosen engine

- **Native:** follow `references/execution-strategy.md` for scheduling and dispatch, and the Phase 2 loop in `references/implementation-loop.md`. `ce-work` creates the tasks, orders the units, dispatches, verifies, and commits.
- **Cross-model:** follow the serial external-unit transaction in `references/cross-model-execution.md` through the bundled controller, detached runner, and fixed adapter. Never let the detached worker select a fallback recipient.

## Resume the correct tail

After either engine finishes implementation, inspect the diff and continue with the finishing steps that belong to whoever owns them. On its own, an engine does no more than implementation and local verification.

| Mode | After implementation, `ce-work` ... |
|---|---|
| **Standalone** (user invoked `ce-work` directly, or `ce-plan` handed off interactively) | Resumes its Phase 3-4 finishing steps: quality checks, simplification, review, commit, and handoff in `references/shipping-workflow.md`. |
| **Return-to-caller** (`mode:return-to-caller`, e.g. under `lfg`) | Performs implementation and local verification only, then returns the structured summary in `references/return-to-caller.md` (`standalone_shipping_skipped: true`). Does not run simplify/review/PR/CI; the caller runs those. |

## Progress visibility (independent of tail ownership)

Whoever runs the finishing steps opens the PR. During a long run, commit each completed unit so progress stays observable in git. In return-to-caller mode `ce-work` must not open any PR, but it may commit and report progress in its structured summary. Never write progress or status into the plan body; git, commits, and the returned summary carry it.
