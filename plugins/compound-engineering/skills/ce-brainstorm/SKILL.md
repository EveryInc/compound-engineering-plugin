---
name: ce:brainstorm
description: 'Explore requirements and approaches through collaborative dialogue before writing a right-sized requirements document and planning implementation. Use for feature ideas, problem framing, when the user says ''let''s brainstorm'', or when they want to think through options before deciding what to build. Also use when a user describes a vague or ambitious feature request, asks ''what should we build'', ''help me think through X'', presents a problem with multiple valid solutions, or seems unsure about scope or direction — even if they don''t explicitly ask to brainstorm.'
argument-hint: "[feature idea or problem to explore]"
---

# Brainstorm a Feature or Improvement

**Note: The current year is 2026.** Use this when dating requirements documents.

Brainstorming helps answer **WHAT** to build through collaborative dialogue. It precedes `/ce:plan`, which answers **HOW** to build it.

The durable output of this workflow is a **requirements document**. In other workflows this might be called a lightweight PRD or feature brief. In compound engineering, keep the workflow name `brainstorm`, but make the written artifact strong enough that planning does not need to invent product behavior, scope boundaries, or success criteria.

This skill does not implement code. It explores, clarifies, and documents decisions for later planning or execution.

## Core Principles

1. **Assess scope first** - Match the amount of ceremony to the size and ambiguity of the work.
2. **Be a thinking partner** - Suggest alternatives, challenge assumptions, and explore what-ifs instead of only extracting requirements.
3. **Resolve product decisions here** - User-facing behavior, scope boundaries, and success criteria belong in this workflow. Detailed implementation belongs in planning.
4. **Keep implementation out of the requirements doc by default** - Do not include libraries, schemas, endpoints, file layouts, or code-level design unless the brainstorm itself is inherently about a technical or architectural change.
5. **Right-size the artifact** - Simple work gets a compact requirements document or brief alignment. Larger work gets a fuller document. Do not add ceremony that does not help planning.
6. **Apply YAGNI to carrying cost, not coding effort** - Prefer the simplest approach that delivers meaningful value. Avoid speculative complexity and hypothetical future-proofing, but low-cost polish or delight is worth including when its ongoing cost is small and easy to maintain.

## Interaction Rules

1. **Ask one question at a time** - Do not batch several unrelated questions into one message.
2. **Prefer single-select multiple choice** - Use single-select when choosing one direction, one priority, or one next step.
3. **Use multi-select rarely and intentionally** - Use it only for compatible sets such as goals, constraints, non-goals, or success criteria that can all coexist. If prioritization matters, follow up by asking which selected item is primary.
4. **Use the platform's question tool when available** - When asking the user a question, prefer the platform's blocking question tool if one exists (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present numbered options in chat and wait for the user's reply before proceeding.

## Output Guidance

- **Keep outputs concise** - Prefer short sections, brief bullets, and only enough detail to support the next decision.

## Role Rubric

This skill uses these roles in both normal and autopilot modes:

- `Product Manager` -- optimize for user value, scope coherence, success criteria, and priority alignment
- `Designer` -- optimize for user experience broadly: flow, defaults, terminology, state coverage, error recovery, and clarity
- `Engineer` -- optimize for correctness, reuse, maintainability, and repo fit as a constraint on product choices

Ordered weighting:
- `Product Manager > Designer > Engineer`

Dominant decision criteria:
- `User Value`
- `Completeness`
- `Clarity`
- `Reuse`
- `Momentum`

Orchestration bias:
- `low`

Normal mode uses this rubric to recommend options and frame follow-up questions.
Autopilot mode uses the same rubric for bounded autonomous decisions only.

## Autopilot Mode

Autopilot is active only when the input begins with:

- `[ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] ::`

When that marker is present:
- Strip the marker before processing the feature description
- Read the manifest path from the marker
- Validate that the manifest describes an active autopilot run
- Treat the run as part of an `lfg`-owned workflow, not a standalone brainstorm

Then distinguish between two kinds of prompts:

- **Workflow prompts** (handoff menus, "what do you want to do next?", "resume or start fresh?", post-generation options) → skip. These control routing, and the pipeline handles routing.
- **Content prompts** (clarifying what to build, resolving ambiguity, scoping questions) → still ask. Getting requirements wrong wastes every downstream step.

Decision boundaries in autopilot mode:

- **May decide automatically**
  - bounded requirement defaults already strongly implied by the request or existing requirements doc
  - small scope/behavior clarifications needed to make the requirements doc plan-ready
- **Must ask**
  - materially different product behaviors
  - changes that would expand or narrow core scope in a meaningful way
  - unresolved success-criteria tradeoffs
- **Must log**
  - any substantive autonomous product decision written into the requirements doc without asking first

When a requirements document is created or updated in autopilot mode, update the manifest's `artifacts.requirements_doc` path, set `gates.requirements.state = complete` with brief evidence, and append any substantive autonomous decisions to the run-scoped `decisions.md` table.

Specific phase behavior:

- **Phase 0.1:** If a relevant requirements document already exists, read it. Skip it (proceed to Phase 0.2 to reassess the current `$ARGUMENTS`) if: a plan in `docs/plans/` has an `origin:` frontmatter field pointing to this requirements doc and `status: completed` (the doc was already fully consumed), or its problem frame and requirements meaningfully diverge from the current feature description (`$ARGUMENTS`). If the doc is still relevant (no completed plan referencing it and scope matches), check for `Resolve Before Planning` items. If the document is plan-ready (no blocking questions), note it and return control immediately. If it still has `Resolve Before Planning` items, resume the brainstorm to resolve them (proceed to Phase 1.3) rather than returning control -- otherwise the pipeline dead-ends because `ce:plan` will block and re-invoking `ce:brainstorm` will hit this same check. Do not ask whether to resume or start fresh.
- **Phase 0.2 short-circuit is a genuine skip.** If requirements are already clear (specific acceptance criteria, exact expected behavior, well-defined scope), skip brainstorm entirely. Note "requirements clear, skipping brainstorm", and in autopilot mode set `gates.requirements.state = complete` with brief evidence before returning control to the calling workflow. Do not proceed to Phase 1.3 or Phase 3.
- **Phases 1.3 and 2:** Content questions to clarify vague or ambiguous requirements are still permitted. The user is present and getting requirements right is more valuable than speed.
- **Phase 4 handoff is skipped.** Do not present handoff options or invoke `/ce:plan`. Write the requirements document (if warranted) and return control to the calling workflow.

## Durable Output Safety

This skill may create or update durable requirements documents in `docs/brainstorms/`.

- **In autopilot mode (active `lfg` run with marker/manifest)** — inherit the current branch/worktree context and continue without branch prompts.
- **In standalone use on a clean worktree** — proceed normally.
- **In standalone use on a dirty worktree** — continue only when the existing uncommitted changes clearly belong to the same brainstorm topic. If they appear unrelated, or you are not confident, ask before writing or updating a durable document.
- **Being in a worktree does not by itself prove the task context is correct** — use the same clean-vs-dirty and related-vs-unrelated judgment there.
- **Do not create or switch branches from this skill** — branch/worktree orchestration belongs to the calling workflow or to `ce:work` when execution begins.

## Feature Description

<feature_description> #$ARGUMENTS </feature_description>

**If the feature description above is empty, ask the user:** "What would you like to explore? Please describe the feature, problem, or improvement you're thinking about."

Do not proceed until you have a feature description from the user.

## Execution Flow

### Phase 0: Resume, Assess, and Route

#### 0.1 Resume Existing Work When Appropriate

If the user references an existing brainstorm topic or document, or there is an obvious recent matching `*-requirements.md` file in `docs/brainstorms/`:
- Read the document
- **In autopilot mode:** skip the document (proceed to Phase 0.2 to reassess whether brainstorming is needed for the current input) if a plan in `docs/plans/` has `origin:` pointing to this doc and `status: completed` (already fully consumed), or its scope meaningfully diverges from the current feature description. If the doc is still relevant (no completed plan referencing it and scope matches), check for `Resolve Before Planning` items. If none exist, note the existing document and return control immediately (see Autopilot Mode above). If blocking questions remain, resume the brainstorm to resolve them (proceed to Phase 1.3) rather than returning control. Do not ask the user whether to resume or start fresh.
- **Otherwise:** Confirm with the user before resuming: "Found an existing requirements doc for [topic]. Should I continue from this, or start fresh?"
- If resuming, summarize the current state briefly, continue from its existing decisions and outstanding questions, and update the existing document instead of creating a duplicate

#### 0.2 Assess Whether Brainstorming Is Needed

**Clear requirements indicators:**
- Specific acceptance criteria provided
- Referenced existing patterns to follow
- Described exact expected behavior
- Constrained, well-defined scope

**If requirements are already clear:**
- **In autopilot mode:** skip brainstorm entirely and return control to the calling workflow (see Autopilot Mode above). Do not proceed to Phase 1.3 or Phase 3.
- **Otherwise:** Keep the interaction brief. Confirm understanding and present concise next-step options rather than forcing a long brainstorm. Only write a short requirements document when a durable handoff to planning or later review would be valuable. Skip Phase 1.1 and 1.2 entirely — go straight to Phase 1.3 or Phase 3.

#### 0.3 Assess Scope

Use the feature description plus a light repo scan to classify the work:
- **Lightweight** - small, well-bounded, low ambiguity
- **Standard** - normal feature or bounded refactor with some decisions to make
- **Deep** - cross-cutting, strategic, or highly ambiguous

If the scope is unclear, ask one targeted question to disambiguate and then proceed.

### Phase 1: Understand the Idea

#### 1.1 Existing Context Scan

Scan the repo before substantive brainstorming. Match depth to scope:

**Lightweight** — Search for the topic, check if something similar already exists, and move on.

**Standard and Deep** — Two passes:

*Constraint Check* — Check project instruction files (`AGENTS.md`, and `CLAUDE.md` only if retained as compatibility context) for workflow, product, or scope constraints that affect the brainstorm. If these add nothing, move on.

*Topic Scan* — Search for relevant terms. Read the most relevant existing artifact if one exists (brainstorm, plan, spec, skill, feature doc). Skim adjacent examples covering similar behavior.

If nothing obvious appears after a short scan, say so and continue. Do not drift into technical planning — avoid inspecting tests, migrations, deployment, or low-level architecture unless the brainstorm is itself about a technical decision.

#### 1.2 Product Pressure Test

Before generating approaches, challenge the request to catch misframing. Match depth to scope:

**Lightweight:**
- Is this solving the real user problem?
- Are we duplicating something that already covers this?
- Is there a clearly better framing with near-zero extra cost?

**Standard:**
- Is this the right problem, or a proxy for a more important one?
- What user or business outcome actually matters here?
- What happens if we do nothing?
- Is there a nearby framing that creates more user value without more carrying cost? If so, what complexity does it add?
- Given the current project state, user goal, and constraints, what is the single highest-leverage move right now: the request as framed, a reframing, one adjacent addition, a simplification, or doing nothing?
- Favor moves that compound value, reduce future carrying cost, or make the product meaningfully more useful or compelling
- Use the result to sharpen the conversation, not to bulldoze the user's intent

**Deep** — Standard questions plus:
- What durable capability should this create in 6-12 months?
- Does this move the product toward that, or is it only a local patch?

#### 1.3 Collaborative Dialogue

Use the platform's blocking question tool when available (see Interaction Rules). Otherwise, present numbered options in chat and wait for the user's reply before proceeding.

**Guidelines:**
- Ask questions **one at a time**
- Prefer multiple choice when natural options exist
- Prefer **single-select** when choosing one direction, one priority, or one next step
- Use **multi-select** only for compatible sets that can all coexist; if prioritization matters, ask which selected item is primary
- Start broad (problem, users, value) then narrow (constraints, exclusions, edge cases)
- Clarify the problem frame, validate assumptions, and ask about success criteria
- Make requirements concrete enough that planning will not need to invent behavior
- Surface dependencies or prerequisites only when they materially affect scope
- Resolve product decisions here; leave technical implementation choices for planning
- Bring ideas, alternatives, and challenges instead of only interviewing

**Exit condition:** Continue until the idea is clear OR the user explicitly wants to proceed.

### Phase 2: Explore Approaches

If multiple plausible directions remain, propose **2-3 concrete approaches** based on research and conversation. Otherwise state the recommended direction directly.

When useful, include one deliberately higher-upside alternative:
- Identify what adjacent addition or reframing would most increase usefulness, compounding value, or durability without disproportionate carrying cost. Present it as a challenger option alongside the baseline, not as the default. Omit it when the work is already obviously over-scoped or the baseline request is clearly the right move.

For each approach, provide:
- Brief description (2-3 sentences)
- Pros and cons
- Key risks or unknowns
- When it's best suited

Lead with your recommendation and explain why. Prefer simpler solutions when added complexity creates real carrying cost, but do not reject low-cost, high-value polish just because it is not strictly necessary.

If one approach is clearly best and alternatives are not meaningful, skip the menu and state the recommendation directly.

If relevant, call out whether the choice is:
- Reuse an existing pattern
- Extend an existing capability
- Build something net new

### Phase 3: Capture the Requirements

Write or update a requirements document only when the conversation produced durable decisions worth preserving.

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
- R1. [Concrete user-facing behavior or requirement]
- R2. [Concrete user-facing behavior or requirement]

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
[If `Resolve Before Planning` is empty: `→ /ce:plan` for structured implementation planning]
[If `Resolve Before Planning` is not empty: `→ Resume /ce:brainstorm` to resolve blocking questions before planning]
```

For **Standard** and **Deep** brainstorms, a requirements document is usually warranted.

For **Lightweight** brainstorms, keep the document compact. Skip document creation when the user only needs brief alignment and no durable decisions need to be preserved.

For very small requirements docs with only 1-3 simple requirements, plain bullet requirements are acceptable. For **Standard** and **Deep** requirements docs, use stable IDs like `R1`, `R2`, `R3` so planning and later review can refer to them unambiguously.

When the work is simple, combine sections rather than padding them. A short requirements document is better than a bloated one.

Before finalizing, check:
- What would `ce:plan` still have to invent if this brainstorm ended now?
- Do any requirements depend on something claimed to be out of scope?
- Are any unresolved items actually product decisions rather than planning questions?
- Did implementation details leak in when they shouldn't have?
- Is there a low-cost change that would make this materially more useful?

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

### Phase 4: Handoff

#### 4.1 Present Next-Step Options

**In autopilot mode:** skip Phase 4 entirely. Write the requirements document (if warranted by the brainstorm), update the manifest with the document path when one exists, and return control to the calling workflow. Do not present handoff options or invoke `/ce:plan`.

**Otherwise:** Present next steps using the platform's blocking question tool when available (see Interaction Rules). Otherwise present numbered options in chat and end the turn.

If `Resolve Before Planning` contains any items:
- Ask the blocking questions now, one at a time, by default
- If the user explicitly wants to proceed anyway, first convert each remaining item into an explicit decision, assumption, or `Deferred to Planning` question
- If the user chooses to pause instead, present the handoff as paused or blocked rather than complete
- Do not offer `Proceed to planning` or `Proceed directly to work` while `Resolve Before Planning` remains non-empty

**Question when no blocking questions remain:** "Brainstorm complete. What would you like to do next?"

**Question when blocking questions remain and user wants to pause:** "Brainstorm paused. Planning is blocked until the remaining questions are resolved. What would you like to do next?"

Present only the options that apply:
- **Proceed to planning (Recommended)** - Run `/ce:plan` for structured implementation planning
- **Proceed directly to work** - Only offer this when scope is lightweight, success criteria are clear, scope boundaries are clear, and no meaningful technical or research questions remain
- **Review and refine** - Offer this only when a requirements document exists and can be improved through structured review
- **Ask more questions** - Continue clarifying scope, preferences, or edge cases
- **Share to Proof** - Offer this only when a requirements document exists
- **Done for now** - Return later

If the direct-to-work gate is not satisfied, omit that option entirely.

#### 4.2 Handle the Selected Option

**If user selects "Proceed to planning (Recommended)":**

Immediately run `/ce:plan` in the current session. Pass the requirements document path when one exists; otherwise pass a concise summary of the finalized brainstorm decisions. Do not print the closing summary first.

**If user selects "Proceed directly to work":**

Immediately run `/ce:work` in the current session using the finalized brainstorm output as context. If a compact requirements document exists, pass its path. Do not print the closing summary first.

**If user selects "Share to Proof":**

```bash
CONTENT=$(cat docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md)
TITLE="Requirements: <topic title>"
RESPONSE=$(curl -s -X POST https://www.proofeditor.ai/share/markdown \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg title "$TITLE" --arg markdown "$CONTENT" --arg by "ai:compound" '{title: $title, markdown: $markdown, by: $by}')")
PROOF_URL=$(echo "$RESPONSE" | jq -r '.tokenUrl')
```

Display the URL prominently: `View & collaborate in Proof: <PROOF_URL>`

If the curl fails, skip silently. Then return to the Phase 4 options.

**If user selects "Ask more questions":** Return to Phase 1.3 (Collaborative Dialogue) and continue asking the user questions one at a time to further refine the design. Probe deeper into edge cases, constraints, preferences, or areas not yet explored. Continue until the user is satisfied, then return to Phase 4. Do not show the closing summary yet.

**If user selects "Review and refine":**

Load the `document-review` skill and apply it to the requirements document.

When document-review returns "Review complete", return to the normal Phase 4 options and present only the options that still apply. Do not show the closing summary yet.

#### 4.3 Closing Summary

Use the closing summary only when this run of the workflow is ending or handing off, not when returning to the Phase 4 options.

When complete and ready for planning, display:

```text
Brainstorm complete!

Requirements doc: docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md  # if one was created

Key decisions:
- [Decision 1]
- [Decision 2]

Recommended next step: `/ce:plan`
```

If the user pauses with `Resolve Before Planning` still populated, display:

```text
Brainstorm paused.

Requirements doc: docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md  # if one was created

Planning is blocked by:
- [Blocking question 1]
- [Blocking question 2]

Resume with `/ce:brainstorm` when ready to resolve these before planning.
```
