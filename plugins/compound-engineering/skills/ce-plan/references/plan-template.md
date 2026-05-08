# Plan Template

The core plan template below covers all standard sections used by Lightweight, Standard, and Deep tiers. Omit clearly inapplicable optional sections — especially for Lightweight plans. Optional Deep extensions follow the core template; include only the ones that genuinely help.

When composing the plan body in Phase 4, fill the placeholders, drop sections that don't apply, and apply the planning rules and visual-communication guidance from the SKILL.md (Section 4.3, 4.4).

## Core Plan Template

```markdown
---
title: [Plan Title]
type: [feat|fix|refactor]
status: active
date: YYYY-MM-DD
origin: docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md  # include when planning from a requirements doc
deepened: YYYY-MM-DD  # optional, set when the confidence check substantively strengthens the plan
---

# [Plan Title]

## Summary

[1-3 line prose summary — what the plan is proposing, in plain language. Forward-looking. With an origin requirements doc, focus on HOW the implementation approaches the work (the WHAT is in origin); without one, carry both WHAT scope and HOW execution. Required for all tiers; skip only for truly-trivial plans (≤ 2 Requirements bullets that echo the prompt).]

---

## Problem Frame

[Backward-looking / situational: the user/business problem and context that motivates this plan. Establishes the pain — does NOT restate the proposal (that lives in Summary). With an origin requirements doc, keep this brief (1-2 sentences plus any plan-specific framing) and link to origin via Sources & References. Without one, carry the full pain narrative. **Omit entirely at Lightweight tier when Summary already carries the situational context** — a focused bug fix or one-line change rarely needs both sections.]

---

<!-- Include ONLY in non-interactive (headless) mode when the agent had Inferred bets that
     were not user-confirmed. Lists the un-validated agent inferences explicitly so downstream
     review (ce-doc-review, ce-work, human PR review) can scrutinize them as bets, not as
     authoritative decisions. Omit entirely in interactive mode — Inferred bets get user-
     corrected in chat and become Key Technical Decisions or are revised away. -->
## Assumptions

*This plan was authored without synchronous user confirmation. The items below are agent inferences that fill gaps in the input — un-validated bets that should be reviewed before implementation proceeds.*

- [Inferred item the agent chose without user confirmation]

---

## Requirements

- R1. [Requirement or success criterion this plan must satisfy]
- R2. [Requirement or success criterion this plan must satisfy]

<!-- With an origin requirements doc, R-IDs trace to origin's; without one, R-IDs are derived
     during planning. The optional origin trace sub-blocks below carry forward what's relevant
     when origin actors/flows/acceptance examples exist. -->

**Origin actors:** [A1 (role/name), A2 (role/name), …]
**Origin flows:** [F1 (flow name), F2 (flow name), …]
**Origin acceptance examples:** [AE1 (covers R1, R4), AE2 (covers R3), …]

---

## Scope Boundaries

<!-- Default structure (no origin doc, or origin was Lightweight / Standard / Deep-feature):
     a single bulleted list of explicit non-goals. The optional `### Deferred to Follow-Up Work`
     subsection below may still be included when this plan's implementation is intentionally
     split across other PRs/issues/repos. -->

- [Explicit non-goal or exclusion]

<!-- Optional plan-local subsection — include when this plan's implementation is intentionally
     split across other PRs, issues, or repos. Distinct from origin-carried "Deferred for later"
     (product sequencing) and "Outside this product's identity" (positioning). -->
### Deferred to Follow-Up Work

- [Work that will be done separately]: [Where or when -- e.g., "separate PR in repo-x", "future iteration"]

<!-- Triggered structure: replace the single list above with the three subsections below ONLY
     when the origin doc is Deep-product (detectable by presence of an "Outside this product's
     identity" subsection in the origin's Scope Boundaries). At all other tiers and when no
     origin exists, use the single-list structure above. -->

<!--
### Deferred for later

[Carried from origin — product/version sequencing. Work that will be done eventually but not in v1.]

- [Item]

### Outside this product's identity

[Carried from origin — positioning rejection. Adjacent product the plan must not accidentally build.]

- [Item]

### Deferred to Follow-Up Work

[Plan-local — implementation work intentionally split across other PRs/issues/repos. Distinct from origin's "Deferred for later" (product) and "Outside this product's identity" (positioning).]

- [Item]
-->

---

## Context & Research

### Relevant Code and Patterns

- [Existing file, class, component, or pattern to follow]

### Institutional Learnings

- [Relevant `docs/solutions/` insight]

### External References

- [Relevant external docs or best-practice source, if used]

---

## Key Technical Decisions

- [Decision]: [Rationale]

<!-- With an origin requirements doc, scope this section to plan-time architectural choices —
     product-level decisions are in origin's Key Decisions. Without an origin, both belong here. -->

---

## Open Questions

<!-- With an origin requirements doc, scope this section to plan-time questions; product-level
     open questions stay in origin's Outstanding Questions. -->

### Resolved During Planning

- [Question]: [Resolution]

### Deferred to Implementation

- [Question or unknown]: [Why it is intentionally deferred]

---

<!-- Optional: Include when the plan creates a new directory structure (greenfield plugin,
     new service, new package). Shows the expected output shape at a glance. Omit for plans
     that only modify existing files. This is a scope declaration, not a constraint --
     the implementer may adjust the structure if implementation reveals a better layout. -->
## Output Structure

    [directory tree showing new directories and files]

---

<!-- Optional: Include this section only when the work involves DSL design, multi-component
     integration, complex data flow, state-heavy lifecycle, or other cases where prose alone
     would leave the approach shape ambiguous. Omit it entirely for well-patterned or
     straightforward work. -->
## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

[Pseudo-code grammar, mermaid diagram, data flow sketch, or state diagram — choose the medium that best communicates the solution shape for this work.]

---

## Implementation Units

<!-- Each unit carries a stable plan-local U-ID (U1, U2, …) assigned sequentially.
     U-IDs are never renumbered: reordering preserves them in place, splitting keeps the
     original U-ID and assigns the next unused number to the new unit, deletion leaves
     a gap. This anchor is what ce-work references in blockers and verification, so
     stability across plan edits is load-bearing. -->

### U1. [Name]

**Goal:** [What this unit accomplishes]

**Requirements:** [R1, R2]

**Dependencies:** [None / U1 / external prerequisite]

**Files:**
- Create: `path/to/new_file`
- Modify: `path/to/existing_file`
- Test: `path/to/test_file`

**Approach:**
- [Key design or sequencing decision]

**Execution note:** [Optional test-first, characterization-first, or other execution posture signal]

**Technical design:** *(optional -- pseudo-code or diagram when the unit's approach is non-obvious. Directional guidance, not implementation specification.)*

**Patterns to follow:**
- [Existing file, class, or pattern]

**Test scenarios:**
<!-- Include only categories that apply to this unit. Omit categories that don't. For units with no behavioral change, use "Test expectation: none -- [reason]" instead of leaving this section blank. -->
- [Scenario: specific input/action -> expected outcome. Prefix with category — Happy path, Edge case, Error path, or Integration — to signal intent]

**Verification:**
- [Outcome that should hold when this unit is complete]

---

## System-Wide Impact

- **Interaction graph:** [What callbacks, middleware, observers, or entry points may be affected]
- **Error propagation:** [How failures should travel across layers]
- **State lifecycle risks:** [Partial-write, cache, duplicate, or cleanup concerns]
- **API surface parity:** [Other interfaces that may require the same change]
- **Integration coverage:** [Cross-layer scenarios unit tests alone will not prove]
- **Unchanged invariants:** [Existing APIs, interfaces, or behaviors that this plan explicitly does not change — and how the new work relates to them. Include when the change touches shared surfaces and reviewers need blast-radius assurance]

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| [Meaningful risk] | [How it is addressed or accepted] |

---

## Documentation / Operational Notes

- [Docs, rollout, monitoring, or support impacts when relevant]

---

## Sources & References

- **Origin document:** [docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md](path)
- Related code: [path or symbol]
- Related PRs/issues: #[number]
- External docs: [url]
```

## Deep Extensions

For larger `Deep` plans, extend the core template only when useful with the sections below. Each is optional — include only when it improves execution quality or stakeholder alignment.

```markdown
## Alternative Approaches Considered

- [Approach]: [Why rejected or not chosen]

---

## Success Metrics

- [How we will know this solved the intended problem]

---

## Dependencies / Prerequisites

- [Technical, organizational, or rollout dependency]

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| [Risk] | [Low/Med/High] | [Low/Med/High] | [How addressed] |

---

## Phased Delivery

### Phase 1
- [What lands first and why]

### Phase 2
- [What follows and why]

---

## Documentation Plan

- [Docs or runbooks to update]

---

## Operational / Rollout Notes

- [Monitoring, migration, feature flag, or rollout considerations]
```
