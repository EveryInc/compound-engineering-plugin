# Orca routing for LFG

LFG remains the single lifecycle and shipping controller. Orca may own the subagent fan-out inside a child skill; it never owns LFG's stage order, fix decisions, commits, push, pull request, or CI-repair loop. This is an explicit mixed workflow, not a nested autonomous LFG run.

This reference loads only after upstream LFG has resolved its planning and
implementation carriers and sanitized the product request. That upstream
resolution is authoritative. For workflow `lfg`, follow
`references/orca-routing.md` for runtime/config resolution, but do not parse the
original conversation or reconstruct prompt-scoped planning/implementation
intent. The controller receives the already-resolved carrier state as data.
Standing Orca configuration still applies only where upstream left a stage
unbound.

Display the effective stage/role targets. In `auto`, an absent Orca command
selects and announces native execution; a present unhealthy or incompatible
runtime fails. An explicit `native` route uses every original step below.
Never fall back after an Orca child run begins.

For a healthy Orca route:

1. Keep the sanitized product request and resolved carrier state separate.
   Write a private `ce-orca.lfg-stage-intent/v1` file with `planning` and
   `implementation` entries. Use `null` for an unbound stage. A planning entry
   carries the resolved `plan_model` value. An implementation entry identifies
   either the exact scalar `implementation_engine` value or the retained
   `ordered-assignment` state; the ordered candidates remain in current-task
   context exactly as upstream requires.

   Derive private child execution patches from the immutable LFG resolution and
   that intent before invoking any child:

   ```bash
   SKILL_DIR="<absolute path of the lfg skill>";
   LFG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ce-orca-lfg-XXXXXX")";
   chmod 700 "$LFG_DIR";
   node "$SKILL_DIR/scripts/orca-workflow.mjs" derive-child-patches \
     --resolved <private-lfg-resolved.json> \
     --intent <private-upstream-stage-intent.json> \
     --out-dir "$LFG_DIR/child-patches"
   ```

   The command writes run-scoped patches only for stages upstream left
   unbound. A resolved upstream carrier suppresses the corresponding Orca child
   patch; this prevents standing/default Orca configuration from replacing an
   explicit `plan_model`, scalar engine, or ordered fallback list. Pass each
   emitted `patchPath` as separate controller data named `executionPatchRef`;
   never append its path or JSON to product input and never call
   `save-profile`. Remove `LFG_DIR` after the last child returns, including on
   failure.
2. Invoke `ce-plan` with the sanitized product request. Preserve the exact
   upstream `plan_model:<alias>` carrier when present; otherwise attach the
   emitted `planning` patch. Record and reuse the exact returned plan path.
   It may be under configured `<root>/plans/`; never reconstruct it under a
   hardcoded default artifact root.
3. Invoke `ce-work` with the exact upstream step-2 arguments, including the
   scalar `implementation_engine` carrier or retained ordered assignment when
   present. Attach the emitted `implementation` patch only when upstream left
   implementation unbound. Require the full upstream structured return,
   including route/model receipts, `run_id`, `unit_receipts`,
   `plan_checkpoint`, integration and verification evidence, blockers and
   recovery, plus `standalone_shipping_skipped: true`. LFG validates that
   return and owns any evidence-reconciliation retry; the Orca child adapter
   may not start a second implementation or shipping tail.
4. Invoke simplification with the `simplification` patch and review with the `review` patch. Run simplification, code review, fixes, and browser testing in the original order. Invoke review exactly as `mode:agent plan:<plan-path>`. The LFG controller remains the only fix owner.
5. A parent-level approval covers these derived child patches for this LFG run. Pass `--approved true` to their dispatch only after that approval; do not ask once per child.
6. Keep a data-only stage ledger containing `plan`, `work`, `simplify`,
   `review`, `fixes`, and conditional `browser-test`. Each entry records
   `status`, `runtime`, `owner: "lfg-controller"`, and a contained artifact
   reference. The work reference points to the structured receipt that carries
   checkpoints, per-unit integration/verification/commit state, and recovery;
   never embed prompts, credentials, or artifact bodies in the ledger.
7. Before any commit/push/PR operation, submit the ledger through the bundled helper and wait for `ce-orca.lfg-result/v1`. Its `stage_trace` persists only each stage's status, runtime, controller, and contained artifact reference so the ownership decision remains auditable without copying prompts or artifact bodies. The result contract explicitly keeps lifecycle, receipts, checkpoints, integration, verification, fixes, shipping, and CI repair in `lfg-controller`. A stopped, failed, malformed, or `shipping_allowed: false` result forbids every later shipping action.
8. When `tail_mode` is `remote`, run the original single shipping and CI-repair tail once. When it is `local-only`, follow the original no-remote completion path. Child skills never retry or repair CI.

If the user explicitly asked to approve configuration, wait before creating the first Orca run. Otherwise display and continue.
