# Synthesis Summary

**Synthesis ≠ unified plan artifact.** The synthesis is NOT a preview, draft, or substitute for the requirements-only unified plan — it's the scope checkpoint that doc-write consumes as input. The Product Contract itself is written in Phase 3 from the confirmed synthesis. Both the synthesis and the Product Contract stay scope-only — implementation detail (file paths, code shapes, exact error wording) is downstream (ce-plan's job), not the Product Contract.

**Two-stage shape: internal draft, then chat-time scoping synthesis.** The synthesis is composed in two stages. Stage 1 is an internal three-bucket draft (Stated / Inferred / Out of scope) the agent uses to think comprehensively about scope. Stage 2 is the scoping synthesis presented to the user — shaped like what two product collaborators would confirm before writing a PRD, not like a comprehensive audit and not like a one-line preview. The user only sees stage 2. The internal draft still informs the doc body via the doc-shape routing below; it just doesn't reach the user verbatim. This split exists because the comprehensive audit shape produced too much detail for the user to actually weigh in on, even when the granularity rules were followed.

**Three-bucket structure is the internal draft, not the user-facing artifact.** It does its scope-thinking job during stage 1 and dissolves when Phase 3 writes the doc: Stated content informs Requirements, Inferred content informs Key Decisions, Out-of-scope content informs Scope Boundaries. The doc has no parallel `## Synthesis` section — only the scoping synthesis prose embeds, as `## Summary`. See "Doc shape after confirmation" below for the routing.

This content is loaded when Phase 2.5 fires — after Phase 2 (approaches chosen) and before Phase 3 (write the requirements-only unified plan). The synthesis is the user's last opportunity to correct the agent's interpretation before the artifact lands. It serves two purposes: synthesis confirmation (the user agreed to many individual things in dialogue but never saw the whole) and a transition checkpoint ("about to write the Product Contract").

Fires for **all tiers** including Lightweight. Skip Phase 2.5 entirely on the Phase 0.1b non-software (universal-brainstorming) route. The skill is interactive by design — brainstorming requires dialogue with a synchronous user. There is no non-interactive mode; if an automated workflow needs a Product Contract without dialogue, the right move is to write the unified plan artifact from context directly, not to invoke `ce-brainstorm`.

---

## Stage 1: internal three-bucket draft

The internal draft is structured in three labeled buckets. Items may appear in two buckets when meaningfully both — flag the inclusion-then-exclusion as Inferred so the reasoning is captured.

- **Stated** — what the user said directly (in the original prompt, prior conversation, dialogue answers, approach selection in Phase 2). Items here have explicit user-language anchors.
- **Inferred** — what the agent assumed to fill gaps. Scope boundaries the user never explicitly named, success criteria extrapolated from intent, technical assumptions made because the brief interview didn't probe them. The Inferred bucket is the most actionable surface for correction — items here are the agent's bets.
- **Out of scope** — deliberately excluded items. Adjacent work the agent considered but decided not to include, refactors, nice-to-haves, future-work items. Making exclusions explicit lets the agent spot anything that should actually be included.

A session-settled decision (per `references/settled-decisions.md`) is **Stated with provenance** — record it in the Stated bucket with its class, rejected alternative, and one-line reason, never in Inferred: it is the user's confirmed choice, not an agent bet.

This draft is internal. Do not paste it verbatim into chat. Compose it as a thinking step, then derive stage 2 from it.

---

## Stage 2: the chat-time scoping synthesis

The scoping synthesis is what the user actually sees. It reflects the dialogue's substance back so the user can pattern-match — long enough to serve a multi-turn conversation, short enough to be high-impact only. The reference shape is what two product collaborators would say to each other after a real discussion: "OK, so we're doing X, with Y trade-off, deferring Z, and one thing I want to double-check is W. Sound right?"

The scoping synthesis has up to four named sections, each **render-conditional** on having something to say. Empty sections are omitted, not padded.

1. **What we're building** (always present) — 1–3 sentences. The shape that emerged from dialogue, forward-looking, plain words. Not a transcript of "you said X."
2. **Key trade-offs** (conditional) — 1–3 bullets, each with a brief why. Render only when real trade-offs were made in dialogue.
3. **What's not in scope** (conditional) — 1–3 bullets, or fold into a single sentence. Render only when deferred items would surprise a downstream reader if absent.
4. **Call outs** (conditional) — 0–3 bullets. Residual forks the dialogue didn't resolve: post-dialogue consequences (combining user answers surfaced something they couldn't see during Q&A), silent agent inferences, or — in pre-loaded contexts with no dialogue — scope bets the user is seeing for the first time. **Not "questions the agent could have asked during Phase 1.3 but didn't"** — if a call-out reads like a missed dialogue question, Phase 1.3's integration check failed; flag the gap rather than padding the section.

Session-settled decisions render as `Carrying forward:` lines — one line each, placed before Call outs (where Call outs would sit when none survive): `Carrying forward: <decision> over <rejected alternative> — <one-line reason>.` They are statements, never questions and never call-outs: the confirmation covers the overall shape, not decisions the user already made.

Each section answers a different question:

- **What's being built?** → shape
- **What did we trade off?** → explicit choices made in conversation
- **What did we cut?** → deferred items a reader would expect to see acknowledged
- **Where might you redirect?** → residual forks: post-dialogue consequences, silent inferences, late-cycle bets

Then the confirmation, which names **what actually happens next** so the user knows what is coming and can interrupt without ambiguity. When a doc is expected — the common case — that is the artifact write: *"Confirm and I'll write the requirements-only plan next, drawing on our dialogue and this synthesis. Or tell me what to change."*

When a doc is already ruled out — the user declined one, or `brainstorm-sections.md`'s "Decide whether a doc is warranted at all" criteria plainly hold — name where the decisions actually go instead, which is whichever of that rule's alternatives *this run* established (`ce-plan`, the user's commit message, `<root>/solutions/`): *"Confirm and we're done here — the scope above carries straight into [the destination the dialogue established]. Or tell me what to change."* When the dialogue named none, drop the clause rather than picking one: *"Confirm and we're done here — no doc, as you asked. Or tell me what to change."*

Do not hardcode a destination. This phase writes no commit message and hands off at Phase 4, so asserting a downstream action the run will not take is the same overreach as promising the doc. Phase 3, not this phase, owns the doc-warranted decision, so promising the write here makes a user who already declined a doc decline it a second time.

### Path A vs Path B: the gate that fires the confirmation question

Phase 2.5 has two presentation modes, gated by **two signals**: (1) did any blocking question fire before Phase 2.5? AND (2) what tier did Phase 0.3 classify the scope as? Blocking questions include Phase 0.3 scope disambiguation, Phase 1.3 collaborative dialogue probes, and Phase 2 approach selection (when a menu fires). Internal classification, Phase 1.1 scan, and Phase 1.2 pressure test are not blocking questions — they don't count.

- **Path A — no blocking questions fired AND tier is Lightweight**: announce-mode. Emit "What we're building" prose only (no other sections, no confirmation question), then proceed to Phase 3 doc-write in the same turn. Do NOT end the turn waiting for acknowledgment. The user can revise after the doc lands if the shape is wrong — Lightweight Path A docs are short, post-hoc revision is cheap.
- **Path B — at least one blocking question fired, OR tier is Standard / Deep-feature / Deep-product**: full tier-aware scoping synthesis with confirmation gate. Two scenarios fire Path B: (a) the user invested answer-time during dialogue, or (b) the user pre-loaded substantive scope content (Phase 0.2 fast-path with a richly-specified opening prompt). Either way, the substance earns a real checkpoint. The confirmation question is unconditional even when zero call-outs survive the keep test.

**Why the tier guard exists.** Phase 0.2's fast path is designed for two very different cases — a tight one-line prompt that needs no dialogue ("fix the typo on line 47"), and a richly pre-loaded brainstorm context that ALSO needs no dialogue because the user pre-stated everything (e.g., handing off accumulated decisions from a prior session for a brainstorm doc backfill). Without a tier guard, both route to Path A, and the richly-loaded case gets a 1-sentence checkpoint for what may be 20+ items worth of scope. Tier-classifying Phase 0.3 distinguishes these cases — pre-loaded substance makes the tier Standard or Deep, which then routes to Path B and produces the full scoping synthesis the substance deserves. Do not simplify the gate back to a single "no questions fired" signal — that was a real defect that produced one-sentence syntheses on Deep-tier pre-loads.

Path A maps to the existing "announce-mode" concept on the Phase 0.2 fast path, but only when the substance genuinely warrants 1–3 sentences. Path B is the default for every other interactive invocation.

### Keep tests per section

Each conditional section has its own keep test. Sections are render-conditional — an empty section is omitted, not padded with weak items.

**Trade-offs keep test:** would the user be surprised if I didn't surface this acknowledgment? Real trade-offs are choices the user explicitly weighed alternatives on in dialogue, or structural choices the agent made that the user would expect to see named. Mechanical or inevitable choices (e.g., "uses the existing rule entity") fail the test and dissolve into the doc body without surfacing.

**Deferred keep test:** is a reasonable downstream reader likely to ask "why isn't X here?" Items the user explicitly deferred, or items adjacent enough that a reader will look for them. Mechanical excludes (e.g., "no rate limiting because it's not in scope") fail and stay in the internal draft only.

**Call-outs keep test (the affirmability test):** would the user need to read code to evaluate this? If yes, it is doc-body content — cut. If no, apply the keep test — one of the following must be true:

- **Real scope fork** — another reasonable agent might choose a different scope on this dimension (who the primary actor is, whether case X is in/out, in scope vs deferred)
- **Non-obvious scope inclusion** — a behavior the agent assumed is in scope that the user might want excluded
- **Non-obvious scope exclusion** — an item the agent moved to deferred that the user might want in scope
- **Cheap-now-expensive-later correction** — a scope bet that's cheap to fix now but expensive after the Product Contract lands and ce-plan consumes it
- **Non-obvious consequence of multi-turn answers** — a downstream effect of combining user-stated answers that the user is unlikely to have tracked through dialogue. Surfaced forward-looking ("X means Y for the doc"), not retrospectively ("you said X"). This category is the multi-turn-dialogue reason call-outs exist at all in ce-brainstorm; do not filter these as "already implied by Stated"

Cut anything that doesn't match a keep-test category, including:

- Session-settled decisions — already chosen; they render as `Carrying forward:` lines, never call-outs
- Mechanical items where there is no real alternative
- Implementation choices that will be settled during planning
- Items already implied by the scoping synthesis prose
- Re-statements of Q&A turns ("you said you wanted X") — that's transcript, not a call-out
- Re-statements of the Phase 2 approach the user already picked

### Total bullet budget across sections 2–4

The cap is heuristic, not law. The real discipline is each section's keep test on each candidate. Typical bounds by tier, counting bullets across Trade-offs + Deferred + Call outs combined:

| Tier | Typical total | Hard ceiling |
|---|---|---|
| Lightweight | 0–1 | 2 |
| Standard | 2–4 | 5 |
| Deep — feature | 3–5 | 7 |
| Deep — product | 4–7 | 9 |

**Above the hard ceiling, the synthesis is misshapen — do not raise the cap, re-cut at a higher level of abstraction.** Almost always, multiple bullets within a section are sub-decisions of one larger named decision. Collapse related bullets into a single one named at the level the user actually weighs in on.

A useful test: read the bullets aloud. If two or more sound like "and also" extensions of the same idea, they belong as one.

**Path A fires only for Lightweight tier with no blocking questions. Path B is the default for Standard, Deep-feature, and Deep-product regardless of question signal — substance earns the checkpoint, not interaction history.** Zero call-outs on Path B is normal for Lightweight, sometimes for Standard, almost never for Deep. If a Deep scoping synthesis produces zero call-outs after rich content (whether from dialogue or pre-loaded context), double-check the agent hasn't filtered consequence-class call-outs as "already implied."

### Detail level: conversational, not documentary

Each bullet is **1 line ideally, 2 lines maximum**. The reference shape is what two collaborators would say to each other in conversation, not what a Product Contract would say in its body. The synthesis is a forcing function for shape confirmation; the requirements-only unified plan is where the substance lives. If a bullet reads like a doc paragraph, it's wrong-shaped — the agent has compressed horizontally (fewer bullets) without compressing vertically (less per bullet), and the cap is meaningless if individual bullets bloat to fill it.

Two tests:

- **Read-aloud test**: would two product collaborators *say* this bullet, or would they *write* it in a spec? Say = right. Write = re-cut to a sentence or cut.
- **Single-sentence test**: can the bullet land in one sentence? If it needs semicolons stringing clauses or a list within the bullet, it's probably two decisions sharing a bullet — split (and re-cut for count) or cut to the higher-level one.

Bad vs good — detail level:

| Too detailed (wrong) | Conversational (right) |
|---|---|
| Per-channel mute scoped to notification rules; mute applies to all events through that rule including @mentions, DMs forwarded as notifications, and bot messages; persists 24h with extension | Per-channel over per-user — support team isn't a single user |
| Rule-delete loss path is silent and could surprise users who configured extended mutes; consider a confirmation dialog, soft-delete with state preservation, or a 7-day undo window | Rule-delete silently loses pause state — confirm no warning needed |

The "What we're building" prose obeys the same discipline: 1–3 sentences describing the shape, not an enumeration of requirements. If the prose lists what's in / what's out / what's how, it has become a doc preview — cut to shape only.

### Anti-patterns

Each anti-pattern below produces a bullet that fails its section's keep test, or a scoping synthesis that drifts back toward the comprehensive-audit failure mode.

- **Naming implementation detail in any bullet**: file paths, module names, exact JSON keys, HTTP status codes, error message wording, SQL syntax. The synthesis is scope-only; implementation is ce-plan's job. These granularity rules apply to every bullet in every section.
- **Re-stating a Q&A turn verbatim** ("you said you wanted X"): transcript, not scoping synthesis. Reframe forward-looking ("X means Y for the doc") or cut.
- **Re-stating the Phase 2 approach the user already picked**: the approach was chosen before Phase 2.5 — its mention belongs in one sentence of "What we're building," not as a call-out.
- **Padding a section to meet a bullet count**: render-conditional means empty is allowed. Omit the section entirely rather than fill it with weak items.
- **Pasting the three-bucket internal draft verbatim into chat**: that was the old shape and the volume problem it produced is why stage 2 exists. Compose internally, derive scoping synthesis sections, present compressed.
- **Floating questions adjacent to stage 2**: if a question genuinely cannot be defaulted, pause synthesis and resolve it before presenting. Pick the question shape that matches: a blocking multiple-choice tool when options are bounded and meaningfully distinct, open-ended when option sets would unintentionally influence the user's answer per Interaction Rule 5(a). Integrate the answer, then present the scoping synthesis. Never present the scoping synthesis with adjacent floating questions — that gives the user no clear resolution path.

---

## Prompt templates

This is directional guidance — adjust phrasing to fit dialogue context. Open-ended feedback per Interaction Rule 5(a) (an option menu would unintentionally influence the user toward the parts the menu lists, away from anything else they might want to change).

**Prose discipline for "What we're building" (required):** forward-looking (what *will* be in the doc), not retrospective (what's been discussed). Lead with the actual thing being built in plain words. No qualifiers ("comprehensive," "thoughtful," "substantive"). No re-stating dialogue context the user just lived through. If the work can't be said in 1–3 sentences without filler, the synthesis isn't ready yet.

### Path B template (questions were asked)

```
Based on our dialogue, here's the scope I'm proposing for the Product Contract:

**What we're building:** [1–3 sentences — the shape that emerged from dialogue, forward-looking, plain words]

**Key trade-offs:** [render only when real trade-offs exist]
- [explicit choice + brief why]
- [explicit choice + brief why]

**What's not in scope:** [render only when deferred items would surprise a reader]
- [deferred item]
- [deferred item]

**Call outs:** [render only when one or more survived the keep test]
- [scope-level fork or non-obvious consequence the user can affirm or redirect]
- [same]

[Closing line — name what actually happens next, per "the confirmation" above. Doc expected (the common case):] Confirm and I'll write the requirements-only plan next, drawing on our dialogue and this synthesis. Or tell me what to change — even something I captured correctly earlier is fair game to revise (you may have changed your mind or want to correct an unstated assumption). [Doc already ruled out — user declined one, or the skip criteria plainly hold:] Confirm and we're done here — the scope above carries straight into [the destination this run established; drop this clause when none was named]. Or tell me what to change — even something I captured correctly earlier is fair game to revise.
```

### Path A template (no questions were asked — typically Phase 0.2 short-circuit)

```
Proposing: [1–3 line shape — what the doc will say in plain words].

No open decisions — writing the requirements-only plan now. Interrupt if the shape is wrong.
```

Proceed to Phase 3 doc-write in the same turn — do NOT end the turn waiting for an acknowledgment. The "interrupt if wrong" affordance means the user can revise after the doc lands, not before. Lightweight Path A docs are short, so post-hoc revision is cheap.

Ask the user open-ended on Path B (no `AskUserQuestion` menu). The justification is Interaction Rule 5(a) in SKILL.md — an option menu would unintentionally influence the user's feedback toward the parts the menu lists.

### Worked example: compression from internal draft to scoping synthesis (Standard tier)

For a notification-mute feature where the internal draft had 5 Stated items, 4 Inferred items, and 3 Out-of-scope items, the compressed Stage 2 looks like:

```
Based on our dialogue, here's the scope I'm proposing for the Product Contract:

**What we're building:** Per-channel mute on notification rules, with a 24h preset for the support team's 3 AM ping problem. Mute lives on the rule itself and survives rule edits.

**Key trade-offs:**
- Per-channel over per-user — support team isn't a single user
- Mute on the rule, not a separate entity — pause state survives edits

**What's not in scope:**
- Presence-based mute and quiet-hours schedules — deferred for later
- Cross-rule mute groups — would force a rule-grouping concept we don't have

**Call outs:**
- Rule-delete silently loses pause state — confirm no warning needed

Confirm and I'll write the requirements-only plan next, drawing on our dialogue and this synthesis. Or tell me what to change.
```

What got cut from the 12-item internal draft and why:

- Stated items already covered by the "What we're building" prose dissolved silently
- "Use existing rule entity" — mechanical, no real trade-off
- "Use Postgres for persistence" — implementation detail (ce-plan's job), failed granularity rules
- One Out-of-scope item ("no rate limiting") — mechanical exclude, no reader would ask about it
- Three Inferred items rolled into the Trade-offs section as the explicit choices behind them

What survived: a scoping synthesis with substance proportional to the dialogue, bounded at the Standard ceiling of 5 bullets across the three conditional sections — any more would have triggered a re-cut at higher abstraction.

---

## Pre-flight re-review

Before emitting the scoping synthesis, re-read the draft as a user would read it. Two failure modes to catch:

- **The scoping synthesis reads like a Product Contract preview.** Prose enumerates what's in/out, bullets are documentary instead of conversational. The synthesis is a shape-confirmation checkpoint, not a doc preview — if it reads as preview, Phase 2.5 and Phase 3 have collapsed into one step. Revise to conversational shape, or accept that the requirements-only unified plan itself will contain the detail and the synthesis should be lighter.
- **The bullet count fits the cap but each bullet is over-detailed.** Hitting 5 bullets in Standard while each bullet is a paragraph means the agent met the count cap by compressing horizontally (fewer bullets) without compressing vertically (less per bullet). The cap is meaningless if individual bullets bloat to fill it. Re-cut to sentence-level bullets.

This is one mental act — re-read as the user — not a checklist to mechanically run. The forcing function is putting yourself in the user's reading shoes briefly, with explicit attention to detail level alongside the keep tests. Revise before emitting if either failure mode fires.

---

## Re-present after revision; write only on confirm

A revision is not a confirmation. After any user revision (even a trivially-understood swap like "move deferred item X back into scope"), integrate the change, re-present the revised scoping synthesis with the change reflected, and wait for explicit confirmation before writing the doc. The loop is:

1. Present scoping synthesis → user responds
2. User confirms → write the doc
3. User revises → integrate, re-present revised scoping synthesis, return to step 1

Doc-write fires only on explicit confirm or after the soft-cut blocking question's "proceed" option (see below). The confirmation step is what makes the scoping synthesis **confirmed** rather than "agent's last proposal" — never write immediately after a revision, even when the revision is small enough that the agent feels it understood.

---

## Soft-cut on circularity (not iteration count)

Track which scoping synthesis items the user touched per round. The soft-cut blocking question fires **only when the same item is revised twice** (or a third-round revision targets an item already revised in round two). New-item revisions across rounds proceed without limit — revising different aspects of a wrong scoping synthesis is exactly what the mechanism should support.

**Identity across rounds is by decision dimension, not surface wording or section.** A revision may cause stage 2 to re-derive — the same underlying decision can come back rephrased, merged with another bullet, or moved to a different section (e.g., what was a Trade-off in round one becomes a Call-out in round two after the user pushed back). "Same item" means the same underlying decision regardless of which section currently holds it. When a re-cut collapses multiple prior bullets into one, the new combined bullet inherits the "touched" status of any of its constituents — soft-cut fires if any underlying decision was already revised once before.

When the soft-cut fires, use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi) with two options:

- `Proceed and write the requirements-only plan`
- `Hold off — keep discussing before the doc`

Fall back to a numbered list in chat only when no blocking tool exists or the call errors. Never silently skip.

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

After user confirmation (or after the soft-cut decision proceeds), Phase 3 writes the requirements-only unified plan. The internal draft does NOT carry into the artifact as a `## Synthesis` section. Only the "What we're building" prose embeds, as `## Summary` inside the Product Contract. Internal-draft content dissolves into the Product Contract's body sections:

| Internal-draft element | Where it goes in the doc |
|---|---|
| "What we're building" prose | `## Summary` (1–3 lines, forward-looking, what's proposed) |
| Stated bullets | `## Requirements` (numbered R-IDs, full detail) and where relevant `## Problem Frame` for narrative context |
| Inferred bullets | `## Key Decisions` (with rationale) — bets the user accepted in dialogue become decisions in the doc. |
| Out-of-scope bullets | `## Scope Boundaries` |

The chat-time Trade-offs section dissolves into `## Key Decisions` (the explicit choices acknowledged in chat become documented decisions). The chat-time What's-not-in-scope section dissolves into `## Scope Boundaries`.

Session-settled decisions are the exception to the Stated → Requirements row: each routes to `## Key Decisions` carrying its `session-settled:` annotation — a user-confirmed choice, never softened into an inferred bet or recorded as an assumption. This holds equally when the artifact is written from context without dialogue.

No italic capture-context note (e.g., "Captured at Phase 2.5..."). It would leak engineering process into an artifact whose readers do not need that signal.

The doc's `## Summary` and `## Problem Frame` must serve distinct purposes — see `references/brainstorm-sections.md` "Discipline: Summary vs Problem Frame" for the rules.
