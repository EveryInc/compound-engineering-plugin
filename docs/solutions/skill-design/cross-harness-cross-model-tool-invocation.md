---
title: "Cross-harness/cross-model skills drive agent tool calls, not slash commands — describe the capability, verify it by running it"
category: skill-design
date: 2026-07-11
last_updated: 2026-08-23
module: skills/ce-babysit-pr
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "Authoring a skill, once, for multiple agent harnesses and models where the skill needs the agent to invoke a capability (schedule/loop, ask the user, invoke a sub-skill, run background work, drive a browser)"
  - "Deciding whether to name a specific tool/command in skill prose or describe the capability"
  - "About to accept an agent's own description of its tool schema as verification"
  - "A skill can invoke a slash-command-like affordance interactively but not from within its own execution"
tags:
  - cross-harness
  - cross-model
  - capability-over-tool
  - tool-vs-slash-command
  - empirical-verification
  - ask-vs-execute
  - portable-skills
  - orchestration
related_components:
  - development_workflow
  - tooling
---

## Guidance

**1. The unit a skill can drive is an agent tool call, not a user affordance.** An agent cannot press keys or type a slash command, so a user-typed command (Cursor's `/loop`) is not skill-invocable unless the harness also exposes it as a tool (Claude Code's `Skill` tool can invoke `/loop`). Treat any "have the skill run /command" step as a smell to verify.

**2. The tool surface varies by harness and model, and agents reach for the simplest sufficient tool.** Given a capability need with the mechanism unspecified, fresh agents on all four harnesses built a plain background shell loop — none reached for a first-class scheduler, including Grok, whose agent-callable `scheduler_create` was available and explicitly skipped as overkill. Designing around one "correct" tool is wrong twice: it may not exist elsewhere, and where it does the model may not pick it. Corollary: when the per-invocation work is agent reasoning (invoke a sub-skill, judge feedback), the prose must say so, or the agent takes the shell shortcut that cannot reason.

**3. Name the known tool as a short-circuit; describe the capability as the portable fallback.** Both, not either — the named tool is speed, the capability description ("a way to run a background process and be woken when it emits a line, without ending your turn"; "the host's blocking-question tool already in the current tool list") is robustness, and degrade explicitly when nothing fits. Do not keep a closed catalog of host-specific names: the next unnamed host repeats the Grok probe-card failure (#1522). Option caps of particular tools may still be named as non-derivable facts.

**4. Verify tool behavior by making the agent run the call — its description of its own tools is not evidence.** An agent asked to describe its tool schema produces a confident wrong answer as readily as a right one. Only an executed call counts, **except for user-facing tools**: a blocking question card, permission prompt, or anything that renders to the human is proven by presence in the current tool list (match by capability), because executing it "to see if it errors" *is* the user-visible failure (#1522). Keep execute-to-prove for non-user-facing tools (plan updates, schedulers, background watches).

## The measurement that forced clause 4 (2026-07-16)

Codex was asked to read its own `update_plan` schema and report allowed step statuses and whether a step can be deleted. It answered: statuses `pending`, `in_progress`, `completed`; no skipped/cancelled status; a step cannot be deleted. Made to actually call `update_plan` — create three steps, then re-issue the plan with the middle one omitted — it reported: "Remove Step B: SUCCEEDED — resulting plan: Step A, Step C." `update_plan` takes the whole plan array, so omission deletes. The same probe surfaced facts nobody asked for: Cursor has a native `cancelled` status, and Cursor deletion requires `merge: false` (a full-list replace) while rename-then-complete is a targeted `merge: true`. Rendering matters too: Codex printed `✓ Step C (skipped)` — a completion checkmark contradicting its own label.

| Question | Codex's self-report | What running it showed |
|---|---|---|
| Allowed statuses | `pending`, `in_progress`, `completed` | Same |
| Skipped/cancelled status? | No | Same — but Cursor *does* have native `cancelled` |
| Can a step be deleted? | **No** | **Yes** — omit it from the array |

The asymmetry: on the same question, a prior assumption held from training happened to be right while the live agent's self-report was wrong. Neither asking the model nor trusting memory is reliable. Only execution is.

**The ask-vs-execute probe shape.** "ACTUALLY CALL your `<plan/task tool>` for each step — do not describe or simulate in prose. 1. Create a plan with 3 steps. 2. Attempt to REMOVE 'Step B' entirely. 3. Attempt to RENAME 'Step C' and mark it completed. For each: did the call SUCCEED or ERROR, and what did the resulting plan actually contain, and what rendered?" The instruction to *actually call* is load-bearing — without it the agent answers from its schema.

**The live-verification technique for cross-harness watches.** Publish a controllable external artifact, dispatch a fresh agent per harness with intent-only instructions to watch it and react to a change, then change it to an unguessable value and confirm each caught it unattended. This is how "Codex `nohup` is reaped when the tool call ends" was caught before shipping.

## Provenance of this doc's own claims

This doc predates the ask-vs-execute distinction, so its evidence is mixed. Re-verify by execution before relying on a *reported* row.

| Claim | Provenance |
|---|---|
| Codex `nohup` is reaped when the tool call ends; only a runtime-owned handle survives | **Executed** |
| Fresh agents on all four harnesses built a plain shell loop; none reached for a scheduler | **Executed** |
| Grok's `scheduler_create` goes unused despite being available | **Executed** |
| Cursor's `/loop` "only loads instructions into context" | **Reported** — agent self-description; suspect |
| Codex's CLI exposes no scheduler tool | **Indeterminate** |
| Grok's `scheduler_create` is durable and agent-callable | **Indeterminate** — likely docs/self-report |

## When to Apply

Any skill authored once for multiple harnesses/models that needs the agent to invoke a capability. Not needed for a single-harness skill or a capability already proven on the target runtime. The failure is invisible in-repo: confidently-wrong per-harness prose passes every unit test and fails only at runtime on the harness you did not author in.

## Related

- [Watch-loop skills need a blocked-external terminal state](./watch-loops-need-a-blocked-external-terminal-state.md) — sibling `ce-babysit-pr` learning; the self-sustaining loop is where this principle surfaced.
- [Bundled script path resolution across harnesses](./bundled-script-path-resolution-across-harnesses.md), [`arguments` token is Claude-only in skill bodies](./arguments-token-is-claude-only-in-skill-bodies.md) — same "don't assume your runtime is universal" root.
- [Requested vs verified model identity](./requested-vs-verified-model-identity.md) — the receipt layer of the same epistemics, with the opposite prescription: model identity cannot be settled by execution, so it accepts "unverified" as a terminal state; tool capability can, cheaply, so "unverified" is never acceptable here.
- [Scope anti-poll discipline to detached CLI delegates](./anti-poll-scope-and-async-subagent-dispatch.md) — subagent-dispatch primitives differ per harness, so a portable concurrency rule is written to the least-capable primitive.
