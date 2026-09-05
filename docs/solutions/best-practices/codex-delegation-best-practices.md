---
title: "Codex Delegation Token Economics"
date: 2026-04-01
category: best-practices
module: "Codex delegation / skill design"
problem_type: convention
component: tooling
severity: medium
applies_when:
  - Designing delegation to external models (Codex, future delegates) in orchestrator skills
  - Authoring or editing SKILL.md files where token cost matters
  - Choosing whether to delegate plan execution or implement directly
tags:
  - codex-delegation
  - token-economics
  - skill-design
  - batching
  - orchestration-cost
---

# Codex Delegation Token Economics

Measured over six evaluation iterations of an experimental `ce-work` delegation mode (since removed; the live successor is `skills/ce-work/references/cross-model-execution.md`). The setting names in that experiment are gone; the numbers are the durable part.

## Crossover: delegation saves orchestrator tokens only past ~5-7 units

Delegating a batch costs a fixed ~4-5k Claude tokens (prompt file, `codex exec`, result classification, commit) and saves ~3-5k per unit of code Claude does not write. Orchestration is per-batch, not per-unit.

| Plan size | Units | Delegate tokens | Standard tokens | Overhead | Verdict |
|-----------|-------|----------------|-----------------|----------|---------|
| Small (bug fix) | 1 | 51k | 38k | +34% | Not worth it |
| Small (new feature) | 1 | 63k | 42k | +50% | Not worth it |
| Medium | 4 | 54k | 53k | +2% | Marginal |
| Large | 7 | 62k | 62k | +1% | Break-even |
| Extra-large | 10 | 54k | 62k* | -13% | Delegation is cheaper |

*Standard extrapolated from the 7-unit baseline.

Wall clock is 1.7-2.2x slower under delegation (medium 353s vs 188s; large 569s vs 254s; XL 574s vs ~300s). Without an explicit `<testing>` section in the prompt, Codex produced 15-43% fewer tests than Claude; adding one closed ~35% of that gap on large plans. A combined single-command `<verify>` matters too: per-file verification missed a mocked `globalThis.fetch` leaking between test files in one bun process.

Users may still choose delegation below the crossover for cost arbitrage or usage conservation; the threshold is about orchestrator tokens, not preference.

## Skill body size is the multiplicative cost driver

```
total_token_cost ~ skill_body_lines x tokens_per_line x num_tool_calls
```

| Iteration | Architecture | Medium-plan delegate tokens | Change |
|-----------|-------------|----------------------|--------|
| 3 | Per-unit loop, all content in SKILL.md body (776 lines) | 58k | Baseline |
| 4 | Added optimizations to body (~810 lines) | 79k | +38% |
| 5 | Extracted to reference file, batched model (514 lines) | 61k | -23% from iter 4 |
| 6 | Added `<testing>` to prompt | 54k | -7%, better tests |

Iteration 4 is the lesson: the added optimizations were structurally sound and cut tool calls, yet the run cost 38% more, because every body line is paid on every tool call for the rest of the session. Reducing tool calls helps linearly; reducing body size helps multiplicatively.

**Rule:** content over ~50 lines that only a minority of invocations need belongs in a reference file loaded on that path, not in the body. Measure a proposed body addition against its per-call cost, not just the calls it saves.

## Verification belongs inside the delegation, not after it

Having the orchestrator re-run the delegate's tests doubled verification cost and added a "completed but verify failed" classification branch. Moving "run tests, fix failures, do not report completed unless tests pass" into the prompt removed that round-trip; the safety net is the delegate's self-report schema, a consecutive-failure circuit breaker that falls back to direct execution, and one full-suite run before shipping.

## Related

- [Codex delegation requirements](../../brainstorms/2026-03-31-codex-delegation-requirements.md)
- [Codex delegation implementation plan](../../plans/2026-03-31-001-feat-codex-delegation-plan.md)
- [Pass paths not content to subagents](../skill-design/pass-paths-not-content-to-subagents.md)
- [Agent-friendly CLI principles](../agent-friendly-cli-principles.md)
- `skills/ce-work/references/cross-model-execution.md`
