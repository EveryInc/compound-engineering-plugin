---
title: "feat: Replace document-review with persona-based review pipeline"
type: feat
status: completed
date: 2026-03-23
deepened: 2026-03-23
origin: docs/brainstorms/2026-03-23-plan-review-personas-requirements.md
---

# Replace document-review with Persona-Based Review Pipeline

## Overview

Replace the single-voice `document-review` skill with a multi-persona review pipeline that dispatches specialized reviewer agents in parallel. Two always-on personas (coherence, feasibility) run on every review. Four conditional personas (product-lens, design-lens, security-lens, scope-guardian) activate based on document content analysis. Quality issues are auto-fixed; strategic questions are presented to the user.

## Problem Frame

The current `document-review` applies five generic criteria (Clarity, Completeness, Specificity, Appropriate Level, YAGNI) through a single evaluator voice. This misses role-specific concerns: a security engineer, product leader, and design reviewer each see different problems in the same plan. The `ce:review` skill already demonstrates that multi-persona review produces richer, more actionable feedback for code. The same architecture applies to plan/requirements review. (see origin: docs/brainstorms/2026-03-23-plan-review-personas-requirements.md)

## Requirements Trace

- R1. Replace document-review with persona pipeline dispatching specialized agents in parallel
- R2. 2 always-on personas: coherence, feasibility
- R3. 4 conditional personas: product-lens, design-lens, security-lens, scope-guardian
- R4. Auto-detect conditional persona relevance from document content
- R5. Hybrid action model: auto-fix quality issues, present strategic questions
- R6. Structured findings with confidence, dedup, synthesized report
- R7. Backward compatibility with all 4 callers (brainstorm, plan, plan-beta, deepen-plan-beta)
- R8. Pipeline-compatible for future automated workflows

## Scope Boundaries

- Not adding new callers or pipeline integrations
- Not changing deepen-plan-beta behavior
- Not adding user configuration for persona selection
- Not inventing new review frameworks -- incorporating established review patterns into respective personas
- Not modifying any of the 4 existing caller skills

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-review/SKILL.md` -- Multi-agent orchestration reference: parallel dispatch via Task tool, always-on + conditional agents, P1/P2/P3 severity, finding synthesis with dedup
- `plugins/compound-engineering/skills/document-review/SKILL.md` -- Current single-voice skill to replace. Key contract: "Review complete" terminal signal
- `plugins/compound-engineering/agents/review/ce-*.agent.md` -- 15 existing review agents. Frontmatter schema: `name`, `description`, `model: inherit`. Body: examples block, role definition, analysis protocol, output format
- `plugins/compound-engineering/AGENTS.md` -- Agent naming: fully-qualified `compound-engineering:<category>:<agent-name>`. Agent placement: `agents/<category>/<name>.md`

### Caller Integration Points

All 4 callers use the same contract:
- `ce-brainstorm/SKILL.md` line 301: "Load the `document-review` skill and apply it to the requirements document"
- `ce-plan/SKILL.md` line 592: "Load `document-review` skill"
- `ce-plan-beta/SKILL.md` line 611: "Load the `document-review` skill with the plan path"
- `deepen-plan-beta/SKILL.md` line 402: "Load the `document-review` skill with the plan path"

All expect "Review complete" as the terminal signal. No callers check for specific output format. No caller changes needed.

### Institutional Learnings

- **Subagent design** (docs/solutions/skill-design/compound-refresh-skill-improvements.md): Each persona agent needs explicit context (file path, scope, output format) -- don't rely on inherited context. Use native file tools, not shell commands. Avoid hardcoded tool names; use capability-first language with platform examples.
- **Parallel dispatch safety**: Persona reviewers are read-only (analyze the document, don't modify it). Parallel dispatch is safe. This differs from compound-refresh which used sequential subagents because they modified files.
- **Contradictory findings**: With 6 independent reviewers, findings will conflict (scope-guardian wants to cut; coherence wants to keep for narrative flow). Synthesis needs conflict-resolution rules, not just dedup.
- **Classification pipeline ordering**: Pipeline ordering matters: filter -> normalize -> group -> threshold -> re-classify -> output. Post-grouping safety checks catch misclassified findings. Single source of truth for classification logic.
- **Beta skills framework** (docs/solutions/skill-design/beta-skills-framework.md): Since we're replacing document-review entirely (not running side-by-side), the beta framework doesn't apply here.

### Research Insights: iterative-engineering plan-review

The iterative-engineering plugin (v1.16.1) implements a mature plan-review skill with persona agents. Key architectural patterns to adopt:

**Structured output contract**: All personas return findings in a consistent JSON-like structure with: title (<=10 words), priority (HIGH/MEDIUM/LOW), section, line, why_it_matters (impact not symptom), confidence (0.0-1.0), evidence (quoted text, minimum 1), and optional suggestion. This consistency enables reliable synthesis.

**Fingerprint-based dedup**: `normalize(section) + line_bucket(line, +/-5) + normalize(title)`. When fingerprints match: keep highest priority, highest confidence, union evidence, note all reviewers. This is more precise than judgment-based dedup.

**Residual concerns**: Findings below the confidence threshold (0.50) are stored separately as residual concerns. During synthesis, residual concerns are promoted to findings if they overlap with findings from other reviewers or describe concrete blocking risks. This catches issues that one persona sees dimly but another confirms.

**Per-persona confidence calibration**: Each persona defines its own confidence bands -- what HIGH (0.80+), MODERATE (0.60-0.79), and LOW mean for that persona's domain. This prevents apples-to-oranges confidence comparisons.

**Explicit suppress conditions**: Each persona lists what it should NOT flag (e.g., coherence suppresses style preferences and missing content; feasibility suppresses implementation style choices). This prevents noise and keeps personas focused.

**Subagent prompt template**: A shared template wraps each persona's identity + output schema + review context. This ensures consistent behavior across all personas without repeating boilerplate in each agent file.

### Established Review Patterns

Three proven review approaches provide the behavioral foundation for specific personas:

**Premise challenge pattern (-> product-lens persona):**
- Nuclear scope challenge with 3 questions: (1) Is this the right problem? Could a different framing yield a simpler/more impactful solution? (2) What is the actual user/business outcome? Is the plan the most direct path? (3) What happens if we do nothing? Real pain or hypothetical?
- Implementation alternatives: Produce 2-3 approaches with effort (S/M/L/XL), risk (Low/Med/High), pros/cons
- Search-before-building: Layer 1 (conventional), Layer 2 (search results), Layer 3 (first principles)

**Dimensional rating pattern (-> design-lens persona):**
- 0-10 rating loop: Rate dimension -> explain gap ("4 because X; 10 would have Y") -> suggest fix -> re-rate -> repeat
- 7 evaluation passes: Information architecture, interaction state coverage, user journey/emotional arc, AI slop risk, design system alignment, responsive/a11y, unresolved design decisions
- AI slop blacklist: 10 recognizable AI-generated patterns to avoid (3-column feature grids, purple gradients, icons in colored circles, uniform border-radius, etc.)

**Existing-code audit pattern (-> scope-guardian + feasibility personas):**
- "What already exists?" check: (1) What existing code partially/fully solves each sub-problem? (2) What is minimum set of changes for stated goal? (3) Complexity check (>8 files or >2 new classes = smell). (4) Search check per architectural pattern. (5) TODOS cross-reference
- Completeness principle: With AI, completeness cost is 10-100x cheaper. If shortcut saves human hours but only minutes with AI, recommend complete version
- Error & rescue map: For every method/codepath that can fail, name the exception class, trigger, handler, and user-visible outcome

## Key Technical Decisions

- **Agents, not inline prompts**: Persona reviewers are implemented as agent files under `agents/review/`. This enables parallel dispatch via Task tool, follows established patterns, and keeps the SKILL.md focused on orchestration. (Resolves deferred question from origin)

- **Structured output contract aligned with ce:review-beta (PR #348)**: Same normalization mechanism -- findings-schema.json, subagent-template.md, review-output-template.md as reference files. Same field names and enums where applicable (severity P0-P3, autofix_class, owner, confidence, evidence). Document-specific adaptations: `section` replaces `file`+`line`, `deferred_questions` replaces `testing_gaps`, drop `pre_existing`. Each persona defines its own confidence calibration and suppress conditions. (Resolves deferred question from origin -- output format)

- **Content-based activation heuristics**: The orchestrator skill checks the document for keyword and structural patterns to select conditional personas. Heuristics are defined in the skill, not in the agents -- this keeps selection logic centralized and agents focused on review. (Resolves deferred question from origin)

- **Separate auto-fix pass after synthesis**: Personas are read-only (produce findings only). After dedup and synthesis, the orchestrator applies auto-fixes for quality issues in a single pass, then presents strategic questions. This prevents conflicting edits from multiple agents. (Resolves deferred question from origin)

- **No caller modifications needed**: The "Review complete" contract is sufficient. All 4 callers reference document-review by skill name and check for the terminal signal. (Resolves deferred question from origin)

- **Fingerprint-based dedup over judgment-based**: Use `normalize(section) + normalize(title)` fingerprinting for deterministic dedup. More reliable than asking the model to "remove duplicates" at synthesis time. When fingerprints match: keep highest priority, highest confidence, union evidence, note all agreeing reviewers.

- **Residual concerns with cross-persona promotion**: Findings below 0.50 confidence are stored as residual concerns. During synthesis, promote to findings if corroborated by another persona or if they describe concrete blocking risks. This catches issues one persona sees dimly but another confirms.

## Open Questions

### Resolved During Planning

- **Agent category**: Place under `agents/review/` alongside existing code review agents. Names are distinct (coherence-reviewer, feasibility-reviewer, etc.) and don't conflict with existing agents. Fully-qualified: `compound-engineering:review:<name>`.
- **Parallel vs serial dispatch**: Always parallel. We have 2-6 agents per run (under the auto-serial threshold of 5 from ce:review's pattern). Even at max (6), these are document reviewers with bounded scope.
- **Review pattern integration**: Premise challenge -> product-lens opener. Dimensional rating -> design-lens evaluation method. Existing-code audit -> scope-guardian opener. These are incorporated as agent behavior, not separate orchestration mechanisms.
- **Output format**: Align with ce:review-beta (PR #348) normalization pattern. Same mechanism: JSON schema reference file, shared subagent template, output template. Same enums (P0-P3 severity, autofix_class, owner). Document-specific field swaps: `section` replaces `file`+`line`, `deferred_questions` replaces `testing_gaps`, drop `pre_existing`.

### Deferred to Implementation

- Exact keyword lists for conditional persona activation -- start with the obvious signals, refine based on real usage
- Whether the auto-fix pass should re-read the document after applying changes to verify consistency, or trust a single pass

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Document Review Pipeline Flow:

1. READ document
2. CLASSIFY document type (requirements doc vs plan)
3. ANALYZE content for conditional persona signals
   - product signals? -> activate product-lens
   - design/UI signals? -> activate design-lens
   - security/auth signals? -> activate security-lens
   - scope/priority signals? -> activate scope-guardian
4. ANNOUNCE review team with per-conditional justifications
5. DISPATCH agents in parallel via Task tool
   - Always: coherence-reviewer, feasibility-reviewer
   - Conditional: activated personas from step 3
   - Each receives: subagent-template.md populated with persona + schema + doc content
6. COLLECT findings from all agents (validate against findings-schema.json)
7. SYNTHESIZE
   a. Validate: check structure compliance against schema, drop malformed
   b. Confidence gate: suppress findings below 0.50
   c. Deduplicate: fingerprint matching, keep highest severity/confidence
   d. Promote residual concerns: corroborated or blocking -> promote to finding
   e. Resolve contradictions: conflicting personas -> combined finding, manual + human
   f. Route: safe_auto -> apply, everything else -> present
8. APPLY safe_auto fixes (edit document inline, single pass)
9. PRESENT remaining findings to user, grouped by severity
10. FORMAT output using review-output-template.md
11. OFFER next action: "Refine again" or "Review complete"
```

**Finding structure (aligned with ce:review-beta PR #348):**

```
Envelope (per persona):
  reviewer:            Persona name (e.g., "coherence", "product-lens")
  findings:            Array of finding objects
  residual_risks:      Risks noticed but not confirmed as findings
  deferred_questions:  Questions that should be resolved in a later workflow stage

Finding object:
  title:               Short issue title (<=10 words)
  severity:            P0 / P1 / P2 / P3  (same scale as ce:review-beta)
  section:             Document section where issue appears (replaces file+line)
  why_it_matters:      Impact statement (what goes wrong if not addressed)
  autofix_class:       safe_auto / gated_auto / manual / advisory
  owner:               review-fixer / downstream-resolver / human / release
  requires_verification: Whether fix needs re-review
  suggested_fix:       Optional concrete fix (null if not obvious)
  confidence:          0.0-1.0 (calibrated per persona)
  evidence:            Quoted text from document (minimum 1)

Severity definitions (same as ce:review-beta):
  P0: Contradictions or gaps that would cause building the wrong thing. Must fix.
  P1: Significant gap likely hit during planning/implementation. Should fix.
  P2: Moderate issue with meaningful downside. Fix if straightforward.
  P3: Minor improvement. User's discretion.

Autofix classes (same enum as ce:review-beta for schema compatibility):
  safe_auto:  Terminology fix, formatting, cross-reference -- local and deterministic
  gated_auto: Restructure or edit that changes document meaning -- needs approval
  manual:     Strategic question requiring user judgment -- becomes residual work
  advisory:   Informational finding -- surface in report only

Orchestrator routing (document review simplification):
  The 4-class enum is preserved for schema compatibility with ce:review-beta,
  but the orchestrator routes as 2 buckets:
    safe_auto           -> apply automatically
    gated_auto + manual + advisory -> present to user
  The gated/manual/advisory distinction is blurry for documents (all need user
  judgment). Personas still classify precisely; the orchestrator collapses.
```

## Implementation Units

- [x] **Unit 1: Create always-on persona agents**

**Goal:** Create the coherence and feasibility reviewer agents that run on every document review.

**Requirements:** R2

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/agents/document-review/ce-coherence-reviewer.agent.md`
- Create: `plugins/compound-engineering/agents/document-review/ce-feasibility-reviewer.agent.md`

**Approach:**
- Follow existing agent structure: frontmatter (name, description, model: inherit), examples block, role definition, analysis protocol
- Each agent defines: role identity, analysis protocol, confidence calibration, and suppress conditions
- Agents do NOT define their own output format -- the shared `references/findings-schema.json` and `references/subagent-template.md` handle output normalization (same pattern as ce:review-beta PR #348)

**coherence-reviewer:**
- Role: Technical editor who reads for internal consistency
- Hunts: contradictions between sections, terminology drift (same concept called different names), structural issues (sections that don't flow logically), ambiguity where readers would diverge on interpretation
- Confidence calibration: HIGH (0.80+) = provable contradictions from text. MODERATE (0.60-0.79) = likely but could be reconciled charitably. Suppress below 0.50.
- Suppress: style preferences, missing content (other personas handle that), imprecision that isn't actually ambiguity, formatting opinions

**feasibility-reviewer:**
- Role: Systems architect evaluating whether proposed approaches survive contact with reality
- Hunts: architecture decisions that conflict with existing patterns, external dependencies without fallback plans, performance requirements without measurement plans, migration strategies with gaps, approaches that won't work with known constraints
- Absorbs tech-plan implementability: can an implementer read this and start coding? Are file paths, interfaces, and dependencies specific enough?
- Opens with "what already exists?" check: does the plan acknowledge existing code before proposing new abstractions?
- Confidence calibration: HIGH (0.80+) = specific technical constraint that blocks approach. MODERATE (0.60-0.79) = constraint likely but depends on specifics not in document.
- Suppress: implementation style choices, testing strategy details, code organization preferences, theoretical scalability concerns

**Patterns to follow:**
- `plugins/compound-engineering/agents/review/ce-code-simplicity-reviewer.agent.md` for agent structure and output format conventions
- `plugins/compound-engineering/agents/review/ce-architecture-strategist.agent.md` for systematic analysis protocol style
- iterative-engineering agents for confidence calibration and suppress conditions pattern

**Test scenarios:**
- coherence-reviewer identifies a plan where Section 3 claims "no external dependencies" but Section 5 proposes calling an external API
- coherence-reviewer flags a document using "pipeline" and "workflow" interchangeably for the same concept
- coherence-reviewer does NOT flag a minor formatting inconsistency (suppress condition working)
- feasibility-reviewer identifies a requirement for "sub-millisecond response time" without a measurement or caching strategy
- feasibility-reviewer identifies that a plan proposes building a custom auth system when the codebase already has one
- feasibility-reviewer surfaces "what already exists?" when plan doesn't acknowledge existing patterns
- Both agents produce findings with all required fields (title, priority, section, confidence, evidence, action)

**Verification:**
- Both agents have valid frontmatter (name, description, model: inherit)
- Both agents include examples, role definition, analysis protocol, confidence calibration, and suppress conditions
- Agents rely on shared findings-schema.json for output normalization (no per-agent output format)
- Suppress conditions are explicit and sensible for each persona's domain

---

- [x] **Unit 2: Create conditional persona agents**

**Goal:** Create the four conditional persona agents that activate based on document content.

**Requirements:** R3

**Dependencies:** Unit 1 (for consistent agent structure)

**Files:**
- Create: `plugins/compound-engineering/agents/document-review/ce-product-lens-reviewer.agent.md`
- Create: `plugins/compound-engineering/agents/document-review/ce-design-lens-reviewer.agent.md`
- Create: `plugins/compound-engineering/agents/document-review/ce-security-lens-reviewer.agent.md`
- Create: `plugins/compound-engineering/agents/document-review/ce-scope-guardian-reviewer.agent.md`

**Approach:**
All four use the same structure established in Unit 1 (frontmatter, examples, role, protocol, confidence calibration, suppress conditions). Output normalization handled by shared reference files.

**product-lens-reviewer:**
- Role: Senior product leader evaluating whether the plan solves the right problem
- Opens with premise challenge: 3 diagnostic questions:
  1. Is this the right problem to solve? Could a different framing yield a simpler or more impactful solution?
  2. What is the actual user/business outcome? Is the plan the most direct path, or is it solving a proxy problem?
  3. What would happen if we did nothing? Real pain point or hypothetical?
- Evaluates: scope decisions and prioritization rationale, implementation alternatives (are there simpler paths?), whether goals connect to requirements
- Confidence calibration: HIGH (0.80+) = specific text demonstrating misalignment between stated goal and proposed work. MODERATE (0.60-0.79) = likely but depends on business context.
- Suppress: implementation details, technical specifics, measurement methodology, style

**design-lens-reviewer:**
- Role: Senior product designer reviewing plans for missing design decisions
- Uses "rate 0-10 and describe what 10 looks like" dimensional rating method
- Evaluates design dimensions: information architecture (what does user see first/second/third?), interaction state coverage (loading, empty, error, success, partial), user flow completeness, responsive/accessibility considerations
- Produces rated findings: "Information architecture: 4/10 -- it's a 4 because [gap]. A 10 would have [what's needed]."
- AI slop check: flags plans that would produce generic AI-looking interfaces (3-column feature grids, purple gradients, icons in colored circles, uniform border-radius)
- Confidence calibration: HIGH (0.80+) = missing states or flows that will clearly cause UX problems. MODERATE (0.60-0.79) = design gap exists but skilled designer could resolve from context.
- Suppress: backend implementation details, performance concerns, security (other persona handles), business strategy

**security-lens-reviewer:**
- Role: Security architect evaluating threat model at the plan level
- Evaluates: auth/authz gaps, data exposure risks, API surface vulnerabilities, input validation assumptions, secrets management, third-party trust boundaries, plan-level threat model completeness
- Distinct from the code-level `security-sentinel` agent -- this reviews whether the PLAN accounts for security, not whether the CODE is secure
- Confidence calibration: HIGH (0.80+) = plan explicitly introduces attack surface without mentioning mitigation. MODERATE (0.60-0.79) = security concern likely but plan may address it implicitly.
- Suppress: code quality issues, performance, non-security architecture, business logic

**scope-guardian-reviewer:**
- Role: Product manager reviewing scope decisions for alignment, plus skeptic evaluating whether complexity earns its keep
- Opens with "what already exists?" check: (1) What existing code/patterns already solve sub-problems? (2) What is the minimum set of changes for stated goal? (3) Complexity check -- if plan touches many files or introduces many new abstractions, is that justified?
- Challenges: scope size relative to stated goals, unnecessary complexity, premature abstractions, framework-ahead-of-need, priority dependency conflicts (e.g., core feature depending on nice-to-have), scope boundaries violated by requirements, goals disconnected from requirements
- Completeness principle check: is the plan taking shortcuts where the complete version would cost little more?
- Confidence calibration: HIGH (0.80+) = can point to specific text showing scope conflict or unjustified complexity. MODERATE (0.60-0.79) = misalignment likely but depends on interpretation.
- Suppress: implementation style choices, priority preferences (other persona handles), missing requirements (coherence handles), business strategy

**Patterns to follow:**
- Unit 1 agents for consistent structure
- `plugins/compound-engineering/agents/review/ce-security-sentinel.agent.md` for security analysis style (plan-level adaptation)

**Test scenarios:**
- product-lens-reviewer challenges a plan that builds a complex admin dashboard when the stated goal is "improve user onboarding"
- product-lens-reviewer produces premise challenge as its opening findings
- design-lens-reviewer rates a user flow at 6/10 and describes what 10 looks like with specific missing states
- design-lens-reviewer flags a plan describing "a modern card-based dashboard layout" as AI slop risk
- security-lens-reviewer flags a plan that adds a public API endpoint without mentioning auth or rate limiting
- security-lens-reviewer does NOT flag code quality issues (suppress condition working)
- scope-guardian-reviewer identifies a plan with 12 implementation units when 4 would deliver the core value
- scope-guardian-reviewer identifies that the plan proposes a custom solution when an existing framework would work
- All four agents produce findings with all required fields

**Verification:**
- All four agents have valid frontmatter and follow the same structure as Unit 1
- product-lens-reviewer includes the 3-question premise challenge
- design-lens-reviewer includes the "rate 0-10, describe what 10 looks like" evaluation pattern
- scope-guardian-reviewer includes the "what already exists?" opening check
- All agents define confidence calibration and suppress conditions
- All agents rely on shared findings-schema.json for output normalization

---

- [x] **Unit 3: Rewrite document-review skill with persona pipeline**

**Goal:** Replace the current single-voice document-review SKILL.md with the persona pipeline orchestrator.

**Requirements:** R1, R4, R5, R6, R7, R8

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `plugins/compound-engineering/skills/document-review/SKILL.md`
- Create: `plugins/compound-engineering/skills/document-review/references/findings-schema.json`
- Create: `plugins/compound-engineering/skills/document-review/references/subagent-template.md`
- Create: `plugins/compound-engineering/skills/document-review/references/review-output-template.md`

**Approach:**

**Reference files (aligned with ce:review-beta PR #348 mechanism):**
- `findings-schema.json`: JSON schema that all persona agents must conform to. Same structure as ce:review-beta with document-specific swaps: `section` replaces `file`+`line`, `deferred_questions` replaces `testing_gaps`, drop `pre_existing`. Same enums for severity, autofix_class, owner.
- `subagent-template.md`: Shared prompt template with variable slots ({persona_file}, {schema}, {document_content}, {document_path}, {document_type}). Rules: "Return ONLY valid JSON matching the schema", suppress below confidence floor, every finding needs evidence. Adapted from ce:review-beta's template for document context instead of diff context.
- `review-output-template.md`: Markdown template for synthesized output. Findings grouped by severity (P0-P3), pipe-delimited tables with section, issue, reviewer, confidence, and route (autofix_class -> owner). Adapted from ce:review-beta's template for sections instead of file:line.

The rewritten skill has these phases:

**Phase 1 -- Get and Analyze Document:**
- Same entry point as current: accept a path or find the most recent doc in `docs/brainstorms/` or `docs/plans/`
- Read the document
- Classify document type: requirements doc (from brainstorms/) or plan (from plans/)
- Analyze content for conditional persona activation signals:
  - product-lens: user-facing features, market claims, scope decisions, prioritization language, requirements with user/customer focus
  - design-lens: UI/UX references, frontend components, user flows, wireframes, screen/page/view mentions
  - security-lens: auth/authorization mentions, API endpoints, data handling, payments, tokens, credentials, encryption
  - scope-guardian: multiple priority tiers (P0/P1/P2), large requirement count (>8), stretch goals, nice-to-haves, scope boundary language that seems misaligned

**Phase 2 -- Announce and Dispatch Personas:**
- Announce the review team with per-conditional justifications (e.g., "scope-guardian-reviewer -- plan has 12 requirements across 3 priority levels")
- Build the agent list: always coherence-reviewer + feasibility-reviewer, plus activated conditional agents
- Dispatch all agents in parallel via Task tool using fully-qualified names (`compound-engineering:review:<name>`)
- Pass each agent: document content, document path, document type (requirements vs plan), and the structured output schema
- Each agent receives the full document -- do not split into sections

**Phase 3 -- Synthesize Findings:**
Synthesis pipeline (order matters):
1. **Validate**: Check each agent's output for structural compliance against findings-schema.json. Drop malformed findings but note the agent's name for the coverage section.
2. **Confidence gate**: Suppress findings below 0.50 confidence. Store them as residual concerns.
3. **Deduplicate**: Fingerprint each finding using `normalize(section) + normalize(title)`. When fingerprints match: keep highest severity, highest confidence, union evidence, note all agreeing reviewers.
4. **Promote residual concerns**: Scan residual concerns for overlap with existing findings from other reviewers or concrete blocking risks. Promote to findings at P2 with confidence 0.55-0.65.
5. **Resolve contradictions**: When personas disagree on the same section (e.g., scope-guardian says cut, coherence says keep for narrative flow), create a combined finding presenting both perspectives with autofix_class `manual` and owner `human` -- let the user decide.
6. **Route by autofix_class**: `safe_auto` -> apply immediately. Everything else (`gated_auto`, `manual`, `advisory`) -> present to user. Personas classify precisely; the orchestrator collapses to 2 buckets.
7. **Sort**: P0 -> P1 -> P2 -> P3, then by confidence (descending), then document order.

**Phase 4 -- Apply and Present:**
- Apply `safe_auto` fixes to the document inline (single pass)
- Present all other findings (`gated_auto`, `manual`, `advisory`) to the user, grouped by severity
- Show a brief summary: N auto-fixes applied, M findings to consider
- Show coverage: which personas ran, any suppressed/residual counts
- Use the review-output-template.md format for consistent presentation

**Phase 5 -- Next Action:**
- Use the platform's blocking question tool when available (AskUserQuestion in Claude Code, request_user_input in Codex, ask_user in Gemini). Otherwise present numbered options and wait.
- Offer: "Refine again" or "Review complete"
- After 2 refinement passes, recommend completion (carry over from current behavior)
- "Review complete" as terminal signal for callers

**Pipeline mode:** When called from automated workflows, auto-fixes run silently. Strategic questions are still surfaced (the calling skill decides whether to present them or convert to assumptions).

**Protected artifacts:** Carry over from ce:review -- never flag `docs/brainstorms/`, `docs/plans/`, or `docs/solutions/` files for deletion. Discard any such findings during synthesis.

**What NOT to do section:** Carry over current guardrails:
- Don't rewrite the entire document
- Don't add new requirements the user didn't discuss
- Don't create separate review files or metadata sections
- Don't over-engineer or add complexity
- Don't add new sections not discussed in the brainstorm/plan

**Conflict resolution rules for synthesis:**
- When coherence says "keep for consistency" and scope-guardian says "cut for simplicity" -> combined finding, autofix_class: manual, owner: human
- When feasibility says "this is impossible" and product-lens says "this is essential" -> P1 finding, autofix_class: manual, owner: human, frame as a tradeoff
- When multiple personas flag the same issue -> merge into single finding, note consensus, increase confidence
- When a residual concern from one persona matches a finding from another -> promote the concern, note corroboration

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-review/SKILL.md` for agent dispatch and synthesis patterns
- Current `document-review/SKILL.md` for the entry point, iteration guidance, and "What NOT to Do" guardrails
- iterative-engineering `plan-review/SKILL.md` for synthesis pipeline ordering and fingerprint dedup

**Test scenarios:**
- A backend refactor plan triggers only coherence + feasibility (no conditional personas)
- A plan mentioning "user authentication flow" triggers coherence + feasibility + security-lens
- A plan with UI mockups and 15 requirements triggers all 6 personas
- A safe_auto finding correctly updates a terminology inconsistency without user approval
- A gated_auto finding is presented to the user (not auto-applied) despite having a suggested_fix
- A contradictory finding (scope-guardian vs coherence) is presented as a combined manual finding, not as two separate findings
- A residual concern from one persona is promoted when corroborated by another persona's finding
- Findings below 0.50 confidence are suppressed (not shown to user)
- Duplicate findings from two personas are merged into one with both reviewer names
- "Review complete" signal works correctly with a caller context
- Second refinement pass recommends completion
- Protected artifacts are not flagged for deletion

**Verification:**
- Skill has valid frontmatter (name: document-review, description updated to reflect persona pipeline)
- All agent references use fully-qualified namespace (`compound-engineering:review:<name>`)
- Entry point matches current skill (path or auto-find)
- Terminal signal "Review complete" preserved
- Conditional persona selection logic is centralized in the skill
- Synthesis pipeline follows the correct ordering (validate -> gate -> dedup -> promote -> resolve -> route -> sort)
- Reference files exist: findings-schema.json, subagent-template.md, review-output-template.md
- Cross-platform guidance included (platform question tool with fallback)
- Protected artifacts section present

---

- [x] **Unit 4: Update README and validate**

**Goal:** Update plugin documentation to reflect the new agents and revised skill.

**Requirements:** R1, R7

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `plugins/compound-engineering/README.md`

**Approach:**
- Add 6 new agents to the Review table in README.md (coherence-reviewer, design-lens-reviewer, feasibility-reviewer, product-lens-reviewer, scope-guardian-reviewer, security-lens-reviewer)
- Update agent count from "25+" to "31+" (or appropriate count after adding 6)
- Update the document-review description in the skills table if it exists
- Run `bun run release:validate` to verify consistency

**Patterns to follow:**
- Existing README.md table formatting
- Alphabetical ordering within the Review agent table

**Test scenarios:**
- All 6 new agents appear in README Review table
- Agent count is accurate
- `bun run release:validate` passes

**Verification:**
- README agent count matches actual agent file count
- All new agents listed with accurate descriptions
- release:validate passes without errors

## System-Wide Impact

- **Interaction graph:** document-review is called from 4 skills (ce-brainstorm, ce-plan, ce-plan-beta, deepen-plan-beta). The "Review complete" contract is preserved, so no caller changes needed.
- **Error propagation:** If a persona agent fails or times out during parallel dispatch, the orchestrator should proceed with findings from the agents that completed. Do not block the entire review on a single agent failure. Note the failed agent in the coverage section.
- **State lifecycle risks:** None -- personas are read-only. Only the orchestrator modifies the document, in a single auto-fix pass.
- **API surface parity:** The skill name (`document-review`) and terminal signal ("Review complete") remain unchanged. No breaking changes to callers.
- **Integration coverage:** Verify the skill works when invoked standalone and from each of the 4 caller contexts.
- **Finding noise risk:** With up to 6 personas, the total finding count could be high. The confidence gate (suppress below 0.50), dedup (fingerprint matching), and suppress conditions (per-persona) are the three mechanisms that control noise. If findings are still too noisy in practice, tighten the confidence gate or add suppress conditions.

## Risks & Dependencies

- **Agent dispatch limit:** ce:review auto-switches to serial mode at >5 agents. Maximum dispatch here is 6 (2 always-on + 4 conditional). If all 6 activate, the orchestrator should still use parallel dispatch since these are lightweight document reviewers reading a single document, not code analyzers scanning a codebase. Document this decision in the skill.
- **Contradictory findings:** The synthesis phase must handle conflicting persona findings explicitly. The initial implementation should lean toward presenting contradictions (both perspectives as a combined finding) rather than auto-resolving them. This preserves value even if it's slightly noisier.
- **Finding volume at full activation:** When all 6 personas activate on a large document, the total pre-dedup finding count could exceed 20-30. The synthesis pipeline (confidence gate + dedup + suppress conditions) should reduce this to a manageable set. If it doesn't, the first lever to pull is tightening per-persona suppress conditions.
- **Persona prompt quality:** The agents are only as good as their prompts. The established review patterns and iterative-engineering references provide battle-tested material, but the compound-engineering versions will be new and may need iteration. Plan for 1-2 rounds of prompt refinement after initial implementation.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-23-plan-review-personas-requirements.md](docs/brainstorms/2026-03-23-plan-review-personas-requirements.md)
- Related code: `plugins/compound-engineering/skills/ce-review/SKILL.md` (multi-agent orchestration pattern)
- Related code: `plugins/compound-engineering/skills/document-review/SKILL.md` (current implementation to replace)
- Related code: `plugins/compound-engineering/agents/review/` (agent structure reference)
- Related pattern: iterative-engineering `skills/plan-review/SKILL.md` (synthesis pipeline, findings schema, subagent template)
- Related pattern: iterative-engineering `agents/coherence-reviewer.md`, `feasibility-reviewer.md`, `scope-guardian-reviewer.md`, `prd-reviewer.md`, `tech-plan-reviewer.md`, `skeptic-reviewer.md` (persona prompt design, confidence calibration, suppress conditions)
- Related learning: `docs/solutions/skill-design/compound-refresh-skill-improvements.md` (subagent design patterns)
