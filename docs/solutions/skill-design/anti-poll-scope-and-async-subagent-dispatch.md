---
title: "Scope anti-poll discipline to detached CLI delegates, and collect subagents by observed return shape"
date: 2026-07-21
category: skill-design
module: skill-design
problem_type: design_pattern
component: tooling
severity: high
tags:
  - cross-model
  - subagent-dispatch
  - concurrency
  - skill-authoring
  - codex
  - claude-code
  - anti-poll
  - async
applies_when:
  - "Authoring or revising a cross-model skill that dispatches subagents (Claude Code Agent, Codex spawn_agent)"
  - "Writing anti-poll / no-background-task discipline that must not accidentally serialize harness-managed subagent dispatch"
  - "Specifying fan-out concurrency rules that must run identically on Claude Code and Codex"
  - "Reviewing a skill that dispatches multiple reviewers or workers in parallel"
---

# Scope anti-poll discipline to detached CLI delegates, and collect subagents by observed return shape

## Context

This repository authors each skill once and converts it for Claude Code, Codex, Cursor, and Gemini. A skill's dispatch rules therefore run against whatever subagent primitive the host exposes, and those primitives are not interchangeable. Reworking `ce-code-review`'s reviewer dispatch (PR #1214, addressing issue #1192) exposed the first portability gap: an asynchronous primitive needs explicit collection and slot cleanup. Issue #1523 exposed the inverse gap: even a call requested as foreground may return an asynchronous launch receipt in Claude print mode. Host identity and requested background mode are therefore not reliable dispatch semantics.

The relevant history: the anti-poll discipline (`docs/solutions/skill-design/detached-job-lifecycle-for-delegated-work.md`) was written for the retired ce-work-beta failure mode — a *detached* bash/CLI job plus a foreground `sleep`/status-file poll loop that burned turns waiting on delegated work. PR #1159 over-applied that discipline: it read "no background / no polling" as a ban on *any* concurrency near subagent dispatch and serialized local reviewer dispatch strictly one-at-a-time. PR #1031 had earlier established bounded concurrency. PR #1214 reconciled the two for the primitives then observed; issue #1523 supplied the missing print-mode evidence.

## Guidance

Two rules, both grounded in `skills/ce-code-review/references/dispatch-reviewers.md` (the "Bounded foreground dispatch" paragraph) and the execution spine at `skills/ce-code-review/SKILL.md:27` (step 4).

### 1. Scope the anti-poll ban to detached delegates, not harness-managed subagents

The "no background / no polling / no wakeups" discipline governs *detached* delegates — a background bash/CLI invocation (e.g. `codex exec` for the cross-model peer) that the orchestrator must poll with foreground `sleep`/status-file loops or scheduled "still waiting" turns. It does **not** govern harness-managed subagents (Claude Code `Agent`, Codex `spawn_agent`), which return on their own tool call with no poll loop.

Conflating the two is what made #1159 serialize local reviewer dispatch one-at-a-time, costing 45-70 minutes of wall-clock on large diffs for zero determinism or token benefit — reviewers are independent by construction (none is fed another's output), so batch composition and completion order cannot change any finding. `dispatch-reviewers.md` now draws the line explicitly: the detached cross-model peer "is the only detached work and overlaps with this batch; it does not require serializing harness-managed subagents, which return on their own tool call with no poll loop."

### 2. Collect by observed return shape

A portable rule classifies what dispatch actually returned:

- **Terminal outcome:** the launch is collected. Consume a valid compact result; classify a terminal tool error or malformed output under the workflow's failed/degraded rules.
- **Launch identifier or asynchronous receipt:** a launch receipt means the reviewer is uncollected. Use the host's blocking collection capability until the launch reaches a terminal outcome. That outcome may arrive as the call's own return, as a blocking wait's return, or as a host-delivered terminal message that names the launch and carries its final payload; a status or progress update is none of these.
- **No reliable blocking collector:** the host offers no in-turn way to reach a terminal outcome for the launch. Stop the launched work and take the workflow's failure or degraded path. Fail closed only after discharging lifecycle obligations for detached work already started. Never end the turn to wait, emit progress-only output, or synthesize a partial roster.

The same classification governs both reviewer batches and later validator batches, and both waits have an end (#1679, #1689): each subagent writes its result to a file in the run directory, the orchestrator repeats the host's blocking wait back to back until that file or a terminal outcome lands or an aggregate wall-clock limit passes, and a file missing at the limit is a failed reviewer or validator infrastructure failure rather than "still running". A blocking call that cannot be bounded is not a collector for that batch, and a host whose single wait is short reaches the limit by repeating it. A foreground request is an intent, not evidence that a result arrived. Judge a collector by its live contract, not its name: a wait counts only when it blocks until terminal, and a message counts only when it identifies the launch and carries the payload. Issue #1654 showed why the rule must be the condition rather than a tool shape: Codex delivers a subagent's final answer as a host message tagged with the launch's task name while `wait_agent` reports status, so a rule demanding one ID-addressed collector that returns the outcome failed closed on a host that could collect.

For an asynchronous primitive, the rule still needs three explicit clauses:

- **Collect the complete roster.** Native collection continues until every successful launch reaches a terminal outcome. These harness-managed waits are not the forbidden detached-delegate poll loop.
- **Release collected agents when the primitive retains slots.** A completed agent can keep occupying its concurrency slot until explicitly closed; release it before refilling and before the validator stage.
- **Guard the transition.** Synthesis cannot begin on launch receipts or a partial roster. If complete collection is unavailable, return the mode-appropriate failure instead.

On a harness that does not run same-message calls concurrently, this identical dispatch degrades to serial automatically — the correct floor, not a failure.

## Why This Matters

Codex review of PR #1214 caught a partial-roster gap and a slot-cleanup gap in its asynchronous primitive. The resulting host-name split still assumed Claude Code supplied an all-return barrier. Issue #1523 falsified that assumption: Claude `-p` recorded local reviewers as background work despite foreground requests, then hit its print-mode background ceiling without returning final review JSON.

The deeper lesson is that a harness label describes neither every version nor every execution mode. When a rule encodes concurrency or pool/refill semantics, the observable result is the contract: a terminal outcome means collected and ready for validation; a receipt means collection remains; no reliable collection path means fail closed.

## When to Apply

Apply whenever a skill:

- dispatches multiple subagents with any concurrency, or bounded-pool/refill semantics; or
- carries a rule that forbids "background"/"polling"/"wakeups" near subagent dispatch.

Check three questions:

1. Does the rule treat a foreground request or host name as proof that calls **returned together**?
2. Does it free pool slots by **awaiting alone**? (Deadlocks without an explicit close.)
3. Does it distinguish **detached-delegate polling** (banned) from **harness subagent waits** (fine)? (Conflating them serializes for no benefit.)

## See Also

- [Detached job lifecycle for delegated work](detached-job-lifecycle-for-delegated-work.md) — the source of the anti-poll ban this doc scopes. Its "no foreground sleep loops" rule targets *detached* bash/CLI delegate polling; this doc carves out that harness-managed subagent dispatch is not what the ban forbids.
- [Cross-harness cross-model tool invocation](cross-harness-cross-model-tool-invocation.md) — the portability root: name the known tool as a short-circuit, describe the capability as the portable fallback. This doc specializes that for async subagent primitives.
- [Portable agent skill authoring](portable-agent-skill-authoring.md) — the canonical cross-harness authoring guide; "least-capable primitive" is its decenter-your-authoring-runtime principle applied to async subagent dispatch.
- [Dispatch script failure: degrade the outcome, not the boundary](dispatch-script-failure-degrade-outcome-not-boundary.md) — sibling on the same reviewer-dispatch surface; adjacent to the partial-roster guard.
