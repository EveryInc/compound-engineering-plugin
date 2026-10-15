# Cross-Model Adversarial Pass — Skill-Creator Eval Spec

Paths in this pack are relative to `skills/ce-code-review/`.

This is the required behavioral eval for ce-code-review's cross-model
adversarial pass. Deterministic route tests cover the worker; these cases cover
the SKILL.md/reference orchestration that only a fresh agent can execute. Inject
the current `SKILL.md`, `references/cross-model-review.md`, and the relevant
Stage 5 synthesis prose through the `skill-creator` workflow. Run on Claude Code
and Codex with a stub `npx` first on PATH that replays canned acpx streams
(`tests/fixtures/acp-stub-npx.sh`), plus a dummy executable for the routed CLI.

## Eval cases

1. **Activation runs only on the existing gate.** A local-aligned or standalone
   diff that selects `adversarial-reviewer` launches one detached cross-model
   adversarial job in the Stage 4 wave. A trivial diff that does not select the
   persona launches none. A `pr-remote` or `branch-remote` review launches none
   even when adversarial analysis is warranted.

2. **Host identity and fixed route precede egress.** The orchestrator keeps host
   harness and serving family separate, excludes an attestably same-family
   target, resolves exactly one target and concrete route, verifies every
   recipient against the allowlist, discloses the reviewed-code egress, and only
   then dispatches with `CROSS_MODEL_HOST_HARNESS` and
   `CROSS_MODEL_FIXED_ROUTE`. An unattested host serving family skips automatic
   dispatch.

3. **Cursor and Composer remain distinct.** A stated `cursor` preference selects
   Cursor default/Auto with no `--model`; `composer` selects an explicit
   Composer-family model through Cursor. A receiptless Cursor or Composer return
   records `model_actual: unverified` and `independence_verified: false`.

4. **Fold-in promotion requires verified independence.** A stubbed
   `adversarial-<provider>.json` finding matching the in-process adversarial
   finding promotes one anchor step only with `independence_verified: true`.
   With `independence_verified: false`, it remains attributed evidence and does
   not count as different-model corroboration. Peer findings never gain silent
   apply authority.

5. **Failures are additive and non-blocking.** A missing CLI means no job starts;
   a human-facing markdown review reports the pass as not run. A started timeout, failure,
   or unusable return is named in Coverage and the in-process review completes.
   The worker never changes recipients internally; any recipient-changing retry
   requires a new disclosure and sanction.

6. **Preferred-first bounded adaptation.** The declared mapping is attempted
   first. Only an observed unavailable, obsolete, or incompatible model permits
   a same-target/same-family override bound by
   `CROSS_MODEL_MODEL_OVERRIDE_TARGET` and `CROSS_MODEL_MODEL_OVERRIDE`.
   Cross-family substitution, override leakage, silent explicit-model changes,
   and new recipients are rejected.

7. **Detached lifecycle remains bounded.** The orchestrator starts the peer job
   in a short runner call, polls in bounded slices while other review work
   continues, reaps at the aggregate deadline, reads owned results and skip logs,
   names non-`done` terminal states, and removes private scratch.

8. **Mode-specific disclosure is honest.** Human-facing default mode announces
   the fixed route and egress before dispatch and calls it independent only when
   serving families differ attestably. Receiptless routes say "requested
   <model> at <effort>" with no serving caveat; a caveat appears only on a
   receipt mismatch or a route that requested no model. `mode:agent` emits no
   user-facing prose but retains the worker's stderr audit record.

9. **Oversized diffs recover without one giant prompt.** A fixture above the
   inline token or file-count limit sends the peer the orchestrator's compact
   semantic review map plus a private exact-diff path, never the whole diff.
   The worker does not cut semantic shards or invent risk divisions; the
   orchestrator does, and the adversarial agent reads bounded ranges and narrows
   them further rather than returning a progress note or silently omitting the
   pass. A normal-sized fixture keeps the direct diff path.

10. **Antigravity is the last automatic target.** On a Claude host with only
    `agy_acp_server.par` and its helper on PATH (no `codex`, `grok`, or
    `cursor-agent`) and no preference, the orchestrator resolves target and
    route `antigravity`, announces a Gemini model at high effort with
    reviewed-code egress to Google, and dispatches. The receipt records
    `model_actual: unverified`.

11. **Restraint when Antigravity is absent.** With `codex` absent, the grok CLI
    on PATH, and no Antigravity runtime, the pass picks `grok`. With no peer
    installed at all, it reports the pass as not run. Neither run mentions
    Gemini or an Antigravity fallback.

12. **Composer runs only when named.** With `cursor-agent` and Antigravity on
    PATH, no `codex` or grok CLI, and no preference, the pass never selects
    target `composer` (it may bind Grok through Cursor). With
    `cross_model_peer: composer`, or "use composer for the cross-model pass" in
    conversation, it resolves target and route `composer`.

13. **"Gemini" binds `antigravity`.** "Use Gemini for the cross-model pass"
    resolves target and route `antigravity`, never a Cursor route. With
    `CROSS_MODEL_PEERS=gemini` the route is not sanctioned and the skip is
    named; `CROSS_MODEL_PEERS=antigravity` sanctions it.

## Pass criteria

All thirteen cases pass on the current on-disk source on Claude Code and Codex. The
negative activation cases launch no peer, the fixed-route cases perform no
worker-internal recipient fallback, and only `independence_verified: true`
artifacts can promote agreement.
