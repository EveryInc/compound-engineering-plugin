---
name: user-test
description: Run browser-based user testing via claude-in-chrome MCP with quality scoring and compounding test files. Use when testing app quality, scoring interactions, tracking test maturity, or filing issues from test sessions.
argument-hint: "[scenario-file-or-description]"
disable-model-invocation: true
---

# User Test

Exploratory testing in a visible Chrome window. The user watches the test
happening in real-time and can intervene if needed. Claude shares the browser's
login state — sign into the app in Chrome before running.

For automated headless regression testing, use `/test-browser` instead.

**v1 limitation:** This skill targets localhost / local dev server apps. External
or staging URLs are not validated for deployment status — verify remote apps are
live and accessible before testing.

## Phase 0: Preflight

1. **Chrome MCP check — deferred to Phase 2.** Phase 1 CLI discovery may eliminate browser testing.
2. **Detect WSL:** Run `uname -r 2>/dev/null | grep -qi microsoft`. If WSL: abort with "Chrome integration not supported in WSL."
3. **Check gh CLI:** Run `gh auth status`. If not authenticated: note "gh not authenticated — issue creation skipped in commit mode."
4. **Validate app URL:** If test file contains `app_url`, verify reachable. Site permission errors handled reactively during execution.

## Phase 1: Load Context

**Input:** `$ARGUMENTS` — either a path to an existing test file or a description of what to test. A trailing integer N triggers multi-run mode (e.g., `/user-test resale-clothing 5`). See [probes.md](./references/probes.md) for multi-run orchestration: inter-run probe state, progressive Proven area reduction, interruption handling, and N-run summary format.

1. **Resolve test file:**
   - If argument is a file path (contains `/` or ends in `.md`):
     - Validate path resolves within `tests/user-flows/` (prevent directory traversal)
     - Read and parse the test file
     - Validate `schema_version` is present (1–6 accepted) <!-- bump range when schema changes -->
     - **v1 migration:** If `schema_version: 1`, fill missing columns with defaults in memory (`Last Quality` → `—`, `Last Time` → `—`, `Delta` → `—`, `Context` → empty). Do NOT rewrite the file — upgrades happen only during commit.
     - **v2 migration:** If `schema_version: 2`, fill missing sections (Area Trends, UX Opportunities Log, Good Patterns) with empty tables. Fill missing Run History columns (Best Area, Worst Area) with `—`. Do NOT rewrite the file on read.
     - **v3 migration:** If `schema_version: 3`, treat missing `verify:` blocks and `Probes:` tables as absent. Do NOT rewrite the file on read.
     - **v4 migration:** If `schema_version: 4`, treat missing `**Queries:**` and `**Multi-turn:**` tables as absent. Do NOT rewrite the file on read.
     - **Forward compatibility:** Ignore unknown frontmatter fields. Preserve unknown table columns on write.
     - **Missing `cli_test_command` (any version):** Treat as `cli_test_command: ""`. CLI discovery (step 2) will populate it. Do NOT rewrite the file on read.
     - Extract maturity map, run history, and explore-next-run items
   - If argument is a description string:
     - Generate a slug from the description
     - Check if `tests/user-flows/<slug>.md` already exists
     - If not, create from template — see [test-file-template.md](./references/test-file-template.md)
     - Decompose the description into areas (1-3 interactions each). For new test files, write **rich** area definitions — see Area Depth in [test-file-template.md](./references/test-file-template.md). For `scored_output` areas, include Queries and Multi-turn sequences.
   - If no argument:
     - Scan `tests/user-flows/` for existing test files
     - Present list and ask which to run, or prompt for a new description
2. **Orientation (first run only):** If `seams_read` is false or absent in frontmatter, run code reading to identify structural seams before any browser interaction. Output: 0-5 structural-hypothesis probes.
   See [orientation.md](./references/orientation.md). Set `seams_read: true` on first commit after code reading, regardless of outcome.
3. **CLI discovery (MANDATORY when `cli_test_command` is empty):** Whether the test file is new or existing, if `cli_test_command` is empty, run CLI discovery NOW before any browser interaction — follow every step in CLI Discovery in [test-file-template.md](./references/test-file-template.md). Check for API endpoints, test scripts, curl-able routes. If a testable surface exists, populate `cli_test_command` and `cli_queries` in the test file immediately. Do NOT skip this step. Do NOT ask the user whether to do it — just do it.
4. **Ensure `.gitignore` coverage:**
   - Check that `.user-test-last-run.json` is in the project's `.gitignore`
   - If missing, append it (this file is ephemeral run state, not source)
   - Note: `score-history.json` and `bugs.md` are NOT gitignored — they are persistent project data
5. **Handle corruption:**
   - If required sections are missing or `schema_version` is absent, offer to regenerate from template
6. **Capture git state:** Run `git rev-parse HEAD` and `git rev-parse origin/main 2>/dev/null`. Run `git diff --name-only origin/main..HEAD` — if this returns ANY files, those are code-affected areas requiring full exploration (even on a feature branch where main is "behind" HEAD). See [run-targeting.md](./references/run-targeting.md) for full rules.

## Phase 2: Setup

0. **Check claude-in-chrome MCP:** Call any `mcp__claude-in-chrome__*` tool. If NOT available and browser areas exist: display "claude-in-chrome not connected. Run `/chrome` or restart with `claude --chrome`" and abort. Skip if all testing is CLI-only.
1. **Environment sanity check:**
   - Navigate to the app URL using `mcp__claude-in-chrome__navigate`
   - Verify the page loaded with expected content (not an error page, stale auth redirect, or empty state)
   - If error banners, API failures, or empty data detected: abort with "App environment issue detected — fix the app state before testing"
2. **Authentication check:**
   - Claude shares the browser's login state — no credential handling needed
   - If a login page or CAPTCHA is encountered: pause and instruct "Sign in to your app in Chrome, then press Enter to continue"
3. **Baseline screenshot:**
   - Take a screenshot of the app's initial state for reference

## Phase 2.5: CLI Testing (Optional)

If the test file defines `cli_test_command` in frontmatter, run CLI queries before browser testing. CLI mode catches agent reasoning errors without browser overhead.

**When `cli_test_command` is present:**
1. Phase 0 runs `gh auth status` only (Chrome MCP deferred). Skip Phase 2 browser setup entirely (unless browser areas also exist).
2. For each `scored_output` area's **Queries:** table: run the Query text through `cli_test_command` (skip browser-specific queries mentioning clicks/scrolling/layout). Score as CLI Quality. See CLI Area Queries in [queries-and-multiturn.md](./references/queries-and-multiturn.md).
3. For each query in `cli_queries`: run the command via Bash (substituting `{query}`), capture stdout.
4. Score output quality 1-5 using the **output quality rubric** (see Scoring section). The agent evaluates whether CLI output satisfies the `expected` description **semantically** — not exact string matching. The `expected` field describes what a correct response looks like.
5. CLI results feed into the same maturity map and scoring pipeline.
6. **Browser area overlap:** If a CLI query has a `prechecks: "area-slug"` tag and scores <= 2, skip the tagged browser area with "CLI pre-check failed — skipping browser test." No `prechecks` tag = standalone CLI query, no browser areas skipped.
7. Credentials: the command inherits the shell environment. No credentials stored in the test file.

**CLI + browser coexistence:** When both exist, run CLI first. CLI failures only skip browser areas explicitly tagged via `prechecks`.

## Phase 3: Execute

Test areas based on maturity status. The agent exercises judgment on area selection — these are guidelines, not rigid rules. Record a `skip_reason` for each area not fully tested (see [test-file-template.md](./references/test-file-template.md) for enum values).

**Run focus vs. area budget:** A run focus (e.g., "consumer stress test", "search bar exploration") controls WHAT you test within each area — which queries, which edge cases, which user personas. It does NOT override maturity-based time allocation (see override priority table in [run-targeting.md](./references/run-targeting.md)). Proven areas at score 5 get max 3 MCP calls regardless of run focus. The focus shapes the 3 calls (test the search bar instead of basic navigation), not the count.

### Per-Area Checklist (run in order for every area)

0. **CLI precheck gate** — if `prechecks` CLI query scored ≤ 2, skip. No prechecks tag = proceed. No CLI = proceed.
1. **Run probes** — failing/untested first. See [probes.md](./references/probes.md).
2. **Execute Queries and Multi-turn** — if defined. See [queries-and-multiturn.md](./references/queries-and-multiturn.md).
3. **Novelty budget — MANDATORY.** Use at least 1 MCP call (Proven areas)
   or 30% of probe+query calls minimum 2 (Uncharted/FULL areas) on
   interactions not in any Query, Probe, or Multi-turn table. At least 1
   novel interaction per scored_output area must generate a probe. Log
   what you tried and what you observed.
   See novelty budget rules in [queries-and-multiturn.md](./references/queries-and-multiturn.md).
4. **Verification pass** — per area type. See [verification-patterns.md](./references/verification-patterns.md).
5. **Score** — UX (1-5) + Quality if `scored_output: true`.
6. **Time** — wall-clock seconds, first to last MCP call. Async waits count. Disconnect = `—`.
7. **Notes** — what surprised you? Feeds Explore Next Run + new Queries in commit.

Probes, verification, and UX scores are three separate signals — none subsumes the others.

### Probe Execution (Before Broad Exploration)

Read probes from area `**Probes:**` tables. Execute `untested` and `failing` probes before broad exploration — these are the highest-signal checks. For Proven areas, failing/untested probes always run regardless of MCP budget; the 3-call cap only constrains passing-probe spot-checks. Record each probe result. See [probes.md](./references/probes.md) for execution flow, lifecycle, and dedup rules.

### Verification Pass (After Each Area)

After exploring each area, run structural verification checks based on area type — independent of what the agent noticed. Read the area's `**verify:**` block for area-specific instructions. Record verification results separately from UX score. Verification failures block promotion to Proven but do not demote existing Proven areas. See [verification-patterns.md](./references/verification-patterns.md) for standard checks, tolerance rules, and maturity interaction.

### Area Selection Priority

See [run-targeting.md](./references/run-targeting.md) for full rules including
git-aware targeting, progressive narrowing, and override priority.

Quick reference: (0) Code-affected → full. (1) P1 Explore Next Run → full. (2) Uncharted → full. (3) Proven → spot-check (3 MCP + failing probes). (4) Known-bug → check issue state:
  - `gh issue view` or check tracker — if closed/fixed, flip to Uncharted (verify the fix)
  - if open, spot-check the bug area (confirm still broken, note any change)
(5) All Proven → spot-check all, suggest new areas.

### Connection Resilience

1. After any MCP tool failure: wait 3 seconds (`Bash: sleep 3`)
2. Retry the call once
3. If retry fails: display "Extension disconnected. Run `/chrome` and select Reconnect extension"
4. Track `disconnect_counter` for the session
5. If `disconnect_counter >= 3`: abort with "Extension connection unstable. Check Chrome extension status and restart the session."

### Modal Dialog Handling

If MCP commands stop responding after triggering an action that may produce a dialog (`alert`, `confirm`, `prompt`): instruct the user to dismiss the dialog manually before continuing.

### Graceful Degradation

- Screenshot fails: continue, note "screenshots unavailable" in report
- `javascript_tool` fails: fall back to individual `find`/`click` calls
- All MCP tools fail: abort with recovery instructions

## Phase 4: Score and Report

### Scoring

Score each area on a 1-5 scale per scored interaction unit. A scored interaction unit is one user-facing task completion (e.g., "add item to cart", "submit form"). Navigation, page loads, and setup steps are not scored individually.

| Score | Meaning | Example |
|-------|---------|---------|
| 1 | Broken — cannot complete the task | Button unresponsive, page crashes |
| 2 | Completes with major friction | 3+ confusing steps, error messages |
| 3 | Completes with minor friction | Small UX issues, unclear labels |
| 4 | Smooth experience | Clear flow, no confusion |
| 5 | Delightful | Exceeds expectations, helpful feedback |

Scores are **absolute** per this rubric. The same checkout flow should produce the same score regardless of which test scenario triggered it.

### Output Quality Scoring (Optional)

Areas with `scored_output: true` in their area details are scored on TWO dimensions:

| Score | UX Meaning | Output Quality Meaning |
|-------|-----------|----------------------|
| 5 | Delightful | Exactly what an expert would produce |
| 4 | Smooth | Relevant, minor misses |
| 3 | Minor friction | Partially correct |
| 2 | Major friction | Mostly wrong |
| 1 | Broken | Completely wrong |

Report shows both: `UX: 4/5, Quality: 3/5`. Areas without `scored_output` show UX only.

**Aggregation:** `Quality Avg` in history = UX scores only (backward compatible). Output quality tracked separately as `Output Avg` in the report.

**Promotion gate:** Each area's `pass_threshold` (default 4) and `quality_threshold` (default 3 for scored_output areas) define what counts as a pass. See [test-file-template.md](./references/test-file-template.md) for details.

**Known-bug filing trigger:** UX <= 2 (functional failure) OR Quality <= 1 (completely wrong output). Files to bug registry — see [bugs-registry.md](./references/bugs-registry.md).

### Performance Threshold Evaluation (Optional)

If the test file defines `performance_thresholds` in frontmatter, append a timing grade to each area's assessment: `(fast)`, `(acceptable)`, `(slow)`, `(BROKEN)`. Compare each area's wall-clock time against the thresholds. A `broken` timing is a notable finding but does NOT affect the UX score — timing and quality are separate dimensions.

### Collection Categories

For each tested area, collect:
1. **UX score** (1-5 per interaction unit)
2. **Time** (wall-clock seconds from Phase 3 timing)
3. **Issues found** (bugs, UX problems, accessibility gaps)
4. **Maturity assessment** (promote, demote, or maintain current status)

After all areas are scored, generate:
5. **Qualitative summary:** best moment (tagged with area slug), worst moment (tagged with area slug), demo readiness (yes/partial/no), one-line verdict
6. **Explore Next Run items** (2-3 items with priority P1/P2/P3):
   - **P1** — Things that surprised you (positive or negative)
   - **P2** — Edge cases adjacent to tested areas
   - **P3** — Interactions started but not finished, or borderline scores (score of 3 warrants deeper investigation next run)
7. **UX Opportunities** (P1/P2 action items for improvements observed at score 3-5)
8. **Good Patterns** (patterns worth preserving observed at score 4-5 — deliberate design choices, not trivial successes)
9. **Verification results** per area: claims checked, mismatches found (from Layer 2 pass)
10. **Probe results**: probes executed this run (pass/fail per probe), new probes generated from failures/low scores/worst_moment. See [probes.md](./references/probes.md) for generation triggers and lifecycle.

### Report Output — Dispatch Format

The report is a dispatch, not a broadcast. It tells you what to do next, in priority order. Sections with no items are omitted.

```
SESSION SUMMARY: <scenario>  [<date> · <mode>]
UX 3.0 | Quality 4.5 (CLI) | 5 areas | 2 need action

NEEDS ACTION (2)                    ← open items requiring follow-up
  ⚠ P1  y2k accessories degrading Q3→Q2 → investigate CLI (Explore Next Run)
  ⚠ P2  Proven area agent/filter-via-chat probe failing → regression

FILED THIS SESSION (1)              ← closed loop, confirmation only
  ✓ Bug #21: shipping-form validation accepts invalid zip codes

IMPROVED (1)
  cart-validation  3→4  Cart updates instantly on quantity change

STABLE (3)
  browse/product-grid, browse/filters, compare/add-view

EXPLORE NEXT RUN
  P1  shipping-form     Browser  Validation broken — edge cases
  P1  agent/search-query CLI     y2k degrading — aesthetic+category
  P2  checkout/promo     Both    Adjacent to cart, untested

SIGNALS
  + CLI speed 15.8s avg (was 20.4s, -23%)
  ~ 10 disconnects (was 6) — Chrome extension fragile
  ~ 2 UX opportunities logged (UX001–UX002)

Demo: PARTIAL (P1 bug #21 open; promo-code untested)
```

**Section rules:**
- **Header:** `UX X.X | Quality X.X (CLI) | N areas | M need action` — 2-second scan
- **NEEDS ACTION:** `⚠` prefix. Only open items: degrading areas, failing probes on **Proven** areas (unexpected regression), verification mismatches on Proven. Probe failures on Uncharted/Known-bug stay in DETAILS (expected)
- **FILED THIS SESSION:** `✓` prefix. Bugs/issues filed. Omit if nothing filed
- **IMPROVED:** `<area> <old>→<new> <reason>`
- **STABLE:** Single comma-separated line
- **EXPLORE NEXT RUN:** `<priority> <area> <mode> <why>` — must appear in printed report
- **SIGNALS:** `+` positive, `-` negative, `~` neutral. Disconnects always here with delta. Omit if 0. Use `-` if increased 50%+
- **Demo:** YES / PARTIAL (reason) / NO (reason). P1 NEEDS ACTION forces at most PARTIAL
- **DETAILS:** Prints only when actionable (new probes, verification failures, new UX opps). Omit if all empty. Contains: Probe Results, Verification Failures, UX Opportunities tables. Code Changes section when git targeting active

### Auto-Commit

After displaying the report, **automatically proceed to Commit Mode** (below) — update the test file, append to history, and file issues. The user reviews results inline as part of the same session.

**Opt-out:** If invoked with `--no-commit` or if the run was partial (interrupted before all areas scored), skip commit and display the report only. The user can run `/user-test-commit` later to commit from `.user-test-last-run.json`.

**Partial run safety:** If the run is interrupted before scoring completes, do NOT produce committable output. Partial runs must not corrupt maturity state.

### Run Results Persistence

After Phase 4 completes (all areas scored), write `tests/user-flows/.user-test-last-run.json`:

```json
{
  "run_timestamp": "2026-02-28T14:30:00Z",
  "completed": true,
  "scenario_slug": "checkout",
  "git_sha": "abc1234",
  "areas": [
    {
      "slug": "cart-validation",
      "ux_score": 4,
      "quality_score": null,
      "time_seconds": 12,
      "skip_reason": null,
      "assessment": "Ready for promotion",
      "issues": []
    }
  ],
  "qualitative": {
    "best_moment": { "area": "cart-validation", "text": "Cart updates instantly on quantity change" },
    "worst_moment": { "area": "shipping-form", "text": "Shipping form accepts invalid zip codes" },
    "demo_readiness": "partial",
    "verdict": "Checkout works but shipping validation broken",
    "context": "shipping zip validation bypassed"
  },
  "explore_next_run": [
    { "priority": "P1", "area": "shipping-form", "mode": "Browser", "why": "Validation broken" }
  ],
  "ux_opportunities": [
    { "id": "UX001", "area": "shipping-form", "priority": "P1", "suggestion": "Should show inline validation before submit" }
  ],
  "good_patterns": [
    { "area": "cart-validation", "pattern": "Cart updates instantly on quantity change" }
  ],
  "verification_results": [
    { "area": "agent/filter-via-chat", "claims_checked": 8, "mismatches": [
      { "claim": "Condition: Like New", "actual": "Good", "element": "result-3 badge" }
    ]}
  ],
  "probes_run": [
    { "area": "agent/filter-via-chat", "query": "show me NWT only", "verify": "all badges say NWT", "status": "failing", "result_detail": "3 non-NWT results" }
  ],
  "probes_generated": [
    { "area": "agent/filter-via-chat", "query": "show me good condition only", "verify": "no NWT/like-new badges visible", "priority": "P1", "generated_from": "run-2 condition mismatch" }
  ],
  "novelty_log": [],
  "stable_queries_rotated": []
}
```

- File is overwritten on each run (only last run is committable)
- `completed: false` if the run was interrupted — commit mode will reject it
- If Phase 4 is interrupted before writing this file, no committable output exists

## Commit Mode

Runs automatically after Phase 4 completes a full run. Can also be invoked standalone via `/user-test-commit` (e.g., after a `--no-commit` run or to retry a failed commit).

### Load Run Results

**When invoked automatically:** Use the run results already in context from Phase 4.

**When invoked standalone via `/user-test-commit`:** Read `tests/user-flows/.user-test-last-run.json`. This is the single source of truth — commit mode never falls back to context window.

- **Missing file:** Abort with "No run results found. Run `/user-test` first."
- **Incomplete run:** If `completed: false`, abort with "Last run was incomplete. Run `/user-test` again for committable results."
- **Stale (>7 days):** Abort with "Run results too old — re-run `/user-test` first."
- **Stale (>24 hours):** Warn "Run results are from <timestamp>. Commit anyway? (y/n)."

### Maturity Updates

Apply maturity transitions using agent judgment and the scoring rubric:

- **Promote to Proven:** After 2+ consecutive passes where UX >= area's `pass_threshold` (default 4) and Quality >= `quality_threshold` for scored_output areas (default 3), with no functional issues. A cosmetic issue in a Proven area does not warrant demotion.
- **Demote to Uncharted:** On functional regressions or new features that change behavior. Minor CSS issues do not trigger demotion.
- **Mark Known-bug:** When a functional issue is found and an issue is filed. Record in bug registry — see [bugs-registry.md](./references/bugs-registry.md). Skip this area in future runs until the fix is deployed.
- **Persistent ≤3 escalation:** If an area scores ≤ 3 for 3+ consecutive runs AND the same issue is noted each time, offer: "<area> has scored ≤3 for N runs with the same issue — file as Known-bug?" This is a manual escalation, not automatic.

**Partial run safety:** If a run is interrupted before scoring completes, no maturity updates are produced.

### File Updates

1. **Update test file maturity map and area details:**
   - Write to `.tmp` file first, then rename (atomic write)
   - Upgrade to v6: bump `schema_version: 6` on first commit regardless of query/probe usage. Add missing columns and sections per [test-file-template.md](./references/test-file-template.md)
   - Update area statuses, scores, timing, quality scores, and consecutive pass counts
   - Update `## Area Trends` section from `score-history.json` data
   - Update `## UX Opportunities Log`: add new entries with sequential IDs (UX001...), update existing entries (mark `implemented` if improvement detected), age out entries per lifecycle rules
   - Update `## Good Patterns`: confirm existing patterns (update `Last Confirmed`), add new patterns, remove patterns unconfirmed for 5+ runs
2. **Update `tests/user-flows/score-history.json`:**
   - Append current run's per-area scores (UX, quality, time)
   - Compute trend per area from last 3 entries
   - Cap at 10 entries per area (drop oldest)
   - Create file if it doesn't exist
3. **Update `tests/user-flows/bugs.md`:**
   - File new bugs with sequential IDs for areas with UX <= 2 or Quality <= 1
   - Mark bugs as `fixed` when Known-bug area passes fix_check (score >= `pass_threshold`) AND GitHub issue is closed
   - Mark bugs as `regressed` when previously-fixed area fails again
   - Create file if it doesn't exist — see [bugs-registry.md](./references/bugs-registry.md)
4. **Update probe statuses** in each area's `**Probes:**` table: mark passing/failing/flaky based on this run's results. Rotate out passing probes older than 10 runs. If a probe has failed 3+ consecutive runs, auto-escalate to bugs.md (see [probes.md](./references/probes.md) Escalation). If a probe has passed 2+ consecutive runs, offer CLI graduation (same path as bug graduation — see [probes.md](./references/probes.md)).
5. **Offer graduation** for newly-fixed bugs — see [graduation.md](./references/graduation.md)
6. **Append to `tests/user-flows/test-history.md`:**
   - Add row with: date, areas tested, quality avg, delta, pass rate, best area, worst area, demo ready, context, key finding
   - **Delta computation:** Compare quality avg against the most recent *completed* previous run. First run: `—`. Previous run was partial: skip to last complete run. Different area sets: compute over overlapping areas only; no overlap → `—`. Always display how many areas overlap vs. excluded (e.g., "over 5 overlapping areas, 2 new excluded") so the denominator change is visible.
   - **Delta warning:** Flag any delta worse than -0.5 in the commit output
   - **Context field:** Brief phrase explaining *why* the verdict is what it is (e.g., "search results loading 28s"). Persists alongside verdict for future reference.
   - **Pattern surfacing** (after 10+ runs): positive patterns need 7+ of last 10 runs as best area; negative patterns need 5+ of last 10 runs as worst area
   - Rotation: keep last 50 entries, remove oldest when exceeding
7. **File GitHub issues:**
   - Each issue gets a label `user-test:<area-slug>` (e.g., `user-test:checkout/cart-count`)
   - **Duplicate detection:** `gh issue list --label "user-test:<area-slug>" --state open`
     - If match found: skip filing, note "duplicate of #N"
     - If no match: fall back to semantic title search as secondary check
   - Sanitize issue body content before `gh issue create`
   - Skip gracefully if `gh` is not authenticated
   - Never persist credentials (passwords, tokens, session IDs) in issue bodies or test files
8. **Query compounding:** Sharpen failed queries into probes, expand from discoveries, mark stable queries. See [queries-and-multiturn.md](./references/queries-and-multiturn.md) for steps 8-10 details, query-to-probe conversion rules, and stable query regression tiers.

## Iterate Mode

See [iterate-mode.md](./references/iterate-mode.md) for full details.

N capped at 10 (default), N=0 is error, N=1 is valid.
Reset between runs = full page reload to app entry URL.
Partial run handling: if disconnect mid-iterate, write results for completed
runs and report "Completed M of N runs."
Output: per-run scores table + aggregate consistency metrics + maturity transitions.
After final run, auto-commit (same as normal `/user-test`). Pass `--no-commit` to skip.

## Test File Template

See [test-file-template.md](./references/test-file-template.md) for the template used when creating new test files, including area granularity guidelines and worked examples.

## Bug Registry

See [bugs-registry.md](./references/bugs-registry.md) for bug lifecycle (open/fixed/regressed), multi-area handling, and commit mode update rules.

## Discovery-to-Regression Graduation

See [graduation.md](./references/graduation.md) for the compounding loop: browser discoveries becoming CLI regression checks.

## Verification Patterns

See [verification-patterns.md](./references/verification-patterns.md) for standard verification checks by area type, tolerance rules, scoring impact, and maturity interaction.

## Adversarial Probes

See [probes.md](./references/probes.md) for probe execution, generation, lifecycle (untested/passing/failing/flaky/graduated), dedup, cap/rotation, escalation, graduation, and multi-run orchestration.

## Queries and Multi-turn

See [queries-and-multiturn.md](./references/queries-and-multiturn.md) for per-area execution checklist, scoring boundaries, multi-turn scoring, query compounding in commit mode, and Proven area query budget.

## Browser Input Patterns

See [browser-input-patterns.md](./references/browser-input-patterns.md) for React-safe input patterns, DOM check batching, file upload limitations, and modal dialog handling.
