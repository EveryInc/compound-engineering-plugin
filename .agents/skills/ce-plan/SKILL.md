---
name: ce-plan
target: zed
description: "Create structured plans for multi-step tasks -- software features, research workflows, events, study plans, or any goal that benefits from breakdown. Also deepens existing plans with interactive sub-agent review. Use when the user says 'plan this', 'create a plan', 'how should we build', 'break this down', or when a brainstorm doc is ready for planning. Use 'deepen the plan' or 'deepening pass' for the deepening flow. For exploratory requests, prefer ce-brainstorm first."
argument-hint: "[optional: feature description, requirements doc path, plan path to deepen, or any task to plan]"
---

# Create Technical Plan

`ce-brainstorm` defines **WHAT** to build. `ce-plan` defines **HOW** to build it. `ce-work` executes the plan. A prior brainstorm is useful context but never required — `ce-plan` works from any input: a requirements doc, a bug report, a feature idea, or a rough description.

**When directly invoked, always plan.** Never classify a direct invocation as "not a planning task" and abandon the workflow. If the input is unclear, ask clarifying questions or use the planning bootstrap (Phase 0.4) to establish enough context — but always stay in the planning workflow.

This workflow produces a durable implementation plan. It does **not** implement code, run tests, or learn from execution-time results. If the answer depends on changing code and seeing what happens, that belongs in `ce-work`, not here.

## Feature Description

<feature_description> #$ARGUMENTS </feature_description>

**If the feature description above is empty, ask the user:** "What would you like to plan? Describe the task, goal, or project you have in mind." Then wait for their response before continuing.

If the input is present but unclear or underspecified, do not abandon — ask one or two clarifying questions, or proceed to Phase 0.4's planning bootstrap to establish enough context. The goal is always to help the user plan, never to exit the workflow.

**All file references in the plan must use repo-relative paths (e.g., `src/file.ts`), never absolute paths.** Absolute paths break portability across machines and teammates.

## Core Principles

1. **Use requirements as the source of truth** - Build from `ce-brainstorm` if it exists, don't re-invent.
2. **Decisions, not code** - Capture approach, boundaries, files, dependencies, risks, test scenarios. No pre-written implementation code.
3. **Research before structuring** - Explore codebase, learnings, and external guidance when warranted.
4. **Right-size the artifact** - Small work = compact plan. Large work = more structure.
5. **Separate planning from execution discovery** - Resolve here, defer execution unknowns explicitly.
6. **Keep the plan portable** - Plan works as living doc, review artifact, or issue body without executor instructions.
7. **Carry execution posture lightly** - If test-first or characterization-first is implied, reflect it as a lightweight signal. No step-by-step choreography.
8. **Honor user-named resources** - Treat named CLIs, URLs, files, or artifacts as authoritative input. Verify availability before substituting.

## Plan Quality Bar

Every plan should contain:

- A clear problem frame and scope boundary
- Concrete requirements traceability back to the request or origin document
- Repo-relative file paths (never absolute paths)
- Explicit test file paths for feature-bearing implementation units
- Decisions with rationale, not just tasks
- Existing patterns or code references to follow
- Enumerated test scenarios for each feature-bearing unit, specific enough that an implementer knows what to test
- Clear dependencies and sequencing

A plan is ready when an implementer can start confidently without needing the plan to write the code for them.

## Workflow

### Phase 0: Resume, Source, and Scope

#### 0.0 Resolve Output Mode

Zed constraint: markdown only. OUTPUT_FORMAT is always `md`. Load `references/markdown-rendering.md` for format principles. If the user requests HTML output, respond once:

> Output mode `html` is not supported in the Zed-native ce-plan. Switch to markdown and retry.

Then wait for the user to confirm or change their request before proceeding. If the user continues with markdown, proceed to Phase 0.1.

#### 0.1 Resume Existing Plan Work When Appropriate

If the user references an existing plan file or there is an obvious recent matching plan in `docs/plans/`:

- Read it
- Confirm whether to update it in place or create a new plan
- If updating, revise only the still-relevant sections. Plans do not carry per-unit progress state — progress is derived from git by `ce-work`.

**Deepen intent:** The word "deepen" (or "deepening") in reference to a plan is the primary trigger for the deepening fast path. When the user says "deepen the plan", "run a deepening pass", or similar, short-circuit to Phase 5.3 (Confidence Check and Deepening) in interactive mode. The target is a plan in `docs/plans/`. Use any path or context the user provides to identify the right plan. If not obvious, confirm with the user.

Words like "strengthen", "confidence", "gaps", and "rigor" are NOT sufficient on their own to trigger deepening. These appear in normal editing requests. Only treat as deepening when the request targets the plan as a whole and does not name a specific section.

Once identified and confirmed complete (`status: active`), short-circuit to Phase 5.3 in interactive mode. This avoids re-running the full planning workflow.

Normal editing requests (e.g., "update test scenarios", "add a new implementation unit") follow the standard resume flow — update, then continue to Phase 5.2 after revision.

#### 0.1a Recognize Approach-Altitude Requests

Some requests are better answered one level up: produce a grounded **approach-plan** — a plan for _how the deliverable will be made_ — and hold there. Runs after Phase 0.1 fast paths and before Phase 0.1b.

**Explicit (always honored):** User asks for the approach itself ("plan for a plan", "plan the approach", "don't do it yet") → enter approach altitude, hold. Do NOT begin the deliverable.

**Proactive (rare):** Offer only when BOTH method uncertainty AND cost of getting it wrong are clearly high. Otherwise stay silent. The offer is a single dismissible line.

On entry read `references/approach-altitude.md` and follow it. Otherwise continue to Phase 0.1b.

#### 0.1b Classify Task Domain

If the task asks to build, modify, refactor, deploy, or architect software (code, schemas, infrastructure), continue to Phase 0.2.

Classify by task-type, not topic. A request that merely references code is not automatically software: building or modifying code is software; investigating or analyzing it is answer-seeking and routes to `references/universal-planning.md`.

If the domain is genuinely ambiguous, ask the user before routing. Otherwise, read `references/universal-planning.md` and follow that workflow. Skip all subsequent phases.

#### 0.2 Find Upstream Requirements

Search `docs/brainstorms/` for `*-requirements.md`. Relevance: topic match, <30 days old, same problem/scope. If multiple match, present options in chat.

#### 0.3 Use the Source Document as Primary Input

If a relevant requirements doc exists: read it, announce as origin, carry forward (problem frame, A/F/AE IDs, requirements, scope boundaries, key decisions, dependencies, outstanding questions). Use as primary input. Reference carried decisions with `(see origin: <path>)`. Scan each origin section before finalizing. If no doc, proceed from user's request.

#### 0.4 Planning Bootstrap (No Requirements Doc or Unclear Input)

If no requirements document exists or the input needs more structure:

- If the request is already clear enough for direct technical planning, continue to Phase 0.5
- If ambiguity is mainly product framing, recommend `ce-brainstorm` but offer to continue here
- If continuing, establish: problem frame, intended behavior, scope boundaries and non-goals, success criteria, blocking questions

If the bootstrap uncovers major unresolved product questions, recommend `ce-brainstorm` again. If the user still wants to continue, require explicit assumptions before proceeding.

If the bootstrap reveals a different workflow would serve better:

- **Bug-shaped prompt** — surface `ce-debug` as a route-out alongside continuing with ce-plan
- **Clear task ready to execute** — suggest `ce-work` as a faster alternative

#### 0.5 Classify Outstanding Questions

If origin doc has `Resolve Before Planning` blockers: review each, reclassify technical questions as planning-owned, keep product blockers as blockers. If true product blockers remain, offer in chat: resume ce-brainstorm or convert to assumptions. Do not continue with blockers unresolved.

#### 0.6 Assess Plan Depth

Classify the work:

- **Lightweight** - small, well-bounded, low ambiguity
- **Standard** - normal feature or bounded refactor with technical decisions to document
- **Deep** - cross-cutting, strategic, high-risk, or highly ambiguous implementation work

If depth is unclear, ask one targeted question and continue.

#### 0.7 Solo-Mode Scoping Synthesis

Surface scope/approach forks where user input changes the plan before Phase 1 research. Fires only in solo invocation (no brainstorm, stayed in ce-plan, no blockers, not on fast paths).

**Read `references/synthesis-summary.md` before composing.** Internal three-bucket draft (Stated / Inferred / Out of scope), derive call-outs, emit template.

**Summary shape:** scope claim — what the plan targets, what it does not. Tier budgets (ceilings, not targets): Lightweight 1-3 lines; Standard up to 3-5 lines/2-4 bullets; Deep up to 4-6 lines/3-6 bullets. 1-2 lines per bullet. No file paths, module names, or per-file changes. Pre-emit scans: bare IDs → plain names.

**Template (Standard/Deep or any tier with 1+ call-outs):**

```text
Based on your request, here's the scope I'm proposing:
[scope claim — what will be planned, what will not; affirm-or-redirect]
**Call outs:** (omit when zero survive the keep test)
- [fork in 1-2 lines: choice + optional one-clause trade-off]
Confirm and I'll proceed to research. (Or /ce-brainstorm if bigger than you thought.)
```

Wait for confirmation before continuing to Phase 1.

**Auto-proceed (Lightweight, zero call-outs):**

```text
Planning: [1-3 line scope claim]
No open decisions — proceeding to research. Interrupt if I have the scope wrong.
```

Continue without blocking.

### Phase 1: Gather Context

#### 1.1 Local Research (Always Runs)

Prepare a planning context summary. Include origin doc summary (if exists), STRATEGY.md pieces (if exists), CONCEPTS.md terms (if exists). Use `spawn_agent` to dispatch prompts from `references/researchers.md`:

- `ce-repo-research-analyst` (technology, architecture, patterns)
- `ce-learnings-researcher`

Collect: tech stack, architectural patterns, relevant files/tests, AGENTS.md guidance, learnings from `docs/solutions/`, product strategy context from STRATEGY.md.

**Slack context** (opt-in): If tools available + user asked, dispatch `ce-slack-researcher`. If tools available only, offer. If tools unavailable + user asked, note unavailability.

#### 1.1b Detect Execution Posture Signals

Decide whether the plan should carry a lightweight execution posture signal. Look for:

- User explicitly asks for TDD, test-first, or characterization-first work
- Origin document calls for test-first or exploratory hardening of legacy code
- Local research shows target area is legacy, weakly tested, or historically fragile

When clear, carry it forward silently in relevant implementation units. Ask the user only if posture would materially change sequencing or risk and cannot be responsibly inferred.

#### 1.2 Decide on External Research

Three stages:

**Stage 1 — Explicit request takes precedence.** If user prompt or origin document asks for external input (comparison, best practices, docs, alternatives, market scan), external research is required. Only explicit opt-out overrides.

**Stage 2 — Classify intent** for Phase 1.3 routing:

- **Implementation-guidance** — approach settled; question is how to build it well
- **Landscape / option-discovery** — question is what options or prior art exist
- **Mixed** — sequential: discover options first, then narrow

**Stage 3 — Implicit signals** when no explicit request:

- Lean toward external when: high-risk topics (security, payments, privacy, migrations), <3 direct examples, adjacent-domain patterns only, unfamiliar territory, unsettled option set
- Skip when: strong local patterns, user knows intended shape, additional context adds little value
- Announce decision briefly before continuing

#### 1.3 External Research (Conditional)

If Phase 1.2 indicates external research, dispatch by intent via `spawn_agent`:

- **Implementation-guidance** — `ce-best-practices-researcher` + `ce-framework-docs-researcher` (parallel), from `references/researchers.md`. Pass frameworks/versions from Phase 1.1.
- **Landscape / option-discovery** — `ce-web-researcher` with focus hint (no codebase content). Specify discovery dimensions for code-host projects.
- **Mixed** — sequential: landscape first, then narrow.

**Tool-unavailable:** warn, proceed, carry gap to Phase 1.4.

#### 1.4 Consolidate Research

Summarize: codebase patterns, institutional learnings, Slack context (if gathered), external references (if gathered), related issues, constraints.

**Land findings in decisions, not appendix.** External research surfaces where it changes a KTD, Alternative, Risk, or scope boundary. If a finding shaped nothing, omit.

**Mark load-bearing status** — did external findings materially shape a KTD/alternative/scope/risk? Phase 5.3.2 reads this.

**Record requested-but-unavailable** as assumption or open question.

#### 1.4b Reclassify Depth When Research Reveals External Contract Surfaces

If current classification is **Lightweight** and Phase 1 research found the work touches any of these external contract surfaces, reclassify to **Standard**:

- Environment variables consumed by external systems, CI, or other repos
- Exported public APIs, CLI flags, or command-line contracts
- CI/CD configuration files
- Shared types/interfaces imported by downstream consumers
- Documentation referenced by external URLs or linked from other systems

Announce the reclassification briefly.

#### 1.5 Flow and Edge-Case Analysis (Conditional)

For **Standard** or **Deep** plans, or when user flow completeness is still unclear, use `spawn_agent` for `ce-spec-flow-analyzer` with prompting context and research findings. Use the output to identify missing edge cases, state transitions, or handoff gaps. Add only the flow details that materially improve the plan.

### Phase 2: Resolve Planning Questions

Build a planning question list from:

- Deferred questions in the origin document
- Gaps discovered in repo or external research
- Technical decisions required to produce a useful plan

For each question, decide:

- **Resolved during planning** — answerable from repo context, documentation, or user choice
- **Deferred to implementation** — answer depends on code changes, runtime behavior, or execution-time discovery

Ask the user only when the answer materially affects architecture, scope, sequencing, or risk and cannot be responsibly inferred. Present options in chat.

**Do not** run tests, build the app, or probe runtime behavior in this phase.

### Phase 3: Structure the Plan

#### 3.1 Title and File Naming

Draft title (e.g., `feat: Add auth`), determine type (`feat`/`fix`/`refactor`), build filename: `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md`. Create `docs/plans/` if needed. Derive NNN from today's files (zero-padded, 001+). Keep name 3-5 kebab-cased words.

#### 3.2 Stakeholder and Impact Awareness

For Standard/Deep plans, consider affected parties (end users, devs, ops, other teams). Note in System-Wide Impact for cross-cutting work.

#### 3.3 Break Work into Implementation Units

Focused on one concern, small file cluster, dependency-ordered, concrete. Avoid micro-steps, unrelated spans, vague units. Each unit gets stable U-ID (U1, U2…). Never renumber.

#### 3.4 High-Level Technical Design

Include when architecture, sequencing, state machines, branching, lifecycles, or comparisons benefit from visualization. Use mermaid diagrams. Skip for one-paragraph pattern applications. Diagrams are authoritative — no hedging captions.

#### 3.4b Output Structure (Optional)

For greenfield plans creating 3+ new files in a new hierarchy, include an `## Output Structure` tree. Skip for modifications or 1-2 new files. Per-unit `**Files:**` sections remain authoritative.

#### 3.5 Define Each Implementation Unit

Each unit is a level-3 heading with stable U-ID: `### U1. [Name]`. Not bulleted list or checkboxes.

**Stability rule:** U-IDs never renumbered. Reordering leaves IDs in place (U1, U3, U5). Splitting keeps original ID + next unused number. Deletion leaves a gap.

Fields per unit:

- **Goal** - what it accomplishes
- **Requirements** - which R-IDs (and A/F/AE IDs from origin)
- **Dependencies** - what must exist first (cite by U-ID)
- **Files** - repo-relative paths to create/modify/test; feature-bearing units include test file path
- **Approach** - key decisions, data flow, boundaries
- **Execution note** - optional, only for non-default posture (test-first, characterization-first)
- **Technical design** - optional pseudo-code/diagram (directional guidance only)
- **Patterns to follow** - existing conventions to mirror
- **Test scenarios** - enumerate per applicable category: happy path, edge cases (boundaries, empty, nil, concurrent), error/failure (invalid input, downstream failures, timeout, permission), integration (cross-layer, mock-insufficient). For non-behavioral units: `Test expectation: none -- [reason]`. `Covers AE<N>.` prefix when enforcing an origin Acceptance Example.
- **Verification** - outcomes, not shell commands

#### 3.6 Keep Planning/Implementation Unknowns Separate

Record important-unknowable items under deferred notes: exact names, final SQL, test-dependent runtime behavior, unnecessary refactors.

#### 3.7 Anti-Expansion

Known but tangential work (adjacent refactor, nice-to-have) routes to `### Deferred to Follow-Up Work` under Scope Boundaries, not active units. User's explicit ask overrides.

### Phase 4: Write the Plan

**NEVER CODE during this skill.** Research, decide, and write the plan — do not start implementation.

Use one planning philosophy across all depths. Change the amount of detail, not the boundary between planning and execution.

#### 4.1 Plan Depth Guidance

**Lightweight:** 2-4 units, compact, omit non-essential sections.
**Standard:** 3-6 units, full core template omitting no-value sections (incl. HTD). Include risks, deferred questions, system-wide impact when relevant.
**Deep:** 4-8 units, group into phases. Include alternatives, docs impacts, deeper risk treatment.

#### 4.1b Optional Deep Plan Extensions

Add when warranted: Alternative Approaches, Success Metrics, Dependencies, Risk Analysis, Phased Delivery, Documentation Plan, Rollout Notes, Future Considerations. Not boilerplate.

**Alternatives Considered** varies on _how_ (architecture, sequencing, boundaries). Product-shape alternatives belong in `ce-brainstorm`.

#### 4.2 Section Contract and Rendering

Compose using `references/plan-sections.md` (content) and `references/markdown-rendering.md` (markdown format). Omit include-when-material sections without content.

#### 4.3 Planning Rules

- Horizontal rules (`---`) between H2 sections for Standard/Deep plans
- Repo-relative paths only; state target repo at top if different from doc home
- No implementation code (imports, signatures, syntax)
- Pseudo-code/DSL allowed in HTD and per-unit technical design (directional guidance)
- Mermaid diagrams encouraged (ERDs, sequence, state)
- No git commands, commit messages, or test command recipes
- No micro-step expansion; don't pretend execution unknowns are settled

### Phase 5: Final Review, Write File, and Handoff

#### 5.1 Review Before Writing

Before finalizing, check:

- Plan does not invent product behavior meant for `ce-brainstorm`
- No origin document → bootstrap established enough clarity
- Every major decision grounded in origin or research
- Each unit concrete, dependency-ordered, implementation-ready
- Test-first/characterization-first signals carried forward via `Execution note`
- Feature-bearing units have test scenarios from every applicable category (happy path, edge cases, error/failure, integration) — right-sized, not padded
- Scenarios name inputs, actions, expected outcomes; blank scenarios flagged as incomplete
- `Test expectation: none` valid only for non-behavioral units
- Deferred items explicit, not hidden as fake certainty
- **HTD audit:** For each trigger (3+ components/steps/states/decisions/data-flow stages, lifecycle, mode/flag combos, DSL/API surface), verify diagram present. Missing = incomplete.
- U-IDs unique, stability rule followed, gaps preserved
- Would visual aid (dependency graph, comparison table) help?

If from a requirements doc, verify: approach matches intent, scope/success criteria preserved, blockers resolved/assumed/sent back, every origin section addressed, origin R/F/AE IDs referenced where they affect implementation, three-way scope split preserved if origin had `Outside this product's identity`.

#### 5.1.5 Brainstorm-Sourced Scoping Synthesis

Surface plan-time call-outs before Phase 5.2. Fires only when sourced from an upstream brainstorm doc (Phase 0.2 match) and not on fast paths. Skip in solo invocation.

**Read `references/synthesis-summary.md` before composing.** Internal three-bucket draft, derive call-outs, emit template.

**Summary shape:** two paragraphs — (1) brainstorm-scope restatement (1-2 sentences) and (2) plan-specific decisions (coverage, refactors, test scope). Affirmable without reading code. No touch surface enumeration.

**Template (Standard/Deep or any tier with 1+ call-outs):**

```text
The brainstorm scopes [1-2 sentence restatement].
This plan [coverage, refactors, test scope].
**Call outs:** (omit when zero)
- [fork in 1-2 lines: choice + trade-off]
Confirm and I'll write the plan.
```

**Auto-proceed (Lightweight, zero call-outs):**

```text
Planning [restatement] — [shape in one clause].
No open decisions — proceeding to plan-write.
```

**Headless mode:** Stated → Requirements. Inferred → `## Assumptions`. Out of scope → Scope Boundaries.

#### 5.2 Write Plan File

**REQUIRED: Write the plan file to disk before presenting any options.**

```text
docs/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.md
```

Sequence number NNN is derived from existing plan files in `docs/plans/`. Compose using `references/plan-sections.md` and `references/markdown-rendering.md`.

**Write tight.** One idea per sentence. A requirement/unit is intent + at most one qualifier. Defer forks to Open Questions. Resolve superseded text in place. Run named test: could the implementer find a contradiction in one pass?

Confirm: `Plan written to <absolute path>`

**CONCEPTS.md gap-fill** (only if file exists): Add domain terms with project-specific meaning. Apply silently.

#### 5.3 Confidence Check and Deepening

After writing the plan, evaluate whether it needs strengthening.

**Auto mode** (default): sub-agent findings synthesized directly. **Interactive mode** (re-deepen fast path): findings presented for user accept/reject/discuss.

##### 5.3.1 Classify Depth and Risk

Determine depth (Lightweight/Standard/Deep). Build risk profile:

- Auth/security-sensitive behavior, payments/billing, data migrations/backfills
- External APIs/third-party integrations, privacy/compliance, cross-interface parity
- Significant rollout, monitoring, or operational concerns

##### 5.3.2 Gate: Decide Whether to Deepen

- Lightweight: skip unless high-risk
- Standard: deepen when important sections look thin
- Deep/high-risk: targeted second pass often warranted
- **Thin grounding override:** If Phase 1.2 triggered external research due to <3 examples, proceed to scoring
- **Load-bearing override:** If Phase 1.4 marked external as load-bearing, proceed to scoring

If neither override applies and plan is sufficiently grounded, report "Confidence check passed" and proceed to post-generation.

##### 5.3.3–5.3.7 Deepening Execution

Read `references/deepening-workflow.md` for scoring checklists, dispatch mapping, research execution, review, and plan synthesis.

#### 5.4 Post-Generation Options

**Plan ready at `<absolute path>`. What would you like to do next?**

1. **Start `/ce-work`** — Begin implementing. Invoke `ce-work` skill with plan path now.
2. **Open in browser** — Display absolute path for local review.
3. **Done for now** — Plan saved; end turn.

**Routing must execute inline** — do not merely announce, fire the action. Free-form edits loop back to this menu. Completion requires presenting menu + executing user's selection.
