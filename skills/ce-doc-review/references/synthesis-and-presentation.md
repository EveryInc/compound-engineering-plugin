# Phases 3-5: Synthesis, Presentation, and Next Action

## Phase 3: Synthesize Findings

Process findings from all agents through this pipeline. Order matters — each step depends on the previous. The pipeline implements the finding-lifecycle state machine: **Raised → (Confidence Gate | FYI-eligible | Dropped) → Deduplicated → Classified → SafeAuto | GatedAuto | Manual | FYI**. Re-evaluate state at each step boundary; do not carry forward assumptions from earlier steps as prose-level shortcuts.

### 3.1 Validate

Check each agent's returned JSON against the findings schema:

- Drop findings missing any required field defined in the schema
- Drop findings with invalid enum values (including the pre-rename `auto` / `present` values from older personas — treat those as malformed until all persona output has been regenerated)
- Note the agent name for any malformed output in the Coverage section

**Do not narrate remap / validation diagnostics to the user.** Schema-drift notes ("persona X returned unknown enum Y, remapped to Z"), persona-prompt-drift commentary, and other validator-internal diagnostics are maintainer-facing information. They do not belong in the Phase 4 output the user reads. If a persona's output is malformed, the only user-visible consequence is a Coverage-row annotation (e.g., the persona shows fewer findings or a `malformed` marker). Everything else stays internal.

### 3.2 Confidence Gate (Anchor-Based)

Gate findings by their `confidence` anchor value. Anchors are discrete integers (`0`, `25`, `50`, `75`, `100`) with behavioral definitions documented in `references/findings-schema.json` and embedded in the persona rubric (`references/subagent-template.md`). This replaces the prior continuous 0.0-1.0 scale with per-severity gates — doc-review economics do not warrant threshold gradation by severity, and coarse anchors prevent false-precision gaming.

| Anchor | Meaning | Route |
|--------|---------|-------|
| `0`    | False positive or pre-existing issue | Drop silently |
| `25`   | Might be real but could not verify | Drop silently |
| `50`   | Verified real but nitpick / advisory / not very important | Surface in FYI subsection |
| `75`   | Double-checked, will hit in practice, directly impacts correctness | Enter actionable tier (classify by `autofix_class`) |
| `100`  | Evidence directly confirms; will happen frequently | Enter actionable tier (classify by `autofix_class`) |

- **Dropped silently** (anchors `0` and `25`): these do not surface in any output bucket — not as findings, not as FYI observations, not as residual concerns. Record the total drop count as a Coverage footnote line when non-zero: `Dropped: N (anchors 0/25 suppressed)`. The footnote appears below the Coverage table. This is the canonical location for drop-count reporting — not the summary line and not a per-persona Coverage column. Omit the footnote when N is zero.
- **FYI-subsection** (anchor `50`): surface in the presentation layer's FYI subsection regardless of `autofix_class`. These do not enter the walk-through or any bulk action — observational value without forcing a decision. Advisory observations ("nothing breaks, but...") naturally land here.
- **Actionable** (anchors `75` and `100`): enter the classification pipeline. Route by `autofix_class` (see 3.7).

**Why the surfacing floor sits at `50` while the actionable floor stays at `75`:** a planning document has no linter behind it, so this review is its only automated check, and premise-level concerns (product-lens, adversarial) cap at 50-75 because "is the motivation valid?" cannot be verified against the document. A `50` costs the reader one line in an observational subsection and never becomes a question, while missed-and-shipped derails implementation. That asymmetry justifies filtering low (`≥ 50`), and it holds **only** because `50` stays out of the pipeline — not because a menu makes dismissal cheap. The cost of a surfaced finding is the reader holding one more open question, not the keystroke that dismisses it; nothing downstream absorbs volume on its behalf.

### 3.3 Merge Duplicate Findings

Two findings are duplicates when **one fix would resolve both**. Decide that by reading them — `title`, `section`, `why_it_matters`, `evidence`, and `suggested_fix` — not by comparing strings. Reviewers describe the same problem in different words as a matter of course, so wording similarity is not the test and matching titles are not required.

Apply the test across personas and across sections:

- **A shared section is evidence, never a requirement.** Two reviewers commonly attach the same problem to different sections, and just as commonly attach different problems to the same one. Neither settles it — the fix does.
- **Fail closed.** When you cannot tell whether one fix resolves both, do not merge. A surviving duplicate costs the user one extra line. A wrong merge buries a real concern inside an unrelated finding, where nothing signals that it went missing.
- **Opposing recommendations never merge.** If one finding says cut and the other says keep, preserve both for contradiction resolution in 3.5 — that is a disagreement, not a duplicate.

When findings merge:

- Keep the highest severity and the highest confidence anchor. If anchors tie, keep the finding appearing first in document order — deterministic, not probabilistic.
- Union the evidence arrays and note every contributing reviewer (e.g., "coherence, feasibility").
- **Retain each constituent finding as a record**, with its own `section`, `title`, and `evidence` intact. Round-to-round memory — R29, R30, the decision primer, and the open-questions dedup key — matches on a single finding's section, title, and evidence overlap. A merged group has none of those, so collapsing the constituents away would make every finding the user settled re-raise on the next round.
- **Coverage attribution:** attribute the merged finding to the persona with the highest confidence anchor; on a tie, to the persona appearing first in document order. Decrement the losing persona's Findings count and its route bucket so totals stay exact.

**Merging never drops.** A merge regroups findings; it never removes one from the review. Every finding that cleared 3.2 still reaches the user — as its own entry or inside the merged finding that carries its concern.

**Cross-model returns.** A `<reviewer-name>-<provider>` return merges with its in-process twin under the same one-fix test. Whether that merge counts as *independent corroboration* is decided in 3.4 by the return's `independence_verified` flag — not here.

**The authoritative snapshot.** The merged finding set produced by this step is the single source of truth for both Coverage counts and rendered output. Each finding appears in exactly one place in the output — counted once in its route bucket, rendered once at its own position.

### 3.4 Cross-Persona Agreement Promotion

When 2+ independent personas flagged the same merged finding (from 3.3), promote the merged finding's anchor by one step: `50 → 75`, `75 → 100`. Anchor `100` does not promote further (already at the ceiling). Findings at anchors `0` or `25` do not reach this step (they were dropped in 3.2). For local personas, independent means the review came from a separate dispatched context; an inline fallback remains attributed evidence but cannot count toward promotion, and Coverage names the lost independence.

Independent corroboration is strong signal — multiple reviewers converging on the same issue is more reliable than any single reviewer's anchor. Promoting by one anchor step is semantically meaningful (a "verified but nitpick" finding that two personas independently surface is plausibly "will hit in practice"). This replaces the prior `+0.10` boost — the magic-number bump was calibrated to the continuous scale and no longer applies.

Note the promotion in the Reviewer column of the output (e.g., `coherence, feasibility (+1 anchor)`).

**Cross-model returns count as independent personas here only when the return's top-level `independence_verified` is `true`.** A return with `false` or a missing flag remains useful attributed reviewer evidence, but it cannot trigger anchor promotion or be described as different-model corroboration. It still merges in 3.3 under the one-fix test like any other finding — merging and corroboration are separate questions. This is especially important for Cursor default/Auto, whose serving family is unverified unless a receipt proves otherwise.

When the cross-model judgment pass ran (see `references/cross-model-review.md`), each peer return enters synthesis as a reviewer named `<reviewer-name>-<provider>` (e.g. `adversarial-codex`, `security-lens-grok`, `product-lens-composer` — whichever different provider was resolved). For this 3.4 promotion, only an independence-verified return is treated like an independent persona. Agreement between such a `<reviewer-name>-<provider>` return and its in-process twin (`<reviewer-name>`) is the **strongest** corroboration signal in the set — different model providers in separate processes, not one model's self-agreement — so it promotes by the normal one anchor step and is rendered `<reviewer-name>, <reviewer-name>-<provider> (+1 anchor)` (e.g. `adversarial, adversarial-codex (+1 anchor)`). **In user-facing Phase 4 output, render the peer legibly as a cross-model reviewer that names its model** — e.g. `adversarial + cross-model: Grok 4.6 (+1 anchor)`, and for a cursor-agent route name the route too (`… via cursor-agent`) so grok-vs-composer is unambiguous — rather than surfacing the raw `<lens>-<provider>` token; the stored `reviewer` field keeps the `<lens>-<provider>` form so its provenance survives. Whether a peer and its twin describe one problem was already decided in 3.3 by the one-fix test; this step reads that result rather than re-matching. **The whole-document sweep** (`whole-doc-<provider>`, R20) has **no in-process twin**, so its findings reach this step only when 3.3 merged them with an in-process reviewer's; when independence is verified, such a merge promotes one anchor step just the same (rendered e.g. `feasibility, whole-doc-codex (+1 anchor)`). **Corroboration only, never apply authority:** a peer-only finding is never silently applied as `safe_auto` — not by the peer returning that class, and **not via the 3.6 promotion scan** (see the cross-model peer cap in 3.6 and the safeguard in 3.7); it caps at `gated_auto` unless an in-process reviewer independently corroborates it. **Peer agreement alone also does not promote the anchor.** The one-step promotion in this rule requires at least one in-process contributor and at least one independence-verified peer — mirroring the 3.6 autofix cap on the anchor axis. A merged finding whose contributors are all cross-model peers is **not** promoted. This holds *a fortiori* in the default single-peer config, where peer-peer agreement can be one model agreeing with itself. Cross-model agreement adds **at most one** anchor step even when an opt-in second peer also agrees; the bonus does not stack.

This replaces the earlier residual-concern promotion step. Findings at anchors `0` / `25` are not promoted back into the review surface; they appear only as drop counts in Coverage. If a dropped finding is genuinely important, the reviewer should raise their anchor to `50` or higher through stronger evidence rather than relying on a promotion rule.

### 3.5 Resolve Contradictions

When personas disagree — on the same section, or in different sections about the same underlying decision:

- Create a combined finding presenting both perspectives
- Set `autofix_class: manual` (contradictions are by definition judgment calls)
- Set `finding_type: error` (contradictions are about conflicting things the document says, not things it omits)
- Frame as a tradeoff, not a verdict

Specific conflict patterns:

- Coherence says "keep for consistency" + scope-guardian says "cut for simplicity" → combined finding, let user decide
- Feasibility says "this is impossible" + product-lens says "this is essential" → P1 finding framed as a tradeoff
- Multiple personas flag the same issue (no disagreement) → handled in 3.3 merge, not here
- **Opposing recommendations 3.3 refused to merge → resolve them here, including when they sit in different sections.** 3.3 applies its one-fix test across sections, so it detects a cut-versus-keep pair wherever the two reviewers attached it, and hands the pair on rather than merging. If this step only looked at same-section disagreements, that pair would survive as two independent decisions — and the best-judgment route would then execute both, applying mutually incompatible fixes. The section is where a disagreement was *noticed*; the decision it turns on is what makes it one contradiction.

### 3.5b Deterministic Recommended-Action Tie-Break

Every merged finding carries exactly one `recommended_action` field consumed by the walk-through (`references/walkthrough.md`) to mark the `(recommended)` option, by the best-judgment path (`references/bulk-preview.md`) to choose what to execute in bulk, and by the stem's yes/no framing. When a merged finding was flagged by multiple personas who implied different actions, synthesis picks the recommended action deterministically so identical review artifacts produce identical walk-through and best-judgment behavior across runs.

**Tie-break order (most conservative first):** `Skip > Defer > Apply`. The first action that at least one contributing persona implied wins, scanning in that order.

- If any contributing persona implied Skip → `recommended_action: Skip`
- Else if any contributing persona implied Defer → `recommended_action: Defer`
- Else → `recommended_action: Apply`

**Persona-to-action mapping.** A persona implies an action through its classification:

- `safe_auto` or `gated_auto` → implies Apply
- `manual` with a concrete `suggested_fix` and a recommended resolution → implies Apply (the persona has an opinion about what to do)
- `manual` flagged as a tradeoff or scope question with no recommended resolution → implies Defer (worth revisiting, not worth acting now)
- Any persona flagging the finding as low-confidence or suppression-eligible via residual concerns → implies Skip
- Persona in the contradiction set (3.5) implying "keep as-is / do not change" → implies Skip

If the contributing personas are all silent on action (e.g., a merged `manual` finding from personas that all flagged it as observation without recommendation), pick the default based on whether the merged finding carries an executable `suggested_fix`:

- `suggested_fix` present → `recommended_action: Apply` as the pragmatic default.
- `suggested_fix` absent → `recommended_action: Defer` (the walk-through and best-judgment path cannot execute Apply without a fix; routing an actionless finding to Defer surfaces it in Open Questions where the user can decide what to do with it).

This gate holds for every branch of the tie-break: if the winning action is `Apply` but the merged finding has no `suggested_fix` after 3.6 (Promote) and 3.7 (Route) have run, downgrade to `Defer`. The walk-through still lets the user pick any of the four options; this rule only governs the agent's default recommendation so the best-judgment path and bulk-preview never schedule a non-executable Apply.

**Conflict-context surface.** When the tie-break fires (contributing personas implied different actions), record a one-line conflict-context string on the merged finding. The walk-through renders this on the R15 conflict-context line (see `references/walkthrough.md`). Example: `Coherence recommends Apply; scope-guardian recommends Skip. Agent's recommendation: Skip.`

**Downstream invariant.** The walk-through and bulk-preview never recompute the recommendation — they read `recommended_action` and render `(recommended)` on the matching option. Best-judgment-the-rest and routing option B execute the `recommended_action` across the scoped finding set in bulk. This keeps best-judgment outcomes reproducible and auditable: the same review artifact always produces the same bulk plan.

### 3.6 Promote Auto-Eligible Findings

Scan `manual` findings for promotion to `safe_auto` or `gated_auto`. Promote when the finding meets one of the consolidated auto-promotion patterns:

- **Codebase-pattern-resolved.** `why_it_matters` cites a specific existing codebase pattern (concrete file/function/usage reference, not just "best practice" or "convention"), and `suggested_fix` follows that pattern. Promote to `gated_auto` — the codebase evidence resolves the ambiguity that held the finding in `manual`.
- **Factually incorrect behavior.** The document describes behavior that is factually wrong, and the correct behavior is derivable from context or the codebase. Promote to `gated_auto`.
- **Missing standard security/reliability controls.** The omission is clearly a gap (not a legitimate design choice for the system described), and the fix follows established practice (HTTPS enforcement, checksum verification, input sanitization, fallback-with-deprecation-warning on renames). Promote to `gated_auto`.
- **Framework-native-API substitutions.** A hand-rolled implementation duplicates first-class framework behavior, and the framework API is cited. Promote to `gated_auto`.
- **Mechanically-implied completeness additions.** The missing content follows mechanically from the document's own explicit, concrete decisions (not high-level goals). Promote to `safe_auto` when there is genuinely one correct addition; `gated_auto` when the addition is substantive.

Do not promote if the finding involves scope or priority changes where the author may have weighed tradeoffs invisible to the reviewer.

**Cross-model peer cap.** A finding whose reviewers are *only* cross-model peers (a `<lens>-<provider>` name such as `adversarial-codex`, with no bare in-process `<lens>` reviewer) — i.e. one no in-process reviewer independently raised — is **never** promoted to `safe_auto` here; cap it at `gated_auto` at most, and do not promote a peer-only `manual` finding at all — capping the class still hands it to 3.7 as `gated_auto`, which batches it, and `Apply all` would sweep a genuine choice. A peer is a corroboration signal, not an apply authority (R18): silent apply requires in-process corroboration, so only a peer finding that *merged* with its in-process twin in 3.3 (its Reviewer shows both `<lens>` and `<lens>-<provider>`) may reach `safe_auto` under the normal rules. This is independent of the peer's returned `autofix_class` — the promotion scan, not just the peer's own classification, is capped.

**Strawman-downgrade safeguard.** If a `safe_auto` finding names dismissed alternatives in `why_it_matters` (per the subagent template's strawman rule), verify the alternatives are genuinely strawmen. If any alternative is a plausible design choice that the persona dismissed too aggressively, downgrade to `manual` — a real alternative makes the finding a decision, per the misclassification guard in 3.7.

### 3.7 Route by Autofix Class

**Severity and autofix_class are independent.** A P1 finding can be `safe_auto` if the correct fix is obvious. The test is not "how important?" but "is there one clear correct fix, or does this require judgment?"

**Anchor and autofix_class are also independent.** Anchor gates the finding into a surface (FYI vs actionable); `autofix_class` decides what the actionable surface does with it. Both are consulted in this step.

Findings reaching 3.7 have already been gated to anchors `50`, `75`, or `100` by 3.2 (anchors `0` and `25` were dropped).

**Check obligations before autofix routing.** A finding is an **obligation** when the question that resolves it is already answered elsewhere in the document under review. The document made the decision; the finding reports only that some part of the document has not caught up. Entailed contradictions, a missing owner for behavior the document already requires, and a callsite implied by the document's own decision are obligations.

A finding is **not** an obligation when its fix would introduce a new user-visible state, limit, failure policy, retention rule, or operational commitment — however concrete that fix is. Concreteness is not authority. A fix the document does not already entail is a decision and stays in the decision surface. An obligation does not require judgment about *whether* to act — the document already resolved that. So a `manual` finding carrying a `suggested_fix` becomes `gated_auto` and routes as an obligation. Two cases do not: **`safe_auto` is never demoted**, and a finding with **no `suggested_fix` stays `manual` on the decision surface** — the batch applies edits on one answer and there is no edit to apply, so the reader supplies the missing text.

This is a per-finding test against one document. It needs no comparison to other findings and is independent of the merging in 3.3.

Route the obligations carrying a fix to the part of the document they affect instead of the per-finding walk-through: the implementation unit when the document has units, the owning section when it does not — a requirements-shaped document has none, and an obligation can arise there just as easily. They render as one grouped list under that unit or section and are confirmed together, so the user makes a single decision about work the document already settled. **Render the group in full before the confirmation fires** — a batch confirmation with nothing visible above it is a rubber stamp, not a decision.

Obligation grouping governs what the user is asked about, never what applies silently. An obligation at anchor `100` with `autofix_class: safe_auto` still applies silently under the table below.

**Every finding carries two claims, and they have independent entropy.** The *problem-claim* — this is wrong — is scored by the confidence anchor. The *remedy-claim* — fix it this way — is scored by `autofix_class`, because the rubric in `references/subagent-template.md` classifies `manual` precisely when genuinely different approaches exist and `gated_auto` when the only alternatives are strawmen. So `gated_auto` already asserts that no real alternative exists.

Route on the pair. **Do not spend a separate question on a finding whose own classification says there is nothing to choose between.** Eleven questions with foregone answers teach the reader to accept without reading, and that habit is what destroys the confirmations that matter.

Batching is the remedy, not silence. One question over the whole settled set keeps the changes in front of the reader without pretending each is a decision. What earns a question of its own is a genuine fork.

**When the call between `gated_auto` and `manual` is genuinely close, choose `manual`.** With nothing but mechanical corrections applying unattended, the remaining risk is not a bad edit — it is a real fork buried inside a batch the reader skims. A fork wrongly asked costs one question; a fork wrongly batched costs the decision itself.

| Anchor | Autofix Class | Route |
|--------|---------------|-------|
| `100`  | `safe_auto`   | Apply. Report in the change list. Mechanical corrections only — evidence directly confirms and there is one right answer. Requires `suggested_fix`; demote to `gated_auto` if missing. |
| `100`  | `gated_auto`  | Grouped confirmation. A concrete fix that touches meaning, so the reader sees it before it lands — but batched, not asked one at a time. Requires `suggested_fix`; demote to `manual` if missing. |
| `100`  | `manual`      | A decision — the reader chooses, never a question about whether to proceed with something already settled. Ask **which remedy** only when the finding carries competing ones; see below. |
| `75`   | `safe_auto`   | Grouped confirmation. Unattended apply stays reserved for anchor `100`, where the evidence directly confirms the fix. Requires `suggested_fix`; demote to `manual` if missing. |
| `75`   | `gated_auto`  | Grouped confirmation. Requires `suggested_fix`; demote to `manual` if missing. |
| `75`   | `manual`      | A decision. Same treatment. |
| `50`   | any           | Surface in the FYI subsection regardless of `autofix_class`. Do not enter the decision surface or any batch action. These are observations. |

**Nothing that touches document meaning applies unattended.** Only `safe_auto` at anchor `100` applies without the reader seeing it first. Everything else with a concrete fix goes to the grouped confirmation: one question covering the whole batch, rendered in full before it fires.

This is a deliberate retreat from a stricter rule, and the reason is measured. Routing `gated_auto` straight to Apply was evaluated across four rounds on a real review. It reported far more corrections — 7 to 9 of 9, against 2 to 4 when Apply was gated harder — but it also applied a genuine product fork in most runs, because the model cannot reliably tell which findings carry a real choice. Asking it to route its own uncertainty to a safer bucket did not help: it never used that route, since it does not experience the uncertainty as uncertainty. It simply decides, and is sometimes wrong.

So the volume problem and the authority problem get separated. **The grouped confirmation solves volume** — one question for a batch is not eleven prompts, which is the complaint this work started from. **Attended review solves authority** — a wrong classification costs the reader a glance rather than an unrequested change to their document. What `autofix_class` still decides is *how* the reader meets a finding: batched with everything else settled, or as a fork with its own question.

That yields three surfaces, each a different speech act: **applied** (reported, revertable — mechanical corrections only), **grouped confirmation** (everything with a concrete fix, plus obligations and the peer-only findings diverted out of Apply — one question covering a batch shown in full first), and **decisions** (genuine forks the reader settles). Render them per the shared floor's grammar so a reader can tell which is which without tracking headers.

**Where competing remedies come from — and where they do not.** The reviewer contract commits `suggested_fix` to a single recommendation and forbids alternative menus (`references/subagent-template.md`), so an ordinary `manual` finding reaches the decision surface with one fix or none. It has no menu to offer, and the walk-through gives it the regular four-option question. The case that genuinely carries two is 3.5's contradiction resolution: two personas disagreeing on the same section become one combined finding holding both perspectives, framed as a tradeoff. Ask which-remedy there. Do not invent a second option elsewhere to make the fork appear — the finding is still a decision when it carries one remedy; the reader is choosing whether that remedy is what they want, which is not the same as being asked to rubber-stamp something settled.

**Cross-model peer safeguard.** A finding whose only reviewers are cross-model peers (a `<lens>-<provider>` name with no in-process co-reviewer) **never routes to Apply**, at any anchor — a peer cannot authorize an unattended edit on its own (R18). Divert it to the grouped confirmation only where the table would have applied it; **a peer-only `manual` finding stays a decision**, since `Apply all` would sweep a genuine choice and a `manual` finding may carry no `suggested_fix` to apply. Withhold apply authority; do not move a finding down a surface it never qualified for.

**Misclassification guard.** A concrete `suggested_fix` never outranks a real alternative. If a finding classed `gated_auto` would let a competent author reasonably prefer a different remedy, it is `manual` and belongs in the decision surface — reclassify it here rather than applying it. This is the failure that puts scope and behaviour changes into an unattended path, so when the two readings are close, prefer `manual`.

**Auto-eligible patterns for safe_auto:** summary/detail mismatch (body authoritative over overview), wrong counts, missing list entries derivable from elsewhere in the document, stale internal cross-references, terminology drift, prose-vs-diagram inconsistency where the diagram can be mechanically updated to match the prose (deletion is never the fix — diagrams are intentional communication choices that aid spatial comprehension, not redundancy with prose), missing steps mechanically implied by other content, unstated thresholds implied by surrounding context.

**Auto-eligible patterns for gated_auto:** codebase-pattern-resolved fixes, factually incorrect behavior, missing standard security/reliability controls, framework-native-API substitutions, substantive completeness additions mechanically implied by explicit decisions.

### 3.8 Sort

Sort findings for presentation: P0 → P1 → P2 → P3, then by finding type (errors before omissions), then by confidence anchor (descending: `100` first, then `75`, then `50`), then by document order (section position) as the deterministic final tiebreak.

### 3.9 Suppress Restatements in Residual Concerns and Deferred Questions

Persona outputs carry `residual_risks` and `deferred_questions` arrays alongside `findings`. After the actionable-tier set is finalized (post-3.7 routing), personas often re-surface the same substance in their residual/deferred arrays — the persona's own finding and the persona's own residual concern are about the same issue. Rendering both sections verbatim inflates the output with restatements that carry no new signal.

For every `residual_risk` and `deferred_question` across all persona outputs, check against the finalized actionable-finding set (findings at confidence anchor `75` or `100`, plus FYI-subsection findings at anchor `50`). Drop the residual/deferred item if either of these holds:

- **Section-and-substance overlap.** The residual/deferred item names the same section as an actionable finding AND its substance fuzzy-matches the finding's `title` or `why_it_matters` (shared key nouns/verbs indicating the same concern).
- **Question form of an actionable finding.** A deferred question whose subject is directly answered by or obviated by an actionable finding's recommendation. Example: actionable finding "Motivation cites no real incident" → deferred question "Is there a concrete triggering event?" — the finding already raised this; the question restates it interrogatively.

Do NOT drop residual/deferred items that introduce genuinely new signal (a concern or question the actionable findings do not touch). When in doubt, keep — this pass is for obvious restatements, not borderline calls.

Run this pass on the merged set across all personas. Record the count dropped as a Coverage footnote line when non-zero: `Restated: N (residual/deferred items suppressed as duplicates of actionable findings)`. Ordering: footnotes appear in the sequence `Dropped:`, `Restated:` below the Coverage table, each on its own line. Omit any footnote whose count is zero.

## Phase 4: Apply and Present

**Rendering floor (applies to every finding, every mode — read before rendering anything).** Read
`references/rendering-floor.md` now. It is the single source of truth for the decision-first field
order (Recommendation → Consequence-if-unchanged → Change → Basis → Trace-on-request), the
domain-agnostic opaque-token policy (navigation anchors, provenance anchors, mechanism symbols; at
most two anchors per block), and the code-span budget. Every surface below — the non-interactive envelope,
the interactive template, and the bulk preview — maps its own layout onto that floor. Do not restate
a weaker per-surface rule; the floor is authoritative.

**User-facing vocabulary rule (applies to ALL user-visible output in Phase 4, not just the rendered template).** Internal enum values — `safe_auto`, `gated_auto`, `manual`, `FYI` — stay inside the schema and synthesis prose. Every word the user sees in Phase 4 output, including free-text narration between sections, transition preambles, status lines, and confirmation messages, MUST use user-facing vocabulary, named by the surface 3.7 routed the finding to: "applied changes" or "fixes" (what 3.7 routed to Apply), "proposed fixes" (the grouped confirmation), "decisions" (the decision surface), "FYI observations" (anchor `50`). The only exception is the `Tier` column in rendered tables, which is explicitly documented as surfacing the internal enum for transparency. Do NOT emit narration like "safe_auto fixes applied" or "N gated_auto findings" — write "fixes applied" or "N proposed fixes" instead.

### Apply the findings 3.7 routed to Apply

Apply, in a single pass, every finding 3.7 routed to Apply — **anchor `100` with `safe_auto`, and nothing else**. Evidence directly confirms the problem and there is one right answer, so the reader loses nothing by seeing it as a reported change rather than a question. Everything else with a concrete fix goes to the grouped confirmation, where the reader sees it before it lands.

Apply each edit in the document's native format and preserve its existing structure. Never insert markdown syntax into HTML, and for an ID-bearing HTML item mirror the nearest sibling's structure, preserving both its anchor convention and its visible ID text.

- Edit the document inline using the platform's edit tool
- Track what was changed for the "Applied changes" section in the rendered output
- Do not ask for approval — 3.7 already established there is no choice to offer
- Do **not** apply anything 3.7 routed elsewhere. Obligations and peer-only findings diverted out of Apply join the grouped confirmation; anchor `50` routes to FYI; `manual` at any anchor is a decision. If a finding reaches this step from any of those routes, 3.7 was not applied correctly — re-run it for that finding before continuing.
- Do **not** apply a finding whose only reviewers are cross-model peers, at any anchor or class. 3.7 diverts those to the grouped confirmation when the table would have applied them, and leaves a peer-only `manual` finding on the decision surface where it belongs.
- An applied fix must never remove or reword a `session-settled:` annotation. If a `suggested_fix`'s text would touch one, do not apply it — send the finding to the grouped confirmation so the user answers before the annotation changes.

List every applied fix in the output summary so the user can see what changed. Use enough detail to convey the substance of each fix (section, what was changed, reviewer attribution). This is especially important for fixes that add content — the user should not have to diff the document to understand what the review did.

### Route Remaining Findings

After the applied changes land, the rest split by the route 3.7 assigned — not by `autofix_class`:

- **Grouped confirmation** — every finding 3.7 sent there, obligations and Apply-diverted peer-only findings among them. One confirmation covering the batch, rendered in full first. In interactive mode this fires as its own step before the routing question (see `references/walkthrough.md`); it is never folded into the routing question, and a run that reaches routing without asking it leaves the batch unapplied. In non-interactive mode the batch is returned unapplied for the caller to confirm.
- **Decisions** — `manual` findings at anchor `75` or `100`. These enter the routing question and the walk-through (see `references/walkthrough.md`), and carry a which-remedy sub-question only when the finding holds competing remedies — in practice a 3.5 contradiction, per the note under the routing table.
- **FYI** — anchor `50`, presentation only, no routing.
- **Nothing in the decision surface** → skip the routing question. **Interactive mode only:** after the grouped confirmation has been answered, emit the completion report, then flow to the Phase 5 terminal question — applied changes and an answered confirmation do not warrant a routing question, but they are what the run did and still warrant a report. **Non-interactive mode emits no completion report at all**; the envelope above is the whole output, and an empty decision surface is its ordinary case, so printing an interactive report beside or instead of the envelope would corrupt what the caller parses. In either mode, when the decision surface is empty but the grouped confirmation is not, the confirmation is still the reader's to answer — it is a separate step, not a branch of routing, and nothing reports "complete" before it is settled.

**Self-contained rendered lines (both modes, including the Applied-fixes list).** Every rendered line —
an applied fix, proposed fix, decision, FYI observation, residual concern, or deferred question —
obeys the shared rendering floor's (`references/rendering-floor.md`) opaque-token policy across **all
three** token classes, not document IDs alone. A requirement or unit ID (`R6`, `U3`) is a navigation
anchor (keep the ID, gloss at first mention); a ticket or PR number (`ESP-3373`, `PR #1776`) is a
provenance anchor (gloss only when the event changes the decision, else move to trace); a function,
file, variable, or line reference the document names (`clearMuxStatus`, `codebookTranscriptMode.ts:46`)
is a mechanism symbol (translate to its role; keep the exact symbol only when precise scope drives the
decision). At most two anchors per finding — counted across all its rendered lines, matching the floor's
per-block budget — each resolved at render time against the document in context so it stays accurate
after an Apply renumbers the item. The floor's full decision-first field order
(Recommendation → Consequence → Change → Basis) applies to **actionable findings** — proposed fixes and
decisions. FYI observations, residual concerns, deferred questions, and obligations carry no
recommendation, so they render as a single line under the token policy, not the full field order — a
consequence / concern / question, and for an obligation the consequence plus its change as intent. A line whose only description of a referenced item is a bare identifier — of any class — is
not acceptable rendered output.

**Non-interactive mode:** Do not use interactive question tools. Output all findings as a structured text envelope the caller can parse. Internal enum values (`safe_auto`, `gated_auto`, `manual`, `FYI`) stay in the schema and synthesis prose; the envelope below uses user-facing vocabulary — "fixes", "Proposed fixes", "Decisions", "FYI observations" — so non-interactive output reads the same way interactive output does.

Two things about the template that follows. **Nothing in the batch has been confirmed here** — this mode asks no questions, so the obligations and proposed fixes are returned *awaiting* a confirmation the caller must obtain. Wording that reports them as already confirmed invites a caller, or a user reading over its shoulder, to treat unapplied and unapproved changes as accepted. And **the fence is the output**: on a document with no implementation units, title the obligations section "Entailed corrections" and use the section name as each group heading — do not emit that instruction, or any other bracketed note, into the envelope the caller parses.

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

Omit any section with zero items. The bucket names are the user-facing vocabulary for the routes 3.7 assigned: "Applied N fixes" reports what already changed, the obligations block and "Proposed fixes" together render the grouped confirmation (obligations first, then the rest of the batch, each shaped by the floor's "Presenting a batch" rule — the caller re-narrates this envelope to a reader who has seen none of it, so a flat list here becomes a flat list there), "Decisions" carries the decision surface, and "FYI observations" carries anchor `50`. End with "Review complete" as the terminal signal so callers can detect completion.

**Obligations count as proposed fixes.** They render as a group rather than item by item — grouping changes presentation, not the count. So obligations are included in the proposed-fixes count a caller parses, and the caller's actionable-items gate keeps its meaning. Do **not** export a separate obligation count: a review whose findings are all obligations must still report actionable items, or a caller gating on that sum would hide the confirmation step and the user would never see work the review found.

**Compact rendering for FYI observations, residual concerns, and deferred questions (high-count mode).** When the combined count of these three buckets is 5 or more, collapse each to a one-line count followed by a tight bullet list — FYI observations use their consequence line, residual concerns and deferred questions their concern or question text — with no per-item elaboration. Actionable buckets (Proposed fixes / Decisions) remain fully rendered regardless. This mirrors the interactive-mode rule in `references/review-output-template.md` so both modes produce the same shape.

**Interactive mode:**

Present findings using the review output template (read `references/review-output-template.md`). This presentation must appear as user-visible assistant text in the same turn immediately before the routing question in `references/walkthrough.md` fires — a prior-turn non-interactive envelope or a one-line count does not satisfy that invariant. Within each severity level, separate findings by type:

- Errors (design tensions, contradictions, incorrect statements) first — these need resolution
- Omissions (missing steps, absent details, forgotten entries) second — these need additions

Brief summary at the top, in the shape the template's summary-line rule defines — changes made and choices requested counted separately, never merged into one "needs attention" number.

Include the Coverage table, applied fixes, FYI observations (as a distinct subsection), residual concerns, and deferred questions.

**All tables MUST be pipe-delimited markdown (`| col | col |`). Do NOT use ASCII box-drawing characters (`┌ ┬ ┐ ├ ┼ ┤ └ ┴ ┘ │ ─`) under any circumstances, including for the Coverage table.** This rule restates the template's formatting requirement at the point of rendering so it cannot drift. Pipe-delimited tables render correctly across all target harnesses; box-drawing characters break rendering in some and violate the repo convention documented in root `AGENTS.md`.

### R29 Rejected-Finding Suppression (Round 2+)

When the orchestrator is running round 2+ on the same document in the same session, the decision primer (see `references/dispatch.md` — Decision primer) carries forward every prior-round Skipped, Deferred, Acknowledged, and user-settled Withdrawn finding. Synthesis suppresses re-raised rejected findings rather than re-surfacing them to the user. Acknowledged is treated as a rejected-class decision here: the user saw the finding, chose not to act on it (no Apply, no Defer append), and wants it on record — equivalent to Skip for suppression purposes. Only user-settled withdrawals (retired by a Skip/Defer premise or a user-asserted fact) reach this primer; an Apply-triggered withdrawal is provisional and never carried here, so a staged fix that failed or landed ineffectively is re-checked by fresh synthesis rather than suppressed by R29.

For each current-round finding, compare against the primer's rejected list:

- **Matching predicate:** same as R30 — `normalize(section) + normalize(title)` fingerprint augmented with evidence-substring overlap check (>50%). If a current-round finding matches a prior-round rejected finding on fingerprint AND evidence overlap, drop the current-round finding.
- **Materially-different exception:** if the current document state has changed around the finding's section since the prior round (e.g., the section was edited and the evidence quote no longer appears in the current text), treat the finding as new — the underlying context shifted and the concern may be genuinely different now. The persona's evidence itself reveals this: a quote that doesn't appear in the current document is a signal the prior-round rejection no longer applies.
- **On suppression:** record the drop in Coverage with a "previously rejected, re-raised this round" note so the user can see what was suppressed. The user can explicitly escalate by invoking the review again on a different context if they believe the suppression was wrong.

This rule runs at synthesis time, not at the persona level. Personas have a soft instruction via the subagent template's `{decision_primer}` variable to avoid re-raising rejected findings, but the orchestrator is the authoritative gate — if a persona re-raises despite the primer, synthesis drops the finding.

### R30 Fix-Landed Matching Predicate

When the orchestrator is running round 2+ on the same document (see Unit 7 multi-round memory), synthesis verifies that prior-round Applied findings actually landed. For each current-round finding whose `normalize(section) + normalize(title)` fingerprint matches a prior-round Applied finding, branch by evidence overlap. This fingerprint is round-to-round memory's own key — 3.3 merges by reasoning and has no fingerprint to share — and it works here because both rounds' findings are stored records with stable section and title fields:

- **Strong match — evidence overlap >50% with the prior-round evidence: fix-landed regression.** The current-round finding is quoting the same problematic text the prior-round fix was supposed to remove. Flag as "fix did not land" in the report rather than surfacing as a new finding. Include the prior-round finding's title and the current-round persona's evidence so the user can see why the verification flagged it.

- **Weak match — evidence overlap ≤50%: not a fix-landed regression.** Low evidence overlap means the prior problematic text is no longer being quoted, so do not flag "fix did not land." Do not suppress solely on fingerprint match. If the current-round item is explicitly a non-actionable verification observation (for example, its title or `why_it_matters` says the prior finding landed correctly and asks for no change), suppress it and record `Verified: round-{N} '{title}' landed correctly` in Coverage. Otherwise, treat the finding as new and let it flow through dedup and routing normally.

  **Materially-different exception.** If the current-round finding's `why_it_matters` describes a substantively different concern than the prior-round finding — even though the section/title fingerprint matches — treat it as a new finding rather than a fix-verified suppression. The section may have been edited for an unrelated reason and the new edit introduced a different issue. The persona's substance, not just the fingerprint, is the signal.

- **Section renames count as different locations.** If the section name has changed between rounds (edit introduced a heading rename), treat the new section as a different location and the current-round finding as new — neither branch fires.

- **No fingerprint match:** not a verification candidate; the finding flows through normally to 3.3 dedup and onward routing.

This rule prevents two failure modes: (1) regressions where a fix didn't actually land, and (2) persona over-emission where a round-{N+1} reviewer correctly observes a prior-round resolution and emits a non-actionable "already addressed" finding. The persona-side guidance in `subagent-template.md` ("Do not emit findings to note prior-round resolutions") is the primary defense; this rule is the synthesis backstop.

### Protected Artifacts

During synthesis, discard any finding that recommends deleting or removing a CE pipeline artifact: any file **under** a `plans/`, `solutions/`, `ideation/`, `explainers/`, `pulse-reports/`, `dogfood-reports/`, `feedback-sweep/`, or `personas/` directory (or the legacy `brainstorms/` one) **whose immediate parent is the artifact root**. The artifact root is a directory named `docs` — the default, and where unmigrated legacy artifacts stay even after a project sets `docs_root` — or the configured `docs_root` when this run resolved it. Matching by that parent covers nested category files (`solutions/<category>/foo.md`) while leaving a same-named directory elsewhere — a skill's own `references/personas/` prompt assets, whose parent is `references` — as ordinary code whose deletion finding stands. A review that never resolved a configured root still protects the `docs`-parented tree (default and legacy); a configured-root artifact seen by such a run is the one honest gap.

## Phase 5: Next Action — Terminal Question

**Non-interactive mode:** Return "Review complete" immediately. Do not ask questions. The caller receives the text envelope from Phase 4 and handles any remaining findings.

**Interactive mode:** fire the terminal question using the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to numbered options on the host's user-visible chat surface only when no such tool is in the list or a real question call errors. Never silently skip the question. This question is distinct from the mid-flow routing question (`references/walkthrough.md`) — the routing question chooses *how* to engage with findings, this one chooses *what to do next* once engagement is complete. Do not merge them.

**Stem:** `Apply decisions and what next?`

**Options (three by default; two in the zero-actionable case):**

When `fixes_applied_count > 0` (at least one applied fix or Apply decision has landed this session):

```
A. Apply decisions and proceed to <next stage>
B. Apply decisions and re-review
C. Exit without further action
```

When `fixes_applied_count == 0` (zero-actionable case, or the user took routing option D / every walk-through decision was Skip):

```
A. Proceed to <next stage>
B. Exit without further action
```

The `<next stage>` substitution uses the document classification from Phase 1. Route by readiness, not file path — a requirements-only artifact's next stage is planning, an implementation-ready artifact's is execution:

- `unified-requirements` (requirements-only unified plan) → `ce-plan` (enrich in place)
- `requirements` (legacy standalone requirements doc) → `ce-plan`
- `unified-plan` (implementation-ready unified plan) → `ce-work`
- `plan` (legacy implementation plan) → `ce-work`

**Label adaptation:** when no decisions are queued to apply, the primary option drops the `Apply decisions and` prefix — the label should match what the system is doing. `Apply decisions and proceed` when fixes are queued; `Proceed` when nothing is queued.

**Caller-context handling (implicit):** the terminal question's "Proceed to <next stage>" option is interpreted contextually by the agent from the visible conversation state. When `ce-doc-review` is invoked from inside another skill's flow (e.g., `ce-brainstorm` Phase 4 re-review, `ce-plan` phase 5.3.8), the agent does not fire a nested `ce-plan` or `ce-work` dispatch — it returns control to the caller's flow which continues its own logic. When invoked standalone, "Proceed" dispatches the appropriate next skill. No explicit caller-hint argument is required; if this implicit handling proves unreliable in practice, an explicit `nested:true` flag can be added as a follow-up.

### Iteration limit

After 2 refinement passes, recommend completion — diminishing returns are likely. But if the user wants to continue, allow it; the primer carries all prior-round decisions so later rounds suppress repeat findings cleanly.

Return "Review complete" as the terminal signal for callers, regardless of which option the user picked.

## What NOT to Do

- Do not rewrite the entire document
- Do not add new sections or requirements the user didn't discuss
- Do not over-engineer or add complexity
- Do not create separate review files or add metadata sections
- Do not modify caller skills (ce-brainstorm, ce-plan, or external plugin skills that invoke ce-doc-review)

## Iteration Guidance

On subsequent passes, re-dispatch personas with the multi-round decision primer (see Unit 7) and re-synthesize. Fixed findings self-suppress because their evidence is gone from the current doc; rejected findings are handled by the R29 pattern-match suppression rule; applied-fix verification uses the R30 matching predicate above. If findings are repetitive across passes after these mechanisms run, recommend completion.
