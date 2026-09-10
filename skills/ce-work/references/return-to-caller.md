# Return to Caller

Read this when input triage enters Return-to-Caller Mode, and read it again immediately before returning. Input triage owns and validates the invocation grammar (`references/input-triage.md` parses the mode token and carriers). This file defines every field of the summary you return, the evidence rule for `status: complete`, how a repeated run recovers without reimplementing, and the standalone work you must not do here: simplify, review, PR, CI, and babysitting.

In this mode `ce-work` performs implementation and local verification only — including mid-implementation Phase 2 "Simplify as You Go" — then returns a structured summary instead of running the standalone shipping tail (final simplify, review, commit, PR, CI).

Return:

- `status`: `complete`, `blocked`, or `failed`
- `plan_path`
- `changed_files`
- `u_ids_attempted`
- `u_ids_completed`
- `verification_results`
- `verification_evidence`: one entry per attempted behavior-bearing unit, plus any non-behavioral unit where tests were intentionally skipped. Each entry states the unit/task, `behavior_changed`, `existing_tests_inspected`, `tests_added_or_changed`, tests used unchanged, red failure or characterization observed when applicable, verification commands/results, and any exception reason. For units executed by subagents, this entry is assembled from each worker's returned evidence, not reconstructed from the diff — the red-before-implementation observation exists only in the worker's report.
- `implementation_engine_binding`: the resolved one-run `mode`, `target`, `model`, and `source`, or `null` when native execution was selected without a binding
- `requested_route` and `actual_route`: target plus harness/intermediary identity, kept separate when fallback or same-family substitution occurred
- `requested_model` and `actual_model`: the model that was requested and the model identity the route's receipt reports as served (`unverified` when the route supplies no trustworthy receipt)
- `fallback_reason`: `null` when none, otherwise the observed route-unavailable or substitution reason
- `run_id`: durable external run identifier, or `null` for native execution
- `source_kind` and `source_digest`: what the controller recorded as the implementation source (`plan` plus its digest in Return-to-Caller Mode; standalone bare-prompt runs use `prompt`)
- `unit_receipts`: route, model, detached-process, integration, verification, canonical-commit, and cleanup state for each attempted unit
- `plan_checkpoint`: the disclosed checkpoint commit when the selected plan was the only canonical dirt, otherwise `null`
- `blockers`
- `recovery_path`: the run/workspace location the controller preserved and checked, when recovery remains; otherwise `null`
- `settled_decision_conflicts`: conflicts with `session-settled:`-labeled KTDs or Key Decisions encountered during implementation — each entry names the labeled entry, the evidence, and how it was routed (proceeded-and-flagged vs blocker); empty when none
- `behavior_change`: whether behavior-bearing code changed
- `standalone_shipping_skipped: true`

Return `status: complete` only when behavior-bearing work has verification evidence or a deliberate exception. If a previous return-to-caller run implemented code but omitted evidence, a later same-plan return-to-caller run should use the idempotency check to inspect the existing work, complete the evidence, and return without reimplementing.

Engine selection (`references/execution-engines.md`) still applies in this mode, but only for implementation. Do not print a copyable goal/workflow prompt: a manual paste step strands the caller. Run inline/subagents or return a blocker instead. Any goal/workflow engine used here must not open a PR, run the standalone shipping steps, or skip the checks the caller controls.
