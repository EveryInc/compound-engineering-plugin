# Scoping Synthesis

**Scoping synthesis ≠ plan doc.** The scoping synthesis is the scope/decisions checkpoint that plan-write (Phase 5.2) consumes as input. It surfaces decisions the agent CAN make at synthesis time: scope-level (does this plan cover the full brainstorm or narrow to a subset?), approach (extend existing pattern vs. introduce new abstraction), test approach. It does NOT surface decisions plan-write produces: PR count, commit/branch sequencing, effort or time estimates, Implementation Unit lists, exact file paths, test command recipes. If the synthesis claims any of those, it has leaked plan-write thinking and must be re-cut to scope-decisions only. Even when the agent has formed plan-write opinions earlier in the session, the synthesis stays at scope level — the user is being asked to affirm scope, not to rubber-stamp implementation.

**Two-stage shape: internal draft, then chat-time synthesis.** The synthesis is composed in two stages. Stage 1 is an internal three-bucket draft (Stated / Inferred / Out of scope) the agent uses to think comprehensively about scope. Stage 2 is the chat-time output: your understanding of the problem (solo) or the brainstorm anchor (brainstorm-sourced), the scope, and the "Call outs" where the user might redirect. The user only sees stage 2. The internal draft still informs the plan body via the doc-shape routing below; it just doesn't reach the user verbatim. This split exists because the comprehensive audit shape produced too much detail for the user to weigh in on.

**Three-bucket structure is the internal draft, not the user-facing artifact.** It does its scope-thinking job during stage 1 and dissolves when Phase 5.2 writes the plan: Stated content informs the Product Contract's Requirements and Problem Frame, success signals inform its Success Criteria — from either bucket on a confirmed interactive run, Stated only on the unconfirmed paths, session-settled product decisions inform its Key Decisions, Inferred content informs Key Technical Decisions / Implementation Units (normal interactive mode) or the Planning Contract's `### Assumptions` (non-interactive mode, or an interactive `SKIP_SCOPING_CONFIRM` skip run), Out-of-scope content informs the Product Contract's Scope Boundaries. The plan has no parallel `## Synthesis` section — only the stage-2 summary embeds, under the Product Contract's `### Summary`. See "Doc shape after confirmation" below for the exact routing and section nesting.

This content is loaded when a synthesis-summary phase runs in ce-plan. There are two variants — they share structure but differ in timing and content focus:

- **Solo variant** (Phase 0.7, Solo-Mode Scoping Synthesis): runs after Phase 0.4 bootstrap and Phase 0.6 depth classification, before Phase 1 research begins. Catches scope misinterpretation before sub-agent dispatch is spent. Full breadth — problem frame, intended behavior, success criteria, in/out scope.
- **Brainstorm-sourced variant** (Phase 5.1.5, Brainstorm-Sourced Scoping Synthesis): runs after Phase 1 research, before Phase 5.2 plan-write. Focuses on plan-time decisions (which files/modules to touch, which patterns extended vs. introduced new, test scope, refactor scope). Brainstorm-validated WHAT is assumed and not re-stated.

Both variants share the two-stage shape, the call-out rules, soft-cut behavior, and the doc-shape routing. In non-interactive (headless) mode, both compose the internal draft and skip stage 2 — the user-facing compression is moot when there is no synchronous user. The internal draft dissolves into the plan body the same way, with Inferred bets routing to a `## Assumptions` section. See "Headless mode (shared)" below for the full routing.

---

## Stage 1: internal three-bucket draft (shared)

The internal draft is structured in three labeled buckets. Items may appear in two buckets when meaningfully both — flag the inclusion-then-exclusion as Inferred so the reasoning is captured.

- **Stated** — what the user said directly (in the original prompt, prior conversation, dialogue answers, or the upstream brainstorm doc when present). Items here have explicit user-language anchors.
- **Inferred** — what the agent assumed to fill gaps. Scope boundaries the user never explicitly named, success criteria extrapolated from intent, technical assumptions made because the brief interview didn't probe them. The Inferred list is the most actionable bucket — items here are the agent's bets that the user can correct.
- **Out of scope** — deliberately excluded items. Adjacent work the agent considered but decided not to include, refactors, nice-to-haves, future-work items.

Session-settled decisions are **Stated with provenance**, never Inferred — the user's conversation acts anchor them by definition. Carry each into the Stated bucket with its class and rejected alternative.

This draft is internal. Do not paste it verbatim into chat. Compose it as a thinking step, then derive stage 2 from it.

---

## Stage 2: chat-time scoping synthesis

Stage 2 is what the user actually sees. Its job is to let the user check, in one read, whether you understood them and which calls they might want to change before research or plan-write is spent. Write it in your own words from your understanding. Show what you understood and what you assumed, not what the user said; a restatement of the prompt, the brainstorm, or the user's answers shows recall rather than understanding.

### Solo shape (Phase 0.7)

There is no upstream document, so the synthesis is the only check on what you think the user wants. Solo runs usually have little dialogue, so your picture of the goal is the least tested part of the run.

1. **The problem** — 1–2 sentences, as prose: what is wrong or wanted, who it affects, why it matters now, and what will be true when this is done. State the goal behind the request, not the request reworded. When the user never said why, say what you inferred so they can correct it.
2. **Scope claim** — prose on what the plan will target and what it will not, at a level the user can confirm or redirect. Describe what the plan targets as a whole, not the requested features listed back; answers the user gave during intake show up here as part of that description.
3. **Carrying forward** and **Call outs**, below.

### Brainstorm-sourced shape (Phase 5.1.5)

The brainstorm already confirmed the problem and the WHAT; do not restate them. Show the HOW decisions the brainstorm did not make.

1. **Anchor** — one sentence naming the brainstorm's scope in its own vocabulary, so a reader days later knows which artifact this plan targets.
2. **Plan-specific scope** — whether the plan covers the full brainstorm or a subset, which adjacent refactors are in or out, and the test scope at scenario level. When the plan covers everything with nothing added, say that in one line.
3. **Carrying forward** and **Call outs**, below.

### Shared rules

- **Carrying forward:** one line per session-settled decision carried in from before this skill started (the invoking conversation or a passed brief): decision, class, and what it was chosen over. These are statements, never call-outs; a fork the user already closed is not a fork. Answers given in this skill's own questions get no line, and neither do decisions already recorded in an upstream brainstorm, which the user confirmed there.
- **Call outs** are the calls another reasonable agent might have made differently and the user can correct cheaply now: a real fork in approach, a non-obvious default that changes what the plan does, a non-obvious exclusion, or a bet that is cheap to fix now and expensive after research or plan-write. Omit the header when there are none.
- Leave out anything the user cannot judge without reading code, and anything plan-write produces: Implementation Unit lists, PR count or sequencing, estimates, line numbers, method signatures, data shapes, exact names, error wording, and test commands. Solo syntheses stay at product level. Brainstorm-sourced syntheses may name a module or pattern only when choosing it is the decision. Name each decision by its effect on what the user gets, not by its mechanism ("a rerun can't charge an invoice twice", not "idempotency keys"). Name requirements and examples in plain words, never by bare ID (`R3`, `AE2`). Leave out mechanical choices with no real alternative, counts that only attest completeness ("all nine requirements covered"), and anything the summary already says.
- Keep each bullet to one sentence a collaborator would say aloud, with no nested bullets. Include only what the user needs to know to judge whether the plan is aimed right: your understanding of the problem and scope (solo) or the plan-specific scope (brainstorm-sourced), and the decisions or assumptions that would change the plan if they were wrong. Everything else belongs in the plan. A larger scope means naming those decisions at a higher level, not adding lines. Nothing goes above the synthesis: no process narration, repo findings, approach pitch, file list, or rationale block.
- When the session already holds detailed material (research, code, an earlier plan), expect the internal draft to over-share and compress it before stage 2. More context means more to compress, not more to show.
- If a question genuinely cannot be defaulted, resolve it before presenting the synthesis. Never present the synthesis with open questions beside it.
- Write the synthesis through the `ce-noslop` skill. Ask for the confirmation open-ended, without an `AskUserQuestion` menu (Interaction Rule 5(a)).

### Confirmation lines

Solo, opening with "Based on your request" (add "and our brief discussion" only when Phase 0.4 actually asked clarifying questions):

```
Based on your request, here's the scope I'm proposing to plan against:

**The problem:** ...
**Scope:** ...
**Carrying forward:** ...
**Call outs:**
- ...

Confirm and I'll proceed to research, drawing on this scope. (You can also redirect to `ce-brainstorm` if this is bigger than you initially thought — I'll stop here and load it for you.)
```

Brainstorm-sourced:

```
The brainstorm scopes [one-sentence anchor]. This plan [plan-specific scope].

**Carrying forward:** ...
**Call outs:**
- ...

Confirm and I'll write the plan next, drawing on the brainstorm, research, and this synthesis.
```

Example, solo, for a request to add a nightly job that charges overdue invoices:

```
Based on your request, here's the scope I'm proposing to plan against:

**The problem:** Someone spends every morning charging overdue invoices by hand. The goal is to get that time back without a customer ever being charged wrongly.

**Scope:** An unattended nightly run that charges each overdue invoice's saved card and marks it paid only on success. No retries, customer emails, or admin UI in this plan.

**Call outs:**
- Failed charges are left open for the team to follow up, and I'll produce a morning list of what failed and why
- I'm treating "never charge twice for one invoice" as a hard requirement, including when a run is retried

Confirm and I'll proceed to research, drawing on this scope.
```

---

## When to skip the blocking confirmation

The auto-proceed path (announce without waiting for user confirmation) applies only when **plan depth is Lightweight AND there are no call-outs**. For Standard or Deep plans, always ask for confirmation even when there are no call-outs — the plan's substance is what calls for the checkpoint, not how much dialogue preceded it. A Deep plan with rich silent decisions and a 1-3 line summary is exactly the case where rubber-stamping is most likely; the explicit confirmation request gives the user a real chance to push back before research or plan-write proceeds.

When auto-proceed applies (Lightweight + zero call-outs), emit a one-line announcement and continue:

```
Planning: [1-3 line summary]

No open decisions to weigh in on — proceeding to [research / plan-write]. Interrupt if I have the scope wrong.
```

The announcement is mandatory when skipping — silent proceeding is not allowed. The "why" (no forks worth flagging) must be visible.

For Standard/Deep with no call-outs, the confirmation lines still apply; the "Call outs:" header is simply omitted. The user gets the summary plus the explicit confirmation request.

There is a third skip condition: the **opt-in `SKIP_SCOPING_CONFIRM` setting** (Phase 0.0 — `confirm:auto` token or the `plan_skip_scoping_confirm` config key). When it resolves to skip, the confirmation auto-proceeds for *any* tier or call-out count — the user has pre-authorized it. The announcement is still mandatory (it names that confirmation is off and that inferred scope landed in `## Assumptions`), and the skip is scoped to this confirmation only: genuine blocking questions and the Phase 5.4 menu still run. This differs from headless mode only in that announcement — headless has no synchronous user to announce to.

When the opt-in skip applies, emit this announcement — **not** the auto-proceed template above. The opt-in skip applies to *any* tier and call-out count, so claiming "No open decisions to weigh in on" would be false whenever call-outs survived; the announcement instead names that confirmation is off and that inferred scope is recorded under `## Assumptions`:

```
Planning: [1-3 line scope claim]

Scoping confirmation is off, so I'm proceeding to [research / plan-write] without waiting. Inferred scope is recorded under Assumptions in the plan — interrupt if I have it wrong.
```

---

## Revision loop (shared)

**A revision is not a confirmation.** After any user revision (even a trivially-understood swap), integrate the change, re-present the revised stage 2 with the change reflected, and wait for explicit confirmation before writing the plan. The loop is:

1. Present stage 2 → user responds
2. User confirms → write the plan
3. User revises → integrate, re-present revised stage 2, return to step 1

Plan-write (Phase 5.2) runs only after an explicit confirm or after the soft-cut blocking question's "proceed" option. Never write immediately after a revision, even when the revision is small enough that the agent feels it understood — the confirmation step is what makes the synthesis **confirmed** rather than "agent's last proposal."

---

## Solo variant (Phase 0.7)

Runs only when:
- Phase 0.2 found no upstream brainstorm doc
- AND Phase 0.4 stayed in ce-plan (did not route to ce-debug, ce-work, or universal-planning)
- AND Phase 0.5 cleared (no unresolved blockers)
- AND not on Phase 0.1 fast paths (resume normal, deepen-intent)

Each guard is an explicit conditional in `references/intake.md`, not implicit. The solo variant does NOT run on resume/deepen paths, on paths that hand the task to another skill, or on brainstorm-sourced paths.

**Content focus**: full-breadth internal draft. Phase 0.4 bootstrap is brief by design ("ask one or two clarifying questions"), so the agent has made substantial inferences before Phase 0.7 runs. The Inferred bucket in the internal draft matters most here — the agent's bets are widest. Most of those inferences should not reach the user; show only the forks they can meaningfully redirect.

**Counter-warning for rich-context invocations.** When the inference source is *not* just Phase 0.4 bootstrap — e.g., a prior in-conversation validation agent, completed sibling work units earlier in the same session, or a planning artifact already in the conversation — the temptation is to dump that material into call-outs verbatim. A bet that's already been validated upstream is **Stated** (internal), not Inferred (internal); a bet whose specifics belong in plan-body is named at decision-level in the call-out regardless of how much detail upstream context provided. If recent turns produced detailed code, file paths, or research artifacts, expect the internal draft to over-share and compress proactively before stage 2. A session-settled decision is the strongest form of already-validated content — carry it forward as a `Carrying forward:` line, never re-ask it.

**Why pre-research, not pre-write**: research effort would be wasted if scope is wrong. Catching scope errors before sub-agent dispatch (Phase 1.1's repo-research-analyst, learnings-researcher, etc.) saves token and time cost.

---

## Brainstorm-sourced variant (Phase 5.1.5)

Runs only when:
- Phase 0.2 found upstream brainstorm doc (brainstorm-sourced invocation)
- AND not on Phase 0.1 fast paths

**Content focus**: plan-time decisions only. The brainstorm + R1 synthesis already validated WHAT to build; the internal draft and stage 2 show HOW the plan will execute that work — decisions the brainstorm did not make.

Items to include in the internal draft:
- **Files/modules to touch (and not touch)** — what the implementation reaches into
- **Patterns extended vs. introduced new** — architectural decisions the agent made within confirmed scope (R2's content focus, not bias toward either direction)
- **Test scope** — which existing-but-untested code is in/out of test scope for this work
- **Refactor scope** — adjacent cleanup, if any, going to deferred items vs. active diff
- **Cross-cutting impact** — auth, migrations, shared types when they're touched

Most of these should not become separate call-outs. Show only the forks where another reasonable agent might choose differently and the user can correct cheaply now.

**Reads from the Product Contract, not a synthesis section**: the upstream artifact is a requirements-only unified plan (`product_contract_source: ce-brainstorm`), not a separate brainstorm doc, and it has no `## Synthesis` section (the synthesis is a chat-time artifact in ce-brainstorm; only the prose summary embeds, under the Product Contract). Phase 5.1.5 derives plan-time decisions from the Product Contract's sections — Summary, Problem Frame, Requirements, Key Flows, Scope Boundaries — plus Phase 1 research. Legacy standalone requirements docs (`origin: docs/brainstorms/...`) and older brainstorms that may carry a legacy `## Synthesis` section still work; that content is treated as supplementary, not authoritative, with the Product Contract / body sections taking precedence.

**Why pre-write, not pre-research**: brainstorm doc + R1 synthesis already validated WHAT, so research is well-targeted. Plan-time decisions emerge during research and structuring (Phases 1-4), so pre-write catches them at the latest cheap moment — before Phase 5.2 commits the plan to disk.

---

## Soft-cut on circularity (shared)

Track which call-outs the user touched per round. The soft-cut blocking question is asked **only when the same call-out is revised twice** (or a third-round revision targets a call-out already revised in round two). New-call-out revisions across rounds proceed without limit.

**Identity across rounds is by decision dimension, not surface wording.** A revision may cause stage 2 to re-derive — the same underlying fork can come back rephrased, merged with another call-out, or split into two. "Same call-out" means the same decision being made (e.g., "where does the scan run" stays one decision whether it's worded as "promote scans the working-dir snapshot" or "scan target: pre-copy working dir"). When a re-cut collapses multiple prior call-outs into one, the new combined call-out inherits the "touched" status of any of its constituents — the soft-cut question is asked if any of those underlying decisions was already revised once before.

When the soft-cut question is due, use the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name) with two options:

- `Proceed and continue to [research / plan-write]`
- `Hold off — keep discussing before continuing`

Presence in the list is proof; never call a user-facing question tool to discover whether it exists. Fall back to a numbered list on the host's user-visible chat surface only when no such tool is in the list or a real question call errors. Never silently skip.

---

## Headless mode (shared)

When the skill is invoked from an automated workflow such as LFG or any `disable-model-invocation` context, the skill runs in non-interactive mode (no synchronous user). The artifact is read by downstream skills (ce-doc-review, ce-work) and human reviewers (PR review).

**Stage 2 is moot in headless mode.** Compose the internal draft (stage 1) as usual, but skip the chat-time compression — there is no synchronous user to confirm to, no call-outs to derive, no auto-proceed announcement. Route the internal draft directly into the plan body via the doc-shape table below.

**Per-variant behavior** (the timing matters for which phases follow):

- **Solo variant (Phase 0.7)**: runs *before* research. Compose the internal draft and continue to Phase 1 research as normal. Inferred content is held until plan-write (Phase 5.2), where it routes to `## Assumptions`.
- **Brainstorm-sourced variant (Phase 5.1.5)**: runs *after* research, before plan-write. Compose the internal draft and proceed to Phase 5.2 plan-write. Inferred content routes to `## Assumptions`.

**Shared behavior across both variants:**

- **No user prompt; no stage 2; no auto-proceed announcement.** All three are moot.
- **Route internal-draft content with mode-aware shape** (nested under Product Contract / Planning Contract in a `ce-unified-plan/v1` artifact; top-level `##` headings in a legacy standalone plan):
  - **Stated** content → Product Contract `### Requirements` (user-stated constraints, traced to origin's R-IDs when present), and where relevant `### Problem Frame` for narrative context
  - **Success signals — Stated only on these paths** → Product Contract `### Success Criteria` when its catalog entry applies. An *inferred* success signal does not come here: these paths never confirmed it, so it stays under `### Assumptions` with the other un-validated bets.
  - **Out-of-scope** content → Product Contract `### Scope Boundaries`
  - **Inferred** content → Planning Contract `### Assumptions` — explicitly labeled as un-validated agent bets. Do NOT route Inferred items into Key Technical Decisions or Implementation Units; that would make un-validated bets indistinguishable from user-confirmed decisions.
  - **Session-settled decisions** (including those from a passed brief) → settled product decisions route to their labeled Product Contract Key Decisions with exact `Governs R…` links; settled planning/how decisions route to labeled Key Technical Decisions. Neither belongs in `### Assumptions` — they are user-confirmed; the `### Assumptions` rule covers agent-inferred bets only. A brief entry that fails the settlement test (cannot state its rejected alternative) demotes to a directive or open area instead.

The `### Assumptions` section appears in non-interactive plans and in interactive plans where the user opted into `SKIP_SCOPING_CONFIRM` — both cases proceed without confirming Inferred bets, so those bets must stay visibly labeled. A normal interactive plan doesn't need it (Inferred bets either get user-corrected via call-outs and become Key Technical Decisions, are revised away, or were judged not worth a call-out and dissolved into Implementation Units silently).

**On a normal interactive plan, two Inferred items are exempt from that silent dissolve**, named by the bucket's own vocabulary above: *success criteria extrapolated from intent*, and *scope boundaries the user never explicitly named*. Both route to their Product Contract sections — `### Success Criteria` and `### Scope Boundaries` — whether or not they became call-outs. The call-out rules decide what the user is asked about; it does not decide whether product scope reaches the document. Every other Inferred item keeps the dissolve behavior described above.

The exemption is scoped to that confirmed interactive path and does **not** apply on headless or `SKIP_SCOPING_CONFIRM` runs. Those proceed without confirming any Inferred bet, so the `### Assumptions` rule governs every one of them — an un-validated guess must stay labeled there rather than appearing as an unlabeled product statement.

This restores the audit visibility the original design intended (un-validated bets must not propagate as authoritative content), but shows them under their own label rather than hiding them. Downstream review (ce-doc-review, ce-work, human PR review) can scrutinize Assumptions specifically.

---

## Self-redirect (shared)

If the user response indicates they're in the wrong skill or want a different workflow:

- **Solo variant**: common redirects include "this is bigger than I thought — let me brainstorm first" (suggest `ce-brainstorm`), "this is just a fix, no plan needed" (suggest `ce-work`), or "I need to investigate first" (suggest `ce-debug`).
- **Brainstorm-sourced variant**: less common, but possible — "actually this scope is wrong, take it back to brainstorm" (suggest `ce-brainstorm` to revise the upstream doc).

In either case: stop ce-plan, suggest the alternative skill, offer to load it in-session. Don't push back or argue — the user's redirect signal is the deliberate choice.

---

## Doc shape after confirmation

After user confirmation (or after the soft-cut decision proceeds), Phase 5.2 writes the plan doc. The internal draft does NOT carry into the plan as a `## Synthesis` section. Only the stage-2 scope summary embeds, under the Product Contract's `### Summary`; a confirmed solo problem statement anchors `### Problem Frame`. Internal-draft content dissolves into the unified plan's sections. In a `ce-unified-plan/v1` artifact these destinations are nested — Summary, Problem Frame, Requirements, and Scope Boundaries live under `## Product Contract`; Key Technical Decisions and Assumptions live under `## Planning Contract`; Implementation Units is its own top-level section. (Legacy standalone plans without `artifact_contract` keep these as top-level `##` headings.)

| Internal-draft element | Where it goes in the unified plan |
|---|---|
| Summary (stage 2) | Product Contract `### Summary` (1-3 lines prose, forward-looking) — rewrite to plan convention if the chat-time summary used bullets. Solo variant: scope being targeted. Brainstorm-sourced: implementation approach |
| The problem (solo, as confirmed) | Product Contract `### Problem Frame` — the confirmed problem anchors that section's narrative, expanded rather than copied |
| Stated bullets | Product Contract `### Requirements` (R-IDs) and where relevant `### Problem Frame` for narrative context |
| Inferred bullets | Planning Contract `### Key Technical Decisions` (with rationale) and Implementation Units when the bet drives a structural choice. In non-interactive mode **or an interactive `SKIP_SCOPING_CONFIRM` skip run**, route to Planning Contract `### Assumptions` instead — both proceed without confirming the bets, so they must stay labeled; see Headless mode above. |
| Out-of-scope bullets | Product Contract `### Scope Boundaries` — including the `#### Deferred to Follow-Up Work` subsection when relevant |
| Success signals | Product Contract `### Success Criteria` when its catalog entry applies — quality, metric, or handoff signals the Requirements don't already carry. This row **overrides** the generic Stated and Inferred rows for those items: a success signal routes here *instead of*, never in addition. Stated signals always. An **Inferred** signal only on a confirmed interactive run; on a `SKIP_SCOPING_CONFIRM` skip run it goes to `### Assumptions` with the other unconfirmed bets, exactly as the Inferred row above routes them. |
| Session-settled product decisions | Product Contract `### Key Decisions`, carrying the `session-settled:` annotation and exact `Governs R…` links. Settled planning/how decisions route to `### Key Technical Decisions` instead |

No italic capture-context note (e.g., "Captured at Phase 0.7..."). It would leak engineering process into an artifact whose readers do not need that signal.

The Product Contract's `### Summary` and `### Problem Frame` must serve distinct purposes: Summary answers "what is this plan proposing?" (forward-looking, 1-3 lines); Problem Frame answers "why does this proposal exist?" (backward-looking, paragraphs). Don't restate the proposal in Problem Frame; don't pad Summary with situational context.
