# Document Review Output Template

Use this **exact format** when presenting synthesized review findings in Interactive mode. Findings are grouped by severity, not by reviewer.

**IMPORTANT:** Use pipe-delimited markdown tables (`| col | col |`). Do NOT use ASCII box-drawing characters.

**IMPORTANT:** Escape literal pipe characters in table cells. Any `|` that appears inside a finding's section reference, issue description, code snippet, regex pattern, or delimited-string example must be written as `\|` so column boundaries are determined only by unescaped pipes. Unescaped pipes split the cell across columns and corrupt the row's `Reviewer`, `Confidence`, and `Tier` values.

This template describes the Phase 4 interactive presentation — what the user sees in the **same turn** before the routing question (`references/walkthrough.md`) fires. A prior-turn non-interactive envelope or a one-line finding count does not satisfy that ordering. The non-interactive-mode envelope is documented in `references/synthesis-and-presentation.md` (Phase 4 "Route Remaining Findings" section) and is separate from this template.

**Vocabulary note.** Internal enum values (`safe_auto`, `gated_auto`, `manual`, `FYI`) live in the schema and synthesis pipeline. User-facing rendered text names the surface synthesis step 3.7 routed the finding to, in plain language: fixes (what applied), proposed fixes (the grouped confirmation), decisions (the decision surface), and FYI observations. The `Tier` column in the tables below is the one place that still names the internal enum so the user can see the synthesis decision; everything else reads as plain language.

**Confidence column.** The `Confidence` column shows the integer anchor value (`50`, `75`, or `100`) — never a decimal or percentage. Anchor `50` = advisory (routed to FYI); anchor `75` = verified, will hit in practice; anchor `100` = certain, evidence directly confirms. Anchors `0` and `25` are dropped by synthesis before this layer and never appear in the rendered output. Cross-persona agreement promotes by one anchor step; when this happens, the Reviewer column notes it (e.g., `coherence, feasibility (+1 anchor)`).

## Example

```markdown
## Document Review Results

**Document:** <root>/plans/2026-03-15-feat-user-auth-plan.md
**Type:** plan
**Reviewers:** coherence, feasibility, security-lens, scope-guardian
- security-lens -- plan adds public API endpoint with auth flow
- scope-guardian -- plan has 15 requirements across 3 priority levels

Applied 5 changes. 5 awaiting one confirmation. 2 decisions (2 errors). 2 FYI observations.

### Applied fixes

- Standardized "pipeline"/"workflow" terminology to "pipeline" throughout (coherence)
- Fixed cross-reference: Section 4 referenced "Section 3.2" which is actually "Section 3.1" (coherence)
- Updated unit count from "6 units" to "7 units" to match listed units (coherence)
- Added "update API rate-limit config" step to Unit 4 -- implied by Unit 3's rate-limit introduction (feasibility)
- Added auth token refresh to test scenarios -- required by Unit 2's token expiry handling (security-lens)

### Implementation obligations

Already entailed by the plan; confirm as a group.

**Unit 3 — Parser coverage**

- Diagnostics the plan already requires would render nowhere, because no unit owns the UI for them — assign that rendering to this unit.
- The plan's own decision to drop literal exclusion leaves a second exclusion path untouched — remove it here too.

**Unit 7 — Cutover**

- Two passages disagree on whether a production reset may run, so executors could take opposite actions at the destructive step — align the assumption with the authoritative stop condition.

### Proposed fixes

Two fixes, both bringing a unit in line with a convention the plan already applies everywhere else. Confirm as a group.

**Units that skip a standard the plan already sets**

| # | Section | Issue | Reviewer | Confidence | Tier |
|---|---------|-------|----------|------------|------|
| 1 | Unit 6 — Custom auth | Implementers rebuild login and session flows the existing Devise setup already ships, because no unit says how to migrate off it | feasibility | 100 | gated_auto |
| 2 | Unit 5 — Webhooks | The public webhook endpoint takes unlimited requests while every other public route in the plan is capped, so a flood reaches the app unthrottled | security-lens | 100 | gated_auto |

### P0 — Must Fix

#### Errors

| # | Section | Issue | Reviewer | Confidence | Tier |
|---|---------|-------|----------|------------|------|
| 3 | Requirements Trace | Goal states "offline support" but technical approach assumes persistent connectivity | coherence | 100 | manual |

### P1 — Should Fix

#### Errors

| # | Section | Issue | Reviewer | Confidence | Tier |
|---|---------|-------|----------|------------|------|
| 4 | Scope Boundaries | 8 of 12 units build admin infrastructure; only 2 touch stated goal | scope-guardian | 75 | manual |

### FYI Observations

Low-confidence observations surfaced without requiring a decision. Content advisory only.

| # | Section | Observation | Reviewer | Confidence |
|---|---------|-------------|----------|------------|
| 1 | Naming | Filename `plan.md` is asymmetric with command name `user-auth`; could go either way | coherence | 50 |
| 2 | Risk Analysis | Rollout-cadence decision may benefit from monitoring thresholds, though not blocking | scope-guardian | 50 |

### Residual Concerns

Residual concerns are issues the reviewers noticed but could not confirm at confidence anchor `50` or higher. These are not actionable; they appear here for transparency only and are not promoted into the review surface.

| # | Concern | Source |
|---|---------|--------|
| 1 | Migration rollback strategy not addressed for Phase 2 data changes | feasibility |

### Deferred Questions

| # | Question | Source |
|---|---------|--------|
| 1 | Should the API use versioned endpoints from launch? | feasibility, security-lens |

### Coverage

| Persona | Status | Findings | Auto | Proposed | Decisions | FYI | Residual |
|---------|--------|----------|------|----------|-----------|-----|----------|
| coherence | completed | 7 | 3 | 2 | 1 | 1 | 0 |
| feasibility | completed | 3 | 1 | 2 | 0 | 0 | 1 |
| security-lens | completed | 2 | 1 | 1 | 0 | 0 | 0 |
| scope-guardian | completed | 2 | 0 | 0 | 1 | 1 | 0 |
| product-lens | not activated | -- | -- | -- | -- | -- | -- |
| design-lens | not activated | -- | -- | -- | -- | -- | -- |

Dropped: 3 (anchors 0/25 suppressed)
Restated: 2 (residual/deferred items suppressed as duplicates of actionable findings)
```

## Section Rules

- **Summary line**: Always present after the reviewer list. **Count changes made and choices requested separately** — they are different speech acts and collapsing them is what produces a line claiming both "N items need attention" and "no decisions requiring judgment." Format: "Applied N changes. M awaiting one confirmation. K decisions (X errors, Y omissions). Z FYI observations." Omit any zero clause except the FYI clause when zero (it's informative that none surfaced). Never describe an item as needing attention when nothing is being asked of the reader.
- **Applied fixes**: List every fix synthesis step 3.7 routed to Apply. Include enough detail per fix to convey the substance — especially for fixes that add content. Omit section if none.
- **Implementation obligations**: Findings the document already entails *and for which a fix was written* (synthesis step 3.7) — an entailed correction with no `suggested_fix` has no change to state as intent, so it stays a decision and is not rendered here. Grouped under the part of the document each affects — the implementation unit where the document has units, the owning section where it does not — and confirmed as a group rather than one at a time. On a document with no units, title the section **Entailed corrections** instead; "Implementation obligations" names something a requirements document does not contain. Each line is a consequence plus its change as intent, per the rendering floor's obligation-block rule — no recommendation, because there is no decision to make. Render the whole group before any confirmation fires; a batch confirmation with nothing visible above it is a rubber stamp. Omit section if none.
- **Self-contained references**: Every fix line and table cell obeys the shared rendering floor (`references/rendering-floor.md`). The `Issue` cell leads with the consequence (what goes wrong, for whom) and applies the opaque-token policy to all three classes — navigation anchors (document IDs like `R6`, `U3`: keep the ID, gloss at first mention), provenance anchors (tickets/PRs: gloss only when the event drives the decision, else omit), and mechanism symbols (functions/files/lines: translate to their role) — at most two anchors per cell. A cell whose only description of a referenced item is a bare identifier of any class is not acceptable. The floor is the single source; this template does not restate a weaker per-surface rule.
- **Proposed fixes**: The grouped confirmation, minus the obligations rendered above it — the two sections together are the batch, and nothing else is. Shape it per the floor's "Presenting a batch" rule (`references/rendering-floor.md`): lead with what the batch does as a whole, head each group with what its members share, and keep every member visible. Severity orders findings *within* a group; it never files them into the P-level sections below. **Nothing from the decision surface appears here.** The apply-all confirmation covers exactly this section plus the obligations, so a `manual` finding rendered into it becomes a genuine fork swept into a batch answer — the failure the split exists to prevent. Omit section if none.
- **P0-P3 sections**: The decision surface only — findings synthesis step 3.7 routed to a decision, which the reader answers one at a time or routes in bulk. Grouped-confirmation members are rendered above and never repeated here. Omit empty severity levels. Within each severity, separate into **Errors** and **Omissions** sub-headers. Omit a sub-header if that severity has none of that type. The `Tier` column surfaces the finding's internal class — `manual` here, since a decision is what these sections carry; `gated_auto` or `safe_auto` appear in Proposed fixes above. A `gated_auto` row in a P-level table means routing went wrong; re-run 3.7 for that finding rather than rendering it here.
- **FYI Observations**: Findings at confidence anchor `50` regardless of `autofix_class`. Surface here for transparency; these are not actionable and do not enter the walk-through. Omit section if none.
- **Residual Concerns**: Residual concerns noted by personas that did not make it above the confidence gate. Listed for transparency; not promoted into the review surface (cross-persona agreement boost runs on findings that already survived the gate, per synthesis step 3.4). Omit section if none.
- **Deferred Questions**: Questions for later workflow stages. Omit if none.
- **Compact rendering for FYI / Residual / Deferred (high-count mode)**: When the combined count across these three sections is **5 or more**, collapse each section to a one-line summary followed by the items as a tight bullet list (no table, no per-item `Why` elaboration). Rationale: these sections are observational, not decision-forcing — when they are lengthy, they bury the actionable tiers above them. A P0/P1/P2 actionable finding stays fully rendered regardless of how many FYI/Residual/Deferred items exist. When the combined count is 4 or fewer, render each section as today.
- **Coverage**: Always include. All counts are **post-synthesis**. **Findings** must equal Auto + Proposed + Decisions + FYI exactly — if deduplication merged a finding across personas, attribute it to the persona with the highest confidence anchor and reduce the other persona's count. **Residual** = count of `residual_risks` from this persona's raw output (not the promoted subset in the Residual Concerns section). The columns follow the routes synthesis step 3.7 assigned: `Auto` counts the findings it routed to Apply, `Proposed` counts the grouped confirmation — **including obligations**, since grouping is a presentation choice and not a separate class, so the Findings-equals-sum invariant is unaffected — `Decisions` counts the decision surface, and `FYI` counts findings at anchor `50` regardless of `autofix_class`. Findings at anchors `0` or `25` were dropped by synthesis and do not appear in any column. Do NOT invent additional columns (e.g., `Dropped`, `Surviving`). The column schema above is the canonical set.
- **Coverage footnote lines** (optional, appear below the table when non-zero): `Dropped: N (anchors 0/25 suppressed)` when synthesis 3.2 dropped any findings. `Restated: N (residual/deferred items suppressed as duplicates of actionable findings)` when synthesis 3.9 suppressed any restatements. These footnotes — not the summary line, not per-persona columns — are the canonical location for cross-cutting counts that don't fit the per-persona shape. Order: `Dropped:`, then `Restated:`, each on its own line. Omit any footnote whose count is zero.
