---
title: "Cross-harness/cross-model skills drive agent tool calls, not slash commands — describe the capability, verify it live"
category: skill-design
date: 2026-07-11
module: skills/ce-babysit-pr
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "Authoring a skill, once, for multiple agent harnesses and models where the skill needs the agent to invoke a capability (schedule/loop, ask the user, invoke a sub-skill, run background work, drive a browser)"
  - "Deciding whether to name a specific tool/command in skill prose or describe the capability"
  - "About to assume a particular tool or slash command exists or behaves a certain way on Codex/Grok/Cursor/Claude Code"
  - "A skill's capability works on the harness/model you authored it in but fails on another"
  - "A skill can invoke a slash-command-like affordance interactively but not from within its own execution"
tags:
  - cross-harness
  - cross-model
  - capability-over-tool
  - tool-vs-slash-command
  - empirical-verification
  - portable-skills
  - orchestration
  - ce-babysit-pr
related_components:
  - development_workflow
  - tooling
---

## Context

A skill authored once for many harnesses (Claude Code, Codex, Grok, Cursor, …) frequently needs the *agent* to invoke a harness capability — schedule a re-invocation, ask the user a blocking question, invoke another skill, run a background process, drive a browser. The tempting design is to hardcode the mechanism per harness: "on Codex call X, on Grok call Y." That path is brittle in two directions at once — **cross-harness** (tool names and availability differ) and **cross-model** (even on one harness, models differ in what they'll reach for and how a tool behaves). It also silently confuses two different things: what a *skill* can drive versus what a *user* can do.

This crystallized while designing `ce-babysit-pr`'s self-sustaining loop, where a plan full of per-harness scheduler assumptions turned out to be partly wrong once tested — but the lesson is general to any capability a skill needs invoked.

## Guidance

**1. The reliable unit a skill can drive is an agent *tool call*, not a user affordance.** Skill prose steers the agent; the agent invokes *tools*. It cannot press keys or type a slash command, so a user-typed command (e.g. Cursor's `/loop`) is **not skill-invocable** — verified live: the agent reported `/loop` "only loads instructions into context." The exception is a slash command the harness *also* exposes as a tool (Claude Code's `Skill` tool can invoke `/loop`, so that one counts). Design for tool calls; treat any "have the skill run /command" step as a smell to verify.

**2. The tool surface varies by harness *and* model, and agents reach for the *simplest sufficient* tool, not the fanciest.** Given a capability need with the mechanism unspecified, fresh agents on all four harnesses built a plain background shell loop — **none reached for a first-class scheduler tool**, even Grok, whose `scheduler_create` (durable, agent-callable) was right there; it explicitly skipped it as overkill. So designing around a specific "correct" tool is doubly wrong: it may not exist on another harness, and even where it does, the model won't necessarily pick it.

**3. Therefore: name the known tool as a short-circuit, but describe the *capability* as the portable fallback.** For a recognized harness, state the specific agent tool for an instant, unambiguous pick. Underneath it, describe what the tool must *do* ("a way to run a background process and be woken when it emits a line, without ending your turn"; "the platform's blocking-question capability"), so an agent whose tool is absent, renamed, or newer can still satisfy the need — and degrade explicitly when nothing fits. Both, not either: the named tool is speed, the capability description is robustness.

**4. Verify per-harness/per-model tool behavior *empirically*, with live agents — not from your authoring runtime.** Assumptions baked from one runtime ship wrong. Two live checks (fresh agents per harness, dispatched via orchestration) corrected real errors before they landed: Codex's CLI exposes **no** scheduler tool and a detached `nohup` is *reaped* the instant the tool call ends (only a runtime-owned handle survives); Cursor's `/loop` is not skill-invocable; Grok's `scheduler_create` is durable and agent-callable but goes unused. This operationalizes the "portable agent skill authoring" decentering principle: when a design rests on per-harness/per-model tool behavior, prove it with agents on those targets.

## Why This Matters

The failure mode is expensive because it is invisible in-repo: confidently-wrong per-harness prose (a background process that silently dies, a slash command the skill can't trigger, a tool that isn't there) passes every unit test and static check — it only fails at *runtime*, on the harness/model you didn't author in. No amount of `bun test` catches it. Describing capabilities plus verifying with live agents is the only guard, and it applies to every capability a portable skill invokes, not just scheduling.

It also collapses complexity. Reframing `ce-babysit-pr` from "detect the harness → call its scheduler → guard a bundled driver script against nesting" to "describe the watch intent, let the agent build the loop with whatever it has" deleted a driver script, a tool-tier matrix, and a sentinel guard — because it stopped fighting what agents already do well.

One boundary the same experiments surfaced: agents pick the *simplest* sufficient tool, which for a trivial task is a dumb shell command. When the per-invocation work is actually agent *reasoning* (invoke a sub-skill, judge feedback), the prose must say so, or the agent takes the shell shortcut that can't do the reasoning.

## When to Apply

- Any skill authored once for multiple harnesses/models that needs the agent to invoke a capability — scheduling/looping, blocking questions, sub-skill invocation, background work, browser or MCP tools.
- Whenever prose is about to say "call tool X" or "run /command" for a cross-harness action — first ask whether describing the capability works, keep the named tool only as a short-circuit, and verify X on the target harness+model.
- Not needed for a single-harness skill, or for a capability already proven on the target runtime.

## Examples

**Slash command vs tool (the sharp distinction):** "have the skill run `/loop`" is not portable — a skill can't type it, and on Cursor it isn't agent-invocable at all. "Use whatever agent tool re-invokes work on a cadence (Claude Code: `ScheduleWakeup` / the `Skill`-tool-invoked `/loop`; Grok: `scheduler_create`; else a background process the agent runs)" is portable, because it targets tool calls and names tools only as examples.

**Capability over tool (asking the user):** prose that says `AskUserQuestion` breaks off-Claude. `ce-babysit-pr` instead says "use the platform's blocking-question tool" and lists `AskUserQuestion` / `request_user_input` / `ask_question` / `ask_user` as examples with a chat fallback — one capability, many tools.

**Live verification (the reusable technique):** publish a controllable external artifact (an [ht-ml.app](https://ht-ml.app) page), dispatch a fresh agent per harness with intent-only instructions to watch it and react to a change, then change it and confirm each caught the change unattended with an unguessable value. Proof beats assumption for anything that varies by harness or model — and it is how "Codex `nohup` is reaped" and "Cursor `/loop` isn't skill-invocable" were caught before shipping.

## Related

- [Watch-loop skills need a blocked-external terminal state for fork-PR CI approval gates](./watch-loops-need-a-blocked-external-terminal-state.md) — a sibling `ce-babysit-pr` learning; the motivating example (its self-sustaining loop) is where this general principle surfaced.
- [Bundled script path resolution across harnesses](./bundled-script-path-resolution-across-harnesses.md), [`arguments` token is Claude-only in skill bodies](./arguments-token-is-claude-only-in-skill-bodies.md) — sibling cross-harness-portability learnings; same "don't assume your runtime is universal" root.
- Design artifact: `docs/plans/2026-07-11-001-feat-babysit-self-initiating-loop-plan.md`.
