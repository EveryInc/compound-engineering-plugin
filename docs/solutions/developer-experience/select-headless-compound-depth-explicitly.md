---
title: Select headless compound depth explicitly
date: 2026-07-15
category: developer-experience
module: ce-compound
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - A workflow invokes ce-compound without a human available for prompts
  - A routine closure needs bounded latency and token use
tags: [ce-compound, headless, lightweight, automation, skill-routing]
---

# Select headless compound depth explicitly

## Context

`ce-compound` already had Full and Lightweight workflows, but its non-interactive `mode:headless` route always forced Full. Automation callers that needed a bounded single-pass closure therefore had to choose between skipping compounding or paying for parallel research and semantic review on every task.

## Guidance

Keep `mode:headless` as the non-interactive switch and make depth a separate, explicit selector:

```text
mode:headless depth:lightweight  # single pass, no questions, no subagents
mode:headless depth:full         # complete workflow with session-history probe
mode:headless                    # backward-compatible alias for Full
```

Treat depth tokens as a strict headless-only contract. Reject unknown values, conflicting values, and depth tokens without headless intent instead of silently guessing. Keep depth-specific side effects aligned with the underlying workflow: Lightweight reports discoverability gaps as a tip, while headless Full uses its structured `gap noted, not applied` status. Neither headless depth edits instruction files.

The runtime contract and terminal report shapes live in `skills/ce-compound/SKILL.md`; regression coverage lives in `tests/skills/ce-compound-headless-depth.test.ts`.

## Why This Matters

Mode and depth answer different questions: mode controls whether a human can be interrupted, while depth controls how much research and validation the closure performs. Keeping them independent lets orchestrators choose a predictable cost envelope without changing interactive defaults or breaking existing headless callers.

Strict validation also prevents a misspelled automation flag from quietly running the wrong workflow.

## When to Apply

- Use headless Lightweight for routine, already-verified work where a deterministic claims check is sufficient.
- Use headless Full when overlap detection, cross-referencing, session-history research, and semantic grounding justify the additional work.
- Keep plain `mode:headless` Full unless a deliberate compatibility break is approved.

## Examples

An autonomous task closer can invoke:

```text
ce-compound mode:headless depth:lightweight "document the verified selector fix"
```

The run writes one solution document, performs the mechanical claims check, launches no subagents, asks no questions, and ends with the `Documentation complete` terminal signal.

## Related

- EveryInc/compound-engineering-plugin#1143 (pending upstream review)
