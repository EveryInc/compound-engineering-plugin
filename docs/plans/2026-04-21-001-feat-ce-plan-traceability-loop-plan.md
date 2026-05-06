---
title: "feat: ce-plan U-IDs and origin traceability loop"
type: feat
status: active
date: 2026-04-21
---

# feat: ce-plan U-IDs and origin traceability loop

## Overview

Close the brainstorm → plan → work traceability loop opened by PR #629. PR #629 added stable IDs (`A`, `F`, `AE`) and a Deep-product tier with a split Scope Boundaries section to `ce-brainstorm` requirements docs, and lightly updated `ce-plan` and `ce-work` to *carry forward* those IDs as constraints. But the plan template itself was never updated to expose the new origin IDs, and Implementation Units have no stable IDs of their own — so execution-side references like "blocked on Unit 3" remain ambiguous across edits, and origin actors/flows/acceptance examples are invisible to anyone reading the plan without opening the upstream brainstorm doc.

This PR completes the loop with five focused changes:

1. Stable plan-local `U-IDs` for Implementation Units, with a stability rule that survives deepening reorders.
2. Conditional Origin Trace sub-blocks under Requirements Trace (Actors, Key Flows, Acceptance Examples) that appear only when the origin doc supplies them.
3. Three-way Scope Boundaries split — triggered only at Deep-product origin — with the plan-local subsection renamed from the ambiguous "Deferred to Separate Tasks" to **Deferred to Follow-Up Work**.
4. Sparse-by-design AE-link convention for test scenarios (`Covers AE2.`) so Acceptance Example disambiguation propagates into enforcement.
5. Planning-side Alternatives rule mirroring brainstorm's: alternatives differ on *how*, not *what*.

Plus the supporting machinery: Phase 5.1 finalization checklist updates, `deepening-workflow.md` checklist updates (including a U-ID stability warning at the most likely renumber-accident vector), and synchronized updates to `ce-work` and `ce-work-beta` so U-IDs survive into execution as task-label prefixes and blocker/verification references.

---

## Change Matrix

| File | Change | Unit |
|------|--------|------|
| `plugins/compound-engineering/skills/ce-plan/SKILL.md` | U-ID format + stability rule (Phase 3.3, 3.5, template) | U1 |
| `plugins/compound-engineering/skills/ce-plan/SKILL.md` | Origin Trace sub-blocks + Scope Boundaries three-way split + rename to "Deferred to Follow-Up Work" | U2 |
| `plugins/compound-engineering/skills/ce-plan/SKILL.md` | AE-link convention + Alternatives rule + Phase 5.1 checklist updates | U3 |
| `plugins/compound-engineering/skills/ce-plan/references/deepening-workflow.md` | U-ID stability warning + origin A/F/AE preservation checks | U4 |
| `plugins/compound-engineering/skills/ce-work/SKILL.md` + `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` | U-ID recognition in blockers/verification + task label prefix rule | U5 |

---

## Problem Frame

### What's broken today

- **Implementation Units have no stable identifier.** The plan refers to "Unit 1, Unit 2…" — a positional label that renumbers when units are reordered or split. `ce-work` and `ce-work-beta` were updated by PR #629 to reference R/A/F/AE IDs in blockers and verification, but they cannot reference *which unit* is blocked unambiguously. Deepening (Phase 5.3) reorders or splits units, which is precisely when stability matters most.
- **Origin A/F/AE IDs are invisible in the plan output.** The `ce-plan` SKILL.md text says to *preserve* origin A/F/AE as constraints implementation units must honor, but the plan template has no surface where they appear. An implementer or reviewer reading the plan must open the origin requirements doc to see which actors, flows, or acceptance examples the plan relates to.
- **Scope Boundaries cannot represent the product-tier distinction.** PR #629 introduced `Deferred for later` (product sequencing) vs `Outside this product's identity` (positioning rejection) at Deep-product brainstorms. The plan template has only `Deferred to Separate Tasks`, which is a different concept (PR-level implementation sequencing). Carrying forward an origin's product-tier scope split is currently impossible — and the existing name "Deferred to Separate Tasks" is itself ambiguous because "task" overlaps with `TaskCreate`/`TaskList` tooling and the section's contents are PRs/issues/repos, not tasks.
- **Acceptance Examples have no enforcement link.** AE was added to the brainstorm precisely to disambiguate ambiguous requirements via canonical scenarios. Without a link from test scenarios to AE-IDs, the disambiguation decays — implementers can write tests that pass R3's literal text but miss the AE1 scenario that was supposed to pin down R3's meaning.
- **Plan alternatives can re-litigate product questions.** Without a planning-side mirror of brainstorm's "alternatives differ on what" rule, plans may regenerate product-shape alternatives (e.g., "should we build for end users or operators?") that should have been settled in brainstorm.

### Design constraint that shapes every change

`ce-plan` must remain useful when no origin doc exists. Not every user runs `ce-brainstorm` first — piecemeal use is by design. Every origin-derived structure introduced here must be explicitly conditional in the template, with a stated fallback when origin is absent, and must not produce broken sections (empty headers, dangling references) in the no-origin path.

This is the **conditionality design rule** the PR also introduces.

---

## Requirements Trace

**Plan template structure**
- R1. Implementation Units carry stable `U-IDs` that survive reordering, splitting, and deletion. New units take the next unused number; gaps are allowed; existing IDs are never renumbered.
- R2. The plan template surfaces origin Actors/Key Flows/Acceptance Examples in a Requirements Trace sub-block when the origin doc supplies them, and omits the sub-block cleanly when origin is absent or non-Deep tier.
- R3. The plan template supports a three-way Scope Boundaries split at Deep-product origin (`Deferred for later` + `Outside this product's identity` + `Deferred to Follow-Up Work`), and collapses to a single list when origin is absent or non-product-tier.
- R4. The "Deferred to Separate Tasks" subsection is renamed to **Deferred to Follow-Up Work** wherever it appears in `ce-plan/SKILL.md`, including Phase 5.1 review checklist references.

**Workflow rules and conventions**
- R5. Test scenarios that directly enforce an origin Acceptance Example prefix with `Covers AE<N>.` (or `Covers F<N> / AE<N>.`). The convention is sparse-by-design — most test scenarios are finer-grained than AEs and do not link.
- R6. A planning-side Alternatives rule (Phase 4.1b) states: alternatives differ on *how* the work is built; tiny implementation variants belong in Key Technical Decisions; product-shape alternatives belong in `ce-brainstorm`.

**Review and deepening machinery**
- R7. Phase 5.1 finalization checklist enforces the new contract using judgment-call phrasing ("origin R/F/AE that affects implementation"), not mechanical "every ID appears" checks. All origin-related checks are guarded by "if origin exists."
- R8. `deepening-workflow.md` checklist gains explicit U-ID stability warning (deepening must NOT renumber units when reordering or splitting) and origin A/F/AE preservation checks.

**Execution-side recognition**
- R9. `ce-work/SKILL.md` and `ce-work-beta/SKILL.md` recognize `U-ID` alongside `R/A/F/AE` in blockers, deferred-work notes, task summaries, and final verification. When creating tasks from plan units, task labels include the U-ID prefix (e.g., "U3: Add parser coverage") so blockers and summaries reference the same anchor.

**Validation**
- R10. `bun test` and `bun run release:validate` pass after the change.

### Success criteria

- A plan generated from a brainstorm with A/F/AE IDs surfaces those IDs in its Requirements Trace section without the implementer needing to open the origin doc.
- A plan generated from no upstream brainstorm renders a clean template with no empty origin-related headers or dangling references.
- A plan whose units get reordered during deepening retains its original U-IDs (e.g., U1, U3, U5 in their new order is acceptable; renumbering to U1, U2, U3 is not).
- `ce-work` referring to "U3" in a blocker can be unambiguously matched to a specific Implementation Unit in the source plan, regardless of plan edits since work began.
- A test scenario that enforces AE1's canonical scenario carries `Covers AE1.` so the disambiguation is auditable.

---

## Scope Boundaries

- This PR does not introduce a new plan-depth tier. There is no "Deep-product-plan" classification. Lightweight / Standard / Deep remain.
- No new top-level template sections. Origin trace lives inside the existing Requirements Trace section.
- No new ID namespaces beyond `U`. Open Questions do not gain Q-IDs.
- No `Implementation Units` rename.
- No splitting of `ce-plan` into multiple skills.
- No fixed-category decision checklists (Programming language, Database, etc.) — wrong abstraction for `ce-plan`'s open-ended scope.
- No source code, schema, or test changes. This is a skill-content (Markdown) PR. The only commands run are `bun test` and `bun run release:validate` for validation.

### Deferred to Follow-Up Work

- A plan-section matrix (analogous to the brainstorm tier-by-section matrix from PR #629). Worth doing — current inclusion rules are scattered across Phase 3/4 — but standalone documentation cleanup, not part of the traceability loop.
- An "Existing Technology" detected callout in plan output, surfacing what the plan inherits vs introduces.
- A "Deferred Decisions" table with a "when to revisit" column.
- A `docs/solutions/` write-up capturing the U-ID/R-ID/AE-link traceability convention. Per repo convention these are written *after* the change ships, so this belongs in a follow-up `ce-compound` pass once this PR merges.

---

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-brainstorm/references/requirements-capture.md` — PR #629's section matrix and triggered-section format establish the template-author conventions (R/A/F/AE prefix style, `Covers:` back-references, conditional sections). The plan-side changes mirror these conventions verbatim.
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` — Phase 0.3's Deep-product detection logic is the upstream signal that triggers the three-way Scope Boundaries split in the plan template.
- `plugins/compound-engineering/skills/ce-plan/SKILL.md` — Phase 0.3 already has placeholder text about preserving A/F/AE IDs and the Scope Boundaries subsections. This PR completes the work by making them visible in the plan output.
- `plugins/compound-engineering/skills/ce-work/SKILL.md` line 297 + `ce-work-beta/SKILL.md` line 362 — the existing R/A/F/AE recognition guidance in "Track Progress" sections is the seam where U-ID is added.

### Institutional Learnings

- `docs/solutions/skill-design/research-agent-pipeline-separation-2026-04-05.md` — confirms the brainstorm/plan/work pipeline is intentionally separated by information type, with the plan as the **sole handoff artifact** to ce-work. This grounds the conditionality design rule: ce-work must read everything it needs from the plan file alone, so U-IDs must live in the plan, not require reading back into the brainstorm.
- `docs/solutions/skill-design/beta-skills-framework.md` and `docs/solutions/skill-design/beta-promotion-orchestration-contract.md` — confirm that ce-work and ce-work-beta must stay in sync atomically when the contract changes. The U-ID recognition guidance applies equally to both surfaces; sync decision must be stated explicitly per repo convention.
- `docs/solutions/best-practices/conditional-visual-aids-in-generated-documents-2026-03-29.md` — establishes that conditional document sections must trigger on observable content patterns, not size/depth/tier proxies. Validates the "trigger on origin doc presence" model for Origin Trace sub-blocks rather than "trigger on plan tier."
- `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md` — flags that doc-review reliably catches "unit adds a thing the plan's own scope boundary forbade." The Scope Boundaries three-way split is exactly the kind of architectural template change doc-review should catch contradictions in. Also reinforces: never conflate two semantic meanings in one identifier — keep U-ID and R-ID semantics crisp.
- `docs/solutions/skill-design/ce-doc-review-calibration-patterns-2026-04-19.md` — "Coverage/rendering count invariants need a single source of truth." Applies to U-ID generation: the Implementation Unit heading is the authoritative location; ce-work's blocker/verification recognition reads, never coins.

### External References

- None used. This is a skill-content change to in-repo Markdown; no external docs or framework behavior was consulted.

---

## Key Technical Decisions

- **U-ID format mirrors R/A/F/AE exactly.** Plain prefix at start of bullet (`U1.`), not bolded. The unit's heading line becomes `- [ ] U1. **Name**` so the checkbox, ID, and name are all visible on one line. Rationale: PR #629 chose this format deliberately for visual distinctiveness without table or bold-label overhead. Diverging would create asymmetry across the four ID namespaces an implementer reads back-to-back.
- **U-IDs are plan-local, not session-global.** Each plan numbers its own units starting at U1. No cross-plan uniqueness is required because no downstream consumer references units across plans. Plan-local scope keeps the namespace simple and avoids coordination problems.
- **U-ID stability rule lives in two places: Phase 3.5 (where units are defined) AND template comments (Phase 4.2).** Deepening (Phase 5.3) is the most likely accidental-renumber vector — an agent reorganizing units may "tidy up" the numbering. Stating the rule in two places — once where new units are minted, once visible in the template the agent is editing — defends against the accident at both entry points.
- **Origin Trace is a sub-block under existing Requirements Trace, not a new top-level section.** A new top-level `## Origin` section is cleaner in theory but adds a header that disappears in no-origin mode and creates ceremony for the common case. Sub-blocks keep the section count flat and let the section degrade naturally.
- **Scope Boundaries three-way split triggers on observable origin content** (presence of `Outside this product's identity` subsection in origin), not on a "Deep-product origin" tier flag. This avoids requiring the plan to know the origin's tier classification — it just inspects what the origin doc actually contains. Aligned with `conditional-visual-aids-in-generated-documents-2026-03-29.md`.
- **Renamed "Deferred to Separate Tasks" → "Deferred to Follow-Up Work."** Three reasons: "task" overlaps with `TaskCreate`/`TaskList` tooling; the section's contents are PRs/issues/repos (not "tasks"); and "Out of Scope for This Plan" (an alternative considered) reads as true non-goals and clashes with the carried-forward "Outside this product's identity" subsection. "Follow-Up Work" precisely says *intentionally not in this plan but still part of the effort*.
- **AE-link uses "should when applicable," not "may."** "May" is too weak — agents skip optional rules under pressure. "Should when directly enforces" gates the rule on a real condition (the test must directly enforce the AE) while still mandating compliance when the condition holds.
- **U-ID recognition in ce-work and ce-work-beta is identical.** No experimental delegate-mode divergence applies here. The R-ID/A/F/AE guidance in PR #629 already shipped to both atomically. Sync decision: propagate to both — shared traceability contract.
- **Phase 5.1 checklist phrasing avoids "every ID appears."** Mechanical-coverage rules invite compliance theater. Better: "every origin R/F/AE *that affects implementation* is referenced or explicitly deferred." The judgment call ("that affects implementation") is the load-bearing word that prevents ID spam.
- **No documentation update to README.md component counts.** This PR does not add or remove skills, agents, or commands. The plugin's surface area is unchanged.

---

## Open Questions

### Resolved During Planning

- **Should test scenarios linking to AE-IDs use `Covers` or `Enforces`?** Resolved: `Covers` — symmetric with brainstorm's `Covers: R-IDs` convention on AE definitions, so an implementer reading both docs sees the same vocabulary.
- **Should U-IDs be bolded like the unit name (`**U1**`)?** Resolved: no — PR #629 explicitly chose plain-prefix format for R/A/F/AE because the prefix is visually distinctive on its own; double-bolding would create visual noise and diverge from the established pattern.
- **Should the plan template carry forward the origin's tier classification (Lightweight/Standard/Deep-feature/Deep-product) in the frontmatter?** Resolved: no — the plan tier is a planning concern; the origin tier is an artifact of how the brainstorm classified scope. Coupling them would create a misleading dependency. Conditional content triggers on observable origin doc patterns (e.g., presence of `Outside this product's identity` subsection), not on a propagated tier flag.

### Deferred to Implementation

- **Exact wording of the U-ID stability rule in template comments.** The template comment must be concise (template comments are visible to every user of the skill) but unambiguous about the deepening case. Final wording will be drafted during implementation in close proximity to the actual template content.
- **Whether to add an HTML comment or inline note next to the renamed "Deferred to Follow-Up Work" subsection** explaining its distinction from the carried-forward "Deferred for later." Implementer should evaluate after seeing the rendered three-way split — if the names alone are clear in context, no clarifying note is needed.
- **Whether `ce-work-beta`'s task creation guidance has any beta-specific divergence that would block applying the U-ID prefix rule identically.** Implementer should diff the two task-creation sections side-by-side before applying the change to confirm no surprise divergence exists.

---

## Implementation Units

- [x] **U1: U-IDs and stability rule in `ce-plan/SKILL.md`**

**Goal:** Introduce stable plan-local `U-IDs` for Implementation Units, with the stability rule visible at both the workflow phase that defines units and the template the agent fills in.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`

**Approach:**
- In Phase 3.3 ("Break Work into Implementation Units"), add a brief note: units carry stable U-IDs assigned in Phase 3.5. State that reordering, splitting, or deleting units never renumbers existing U-IDs; new units take the next unused number; gaps are fine.
- In Phase 3.5 ("Define Each Implementation Unit"), update the unit format description to include the U-ID prefix at the start of the unit's bullet line. Keep all other unit fields (Goal, Requirements, Dependencies, etc.) unchanged.
- In Phase 4.2's core plan template, change the example unit heading from `- [ ] **Unit 1: [Name]**` to `- [ ] U1. **[Name]**`. Add a template comment immediately above the Implementation Units section restating the stability rule for visibility at the editing surface.
- Cross-check that no other section of the SKILL.md refers to units by positional name ("Unit 1") in a way that would be inconsistent with the new format. Update such references to the U-ID style if found.

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-brainstorm/references/requirements-capture.md` — R/A/F/AE prefix format (plain prefix, not bolded; `R1.` not `**R1.**`).

**Test scenarios:**
- Happy path: After change, the example template unit heading reads `- [ ] U1. **[Name]**`. Phase 3.3 and Phase 3.5 both contain a stability-rule statement. Template has a visible comment near Implementation Units restating the rule.
- Edge case: A plan generated by the updated skill, then deepened with one unit split into two and another reordered, retains its original U-IDs (no renumbering). New units take the next unused number.
- Integration: An agent reading `ce-work`'s blocker reference like "U3" can locate the corresponding unit in the plan unambiguously, even after the plan has been edited since work started.

**Verification:**
- `ce-plan/SKILL.md` Phase 3.3, 3.5, and Phase 4.2 template all reference the U-ID format consistently.
- The stability rule appears at minimum in Phase 3.5 and in a template comment near the Implementation Units section.
- A skim of the rest of the SKILL.md surfaces no positional "Unit N" references that would conflict with the new format.

---

- [x] **U2: Origin Trace sub-block + Scope Boundaries three-way split + rename in `ce-plan/SKILL.md`**

**Goal:** Make origin A/F/AE IDs visible in the plan output via a conditional sub-block under Requirements Trace; support the three-way Scope Boundaries split when origin is Deep-product; rename "Deferred to Separate Tasks" → "Deferred to Follow-Up Work" everywhere it appears.

**Requirements:** R2, R3, R4

**Dependencies:** None (independent of U1's edits in the same file; coordinate at commit time)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`

**Approach:**
- In the Phase 4.2 core plan template, under the existing Requirements Trace section, add three optional sub-block lines: `**Origin actors:**`, `**Origin flows:**`, `**Origin acceptance examples:**`. Each line carries a one-line explanation of what to fill in. Surround the sub-blocks with an HTML comment stating they are included only when the origin document supplies the corresponding section, and omitted entirely otherwise.
- In the Phase 4.2 template's Scope Boundaries section, replace the current single `### Deferred to Separate Tasks` subsection block with conditional structure:
  - Default (no origin, or non-product-tier origin): a single bulleted list of explicit non-goals. Optional `### Deferred to Follow-Up Work` subsection still allowed when implementation is intentionally split.
  - Triggered (Deep-product origin, detected by presence of `Outside this product's identity` subsection in origin): three subsections — `### Deferred for later` (carried from origin, product-tier sequencing), `### Outside this product's identity` (carried from origin, positioning rejection), `### Deferred to Follow-Up Work` (plan-local, implementation work split across other PRs/issues/repos).
- Wrap the conditional structure in template comments stating the trigger condition and the no-origin fallback.
- Search the rest of `ce-plan/SKILL.md` for any other reference to "Deferred to Separate Tasks" (e.g., in Phase 5.1 review checklist) and rename to "Deferred to Follow-Up Work."

**Patterns to follow:**
- Conditionality: surround each conditional block with an HTML comment stating the trigger and the no-origin fallback. Mirror the brainstorm template's "include when triggered" comment style from `requirements-capture.md`.

**Test scenarios:**
- Happy path (with origin): A plan generated from a Deep-product brainstorm renders the Requirements Trace section with all three Origin sub-blocks populated and the Scope Boundaries section with the three-way split.
- Edge case (no origin): A plan generated from a feature description with no upstream brainstorm renders the Requirements Trace section with only R-ID bullets (no empty `**Origin actors:**` line, no dangling header), and the Scope Boundaries section as a single list. No broken structure.
- Edge case (Deep-feature origin, not Deep-product): The Origin Trace sub-blocks may be populated (A/F/AE can appear at any tier when triggered), but Scope Boundaries collapses to single list because origin lacks `Outside this product's identity`.
- Integration: Renamed subsection wording is consistent across template, Phase 5.1 checklist references, and any other internal cross-references in the SKILL.md.

**Verification:**
- Phase 4.2 template Requirements Trace section shows three optional sub-block lines with HTML-comment triggers.
- Phase 4.2 template Scope Boundaries section shows the conditional three-way split with HTML-comment triggers.
- Search for "Deferred to Separate Tasks" in `ce-plan/SKILL.md` returns zero results.
- Search for "Deferred to Follow-Up Work" returns matches in the template and Phase 5.1.

---

- [x] **U3: AE-link convention + Alternatives rule + Phase 5.1 checklist updates in `ce-plan/SKILL.md`**

**Goal:** Add the three smaller workflow rules: AE-link convention for test scenarios, planning-side Alternatives rule mirroring brainstorm's, and Phase 5.1 finalization checklist entries that enforce the new origin-traceability contract using judgment-call phrasing.

**Requirements:** R5, R6, R7

**Dependencies:** U1, U2 (Phase 5.1 checklist references the new template structures and U-ID concept introduced in those units)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`

**Approach:**
- In Phase 3.5 ("Define Each Implementation Unit"), under the **Test scenarios** bullet, add a brief AE-link guidance: "When a test scenario directly enforces an origin Acceptance Example, prefix it with `Covers AE<N>.` (or `Covers F<N> / AE<N>.`). Do not force AE links onto tests that only cover lower-level implementation details." Place it as a sentence within the existing Test scenarios description, not a new sub-bullet — it's a convention, not a category.
- In Phase 4.1b ("Optional Deep Plan Extensions"), under the existing "Alternative Approaches Considered" entry, append the planning-side rule as one or two sentences: "Alternatives differ on *how* the work is built — architecture, sequencing, boundaries, integration pattern, rollout strategy. Tiny implementation variants belong in Key Technical Decisions, not Alternatives. Product-shape alternatives belong in `ce-brainstorm`, not here."
- In Phase 5.1 ("Review Before Writing"), add new checklist bullets:
  - "If origin document exists with A/F/AE IDs, every origin R/F/AE *that affects implementation* is referenced in Requirements Trace, a U-ID unit, test scenarios, verification, scope boundaries, or explicitly deferred. Actors are carried forward when they affect behavior, permissions, UX, orchestration, handoff, or verification. No origin section is silently dropped."
  - "U-IDs are unique within the plan and follow the stability rule — no two units share an ID; reordering or splitting did not renumber existing units."
  - Update the existing "Scope Boundaries… `### Deferred to Separate Tasks`" check to use the renamed subsection name.
  - "If origin was Deep-product (origin contains `Outside this product's identity`), the plan's Scope Boundaries section preserves the three-way split."
- All origin-related checklist additions must be guarded by "If origin document exists" so the no-origin path skips them naturally.

**Patterns to follow:**
- Phase 5.1 existing bullet style — short imperative, one concern per bullet.
- Judgment-call phrasing: "that affects implementation" / "when applicable" — not "every ID must appear."

**Test scenarios:**
- Happy path: Phase 3.5 contains the AE-link guidance sentence within the Test scenarios description. Phase 4.1b's Alternative Approaches Considered entry contains the planning-side rule. Phase 5.1 contains the new origin-traceability bullets and the U-ID stability check, all guarded for no-origin.
- Edge case: Phase 5.1 review of a plan with no origin doc skips the origin-related bullets cleanly (the "If origin document exists" guard short-circuits).
- Integration: An agent re-reading the SKILL.md follows the new rules — proposes alternatives that differ on architecture/sequencing rather than product shape; prefixes test scenarios that directly enforce AE1 with `Covers AE1.`; flags origin sections that were silently dropped during finalization.

**Verification:**
- Phase 3.5 contains the AE-link guidance.
- Phase 4.1b's Alternatives entry contains the planning mirror rule.
- Phase 5.1 contains the new bullets, all origin-related entries guarded by "If origin document exists."
- The Phase 5.1 entry referencing the renamed subsection uses "Deferred to Follow-Up Work."

---

- [x] **U4: `deepening-workflow.md` checklist updates**

**Goal:** Update the deepening machinery so the new contract is enforced where plans are actually strengthened. Most critical addition: a U-ID stability warning at the most likely renumber-accident vector.

**Requirements:** R8

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/references/deepening-workflow.md`

**Approach:**
- In the Implementation Units checklist (Step 5.3.3), add bullets:
  - "Existing U-IDs are renumbered after a unit was reordered, split, or deleted. (U-IDs must remain stable — gaps are fine; new units take the next unused number.)"
  - "A unit realizing a flow does not cite the F-ID; a unit enforcing an Acceptance Example does not cite the AE-ID, when origin supplies them."
- In the Requirements Trace checklist, add: "Origin A/F/AE IDs (when present) are not preserved where planning decisions touch them, or are referenced inconsistently."
- In Step 5.3.7 ("Synthesize and Update the Plan"), under the **Allowed changes** list, the existing "Reorder or split implementation units when sequencing is weak" bullet must be paired with an explicit warning: "When reordering or splitting units, do NOT renumber existing U-IDs. The new unit takes the next unused number; the original units retain their IDs in their new order. Renumbering breaks `ce-work` blocker/verification references."
- In Step 5.3.7's **Do not** list, add: "Renumber existing U-IDs as part of reordering or tidying."

**Patterns to follow:**
- Existing checklist style in `deepening-workflow.md` — short imperative, one concern per bullet, paired with example signals.

**Test scenarios:**
- Happy path: Implementation Units checklist contains the U-ID stability check and the F-ID/AE-ID citation check. Requirements Trace checklist contains the origin preservation check. Step 5.3.7's Allowed/Do-not lists explicitly call out the renumber prohibition.
- Edge case: Deepening a plan with no origin doc — the F-ID/AE-ID citation check effectively no-ops because there are no origin IDs to cite. The U-ID stability check remains in force regardless.
- Integration: An agent running deepening that splits Unit 3 into two units creates U6 (next unused) and leaves the original U3 in place with its content reduced; does not renumber to "U3a/U3b" or rewrite numbering.

**Verification:**
- Implementation Units checklist contains the two new bullets.
- Requirements Trace checklist contains the origin preservation bullet.
- Step 5.3.7 Allowed-changes section explicitly addresses the renumber prohibition with a paired warning.
- Step 5.3.7 Do-not list explicitly forbids renumbering.

---

- [x] **U5: U-ID recognition + task label rule in `ce-work/SKILL.md` and `ce-work-beta/SKILL.md`**

**Goal:** Close the execution side of the loop. ce-work and ce-work-beta recognize U-IDs alongside R/A/F/AE in blockers/verification/summaries, and preserve the U-ID prefix in task labels so blockers and summaries reference the same anchor.

**Requirements:** R9

**Dependencies:** U1 (U-IDs must exist in the plan format before execution-side tooling references them)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-work/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-work-beta/SKILL.md`

**Approach:**
- Locate the existing "Track Progress" section in `ce-work/SKILL.md` (currently around line 297) and `ce-work-beta/SKILL.md` (currently around line 362). The R-ID/A/F/AE recognition guidance from PR #629 lives there. Extend it by adding `U-IDs` to the recognized ID set: "When the plan or origin document carries stable R-IDs (and optionally A/F/AE IDs), or when the plan defines U-IDs for Implementation Units, reference them in blockers, deferred-work notes, task summaries, and final verification — not routine status updates. This preserves traceability back to requirements and units without burying signal under noise."
- Locate each skill's "Create Todo List" section (ce-work step 3 around line 115, ce-work-beta step 3 around line 168). Add a sub-bullet under the existing "Derive tasks from the plan's implementation units…" guidance: "Preserve the unit's U-ID as a prefix in the task label (e.g., 'U3: Add parser coverage'). This keeps blocker references, deferred-work notes, and final summaries anchored to the same identifier the plan uses."
- Apply the changes identically to both files. Diff the two task-creation sections side-by-side before applying to confirm no surprise divergence exists. Per `Stable/Beta Sync` convention, state the sync decision explicitly in the commit message: "Propagated to beta — shared traceability contract."

**Patterns to follow:**
- The existing R-ID/A/F/AE guidance line in each skill's "Track Progress" section (the line added by PR #629) is the structural model — same placement, same tone.
- Stable/Beta sync convention from `plugins/compound-engineering/AGENTS.md` — atomic update, explicit sync-decision statement.

**Test scenarios:**
- Happy path: An agent executing `ce-work` against a plan containing U-IDs creates tasks like "U3: Add parser coverage" rather than "Add parser coverage" alone. Blockers reference the U-ID anchor.
- Edge case (no U-IDs in plan, e.g., a hand-written plan that predates this change): The task creation falls back to the unit name without prefix; no error, no blocker. The U-ID rule applies "when the plan defines U-IDs," not unconditionally.
- Edge case (U-IDs but no R/A/F/AE): Status updates use U-IDs only; no synthetic R-IDs invented.
- Integration: A plan whose units were reordered during deepening still produces consistent task labels because U-IDs survive the reorder. An agent later resuming the same work session can match tasks to plan units by U-ID.

**Verification:**
- `ce-work/SKILL.md` and `ce-work-beta/SKILL.md` "Track Progress" sections both reference U-IDs alongside R/A/F/AE.
- Both files' "Create Todo List" / task-creation sections include the U-ID-prefix rule.
- A diff of the two files shows the U-ID-related additions are identical.
- The stable/beta sync decision is stated in the commit message per repo convention.

---

## System-Wide Impact

- **Interaction graph:** The brainstorm → plan → work pipeline is the primary surface affected. Changes are contract additions (new IDs, new sections), not removals or breaking changes. Existing plans authored without U-IDs continue to work because U-ID recognition in ce-work is gated on "when the plan defines U-IDs."
- **Error propagation:** No new error paths. The conditionality design rule ensures absent origin doc → empty no-op path, not a failure.
- **State lifecycle risks:** None — Markdown-only changes. No persistent state, no migrations.
- **API surface parity:** ce-work and ce-work-beta are paired surfaces; both must change atomically per the Stable/Beta Sync convention. Documented in U5.
- **Integration coverage:** The traceability loop is the integration story — changes in `ce-plan` are only useful if `ce-work` recognizes them. U5 is the integration unit; no unit is shippable in isolation without U5 also shipping (otherwise U-IDs land in plans but execution ignores them).
- **Unchanged invariants:** No-origin path through `ce-plan` produces a usable plan with no empty headers or dangling references. This is the conditionality design rule made operational. Phase 0.4 (Planning Bootstrap) and Phase 0.2 (no upstream requirements doc) flows are unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **Conditionality leaks** — a future skill change adds an origin-derived section without conditional guards, breaking the no-origin path. | Document the conditionality design rule in U2's HTML comments visibly enough that future authors see it. Plan to capture the rule in `docs/solutions/skill-design/` as part of the post-merge `ce-compound` write-up so it survives in institutional memory. |
| **Renumber-accident in deepening** — despite the U-ID stability rule, an agent under context pressure or mid-reorganization may "tidy" U-IDs anyway. | U-ID stability is restated at three locations (Phase 3.3 brief mention, Phase 3.5 definition, template comment, and `deepening-workflow.md` Allowed/Do-not lists). Doc-review can catch retroactively if it slips through. |
| **AE-link compliance theater** — agents prefix `Covers AE1.` to test scenarios that don't actually enforce AE1, just to look thorough. | The "directly enforces" qualifier in the rule is the gating language. Phase 5.1 review should spot-check AE-link claims. The risk is bounded: if the rule were skipped entirely, the worst case is unlinked tests; mechanical compliance is a recoverable QA failure, not a structural one. |
| **Stable/beta drift** — ce-work and ce-work-beta diverge in their task-creation sections post-change. | U5's verification step requires diffing the two files side-by-side. Stable/Beta sync convention requires explicit sync-decision statement in commit message. |
| **Renamed-subsection confusion** — readers of older plans see "Deferred to Separate Tasks"; readers of new plans see "Deferred to Follow-Up Work." | Old plans are not auto-migrated. The rename is a forward-looking template change. Both names refer to the same concept, so existing plans remain comprehensible. No backwards-compat shim needed because old plans don't auto-regenerate. |

---

## Documentation / Operational Notes

- README.md component counts, agent counts, and skill counts are unchanged. No README update required.
- Plugin manifests (`.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.codex-plugin/plugin.json`) are unchanged. No manual version bump per repo convention — release-please owns that.
- After this PR merges, run `ce-compound` to capture the U-ID/AE-link traceability convention as a `docs/solutions/skill-design/` document. The institutional learnings researcher noted no prior solution doc covers this, and PR #629 + this PR together originate the convention.
- No rollout, monitoring, migration, or feature-flag concerns. Skill content is loaded fresh on each invocation; no cached state to invalidate.

---

## Sources & References

- **PR #629 (upstream change being completed):** https://github.com/EveryInc/compound-engineering-plugin/pull/629
- Related code:
  - `plugins/compound-engineering/skills/ce-plan/SKILL.md`
  - `plugins/compound-engineering/skills/ce-plan/references/deepening-workflow.md`
  - `plugins/compound-engineering/skills/ce-work/SKILL.md`
  - `plugins/compound-engineering/skills/ce-work-beta/SKILL.md`
  - `plugins/compound-engineering/skills/ce-brainstorm/references/requirements-capture.md` (PR #629's pattern source)
  - `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` (PR #629's Deep-product detection)
- Related institutional learnings:
  - `docs/solutions/skill-design/research-agent-pipeline-separation-2026-04-05.md`
  - `docs/solutions/skill-design/beta-skills-framework.md`
  - `docs/solutions/skill-design/beta-promotion-orchestration-contract.md`
  - `docs/solutions/best-practices/conditional-visual-aids-in-generated-documents-2026-03-29.md`
  - `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md`
  - `docs/solutions/skill-design/ce-doc-review-calibration-patterns-2026-04-19.md`
- Plugin conventions: `plugins/compound-engineering/AGENTS.md` (Stable/Beta Sync, Skill Compliance Checklist)
