---
title: "ce-explain check-in lives in the artifact - Plan"
type: fix
date: 2026-09-04
origin: "https://github.com/EveryInc/compound-engineering-plugin/issues/1628"
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# ce-explain check-in lives in the artifact - Plan

## Goal Capsule

- **Objective:** A `ce-explain` run never leaves the user waiting on a quiz choice or a quiz answer, and the explainer they get back still carries a self-check they can do on their own time.
- **Means:** Remove the Phase 3 offer and the Phase 5 exercise loop; render the check-in as a static `Check yourself` section at the end of the artifact (KTD1).
- **Authority:** Issue #1628 and the invoking user's directive outrank the skill's original design note that the check-in is never headless. Session-settled Key Decisions outrank inferred polish.
- **Execution profile:** Two units, one PR. Invoke `ce-skill-work` before editing any file under `skills/ce-explain/`. Contract tests change in the same commit as the prose they pin.
- **Stop conditions:** Stop and surface if the in-artifact section cannot satisfy the display-only invariant (no forms, scripts, click handlers, or collapsing widgets) on either rendering. Do not widen into a library or spaced-repetition feature, and do not change the destination or publishing flow's behavior.
- **Tail ownership:** The invoking pipeline (`lfg`) owns simplify, review, commit, PR, and CI.

## Product Contract

### Summary

`ce-explain` stops asking "Just the explainer / Quiz me", stops running the prediction turn and the exercise loop in chat, and instead ends the explainer with a `Check yourself` section (questions first, then their answers) when the request asks for one or the material warrants it. Classify, ground, and the destination ask are unchanged; compose gains the check-in decision and the section.

Product Contract preservation: N/A (bootstrap).

### Problem Frame

On Codex, the reporter returned to a `ce-explain` session and found it blocked on the Phase 3 offer, waiting for "Just the explainer" or "Quiz me". The check-in is built from blocking turns: an offer, a prediction turn that ends the message, and exercises answered one at a time in chat. Each is a place the run silently waits for a user who has switched away.

### Requirements

**Run flow**

- R1. A `ce-explain` run asks no question about the check-in: no offer, no prediction turn, no exercise posed in chat. The remaining blocking asks are the ones the skill already has for other reasons: the bare-invocation "What should I explain?", the empty-range and empty-window confirmations, and the destination and consent asks.
- R2. When the request asks for a check-in, or the material warrants one under the warrant test in `skills/ce-explain/references/check-in.md` and the request does not decline it, the artifact ends with a `Check yourself` section: two to four questions listed first, then their answers under an `Answers` label in the same order.
- R3. Diff mode carries the same section and the same chat presentation (inline summary plus the file path) as every other input shape.
- R4. The section is static in both renderings: no forms, scripts, click handlers, or collapsing widgets. Answers are visible text placed after all the questions.

**Docs and guards**

- R5. `docs/guides/ce-explain.md`, the catalog row in `docs/guides/README.md`, and the `### Check-in` entry in `CONCEPTS.md` describe the in-document check-in and no longer describe an opt-in offer, an in-chat quiz, or a predict-then-reveal turn.
- R6. Contract tests pin the new shape: a corpus-wide negative pin that no file under `skills/ce-explain/` contains `Quiz me` or `Just the explainer`; the `Check yourself` heading and `Answers` label named in `check-in.md`; the compose phase's non-blocking sentence in `SKILL.md`; both rendering references citing `check-in.md` from their display-only invariant with the interactive-quiz wording updated in each.

### Key Decisions

- KD1. No blocking check-in turn anywhere in the run. (session-settled: user-directed — chosen over the issue's proposal to deliver the explainer first and ask about a quiz afterwards: a later ask still leaves the run waiting when the user switches away.) Governs R1.
- KD2. The check-in moves into the artifact as a static section with answers. (session-settled: user-directed — chosen over dropping the check-in entirely: the questions keep active recall available without a turn boundary.) Governs R2, R4.

### Scope Boundaries

- In: `skills/ce-explain/SKILL.md` and its references, including phase-pointer corrections in `destinations.md`; the two guide pages and the `CONCEPTS.md` entry; the contract tests that pin the changed lines.
- Out: the destination and publishing flow's behavior (a phase-pointer correction in `destinations.md` is not a behavior change); the `ce-explain` frontmatter description; a library or spaced-repetition feature; other skills' `ce-explain` handoffs, which name the invocation only.
- Deferred to Follow-Up Work: untouched `SKILL.md` blocks that predate the authoring standard stay as they are — the Phase 2 recap paragraph, and the destination paragraph's body (its heading renumbers to Phase 4).

### Sources

- Issue #1628: screenshot of the blocked Phase 3 offer on Codex, plugin 3.24.0.
- `skills/ce-explain/SKILL.md`: the Done line, Phase 3, Phase 5, the compose phase's "inline summary plus the file path", and the Boundaries bullet "The check-in is never headless".
- `skills/ce-explain/references/check-in.md`; `references/explainer-html.md` and `references/explainer-markdown.md` display-only invariants and "Load at compose time (Phase 4)" cues; `references/orchestration.md` ceiling tier, "Phase 6's menu" pointer, and diff-mode "Phase 3 ordering rule" sentence; `references/destinations.md` "Everything Phase 6 does".
- `docs/guides/ce-explain.md` lines "optionally take the quiz", "No scripts, forms, or embedded quiz.", "### The check-in lives in the session", and "there is no quiz offer"; the `docs/guides/README.md` catalog row "Optional opt-in check-in."; the `CONCEPTS.md` `### Check-in` entry ("can follow an explainer in the same session").
- `tests/skills/ce-explain-routing.test.ts`: the offer pins, the "predict-then-reveal ordering rule is inline" test, the predict-then-reveal parity block, the phase-slice anchors, and the HTML display-only regex. `tests/skills/ce-explain-relocated-invariants.test.ts`: the corpus walk over `skills/ce-explain/` (greps `Ceiling tier`). `tests/codex-skill-prompt-budget.test.ts`: the `OVER_BUDGET` ratchet that lists `ce-explain`.
- Provenance: the check-in loop and the never-headless boundary landed with the skill in #1058; the two-choice offer wording in #1195; the inline predict-then-reveal copy in #1057 and #1469. None records a bug the interactive shape fixed. The intent they protect, that the reader produces an answer before reading one, survives as the questions-before-answers layout.

## Planning Contract

### Key Technical Decisions

- KTD1. Fold the check-in decision into the compose phase. `SKILL.md` loses Phase 3 (check-in gate) and Phase 5 (exercises); compose becomes Phase 3 and the destination ask becomes Phase 4. The compose phase requires the `check-in.md` read, states the section decision, and states that the run never blocks on the check-in — the one stop class the body must carry without a read; the Boundaries bullet restates the same invariant. `check-in.md` owns the section's warrant test, shape, and placement, and both rendering references cite it from their display-only bullet. (session-settled: user-directed — instantiates KD1 and KD2.) Governs R1, R2, R4.
- KTD2. Include the section when the request asks for it, or when the material warrants it under the kept warrant test and the request does not decline it; the request wins in both directions. The reader no longer changes the decision: a rendering for another reader gets the same warrant test, because the section now exercises whoever reads the document rather than the invoker in chat. Governs R2.
- KTD3. Diff mode gets no special presentation: no predict-first prompt in the artifact and no subject-and-path-only chat rule. The compose phase keeps its inline summary plus file path on every run, and the diff-mode "gather silently until the ordering rule is satisfied" sentence goes from both `SKILL.md` Phase 2 and `orchestration.md`; the empty-range rule stays. Chosen over keeping a predict-first line with a path-only chat presentation: the line is skippable by scrolling, while the chat summary is the only explainer content a Codex user sees without opening the file. Governs R3.
- KTD4. References name phases by role, not number: `explainer-html.md` and `explainer-markdown.md` say "at compose time"; `orchestration.md` and `destinations.md` say "the destination phase". A later renumbering then cannot strand a pointer. Follows from KTD1's renumbering.
- KTD5. Tests change in the same commit as the prose. In `tests/skills/ce-explain-routing.test.ts`: remove the offer pins, the "predict-then-reveal ordering rule is inline" test, and the predict-then-reveal parity block; re-anchor the phase slices (compose is `### Phase 3` to `### Phase 4`, destination is `### Phase 4` to end of file); update the HTML display-only regex; add pins for the `Check yourself` heading and `Answers` label in `check-in.md`, the compose-phase non-blocking sentence, both display-only bullets citing `check-in.md`, and the markdown bullet no longer matching `No exercise or quiz content in the artifact`. In `tests/skills/ce-explain-relocated-invariants.test.ts`: add the corpus-wide negative pin for `Quiz me` and `Just the explainer`; keep `Ceiling tier` greppable. Remove `ce-explain` from `OVER_BUDGET` in `tests/codex-skill-prompt-budget.test.ts` only if its CRLF-adjusted size lands at or under 8000 bytes. Governs R6.

### Assumptions

- When the request is silent, the warrant test decides; the directive did not say "always", and quiz items in every routine recap would be padding. Unvalidated.
- `ce-explain` stays in `OVER_BUDGET`: removing Phase 3 and Phase 5 lands the body near 9.2 KB, so Codex still truncates the tail. The compose phase sits before the 8000-byte cut, so its non-blocking sentence is the copy Codex reads; the Boundaries restatement falls past the cut.
- The Claude and Codex CLIs are not available in the implementing environment, so the behavioral eval is recorded as skipped with that reason and the contract tests carry the mechanical guard.

### Patterns to Follow

- The `sliceSection` anchors and the smallest-falsifiable-unit pins already in `tests/skills/ce-explain-routing.test.ts`; the corpus walk in `tests/skills/ce-explain-relocated-invariants.test.ts`.
- The body/reference split from `docs/solutions/skill-design/post-menu-routing-belongs-inline.md`: the body keeps the condition that must fire without a read; the reference owns the shape.

## Implementation Units

### U1. Move the check-in into the artifact

- **Goal:** `ce-explain` never asks about or runs a quiz in chat; the artifact ends with `Check yourself` when the request or the material calls for it; the contract tests pin that shape.
- **Requirements:** R1, R2, R3, R4, R6; KTD1, KTD2, KTD3, KTD4, KTD5.
- **Dependencies:** none
- **Files:**
  - `skills/ce-explain/SKILL.md`
  - `skills/ce-explain/references/check-in.md`
  - `skills/ce-explain/references/explainer-html.md`
  - `skills/ce-explain/references/explainer-markdown.md`
  - `skills/ce-explain/references/orchestration.md`
  - `skills/ce-explain/references/destinations.md`
  - `tests/skills/ce-explain-routing.test.ts`
  - `tests/skills/ce-explain-relocated-invariants.test.ts`
  - `tests/codex-skill-prompt-budget.test.ts`
- **Approach:**
  1. Invoke `ce-skill-work` in edit mode before touching the skill files.
  2. `SKILL.md`: rewrite the Done line without the accepted-check-in clause; remove Phase 3 and Phase 5; renumber compose to Phase 3 and the destination heading to Phase 4; in the compose phase, require the `check-in.md` read, state the section decision, state that the run never blocks on the check-in, and keep "inline summary plus the file path"; restate the Boundaries bullet to the same non-blocking invariant; in Phase 2 diff mode, drop the gather-silently sentence and keep the empty-range rule (KTD3).
  3. `check-in.md`: restate as the owner of the in-artifact section — the warrant test with the request winning in both directions and no another-reader skip (KTD2); the `Check yourself` heading placed last (after the explanation, before the HTML footer); two to four questions, then `Answers` in the same order; the question kinds (apply, explain-back, boundary, recap recall, and for a diff what the change does and why); the static-only rule.
  4. `explainer-html.md`: the display-only bullet reads `No forms, no click handlers, no interactive quizzes, no "submit" affordances, no scripts.` and names the static `Check yourself` section per `references/check-in.md`; the load-time cue drops the phase number. `explainer-markdown.md`: the display-only bullet replaces "No exercise or quiz content in the artifact; the check-in lives in the session." with the same static-section statement citing `references/check-in.md`; the load-time cue drops the phase number.
  5. `orchestration.md`: the ceiling-tier line names composition and the section (keep the `Ceiling tier` token); the `destinations.md` pointer says "the destination phase"; the diff-mode grounding paragraph drops the gather-silently sentence. `destinations.md`: the two "Phase 6" mentions become "the destination phase" — a pointer-only edit.
  6. Tests per KTD5.
- **Patterns to follow:** existing pins and `sliceSection` helper in `tests/skills/ce-explain-routing.test.ts`; the corpus array in `tests/skills/ce-explain-relocated-invariants.test.ts`.
- **Test scenarios:**
  - Corpus-wide: no file under `skills/ce-explain/` contains `Quiz me` or `Just the explainer`.
  - `SKILL.md`: the compose phase (`### Phase 3` to `### Phase 4`) states that the run never blocks on the check-in and keeps "inline summary plus the file path"; the body has no `### Phase 5` or `### Phase 6`; the destination pins slice from `### Phase 4`.
  - `check-in.md` names the `Check yourself` heading, the `Answers` label, the two-to-four count, and the request-wins-both-directions condition; it no longer contains "rendered for another reader, skip".
  - Both rendering references cite `references/check-in.md` in their display-only bullet; the HTML bullet matches `No forms, no click handlers, no interactive quizzes, no "submit" affordances, no scripts`; the markdown bullet no longer matches `No exercise or quiz content in the artifact`; neither says "lives in the session"; neither names a phase number in its load-time cue.
  - `orchestration.md` and `destinations.md` contain no "Phase 6" and no "Phase 3 ordering rule"; `Ceiling tier` is still present in the corpus.
  - The `OVER_BUDGET` ratchet passes: `ce-explain` is listed only if its CRLF-adjusted size is still over 8000 bytes.
- **Verification:** `bun test tests/skills/ce-explain-routing.test.ts tests/skills/ce-explain-relocated-invariants.test.ts tests/codex-skill-prompt-budget.test.ts` is green, and `rg -n "Quiz me|Just the explainer|Phase [56]|Phase 3 ordering" skills/ce-explain` returns nothing.

### U2. Update the user-facing docs

- **Goal:** The guide, the catalog row, and the glossary entry describe the in-document check-in.
- **Requirements:** R5.
- **Dependencies:** U1
- **Files:**
  - `docs/guides/ce-explain.md`
  - `docs/guides/README.md`
  - `CONCEPTS.md`
- **Approach:** In the guide, rewrite the intro sentence about the check-in, the TL;DR "What's next" cell, the "Offline, one file" paragraph ("No scripts, forms, or embedded quiz." becomes no scripts, forms, or interactive quiz), the "The check-in lives in the session" section (rename to "The check-in lives in the document"), the Quick Example sentence "there is no quiz offer" (the section is omitted for routine material), and the two FAQ entries about the quiz. Rewrite the catalog row and the `CONCEPTS.md` `### Check-in` entry to describe an in-artifact `Check yourself` section with visible answers, included when the request asks or the material warrants it.
- **Test expectation:** none -- documentation only; no test pins the catalog row or the glossary entry wording (`tests/release-metadata.test.ts` guards the root README overview, not `docs/guides/README.md`), so the grep below is the check.
- **Verification:** `rg -n -i "Quiz me|Just the explainer|quiz offer|embedded quiz|opt-in check-in|lives in the session|take the quiz|predict-then-reveal|follow an explainer in the same session" docs/guides/ce-explain.md docs/guides/README.md CONCEPTS.md` returns nothing.

## Verification Contract

- Targeted: `bun test tests/skills/ce-explain-routing.test.ts tests/skills/ce-explain-relocated-invariants.test.ts tests/codex-skill-prompt-budget.test.ts tests/release-metadata.test.ts`
- Full suite: `bun run test` (the same suite CI runs)
- `release:validate` is not required unless the skill description changes; this plan does not change it.
- Behavioral eval: `bun run test:skill-eval-pack -- --skill ce-explain --arm ab` on Claude and Codex where those CLIs are available; otherwise record the skip reason in the PR.

## Definition of Done

- R1–R6 hold.
- No file under `skills/ce-explain/` contains `Quiz me` or `Just the explainer`, or instructs offering, accepting, or declining a check-in (a sentence stating that the run never blocks on the check-in is not such an instruction).
- `bun run test` passes.
- The guide, the catalog row, and the `CONCEPTS.md` entry describe the in-document check-in.
- Abandoned-attempt edits are not left in the diff.
