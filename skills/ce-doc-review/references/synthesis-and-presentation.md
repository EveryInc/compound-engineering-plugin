# Phases 3-5: Synthesis, Presentation, and Next Action

## Phase 3: Synthesize Findings

Process findings from all agents through these steps in order. Each step depends on the previous one. Together they move every finding through the same lifecycle: **Raised → (Confidence Gate | FYI-eligible | Dropped) → Deduplicated → Classified → SafeAuto | GatedAuto | Manual | FYI**. Re-evaluate each finding's state at every step; do not carry an assumption from an earlier step forward as a shortcut.

### 3.1 Validate

Check each agent's returned JSON against the findings schema:

- Drop findings missing any required field defined in the schema
- Drop findings with invalid enum values (including the pre-rename `auto` / `present` values from older personas — treat those as malformed until all persona output has been regenerated)
- Note the agent name for any malformed output in the Coverage section

**Do not narrate remap / validation diagnostics to the user.** Schema-drift notes ("persona X returned unknown enum Y, remapped to Z"), persona-prompt-drift commentary, and other validator-internal diagnostics are maintainer-facing information. They do not belong in the Phase 4 output the user reads. If a persona's output is malformed, the only user-visible consequence is a Coverage-row annotation (e.g., the persona shows fewer findings or a `malformed` marker). Everything else stays internal.

### 3.1b Admit Findings by Consequence

Establish what, if anything, prevents the document from guiding the agreed work. Retain a concern when its instructions cannot jointly satisfy the agreed contract, or when following the document, its references, and active project conventions would cause a demonstrated wrong outcome or worthwhile avoidable work. Judge an omission against what a competent implementer can already derive. A missing restatement, finer threshold, or additional procedure is not a defect when the existing instructions suffice.

Investigate available facts before accepting a reviewer's claim. Establish the problem independently of its suggested fix: a useful-looking addition does not prove anything is missing. Keep the smallest supported correction that addresses the actual consequence. Verification changes must test the required outcome, not merely produce a passing check.

Only concerns that meet this condition enter confidence scoring, recommendations, or output. This includes FYIs and deferred questions. Drop rejected claims from the working set; they require neither a user decision nor an automatic edit. Zero findings is valid.

### 3.2 Confidence Gate (Anchor-Based)

Route each finding by its `confidence` anchor value. Anchors are discrete integers (`0`, `25`, `50`, `75`, `100`). Their behavioral definitions are documented in `references/findings-schema.json` and embedded in the persona rubric (`references/subagent-template.md`). Anchors replaced the earlier continuous 0.0-1.0 scale with per-severity thresholds: document review does not warrant a different threshold per severity, and coarse anchors stop reviewers from gaming the score with false precision.

| Anchor | Meaning | Route |
|--------|---------|-------|
| `0`    | False positive or pre-existing issue | Drop silently |
| `25`   | Might be real but could not verify | Drop silently |
| `50`   | Verified, useful advisory concern below the actionable bar | Show in FYI subsection |
| `75`   | Double-checked, will hit in practice, directly impacts correctness | Enter actionable tier (classify by `autofix_class`) |
| `100`  | Evidence directly confirms; will happen frequently | Enter actionable tier (classify by `autofix_class`) |

- **Dropped silently** (anchors `0` and `25`): these do not appear in any output bucket — not as findings, not as FYI observations, not as residual concerns. Record the total drop count as a Coverage footnote line when non-zero: `Dropped: N (anchors 0/25 suppressed)`. The footnote appears below the Coverage table. This is the canonical location for drop-count reporting — not the summary line and not a per-persona Coverage column. Omit the footnote when N is zero.
- **FYI-subsection** (anchor `50`): show in the FYI subsection of the presentation regardless of `autofix_class`. These do not enter the walk-through or any bulk action; they are observations and force no decision. Only useful advisory observations that passed 3.1b (admission by consequence) land here; FYI is not a destination for rejected nits.
- **Actionable** (anchors `75` and `100`): enter classification. Route by `autofix_class` (see 3.7, Route by Autofix Class).


### 3.3 Merge Duplicate Findings

Two findings are duplicates when **one fix would resolve both**. Decide that by reading them — `title`, `section`, `why_it_matters`, `evidence`, and `suggested_fix` — not by comparing strings. Reviewers describe the same problem in different words as a matter of course, so wording similarity is not the test and matching titles are not required.

Apply the test across personas and across sections:

- **A shared section is evidence, never a requirement.** Two reviewers commonly attach the same problem to different sections, and just as commonly attach different problems to the same one. Neither settles it — the fix does.
- **When unsure, do not merge.** When you cannot tell whether one fix resolves both, keep them separate. A surviving duplicate costs the user one extra line. A wrong merge buries a real concern inside an unrelated finding, where nothing signals that it went missing.
- **Opposing recommendations never merge.** If one finding says cut and the other says keep, preserve both for contradiction resolution in 3.5 (Resolve Contradictions). That is a disagreement, not a duplicate.

When findings merge:

- Keep the highest severity and the highest confidence anchor. If anchors tie, keep the finding appearing first in document order — deterministic, not probabilistic.
- Union the evidence arrays and note every contributing reviewer (e.g., "coherence, feasibility").
- **Retain each constituent finding as a record**, with its own `section`, `title`, and `evidence` intact. Round-to-round memory (R29, R30, the decision primer, and the open-questions dedup key) matches on a single finding's section, title, and evidence overlap. A merged group has none of those, so collapsing the constituents away would make every finding the user already settled come back on the next round.
- **Coverage attribution:** attribute the merged finding to the persona with the highest confidence anchor; on a tie, to the persona appearing first in document order. Decrement the losing persona's Findings count and its route bucket so totals stay exact.

**Merging never drops.** A merge regroups findings; it never removes one from the review. Every finding that survives the lead agent's review reaches the user, either as its own entry or inside the merged finding that carries its concern. Rejected claims are recorded internally, not lost through merging.

**Cross-model returns.** A `<reviewer-name>-<provider>` return merges with its in-process twin under the same one-fix test. Whether that merge counts as *independent corroboration* is decided in 3.4 (Cross-Persona Agreement Promotion) by the return's `independence_verified` flag, not here.

**The merged set is the record.** The merged finding set produced by this step is the single source of truth for both Coverage counts and rendered output. Each finding appears in exactly one place in the output — counted once in its route bucket, rendered once at its own position.

### 3.4 Cross-Persona Agreement Promotion

Agreement can strengthen the evidence but does not make an issue important. Raise confidence by at most **one anchor step** only when the combined evidence meets the next level's definition. Several reviewers noticing a nit does not make it worth fixing. A significant defect needs no second vote to be retained.

For local personas, independence requires separate dispatched contexts; an inline fallback cannot trigger anchor promotion. Cross-model corroboration requires `independence_verified: true`, at least one in-process contributor, and an independence-verified peer. A missing or false flag cannot trigger anchor promotion. Cursor default/Auto is not verified independence unless the run recorded which model actually answered. Peer-only agreement never promotes, and additional peers never stack the promotion.

Record any justified promotion in the Reviewer column as `(+1 anchor)`, naming the cross-model reviewer and its verified model or route legibly. Keep the stored reviewer identities. Findings dropped at anchors 0/25 do not return through agreement. Corroboration never grants permission to apply fixes: the limits on peer-only findings in 3.6 (Resolve Who Can Choose the Fix) and 3.7 (Route by Autofix Class) still apply.

### 3.5 Resolve Contradictions

Check conflicting claims against the document, project evidence, and requested outcome before asking the user to decide. Drop a disproven claim or a preference with no significant benefit. Disagreement alone does not prove a defect. Record the reason internally so the rejected claim does not return when findings are combined or actions are chosen.

If several fixes remain possible and choosing one needs an unresolved user preference or scope decision, keep one combined `manual` finding. Include both views and the decision needed. Set `finding_type` from the document's actual defect, not the disagreement. Keep opposing fixes together even when they affect different sections; never schedule both as separate edits.

### 3.5b Lead Recommended Action

Remove rejected claims from the retained review set and record why internally. A rejection is a completed judgment, not a recommendation for the user to confirm. Only surviving problems receive a `recommended_action` for presentation.

Choose that action from the verified problem, benefit of the correction, agreed scope, and existing decisions. Recommend Apply when the correction is justified and concrete. Recommend Defer when a worthwhile problem cannot yet be resolved. A recommendation to Skip a proposed remedy belongs in the user-facing review only when a consequential unresolved choice still requires the user; explain that choice rather than asking them to ratify your rejection.

When reviewers recommended different actions, keep one line explaining the lead agent's choice and its evidence. The walk-through and bulk preview use that `recommended_action` without recalculating it. Recommendations do not grant edit permission. After 3.6 and 3.7, check that each Apply still has a specific edit in `suggested_fix`; otherwise recommend Defer.

### 3.6 Resolve Who Can Choose the Fix

Each retained problem leaves this step with a correction the agent can choose or a specific unanswered question only the user can settle. Determine that from the current document, evidence, and user decisions. A reviewer's classification or a previous review's section heading is not a user decision and does not carry forward as the answer.

Use `manual` only when you can state the missing input or consequential choice, why the agreed outcome and constraints leave it unresolved, and how the user's answer changes the work. A description of a technical fix does not establish such a question. When the document already determines the outcome, choose the smallest supported correction within its constraints; the existence of other workable methods does not transfer that choice to the user.

Use `safe_auto` for a mechanical correction with one right answer and `gated_auto` for a chosen correction that changes meaning. Step 3.7 (Route by Autofix Class) determines whether the correction may be applied. Keep prior user decisions and actual applied changes; reclassify the remaining reviewer proposals from their evidence.

**Fixes found only by another model.** These never qualify for `safe_auto`. The lead may choose a supported `gated_auto` correction within the agreed outcome and constraints, but its own investigation is not independent review. When missing local corroboration is the only obstacle to an otherwise authorized, worthwhile correction, obtain the limited independent check described in `references/document-intake.md` before returning it for approval. Keep the original attribution and record any new review separately. Silent application requires that local reviewer to independently identify the same issue (R18), plus the confidence and edit-authority requirements in 3.7. Missing, failed, or disagreeing local evidence leaves the peer-only restriction in place.

### 3.7 Route by Autofix Class

**Severity and autofix_class are independent.** A P1 finding can be `safe_auto` if the correct fix is obvious. Importance does not establish who can choose the fix or permission to edit.

**Anchor and autofix_class are also independent.** The anchor decides where the finding goes (FYI or actionable); `autofix_class` decides what happens to an actionable finding. Both are consulted in this step.

Findings reaching 3.7 already have anchor `50`, `75`, or `100`; 3.2 (Confidence Gate) dropped anchors `0` and `25`.

**Check obligations before autofix routing.** An **obligation** is a retained defect whose remedy follows from a decision the document already made. This classifies findings that passed 3.1b (admission by consequence); it does not create findings because a unit is less detailed than the contract it follows.

A finding is **not** an obligation merely because its fix would improve the document. Project evidence may justify a technical correction without making it an existing requirement. Step 3.6 decides who can choose the correction; grouping it here does not reopen that judgment.

An obligation that changes meaning uses `gated_auto` and must include a specific `suggested_fix`. A mechanical `safe_auto` correction keeps its class, subject to the restriction on findings raised only by another model. If investigation still leaves no specific edit to apply, exclude it from the group and return the missing information to the calling agent.

This is a per-finding test against one document. It needs no comparison to other findings and is independent of the merging in 3.3 (Merge Duplicate Findings).

Group obligations still needing approval under the implementation unit or the section they affect. They belong in one approval batch, not the per-finding decision walk-through. **Render the group in full before asking the confirmation question.**

Obligation grouping governs presentation, not edit authority. Route authorized corrections to Apply before constructing the approval batch.

**Evidence, choosing a fix, and permission to edit are separate checks.** Confidence describes support for the finding. Step 3.6 decides whether the agent can choose the fix. This step decides whether and how the reader must approve the edit.

**Establish edit authority from the request and the document's settled decisions.** Explicit read-only, report-only, or narrower edit restrictions take precedence. By default, this review may correct a proven defect in the reviewed document when the correction is necessary to implement a concrete decision already made there. Name that decision and how the defect prevents it from being carried out. Broad goals such as quality, safety, or clarity do not establish a particular correction. The correction must preserve user commitments and require no unresolved user input; choosing among equivalent technical methods does not itself create a user decision.

Apply such a correction at anchor `100` when a local reviewer supports the finding and a specific `suggested_fix` is ready. This may be `safe_auto` or `gated_auto`: changing wording or meaning to fulfill an existing decision is different from making a new decision. Findings raised only by another model retain the R18 restriction, and session-settled annotations remain protected.

An explicit user or caller grant may cover additional technical corrections at anchor `75` or `100` within its named scope and established contract. It does not authorize changing product outcomes, constraints, or user-reserved choices unless the grant expressly includes them. Confidence, reviewer agreement, and non-interactive mode never supply edit authority.

For findings not covered by the authority above, use the routes below. Show the chosen fixes together for one approval. Ask separate questions only for essential information or choices the user still needs to supply. Another reasonable implementation does not, by itself, create a user decision.

| Anchor | Autofix Class | Route |
|--------|---------------|-------|
| `100`  | `safe_auto`   | Apply when the request permits default editing. Report in the change list. Mechanical corrections only — evidence directly confirms and there is one right answer. Requires `suggested_fix`; demote to `gated_auto` if missing. |
| `100`  | `gated_auto`  | Grouped confirmation. A concrete fix that touches meaning, so the reader sees it before it lands — but batched, not asked one at a time. Requires `suggested_fix`; demote to `manual` if missing. |
| `100`  | `manual`      | A decision: the reader chooses. Never a question about whether to proceed with something already settled. Ask **which remedy** only when the finding carries competing ones; see below. |
| `75`   | `safe_auto`   | Grouped confirmation. Unattended apply stays reserved for anchor `100`, where the evidence directly confirms the fix. Requires `suggested_fix`; demote to `manual` if missing. |
| `75`   | `gated_auto`  | Grouped confirmation. Requires `suggested_fix`; demote to `manual` if missing. |
| `75`   | `manual`      | A decision. Same treatment. |
| `50`   | any           | Show in the FYI subsection regardless of `autofix_class`. Do not enter the Decisions list or any batch action. These are observations. |

**A useful improvement is not automatically an entailed correction.** When no concrete settled decision requires the change and no edit grant covers it, retain a worthwhile, chosen remedy in the grouped confirmation. Keep choices the user must still make in Decisions.

Earlier blanket application of `gated_auto` corrections selected genuine product forks (#1373). The boundary above therefore requires a concrete prior decision or an explicit edit grant; classifying a fix as technical or inevitable cannot establish either.

Present three groups: **applied** corrections, **proposed fixes** still needing approval, and **decisions** that the user must still make. Proposed fixes include entailed corrections that still lack sufficient confidence or independent reviewer support, and worthwhile improvements outside current edit authority. Follow the shared rendering rules so the reader can distinguish these groups.

**Present the unresolved choice, when one remains.** Step 3.6 decides whether the user must choose; the number of proposed remedies does not. The reviewer contract supplies one recommendation, so use the regular walk-through question for a genuine decision with one remedy. When contradiction resolution in 3.5 (Resolve Contradictions) preserves competing remedies, present both views and ask which remedy. Do not invent alternatives to create a choice.

**No silent fixes from another model alone.** Findings raised only by another model never go directly to Apply, regardless of confidence or class (R18). Show a verified, chosen fix for approval with the others. Keep `manual` when a user decision or essential information is still missing. The source of a finding limits silent application, not the lead agent's ability to investigate and recommend.

**Check the correction against the problem.** Before applying or recommending an edit, establish that it resolves the retained problem and preserves the agreed outcome with no unnecessary new requirements. Verify prescribed mechanisms against the actual project interfaces and behavior; where implementation can choose the mechanism, state the result it must achieve. A fix that merely looks more explicit is not ready to apply.

Check edit authority separately. A concrete `suggested_fix` does not grant permission, and a choice reserved for the user remains `manual`. A `safe_auto` fix that changes meaning or has more than one correct answer can become `gated_auto` only after the agent has resolved the choice. Mechanical corrections must follow directly from the document's authoritative content. A visual aid may be updated to fix an inconsistency, but not deleted merely because it repeats prose.

### 3.8 Sort

Sort findings for presentation: P0 → P1 → P2 → P3, then by finding type (errors before omissions), then by confidence anchor (descending: `100` first, then `75`, then `50`), then by document order (section position) as the deterministic final tiebreak.

### 3.9 Suppress Restatements in Residual Concerns and Deferred Questions

Apply 3.1b to each reviewer's `residual_risks` and `deferred_questions`, not just its findings. Keep an uncertain concern only when project evidence shows why it matters to the requested outcome. Rejected preferences and unsupported possibilities do not return through another output field.

Compare the remaining risks and questions with the final findings, including FYI items. Omit any that repeat a concern already covered by a finding or its recommended fix. Keep distinct, relevant uncertainty; similar wording alone does not prove duplication.

Run this pass on the merged set across all personas. Record the count suppressed as duplicates as a Coverage footnote line when non-zero: `Restated: N (residual/deferred items suppressed as duplicates of actionable findings)`. Ordering: footnotes appear in the sequence `Dropped:`, `Restated:` below the Coverage table, each on its own line. Omit any footnote whose count is zero.

## Phase 4: Apply and Present

**Rendering floor (applies to every finding, every mode — read before rendering anything).** Read
`references/rendering-floor.md` now. It is the single source of truth for the decision-first field
order (Recommendation → Consequence-if-unchanged → Change → Basis → Trace-on-request), the rule for
identifiers the reader cannot understand without opening the document, the tracker, or the code
(document IDs, ticket and PR references, code symbols; at most two per block), and the code-span
budget. Every place findings are shown below — the structured non-interactive result, the interactive
template, and the bulk preview — maps its own layout onto that floor. Do not restate a weaker rule for
one of them; the floor is authoritative.

**User-facing vocabulary rule (applies to ALL user-visible output in Phase 4, not just the rendered template).** Internal enum values — `safe_auto`, `gated_auto`, `manual`, `FYI` — stay inside the schema and synthesis prose. Every word the user sees in Phase 4 output, including free-text narration between sections, transition preambles, status lines, and confirmation messages, MUST use user-facing vocabulary, named by where 3.7 routed the finding: "applied changes" or "fixes" (what 3.7 routed to Apply), "proposed fixes" (the grouped confirmation), "decisions" (the Decisions list), "FYI observations" (anchor `50`). The only exception is the `Tier` column in rendered tables, which is explicitly documented as showing the internal enum for transparency. Do NOT emit narration like "safe_auto fixes applied" or "N gated_auto findings" — write "fixes applied" or "N proposed fixes" instead.

### Apply the findings 3.7 routed to Apply

Apply, in a single pass, every finding 3.7 routed to Apply. Verify that each edit resolves its finding and preserves the governing contract. Report what changed and which settled decision or supplied edit scope authorized it. Findings outside Apply remain unapplied.

Apply each edit in the document's native format and preserve its existing structure. Never insert markdown syntax into HTML, and for an ID-bearing HTML item mirror the nearest sibling's structure, preserving both its anchor convention and its visible ID text.

- Edit the document inline using the platform's edit tool
- Track what was changed for the "Applied changes" section in the rendered output
- Do not ask for approval; 3.7 already established there is no choice to offer
- Do **not** apply anything 3.7 routed elsewhere. Obligations and peer-only findings diverted out of Apply join the grouped confirmation; anchor `50` goes to FYI; `manual` at any anchor is a decision. If a finding reaches this step from any of those routes, 3.7 was not applied correctly. Re-run it for that finding before continuing.
- Do **not** apply a finding whose only reviewers are cross-model peers, at any anchor or class. 3.7 diverts those to the grouped confirmation when the table would have applied them, and keeps choices that only the user can make in the separate Decisions section after the check in 3.6 of who can choose the fix.
- An applied fix must never remove or reword a `session-settled:` annotation. If a `suggested_fix`'s text would touch one, do not apply it. Send the finding to the grouped confirmation so the user answers before the annotation changes.

List every applied fix in the output summary so the user can see what changed. Use enough detail to convey the substance of each fix (section, what was changed, reviewer attribution). This is especially important for fixes that add content — the user should not have to diff the document to understand what the review did.

### Route Remaining Findings

After the applied changes land, the rest split by the route 3.7 assigned, not by `autofix_class`:

- **Grouped confirmation** — every finding 3.7 sent there, obligations and Apply-diverted peer-only findings among them. One confirmation covering the batch, rendered in full first. In interactive mode this is asked as its own step before the routing question (see `references/walkthrough.md`). It is never folded into the routing question, and a run that reaches routing without asking it leaves the batch unapplied. In non-interactive mode the batch is returned unapplied for the caller to confirm.
- **Decisions** — `manual` findings at anchor `75` or `100`. These enter the routing question and the walk-through (see `references/walkthrough.md`). They carry a which-remedy sub-question only when the finding holds competing remedies, which in practice means a contradiction preserved in 3.5, per the note under the routing table.
- **FYI** — anchor `50`, presentation only, no routing.
- **No remaining user decisions** → skip the routing question. In Interactive mode, still get approval for any proposed fixes, then emit the completion report and return through Phase 5 (Return to the Caller). Applied fixes and answered approvals belong in that report. In Non-interactive mode, return only the structured result described below; an extra interactive report would break the caller's expected format. No remaining decisions does not waive approval for proposed edits or mean those edits are complete.

**Self-contained rendered lines (both modes, including the Applied-fixes list).** Every rendered line —
an applied fix, proposed fix, decision, FYI observation, residual concern, or deferred question —
follows the shared rendering floor (`references/rendering-floor.md`) for every identifier the reader
cannot understand without opening the document, the tracker, or the code, not document IDs alone. A
requirement or unit ID (`R6`, `U3`) keeps its ID and gets a short handle at first mention. A ticket or
PR number (`ESP-3373`, `PR #1776`) is named only when that event changes the decision; otherwise it
moves to the detail offered on request. A function, file, variable, or line reference the document
names (`clearMuxStatus`, `codebookTranscriptMode.ts:46`) is described by the role it plays in the
decision; keep the exact symbol only when precise scope drives the decision. At most two such
identifiers per finding — counted across all its rendered lines, matching the floor's per-block limit —
each resolved at render time against the document in context so it stays accurate after an Apply
renumbers the item. The floor's full decision-first field order
(Recommendation → Consequence → Change → Basis) applies to **actionable findings** — proposed fixes and
decisions. FYI observations, residual concerns, deferred questions, and obligations carry no
recommendation, so each renders as a single line under the identifier rule, not the full field order: a
consequence, concern, or question, and for an obligation the consequence plus its change as intent. A
line whose only description of a referenced item is a bare identifier — of any kind — is not acceptable
rendered output.

**Non-interactive mode:** Do not use interactive question tools. Output all findings as the structured text block below, which the caller parses; that block is the non-interactive result. Internal enum values (`safe_auto`, `gated_auto`, `manual`, `FYI`) stay in the schema and synthesis prose; the non-interactive result uses user-facing vocabulary ("fixes", "Proposed fixes", "Decisions", "FYI observations") so non-interactive output reads the same way interactive output does.

Two things about the template that follows. First, **nothing left in the batch has been confirmed here.** These edits were not covered by existing authority and this mode asks no questions, so they are returned *awaiting* confirmation. Already-authorized corrections that landed belong only in Applied. Wording that reports them as already confirmed invites a caller, or a user reading over its shoulder, to treat unapplied and unapproved changes as accepted. Second, **the text inside the code fence is the whole output.** On a document with no implementation units, title the obligations section "Entailed corrections" and use the section name as each group heading. Do not emit that instruction, or any other bracketed note, into the result the caller parses.

```
Document review complete (non-interactive mode).

Applied N fixes:
- <section>: <what was changed> (<reviewer>)
- <section>: <what was changed> (<reviewer>)

Implementation obligations (already entailed by the document; awaiting one grouped confirmation):

<unit or section name>
  - <consequence, no opaque identifier> — <change as intent language>
  - <consequence, no opaque identifier> — <change as intent language>

<unit or section name>
  - <consequence, no opaque identifier> — <change as intent language>

Proposed fixes (nothing here has landed; awaiting the same grouped confirmation):

[P0] Section: <section> — <consequence-first title> (<reviewer>, confidence <anchor>)
  Recommendation: <Apply | Defer | Skip>
  Consequence if unchanged: <one sentence, no opaque identifier>
  Change: <suggested_fix as intent language>
  Basis: <at most two sentences of mechanism, opaque tokens glossed, at most two anchors>

Decisions (requires user judgment):

[P1] Section: <section> — <consequence-first title> (<reviewer>, confidence <anchor>)
  Recommendation: <Apply | Defer | Skip>
  Consequence if unchanged: <one sentence, no opaque identifier>
  Change: <suggested_fix as intent language, or "none">
  Basis: <at most two sentences of mechanism, opaque tokens glossed, at most two anchors>

FYI observations (anchor 50, no decision required):

[P3] Section: <section> — <consequence-first title> (<reviewer>, confidence <anchor>)
  Consequence if unchanged: <one sentence, no opaque identifier>

Residual concerns:
- <concern> (<source>)

Deferred questions:
- <question> (<source>)

Dropped: N (anchors 0/25 suppressed)
Restated: N (residual/deferred items suppressed as duplicates of actionable findings)

Review complete
```

Omit any section with zero items. The bucket names are the user-facing vocabulary for the routes 3.7 assigned. "Applied N fixes" reports what already changed. The obligations block and "Proposed fixes" together render the grouped confirmation: obligations first, then the rest of the batch, each shaped by the floor's "Presenting a batch" rule. The caller re-narrates this result to a reader who has seen none of it, so a flat list here becomes a flat list there. "Decisions" carries the decisions the user must still make, and "FYI observations" carries anchor `50`. End with "Review complete" as the final line so callers can detect completion.

**Count findings by their final route.** Obligations still awaiting grouped confirmation count as proposed fixes; grouping changes presentation, not the count. Obligations already applied count only as applied fixes. Do not export a separate obligation count: the caller uses the proposed-fixes count to detect pending approval, so it must include every pending edit and exclude edits that already landed.

**Compact rendering for FYI observations, residual concerns, and deferred questions (high-count mode).** When the combined count of these three buckets is 5 or more, collapse each to a one-line count followed by a tight bullet list, with no per-item elaboration. FYI observations use their consequence line; residual concerns and deferred questions use their concern or question text. Actionable buckets (Proposed fixes / Decisions) remain fully rendered regardless. This mirrors the interactive-mode rule in `references/review-output-template.md` so both modes produce the same shape.

**Interactive mode:**

Present findings using the review output template (read `references/review-output-template.md`). This presentation must appear as user-visible assistant text in the same turn immediately before the routing question in `references/walkthrough.md` is asked. A non-interactive result printed in an earlier turn, or a one-line count, does not satisfy that requirement. Within each severity level, separate findings by type:

- Errors (design tensions, contradictions, incorrect statements) first — these need resolution
- Omissions (missing steps, absent details, forgotten entries) second — these need additions

Put a brief summary at the top, in the shape the template's summary-line rule defines: changes made and choices requested counted separately, never merged into one "needs attention" number.

Include the Coverage table, applied fixes, FYI observations (as a distinct subsection), residual concerns, and deferred questions.

**All tables MUST be pipe-delimited markdown (`| col | col |`). Do NOT use ASCII box-drawing characters (`┌ ┬ ┐ ├ ┼ ┤ └ ┴ ┘ │ ─`) under any circumstances, including for the Coverage table.** This rule restates the template's formatting requirement at the point of rendering so it cannot drift. Pipe-delimited tables render correctly across all target harnesses; box-drawing characters break rendering in some and violate the repo convention documented in root `AGENTS.md`.

### R29 Rejected-Finding Suppression (Round 2+)

When the orchestrator is running round 2+ on the same document in the same session, the decision primer (see `references/dispatch.md` — Decision primer) carries forward every prior-round Skipped, Deferred, Acknowledged, and user-settled Withdrawn finding. Synthesis suppresses re-raised rejected findings rather than showing them to the user again. Acknowledged is treated as a rejected-class decision here: the user saw the finding, chose not to act on it (no Apply, no Defer append), and wants it on record, which is equivalent to Skip for suppression purposes. Only user-settled withdrawals (retired by a Skip/Defer premise or a user-asserted fact) reach this primer. An Apply-triggered withdrawal is provisional and never carried here, so a staged fix that failed or landed ineffectively is re-checked by fresh synthesis rather than suppressed by R29.

For each current-round finding, compare against the primer's rejected list:

- **Matching test:** same as R30. A finding matches when its `normalize(section) + normalize(title)` fingerprint matches and its evidence substrings overlap the prior finding's by more than 50%. Suppress a matching finding only when the evidence and assumptions supporting the prior rejection remain current.
- **Changed evidence:** reassess the finding when material changes to the document, relevant source, constraints, or newly available facts undermine the prior rejection. An unchanged document quote does not establish unchanged evidence. Retain the prior decision as history; a newly supported problem goes through ordinary admission and authority checks without treating reassessment as permission to reverse a user commitment.
- **On suppression:** record the drop in Coverage with a "previously rejected, re-raised this round" note so the user can see what was suppressed. The user can explicitly escalate by invoking the review again on a different context if they believe the suppression was wrong.

This rule runs at synthesis time, not at the persona level. Personas have a soft instruction via the subagent template's `{decision_primer}` variable to avoid re-raising rejected findings, but the orchestrator makes the final call: synthesis checks whether the prior rejection still applies before suppressing a re-raised finding.

### R30 Fix-Landed Matching Predicate

When the orchestrator is running round 2+ on the same document, synthesis verifies that prior-round Applied findings actually landed. For each current-round finding whose `normalize(section) + normalize(title)` fingerprint matches a prior-round Applied finding, branch by evidence overlap. This fingerprint is round-to-round memory's own key; 3.3 merges by reasoning and has no fingerprint to share. It works here because both rounds' findings are stored records with stable section and title fields:

- **Strong match — evidence overlap >50% with the prior-round evidence: fix-landed regression.** The current-round finding is quoting the same problematic text the prior-round fix was supposed to remove. Flag it as "fix did not land" in the report rather than showing it as a new finding. Include the prior-round finding's title and the current-round persona's evidence so the user can see why the verification flagged it.

- **Weak match — evidence overlap ≤50%: not a fix-landed regression.** Low evidence overlap means the prior problematic text is no longer being quoted, so do not flag "fix did not land." Do not suppress solely on fingerprint match. If the current-round item is explicitly a non-actionable verification observation (for example, its title or `why_it_matters` says the prior finding landed correctly and asks for no change), suppress it and record `Verified: round-{N} '{title}' landed correctly` in Coverage. Otherwise, treat the finding as new and let it flow through dedup and routing normally.

  **Materially-different exception.** If the current-round finding's `why_it_matters` describes a substantively different concern than the prior-round finding — even though the section/title fingerprint matches — treat it as a new finding rather than a fix-verified suppression. The section may have been edited for an unrelated reason and the new edit introduced a different issue. The persona's substance, not just the fingerprint, is the signal.

- **Section renames count as different locations.** If the section name has changed between rounds (an edit renamed the heading), treat the new section as a different location and the current-round finding as new. Neither branch above applies.

- **No fingerprint match:** not a verification candidate; the finding flows through normally to 3.3 (Merge Duplicate Findings) and onward routing.

This rule prevents two failure modes: (1) regressions where a fix didn't actually land, and (2) persona over-emission where a round-{N+1} reviewer correctly observes a prior-round resolution and emits a non-actionable "already addressed" finding. The persona-side guidance in `subagent-template.md` ("Do not emit findings to note prior-round resolutions") is the primary defense; this rule catches what the personas miss.

### Protected Artifacts

During synthesis, discard any finding that recommends deleting or removing a CE pipeline artifact: any file **under** a `plans/`, `solutions/`, `ideation/`, `explainers/`, `pulse-reports/`, `dogfood-reports/`, `feedback-sweep/`, or `personas/` directory (or the legacy `brainstorms/` one) **whose immediate parent is the artifact root**. The artifact root is a directory named `docs` — the default, and where unmigrated legacy artifacts stay even after a project sets `docs_root` — or the configured `docs_root` when this run resolved it. Matching by that parent covers nested category files (`solutions/<category>/foo.md`) while leaving a same-named directory elsewhere — a skill's own `references/personas/` prompt assets, whose parent is `references` — as ordinary code whose deletion finding stands. A review that never resolved a configured root still protects the `docs`-parented tree (default and legacy). An artifact under a configured root seen by such a run is the one case this rule does not cover.

## Phase 5: Return to the Caller

Return "Review complete" with the completion report or the non-interactive result. A finished review does not need a terminal question. When nested, return control to the caller; do not start a nested planning or execution workflow merely because the review is complete.

For standalone use, a useful next step may be named without a blocking menu. A requirements-only unified plan or legacy standalone requirements doc routes to `ce-plan`; an implementation-ready unified plan or legacy implementation plan routes to `ce-work`. Invoke that next skill only when the user's existing request authorizes it. Review completion alone does not authorize new work.

### Iteration limit

After 2 refinement passes, recommend completion. An explicit request for another pass is honored with prior decisions preserved. Handling unchanged findings uses the intake reuse condition rather than starting a new pass.

## What NOT to Do

- Do not rewrite the entire document
- Do not add new sections or requirements the user didn't discuss
- Do not over-engineer or add complexity
- Do not create separate review files or add metadata sections
- Do not modify caller skills (ce-brainstorm, ce-plan, or external plugin skills that invoke ce-doc-review)

## Iteration Guidance

On genuinely new review passes, re-dispatch personas with the multi-round decision primer (`references/decision-primer.md`) and re-synthesize. Fixed findings drop out on their own because their evidence is gone from the current doc; rejected findings are handled by the R29 suppression rule; applied-fix verification uses the R30 matching test above. If findings repeat across passes after these rules run, recommend completion.
