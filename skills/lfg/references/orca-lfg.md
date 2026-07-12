# Orca routing for LFG

LFG remains the single lifecycle and shipping controller. Orca may own the subagent fan-out inside a child skill; it never owns LFG's stage order, fix decisions, commits, push, pull request, or CI-repair loop. This is an explicit mixed workflow, not a nested autonomous LFG run.

At pipeline start, follow `references/orca-routing.md` for workflow `lfg`. Display the effective stage/role targets. In `auto`, an absent Orca command selects and announces native execution; a present unhealthy or incompatible runtime fails. An explicit `native` route uses every original step below. Never fall back after an Orca child run begins.

For a healthy Orca route:

1. Keep the original LFG user prompt unchanged. Derive private child execution patches from the immutable LFG resolution before invoking any child:

   ```bash
   SKILL_DIR="<absolute path of the lfg skill>";
   LFG_DIR="$(mktemp -d -t ce-orca-lfg-XXXXXX)";
   chmod 700 "$LFG_DIR";
   node "$SKILL_DIR/scripts/orca-workflow.mjs" derive-child-patches \
     --resolved <private-lfg-resolved.json> \
     --out-dir "$LFG_DIR/child-patches"
   ```

   The command writes run-scoped patches for `ce-plan`, `ce-work`,
   `ce-simplify-code`, and `ce-code-review`. Pass each `patchPath` as separate
   controller data named `executionPatchRef`; never append its path or JSON to
   the original prompt and never call `save-profile`. The child routing contract
   consumes this as its current-prompt execution layer. Remove `LFG_DIR` after
   the last child returns, including on failure.
2. Invoke `ce-plan` with the original prompt and the `planning` patch. Its own adapter decides which selected research roles Orca owns.
3. Invoke `ce-work` with the original prompt, the `implementation` patch, and exactly `mode:return-to-caller <plan-path>`. Require `standalone_shipping_skipped: true`; reject any child result that committed, pushed, opened a PR, or ran a shipping tail.
4. Invoke simplification with the `simplification` patch and review with the `review` patch. Run simplification, code review, fixes, and browser testing in the original order. Invoke review exactly as `mode:agent plan:<plan-path>`. The LFG controller remains the only fix owner.
5. A parent-level approval covers these derived child patches for this LFG run. Pass `--approved true` to their dispatch only after that approval; do not ask once per child.
6. Keep a data-only stage ledger containing `plan`, `work`, `simplify`, `review`, `fixes`, and conditional `browser-test`. Each entry records `status`, `runtime`, `owner: "lfg-controller"`, and a contained artifact reference; never embed prompts, credentials, or artifact bodies.
7. Before any commit/push/PR operation, submit the ledger through the bundled helper and wait for `ce-orca.lfg-result/v1`. Its `stage_trace` persists only each stage's status, runtime, controller, and contained artifact reference so the ownership decision remains auditable without copying prompts or artifact bodies. A stopped, failed, malformed, or `shipping_allowed: false` result forbids every later shipping action.
8. When `tail_mode` is `remote`, run the original single shipping and CI-repair tail once. When it is `local-only`, follow the original no-remote completion path. Child skills never retry or repair CI.

If the user explicitly asked to approve configuration, wait before creating the first Orca run. Otherwise display and continue.
