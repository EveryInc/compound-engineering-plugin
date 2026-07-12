# Orca execution engine

Use this path only after `references/orca-routing.md` resolves the current run to Orca. Native routing returns to the unchanged engine selection in `SKILL.md`.

## Ownership boundary

- The `ce-work` controller parses the plan, builds dependency layers, chooses batches, verifies the integrated tree, records task progress, commits, and resumes the correct standalone or return-to-caller tail.
- Orca owns only the implementation workers in the current batch and their lifecycle.
- Every writer uses strict Orca worktree isolation. No worker stages, commits, pushes, opens a PR, watches CI, or launches another agent.
- Every writer has a non-empty exact file allowlist derived from the unit's predicted files. The engine rejects an actual delta outside it before mutating the controller worktree.
- The workflow applies each successful isolated patch to the controller worktree in deterministic unit order. A patch is removed only after successful application, and the returned `integration.files` replaces the worker's self-reported changed-file list.

## Dispatch one batch

1. Build a batch of at most five dependency-ready units. Serialize overlapping paths, shared contracts, migrations, generated artifacts, lockfiles, snapshots, shared state, or broad/unknown scopes. Do not treat isolation as permission to ignore merge cost.
2. For every unit, create one packet node with `stage: "implementation"`, `role: "implementation-unit-worker"`, its U-ID as `id`, its predicted relative files, and the bounded unit packet already required by Phase 1 Step 4 as `prompt`.
3. Set `SKILL_DIR` to the absolute directory containing this skill and write the data-only packet to private OS temp. First complete the `resolve --workflow ce-work --out <resolved.json>` step from `references/orca-routing.md`, then dispatch that exact immutable resolution with the local registry; never call a workflow from another skill:

   ```bash
   SKILL_DIR="<absolute path of the ce-work skill>";
   node "$SKILL_DIR/scripts/orca-runtime.mjs" run \
     --resolved <private-resolved.json> \
     --packet <private-packet.json> \
     --registry "$SKILL_DIR/scripts/orca-workflow-registry.json"
   ```

4. `orca-runtime.mjs run` returns a hydrated `ce-orca.dispatch/v1` envelope. Use `result.value` as `ce-result.json`; this workflow has no child artifacts to open. Treat a missing, malformed, failed, or stopped result as a failed batch. References such as `runs/<run-id>/...` are opaque transport identifiers; never resolve or open them relative to the target checkout or current working directory. The helper retrieves only published artifacts through the protocol's allowlisted reader. Do not redispatch the batch natively: runtime fallback is forbidden after Orca starts.
5. Treat each unit's returned `changed_files` as controller-attested only when its integration contains `files`; a missing attestation fails the batch. Inspect the actual integrated diff, compare it with each unit scope, run the unit tests and authoritative verification, then commit/update progress exactly as the native path requires. Do not dispatch the next dependency batch on a broken tree.
6. Roll worker evidence into `verification_evidence`. A missing red-before observation remains unverified; do not reconstruct it from the diff.

The helper displays the effective targets before launch. It pauses only when the invocation explicitly requested approval. Run-scoped overrides never update a profile unless the user explicitly asked to save one.

## Result mapping

Map `ce-orca.work-result/v1` units into the normal `ce-work` state. In return-to-caller mode, preserve `status`, `plan_path`, `changed_files`, `u_ids_attempted`, `u_ids_completed`, `verification_results`, `verification_evidence`, `blockers`, `behavior_change`, and `standalone_shipping_skipped: true`. The Orca engine never owns the standalone tail.
