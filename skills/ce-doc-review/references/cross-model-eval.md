# Cross-Model Judgment Pass — Skill-Creator Eval Spec

This is the eval-case specification for the cross-model judgment pass. It is the
**load-bearing behavioral gate**: `bun test` does
not exercise SKILL.md/reference prose, and plugin skill definitions cache at
session start, so behavioral wiring must be validated through the `skill-creator`
skill's eval workflow — which injects the current on-disk skill/reference content
into a fresh subagent at dispatch time (per AGENTS.md "Validating Agent and Skill
Changes"). Run it with `/skill-creator` and its eval workflow; do not rely on
in-session typed-agent dispatch (it tests the pre-edit cached copy).

The deterministic pieces of the pass are already covered without a model call —
`scripts/cross-model-doc-review.sh` input-validation, skip, and JSON-normalization
paths are exercised with stubbed input and `jq`. This eval covers the parts only
an end-to-end behavioral run can prove.

## Eval cases

Each case injects the current `SKILL.md`, `references/cross-model-review.md`, and
`references/synthesis-and-presentation.md`, then asserts the orchestrator behaves
as specified.

Cases 11-14 cover the detached launch->wait lifecycle and model-identity
receipts. Case 15 covers U8's fixed-route and bounded-adaptability contract.
Run them with the fake-CLI harness pattern — stub peer CLIs placed first on
PATH — and cross-host per the repo's eval default: Claude Code AND Codex.

1. **Activation gate — fires (R1, R2).** A document that activates at least one
   trio lens (e.g. a greenfield plan with a high-stakes domain activating
   `security-lens`, or a requirements doc with challengeable claims activating
   `adversarial`) → the orchestrator launches one `cross-model-doc-review.sh`
   call per activated trio lens, in the same dispatch wave as the in-process
   reviewers. Assert: a call is launched for each activated trio lens and none
   for non-activated lenses.

2. **Activation gate — does not fire (R2, R3).** A routine plan with validated
   upstream provenance (`product_contract_source: ce-brainstorm`), no high-stakes
   domain, and no new abstraction → no trio lens activates → **no** cross-model
   call is launched. Assert: zero peer calls; the review completes normally.

3. **Excluded lenses never run cross-model (R3).** For a document that activates
   `feasibility`/`coherence`/`scope-guardian` but no trio lens, assert no
   cross-model call is launched for any of those lenses.

4. **Attest host identity; sanction one fixed route (R7, R15, R16).** Assert the
   orchestrator separates host harness from serving family, excludes an
   attestably same-family target, and resolves exactly one target plus concrete
   route for the whole document before egress. Claude host → default target
   `codex`; Codex host → default target `claude`; Cursor host with an unknown
   serving family → automatic pass skips. The worker receives
   `CROSS_MODEL_HOST_HARNESS` and `CROSS_MODEL_FIXED_ROUTE`; it never chooses a
   recipient from a candidate list after content is available.

5. **Context slots threaded (R13).** Assert the orchestrator passes `document_type`
   (the Phase 1 classification) and `origin` (the same `{origin_path}` slot the
   in-process personas receive) to each cross-model call.

6. **One model per target at the script-owned reasoning tier (R4; R5 superseded).** Assert every
   activated trio lens uses the same sanctioned target and fixed route. The
   script's mapping owns the concrete model and reasoning flags; prose does not
   restate model IDs. `cursor` omits `--model` for Cursor default/Auto, while
   `composer` requests an explicit Composer-family model through Cursor.

7. **Fold-in + receipt-gated agreement promotion (R8, R9, R18).** Given a
   stubbed `<reviewer-name>-<provider>.json` return with
   `independence_verified: true` whose finding shares a fingerprint with an
   in-process twin, assert synthesis promotes the merged finding by one anchor
   step and attributes both reviewers. Repeat with
   `independence_verified: false` and assert the finding remains attributed
   evidence but receives no agreement promotion. Assert the peer finding is
   **never** rendered/applied as
   `safe_auto`. Also assert the promotion
   path is capped: a **peer-only** `manual` finding at confidence 100 with a
   mechanically-implied `suggested_fix` is **not** promoted to `safe_auto` by 3.6
   (nor silently applied by 3.7) — it caps at `gated_auto` unless an in-process
   reviewer independently raised the same finding (merged twin in 3.3).

8. **Announce by mode (R12).** Interactive host, default mode → before egress, a
   prominent line names the requested target, fixed route/intermediaries,
   requested model and reasoning, receipt status, and document-content egress
   scope. Call it independent only when serving families are attestably
   different. A failed route never changes recipients internally; any retry is
   a new host decision requiring a new disclosure and sanction.
   Headless mode → no user-facing prose about the pass (the script still emits the
   stderr egress audit log).

9. **Non-blocking (R11).** With the peer CLI absent/unauthed, or with the fixed
   route failing after dispatch, assert the review completes with all in-process
   findings. A never-started pass reports "cross-model pass: not run"; a started
   failed pass is named with its terminal state. No worker-internal recipient
   fallback is attempted.

10. **Whole-document sweep + trio slicing (R20, KTD6, KTD3).** When the pass runs,
    assert exactly **one** additional `whole-doc` call is launched (not one per
    lens) on the **full** document with the same resolved provider, folds in as
    `whole-doc-<provider>`, and a sweep finding sharing a fingerprint with *any*
    in-process finding promotes one anchor step (no in-process twin needed) only
    when the whole-doc artifact has `independence_verified: true`; with false or
    absent independence it remains attributed evidence without promotion. The
    sweep is never `safe_auto`. Assert that on a **unified plan** the trio peers
    receive their in-process twin's slice (e.g. product-lens/adversarial get the
    Product Contract), not the full document.

11. **Detached launch, never a long await (lifecycle R1, R6).** When the pass
    runs, assert the orchestrator launches each activated lens (and the
    whole-doc sweep) via one short `peer-job-runner.py start` call in the
    **same dispatch wave** as the in-process persona reviewers — each printing
    a job id quickly — and **never** issues a single long Bash call sized to
    the worker's runtime (e.g. a tool timeout stretched to the 600s hard cap)
    to await a peer inline.

12. **Bounded waits + aggregate deadline reap (lifecycle R5).** Assert the
    orchestrator polls outstanding jobs between waves with bounded
    `wait --max-secs` calls; at synthesis it loops bounded `wait` until every
    job is terminal **or 610s from the final `start`**, then `reap`s each
    nonterminal job, runs one final collection pass, and folds in the `done`
    artifacts.

13. **Reaped peer named; never-started stays silent (lifecycle R13).** With a
    stub peer CLI that never finishes, assert the job is reaped at the
    deadline and **named** in Coverage with its lens and terminal state (e.g.
    "cross-model security-lens peer: timeout") — it never silently vanishes —
    while a lens that was never started (gate not met / skip) remains silently
    absent, as before.

14. **Unverified-identity announce (lifecycle R8).** On a route without a
    served-model receipt, assert the announce/reconcile wording reads
    "requested <model>; serving model unverified on this route" rather than
    asserting the concrete model as serving.

15. **Preferred-first bounded adaptation (U8).** The declared mapping is tried
    first. Only after an observed unavailable, obsolete, or incompatible model
    may the host inspect capabilities and bind a same-target/same-family override
    with `CROSS_MODEL_MODEL_OVERRIDE_TARGET` plus `CROSS_MODEL_MODEL_OVERRIDE`.
    Assert cross-family substitution, override leakage to another target, and a
    new recipient are rejected. A recipient-changing retry requires a newly
    disclosed and sanctioned dispatch.

## Pass criteria

All fifteen cases pass on the current on-disk source, and case 2 confirms the
conditional cost profile (no peer spawn on a routine validated plan).
