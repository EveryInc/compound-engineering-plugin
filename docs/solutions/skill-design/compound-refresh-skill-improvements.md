---
title: "ce:compound-refresh skill redesign for autonomous maintenance without live user context"
category: skill-design
date: 2026-03-13
module: plugins/compound-engineering/skills/ce-compound-refresh
component: SKILL.md
tags:
  - skill-design
  - compound-refresh
  - maintenance-workflow
  - drift-classification
  - subagent-architecture
  - platform-agnostic
severity: medium
description: "Redesign ce:compound-refresh to handle autonomous drift triage, in-skill replacement via subagents, and smart scoping without relying on live problem-solving context that ce:compound expects."
related:
  - docs/solutions/plugin-versioning-requirements.md
  - https://github.com/EveryInc/compound-engineering-plugin/pull/260
  - https://github.com/EveryInc/compound-engineering-plugin/issues/204
  - https://github.com/EveryInc/compound-engineering-plugin/issues/221
---

## Problem

The initial `ce:compound-refresh` skill had several design issues discovered during real-world testing:

1. Interactive questions never triggered the proper tool (AskUserQuestion) because the instruction used a weak "when available" qualifier
2. Auto-archive criteria contradicted a "always ask before archiving" rule in a later phase
3. Broad scope (9+ docs) asked the user to choose an area blindly without providing analysis
4. The Replace flow tried to hand off to `ce:compound`, which expects fresh problem-solving context the user doesn't have months later
5. Subagents used shell commands for file existence checks, triggering permission prompts

## Root Cause

Five independent design issues, each with a distinct root cause:

1. **Hardcoded tool name with escape hatch.** Saying "Use AskUserQuestion when available" gave the model permission to skip the tool and just output text. Also non-portable to Codex and other platforms.
2. **Contradictory rules across phases.** Phase 2 defined auto-archive criteria. Phase 3 said "always ask before archiving" with no exception. The model followed Phase 3.
3. **Question before evidence.** The skill prompted scope selection before gathering any information about which areas were most stale or interconnected.
4. **Unsatisfied precondition in cross-skill handoff.** `ce:compound` expects a recently solved problem with fresh context. A maintenance refresh has investigation evidence instead — equivalent data, different shape.
5. **No tool preference guidance for subagents.** Without explicit instruction, subagents defaulted to bash for file operations.

## Solution

### 1. Platform-agnostic interactive questions

Reference "the platform's interactive question tool" as the concept, with concrete examples:

```markdown
Ask questions **one at a time** — use the platform's interactive question tool
(e.g. `AskUserQuestion` in Claude Code, `request_user_input` in Codex) and
**stop to wait for the answer** before continuing.
```

The "stop to wait" language removes the escape hatch. The examples help each platform's model select the right tool.

### 2. Auto-archive exemption for unambiguous cases

Phase 3 now defers to Phase 2's auto-archive criteria:

```markdown
You are about to Archive a document **and** the evidence is not unambiguous
(see auto-archive criteria in Phase 2). When auto-archive criteria are met,
proceed without asking.
```

### 3. Smart triage for broad scope

When 9+ candidate docs are found, triage before asking:

1. **Inventory** — read frontmatter, group by module/component/category
2. **Impact clustering** — dense clusters of interconnected learnings + pattern docs are higher-impact than isolated docs
3. **Spot-check drift** — check whether primary referenced files still exist
4. **Recommend** — present the highest-impact cluster with rationale

Key insight: "code changed recently" is NOT a reliable staleness signal. Missing references in a high-impact cluster is the strongest signal.

### 4. Replacement subagents instead of ce:compound handoff

By the time a Replace is identified, Phase 1 investigation has already gathered the evidence that `ce:compound` would research:
- The old learning's claims
- What the current code actually does
- Where and why the drift occurred

A replacement subagent writes the successor directly using `ce:compound`'s document format (frontmatter, problem, root cause, solution, prevention). Run sequentially — one at a time — because each may read significant code.

When evidence is insufficient (e.g., entire subsystem replaced, new architecture too complex to understand from investigation alone), mark as stale and recommend `ce:compound` after the user's next encounter with that area.

### 5. Dedicated file tools over shell commands

Added to subagent strategy:

```markdown
Subagents should use dedicated file search and read tools for investigation —
not shell commands. This avoids unnecessary permission prompts and is more
reliable across platforms.
```

## Prevention

### Skill review checklist additions

These five patterns should be checked during any skill review:

1. **No hardcoded tool names** — All tool references use capability-first language with platform examples and a plain-text fallback
2. **No contradictory rules across phases** — Trace each action type through all phases; verify absolute language ("always," "never") is not contradicted elsewhere
3. **No blind user questions** — Every question presented to the user is informed by evidence the agent gathered first
4. **No unsatisfied cross-skill preconditions** — Every skill handoff verifies the target skill's preconditions are met by the calling context
5. **No shell commands for file operations in subagents** — Subagent instructions explicitly prefer dedicated tools over shell commands

### Key anti-patterns

| Anti-pattern | Better pattern |
|---|---|
| "Use the AskUserQuestion tool when available" | "Use the platform's interactive question tool (e.g. AskUserQuestion in Claude Code, request_user_input in Codex)" |
| Defining auto-archive conditions, then "always ask before archiving" | Single-source-of-truth: define the rule once, reference it elsewhere |
| "Which area should we review?" before any investigation | Triage first, recommend with evidence, let user confirm or redirect |
| "Create a successor learning through ce:compound" during a refresh | Replacement subagent writes directly using gathered evidence |
| No tool guidance for subagents | "Use dedicated file search and read tools, not shell commands" |

## Cross-References

- **PR #260**: The PR containing all these improvements
- **Issue #204**: Platform-agnostic tool references (AskUserQuestion dependency)
- **Issue #221**: Motivating issue for maintenance at scale
- **PR #242**: ce:audit (detection counterpart, closed)
- **PR #150**: Established subagent context-isolation pattern
