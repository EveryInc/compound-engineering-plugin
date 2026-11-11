# Per-finding Walk-through

This reference defines Interactive mode's routing question, the per-finding walk-through the user can choose from it, and the completion report every ending path emits.

Interactive mode only.

---

## Routing question (the one question)

After the applied changes land, everything still pending is either the **grouped confirmation** (proposed fixes the agent has chosen that still need edit approval) or a **decision** the user must make. Ask about both in one question. Do not ask a separate batch confirmation first, and do not follow a choice with a preview-and-proceed question: the report rendered in the same turn already shows every proposed fix and the recommended action on every decision, and that report is what the user approves.

Skip the question when nothing is pending. **Skipping the question never skips the completion report:** emit it, then continue to the Phase 5 completion return. When the user or calling agent already chose how to handle the pending items, follow that choice. A choice that covers only the decisions does not approve the proposed fixes; ask this question about the proposed fixes alone.

**Same-turn presentation before routing (required).** Before asking, emit the Interactive Phase 4 presentation (`references/review-output-template.md`) as user-visible assistant text **in the same turn**. Content composed only in hidden thinking or reasoning does not count; this is the same bar as the Preview event in `references/bulk-preview.md`. If that presentation has not appeared in this turn, do not invoke the blocking-question tool.

These do **not** satisfy the requirement:

- a structured non-interactive result printed in an earlier turn (including one shown beside a `ce-plan` handoff menu)
- a one-line count such as "1 confirmation, 1 decision"
- relying on handoff-menu context or earlier scrollback

On interactive entry after a same-session non-interactive pass (e.g. `ce-plan` "Decide on the review's open items"), still render the interactive presentation before routing, but only for what is still pending. Changes the earlier pass already applied and reported get one summary line, not a second list. Reusing the prior pass's applied-fix and R29 decision state is fine; skipping presentation is not.

Use the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability; do not search for another host's tool name. Fall back to presenting the options as a numbered list only when no such tool is in the list, a real question call errors, or the runtime mode does not expose one. When the user has not chosen a route, never silently skip the question. Rendering the routing question as narrative text without the numbered-list fallback is a bug.

**Stem:** name what is pending by its themes, not a bare count, then ask. For example: `Five fixes align the tier names and add two missing cross-references, and two decisions need your call. How should I handle them?` A bare count makes the reader scroll back to answer.

**Options (fixed order; drop the clauses about whichever of the two groups is empty):**

```
A. Auto-resolve with best judgment — apply the proposed fixes and the recommended action on each decision
B. Review each finding one by one — accept the recommendation or choose another action
C. Apply the proposed fixes and append the decisions to the doc's Open Questions section
D. Report only — change nothing further
```

When only proposed fixes are pending, C has nothing to defer and is dropped. No option is labeled `(recommended)`: the right route depends on whether the user wants to engage, trust, triage, or skim, not on the shape of the finding set. The per-finding `(recommended)` marker lives inside the walk-through.

**Append-availability adaptation.** When `references/open-questions-defer.md` has cached `append_available: false` at Phase 4 start (e.g., read-only document, unwritable filesystem), drop option C and add one line to the stem explaining why (e.g., `Append to Open Questions unavailable — document is read-only in this environment.`). The walk-through's per-finding Defer is suppressed by the same signal, so the user never sees Defer offered at one level and omitted at the other.

**Dispatch by selection:**

- **A** — apply every proposed fix and execute each decision's `recommended_action` from synthesis step 3.5b. The proposed fixes and the decisions' Applies land together in the single end-of-walk-through Apply pass; Defer → `references/open-questions-defer.md`; Skip → recorded as no-action. Before acting, run the withdrawal check below against each decision. When append is unavailable, a Defer recommendation becomes Skip, and the completion report says so. Then emit the completion report.
- **B** — load this walk-through (per-finding loop) over the proposed fixes and then the decisions. Apply decisions accumulate in memory; Open-Questions defers run immediately via `references/open-questions-defer.md`; Skip decisions are recorded as no-action; `Auto-resolve with best judgment on the rest` goes through `references/bulk-preview.md`.
- **C** — apply every proposed fix in the end-of-walk-through Apply pass, and route every decision through `references/open-questions-defer.md`. Then emit the completion report.
- **D** — apply nothing further; report the proposed fixes as not applied and the decisions as open. Emit the completion report and continue to the Phase 5 completion return.

Whichever option runs, when an Apply or Skip completes for a finding the document already records under `Deferred / Open Questions` (an earlier non-interactive pass wrote it), follow the removal rule in `references/open-questions-defer.md`.

---

## Entry (walk-through mode)

The walk-through receives, from the orchestrator:

- The proposed fixes in the grouped confirmation, then the decisions synthesis step 3.7 left for the user, each group in severity order (P0 → P1 → P2 → P3). A proposed fix's recommended action is Apply. Applied findings are already reported as changes, and FYI-subsection findings (anchor `50`) appear in the Phase 4 report only; neither has a walk-through entry.
- The run id for artifact lookups (when applicable).

Each finding's recommended action has already been settled by synthesis step 3.5b (Lead Recommended Action). The walk-through shows that recommendation from the merged finding's `recommended_action` field and does not recompute it.

---

## Per-finding presentation

Each finding is presented in two parts: a terminal output block carrying the explanation, and a question via the platform's blocking question tool carrying the decision. Never merge the two into a single surface: the terminal block uses markdown and remains mandatory; the question uses plain text. On modal harnesses, text immediately before a blocking dialog is easy to miss, so the question string **also duplicates** a compact decision-first copy of What's wrong / Proposed fix / If left as-is (see "Question string" below). That duplication is additive: emitting only the question, or stuffing the fix into an option label instead of the question string, is a bug. The no-fix sub-question and the Defer-failure sub-question appear in the same modal dialogs but keep their existing shorter stems. The regular per-finding question is the high-volume path whose option labels alone are not enough to decide.

### Terminal output block (print before asking the question)

Render as markdown. Labels on their own line, blank lines between sections:

```
## Finding {N} of {M} — {severity} {plain-English title}

Section: {section}

**What's wrong**

{plain-English problem statement from why_it_matters}

**Proposed fix**

{suggested_fix — rendered per the substitution rules below: prose-first, intent-language}

**If this is left as-is**

{one sentence naming the concrete downstream cost}

{Conflict-context line, when applicable — see below}
```

The substitutions below are how this block applies the shared rendering floor (`references/rendering-floor.md`), which is the canonical source for the decision-first field order, the opaque-token policy across all three token classes, and the code-span budget. The terminal block's field order (title → What's wrong → Proposed fix → If this is left as-is) is the floor's order rendered as a labeled block; keep the two in sync.

Substitutions:

- **`{plain-English title}`** — a 3–8 word summary suitable as a heading. Derived from the merged finding's `title` field but rephrased so it reads as observable consequence (e.g., "Implementers will pick different tiers" rather than "Section X-Y lists four tiers"). For document-review findings, observable consequence is the *effect on a reader, implementer, or downstream decision*, not runtime behavior.
- **`{section}`** — from the finding's `section` field.
- **Opaque identifiers** — any token the user would have to open the document or the code to understand carries a short plain-language handle on its first mention. This covers both document-defined IDs (`R6`, `U3`, `KTD2`) and implementation identifiers the document happens to name — functions, files, variables, and line references such as `run_codex_cmd`, `$PEERLOG`, or `peer-job-runner.py`. Gloss each on first mention (e.g., `R6 (suppress peer panels on low-stakes calls)`); never leave a bare identifier as the block's only description of what it names. Keep the ID itself: it anchors the finding for anyone editing the document, and later mentions within the same block stay bare so the block scans. The handle arrives with the finding — the reviewer that raised it wrote it into the finding's fields, so render what you were given rather than rebuilding it here. If a finding arrives without one, look it up in the document before rendering rather than passing a bare token through, and treat that as a defect in the reviewer's output, not the normal path. This applies to `{section}` and to the body fields below. It is the one exception to rendering those fields as-is, and it is narrow: gloss the identifier at first mention and leave the surrounding prose untouched. This follows the self-contained-rendered-lines rule in `references/synthesis-and-presentation.md`. Respect the code-span budget below.
- **`why_it_matters`** — from the merged finding's `why_it_matters` field, held to the same limit on detail as `suggested_fix` below. Rules:
  - **First sentence states the consequence, and contains no identifier at all.** What goes wrong, for whom. A reader who skimmed the document once must be able to judge it without looking anything up.
  - **At most two further sentences of mechanism**, glossed per the identifier rule above. Mechanism explains *how* the problem arises; it is supporting detail, not the finding.
  - **Everything past that is detail the user can ask for.** When the merged field carries more (file-level tracing, multi-hop interactions, competing call paths), leave it out and add one closing line offering it (e.g. `Ask for the trace if you want the call-path detail.`). Do not print it by default. A block that traces internals across several paragraphs is not more rigorous; it moves the reading cost onto a user who has less document context than the review does, and serving that user is why this walk-through exists.
- **`suggested_fix`** — from the merged finding's `suggested_fix` field. Render as prose describing intent, not as raw markup. The user's job is to trust or reject the action — they don't need to review exact text. Rules:
  - **Default — one sentence describing the effect.** What does the fix achieve, and where does it live? Prefer intent language over quoted text.
    - Good: `Drop the Advisory tier from the enum; advisory-style findings surface in an FYI subsection at the presentation layer.`
    - Good: `Add a deployment-ordering constraint requiring Units 3 and 4 in a single commit.`
    - Bad: `Change "autofix_class: [auto, gated_auto, advisory, present]" to "autofix_class: [safe_auto, gated_auto, manual]" in findings-schema.json on line 48.` — too syntax-focused for a decision loop
  - **Code-span budget** — at most 2 inline backtick spans per sentence, each a single identifier, flag, or short phrase (e.g., `` `safe_auto` ``, `` `<work-context>` ``). Always leave a space before and after each backtick span.
  - **Raw code blocks** — only for short (≤5-line) genuinely additive content where no before-state exists. Above 5 lines, switch to a summary.
  - **No diff blocks.** Document mutations render as prose.
- **`If this is left as-is`** — one sentence naming the concrete downstream cost of not acting: what breaks, for whom, at what point. This is the line the user's decision turns on when they have not read the document as closely as the review did, so it must be evaluable on its own — no identifier the user would have to look up, no appeal to a claim only the reviewer can verify. When the honest answer is that the cost is small or speculative, say so plainly rather than inflating it.
- **Conflict-context line (when applicable)** — when contributing personas implied different actions for this finding and step 3.5b resolved the disagreement, explain that briefly. Example: `Coherence recommends Apply; scope-guardian recommends Skip. Agent's recommendation: Skip.` The orchestrator's recommendation, the value chosen by the lead agent, is what the menu labels "recommended."

### Question string (decision-focused; self-sufficient on modal harnesses)

After the terminal block renders, call the host's blocking question tool already in the current tool list. Most adapters expose a single question string, so the stem and the compact decision fields share that string. Shape:

```
Finding {N} of {M} — {severity} {short handle}.
What's wrong: {consequence-first sentence, no opaque identifier}
Proposed fix: {intent sentence}
If left as-is: {one-sentence downstream cost}
{Action framing in a phrase}?
```

Where:

- **Short handle** matches the `{plain-English title}` from the terminal block heading.
- **What's wrong / Proposed fix / If left as-is** — the same three fields as the terminal block, compressed to one sentence each, obeying the shared rendering floor (`references/rendering-floor.md`) opaque-token policy and two-anchor budget. Derive them from the block already rendered; do not invent a second narrative. Always emit all three labeled lines. When the merged finding has no `suggested_fix`, write `Proposed fix: none` — do not drop the line.
- **Action framing** — one phrase describing what the single recommended action does, as a yes/no question. Examples: `Apply the rename?`, `Defer to Open Questions since the tradeoff is genuine?`, `Skip since the document already resolves this elsewhere?`.

Never enumerate alternatives in the question string. Ask one recommendation as a yes/no; the option list carries the alternatives. When the recommendation is close, show the disagreement in the terminal block's conflict-context line, not as a multi-option stem. Do not put the proposed-fix text into the Apply option label; keep labels short per "Options" below.

If the blocking-question tool rejects the multi-line question string (schema / length / single-prompt constraints on a host), retry once with a short action-framing stem only; the terminal block already carries What's wrong / Proposed fix / If left as-is. Do not skip the question, and do not treat that retry as license to omit the three fields on hosts that accept the full string.

### Confirmation between findings

After the user answers and before printing the next finding's terminal block, emit a one-line confirmation of the action taken. Examples: `→ Applied. Edit staged at "Scope Boundaries" section.`, `→ Deferred. Entry appended to "## Deferred / Open Questions".`, `→ Skipped.`

### Options (four; adapted as noted)

These four options are the **complete, exclusive set** for the regular per-finding question. Fixed order: never reorder, never add, never substitute. In particular, **`Acknowledge` is NOT one of these options.** It appears only in the no-fix sub-question described under "Per-finding routing" below, which is asked only when the user picks Apply on a finding that lacks a `suggested_fix`. Importing `Acknowledge` into the regular menu (in place of D, or as a fifth option) is a bug: it silently drops the `Auto-resolve with best judgment on the rest` workflow shortcut, and offering `Acknowledge` outside the no-fix path mislabels the user's choice in the completion report's bucket counts.

```
A. Apply the proposed fix
B. Defer — append to the doc's Open Questions section
C. Skip — don't apply, don't append
D. Auto-resolve with best judgment on the rest
```

**Mark the recommendation chosen by the lead agent with `(recommended)` on its option label.** Required, not optional. Only A, B, or C can carry it: synthesis emits `recommended_action` as Apply/Defer/Skip, which maps to A/B/C. D (`Auto-resolve with best judgment on the rest`) is a workflow shortcut for bulk execution across remaining findings, not a finding-level resolution action, so it is never marked `(recommended)`.

```
A. Apply the proposed fix  (recommended)
B. Defer — append to the doc's Open Questions section
C. Skip — don't apply, don't append
D. Auto-resolve with best judgment on the rest
```

When reviewers disagreed or evidence cuts against the default, still mark one option, whichever synthesis produced, and show the disagreement in the conflict-context line.

### Remedy sub-question (asked before the regular menu)

Ask this only when the finding actually carries competing remedies. **The reviewer contract does not produce them in the ordinary case.** `suggested_fix` is a single committed recommendation and `references/subagent-template.md` forbids alternative menus outright, so a plain `manual` finding arrives with one fix or none, and there is nothing to choose between.

The source that does carry them is synthesis step 3.5 (Resolve Contradictions): a contradiction between personas becomes one combined finding holding both perspectives, framed as a tradeoff for the user to settle. That is a genuine fork, and it is what this sub-question exists for. Ask which perspective to take **before** the regular menu, rather than presenting one as though it were the only one.

When the finding carries a single remedy, skip this and go straight to the regular menu. Do not manufacture a second option to make the fork appear; an invented alternative is worse than the four-option menu, which at least states the choice honestly.

This is a sub-question in the same sense as the no-fix `Acknowledge` sub-question below: the four options above remain the complete, exclusive set for the regular per-finding question, and this is asked ahead of it.

```
This problem is settled; the remedy is not. Which do you want?

A. <first remedy, one line of what it commits to>
B. <second remedy, one line of what it commits to>
```

Name what *differs* between the options, not what they share; the reader already accepted the problem. Carry the answer into the regular menu as "the proposed fix," then run A-D as normal, so Defer and Skip stay reachable after a remedy is chosen.

Do not ask this sub-question with a single option. One option means there is nothing to choose, which makes it a report rather than a question; route the finding by the ordinary table instead.

### Adaptations

- **N=1 (exactly one pending finding):** the terminal block's heading omits `Finding N of M` and renders as `## {severity} {plain-English title}`. The question string's first line drops the position counter, becoming `{severity} {short handle}.` The three compact decision-field lines and the action-framing line remain. Option D (`Auto-resolve with best judgment on the rest`) is suppressed because no subsequent findings exist; the menu shows three options: Apply / Defer / Skip.

- **Open-Questions append unavailable** (read-only document, write-failed): when `references/open-questions-defer.md` reports the in-doc append mechanic cannot run, option B is omitted. The question string appends one line explaining why (e.g., `Defer unavailable — document is read-only in this environment.`). The menu shows three options: Apply / Skip / Auto-resolve with best judgment on the rest. Before rendering options, remap any per-finding `Defer` recommendation from synthesis to `Skip` so the `(recommended)` marker lands on an option that's actually in the menu. Show the remap on the conflict-context line (e.g., `Synthesis recommended Defer; downgraded to Skip — document is read-only.`).

- **Combined N=1 + no-append:** the menu shows two options: Apply / Skip.

Only when no such tool is in the list, a real question call errors, or the platform has no blocking question tool, fall back to presenting the options as a numbered list and waiting for the user's next reply.

---

## Per-finding routing

For each finding's answer:

- **Apply the proposed fix** — add the finding's id to an in-memory Apply set. Advance to the next finding. Do not edit the document now; Apply accumulates for end-of-walk-through batch execution. **No-fix check:** if the merged finding has no `suggested_fix` (possible on `manual` findings where the persona flagged the issue as observation without a concrete resolution), Apply is not executable. Do not add the finding to the Apply set. Instead, ask the no-fix sub-question described below before advancing.
- **Defer — append to Open Questions section** — invoke the append flow from `references/open-questions-defer.md`. The walk-through's position indicator stays on the current finding during any failure-path sub-question (Retry / Fall back / Convert to Skip). On success, record the append location and reference in the in-memory decision list and advance. On conversion-to-Skip from the failure path, advance with the failure noted in the completion report.
- **Skip — don't apply, don't append** — record Skip in the in-memory decision list. Advance. No side effects.
- **Auto-resolve with best judgment on the rest** — exit the walk-through loop. Show the bulk preview from `references/bulk-preview.md`, scoped to the current finding and everything not yet decided. The preview header reports the count of already-decided findings ("K already decided"). If the user picks Cancel from the preview, return to the current finding's per-finding question (not to the routing question). If the user picks Proceed, execute the plan per `references/bulk-preview.md`: Apply findings join the in-memory Apply set with the ones the user already picked, Defer findings go through `references/open-questions-defer.md`, Skip is a no-op. Then proceed to end-of-walk-through execution.

### No-fix sub-question (Apply picked on a finding with no `suggested_fix`)

This sub-question, and the `Acknowledge without applying` option in particular, is **exclusive to the no-fix path**. It is asked only after the user picks Apply on a finding whose merged record has no `suggested_fix`. Do not show this sub-question, or its `Acknowledge` option, in the regular per-finding menu. The regular menu's fourth option is always `Auto-resolve with best judgment on the rest` (per "Options" above), never `Acknowledge`.

Synthesis step 3.5b demotes the default recommendation from Apply to Defer for any merged finding without a `suggested_fix`, so `(recommended)` never lands on Apply for these findings. But the menu still lets the user pick Apply manually. When that happens, do not add the finding to the Apply set: the execution pass has no edit to apply, which would either fail the batch or record a misleading "applied" outcome.

Ask a blocking sub-question using the platform's question tool. The stem explains why Apply is not executable in one line, then offers three self-contained options. The position indicator stays on the current finding while the sub-question is open.

**Stem:** `Apply isn't executable for this finding — the review surfaced the issue without a concrete fix. How should the agent proceed?`

**Options (fixed order):**

```
A. Defer to Open Questions  (recommended)
B. Skip — don't apply, don't append
C. Acknowledge without applying — record the decision, no document edit
```

**Routing:**

- **A. Defer to Open Questions** — invoke the append flow from `references/open-questions-defer.md` as though the user had originally picked Defer. Failure-path handling is identical (Retry / Fall back / Convert to Skip). On success, record the append location in the decision list (annotated `redirected from Apply — no suggested_fix`) and advance.
- **B. Skip** — record Skip in the decision list (annotated `redirected from Apply — no suggested_fix`). Advance. No side effects.
- **C. Acknowledge without applying** — record the finding in the decision list as `acknowledged` (annotated `Apply picked but no suggested_fix — no edit dispatched`). Do not add to the Apply set. Advance. The completion report lists each Acknowledged finding with its reason and counts them separately (see the unified completion report below). For round-to-round suppression (distinct from report display), Acknowledged decisions carry forward in the multi-round decision primer as a rejected-class decision alongside Skip and Defer, so round-N+1 synthesis suppresses re-raises via R29. The user saw the finding, chose not to act, and wants it recorded; that is equivalent to Skip for suppression purposes but is reported separately.

**Availability adaptation.** When `references/open-questions-defer.md` has cached `append_available: false` for the session, omit option A and add one line to the stem explaining why (e.g., `Defer unavailable — document is read-only in this environment.`). The menu becomes Skip / Acknowledge without applying, with Skip labeled `(recommended)`.

---

## Withdrawing findings the user's earlier answers resolved

Earlier decisions carry information forward. Apply stages a fix that does not execute until end-of-walk-through, so later findings are still being presented against the pre-edit document. Skip and Defer settle a premise. Freeform text, an `Other` answer, or per-option notes may assert a fact the document does not state; the no-freeform-authoring rule below forbids the user hand-writing a *fix*, not supplying information.

**When a finding's turn arrives, judge it against everything the user has said so far.** If earlier answers already resolve or contradict it, do not render its terminal block or ask its question. Say succinctly, in plain user-facing language, what the finding was and which earlier answer settled it, enough that the user can tell it was handled rather than lost, and can object if the agent read them wrong. Follow the one-line shape of "Confirmation between findings" above. Then advance to the next finding, or to the completion report if none remain.

Evaluate this at the point the finding would have been presented; do not scan ahead after every answer.

**An explicit user decision outranks an automatic withdrawal.** Withdrawal is the agent's inference about a finding the user has not yet answered. When the user has already decided a finding, or has explicitly asked to see a particular finding, honor that; do not retroactively convert it to `withdrawn` on the strength of a later answer.

Record each as `withdrawn` in the decision list, noting which decision retired it. The completion report counts withdrawn findings separately. It carries forward in the decision primer as a rejected-class decision, alongside Skip, Defer, and Acknowledge, **only when a user decision durably settled it**: a settled premise (Skip/Defer) or a user-asserted fact. Those are user judgments that the finding need not be acted on, so R29 should suppress a round N+1 re-raise since the document itself never changed.

**An Apply-triggered withdrawal never carries forward as rejected-class.** It is a *prediction* that a staged fix will resolve the finding, not a user judgment that it needn't be. The Apply runs only at end-of-walk-through, and its landing is neither certain nor proof that the finding is resolved: it can fail outright, or land in the wrong place and leave the withdrawn finding's evidence untouched (R30 verifies the applied fix's own fingerprint, not the withdrawn finding's). So round N+1 re-synthesis, not R29, is the check. If the fix genuinely resolved the finding, fresh personas will not regenerate it against the edited document. If it did not, whether the Apply failed or landed ineffectively, the finding comes back to the user instead of being silently suppressed. When such an Apply fails outright during execution (write error, or the defensive no-fix fallback), also list its reverted withdrawals in the completion report's failure section as returned to scope, so the user sees them in-run rather than only next round.

---

## Override rule

"Override" means the user picks a different preset action (Defer or Skip in place of Apply, or Apply in place of the agent's recommendation). No inline freeform custom-fix authoring: the walk-through is a decision loop, not a pair-editing session. A user who wants a variant of the proposed fix picks Skip and hand-edits outside the flow; if they also want the finding tracked, they can Defer first and edit afterward.

---

## State

Walk-through state is **in-memory only**. The orchestrator maintains:

- An Apply set (finding ids the user picked Apply on)
- A decision list (every answered finding with its action and any metadata like `append_location` for Deferred or `reason` for Skipped)
- The current position in the findings list

Nothing is written to disk per decision except the in-doc Open Questions appends (which are external side effects and cannot be rolled back). An interrupted walk-through (user cancels the prompt, session compacts, network dies) discards all in-memory state. Apply decisions have not been dispatched yet (they batch at end-of-walk-through), so they are cleanly lost with no document changes.

State does not persist across sessions. This mirrors `ce-code-review`'s walk-through state rules.

---

## End-of-walk-through execution

After the loop ends, either because every finding has been answered or because the user took `Auto-resolve with best judgment on the rest → Proceed`, the walk-through hands off to the execution phase:

1. **Apply set:** in a single pass, the orchestrator applies every accumulated Apply-set finding's `suggested_fix` to the document. Document edits happen directly via the platform's edit tool; ce-doc-review has no batch-fixer subagent (per scope boundary), so the orchestrator performs the single-file edits itself in the document's native format, preserving its existing structure and never inserting markdown syntax into HTML. **Defensive no-fix check:** before making the edit for each Apply-set entry, verify the merged finding carries a `suggested_fix`. If it does not (the decision-time no-fix check in "Per-finding routing" should prevent this, but treat it as a defensive fallback), skip the edit, record the finding in the completion report's failure section with reason `Apply skipped — no suggested_fix available`, and continue the batch. Do not fail the entire pass because one Apply-set entry lacks a fix.
2. **Defer set:** already executed during the walk-through via `references/open-questions-defer.md`. Nothing to do here.
3. **Skip:** no-op.

After execution completes (or after `Auto-resolve with best judgment on the rest → Cancel` followed by the user working through remaining findings one at a time, or after the loop runs to completion), emit the unified completion report described below.

---

## Unified completion report

Every ending path of Interactive mode emits a completion report: the walk-through finishing or bailing via `Auto-resolve with best judgment on the rest → Proceed`, any routing choice, and the case where nothing was pending so the question was skipped.

The reader has already seen the Phase 4 report and every per-finding confirmation in this session. The completion report tells them only what they cannot already see: what failed, which outcomes differ from what the report showed, and the state the document is now in. Do not list the applied fixes, FYI observations, or residual concerns a second time.

### Required content

- **Failures first:** any Apply that failed (e.g., document write error, or the defensive no-fix fallback skipping an Apply-set entry), and any Open-Questions append that failed.
- **Outcomes the reader did not choose one at a time:** after a bulk path (routing A or C, or `Auto-resolve with best judgment on the rest`), one line per finding that was Deferred (with its append location), Skipped (with a one-line reason), or Withdrawn (with the decision that retired it). Applied findings were already shown with their fix; count them instead of listing them. After a full one-by-one walk-through, the per-finding confirmations already carried each outcome, so this list is empty.
- **Acknowledged entries, on every path:** one line each with the acknowledgement reason (e.g., `Apply picked but no suggested_fix available`), since that outcome is easy to mistake for an applied fix.
- **One count line by action:** e.g., `Applied 19 changes (16 proposed fixes, 3 decisions); deferred 1 to Open Questions; skipped 1.` Include an `acknowledged` or `withdrawn` count only when non-zero.
- **The document's state:** one line saying whether it is ready to use, or what is still open and where.

### Nothing-pending case

When the applied changes left nothing to ask, the report is the Phase 4 presentation plus one closing line. For example:

```
All findings resolved — 3 fixes applied. The plan is ready.
```

---

## What the walk-through may write

The walk-through is read-only with respect to the project except for three permitted writes: the in-memory Apply set / decision list (managed by the orchestrator), the in-doc Open Questions appends (external side effects managed by `references/open-questions-defer.md`), and the end-of-walk-through batch document edits (the orchestrator's final Apply pass). Persona agents remain strictly read-only. Unlike `ce-code-review`, there is no fixer subagent; the orchestrator makes the document edits directly.
