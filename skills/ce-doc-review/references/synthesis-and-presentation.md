# Phases 3-5: Synthesis, Presentation, and Next Action

## Phase 3: Synthesize Findings

Process findings from all agents through this pipeline. Order matters — each step depends on the previous.

### 3.1 Validate

Check each agent's returned JSON against the findings schema:

- Drop findings missing any required field defined in the schema
- Drop findings with invalid enum values (including the pre-rename `auto` / `present` values from older personas — treat those as malformed until all persona output has been regenerated)
- Note the agent name for any malformed output in the Coverage section

**Do not narrate remap / validation diagnostics to the user.** Schema-drift notes ("persona X returned unknown enum Y, remapped to Z"), persona-prompt-drift commentary, and other validator-internal diagnostics are maintainer-facing information. They do not belong in the Phase 4 output the user reads. If a persona's output is malformed, the only user-visible consequence is a Coverage-row annotation (e.g., the persona shows fewer findings or a `malformed` marker). Everything else stays internal.

### 3.2 Confidence Gate (Anchor-Based)

Gate findings by their `confidence` anchor value. Anchors are discrete integers (`0`, `25`, `50`, `75`, `100`) with behavioral definitions documented in `references/findings-schema.json` and embedded in the persona rubric (`references/subagent-template.md`). Coarse anchors replace the prior continuous 0.0-1.0 scale with per-severity gates, under which personas clustered on round values and the gate boundaries became coin-flips.

| Anchor | Meaning | Route |
|--------|---------|-------|
| `0`    | False positive or pre-existing issue | Drop silently |
| `25`   | Might be real but could not verify | Drop silently |
| `50`   | Verified real but nitpick / advisory / not very important | Surface in FYI subsection |
| `75`   | Double-checked, will hit in practice, directly impacts correctness | Enter actionable tier (classify by `autofix_class`) |
| `100`  | Evidence directly confirms; will happen frequently | Enter actionable tier (classify by `autofix_class`) |

- **Dropped silently** (anchors `0` and `25`): these do not surface in any output bucket — not as findings, not as FYI observations, not as residual concerns. Record the total drop count as a Coverage footnote line when non-zero: `Dropped: N (anchors 0/25 suppressed)`. The footnote appears below the Coverage table, alongside the `Chains:` footnote when both apply. This is the canonical location for drop-count reporting — not the summary line and not a per-persona Coverage column. Omit the footnote when N is zero.
- **FYI-subsection** (anchor `50`): surface in the presentation layer's FYI subsection regardless of `autofix_class`. These do not enter the walk-through or any bulk action — observational value without forcing a decision. Advisory observations ("nothing breaks, but...") naturally land here.
- **Actionable** (anchors `75` and `100`): enter the classification pipeline. Route by `autofix_class` (see 3.7).

Filter low (`≥ 50`) and let the routing menu handle volume: document review has no linter backstop, and dismissal at the menu is cheap while missed-and-shipped derails downstream implementation.

### 3.3 Deduplicate

Fingerprint each finding using `normalize(section) + normalize(title)`. Normalization: lowercase, strip punctuation, collapse whitespace.

**Cross-model twin exception.** When a `<reviewer-name>-<provider>` return has top-level `independence_verified: true`, match it against its in-process twin (`<reviewer-name>` only — not against unrelated personas) when `normalize(section)` matches AND evidence-substring overlap exceeds 50% (same predicate shape as R29/R30), even if titles differ. A return with false or missing independence uses the ordinary section+title fingerprint and receives no agreement promotion. Independent models routinely paraphrase the same issue under different titles; requiring title equality silently disables the verified cross-model agreement signal. This exception does **not** apply to other cross-persona pairs.

When fingerprints match across personas:

- If the findings recommend opposing actions (e.g., one says cut, the other says keep), do not merge — preserve both for contradiction resolution in 3.5
- Otherwise merge: keep the highest severity, keep the highest confidence anchor (if tied, keep the finding appearing first in document order — deterministic, not probabilistic), union all evidence arrays, note all agreeing reviewers (e.g., "coherence, feasibility")
- **Coverage attribution:** Attribute the merged finding to the persona with the highest confidence anchor. If anchors tie, attribute to the persona whose entry appeared first in document order. Decrement the losing persona's Findings count and the corresponding route bucket so totals stay exact.

### 3.3b Same-Persona Premise Redundancy Collapse

A single persona sometimes files several findings that share one root premise at different sections (observed: product-lens firing five variants of "motivation is weak"). Cross-persona dedup (3.3) misses this because it fingerprints on section+title, which differ even when the concern is the same.

**Within one persona's output only** — never across personas, where convergence is exactly the independence signal 3.4 rewards — cluster findings that share the same `finding_type`, substantially overlapping `why_it_matters` phrasing (same key nouns/verbs: "motivation", "justification", "premise unsupported", "scope creep"), and fixes that one upstream decision would all obviate. For each cluster of 3 or more findings:

- Keep the finding with the strongest evidence (highest confidence anchor; if tied, the one citing the most concrete document reference)
- Demote the rest to FYI-subsection status (anchor `50`) regardless of their original anchor
- Note the count on the kept finding's Reviewer column (e.g., `product-lens (+4 related variants demoted to FYI)`)

Run this per-persona before 3.4. The kept finding still qualifies for cross-persona promotion; demoted variants do not.

### 3.4 Cross-Persona Agreement Promotion

When 2+ independent personas flagged the same merged finding (from 3.3), promote the merged finding's anchor by one anchor step: `50 → 75`, `75 → 100`. Anchor `100` does not promote further (already at the ceiling). Findings at anchors `0` or `25` do not reach this step (they were dropped in 3.2).

Note the promotion in the Reviewer column of the output (e.g., `coherence, feasibility (+1 anchor)`).

**Cross-model returns count as independent personas here only when the return's top-level `independence_verified` is `true`.** A return with `false` or a missing flag remains useful attributed reviewer evidence, but it cannot use the twin fingerprint exception, trigger anchor promotion, or be described as different-model corroboration. This is especially important for Cursor default/Auto, whose serving family is unverified unless a receipt proves otherwise.

When the cross-model judgment pass ran, each peer return enters synthesis as a reviewer named `<reviewer-name>-<provider>` (e.g. `adversarial-codex`); `references/cross-model-review.md` owns how the pass is disclosed and named. An independence-verified peer agreeing with its in-process twin promotes by the normal single step, using the 3.3 cross-model exception (same section plus >50% evidence-substring overlap, titles may diverge). The `whole-doc-<provider>` sweep has no in-process twin, so it corroborates by the ordinary section+title fingerprint against any in-process reviewer and promotes the same way. **The promotion requires at least one in-process contributor plus at least one independence-verified peer, and it never stacks** — a merged finding whose contributors are all peers is not promoted, since in the default single-peer config peer-peer agreement can be one model agreeing with itself. **Corroboration only, never apply authority:** a peer-only finding caps at `gated_auto` whatever class the peer returned (see the cross-model peer cap in 3.6). In user-facing Phase 4 output, render the peer as a cross-model reviewer that names its model — and, on a cursor-agent route, the route too (`… via cursor-agent`) — rather than the raw `<lens>-<provider>` token, which stays in the stored `reviewer` field for fingerprinting.

Findings at anchors `0` / `25` are not promoted back into the review surface; they appear only as drop counts in Coverage.

### 3.5 Resolve Contradictions

When personas disagree on the same section:

- Create a combined finding presenting both perspectives
- Set `autofix_class: manual` (contradictions are by definition judgment calls)
- Set `finding_type: error` (contradictions are about conflicting things the document says, not things it omits)
- Frame as a tradeoff, not a verdict

Specific conflict patterns:

- Coherence says "keep for consistency" + scope-guardian says "cut for simplicity" → combined finding, let user decide
- Feasibility says "this is impossible" + product-lens says "this is essential" → P1 finding framed as a tradeoff
- Multiple personas flag the same issue (no disagreement) → handled in 3.3 merge, not here

### 3.5b Deterministic Recommended-Action Tie-Break

Every merged finding carries exactly one `recommended_action` field. The walk-through (`references/walkthrough.md`) reads it to mark the `(recommended)` option and frame the stem; the best-judgment path (`references/bulk-preview.md`) reads it to choose what to execute in bulk. Neither recomputes it.

**Tie-break order (most conservative first): `Skip > Defer > Apply`.** The first action at least one contributing persona implied wins. A persona implies Apply through `safe_auto` / `gated_auto`, or through `manual` with a concrete `suggested_fix` and a recommended resolution; Defer through `manual` framed as a tradeoff or scope question with no recommended resolution; Skip through a low-confidence / suppression-eligible flag or a contradiction-set position of "keep as-is". When every contributor is silent on action, default to Apply if the merged finding carries an executable `suggested_fix` and Defer if it does not.

**A finding with no `suggested_fix` is never recommended as Apply.** If the winning action is `Apply` but the finding still has no fix after 3.6 and 3.7 have run, downgrade to `Defer` so the best-judgment path and bulk preview never schedule a non-executable Apply. The user can still pick any option in the walk-through.

**Conflict-context surface.** When the tie-break fires (contributing personas implied different actions), record a one-line conflict-context string on the merged finding; the walk-through renders it on its conflict-context line. Example: `Coherence recommends Apply; scope-guardian recommends Skip. Agent's recommendation: Skip.`

### 3.5c Premise-Dependency Chain Linking

A single premise challenge ("is this work justified?") often generates downstream findings that all evaporate if the premise is rejected. Surfacing each as an independent decision forces the user to re-litigate the same root question N times, so link dependents to their root: presentation groups them and the walk-through can cascade one root decision across the chain.

Run after 3.5b (recommended_action normalized) and before 3.6, on the merged finding set. Linking is purely annotative — do not reclassify, re-route, or change any finding's anchor here.

**Identify roots.** A finding is a candidate root when all of these hold: severity `P0` or `P1`; `autofix_class: manual` (a safe/gated root is acted on, not cascaded); `title` or `why_it_matters` challenges a foundational premise rather than a detail ("premise unsupported", "justification missing", "do-nothing baseline not evaluated", "is X justified" — shapes, not a vocabulary list); and the `section` is framing-level (Problem Frame, Summary, Overview, Why, Motivation, Goals) OR the finding questions whether a named component should exist.

**Elevate ALL matching candidates — no numerical cap on roots.** The criteria are the filter. Picking a single root when two valid ones exist strands the second root's dependents as independent manual findings, which is the problem chains exist to solve. If none match, skip the rest of this step.

**Peer vs nested test (apply it in both directions).** Two candidate roots are peers when accepting root A's fix would not resolve root B's concern, and vice versa. They are nested when one root's fix would moot the other — the subsumed candidate becomes a dependent of the surviving root.

**Surviving root under nesting: scope dominates confidence.** The surviving root is the one whose fix moots the other, **not** the higher-confidence candidate. Confidence tie-breaks *among peers*; it never decides which of two nested candidates dominates.

**Identify dependents.** Dependency is defined on the *rejection* branch, matching the cascade trigger in `references/walkthrough.md`: a finding is a dependent when the root challenges a foundational premise about a named component, the candidate's `suggested_fix` modifies or constrains that same component, and the candidate's concern dissolves if the root is rejected. Substitution check: "if the user rejects the root (Skip/Defer), does this finding still describe an actionable concern this round?" If yes, it is not a dependent. A dependent links to exactly one root — the one whose rejection most directly dissolves its concern.

**Independence safeguard.** Do NOT link a finding whose concern survives the root's rejection: operational obligations a component has if it exists at all (a migration's rollback plan, a module's error handling, a feature's test coverage), a `why_it_matters` grounded in standalone evidence (codebase fact, framework convention, production data), or any `safe_auto` finding, which has one correct fix regardless. When uncertain, do not link — a mis-linked chain hides a real issue, while an unlinked finding only costs one extra decision.

**Annotate and report.** On each dependent record `depends_on: <root_finding_id>` (section + normalized title as the id); on each root record `dependents: [<dependent_ids>]`. Add a coverage line `Chains: N root(s) with M total dependents`, omitted when N = 0.

**Count invariant.** The final `dependents` array on each root — after candidacy and the independence safeguard — is the single source of truth for both the coverage count and rendering, not the number of candidates considered. A finding in a root's `dependents` array MUST render nested under that root and MUST NOT appear at its own severity position; a finding in no `dependents` array MUST render at its own severity position and nowhere else.

### 3.6 Promote Auto-Eligible Findings

Scan `manual` findings for promotion to `safe_auto` or `gated_auto`. Promote when the finding meets one of the consolidated auto-promotion patterns:

- **Codebase-pattern-resolved.** `why_it_matters` cites a specific existing codebase pattern (concrete file/function/usage reference, not just "best practice" or "convention"), and `suggested_fix` follows that pattern. Promote to `gated_auto` — the user still confirms, but the codebase evidence resolves ambiguity.
- **Factually incorrect behavior.** The document describes behavior that is factually wrong, and the correct behavior is derivable from context or the codebase. Promote to `gated_auto`.
- **Missing standard security/reliability controls.** The omission is clearly a gap (not a legitimate design choice for the system described), and the fix follows established practice (HTTPS enforcement, checksum verification, input sanitization, fallback-with-deprecation-warning on renames). Promote to `gated_auto`.
- **Framework-native-API substitutions.** A hand-rolled implementation duplicates first-class framework behavior, and the framework API is cited. Promote to `gated_auto`.
- **Mechanically-implied completeness additions.** The missing content follows mechanically from the document's own explicit, concrete decisions (not high-level goals). Promote to `safe_auto` when there is genuinely one correct addition; `gated_auto` when the addition is substantive.

Do not promote if the finding involves scope or priority changes where the author may have weighed tradeoffs invisible to the reviewer.

**Cross-model peer cap.** A finding whose reviewers are *only* cross-model peers (a `<lens>-<provider>` name such as `adversarial-codex`, with no bare in-process `<lens>` reviewer) — i.e. one no in-process reviewer independently raised — is **never** promoted to `safe_auto` here; cap it at `gated_auto` (user confirms) at most. A peer is a corroboration signal, not an apply authority (R18): silent apply requires in-process corroboration, so only a peer finding that *merged* with its in-process twin in 3.3 (its Reviewer shows both `<lens>` and `<lens>-<provider>`) may reach `safe_auto` under the normal rules. This is independent of the peer's returned `autofix_class` — the promotion scan, not just the peer's own classification, is capped.

**Strawman-downgrade safeguard.** If a `safe_auto` finding names dismissed alternatives in `why_it_matters` (per the subagent template's strawman rule), verify the alternatives are genuinely strawmen. If any alternative is a plausible design choice that the persona dismissed too aggressively, downgrade to `gated_auto` so the user sees the tradeoff before the fix applies.

### 3.7 Route by Autofix Class

**Severity and autofix_class are independent.** A P1 finding can be `safe_auto` if the correct fix is obvious. The test is not "how important?" but "is there one clear correct fix, or does this require judgment?"

**Anchor and autofix_class are also independent.** Anchor gates the finding into a surface (FYI vs actionable); `autofix_class` decides what the actionable surface does with it. Both are consulted in this step.

Findings reaching 3.7 have already been gated to anchors `50`, `75`, or `100` by 3.2 (anchors `0` and `25` were dropped).

| Anchor | Autofix Class | Route |
|--------|---------------|-------|
| `100`  | `safe_auto`   | Apply silently in Phase 4. Requires `suggested_fix`. Demote to `gated_auto` if missing. |
| `100`  | `gated_auto`  | Enter the per-finding walk-through with Apply marked (recommended). Requires `suggested_fix`. Demote to `manual` if missing. |
| `100`  | `manual`      | Enter the per-finding walk-through with user-judgment framing. `suggested_fix` is optional. |
| `75`   | `safe_auto`   | Demote to `gated_auto` before routing — silent apply is reserved for anchor `100` findings where evidence directly confirms the fix. Enter the walk-through with Apply marked (recommended). |
| `75`   | `gated_auto`  | Enter the per-finding walk-through with Apply marked (recommended). Requires `suggested_fix`. Demote to `manual` if missing. |
| `75`   | `manual`      | Enter the per-finding walk-through with user-judgment framing. `suggested_fix` is optional. |
| `50`   | any           | Surface in the FYI subsection regardless of `autofix_class`. Do not enter the walk-through or any bulk action. These are observations, not decisions. |

**Auto-eligible patterns for safe_auto:** summary/detail mismatch (body authoritative over overview), wrong counts, missing list entries derivable from elsewhere in the document, stale internal cross-references, terminology drift, prose-vs-diagram inconsistency where the diagram can be mechanically updated to match the prose (deletion is never the fix — diagrams are intentional communication choices that aid spatial comprehension, not redundancy with prose), missing steps mechanically implied by other content, unstated thresholds implied by surrounding context.

**Auto-eligible patterns for gated_auto:** codebase-pattern-resolved fixes, factually incorrect behavior, missing standard security/reliability controls, framework-native-API substitutions, substantive completeness additions mechanically implied by explicit decisions.

### 3.8 Sort

Sort findings for presentation: P0 → P1 → P2 → P3, then by finding type (errors before omissions), then by confidence anchor (descending: `100` first, then `75`, then `50`), then by document order (section position) as the deterministic final tiebreak.

### 3.9 Suppress Restatements in Residual Concerns and Deferred Questions

Persona outputs carry `residual_risks` and `deferred_questions` arrays alongside `findings`, and personas routinely restate their own findings there. Once routing is final, check each residual/deferred item across all personas against the finalized finding set (anchors `50`, `75`, `100`) and drop it when either holds:

- **Section-and-substance overlap** — it names the same section as a finding and its substance fuzzy-matches that finding's `title` or `why_it_matters`.
- **Question form of a finding** — a deferred question the finding's recommendation already answers or obviates (finding "Motivation cites no real incident" → question "Is there a concrete triggering event?").

Keep anything that introduces genuinely new signal; when in doubt, keep. Record the dropped count as a Coverage footnote when non-zero: `Restated: N (residual/deferred items suppressed as duplicates of actionable findings)`. Footnotes appear below the Coverage table in the order `Dropped:`, `Chains:`, `Restated:`, each on its own line, omitting any zero count.

## Phase 4: Apply and Present

**User-facing vocabulary rule (all user-visible Phase 4 output, both modes, including free-text narration).** Internal enum values stay in the schema and synthesis prose; the user sees "fixes" (`safe_auto`), "proposed fixes" (`gated_auto`), "decisions" (`manual` at anchor `75`/`100`), and "FYI observations" (anchor `50`). Write "fixes applied", never "safe_auto fixes applied". The only exception is the rendered tables' `Tier` column, which surfaces the enum deliberately.

### Apply safe_auto fixes

Apply only `safe_auto` findings **at confidence anchor `100`** to the document in a single pass. This matches the 3.7 routing table: anchor `100` + `safe_auto` silent-applies; anchor `75` + `safe_auto` was demoted to `gated_auto` in 3.7 and enters the walk-through instead; anchor `50` + any `autofix_class` routes to FYI and must never auto-apply.

- Edit the document inline using the platform's edit tool
- Track what was changed for the "Applied fixes" section in the rendered output (`safe_auto` is the internal enum; the rendered section header reads "Applied fixes")
- Do not ask for approval — these have one clear correct fix AND evidence directly confirms (anchor `100`)
- Do NOT silent-apply any `safe_auto` finding at anchor `75` or `50`. If a finding reaches this step with `autofix_class: safe_auto` and anchor below `100`, the 3.7 routing rule was not applied correctly; re-run 3.7 for that finding before continuing.
- An applied fix must never remove or reword a `session-settled:` annotation. If a `suggested_fix`'s text would touch one, demote the finding to `gated_auto` so the user confirms.

List every applied fix in the output summary so the user can see what changed. Use enough detail to convey the substance of each fix (section, what was changed, reviewer attribution). This is especially important for fixes that add content or touch document meaning — the user should not have to diff the document to understand what the review did.

### Route Remaining Findings

After safe_auto fixes apply, remaining findings split into buckets:

- `gated_auto` and `manual` findings at confidence anchor `75` or `100` → enter the routing question (`references/walkthrough.md`)
- FYI-subsection findings → surface in the presentation only, no routing
- Zero actionable findings remaining → skip the routing question; flow directly to Phase 5 terminal question

**Self-contained rendered lines (both modes, including the Applied-fixes list).** Rendered output is read by someone who does not have the document open and has not internalized its internal ID scheme. When a rendered line — an applied fix, proposed fix, decision, FYI observation, residual concern, or deferred question — references an identifier the document itself defines (a requirement ID, unit ID, or similar shorthand such as `R6`, `U3`, `KTD2`), pair the identifier at its first mention within that finding's rendered block with a short plain-language handle for what it names, drawn from the document (e.g., `R6 (suppress peer panels on low-stakes calls)`, not bare `R6`). Resolve the handle at render time against the document already in context from Phase 1 — findings arrive carrying the bare identifier, so the handle is looked up here, not transported from the persona that raised the finding. Render-time lookup is also what keeps the handle accurate after an Apply has edited or renumbered the item it names. If the document is no longer in context, re-read the referenced section before rendering rather than emitting the bare identifier. Keep the identifier — it anchors the finding for anyone editing the document — and keep the handle to a few words; do not inline the full requirement or unit text. A line whose only description of a referenced item is the bare identifier is not acceptable rendered output. Universally understood section names (`Requirements`, `Open Questions`) need no handle.

**Headless mode:** ask no questions. Output every finding as this structured text envelope for the caller to parse.

```
Document review complete (headless mode).

Applied N fixes:
- <section>: <what was changed> (<reviewer>)
- <section>: <what was changed> (<reviewer>)

Proposed fixes (concrete fix, requires user confirmation):

[P0] Section: <section> — <title> (<reviewer>, confidence <anchor>)
  Why: <why_it_matters>
  Suggested fix: <suggested_fix>

Decisions (requires user judgment):

[P1] Section: <section> — <title> (<reviewer>, confidence <anchor>)
  Why: <why_it_matters>
  Suggested fix: <suggested_fix or "none">

  Dependents (would resolve if this root is rejected):
    [P2] Section: <section> — <title> (<reviewer>, confidence <anchor>)
      Why: <why_it_matters>
    [P2] Section: <section> — <title> (<reviewer>, confidence <anchor>)
      Why: <why_it_matters>

FYI observations (anchor 50, no decision required):

[P3] Section: <section> — <title> (<reviewer>, confidence <anchor>)
  Why: <why_it_matters>

Residual concerns:
- <concern> (<source>)

Deferred questions:
- <question> (<source>)

Dropped: N (anchors 0/25 suppressed)
Chains: N root(s) with M dependents
Restated: N (residual/deferred items suppressed as duplicates of actionable findings)

Review complete
```

Omit any section with zero items. When a root has dependents, render the root at its normal position in the severity-sorted list and nest its dependents as an indented `Dependents (...)` sub-block immediately below — never re-listed at their own severity position. End with `Review complete`.

**Compact rendering (high-count mode).** When the combined count of FYI observations, residual concerns, and deferred questions is 5 or more, collapse each to a one-line count plus a tight bullet list with no per-item `Why`. Proposed fixes and Decisions stay fully rendered regardless. Same rule as interactive mode, so both modes produce the same shape.

**Interactive mode:**

Present findings using the review output template (read `references/review-output-template.md`). Within each severity level, separate findings by type:

- Errors (design tensions, contradictions, incorrect statements) first — these need resolution
- Omissions (missing steps, absent details, forgotten entries) second — these need additions

Brief summary at the top: "Applied N fixes. K items need attention (X errors, Y omissions). Z FYI observations."

Include the Coverage table, applied fixes, FYI observations (as a distinct subsection), residual concerns, and deferred questions.

**Every table, including Coverage, MUST be pipe-delimited markdown (`| col | col |`) — never ASCII box-drawing characters, which break rendering on some harnesses.** The template carries the full formatting rules.

### R29 Rejected-Finding Suppression (Round 2+)

On round 2+ in the same session, the decision primer (see `SKILL.md` — Decision primer) carries forward every prior-round Skipped, Deferred, Acknowledged, and user-settled Withdrawn finding. Drop — do not re-surface — a current-round finding that matches one of them on the `normalize(section) + normalize(title)` fingerprint AND evidence overlap. An Apply-triggered withdrawal never reaches this primer, so a staged fix that failed or landed ineffectively is re-checked by fresh synthesis rather than suppressed here.

- **Materially-different exception:** if the section was edited since the prior round and the finding's evidence quote no longer appears in the current text, treat it as new — the context shifted, so the prior rejection may no longer apply.
- **On suppression:** record the drop in Coverage with a "previously rejected, re-raised this round" note so the user can see what was suppressed.

The orchestrator is the authoritative gate: the persona-side primer is advisory, and synthesis drops a re-raise regardless of persona behavior.

### R30 Fix-Landed Matching Predicate

On round 2+, verify that prior-round Applied findings actually landed. For each current-round finding whose `normalize(section) + normalize(title)` fingerprint matches a prior-round Applied finding:

- **The same evidence is still quotable (overlap >50%) — the fix did not land.** Report it as a fix-landed regression, naming the prior-round finding's title and the current-round evidence, rather than surfacing it as a new finding.
- **Low evidence overlap — not a regression.** Do not flag "fix did not land" and do not suppress on the fingerprint alone. If the current-round item is an explicitly non-actionable observation that the prior finding landed correctly, suppress it and record `Verified: round-{N} '{title}' landed correctly` in Coverage. Otherwise treat it as new — including when its `why_it_matters` describes a substantively different concern than the prior-round finding, since the persona's substance, not the fingerprint, is the signal.
- **Section renames count as different locations.** A renamed heading means neither branch fires; the finding is new.
- **No fingerprint match:** flows through 3.3 dedup and routing normally.

The persona-side rule in `subagent-template.md` ("Do not emit findings to note prior-round resolutions") is the primary defense against round-N+1 "already addressed" findings; this is the synthesis backstop.

### Protected Artifacts

During synthesis, discard any finding that recommends deleting or removing files in:

- `docs/brainstorms/`
- `docs/plans/`
- `docs/solutions/`

These are pipeline artifacts and must not be flagged for removal.

## Phase 5: Next Action — Terminal Question

**Headless mode:** Emit `Review complete` immediately. Do not ask questions. The Phase 4 text envelope already carries any remaining findings. If this run is also executing a larger workflow, `Review complete` is a marker inside the run, not the end of it — continue with the next step straight after emitting it.

**Interactive mode:** fire the terminal question using the platform's blocking question tool (in Claude Code, `AskUserQuestion`, already loaded by the pre-load step in `SKILL.md`). Fall back to numbered options in chat only when the harness has no such tool or the call errors; never silently skip the question. This question is distinct from the mid-flow routing question (`references/walkthrough.md`) — the routing question chooses *how* to engage with findings, this one chooses *what to do next* once engagement is complete. Do not merge them.

**Stem:** `Apply decisions and what next?`

**Options (three by default; two in the zero-actionable case):**

When `fixes_applied_count > 0` (at least one safe_auto or Apply decision has landed this session):

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

**Caller-context handling (implicit):** the terminal question's "Proceed to <next stage>" option is interpreted contextually by the agent from the visible conversation state. When `ce-doc-review` is invoked from inside another skill's flow (e.g., `ce-brainstorm` Phase 4 re-review, `ce-plan` phase 5.3.8), the agent does not fire a nested `ce-plan` or `ce-work` dispatch — the surrounding flow simply continues its own logic in the same turn. When invoked standalone, "Proceed" dispatches the appropriate next skill. No explicit caller-hint argument is required; if this implicit handling proves unreliable in practice, an explicit `nested:true` flag can be added as a follow-up.

### Iteration

On a subsequent pass, re-dispatch personas with the accumulated decision primer and re-synthesize: fixed findings self-suppress because their evidence is gone from the document, rejected re-raises are dropped by R29, and applied fixes are verified by R30. After 2 refinement passes, recommend completion — but allow more if the user wants them.

End with `Review complete`, regardless of which option the user picked.

## What NOT to Do

- Do not modify caller skills (ce-brainstorm, ce-plan, or external plugin skills that invoke this review)
