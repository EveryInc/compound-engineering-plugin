---
title: "Measure a harness workaround against its exit condition"
date: 2026-07-28
last_updated: 2026-08-20
category: skill-design
module: skills
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "A harness default suppresses a capability a skill depends on"
  - "Evaluating whether a defensive skill workaround is still needed after a harness upgrade"
  - "Removing shared dispatch machinery without losing workflow-specific correctness rules"
tags:
  - subagent-dispatch
  - harness-defaults
  - workaround-lifecycle
  - skill-evaluation
  - independence
---

# Measure a harness workaround against its exit condition

## Context

The shared `context.mjs` mechanism was intentional. [PR #1274](https://github.com/EveryInc/compound-engineering-plugin/pull/1274) reproduced a Claude Code system-prompt gate under which stock `ce-plan` made no `Agent` calls; delivering a conditional authorization as current-turn tool output restored three to five calls. Fifteen dispatching skills therefore carried the same script and Setup fence.

The workaround also had a deletion condition: when direct skill invocation satisfies the practical Agent gate, delete the mechanism everywhere rather than preserving or rewording it. A one-skill prose-only removal in [#1311](https://github.com/EveryInc/compound-engineering-plugin/pull/1311) did not prove that condition and was reverted in [#1313](https://github.com/EveryInc/compound-engineering-plugin/pull/1313).

Fresh tests on Claude Code 2.1.238 now engage the gate directly. Nine top-level skill invocations produced nine real `Agent` calls, including five controls with no authorization text. A full `ce-plan` run without Setup also resolved active model configuration at its authoring boundary. The changelog does not identify a specific gate fix, so the evidence supports a scoped claim: the workaround is unnecessary on the tested current path, not a claim about which release changed it. Superpowers v6.3.0, whose [`dispatching-parallel-agents`](https://github.com/obra/superpowers/blob/v6.3.0/skills/dispatching-parallel-agents/SKILL.md) skill directs subagent dispatch without an equivalent context hook, is corroborating design evidence rather than the proof.

## Guidance

Treat a harness workaround as a temporary compatibility layer:

1. Reproduce the blocked capability on the real host and record a falsifiable exit condition.
2. Before removal, rerun the original control without the workaround and count tool calls or receipts, not the model's narration.
3. Inventory every payload sharing the workaround's transport. Delete obsolete or derivable data, and move only still-valid rules to the boundary that consumes them.
4. Remove a shared transport atomically. Do not replace it with a smaller universal hook unless a universal consumer still exists.

For [issue #1481](https://github.com/EveryInc/compound-engineering-plugin/issues/1481), that inventory resolves as follows:

| Former payload | Owner after removal |
|---|---|
| Agent authorization | None; current direct invocations dispatch without it. |
| Working directory, branch, and HEAD | The step that needs repository state derives it there. No runtime consumer read the emitted block. |
| Active model and engine config | Each consumer resolves config where it chooses a route. `ce-plan`, for example, resolves `plan_model` in [`reasoning-elevation.md`](../../../skills/ce-plan/references/reasoning-elevation.md). |
| Correctable launch errors, capacity backpressure, and fallback | The dispatch boundary states its own safe direction. See [`ce-code-review`](../../../skills/ce-code-review/references/dispatch-reviewers.md) and [`ce-work`](../../../skills/ce-work/references/execution-strategy.md). |
| Independence accounting | The confidence or measurement gate. [`ce-doc-review`](../../../skills/ce-doc-review/references/synthesis-and-presentation.md) and `ce-code-review` exclude parent-context passes from independent corroboration; `ce-retune` stops when its proposer and defender cannot run separately. |
| Harness attribution and the autonomy precaution | No executable skill mechanism without a newly reproduced harness failure. |

The dispatch rule is local because its consequence is local. A rejected call that never launched due to its arguments can be corrected once. Capacity-limited work stays queued. Any other failure takes that workflow's declared inline, sequential, failed-pass, or blocker direction. Work performed in the parent context may still be useful, but it never earns independent-corroboration credit.

The #1481 implementation removes all 15 `context.mjs` copies and Setup fences together. It also removes the historical script-parity and config-reader tests, and adds a corpus guard against restoring the obsolete mechanism. Consumer-side config gates remain.

## Why This Matters

A successful workaround eventually makes itself look unnecessary. Removing it because the protected failure is invisible repeats the original bug; keeping it after its exit condition is met leaves prompt cost, executable duplication, and a trust-boundary override in every skill.

The deciding evidence is therefore symmetrical: reproduce the hazard before adding the workaround, and reproduce correct behavior without it before deleting it. Then preserve semantic invariants at their owning layer instead of preserving the delivery mechanism that once carried them.

## When to Apply

Use this pattern when a host release, model change, or tool-surface change may have eliminated the specific behavior a compatibility layer counters. Another plugin's design and a silent changelog can motivate the test, but neither substitutes for it. Keep conclusions scoped to the tested host and path, and retest other paths only where their behavior or correctness differs.

## Related

- [`strong-models-mask-defensive-skill-fixes.md`](strong-models-mask-defensive-skill-fixes.md) — why a green run is insufficient unless it engages the protected failure mode.
- [`dispatch-script-failure-degrade-outcome-not-boundary.md`](dispatch-script-failure-degrade-outcome-not-boundary.md) — owner-local dispatch failure semantics.
- [PR #1274](https://github.com/EveryInc/compound-engineering-plugin/pull/1274) — original measurement, workaround, and deletion trigger.
