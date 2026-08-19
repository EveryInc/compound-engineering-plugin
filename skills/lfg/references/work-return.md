# Reading ce-work's structured return (LFG step 2)

LFG's body stops the pipeline on `status: blocked` and `status: failed`. This file owns every other case: what the route binding means for a return, what a `status: complete` return must contain, the evidence contract, and the one recovery invocation.

## What each route outcome means

An unavailable `require` route must not prompt, fall back, or start native work — it is a stop. A completed `prefer` fallback may continue to step 3 exactly once after prominently disclosing its requested-versus-actual route/model and `fallback_reason` to the user; fallback is not a reason to invoke implementation again.

## What `status: complete` must carry

Verify that implementation work was performed — files were created or modified beyond the plan. Require the same plan path, changed files, U-IDs attempted/completed when present, verification results, behavior-change signal, and `standalone_shipping_skipped: true`.

Also require the route-aware receipt fields `implementation_engine_binding`, `requested_route`, `actual_route`, `requested_model`, `actual_model`, `fallback_reason`, `run_id`, `unit_receipts`, `plan_checkpoint`, `blockers`, and `recovery_path`. These fields are required even when native execution makes some values `null`; together they carry binding provenance, requested-versus-actual identity, fallback, the durable run, per-unit process/integration/verification/commit state, checkpoint disclosure, blockers, and recovery. A resumed return must carry the same `run_id`; never treat resume as permission to start a new unit or a second LFG tail.

## Verification evidence

When `behavior_change: true`, also require `verification_evidence` that names the relevant units/tasks, existing tests inspected, tests added/changed or used unchanged, red failure or characterization evidence when applicable, verification run, and any deliberate test exception. Do NOT decide the test strategy inside LFG; the evidence is ce-work's contract.

Also read `settled_decision_conflicts` from the return: blocker-routed entries arrive as `status: blocked` and stop the pipeline; **record any proceeded-and-flagged entries** — they must reach step 6's durable residual record and step 8's PR-description context, since later review may not rediscover them.

## The one recovery invocation

If `behavior_change: true` but `verification_evidence` is missing or too vague to tell how behavior was protected, invoke `ce-work` one more time in recovery mode. Reuse the same `implementation_engine:<compact-json>` carrier when one existed and keep the same plan path. With a safe non-null `run_id`, add `implementation_run:<safe-id>` with that exact value from the first return. When `actual_route` is `native` and `run_id` is `null`, repeat the original ce-work invocation once without an `implementation_run:` carrier; this preserves the pre-existing native idempotency/evidence-reconciliation path. A non-native return without a safe run id remains blocked instead of attempting discovery or a second implementation. Do not prompt the user and do not alter the plan path or engine carrier; this is evidence reconciliation, not a fresh dispatch. The recovery relies on ce-work's reconciliation path to inspect the already-implemented work, fill the missing evidence, and return without reimplementing. If the second return still lacks coherent verification evidence, stop as blocked and report the missing fields instead of continuing to simplify/review/ship.
