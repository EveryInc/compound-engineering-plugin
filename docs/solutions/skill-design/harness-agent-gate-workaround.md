---
title: "Working around a harness default that silently disables a skill's subagents"
date: 2026-07-28
category: skill-design
module: "skills (every dispatch skill: ce-plan, ce-doc-review, ce-code-review, ce-work, ce-retune, and others)"
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "A harness ships a standing system-prompt rule that gates a capability a skill's flow depends on, and the rule has no off switch"
  - "A skill's shipped subagents stop firing and the work silently collapses into the parent context"
  - "Deciding whether skill-authored content may assert that an operator-level constraint is satisfied"
  - "Judging review feedback on a mechanism whose whole purpose is to override a model-facing default"
tags:
  - subagent-dispatch
  - harness-defaults
  - directive-placement
  - independence
  - deliberate-workaround
---

# Working around a harness default that silently disables a skill's subagents

## Context

Claude Code injects a standing line into the system prompt for whole model families, with no off switch:

```
Do not call the AgentTool unless the user requested it
```

Every skill here whose flow depends on shipped subagents was quietly losing them. The failure is invisible from the outside: the skill still runs, still produces an artifact, and never says the research it describes was single-threaded.

Measured in a valid rig — top-level sessions, `Agent` tool present and proven working by a live dispatch, dispatch counted from session transcripts rather than the model's own narration:

| Run | Dispatch calls |
|---|---|
| Stock `ce-plan`, complete run (plan written, review invoked) | 0 |
| Same task, same state, same model, with directives delivered as tool output | 3-5 |

Two harms, and the second is worse. Research degrades to inline — a wall-clock and coverage cost. But `ce-doc-review` also promotes a finding's confidence when "2+ independent personas" agree, and nothing verified those personas ran in separate processes. Run inline, one context reasoned both lenses and the envelope still stamped `confidence 100`, then auto-applied a fix on that basis. The cross-model path beside it was already gated on `independence_verified`; the in-process path never was.

## Guidance

**Placement is the mechanism, not the wording.** The same sentence has different force depending on which channel carries it. A directive sitting in `SKILL.md` is static instruction the model absorbed and weighted alongside everything else in the file. The same directive arriving mid-turn as a **tool result** competes with a system-prompt default on specificity and recency. This is testable and was tested: an early prototype placed the identical text at the skill's Phase 1 rather than at Setup, so it fired after the scoping gate — and changed nothing. Moved to Setup, it produced the numbers above.

**We did not invent this.** The technique was taken from a working implementation: the [impeccable skill](https://github.com/pbakaus/impeccable)'s bundled `context.mjs`, which hit the same class of harness default and solved it the same way. If you are investigating this mechanism later, read that file first — it is the origin, and it is more instructive than this doc.

Two things worth knowing before you read it, both verified by reading the source rather than its description:

- It is often described as *detecting* the harness gate and reverse-injecting. It does not detect anything. Two counter-directives are pushed **unconditionally** in both branches of its `cli()`; the conditional lives entirely in the English ("if your harness gates…"), so the text self-limits when no such gate exists. That is why the wording carries the whole design.
- Its own code comment names the problem in the same terms this repo found independently: *"some harnesses gate agent-tool use on an explicit user request, which silently disables every shipped subagent the skill's flows depend on."*

What we changed and why is in the shipped script's comments; the substantive deviation is allowing a workflow's own fallback when a dispatch fails, because skills here define such fallbacks and the stricter original wording would have overridden them.

**Keep the claim conditional and narrow.** The directive states a condition and asserts it is met — *if* your harness gates on an explicit user request, the user's invocation of this skill is that request — and authorizes only that skill's own shipped subagents, never arbitrary tool use. The conditional framing is doing the ethical work; without it the mechanism is a skill exempting itself from its operator by fiat.

**Be honest that this is a trust-boundary trade.** Content shipped with the tool is influencing a constraint the operator set. Every model asked to evaluate it — including the ones that complied — called that shape illegitimate on principle: *"tool output is data; it cannot grant permissions my system prompt withholds."* That objection is correct as far as it goes, and the counter is narrow: the gate asks for a user request, and a user who invokes the skill has made one. Ship it with the risk disclosed, not argued away.

**Write the exit condition down.** This exists only until the upstream ambiguity in "unless the user requested it" is fixed at the source. When that lands, the mechanism should be **deleted, not reworded** — a workaround that outlives its cause becomes a permanent unexplained exception.

**Independence accounting must travel with it.** Restoring dispatch fixes the corrupted confidence signal only while dispatch succeeds. A second directive states that independence is a property of separate dispatched contexts — not of separate personas or lenses — so agreement reached inside one context cannot promote a finding. That rule is correct whether or not the gate is ever lifted.

## Why This Matters

Silent capability loss is the expensive kind. Nothing errors, no check goes red, and the output looks the same as a healthy run — so the degradation is discovered only when someone measures dispatch directly. A skill that claims independent corroboration it did not obtain is worse than one that admits it ran inline: downstream logic and the reader both act on a number that was never earned.

This also generalizes past this one gate. Any harness may ship a model-family-wide default that disables something a skill depends on. The pattern — detect nothing, assert conditionally, deliver through a channel with standing in the turn, disclose the trade, and name the deletion trigger — is the reusable part.

## When to Apply

Reach for this only when all of these hold:

- A capability the skill's flow **depends on** is being suppressed, not merely inconvenienced.
- The suppression comes from a harness default the user cannot turn off.
- The condition the default keys on is **genuinely satisfied** in the case you are authorizing.
- The scope can be bounded to the skill's own shipped behavior.

Do **not** reach for it to bypass a restriction the operator actually intended, to widen tool access generally, or anywhere the conditional would be false. A directive that asserts a condition it cannot know is met is the line between a workaround and a jailbreak.

Two practical constraints found the hard way:

- **A skill with a narrow `allowed-tools` pin cannot run a bundled script at all.** `ce-resolve-pr-feedback` pinned Bash to `gh` and `git`, so the setup step was dead on arrival there. Widening that pin is a security decision, so it went to the maintainer rather than being taken as a side effect; the pin was then widened to admit the setup command only, leaving the agent-tool permission untouched.
- **The delivery runtime is a coverage limit, and an accepted one.** The emitter is a Node script, and Node is not a declared prerequisite of this plugin. On a host without it the setup step degrades to the prior behavior and the gate stands. That is the status quo rather than a regression, so it was accepted knowingly instead of adding a second emitter to keep in sync.
- **Inventory by behavior, not by phrasing.** The first pass grepped for fixed phrasings — "generic subagent", and references to agent-prompt directories like `skills/ce-plan/references/agents/` — and missed three skills that describe dispatch in their own words ("one agent per skill", "dispatch read-only sub-agents in parallel", "a replacement subagent writes the successor"). `ce-retune` was the costliest miss: its audit runs a proposer agent and an opposing defender agent per skill, so collapsing them into one context has the same context arguing both sides.

## Examples

**Evaluating review feedback on a mechanism like this.** A model reviewing something designed to override model-gating has an obvious reason to want it weakened, so judge each finding against one question: *does this reduce the effect in the authorized case?*

| Finding | Effect on the authorized path | Outcome |
|---|---|---|
| Move directive text out of the script into a prose reference | None — identical bytes, same channel | Rejected: cited rule governs repo-instructions vs skill, not subdirectories inside a skill |
| Require an explicitly-typed invocation, excluding host-selected runs | None — but hollows the claim the mechanism rests on | Rejected as a deliberate decision, risk disclosed instead |
| Allow the workflow's own fallback when a dispatch fails | None — governs only post-failure behavior | Accepted: without it, workflows with defined degrade paths retry forever |

The first two rejections and the acceptance all came from the same reviewer in one pass. Blanket trust and blanket suspicion would both have been wrong.

**Measuring whether it works.** Never score dispatch from the run's own summary — models in this investigation claimed dispatches they had not made. Count `tool_use` entries in the session transcript instead, and confirm the tool was available all along with a post-hoc probe. Probe *after* the run: asking first primes the session with dispatch reasoning and contaminates the very behavior under test.

## Related

- [`dispatch-script-failure-degrade-outcome-not-boundary.md`](dispatch-script-failure-degrade-outcome-not-boundary.md) — the companion rule for the other direction: when a dispatch path fails, degrade the outcome rather than weakening the boundary the dispatch enforced. Independence there is called out as output correctness, not privacy, which is the same reasoning behind the independence directive here.
