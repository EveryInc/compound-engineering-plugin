# Document Review Output Template

Use this **exact format** when presenting synthesized review findings in Interactive mode. Findings are grouped by severity, not by reviewer.

**IMPORTANT:** Use pipe-delimited markdown tables (`| col | col |`). Do NOT use ASCII box-drawing characters.

**IMPORTANT:** Escape literal pipe characters in table cells. Any `|` that appears inside a finding's section reference, issue description, code snippet, regex pattern, or delimited-string example must be written as `\|` so column boundaries are determined only by unescaped pipes. Unescaped pipes split the cell across columns and corrupt the row's `Reviewer`, `Confidence`, and `Tier` values.

This template describes the Phase 4 interactive presentation — what the user sees before the routing question (`references/walkthrough.md`) fires. The headless-mode envelope is documented in `references/synthesis-and-presentation.md` (Phase 4 "Route Remaining Findings" section) and is separate from this template.

**Vocabulary note.** Internal enum values (`safe_auto`, `gated_auto`, `manual`, `FYI`) live in the schema and synthesis pipeline. User-facing rendered text uses plain-language labels instead: fixes (for `safe_auto`), proposed fixes (for `gated_auto`), decisions (for `manual`), and FYI observations (for `FYI`). The `Tier` column in the tables below is the one place that still names the internal enum so the user can see the synthesis decision; everything else reads as plain language.

**Confidence column.** The `Confidence` column shows the integer anchor value (`50`, `75`, or `100`) — never a decimal or percentage. Anchor `50` = advisory (routed to FYI); anchor `75` = verified, will hit in practice; anchor `100` = certain, evidence directly confirms. Anchors `0` and `25` are dropped by synthesis before this layer and never appear in the rendered output. Cross-persona agreement promotes by one anchor step; when this happens, the Reviewer column notes it (e.g., `coherence, feasibility (+1 anchor)`).

## Example

```markdown
## Document Review Results

**Document:** <root>/plans/2026-03-15-feat-user-auth-plan.md
**Type:** plan
**Reviewers:** coherence, feasibility, security-lens, scope-guardian
- security-lens -- plan adds public API endpoint with auth flow
- scope-guardian -- plan has 15 requirements across 3 priority levels

Applied 5 fixes. 4 items need attention (2 errors, 2 omissions). 2 FYI observations.

### Applied fixes

- Standardized "pipeline"/"workflow" terminology to "pipeline" throughout (coherence)
- Fixed cross-reference: Section 4 referenced "Section 3.2" which is actually "Section 3.1" (coherence)
- Updated unit count from "6 units" to "7 units" to match listed units (coherence)
- Added "update API rate-limit config" step to Unit 4 -- implied by Unit 3's rate-limit introduction (feasibility)
- Added auth token refresh to test scenarios -- required by Unit 2's token expiry handling (security-lens)

### P0 — Must Fix

#### Errors

| # | Section | Issue | Reviewer | Confidence | Tier |
|---|---------|-------|----------|------------|------|
| 1 | Requirements Trace | Goal states "offline support" but technical approach assumes persistent connectivity | coherence | 100 | manual |

### P1 — Should Fix

#### Errors

| # | Section | Issue | Reviewer | Confidence | Tier |
|---|---------|-------|----------|------------|------|
| 2 | Scope Boundaries | 8 of 12 units build admin infrastructure; only 2 touch stated goal | scope-guardian | 75 | manual |

#### Omissions

| # | Section | Issue | Reviewer | Confidence | Tier |
|---|---------|-------|----------|------------|------|
| 3 | Implementation Unit 3 | Plan proposes custom auth but does not mention existing Devise setup or migration path | feasibility | 100 | gated_auto |

### P2 — Consider Fixing

#### Omissions

| # | Section | Issue | Reviewer | Confidence | Tier |
|---|---------|-------|----------|------------|------|
| 4 | API Design | Public webhook endpoint has no rate limiting mentioned | security-lens | 75 | gated_auto |

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
| coherence | completed | 5 | 3 | 0 | 1 | 1 | 0 |
| feasibility | completed | 3 | 1 | 1 | 0 | 0 | 1 |
| security-lens | completed | 2 | 1 | 1 | 0 | 0 | 0 |
| scope-guardian | completed | 2 | 0 | 0 | 1 | 1 | 0 |
| product-lens | not activated | -- | -- | -- | -- | -- | -- |
| design-lens | not activated | -- | -- | -- | -- | -- | -- |

Dropped: 3 (anchors 0/25 suppressed)
Chains: 1 root with 2 dependents
Restated: 2 (residual/deferred items suppressed as duplicates of actionable findings)
```

## Section Rules

- **Summary line**: always present after the reviewer list — "Applied N fixes. K items need attention (X errors, Y omissions). Z FYI observations." Omit any zero clause except the FYI clause (it's informative that none surfaced).
- **Self-contained references**: every fix line and table cell obeys the shared rendering floor (`references/rendering-floor.md`) — the floor is the single source, so do not restate a weaker per-surface rule here. The `Issue` cell leads with the consequence (what goes wrong, for whom) and applies the floor's opaque-token policy to all three classes — navigation anchors (document IDs like `R6`, `U3`: keep the ID, gloss at first mention, e.g. `R6 (suppress peer panels on low-stakes calls)`), provenance anchors (tickets/PRs: gloss only when the event drives the decision, else omit), and mechanism symbols (functions/files/lines: translate to their role) — at most two anchors per cell. A cell whose only description of a referenced item is a bare identifier of any class is not acceptable.
- **Severity sections**: include only levels that have actionable findings (`gated_auto` or `manual`), split into **Errors** then **Omissions**. Omit every empty section, sub-header, and optional block (Applied fixes, FYI Observations, Residual Concerns, Deferred Questions).
- **Compact rendering**: when the combined FYI + Residual + Deferred count is **5 or more**, collapse each of those three sections to a one-line summary plus a tight bullet list — no table, no per-item elaboration. Actionable findings stay fully rendered regardless.
- **Coverage**: always include, all counts post-synthesis. `Auto` counts `safe_auto` at anchor `100`, `Proposed` counts `gated_auto` at anchor `75`/`100`, `Decisions` counts `manual` at anchor `75`/`100`, `FYI` counts any finding at anchor `50`, and `Residual` counts this persona's raw `residual_risks`. Findings at anchors `0`/`25` were dropped by synthesis and appear in no column.
- **Coverage footnote lines** (below the table, when non-zero, in this order): `Dropped: N (anchors 0/25 suppressed)`, `Chains: N root(s) with M dependents`, `Restated: N (residual/deferred items suppressed as duplicates of actionable findings)`. Each on its own line; omit any zero footnote.
- **Chains**: render a root at its normal severity position, with an indented `Dependents (N)` sub-block of `# | Section | Issue | Reviewer | Confidence | Tier` rows immediately below its row. A dependent never also appears at its own severity position.
