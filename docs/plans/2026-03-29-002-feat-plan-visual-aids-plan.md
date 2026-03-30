---
title: "feat(ce-plan): Add conditional visual aids to plan documents"
type: feat
status: completed
date: 2026-03-29
---

# feat(ce-plan): Add conditional visual aids to plan documents

## Overview

Add visual communication guidance to ce:plan so plan documents can include inline visual aids — dependency graphs, interaction diagrams, comparison tables — when the content warrants it. This extends PR #437's brainstorm visual aids to the planning level, filling the gap between brainstorm's product-level visuals and ce:plan's existing Section 3.4 solution-level technical design diagrams.

## Problem Frame

ce:brainstorm now produces visual aids when requirements describe multi-step workflows, mode comparisons, or multi-participant systems (PR #437). ce:plan has Section 3.4 "High-Level Technical Design" which covers solution-level diagrams — mermaid sequences, state diagrams, pseudo-code — about the *technical solution being planned*.

But plan documents have their own readability needs that neither ce:brainstorm's upstream visuals nor Section 3.4 address. When a plan has 6 implementation units with non-linear dependencies, readers must scan every unit's Dependencies field to reconstruct the execution graph. When System-Wide Impact describes 5 interacting surfaces in dense prose, readers must hold all of them in their head. When the problem involves 4 behavioral modes, readers encounter the concept in the Overview but don't see a comparison until the Technical Design section (if at all).

Evidence from real plans:
- Release automation plan (606 lines, 6 units, linear chain, 3 release modes, 4-component model) — dependency flow not obvious, mode differences buried in prose
- Merge-deepen-into-plan (6 units, non-linear dependencies) — parallelization opportunities hidden
- Adversarial review agents (5 units, diamond dependency, dense System-Wide Impact) — findings flow through synthesis and dedup not visualized
- Token usage reduction plan — already uses budget tables in Problem Frame (not Technical Design), showing the pattern works naturally

## Requirements Trace

- R1. ce:plan includes guidance for when visual aids genuinely improve a plan document's readability
- R2. Visual aids are conditional on content patterns, not on plan depth classification
- R3. Visual aids are distinct from Section 3.4 (High-Level Technical Design) — they improve *plan document readability*, not the *solution's technical design*
- R4. Three diagram types at the plan level: implementation unit dependency graphs, system-wide interaction diagrams, and comparison tables for modes/decisions
- R5. The existing plan template, Section 3.4, and planning rules remain intact; the pre-finalization checklist in Phase 5.1 gains one additional visual-aid check
- R6. Format selection is self-contained, following the same structure as brainstorm's guidance (mermaid default, ASCII for annotated flows, markdown tables for comparisons) but restated with plan-appropriate detail

## Scope Boundaries

- Not changing Section 3.4 (High-Level Technical Design) — that covers solution-level diagrams
- Not making any visual aid mandatory for any depth classification
- Not changing the plan template structure or section ordering
- Not adding a separate "Diagrams" section to the template
- Not adding visual aids to the confidence check section checklists (keep this lightweight; the pre-finalization check is sufficient)

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-plan/SKILL.md` — the skill to modify; Phase 4 (lines 366-580) contains plan writing guidance and planning rules
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` (lines 222-249) — the visual communication guidance pattern to follow
- `plugins/compound-engineering/skills/ce-plan/SKILL.md` (Section 3.4, lines 301-326) — existing solution-level diagram guidance; must remain distinct
- `docs/plans/2026-03-17-001-feat-release-automation-migration-beta-plan.md` — strongest evidence case: 6 units, 3 modes, 5 System-Wide Impact surfaces
- `docs/plans/2026-03-26-001-refactor-merge-deepen-into-plan.md` — non-linear dependency graph (parallelization opportunities hidden)
- `docs/plans/2026-03-26-001-feat-adversarial-review-agents-plan.md` — diamond dependency, dense dedup interaction in System-Wide Impact
- `docs/plans/2026-03-28-001-feat-ce-review-headless-mode-plan.md` — decision matrix in Technical Design that is really a plan-readability visual
- `docs/plans/2026-02-08-refactor-reduce-plugin-context-token-usage-plan.md` — token budget tables in Problem Frame (precedent for plan-readability visuals outside Technical Design)

### Institutional Learnings

- The brainstorm-to-plan handoff contract (ce-plan-rewrite requirements, R7) is tightly specified — plan template changes must preserve what downstream consumers depend on
- ce:plan's canonical readability bar: "a fresh implementer can start work from the plan without needing clarifying questions" — visual aids serve this goal
- Prose governs diagrams is an established invariant across brainstorm and document-review skills
- No existing learnings about mermaid gotchas in docs/solutions/

## Key Technical Decisions

- **Plan-readability visuals vs. solution-design visuals**: Section 3.4 asks "does the plan need a dedicated technical design section about the solution?" The new guidance asks "do other sections of the plan benefit from inline visual aids for reader comprehension?" These are complementary, not overlapping. The distinction: Section 3.4 diagrams describe the *architecture of what's being built*; the new visual aids help readers *navigate and comprehend the plan document itself*.

- **Placement in Phase 4, after planning rules**: The brainstorm added visual communication guidance in Phase 3 (where the model composes the document). For ce:plan, the analogous location is Phase 4 (Write the Plan), after Section 4.3 (Planning Rules). This is where the model is making formatting decisions about the plan document.

- **Content triggers, not depth triggers**: Reuses brainstorm's established principle. A Lightweight plan about a complex workflow may warrant a dependency graph; a Deep plan about a straightforward feature may not.

- **Self-contained format selection, same structure as brainstorm**: Skills are self-contained and cannot reference each other's guidance. The format selection section restates the framework (mermaid default, ASCII for annotated flows, markdown tables for comparisons) with plan-appropriate detail rather than pointing to brainstorm.

- **Relationship to existing Section 4.3 mermaid rule**: Section 4.3 Planning Rules already contains a line encouraging mermaid diagrams "when they clarify relationships or flows that prose alone would make hard to follow — ERDs for data model changes, sequence diagrams for multi-service interactions, state diagrams for lifecycle transitions, flowcharts for complex branching logic." That existing rule applies to solution-design diagrams within the High-Level Technical Design section and per-unit technical design fields — it's an extension of Section 3.4's guidance into the planning rules. The new visual communication guidance applies to plan-readability diagrams in other sections (dependency graphs, interaction diagrams in System-Wide Impact, comparison tables in Overview). Leave the existing Section 4.3 rule as-is and add the new guidance after it as a distinct subsection. The introductory paragraph should distinguish from both Section 3.4 and the existing 4.3 mermaid rule.

## Open Questions

### Resolved During Planning

- **Should we add to the confidence check checklists?** No. The confidence check (Phase 5.3) already has extensive section checklists. Adding visual aid checks there would couple the confidence machinery to optional formatting guidance. The pre-finalization check (Phase 5.1) is the right place, matching brainstorm's approach.
- **What about brainstorm visual aids flowing into plans?** When brainstorm produces a visual aid in the requirements doc, ce:plan's Phase 0.3 carries it forward as part of the origin document. The plan can enrich, replace, or drop it based on whether it's still useful at the implementation level. This doesn't need explicit guidance — the existing "carry forward" contract handles it.

### Deferred to Implementation

- Exact wording of the content-pattern triggers — should match the skill's existing directive tone
- Whether to reference specific plans as examples in a comment (may be too brittle)

## Implementation Units

- [x] **Unit 1: Add visual communication guidance to Phase 4**

**Goal:** Add a guidance block to Phase 4 of ce:plan that teaches the model when and how to include visual aids in plan documents for reader comprehension, distinct from Section 3.4's solution-level technical design.

**Requirements:** R1, R2, R3, R4, R5, R6

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`

**Approach:**

Add a new subsection after Section 4.3 (Planning Rules) and before Phase 5 (Final Review). The block should contain:

1. **Introductory paragraph** — Distinguish from Section 3.4: "Section 3.4 covers diagrams about the *solution being planned*. This guidance covers visual aids that help readers *comprehend the plan document itself*."

2. **When to include** — Use the "When to include / When to skip" pattern matching brainstorm and Section 3.4:

   | Plan content pattern | Visual aid | Placement |
   |---|---|---|
   | 4+ implementation units with non-linear dependencies | Mermaid dependency graph | Before or after the Implementation Units heading |
   | System-Wide Impact naming 3+ interacting surfaces | Mermaid interaction/component diagram | Within System-Wide Impact section |
   | Problem/Overview describing 3+ modes, states, or variants | Markdown comparison table | Within Overview or Problem Frame |
   | Key Technical Decisions with 3+ interacting decisions, or Alternative Approaches with 3+ alternatives | Markdown comparison table | Within the relevant section |

3. **When to skip** — Anti-patterns:
   - The plan is simple and linear with 3 or fewer units in a straight dependency chain
   - Prose already communicates the relationships clearly
   - The visual would duplicate what Section 3.4's High-Level Technical Design already shows
   - The visual describes code-level detail (specific method names, SQL columns, API field lists)

4. **Format selection** — Self-contained guidance matching brainstorm's structure but with plan-appropriate detail:
   - Mermaid (default) for dependency graphs and interaction diagrams — 5-15 nodes, no in-box annotations, TB direction
   - ASCII/box-drawing for annotated flows needing rich in-box content — file path layouts, decision logic branches
   - Markdown tables for mode/variant/decision comparisons
   - Proportionality, inline placement, plan-structure level only, prose-is-authoritative

5. **Pre-finalization check addition** — Add one check to Phase 5.1: "Would a visual aid (dependency graph, interaction diagram, comparison table) help a reader grasp the plan structure faster than scanning prose alone?"

6. **Prose-is-authoritative and accuracy self-check** — Restate briefly: prose governs when visual and prose disagree; verify diagrams match the plan sections they illustrate.

**Patterns to follow:**
- ce:brainstorm SKILL.md lines 222-249 — visual communication guidance structure
- ce:plan Section 3.4 — "When to include / When to skip" table-based guidance pattern

**Test scenarios:**
- Happy path: Planning a feature with 5+ non-linear implementation units produces a plan with a mermaid dependency graph
- Happy path: Planning a feature with 4+ interacting surfaces in System-Wide Impact produces an interaction diagram
- Happy path: Planning a feature where the problem involves 3+ modes produces a comparison table in Overview
- Edge case: Planning a simple 2-unit feature produces no plan-readability visual aids
- Edge case: A Lightweight plan about a complex multi-unit workflow still includes a dependency graph
- Edge case: Section 3.4 already includes a technical design diagram — new visual aids do not duplicate it
- Integration: Modified skill still produces valid plan documents that ce:work can consume

**Verification:**
- The SKILL.md change is contained within Phase 4, between Section 4.3 and Phase 5
- Section 3.4 (High-Level Technical Design) is unchanged
- The plan template is unchanged
- Phase 5.1 has one additional pre-finalization check
- Running ce:plan on a complex multi-unit feature should produce a plan with inline visual aids
- Running ce:plan on a simple feature should produce a plan without plan-readability visual aids

## System-Wide Impact

- **Section 3.4 boundary:** Preserved. The new guidance explicitly distinguishes plan-readability visuals from solution-design visuals. Section 3.4 remains the home for technical design diagrams.
- **Plan template:** Unchanged. Visual aids appear inline within existing sections, not in new required sections.
- **Confidence check (Phase 5.3):** Not modified. The pre-finalization check in Phase 5.1 is sufficient.
- **Document-review compatibility:** Plan-level mermaid blocks and markdown tables are standard markdown that document-review already handles.
- **Brainstorm-to-plan handoff:** Unaffected. ce:brainstorm's visual aids flow through Phase 0.3's "carry forward" contract.
- **Unchanged invariants:** Plan template, Section 3.4 content, confidence check checklists, planning rules, phase ordering.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Visual aids become reflexive (added to every plan) | Content-pattern triggers are explicit and quantitative (4+ units, 3+ surfaces, 3+ modes). Anti-patterns section calls out when to skip |
| Confusion between plan-readability visuals and Section 3.4 solution visuals | Introductory paragraph explicitly distinguishes them. "When to skip" includes "would duplicate what Section 3.4 already shows" |
| Diagram inaccuracy (no code to validate against) | Prose-is-authoritative rule; accuracy self-check instruction; proportionality guideline prevents over-detailed diagrams |

## Sources & References

- Related PR: #437 (feat(ce-brainstorm): add conditional visual aids to requirements documents)
- Related code: `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` (lines 222-249, visual communication guidance)
- Related code: `plugins/compound-engineering/skills/ce-plan/SKILL.md` (Section 3.4 diagram guidance)
- Related plan: `docs/plans/2026-03-29-001-feat-brainstorm-visual-aids-plan.md` (completed, direct precedent)
