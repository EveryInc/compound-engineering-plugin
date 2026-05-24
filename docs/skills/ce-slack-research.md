# `ce-slack-research`

> Search Slack for interpreted organizational context — decisions, constraints, and discussion arcs that shape the current task. A research digest, not a raw message list.

`ce-slack-research` is the **organizational-context retrieval** skill. It dispatches `ce-slack-researcher` to search Slack for context relevant to a topic, then synthesizes a research digest with cross-cutting analysis and a research-value assessment — not a flat list of message hits. Useful when planning, brainstorming, or any task where the team has already discussed something and the agent needs that context to make sensible recommendations.

Distinguished from `slack:find-discussions` (a different skill that returns individual message results without synthesis): this skill **interprets** what was found.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Searches Slack for a topic and returns a synthesized research digest with workspace identity, value assessment, findings by topic, and cross-cutting analysis |
| When to use it | Before planning or brainstorming when "we've discussed this before in Slack" — get the context first, then proceed |
| What it produces | A digest: workspace identifier, research-value assessment (high/moderate/low/none), findings organized by topic, cross-cutting analysis |
| Key contrast | `ce-slack-research` synthesizes; `slack:find-discussions` returns raw message hits |

---

## The Problem

Slack is a working memory teams have but rarely use as one:

- **Decisions hide in old threads** — "we decided X about pricing in February" is in a channel nobody remembers
- **Constraints live in side conversations** — the reason a feature was scoped down isn't in the spec, it's in a DM
- **Raw search returns noise** — `slack:find-discussions` finds messages but doesn't tell you what to make of them
- **Wrong workspace risk** — searching the wrong Slack instance produces confident-sounding but irrelevant context
- **Discussion arcs lost** — a single thread might span 3 days; one message hit doesn't show how the conversation evolved
- **No assessment of value** — was the conversation conclusive? Speculative? Decided? Without that signal, the agent can't weight findings appropriately

## The Solution

`ce-slack-research` runs Slack search through a research-shaped pipeline:

- **Workspace identifier surfaced** — the user can verify the correct Slack instance was searched before reading findings
- **Research-value assessment** — high / moderate / low / none, with justification
- **Findings organized by topic** — not a flat message list; clustered by what they're about with source channels and dates
- **Cross-cutting analysis** — patterns across findings, not just per-message summary
- **Single-shot dispatch** — the skill is a thin entry point; `ce-slack-researcher` does the actual work (MCP discovery, search execution, thread reads, synthesis)

---

## What Makes It Novel

### 1. Synthesis, not search

The agent doesn't return matching messages. It returns a digest with structure:

- **Workspace identifier** — which Slack workspace was searched (so the user can correct if it's wrong)
- **Research-value assessment** — how useful the findings actually are, with justification:
  - **High** — conclusive decisions or strong constraints relevant to the topic
  - **Moderate** — context that bears on the topic but isn't conclusive
  - **Low** — tangential mentions or weak signals
  - **None** — no relevant findings; the topic hasn't been discussed
- **Findings organized by topic** — clusters with source channels and dates
- **Cross-cutting analysis** — patterns across findings the per-message view misses

### 2. Workspace identity verification

A common failure mode in Slack search is searching the wrong workspace and getting confidently-irrelevant results. The skill surfaces the workspace identifier first so the user can verify the right Slack instance was searched. If the agent connected to a personal Slack workspace instead of the company one, this catches it before the digest leads anyone astray.

### 3. Research-value assessment with justification

Findings aren't equally useful. A decided product question with consensus weighs differently from a speculative weekend tangent. The agent assesses the corpus and explains the rating — "high: explicit decision in #proj-billing on 2026-03-12 with three approvers" or "low: one passing mention in #general; topic not actively discussed".

### 4. Slack search modifier passthrough

The input can be a keyword, a natural language question, or include Slack search modifiers:

- Channel hints: `in:#proj-reverse-trial`
- Date filters: `after:2026-03-01`, `before:2026-04-15`
- Phrase search, exclusions, etc.

The agent extracts the topic and formulates searches from whatever form the input takes.

### 5. Thin orchestrator, agent does the work

The skill itself is a thin entry point that asks for a topic if one wasn't given, then dispatches `ce-slack-researcher`. The agent handles MCP discovery, search execution, thread reads, and synthesis. This keeps the user-facing surface tiny while the heavy lifting stays in a specialist agent.

### 6. Distinct from raw-search Slack tools

`slack:find-discussions` (different skill) returns individual message results suitable for "did anyone mention X recently?" `ce-slack-research` returns interpreted context suitable for "what does the team think about X, with what evidence?" The distinction matters — using the wrong tool gets noise back.

### 7. Failure modes surfaced cleanly

If Slack is unavailable (MCP not connected or auth expired), the agent reports it cleanly and the skill relays the message. It doesn't attempt alternative research methods or pretend to have searched. If the user wants context elsewhere, that's a different invocation.

---

## Quick Example

You're about to plan a free-trial feature. You want to know what the team has already discussed before writing the brainstorm. You invoke `/ce-slack-research "free trial in #proj-reverse-trial"`.

The skill dispatches `ce-slack-researcher` with the topic, channel scope, and an implicit recent-window. The agent connects to the configured Slack workspace, runs targeted searches in `#proj-reverse-trial`, expands relevant threads, and synthesizes findings.

The digest comes back:

- **Workspace:** `every.slack.com`
- **Research value:** **High** — multiple decisions and constraints relevant to free-trial scope
- **Findings:**
  - **Trial length:** decided 14-day default after 30-day was rejected as too long for the funnel data (decision in thread on 2026-03-12, three approvers)
  - **Conversion gate:** soft paywall preferred over hard paywall; unresolved whether the gate fires at signup or after first usage
  - **Pricing during trial:** unanimous "do not show pricing" — surfaced in three different threads
- **Cross-cutting analysis:** The team has consistently leaned conversion-protective (no pricing during trial, soft gates) but has not converged on the conversion-gate timing. That's the live question worth resolving in the brainstorm.

You now have real organizational context before invoking `/ce-brainstorm`. The brainstorm starts from "the trial is 14-day, soft-paywall, no pricing visible — when does the gate fire?" rather than from scratch.

---

## When to Reach For It

Reach for `ce-slack-research` when:

- You're about to plan or brainstorm something the team has discussed in Slack
- The repo / docs are silent on a decision but the team obviously made one
- A constraint exists ("we can't use that vendor") but the rationale is in a thread somewhere
- You want interpreted context, not raw message hits

Skip `ce-slack-research` when:

- You want raw message hits → use `slack:find-discussions`
- The context is in code or docs → read those instead
- The topic is too new to have Slack history yet
- You don't have Slack tools configured → set up the Slack MCP first

---

## Use as Part of the Workflow

`ce-slack-research` plugs in upstream of planning and brainstorming when organizational context matters:

- **Before `/ce-brainstorm`** — gather Slack context so the brainstorm's pressure-test questions can ground in real prior discussion
- **Before `/ce-plan`** — when the work touches a decision the team made elsewhere, surface that decision first
- **From inside `/ce-plan` Phase 1.1** — opt-in via "Slack tools detected; ask me to search Slack for organizational context"
- **From inside `/ce-brainstorm` Phase 1.1** — opt-in via the same surfacing pattern
- **From inside `/ce-ideate` Phase 1** — opt-in slack-research for the ideation grounding step

The chain skills surface availability when they detect Slack tools but never auto-dispatch — the user opts in.

---

## Use Standalone

Most use is direct:

- **Topic** — `/ce-slack-research free trial`
- **Question** — `/ce-slack-research "What did we say about free trial recently?"`
- **Channel-scoped** — `/ce-slack-research free trial in:#proj-reverse-trial`
- **Date-filtered** — `/ce-slack-research onboarding flow after:2026-03-01`
- **No argument** — `/ce-slack-research` asks what topic to research

The skill accepts whatever shape your topic naturally takes — keyword, question, with or without Slack search modifiers.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks what topic to research |
| `<topic or question>` | Searches and synthesizes |
| `<topic> in:#channel` | Channel-scoped search |
| `<topic> after:YYYY-MM-DD` | Date-filtered search |

If Slack tools aren't configured, the agent reports unavailability and the skill relays the message. No alternative research methods are attempted.

---

## FAQ

**What's the difference between this and `slack:find-discussions`?**
`slack:find-discussions` returns individual message results — useful for "did anyone mention X recently?" `ce-slack-research` interprets and synthesizes — useful for "what does the team think about X, with what evidence?" Use the right tool for the question.

**Why does it surface the workspace identifier?**
Because searching the wrong Slack workspace produces confident-irrelevant results, and the user often can't tell from the findings alone. Surfacing the workspace identity lets the user catch the wrong-workspace case before reading the digest.

**What does the research-value assessment mean?**
A judgment on how useful the findings actually are. **High** = conclusive decisions / strong constraints. **Moderate** = bears on the topic but not conclusive. **Low** = weak signals. **None** = the topic hasn't been meaningfully discussed. The justification explains the rating.

**Can it search private DMs?**
Depends on what the configured Slack MCP exposes. The skill doesn't have its own access — it uses whatever the MCP allows. For private content, ensure the MCP has the right scope.

**What if the workspace isn't the right one?**
The skill surfaces the workspace identifier first so the user can verify and re-invoke against a different one if needed. If multiple workspaces are configured, the agent picks the connected one; the user disambiguates.

**Does it work without Slack MCP?**
No. If Slack tools aren't reachable, the agent reports unavailability cleanly and the skill relays it. The skill doesn't fall back to other research methods — that would produce incorrect-feeling results.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md) — opt-in slack-research during Phase 1.1 constraint check
- [`ce-plan`](./ce-plan.md) — opt-in slack-research during Phase 1.1 local research
- [`ce-ideate`](./ce-ideate.md) — opt-in slack-research during grounding
- `slack:find-discussions` — sibling skill in the separate `slack` plugin for raw message search; complementary, not a substitute
