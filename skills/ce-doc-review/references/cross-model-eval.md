# Cross-Model Judgment Pass — Skill-Creator Eval Spec

This is the eval-case specification for the cross-model judgment pass (U6 of the
cross-model plan). It is the **load-bearing behavioral gate**: `bun test` does
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

4. **Attest host provider, resolve one different-provider peer (R7, R15, R16).**
   Assert the orchestrator attests the host provider from its own harness and
   **excludes** it, then passes the script a `host_provider` plus a candidate
   order: Claude host → `host_provider=claude`, default candidates resolve peer
   `codex`; Codex host → `host_provider=codex`, peer `claude`; Cursor on an
   **un-attestable** model → the pass **skips (zero peers)**, never a guessed
   same-provider peer. A preference stated in conversation (or `cross_model_peer:`
   in config, or the active project instructions) is front-loaded into the
   candidate order and overrides the default. Assert a second peer is launched
   only when `CROSS_MODEL_MAX_PEERS=2`.

5. **Context slots threaded (R13).** Assert the orchestrator passes `document_type`
   (the Phase 1 classification) and `origin` (the same `{origin_path}` slot the
   in-process personas receive) to each cross-model call.

6. **One model per provider at high reasoning (R4; R5 superseded).** Assert every
   activated trio lens runs on the resolved provider's single model at high
   reasoning (not a per-lens flagship/mid split) — the skill/reference hands the
   script `host_provider` + candidates and lets its single in-script mapping pick
   the model, rather than restating per-lens model IDs in the prose.

7. **Fold-in + agreement promotion (R8, R9, R18).** Given a stubbed
   `<reviewer-name>-<provider>.json` return whose finding shares a fingerprint with
   an in-process twin finding, assert synthesis 3.4 promotes the merged finding by
   one anchor step and renders the Reviewer column as
   `<reviewer-name>, <reviewer-name>-<provider> (+1 anchor)`. Assert the peer
   finding is **never** rendered/applied as `safe_auto` and that agreement adds at
   most one anchor step even with a second opt-in peer.

8. **Announce by mode (R12).** Interactive host, default mode → a prominent
   independent-provider line naming the resolved peer appears with the team
   announce. Headless mode → no user-facing prose about the pass (the script
   still emits the stderr egress audit log).

9. **Non-blocking (R11).** With the peer CLI absent/unauthed (script writes no
   output file), assert the review completes with all in-process findings and
   notes "cross-model pass: not run" in Coverage on an interactive host; no error.

## Pass criteria

All nine cases pass on the current on-disk source, and case 2 confirms the
conditional cost profile (no peer spawn on a routine validated plan).
