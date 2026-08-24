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

- **Compact result in-band:** the reviewer is collected; consume it.
- **Launch identifier or asynchronous receipt:** the reviewer is not collected. Use the host's blocking collection capability until the identifier yields the compact result.
- **No reliable blocking collector:** stop the launched work and take the workflow's failure or degraded path. Never wait for a notification, emit progress-only output, or synthesize a partial roster.

The same classification governs both reviewer batches and later validator batches. A foreground request is an intent, not evidence that a result arrived. A host-specific collector is acceptable only when its live contract shows that it accepts the launch identifier, blocks until terminal, and returns the compact result; a plausible tool name is not enough.

For an asynchronous primitive, the rule still needs three explicit clauses:

- **Collect the complete roster.** Blocking collection waits continue until every launched reviewer has yielded its compact result. These harness-managed waits are not the forbidden detached-delegate poll loop.
- **Release collected agents when the primitive retains slots.** A completed agent can keep occupying its concurrency slot until explicitly closed; release it before refilling and before the validator stage.
- **Guard the transition.** Synthesis cannot begin on launch receipts or a partial roster. If complete collection is unavailable, return the mode-appropriate failure instead.

On a harness that does not run same-message calls concurrently, this identical dispatch degrades to serial automatically — the correct floor, not a failure.

## Why This Matters

Codex review of PR #1214 caught a partial-roster gap and a slot-cleanup gap in its asynchronous primitive. The resulting host-name split still assumed Claude Code supplied an all-return barrier. Issue #1523 falsified that assumption: Claude `-p` recorded local reviewers as background work despite foreground requests, then hit its print-mode background ceiling without returning final review JSON.

The deeper lesson is that a harness label describes neither every version nor every execution mode. When a rule encodes concurrency or pool/refill semantics, the observable result is the contract: compact output means collected; a receipt means collection remains; no blocking collector means fail closed.

## When to Apply

Apply whenever a skill:

- dispatches multiple subagents with any concurrency, or bounded-pool/refill semantics; or
- carries a rule that forbids "background"/"polling"/"wakeups" near subagent dispatch.

Check three questions:

1. Does the rule treat a foreground request or host name as proof that calls **returned together**?
2. Does it free pool slots by **awaiting alone**? (Deadlocks without an explicit close.)
3. Does it distinguish **detached-delegate polling** (banned) from **harness subagent waits** (fine)? (Conflating them serializes for no benefit.)

## Examples

**Before (host-name classification):** assume Claude foreground calls form an all-results barrier and Codex calls return asynchronous ids. This fails when a Claude print-mode call returns a launch receipt despite background execution being requested off.

**After (observed-result classification):** consume compact results returned in-band; treat every launch receipt as uncollected work and use a verified blocking collector until the compact result arrives; fail closed if no such collector exists. Release collected agents when the primitive retains their slots. The anti-poll ban remains scoped to detached shell/CLI polling, not harness-managed blocking collection.

Primitive contrast:

| Observed dispatch result | State | Required transition |
|---|---|---|
| Compact reviewer or validator JSON in-band | Collected | Consume the result |
| Launch id or asynchronous receipt | Running, not collected | Use a verified blocking collector until terminal output is in hand |
| No reliable blocking collector | Cannot complete safely | Stop launched work and emit the workflow's failure or degraded result |
| Collected agent still holds a host slot | Complete but not released | Release it before refilling or entering a later subagent stage |

## See Also

- [Detached job lifecycle for delegated work](detached-job-lifecycle-for-delegated-work.md) — the source of the anti-poll ban this doc scopes. Its "no foreground sleep loops" rule targets *detached* bash/CLI delegate polling; this doc carves out that harness-managed subagent dispatch is not what the ban forbids.
- [Cross-harness cross-model tool invocation](cross-harness-cross-model-tool-invocation.md) — the portability root: name the known tool as a short-circuit, describe the capability as the portable fallback. This doc specializes that for async subagent primitives.
- [Portable agent skill authoring](portable-agent-skill-authoring.md) — the canonical cross-harness authoring guide; "least-capable primitive" is its decenter-your-authoring-runtime principle applied to async subagent dispatch.
- [Dispatch script failure: degrade the outcome, not the boundary](dispatch-script-failure-degrade-outcome-not-boundary.md) — sibling on the same reviewer-dispatch surface; adjacent to the partial-roster guard.
