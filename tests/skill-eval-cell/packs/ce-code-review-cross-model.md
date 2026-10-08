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

Cases 10-12 cover review seats from a `model_roles` list. They also inject
`references/select-and-route.md`, `references/model-roles.md`, and
`references/finish-input.md`, and they run in a throwaway repo whose
`.compound-engineering/config.yaml` holds the map, in a mode that lets the
orchestrator run `scripts/model-role-resolve.py`.

10. **Three seats run beside the persona team (model role map AE1; R8).** The
    fixture config is:

    ```yaml
    model_roles:
      code-review:
        - grok-4.7 high
        - gpt-seat-model
        - opus medium
    ```

    Stub `grok`, `codex`, and `claude` CLIs are first on PATH and each returns a
    schema-shaped adversarial review. On a Claude Code host and a full-path
    diff that selects `adversarial-reviewer`, assert the orchestrator resolves
    the `code-review` role with `--host-family claude`, writes the constraints
    and brief files once, prints one notice that names all three recipients
    before any `start`, and issues three `peer-job-runner.py start` calls with
    labels `seat-1`, `seat-2`, and `seat-3`. Each call carries its own
    `CROSS_MODEL_SEAT`, a fixed route of `grok-cli`, `codex`, or `claude`, and
    the seat's model override; seats 1 and 3 also carry their effort override
    and seat 2 carries none. The in-process `adversarial-reviewer` stays in the
    local roster. The run dir holds `adversarial-grok-s1.json`,
    `adversarial-codex-s2.json`, and `adversarial-claude-s3.json`, and seat 3
    records `independence_verified: false`. `finish-input.json` lists the three
    artifacts and the three `Model role code-review seat <n>:` lines under
    `model_role`; the report prints the lines in Coverage, and a `mode:agent`
    run returns them as `coverage.model_roles`. Repeat on a full-path diff that
    does not select `adversarial-reviewer`: the three seats still run. Paired
    control: with no `model_roles:` key, no resolver runs, no seat starts, and
    case 1's activation gate decides the single peer as before.

11. **One seat cannot be served; remote scope drops worker seats (AE4; R12,
    R14).** Case 10's fixture with no `grok` stub on PATH and a `cursor-agent`
    stub present. Assert seat 1 is dropped: no job starts for it, the
    `cursor-agent` stub is never invoked, and no other model fills the seat.
    Seats 2 and 3 and the local reviewers run, and Coverage carries
    `Model role code-review seat 1: requested grok-4.7 high; not run; reason: ...`.
    Repeat in `pr-remote` scope with every stub present: no worker seat starts,
    each is reported dropped because the worker reviews the local tree, and the
    local reviewers complete.

12. **Review mode `off` reaches every seat (AE5; R13).** A fixture whose
    `code-review` list names two other providers, plus
    `cross_model_review_mode: off`, with no conversation request for a peer.
    Assert no stub CLI is invoked, no diff leaves for a second provider, the
    local reviewers complete, and the report names both skipped seats and the
    policy. Then repeat with the user asking in conversation for a specific
    peer: the seat list is not used and the single-peer rules run for that
    request.

## Pass criteria

All twelve cases pass on the current on-disk source on Claude Code and Codex. The
negative activation cases launch no peer, the fixed-route cases perform no
worker-internal recipient fallback, and only `independence_verified: true`
artifacts can promote agreement.
