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

1. **Check claude-in-chrome MCP availability:**
   - Call any `mcp__claude-in-chrome__*` tool (e.g., `mcp__claude-in-chrome__read_page`)
   - If NOT available: display "claude-in-chrome not connected. Run `/chrome` or restart with `claude --chrome`" and abort
2. **Detect WSL:**
   - Run `uname -r 2>/dev/null | grep -qi microsoft` via Bash
   - If WSL detected: display "Chrome integration is not supported in WSL. Run Claude Code directly on Windows." and abort
3. **Check gh CLI:**
   - Run `gh auth status` via Bash
   - If not authenticated: note "gh not authenticated — issue creation will be skipped in commit mode"
4. **Validate app URL:**
   - If a test file is provided and contains `app_url`, verify the URL is reachable
   - Site permission errors and named pipe conflicts are handled reactively during execution (not preflight-checkable)

## Phase 1: Load Context

**Input:** `$ARGUMENTS` — either a path to an existing test file or a description of what to test.

1. **Resolve test file:**
   - If argument is a file path (contains `/` or ends in `.md`):
     - Validate path resolves within `tests/user-flows/` (prevent directory traversal)
     - Read and parse the test file
     - Validate `schema_version` is present (1, 2, or 3 accepted)
     - **v1 migration:** If `schema_version: 1`, fill missing columns with defaults in memory (`Last Quality` → `—`, `Last Time` → `—`, `Delta` → `—`, `Context` → empty). Do NOT rewrite the file — upgrades happen only during commit.
     - **v2 migration:** If `schema_version: 2`, fill missing sections (Area Trends, UX Opportunities Log, Good Patterns) with empty tables. Fill missing Run History columns (Best Area, Worst Area) with `—`. Do NOT rewrite the file on read.
     - **Forward compatibility:** Ignore unknown frontmatter fields. Preserve unknown table columns on write.
     - Extract maturity map, run history, and explore-next-run items
   - If argument is a description string:
     - Generate a slug from the description
     - Check if `tests/user-flows/<slug>.md` already exists
     - If not, create from template — see [test-file-template.md](./references/test-file-template.md)
     - Decompose the description into areas (1-3 interactions each)
   - If no argument:
     - Scan `tests/user-flows/` for existing test files
     - Present list and ask which to run, or prompt for a new description
2. **Ensure `.gitignore` coverage:**
   - Check that `.user-test-last-run.json` is in the project's `.gitignore`
   - If missing, append it (this file is ephemeral run state, not source)
   - Note: `score-history.json` and `bugs.md` are NOT gitignored — they are persistent project data
3. **Handle corruption:**
   - If required sections are missing or `schema_version` is absent, offer to regenerate from template

## Phase 2: Setup

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
1. Skip Phase 0 MCP preflight (CLI doesn't need Chrome). Run `gh auth status` check only.
2. Skip Phase 2 browser setup entirely (unless browser areas also exist).
3. For each query in `cli_queries`: run the command via Bash (substituting `{query}`), capture stdout.
4. Score output quality 1-5 using the **output quality rubric** (see Scoring section). The agent evaluates whether CLI output satisfies the `expected` description **semantically** — not exact string matching. The `expected` field describes what a correct response looks like.
5. CLI results feed into the same maturity map and scoring pipeline.
6. **Browser area overlap:** If a CLI query has a `prechecks: "area-slug"` tag and scores <= 2, skip the tagged browser area with "CLI pre-check failed — skipping browser test." No `prechecks` tag = standalone CLI query, no browser areas skipped.
7. Credentials: the command inherits the shell environment. No credentials stored in the test file.

**CLI + browser coexistence:** When both exist, run CLI first. CLI failures only skip browser areas explicitly tagged via `prechecks`.

## Phase 3: Execute

Test areas based on maturity status. The agent exercises judgment on area selection — these are guidelines, not rigid rules. Record a `skip_reason` for each area not fully tested (see [test-file-template.md](./references/test-file-template.md) for enum values).

### Timing

Record wall-clock time per area: note the timestamp before the first MCP call and after the last. Record in seconds. Timing includes async waits — slow is slow, regardless of cause. If a disconnect interrupts an area mid-test, record time as `—` (incomplete) and exclude from averages.

### Area Selection Priority

1. **Pick highest-priority Explore Next Run items first** (P1 > P2 > P3), not FIFO
2. **Uncharted areas:** Full investigation with batched `javascript_tool` calls. See [browser-input-patterns.md](./references/browser-input-patterns.md) for input patterns and batching tips.
3. **Proven areas:** Quick spot-check only (max 3 MCP calls per area). Verify the happy path still works.
4. **Known-bug areas:** Check if the linked issue is resolved before skipping:
   - If `gh` not authenticated: skip as normal
   - Run `gh issue view <issue-number> --json state -q '.state'`
   - If `closed`: flip area to Uncharted, run the `fix_check` as the first test
   - If `open`: skip as normal, note in output
   - If fix check fails (score <= 2): file new issue with "Regression of #N" referencing the original closed issue
5. **If all areas are Proven:** Spot-check all, then suggest new scenarios in "Explore Next Run"

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

### Report Output

Display a run summary:

```
## Run Summary: <scenario-name>

| Area | Status | Score | Time | Assessment |
|------|--------|-------|------|------------|
| cart-validation | Uncharted | 4 | 8s | Ready for promotion |
| shipping-form | Uncharted | 2 | 15s | Issue found: validation broken |

Quality Avg: 3.0 | Pass Rate: 2/2 | Disconnects: 0

Qualitative:
- Best moment: Cart updates instantly on quantity change
- Worst moment: Shipping form accepts invalid zip codes
- Demo ready: partial
- One-line verdict: Checkout works but shipping validation broken

Explore Next Run:
| Priority | Area | Why |
|----------|------|-----|
| P1 | shipping-form | Validation broken — push harder on edge cases |
| P2 | checkout/promo-code | Adjacent to cart, untested |

UX Opportunities:
| Priority | Area | Suggestion |
|----------|------|-----------|
| P1 | shipping-form | Should show inline validation before submit |
| P2 | cart-validation | Quantity stepper would be smoother than text input |

Good Patterns:
| Area | Pattern |
|------|---------|
| cart-validation | Cart updates instantly on quantity change |

Issues to file:
- shipping-form: Form validation accepts invalid zip codes
```

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
    { "priority": "P1", "area": "shipping-form", "why": "Validation broken" }
  ],
  "ux_opportunities": [
    { "id": "UX001", "area": "shipping-form", "priority": "P1", "suggestion": "Should show inline validation before submit" }
  ],
  "good_patterns": [
    { "area": "cart-validation", "pattern": "Cart updates instantly on quantity change" }
  ]
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

**Partial run safety:** If a run is interrupted before scoring completes, no maturity updates are produced.

### File Updates

1. **Update test file maturity map and area details:**
   - Write to `.tmp` file first, then rename (atomic write)
   - If file is `schema_version: 1` or `2`, upgrade to v3: add missing columns and sections per [test-file-template.md](./references/test-file-template.md)
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
4. **Offer graduation** for newly-fixed bugs — see [graduation.md](./references/graduation.md)
5. **Append to `tests/user-flows/test-history.md`:**
   - Add row with: date, areas tested, quality avg, delta, pass rate, best area, worst area, demo ready, context, key finding
   - **Delta computation:** Compare quality avg against the most recent *completed* previous run. First run: `—`. Previous run was partial: skip to last complete run. Different area sets: compute over overlapping areas only; no overlap → `—`.
   - **Delta warning:** Flag any delta worse than -0.5 in the commit output
   - **Context field:** Brief phrase explaining *why* the verdict is what it is (e.g., "search results loading 28s"). Persists alongside verdict for future reference.
   - **Pattern surfacing** (after 10+ runs): positive patterns need 7+ of last 10 runs as best area; negative patterns need 5+ of last 10 runs as worst area
   - Rotation: keep last 50 entries, remove oldest when exceeding
6. **File GitHub issues:**
   - Each issue gets a label `user-test:<area-slug>` (e.g., `user-test:checkout/cart-count`)
   - **Duplicate detection:** `gh issue list --label "user-test:<area-slug>" --state open`
     - If match found: skip filing, note "duplicate of #N"
     - If no match: fall back to semantic title search as secondary check
   - Sanitize issue body content before `gh issue create`
   - Skip gracefully if `gh` is not authenticated
   - Never persist credentials (passwords, tokens, session IDs) in issue bodies or test files

## Iterate Mode

See [iterate-mode.md](./references/iterate-mode.md) for full details.

N capped at 10 (default), N=0 is error, N=1 is valid.
Reset between runs = full page reload to app entry URL.
Partial run handling: if disconnect mid-iterate, write results for completed
runs and report "Completed M of N runs."
Output: per-run scores table + aggregate consistency metrics + maturity transitions.
Results are not committed automatically — use `/user-test-commit` to apply.

## Test File Template

See [test-file-template.md](./references/test-file-template.md) for the template used when creating new test files, including area granularity guidelines and worked examples.

## Bug Registry

See [bugs-registry.md](./references/bugs-registry.md) for bug lifecycle (open/fixed/regressed), multi-area handling, and commit mode update rules.

## Discovery-to-Regression Graduation

See [graduation.md](./references/graduation.md) for the compounding loop: browser discoveries becoming CLI regression checks.

## Browser Input Patterns

See [browser-input-patterns.md](./references/browser-input-patterns.md) for React-safe input patterns, DOM check batching, file upload limitations, and modal dialog handling.
