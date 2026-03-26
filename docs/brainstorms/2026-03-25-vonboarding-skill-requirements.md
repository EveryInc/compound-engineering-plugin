---
date: 2026-03-25
topic: onboarding-skill
---

# Onboarding: Codebase Onboarding Document Generator

## Problem Frame

Onboarding is a general problem in software, but it is more acute in fast-moving codebases where code is written faster than documentation — whether through AI-assisted development, rapid prototyping, or simply a team that ships faster than it documents. The traditional assumption that the creator can explain the codebase breaks down when they didn't fully understand it to begin with, or when the codebase has evolved beyond any one person's mental model. New team members (and AI agents brought into the project) are left without the mental model they need to contribute effectively.

The primary audience is human developers. A document that works for human comprehension is also effective as agent context, but the inverse is not true.

## Requirements

- R1. A skill named `onboarding` that crawls a repository and generates `ONBOARDING.md` at the repo root
- R2. The skill always regenerates the full document from scratch — no surgical updates or diffing against a previous version
- R3. The document has a fixed filename (`ONBOARDING.md`) so the skill can detect whether one already exists; existence is the only state — no separate mode flag
- R4. The document contains exactly five sections, each earning its place by answering a question a new contributor will ask in their first hour:
  - **What is this thing?** — Purpose, who it's for, what problem it solves
  - **How is it organized?** — Architecture, key modules, how they connect, and what the system depends on externally (databases, APIs, services, env vars)
  - **Key concepts and abstractions** — The vocabulary and architectural patterns needed to talk about and reason about this codebase
  - **Primary flow** — One concrete path through the system showing how the pieces connect (the main thing the app does)
  - **Where do I start?** — Dev setup, how to run it, where to make common types of changes
- R5. During the crawl, if `docs/solutions/` or other existing documentation is discovered and is directly relevant to a section's content, link to it inline within that section. Do not create a separate references/further-reading section. If no relevant docs exist, the document stands on its own without mentioning their absence.
- R6. The document is written for human comprehension first — clear prose, not agent-formatted structured data
- R7. Use visual aids — ASCII diagrams, markdown tables — where they improve readability over prose. Architecture overviews and flow traces especially benefit from diagrams.
- R8. Use proper markdown formatting throughout — backticks for file names, paths, commands, code references, and technical terms. Consistent styling maximizes legibility.

## Success Criteria

- A new contributor can read `ONBOARDING.md` and understand the codebase well enough to start making changes without needing the creator to explain it
- The document is useful even when the creator themselves doesn't fully understand the architecture
- Running the skill again on an evolved codebase produces an accurate, current document (no stale information carried over)

## Scope Boundaries

- Does not attempt to infer or fabricate design rationale ("why was X chosen over Y") — the creator may not know, and presenting guesses as fact is worse than saying nothing
- Does not assess fragility or risk areas — that requires judgment about production behavior the agent doesn't have
- Does not generate README.md, CLAUDE.md, AGENTS.md, or any other document — only `ONBOARDING.md`
- Does not preserve hand-edits from a previous version on regeneration — if users want durable authored context, it belongs in other docs (which the skill may discover and link to)
- No `ce:` prefix — this is a standalone utility skill, not part of the core workflow

## Key Decisions

- **Always regenerate, never update**: Reading the old document to update it means the agent does two jobs (understand the codebase + fact-check the old doc). That's slower and more error-prone than regenerating.
- **Five sections, no more**: Every section must earn its place by answering a question a new person will actually ask. No speculative sections "just in case."
- **Inline linking only**: Existing docs are surfaced within relevant sections, not collected in an appendix. This is opportunistic — works fine when nothing exists to link to.
- **Human-first writing**: The document targets human readers. Agent utility is a natural side effect of clear prose, not a separate design goal.

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] How should the skill orchestrate the crawl — single-pass or dispatch sub-agents for different sections?
- [Affects R4][Technical] What crawl strategy produces the best "Primary flow" section — entry point tracing, route analysis, or something else?
- [Affects R4][Needs research] What's the right depth/length target for each section to be useful without becoming a wall of text?
- [Affects R5][Technical] What heuristic determines whether a discovered doc is "directly relevant" to a section versus noise?

## Next Steps

-> `/ce:plan` for structured implementation planning
