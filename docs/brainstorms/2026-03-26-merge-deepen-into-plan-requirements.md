---
date: 2026-03-26
topic: merge-deepen-into-plan
---

# Merge Deepen-Plan Into ce:plan

## Problem Frame

The ce:plan and deepen-plan skills form a sequential workflow where the user is offered a choice ("want to deepen?") that they can't evaluate better than the agent can. When deepen-plan runs, it already evaluates whether deepening is warranted and gates itself accordingly. The user decision adds friction without adding value.

With current model capabilities, the original concern about over-investing in planning is no longer a meaningful risk — the deepening skill already self-gates on scope and confidence scoring.

## Requirements

- R1. ce:plan automatically evaluates and deepens its own output after the initial plan is written, without asking the user for approval.
- R2. When deepening runs, ce:plan reports what sections it's strengthening and why (transparency without requiring a decision).
- R3. Deepening is skipped for Lightweight plans unless high-risk topics are detected (preserving the existing gate logic from deepen-plan).
- R4. For Standard and Deep plans, ce:plan scores confidence gaps using deepen-plan's checklist-first, risk-weighted scoring. If no gaps exceed the threshold, it reports "confidence check passed" and moves on.
- R5. When gaps are found, ce:plan dispatches targeted research agents (deepen-plan's deterministic agent mapping) to strengthen only the weak sections.
- R6. The deepen-plan skill is removed as a standalone command. Re-deepening an existing plan is handled by re-running ce:plan in resume mode. In resume mode, ce:plan applies the same confidence-gap evaluation as on a fresh plan — it deepens only if gaps warrant it, unless the user explicitly requests deepening.
- R7. The "Run deepen-plan" post-generation option in ce:plan is removed. Post-generation options become simpler.

## Success Criteria

- ce:plan produces plans at least as strong as the old ce:plan + manual deepen-plan flow
- Users never need to decide whether to deepen — the agent handles it
- Users see what's being strengthened (no black box)
- One fewer skill to know about, simpler workflow
- No regression in plan quality for any scope tier (Lightweight, Standard, Deep)

## Scope Boundaries

- This does not change what deepening does — only where it lives and who decides to run it
- No changes to the deepening logic itself (confidence scoring, agent selection, section rewriting)
- No changes to ce:brainstorm or ce:work
- The planning boundary (no code, no commands) is preserved
- deepen-plan scratch space (`.context/compound-engineering/deepen-plan/`) moves under ce:plan's namespace

## Key Decisions

- **Agent decides, user informed**: The agent evaluates whether deepening adds value and proceeds automatically. The user sees a brief status message about what's being strengthened but doesn't approve it. Why: the user can't evaluate this better than the agent, and the existing gate logic already prevents wasteful deepening.
- **No standalone deepen command**: Re-deepening existing plans is handled through ce:plan's resume mode. Why: simpler mental model, one entry point for all planning work.
- **Absorb, don't invoke**: The deepening logic is folded into ce:plan as a new phase rather than ce:plan invoking deepen-plan as a sub-skill. Why: eliminates a skill boundary and simplifies maintenance.

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] Where exactly in ce:plan's phase structure should the confidence check and deepening phase land — as a new Phase 5 before the current post-generation options, or integrated into Phase 4 (plan writing)?
- [Affects R6][Technical] How should ce:plan's resume mode distinguish "resume an incomplete plan" from "re-deepen a completed plan"? Likely frontmatter-based (`deepened: YYYY-MM-DD` presence).
- [Affects R5][Technical] Should deepen-plan's artifact-backed research mode (for larger scope) use `.context/compound-engineering/ce-plan/deepen/` or a per-run subdirectory?

## Next Steps

-> /ce:plan for structured implementation planning
