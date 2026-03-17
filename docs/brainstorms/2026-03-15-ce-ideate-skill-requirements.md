---
date: 2026-03-15
topic: ce-ideate-skill
---

# ce:ideate — Open-Ended Ideation Skill

## Problem Frame

The ce:brainstorm skill is reactive — the user brings an idea, and the skill helps refine it through collaborative dialogue. There is no workflow for the opposite direction: having the AI proactively generate ideas by deeply understanding the project and then filtering them through critical self-evaluation. Users currently achieve this through ad-hoc prompting (e.g., "come up with 100 ideas and give me your best 10"), but that approach has no codebase grounding, no structured output, no durable artifact, and no connection to the ce:* workflow pipeline.

## Requirements

- R1. ce:ideate is a standalone skill, separate from ce:brainstorm, with its own SKILL.md in `plugins/compound-engineering/skills/ce-ideate/`
- R2. Accepts an optional freeform argument that serves as a focus hint — can be a concept ("DX improvements"), a path ("plugins/compound-engineering/skills/"), a constraint ("low-complexity quick wins"), or empty for fully open ideation
- R3. Performs a deep codebase scan before generating ideas, grounding ideation in the actual project state rather than abstract speculation
- R4. Preserves the user's proven prompt mechanism as the core workflow: generate many ideas first, then systematically and critically reject weak ones, then explain only the surviving ideas in detail
- R5. Self-critiques the full list, rejecting weak ideas with explicit reasoning — the adversarial filtering step is the core quality mechanism
- R6. Presents the top 5-7 surviving ideas with structured analysis: description, rationale, downsides, confidence score (0-100%), estimated complexity
- R7. Includes a brief rejection summary — one-line per rejected idea with the reason — so the user can see what was considered and why it was cut
- R8. Writes a durable ideation artifact to `docs/ideation/YYYY-MM-DD-<topic>-ideation.md` (or `YYYY-MM-DD-open-ideation.md` when no focus area). This compounds — rejected ideas prevent re-exploring dead ends, and un-acted-on ideas remain available for future sessions.
- R9. The default volume (~30 ideas, top 5-7 presented) can be overridden by the user's argument (e.g., "give me your top 3" or "go deep, 100 ideas")
- R10. Handoff options after presenting ideas: brainstorm a selected idea (feeds into ce:brainstorm), refine the ideation (dig deeper, re-evaluate, explore new angles), share to Proof, or end the session
- R11. Always routes to ce:brainstorm when the user wants to act on an idea — ideation output is never detailed enough to skip requirements refinement
- R12. Session completion: when ending, offer to commit the ideation doc to the current branch. If the user declines, leave the file uncommitted. Do not create branches or push — just the local commit.
- R13. Resume behavior: when ce:ideate is invoked, check `docs/ideation/` for ideation docs created within the last 30 days. If a relevant one exists, offer to continue from it (add new ideas, revisit rejected ones, act on un-explored ideas) or start fresh.
- R14. Present the surviving candidates to the user before writing the durable ideation artifact, so the user can ask questions or lightly reshape the candidate set before it is archived
- R15. The ideation artifact must be written or updated before any downstream handoff, Proof sharing, or session end, even though the initial survivor presentation happens first
- R16. Refine routes based on intent: "add more ideas" or "explore new angles" returns to generation (Phase 2), "re-evaluate" or "raise the bar" returns to critique (Phase 3), "dig deeper on idea #N" expands that idea's analysis in place. The ideation doc is updated after each refinement when the refined state is being preserved
- R17. Uses agent intelligence to improve ideation quality, but only as support for the core prompt mechanism rather than as a replacement for it
- R18. Uses existing research agents for codebase grounding, but ideation and critique sub-agents are prompt-defined roles with distinct perspectives rather than forced reuse of existing named review agents
- R19. When sub-agents are used for ideation, each one receives the same grounding summary, the user focus hint, and the current volume target
- R20. Focus hints influence both candidate generation and final filtering; they are not only an evaluation-time bias
- R21. Ideation sub-agents return ideas in a standardized structured format so the orchestrator can merge, dedupe, and reason over them consistently
- R22. The orchestrator owns final scoring, ranking, and survivor decisions across the merged idea set; sub-agents may emit lightweight local signals, but they do not authoritatively rank their own ideas
- R23. Distinct ideation perspectives should be created through prompt framing methods that encourage creative spread without over-constraining the workflow; examples include friction, unmet need, inversion, assumption-breaking, leverage, and extreme-case prompts
- R24. The skill does not hardcode a fixed number of sub-agents for all runs; it should use the smallest useful set that preserves diversity without overwhelming the orchestrator's context window
- R25. When the user picks an idea to brainstorm, the ideation doc is updated to mark that idea as "explored" with a reference to the resulting brainstorm session date, so future revisits show which ideas have been acted on.

## Success Criteria

- A user can invoke `/ce:ideate` with no arguments on any project and receive genuinely surprising, high-quality improvement ideas grounded in the actual codebase
- Ideas that survive the filter are meaningfully better than what the user would get from a naive "give me 10 ideas" prompt
- The workflow uses agent intelligence to widen the candidate pool without obscuring the core generate -> reject -> survivors mechanism
- The user sees and can question the surviving candidates before they are written into the durable artifact
- The ideation artifact persists and provides value when revisited weeks later
- The skill composes naturally with the existing pipeline: ideate → brainstorm → plan → work

## Scope Boundaries

- ce:ideate does NOT produce requirements, plans, or code — it produces ranked ideas
- ce:ideate does NOT modify ce:brainstorm's behavior — discovery of ce:ideate is handled through the skill description and catalog, not by altering other skills
- The skill does not do external research (competitive analysis, similar projects) in v1 — this could be a future enhancement but adds cost and latency without proven need
- No configurable depth modes in v1 — fixed volume with argument-based override is sufficient

## Key Decisions

- **Standalone skill, not a mode within ce:brainstorm**: The workflows are fundamentally different cognitive modes (proactive/divergent vs. reactive/convergent) with different phases, outputs, and success criteria. Combining them would make ce:brainstorm harder to maintain and blur its identity.
- **Durable artifact in docs/ideation/**: Discarding ideation results is anti-compounding. The file is cheap to write and provides value when revisiting un-acted-on ideas or avoiding re-exploration of rejected ones.
- **Artifact written after candidate review, not before initial presentation**: The first survivor presentation is collaborative review, not archival finalization. The artifact should be written only after the candidate set is good enough to preserve, but always before handoff, sharing, or session end.
- **Always route to ce:brainstorm for follow-up**: At ideation depth, ideas are one-paragraph concepts — never detailed enough to skip requirements refinement.
- **Survivors + rejection summary output format**: Full transparency on what was considered without overwhelming with detailed analysis of rejected ideas.
- **Freeform optional argument**: A concept, a path, or nothing at all — the skill interprets whatever it gets as context. No artificial distinction between "focus area" and "target path."
- **Agent intelligence as support, not replacement**: The value comes from the proven ideation-and-rejection mechanism. Parallel sub-agents help produce a richer candidate pool and stronger critique, but the orchestrator remains responsible for synthesis, scoring, and final ranking.

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Which research agents should always run for codebase grounding in v1 beyond `repo-research-analyst` and `learnings-researcher`, if any?
- [Affects R21][Technical] What exact structured output schema should ideation sub-agents return so the orchestrator can merge and score consistently without overfitting the format too early?
- [Affects R6][Technical] Should the structured analysis per surviving idea include "suggested next steps" or "what this would unlock" beyond the current fields (description, rationale, downsides, confidence, complexity)?
- [Affects R2][Technical] How should the skill detect volume overrides in the freeform argument vs. focus-area hints? Simple heuristic or explicit parsing?

## Next Steps

→ `/ce:plan` for structured implementation planning
