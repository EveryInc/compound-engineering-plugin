---
title: "Codex Delegation Best Practices"
date: 2026-04-01
category: best-practices
module: "Codex delegation / skill design"
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Designing delegation to external models (Codex, future delegates) in orchestrator skills
  - Authoring or editing SKILL.md files where token cost matters
  - Choosing whether to delegate plan execution or implement directly
  - Writing delegation prompts for secondary agents
tags:
  - codex-delegation
  - token-economics
  - skill-design
  - batching
  - orchestration-cost
  - prompt-engineering
  - ce-work-beta
---

# Codex Delegation Best Practices

## Context

Over six iterations of evaluation building Codex delegation into `ce-work-beta`, we collected quantitative data on the token economics of orchestrating work between Claude Code (the orchestrator) and Codex (the delegated executor). The core question: when does delegating plan units to Codex actually save Claude tokens, and what architectural patterns control the cost?

The delegation model: `ce-work-beta` receives a plan with N implementation units, then decides whether to execute them directly (standard mode) or delegate them to Codex via `codex exec`. Delegation has a fixed orchestration overhead per batch (prompt file write, codex exec invocation, result classification, commit) of approximately 4-5k Claude tokens. Each unit of code Claude does not write saves roughly 3-5k tokens. The crossover depends on how many units are batched per delegation call.

The evaluation spanned iterations 1-6, testing small (1-2 units), medium (4 units), large (7 units), and extra-large (10 units) plans in both delegation and standard modes, with real code implementation and test verification in isolated worktrees.

---

## Guidance

### Token Economics

Delegation has a fixed orchestration cost per batch (~4-5k Claude tokens for prompt generation, codex exec, result classification, and commit) and a variable savings per unit (~3-5k Claude tokens of code-writing avoided). The crossover depends on how many units are batched per call.

**Crossover by plan size:**

| Plan size | Units | Delegate tokens | Standard tokens | Overhead | Verdict |
|-----------|-------|----------------|-----------------|----------|---------|
| Small (bug fix) | 1 | 51k | 38k | +34% | Not worth it for token savings |
| Small (new feature) | 1 | 63k | 42k | +50% | Not worth it for token savings |
| Medium | 4 | 54k | 53k | +2% | Marginal |
| Large | 7 | 62k | 62k | +1% | Break-even |
| Extra-large | 10 | 54k | 62k* | **-13%** | Delegation is cheaper |

*Standard mode extrapolated from 7-unit baseline. The XL delegate cost (54k) is lower than the 7-unit standard cost (62k) because orchestration is amortized over more units per batch.

**How it scales:** Each additional unit in a batch saves ~3-5k Claude tokens while adding zero orchestration cost. The orchestration is per-batch, not per-unit. A 10-unit plan in 2 batches costs ~8-10k in orchestration regardless of whether those batches contain 5 units or 50 lines of code each.

**The crossover point is ~5-7 units.** Below that, orchestration overhead dominates. Above it, code-writing savings dominate. Users may still choose delegation below the crossover for cost arbitrage (Codex tokens are cheaper than Claude tokens) or coding preference.

**Wall clock time cost:** Delegation is 1.7-2.2x slower due to codex exec latency:

| Plan size | Delegate time | Standard time | Slowdown |
|-----------|---------------|---------------|----------|
| Medium (4 units) | 353s | 188s | 1.9x |
| Large (7 units) | 569s | 254s | 2.2x |
| Extra-large (10 units) | 574s | ~300s* | ~1.9x |

**Test coverage cost:** Without explicit testing guidance in the prompt, Codex produces 15-43% fewer tests than Claude. Adding the `<testing>` section to the prompt closed this gap by ~35% on large plans (see Prompt Engineering section below).

**Evolution across iterations:**

| Iteration | Architecture | Medium delegate tokens | Change |
|-----------|-------------|----------------------|--------|
| 3 | Per-unit loop, all content in SKILL.md body (776 lines) | 58k | Baseline |
| 4 | Added optimizations to body (~810 lines) | 79k | +38% (worse — body growth overwhelmed savings) |
| 5 | Extracted to reference file, batched model (514 lines) | 61k | -23% from iter-4, back to baseline |
| 6 | Added `<testing>` to prompt | 54k | -7% (with better test quality) |

The key lesson from iteration 4: adding content to the skill body increases cost on every tool call. Optimizations that save a few tool calls but add 50+ lines to the body can be net negative.

### Skill Body Size is the Multiplicative Cost Driver

The dominant formula:

```
total_token_cost ~ skill_body_lines x tokens_per_line x num_tool_calls
```

Reducing tool calls helps linearly. Reducing skill body size helps **multiplicatively** because it affects every remaining tool call for the entire session. In iteration 4, adding optimization instructions directly to the SKILL.md body caused a net token *increase* despite the optimizations being structurally sound — the larger body cost more on every subsequent tool call than the optimizations saved.

**Threshold rule:** Move content to a reference file if it exceeds ~50 lines AND is only used in a minority of invocations. Keep always-needed content in the body.

### Architecture Patterns That Reduce Cost (Ranked by Impact)

**1. Extract conditional content to reference files.**
Moving delegation-specific content (~250 lines) from the SKILL.md body to `references/codex-delegation-workflow.md` shrank the skill from 776 to 514 lines. This saved ~15k Claude tokens per non-delegation run — a 34% body reduction affecting every tool call. The reference is loaded once, only when delegation is active.

**2. Batch execution over per-unit execution.**
Sending all units (or groups of roughly 5) in a single `codex exec` call reduces orchestration from O(N) to O(ceil(N/batch_size)). For a 10-unit plan: 2 batches x ~4-5k = 8-10k orchestration vs 10 x 4-5k = 40-50k with per-unit delegation.

**3. Delegate the verify/test-fix loop to Codex.**
In the original design, Codex wrote code and the orchestrator independently ran tests to verify. This doubled the verification cost — Claude re-ran the same tests Codex already ran, adding a tool call per batch and classification logic for "completed but verify failed" (a 6th signal in the result table). Moving verification into the delegation prompt ("run tests, fix failures, do not report completed unless tests pass") eliminates that round-trip.

The safety net is the circuit breaker, not the orchestrator re-running tests. If Codex reports "completed" but the code is actually broken, the failure surfaces at one of three catch points: (1) the result schema — Codex reports "failed" or "partial" when it cannot get tests to pass, triggering rollback; (2) the circuit breaker — 3 consecutive failures disable delegation and fall back to standard mode where Claude implements with full Phase 2 testing guidance; (3) Phase 3 quality check — the full test suite runs before shipping regardless of execution mode. The orchestrator does not need to independently verify each batch because these layered catches prevent bad code from shipping. This is the key design insight: trust the delegate's self-report, protect against systematic failure with the circuit breaker, and verify the whole at the end.

**4. Cache pre-delegation checks.**
Environment guard, CLI availability, and consent checks run once before the first batch, not per-unit or per-batch. These don't change mid-execution.

**5. Batch scratch cleanup.**
Clean up `.context/` delegation artifacts at end-of-plan, not per-unit. Fewer tool calls, same outcome.

### Plan Quality Enables Good Delegation Decisions

Every delegation decision — whether to delegate, how to batch, what to include in the prompt — depends on what the plan file provides. The orchestrator can only be as smart as the plan it reads.

| Plan signal | What it enables |
|-------------|----------------|
| Unit count and scope | The crossover decision (5-7 unit threshold) |
| File lists per unit | "Don't split units that share files" batching rule |
| Test scenarios per unit | Forwarded to Codex via the `<testing>` prompt section; thin plan scenarios produce thin Codex tests regardless of prompt engineering |
| Verification commands | Become the `<verify>` section; missing verification means Codex cannot confirm its own work |
| Triviality signals (Goal, Approach) | Whether delegation is considered at all ("config change" vs "recursive validation engine") |
| Dependencies between units | Batch boundary decisions for plans >5 units |

A well-structured ce:plan output provides all of these. A hand-written requirements doc or TODO list may provide few or none — the delegation logic still works (the skill handles non-standard plans), but the decisions are less informed. For example, without explicit file lists, the batching rule cannot check for shared files; without test scenarios, the Codex prompt's `<testing>` section has nothing to supplement.

This does not mean delegation requires ce:plan output. It means the quality of delegation improves proportionally with the structure of the plan. Users who invest in structured plans get smarter delegation decisions. Users with lightweight plans get delegation that works but makes conservative choices (e.g., single-batch everything, generic test guidance).

### Prompt Engineering for Delegation Quality

Without explicit testing guidance, Codex produces 15-43% fewer tests than Claude. Three prompt additions close this gap:

**`<testing>` section** — Include Test Scenario Completeness guidance (happy path, edge cases, error paths, integration). This improved Codex test output by ~35% on large plans. Codex implements what the prompt asks; it does not infer quality standards from context.

**Combined `<verify>` command** — Require running ALL test files in a single command, not per-file. Per-file verification misses cross-file contamination — observed in eval when mocked `globalThis.fetch` in one test file leaked into integration tests running in the same bun process.

**Light system-wide check** — "If your changes touch callbacks, middleware, or event handlers, verify the interaction chain end-to-end." One sentence that catches architectural issues Codex would otherwise miss.

### Batching Strategy

Delegate all units in one batch. If the plan exceeds 5 units, split into batches of roughly 5 — never splitting units that share files. Skip delegation entirely if every unit is trivial.

Between batches: report progress and continue immediately unless the user intervenes. The checkpoint exists so the user *can* steer, not so they *must*.

### User Choice Matters

Users may prefer delegation even when it is not optimal for Claude token savings:

- **Cost arbitrage** — Codex tokens may be cheaper on their usage plan
- **Coding preference** — they may prefer Codex's implementation style for certain tasks
- **Usage conservation** — they may want to conserve Claude Code usage specifically

The `work_delegate_decision` setting (`auto`/`ask`) supports this. In `ask` mode, the skill presents a recommendation with rationale but lets the user override. When recommending against delegation: "Codex delegation active, but these are small changes where the cost of delegating outweighs having Claude Code do them." The user can still choose "Delegate to Codex anyway."

---

## Why This Matters

The naive assumption — that offloading work to a secondary agent always saves the orchestrator tokens — is wrong for small workloads and only becomes true past a specific threshold. Without this data, skill authors will either avoid delegation entirely (missing savings on large plans) or apply it universally (wasting tokens on small plans). The 5-7 unit crossover, derived from six evaluation iterations with real token counts, provides a concrete decision boundary.

The discovery that skill body size is a multiplicative cost driver changes how skills should be authored across the entire plugin. Every line in a SKILL.md body is paid for on every tool call in the session. This makes "extract rarely-used content to reference files" one of the highest-leverage optimizations available to skill authors, and it reframes the instinct to add helpful content to a skill body as a potential anti-pattern when that content is conditional.

---

## When to Apply

- **Designing delegation in any orchestrator skill:** Use the 5-7 unit crossover as the threshold. Below it, prefer direct execution unless the user explicitly requests delegation.
- **Authoring or editing any SKILL.md:** Audit for conditional content blocks exceeding ~50 lines. If they apply to a minority of invocations, extract to reference files.
- **Adding optimization or guidance content to a skill:** Measure whether the added body size costs more per-call than the optimization saves. If content is only relevant to a specific execution path, it belongs in a reference file.
- **Writing delegation prompts:** Include explicit testing completeness guidance and require unified test execution. Do not assume the delegated agent will infer quality standards.
- **Choosing batch sizes:** Use batches of up to roughly 5 units, never splitting units that share files.

---

## Examples

**Skill body size impact — iteration 4 regression:**

Iteration 3: SKILL.md at 776 lines. Medium plan (4 units) delegated cost 58k Claude tokens.
Iteration 4: Added optimization content to body, SKILL.md grew to ~810 lines. Same plan cost 79k tokens (+38%) despite fewer tool calls. The optimization content was sound but the body growth overwhelmed the savings.
Iteration 5: Extracted delegation to reference file, SKILL.md back to 514 lines. Same plan cost 61k tokens — back to iter-3 levels with more features.

**Delegation decision examples:**

3-unit plan, all implementation:
> Standard mode recommended. These 3 units are below the efficiency threshold. Direct execution uses fewer Claude tokens.

8-unit plan, mixed implementation and tests:
> Delegate. Batch into [units 1-5] and [units 6-8], keeping shared-file units together. Pre-delegation checks run once. Progress reported between batches.

4-unit plan, all config/renames:
> Skip delegation. All units are trivial — orchestration overhead exceeds any benefit.

4-unit plan, user explicitly requests delegation:
> Delegate despite marginal economics. User preference is respected. One batch, standard flow.

---

## Related

- [Codex delegation requirements](../../brainstorms/2026-03-31-codex-delegation-requirements.md) — origin requirements defining the delegation flow
- [Codex delegation implementation plan](../../plans/2026-03-31-001-feat-codex-delegation-plan.md) — implementation plan with prompt template and circuit breaker design
- [Pass paths not content to subagents](../skill-design/pass-paths-not-content-to-subagents-2026-03-26.md) — foundational token efficiency pattern for multi-agent orchestration
- [Script-first skill architecture](../skill-design/script-first-skill-architecture.md) — complementary token reduction pattern (60-75% savings by moving processing to scripts)
- [Agent-friendly CLI principles](../agent-friendly-cli-principles.md) — CLI design principles relevant to how `codex exec` is consumed
