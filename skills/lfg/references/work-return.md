# Reading ce-work's structured return (LFG step 2)

LFG's body permits only a valid `status: complete` return to advance and stops every other status or malformed return. This file owns complete-return validation: what the route binding means, the required field inventory, the evidence contract, and the one recovery invocation.

## Missing-owner blocked return

When `ce-work` cannot reload its return owner after partial state exists, accept the kernel-owned reduced envelope as a valid terminal blocker rather than a malformed complete return. It contains `status: blocked`, `plan_path`, `run_id` when known, `changed_state`, `blockers`, and `recovery_path`. Preserve those recovery facts and stop; the complete-return field inventory below does not apply to this failure shape.

## What each route outcome means

`ce-work` discloses an unavailable route once and continues natively under both `prefer` and `require` (its `cross-model-execution.md` owns that), so LFG decides the route outcome from the return fields rather than expecting `ce-work` to refuse. A return whose `implementation_engine_binding.mode` is `require` and whose `actual_route` differs from `requested_route` stops the pipeline as blocked, reporting `requested_route`, `actual_route`, and `fallback_reason`; requirement strength is the caller's instruction, and native work done under it does not ship. A completed `prefer` fallback may continue to step 3 exactly once after prominently disclosing its requested-versus-actual route/model and `fallback_reason` to the user; fallback is not a reason to invoke implementation again.

## What `status: complete` must carry

Verify that implementation work was performed — files were created or modified beyond the plan. Require `status`, `plan_path`, `changed_files`, `u_ids_attempted`, `u_ids_completed`, `verification_results`, `verification_evidence`, `source_kind`, `source_digest`, `settled_decision_conflicts`, `behavior_change`, and `standalone_shipping_skipped: true`. The source fields must identify the same plan authority that entered the implementation run. Evidence and conflict fields are present on every complete return; empty arrays are valid when their conditions did not occur.

Also require the route-aware receipt fields `implementation_engine_binding`, `requested_route`, `actual_route`, `requested_model`, `actual_model`, `fallback_reason`, `run_id`, `unit_receipts`, `plan_checkpoint`, `blockers`, and `recovery_path`. These fields are required even when native execution makes some values `null`; together they carry binding provenance, requested-versus-actual identity, fallback, the durable run, per-unit process/integration/verification/commit state, checkpoint disclosure, blockers, and recovery. A resumed return must carry the same `run_id`; never treat resume as permission to start a new unit or a second LFG tail.

## Verification evidence

When `behavior_change: true`, `verification_evidence` must name the relevant units/tasks, existing tests inspected, tests added/changed or used unchanged, red failure or characterization evidence when applicable, verification run, and any deliberate test exception. Do NOT decide the test strategy inside LFG; the evidence is ce-work's contract.

Also read `settled_decision_conflicts` from the return: blocker-routed entries arrive as `status: blocked` and stop the pipeline; **record any proceeded-and-flagged entries** — they must reach step 6's durable residual record and step 8's PR-description context, since later review may not rediscover them.

## The one recovery invocation

If `behavior_change: true` but `verification_evidence` is missing or too vague to tell how behavior was protected, invoke `ce-work` one more time in recovery mode. Reuse the same `implementation_engine:<compact-json>` carrier when one existed and keep the same plan path. With a safe non-null `run_id`, add `implementation_run:<safe-id>` with that exact value from the first return. When `actual_route` is `native` and `run_id` is `null`, repeat the original ce-work invocation once without an `implementation_run:` carrier; this preserves the pre-existing native idempotency/evidence-reconciliation path. A non-native return without a safe run id remains blocked instead of attempting discovery or a second implementation. Do not prompt the user and do not alter the plan path or engine carrier; this is evidence reconciliation, not a fresh dispatch. The recovery relies on ce-work's reconciliation path to inspect the already-implemented work, fill the missing evidence, and return without reimplementing. If the second return still lacks coherent verification evidence, stop as blocked and report the missing fields instead of continuing to simplify/review/ship.
