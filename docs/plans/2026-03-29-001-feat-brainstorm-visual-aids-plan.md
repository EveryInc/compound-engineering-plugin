---
title: "feat(ce-brainstorm): Add conditional visual aids to requirements documents"
type: feat
status: completed
date: 2026-03-29
deepened: 2026-03-29
---

# feat(ce-brainstorm): Add conditional visual aids to requirements documents

## Overview

Add guidance to ce:brainstorm for including visual communication (flow diagrams, comparison tables, relationship diagrams) in requirements documents when the content warrants it. The goal is faster reader comprehension of workflows, mode differences, and component relationships — not diagrams for their own sake.

## Problem Frame

Requirements documents today are entirely prose and structured bullets. For simple features this is fine. But when requirements describe multi-step workflows (release automation: 26 requirements about a pipeline), behavioral modes (ce:review headless: 4 modes with different behaviors), or multi-actor systems, readers must reconstruct the mental model from dense text. ce:plan often has to create these visuals from scratch during planning — the headless mode plan built a decision matrix that would have been useful at the requirements level.

The onboarding skill generates ASCII architecture and flow diagrams for ONBOARDING.md, but it has the advantage of an implemented codebase to analyze. Brainstorm works from ideas and decisions, so its visual aids must be conceptual — derived from the requirements content itself, not from code.

## Requirements Trace

- R1. The brainstorm skill includes guidance for when visual aids genuinely improve a requirements document
- R2. Visual aids are conditional on content patterns, not on depth classification — a Lightweight brainstorm about a complex workflow may warrant a diagram; a Deep brainstorm about a straightforward feature may not
- R3. Visual aids are placed inline where they're most relevant (typically after Problem Frame or within Requirements), not in a separate "Diagrams" section
- R4. Three diagram types are supported at the requirements level: user/workflow flow diagrams (mermaid or ASCII depending on annotation density), mode/variant comparison tables, and actor/component relationship diagrams (mermaid or ASCII depending on layout needs)
- R5. Visual aids stay at the conceptual level — user flows, information flows, mode comparisons — not implementation architecture, data schemas, or code structure
- R6. The existing document template, pre-finalization checklist, and brainstorm-to-plan contract remain intact

## Scope Boundaries

- Not adding visual aids to ce:plan (it already has High-Level Technical Design guidance)
- Not making diagrams mandatory for any depth classification
- Not adding code-analysis-driven diagrams (brainstorm has no implemented codebase to analyze)
- Not changing the document template structure or section ordering
- Not adding a separate "Diagrams" section to the template

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` — the skill to modify; Phase 3 (lines 154-260) contains the output template and document guidance
- `plugins/compound-engineering/skills/ce-plan/SKILL.md` (Section 3.4, lines 301-326) — existing diagram type selection matrix at the planning level; serves as design reference
- `plugins/compound-engineering/skills/onboarding/SKILL.md` — prior art for ASCII diagram generation in skill output; uses format constraints (80-column max), conditional inclusion based on system complexity
- `docs/brainstorms/2026-03-17-release-automation-requirements.md` — example where a workflow flow diagram would have helped (26 requirements describing a multi-step release pipeline)
- `docs/brainstorms/2026-03-28-ce-review-headless-mode-requirements.md` — example where a mode comparison table would have helped (4 modes with different behaviors; ce:plan had to build this from scratch)
- `docs/brainstorms/2026-03-25-vonboarding-skill-requirements.md` — example where no diagram was needed (simple, linear feature)
- `docs/plans/2026-03-28-001-feat-ce-review-headless-mode-plan.md` — the decision matrix ce:plan created that would have been useful upstream

### Institutional Learnings

- The brainstorm-to-plan contract is tightly specified (ce-plan-rewrite requirements, R7). Changes must preserve the fields ce:plan depends on.
- ce:plan's diagram selection matrix maps work characteristics to diagram types. Brainstorm-level visuals should be simpler (conceptual, not technical).
- No existing learnings about diagram generation quality or mermaid gotchas exist in docs/solutions/.

## Key Technical Decisions

- **Inline placement, not a separate section**: Visual aids appear where they're most relevant to the content (after Problem Frame, within Requirements when comparing modes, etc.). A dedicated "Diagrams" section would invite diagrams for diagrams' sake. This mirrors how good technical writing uses figures — at the point of relevance, not in an appendix.

- **Product-level content triggers, not depth triggers**: Whether to include a visual aid depends on what the requirements are describing, not on whether the brainstorm is Lightweight/Standard/Deep. Triggers are product-level patterns (user workflows, approach comparisons, entity relationships), not implementation-level patterns (multi-component integration, state machines, data pipelines — those belong in ce:plan). "Actors" means distinct participants whose interactions the requirements describe — user roles, system components, or external services.

- **Format selection by diagram complexity**: Two formats, chosen by what the diagram needs to communicate:
  - **Mermaid** for simple flows (5-15 nodes, no in-box annotations, standard flowchart shapes). Renders as SVG in GitHub and Proof; source text readable as fallback. Use top-to-bottom (`TB`) direction for narrow source. This is the default for most brainstorm diagrams.
  - **ASCII/box-drawing diagrams** for annotated flows that need rich in-box content (CLI commands, decision logic branches, file path layouts, multi-column spatial arrangements). These are more expressive than mermaid when the diagram's value comes from *annotations within steps*, not just the flow between them. Follow onboarding's width constraints: vertical stacking, 80-column max for code blocks.
  - **Markdown tables** for mode/variant comparisons and approach comparisons. Tables wrap naturally in renderers — no width concern.
  - Keep diagrams proportionate to the content. A 5-step workflow gets ~5-10 nodes. A complex 5-step workflow with decision branches and CLI commands at each step may need ~15-20 nodes — that's fine if every node earns its place. If a diagram exceeds ~15 nodes, it should be because the workflow genuinely has that many meaningful steps, not because the diagram is over-detailed.

- **Prose is authoritative over diagrams**: When a visual aid and its surrounding prose disagree, the prose governs. Document-review already encodes this assumption in its auto-fix patterns. Diagrams illustrate what the prose describes — they are not an independent source of truth.

- **Guidance, not enforcement**: Add visual communication guidance in Phase 3 using the established "When to include / When to skip" pattern (matching ce:plan Section 3.4). The pre-finalization checklist gets one additional check. The template does not get a new required section.

## Open Questions

### Resolved During Planning

- **Where in the skill?** Phase 3 (Capture the Requirements), as a new guidance block between the template and the pre-finalization checklist. This is where the model is composing the document and making formatting decisions.
- **What format for flow diagrams?** Mermaid. More portable than ASCII, renders in GitHub/Proof, and aligns with ce:plan's approach.
- **Should the template itself change?** No. The template stays as-is. The guidance block instructs the model on when and where to add visual aids within the existing template structure.

### Deferred to Implementation

- Exact wording of the detection heuristics — should match the skill's existing tone and concision
- Whether to include a small inline example of each diagram type or just describe them

## Implementation Units

- [x] **Unit 1: Add visual communication guidance to Phase 3**

**Goal:** Add a guidance block to Phase 3 of ce:brainstorm that teaches the model when and how to include visual aids in requirements documents.

**Requirements:** R1, R2, R3, R4, R5, R6

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md`

**Approach:**

Add a new subsection in Phase 3, after the closing of the document template code block and before the "For **Standard** and **Deep** brainstorms" paragraph. The block should contain:

1. **When to include** — Use the established "When to include / When to skip" structure (matching ce:plan Section 3.4). Include a visual aid when:
   - Requirements describe a multi-step user workflow or process → mermaid flow diagram after Problem Frame
   - Requirements define 3+ behavioral modes, variants, or states → markdown comparison table in Requirements section
   - Requirements involve 3+ interacting participants (user roles, system components, external services) whose interactions the requirements describe → mermaid relationship diagram after Problem Frame
   - Multiple competing approaches are compared → comparison table in the approach exploration

2. **When to skip** — Do not add a visual aid when:
   - Prose already communicates the concept clearly
   - The diagram would just restate the requirements in visual form without adding comprehension value
   - The visual describes implementation architecture, data schemas, state machines, or code structure (that's ce:plan's domain)
   - The brainstorm is simple and linear with no multi-step flows, mode comparisons, or multi-actor interactions

3. **Format selection:**
   - **Mermaid** (default) for simple flows — 5-15 nodes, no in-box annotations, standard flowchart shapes. Use `TB` (top-to-bottom) direction. Source should be readable as fallback in diff views and terminals.
   - **ASCII/box-drawing diagrams** for annotated flows that need rich in-box content — CLI commands at each step, decision logic branches, file path layouts, multi-column spatial arrangements. Follow onboarding's width constraints: vertical stacking, 80-column max for code blocks.
   - **Markdown tables** for mode/variant comparisons and approach comparisons.
   - Keep diagrams proportionate: a 5-step workflow gets ~5-10 nodes; a complex workflow with decision branches and annotations at each step may need ~15-20 nodes. Every node should earn its place.
   - Place inline at the point of relevance, not in a separate section. A substantial flow (>10 nodes) may warrant its own `## User Flow` or `## Architecture` heading between Problem Frame and Requirements.
   - Conceptual level only — user flows, information flows, mode comparisons, component responsibilities
   - Prose is authoritative: when a visual aid and its surrounding prose disagree, the prose governs

4. **Pre-finalization checklist addition** — Add one check to the existing "Before finalizing, check:" block: "Would a visual aid (flow diagram, comparison table, relationship diagram) help a reader grasp the requirements faster than prose alone?"

5. **Diagram accuracy self-check** — Add guidance that after generating a visual aid, the model should verify the diagram accurately represents the prose requirements (correct sequence, no missing branches, no merged steps). Diagrams without code to validate against carry higher inaccuracy risk than code-backed diagrams.

**Patterns to follow:**
- ce:plan SKILL.md Section 3.4 — diagram type selection matrix with "when to include" / "when to skip" guidance
- The existing Phase 3 guidance style — concise, directive, with clear triggers for inclusion

**Test scenarios:**
- Happy path: Generating a requirements document for a multi-step workflow feature produces an inline mermaid flow diagram
- Happy path: Generating a requirements document for a feature with multiple behavioral modes produces a comparison table
- Edge case: Generating a requirements document for a simple, linear feature produces no visual aids
- Edge case: A Lightweight brainstorm about a complex workflow still includes a diagram (depth does not gate visual aids)
- Integration: The modified skill still produces valid requirements documents that ce:plan can consume (brainstorm-to-plan contract preserved)

**Verification:**
- The SKILL.md change is self-contained within Phase 3
- The document template section ordering and required fields are unchanged
- The pre-finalization checklist has one additional visual-aid check
- Running the brainstorm skill on a workflow-heavy feature should produce a document with an inline mermaid diagram
- Running the brainstorm skill on a simple feature should produce a document without diagrams

## System-Wide Impact

- **Brainstorm-to-plan contract:** Preserved. No template fields are added or removed. Visual aids are optional inline additions within existing sections. ce:plan's Phase 0.3 carries forward Problem Frame, Requirements, Success Criteria, Scope Boundaries, Key Decisions, Dependencies/Assumptions, and Outstanding Questions — none of these are affected.
- **Document-review compatibility:** The document-review skill reviews brainstorm output. Inline mermaid blocks and markdown tables are standard markdown that document-review can process without changes.
- **Converter compatibility:** Brainstorm output is not consumed by converters. No cross-platform impact.
- **Unchanged invariants:** Template structure, section ordering, requirement ID format, Outstanding Questions split (Resolve Before Planning / Deferred to Planning), and the pre-finalization checklist's existing checks all remain intact.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Visual aids become reflexive (added when not helpful) | Detection heuristics are explicit: multi-step workflow, 3+ modes, 3+ actors. Anti-patterns section explicitly calls out when NOT to include visuals |
| Diagrams introduce inaccurate mental models (no code to validate against) | Conceptual-level constraint: user flows and mode comparisons only, not implementation architecture. Explicit diagram accuracy self-check: verify diagram matches prose requirements (correct sequence, no missing branches). Prose is authoritative — document-review already auto-corrects prose/diagram contradictions toward prose |
| Mermaid syntax errors in generated output | Low risk — mermaid flow syntax is simple. ASCII/box-drawing diagrams are an alternative for complex annotated flows. If mermaid fails to render, the source text is still readable |

## Sources & References

- Related code: `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` (Phase 3)
- Related code: `plugins/compound-engineering/skills/ce-plan/SKILL.md` (Section 3.4 diagram guidance)
- Related code: `plugins/compound-engineering/skills/onboarding/SKILL.md` (ASCII diagram generation, width constraints)
- Related brainstorms: `docs/brainstorms/2026-03-17-release-automation-requirements.md` (would have benefited from flow diagram)
- Related plans: `docs/plans/2026-03-28-001-feat-ce-review-headless-mode-plan.md` (built decision matrix that would have been useful upstream)
- Reference example: printing-press publish skill requirements doc — strong real-world example of ASCII flow diagram (5-step user flow with decision branches) and architecture diagram (file layout + component responsibilities) in a requirements document with 34 requirements
