# Requirements Capture

This content is loaded when Phase 3 begins — after the collaborative dialogue (Phases 0-2) has produced durable decisions worth preserving.

---

This document should behave like a lightweight PRD without PRD ceremony. Include what planning needs to execute well, and skip sections that add no value for the scope.

The requirements document is for product definition and scope control. Do **not** include implementation details such as libraries, schemas, endpoints, file layouts, or code structure unless the brainstorm is inherently technical and those details are themselves the subject of the decision.

**Required content for non-trivial work:**
- Problem frame
- Concrete requirements or intended behavior with stable IDs
- Scope boundaries
- Success criteria

**Include when materially useful:**
- Key decisions and rationale
- Dependencies or assumptions
- Outstanding questions
- Alternatives considered
- High-level technical direction only when the work is inherently technical and the direction is part of the product/architecture decision

**Document structure:** Use this template and omit clearly inapplicable optional sections:

```markdown
---
date: YYYY-MM-DD
topic: <kebab-case-topic>
---

# <Topic Title>

## Problem Frame
[Who is affected, what is changing, and why it matters]

## Requirements

**[Group Header]**
- R1. [Concrete requirement in this group]
- R2. [Concrete requirement in this group]

**[Group Header]**
- R3. [Concrete requirement in this group]

## Success Criteria
- [How we will know this solved the right problem]

## Scope Boundaries
- [Deliberate non-goal or exclusion]

## Key Decisions
- [Decision]: [Rationale]

## Dependencies / Assumptions
- [Only include if material]

## Outstanding Questions

### Resolve Before Planning
- [Affects R1][User decision] [Question that must be answered before planning can proceed]

### Deferred to Planning
- [Affects R2][Technical] [Question that should be answered during planning or codebase exploration]
- [Affects R2][Needs research] [Question that likely requires research during planning]

## Next Steps
[If `Resolve Before Planning` is empty: `-> /ce-plan` for structured implementation planning]
[If `Resolve Before Planning` is not empty: `-> Resume /ce-brainstorm` to resolve blocking questions before planning]
```

**Visual communication** — Include a visual aid when the requirements would be significantly easier to understand with one. Read `references/visual-communication.md` for the decision criteria, format selection, and placement rules.

For **Standard** and **Deep** brainstorms, a requirements document is usually warranted.

For **Lightweight** brainstorms, keep the document compact. Skip document creation when the user only needs brief alignment and no durable decisions need to be preserved.

For very small requirements docs with only 1-3 simple requirements, plain bullet requirements are acceptable. For **Standard** and **Deep** requirements docs, use stable IDs like `R1`, `R2`, `R3` so planning and later review can refer to them unambiguously.

When requirements span multiple distinct concerns, group them under bold topic headers within the Requirements section. The trigger for grouping is distinct logical areas, not item count — even four requirements benefit from headers if they cover three different topics. Group by logical theme (e.g., "Packaging", "Migration and Compatibility", "Contributor Workflow"), not by the order they were discussed. Requirements keep their original stable IDs — numbering does not restart per group. A requirement belongs to whichever group it fits best; do not duplicate it across groups. Skip grouping only when all requirements are about the same thing.

When the work is simple, combine sections rather than padding them. A short requirements document is better than a bloated one.

Before finalizing, check:
- What would `ce-plan` still have to invent if this brainstorm ended now?
- Do any requirements depend on something claimed to be out of scope?
- Are any unresolved items actually product decisions rather than planning questions?
- Did implementation details leak in when they shouldn't have?
- Do any requirements claim that infrastructure is absent without that claim having been verified against the codebase? If so, verify now or label as an unverified assumption.
- Is there a low-cost change that would make this materially more useful?
- Would a visual aid (flow diagram, comparison table, relationship diagram) help a reader grasp the requirements faster than prose alone?

If planning would need to invent product behavior, scope boundaries, or success criteria, the brainstorm is not complete yet.

Ensure `docs/brainstorms/` directory exists before writing.

If a document contains outstanding questions:
- Use `Resolve Before Planning` only for questions that truly block planning
- If `Resolve Before Planning` is non-empty, keep working those questions during the brainstorm by default
- If the user explicitly wants to proceed anyway, convert each remaining item into an explicit decision, assumption, or `Deferred to Planning` question before proceeding
- Do not force resolution of technical questions during brainstorming just to remove uncertainty
- Put technical questions, or questions that require validation or research, under `Deferred to Planning` when they are better answered there
- Use tags like `[Needs research]` when the planner should likely investigate the question rather than answer it from repo context alone
- Carry deferred questions forward explicitly rather than treating them as a failure to finish the requirements doc
