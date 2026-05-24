---
title: "Refactor ce-doc-review confidence scoring to anchored rubric"
type: refactor
status: active
date: 2026-04-21
---

# Refactor ce-doc-review confidence scoring to anchored rubric

## Overview

Replace ce-doc-review's continuous `confidence: 0.0-1.0` field with a 5-anchor rubric (`0 | 25 | 50 | 75 | 100`), each tied to a behavioral definition the persona can honestly self-apply. The change adopts the structural techniques from Anthropic's official code-review plugin (anchored scoring, verbatim rubric in agent prompt, explicit false-positive catalog) while tuning the threshold (`>= 50`) to document-review economics — which have opposite asymmetries from code review (no linter backstop, premise challenges resist verification, surfaced findings are cheap to dismiss via routing menu, missed findings derail downstream implementation).

The goal is to eliminate false-precision gaming (personas anchoring on round numbers like 0.65 / 0.72 / 0.85 and implying differentiation that the model cannot actually produce) and replace it with discrete anchors whose meaning is stable and behaviorally grounded.

## Problem Frame

Current state: `confidence` is a float between 0.0 and 1.0. Synthesis uses per-severity gates (0.50 / 0.60 / 0.65 / 0.75) and a 0.40 FYI floor. LLM-generated confidence at this granularity is not meaningfully calibrated — personas in practice cluster on round numbers (0.60, 0.65, 0.72, 0.80, 0.85), and the gate boundaries create coin-flip bands where trivial score shifts move findings in and out of the actionable tier.

Evidence surfaced in a recent review run:
- One 0.65 adversarial finding sat right at the P2 gate — below-noise admission
- Multiple product-lens findings in the 0.68-0.72 range all shared the same underlying premise ("motivation weak") — fake precision on top of redundant signal
- Residual concerns and deferred questions near-duplicated actionable findings, indicating the persona's internal confidence ordering did not distinguish "above-gate finding" from "below-gate concern" coherently

Anthropic's official code-review plugin (`anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md`) solves this with:
- 5 anchor points (0/25/50/75/100) each tied to a behavioral criterion ("double-checked and verified", "wasn't able to verify", "evidence directly confirms")
- A rubric passed verbatim to a separate scoring agent
- Threshold >= 80 (code-review-specific; doc review uses a different threshold)
- Explicit false-positive catalog

This plan ports the structural techniques and tunes the threshold to document-review economics.

## Requirements Trace

- R1. Replace continuous `confidence` field with 5 discrete anchor points (0, 25, 50, 75, 100) and a behavioral rubric per anchor.
- R2. Update synthesis pipeline to consume anchor values (gates, tiebreaks, dedup, promotion, cross-persona boost, FYI floor).
- R3. Update all 7 document-review persona agents' prompts so the rubric is embedded verbatim.
- R4. Add an explicit false-positive catalog to the subagent template (consolidated from scattered current guidance).
- R5. Adopt doc-review-appropriate filter threshold: >= 50 across severities (drop only "false positive" and "stylistic-unverified" tiers). Replace graduated per-severity gates.
- R6. Preserve current tier routing semantics: 50 -> FYI, 75 -> Decision, 100 -> Proposed fix / safe_auto.
- R7. Update rendering surfaces (template, walkthrough, headless envelope) so anchors display consistently as integer scores, not floats.
- R8. Update tests and fixtures without regressing coverage.
- R9. Keep `ce-code-review` unchanged in this PR — it is a separate migration with different economics (see Scope Boundaries).

## Scope Boundaries

- No change to persona-specific domain logic (what each persona looks for). Only the confidence rubric and synthesis consumption change.
- No change to severity taxonomy (`P0 | P1 | P2 | P3`).
- No change to `finding_type` or `autofix_class` enums.
- No change to `residual_risks` / `deferred_questions` schema shape (they remain string arrays).
- No new schema fields (explicitly rejected `finding_type: grounded | pattern | premise` tag — redundant with persona attribution).

### Deferred to Separate Tasks

- **ce-code-review scoring migration**: Same pattern, but code-review economics differ (linter backstop, PR-comment cost, ground-truth verifiability). Threshold likely `>= 75` there, matching Anthropic more closely. Separate plan once ce-doc-review migration is proven in practice.
- **Separate neutral-scorer agent pass**: A second scoring pass where a neutral agent re-scores each finding against the rubric, independent of the producing persona. Structurally valuable (breaks self-serving score inflation) but adds latency and token cost. Evaluate as a follow-up once the anchor rubric is in place and its effect on score inflation can be measured directly.

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-doc-review/references/findings-schema.json` — confidence field definition (lines 60-65, continuous 0.0-1.0)
- `plugins/compound-engineering/skills/ce-doc-review/references/subagent-template.md` — schema rule (line 27), advisory band rule (line 116), false-positive list (lines 109-114)
- `plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md` — per-severity gate table (lines 15-25), FYI floor (line 28), cross-persona boost (line 45), promotion patterns (section 3.6), sort (section 3.8)
- `plugins/compound-engineering/skills/ce-doc-review/references/review-output-template.md` — confidence column rendering (line 67 and section rules)
- `plugins/compound-engineering/skills/ce-doc-review/references/walkthrough.md` — confidence display in per-finding block
- `plugins/compound-engineering/agents/document-review/*.md` — 7 persona files. Only `ce-coherence-reviewer.agent.md` currently references a specific confidence floor (`0.85+` for safe_auto patterns, line 26); the others rely on the template
- `tests/pipeline-review-contract.test.ts`, `tests/review-skill-contract.test.ts`, `tests/fixtures/ce-doc-review/seeded-*.md` — test fixtures with embedded confidence values

### Institutional Learnings

No prior `docs/solutions/` entry on scoring calibration. This plan should produce one on completion (under `docs/solutions/workflow/` or `docs/solutions/skill-design/`) documenting the migration and the reasoning behind the doc-review threshold vs Anthropic's code-review threshold, since the tradeoff is non-obvious and future contributors may question the divergence.

### External References

- `anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md` — canonical anchored-rubric pattern. The rubric text and filter approach are the structural model; the threshold is not ported directly (see Key Technical Decisions).
- Calibration research context: LLM verbal-confidence studies show coarse anchor scales outperform continuous numeric scales because continuous scales invite false precision the model cannot produce. This is why Anthropic chose 5 anchors rather than 0-100 continuous.

## Key Technical Decisions

- **5 anchors, not 3 or 10**: Matches Anthropic's proven format. More resolution than Low/Medium/High, still discrete enough to avoid gaming. The anchor values (0/25/50/75/100) are literal integer scores, preserved as integers in the schema.
- **Filter threshold `>= 50`, not `>= 80`**: Doc review has opposite economics from code review. The threshold drops only tier 0 ("false positive, pre-existing, or can't survive light scrutiny") and tier 25 ("might be real but couldn't verify; stylistic-not-in-origin"). Tiers 50+ surface with appropriate routing. Rationale documented inline in the rubric so future contributors see why doc review diverges from Anthropic's `>= 80`.
- **No separate scoring agent (this PR)**: Self-scoring with a rigorous rubric is the first step. Adding a neutral scorer is a follow-up once we can measure whether self-scoring with anchors still inflates scores relative to ground truth.
- **Anchor-to-tier mapping**: 50 -> FYI subsection, 75 -> Decision / Proposed fix, 100 -> eligible for safe_auto when `autofix_class` also warrants. Tier 25 -> dropped. Tier 0 -> dropped. This replaces both the graduated per-severity gate AND the FYI floor with a single anchor-based routing.
- **Cross-persona corroboration promotes by one anchor, not `+0.10`**: When 2+ personas raise the same finding, promote one anchor step (50 -> 75, 75 -> 100). Cleaner than the magic `+0.10` and semantically meaningful (independent corroboration genuinely moves a "verified but nitpick" finding to "very likely, will hit in practice").
- **Tiebreak ordering**: When sorting findings within a severity tier, use anchor descending, then document order (deterministic). Drop the pseudo-precision tiebreak that currently uses float confidence.
- **Preserve reviewer attribution as the persona-calibration signal**: No `finding_type: grounded | pattern | premise` tag. If a persona's domain caps its natural ceiling at 50-75, the anchors and threshold handle it — findings land in FYI or Decision as appropriate. The reviewer name in the output already tells the user which persona raised it; they can apply their own mental model.
- **Strawman rule stays; advisory band rule absorbed into the rubric**: The advisory-band guidance currently lives as a "0.40-0.59 LOW" instruction. Under the new rubric, "advisory observations" map cleanly to tier 25 or 50 depending on verifiability. Rewrite the advisory rule to refer to anchors, not a float range.

## Open Questions

### Resolved During Planning

- **Port ce-code-review in the same PR?** No. Different economics require a different threshold; bundling conflates the migration with the threshold tuning. Do ce-doc-review first, observe, then plan ce-code-review.
- **Keep numeric anchors or use semantic labels (weak / plausible / verified / certain)?** Keep numeric. Matches Anthropic, preserves ordinality for synthesis comparisons, keeps the rendering compact (`Tier: 75` vs `Tier: verified-strong`).
- **Add a `finding_type: grounded | pattern | premise` dimension?** No. Redundant with persona attribution and adds decoding overhead without changing what the user does with the finding.
- **Single threshold or severity-graduated?** Single `>= 50` across severities. Severity already sorts the list; an additional gate gradient adds complexity without differentiating signal.

### Deferred to Implementation

- **Exact rubric wording for each anchor.** The implementation pass writes the final text; this plan captures the behavioral criteria. The wording must be concrete enough that a persona can self-apply it without inventing interpretation — "double-checked against evidence" is concrete; "highly confident" is not.
- **Whether any persona needs a persona-specific floor override.** Coherence currently cites `0.85+` as its safe_auto threshold. Under the new scale, "safe_auto" maps to anchor 100 (evidence directly confirms) — no separate floor needed. If any other persona has equivalent persona-specific guidance during implementation, decide per-persona whether to preserve or remove.
- **Fixture value choices.** The seeded plan fixtures carry specific confidence values. Converting `0.85` -> `75` vs `100` is a per-fixture judgment call; the implementer decides based on what the fixture is demonstrating.

## Implementation Units

- [ ] **Unit 1: Update schema and rubric authority file**

**Goal:** Replace the `confidence` field definition with an integer enum and write the canonical behavioral rubric in one place.

**Requirements:** R1

**Dependencies:** None (this unit establishes the contract everything else consumes)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-doc-review/references/findings-schema.json`
- Test: `tests/frontmatter.test.ts` (schema-shape test if one exists; otherwise covered by contract tests in later units)

**Approach:**
- Replace `confidence: { type: "number", minimum: 0.0, maximum: 1.0 }` with `confidence: { type: "integer", enum: [0, 25, 50, 75, 100] }`
- Embed the rubric in the `description` field as a multi-line string so agents consuming the schema see it inline. Each anchor point gets a behavioral criterion (see "Patterns to follow" below)
- Keep `"calibrated per persona"` language gone — the rubric is shared, not per-persona

**Patterns to follow:**
- Anthropic's verbatim rubric from `anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md` step 5. Adapt the criteria to document-review context: replace "PR bug" framing with "document issue" framing; replace "directly impacts code functionality" with "directly impacts plan correctness or implementer understanding"; preserve the "double-checked" / "wasn't able to verify" / "evidence directly confirms" behavioral anchors verbatim where they apply

**Test scenarios:**
- Happy path: A JSON finding with `confidence: 75` validates against the schema
- Error path: A JSON finding with `confidence: 0.72` fails validation (continuous values rejected)
- Error path: A JSON finding with `confidence: 10` fails validation (non-anchor integer rejected)
- Edge case: `confidence: 0` validates (false-positive anchor is a legitimate value, not a validation failure — surface-then-drop happens in synthesis)

**Verification:**
- `bun test tests/frontmatter.test.ts` passes
- Manually running the schema validator against a fixture finding with `confidence: 0.85` produces a clear error message

- [ ] **Unit 2: Rewrite rubric guidance in the subagent template**

**Goal:** Update the shared template that all 7 personas include, so the rubric, false-positive catalog, and advisory rule all reference the new anchors.

**Requirements:** R3, R4

**Dependencies:** Unit 1 (schema is the contract this template communicates)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-doc-review/references/subagent-template.md`

**Approach:**
- Replace line 27's `confidence: a number between 0.0 and 1.0 inclusive` with the anchor definition plus the full behavioral rubric (5 bullets, one per anchor). The rubric goes in the template verbatim — this is what every persona sees when the template renders
- Rewrite the advisory-band rule (line 116) to refer to anchor 25 or anchor 50 instead of "0.40-0.59 LOW band"
- Consolidate the false-positive catalog (currently lines 109-114, scattered) into a single bulleted list positioned adjacent to the rubric. Add explicit false-positive categories adapted from Anthropic's code-review list: "Issues already resolved elsewhere in the document", "Content inside prior-round Deferred / Open Questions sections", "Stylistic preferences without evidence of impact", "Pre-existing issues the document didn't introduce", "Issues that belong to other personas", "Speculative future-work concerns with no current signal"
- Update the suppress-below-floor rule (line 53) from "your stated confidence floor" to "anchor tier 50 (the actionable floor) unless your persona sets a stricter floor"
- Update the example finding (lines 33-48) to use `confidence: 100` instead of `0.92`, with a one-line inline note explaining why ("all three conditions met: double-checked, will hit in practice, evidence directly confirms")

**Patterns to follow:**
- Structure of the existing autofix_class section (lines 60-63) — three tiers with a one-sentence behavioral definition each. Mirror this format for the confidence anchors

**Test scenarios:**
- Test expectation: none — this is a prompt-content file. Behavioral changes are tested via the persona output-shape tests in Unit 6

**Verification:**
- Rubric text is present verbatim in the template
- No references to float confidence values (0.0-1.0) remain anywhere in the file
- False-positive catalog appears as a single consolidated list, not scattered sentences

- [ ] **Unit 3: Update synthesis pipeline to consume anchor values**

**Goal:** Replace every numeric-confidence comparison in the synthesis pipeline with anchor-based logic.

**Requirements:** R2, R5, R6

**Dependencies:** Unit 1

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md`

**Approach:**
- **Section 3.2 (Confidence Gate):** Replace the per-severity gate table with a single rule: findings with `confidence: 0` or `confidence: 25` are dropped; findings with `confidence: 50` route to FYI; findings with `confidence: 75` or `100` enter the actionable tier and are classified by autofix_class. Delete the separate "FYI floor at 0.40" concept — it is now the `confidence: 50` anchor
- **Section 3.3 (Deduplicate):** Replace "keep the highest confidence" tiebreak with "keep the highest anchor; if tied, keep the first by document order"
- **Section 3.3b (Same-persona redundancy, added in prior session):** Update the kept-finding selection rule to use anchor ordering
- **Section 3.4 (Cross-persona boost):** Replace `+0.10` boost with "promote by one anchor step (50 -> 75, 75 -> 100). Anchor 100 does not promote further. Record the promotion in the Reviewer column (e.g., `coherence, feasibility (+1 anchor)`)"
- **Section 3.5b (Tiebreak):** Update the `suggested_fix present` default-to-Apply gate to reference the anchor ordering for tiebreaks
- **Section 3.6 (Promote):** The "promote manual to safe_auto/gated_auto" logic is orthogonal to confidence and stays as-is; add a note that promotion does not change the confidence anchor (autofix_class and confidence are independent)
- **Section 3.7 (Route):** Update the routing table: anchor 100 + `safe_auto` -> silent apply; anchor 100 + `gated_auto` -> proposed fix (recommended Apply); anchor 75 -> proposed fix / decision per autofix_class; anchor 50 -> FYI subsection regardless of autofix_class
- **Section 3.8 (Sort):** Replace "confidence (descending)" with "anchor (descending)" in the sort-key chain
- **Section 3.9 (Residual/Deferred restatement suppression, added in prior session):** No confidence-dependent logic; no change needed

**Patterns to follow:**
- The existing vocabulary-rule pattern at the Phase 4 preamble — a single strong directive followed by examples. Apply the same style to the anchor-routing rules so they cannot drift

**Test scenarios:**
- Happy path: A finding with `confidence: 75, autofix_class: gated_auto` surfaces in the Proposed Fixes bucket
- Happy path: A finding with `confidence: 50, autofix_class: manual` surfaces in the FYI subsection
- Happy path: A finding with `confidence: 100, autofix_class: safe_auto` applies silently
- Edge case: A finding with `confidence: 25` is dropped entirely (not surfaced in FYI, not surfaced in Residual Concerns)
- Edge case: Two personas raise the same finding, both at anchor 50; post-boost anchor is 75 and the finding routes as a Decision
- Edge case: One persona at anchor 100 and one at anchor 50 raise the same finding; merged keeps 100, boost does not apply beyond the cap

**Verification:**
- No numeric thresholds (0.40, 0.50, 0.60, 0.65, 0.75) remain in the synthesis file
- The routing table explicitly names each anchor and its destination
- Cross-persona boost mentions "anchor step" not "+0.10"

- [ ] **Unit 4: Update rendering surfaces**

**Goal:** Display anchors as integer scores in the user-facing output; remove float-formatting artifacts.

**Requirements:** R7

**Dependencies:** Unit 1, Unit 3

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-doc-review/references/review-output-template.md`
- Modify: `plugins/compound-engineering/skills/ce-doc-review/references/walkthrough.md`
- Modify: `plugins/compound-engineering/skills/ce-doc-review/references/open-questions-defer.md` (if it renders confidence)
- Modify: `plugins/compound-engineering/skills/ce-doc-review/references/bulk-preview.md` (if it renders confidence)

**Approach:**
- Table `Confidence` columns show the integer score as-is (e.g., `75`), not formatted as a decimal (`0.75`)
- Walkthrough per-finding block displays `confidence 75` not `confidence 0.75`
- Headless envelope template in `synthesis-and-presentation.md` Phase 4 shows the integer anchor
- Add a one-line rubric legend somewhere user-visible so a reader seeing `75` for the first time knows what it means without reading the schema. Candidates: a footer under the Coverage table, or a one-line note at the top of the findings list. Decide during implementation — whichever integrates cleanly with the existing layout

**Patterns to follow:**
- The existing `Tier` column in the output template (which surfaces internal enum values for transparency). Add a `Confidence` or rename `Confidence` to display the anchor integer; keep the `Tier` column separate since anchor and tier are independent

**Test scenarios:**
- Happy path: A rendered table shows `75` in the Confidence column, not `0.75` or `75%` or `75 (high)`
- Happy path: Walkthrough per-finding block reads naturally with integer anchor
- Edge case: When a finding was cross-persona-boosted, the display shows the post-boost anchor value (e.g., 75) and the Reviewer column notes the boost (`coherence, feasibility (+1 anchor)`)

**Verification:**
- Rendering a fixture finding end-to-end through the synthesis pipeline produces output with integer anchors throughout, no float values

- [ ] **Unit 5: Update persona files**

**Goal:** Remove per-persona references to specific float confidence values; ensure each persona's domain instructions work with the shared rubric.

**Requirements:** R3

**Dependencies:** Unit 2

**Files:**
- Modify: `plugins/compound-engineering/agents/document-review/ce-coherence-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/document-review/ce-adversarial-document-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/document-review/ce-design-lens-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/document-review/ce-feasibility-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/document-review/ce-product-lens-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/document-review/ce-scope-guardian-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/document-review/ce-security-lens-reviewer.agent.md`

**Approach:**
- Grep each persona file for `confidence` and float values. Replace any specific numeric references (e.g., coherence's `confidence: 0.85+`) with anchor-based equivalents (`anchor 100 when ... ; otherwise anchor 75`)
- If a persona's domain naturally caps at anchor 75 (e.g., adversarial critiques of premises), add one sentence acknowledging this in the persona's domain rubric so it doesn't over-reach for 100. Do not add a per-persona floor override — the shared >= 50 threshold handles all personas
- Verify each persona's suppress-conditions section still makes sense under anchor vocabulary; rewrite any float-referencing lines

**Patterns to follow:**
- The shared subagent template's rubric, included by every persona. Any persona-specific guidance should defer to the shared rubric and only add calibration hints specific to that persona's domain

**Test scenarios:**
- Test expectation: none per-persona — behavior tested via the contract tests in Unit 6

**Verification:**
- No float confidence values remain in any persona file
- Each persona's prompt reads coherently with the new rubric

- [ ] **Unit 6: Update tests and fixtures**

**Goal:** Update all test fixtures and contract assertions to use anchor values; add a migration-correctness test that rejects float confidence.

**Requirements:** R8

**Dependencies:** Unit 1, Unit 3

**Files:**
- Modify: `tests/pipeline-review-contract.test.ts`
- Modify: `tests/review-skill-contract.test.ts`
- Modify: `tests/fixtures/ce-doc-review/seeded-plan.md`
- Modify: `tests/fixtures/ce-doc-review/seeded-auth-plan.md`
- Test: new contract case in `tests/pipeline-review-contract.test.ts` asserting float confidence is rejected

**Approach:**
- Grep every test and fixture file for `confidence` float values. Convert each per-fixture based on what the fixture is demonstrating:
  - Fixtures showing strong findings -> `confidence: 100` or `75`
  - Fixtures showing low-confidence findings -> `confidence: 25` or `50`
  - Fixtures showing FYI-band findings -> `confidence: 50`
- Update contract assertions that reference threshold values (0.40, 0.60, 0.65) to anchor equivalents (50, 75, 100)
- Add a new contract case: construct a finding with `confidence: 0.72` and assert the schema validator rejects it

**Patterns to follow:**
- Existing test patterns in `tests/pipeline-review-contract.test.ts` for fixture loading and schema validation

**Test scenarios:**
- Happy path: All existing fixtures validate against the new schema after conversion
- Error path: A synthesized finding with `confidence: 0.72` fails validation
- Edge case: A fixture converted from `confidence: 0.65` (previously above-gate for P2) to `confidence: 75` still surfaces in the same tier post-migration (migration does not drop borderline findings)

**Verification:**
- `bun test` passes with 0 failures
- Total test count matches or exceeds pre-migration count (new rejection-test added)

- [ ] **Unit 7: Document the migration and the threshold divergence**

**Goal:** Write a `docs/solutions/` entry so future contributors understand why doc review uses a different threshold from Anthropic's code-review reference.

**Requirements:** R1-R9 (documents the whole migration)

**Dependencies:** Units 1-6 complete

**Files:**
- Create: `docs/solutions/skill-design/confidence-anchored-scoring.md`

**Approach:**
- Frontmatter: `module: ce-doc-review`, `problem_type: design_pattern`, `tags: [scoring, calibration, personas]`
- Body sections:
  - Problem: continuous confidence invites false precision; LLMs cluster on round numbers
  - Reference pattern: Anthropic's 5-anchor rubric
  - Doc-review-specific divergence: threshold >= 50 vs Anthropic's >= 80, with the economics argument (no linter backstop, premise challenges resist verification, routing menu makes dismissal cheap)
  - When to port this pattern: other persona-based review skills with similar economics
  - When NOT to port directly: ce-code-review has linter-backstop economics and should tune threshold higher

**Patterns to follow:**
- Existing entries under `docs/solutions/skill-design/` for frontmatter shape and section structure

**Test scenarios:**
- Test expectation: none — documentation file with no executable behavior

**Verification:**
- File validates via whatever existing tooling checks `docs/solutions/` frontmatter (if any)
- A reader unfamiliar with this migration can read the entry and understand both the mechanic and the threshold-tuning rationale

## System-Wide Impact

- **Interaction graph:** The `confidence` field is read by every synthesis step (3.2, 3.3, 3.3b, 3.4, 3.5b, 3.6, 3.7, 3.8), every rendering surface (template, walkthrough, open-questions-defer, bulk-preview, headless envelope), and every persona's output contract. A missed update in any of these leaves a format mismatch that will surface as a validation or rendering bug.
- **Error propagation:** If the schema change lands before the persona prompts update, persona outputs will fail validation and the pipeline will drop all findings. Unit sequencing (Unit 1 before Unit 2 before Unit 5) is load-bearing for this reason.
- **State lifecycle risks:** The multi-round decision primer (R29 suppression, R30 fix-landed) stores prior-round findings in memory. Prior-round findings serialized with float confidence will not match current-round anchor confidence in fingerprint comparisons. Implementation should check whether the primer carries confidence in its fingerprint — if it does, add a one-time migration or tolerance in the matcher.
- **API surface parity:** ce-code-review has the same field shape and the same kind of synthesis pipeline. It is intentionally NOT updated in this PR (Scope Boundaries). When ce-code-review's migration eventually runs, it can reuse the rubric structure but will need a higher threshold.
- **Integration coverage:** End-to-end test invoking the full ce-doc-review flow against a seeded plan is the only way to verify all the surfaces stay in sync. Unit 6's contract tests should include one such end-to-end case.
- **Unchanged invariants:** Severity taxonomy, finding_type enum, autofix_class enum, rendering structure (sections, coverage table, routing menu), multi-round decision primer shape, chain-linking logic (3.5c), strawman rule. This change is strictly about the confidence dimension; other dimensions remain stable.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Personas over-cluster on anchor 75 (new version of gaming) | Rubric criteria for 75 vs 100 must be behaviorally distinct: 75 = "double-checked, will hit in practice"; 100 = "evidence directly confirms, will happen frequently". If clustering still occurs post-migration, consider the neutral-scorer follow-up (deferred scope) |
| Tests and fixtures update incompletely, leaving hidden float references | Unit 6 includes a grep-all-fixtures audit step; the new rejection test catches any fixture that slips through |
| Anchor routing rule in synthesis contradicts rendering rule, causing tier/display drift | Unit 3 and Unit 4 share a test case (end-to-end fixture through pipeline) that catches this. Single-source-of-truth routing table in synthesis-and-presentation.md is the canonical reference; rendering reads from it, not reinvents it |
| `confidence: 0` findings surface in user output by mistake (they should drop silently) | Synthesis 3.2 explicitly drops anchor 0 and anchor 25. Contract test in Unit 6 asserts neither surfaces in any output bucket |
| Doc review threshold >= 50 proves too permissive in practice (too many noisy findings surface) | The threshold is easy to tune post-migration (change one rule in synthesis 3.2). Documented in the solution entry (Unit 7) so future contributors know where to adjust |
| Persona prompt changes degrade finding quality | Unit 5 preserves persona-specific domain logic; only confidence-related language changes. Run the reference plan through the migrated flow as a smoke test (Unit 6 end-to-end case) |

## Documentation / Operational Notes

- This is a breaking change for the ce-doc-review schema. Any external consumer of the findings JSON (there are none currently — the schema is internal) would need to update. No external-consumer impact expected.
- No rollout flag needed — the migration is atomic across the skill. Before-and-after review of the same document produces comparable output; the anchor scores replace float scores uniformly.
- The `docs/solutions/skill-design/confidence-anchored-scoring.md` entry (Unit 7) is the canonical explanation for why doc review diverges from Anthropic's code-review threshold. Link to it from the PR description.

## Sources & References

- Anthropic reference rubric: `anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md`
- Current schema: `plugins/compound-engineering/skills/ce-doc-review/references/findings-schema.json`
- Current synthesis pipeline: `plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md`
- Related prior session work: 2026-04-21 review of a ce-doc-review output that surfaced the fine-grained-score gaming problem, leading to this plan
