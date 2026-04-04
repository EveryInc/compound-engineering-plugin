---
name: ce:prototype
description: "Build a throwaway prototype to validate assumptions before committing to an implementation plan. Use when the user says 'prototype this', 'let me test this idea first', 'spike on this', 'validate this before planning', 'build a quick prototype', 'I want to test if this works', 'try this out before we plan', 'proof of concept', 'quick test', 'throwaway prototype', or 'validate assumptions'. Also use when a brainstorm or requirements document contains untested assumptions about APIs, data sources, UX patterns, or integrations, or when the user wants to de-risk before planning."
argument-hint: "[optional: feature description, requirements doc path, or specific assumptions to validate]"
---

# Prototype: Validate Before You Plan

**Note: The current year is 2026.** Use this when dating validation reports.

`ce:brainstorm` defines **WHAT** to build. `ce:prototype` proves **WHETHER** key assumptions hold. `ce:plan` defines **HOW** to build it.

Prototyping sits between brainstorm and planning because planning without validation is guesswork — a plan might commit to an API that returns unusable data, a UX pattern that feels wrong, or a data source that is unreliable. Discovering this after planning wastes the plan. Discovering it during a quick prototype turns uncertainty into constraints that make the plan stronger.

**This skill does not produce production code.** It produces a throwaway prototype and a durable validation report. The prototype gets deleted. The report feeds into `/ce:plan`.

**IMPORTANT: All file references in generated documents must use repo-relative paths (e.g., `.context/compound-engineering/prototypes/stripe-refund-webhooks/`), never absolute paths.**

## Core Principles

1. **Speed over quality** — Use whatever technology is fastest: static HTML, a script, a no-code tool, raw API calls. No linting, no tests, no architecture. The only code standard is "does it answer the validation question?"
2. **Never fake what you are testing** — If a validation goal is "test image quality from API X," do not mock API X. If unsure whether a shortcut compromises a validation goal, ask the user before proceeding.
3. **Throwaway by default** — The prototype is scaffolded in an isolated directory and deleted after the validation report is written. If something looks worth keeping, flag it — but reuse is the exception, not the goal.
4. **Effort-aligned** — Align effort expectations with the user before building. A prototype taking more than one day is likely not a prototype — it is an MVP. Recommend `/ce:plan` instead.
5. **Goal-driven** — Every prototype has explicit validation goals defined upfront. Building without goals is exploration, not prototyping.

## Interaction Method

Use the platform's blocking question tool when available (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present numbered options in chat and wait for the user's reply before proceeding.

Ask one question at a time. Prefer single-select when natural options exist.

## Feature Description

<feature_description> #$ARGUMENTS </feature_description>

**If the feature description above is empty, ask the user:** "What would you like to prototype? Describe the idea, assumption, or risk you want to validate."

Do not proceed until there is a clear prototyping target.

## Execution Flow

### Phase 0: Source and Context

#### 0.1 Find Upstream Requirements

Search `docs/brainstorms/` for files matching `*-requirements.md`. Apply the same relevance criteria as `ce:plan`: topic match, recency, same problem scope.

If a relevant requirements document exists:
1. Read it thoroughly
2. Announce it as the source document for prototyping
3. Extract testable assumptions — claims about external APIs, data quality, UX patterns, integration behavior, performance characteristics, or user experience that the requirements take for granted but have not been verified

If no requirements document exists, proceed from the user's description directly.

#### 0.2 Check for Existing Prototypes

Search for existing prototype work (`.context/compound-engineering/prototypes/`, `docs/prototypes/`, or similar patterns in the repo). If a previous prototype or validation report for the same topic exists, ask the user whether to build on it or start fresh.

### Phase 1: Define Validation Goals

This is the most important phase. A prototype without clear goals is aimless.

#### 1.1 Suggest Validation Goals

Based on the requirements document (or user description), propose 3-5 candidate validation goals. Each goal must be:

- **Specific**: "Test whether the Stripe webhook payload includes refund metadata" not "Test the API"
- **Binary**: Can be answered proved/disproved/inconclusive
- **Independent**: Each goal can be tested without depending on others

Organize suggestions by category when useful:
- **Technical feasibility** — Can this API/service/tool do what we need?
- **Data quality** — Is the data source good enough?
- **UX viability** — Does the core interaction feel right?
- **Integration** — Does this third-party service work as expected?
- **Performance** — Is it fast enough for the intended use?

Present the suggestions and let the user pick, modify, add, or remove goals. Use multi-select — all selected goals can coexist.

#### 1.2 Classify Scope and Align Effort

Classify the prototype scope based on the selected validation goals:

- **Lightweight** — Single validation goal, simple test (one API call, one static page). Typical effort: 15-30 minutes.
- **Standard** — 2-3 validation goals, moderate integration work (connect to a real service, build a minimal interactive page). Typical effort: 1-2 hours.
- **Deep** — 4+ validation goals or multi-service orchestration (end-to-end flow, multiple data sources, complex UX interaction). Typical effort: half day to one day.

After classifying, align effort expectations with the user:

- State the scope classification and expected effort range
- Ask the user if that matches their expectation
- If the estimate exceeds half a day, flag it: "This feels larger than a prototype — consider whether `/ce:plan` with a phased approach would serve better"
- Hard ceiling: if the prototype would take more than one day, recommend splitting into smaller validation rounds or moving to planning

Do not proceed until effort is aligned.

### Phase 2: Scaffold and Build

#### 2.1 Create Isolated Prototype Directory

Scaffold the prototype under the compound-engineering scratch space:

```
.context/compound-engineering/prototypes/
  <topic-slug>/
    ... prototype files ...
```

No project standards apply. No linting, no tests, no architecture. The directory structure should be whatever is fastest for the validation goals.

#### 2.2 Build the Fastest Path

For each validation goal, build the minimum artifact that answers the question:

- **API feasibility** — Raw API calls, dump responses, inspect data
- **UX viability** — Static HTML page, minimal interactivity, just enough to feel the interaction
- **Data quality** — Fetch real samples, display or analyze them
- **Integration** — Connect to the real service, verify behavior
- **Performance** — Time real operations, measure what matters

**Critical rule:** Before taking a shortcut on any step, evaluate whether it compromises a validation goal. If there is any doubt, ask the user. For example:
- Hardcoding sample data is fine if the goal is testing UX layout
- Hardcoding sample data is NOT fine if the goal is testing data source quality
- Using a placeholder image is fine if testing game mechanics
- Using a placeholder image is NOT fine if testing image recognition quality

#### 2.3 Validate Each Goal

After building, test each validation goal explicitly. Many goals — especially UX viability, data quality perception, and "does this feel right?" questions — **require the user to interact with the prototype and provide feedback**. Automated checks alone cannot answer whether an image source looks good enough or whether a game mechanic feels fun.

**Classify each goal by validation method:**

- **Automated** — Can be verified programmatically (API response codes, load times, data format checks). Run these directly and record results.
- **User-tested** — Requires human judgment (visual quality, UX feel, interaction flow, content suitability). For these:
  1. Present the prototype to the user with clear instructions on what to test
  2. Ask the user to interact with it (open the HTML file, try the flow, look at the images)
  3. Wait for the user's feedback before recording a result — do not assume or guess their reaction
  4. Ask targeted follow-up questions if the feedback is ambiguous (e.g., "You said the images are 'okay' — is that good enough for the MVP, or would you need better quality?")

When in doubt about whether a goal needs user testing, default to asking. Most prototypes exist precisely because there is a subjective judgment call that only a human can make.

For each goal, record:
- **Status**: Proved / Disproved / Inconclusive
- **Evidence**: What was observed (screenshots, API responses, measurements, **user feedback quotes**)
- **Surprises**: Anything unexpected that affects the plan
- **Constraints discovered**: Rate limits, quality issues, missing features, etc.

### Phase 3: Write Validation Report

Read `assets/validation-report-template.md` for the report structure.

Write the report to `docs/prototypes/<topic-slug>-validation-<date>.md`.

Create `docs/prototypes/` if it does not exist.

The validation report is the durable output — it survives after the prototype code is deleted. It must contain enough detail that `/ce:plan` (or a future reader) can understand what was tested and what was learned without access to the prototype code.

For detailed field descriptions and frontmatter schema, see `references/validation-report-schema.md`.

### Phase 4: Clean Up and Recommend

#### 4.1 Flag Reusable Artifacts

Before cleaning up, scan the prototype for anything worth keeping:
- Useful API wrapper code
- Configuration or credentials setup that took effort
- Static assets (images, sample data) that the MVP will need

If anything is found, flag it to the user with a brief explanation. Let them decide whether to preserve it (by moving it elsewhere) before cleanup.

#### 4.2 Clean Up

Delete the prototype directory under `.context/compound-engineering/prototypes/`. The validation report in `docs/prototypes/` persists.

If the user explicitly asks to keep the prototype, respect that — but note in the validation report that the prototype code still exists and where.

#### 4.3 Recommend Next Step

Based on the validation results, recommend the appropriate next step:

| Result | Recommendation |
|--------|---------------|
| All goals proved | Proceed to `/ce:plan` — validated constraints feed directly into planning |
| Some goals disproved | Revisit requirements with `/ce:brainstorm` — scope or approach may need to change |
| Inconclusive goals | Run a focused second prototype round on the inconclusive goals |
| Major surprise discovered | Discuss implications before proceeding — the discovery may reshape the entire approach |

Present as a question using the platform's blocking question tool.

### Phase 5 (Optional): Brainstorm Integration Suggestion

If this prototype was triggered manually (not from a brainstorm recommendation):
- Check whether a requirements document exists for this topic
- If it does, suggest updating it with the validated/disproved assumptions
- If it does not, note that the validation report is self-contained and planning can reference it directly

## Preconditions

<preconditions enforcement="advisory">
  <check condition="has_assumptions">
    There are untested assumptions worth validating (APIs, data sources, UX patterns, integrations)
  </check>
  <check condition="not_trivial">
    The assumptions are non-trivial enough that a prototype adds value over just reading docs
  </check>
  <check condition="scope_bounded">
    The prototype can be completed in under one day
  </check>
</preconditions>

## What It Creates

**Durable output:**
- `docs/prototypes/<topic-slug>-validation-<date>.md` — Validation report

**Temporary output (deleted after report):**
- `.context/compound-engineering/prototypes/<topic-slug>/` — Throwaway prototype code

## Success Output

```
Prototype complete

Validation Goals:
  [proved]       Stripe webhook payload includes refund metadata fields
  [proved]       Webhook delivery latency is under 2s for test events
  [disproved]    Free tier webhook rate limit is sufficient for peak traffic
  [inconclusive] Retry logic handles partial failures gracefully

Surprises:
  - Webhook signature verification requires raw body access — framework middleware may parse it first

Constraints Discovered:
  - Free tier: 500 webhooks/hour (need queuing strategy or paid tier for peak)
  - Refund metadata format changed in Stripe API v2024-12 — must pin version

Report written:
  docs/prototypes/stripe-refund-webhooks-validation-2026-04-04.md

Prototype cleaned up:
  .context/compound-engineering/prototypes/stripe-refund-webhooks/ [deleted]

What's next?
1. Proceed to /ce:plan with validated constraints
2. Run another prototype round (for inconclusive goals)
3. Revisit requirements with /ce:brainstorm (for disproved goals)
4. Update existing requirements document with findings
5. Other
```

Present the "What's next?" options using the platform's blocking question tool.

## Common Mistakes to Avoid

| Wrong | Correct |
|-------|---------|
| Mocking or stubbing the external system being validated | Connect to the real service — the prototype exists to test it |
| Building for a full day with no clear validation goals | Define goals first; if scope exceeds one day, move to `/ce:plan` |
| Applying project code standards (linting, tests, architecture) | Speed is the only standard — throwaway code has no quality bar |
| Recording a validation result without user feedback on subjective goals | Present the prototype and wait for the user to test it before marking proved/disproved |
| Keeping the prototype directory after the report is written | Delete the prototype; the validation report is the durable artifact |
| Skipping the effort alignment conversation | Classify scope (Lightweight/Standard/Deep) and confirm with the user before building |

## Related Commands

- `/ce:brainstorm` — Defines WHAT to build (upstream)
- `/ce:plan` — Defines HOW to build it (downstream, consumes validation report)
- `/ce:work` — Executes the plan
- `/ce:compound` — Documents solved problems (different lifecycle)
