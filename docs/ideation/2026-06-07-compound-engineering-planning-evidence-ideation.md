---
date: 2026-06-07
topic: compound-engineering-planning-evidence
focus: Improve Compound Engineering planning so architectural and technology decisions are grounded in current, reliable evidence.
mode: repo-grounded
---

# Ideation: Evidence-Grounded Compound Engineering Planning

## Grounding Context

The user likes Compound Engineering and wants to improve it without degrading the existing experience. The concrete concern is that planning and architectural decisions can rely too much on an LLM's training-time knowledge, especially in fast-moving areas like AI tooling, model APIs, agents, MCP, frontend frameworks, security, and external providers.

The Compound Engineering plugin already has relevant hooks. `/ce-plan` says planning should research before structuring, distinguishes implementation-guidance research from landscape/option-discovery research, and records whether external findings are load-bearing. `ce-web-researcher` already says recency matters but does not equal authority, and that source type and depth should be weighed alongside date. The improvement opportunity is therefore not "add web research from zero," but make freshness, source reliability, and evidence traceability enforceable at the decision points that matter.

External grounding included current agent-engineering and research-quality guidance. The strongest pattern is that context curation, tool choice, source evaluation, and repeatable evals matter more than simply browsing more. Architectural decision record practice also supports recording why a decision was made, what alternatives were rejected, and when the decision should be revisited.

## Topic Axes

- Planning decision quality
- External research freshness
- Source reliability and weighting
- Failure honesty and auditability
- Evaluation and regression testing
- Reusable landscape knowledge

## Ranked Ideas

### 1. Decision Evidence Ledger

**Description:** Add a required evidence block for every major technical or architectural decision in `/ce-plan`. The block should capture local evidence, external evidence, source freshness, authority tier, confidence, and what new information would change the decision.

**Axis:** Planning decision quality

**Basis:** direct: `/ce-plan` already has Key Technical Decisions and a load-bearing external-research flag; external: ADR practice treats durable rationale and alternatives as part of architecture quality.

**Rationale:** This targets the actual risk: not that the agent fails to browse, but that the plan can present decisions without an auditable trail. A decision ledger makes the plan reviewable by humans and future agents.

**Downsides:** Adds plan weight and could become boilerplate unless limited to major decisions.

**Confidence:** 92%

**Complexity:** Medium

**Status:** Unexplored

### 2. Freshness Gate For Fast-Moving Decisions

**Description:** Force external research when a plan chooses a stack, framework, model/API, agent tool, security-sensitive dependency, external provider, or unfamiliar architecture. Use domain-specific freshness windows: roughly 30-90 days for fast-moving AI tooling, security, and providers; 6-12 months for framework/library guidance; older sources allowed for stable architecture principles when still authoritative.

**Axis:** External research freshness

**Basis:** direct: the user specifically named the risk of six-month-old internet information in a rapidly changing AI landscape; direct: `/ce-plan` already has an external-research decision phase that can be tightened.

**Rationale:** This preserves CE's speed on normal local-pattern work while making freshness mandatory exactly where stale knowledge is costly.

**Downsides:** Requires careful trigger design to avoid turning every plan into a research project.

**Confidence:** 90%

**Complexity:** Medium

**Status:** Unexplored

### 3. Source Weighting Rubric

**Description:** Update `ce-web-researcher` and planning research consolidation so sources are scored by authority and fit, not date alone. A plausible hierarchy: official docs/release notes/security advisories, maintainer docs and current project activity, independent benchmarks or papers, engineering postmortems, then blogs/forums/SEO content.

**Axis:** Source reliability and weighting

**Basis:** direct: `ce-web-researcher` already says recency matters but does not equal authority; reasoned: a recent weak source should not outrank an older official source for stable facts.

**Rationale:** This makes "current" mean "currently reliable," not merely "recently published."

**Downsides:** Adds judgment work to the researcher and may need examples to stay consistent across agents.

**Confidence:** 88%

**Complexity:** Low-Medium

**Status:** Unexplored

### 4. Research Failure Honesty

**Description:** If web research is requested, required, or load-bearing but unavailable or thin, plans should state that plainly and mark affected decisions as assumptions or open questions. The plan should not imply external grounding that did not happen.

**Axis:** Failure honesty and auditability

**Basis:** direct: `/ce-plan` already has requested-but-unavailable handling; reasoned: false confidence is worse than an explicit assumption because it prevents human review from focusing where it matters.

**Rationale:** This keeps CE trustworthy even when tools fail, search quality is poor, or current evidence is genuinely thin.

**Downsides:** May make some plans feel less polished, but that is the point when confidence is actually lower.

**Confidence:** 86%

**Complexity:** Low

**Status:** Unexplored

### 5. Evidence Regression Evals

**Description:** Add test fixtures for planning prompts: one should trigger research, one should skip it, one should reject stale or weak sources, one should prefer official docs, and one should admit insufficient evidence. These can protect the planning research policy from drifting in future CE releases.

**Axis:** Evaluation and regression testing

**Basis:** external: current agent-building guidance emphasizes evals for tool choice, retrieval quality, and repeatable behavior; direct: CE already has detailed workflow contracts that can be tested as prompt behavior.

**Rationale:** The policy is only useful if it survives refactors and prompt edits. Evals make the improvement durable.

**Downsides:** Higher implementation burden than prose-only skill edits; evaluating agent outputs can be fuzzy unless fixtures are crisp.

**Confidence:** 84%

**Complexity:** Medium-High

**Status:** Unexplored

### 6. Landscape Pulse Skill

**Description:** Add a separate optional skill, such as `/ce-landscape` or `/ce-research-pulse`, that periodically summarizes the current state of fast-moving domains like AI coding agents, MCP tools, model APIs, and frontend frameworks. Plans could reuse these landscape notes instead of researching from scratch every time.

**Axis:** Reusable landscape knowledge

**Basis:** reasoned: repeated planning in the same fast-moving domain benefits from durable, refreshed context; direct: CE already values compounding knowledge through persistent artifacts.

**Rationale:** This could turn external research into reusable project memory rather than one-off web searches.

**Downsides:** Highest carrying cost; risks becoming stale unless refresh cadence and ownership are explicit.

**Confidence:** 72%

**Complexity:** High

**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Always force full web research on every plan | Too expensive relative to likely value; would slow routine local-pattern work and degrade the current experience. |
| 2 | Only use sources from the last 90 days | Not grounded in how authority works; stable architecture principles and official docs can remain more reliable than fresh low-quality commentary. |
| 3 | Replace `/ce-plan` with a research-first workflow | Scope overrun; the current CE planning experience is already strong and should be extended, not replaced. |
| 4 | Add citations everywhere in the plan | Too much artifact noise; citations should attach to load-bearing decisions, alternatives, risks, and assumptions. |
| 5 | Trust web search snippets for freshness | Unjustified; snippets are not sufficient evidence for architectural decisions. |

## Suggested Next Step

Start with a brainstorm or plan for **Decision Evidence Ledger + Freshness Gate** inside `/ce-plan`, then update `ce-web-researcher` with the source weighting rubric. This combination is high leverage, additive, and directly addresses the user's concern without making CE more cumbersome for ordinary work.
