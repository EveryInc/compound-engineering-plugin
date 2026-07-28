---
title: "Scope anti-poll discipline to detached CLI delegates, and write subagent-dispatch concurrency to the least-capable async primitive"
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

# Scope anti-poll discipline to detached CLI delegates, and write subagent-dispatch concurrency to the least-capable async primitive

## Context

This repository authors each skill once and converts it for Claude Code, Codex, Cursor, and Gemini. A skill's dispatch rules therefore run against whatever subagent primitive the host exposes, and those primitives are not interchangeable. Reworking `ce-code-review`'s reviewer dispatch (PR #1214, addressing issue #1192) surfaced two recurring traps in how subagent-concurrency rules get written — traps that a Claude-Code-only author cannot see locally because Claude Code's batch semantics silently paper over both.

The relevant history: the anti-poll discipline (`docs/solutions/skill-design/detached-job-lifecycle-for-delegated-work.md`) was written for the retired ce-work-beta failure mode — a *detached* bash/CLI job plus a foreground `sleep`/status-file poll loop that burned turns waiting on delegated work. PR #1159 over-applied that discipline: it read "no background / no polling" as a ban on *any* concurrency near subagent dispatch and serialized local reviewer dispatch strictly one-at-a-time. PR #1031 had earlier established bounded concurrency. PR #1214 reconciled the two and made the rule portable.

## Guidance

Two rules, both grounded in `skills/ce-code-review/references/dispatch-reviewers.md` (the "Bounded foreground dispatch" paragraph) and the execution spine at `skills/ce-code-review/SKILL.md:27` (step 4).

### 1. Scope the anti-poll ban to detached delegates, not harness-managed subagents

The "no background / no polling / no wakeups" discipline governs *detached* delegates — a background bash/CLI invocation (e.g. `codex exec` for the cross-model peer) that the orchestrator must poll with foreground `sleep`/status-file loops or scheduled "still waiting" turns. It does **not** govern harness-managed subagents (Claude Code `Agent`, Codex `spawn_agent`), which return on their own tool call with no poll loop.

Conflating the two is what made #1159 serialize local reviewer dispatch one-at-a-time, costing 45-70 minutes of wall-clock on large diffs for zero determinism or token benefit — reviewers are independent by construction (none is fed another's output), so batch composition and completion order cannot change any finding. `dispatch-reviewers.md` now draws the line explicitly: the detached cross-model peer "is the only detached work and overlaps with this batch; it does not require serializing harness-managed subagents, which return on their own tool call with no poll loop."

### 2. Write subagent-concurrency rules to the least-capable async primitive

A rule shaped for Claude Code assumes N `Agent` calls in one message return **together** in a single blocking wait — the harness collects all returns for you. That assumption breaks on Codex, whose `spawn_agent` is asynchronous:

- A single `wait_agent` returns the **first** finisher, not an all-results barrier.
- A completed agent keeps **occupying its concurrency slot** until `close_agent` is called; awaiting does not free the slot.

So a portable rule needs three explicit clauses that Claude Code's implicit batch never forced you to write:

- **(a) Collect every spawned agent before synthesis.** Wait repeatedly until all spawned agent ids have returned. Never proceed to synthesis on a partial roster because only the first was awaited. These repeated collection waits are how an async batch is gathered — they are *not* the forbidden detached-delegate poll loop.
- **(b) Close each completed async agent before refilling its freed slot.** Awaiting alone does not free the slot; once the roster exceeds the cap, refilling without closing hits capacity backpressure forever.
- **(c) A partial-roster guard.** Stage 5 (synthesis) must never run until the whole batch is collected.

On a harness that does not run same-message calls concurrently, this identical dispatch degrades to serial automatically — the correct floor, not a failure.

## Why This Matters

Both defects were caught by Codex's own review of PR #1214 — a P1 for the partial-roster gap (synthesizing on the first finisher) and a P2 for the slot-cleanup gap (refill deadlock without `close_agent`). A Claude-Code-only author would not have hit either locally, because Claude Code's single blocking wait hides both.

The deeper lesson: the determinism and token wins of a change can be entirely real while the cross-harness dispatch rule is silently broken on a harness you didn't test against. Cross-model skills fail on the primitive you didn't test. When a rule encodes concurrency or pool/refill semantics, "it works here" is evidence about one primitive, not the contract.

## When to Apply

Apply whenever a skill:

- dispatches multiple subagents with any concurrency, or bounded-pool/refill semantics; or
- carries a rule that forbids "background"/"polling"/"wakeups" near subagent dispatch.

Check three questions:

1. Does the rule assume same-message calls **return together**? (Breaks on async `spawn_agent`.)
2. Does it free pool slots by **awaiting alone**? (Deadlocks without an explicit close.)
3. Does it distinguish **detached-delegate polling** (banned) from **harness subagent waits** (fine)? (Conflating them serializes for no benefit.)

## Examples

**Before (Claude-only, PR #1159 shape):** dispatch as a foreground concurrent batch; "let that single blocking wait return all their compact JSON together ... no polling, status calls, or per-reviewer waits are needed." Correct on Claude Code; on Codex it awaits one agent and synthesizes on a partial roster, and never frees slots.

**After (portable, PR #1214):** the same Claude-Code batch clause, plus an explicit async-subagent clause — spawn the whole batch, then collect every spawned reviewer before synthesis (waiting repeatedly until all ids return), close each async reviewer after collecting its result and before refilling its freed slot, and never let synthesis run on a partial roster. The anti-poll ban is re-pointed at *detached-delegate* polling: "What is banned is turning local review into a *detached* delegate the orchestrator must poll ... it does not require serializing harness-managed subagents."

Primitive contrast:

| Aspect | Claude Code `Agent` | Codex `spawn_agent` / `wait_agent` / `close_agent` |
|---|---|---|
| Batch of N in one message | All return together in one blocking wait | Each spawn returns an id; async |
| One wait call | Returns all results | Returns the **first** finisher only |
| Collecting the full roster | Implicit (harness batches) | Explicit: wait repeatedly until every id returned |
| Freeing a concurrency slot | Automatic on return | Requires explicit `close_agent`; await does not free it |
| Partial-roster risk | None (all-return barrier) | Real: synthesizing after the first wait |

## See Also

- [Detached job lifecycle for delegated work](detached-job-lifecycle-for-delegated-work.md) — the source of the anti-poll ban this doc scopes. Its "no foreground sleep loops" rule targets *detached* bash/CLI delegate polling; this doc carves out that harness-managed subagent dispatch is not what the ban forbids.
- [Cross-harness cross-model tool invocation](cross-harness-cross-model-tool-invocation.md) — the portability root: name the known tool as a short-circuit, describe the capability as the portable fallback. This doc specializes that for async subagent primitives.
- [Portable agent skill authoring](portable-agent-skill-authoring.md) — the canonical cross-harness authoring guide; "least-capable primitive" is its decenter-your-authoring-runtime principle applied to async subagent dispatch.
- [Dispatch script failure: degrade the outcome, not the boundary](dispatch-script-failure-degrade-outcome-not-boundary.md) — sibling on the same reviewer-dispatch surface; adjacent to the partial-roster guard.
