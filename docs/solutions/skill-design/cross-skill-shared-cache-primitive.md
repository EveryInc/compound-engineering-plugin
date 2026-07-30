---
title: Retiring a shared cache that does not beat lean fresh grounding
date: 2026-06-29
category: docs/solutions/skill-design/
module: repo-grounding-cache
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - A shared optimization has accumulated schema, invalidation, repair, and integration machinery
  - The cached value overlaps context the harness already supplies
  - You need to test whether a cross-skill cache still earns its complexity
tags: [cross-skill, cache, skill-design, evaluation, simplification, grounding]
---

# Retiring a shared cache that does not beat lean fresh grounding

## Context

Several repo-grounding skills once shared a question-agnostic project profile. The implementation evolved from strict git-keyed invalidation to a smaller existence-first, self-correcting shape/stack map. That redesign made cache reuse cheaper and more resilient, but it did not answer the more important question: whether the reusable profile added value over the project instructions already loaded by the harness plus task-specific current reads.

The profile also imposed real product cost: duplicated protocol, helper, and persona assets in every consumer; parity and helper tests; cache-path and ownership policy; schema/version migration; per-consumer integration wording; and a behavioral obligation to keep generic orientation separate from current task evidence.

## Decision

Remove the shared profile and route consumers directly to lean fresh grounding:

1. The main agent takes coarse orientation from the project's active instructions already in context.
2. A fresh subagent receives the relevant project/task summary, or reads the applicable current instruction source when operational rules materially affect its work.
3. Grounding starts with the task-specific evidence: the affected code, incumbent, call-sites, patterns, diff, or decision precedent.
4. A generic root, stack, or layout scan does not run by default. If the task genuinely cannot be scoped, use one targeted probe and keep its result local to the run.
5. Exact technology or version facts are read fresh only when they materially affect the decision.

## Evidence

A direct behavioral comparison used the same planning task with two arms: a compact reusable profile versus lean no-profile grounding. Both reached the same core implementation direction. The no-profile arm completed faster (156 seconds versus 177), used fewer shell invocation lines (22 versus 32), inspected fewer repo files (22 versus 26), and was slightly stronger on unresolved provider contract, recovery, and verification details. The profile produced no unique decision that changed the result.

An independent grader recommended removing the shared profile with 0.82 confidence. The important result was not that caching could never beat an exhaustive cold scan; it could. The result was that the right baseline is not exhaustive regeneration. It is focused fresh grounding that avoids generic discovery in the first place.

## General lesson

Pressure-test an optimization against the leanest correct alternative, not merely against the expensive behavior it originally replaced. A warm cache can look valuable when the miss path is over-scoped. Before adding durability, repair semantics, or more permissive hit logic, ask:

- Which downstream mistake does this artifact prevent?
- Is the same orientation already present in loaded context?
- Did the artifact change a decision, or only restate repo facts?
- Does its hit path beat focused fresh reads in time, tool calls, and output quality?
- Would narrowing the uncached workflow remove more cost than improving the cache?

When the cached value does not change decisions and focused fresh grounding is cheaper, remove the cache. The best cache hit is work the workflow no longer needs.

## Related

- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` — paired behavioral comparison method
- `docs/solutions/best-practices/cache-invalidation-input-set-completeness.md` — historical invalidation lesson that still applies to correctness-sensitive caches
- `docs/solutions/best-practices/predictable-tmp-cache-ownership-check.md` — historical shared-temp ownership lesson for artifacts read into agent context
