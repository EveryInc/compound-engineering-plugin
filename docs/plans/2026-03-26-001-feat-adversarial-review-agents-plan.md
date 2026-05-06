---
title: "feat: Add adversarial review agents for code and documents"
type: feat
status: completed
date: 2026-03-26
deepened: 2026-03-26
---

# feat: Add adversarial review agents for code and documents

## Overview

Add two adversarial review agents to the compound-engineering plugin — one for code review and one for document review. These agents take a fundamentally different stance from existing reviewers: instead of evaluating quality against known criteria, they actively try to *falsify* the artifact by constructing scenarios that break it, challenging assumptions, and probing for problems that pattern-matching reviewers miss.

Both agents integrate into the existing review ensembles as conditional reviewers, activated by skill-level filtering. Both auto-scale their depth internally based on artifact size and risk signals. Both produce findings using the standard JSON contract so they merge cleanly into existing synthesis pipelines.

## Problem Frame

The existing review infrastructure is comprehensive — 24 code review agents and 6 document review agents covering correctness, security, reliability, maintainability, performance, scope, feasibility, and coherence. But all reviewers share an *evaluative* stance: they check artifacts against known quality criteria.

What's missing is a *falsification* stance — actively constructing scenarios that break the artifact, challenging the assumptions behind decisions, and probing for emergent failures that no single-pattern reviewer would catch. This is the gap that gstack's adversarial evaluation fills (cross-model challenge mode, spec review loops, proxy skepticism, shadow path tracing) and that compound-engineering currently lacks.

## Requirements Trace

- R1. Code adversarial-reviewer agent that tries to break implementations by constructing failure scenarios
- R2. Document adversarial-reviewer agent that challenges premises, assumptions, and decisions in plans/requirements
- R3. Both agents use the standard JSON findings contract for their respective pipelines
- R4. Skill-level filtering: orchestrating skills decide whether to dispatch adversarial review
- R5. Agent-level auto-scaling: agents modulate their own depth (quick/standard/deep) based on artifact size and risk
- R6. Direct invocation: agents work when called directly, not only through skill pipelines
- R7. Clear boundaries: each agent has explicit "do not flag" rules to prevent overlap with existing reviewers

## Scope Boundaries

- No cross-model adversarial review (no Codex/external model integration) — that's a separate feature
- No changes to findings schemas — both agents use existing schemas as-is
- No new skills — agents integrate into existing `ce-review` and `document-review` skills
- No changes to synthesis/dedup pipelines — agents produce standard output that existing pipelines handle
- No beta framework — these are additive conditional reviewers with no risk to existing behavior

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/agents/review/ce-*.agent.md` — 24 existing code review agents following consistent structure (identity, hunting list, confidence calibration, suppress conditions, output format)
- `plugins/compound-engineering/agents/document-review/ce-*.agent.md` — 6 existing document review agents (identity, analysis focus, confidence calibration, suppress conditions)
- `plugins/compound-engineering/skills/ce-review/SKILL.md` — code review orchestration with tiered persona ensemble
- `plugins/compound-engineering/skills/ce-review/references/persona-catalog.md` — reviewer registry with always-on, cross-cutting conditional, and stack-specific conditional tiers
- `plugins/compound-engineering/skills/document-review/SKILL.md` — document review orchestration with 2 always-on + 4 conditional personas
- `plugins/compound-engineering/skills/ce-review/references/findings-schema.json` — code review findings contract
- `plugins/compound-engineering/skills/document-review/references/findings-schema.json` — document review findings contract

### Institutional Learnings

- Reviewer selection is agent judgment, not keyword matching — the orchestrator reads the diff and reasons about which conditionals to activate
- Per-persona confidence calibration and explicit suppress conditions are the primary noise-control mechanism
- Intent shapes review depth (how hard each reviewer looks), not reviewer selection
- Conservative routing on disagreement: merged findings narrow but never widen without evidence
- Subagent template pattern wraps persona + schema + context for consistent dispatch

### External References

- gstack adversarial patterns analyzed: `/codex` challenge mode (chaos engineer prompting), `/plan-ceo-review` (proxy skepticism, independent spec review loop), `/plan-design-review` (auto-scaling by diff size), `/plan-eng-review` (error & rescue map, shadow path tracing), `/cso` (20 hard exclusion rules + 22 precedents)

## Key Technical Decisions

- **Two agents, not one**: Document and code adversarial review require fundamentally different reasoning techniques (strategic skepticism vs. chaos engineering). A single agent would need such a sprawling prompt that it loses sharpness at both.
- **Conditional tier, not always-on**: Adversarial review is expensive. Small config changes and trivial fixes don't need it. Skill-level filtering gates dispatch; agent-level auto-scaling gates depth.
- **Same short persona name in both pipelines**: Both agents use `"reviewer": "adversarial"` in their JSON output. This is safe because the two pipelines (ce-review and document-review) never merge findings across each other.
- **Depth determined by artifact size + risk signals**: The agent reads the artifact and determines quick/standard/deep. Callers can override depth via the intent summary (e.g., "this is a critical auth change, review deeply").
- **Agent-internal auto-scaling, not template-driven**: No existing review agent auto-scales depth — this is a novel pattern in the plugin. The subagent templates pass the full raw diff/document but no sizing metadata (no line count, word count, or risk classification). Rather than extending the shared templates with new variables (which would affect all reviewers), each adversarial agent estimates size from the raw content it already receives. The code agent counts diff hunk lines; the document agent estimates word/requirement count from the text. This keeps the change additive — no template modifications, no orchestrator changes.
- **Auto-scaling thresholds grounded in gstack precedent**: The 50-line code threshold matches gstack's `plan-design-review` small-diff cutoff where adversarial review is skipped entirely. The 200-line threshold matches where gstack escalates to full multi-pass adversarial. Document thresholds (1000/3000 words) are set proportionally — a 1000-word doc is roughly a lightweight plan, a 3000-word doc is a Standard/Deep plan. These are starting values to tune based on usage.
- **No overlap with existing reviewers by design**: Each agent's "What you don't flag" section explicitly defers to existing specialists. The adversarial agent finds problems that emerge from the *combination* or *assumptions* of the system, not problems in individual patterns.

## Open Questions

### Resolved During Planning

- **Should the agents share a name?** Yes — both are `adversarial-reviewer` in their respective directories. The fully-qualified names (`compound-engineering:review:adversarial-reviewer` and `compound-engineering:document-review:adversarial-reviewer`) are distinct. The persona catalog uses FQ names.
- **What model should they use?** `model: inherit` for both, matching all other review agents. Adversarial review benefits from the strongest available model.
- **What confidence thresholds?** Code adversarial: 0.60 floor (matching ce-review pipeline). Document adversarial: 0.50 floor (matching document-review pipeline). High confidence (0.80+) requires a concrete constructed scenario with traceable evidence.

### Deferred to Implementation

- Exact wording of system prompt scenarios and examples — these will be refined during agent authoring based on what reads clearly
- Whether the depth auto-scaling thresholds (50/200 lines for code, 1000/3000 words for docs) need tuning — start with these and adjust based on usage

---

## Implementation Units

- [x] **Unit 1: Create code adversarial-reviewer agent**

  **Goal:** Define the adversarial reviewer for code diffs that tries to break implementations by constructing failure scenarios

  **Requirements:** R1, R3, R5, R6, R7

  **Dependencies:** None

  **Files:**
  - Create: `plugins/compound-engineering/agents/review/ce-adversarial-reviewer.agent.md`

  **Approach:**
  Follow the standard code review agent structure (identity, hunting list, confidence calibration, suppress conditions, output format). The key differentiation is in the *hunting list* — these are not patterns to match but *scenario construction techniques*:

  1. **Assumption violation** — identify assumptions the code makes about its environment (API always returns JSON, config always set, queue never empty, input always within range) and construct scenarios where those assumptions break. Different from correctness-reviewer which checks logic *given* assumptions.
  2. **Composition failures** — trace interactions across component boundaries where each component is correct in isolation but the combination fails (ordering assumptions, shared state mutations, contract mismatches between caller and callee). Different from correctness-reviewer which examines individual code paths.
  3. **Cascade construction** — build multi-step failure chains: "A times out, causing B to retry, overwhelming C." Different from reliability-reviewer which checks individual failure handling.
  4. **Abuse cases** — find legitimate-seeming usage patterns that cause bad outcomes: "user submits this 1000 times," "request arrives during deployment," "two users edit the same resource simultaneously." Not security exploits (security-reviewer) and not performance anti-patterns (performance-reviewer) — emergent misbehavior.

  Auto-scaling logic in the system prompt. The agent receives the full raw diff via the subagent template's `{diff}` variable and the intent summary via `{intent_summary}`. No sizing metadata is pre-computed — the agent estimates diff size from the content it receives and extracts risk signals from the free-text intent summary (e.g., "Simplify tax calculation" = low risk; "Add OAuth2 flow for payment provider" = high risk).

  - **Quick** (<50 changed lines): assumption violation scan only — identify 2-3 assumptions the code makes and whether they could be violated
  - **Standard** (50-199 lines): + scenario construction + abuse cases
  - **Deep** (200+ lines OR risk signals like auth/payments/data mutations): + composition failures + cascade construction + multi-pass

  Suppress conditions (what NOT to flag):
  - Individual logic bugs without cross-component impact (correctness-reviewer)
  - Known vulnerability patterns like SQL injection, XSS (security-reviewer)
  - Individual missing error handling (reliability-reviewer)
  - Performance anti-patterns like N+1 queries (performance-reviewer)
  - Code style, naming, structure issues (maintainability-reviewer)
  - Test coverage gaps (testing-reviewer)
  - API contract changes (api-contract-reviewer)

  **Patterns to follow:**
  - `plugins/compound-engineering/agents/review/ce-correctness-reviewer.agent.md` — closest structural analog
  - `plugins/compound-engineering/agents/review/ce-reliability-reviewer.agent.md` — for cascade/failure-chain framing

  **Test scenarios:**
  - Agent file parses with valid YAML frontmatter (name, description, model, tools, color fields present)
  - System prompt contains all 4 hunting techniques with concrete descriptions
  - Confidence calibration has 3 tiers matching ce-review thresholds (0.80+, 0.60-0.79, below 0.60)
  - Suppress conditions explicitly name every existing reviewer whose territory is deferred
  - Output format section matches standard JSON skeleton with `"reviewer": "adversarial"`
  - Auto-scaling thresholds are documented in the system prompt

  **Verification:**
  - `bun run release:validate` passes
  - Agent file follows the exact section ordering of existing review agents

---

- [x] **Unit 2: Create document adversarial-reviewer agent**

  **Goal:** Define the adversarial reviewer for planning/requirements documents that challenges premises, assumptions, and decisions

  **Requirements:** R2, R3, R5, R6, R7

  **Dependencies:** None

  **Files:**
  - Create: `plugins/compound-engineering/agents/document-review/ce-adversarial-document-reviewer.agent.md`

  **Approach:**
  Follow the standard document review agent structure (identity, analysis focus, confidence calibration, suppress conditions). The analysis techniques:

  1. **Premise challenging** — question whether the stated problem is the real problem. "The document says X is the goal — but the requirements described actually solve Y. Which is it?" Different from coherence-reviewer which checks internal consistency without questioning whether the goals themselves are right.
  2. **Assumption surfacing** — force unstated assumptions into the open. "This plan assumes Z will always be true. Where is that stated? What happens if it's not?" Different from feasibility-reviewer which checks whether the approach works given its assumptions.
  3. **Decision stress-testing** — for each major technical or scope decision: "What would make this the wrong choice? What evidence would falsify this decision?" Different from scope-guardian which checks alignment between stated scope and stated goals, not whether the goals themselves are well-chosen.
  4. **Simplification pressure** — "What's the simplest version that would validate this? Does this abstraction earn its keep? What could be removed without losing the core value?" Different from scope-guardian which checks for scope creep, not for over-engineering within scope.
  5. **Alternative blindness** — "What approaches were not considered? Why was this path chosen over the obvious alternatives?" Different from feasibility-reviewer which evaluates the proposed approach, not what was left on the table.

  Auto-scaling logic. The agent receives the full document text via the subagent template's `{document_content}` variable and the document type ("requirements" or "plan") via `{document_type}`. No word count or requirement count is pre-computed — the agent estimates from the content. Risk signals come from the document content itself (domain keywords, abstraction proposals, scope size).

  - **Quick** (small doc, <1000 words or <5 requirements): premise check + simplification pressure only
  - **Standard** (medium doc): + assumption surfacing + decision stress-testing
  - **Deep** (large doc, >3000 words or >10 requirements, or high-stakes domain like auth/payments/migrations): + alternative blindness + multi-pass

  Suppress conditions:
  - Internal contradictions or terminology drift (coherence-reviewer)
  - Technical feasibility or architecture conflicts (feasibility-reviewer)
  - Scope-goal alignment or priority dependency issues (scope-guardian-reviewer)
  - UI/UX quality or user flow completeness (design-lens-reviewer)
  - Security implications at plan level (security-lens-reviewer)
  - Product framing or business justification (product-lens-reviewer)

  **Patterns to follow:**
  - `plugins/compound-engineering/agents/document-review/ce-scope-guardian-reviewer.agent.md` — closest structural analog (also challenges scope decisions)
  - `plugins/compound-engineering/agents/document-review/ce-feasibility-reviewer.agent.md` — for assumption-adjacent framing

  **Test scenarios:**
  - Agent file parses with valid YAML frontmatter (name, description, model fields present)
  - System prompt contains all 5 analysis techniques with concrete descriptions
  - Confidence calibration has 3 tiers matching document-review thresholds (0.80+, 0.60-0.79, below 0.50)
  - Suppress conditions explicitly name every existing document reviewer whose territory is deferred
  - Auto-scaling thresholds are documented in the system prompt
  - No output format section (document review agents get output contract from subagent template)

  **Verification:**
  - `bun run release:validate` passes
  - Agent file follows the structural conventions of existing document review agents

---

- [x] **Unit 3: Integrate code adversarial-reviewer into ce-review skill**

  **Goal:** Register the adversarial-reviewer as a cross-cutting conditional in the ce-review persona catalog and add selection logic to the skill

  **Requirements:** R4, R5

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `plugins/compound-engineering/skills/ce-review/references/persona-catalog.md`
  - Modify: `plugins/compound-engineering/skills/ce-review/SKILL.md`

  **Approach:**

  *Persona catalog:*
  Add `adversarial` to the cross-cutting conditional tier table:
  ```
  | `adversarial` | `compound-engineering:review:adversarial-reviewer` | Select when diff is >=50 changed lines, OR touches auth, payments, data mutations, external API integrations, or other high-risk domains |
  ```

  *Skill selection logic (Stage 3):*
  Add adversarial-reviewer to the conditional selection with these activation rules:
  - Diff size >= 50 changed lines (excluding test files, generated files, lockfiles)
  - OR diff touches high-risk domains: authentication/authorization, payment processing, data mutations/migrations, external API integrations, cryptography
  - The intent summary is passed to the agent to inform auto-scaling depth (the agent decides quick/standard/deep, not the skill)

  *Announcement format:*
  ```
  - adversarial -- 147 changed lines across auth controller and payment service
  ```

  **Patterns to follow:**
  - How `security` is listed in the persona catalog cross-cutting conditional table
  - How `reliability` selection logic is described in Stage 3

  **Test scenarios:**
  - Persona catalog has adversarial in the cross-cutting conditional table with correct FQ agent name
  - Selection logic references both size threshold and risk domain triggers
  - Announcement format matches existing conditional reviewer pattern (`name -- justification`)

  **Verification:**
  - `bun run release:validate` passes
  - Persona catalog table renders correctly in markdown preview

---

- [x] **Unit 4: Integrate document adversarial-reviewer into document-review skill**

  **Goal:** Register the adversarial-reviewer as a conditional reviewer in the document-review skill with activation signals

  **Requirements:** R4, R5

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `plugins/compound-engineering/skills/document-review/SKILL.md`

  **Approach:**

  Add adversarial-reviewer to the conditional persona selection (Phase 1) with these activation signals:
  - Document contains >5 distinct requirements or implementation units
  - Document makes explicit architectural or scope decisions with stated rationale
  - Document covers high-stakes domains (auth, payments, data migrations, external integrations)
  - Document proposes new abstractions, frameworks, or significant architectural patterns

  Announcement format:
  ```
  - adversarial-reviewer -- plan proposes new abstraction layer with 8 requirements across auth and payments
  ```

  **Patterns to follow:**
  - How `scope-guardian-reviewer` activation signals are listed (bulleted under "activate when the document contains:")
  - How `security-lens-reviewer` activation signals reference domain keywords

  **Test scenarios:**
  - Activation signals listed in the same format as existing conditional reviewers
  - Announcement format matches existing pattern
  - Maximum reviewer count updated if the skill documents a cap (currently 6 max — now 7 possible)

  **Verification:**
  - `bun run release:validate` passes

---

- [x] **Unit 5: Update plugin metadata and documentation**

  **Goal:** Update agent counts and document the new adversarial reviewers in plugin README

  **Requirements:** None (housekeeping)

  **Dependencies:** Units 1-4

  **Files:**
  - Modify: `plugins/compound-engineering/README.md` (agent count, reviewer table if one exists)
  - Modify: `.claude-plugin/marketplace.json` (if it tracks agent counts)
  - Modify: `plugins/compound-engineering/.claude-plugin/plugin.json` (if it tracks agent counts)

  **Approach:**
  - Update any agent count references (24 code review agents -> 25, 6 document review agents -> 7)
  - Add adversarial reviewers to any agent listing tables
  - Keep descriptions consistent with the agent frontmatter descriptions

  **Patterns to follow:**
  - Existing README format for listing agents
  - How previous agent additions updated metadata

  **Test scenarios:**
  - `bun run release:validate` passes (this validates agent counts match between plugin.json and actual files)
  - README accurately reflects the new agent count

  **Verification:**
  - `bun run release:validate` passes with no warnings

## System-Wide Impact

- **Interaction graph:** The adversarial agents are read-only reviewers dispatched via subagent template. They do not modify code or documents. Their findings enter the existing synthesis pipeline (confidence gating, dedup, routing) unchanged.
- **Error propagation:** If an adversarial agent fails or returns invalid JSON, the existing synthesis pipeline handles it the same way it handles any reviewer failure — the review continues with other reviewers' findings.
- **Token cost:** Adversarial review adds one additional subagent per pipeline when activated. The auto-scaling mechanism (quick/standard/deep) bounds token usage proportionally to artifact size. At quick depth, the agent produces minimal findings; at deep depth, it may produce the most detailed findings in the ensemble.
- **Dedup behavior with adversarial findings:** The ce-review dedup fingerprint is `normalize(file) + line_bucket(line, ±3) + normalize(title)`. Adversarial findings and pattern-based findings at the same code location will typically have different titles (e.g., "API assumes JSON response format" vs. "Missing null check on API response"), so `normalize(title)` prevents false merging. This was confirmed by analyzing existing overlap zones (correctness vs. reliability at the same `rescue` block, correctness vs. security at parameter parsing lines) — the title component is sufficient to discriminate genuinely different problems. The document-review pipeline uses `normalize(section) + normalize(title)` with even lower collision risk due to coarser granularity. The adversarial agents should use distinctive, scenario-oriented titles (e.g., "Cascade: payment timeout triggers unbounded retry loop") that naturally diverge from pattern-based reviewer titles.
- **Intent summary interaction:** The code adversarial agent receives the intent summary as free-text 2-3 lines (e.g., "Add OAuth2 flow for payment provider. Must not regress existing session management."). The agent uses this to detect risk signals for auto-scaling — domain keywords like "auth", "payment", "migration" trigger deeper review. The intent is not structured data, so the agent must parse it heuristically. This matches how all other reviewers receive intent today.
- **Ensemble dynamics:** Adding a conditional reviewer does not change the behavior of existing reviewers. Suppress conditions in each adversarial agent minimize overlap upstream; the dedup fingerprint handles residual incidental overlap at synthesis time.

## Risks & Dependencies

- **Risk: Noise generation** — Adversarial review by nature produces findings that may feel subjective or speculative. Mitigation: strict confidence calibration (0.80+ for high-confidence adversarial findings requires a concrete constructed scenario with traceable evidence), explicit suppress conditions, and the existing 0.60/0.50 confidence gates in synthesis.
- **Risk: Reviewer overlap despite suppress conditions** — Some adversarial findings may target the same code location as correctness or reliability findings. Mitigation: the dedup fingerprint's `normalize(title)` component discriminates genuinely different problems (confirmed by analyzing existing reviewer overlap zones). The adversarial agents should use scenario-oriented titles that naturally diverge from pattern-based titles.
- **Risk: Auto-scaling is prompt-controlled, not programmatic** — If the agent ignores depth guidance and goes deep on a small diff, there is no programmatic guard. This is inherent to all agent behavior in the plugin (no existing agent has programmatic depth controls either). Mitigation: the confidence calibration and suppress conditions bound finding volume regardless of depth; a noisy quick-mode review still gets gated at 0.60 confidence during synthesis.
- **Dependency: Existing synthesis pipeline handles new persona** — The `"reviewer": "adversarial"` persona name is new but follows the same JSON contract. No pipeline changes needed.

## Sources & References

- Competitive analysis: gstack plugin at `~/Code/gstack/` — adversarial patterns in `/codex`, `/plan-ceo-review`, `/plan-design-review`, `/plan-eng-review`, `/cso` skills
- Existing agent conventions: `plugins/compound-engineering/agents/review/ce-correctness-reviewer.agent.md`, `plugins/compound-engineering/agents/document-review/ce-scope-guardian-reviewer.agent.md`
- Persona catalog: `plugins/compound-engineering/skills/ce-review/references/persona-catalog.md`
- Findings schemas: `plugins/compound-engineering/skills/ce-review/references/findings-schema.json`, `plugins/compound-engineering/skills/document-review/references/findings-schema.json`
