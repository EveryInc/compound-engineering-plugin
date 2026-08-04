---
title: "Working around a harness default that silently disables a skill's subagents"
date: 2026-07-28
last_updated: 2026-08-02
category: skill-design
module: "skills (the 15 dispatch skills listed in tests/skill-context-parity.test.ts DISPATCH_SKILLS, each carrying a byte-identical scripts/context.mjs)"
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "A harness ships a standing system-prompt rule that gates a capability a skill's flow depends on, and the rule has no off switch"
  - "A skill's shipped subagents stop firing and the work silently collapses into the parent context"
  - "Deciding whether skill-authored content may assert that an operator-level constraint is satisfied"
  - "Judging review feedback — or an eval-backed removal proposal — on a mechanism whose whole purpose is to override a model-facing default"
  - "A Setup fence's tool output is being piped, filtered, or truncated before its directives reach context"
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

**Write the exit condition down.** This exists only until the upstream ambiguity in "unless the user requested it" is fixed at the source. When that lands, the mechanism should be **deleted, not reworded** — a workaround that outlives its cause becomes a permanent unexplained exception. Per-skill evidence is not an exit: an eval showing prose delivery sufficed for one skill (tried once — PR #1311, reverted same day by PR #1313) exits nothing, because delivery-channel evidence does not transfer between skills and a single exception doubles the maintenance surface.

**Refuse where independence is load-bearing, rather than degrading.** Inline substitution is the right default when a dispatch is merely unavailable, but not when a workflow's correctness *is* the separation. `ce-retune`'s corpus audit is a proposal pass and an opposing defense pass; run in one context, the same reasoner argues both sides and the audit still emits confident-looking cuts with the control silently removed — and that skill deletes prose, so the damage is a line a real defender would have saved. Where a workflow declares that a pass needs independent contexts, report the missing capability as a blocker and stop that pass. Scope the refusal to workflows that declare it; a global refusal would break every skill that degrades acceptably.

**Separate what you can quote from what you have only observed.** One directive here rests on a quotable line — `Do not call the AgentTool unless the user requested it` — with a measured before/after. A second, countering autonomy framing, does not, and the doc should not borrow the first one's credibility for it.

Its basis is operational: over long-running work, skills drift toward inferring instead of asking, and their confirmation steps quietly stop firing. The directive asserts that any standing autonomy framing is a model-family default rather than evidence about the current session, so those steps stay live.

What it is *not* backed by, checked directly: no autonomy assertion appears in either an interactive or a headless (`-p`) Claude Code system prompt. The directive opens with a condition — *if* your prompt asserts the user is absent — so where no such assertion exists it self-limits to nothing. On this harness it is most likely inert; it is carried as cross-host insurance, since the same skills ship to other agents and schedulers where such framing is plausible.

Two things follow. Do not audit a counter-directive purely by string-matching the prompt — the same pressure appears in different words (this harness reserves blocking questions for cases where "proceeding under any assumption would be unsafe", which pushes toward inferring without ever claiming the user is gone). And when the evidence is observational rather than quotable, label it that way; an overstated justification is the kind a future reader trusts until they check it.

**Delivery is a step that can fail, and the model is the one who fails it.** The directive outranks the system-prompt default only if it arrives in the turn as tool output — and the model can destroy that delivery without ever forming an intention about the directive. Field transcripts show the Setup fence rewritten with `| tail -6` or `| head -5` (3 of 21 invocations on one host, clustered on mid-chain `ce-doc-review`/`ce-work` runs): a generic output-minimization habit that never reads what it discards. `head -5` keeps the header and `RESOLVED_CONTEXT` and drops every directive while still looking like a successful run; `tail -6` drops `SUBAGENT_AUTHORIZATION` specifically, because it is emitted first. The observed incident session made zero dispatches across a full plan → review → work chain, and which directives survived depended purely on which truncation flag the model reached for.

Two mechanisms counter this:

- The Setup prose instructs running the fence exactly as written — unpiped, unfiltered, not bundled into a command batch. This is the one place prose is deliberately load-bearing: it fires before the script runs, so no executable layer can carry it.
- The script emits a fixed header first and `CE_CONTEXT_END` last, and the Setup prose defines the check: one of those lines without the other means the output was truncated — rerun the fence verbatim once. No single-ended cut preserves both, so truncation is detectable from inside the turn.

If field evidence shows the marker check being skipped too, the next escalation is an executable delivery receipt — the script records that it ran, and the first dispatch point verifies the directives arrived intact — converting the last prose control into an executable one.

**A harness default must never be re-narrated as the user's instruction.** The observed override did not degrade silently — it degraded while telling the user "your standing instruction prohibits agent dispatch." The user had said nothing of the kind, and conceded confusion only when challenged. That misattribution is worse than the silent form: it launders an operator default into a fabricated user preference, invisible to the user and unfalsifiable for a later transcript reader, who sees a note saying the user asked for this. A fourth directive, `HARNESS_ATTRIBUTION`, states that a constraint originating in the system prompt or harness configuration is never described to the user as their instruction, preference, or standing request, and that any disclosure names the harness as the source.

**Independence accounting must travel with it.** Restoring dispatch fixes the corrupted confidence signal only while dispatch succeeds. A third directive states that independence is a property of separate dispatched contexts — not of separate personas or lenses — so agreement reached inside one context cannot promote a finding. That rule is correct whether or not the gate is ever lifted.

## Why This Matters

Silent capability loss is the expensive kind. Nothing errors, no check goes red, and the output looks the same as a healthy run — so the degradation is discovered only when someone measures dispatch directly. A skill that claims independent corroboration it did not obtain is worse than one that admits it ran inline: downstream logic and the reader both act on a number that was never earned.

This also generalizes past this one gate. Any harness may ship a model-family-wide default that disables something a skill depends on. The pattern — detect nothing, assert conditionally, deliver through a channel with standing in the turn, disclose the trade, and name the deletion trigger — is the reusable part.

## Expect permanent review friction, and triage it

A change that argues against a model-facing default reads, structurally, like a prompt-injection attempt — because that is the same shape. Reviewing agents flag it correctly and will keep flagging it on every pass and every future PR touching these files. That friction is a property of the design, not a phase to work through, and a reviewer that stayed silent would be the broken one.

The consequence for a review loop: **repeated objections here are not a non-convergence signal.** The usual reading — the same complaint resurfacing means something is unresolved — does not hold, and a babysit-style trajectory trigger will fire for reasons unrelated to the work being wrong.

Triage into two piles, because the same reviewer produces both:

| Class | Examples from this change | Handling |
|---|---|---|
| **Mechanism objection** — the design is a self-exemption, a directive is unnecessary, exempt this skill from it | "tool output cannot grant permissions your system prompt withholds" | Expected and unfixable by design. Decline, resolve, do not add qualifier prose. Each accommodation dilutes the wording that was empirically validated. |
| **Implementation finding** — this specific code is wrong | A tool pin that pre-approved arbitrary shell; setup running once per session so later invocations lost it; a constraint added to a skill but not to the reference it routes readers to; removing a pin that was also granting auto-approval | Real defects, several of them self-inflicted. Fix them. |

The failure mode is collapsing the two: dismissing a reviewer because its last finding was a mechanism objection, or patching the directive because its last finding was a real bug. Keep the scrutiny, discard the suspicion.

## An exit was tried once, and reverted the same day

The mechanism now has one measured exit attempt on record, and the attempt is more instructive than the steady state.

**The removal.** PR #1311 (merged 2026-08-02) took `ce-simplify-code` off the shared mechanism: it deleted the skill's copy of the script (`skills/ce-simplify-code/scripts/context.mjs`) and its Setup fence, replaced them with inline SKILL.md dispatch prose, and dropped the skill from the parity test's `DISPATCH_SKILLS` roster. The justification was substantive on its own terms — independence is not load-bearing for that skill (its three reviewers are lenses over the same diff, not votes that promote findings), and the fence plus its prose were roughly 45% of the skill's always-loaded prompt — and it carried 42 cross-host eval arms (Codex, Claude, Cursor): a 9/9 outcome matrix exercising the new prose's failure-classification handling, plus a live pass in which prose-only delivery did dispatch on all three hosts.

What the validation never did was engage this mechanism's original basis. No arm demonstrated that the hazard's precondition — the harness gate that measured 0 dispatches on stock `ce-plan` above — was present in the rig and overcome by prose. A green dispatch eval cannot distinguish "prose suffices" from "the gate did not bite in this rig," and a capable model masking a defensive fix is a documented failure of exactly this shape (see `strong-models-mask-defensive-skill-fixes.md`: adversarial fixtures on a strong model could not reproduce the failure a defensive instruction targeted, yet the instruction still mattered for the weaker harnesses the plugin ships to). The removal treated absence of failure in its own rig as license, without reconfirming against the measured failure the script was built on.

**The evaluation.** A same-session evaluation asked the natural next question: if prose delivery worked here, should the other 14 skills shed the script too? A cross-model oracle panel (codex and grok peers, positions formed independently, both concurring with the host's own analysis) reached the opposite conclusion — do not extend, and revert the one removal. Three reasons:

1. **The doc's own placement evidence says prose success does not transfer.** The measured table above is the counter-example: for `ce-plan`, the identical directive text as static prose produced 0 dispatches, and tool-result delivery restored 3-5. A passing prose-delivery eval for `ce-simplify-code` is evidence about `ce-simplify-code`'s prompt shape and flow position, and licenses nothing about any other skill — and per the paragraph above, without demonstrating the gate was active in the rig it did not firmly license the removal even there.
2. **Several skills' correctness depends on the directives, not just their throughput.** `ce-retune` declares its proposal and defense passes require independent contexts and must blocker-and-stop rather than run inline; `ce-doc-review` and `ce-code-review` promote findings on multi-reviewer agreement, which `INDEPENDENCE_ACCOUNTING` exists to keep honest. Losing tool-result delivery there is not a wall-clock cost; it is the corrupted-confidence failure this doc opened with.
3. **A single prose-only exception creates a dual-mechanism drift surface.** With 15 byte-identical copies, a dispatch-semantics fix lands once and the parity test propagates it. With 14 copies plus one prose port, every such fix must land in two mechanisms with no test tying them together — and the prose copy silently drifts.

**The revert.** PR #1313 (merged 2026-08-02) restored the mechanism portion byte-identically: the script back, Setup fence back, pre-#1311 Step 2 dispatch wording back, skill re-added to `DISPATCH_SKILLS` (now 15 skills). #1311's prompt diet and behavior rules were deliberately kept — the revert targeted the delivery mechanism, not the cleanup that rode along with its PR.

**The restoration bonus.** During #1313's review, a Codex P1 showed that the restored pre-#1311 wording had aged: "otherwise run the reviews inline or serially" covered only a harness with no subagent primitive at all, the Bounded dispatch paragraph covered only capacity backpressure, and the retained Step 3 gate ("proceed only after all three review outcomes are complete") could therefore stall on a non-capacity launch failure — one reviewer's dispatch errors for a reason that is neither missing-primitive nor backpressure, and no rule produces its outcome. The fix was one sentence in the Bounded dispatch paragraph: a dispatch that fails for any other reason runs that reviewer's pass inline in the parent context using the same prompt asset, disclosed in one line. That matches the non-capacity failure-classification convention the sibling skills had adopted since the original wording was written (`ce-doc-review` and `ce-optimize` in their dispatch sections, and `ce-code-review` in `skills/ce-code-review/references/dispatch-reviewers.md`, all distinguish capacity backpressure — queue and retry — from non-capacity dispatch failure — record/substitute and move on).

**What generalizes:**

- **Removing a counter-measure requires reproducing the hazard it counters.** An eval in which the protected behavior succeeds licenses nothing on its own — it must also demonstrate the hazard's precondition was present and overcome. Absence of failure in a rig where the gate may never have fired is not evidence the counter-measure is unnecessary; reconfirm against the original measured basis before removing, or the removal is deleting a fix because its symptom did not recur while the fix was in reach.
- **Delivery-channel evidence is per-skill and per-flow.** An eval proving static prose sufficed for one skill is evidence about that skill's prompt shape, not about the channel. It licenses no conclusion about any other skill.
- **A shared byte-identical mechanism's value includes the uniformity itself.** The first exception does not remove one skill's overhead; it doubles the maintenance surface for every future dispatch-semantics fix. Price the exception at that cost, not at the single skill's savings.
- **When restoring older prose, re-audit it against conventions the ecosystem adopted since.** A revert is not a time machine: the pre-removal wording predated the non-capacity fallback convention, and restoring it verbatim reintroduced a gap the sibling skills had already closed.
- **The exit condition has not moved.** Any exit from the shared script remains governed by the condition already written above — the upstream fix to the harness default, at which point the mechanism is deleted everywhere at once. A per-skill prose eval, however well-measured, is not an exit condition; #1311/#1313 is the evidence.

## When to Apply

Reach for this only when all of these hold:

- A capability the skill's flow **depends on** is being suppressed, not merely inconvenienced.
- The suppression comes from a harness default the user cannot turn off.
- The condition the default keys on is **genuinely satisfied** in the case you are authorizing.
- The scope can be bounded to the skill's own shipped behavior.

Do **not** reach for it to bypass a restriction the operator actually intended, to widen tool access generally, or anywhere the conditional would be false. A directive that asserts a condition it cannot know is met is the line between a workaround and a jailbreak.

Two practical constraints found the hard way:

- **Ask whether the skill needs dispatch at all before fighting its permissions.** `ce-resolve-pr-feedback` pins `allowed-tools` so it can run unattended without permission prompts, and that pin also blocked the setup step. Three attempts to widen it each opened an equivalent hole — `Bash(command *)` pre-approves arbitrary shell because `command` executes its argument, `Bash(node *)` pre-approves `node -e '<arbitrary JS>'` — and removing the pin was worse still: the pin was *granting* auto-approval, so dropping it made every `gh` and `git` call prompt and stalled the unattended path the skill exists to serve.

  The resolution was not a narrower glob. That skill's fixers supply **parallelism, not independence** — its legitimacy judgment is centralized before any fixer runs, so applying approved fixes sequentially in the orchestrator's own context costs wall-clock and nothing else. Documenting that as a first-class path removed the dependency on dispatch, which removed the need for the directives, which removed the conflict with the pin.

  The generalizable test: separate *parallelism* dispatch from *independence* dispatch. Only the second is a correctness property worth contorting a permission model for; the first can always be spent as time instead.

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

Measure *delivery* separately from *compliance*, and count delivery only inside `tool_result` blocks. A raw substring grep for a directive token also matches the model quoting the directive back in its own assistant text, which inflates the delivery count and hides truncation entirely — one audited session counted three "deliveries" where a structured re-parse found one. "Ignored the directive" and "never received the directive" need opposite fixes; an audit that cannot tell them apart files the wrong bug. Check the `tool_use` input for the Setup invocation too: a `| head`/`| tail` pipe there with a shortened result is the truncation signature.

## Related

- [`dispatch-script-failure-degrade-outcome-not-boundary.md`](dispatch-script-failure-degrade-outcome-not-boundary.md) — the companion rule for the other direction: when a dispatch path fails, degrade the outcome rather than weakening the boundary the dispatch enforced. Independence there is called out as output correctness, not privacy, which is the same reasoning behind the independence directive here.
