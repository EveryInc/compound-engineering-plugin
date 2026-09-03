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

The shared `context.mjs` mechanism (since removed; `tests/skill-conventions.test.ts` guards against restoring it) was a measured workaround. [PR #1274](https://github.com/EveryInc/compound-engineering-plugin/pull/1274) reproduced a Claude Code system-prompt gate under which stock `ce-plan` made no `Agent` calls; delivering a conditional authorization as current-turn tool output restored three to five calls, so fifteen dispatching skills carried the same script and Setup fence.

It shipped with a deletion condition: when direct skill invocation satisfies the practical Agent gate, delete the mechanism everywhere rather than rewording it. [#1311](https://github.com/EveryInc/compound-engineering-plugin/pull/1311) removed it from one skill's prose without proving that condition and was reverted in [#1313](https://github.com/EveryInc/compound-engineering-plugin/pull/1313) — a one-skill prose-only removal is neither a measurement nor an atomic removal.

Fresh tests on Claude Code 2.1.238 then engaged the gate directly: nine top-level skill invocations produced nine real `Agent` calls, including five controls with no authorization text, and a full `ce-plan` run without Setup resolved active model configuration at its authoring boundary. The changelog names no gate fix, so the claim is scoped: the workaround is unnecessary on the tested current path, not attributed to a release. Another plugin dispatching subagents without an equivalent hook is corroborating design evidence, not the proof. [Issue #1481](https://github.com/EveryInc/compound-engineering-plugin/issues/1481) removed all fifteen copies and fences together.

## Guidance

Treat a harness workaround as a temporary compatibility layer:

1. Reproduce the blocked capability on the real host and record a falsifiable exit condition.
2. Before removal, rerun the original control without the workaround and count tool calls or receipts, not the model's narration.
3. Inventory every payload sharing the workaround's transport. Delete obsolete or derivable data, and move only still-valid rules to the boundary that consumes them — each dispatch boundary now states its own safe direction, and independence accounting lives in the confidence or measurement gate that consumes it.
4. Remove a shared transport atomically. Do not replace it with a smaller universal hook unless a universal consumer still exists.

The dispatch rule is local because its consequence is local: a call rejected for its arguments can be corrected once, capacity-limited work stays queued, any other failure takes that workflow's declared safe direction, and work performed in the parent context never earns independent-corroboration credit.

## Why This Matters

A successful workaround eventually makes itself look unnecessary. Removing it because the protected failure is invisible repeats the original bug; keeping it after its exit condition is met leaves prompt cost, executable duplication, and a trust-boundary override in every skill. The deciding evidence is symmetrical: reproduce the hazard before adding the workaround, and reproduce correct behavior without it before deleting it. Keep conclusions scoped to the tested host and path.

## Related

- [`strong-models-mask-defensive-skill-fixes.md`](strong-models-mask-defensive-skill-fixes.md) — why a green run is insufficient unless it engages the protected failure mode.
- [`dispatch-script-failure-degrade-outcome-not-boundary.md`](dispatch-script-failure-degrade-outcome-not-boundary.md) — owner-local dispatch failure semantics.
