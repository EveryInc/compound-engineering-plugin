---
title: "Collapsing `slfg` into `lfg` and making autopilot explicit"
category: skill-design
date: 2026-03-22
severity: medium
component: plugins/compound-engineering/skills
tags:
  - lfg
  - slfg
  - autopilot-mode
  - orchestration
  - ce-brainstorm
  - ce-plan
  - skill-chaining
  - autonomous-workflow
---

# Collapsing `slfg` into `lfg` and Making Autopilot Explicit

## Problem

The original `lfg` / `slfg` split created two orchestration problems:

1. autopilot was described in caller prose, so downstream skills had to guess when they were in an automated run
2. `slfg` carried a second top-level workflow contract even though the real distinction was only whether implementation used swarm/agent-team behavior

As `lfg` evolved into a resume-anywhere orchestrator, that split stopped making sense. The durable pattern is not "two top-level workflows with slightly different chaining." The durable pattern is:

- one top-level orchestrator: `lfg`
- one explicit autopilot contract: marker + manifest
- one implementation-mode distinction inside `lfg`: `standard | swarm`

## Investigation

### What broke down in the old model

- `ce:brainstorm`, `ce:plan`, and other workflow skills originally inferred autopilot from wording like "called from `lfg` / `slfg`"
- that made the pipeline brittle: handoff menus, post-generation prompts, and branch questions were skipped inconsistently
- resuming work from a later stage was awkward because the orchestrator had no shared run state
- the `slfg` branch of the model encouraged people to attach special behavior to the wrapper itself instead of to the underlying execution context

The old split also obscured the real decision boundary: swarm is an implementation coordination choice, not a separate end-to-end workflow identity.

## Solution

The current pattern is:

1. `lfg` is the only top-level autopilot entrypoint
2. `lfg` creates or backfills a run-scoped manifest under `.context/compound-engineering/autopilot/<run-id>/`
3. `lfg` passes an explicit marker downstream:
   - `[ce-autopilot manifest=.../session.json] :: <normal input>`
4. downstream skills detect autopilot from that marker + manifest, not from caller wording
5. swarm lives behind `lfg` as `implementation_mode: standard | swarm`
6. `slfg` is only a deprecated compatibility path; it should not own separate orchestration rules

This lets `lfg` do two things the old model could not do well:

- resume from the first unmet workflow gate instead of assuming every run starts at ideation
- choose behavior from actual execution context (manifest state, implementation mode, current gate) rather than from the name of the top-level command

## Key Design Decisions

### One orchestrator, many modes

The durable abstraction is not "sequential workflow vs swarm workflow." It is:

- one orchestrator
- one shared run contract
- multiple execution choices inside that orchestrator

That keeps workflow semantics stable while allowing implementation behavior to vary.

### Explicit runtime beats prose inference

The autopilot marker + manifest pattern is more work than prose like "when called from `lfg`," but it is much safer. It prevents stale caller assumptions, gives skills a stable contract to read, and creates a place to accumulate run artifacts like decision logs.

### Compatibility wrappers should be thin

Once a wrapper is deprecated, it should stop accumulating behavior. If a compatibility command remains, it should route into the canonical command immediately rather than carrying a second copy of orchestration policy.

## Prevention

- When a workflow is split only by execution style, prefer one canonical orchestrator plus an internal mode switch over two top-level commands
- When downstream behavior depends on automation context, add an explicit runtime contract instead of inferring from caller wording
- Keep deprecated wrappers thin; do not let them become alternate policy surfaces
- Test the orchestration contract directly with contract tests, not only by reviewing the individual skill text

## Related Files

- `plugins/compound-engineering/skills/lfg/SKILL.md`
- `plugins/compound-engineering/skills/slfg/SKILL.md`
- `plugins/compound-engineering/AGENTS.md`
- `tests/autopilot-skill-contract.test.ts`
