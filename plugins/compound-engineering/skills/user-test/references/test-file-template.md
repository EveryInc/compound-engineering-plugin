# Test File Template

Test files live in `tests/user-flows/<scenario-slug>.md` in the target project. Each file is a living document that compounds knowledge across runs.

## Template

```markdown
---
schema_version: 3
scenario: "<scenario-name>"
app_url: "http://localhost:3000"
created: "<YYYY-MM-DD>"
last_run: "<YYYY-MM-DD>"
cli_test_command: ""  # optional, e.g. "node scripts/test-cli.js --query '{query}'"
cli_queries:  # optional
  # - query: "example query"
  #   expected: "description of correct response (agent evaluates semantically)"
  #   prechecks: "area-slug"  # optional — browser area to skip on CLI failure
  #   graduated_from: "B001"  # optional — bug ID that spawned this check (see graduation.md)
performance_thresholds:  # optional, seconds
  # fast: 2
  # acceptable: 8
  # slow: 20
  # broken: 60
---

# <Scenario Name>

## Areas

| Area | Status | Last Score | Last Quality | Last Time | Consecutive Passes | Notes |
|------|--------|------------|-------------|-----------|-------------------|-------|
| <area-slug> | Uncharted | — | — | — | 0 | |

## Area Details

### <area-slug>

**Interactions:** <1-3 user-facing tasks this area covers>

**What's tested:** <brief description of what quality means here>

**pass_threshold:** 4

## Area Trends

<!-- Auto-maintained from score-history.json. Do not edit manually. -->

| Area | Trend | Last Score | Delta |
|------|-------|------------|-------|

## Explore Next Run

<!-- Priority: P1 = likely user-facing friction, P2 = edge case worth knowing, P3 = curiosity -->

| Priority | Area | Why |
|----------|------|-----|
| P1 | | |

## Run History

<!-- Keep last 50 entries. Oldest entries rotate out. -->

| Date | Areas Tested | Quality Avg | Delta | Pass Rate | Best Area | Worst Area | Demo Ready | Context | Key Finding |
|------|-------------|-------------|-------|-----------|-----------|------------|------------|---------|-------------|

## UX Opportunities Log

<!-- Action items: things to improve. Keep last 20 open entries. -->

| ID | Area | Priority | Status | Suggestion |
|----|------|----------|--------|-----------|

## Good Patterns

<!-- Preservation notes: things to protect. Auto-expire after 5 unconfirmed runs. -->

| Area | Pattern | First Seen | Last Confirmed |
|------|---------|------------|----------------|
```

## Schema Migration

**v1 → v2 changes:**
- Areas table: added `Last Quality` and `Last Time` columns
- Run History table: added `Delta` and `Context` columns
- Frontmatter: added optional `cli_test_command`, `cli_queries`, `performance_thresholds`

**v2 → v3 changes:**
- New section: `## Area Trends` (thin summary from score-history.json)
- New section: `## UX Opportunities Log` (P1/P2 improvement suggestions with status lifecycle)
- New section: `## Good Patterns` (patterns worth preserving, separate from opportunities)
- New standalone file: `tests/user-flows/score-history.json` (machine-readable per-area history)
- Run History table: added `Best Area` and `Worst Area` columns
- Area Details: added optional `pass_threshold` and `quality_threshold` fields
- Frontmatter: added optional `graduated_from` field on cli_queries entries

**Reading v1 files:** Fill missing columns with defaults (`—` for scores/times, empty for notes). Do NOT rewrite the file on read.

**Reading v2 files:** Fill missing sections (Area Trends, UX Opportunities Log, Good Patterns) with empty tables. Fill missing Run History columns (Best Area, Worst Area) with `—`. Do NOT rewrite the file on read.

**Writing v1 or v2 files:** Upgrade to v3 on commit — add new columns and sections, preserve all existing data. Bump `schema_version: 3` in frontmatter.

**Forward compatibility:** Ignore unknown frontmatter fields from future schema versions. Preserve unknown table columns on write.

## Pass Thresholds

Each area can define explicit pass thresholds in its area details:

```markdown
### checkout/shipping-form
**Interactions:** Enter address, select method, see estimate
**What's tested:** Form validation + shipping logic
**pass_threshold:** 4
```

For `scored_output` areas, add a quality threshold:

```markdown
### agent/search-results
**Interactions:** Enter query, review results, refine search
**What's tested:** Result relevance and ranking quality
**scored_output:** true
**pass_threshold:** 4
**quality_threshold:** 3
```

**Defaults:** `pass_threshold: 4`, `quality_threshold: 3` (for scored_output areas). These match the v2 implicit behavior but are now explicit and per-area configurable.

**Promotion gate:** "2+ consecutive passes" means 2+ consecutive runs where UX >= `pass_threshold` (and Quality >= `quality_threshold` for scored_output areas).

## Known-Bug Area Details

Areas with `Known-bug` status include additional fields:

```markdown
### cart-quantity-update
**Status:** Known-bug
**Issue:** #47
**Bug ID:** B001
**Fix check:** Verify quantity updates in <5s and cart badge reflects new count
```

The `**Issue:** #<number>` field is the canonical reference for `gh issue view`. The `**Bug ID:** B00N` field links to the bug registry entry. The `**Fix check:**` field describes what to verify when the issue is closed — fix_check passes when score >= area's `pass_threshold`.

## Score History JSON

Per-area score history is stored in `tests/user-flows/score-history.json`:

```json
{
  "areas": {
    "checkout/cart": {
      "scores": [
        { "date": "2026-02-28", "ux": 3, "quality": null, "time": 8 },
        { "date": "2026-03-01", "ux": 4, "quality": null, "time": 7 }
      ],
      "trend": "improving"
    }
  }
}
```

**Storage:** Last 10 entries per area. Oldest drops when 11th is recorded. One file per project.

**Trend values:** `improving` (last 3 trending up), `stable` (variance < 0.5), `declining` (last 3 trending down), `volatile` (variance >= 1.0), `fixed` (previous <= 2, current >= pass_threshold).

**Gitignore:** Add `score-history.json` to `.gitignore` if the project treats test data as ephemeral. Otherwise keep it committed for team visibility.

## UX Opportunity Lifecycle

| Status | Meaning |
|--------|---------|
| open | Suggestion logged, not yet acted on |
| implemented | Improvement was made (agent detects or user marks) |
| wont_fix | Explicitly declined (prevents re-suggestion) |

Keep last 20 `open` entries. `implemented` and `wont_fix` age out after 30 days.

Dedup: anchored on area slug + priority level. Agent decides whether to update or create new — no automated text matching.

## Good Patterns Lifecycle

`Last Confirmed` updates each run that observes the pattern. Patterns not confirmed for 5+ runs are removed. Dedup on area slug only (one pattern entry per area).

Only log patterns at score 4-5 that represent a deliberate design choice, not just "page loaded successfully."

## Area Granularity

Each area should cover 1-3 scored interaction units. An interaction unit is one user-facing task completion (e.g., "add item to cart"), not a page load or navigation step.

### Worked Example: Checkout Flow

Instead of one large "checkout" area, decompose into:

| Area | Interactions | What's Tested |
|------|-------------|---------------|
| `checkout/cart-validation` | Add item, verify count, change quantity | Cart state management |
| `checkout/shipping-form` | Enter address, select method, see estimate | Form validation + shipping logic |
| `checkout/payment-submission` | Enter card, submit, see confirmation | Payment flow + success state |

This granularity ensures:
- A single bug doesn't reset a huge chunk of proven territory
- Areas are small enough to accumulate consecutive passes meaningfully
- Each area maps to a distinct `user-test:<area-slug>` label for issue tracking

### Worked Example: Settings Page

| Area | Interactions | What's Tested |
|------|-------------|---------------|
| `settings/profile-update` | Edit name, upload avatar, save | Profile persistence |
| `settings/notifications` | Toggle email prefs, save, verify | Notification preferences |
| `settings/account-delete` | Click delete, confirm dialog, verify | Destructive action flow |

### Worked Example: AI Search with scored_output

Areas that produce evaluated output (search results, recommendations, AI responses) use `scored_output: true`:

```markdown
### search-results
**Interactions:** Enter query, review results, refine search
**What's tested:** Result relevance and ranking quality
**scored_output:** true
**pass_threshold:** 4
**quality_threshold:** 3
```

When `scored_output: true`, the area is scored on both UX (1-5) and output quality (1-5). The `Last Quality` column tracks the output quality score.

## Maturity Status Reference

| Status | Symbol | Meaning |
|--------|--------|---------|
| Proven | Proven | 2+ consecutive passes, no functional regressions |
| Uncharted | Uncharted | Default state, or demoted from Proven |
| Known-bug | Known-bug | Issue filed, skip until fix deployed |
