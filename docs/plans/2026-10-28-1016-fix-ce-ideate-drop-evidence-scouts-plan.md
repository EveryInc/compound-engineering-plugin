---
title: Drop ce-ideate Evidence Scouts - Plan
type: fix
date: 2026-10-28
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Drop ce-ideate Evidence Scouts - Plan

## Goal Capsule

- **Objective:** A repo-mode `ce-ideate` run costs about half the tokens and three to five fewer subagents, and its ideas stay as well grounded, with `direct:` bases a reader can open at the cited line.
- **Means:** Remove the Phase 1.5 per-axis evidence scouts (KTD1) and require each `direct:` basis to cite a `path:line` the ideation agent read itself (KTD2).
- **Authority:** The session-settled KTDs below, then the Requirements, then the Implementation Units.
- **Stop conditions:** Stop and report if removing the scouts breaks a contract another phase depends on that the units below do not cover.
- **Execution profile:** Skill-prose edits plus one test file; validated mechanically, with the behavioral eval already run (see Sources).
- **Finishes and ships:** `lfg` in this session.

## Product Contract

### Summary

Phase 1.5 keeps its axis decomposition but dispatches nothing. Phase 2 ideation agents ground their `direct:` bases in lines they read themselves and cite as `path:line`. Every remaining description of scouts and axis dossiers in the skill, its guide, and the glossary goes away or is corrected.

### Problem Frame

Phase 1.5 sends one extraction-tier scout per axis (up to 5) to write a dossier of quotes before ideation starts. A blind-graded A/B eval found the dossiers do not improve idea quality: grounding correctness, specificity, survivor count, and axis coverage matched with and without them. They cost about 2 to 2.6 times the tokens, 3 to 5 more subagents, and 100 to 220 seconds of wall time per run. The one thing they did buy was line-precise citations on Claude and Grok: without dossiers, those generators skipped their verification reads and cited files without line numbers. A one-sentence citation rule restored that precision at no scout cost.

### Requirements

**Dispatch**
- R1. A repo-mode run dispatches no per-axis evidence scouts on any path: default, tactical, `go deep`, or issue-tracker.
- R2. Phase 1.5 still produces the axis list (or the skip reason) under `Topic axes`, and Phase 2 and the axis-coverage check still consume it.
- R3. User-supplied research distillers and their dossiers are unchanged.

**Citation**
- R4. A `direct:` basis quotes a line the ideation agent read itself in this run and cites it as `path:line`; the grounding summary is not a citable source.

**Consistency**
- R5. No skill file, guide, glossary entry, or cost line still describes axis scouts or axis dossiers as part of a run.

### Key Decisions

- **Remove scouts from every path rather than keep them under `go deep`.** (session-settled: user-approved — chosen over keeping scouts, or keeping them only under `go deep`: 48 blind-graded runs showed no quality difference at roughly double the cost.) Governs R1.
- **Keep user-supplied research distillers.** (session-settled: user-approved — chosen over removing them too: only the per-axis scouts were evaluated.) Governs R3.

### Scope Boundaries

- Not changing the verification read budgets (5, 10 under `go deep`, 2-3 under tactical), the fleet, the frames, or the basis verifier's job.
- Not acting on the eval's inside-variance signals (slightly fewer tactical survivors; 2 of 6 runs leaving one axis uncovered, both recorded as the skill requires). They are noted in the PR, not fixed here.
- Not renaming the extraction tier; it stays defined for any retrieval work.

### Sources

- Eval artifacts: `/tmp/ideate-scout-eval/grade/unblinded.json`, `/tmp/ideate-scout-eval/grade2/unblinded.json`, `/tmp/ideate-scout-eval/usage.json`, `/tmp/ideate-scout-eval/usage2.json` (local, cited in the PR body).
- Scouts were introduced by PR #924, whose eval checked only mechanics.

## Planning Contract

### Key Technical Decisions

- KTD1. **Delete the scout dispatch block and every dependent rule; do not leave a disabled stub.** The tactical "axis and scout caps stay equal" rule and its test exist only because scouts dispatch one per axis, so both go. (session-settled: user-approved — chosen over keeping scouts only under `go deep`: no measured quality benefit on any path.) Governs R1, R5.
- KTD2. **Replace the `direct:` sentence in `divergent-ideation.md`'s verification-reads paragraph with the evaluated wording, verbatim:** "A `direct:` basis must quote a line the agent read itself in this run and cite it as `path:line`, never a guessed citation. The grounding summary orients the agent but is not a citable source: when an idea's evidence comes only from the summary, spend a verification read on the line before citing it." (session-settled: user-approved — chosen over dropping scouts with no replacement rule: without it, at-line citation share fell to 0.33-0.54 (per-artifact mean; Claude default scope and Grok tactical) on Claude and Grok; with it, 0.94-0.99.) Governs R4.
- KTD3. **Verification reads follow `file:line` pointers from the grounding summary instead of dossier pointers.** The grounding payload keeps user-research dossier paths when present. Governs R3, R4.

## Implementation Units

### U1. Remove the scout dispatch and its dependents from the skill

- **Goal:** No part of `ce-ideate` dispatches, sizes, budgets, or passes axis scouts or their dossiers.
- **Requirements:** R1, R2, R3, R5; KTD1, KTD3.
- **Dependencies:** none.
- **Files:**
  - `skills/ce-ideate/SKILL.md`
  - `skills/ce-ideate/references/decomposition.md`
  - `skills/ce-ideate/references/divergent-ideation.md`
  - `skills/ce-ideate/references/scope-gates.md`
  - `skills/ce-ideate/references/grounding.md`
  - `skills/ce-ideate/references/post-ideation-workflow.md`
  - `skills/ce-ideate/references/user-research-artifacts.md`
- **Approach:**
  1. `decomposition.md`: delete the evidence-scout paragraph, its quoted prompt, and the gist-appending paragraph; state that the axis pass dispatches nothing; drop "the evidence-scout dispatch" from the file's opening line.
  2. `SKILL.md`: drop "Evidence scouts are repo-mode only." from Phase 1.5.
  3. `divergent-ideation.md`: the read-order line no longer mentions scouts; the evidence-driven fleet bullet no longer credits dossiers; the `<grounding>` payload names only user-research dossier paths (KTD3); verification reads follow grounding pointers (KTD3).
  4. `scope-gates.md`: tactical's dials drop "and 3 evidence scouts"; delete the "axis and scout caps stay equal" bullet.
  5. `grounding.md`: the extraction tier stops naming evidence scouts as its example.
  6. `post-ideation-workflow.md`: the verifier payload carries user-research dossier paths only; the scratch-directory contents list drops "the evidence dossiers".
  7. `user-research-artifacts.md`: drop the "As with axis dossiers," lead-in and keep the rule that the main session does not read the dossier.
- **Patterns to follow:** the repo-local `ce-skill-work` edit mode; state conditions, keep `SKILL.md` under the 8,000-byte budget.
- **Test scenarios:** covered by U3.
- **Verification:** `grep -rni "scout" skills/ce-ideate` and `grep -rni "axis dossier" skills/ce-ideate` return nothing; "dossier" appears only for user-supplied research.

### U2. Add the read-and-cite rule

- **Goal:** Ideation agents cite lines they read, with `path:line`.
- **Requirements:** R4; KTD2.
- **Dependencies:** U1 (same paragraph).
- **Files:** `skills/ce-ideate/references/divergent-ideation.md`
- **Approach:** Replace the existing `direct:` sentence in the verification-reads paragraph with the KTD2 wording.
- **Test scenarios:** covered by U3.
- **Verification:** the KTD2 sentence is present verbatim; the old "in a dossier or in the repo" sentence is gone.

### U3. Update the contract tests

- **Goal:** The test suite pins the new contract and no longer pins scouts.
- **Requirements:** R1, R4, R5.
- **Dependencies:** U1, U2.
- **Files:** `tests/skills/ce-ideate-dispatch-contracts.test.ts`
- **Approach:**
  1. Delete the "axis and scout caps are equal" test, keeping any still-valid assertion that the tactical axis cap (3) appears in both Phase 0.5 and Phase 1.5.
  2. Re-anchor the surprise-me local-hook check for Phase 1.5 to an end marker that still exists.
  3. Add one assertion that `divergent-ideation.md` requires a `direct:` basis to cite `path:line` from a line the agent read itself.
- **Test scenarios:**
  - The tactical axis cap still reads 3 in both Phase 0.5 and Phase 1.5.
  - Phase 1.5 still carries its local surprise-me hook.
  - `divergent-ideation.md` states the read-and-cite rule.
  - No `ce-ideate` skill file mentions evidence scouts.
- **Verification:** `bun test tests/skills/ce-ideate-dispatch-contracts.test.ts` passes.

### U4. Update the guide and glossary

- **Goal:** User-facing docs describe the run as it now works.
- **Requirements:** R5.
- **Dependencies:** U1.
- **Files:** `docs/guides/ce-ideate.md`, `CONCEPTS.md`
- **Approach:**
  1. `docs/guides/ce-ideate.md`: drop the scout sentence from "Grounding before any idea is generated" and the scouts clause from the worked example; say that ideation agents verify and cite lines themselves.
  2. `CONCEPTS.md` "Evidence dossier": keep the entry (ce-brainstorm and research distillers still produce dossiers) and check that its wording does not imply ce-ideate axis scouts.
- **Test expectation:** none -- documentation only; `release:validate` covers inventory.
- **Verification:** the guide no longer mentions scouts.

## Verification Contract

| Check | Command | Applies |
|---|---|---|
| Skill guards and byte budget | `bun run test:skill-guards` | U1-U3 |
| Contract tests | `bun test tests/skills/ce-ideate-dispatch-contracts.test.ts` | U3 |
| Full suite | `bun run test` | all |
| Release metadata | `bun run release:validate` | all |
| Behavioral eval | Already run: arms A/B/C, Claude, Codex, Grok, 48 blind-graded runs | R1, R4 |

## Definition of Done

- U1-U4 complete; no scout or axis-dossier reference remains in `skills/ce-ideate`, its guide, or the cost line.
- The KTD2 sentence is present verbatim.
- All checks in the Verification Contract pass.
- No eval-arm commits or experimental edits are in the diff.
