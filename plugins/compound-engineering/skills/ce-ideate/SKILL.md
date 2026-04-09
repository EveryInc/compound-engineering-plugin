---
name: ce:ideate
description: "Generate and critically evaluate grounded improvement ideas for the current project. Use when asking what to improve, requesting idea generation, exploring surprising improvements, or wanting the AI to proactively suggest strong project directions before brainstorming one in depth. Triggers on phrases like 'what should I improve', 'give me ideas', 'ideate on this project', 'surprise me with improvements', 'what would you change', or any request for AI-generated project improvement suggestions rather than refining the user's own idea."
argument-hint: "[feature, focus area, or constraint]"
---

# Generate Improvement Ideas

**Note: The current year is 2026.** Use this when dating ideation documents and checking recent ideation artifacts.

`ce:ideate` precedes `ce:brainstorm`.

- `ce:ideate` answers: "What are the strongest ideas worth exploring?"
- `ce:brainstorm` answers: "What exactly should one chosen idea mean?"
- `ce:plan` answers: "How should it be built?"

This workflow produces a ranked ideation artifact in `docs/ideation/`. It does **not** produce requirements, plans, or code.

## Interaction Method

Use the platform's blocking question tool when available (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present numbered options in chat and wait for the user's reply before proceeding.

Ask one question at a time. Prefer concise single-select choices when natural options exist.

## Focus Hint

<focus_hint> #$ARGUMENTS </focus_hint>

Interpret any provided argument as optional context. It may be:

- a concept such as `DX improvements`
- a path such as `plugins/compound-engineering/skills/`
- a constraint such as `low-complexity quick wins`
- a volume hint such as `top 3`, `100 ideas`, or `raise the bar`

If no argument is provided, proceed with open-ended ideation.

## Core Principles

1. **Ground before ideating** - Scan the actual codebase first. Do not generate abstract product advice detached from the repository.
2. **Generate many -> critique all -> explain survivors only** - The quality mechanism is explicit rejection with reasons, not optimistic ranking. Do not let extra process obscure this pattern.
3. **Route action into brainstorming** - Ideation identifies promising directions; `ce:brainstorm` defines the selected one precisely enough for planning. Do not skip to planning from ideation output.

## Execution Flow

### Phase 0: Resume and Scope

#### 0.1 Check for Recent Ideation Work

Look in `docs/ideation/` for ideation documents created within the last 30 days.

Treat a prior ideation doc as relevant when:
- the topic matches the requested focus
- the path or subsystem overlaps the requested focus
- the request is open-ended and there is an obvious recent open ideation doc
- the issue-grounded status matches: do not offer to resume a non-issue ideation when the current argument indicates issue-tracker intent, or vice versa — treat these as distinct topics

If a relevant doc exists, ask whether to:
1. continue from it
2. start fresh

If continuing:
- read the document
- summarize what has already been explored
- preserve previous idea statuses and session log entries
- update the existing file instead of creating a duplicate

#### 0.2 Interpret Focus and Volume

Infer three things from the argument:

- **Focus context** - concept, path, constraint, or open-ended
- **Volume override** - any hint that changes candidate or survivor counts
- **Issue-tracker intent** - whether the user wants issue/bug data as an input source

Issue-tracker intent triggers when the argument's primary intent is about analyzing issue patterns: `bugs`, `github issues`, `open issues`, `issue patterns`, `what users are reporting`, `bug reports`, `issue themes`.

Do NOT trigger on arguments that merely mention bugs as a focus: `bug in auth`, `fix the login issue`, `the signup bug` — these are focus hints, not requests to analyze the issue tracker.

When combined (e.g., `top 3 bugs in authentication`): detect issue-tracker intent first, volume override second, remainder is the focus hint. The focus narrows which issues matter; the volume override controls survivor count.

Default volume:
- each ideation sub-agent generates about 8-10 ideas (yielding ~30 raw ideas across agents, ~20-25 after dedupe)
- keep the top 5-7 survivors

Honor clear overrides such as:
- `top 3`
- `100 ideas`
- `go deep`
- `raise the bar`

Use reasonable interpretation rather than formal parsing.

### Phase 1: Codebase Scan

Before generating ideas, gather codebase context.

Run agents in parallel in the **foreground** (do not use background dispatch — the results are needed before proceeding):

1. **Quick context scan** — dispatch a general-purpose sub-agent using the platform's cheapest capable model (e.g., `model: "haiku"` in Claude Code) with this prompt:

   > Read the project's AGENTS.md (or CLAUDE.md only as compatibility fallback, then README.md if neither exists), then discover the top-level directory layout using the native file-search/glob tool (e.g., `Glob` with pattern `*` or `*/*` in Claude Code). Return a concise summary (under 30 lines) covering:
   > - project shape (language, framework, top-level directory layout)
   > - notable patterns or conventions
   > - obvious pain points or gaps
   > - likely leverage points for improvement
   >
   > Keep the scan shallow — read only top-level documentation and directory structure. Do not analyze GitHub issues, templates, or contribution guidelines. Do not do deep code search.
   >
   > Focus hint: {focus_hint}

2. **Learnings search** — dispatch `compound-engineering:research:learnings-researcher` with a brief summary of the ideation focus.

3. **Issue intelligence** (conditional) — if issue-tracker intent was detected in Phase 0.2, dispatch `compound-engineering:research:issue-intelligence-analyst` with the focus hint. If a focus hint is present, pass it so the agent can weight its clustering toward that area. Run this in parallel with agents 1 and 2.

   If the agent returns an error (gh not installed, no remote, auth failure), log a warning to the user ("Issue analysis unavailable: {reason}. Proceeding with standard ideation.") and continue with the existing two-agent grounding.

   If the agent reports fewer than 5 total issues, note "Insufficient issue signal for theme analysis" and proceed with default ideation frames in Phase 2.

Consolidate all results into a short grounding summary. When issue intelligence is present, keep it as a distinct section so ideation sub-agents can distinguish between code-observed and user-reported signals:

- **Codebase context** — project shape, notable patterns, obvious pain points, likely leverage points
- **Past learnings** — relevant institutional knowledge from docs/solutions/
- **Issue intelligence** (when present) — theme summaries from the issue intelligence agent, preserving theme titles, descriptions, issue counts, and trend directions

**Slack context** (opt-in) — never auto-dispatch. Route by condition:

- **Tools available + user asked**: Dispatch `compound-engineering:research:slack-researcher` with the focus hint in parallel with other Phase 1 agents. Include findings in the grounding summary.
- **Tools available + user didn't ask**: Note in output: "Slack tools detected. Ask me to search Slack for organizational context at any point, or include it in your next prompt."
- **No tools + user asked**: Note in output: "Slack context was requested but no Slack tools are available. Install and authenticate the Slack plugin to enable organizational context search."

Do **not** do external research in v1.

### Phase 2: Divergent Ideation

Generate the full candidate list before critiquing any idea.

Dispatch 3-4 parallel ideation sub-agents on the inherited model (do not tier down -- creative ideation needs the orchestrator's reasoning level). Omit the `mode` parameter so the user's configured permission settings apply. Each targets ~8-10 ideas (yielding ~30 raw ideas, ~20-25 after dedupe). Adjust per-agent targets when volume overrides apply (e.g., "100 ideas" raises it, "top 3" may lower the survivor count instead).

Give each sub-agent: the grounding summary, the focus hint, the per-agent volume target, and an instruction to generate raw candidates only (not critique). Each agent's first few ideas tend to be obvious -- push past them. Ground every idea in the Phase 1 scan.

Assign each sub-agent a different ideation frame as a **starting bias, not a constraint**. Prompt each to begin from its assigned perspective but follow any promising thread -- cross-cutting ideas that span multiple frames are valuable.

**Frame selection:**
- **When issue-tracker intent is active and themes were returned:** Each high/medium-confidence theme becomes a frame. Pad with default frames if fewer than 3 cluster-derived frames. Cap at 4 total.
- **Default frames (no issue-tracker intent):** (1) user/operator pain and friction, (2) inversion, removal, or automation of a painful step, (3) assumption-breaking or reframing, (4) leverage and compounding effects.

Ask each sub-agent to return a compact structure per idea: title, summary, why_it_matters, evidence/grounding hooks, optional boldness or focus_fit signal.

After all sub-agents return:
1. Merge and dedupe into one master candidate list.
2. Synthesize cross-cutting combinations -- scan for ideas from different frames that combine into something stronger (expect 3-5 additions at most).
3. If a focus was provided, weight the merged list toward it without excluding stronger adjacent ideas.
4. Spread ideas across multiple dimensions when justified: workflow/DX, reliability, extensibility, missing capabilities, docs/knowledge compounding, quality/maintenance, leverage on future work.

After merging and synthesis, read `references/post-ideation-workflow.md` for the adversarial filtering rubric, presentation format, artifact template, handoff options, and quality bar. Do not load this file before Phase 2 agent dispatch completes.
