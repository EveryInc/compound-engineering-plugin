---
title: "fix: Remove LFG defer-bias and bulk-preview gate in ce-code-review"
type: fix
status: active
date: 2026-04-25
---

# fix: Remove LFG defer-bias and bulk-preview gate in ce-code-review

## Overview

Fix the LFG path's defer-bias in `plugins/compound-engineering/skills/ce-code-review/` so that picking LFG actually applies fixes the agent can defensibly propose, instead of routing them to ticket-filing. Replace the bulk-preview approval gate with a "just go" execution model: dispatch the fixer immediately on LFG selection, summarize what got applied versus what could not be resolved, then ask one targeted question about the leftovers.

The fix has two parts that work together:

1. **Push personas to commit to a `suggested_fix` more aggressively** when one is reachable from diff and surrounding code, so findings come into synthesis already classified correctly. Only `manual` findings the persona honestly cannot propose for stay un-fixed.
2. **Drop both gates on the LFG path** — the Stage 5b validator pre-pass and the bulk-preview approval prompt. The fixer's success/failure is the validation; the diff is the audit surface; the user reviews via diff after the fact, not via preview before the fact.

This is consistent for option B (top-level LFG) and the walk-through's `LFG the rest`. Walk-through option A automatically inherits the persona-side improvement: `manual + suggested_fix` recommends Apply, so per-finding recommendations stop punting to Defer.

---

## Problem Frame

A real `/ce-code-review` run on a 13-finding branch routed 8 findings to "file tickets" when LFG was selected. The user pushed back ("can we not decide how to fix them all?"), and the agent then produced concrete, defensible design decisions for all 8 in one pass — without external context the agent did not already have. The rescue prompt revealed that the skill should be doing this work by default rather than waiting for the user to override.

Two structural causes:

1. **`autofix_class: manual` is overloaded.** Personas use `manual` for two semantically different cases — "needs design judgment but I can propose one" and "genuinely needs cross-team alignment." Today's subagent template tells personas `suggested_fix` is optional ("a bad suggestion is worse than none"), and personas default to `manual` when they don't want to commit to a fix shape. Synthesis inherits that punt — Stage 5 step 6b's tie-break order (`Skip > Defer > Apply > Acknowledge`) routes both meanings to Defer.
2. **The LFG path performs research before approval, then asks for approval.** Stage 5b dispatches a validator subagent per surviving finding, then bulk-preview renders a plan, then waits for `Proceed`/`Cancel`. On uncommitted local edits — which is what LFG runs on — this inverts the cost calculus. Reverting an applied edit is cheaper than closing 8 GitHub issues that should not have been filed.

The current `references/bulk-preview.md`, walk-through `LFG the rest`, and Stage 5b validation gate were all built to mitigate "agent might apply a wrong fix in bulk." They mitigate it by adding research and approval overhead. The user's framing inverts the bias: trust the agent on uncommitted edits, audit via diff, file tickets only for items the agent honestly cannot resolve.

---

## Requirements Trace

- R1. Personas attempt to propose `suggested_fix` whenever a defensible fix is reachable from the diff and surrounding code. `manual` without `suggested_fix` is reserved for findings that genuinely need cross-team input, business context, or research the reviewer cannot do during this review.
- R2. Stage 5 action-derivation rule maps `manual + suggested_fix` to recommended-action Apply. `manual` without `suggested_fix` continues to map to Defer. Step 6b's cross-reviewer tie-break order is unchanged.
- R3. The LFG path — both interactive routing option B (top-level) and the walk-through's `LFG the rest` sub-decision within option A — does not run Stage 5b validation. Other paths (autofix, headless, walk-through option A's tracker-defer handoff for individual Defer choices, file-tickets option C) still run Stage 5b.
- R4. The LFG path does not render a bulk-preview approval prompt. Selecting LFG dispatches the fixer immediately on the full pending action set (`gated_auto` + `manual` + `advisory`).
- R5. The fixer subagent handles a heterogeneous queue: items with concrete `suggested_fix` get applied; advisory items are no-op (recorded as acknowledged); items where the fix cannot be applied cleanly, where the cited evidence no longer matches the code at the cited location, or that lack a `suggested_fix` entirely are routed to a `failed` bucket with a one-line reason. False-positive recognition flows through the same `failed` bucket — they are not silently filtered. The user retains agency over whether to file/walk/ignore them via the post-run question.
- R6. After the fixer returns, the unified completion report is emitted as today. When the `failed` bucket is non-empty, one post-run question fires using the platform's blocking question tool with three options: file tickets for the leftovers (when a tracker sink is available), walk through them one by one, or ignore.
- R7. Walk-through option A inherits R2's action-derivation change automatically — `manual + suggested_fix` findings recommend Apply with the proposed fix shown in the terminal block. No separate logic added in `references/walkthrough.md`.
- R8. `references/bulk-preview.md` is narrowed to option C (file-tickets) only. The walk-through `LFG the rest` Cancel-from-preview semantics are removed (no preview to cancel from). Option C's preview behavior is unchanged.
- R9. Tests in `tests/review-skill-contract.test.ts` and `tests/pipeline-review-contract.test.ts` are updated to match the new flow contract, not to preserve assertions against the removed gates.

---

## Scope Boundaries

- The `safe_auto -> review-fixer` automatic-fix pass before the routing question is unchanged. LFG only governs `gated_auto` / `manual` / `advisory` items remaining after that pass.
- File-tickets routing (option C) is unchanged — the bulk-preview is still its approval surface, and Stage 5b still runs on every pending finding before tickets fire.
- Autofix and headless modes are unchanged. They never ran the bulk-preview gate, and they retain Stage 5b.
- Report-only mode is unchanged.
- The 5-anchor confidence rubric, the `>= 75` filter threshold (with P0 escape at 50+), cross-reviewer promotion, and mode-aware demotion (step 6c) are unchanged. This plan only touches the recommended-action derivation and the LFG dispatch path.
- No P0-special-case carve-out. P0 findings flow through the same LFG path as other severities. Reverts are cheap on uncommitted edits regardless of severity, and a P0 carve-out would break the "just go" promise.
- The `manual` vs `gated_auto` distinction in `autofix_class` is preserved in finding output. This plan does not collapse them — synthesis still records what the persona thought. The change is in how the recommended action is derived, not in the underlying classification.

---

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-code-review/SKILL.md` — Stage 5 step 6b (action-derivation tie-break), Stage 5b conditional table, Step 2 Interactive mode option B (LFG dispatch), Step 3 (fixer subagent), Step 4 (artifacts).
- `plugins/compound-engineering/skills/ce-code-review/references/walkthrough.md` — per-finding presentation, action options, `LFG the rest` exit path, end-of-walk-through dispatch, unified completion report.
- `plugins/compound-engineering/skills/ce-code-review/references/bulk-preview.md` — three call sites today (B / C / walk-through `LFG the rest`); narrowing to one (C only).
- `plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md` — persona output contract; `suggested_fix` guidance is currently permissive ("a bad suggestion is worse than none"); `autofix_class` decision guide at lines 137-142 documents `manual` as "actionable work that requires design decisions or cross-cutting changes."
- `plugins/compound-engineering/skills/ce-code-review/references/tracker-defer.md` — Interactive and Non-interactive execution modes; the post-run failure-handling question reuses the existing Interactive flow on the leftover set.
- `plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json` — `suggested_fix: ["string", "null"]` with description "Concrete minimal fix. Omit or null if no good fix is obvious — a bad suggestion is worse than none."

### Institutional Learnings

- `docs/plans/2026-04-21-002-refactor-ce-code-review-precision-and-validation-plan.md` — added Stage 5b as a per-finding validation gate before externalization. R3 of that plan scoped Stage 5b to externalizing modes only; this plan further narrows by removing it from the LFG path specifically. Stage 5b's intent (validate before externalizing to a tracker) still holds for option C.
- `docs/plans/2026-04-17-002-feat-ce-review-interactive-judgment-plan.md` — introduced the Interactive mode routing question, walk-through, and bulk-preview design.
- `docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md` — anchored 0/25/50/75/100 rubric; this plan does not change the rubric.

### External References

None — this is an internal skill behavior change.

---

## Key Technical Decisions

- **Push personas instead of bolting on a synthesis-time proposal pass.** Architecturally simpler. The persona has the diff and evidence loaded; second-passing a sub-agent to re-derive what the persona could have committed to is wasted work. Synthesis stays a routing function rather than a reasoning function.
- **`suggested_fix` becomes the authoritative signal for "agent can fix this," not `autofix_class`.** Today's logic infers the recommended action from `autofix_class` alone (which is the persona's recommendation about handling, not about fix-availability). Going forward, presence of `suggested_fix` on a `manual` finding upgrades the recommended action to Apply; absence keeps it at Defer. `autofix_class` itself is not collapsed — the report still surfaces what the persona thought.
- **Drop Stage 5b on LFG, not "fold it into the fixer."** The fixer naturally re-checks each finding when applying the fix (or proposing one for `manual`). Running a separate validator subagent per finding before the fixer dispatches is duplicate research. Failure to apply or false-positive recognition surfaces during the fix attempt itself.
- **No P0 carve-out for "preview-before-apply."** LFG is opt-in to "agent's best judgment." Reverting a wrong P0 fix on uncommitted edits is cheaper than the cognitive overhead of re-routing some severities through preview and others not. Consistency is more valuable than the marginal safety floor.
- **Single fixer pass.** Today's `max_rounds: 2` re-review loop is for the `safe_auto` queue. LFG runs once, summarizes, exits. Re-review is heavy and the user can re-invoke `/ce-code-review` if a follow-up pass is wanted.
- **Post-run failure-handling question scoped to the failed set only.** When the `failed` bucket is empty (everything got applied or acknowledged), no question fires — the unified completion report is the terminal output. When non-empty, options are: file tickets for leftovers (when sink available), walk through them, or ignore. Mirrors `tracker-defer.md`'s sink-availability rules.

---

## Open Questions

### Resolved During Planning

- **Should walk-through option A also flip to Apply for `manual + suggested_fix`?** Yes — the user confirmed flipping option A consistently. R2's action-derivation change is the single source of truth; option A reads the recommended action from synthesis, so the flip happens automatically without separate walkthrough.md logic.
- **Should the fixer be expanded to "propose then apply" for `manual`-without-`suggested_fix` items?** No. Push the proposal upstream to the persona instead. If the persona could not commit to a fix, the finding stays in Defer territory. The user explicitly chose this architecture over a synthesis-time second pass.
- **Should P0 findings always preview, even under LFG?** No. The user agreed dropping the carve-out. Consistency over marginal safety; revert is the audit surface.
- **Should Stage 5b stay on the LFG path?** No. The user chose to drop it on LFG specifically. Stage 5b stays on autofix, headless, file-tickets (option C), and the walk-through tracker-defer handoff.

### Deferred to Implementation

- **Exact prompt wording in the subagent template** for the stronger `suggested_fix` expectation. The implementer should write language that pushes for a fix without inflating false-positive risk — the existing false-positive catalog (lines 115-126 of `subagent-template.md`) stays as the suppression backstop. Calibration will need iteration during testing.
- **The fixer's failure-reason taxonomy.** R5 says the fixer reports a one-line reason per failed item. The exact phrasing (e.g., "fix did not apply cleanly", "needs cross-team input", "finding looks false on closer review") affects how the post-run question framing reads. Pick during implementation; the user already noted these reasons should be specific enough that the post-run prompt is meaningful.
- **Whether to preserve the old `LFG the rest` Cancel-to-current-finding semantic without the bulk-preview.** The walk-through `LFG the rest` previously cancelled back to the current finding from the bulk-preview. Without a preview, "LFG the rest" just dispatches. The implementer should confirm with the user whether `LFG the rest` itself should now have a soft "are you sure?" gate, or whether it should fully match option B's no-gate model. Default to the latter (full match) unless review surfaces a real concern.
- **Operational definition of "evidence no longer matches code"** in U4's intent re-check. Options: (a) all identifiers cited in `evidence` strings still appear at the cited file:line; (b) line-content hash comparison within an edit-distance threshold; (c) light AST-level comparison; (d) leaver-it-to-the-fixer's-judgment with a clear prompt. Pick during implementation. The vagueness is acceptable here because the fixer is an LLM agent making a judgment call — over-specifying the rule risks brittleness — but the implementer should commit to a clear operational definition (and a reason phrase taxonomy) before writing the prompt.

---

## Implementation Units

- U1. **Strengthen persona `suggested_fix` expectation in subagent template**

**Goal:** Push reviewer personas to attempt a `suggested_fix` whenever defensible from the diff and surrounding code, while preserving the existing false-positive backstop. Reserve `manual` without `suggested_fix` for findings that genuinely require cross-team input, business context, or research outside the review.

**Requirements:** R1.

**Dependencies:** None.

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md`
- Modify: `plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json` (description tightening on `suggested_fix`; field stays `["string", "null"]`)

**Approach:**
- Replace the current "suggested_fix is optional. Only include it when the fix is obvious and correct. A bad suggestion is worse than none." line with stronger guidance: when a fix is reachable from the diff and surrounding code, propose one. Only omit when the finding genuinely needs cross-team alignment, business context, or research outside this review.
- Update the `autofix_class` decision guide to note that `manual` should be paired with `suggested_fix` whenever the persona can defend a fix from context, and that omitting `suggested_fix` on `manual` is a signal the finding genuinely needs handoff.
- Tighten the schema's `suggested_fix` description to match: emphasize that omission means "I genuinely cannot propose a fix from review context," not "I'd rather not commit."
- Preserve the existing false-positive catalog (lines 115-126 of `subagent-template.md`) unchanged. The catalog is the suppression backstop; this change only affects how non-suppressed `manual` findings present.

**Patterns to follow:** The existing decision guide format in `subagent-template.md` lines 137-142. Match the imperative voice and concrete-example style.

**Test scenarios:**
- *Happy path:* A persona reviewing a diff with a clear ownership-check gap produces `autofix_class: manual` with a concrete `suggested_fix` referencing the existing pattern in a sibling controller.
- *Edge case:* A persona reviewing a diff that adds an unbounded query produces `autofix_class: manual` with NO `suggested_fix` because pagination strategy depends on call-site knowledge the reviewer does not have.
- *Edge case:* The false-positive catalog still suppresses lint-comment-suppressed findings even when a fix would be reachable.
- *Integration:* Updated subagent template is loaded by Stage 4 spawning logic and the change reaches the persona prompts (no breakage in template variable substitution).

**Verification:** Spot-check the updated template against the existing persona files in `plugins/compound-engineering/agents/` to confirm none rely on the old `suggested_fix is optional` phrasing in a way that contradicts the strengthened guidance. The schema validation in tests should still pass with the description-only change.

---

- U2. **Update Stage 5 action-derivation rule for `manual + suggested_fix`**

**Goal:** Make the recommended-action mapping read `suggested_fix` as the authoritative signal for "agent can apply this." `manual + suggested_fix` recommends Apply; `manual` without `suggested_fix` recommends Defer. Walk-through option A and the LFG path both inherit this through the existing recommended-action surface.

**Requirements:** R2, R7.

**Dependencies:** None (parallel with U1; U1 is what makes the Apply path actually fire often).

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/SKILL.md` (Stage 5 step 6b, and any other location that documents the recommended-action mapping)

**Approach:**
- Update step 6b to specify the recommended-action mapping explicitly:
  - `safe_auto` -> Apply (already auto-applied before the routing question; not surfaced to LFG)
  - `gated_auto` with `suggested_fix` -> Apply
  - `manual` with `suggested_fix` -> **Apply** (was Defer)
  - `manual` without `suggested_fix` -> Defer
  - `advisory` -> Acknowledge
- The cross-reviewer tie-break order (`Skip > Defer > Apply > Acknowledge`) is unchanged. It only fires when reviewers disagree on action; the per-finding mapping above is the single-reviewer default.
- Update any prose elsewhere in `SKILL.md` that asserts "manual implies Defer" without qualifying for `suggested_fix` presence.

**Patterns to follow:** The existing step 6b structure. Keep the same mapping-table/prose hybrid format.

**Test scenarios:**
- *Happy path:* A `manual` finding with `suggested_fix` populated maps to recommended Apply in the synthesized findings table.
- *Happy path:* A `manual` finding with `suggested_fix: null` maps to recommended Defer.
- *Edge case:* A `manual` finding with `suggested_fix: ""` (empty string) is treated as "no suggestion" and maps to Defer.
- *Integration:* Walk-through option A's terminal block correctly renders the proposed fix when the upgraded recommendation fires.

**Verification:** Trace a sample synthesized finding set through the Stage 5/6 flow on paper — `manual + suggested_fix` items should appear in the Apply-recommended bucket in the Stage 6 findings table, and the walk-through stem should phrase as "Apply the …?" rather than "Defer …?".

---

- U3. **Drop Stage 5b and bulk-preview gates on the LFG path**

**Goal:** Remove the validator-pre-pass and approval-prompt gates from interactive option B and walk-through `LFG the rest`. Other paths (autofix, headless, option C, walk-through tracker-defer handoff) keep Stage 5b.

**Requirements:** R3, R4, R8.

**Dependencies:** U1, U2 (the gate removal is only safe once `manual` findings come in already classified by `suggested_fix`).

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/SKILL.md` (Stage 5b conditional table; Step 2 Interactive mode option B handler)
- Modify: `plugins/compound-engineering/skills/ce-code-review/references/bulk-preview.md` (narrow scope to option C only)
- Modify: `plugins/compound-engineering/skills/ce-code-review/references/walkthrough.md` (remove the `LFG the rest` -> bulk-preview path; update Cancel semantics)

**Approach:**
- Stage 5b conditional table: change `interactive, LFG routing (option B)` and `interactive, walk-through routing (option A) — LFG-the-rest handoff` rows from "Yes" to "No". Keep all other rows unchanged.
- Step 2 Interactive option B handler: rewrite to dispatch the fixer immediately on the full pending action set (`gated_auto` + `manual` + `advisory`). Remove the "first run Stage 5b validation" preamble and the "load `references/bulk-preview.md`" instruction.
- `bulk-preview.md`: narrow the "When the preview fires" section to option C only. Remove call sites 1 and 3 (routing option B and walk-through `LFG the rest`). Adjust the Scope summary wording, Cancel semantics, and edge cases sections to match the single remaining caller.
- `walkthrough.md` `LFG the rest` flow: replace the bulk-preview dispatch with direct fixer dispatch on the (current finding + remaining undecided) set. Remove the "Cancel returns to current finding" semantic — there is no preview to cancel from. Update the unified completion report description if it referenced bulk-preview-specific behavior.

**Patterns to follow:** The existing autofix and headless dispatch patterns in Step 2 — they already dispatch the fixer without preview. Mirror that shape for option B.

**Test scenarios:**
- *Happy path:* User selects option B with 8 pending findings; the fixer is dispatched immediately, no `Proceed`/`Cancel` prompt fires.
- *Edge case:* User is in walk-through option A with 3 findings answered, picks `LFG the rest` with 5 remaining; the fixer is dispatched on those 5 plus the current finding, no preview fires.
- *Edge case:* User selects option C with 8 pending findings; Stage 5b runs as before, bulk-preview renders, `Proceed`/`Cancel` fires (option C unchanged).
- *Integration:* Stage 5b conditional table parsing in tests still resolves correctly for non-LFG paths.

**Verification:** Read through Step 2 option B and walk-through `LFG the rest` in the updated SKILL.md and walkthrough.md as if running them — the path from "user picks LFG" to "fixer dispatches" should have zero blocking prompts. Option C should still show a preview.

---

- U4. **Expand fixer subagent contract for the LFG heterogeneous queue**

**Goal:** The fixer accepts a queue containing `gated_auto` (with `suggested_fix`), `manual` (with `suggested_fix`), and `advisory` items. It applies items with concrete fixes, no-ops on advisory, and routes items where the fix cannot be applied cleanly to a `failed` bucket with a one-line reason. Returns the partition `{applied, failed, advisory}` to the orchestrator.

**Requirements:** R5, R6.

**Dependencies:** U3 (the fixer is only invoked through this expanded contract on the LFG path; option C still files tickets without invoking the fixer).

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/SKILL.md` (Step 3 fixer subagent description, including the queue contract and return shape)

**Approach:**
- Document the heterogeneous queue contract in Step 3: each item carries its `autofix_class`, `suggested_fix`, `severity`, `file:line`, `title`, `why_it_matters`, and `evidence`. The fixer iterates and:
  - For items with `suggested_fix`: attempt to apply the fix. On clean application, add to `applied`. On failure (line moved, conflicting edit, syntax issue, or any other apply-time failure), add to `failed` with a reason.
  - For `advisory`: no-op; add to `advisory` (recorded as acknowledged).
  - For items without `suggested_fix` that somehow reach the queue: route to `failed` with reason "no fix proposed by reviewer." This should be rare under the new flow but is a safety net.
- The fixer also performs a light intent re-check before applying — confirm the cited code at the cited file:line still resembles the persona's evidence. If it has substantially changed (the diff already moved on, the line was deleted, etc.), route to `failed` with reason "evidence no longer matches code."
- Return shape: structured object listing each finding with its outcome and reason. Orchestrator assembles the unified completion report from this and computes whether the post-run question fires (R6).
- Single pass — no `max_rounds: 2` re-review loop on the LFG path. After the fixer returns, emit the report.
- `requires_verification: true` items still trigger targeted verification after apply, same as today's safe_auto fixer.

**Patterns to follow:** The existing Step 3 contract for the safe_auto fixer. Extend rather than rewrite.

**Test scenarios:**
- *Happy path:* Queue of 5 `gated_auto` and 3 `manual` items, all with `suggested_fix`; fixer applies all 8, returns `applied: 8, failed: 0, advisory: 0`.
- *Edge case:* Queue includes 1 advisory item; fixer no-ops, returns it under `advisory`, not `failed`.
- *Edge case:* One item's `suggested_fix` cannot apply cleanly because the cited line was already changed by an earlier fix in the same pass; fixer routes that item to `failed` with reason "evidence no longer matches code" or "fix did not apply cleanly."
- *Edge case:* Queue contains a `manual` finding without `suggested_fix` (defensive case); fixer routes to `failed` with reason "no fix proposed by reviewer."
- *Error path:* Fixer subagent dies mid-pass (timeout, dispatch error); orchestrator captures partial state — items marked `applied` stay applied, everything else routes to `failed` with reason "fixer dispatch failed."
- *Integration:* `requires_verification: true` items run their targeted verification after apply; failure to verify routes the item to `failed` with reason naming the failed verification.

**Verification:** Trace a synthetic queue through the new contract on paper. Check that the returned partition cleanly drives the unified completion report and that the post-run question fires only when `failed` is non-empty.

---

- U5. **Add post-run failure-handling question on LFG path**

**Goal:** After the fixer returns, when the `failed` bucket is non-empty, fire one question via the platform's blocking question tool with three options: file tickets for the leftovers, walk through them one at a time, or ignore. Sink-availability rules from `tracker-defer.md` govern whether the file-tickets option appears.

**Requirements:** R6.

**Dependencies:** U4 (the question is gated on the fixer's `failed` return).

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/SKILL.md` (Step 2 Interactive mode option B handler, after the fixer return)

**Approach:**
- After the fixer returns and the unified completion report has been assembled, check whether `failed` is non-empty. If empty, emit the report and fall through to Step 5 per the existing fixes_applied_count gating rule.
- If non-empty, fire one question via the platform's blocking question tool (`AskUserQuestion` in Claude Code with the existing pre-load step; `request_user_input` in Codex; `ask_user` in Gemini; `ask_user` in Pi via `pi-ask-user`). Stem: `N findings could not be auto-resolved. What should the agent do with them?`
- Options:
  - File tickets for these (when `any_sink_available: true` from cached tracker-detection tuple)
  - Walk through these one at a time
  - Ignore — leave them in the report
- Sink-omission: when `any_sink_available: false`, omit the file-tickets option and append one line to the stem explaining why (mirrors the routing-question stem behavior at top of Step 2 today).
- Dispatch on selection:
  - File tickets: route the failed set through `tracker-defer.md` Interactive mode (the existing flow used by option C). No bulk-preview here — failures already happened, this is just durable filing.
  - Walk through: re-enter the walk-through loop scoped to the failed set. Each finding's recommended action is recomputed via the standard rule from U2:
    - Items that have a `suggested_fix` (the fix existed but did not apply cleanly, or evidence-match check failed): recommend Apply. If the user picks Apply, the finding joins the in-memory Apply set and the standard end-of-walk-through fixer dispatch handles it. This is a *focused* fixer pass on a small Apply set — distinct from the original single-pass LFG dispatch and not a violation of LFG's single-pass guarantee.
    - Items without a `suggested_fix` (no fix proposed, or filtered as false positive): recommend Defer. Apply is not offered for these; the menu is Defer / Skip / `LFG the rest`.
  This re-entry path uses the existing per-finding question logic in `walkthrough.md` — no new walk-through behavior, just a different scope set.
  - Ignore: emit the unified completion report including the failed list under a "Could not resolve" section.
- Numbered-list fallback when the harness lacks a blocking tool, following the same conventions as the rest of the skill.

**Patterns to follow:** The existing routing-question handler at the top of Step 2 Interactive mode. Use the same option-label discipline (third-person voice, self-contained labels, label-by-letter dispatch when label varies by tracker confidence).

**Test scenarios:**
- *Happy path:* Failed set has 3 items, tracker available; question fires with 3 options including "File tickets for these"; user picks "File tickets," tracker-defer fires for each.
- *Edge case:* Failed set is empty; no question fires; report emitted, Step 5 gating logic handles the rest.
- *Edge case:* Failed set has 5 items, no tracker sink available; question fires with only "Walk through" and "Ignore"; stem includes "no tracker sink detected."
- *Edge case:* User picks "Walk through" with 5 failed items; walk-through re-enters scoped to those 5, each presented with the standard per-finding flow.
- *Integration:* When the user picks "File tickets," Stage 5b does *not* re-run on the failed set — the fixer already attempted them and their state is the input to ticket composition.
- *Cross-platform:* On Codex without `request_user_input` available, the numbered-list fallback fires correctly.

**Verification:** Walk the new question's three branches end-to-end on paper. Confirm sink-omission behavior matches `tracker-defer.md`'s existing Interactive-mode contract. Confirm the question never fires when the failed set is empty.

---

- U6. **Update tests and fixtures to match the new LFG flow contract**

**Goal:** Update `tests/review-skill-contract.test.ts` and `tests/pipeline-review-contract.test.ts` so they assert the new LFG behavior — fixer dispatch on selection, no bulk-preview for option B, no Stage 5b on LFG, post-run question on failed set — and remove assertions that pinned the removed gates.

**Requirements:** R9.

**Dependencies:** U3, U4, U5 (tests cover the contract these units define).

**Files:**
- Modify: `tests/review-skill-contract.test.ts`
- Modify: `tests/pipeline-review-contract.test.ts`
- Modify: `tests/fixtures/` (any fixture asserting old LFG flow output)

**Approach:**
- Identify failing assertions: based on `grep` results, current asserts include `(B) `LFG.` label format (line 83), `references/bulk-preview.md` reference (line 89), `Stage 5b validation pass dispatches conditionally` (line 278), `(B) `LFG.*first run Stage 5b validation` (line 304), `LFG the rest` shape in walkthrough.md (line 552 of pipeline-review-contract).
- For each, decide: rewrite to assert the new contract, or delete because the underlying mechanism is gone.
  - Option B label asserts → keep, with updated label text if the label changes.
  - `bulk-preview.md` reference under option B → remove; assert that bulk-preview is referenced by option C only.
  - Stage 5b conditional table parsing → keep but update expected rows.
  - `(B) ... first run Stage 5b validation` → delete and replace with assert that option B does NOT mention Stage 5b.
  - Walkthrough `LFG the rest` shape → update to assert the new no-preview path.
- Add new assertions for the post-run failure-handling question (presence of the stem and three options in SKILL.md).
- Add assertions that `references/bulk-preview.md` is scoped to option C only after narrowing.
- Update fixtures if any sample finding sets or expected reports are pinned to the old flow.

**Patterns to follow:** The existing assertion style in `review-skill-contract.test.ts` — file content reads, regex matchers for structural elements, named tests describing the contract.

**Test scenarios:**
- *Happy path:* Updated tests pass against the modified SKILL.md, walkthrough.md, and bulk-preview.md.
- *Regression check:* Tests for option C, autofix, headless, and walk-through option A continue to pass without modification (only LFG-specific tests change).
- *Integration:* `bun test` passes on the full suite.

**Verification:** Run `bun test tests/review-skill-contract.test.ts tests/pipeline-review-contract.test.ts` and confirm the updated suite passes. Run the full `bun test` suite to confirm no incidental breakage.

---

## System-Wide Impact

- **Interaction graph:** The LFG path's dispatch shape changes. Callers that introspect SKILL.md option B handler text (the `lfg` skill, `slfg` orchestrator) may have assertions to update. Per `tests/review-skill-contract.test.ts` line 562-563, `lfg` references `tracker-defer.md` directly and explicitly does NOT reference `ce-code-review/references/bulk-preview.md` — so the bulk-preview narrowing should not break `lfg`. Verify during U6.
- **Error propagation:** New `failed` bucket from the fixer becomes the trigger for the post-run question. Failures during the new question's tracker-defer dispatch (when the user picks "File tickets") follow the existing Interactive failure path in `tracker-defer.md` (Retry / Fall back / Convert to Skip).
- **State lifecycle risks:** The fixer applies edits without preview gating. On uncommitted local edits the user can revert via `git diff`; on PR-mode runs (where fixes accumulate locally on the PR branch), the same revert applies until the user pushes. No new persistent state.
- **API surface parity:** Other interactive-mode options (A walk-through, C file-tickets, D report-only) are unchanged in dispatch behavior. The bulk-preview reference remains valid for option C. Tracker-defer remains valid for both option C and the new post-run question.
- **Integration coverage:** Tests covering the heterogeneous fixer queue, the post-run question gating on `failed` non-empty, and sink-availability behavior on the post-run question are net-new and need real coverage in U6.
- **Unchanged invariants:** The 5-anchor confidence rubric, Stage 5 dedup/cross-reviewer-promotion/mode-aware demotion, the protected-artifact rules, the safe_auto auto-apply pre-pass before the routing question, autofix and headless mode behavior, report-only mode behavior, and Step 5 push/PR options are all unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Persona-side strengthening (U1) overshoots and personas start proposing weak fixes that the fixer applies. | Keep the false-positive catalog unchanged — it's the suppression backstop. The fixer's intent re-check (U4) is a second backstop. Calibrate prompt wording with real review runs after rollout. |
| Heterogeneous fixer queue (U4) has subtle ordering issues — applying one fix invalidates another's cited line. | The fixer's "evidence no longer matches code" check (U4) routes invalidated items to `failed` rather than mis-applying. Single-pass execution avoids re-cascading edits. Order findings by file + line descending (already today's behavior) so earlier fixes do not shift line numbers for later ones in the same file. |
| Test churn from removing Stage 5b on LFG creates incidental breakage in `lfg`/`slfg` callers. | U6 explicitly verifies `lfg` skill content is unchanged and that pipeline-review-contract tests are updated alongside. The `lfg` skill already uses `tracker-defer.md` directly per existing tests. |
| Without preview, a wrong fix lands silently and the user does not notice during a busy review. | The unified completion report enumerates every applied fix with file:line. The diff is the audit surface. The user is expected to skim the report and `git diff` after LFG. This is the explicit trade the user is making. |
| Walk-through `LFG the rest` users lose the "I changed my mind" Cancel path that bulk-preview offered. | Stop-the-loop semantics still exist — the user can interrupt the agent. The Cancel path was a soft escape that only fired in a narrow window. If user feedback shows the loss matters, a future iteration can add a one-line confirmation before LFG-the-rest dispatches. Open question carried in "Deferred to Implementation." |

---

## Documentation / Operational Notes

- Update `plugins/compound-engineering/README.md` only if a user-visible feature description references the bulk-preview gate or the Stage 5b behavior under LFG. Most plugin README content is at the agent/skill-name level and is unaffected.
- No release-version bumps in this plan — release-please owns versioning. Per `plugins/compound-engineering/AGENTS.md`, do not hand-edit `.claude-plugin/plugin.json` or marketplace files.
- Run `bun run release:validate` after implementation to confirm no parity drift across Claude/Cursor/Codex manifests.
- Capture a `docs/solutions/skill-design/` entry post-merge if this fix surfaces a learning about persona-side-vs-synthesis-side responsibility for fix-shape commitment. Likely worth documenting as it shaped the architectural choice for U1.

---

## Sources & References

- Origin context: this conversation's exchange between user and agent on 2026-04-25 covering the LFG defer-bias diagnosis and the "just go, summarize, ask about leftovers" redesign.
- Prior plan: `docs/plans/2026-04-21-002-refactor-ce-code-review-precision-and-validation-plan.md` (introduced Stage 5b).
- Prior plan: `docs/plans/2026-04-17-002-feat-ce-review-interactive-judgment-plan.md` (introduced the routing question, walk-through, and bulk-preview).
- Skill files: `plugins/compound-engineering/skills/ce-code-review/SKILL.md`, `references/walkthrough.md`, `references/bulk-preview.md`, `references/subagent-template.md`, `references/findings-schema.json`, `references/tracker-defer.md`.
- Test files: `tests/review-skill-contract.test.ts`, `tests/pipeline-review-contract.test.ts`.
