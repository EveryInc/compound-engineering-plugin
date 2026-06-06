---
name: ce-plan
description: "Create structured plans for multi-step tasks -- software features, research workflows, events, study plans, or any goal that benefits from breakdown. Use when the user says 'plan this', 'create a plan', 'how should we build', 'break this down', or when a brainstorm doc is ready for planning."
argument-hint: "[optional: feature description, requirements doc path, plan path to deepen, or any task to plan]"
---

# Create Technical Plan

`ce-brainstorm` defines **WHAT** to build. `ce-plan` defines **HOW** to build it. `ce-work` executes the plan. A prior brainstorm is useful context but never required -- `ce-plan` works from any input: a requirements doc, a bug report, a feature idea, or a rough description.

**When directly invoked, always plan.** Never classify a direct invocation as "not a planning task" and abandon the workflow. If the input is unclear, ask clarifying questions so we can keep going.

For Zed, this skill is markdown-only: do not emit HTML. Plans are written as `.md` files and consumed by `ce-work` or opened in a browser.

**This workflow produces a durable implementation plan. It does not implement code.**

## Feature Description

<feature_description> #$ARGUMENTS </feature_description>

**If the feature description above is empty, ask the user:** "What would you like to plan? Describe the task, goal, or project you have in mind." Then wait for their response before continuing.

**If two fields are detected in the feature description:** treat them as `feature description` followed by `requirements doc path`.

- Split the feature description at the first blank line or semicolon boundary that yields two clear inputs.
- Goal phrase => planning target.
- Path phrase => requirements doc path (must exist).
- If the path does not exist, warn and continue without it.

**If only one field is detected:** treat it as the planning target and scan for a requirements doc path if needed.

## Conversation State

Track the planning flow during the session so you can resume context if asked to continue.

```json
{
  "phase": "0.0",
  "output_format": "md",
  "plan_basename": "2026-05-13-001-feat-auth-plan"
}
```

This state is informational and not persisted to disk.

## Core Principles

1. **Requirements are the source of truth.** If `ce-brainstorm` produced a requirements document, planning should build from it rather than re-inventing behavior.
2. **Decisions, not code.** Capture approach, boundaries, files, dependencies, risks, and test scenarios. Do not pre-write implementation code.
3. **Research before structuring.** Explore the codebase, institutional learnings, and external guidance when warranted before finalizing the plan.
4. **Right-size the artifact.** Small work gets a compact plan. Large work gets more structure.
5. **Portable.** Keep file paths repo-relative.
6. **Carry execution posture lightly.** If test-first or characterization-first is clearly indicated, reflect it lightly in the relevant implementation units.

## Workflow

### Phase 0: Resolve Output Mode

**Zed constraint:** this skill emits markdown only. If the resolved output mode is `html`, stop and report:

> Output mode `html` is not supported in the Zed-native ce-plan. Switch to markdown and retry.

Then wait for the user to confirm or change their request.

If the mode is valid (the default is `md`), proceed.

### Phase 0.1 Resume Existing Plan Work When Appropriate

If the user mentions an existing plan path, read it and decide whether to update it in place or create a new plan. Do not re-run the full flow when deepening is explicitly requested; instead jump to the confidence check / deepening flow.

### Phase 0.2 Find Upstream Requirements Document

If a second input path was detected in the feature description, treat it as the requirements document.

- Confirm it exists.
- Read it thoroughly.
- Carry forward problem frame, actors, flows, acceptance examples, requirements, scope boundaries, key decisions, dependencies, and outstanding questions.

Reclassify depth upward when the requirements document signals wide scope or cross-cutting concerns.

### Phase 0.3 Planning Bootstrap (No Requirements Doc or Unclear Input)

If no requirements document is available or the input is unclear:

- Ask: "What would you like to plan? Describe the task, goal, or project."
- Establish: problem frame, intended behavior, scope boundaries, success criteria, blocking questions.
- Keep it brief.
- If major unresolved product questions remain, suggest `ce-brainstorm` but always offer to continue planning here.

### Phase 0.4 Classify Task Domain

If the task is software work, continue to Phase 1. Otherwise, stop and explain that this skill is shaped for implementation plans.

<domain_assessment>
Brief note on whether the task fits the implementation-plan shape.
</domain_assessment>

## Phase 1: Research

### 1.1 Local Research

Collect planning context:

- Origin document summary (if present).
- `STRATEGY.md` excerpts if present.
- Repo patterns, `AGENTS.md` guidance, `` docs/solutions/`` learnings.
- Existing relevant files and tests.

Run three researcher-style prompts in parallel (Zed-native equivalent of a `spawn_agent` batch). If `spawn_agent` is unavailable, run them sequentially in chat.

#### Researcher 1: Repo and Strategy Research

Focus: existing code patterns, conventions, repo-decided architecture, active tracks.

```text
You are a repo research analyst reviewing [REPO_NAME].

Planning context summary: [Insert planning context summary]

Please find:
- Technology stack and versions
- Architectural patterns and conventions to follow
- Implementation patterns, relevant files, modules, and tests
- AGENTS.md guidance that materially affects this plan
- STRATEGY.md pieces that constrain or shape this plan
- Related issues, PRs, or prior art
```

#### Researcher 2: Institutional Learnings

Focus: `docs/solutions/` and other project-internal knowledge that applies to this plan.

```text
You are a learnings researcher.

Planning context summary: [Insert planning context summary]

Please find:
- Institutional learnings that apply to this plan
- Past solutions, bugs, design patterns, workflow learnings
- Guardrails or constraints documented in project history
```

#### Researcher 3: External Landscape and References

Focus: external best practices, framework docs, market/prior-art context.

```text
You are an external research assistant.

Planning context summary: [Insert planning context summary]

Please find:
- Relevant framework or library best practices
- Competitor or prior-art approaches, if relevant
- External guidance that materially shapes this plan
- Any constraints the plan should account for
```

**Consolidate** findings after all three complete. Mark whether external research was load-bearing.

### 1.2 Scope Check and Reclassification

If the task was originally lightweight and research reveals an external contract surface (public APIs, CI, exports), reclassify upward and note why.

## Phase 2: Resolve Planning Questions

Build a planning question list from:

- Deferred questions in the origin document
- Gaps discovered in repo or external research
- Technical decisions required to produce a useful plan

For each question, decide whether it should be:

- **Resolved during planning** - answerable from repo context or external references
- **Deferred to implementation** - depends on runtime or execution discovery

If the input is truly unclear, ask the user a single focused question before continuing.

**Do not run tests or execute code in this phase.**

## Phase 3: Write the Plan

### 3.1 Plan Depth Guidance

- **Lightweight** - 2-4 implementation units, concise sections
- **Standard** - 3-6 implementation units, include risks and system-wide impact when relevant
- **Deep** - 4-8 implementation units, include alternatives, success metrics, and phased delivery when warranted

### 3.2 Section Contract

Read `references/plan-sections.md` before composing. The plan should include:

- **Summary** - what the plan proposes (1-3 lines, forward-looking)
- **Problem Frame** - why the work is being done (backward-looking)
- **Requirements** (R-IDs) - what must be true after shipping
- **Key Technical Decisions** (KTDs) - load-bearing choices and rationale
- **Implementation Units** (U-IDs) - discrete, independently landable work

Include these sections only when material:

- **High-Level Technical Design** - architecture or cross-component shape
- **Scope Boundaries** - contested scope, deferred work, or non-goals worth pinning
- **Open Questions** - genuinely unresolved blockers; omit when complete
- **System-Wide Impact** - cross-cutting concerns
- **Risks & Dependencies** - real risks and assumptions
- **Acceptance Examples** - conditional requirements or state-dependent behavior
- **Documentation / Operational Notes** - docs, monitoring, runbooks

### 3.3 Planning Rules

- **Horizontal rules (`---`)** between top-level sections in Standard and Deep plans.
- **All file paths must be repo-relative** -- never absolute paths.
- **One idea per sentence.** Do not pad sections.
- **Use stable IDs:** R1, U1, KTD1 as plain prefixes. Do not bold them.
- **Test scenarios** for each feature-bearing unit: name inputs, actions, and expected outcomes.
- **No implementation code** -- pseudo-code and diagrams are allowed when they clarify design.
- **Group Requirements by concern** when they span distinct areas.

### 3.4 Write the Plan File

Use the Write tool to save the complete plan:

```text
docs/plans/<YYYY-MM-DD>-NNN-<type>-<descriptive-name>-plan.md
```

Use repo-relative paths throughout. Before writing, run a quick scan:

- Requirements are linked to implementation units.
- File paths are repo-relative.
- Stable IDs are plain-prefix format.
- No process exhaust.
- No tradeoffs that were never resolved.

## Phase 3.5 Verify Output File

Immediately after writing the plan, verify the file exists and contains the minimum viable structure before reporting success.

Verify:

- The file exists at the intended repo-relative path.
- It has non-empty content.
- It includes the top-level sections: `Requirements`, `Implementation Units`, and a closing `Documentation / Operational Notes` block.

If any check fails, do not report success. Recover by rewriting the file or missing sections, then verify again.

## Phase 4: Plan Review and Deepening (On-Demand)

If the user requests "deepen the plan" or "deepening pass" on an existing plan file, enter this phase.

Otherwise, skip to Post-Generation Options.

### 4.1 Score Confidence Gaps

Evaluate selected sections using the confidence scoring checklists in `references/deepening-workflow.md`.

- Check trigger count, risk bonus, and critical-section bonus.
- Choose the top 2-5 sections by score.
- Prefer sections that have not yet been substantially strengthened.

### 4.2 Targeted Research

For each selected section, run the smallest useful researcher set.

Use Zed-style researcher prompts rather than Claude Code-specific agent names.

#### Section-to-Researcher Mapping (Zed)

- **Requirements / Open Questions** -- repo + learnings researchers
- **Context & Research / Sources & References** -- learnings + external researchers
- **Key Technical Decisions** -- repo + external researchers
- **High-Level Technical Design** -- repo + learnings researchers
- **Implementation Units / Verification** -- repo researchers
- **System-Wide Impact** -- repo + external researchers
- **Risks & Dependencies / Operational Notes** -- external researchers

Launch researchers in parallel when possible.

### 4.3 Synthesis

Integrate findings that strengthen the selected sections.

Allowed changes:

- Tighten rationale and decision explanations
- Clarify requirements trace or origin fidelity
- Add missing pattern references or test scenarios
- Strengthen risks, system-wide impact, or rollout treatment
- Add or update technical design when warranted
- Update the `deepened:` date in frontmatter

Do not:

- Rewrite the plan from scratch
- Renumber stable IDs
- Add implementation code
- Invent new requirements or scope changes

## Post-Generation Options

**Summary line:** `Plan written to <absolute path>. What would you like to do next?`

**Options:**
1. **Start `/ce-work`** - Begin implementing this plan in the current session
2. **Open in browser** - Open the markdown plan file locally for review
3. **Done for now** - Pause; plan saved for later

**Routing:**

- **Start `/ce-work`** - Invoke `Skill ce-work` with the plan path.
- **Open in browser** - Display absolute path to the `.md` plan file.
- **Done for now** - End session, plan saved.

**Note:** Claude Code ecosystem features (Issue creation, Proof/HITL review) are not included in the Zed-native port. The three options above cover the core plan-handoff flows.

## Handling Unsupported Requests

If the user requests HTML output, respond once:

> Output mode `html` is not supported in the Zed-native ce-plan. Switch to markdown and retry.

Do not block further planning after this message; wait for the user's choice.

If the user requests a feature outside this workflow's scope, suggest the closest matching skill (`ce-brainstorm`, `ce-debug`, `ce-work`, `ce-resolve-pr-feedback`) or proceed if the request is clearly a planning task.
