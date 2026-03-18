---
date: 2026-03-14
topic: ce-plan-rewrite
---

# Rewrite `ce:plan` to Separate Planning from Implementation

## Problem Frame

`ce:plan` sits between `ce:brainstorm` and `ce:work`, but the current skill mixes issue authoring, technical planning, and pseudo-implementation. That makes plans brittle and pushes the planning phase to predict details that are often only discoverable during implementation. PR #246 intensifies this by asking plans to include complete code, exact commands, and micro-step TDD and commit choreography. The rewrite should keep planning strong enough for a capable agent or engineer to execute, while moving code-writing, test-running, and execution-time learning back into `ce:work`.

## Requirements

- R1. `ce:plan` must accept either a raw feature description or a requirements document produced by `ce:brainstorm` as primary input.
- R2. `ce:plan` must preserve compound-engineering's planning strengths: repo pattern scan, institutional learnings, conditional external research, and requirements-gap checks when warranted.
- R3. `ce:plan` must produce a durable implementation plan focused on decisions, sequencing, file paths, dependencies, risks, and test scenarios, not implementation code.
- R4. `ce:plan` must not instruct the planner to run tests, generate exact implementation snippets, or learn from execution-time results. Those belong to `ce:work`.
- R5. Plan tasks and subtasks must be right-sized for implementation handoff, but sized as logical units or atomic commits rather than 2-5 minute copy-paste steps.
- R6. Plans must remain shareable and portable as documents or issues without tool-specific executor litter such as TodoWrite instructions, `/ce:work` choreography, or git command recipes in the artifact itself.
- R7. `ce:plan` must carry forward product decisions, scope boundaries, success criteria, and deferred questions from `ce:brainstorm` without re-inventing them.
- R8. `ce:plan` must explicitly distinguish what gets resolved during planning from what is intentionally deferred to implementation-time discovery.
- R9. `ce:plan` must hand off cleanly to `ce:work`, giving enough information for task creation without pre-writing code.
- R10. If detail levels remain, they must change depth of analysis and documentation, not the planning philosophy. A small plan can be terse while still staying decision-first.
- R11. If an upstream requirements document contains unresolved `Resolve Before Planning` items, `ce:plan` must classify whether they are true product blockers or misfiled technical questions before proceeding.
- R12. `ce:plan` must not plan past unresolved product decisions that would change behavior, scope, or success criteria, but it may absorb technical or research questions by reclassifying them into planning-owned investigation.
- R13. When true blockers remain, `ce:plan` must pause helpfully: surface the blockers, allow the user to convert them into explicit assumptions or decisions, or route them back to `ce:brainstorm`.

## Success Criteria

- A fresh implementer can start work from the plan without needing clarifying questions, but the plan does not contain implementation code.
- `ce:work` can derive actionable tasks from the plan without relying on micro-step commands or embedded git/test instructions.
- Plans stay accurate longer as repo context changes because they capture decisions and boundaries rather than speculative code.
- A requirements document from `ce:brainstorm` flows into planning without losing decisions, scope boundaries, or success criteria.
- Plans do not proceed past unresolved product blockers unless the user explicitly converts them into assumptions or decisions.
- For the same feature, the rewritten `ce:plan` produces output that is materially shorter and less brittle than the current skill or PR #246's proposed format while remaining execution-ready.

## Scope Boundaries

- Do not redesign `ce:brainstorm`'s product-definition role.
- Do not remove decomposition, file paths, verification, or risk analysis from `ce:plan`.
- Do not move planning into a vague, under-specified artifact that leaves execution to guess.
- Do not change `ce:work` in this phase beyond possible follow-up clarification of what plan structure it should prefer.
- Do not require heavyweight PRD ceremony for small or straightforward work.

## Key Decisions

- Use a hybrid model: keep compound-engineering's research and handoff strengths, but adopt iterative-engineering's "decisions, not code" boundary.
- Planning stops before execution: no running tests, no fail/pass learning, no exact implementation snippets, and no commit shell commands in the plan.
- Use logical tasks and subtasks sized around atomic changes or commit units rather than 2-5 minute micro-steps.
- Keep explicit verification and test scenarios, but express them as expected coverage and validation outcomes rather than commands with predicted output.
- Preserve `ce:brainstorm` as the preferred upstream input when available, with clear handling for deferred technical questions.
- Treat `Resolve Before Planning` as a classification gate: planning first distinguishes true product blockers from technical questions, then investigates only the latter.

## High-Level Direction

- Phase 0: Resume existing plan work when relevant, detect brainstorm input, and assess scope.
- Phase 1: Gather context through repo research, institutional learnings, and conditional external research.
- Phase 2: Resolve planning-time technical questions and capture implementation-time unknowns separately.
- Phase 3: Structure the plan around components, dependencies, files, test targets, risks, and verification.
- Phase 4: Write a right-sized plan artifact whose depth varies by scope, but whose boundary stays planning-only.
- Phase 5: Review and hand off to refinement, deeper research, issue sharing, or `ce:work`.

## Alternatives Considered

- Keep the current `ce:plan` and only reject PR #246.
  Rejected because the underlying issue remains: the current skill already drifts toward issue-template output plus pseudo-implementation.
- Adopt Superpowers `writing-plans` nearly wholesale.
  Rejected because it is intentionally execution-script-oriented and collapses planning into detailed code-writing and command choreography.
- Adopt iterative-engineering `tech-planning` wholesale.
  Rejected because it would lose useful compound-engineering behaviors such as brainstorm-origin integration, institutional learnings, and richer post-plan handoff options.

## Dependencies / Assumptions

- `ce:work` can continue creating its own actionable task list from a decision-first plan.
- If `ce:work` later benefits from an explicit section such as `## Implementation Units` or `## Work Breakdown`, that should be a separate follow-up designed around execution needs rather than micro-step code generation.

## Resolved During Planning

- [Affects R10][Technical] Replaced `MINIMAL` / `MORE` / `A LOT` with `Lightweight` / `Standard` / `Deep` to align `ce:plan` with `ce:brainstorm`'s scope model.
- [Affects R9][Technical] Updated `ce:work` to explicitly consume decision-first plan sections such as `Implementation Units`, `Requirements Trace`, `Files`, `Test Scenarios`, and `Verification`.
- [Affects R2][Needs research] Kept SpecFlow as a conditional planning aid: use it for `Standard` or `Deep` plans when flow completeness is unclear rather than making it mandatory for every plan.

## Next Steps

-> Review, refine, and commit the `ce:plan` and `ce:work` rewrite
