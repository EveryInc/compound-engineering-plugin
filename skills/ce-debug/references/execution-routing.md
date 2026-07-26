# Execution Routing Boundary

Load this reference only when the owning skill is about to read Compound Engineering settings or create a model dispatch. Routing changes execution selectors only. The owning skill remains authoritative for prompts, persona selection, tools, permissions, mutation scope, concurrency, egress, result integration, and workflow completion.

## Resolve

1. Materialize the roles the owning workflow already selected. Do not activate an optional role because it has a route.
2. Build one `ce-routing/v1` `resolve_batch` request for the selected wave. A first-wave request includes stable role IDs, runtime instance metadata, the current harness and serving family when known, and normalized current-task routing intent. A child or recovery request includes the exact full parent snapshot envelope (the prior `snapshot` object) as `parent_snapshot`; it may also include `parent_snapshot_id`, but that ID must match the envelope. An ID-only parent request is rejected with `CONTEXT_STALE`.
3. Write the request to an effective-user-private temporary file. From this skill's directory, invoke the co-located resolver with `python3 -I -S "$SKILL_DIR/scripts/ce-routing.py" --request-file <request-path>`. The `SKILL_DIR` assignment and invocation must be in the same shell call.
4. Treat malformed config, unknown roles/profiles, unsafe sources, context conflicts, and required-route failures as blockers for the affected dispatch. Do not ask for a fallback.
5. Freeze the returned snapshot for the top-level run. Nested work and recovery pass the full frozen envelope rather than rereading live config. The resolver validates its protocol, content-derived ID, source/routing provenance, intents, and request context before resolving from it.

The resolver is a local control-plane read. Authorizing that exact command does not grant the worker shell, file, network, or mutation capabilities.

## Execute

- `ce-default` runs the owning skill's built-in path unchanged. `explicit_reset: true` means inheritance stopped intentionally.
- For a profile binding, the owning posture adapter qualifies candidates in order. A candidate is unavailable when the adapter cannot preserve the existing prompt, tool, permission, workspace, egress, identity, or recovery contract.
- Lock one candidate before any material reaches a recipient. The worker never selects another recipient.
- A preferred candidate may advance only after the prior attempt is terminal, no effect was integrated, and the next recipient/material/environment is independently authorized.
- A required mutation-capable route needs trusted identity before dispatch or isolated output that remains unintegrated until terminal evidence matches.
- A host with no supported selector reports the candidate unavailable. Never encode routing in prompt text or choose a typed persona as a substitute.

## Finalize

Call `finalize_attempt` with the frozen binding, exact boolean attempt state, adapter-owned serving evidence, and `prior_attempts` from the preceding receipt when the ordinal is greater than zero, before consuming or integrating output.

- `accept` permits the owning workflow to consume the result.
- `next_candidate` permits a fresh host-owned qualification and authorization decision.
- `block` stops the affected dispatch with the returned diagnostic.
- A successful preferred attempt with missing identity evidence is `accepted_unverified`; a known mismatch may advance only while retry-safe. Required concrete model or effort fields reject missing or mismatched evidence.

Emit the redacted route receipt with the owning workflow's normal output. Persist it only when that workflow already owns durable state; otherwise retain it only for the current summary.
