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

## Interaction Method

If `AskUserQuestion` is available, use it for all prompts. Otherwise, present
each question as a numbered list and wait for a reply. For multiSelect, accept
comma-separated numbers (e.g. `1, 3`). Never skip or auto-configure.

**Protected artifacts:** `tests/user-flows/` files are pipeline output. Review
agents and cleanup tools must never flag them for deletion or gitignore.

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
     - Validate `schema_version` is present (1–10 accepted) <!-- bump range when schema changes -->
     - **v1/v2 migration:** If `schema_version: 1`, fill missing columns (`Last Quality`, `Last Time`, `Delta`, `Context`) with `—`. If `schema_version: 2`, also fill missing sections (Area Trends, UX Opportunities, Good Patterns) and Run History columns (Best Area, Worst Area). Do NOT rewrite on read.
     - **v3/v4 migration:** If `schema_version: 3`, treat missing `verify:` blocks and `Probes:` tables as absent. If `schema_version: 4`, also treat missing `**Queries:**` and `**Multi-turn:**` tables as absent. Do NOT rewrite on read.
     - **v5 migration:** If `schema_version: 5`, treat Probes without `Confidence` column as `confidence: high` (existing probes were generated from observed failures). Treat Probes without `Priority` column as inferred from `Generated From` (verification failure → P1, score-based → P2). Treat Queries without `Status` column as active. Treat missing `seams_read` as `false`. Do NOT rewrite the file on read.
     - **v6 migration:** If `schema_version: 6`, treat missing `## Cross-Area Probes` section as empty table. Treat missing `mcp_restart_threshold` as 15. Treat probes without `related_bug` as unlinked. Do NOT rewrite on read.
     - **v7 migration:** If `schema_version: 7`, treat missing `weakness_class` as absent. Treat missing `novelty_fingerprints` as empty. Treat missing `adversarial_browser` as false. In JSON: treat missing `tactical_note` as null, `confirmed_selectors` as `{}`. Do NOT rewrite on read.
     - **v8 migration:** If `schema_version: 8`, treat missing `## Journeys` section as empty (no journeys defined). Do NOT rewrite on read.
     - **v9 migration:** If `schema_version: 9`, treat missing `execution_index` on `probes_run` entries as absent. Treat missing `broad_exploration_start_index` on areas as absent. Eval skips Eval 1 (probe execution order) for runs without ordering data. Do NOT rewrite on read.
     - **Forward compatibility:** Ignore unknown frontmatter fields. Preserve unknown table columns on write.
     - **Missing `cli_test_command` (any version):** Treat as `cli_test_command: ""`. CLI discovery (step 3) will populate it. Do NOT rewrite the file on read.
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
   - Check that `.user-test-last-run.json` and `.user-test-last-report.md` are in the project's `.gitignore`
   - If missing, append them (these files are ephemeral run state, not source)
   - Note: `score-history.json`, `bugs.md`, `skill-evals.json`, and `skill-mutations.md` are NOT gitignored — they are persistent project data
5. **Handle corruption:**
   - If required sections are missing or `schema_version` is absent, offer to regenerate from template
6. **Capture git state:** Run `git rev-parse HEAD` and `git rev-parse origin/main 2>/dev/null`. Run `git diff --name-only origin/main..HEAD` — if this returns ANY files, those are code-affected areas requiring full exploration (even on a feature branch where main is "behind" HEAD). See [run-targeting.md](./references/run-targeting.md) for full rules.

## Phase 2: Setup

0. **Check claude-in-chrome MCP:** Call any `mcp__claude-in-chrome__*` tool. If NOT available: check if `cli_test_command` covers all `scored_output` areas. If yes, offer "All areas have CLI coverage — run CLI-only? (y/n)" and proceed without browser. If CLI doesn't cover all areas: display "claude-in-chrome not connected. Run `/chrome` or restart with `claude --chrome`" and abort.
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
1. Phase 0 runs `gh auth status` only (Chrome MCP deferred). Skip Phase 2 browser setup unless browser areas exist.
2. Run each `scored_output` area's Queries through `cli_test_command`. Run `cli_queries` via Bash. Score 1-5 using output quality rubric (semantic evaluation). See CLI Area Queries in [queries-and-multiturn.md](./references/queries-and-multiturn.md).
3. **Browser area overlap:** If a `prechecks`-tagged CLI query scores ≤ 2, skip the tagged browser area. No `prechecks` tag = standalone.
4. Credentials: shell environment only. No credentials in the test file.
5. **Adversarial flag check:** If any CLI query for an area scores exactly 3, set `adversarial_browser: true`. See [queries-and-multiturn.md](./references/queries-and-multiturn.md) CLI Adversarial Mode for trigger conditions and secondary check.

**CLI + browser coexistence:** When both exist, run CLI first. CLI failures only skip browser areas explicitly tagged via `prechecks`.

## Phase 3: Execute

Test areas based on maturity status. The agent exercises judgment on area selection — these are guidelines, not rigid rules. Record a `skip_reason` for each area not fully tested (see [test-file-template.md](./references/test-file-template.md) for enum values).

**Run focus vs. area budget:** A run focus (e.g., "consumer stress test", "search bar exploration") controls WHAT you test within each area — which queries, which edge cases, which user personas. It does NOT override maturity-based time allocation (see override priority table in [run-targeting.md](./references/run-targeting.md)). Proven areas at score 5 get max 3 MCP calls regardless of run focus. The focus shapes the 3 calls (test the search bar instead of basic navigation), not the count.

### Per-Area Checklist (run in order for every area)

0. **CLI precheck gate** — if `prechecks` CLI query scored ≤ 2, skip. No prechecks tag = proceed. No CLI = proceed.
0b. **Adversarial mode** — if `adversarial_browser: true` (from Phase 2.5): skip happy path, front-load competing-constraint queries, generate pre-emptive P1 probe, increase novelty budget. SKIP areas promoted to PROBES-ONLY. See [queries-and-multiturn.md](./references/queries-and-multiturn.md) CLI Adversarial Mode.
1. **Run probes** — failing/untested first. See [probes.md](./references/probes.md).
2. **Execute Queries and Multi-turn** — if defined. See [queries-and-multiturn.md](./references/queries-and-multiturn.md).
3. **Novelty budget — MANDATORY.** Before generating novel interactions, check `novelty_fingerprints` from `.user-test-last-run.json` — skip interactions matching existing fingerprints. At least 1 novel interaction per `scored_output` area must generate a probe. Iterate mode ignores fingerprints. See [queries-and-multiturn.md](./references/queries-and-multiturn.md) for fingerprint matching, MCP budget, and mandatory probe rule.
4. **Verification pass** — per area type. See [verification-patterns.md](./references/verification-patterns.md).
5. **Score** — UX (1-5) + Quality if `scored_output: true`.
6. **Time** — wall-clock seconds, first to last MCP call. Async waits count. Disconnect = `—`.
7. **Notes** — what surprised you? Feeds Explore Next Run + new Queries in commit.

Probes, verification, and UX scores are three separate signals — none subsumes the others.

### Execution Index Tracking

Maintain a monotonically increasing `execution_index` counter (starting at 0) across the entire run. Increment for each probe execution and each broad exploration action. Record `execution_index` on every `probes_run` entry. When transitioning from probe execution to broad exploration for an area, record `broad_exploration_start_index` on that area. This enables `/user-test-eval` to verify probe-before-exploration ordering from artifacts alone. See [last-run-schema.md](./references/last-run-schema.md) for field definitions.

### Probe Execution (Before Broad Exploration)

Read probes from area `**Probes:**` tables. Execute `untested` and `failing` probes before broad exploration — these are the highest-signal checks. For Proven areas, failing/untested probes always run regardless of MCP budget; the 3-call cap only constrains passing-probe spot-checks. Record each probe result with its `execution_index`. See [probes.md](./references/probes.md) for execution flow, lifecycle, and dedup rules.

### Cross-Area Probes (Before Per-Area Testing)

Execute cross-area probes before per-area testing — they test state carry-over between areas and inform per-area score interpretation. Results do NOT affect per-area scores. See [probes.md](./references/probes.md).

### Journey Execution (After Cross-Area Probes)

Execute journeys after cross-area probes, before per-area testing. Journeys test accumulated state across 3+ areas without resets, with checkpoints at each step. Results do NOT affect per-area scores. See [journeys.md](./references/journeys.md).

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

See [connection-resilience.md](./references/connection-resilience.md) for reactive recovery, proactive restart at configurable MCP call threshold, and disconnect tracking rules.

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
   - **Cross-area weakness synthesis:** After per-area items, read `weakness_class` fields from the test file (as present at run start — ignore any written by this run's commit). If a class appears in 2+ areas, generate up to 2 `[cross-area]` P1 entries with adversarial instructions. See [probes.md](./references/probes.md) Cross-Area Weakness Synthesis.
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
- **JOURNEYS:** After cross-area probes, before NEEDS ACTION. Failing/flaky journeys show checkpoint detail. Passing show summary. See [journeys.md](./references/journeys.md).
- **NEEDS ACTION:** `⚠` prefix. Only open items: degrading areas, failing probes on **Proven** areas (unexpected regression), verification mismatches on Proven. Probe failures on Uncharted/Known-bug stay in DETAILS (expected)
- **FILED THIS SESSION:** `✓` prefix. Bugs/issues filed. Omit if nothing filed
- **IMPROVED:** `<area> <old>→<new> <reason>`
- **STABLE:** Single comma-separated line
- **EXPLORE NEXT RUN:** `<priority> <area> <mode> <why>` — must appear in printed report
- **SIGNALS:** `+` positive, `-` negative, `~` neutral. Disconnects always here with delta. Omit if 0. Use `-` if increased 50%+
- **Demo:** YES / PARTIAL (reason) / NO (reason). P1 NEEDS ACTION forces at most PARTIAL
- **DETAILS:** Prints only when actionable (new probes, verification failures, new UX opps). Omit if all empty. Contains: Probe Results, Verification Failures, UX Opportunities tables. Code Changes section when git targeting active

### Share Report (Optional)

After displaying the report, offer: "Share report to Proof for team review? (y/n)".
If yes, POST the SESSION SUMMARY markdown to `https://www.proofeditor.ai/share/markdown`
with `{"title": "<scenario> — <date>", "markdown": "<report>"}` and display the
returned URL. Skip silently on curl failure — Proof sharing is best-effort.

### Persist Report

After displaying the report (and optional Proof sharing), write the rendered report text to `tests/user-flows/.user-test-last-report.md`. This file is the eval artifact — `/user-test-eval` reads it to grade presentation-layer behavior. Overwritten each run, gitignored.

### Auto-Commit

After persisting the report, **automatically proceed to Commit Mode** (below) — update the test file, append to history, and file issues. The user reviews results inline as part of the same session.

**Opt-out:** If invoked with `--no-commit` or if the run was partial (interrupted before all areas scored), skip commit and display the report only. The user can run `/user-test-commit` later to commit from `.user-test-last-run.json`.

**Partial run safety:** If the run is interrupted before scoring completes, do NOT produce committable output. Partial runs must not corrupt maturity state.

### Run Results Persistence

After Phase 4 completes (all areas scored), write `tests/user-flows/.user-test-last-run.json`. See [last-run-schema.md](./references/last-run-schema.md) for full schema (v10), per-area fields, journey fields, execution index fields, and behavioral notes. File is overwritten each run except `novelty_fingerprints` which accumulates across runs (read-merge-write).

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
   - Upgrade to v10: bump `schema_version: 10` on first commit regardless of query/probe usage. Add missing columns and sections per [test-file-template.md](./references/test-file-template.md)
   - Update area statuses, scores, timing, quality scores, and consecutive pass counts
   - Update `## Area Trends` section from `score-history.json` data
   - Update `## UX Opportunities Log`: add new entries with sequential IDs (UX001...), update existing entries (mark `implemented` if improvement detected), age out entries per lifecycle rules
   - Update `## Good Patterns`: confirm existing patterns (update `Last Confirmed`), add new patterns, remove patterns unconfirmed for 5+ runs
   - **Tactical notes:** Append `[Run N] <finding>` to area's Notes column when there's a genuine tactical insight (selector pattern, timing pattern, interaction sequence). Cap 3 entries per area; drop oldest. See [queries-and-multiturn.md](./references/queries-and-multiturn.md) Tactical Notes.
   - **Verified selectors:** When Phase 3 confirmed DOM selectors via successful `javascript_tool` batch call, append them to the area's `**verify:**` block with `_Selectors confirmed run N._`. Append-only — never replace user-authored content. See [verification-patterns.md](./references/verification-patterns.md) Selector Discovery and Writeback.
   - **Weakness class:** When 2+ probes in an area share a failure pattern, write `**weakness_class:** <class>` below `pass_threshold`. Remove after 3 consecutive pass runs. One class per area — dominant by probe count. See [probes.md](./references/probes.md) Weakness Classification.
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
4. **Update probe statuses** in each area's `**Probes:**` table and the `## Cross-Area Probes` table: mark passing/failing/flaky based on this run's results. Rotate out passing probes older than 10 runs. If a probe has failed 3+ consecutive runs, auto-escalate to bugs.md (see [probes.md](./references/probes.md) Escalation). If a probe has passed 2+ consecutive runs, offer CLI graduation (same path as bug graduation — see [probes.md](./references/probes.md)).
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
8. **Query compounding:** Sharpen failed queries into probes, expand from discoveries, mark stable queries. See [queries-and-multiturn.md](./references/queries-and-multiturn.md) for steps 8-12 details, query-to-probe conversion rules, and stable query regression tiers.
8b. **Novelty fingerprints:** Merge this run's new fingerprints with existing ones from `.user-test-last-run.json`. Apply 20-per-area cap (drop oldest). Write merged set. See [queries-and-multiturn.md](./references/queries-and-multiturn.md) Novelty Fingerprint Persistence.
8c. **Journey updates:** Update journey Status, Last Run, Run History. Auto-escalate, mark stable, detect definition changes. Journey results do NOT affect per-area maturity. See [journeys.md](./references/journeys.md) Commit Mode.

### Auto-Eval

After all commit steps complete, automatically invoke `/user-test-eval` to grade this session's output. The eval reads from file artifacts (`.user-test-last-run.json` and `.user-test-last-report.md`) — it does not use conversation context from this session.

**Skip conditions:** `--no-eval` flag, or if commit was partial/aborted.
**Error handling:** If eval fails, the commit is already complete and preserved. Display "Eval failed: <reason>. Run `/user-test-eval` manually to retry."
**Iterate mode:** Eval runs once after the final commit, not per-iteration. Grades the aggregate report. Eval 1 checks probe execution order for the first run only.
**Standalone `/user-test-commit`:** Also triggers auto-eval after commit completes (same artifacts, same trigger).

## Iterate Mode

See [iterate-mode.md](./references/iterate-mode.md) for full details.

N capped at 10 (default), N=0 is error, N=1 is valid.
Reset between runs = full page reload to app entry URL.
Partial run handling: if disconnect mid-iterate, write results for completed
runs and report "Completed M of N runs."
Output: per-run scores table + aggregate consistency metrics + maturity transitions.
After final run, auto-commit (same as normal `/user-test`). Pass `--no-commit` to skip.

## Reference Files

- [test-file-template.md](./references/test-file-template.md) — template, schema migration, area granularity, worked examples
- [last-run-schema.md](./references/last-run-schema.md) — `.user-test-last-run.json` schema, per-area fields, behavioral notes
- [journeys.md](./references/journeys.md) — multi-area journey testing: lifecycle, budget, execution, checkpoint types, generation, feature interactions
- [probes.md](./references/probes.md) — probe execution, lifecycle, dedup, escalation, graduation, multi-run orchestration, weakness classification
- [queries-and-multiturn.md](./references/queries-and-multiturn.md) — execution checklist, scoring, query compounding, novelty budget, fingerprints, CLI adversarial mode
- [verification-patterns.md](./references/verification-patterns.md) — structural checks, tolerance rules, scoring impact
- [run-targeting.md](./references/run-targeting.md) — area selection, git-aware targeting, progressive narrowing
- [bugs-registry.md](./references/bugs-registry.md) — bug lifecycle, commit mode update rules
- [graduation.md](./references/graduation.md) — browser discoveries → CLI regression checks
- [browser-input-patterns.md](./references/browser-input-patterns.md) / [connection-resilience.md](./references/connection-resilience.md) — browser patterns, connection resilience
- [iterate-mode.md](./references/iterate-mode.md) / [orientation.md](./references/orientation.md) — multi-run orchestration, first-run code reading
