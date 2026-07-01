---
title: "User-Test Skill Revision: Timing, Qualitative Summaries, Delta Tracking, and More"
type: feat
status: completed
date: 2026-02-28
---

# User-Test Skill Revision

Based on 7 rounds of iterative testing and real production test results.

## Overview

Revise the `user-test` skill to add timing tracking, qualitative summaries, delta regression detection, explore-next-run generation, optional CLI mode, output quality scoring, and conditional regression checks. These changes address gaps discovered during real-world usage — timing regressions went unnoticed, structured scores missed qualitative signal, and ~60% of bugs were agent reasoning errors catchable without a browser.

## Problem Statement / Motivation

The current skill scores UX quality but misses three signals that real testing revealed:
1. **Performance blind spot** — response time regressed 15s to 28s across 5 runs, unnoticed until manually tracked
2. **Qualitative signal loss** — "4.2/5 average" doesn't answer "should we demo tomorrow?"
3. **Regression hiding** — absolute numbers mask run-over-run quality changes
4. **Stale explore-next-run** — the section stays empty because the skill doesn't generate items proactively
5. **Browser-only bottleneck** — most agent reasoning bugs don't need a browser to catch

## Proposed Solution

10 changes in 3 priority tiers, scoped to stay within the 500-line SKILL.md budget.

### Prerequisite: Schema Migration Strategy

Multiple changes (1A, 1C, 2B, 2C) add columns to the test file template. Existing `schema_version: 1` files must not break.

**Approach:**
- Bump to `schema_version: 2` in the template
- Phase 1 (Load Context): when reading a v1 file, add missing columns with empty/default values in memory — do NOT rewrite the file
- Commit mode: when writing back, upgrade the file to v2 schema (adds new columns, preserves all existing data)
- Forward compatibility: the reader tolerates unknown frontmatter fields (from a future v3) by ignoring them. Unknown table columns are preserved on write.
- The "offer to regenerate" recovery path remains for genuinely corrupted files only

### Prerequisite: Run Results Persistence

The current skill relies on the agent's context window to pass run results from `/user-test` to `/user-test-commit`. With more data dimensions (timing, dual scores, qualitative notes), this becomes fragile.

**Approach:**
- After Phase 4 completes, write a `.user-test-last-run.json` file in `tests/user-flows/` containing: scenario slug, per-area scores (UX + optional quality), timing, qualitative summary, issues to file, maturity assessments
- `/user-test-commit` reads this file instead of relying on context
- The file is overwritten on each run (only last run is committable)
- Add `.user-test-last-run.json` to the project's `.gitignore` guidance in Phase 1

**Stale/missing file handling for `/user-test-commit`:**
- **Missing file:** If `.user-test-last-run.json` doesn't exist, abort with "No run results found. Run `/user-test` first."
- **Stale file:** The file includes a `run_timestamp` (ISO 8601). If the timestamp is older than 24 hours, warn: "Run results are from <timestamp>. Commit anyway? (y/n)." If older than 7 days, abort with "Run results too old — re-run `/user-test` first."
- **Partial run:** The file includes a `completed: true|false` flag. If `false`, abort with "Last run was incomplete. Run `/user-test` again for committable results."
- **No context fallback:** Commit mode never falls back to context window. The JSON file is the single source of truth.

## Priority 1: High Impact, Low Effort

### 1A. Timing Tracking

**Files:** SKILL.md Phase 3 + Phase 4, test-file-template.md

**Change:** Measure wall-clock time per area (start timestamp before first MCP call, end after last). Record in seconds.

**Template change — Areas table:**
```
| Area | Status | Last Score | Last Time | Consecutive Passes | Notes |
```

**Report output adds Time column:**
```
| Area | Status | Score | Time | Assessment |
```

**Edge cases:**
- Partial area (disconnect mid-area): record time as `—` (incomplete), do not include in averages
- Timing includes async waits — this is intentional (slow is slow, regardless of cause)

**SKILL.md budget:** +8 lines

### 1B. Qualitative Summary in Report Output

**Files:** SKILL.md Phase 4 Report Output

**Add after the scores table:**
```
Qualitative:
- Best moment: <most impressive interaction observed>
- Worst moment: <interaction that broke confidence>
- Demo ready: yes / partial / no
- One-line verdict: <summary>
```

**Persistence:** These fields are written to `.user-test-last-run.json` for commit mode. `demo_readiness`, `verdict`, and a brief `context` note are persisted to `test-history.md` during commit. The `context` field is a one-phrase explanation of *why* (e.g., "search results loading 28s" alongside verdict "partial") — without it, verdicts become ambiguous after a few weeks. `best_moment` and `worst_moment` are ephemeral (report-only) — they inform the human reviewer but don't need historical tracking.

**Edge cases:**
- All areas score the same: pick the area that was most/least expected
- Only one area tested: best and worst are the same — write one line

**SKILL.md budget:** +10 lines

### 1C. Delta Tracking in Run History

**Files:** SKILL.md Commit Mode, test-file-template.md

**Change:** When appending to `test-history.md`, compute delta from the most recent *completed* previous run:
```
| Date | Quality Avg | Delta | Key Finding | Context |
| 2/26 | 4.86 | +0.15 | Exclusion filters working | |
| 2/24 | 4.71 | -0.18 | Forest green regression | color picker CSS regression |
```

Flag any delta worse than -0.5 with a warning in the commit output.

**Edge cases:**
- First run ever: delta is `—` (no baseline)
- Previous run was partial: skip to the last complete run
- Different area sets between runs: compute avg over only areas present in BOTH runs. If no overlap, delta is `—`. **Known limitation:** if area sets drift significantly over time (adding 3, removing 2), the delta is computed over a shrinking overlap and may look stable even when new areas perform poorly. Acceptable for now — flag for revisit if delta becomes unreliable in practice.
- Iterate mode: delta is computed between the iterate session's aggregate and the previous non-iterate run. Per-iteration deltas within a session are NOT computed (they are noise, not signal)
- Iterate mode output includes per-run timing and timing variance alongside score variance. A consistent 28s is fine; wild swings between 5s and 45s indicate flakiness worth investigating.

**SKILL.md budget:** +10 lines

### 1D. Explore-Next-Run Generation Guidance

**Files:** SKILL.md Phase 4

**Add:** After scoring, explicitly generate 2-3 Explore Next Run items with priority:
- **P1** — Things that surprised you (positive or negative)
- **P2** — Edge cases adjacent to tested areas
- **P3** — Interactions started but not finished, or borderline scores (score of 3)

A "borderline" score is any area scoring 3/5 — warrants deeper investigation next run regardless of maturity status.

**SKILL.md budget:** +8 lines

## Priority 2: Medium Impact, Medium Effort

### 2A. Optional CLI Mode

**Files:** SKILL.md (new Phase 2.5), test-file-template.md (frontmatter)

**Test file frontmatter addition:**
```yaml
---
cli_test_command: "node scripts/test-cli.js --query '{query}'"  # optional
cli_queries:  # optional
  - query: "queen bed hot sleeper"
    expected: "cooling materials, percale or linen"
  - query: "something nice"
    expected: "asks clarifying questions"
---
```

**SKILL.md addition — Phase 2.5: CLI Testing**

If the test file defines `cli_test_command`:
1. Skip Phase 0 MCP preflight (CLI doesn't need chrome). Run `gh auth status` check only.
2. Skip Phase 2 browser setup entirely
3. For each query in `cli_queries`: run the command via Bash, capture stdout
4. Score output quality 1-5 against the `expected` field using the **output quality rubric** (see 2B). The agent evaluates whether the CLI output satisfies the expected description semantically — this is NOT exact string matching. The `expected` field describes what a correct response looks like, and the agent applies the output quality rubric to judge.
5. CLI results feed into the same maturity map and scoring pipeline
6. If BOTH `cli_queries` and browser areas exist in the test file: run CLI first. If CLI reveals broken agent logic (scores <= 2), skip browser testing for overlapping areas with a note "CLI pre-check failed — skipping browser test."

**Overlap detection is explicit, not agent-inferred.** Each CLI query can optionally tag the browser area it pre-checks:
```yaml
cli_queries:
  - query: "queen bed hot sleeper"
    expected: "cooling materials, percale or linen"
    prechecks: "search-results"  # area slug — skip this browser area on CLI failure
  - query: "something nice"
    expected: "asks clarifying questions"
    # no prechecks tag — CLI-only, no browser area overlap
```
If `prechecks` is present and the CLI query scores <= 2, the tagged browser area is skipped. If `prechecks` is absent, the CLI query is standalone — no browser areas are skipped regardless of score. This eliminates fuzzy semantic matching at runtime.

**Credential handling:** The `cli_test_command` runs as a Bash command inheriting the shell environment. No credentials are stored in the test file. If the command needs env vars, the user sets them in their shell before running `/user-test`.

**Iterate mode:** CLI iterate resets by simply re-running the command (no browser reload needed). If the command has side effects (DB writes), document this limitation in iterate-mode.md.

**SKILL.md budget:** +30 lines (extract to `references/cli-mode.md` if it exceeds 35)

### 2B. Output Quality Scoring Dimension

**Files:** SKILL.md Phase 4 Scoring, test-file-template.md

**Change:** Areas can optionally have `scored_output: true` in their area details. When set, score TWO dimensions:

| Dimension | Rubric | When to use |
|-----------|--------|-------------|
| **UX score (1-5)** | Existing rubric (broken → delightful) | Always |
| **Quality score (1-5)** | Output correctness rubric (below) | Only when `scored_output: true` |

**Output Quality Rubric:**

| Score | Meaning | Example |
|-------|---------|---------|
| 5 | Exactly what an expert would produce | Right products, right reasoning |
| 4 | Relevant, minor misses | Mostly right, one irrelevant result |
| 3 | Partially correct | Some right, some wrong |
| 2 | Mostly wrong | Misunderstood intent |
| 1 | Completely wrong | Wrong category, hallucinated data |

**Report shows both:** `UX: 4/5, Quality: 3/5`

**Aggregation rules:**
- `Quality Avg` in run history = average of UX scores only (maintains backward compatibility for areas without `scored_output`)
- **Promotion gate for `scored_output: true` areas:** UX >= 4 AND Quality >= 3. A beautiful UI showing wrong results should not promote to Proven.
- **Promotion gate for standard areas:** UX >= 4 only (unchanged from v1)
- Quality score tracked as `Output Avg` in the report for visibility
- Known-bug filing: trigger on UX <= 2 (functional failure) OR Quality <= 1 (completely wrong output)

**Template change — Areas table:**
```
| Area | Status | Last Score | Last Quality | Last Time | Consecutive Passes | Notes |
```
(`Last Quality` column only populated for areas with `scored_output: true`)

**SKILL.md budget:** +15 lines

### 2C. Conditional Regression Checks for Known-Bug Areas

**Files:** SKILL.md Phase 3, test-file-template.md

**Test file area detail addition:**
```markdown
### cart-quantity-update
**Status:** Known-bug
**Issue:** #47
**Fix check:** Verify quantity updates in <5s and cart badge reflects new count
```

**SKILL.md Phase 3 addition:**

When encountering a Known-bug area:
1. If `gh` is not authenticated: skip as normal (no change)
2. Check if the linked issue is closed: `gh issue view <issue-number> --json state -q '.state'`
3. If `closed`: flip area to Uncharted, run the `fix_check` as the first test for that area
4. If `open`: skip as normal
5. If the fix check fails (score <= 2): file a new issue with note "Regression of #N" in the body referencing the original closed issue for traceability. The dedup check (`--state open`) won't find the closed issue, so a new issue is created — this is correct behavior.

**Template change:** Known-bug areas store `**Issue:** #<number>` in their area details section. This is the canonical reference for `gh issue view`.

**SKILL.md budget:** +15 lines

## Priority 3: Nice to Have

### 3A. Async Wait Pattern

**Files:** browser-input-patterns.md only (no SKILL.md change)

**Add:**
```javascript
// Wait for async operation completion
mcp__claude-in-chrome__javascript_tool({
  code: `
    (async () => {
      const start = Date.now();
      const timeout = 10000;
      const selector = '.success-message';
      while (Date.now() - start < timeout) {
        if (document.querySelector(selector)) return 'found';
        await new Promise(r => setTimeout(r, 200));
      }
      return 'timeout';
    })()
  `
})
```

**SKILL.md budget:** 0 lines

### 3B. Performance Threshold Configuration

**Files:** test-file-template.md frontmatter, SKILL.md Phase 4

**Frontmatter addition:**
```yaml
---
performance_thresholds:  # optional, seconds
  fast: 2
  acceptable: 8
  slow: 20
  broken: 60
---
```

**Scoring integration:** If thresholds are defined, append a timing grade to each area's assessment in the report: `(fast)`, `(acceptable)`, `(slow)`, `(BROKEN)`. A `broken` timing grade is a finding worth noting but does NOT affect the UX score — timing and quality are separate dimensions.

**Measurement:** Wall-clock time from 1A. No browser performance API needed.

**SKILL.md budget:** +8 lines

### 3C. End-to-End Unscripted Scenario Type — DEFERRED

**Rationale for deferral:** The SpecFlow analysis identified fundamental conflicts with the maturity model. Unscripted runs produce emergent areas that don't map to stable slugs, breaking consecutive-pass tracking, issue label convention, and iterate mode compatibility. This needs a separate design pass (possibly a distinct mode with its own output format) rather than being retrofitted into the existing area-based model.

**Interim alternative:** Users can approximate unscripted testing by creating a test file with broad areas (e.g., `first-time-onboarding`) and giving the agent latitude in the area description. This gets 80% of the value without the architectural conflict.

## Technical Considerations

### SKILL.md Budget Impact

| Change | Lines Added | Cumulative |
|--------|-----------|------------|
| Current | 0 | 192 |
| 1A Timing | +8 | 200 |
| 1B Qualitative | +10 | 210 |
| 1C Delta | +10 | 220 |
| 1D Explore | +8 | 228 |
| 2A CLI mode | +30 | 258 |
| 2B Quality scoring | +15 | 273 |
| 2C Regression checks | +15 | 288 |
| 3B Thresholds | +8 | 296 |
| **Total** | **+104** | **~296** |

Well within the 500-line budget. If CLI mode grows beyond 35 lines during implementation, extract to `references/cli-mode.md`.

### File Change Summary

| File | Changes |
|------|---------|
| `SKILL.md` | +104 lines: timing in Phase 3-4, qualitative summary in Phase 4, delta in Commit Mode, explore-next generation in Phase 4, CLI Phase 2.5, output quality rubric, regression checks in Phase 3, threshold eval in Phase 4 |
| `test-file-template.md` | Schema v2: new columns (Last Time, Last Quality), `cli_test_command`/`cli_queries` frontmatter, `performance_thresholds` frontmatter, Known-bug `Issue:` field, `fix_check` field |
| `browser-input-patterns.md` | +15 lines: async wait pattern |
| `iterate-mode.md` | +8 lines: CLI iterate reset note, timing per run in output table, timing variance alongside score variance |
| Commands | No changes (thin wrappers unchanged) |

### Backward Compatibility

- v1 test files work unchanged — missing columns filled with defaults on read
- v1 files upgraded to v2 on next commit (non-destructive)
- CLI mode is opt-in (no `cli_test_command` = no CLI testing)
- Quality scoring is opt-in (`scored_output: true` per area)
- Performance thresholds are opt-in (no frontmatter = no timing grades)

## Acceptance Criteria

### P1 Changes

- [x] 1A: Report output includes `Time` column per area
- [x] 1A: Test file template has `Last Time` column in areas table
- [x] 1A: Partial area timing recorded as `—`
- [x] 1B: Report output includes qualitative summary (best moment, worst moment, demo ready, verdict)
- [x] 1B: `demo_readiness` and `verdict` persist to test-history.md via commit mode
- [x] 1C: Run history includes `Delta` column computed from last complete run
- [x] 1C: Delta worse than -0.5 flagged with warning
- [x] 1C: First run shows delta as `—`
- [x] 1C: Iterate mode computes delta vs. pre-session baseline only
- [x] 1D: Phase 4 generates 2-3 Explore Next Run items with P1/P2/P3 priority
- [x] 1D: Borderline (score 3) areas flagged for deeper investigation

### P2 Changes

- [x] 2A: Test files with `cli_test_command` run CLI queries before browser testing
- [x] 2A: CLI mode skips Phase 0 MCP preflight and Phase 2 browser setup
- [x] 2A: CLI queries use explicit `prechecks` tag for browser area overlap (no agent-inferred matching)
- [x] 2A: No credentials stored in test file
- [x] 2B: Areas with `scored_output: true` show dual scores (UX + Quality)
- [x] 2B: Quality Avg in history = UX scores only (backward compatible)
- [x] 2B: Known-bug trigger: UX <= 2 OR Quality <= 1
- [x] 2C: Known-bug areas with closed issues auto-flip to Uncharted
- [x] 2C: Fix check runs as first test for re-opened areas
- [x] 2C: Issue number stored in area details (`**Issue:** #N`)

### P3 Changes

- [x] 3A: Async wait pattern documented in browser-input-patterns.md
- [x] 3B: Optional `performance_thresholds` frontmatter evaluates timing grades
- [x] 3C: Deferred — documented as future work

### Prerequisites

- [x] Schema migration: v1 files read without error, upgraded to v2 on commit
- [x] Forward compatibility: v2 reader tolerates unknown frontmatter fields from future schema versions (ignore, don't error)
- [x] Run results persistence: `.user-test-last-run.json` written after Phase 4, read by commit mode
- [x] `.user-test-last-run.json` added to `.gitignore` guidance
- [x] Commit mode aborts if `.user-test-last-run.json` missing, incomplete, or >7d stale
- [x] Commit mode warns if `.user-test-last-run.json` >24h old
- [x] `verdict` persists with `context` note to test-history.md

### Post-Change Validation

- [x] SKILL.md <= 500 lines after all changes (313 lines)
- [x] All reference file links use proper markdown format
- [x] Existing v1 test files load without error
- [x] Version bump in plugin.json, marketplace.json, CHANGELOG.md (2.36.0)
- [x] Reinstall to `~/.claude/skills/user-test/` and `~/.claude/commands/`

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| SKILL.md exceeds 500 lines | Extract CLI mode to references/cli-mode.md if >35 lines |
| v1 test files break with new columns | Schema migration reads v1, upgrades on commit |
| Run results lost between sessions | `.user-test-last-run.json` persists results to disk |
| CLI command has side effects on iterate | Document limitation in iterate-mode.md |
| Delta misleading with changing area sets | Compute delta over overlapping areas only |
| 3C unscripted conflicts with maturity model | Deferred — needs separate design |
| Stale `.user-test-last-run.json` committed | Timestamp check: warn >24h, block >7d, block if incomplete |

## Implementation Sequence

1. **Prerequisites first** — schema migration logic + `.user-test-last-run.json` persistence
2. **P1 changes** (1A, 1B, 1C, 1D) — all low effort, high value
3. **P2 changes** (2A, 2B, 2C) — medium effort, build on P1 foundations
4. **P3 changes** (3A, 3B) — nice-to-have, zero risk
5. **Reinstall** — copy updated files to `~/.claude/skills/` and `~/.claude/commands/`
6. **Validate** — run `/user-test` against a test scenario to verify

## Sources & References

### Internal References
- Current SKILL.md: `plugins/compound-engineering/skills/user-test/SKILL.md` (192 lines)
- Current template: `plugins/compound-engineering/skills/user-test/references/test-file-template.md` (81 lines)
- Current patterns: `plugins/compound-engineering/skills/user-test/references/browser-input-patterns.md` (54 lines)
- Current iterate: `plugins/compound-engineering/skills/user-test/references/iterate-mode.md` (65 lines)
- Skill size budget: `docs/solutions/2026-02-26-monolith-to-skill-split-anti-patterns.md`
- Original plan: `docs/plans/2026-02-26-feat-user-test-browser-testing-skill-plan.md`

### Conventions Applied
- Schema versioning for forward compatibility
- SKILL.md 500-line budget with reference extraction fallback
- Thin wrapper commands unchanged (no new commands needed)
- Backward-compatible template migration (read v1, write v2)
