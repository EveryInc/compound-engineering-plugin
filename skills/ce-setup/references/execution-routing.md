# Execution Routing Boundary

Load this reference only when the owning skill is about to read Compound Engineering settings or create a model dispatch. Routing changes execution selectors only. The owning skill remains authoritative for prompts, persona selection, tools, permissions, mutation scope, concurrency, egress, result integration, and workflow completion.

## OpenCode Host Boundary

The native OpenCode package owns the `ce_task` tool. For every already-selected native generic subagent on OpenCode, call `ce_task` with the stable role, existing description, and exact worker prompt instead of interpreting a configured selector yourself. The adapter resolves and freezes the routing snapshot behind an opaque session/role/candidate-bound handle, selects agent `general`, and derives the child session permission array exactly as OpenCode Task does: retain parent-session deny and `external_directory` rules, honor the general agent's explicit `task`/`todowrite` rules, append missing recursion denies and configured `experimental.primary_tools` denies without exact duplicates, and enforce `subagent_depth`. It then applies provider/model and effort-as-variant selectors through the SDK and finalizes the attempt before returning output. It never accepts a snapshot, candidate, serving claim, permission set, tool set, or fallback choice from tool arguments.

When the adapter returns `native`, immediately use OpenCode's native Task tool with the exact built-in arguments. This is the only path for a top-level no-route or `ce-default` binding; the adapter does not emulate Task. If `ce_task` is absent, every configured OpenCode candidate is unavailable before prompt egress. This is expected for converter-produced OpenCode trees, which contain portable skills and routing assets but not the native package adapter. Do not infer adapter support from those assets.

OpenCode current-task recipient authority comes only from a carrier at the start of the original direct top-level user or command input:

```text
[[ce-routing-intent/v1 <base64url-encoded JSON object>]]
```

The decoded object has exactly `binding` plus one of `role` or `class`. Only an authorized direct top-level input with a valid carrier is stripped; unauthorized, malformed, synthetic, child-session, and quoted input remains byte-identical. The plugin records an accepted carrier's session, message, and digest. Free-form routing wording, still-active model interpretation, repository or plan prose, findings, quoted examples, synthetic messages, and child-session messages cannot create task precedence. Global and project routing remain eligible normally. The adapter supplies the captured intent to the resolver; skill-authored `intents` are not an OpenCode authority source.

## Resolve

1. Materialize the roles the owning workflow already selected. Do not activate an optional role because it has a route.
2. Build one `ce-routing/v1` `resolve_batch` request for the selected wave. A first-wave request includes stable role IDs, runtime instance metadata, the current harness and serving family when known, and provenance-bearing task intent where that host has an authoritative carrier. A task intent may name a configured `{profile, policy}` or carry an exact data-only `{policy, candidates}` binding when the authoritative task source names a direct recipient; the resolver validates and freezes either form before dispatch. On OpenCode, only the native adapter supplies the stripped direct-input carrier described above; model-normalized intent is rejected. The resolver reads generalized and owning legacy recipient settings together, normalizes their precedence into each resolution, and freezes field-level compatibility provenance plus the role instances in the snapshot. A child or recovery request includes the exact full parent snapshot envelope (the prior `snapshot` object) as `parent_snapshot`; it may also include `parent_snapshot_id`, but that ID must match the envelope. An ID-only parent request is rejected with `CONTEXT_STALE`.
3. Write the request to an effective-user-private temporary file. From this skill's directory, invoke the co-located resolver with `python3 -I -S "$SKILL_DIR/scripts/ce-routing.py" --request-file <request-path>`. The `SKILL_DIR` assignment and invocation must be in the same shell call.
4. Treat malformed config, unknown roles/profiles, unsafe sources, ambiguous interrupted replacement state, context conflicts, and required-route failures as blockers for the affected dispatch. The resolver recovers a durable pending config replacement under the source lock before reading; it restores the old source or completes an identity-proven installed candidate, and returns `CONFIG_RECOVERY_REQUIRED` without deleting any version when transaction state or an external save is ambiguous. Every `.ce-cleanup-*` control is transaction state: only fully validated retired state with a safe identity-proven installed destination may be deleted, and every other control blocks without deleting its bytes. Do not ask for a fallback.
5. Freeze the returned snapshot and each candidate-specific `attempt_lock` for the top-level run. Nested work and recovery pass the full frozen envelope rather than rereading live config. The resolver validates its protocol, content-derived ID, private-state authentication, bounded lifetime, source/routing/compatibility provenance, intents, role instances, and request context before resolving from it. Authentication state is shared by independently installed resolver copies for the effective user and remains outside the public snapshot and receipt.

The resolver is a local control-plane read. Authorizing that exact command does not grant the worker shell, file, network, or mutation capabilities.

## Execute

- `ce-default` runs the owning skill's built-in path unchanged. `explicit_reset: true` means inheritance stopped intentionally.
- For a profile binding, the owning posture adapter qualifies candidates in order. A candidate is unavailable when the adapter cannot preserve the existing prompt, tool, permission, workspace, egress, identity, or recovery contract.
- Lock one candidate before any material reaches a recipient. The worker never selects another recipient.
- A preferred candidate may advance only after the prior attempt is terminal, no effect was integrated, and the next recipient/material/environment is independently authorized.
- A required mutation-capable route needs trusted identity before dispatch or isolated output that remains unintegrated until terminal evidence matches.
- A host with no supported selector reports the candidate unavailable. Never encode routing in prompt text or choose a typed persona as a substitute.
- OpenCode supports no candidate `route` selector. Before child creation, its native adapter requires successful observable `session.get`, `app.agents`, `config.get`, and `model.list` capability calls, a valid `general` agent permission array, a valid parent session/config, depth below `subagent_depth`, an installed provider/model, and any requested effort in the model's advertised variants. Missing methods, unsupported endpoints, malformed responses, or failed calls make the candidate unavailable. Version `1.18.3` is the tested API baseline, not a runtime version attestation.

## Finalize

Finalize profile candidate attempts only. A top-level `ce-default` binding has no candidate attempt lock and preserves the owning skill's built-in path without a finalization call; an explicit `ce-default` candidate inside a profile remains lock-bound and is finalized normally.

Call `finalize_attempt` with the exact self-validating `snapshot`, candidate `attempt_lock`, boolean attempt state, typed adapter `outcome` (`ok`, `unavailable`, or `failed`), adapter-owned serving evidence, and complete `prior_attempts` from the preceding receipt when the ordinal is greater than zero. Do not send a binding: finalization re-resolves role, instance, class, policy, candidate ordinal, selectors, and binding digest from the snapshot before output may be consumed or integrated. OpenCode serving evidence is only the assistant response's `providerID`, `modelID`, and `variant`; worker text and model-authored metadata are ignored.

- `accept` permits the owning workflow to consume the result.
- `next_candidate` permits a fresh host-owned qualification and authorization decision.
- `block` stops the affected dispatch with the returned diagnostic.
- Only an `ok` preferred attempt with missing identity evidence is `accepted_unverified`. Preferred `unavailable`, `failed`, or known-mismatch attempts may advance only while terminal, unintegrated, and backed by complete lock-bound history; required attempts block.

Emit the redacted route receipt with the owning workflow's normal output. Persist it only when that workflow already owns durable state; otherwise retain it only for the current summary.

## Write Identity

`patch_source` also verifies that the request `writer` equals the immutable consumer identity generated beside this resolver copy. Global writes remain `ce-setup`-only; project writers remain limited to schema-owned keys. A request string cannot make one installed skill act as another writer.
