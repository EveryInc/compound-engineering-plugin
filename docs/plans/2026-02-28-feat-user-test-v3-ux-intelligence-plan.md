---
title: "Evolve user-test into a compounding UX intelligence system"
type: feat
status: completed
date: 2026-02-28
origin: User vision document (inline, 2026-02-28) + 7 rounds of real testing on Resale Clothing Shop
prior_art:
  - docs/plans/2026-02-26-feat-user-test-browser-testing-skill-plan.md (v1, completed)
  - docs/plans/2026-02-28-feat-user-test-skill-revision-plan.md (v2, completed)
---

# Evolve user-test into a Compounding UX Intelligence System

## Overview

Transform `/user-test` from a browser test runner into a **compounding UX intelligence system** — one that explores, regresses, and gets smarter with every run. The current v2 skill (321 lines) has the right foundations (maturity model, scoring rubric, CLI+browser layers, auto-commit). This plan closes 6 specific gaps identified after 7 real test runs, adds a new UX Opportunities signal category, and wires up the compounding loop so discoveries graduate from browser exploration to CLI regression checks.

**What v3 adds that v2 doesn't have:**
1. Bug registry (`bugs.md`) with open/fixed/regressed lifecycle
2. Per-area score history (not just top-level delta)
3. Structured skip reasons (untested-by-choice vs. infrastructure-failure)
4. Explicit pass thresholds per area
5. Queryable qualitative data (area-tagged best/worst moments)
6. Discovery-to-regression graduation (browser findings become CLI checks)
7. UX Opportunities — suggestions, not failures — as a new report section

## Problem Statement / Motivation

After 7 real test runs, the skill produces useful signal but doesn't compound it efficiently:

- **Bugs evaporate.** A bug found in run 3 and fixed in run 5 has no persistent record linking the discovery to the fix. If it regresses in run 8, the skill doesn't know it's a regression — it just finds a "new" bug.
- **Delta is top-level only.** "Quality went from 3.5 → 4.0" doesn't tell you which area improved. Per-area score history is needed to answer "did the shipping form fix actually help?"
- **Disconnects are invisible.** Three disconnects in a run produce null scores with "extension disconnected" buried in assessment text. There's no machine-readable way to distinguish "skipped because Proven" from "skipped because Chrome crashed."
- **Pass thresholds are implicit.** `consecutive_passes` exists but what counts as a pass varies by area. A search results area with `scored_output: true` needs UX >= 4 AND Quality >= 3, but this threshold lives only in the agent's head.
- **Qualitative signal is write-once.** "Best moment: agent search is excellent" appears in one run's JSON but can't be queried over 20 runs to surface patterns like "agent/search has been the best moment 8 of 10 times."
- **The flywheel doesn't close.** Browser discoveries don't become CLI regression checks. The same bug can silently regress without the fast layer catching it.

## Proposed Solution

### Phase 1: Bug Registry (Gap #1)

Add `tests/user-flows/bugs.md` — a persistent, machine-readable bug tracker that complements GitHub Issues.

```markdown
# Bug Registry

| ID | Area | Status | Issue | Summary | Found | Fixed | Regressed |
|----|------|--------|-------|---------|-------|-------|-----------|
| B001 | checkout/shipping-form | open | #47 | Accepts invalid zip codes | 2026-02-28 | — | — |
| B002 | browse/product-grid | fixed | #48 | Cards not clickable | 2026-02-28 | 2026-03-01 | — |
| B003 | browse/product-grid | regressed | #52 | Cards not clickable (regression of B002) | 2026-03-05 | — | 2026-03-05 |
```

**Status lifecycle:** `open` → `fixed` (when Known-bug area passes fix_check) → `regressed` (if same area fails again after fix). Cross-reference: `Issue` column links to GitHub, `ID` column is the local canonical reference.

**Multi-area bugs:** A bug that manifests in multiple areas gets ONE registry entry with the primary area. The `Summary` field notes "Also affects: area-a, area-b". Each affected area's Known-bug detail references the same bug ID.

**Commit mode updates:** After each run, commit mode:
1. Marks bugs as `fixed` when a Known-bug area's fix_check passes (score >= area's `pass_threshold`, default 4)
2. Files new bugs with next sequential ID
3. Marks bugs as `regressed` when a previously-fixed area fails again
4. Syncs with GitHub issue state (closed issue + passing fix_check = fixed)

**File location:** `tests/user-flows/bugs.md` alongside scenario files. One registry per project, not per scenario.

### Phase 2: Per-Area Score History (Gap #2)

Split storage by audience: humans see trends, machines store history.

**Machine-readable history:** `tests/user-flows/score-history.json` alongside `bugs.md`:

```json
{
  "areas": {
    "checkout/cart": {
      "scores": [
        { "date": "2026-02-28", "ux": 3, "quality": null, "time": 8 },
        { "date": "2026-03-01", "ux": 4, "quality": null, "time": 7 },
        { "date": "2026-03-02", "ux": 4, "quality": null, "time": 6 }
      ],
      "trend": "improving"
    },
    "agent/search-query": {
      "scores": [
        { "date": "2026-02-28", "ux": 4, "quality": 3, "time": 12 },
        { "date": "2026-03-01", "ux": 5, "quality": 4, "time": 9 }
      ],
      "trend": "improving"
    }
  }
}
```

**Storage:** Last 10 entries per area. Oldest drops off when 11th is recorded. One file per project (not per scenario).

**Human-readable trends in test file:** A thin `## Area Trends` section replaces the wide history table:

```markdown
## Area Trends

| Area | Trend | Last Score | Delta |
|------|-------|------------|-------|
| checkout/cart | improving | 4 | +1 |
| checkout/shipping | fixed | 4 | +2 |
| browse/product-grid | stable | 5 | — |
```

**Trend computation:** `improving` (last 3 trending up), `stable` (variance < 0.5 over last 3), `declining` (last 3 trending down), `volatile` (variance >= 1.0 over last 3), `fixed` (previous was <= 2, current >= pass_threshold). Computed from `score-history.json`, not by parsing markdown.

**Delta computation:** Per-area delta compares current score to previous score for that specific area in `score-history.json`. This supplements the existing top-level delta in run history.

### Phase 3: Structured Skip Reasons (Gap #3)

Add `skip_reason` field to each area result in `.user-test-last-run.json`:

```json
{
  "slug": "compare/add-view",
  "ux_score": null,
  "skip_reason": "disconnect",
  "time_seconds": null
}
```

**Enum values:**
- `null` — area was tested normally
- `"proven_spotcheck"` — Proven area, spot-checked only
- `"known_bug_open"` — Known-bug, issue still open, skipped
- `"known_bug_fixed"` — Known-bug, issue closed, ran fix_check
- `"cli_precheck_failed"` — CLI precheck for this area scored <= 2
- `"disconnect"` — MCP disconnect interrupted this area
- `"user_skip"` — User explicitly skipped

**Report impact:** Pass rate calculation excludes `disconnect` and `user_skip` areas. The report shows: "Pass rate: 4/5 (1 area skipped: disconnect)".

### Phase 4: Explicit Pass Thresholds (Gap #4)

Add `pass_threshold` to area details in test files:

```markdown
### checkout/shipping-form
**Interactions:** Enter address, select method, see estimate
**What's tested:** Form validation + shipping logic
**pass_threshold:** 4
```

```markdown
### agent/search-results
**Interactions:** Enter query, review results, refine search
**What's tested:** Result relevance and ranking quality
**scored_output:** true
**pass_threshold:** 4
**quality_threshold:** 3
```

**Defaults:** If `pass_threshold` is not set, default is 4. If `quality_threshold` is not set for `scored_output` areas, default is 3. These match the current implicit behavior but make it explicit and per-area configurable.

**Promotion gate uses thresholds:** "2+ consecutive passes" means 2+ consecutive runs where UX >= `pass_threshold` (and Quality >= `quality_threshold` for scored_output areas).

**Self-documenting:** The test file now contains everything needed to understand when an area graduates — no implicit knowledge required.

### Phase 5: Queryable Qualitative Data (Gap #5)

Tag each qualitative observation with the area slug it relates to:

**In `.user-test-last-run.json`:**
```json
{
  "qualitative": {
    "best_moment": { "area": "agent/search-query", "text": "Agent search returns highly relevant results in <2s" },
    "worst_moment": { "area": "browse/product-detail", "text": "Product cards aren't clickable — expected click-to-detail" },
    "demo_readiness": "partial",
    "verdict": "Agent core is impressive but missing product-click-to-detail hurts the experience",
    "context": "search excellent, product grid needs click handler"
  }
}
```

**In `test-history.md`:** The existing `Key Finding` column already captures one-line findings. Add `Best Area` and `Worst Area` columns to enable pattern queries:

```markdown
| Date | Areas Tested | Quality Avg | Delta | Pass Rate | Best Area | Worst Area | Demo Ready | Context | Key Finding |
```

**Pattern surfacing:** After 10+ runs, commit mode surfaces patterns with asymmetric thresholds:
- **Positive patterns** (high bar): "area X has been best moment in 7+ of last 10 runs" — high evidence required because this is informational, not actionable
- **Negative patterns** (moderate bar): "area X has been worst moment in 5+ of last 10 runs" — lower threshold than positive, but not 3-in-a-row (too noisy during normal development churn). Five of ten captures genuine trends while filtering out transient spikes from feature work.

### Phase 6: Discovery-to-Regression Graduation (Gap #6)

This is the highest-leverage change. When a browser-layer discovery is fixed and verified, offer to generate a CLI regression check.

**Trigger:** When commit mode marks a bug as `fixed`:
1. Check if `cli_test_command` exists in the scenario frontmatter
2. If yes, offer: "Bug B002 (cards not clickable) is fixed. Generate a CLI regression check? (y/n)"
3. If user accepts, append to `cli_queries` in the test file:

```yaml
cli_queries:
  - query: "show me product cards"
    expected: "Returns product data with clickable links or URLs"
    prechecks: "browse/product-grid"
    graduated_from: "B002"  # links back to the bug that spawned this check
```

**Graduation trigger:** Manual decision (user confirms). Automatic graduation after N passes was considered but rejected — the user knows better than the system whether a CLI check can meaningfully cover a UX-discovered issue. Some discoveries are inherently browser-only (layout, animation, visual feedback).

**CLI-ineligible bugs:** If no `cli_test_command` exists, skip the graduation offer. If the bug is purely visual (e.g., CSS layout), note "This bug is browser-only — no CLI graduation available."

**The compounding loop this enables:**
```
Browser discovers bug → bug filed → developer fixes → next run verifies fix
    → fix confirmed → CLI regression check generated
    → future regressions caught by fast CLI layer
    → browser time freed for new exploration
```

### Phase 7: UX Opportunities (New Signal Category)

Two distinct sections in the Phase 4 report — improvement suggestions and patterns to protect:

**UX Opportunities** (action items — things to improve):

```
UX Opportunities:
| ID | Area | Priority | Status | Suggestion |
|----|------|----------|--------|-----------|
| UX001 | browse/product-grid | P1 | open | Product cards should be clickable (users expect click-to-detail) |
| UX002 | agent/search-results | P2 | open | Follow-up suggestion buttons are excellent — make more prominent |
```

**Good Patterns** (preservation notes — things to protect):

```
Good Patterns:
| Area | Pattern | First Seen | Last Confirmed |
|------|---------|------------|----------------|
| browse/filters | Filter chip with sub-filter counts is a best-practice pattern | 2026-02-28 | 2026-03-02 |
| agent/search-results | Agent follow-up buttons after search are excellent | 2026-02-28 | 2026-03-02 |
```

**Why separate sections:** P1 and P2 are action items — things to improve. Good Patterns are "don't break this" notes — a fundamentally different signal. Mixing them in one table conflates suggestions with preservation. Good Patterns also have a simpler lifecycle (confirmed each run, no status transitions).

**Priority mapping (UX Opportunities only):**
- **P1** — Missing expected interaction (friction source)
- **P2** — Enhancement to an already-good interaction

**UX Opportunity lifecycle:** Each entry has a `status` field:
- `open` — suggestion logged, not yet acted on
- `implemented` — the improvement was made (agent detects the change, or user marks manually)
- `wont_fix` — explicitly declined (keeps the log honest, prevents re-suggestion)

Entries rotate: keep last 20 `open` entries. `implemented` and `wont_fix` entries age out after 30 days (they've served their purpose).

**Good Patterns lifecycle:** Simpler — `Last Confirmed` updates each run that observes the pattern. Patterns not confirmed for 5+ runs are removed (the code changed, the pattern may no longer exist). No status field needed.

**Dedup:** Anchored on explicit IDs, not fuzzy text matching. UX Opportunities use sequential IDs (UX001, UX002...). When the agent observes something that might duplicate an existing entry, it checks by `area slug + priority level`: if the same area already has an open entry at the same priority, the agent decides whether to update or create new — not automated text overlap matching. Good Patterns dedup on area slug only (one pattern entry per area).

**Distinct from bugs:** Bugs are functional failures (score <= 2) or complete output failures (quality <= 1). UX Opportunities are observations at score 3-5 where the experience could be better. Good Patterns are observations at score 4-5 where the experience is already good.

**No GitHub issue filing:** Both sections are logged in the test file only. They feed the product backlog but don't create issue noise. The user can manually promote a UX Opportunity to an issue if they want.

**Storage:** Two new sections in the test file: `## UX Opportunities Log` and `## Good Patterns`.

## Technical Considerations

### Schema Migration: v2 → v3

**New frontmatter fields (all optional):**
- None — all new data lives in new sections, not frontmatter

**New test file sections:**
- `## Area Trends` — replaces Area Score History, thin summary (trend + last score + delta)
- `## UX Opportunities Log` — improvement suggestions with status lifecycle
- `## Good Patterns` — patterns worth preserving (separate from opportunities)

**New standalone files:**
- `tests/user-flows/bugs.md` — bug registry
- `tests/user-flows/score-history.json` — full per-area score history (machine-readable)

**Run results JSON changes:**
- `areas[].skip_reason` — new field (nullable string enum)
- `qualitative.best_moment` — changes from string to `{ area, text }` object
- `qualitative.worst_moment` — changes from string to `{ area, text }` object
- `ux_opportunities` — new array at top level (P1/P2 improvement suggestions with IDs)
- `good_patterns` — new array at top level (area-level patterns worth preserving)

**Backward compatibility:** v2 files work unchanged. New sections are added on first v3 commit. The `qualitative` field change is breaking for `.user-test-last-run.json` consumers — but this file is ephemeral (overwritten each run, gitignored), so no migration needed. Bump `schema_version: 3` on first commit that adds new sections.

**Migration strategy:** Same as v1→v2: fill defaults on read, upgrade on write. No separate migration step.

### SKILL.md Line Budget

Current: 321 lines. v3 additions estimated:

| Addition | Lines in SKILL.md | Lines in references/ |
|----------|------------------|---------------------|
| Bug registry lifecycle | ~15 | ~40 (bugs-registry.md) |
| Per-area trends + score-history.json | ~5 | ~15 (in test-file-template.md) |
| Structured skip reasons | ~8 | 0 (enum in JSON schema) |
| Pass thresholds | ~5 | ~10 (in test-file-template.md) |
| Queryable qualitative | ~5 | 0 (JSON schema change) |
| Graduation mechanism | ~15 | ~30 (graduation.md) |
| UX Opportunities + Good Patterns | ~15 | ~25 (in test-file-template.md) |
| Schema v3 migration note | ~5 | 0 |
| **Total** | **~73** | **~120** |

**Projected SKILL.md:** ~394 lines — within 500-line budget.

**New reference file:** `references/bugs-registry.md` for bug lifecycle documentation.
**New reference file:** `references/graduation.md` for discovery-to-regression graduation.
**Updated reference file:** `references/test-file-template.md` for new sections + pass thresholds.

**Line-count checkpoint:** After implementing step 4 (SKILL.md updates), run `wc -l < SKILL.md` before proceeding to step 5. If over 420 lines, extract UX Opportunities or graduation to their own reference files immediately — don't wait until post-implementation cleanup.

**Graduation extraction trigger:** The graduation mechanism (Phase 6) involves conditional logic across several states (cli_test_command present?, bug type visual or functional?, user response). If it exceeds 20 lines in SKILL.md during implementation, extract to `references/graduation.md` immediately. The reference file is already planned; the question is whether graduation lives as a brief summary in SKILL.md with details in the reference, or entirely in the reference from the start. Default: start in SKILL.md, extract if it grows.

### Two-Layer Architecture Clarification

v2 already implements CLI-first (Phase 2.5) and Browser-second (Phase 3). v3 doesn't change the execution order, but the graduation mechanism (Phase 6) creates a feedback loop:

```
Layer 2 (Browser) → discovers issue → fix verified → graduation offered
    ↓
Layer 1 (CLI) ← new regression check added ← catches regressions fast
    ↓
Layer 2 (Browser) → freed to explore new territory
```

This is the compounding loop in action. Over time, the CLI layer grows and the browser layer stays focused on unknowns.

### Open Questions Resolved

**Q: How does bugs.md handle bugs that span multiple areas?**
A: One registry entry with primary area. Summary notes "Also affects: area-a, area-b". Each affected area's Known-bug detail references the same bug ID.

**Q: Should UX Opportunities have priority (P1/P2/P3)?**
A: Yes. P1 = missing expected interaction, P2 = enhancement to good interaction, P3 = pattern worth preserving.

**Q: What's the graduation trigger?**
A: Manual — user confirms after fix is verified. The user knows whether a CLI check can meaningfully cover a UX-discovered issue. Some discoveries are inherently browser-only.

**Q: How does the command handle an app it's never seen before?**
A: Already handled by v2 — passing a description string to `/user-test` creates a new test file from template. No separate `/user-test init` needed. The first run IS the init.

## Acceptance Criteria

### Phase 1: Bug Registry
- [x] `tests/user-flows/bugs.md` created on first bug filing if it doesn't exist
- [x] Bug IDs are sequential (B001, B002, ...)
- [x] Status lifecycle works: open → fixed → regressed
- [x] Multi-area bugs have one entry with "Also affects" note
- [x] Commit mode syncs bug status with GitHub issue state
- [x] Fixed bugs are detected when Known-bug area passes fix_check (score >= area's `pass_threshold`, default 4)
- [x] Regression detection: previously-fixed area fails → new issue "Regression of #N" + bug marked regressed

### Phase 2: Per-Area Score History
- [x] `tests/user-flows/score-history.json` created on first run, stores full per-area history
- [x] Last 10 entries per area in JSON, oldest drops at 11th
- [x] `## Area Trends` section in test file shows Trend + Last Score + Delta (human-readable summary)
- [x] Trend computed from JSON: improving/stable/declining/volatile/fixed
- [x] Per-area delta computed from JSON, not by parsing markdown

### Phase 3: Structured Skip Reasons
- [x] `skip_reason` field present in `.user-test-last-run.json` for every area
- [x] Enum: null, proven_spotcheck, known_bug_open, known_bug_fixed, cli_precheck_failed, disconnect, user_skip
- [x] Pass rate calculation excludes disconnect and user_skip
- [x] Report displays skip count and reasons

### Phase 4: Pass Thresholds
- [x] `pass_threshold` field supported in area details (default: 4)
- [x] `quality_threshold` field supported for scored_output areas (default: 3)
- [x] Promotion gate uses per-area thresholds
- [x] Test file is self-documenting — thresholds visible in area details

### Phase 5: Queryable Qualitative
- [x] `best_moment` and `worst_moment` in JSON are `{ area, text }` objects
- [x] `test-history.md` has `Best Area` and `Worst Area` columns
- [x] Positive pattern detection: 7+ of last 10 runs (high bar — informational signal)
- [x] Negative pattern detection: 5+ of last 10 runs (moderate bar — actionable signal)

### Phase 6: Graduation
- [x] After bug marked fixed, offer CLI graduation if `cli_test_command` exists
- [x] Graduated CLI query includes `graduated_from: "B00N"` tag
- [x] Skip graduation offer for browser-only bugs (no CLI equivalent)
- [x] Skip graduation offer if no `cli_test_command` in frontmatter

### Phase 7: UX Opportunities + Good Patterns
- [x] `UX Opportunities` section in Phase 4 report (P1/P2 action items)
- [x] `Good Patterns` section in Phase 4 report (separate from opportunities)
- [x] UX Opportunities use sequential IDs (UX001, UX002...) with status lifecycle (open/implemented/wont_fix)
- [x] Good Patterns dedup on area slug only, `Last Confirmed` updates each run, removed after 5 runs unconfirmed
- [x] Dedup: same area + same priority = agent decides (not fuzzy text matching)
- [x] Stored in test file: `## UX Opportunities Log` (last 20 open) + `## Good Patterns`
- [x] Distinct from bugs — no GitHub issue creation
- [x] UX Opportunities triggered at score 3-5; Good Patterns triggered at score 4-5

### Schema & Compatibility
- [x] v2 files load without error (new sections added on first commit)
- [x] `schema_version: 3` set on first v3 commit
- [x] SKILL.md stays under 500 lines after all additions (checkpoint at step 4.5)
- [x] bugs-registry.md reference file created
- [x] graduation.md reference file created
- [x] test-file-template.md updated with Area Trends, UX Opportunities Log, Good Patterns sections
- [x] score-history.json schema documented in test-file-template.md

### Version & Metadata
- [x] Version bumped (2.36.0 → 2.37.0)
- [x] CHANGELOG.md updated
- [x] Plugin.json and marketplace.json description counts verified

## Implementation Sequence

1. **Create `references/bugs-registry.md`** — bug lifecycle, multi-area handling, status transitions, fix_check threshold tied to pass_threshold
2. **Create `references/graduation.md`** — discovery-to-regression mechanism, CLI query generation, browser-only bug detection
3. **Update `references/test-file-template.md`** — add Area Trends section (replacing wide score history table), UX Opportunities Log + Good Patterns sections, score-history.json schema, pass_threshold/quality_threshold in area details, schema_version: 3
4. **Update SKILL.md** — add bug registry lifecycle to Commit Mode, skip_reason to Phase 3/4, pass thresholds to promotion gate, qualitative tagging to Phase 4, graduation offer to Commit Mode, UX Opportunities + Good Patterns to Phase 4, schema v3 migration note to Phase 1
5. **Line-count checkpoint** — run `wc -l < SKILL.md`. If over 420 lines, extract graduation or UX Opportunities to reference files before proceeding. This is a hard gate, not a suggestion.
6. **Update `.user-test-last-run.json` schema** — add skip_reason, change qualitative structure, add ux_opportunities, add good_patterns
7. **Bump metadata** — version, changelog, plugin.json, marketplace.json
8. **Validate** — SKILL.md line count, JSON validity, reference links, score-history.json schema
9. **Install locally** — copy to ~/.claude/skills/user-test/

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| bugs.md grows unbounded | Rotation: archive entries older than 6 months to bugs-archive.md |
| score-history.json grows with many areas over many runs | Cap at 10 entries per area; one file per project. At 30 areas x 10 entries = ~300 entries — manageable JSON size |
| Graduation offers interrupt flow | Single y/n prompt after commit, not during test run. Batch all graduation offers into one prompt. |
| Pattern detection is noisy early on | Only trigger after 10+ runs. Positive patterns: 7/10 threshold. Negative patterns: 5/10 threshold. |
| UX Opportunity dedup produces false matches | Dedup anchored on area slug + priority level, not text overlap. Agent decides on conflicts — no automated fuzzy matching. |
| Good Patterns log bloat (agent flags everything good as a pattern) | Only log patterns at score 4-5 that represent a *deliberate design choice* (not just "page loaded"). Patterns auto-expire after 5 runs unconfirmed. |
| UX Opportunities with no lifecycle become stale | Status field (open/implemented/wont_fix). Implemented and wont_fix age out after 30 days. Open entries capped at 20. |
| schema_version: 3 migration adds sections to existing test files | Non-destructive: new sections appended, existing content preserved |
| SKILL.md approaches 400 lines | Hard gate at step 5: if over 420 lines, extract before proceeding. Graduation earmarked for early extraction (20-line trigger). |
| qualitative JSON structure change breaks external consumers | .user-test-last-run.json is gitignored and ephemeral — no external consumers expected |

## Sources & References

### Prior Plans
- [v1 plan: user-test browser testing skill](docs/plans/2026-02-26-feat-user-test-browser-testing-skill-plan.md) — original skill architecture (completed)
- [v2 plan: user-test skill revision](docs/plans/2026-02-28-feat-user-test-skill-revision-plan.md) — schema v2, timing, CLI mode, auto-commit (completed)

### Internal References
- Current SKILL.md: `plugins/compound-engineering/skills/user-test/SKILL.md` (321 lines, schema v2)
- Test file template: `plugins/compound-engineering/skills/user-test/references/test-file-template.md`
- Anti-patterns: `docs/solutions/2026-02-26-monolith-to-skill-split-anti-patterns.md`

### Learnings Applied
- **Monolith-to-skill split:** Reference file extraction from day one prevents SKILL.md bloat (confirmed by v2 staying at 321 lines)
- **Agent-guided state patterns:** Use agent judgment for maturity transitions, not mechanical counters (validated by 7 real runs)
- **Plugin versioning:** Always bump version, changelog, and description counts in lockstep
