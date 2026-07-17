---
title: "Cross-harness/cross-model skills drive agent tool calls, not slash commands — describe the capability, verify it by running it"
category: skill-design
date: 2026-07-11
last_updated: 2026-07-16
module: skills/ce-babysit-pr
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "Authoring a skill, once, for multiple agent harnesses and models where the skill needs the agent to invoke a capability (schedule/loop, ask the user, invoke a sub-skill, run background work, drive a browser)"
  - "Deciding whether to name a specific tool/command in skill prose or describe the capability"
  - "About to assume a particular tool or slash command exists or behaves a certain way on Codex/Grok/Cursor/Claude Code"
  - "About to accept an agent's own description of its tool schema as verification"
  - "A skill's capability works on the harness/model you authored it in but fails on another"
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
  - ce-babysit-pr
related_components:
  - development_workflow
  - tooling
---

## Context

A skill authored once for many harnesses (Claude Code, Codex, Grok, Cursor, …) frequently needs the *agent* to invoke a harness capability — schedule a re-invocation, ask the user a blocking question, invoke another skill, run a background process, drive a browser. The tempting design is to hardcode the mechanism per harness: "on Codex call X, on Grok call Y." That path is brittle in two directions at once — **cross-harness** (tool names and availability differ) and **cross-model** (even on one harness, models differ in what they'll reach for and how a tool behaves). It also silently confuses two different things: what a *skill* can drive versus what a *user* can do.

This crystallized while designing `ce-babysit-pr`'s self-sustaining loop, where a plan full of per-harness scheduler assumptions turned out to be partly wrong once tested — but the lesson is general to any capability a skill needs invoked.

## Guidance

**1. The reliable unit a skill can drive is an agent *tool call*, not a user affordance.** Skill prose steers the agent; the agent invokes *tools*. It cannot press keys or type a slash command, so a user-typed command (e.g. Cursor's `/loop`) is **not skill-invocable** — the agent *reported* that `/loop` "only loads instructions into context" (**reported, not executed** — see the provenance audit below; re-verify by execution before relying on it). The exception is a slash command the harness *also* exposes as a tool (Claude Code's `Skill` tool can invoke `/loop`, so that one counts). Design for tool calls; treat any "have the skill run /command" step as a smell to verify.

**2. The tool surface varies by harness *and* model, and agents reach for the *simplest sufficient* tool, not the fanciest.** Given a capability need with the mechanism unspecified, fresh agents on all four harnesses built a plain background shell loop — **none reached for a first-class scheduler tool**, even Grok, whose `scheduler_create` (durable, agent-callable) was right there; it explicitly skipped it as overkill. So designing around a specific "correct" tool is doubly wrong: it may not exist on another harness, and even where it does, the model won't necessarily pick it.

**3. Therefore: name the known tool as a short-circuit, but describe the *capability* as the portable fallback.** For a recognized harness, state the specific agent tool for an instant, unambiguous pick. Underneath it, describe what the tool must *do* ("a way to run a background process and be woken when it emits a line, without ending your turn"; "the platform's blocking-question capability"), so an agent whose tool is absent, renamed, or newer can still satisfy the need — and degrade explicitly when nothing fits. Both, not either: the named tool is speed, the capability description is robustness.

**4. Verify per-harness/per-model tool behavior by making the agent *run the call* — its description of its own tools is not evidence.** Assumptions baked from one runtime ship wrong, so dispatch fresh agents on the target harnesses. But "live agent" is not the bar, and this is the clause that bites: an agent asked to *describe* its own tool schema produces a confident wrong answer as readily as a right one. Only an executed call counts. Two live checks (fresh agents per harness, dispatched via orchestration) corrected real errors before they landed: Codex's CLI exposes **no** scheduler tool and a detached `nohup` is *reaped* the instant the tool call ends (only a runtime-owned handle survives); Cursor's `/loop` is not skill-invocable; Grok's `scheduler_create` is durable and agent-callable but goes unused. This operationalizes the "portable agent skill authoring" decentering principle: when a design rests on per-harness/per-model tool behavior, prove it with agents on those targets — by running it, not by asking about it.

**The measurement that forced this clause (2026-07-16).** Codex was asked to read its own `update_plan` schema and report the allowed step statuses and whether a step can be deleted. It answered: *"Allowed step statuses: `pending`, `in_progress`, `completed`. Skipped/cancelled status: No. Can a step be deleted: No."* It was then made to actually call `update_plan` — create three steps, then re-issue the plan with the middle one omitted. Result: *"Remove Step B: SUCCEEDED — resulting plan: Step A, Step C. Step B vanished."* `update_plan` takes the whole plan array, so omission deletes; the agent's self-report about its own tool was simply false. The same probe surfaced two facts nobody thought to ask for: Cursor has a native `cancelled` status, and Cursor deletion requires `merge: false` (a full-list replace) while rename-then-complete is a targeted `merge: true` — a mechanical-safety difference invisible to any schema read.

Note the asymmetry that makes this sharp: on the same question, a prior assumption held from training happened to be *right* while the live agent's self-report was *wrong*. Neither asking the model nor trusting your memory is reliable. Only execution is.

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

**Live verification (the reusable technique):** publish a controllable external artifact (an [ht-ml.app](https://ht-ml.app) page), dispatch a fresh agent per harness with intent-only instructions to watch it and react to a change, then change it and confirm each caught the change unattended with an unguessable value. Proof beats assumption for anything that varies by harness or model — and it is how "Codex `nohup` is reaped" was caught before shipping.

**The ask-vs-execute probe (the cheaper reusable technique).** When the question is "what can this tool do," do not ask — make the agent exercise it and report what happened, including errors. Adapt this shape:

> ACTUALLY CALL your `<plan/task tool>` for each step — do not describe or simulate in prose, make the real calls and report what happened. 1. Create a plan with 3 steps: 'Step A', 'Step B', 'Step C'. 2. Now attempt to REMOVE 'Step B' entirely. Actually try it. 3. Now attempt to RENAME 'Step C' and mark it completed. Actually try it. For each: did the call SUCCEED or ERROR, and what did the resulting plan actually contain?

The instruction to *actually call* is load-bearing — without it the agent answers from its schema, which is the failure this doc now warns about. Report what rendered, too: the rename-then-complete probe showed Codex printing `✓ Step C (skipped)`, a completion checkmark contradicting its own name, which a schema read would never reveal.

**Claimed vs actual (why the probe pays for itself).** From the 2026-07-16 `update_plan` measurement:

| Question | Codex's self-report | What running it showed |
|---|---|---|
| Allowed statuses | `pending`, `in_progress`, `completed` | Same — self-report correct here |
| Skipped/cancelled status? | No | Same — but Cursor *does* have native `cancelled`, unasked and unmentioned |
| Can a step be deleted? | **No** | **Yes** — omit it from the array; "Step B vanished" |

**Provenance audit of this doc's own claims (2026-07-16).** This doc predates the ask-vs-execute distinction, so its evidence is mixed. Treat accordingly, and re-verify by execution before relying on a *reported* row:

| Claim | Provenance |
|---|---|
| Codex `nohup` is reaped when the tool call ends | **Executed** — observed behavior |
| Fresh agents on all four harnesses built a plain shell loop; none reached for a scheduler | **Executed** — observed behavior |
| Grok's `scheduler_create` goes unused despite being available | **Executed** — observed behavior |
| Cursor's `/loop` "only loads instructions into context" | **Reported** — agent self-description; now suspect |
| Codex's CLI exposes no scheduler tool | **Indeterminate** — not recorded whether executed or reported |
| Grok's `scheduler_create` is durable and agent-callable | **Indeterminate** — likely from docs/self-report |

## Related

- [Watch-loop skills need a blocked-external terminal state for fork-PR CI approval gates](./watch-loops-need-a-blocked-external-terminal-state.md) — a sibling `ce-babysit-pr` learning; the motivating example (its self-sustaining loop) is where this general principle surfaced.
- [Bundled script path resolution across harnesses](./bundled-script-path-resolution-across-harnesses.md), [`arguments` token is Claude-only in skill bodies](./arguments-token-is-claude-only-in-skill-bodies.md) — sibling cross-harness-portability learnings; same "don't assume your runtime is universal" root.
- [Requested vs verified model identity](./requested-vs-verified-model-identity.md) — the **receipt** layer of the same epistemics, with the opposite prescription. Same root ("a self-report is not evidence"), but model identity *cannot* be settled by execution — there is no call that reveals the serving backend — so that doc prescribes an out-of-band receipt and accepts "unverified" as an honest terminal state. Tool capability *can* be settled by execution, cheaply, so "unverified" is never acceptable here: run the call. Do not fold the two together; the receipt-vs-execution split is the actionable content of each.
- Design artifact: `docs/plans/2026-07-11-001-feat-babysit-self-initiating-loop-plan.md`.
