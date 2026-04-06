---
title: Research agent dispatch is intentionally separated across the skill pipeline
date: 2026-04-05
category: skill-design
module: compound-engineering
problem_type: best_practice
component: tooling
severity: low
applies_when:
  - Evaluating whether repo-research-analyst or learnings-researcher calls in ce:plan duplicate work from ce:brainstorm or ce:work
  - Adding a new research agent and deciding which pipeline stage should dispatch it
  - Considering pass-through optimizations like the Slack researcher pattern (commit f7a14b76)
tags:
  - research-agent
  - pipeline
  - skill-design
  - deduplication
  - ce-plan
  - ce-brainstorm
  - ce-work
---

# Research agent dispatch is intentionally separated across the skill pipeline

## Context

After optimizing the Slack researcher agent to avoid redundant work between ce:brainstorm and ce:plan (commit f7a14b76 on `tmchow/slack-analyst-agent`), a natural question arose: does the same duplication problem exist for `repo-research-analyst` and `learnings-researcher`? Both are dispatched by ce:plan in Phase 1.1 on every run, regardless of whether ce:brainstorm produced an origin document.

Investigation confirmed no duplication exists. The three workflow stages operate on deliberately separated information types, and research agent dispatch follows this separation cleanly.

## Guidance

The brainstorm -> plan -> work pipeline separates research by information type:

**ce:brainstorm** gathers *product context* (WHAT to build). It performs an inline "Existing Context Scan" -- surface-level file discovery focused on product questions. It does NOT dispatch `repo-research-analyst` or `learnings-researcher`. Its output is a requirements document covering product decisions, scope, and success criteria, intentionally excluding implementation details.

**ce:plan** gathers *implementation context* (HOW to build it). It ALWAYS dispatches `repo-research-analyst` (technology, architecture, patterns) and `learnings-researcher` in Phase 1.1. These produce: tech stack versions, architectural patterns, conventions, file paths, and institutional knowledge from `docs/solutions/`. This feeds the plan document's Context & Research, Patterns to Follow, Files, and Key Technical Decisions sections. The `repo-research-analyst` output also drives Phase 1.2 decisions about whether external research agents are needed.

**ce:work** gathers NO research context independently. It reads the plan document and uses embedded research findings to guide implementation. For bare prompts (no plan), it does a lightweight inline scan -- no agent dispatch. The plan document IS the handoff mechanism from ce:plan's research to ce:work.

When ce:plan receives an origin document from ce:brainstorm, it reads it as primary input (Phase 0.3) but still runs its research agents because they gather categorically different information.

## Why This Matters

- **Prevents false optimizations.** Without understanding the information type separation, a contributor might skip ce:plan's research agents when a brainstorm document exists, breaking the plan's ability to produce implementation-ready guidance.
- **Clarifies when pass-through optimizations ARE warranted.** The Slack researcher was a genuine redundancy: both ce:brainstorm and ce:plan dispatched the same agent for overlapping information. The fix passed existing context so the agent focuses on gaps. For `repo-research-analyst` and `learnings-researcher`, no such redundancy exists because only ce:plan dispatches them.
- **Protects the plan document's role as the sole handoff artifact.** ce:work depends on the plan containing complete implementation context. If ce:plan's research agents are skipped, ce:work receives an incomplete plan and must improvise.

## When to Apply

- When evaluating whether research agent calls across pipeline stages are redundant -- check whether multiple stages dispatch the same agent for overlapping information types.
- When adding a new research agent -- classify whether it gathers product context (brainstorm), implementation context (plan), or execution context (work), and dispatch it from the matching stage only.
- When considering a pass-through optimization like the Slack pattern -- the prerequisite is that TWO stages independently dispatch the same agent. If only one stage dispatches the agent, no optimization is needed.

## Examples

**No optimization needed (this case):**
ce:plan always calls `repo-research-analyst` even when a brainstorm document exists. Does ce:brainstorm also call it? No -- brainstorm only does an inline product-focused scan. The calls are not redundant; no change needed.

**Optimization warranted (Slack pattern):**
Both ce:brainstorm and ce:plan dispatched `slack-researcher`. Fix: when ce:plan finds Slack context in the origin document, pass it to `slack-researcher` so the agent focuses on gaps. The agent is still called -- it starts from a better baseline.

**Anti-pattern -- skipping agents incorrectly:**
Removing `repo-research-analyst` from ce:plan when an origin document exists, reasoning "brainstorm already scanned the repo." The resulting plan lacks architectural patterns, file paths, and convention details. ce:work produces code that ignores existing patterns.

**Correct stage placement for a new agent:**
A "dependency-analyzer" agent that identifies library versions and compatibility constraints gathers implementation context (HOW). It belongs in ce:plan's Phase 1.1, not ce:brainstorm. ce:work will consume its findings via the plan document.

## Related

- `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md` -- related agent dispatch optimization pattern (token efficiency, not deduplication)
- `docs/solutions/skill-design/beta-skills-framework.md` -- documents the pipeline chain (note: pipeline description is stale, references `deepen-plan` which has been merged into `ce:plan`)
- Commit f7a14b76 on `tmchow/slack-analyst-agent` -- the Slack researcher pass-through optimization that prompted this analysis
- GitHub issue #492 -- `repo-research-analyst` self-recursion bug (fixed, separate concern)
