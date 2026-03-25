---
name: document-review
description: Review requirements or plan documents using parallel persona agents that surface role-specific issues. Use when a requirements document or plan document exists and the user wants to improve it.
---

# Document Review

Review requirements or plan documents through multi-persona analysis. Dispatch specialized reviewer agents in parallel, apply deterministic document-quality fixes, and classify substantive findings so the owning workflow skill or user can decide how to resolve them.

## Autopilot Utility Contract

`document-review` is a review utility, not a primary decision-maker.

- It may apply `mechanical-fix` findings automatically when the fix is deterministic and meaning-preserving.
- It may return `bounded-decision`, `must-ask`, and `note` findings.
- It must not resolve substantive product or implementation decisions on its own.
- In autopilot workflows, the owning skill (`ce:brainstorm`, `ce:plan`, `deepen-plan`, or another future decision owner) is responsible for deciding whether to auto-resolve a `bounded-decision`, escalate a `must-ask`, or leave a `note` in place.

## Phase 1: Get and Analyze Document

**If a document path is provided:** Read it, then proceed.

**If no document is specified:** Ask which document to review, or find the most recent in `docs/brainstorms/` or `docs/plans/` using a file-search/glob tool (e.g., Glob in Claude Code).

### Classify Document Type

After reading, classify the document:
- **requirements** -- from `docs/brainstorms/`, focuses on what to build and why
- **plan** -- from `docs/plans/`, focuses on how to build it with implementation details

### Select Conditional Personas

Analyze the document content to determine which conditional personas to activate. Check for these signals:

**product-lens** -- activate when the document contains:
- User-facing features, user stories, or customer-focused language
- Market claims, competitive positioning, or business justification
- Scope decisions, prioritization language, or priority tiers with feature assignments
- Requirements with user/customer/business outcome focus

**design-lens** -- activate when the document contains:
- UI/UX references, frontend components, or visual design language
- User flows, wireframes, screen/page/view mentions
- Interaction descriptions (forms, buttons, navigation, modals)
- References to responsive behavior or accessibility

**security-lens** -- activate when the document contains:
- Auth/authorization mentions, login flows, session management
- API endpoints exposed to external clients
- Data handling, PII, payments, tokens, credentials, encryption
- Third-party integrations with trust boundary implications

**scope-guardian** -- activate when the document contains:
- Multiple priority tiers (P0/P1/P2, must-have/should-have/nice-to-have)
- Large requirement count (>8 distinct requirements or implementation units)
- Stretch goals, nice-to-haves, or "future work" sections
- Scope boundary language that seems misaligned with stated goals
- Goals that don't clearly connect to requirements

## Phase 2: Announce and Dispatch Personas

### Announce the Review Team

Tell the user which personas will review and why. For conditional personas, include the justification:

```
Reviewing with:
- coherence-reviewer (always-on)
- feasibility-reviewer (always-on)
- scope-guardian-reviewer -- plan has 12 requirements across 3 priority levels
- security-lens-reviewer -- plan adds API endpoints with auth flow
```

### Build Agent List

Always include:
- `compound-engineering:document-review:coherence-reviewer`
- `compound-engineering:document-review:feasibility-reviewer`

Add activated conditional personas:
- `compound-engineering:document-review:product-lens-reviewer`
- `compound-engineering:document-review:design-lens-reviewer`
- `compound-engineering:document-review:security-lens-reviewer`
- `compound-engineering:document-review:scope-guardian-reviewer`

### Dispatch

Dispatch all agents in **parallel** using the platform's task/agent tool (e.g., Agent tool in Claude Code, spawn in Codex). Each agent receives the prompt built from the [subagent template](./references/subagent-template.md) with these variables filled:

| Variable | Value |
|----------|-------|
| `{persona_file}` | Full content of the agent's markdown file |
| `{schema}` | Content of [findings-schema.json](./references/findings-schema.json) |
| `{document_type}` | "requirements" or "plan" from Phase 1 classification |
| `{document_path}` | Path to the document |
| `{document_content}` | Full text of the document |

Pass each agent the **full document** -- do not split into sections.

**Error handling:** If an agent fails or times out, proceed with findings from agents that completed. Note the failed agent in the Coverage section. Do not block the entire review on a single agent failure.

**Dispatch limit:** Even at maximum (6 agents), use parallel dispatch. These are document reviewers with bounded scope reading a single document -- parallel is safe and fast.

## Phase 3: Synthesize Findings

Process findings from all agents through this pipeline. **Order matters** -- each step depends on the previous.

### 3.1 Validate

Check each agent's returned JSON against [findings-schema.json](./references/findings-schema.json):
- Drop findings missing any required field defined in the schema
- Drop findings with invalid enum values
- Note the agent name for any malformed output in the Coverage section

### 3.2 Confidence Gate

Suppress findings below 0.50 confidence. Store them as residual concerns for potential promotion in step 3.4.

### 3.3 Deduplicate

Fingerprint each finding using `normalize(section) + normalize(title)`. Normalization: lowercase, strip punctuation, collapse whitespace.

When fingerprints match across personas:
- If the findings recommend **opposing actions** (e.g., one says cut, the other says keep), do not merge -- preserve both for contradiction resolution in 3.5
- Otherwise merge: keep the highest severity, keep the highest confidence, union all evidence arrays, note all agreeing reviewers (e.g., "coherence, feasibility")

### 3.4 Promote Residual Concerns

Scan the residual concerns (findings suppressed in 3.2) for:
- **Cross-persona corroboration**: A residual concern from Persona A overlaps with an above-threshold finding from Persona B. Promote at P2 with confidence 0.55-0.65.
- **Concrete blocking risks**: A residual concern describes a specific, concrete risk that would block implementation. Promote at P2 with confidence 0.55.

### 3.5 Resolve Contradictions

When personas disagree on the same section:
- Create a **combined finding** presenting both perspectives
- Set `finding_class: must-ask`
- Frame as a tradeoff, not a verdict

Specific conflict patterns:
- Coherence says "keep for consistency" + scope-guardian says "cut for simplicity" -> combined finding, let user decide
- Feasibility says "this is impossible" + product-lens says "this is essential" -> P1 finding framed as a tradeoff
- Multiple personas flag the same issue -> merge into single finding, note consensus, increase confidence

### 3.6 Route by Finding Class

| Finding Class | Route |
|---------------|-------|
| `mechanical-fix` | Apply automatically -- local deterministic fix (terminology, formatting, cross-references) |
| `bounded-decision` | Present to the owning workflow skill or user for judgment |
| `must-ask` | Present as requiring user judgment |
| `note` | Present as non-blocking context |

Demote any `mechanical-fix` finding that lacks a `suggested_fix` to `note` -- the orchestrator cannot apply a fix without concrete replacement text.

### 3.7 Sort

Sort findings for presentation: P0 -> P1 -> P2 -> P3, then by confidence (descending), then by document order (section position).

## Phase 4: Apply and Present

### Apply Auto-fixes

Apply all `mechanical-fix` findings to the document in a **single pass**:
- Edit the document inline using the platform's edit tool
- Track what was changed for the "Auto-fixes Applied" section
- Do not ask for approval -- these are unambiguously correct (terminology fixes, formatting, cross-references)

### Present Remaining Findings

Present all other findings to the user using the format from [review-output-template.md](./references/review-output-template.md):
- Group by severity (P0 -> P3)
- Include the Coverage table showing which personas ran
- Show mechanical fixes that were applied
- Include residual concerns and deferred questions if any

Brief summary at the top: "Applied N mechanical fixes. M findings to consider (X at P0/P1)."

### Protected Artifacts

During synthesis, discard any finding that recommends deleting or removing files in:
- `docs/brainstorms/`
- `docs/plans/`
- `docs/solutions/`

These are pipeline artifacts and must not be flagged for removal.

## Phase 5: Next Action

Use the platform's blocking question tool when available (AskUserQuestion in Claude Code, request_user_input in Codex, ask_user in Gemini). Otherwise present numbered options and wait for the user's reply.

Offer:

1. **Refine again** -- another review pass
2. **Review complete** -- document is ready

After 2 refinement passes, recommend completion -- diminishing returns are likely. But if the user wants to continue, allow it.

Return "Review complete" as the terminal signal for callers.

## What NOT to Do

- Do not rewrite the entire document
- Do not add new sections or requirements the user didn't discuss
- Do not over-engineer or add complexity
- Do not create separate review files or add metadata sections
- Do not modify any of the caller skills (ce-brainstorm, ce-plan, deepen-plan)
 - Do not resolve substantive product or implementation questions on behalf of an autopilot caller

## Iteration Guidance

On subsequent passes, re-dispatch personas and re-synthesize. The mechanical-fix mechanism and confidence gating prevent the same findings from recurring once fixed. If findings are repetitive across passes, recommend completion.
