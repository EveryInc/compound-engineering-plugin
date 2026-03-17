---
name: user-test-eval
description: Grade user-test skill output against binary evals and propose mutations. Use after a user-test run completes to check probe ordering, regression surfacing, and P1 presentation.
---

# User Test Eval

Grade the user-test skill's output against 3 binary evals. Read from file
artifacts only. Propose targeted mutations when evals fail.

**Artifact-only grading rule:** Grade from file artifacts only. Do not reference
test execution context, Phase 3 observations, or any other conversation content.
The eval's integrity depends on grading what the user sees (the report file),
not what the agent knows.

## Phase 1: Load Artifacts

1. **Locate test directory:** Find `tests/user-flows/` in the project.
2. **Read `.user-test-last-run.json`:**
   - Missing: abort with "No run results found. Run `/user-test` first."
   - `completed: false`: abort with "Last run was incomplete. Run `/user-test` again."
3. **Read `.user-test-last-report.md`:**
   - Missing: abort with "No report artifact found. The skill version may predate report persistence — run `/user-test` again with the latest skill."
4. **Staleness check:** If `run_timestamp` > 24 hours old, warn "Run results are from <timestamp>. Evaluate anyway? (y/n)".
5. **Already-evaluated check:** Read `skill-evals.json` if it exists. If the last entry's `run_timestamp` matches the artifact's `run_timestamp`, warn "This run was already evaluated. Run again? (y/n)".
6. **Read the test file** (`tests/user-flows/<scenario_slug>.md`) to get area maturity statuses and `pass_threshold` values. Default `pass_threshold` is 4 if not specified.

## Phase 2: Run Evals

Run all 3 evals in order. Record pass/fail + detail for each.

### Eval 1: Probe Execution Order (protocol layer)

**Question:** Did all failing/untested probes execute before broad exploration in every area?

**Method:**
1. For each area in `areas` array, read `broad_exploration_start_index`
2. Collect all `probes_run` entries for that area, read their `execution_index`
3. Check: every probe's `execution_index` < area's `broad_exploration_start_index`
4. **PASS** if all areas satisfy the constraint. **FAIL** if any area violates — list violated areas.

**Edge cases:**
- Area has no probes: PASS (vacuously true)
- Missing `execution_index` or `broad_exploration_start_index` (v9 data): SKIP with detail "execution order data not available (pre-v10 run)"
- Skipped areas (`skip_reason` present): exclude from check

### Eval 2: Proven Regression Distinction (presentation layer)

**Question:** When a Proven area's score dropped below pass_threshold, does the report's NEEDS ACTION section contain a properly formatted entry?

**Method:**
1. From the test file, identify areas with `Status: Proven`
2. From `.user-test-last-run.json`, check each Proven area's `ux_score` against its `pass_threshold`
3. For each regressed area (score < pass_threshold), search `.user-test-last-report.md` for the NEEDS ACTION section
4. Check for a line matching the pattern: `⚠.*<area-slug>.*→ Proven regression`
5. **PASS** if every regressed Proven area has a matching line item. **FAIL** if any is missing or appears without the `→ Proven regression` marker.

**Edge cases:**
- No Proven areas exist: PASS with detail "no Proven areas in test file"
- No Proven areas regressed: PASS with detail "no Proven regressions this run"
- Cannot parse NEEDS ACTION section: FAIL with detail "NEEDS ACTION section not found in report"

### Eval 3: P1 Surfacing (presentation layer)

**Question:** Did every P1 item from `explore_next_run` appear in the NEEDS ACTION section?

**Method:**
1. From `.user-test-last-run.json`, collect all `explore_next_run` items with `priority: "P1"`
2. For each P1 item, search `.user-test-last-report.md` NEEDS ACTION section for the area slug with `P1` marker
3. **PASS** if all P1 items are in NEEDS ACTION. **FAIL** with count of missing items and their area slugs.

**Scope note:** Verification mismatches on Proven areas also belong in NEEDS ACTION per
dispatch format rules, but they flow through `verification_results`, not `explore_next_run`.
Not checked here — candidate for a future Eval 4.

**Edge cases:**
- No P1 items: PASS with detail "no P1 items this run"
- Cross-area P1 items (area = `[cross-area]`): match against the `why` text or `affected_areas` slugs in NEEDS ACTION

## Phase 3: Propose Mutations

If any eval failed, propose one mutation per failing eval.

**Mutation generation rules:**
- Identify the skill file and section most likely responsible for the failure
- Describe the current behavior and the proposed change
- Frame as a specific, targeted instruction change — not a rewrite
- Number mutations sequentially across all eval runs (read last mutation number from `skill-mutations.md`)

**Mutation format:**

```markdown
## Mutation N -- <date>

**Status:** PROPOSED
**Triggered by:** Eval <N> failure (<eval name>)
**Eval scores:** probe_order: <PASS/FAIL> | regression_distinction: <PASS/FAIL> | p1_surfacing: <PASS/FAIL>
**Skill version:** <version from plugin.json or run context>
**Scenario:** <scenario_slug>

### Problem observed

<1-2 sentences describing the specific failure>

### Proposed change

**File:** <path to skill file or reference>
**Section:** <specific section name>

**Current:** <quote or summarize current instruction>
**Proposed:** <specific new instruction text>

### Outcome

_Fill after next run:_ Did the change fix the eval failure? Score comparison.
```

If all evals passed, do not propose a mutation.

## Phase 4: Write Artifacts

### `skill-evals.json`

Location: `tests/user-flows/skill-evals.json`

If file doesn't exist, create with `{ "eval_version": 1, "entries": [] }`.

Append entry:

```json
{
  "run_timestamp": "<from .user-test-last-run.json>",
  "scenario_slug": "<from .user-test-last-run.json>",
  "git_sha": "<from .user-test-last-run.json>",
  "skill_version": "2.52.0",
  "evals": {
    "probe_execution_order": { "pass": <bool>, "areas_violated": [...], "detail": "..." },
    "proven_regression_distinction": { "pass": <bool>, "regressed_areas": [...], "missing_from_needs_action": [...], "detail": "..." },
    "p1_surfacing": { "pass": <bool>, "p1_count": <int>, "surfaced_count": <int>, "detail": "..." }
  },
  "overall_pass": <bool>,
  "mutation_proposed": <bool>
}
```

Cap at 50 entries — drop oldest if exceeded.

### `skill-mutations.md`

Location: `tests/user-flows/skill-mutations.md`

If file doesn't exist, create with header:

```markdown
# Skill Mutations Log

Proposed changes to the user-test skill based on eval failures.
Mark status as ACCEPTED or REJECTED after review.
```

Append mutation sections for each failing eval. Separate with `---`.

### Graduation Check

After writing artifacts, check for consecutive passing runs:

1. Read the last N entries from `skill-evals.json` where `overall_pass: true`
2. Count consecutive passes from most recent backwards
3. Check for gap reset: if any two consecutive entries have `run_timestamp` more than 14 days apart, reset count to entries after the gap
4. If 5+ consecutive passes within the gap window: display "All evals passing consistently (runs from <first date> to <last date>). Consider adding a 4th eval or shifting to query-level optimization."

## Phase 5: Display Summary

Display a one-line summary:

```
EVAL: <N>/3 pass | probe_order: <PASS/FAIL/SKIP> | regression: <PASS/FAIL> | p1_surfacing: <PASS/FAIL>
```

If mutations were proposed, display each mutation's Problem Observed and Proposed Change inline.

If all passed, display: "All evals passing. No mutations proposed."

If graduation threshold met, display the graduation message.
