# Synthesis Summary

**Synthesis ≠ unified plan artifact.** The synthesis is NOT a preview, draft, or substitute for the requirements-only unified plan — it's the scope checkpoint that doc-write consumes as input. The Product Contract itself is written in Phase 3 from the confirmed synthesis. Both the synthesis and the Product Contract stay scope-only — implementation detail (file paths, code shapes, exact error wording) is downstream (ce-plan's job), not the Product Contract.

**Two-stage shape: internal draft, then chat-time scoping synthesis.** The synthesis is composed in two stages. Stage 1 is an internal three-bucket draft (Stated / Inferred / Out of scope) the agent uses to think comprehensively about scope. Stage 2 is the scoping synthesis presented to the user — shaped like what two product collaborators would confirm before writing a PRD, not like a comprehensive audit and not like a one-line preview. The user only sees stage 2. The internal draft still informs the doc body through the "Doc shape after confirmation" section below, which says where each bucket lands; it just doesn't reach the user verbatim. This split exists because the comprehensive audit shape produced too much detail for the user to actually weigh in on, even when the granularity rules were followed.

**Three-bucket structure is the internal draft, not the user-facing artifact.** It does its scope-thinking job during stage 1 and dissolves when Phase 3 writes the doc: Stated content informs Requirements, success signals from either bucket inform Success Criteria, Inferred content informs Key Decisions, Out-of-scope content informs Scope Boundaries. The doc has no parallel `## Synthesis` section — only the scoping synthesis prose embeds, as `## Summary`. See "Doc shape after confirmation" below for the routing.

This content is loaded when Phase 2.5 (Synthesis Summary) runs — after Phase 2 (approaches chosen) and before Phase 3 (write the requirements-only unified plan). The synthesis is the user's last opportunity to correct the agent's interpretation before the artifact lands. It serves two purposes: synthesis confirmation (the user agreed to many individual things in dialogue but never saw the whole) and a transition checkpoint ("about to write the Product Contract").

Runs for **all tiers** including Lightweight. Skip Phase 2.5 entirely on the Phase 0.1b non-software (universal-brainstorming) route. The skill is interactive by design — brainstorming requires dialogue with a synchronous user. There is no non-interactive mode; if an automated workflow needs a Product Contract without dialogue, the right move is to write the unified plan artifact from context directly, not to invoke `ce-brainstorm`.

---

## Stage 1: internal three-bucket draft

The internal draft is structured in three labeled buckets. Items may appear in two buckets when meaningfully both — flag the inclusion-then-exclusion as Inferred so the reasoning is captured.

- **Stated** — what the user said directly (in the original prompt, prior conversation, dialogue answers, approach selection in Phase 2). Items here have explicit user-language anchors.
- **Inferred** — what the agent assumed to fill gaps. Scope boundaries the user never explicitly named, success criteria extrapolated from intent, technical assumptions made because the brief interview didn't probe them. The Inferred bucket is where the user's corrections matter most — items here are the agent's bets.
- **Out of scope** — deliberately excluded items. Adjacent work the agent considered but decided not to include, refactors, nice-to-haves, future-work items. Making exclusions explicit lets the agent spot anything that should actually be included.

A session-settled decision (per `references/settled-decisions.md`) is **Stated with provenance** — record it in the Stated bucket with its class, rejected alternative, and one-line reason, never in Inferred: it is the user's confirmed choice, not an agent bet.

This draft is internal. Do not paste it verbatim into chat. Compose it as a thinking step, then derive stage 2 from it.

---

## Stage 2: the chat-time scoping synthesis

The scoping synthesis is what the user actually sees. Its job is to let the user check, in one read, whether you understood them: the problem they are trying to solve, what will be built, and which calls they might want to change. Write it in your own words from your understanding, the way a collaborator would play a discussion back before writing it up ("So the real problem is X. We're building Y, deferring Z, and I'm assuming W. Sound right?"). Show what you understood and what you assumed, not what the user said. Replaying their answers back ("you said X, then you said Y") shows recall rather than understanding, and they just lived through it.

Start with the synthesis itself, with no process narration or repo findings above it. It contains, in this order:

- **The problem** — 1–2 sentences, as prose: who has the problem, what it costs them now, and what will be true when it is solved. State the goal behind the request, not the feature restated. When the user never said why, say what you inferred so they can correct it.
- **What we're building** — 1–3 sentences of prose on the shape that emerged, forward-looking and in plain words. Say what the thing is and how it holds together, not the requested features listed back; the choices the user made in dialogue show up here as part of that description. Shape only; the requirements belong in the doc.
- **Carrying forward:** lines only for session-settled decisions carried in from before this skill started (an earlier conversation or a passed brief) — one line each, `Carrying forward: <decision> over <rejected alternative> — <one-line reason>.` These are statements, never questions or call-outs. Decisions the user made in this skill's own dialogue get no line; the shape already reflects them.
- **Call outs** — flat bullets for what the user has not already seen stated this way: bets you made without asking, deferrals the user did not explicitly make, and consequences of combining the user's answers that they are unlikely to have tracked. A call-out is not a question you could have asked during dialogue; if one reads that way, the dialogue missed it, so say so plainly.

Leave out anything the user cannot judge without reading code (file paths, names, data shapes, exact wording), mechanical choices with no real alternative, and anything the prose already says. Keep each bullet to one sentence a collaborator would say aloud, with no nested bullets. Include only what the user needs to know to judge whether the requirements are right: your understanding of the problem and the shape, and the decisions or assumptions that would change what gets built if they were wrong. Everything else belongs in the doc. A larger scope means naming those decisions at a higher level, not adding lines. Omit an empty section rather than padding it. On a Deep scope, zero call-outs usually means consequences of the user's answers were filtered out as "already implied"; look again before emitting. Write the synthesis through the `ce-noslop` skill.

If a question genuinely cannot be defaulted, resolve it before presenting the synthesis, then integrate the answer. Never present the synthesis with open questions beside it, since the user then has no clear way to respond.

End with a confirmation that names what actually happens next, so the user knows what is coming and can interrupt without ambiguity. When a doc is expected — the common case — that is the artifact write: *"Confirm and I'll write the requirements-only plan next, drawing on our dialogue and this synthesis. Or tell me what to change — even something I captured correctly earlier is fair game to revise."*

When a doc is already ruled out — the user declined one, or `brainstorm-sections.md`'s "Decide whether a doc is warranted at all" criteria plainly hold — name where the decisions actually go instead, which is whichever of that rule's alternatives *this run* established (`ce-plan`, the user's commit message, `<root>/solutions/`): *"Confirm and we're done here — the scope above carries straight into [the destination the dialogue established]. Or tell me what to change."* When the dialogue named none, drop the clause rather than picking one: *"Confirm and we're done here — no doc, as you asked. Or tell me what to change."*

Do not hardcode a destination. This phase writes no commit message and hands off at Phase 4, so asserting a downstream action the run will not take is the same overreach as promising the doc. Phase 3, not this phase, decides whether a doc is warranted, so promising the write here makes a user who already declined a doc decline it a second time.

Ask for the confirmation open-ended, without an `AskUserQuestion` menu. Per Interaction Rule 5(a) in `references/interaction-rules.md`, an option menu would steer the user's feedback toward the parts the menu lists.

Example, for a notification-mute feature after a Standard dialogue:

```
**The problem:** The support team gets paged at 3 AM by noisy channels they can't act on until morning, and today the only fix is deleting the rule.

**What we're building:** Per-channel mute on notification rules, with a 24h preset. The mute lives on the rule and survives rule edits.

**Call outs:**
- A mute also silences @mentions routed through that rule; I'm assuming that's wanted
- Presence-based mute and quiet-hours schedules are deferred
- Deleting a rule silently loses its mute; I'm assuming no warning is needed

Confirm and I'll write the requirements-only plan next, drawing on our dialogue and this synthesis. Or tell me what to change.
```

### Path A vs Path B: the gate that fires the confirmation question

Phase 2.5 has two presentation modes, decided by **two signals**: (1) was any blocking question asked before Phase 2.5? AND (2) what tier did Phase 0.3 classify the scope as? Blocking questions include Phase 0.3 scope disambiguation, Phase 1.3 collaborative dialogue probes, and Phase 2 approach selection (when a menu is shown). Internal classification, Phase 1.1 scan, and Phase 1.2 pressure test are not blocking questions — they don't count.

- **Path A — no blocking questions were asked AND tier is Lightweight**: announce and continue without waiting. Emit "What we're building" prose only (no other sections, no confirmation question). That paragraph is the result; proceed to Phase 3 doc-write in the same turn only when `phase-0.md`'s Lightweight rule says a file is warranted. Do NOT end the turn waiting for acknowledgment. The user can revise after the paragraph or the doc lands if the shape is wrong.
- **Path B — at least one blocking question was asked, OR tier is Standard / Deep-feature / Deep-product**: the full scoping synthesis above, followed by a confirmation question. Two scenarios lead to Path B: (a) the user invested answer-time during dialogue, or (b) the user pre-loaded substantive scope content (Phase 0.2 fast-path with a richly-specified opening prompt). Either way, the substance deserves a real checkpoint. The confirmation question is unconditional even when there are no call-outs.

**Why the tier guard exists.** Phase 0.2's fast path is designed for two very different cases — a tight one-line prompt that needs no dialogue ("fix the typo on line 47"), and a richly pre-loaded brainstorm context that ALSO needs no dialogue because the user pre-stated everything (e.g., handing off accumulated decisions from a prior session for a brainstorm doc backfill). Without a tier guard, both route to Path A, and the richly-loaded case gets a 1-sentence checkpoint for what may be 20+ items worth of scope. Tier-classifying Phase 0.3 distinguishes these cases — pre-loaded substance makes the tier Standard or Deep, which then routes to Path B and produces the full scoping synthesis the substance deserves. Do not simplify the rule back to a single "no questions asked" signal — that was a real defect that produced one-sentence syntheses on Deep-tier pre-loads.

Path A is the same announce-and-continue behavior the Phase 0.2 fast path already uses, but only when the substance genuinely warrants 1–3 sentences. Path B is the default for every other interactive invocation.

### Path A template (no questions were asked — typically Phase 0.2 short-circuit)

```
Proposing: [1–3 line shape — what we are building, in plain words].

No open decisions — [when a file was earned: writing the requirements-only plan now | otherwise: that is the result; these decisions go to <where the dialogue established>]. Interrupt if the shape is wrong.
```

When a file is warranted, proceed to Phase 3 doc-write in the same turn — do NOT end the turn waiting for an acknowledgment; otherwise present Phase 4's handoff. The "interrupt if wrong" affordance means the user can revise after the result lands, not before.

---

## Re-present after revision; write only on confirm

A revision is not a confirmation. After any user revision (even a trivially-understood swap like "move deferred item X back into scope"), integrate the change, re-present the revised scoping synthesis with the change reflected, and wait for explicit confirmation before writing the doc. The loop is:

1. Present scoping synthesis → user responds
2. User confirms → write the doc
3. User revises → integrate, re-present revised scoping synthesis, return to step 1

The doc is written only on explicit confirm or after the user picks "proceed" at the blocking question that is asked when the same item has been revised twice (see below). The confirmation step is what makes the scoping synthesis **confirmed** rather than "agent's last proposal" — never write immediately after a revision, even when the revision is small enough that the agent feels it understood.

---

## Soft-cut on circularity (not iteration count)

Track which scoping synthesis items the user touched per round. That blocking question is asked **only when the same item is revised twice** (or a third-round revision targets an item already revised in round two). New-item revisions across rounds proceed without limit — revising different aspects of a wrong scoping synthesis is exactly what the mechanism should support.

**Identity across rounds is by decision dimension, not surface wording or section.** A revision may cause stage 2 to re-derive — the same underlying decision can come back rephrased, merged with another bullet, or moved to a different section (e.g., what was a Trade-off in round one becomes a Call-out in round two after the user pushed back). "Same item" means the same underlying decision regardless of which section currently holds it. When a re-cut collapses multiple prior bullets into one, the new combined bullet inherits the "touched" status of any of its constituents — the blocking question is asked if any underlying decision was already revised once before.

When that condition is met, use the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name) with two options:

- `Proceed and write the requirements-only plan`
- `Hold off — keep discussing before the doc`

Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to a numbered list on the host's user-visible chat surface only when no such tool is in the list or a real question call errors. Never silently skip.

---

## Self-redirect

If the user response indicates they're in the wrong skill or want a different workflow (e.g., "this is too small, just use `ce-work`" or "this needs more thought, let me brainstorm differently"):

- Stop ce-brainstorm
- Suggest the alternative skill the user appears to want (e.g., `ce-work`, `ce-debug`)
- Offer to load it in-session
- Do not push back or argue — the user's redirect signal is the deliberate choice

This support exists because the scoping synthesis is an honest checkpoint. If the user discovers the skill choice was wrong by reading the scoping synthesis, redirecting is the right move.

---

## Doc shape after confirmation

After user confirmation (or after the user chooses "proceed" at that blocking question), Phase 3 writes the requirements-only unified plan. The internal draft does NOT carry into the artifact as a `## Synthesis` section. Only the "What we're building" prose embeds, as `## Summary` inside the Product Contract. Internal-draft content dissolves into the Product Contract's body sections:

| Internal-draft element | Where it goes in the doc |
|---|---|
| "What we're building" prose | `## Summary` (1–3 lines, forward-looking, what's proposed) |
| "The problem" as confirmed | `## Problem Frame` — the confirmed problem anchors that section's narrative, expanded rather than copied |
| Stated bullets | `## Requirements` (numbered R-IDs, full detail) and where relevant `## Problem Frame` for narrative context |
| Inferred bullets | `## Key Decisions` (with rationale) — bets the user accepted in dialogue become decisions in the doc. |
| Out-of-scope bullets | `## Scope Boundaries` |
| Success signals (Stated or Inferred) | `## Success Criteria` when its catalog entry applies — quality, metric, or handoff signals the Requirements don't already carry. This row **overrides** the generic Stated and Inferred rows for those items: a success signal routes here *instead of* to Requirements or Key Decisions, never to both. |

The chat-time call-outs dissolve by kind: choices and bets the user confirmed become `## Key Decisions`, and deferrals become `## Scope Boundaries`.

Session-settled decisions are the exception to the Stated → Requirements row: each routes to `## Key Decisions` carrying its `session-settled:` annotation — a user-confirmed choice, never softened into an inferred bet or recorded as an assumption. This holds equally when the artifact is written from context without dialogue.

No italic capture-context note (e.g., "Captured at Phase 2.5..."). It would leak engineering process into an artifact whose readers do not need that signal.

The doc's `## Summary` and `## Problem Frame` must serve distinct purposes — see `references/brainstorm-sections.md` "Discipline: Summary vs Problem Frame" for the rules.
