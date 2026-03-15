---
name: ce:plan
description: Transform feature descriptions or requirements into structured implementation plans grounded in repo patterns and research. Use when the user says "plan this", "create a plan", "how should we build", "write a tech plan", "plan the implementation", or when a brainstorm/requirements document is ready for implementation planning. Also triggers on "what's the approach for", "break this down", or references to an existing requirements doc that needs a technical plan.
argument-hint: "[feature description, requirements doc path, or improvement idea]"
---

# Create Technical Plan

**Note: The current year is 2026.** Use this when dating plans and searching for recent documentation.

`ce:brainstorm` defines **WHAT** to build. `ce:plan` defines **HOW** to build it. `ce:work` executes the plan.

This workflow produces a durable implementation plan. It does **not** implement code, run tests, or learn from execution-time results. If the answer depends on changing code and seeing what happens, that belongs in `ce:work`, not here.

## Interaction Method

Use the platform's interactive question mechanism when available. Otherwise, present numbered options in chat and wait for the user's reply before proceeding.

Ask one question at a time. Prefer a concise single-select choice when natural options exist.

## Feature Description

<feature_description> #$ARGUMENTS </feature_description>

**If the feature description above is empty, ask the user:** "What would you like to plan? Please describe the feature, bug fix, or improvement you have in mind."

Do not proceed until you have a clear planning input.

## Core Principles

1. **Use requirements as the source of truth** - If `ce:brainstorm` produced a requirements document, planning should build from it rather than re-inventing behavior.
2. **Decisions, not code** - Capture approach, boundaries, files, dependencies, risks, and test scenarios. Do not pre-write implementation code or shell command choreography.
3. **Research before structuring** - Explore the codebase, institutional learnings, and external guidance when warranted before finalizing the plan.
4. **Right-size the artifact** - Small work gets a compact plan. Large work gets more structure. The philosophy stays the same at every depth.
5. **Separate planning from execution discovery** - Resolve planning-time questions here. Explicitly defer execution-time unknowns to implementation.
6. **Keep the plan portable** - The plan should work as a living document, review artifact, or issue body without embedding tool-specific executor instructions.

## Plan Quality Bar

Every plan should contain:
- A clear problem frame and scope boundary
- Concrete requirements traceability back to the request or origin document
- Exact file paths for the work being proposed
- Explicit test file paths for feature-bearing implementation units
- Decisions with rationale, not just tasks
- Existing patterns or code references to follow
- Specific test scenarios and verification outcomes
- Clear dependencies and sequencing

A plan is ready when an implementer can start confidently without needing the plan to write the code for them.

## Workflow

### Phase 0: Resume, Source, and Scope

#### 0.1 Resume Existing Plan Work When Appropriate

If the user references an existing plan file or there is an obvious recent matching plan in `docs/plans/`:
- Read it
- Confirm whether to update it in place or create a new plan
- If updating, preserve completed checkboxes and revise only the still-relevant sections

#### 0.2 Find Upstream Requirements Document

Before asking planning questions, search `docs/brainstorms/` for files matching `*-requirements.md`.

**Relevance criteria:** A requirements document is relevant if:
- The topic semantically matches the feature description
- It was created within the last 30 days (use judgment to override if the document is clearly still relevant or clearly stale)
- It appears to cover the same user problem or scope

If multiple source documents match, ask which one to use before proceeding.

#### 0.3 Use the Source Document as Primary Input

If a relevant requirements document exists:
1. Read it thoroughly
2. Announce that it will serve as the origin document for planning
3. Carry forward all of the following:
   - Problem frame
   - Requirements and success criteria
   - Scope boundaries
   - Key decisions and rationale
   - Dependencies or assumptions
   - Outstanding questions, preserving whether they are blocking or deferred
4. Use the source document as the primary input to planning and research
5. Reference important carried-forward decisions in the plan with `(see origin: <source-path>)`
6. Do not silently omit source content — if the origin document discussed it, the plan must address it even if briefly. Before finalizing, scan each section of the origin document to verify nothing was dropped.

If no relevant requirements document exists, planning may proceed from the user's request directly.

#### 0.4 No-Requirements-Doc Fallback

If no relevant requirements document exists:
- Assess whether the request is already clear enough for direct technical planning
- If the ambiguity is mainly product framing, user behavior, or scope definition, recommend `ce:brainstorm` first
- If the user wants to continue here anyway, run a short planning bootstrap instead of refusing

The planning bootstrap should establish:
- Problem frame
- Intended behavior
- Scope boundaries and obvious non-goals
- Success criteria
- Blocking questions or assumptions

Keep this bootstrap brief. It exists to preserve direct-entry convenience, not to replace a full brainstorm.

If the bootstrap uncovers major unresolved product questions:
- Recommend `ce:brainstorm` again
- If the user still wants to continue, require explicit assumptions before proceeding

#### 0.5 Classify Outstanding Questions Before Planning

If the origin document contains `Resolve Before Planning` or similar blocking questions:
- Review each one before proceeding
- Reclassify it into planning-owned work **only if** it is actually a technical, architectural, or research question
- Keep it as a blocker if it would change product behavior, scope, or success criteria

If true product blockers remain:
- Surface them clearly
- Ask the user whether to:
  1. Resume `ce:brainstorm` to resolve them
  2. Convert them into explicit assumptions or decisions and continue
- Do not continue planning while true blockers remain unresolved

#### 0.6 Assess Plan Depth

Classify the work into one of these plan depths:

- **Lightweight** - small, well-bounded, low ambiguity
- **Standard** - normal feature or bounded refactor with some technical decisions to document
- **Deep** - cross-cutting, strategic, high-risk, or highly ambiguous implementation work

If depth is unclear, ask one targeted question and then continue.

### Phase 1: Gather Context

#### 1.1 Local Research (Always Runs)

Prepare a concise planning context summary (a paragraph or two) to pass as input to the research agents:
- If an origin document exists, summarize the problem frame, requirements, and key decisions from that document
- Otherwise use the feature description directly

Run these agents in parallel:

- Task compound-engineering:research:repo-research-analyst(planning context summary)
- Task compound-engineering:research:learnings-researcher(planning context summary)

Collect:
- Existing patterns and conventions to follow
- Relevant files, modules, and tests
- CLAUDE.md or AGENTS.md guidance that materially affects the plan
- Institutional learnings from `docs/solutions/`

#### 1.2 Decide on External Research

Based on the origin document, user signals, and local findings, decide whether external research adds value.

**Read between the lines.** Pay attention to signals from the conversation so far:
- **User familiarity** — Are they pointing to specific files or patterns? They likely know the codebase well.
- **User intent** — Do they want speed or thoroughness? Exploration or execution?
- **Topic risk** — Security, payments, external APIs warrant more caution regardless of user signals.
- **Uncertainty level** — Is the approach clear or still open-ended?

**Always lean toward external research when:**
- The topic is high-risk: security, payments, privacy, external APIs, migrations, compliance
- The codebase lacks relevant local patterns
- The user is exploring unfamiliar territory

**Skip external research when:**
- The codebase already shows a strong local pattern
- The user already knows the intended shape
- Additional external context would add little practical value

Announce the decision briefly before continuing. Examples:
- "Your codebase has solid patterns for this. Proceeding without external research."
- "This involves payment processing, so I'll research current best practices first."

#### 1.3 External Research (Conditional)

If Step 1.2 indicates external research is useful, run these agents in parallel:

- Task compound-engineering:research:best-practices-researcher(planning context summary)
- Task compound-engineering:research:framework-docs-researcher(planning context summary)

#### 1.4 Consolidate Research

Summarize:
- Relevant codebase patterns and file paths
- Relevant institutional learnings
- External references and best practices, if gathered
- Related issues, PRs, or prior art
- Any constraints that should materially shape the plan

#### 1.5 Flow and Edge-Case Analysis (Conditional)

For **Standard** or **Deep** plans, or when user flow completeness is still unclear, run:

- Task compound-engineering:workflow:spec-flow-analyzer(planning context summary, research findings)

Use the output to:
- Identify missing edge cases, state transitions, or handoff gaps
- Tighten requirements trace or verification strategy
- Add only the flow details that materially improve the plan

### Phase 2: Resolve Planning Questions

Build a planning question list from:
- Deferred questions in the origin document
- Gaps discovered in repo or external research
- Technical decisions required to produce a useful plan

For each question, decide whether it should be:
- **Resolved during planning** - the answer is knowable from repo context, documentation, or user choice
- **Deferred to implementation** - the answer depends on code changes, runtime behavior, or execution-time discovery

Ask the user only when the answer materially affects architecture, scope, sequencing, or risk and cannot be responsibly inferred.

**Do not** run tests, build the app, or probe runtime behavior in this phase. The goal is a strong plan, not partial execution.

### Phase 3: Structure the Plan

#### 3.1 Title and File Naming

- Draft a clear, searchable title using conventional format such as `feat: Add user authentication` or `fix: Prevent checkout double-submit`
- Determine the plan type: `feat`, `fix`, or `refactor`
- Build the filename following the repository convention: `docs/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.md`
  - Create `docs/plans/` if it does not exist
  - Check existing files for today's date to determine the next sequence number (zero-padded to 3 digits, starting at 001)
  - Keep the descriptive name concise (3-5 words) and kebab-cased
  - Examples: `2026-01-15-001-feat-user-authentication-flow-plan.md`, `2026-02-03-002-fix-checkout-race-condition-plan.md`
  - Avoid: missing sequence numbers, vague names like "new-feature", invalid characters (colons, spaces)

#### 3.2 Stakeholder and Impact Awareness

For **Standard** or **Deep** plans, briefly consider who is affected by this change — end users, developers, operations, other teams — and how that should shape the plan. For cross-cutting work, note affected parties in the System-Wide Impact section.

#### 3.3 Break Work into Implementation Units

Break the work into logical implementation units. Each unit should represent one meaningful change that an implementer could typically land as an atomic commit.

Good units are:
- Focused on one component, behavior, or integration seam
- Usually touching a small cluster of related files
- Ordered by dependency
- Concrete enough for execution without pre-writing code
- Marked with checkbox syntax for progress tracking

Avoid:
- 2-5 minute micro-steps
- Units that span multiple unrelated concerns
- Units that are so vague an implementer still has to invent the plan

#### 3.4 Define Each Implementation Unit

For each unit, include:
- **Goal** - what this unit accomplishes
- **Requirements** - which requirements or success criteria it advances
- **Dependencies** - what must exist first
- **Files** - exact file paths to create, modify, or test
- **Approach** - key decisions, data flow, component boundaries, or integration notes
- **Patterns to follow** - existing code or conventions to mirror
- **Test scenarios** - specific behaviors, edge cases, and failure paths to cover
- **Verification** - how an implementer should know the unit is complete, expressed as outcomes rather than shell command scripts

Every feature-bearing unit should include the test file path in `**Files:**`.

#### 3.5 Keep Planning-Time and Implementation-Time Unknowns Separate

If something is important but not knowable yet, record it explicitly under deferred implementation notes rather than pretending to resolve it in the plan.

Examples:
- Exact method or helper names
- Final SQL or query details after touching real code
- Runtime behavior that depends on seeing actual test failures
- Refactors that may become unnecessary once implementation starts

### Phase 4: Write the Plan

Use one planning philosophy across all depths. Change the amount of detail, not the boundary between planning and execution.

#### 4.1 Plan Depth Guidance

**Lightweight**
- Keep the plan compact
- Usually 2-4 implementation units
- Omit optional sections that add little value

**Standard**
- Use the full core template
- Usually 3-6 implementation units
- Include risks, deferred questions, and system-wide impact when relevant

**Deep**
- Use the full core template plus optional analysis sections
- Usually 4-8 implementation units
- Group units into phases when that improves clarity
- Include alternatives considered, documentation impacts, and deeper risk treatment when warranted

#### 4.1b Optional Deep Plan Extensions

For sufficiently large, risky, or cross-cutting work, add the sections that genuinely help:
- **Alternative Approaches Considered**
- **Success Metrics**
- **Dependencies / Prerequisites**
- **Risk Analysis & Mitigation**
- **Phased Delivery**
- **Documentation Plan**
- **Operational / Rollout Notes**
- **Future Considerations** only when they materially affect current design

Do not add these as boilerplate. Include them only when they improve execution quality or stakeholder alignment.

#### 4.2 Core Plan Template

Omit clearly inapplicable optional sections, especially for Lightweight plans.

```markdown
---
title: [Plan Title]
type: [feat|fix|refactor]
status: active
date: YYYY-MM-DD
origin: docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md  # include when planning from a requirements doc
---

# [Plan Title]

## Overview

[What is changing and why]

## Problem Frame

[Summarize the user/business problem and context. Reference the origin doc when present.]

## Requirements Trace

- R1. [Requirement or success criterion this plan must satisfy]
- R2. [Requirement or success criterion this plan must satisfy]

## Scope Boundaries

- [Explicit non-goal or exclusion]

## Context & Research

### Relevant Code and Patterns

- [Existing file, class, component, or pattern to follow]

### Institutional Learnings

- [Relevant `docs/solutions/` insight]

### External References

- [Relevant external docs or best-practice source, if used]

## Key Technical Decisions

- [Decision]: [Rationale]

## Open Questions

### Resolved During Planning

- [Question]: [Resolution]

### Deferred to Implementation

- [Question or unknown]: [Why it is intentionally deferred]

## Implementation Units

- [ ] **Unit 1: [Name]**

**Goal:** [What this unit accomplishes]

**Requirements:** [R1, R2]

**Dependencies:** [None / Unit 1 / external prerequisite]

**Files:**
- Create: `path/to/new_file`
- Modify: `path/to/existing_file`
- Test: `path/to/test_file`

**Approach:**
- [Key design or sequencing decision]

**Patterns to follow:**
- [Existing file, class, or pattern]

**Test scenarios:**
- [Specific scenario with expected behavior]
- [Edge case or failure path]

**Verification:**
- [Outcome that should hold when this unit is complete]

## System-Wide Impact

- **Interaction graph:** [What callbacks, middleware, observers, or entry points may be affected]
- **Error propagation:** [How failures should travel across layers]
- **State lifecycle risks:** [Partial-write, cache, duplicate, or cleanup concerns]
- **API surface parity:** [Other interfaces that may require the same change]
- **Integration coverage:** [Cross-layer scenarios unit tests alone will not prove]

## Risks & Dependencies

- [Meaningful risk, dependency, or sequencing concern]

## Documentation / Operational Notes

- [Docs, rollout, monitoring, or support impacts when relevant]

## Sources & References

- **Origin document:** [docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md](path)
- Related code: [path or symbol]
- Related PRs/issues: #[number]
- External docs: [url]
```

For larger `Deep` plans, extend the core template only when useful with sections such as:

```markdown
## Alternative Approaches Considered

- [Approach]: [Why rejected or not chosen]

## Success Metrics

- [How we will know this solved the intended problem]

## Dependencies / Prerequisites

- [Technical, organizational, or rollout dependency]

## Risk Analysis & Mitigation

- [Risk]: [Mitigation]

## Phased Delivery

### Phase 1
- [What lands first and why]

### Phase 2
- [What follows and why]

## Documentation Plan

- [Docs or runbooks to update]

## Operational / Rollout Notes

- [Monitoring, migration, feature flag, or rollout considerations]
```

#### 4.3 Planning Rules

- Prefer path plus class/component/pattern references over brittle line numbers
- Keep implementation units checkable with `- [ ]` syntax for progress tracking
- Do not include fenced implementation code blocks unless the plan itself is about code shape as a design artifact
- Do not include git commands, commit messages, or exact test command recipes
- Do not pretend an execution-time question is settled just to make the plan look complete
- Include mermaid diagrams when they clarify relationships or flows that prose alone would make hard to follow — ERDs for data model changes, sequence diagrams for multi-service interactions, state diagrams for lifecycle transitions, flowcharts for complex branching logic

### Phase 5: Final Review, Write File, and Handoff

#### 5.1 Review Before Writing

Before finalizing, check:
- The plan does not invent product behavior that should have been defined in `ce:brainstorm`
- If there was no origin document, the bounded planning bootstrap established enough product clarity to plan responsibly
- Every major decision is grounded in the origin document or research
- Each implementation unit is concrete, dependency-ordered, and implementation-ready
- Test scenarios are specific without becoming test code
- Deferred items are explicit and not hidden as fake certainty

If the plan originated from a requirements document, re-read that document and verify:
- The chosen approach still matches the product intent
- Scope boundaries and success criteria are preserved
- Blocking questions were either resolved, explicitly assumed, or sent back to `ce:brainstorm`
- Every section of the origin document is addressed in the plan — scan each section to confirm nothing was silently dropped

#### 5.2 Write Plan File

**REQUIRED: Write the plan file to disk before presenting any options.**

Use the Write tool to save the complete plan to:

```text
docs/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.md
```

Confirm:

```text
Plan written to docs/plans/[filename]
```

**Pipeline mode:** If invoked from an automated workflow such as LFG, SLFG, or any `disable-model-invocation` context, skip interactive questions. Make the needed choices automatically and proceed to writing the plan.

#### 5.3 Post-Generation Options

After writing the plan file, present the options using the platform's interactive question mechanism when available. Otherwise present numbered options in chat.

**Question:** "Plan ready at `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md`. What would you like to do next?"

**Options:**
1. **Open plan in editor** - Open the plan file for review
2. **Run `/deepen-plan`** - Enhance sections with parallel research agents
3. **Review and refine** - Improve the plan through structured document review
4. **Share to Proof** - Upload the plan for collaborative review and sharing
5. **Start `/ce:work`** - Begin implementing this plan locally
6. **Start `/ce:work` on remote** - Begin implementing in Claude Code on the web
7. **Create Issue** - Create an issue in the configured tracker

Based on selection:
- **Open plan in editor** → Run `open docs/plans/<plan_filename>.md`
- **`/deepen-plan`** → Call `/deepen-plan` with the plan path
- **Review and refine** → Load the `document-review` skill
- **Share to Proof** → Upload the plan:
  ```bash
  CONTENT=$(cat docs/plans/<plan_filename>.md)
  TITLE="Plan: <plan title from frontmatter>"
  RESPONSE=$(curl -s -X POST https://www.proofeditor.ai/share/markdown \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg title "$TITLE" --arg markdown "$CONTENT" --arg by "ai:compound" '{title: $title, markdown: $markdown, by: $by}')")
  PROOF_URL=$(echo "$RESPONSE" | jq -r '.tokenUrl')
  ```
  Display `View & collaborate in Proof: <PROOF_URL>` if successful, then return to the options
- **`/ce:work`** → Call `/ce:work` with the plan path
- **`/ce:work` on remote** → Run `/ce:work docs/plans/<plan_filename>.md &`
- **Create Issue** → Follow the Issue Creation section below
- **Other** → Accept free text for revisions and loop back to options

If running with ultrathink enabled, automatically run `/deepen-plan` after plan creation for maximum grounding.

## Issue Creation

When the user selects "Create Issue", detect their project tracker from CLAUDE.md:

1. Look for `project_tracker: github` or `project_tracker: linear`
2. If GitHub:

   ```bash
   gh issue create --title "<type>: <title>" --body-file <plan_path>
   ```

3. If Linear:

   ```bash
   linear issue create --title "<title>" --description "$(cat <plan_path>)"
   ```

4. If no tracker is configured:
   - Ask which tracker they use
   - Suggest adding the tracker to CLAUDE.md for future runs

After issue creation:
- Display the issue URL
- Ask whether to proceed to `/ce:work`

NEVER CODE! Research, decide, and write the plan.
