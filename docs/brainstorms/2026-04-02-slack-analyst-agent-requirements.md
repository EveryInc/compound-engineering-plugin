---
date: 2026-04-02
topic: ce-slack-researcher-agent
---

# Slack Analyst Agent

## Problem Frame

Coding agents operating within compound-engineering workflows (ideate, plan, brainstorm) have no visibility into organizational knowledge that lives in Slack. Decisions, constraints, ongoing discussions, and context about projects are often undocumented anywhere except Slack conversations. When a developer is about to make a change, relevant Slack context -- a discussion about why something was designed a certain way, a decision to deprecate a feature, constraints mentioned by another team -- is invisible to the agent assisting them.

The official Slack plugin provides user-facing commands (`/slack:find-discussions`, `/slack:summarize-channel`), but these are standalone and manual. There is no research agent that compound-engineering workflows can dispatch programmatically to surface Slack context as part of their normal research phase.

## Requirements

**Agent Identity and Placement**

- R1. Create a research-category agent at `agents/research/ce-slack-researcher.md` following the established research agent pattern (frontmatter with name, description, model:inherit; examples block; phased execution).
- R2. The agent's role is analytical: it searches Slack for context relevant to the task at hand and returns a concise, structured digest. It does not send messages, create canvases, or take any write actions in Slack.

---

**Precondition and Short-Circuit Design**

- R3. Two-level short-circuit to minimize token waste:
  - **Caller level:** Calling workflows check whether the Slack MCP server is connected before dispatching the agent. If unavailable, skip dispatch entirely. Detection should check for MCP availability (not specific tool names, which may change).
  - **Agent level:** The agent performs its own precondition check on entry. If Slack MCP tools are not accessible, return a short message ("Slack MCP not connected -- skipping Slack analysis") and exit immediately.
- R4. The agent should also short-circuit if the caller provides no meaningful search context (e.g., an empty or overly generic topic). Return a message indicating insufficient context rather than running broad, low-value searches.

---

**Search Strategy**

- R5. Default behavior is search-first: run 2-3 targeted searches using `slack_search_public_and_private` based on keywords derived from the task topic. Search both public and private channels by default (user has already authed the Slack MCP).
- R6. Read threads (`slack_read_thread`) only for high-relevance search hits -- not speculatively. Limit thread reads to avoid runaway token consumption (cap at ~3-5 thread reads per invocation).
- R7. Accept an optional channel hint from the caller. When provided, also read recent history from the specified channel(s) using `slack_read_channel` with appropriate time bounds. Without a channel hint, do not read channel history -- search results are sufficient.
- R8. Future consideration (not in scope): a user preference/setting for channels that should always be searched. Defer to a later iteration.

---

**Output Format**

- R9. Return a concise summary digest organized by topic/theme. Each finding should include:
  - The topic or theme
  - A brief summary of what was discussed/decided
  - Source attribution (channel name, approximate date, participants if notable)
  - Relevance to the current task
- R10. When no relevant Slack context is found, return a short explicit statement ("No relevant Slack discussions found for [topic]") rather than generating filler.
- R11. Keep output compact enough to be useful context without dominating the calling workflow's token budget. Target roughly 200-500 tokens for typical results.

---

**Workflow Integration**

- R12. Integrate into three calling workflows:
  - **ce-ideate** -- dispatch during Phase 1 (Codebase Scan), alongside learnings-researcher. Slack context enriches ideation by surfacing org discussions about the focus area.
  - **ce-plan** -- dispatch during the research/context-gathering phase. Slack context surfaces constraints, prior decisions, and ongoing discussions relevant to the implementation.
  - **ce-brainstorm** -- dispatch during Phase 1.1 (Existing Context Scan). Brainstorming especially benefits from knowing what the org has already discussed about the topic.
- R13. In all calling workflows, dispatch the Slack analyst agent in parallel with other research agents (learnings-researcher, etc.) to avoid adding latency. Callers wait for all parallel agents to return before consolidating results (this is the existing pattern for parallel research dispatch). The Slack analyst's dispatch condition is MCP availability (R3). The agent itself handles the meaningful-context check (R4) internally.
- R14. Callers should incorporate the Slack analyst's output into their existing context summary alongside other research results, not as a separate section.

---

**Dependency on External Plugin**

- R15. The Slack MCP server is owned by the official Slack plugin, not compound-engineering. The agent uses MCP tools that the Slack plugin configures. This creates a soft dependency: the agent is useful only when the Slack plugin is installed and authenticated, but compound-engineering must not require it.
- R16. Do not bundle or reference the Slack plugin's `.mcp.json` or configuration from within compound-engineering. The agent relies solely on MCP tools being available at runtime.

## Success Criteria

- When Slack MCP is connected, the agent surfaces relevant org context that would not have been available from codebase analysis alone, enriching the output of ideate/plan/brainstorm workflows.
- When Slack MCP is not connected, the agent adds zero token overhead (caller-level short-circuit prevents dispatch).
- The agent completes within a reasonable time budget (~10-15 seconds) and returns compact output that doesn't bloat calling workflows.

## Scope Boundaries

- No write actions to Slack (no sending messages, no creating canvases).
- No channel history reads unless the caller provides an explicit channel hint.
- No user preference/settings system for default channels (deferred).
- No replacement of existing Slack plugin commands -- this agent is complementary, not competitive.
- No installation or configuration of the Slack MCP -- that remains the Slack plugin's responsibility.

## Key Decisions

- **Agent, not skill:** This is a sub-agent invoked programmatically by workflows, not a user-facing slash command. It lives in `agents/research/`.
- **Public + private search by default:** The user already authed the Slack MCP, so searching private channels avoids missing the richest context.
- **Search-first, reads on demand:** Avoids the token cost of speculatively reading channel history. Thread reads are limited to high-relevance hits.
- **Concise digest output:** Callers are responsible for interpreting the output for their specific context. The agent returns useful summaries, not raw message dumps.
- **MCP availability check, not tool-name check:** Callers check if the Slack MCP is connected, not for specific tool names (which may change in future Slack MCP versions).

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] How exactly should callers detect Slack MCP availability? Claude Code's tool list inspection, checking for any `slack_*` tool prefix, or another mechanism?
- [Affects R5][Needs research] What is the optimal number of search queries per invocation to balance coverage vs. token cost? Start with 2-3 and tune based on real usage.
- [Affects R12][Technical] What modifications are needed in ce-ideate, ce-plan, and ce-brainstorm skill files to add the conditional dispatch? Review each skill's research phase to find the right insertion point.

## Next Steps

-> `/ce:plan` for structured implementation planning
