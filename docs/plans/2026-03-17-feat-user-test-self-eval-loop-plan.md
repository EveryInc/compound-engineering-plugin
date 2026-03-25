---
title: "feat: Add self-eval loop for user-test skill"
type: feat
status: completed
date: 2026-03-17
origin: docs/brainstorms/2026-03-17-user-test-self-eval-loop-brainstorm.md
---

# feat: Add self-eval loop for user-test skill

## Overview

Add a `/user-test-eval` command that grades the user-test skill's output against 3 binary evals after each run. Records scores in `skill-evals.json`, proposes targeted mutations to the skill in `skill-mutations.md`. Auto-triggers after commit mode completes. Goal: fix the testing instrument (the skill itself) before optimizing what it tests (queries).

## Problem Statement / Motivation

The user-test skill has three known signal-corrupting failure modes:
1. **Probe execution order** — probes run after exploration instead of before, reducing signal quality
2. **Proven regression conflation** — new bugs in Proven areas treated identically to area demotion
3. **P1 burial** — critical items appear in DETAILS but not NEEDS ACTION

These are instrument calibration failures. Optimizing queries through a miscalibrated instrument produces noise. The eval loop catches these failures mechanically, proposes fixes, and builds a mutation history artifact.

(see brainstorm: docs/brainstorms/2026-03-17-user-test-self-eval-loop-brainstorm.md)

## Proposed Solution

### Architecture

```
/user-test → Phase 4 → Commit Mode → Auto-trigger → /user-test-eval
                                                          ↓
                                          Read artifacts (JSON + report file)
                                                          ↓
                                          Grade 3 binary evals
                                                          ↓
                                          Write skill-evals.json (scores)
                                          Write skill-mutations.md (proposals)
```

Three new components:
1. **`/user-test-eval` command** — thin dispatch to new eval skill
2. **`user-test-eval` skill** — grades from artifacts, proposes mutations
3. **Report file artifact** — rendered report written to file during commit mode (new)

Plus two schema changes to existing `.user-test-last-run.json`:
- `execution_index` per `probes_run` entry
- `broad_exploration_start_index` per area

### Prerequisites: Artifact Gaps

The eval cannot function without two changes to the existing skill:

**1. Report file artifact (new)**

Commit mode currently prints the report to stdout only. The eval needs to read the rendered report from a file. Add a step to commit mode that writes the rendered report to `tests/user-flows/.user-test-last-report.md`, overwritten each run, gitignored.

**Why a separate file instead of reading conversation context:** The brainstorm established that same-context grading is the exact failure mode we've seen — structurally correct reports that technically satisfy format requirements while burying findings. Reading from an artifact forces the eval to grade what the user actually sees, without access to the reasoning that produced it.

**2. Execution order metadata (schema change)**

Eval 1 checks probe execution order. The current `probes_run` array in `.user-test-last-run.json` records results but not execution sequence relative to broad exploration. Add:
- `execution_index: <integer>` to each `probes_run` entry (0-based, monotonically increasing across all areas)
- `broad_exploration_start_index: <integer>` per area in the `areas` array

Eval 1 then checks: for each area, all probe `execution_index` values < that area's `broad_exploration_start_index`. Binary, mechanical, no judgment required.

## The 3 Binary Evals

### Eval 1: Probe Execution Order (protocol layer)

**Question:** Did all failing/untested probes execute before broad exploration in every area?

**Grading method:** For each area in `areas`, check that every `probes_run` entry for that area has `execution_index < broad_exploration_start_index`. FAIL if any area violates. Report which areas violated.

**Data source:** `.user-test-last-run.json` only (structural check).

**Zero probes case:** If an area has no probes, it passes vacuously.

### Eval 2: Proven Regression Distinction (reasoning layer — reformulated as structural)

**Question:** When a Proven area's score dropped by 1+ points, does the report's NEEDS ACTION section contain an entry for that area?

**Grading method:**
1. From `.user-test-last-run.json`, identify areas where the test file shows `status: Proven` but the run's `ux_score` is below `pass_threshold`
2. From `.user-test-last-report.md`, check that each such area appears in the NEEDS ACTION section as a **line item** with the `⚠` prefix and `→ Proven regression` marker (not just the area slug mentioned anywhere in the section). The required format is: `⚠ P[N]  <area-slug> ... → Proven regression`
3. PASS if every regressed Proven area has a matching line item. FAIL if any is missing or appears without the `→ Proven regression` marker.

**Why a specific marker:** Checking for slug presence alone is gameable — the area could appear as a parenthetical note rather than an action item and technically pass. The marker requirement makes the check fully mechanical: regex match for `⚠.*<area-slug>.*→ Proven regression` in the NEEDS ACTION block.

**Why reformulated:** The original question ("did the report distinguish bug vs. demotion?") was subjective. This structural version tests the same thing — a Proven regression must surface as actionable, not buried in DETAILS — without requiring judgment calls about "distinguishing."

**No Proven regressions case:** Automatic PASS (vacuously true). The eval records `"detail": "no Proven regressions this run"`.

**Data source:** Both `.user-test-last-run.json` (to identify regressions) and `.user-test-last-report.md` (to verify surfacing).

### Eval 3: P1 Surfacing (presentation layer)

**Question:** Did every P1 item (from `explore_next_run` where `priority: "P1"`) appear in the NEEDS ACTION section?

**Grading method:**
1. From `.user-test-last-run.json`, collect all `explore_next_run` items with `priority: "P1"`
2. From `.user-test-last-report.md`, verify each P1 item appears in the NEEDS ACTION block (match area slug + priority marker)
3. PASS if all P1 items are in NEEDS ACTION. FAIL with count of missing items.

**Scope note:** Verification mismatches on Proven areas also belong in NEEDS ACTION (per dispatch format rules), but they flow through a different path — the `verification_results` array, not `explore_next_run`. The main skill does not consistently promote these to `explore_next_run` P1 items, so including them here would produce false positives. If verification mismatch surfacing needs eval coverage, add it as a separate Eval 4 later.

**Zero P1 items case:** Automatic PASS. Eval records `"detail": "no P1 items this run"`.

**Data source:** Both artifacts.

## Artifact Schemas

### `skill-evals.json`

Location: `tests/user-flows/skill-evals.json` (project-scoped, committed to git)

```json
{
  "eval_version": 1,
  "entries": [
    {
      "run_timestamp": "2026-03-17T14:30:00Z",
      "scenario_slug": "resale-clothing",
      "git_sha": "abc1234",
      "skill_version": "2.52.0",
      "evals": {
        "probe_execution_order": {
          "pass": true,
          "areas_violated": []
        },
        "proven_regression_distinction": {
          "pass": false,
          "regressed_areas": ["login"],
          "missing_from_needs_action": ["login"],
          "detail": "Login regressed from Proven (score 4→2) but only appeared in DETAILS"
        },
        "p1_surfacing": {
          "pass": true,
          "p1_count": 2,
          "surfaced_count": 2
        }
      },
      "overall_pass": false,
      "mutation_proposed": true
    }
  ]
}
```

- Cap: 50 entries (drop oldest)
- `eval_version` at top level — bumped when evals change, enabling historical comparison filtering
- Created if missing on first eval run

### `skill-mutations.md`

Location: `tests/user-flows/skill-mutations.md` (project-scoped, committed to git)

```markdown
# Skill Mutations Log

Proposed changes to the user-test skill based on eval failures.
Mark status as ACCEPTED or REJECTED after review.

---

## Mutation 1 — 2026-03-17

**Status:** PROPOSED
**Triggered by:** Eval 2 failure (Proven regression distinction)
**Eval scores:** probe_order: PASS | regression_distinction: FAIL | p1_surfacing: PASS
**Skill version:** 2.52.0
**Scenario:** resale-clothing

### Problem observed

Login area regressed from Proven (score 4→2) but only appeared in DETAILS section.
The report treated it as a normal score change rather than surfacing it in NEEDS ACTION.

### Proposed change

**File:** `plugins/compound-engineering/skills/user-test/SKILL.md`
**Section:** Report Output — Dispatch Format, NEEDS ACTION rules

**Current:** NEEDS ACTION includes "degrading areas, failing probes on Proven areas, verification mismatches on Proven"
**Proposed:** Add explicit rule: "Any Proven area scoring below pass_threshold MUST appear in NEEDS ACTION with '→ Proven regression' suffix, regardless of whether a bug was filed."

### Outcome

_Fill after next run:_ Did the change fix the eval failure? Score comparison.
```

- Each mutation is a markdown section with clear status
- Status values: `PROPOSED` | `ACCEPTED` | `REJECTED`
- One mutation per failing eval — all failures get proposals in a single run
- Human reviewer decides which to accept (can accept all, some, or none)
- Proposals are numbered sequentially across all eval runs (Mutation 1, 2, 3...)

### `.user-test-last-report.md` (new artifact)

Location: `tests/user-flows/.user-test-last-report.md` (gitignored, ephemeral)

Written during commit mode, after the report is displayed. Contains the exact rendered report text. Overwritten each run.

## Implementation Plan

### Phase 1: Prerequisites (changes to existing skill)

#### 1a. Add report file output

**File:** `plugins/compound-engineering/skills/user-test/SKILL.md`
**Location:** After "Share Report (Optional)" section, before "Auto-Commit"
**Change:** Add step: "Write the rendered report to `tests/user-flows/.user-test-last-report.md`"

**File:** `plugins/compound-engineering/skills/user-test/SKILL.md`
**Location:** Phase 0, step for `.gitignore` coverage
**Change:** Add `.user-test-last-report.md` to the gitignore check alongside `.user-test-last-run.json`

#### 1b. Add execution order metadata

**File:** `plugins/compound-engineering/skills/user-test/references/last-run-schema.md`
**Change:** Add `execution_index` to `probes_run` entries, add `broad_exploration_start_index` to per-area fields

**File:** `plugins/compound-engineering/skills/user-test/SKILL.md`
**Location:** Phase 3, probe execution section
**Change:** Instruct agent to track execution index (monotonically increasing counter across all MCP calls/actions) and record `broad_exploration_start_index` when transitioning from probe execution to broad exploration per area

**Schema version:** Bump to v10. Add v9 migration rule: treat missing `execution_index` as absent (eval skips Eval 1 for runs without ordering data). Treat missing `broad_exploration_start_index` as absent.

### Phase 2: New skill and command

#### 2a. Create eval skill

**New file:** `plugins/compound-engineering/skills/user-test-eval/SKILL.md`

Contents:
- Frontmatter: `name: user-test-eval`, description, `disable-model-invocation: true`
- **Artifact-only grading rule:** "Grade from file artifacts only. Do not reference test execution context, Phase 3 observations, or any other conversation content. The eval's integrity depends on grading what the user sees (the report file), not what the agent knows."
- Load phase: Read `.user-test-last-run.json` and `.user-test-last-report.md`. Abort if either missing or if `completed: false`. Warn if run_timestamp > 24h old.
- Read test file to get area maturity statuses (needed for Eval 2).
- Run 3 evals in order. Record pass/fail + detail for each.
- If any eval fails: propose one mutation per failing eval. Write all to `skill-mutations.md`.
- Append entry to `skill-evals.json`. Create file if missing.
- Display summary: `EVAL: 2/3 pass | probe_order: PASS | regression: FAIL | p1_surfacing: PASS`
- If mutation proposed, display the proposed change inline.

#### 2b. Create eval command

**New file:** `plugins/compound-engineering/commands/user-test-eval.md`

```yaml
---
name: user-test-eval
description: Grade user-test skill output against binary evals
disable-model-invocation: true
allowed-tools: Skill(user-test-eval)
---

Invoke the user-test-eval skill for the last completed run.
```

#### 2c. Add auto-trigger to commit mode

**File:** `plugins/compound-engineering/skills/user-test/SKILL.md`
**Location:** End of Commit Mode section, after step 8c
**Change:** Add:

```
### Auto-Eval

After all commit steps complete, automatically invoke `/user-test-eval` to grade
this session's output. The eval reads from file artifacts — it does not use
conversation context from this session.

**Skip conditions:** `--no-eval` flag, or if commit was partial/aborted.
**Error handling:** If eval fails, the commit is already complete and preserved.
Display "Eval failed: <reason>. Run `/user-test-eval` manually to retry."
```

Also add auto-trigger after `/user-test-commit` standalone (same artifacts, same trigger).

### Phase 3: Versioning and metadata

- Bump plugin version to 2.52.0 in `.claude-plugin/plugin.json`
- Update `marketplace.json` description with new skill count
- Update `README.md` — add user-test-eval to skills list
- Update `CHANGELOG.md` with the addition
- Schema version bump to v10 in test-file-template.md

## Technical Considerations

### Same-conversation limitation

The auto-trigger runs eval in the same conversation as the test. The eval skill instructions say "grade from artifacts only," but the model still has conversation context. This is acknowledged as aspirational, not enforced.

All three evals are designed to be mechanically checkable from artifacts: Eval 1 is pure index comparison, Eval 2 is a regex match for a specific marker format (`⚠.*<slug>.*→ Proven regression`), Eval 3 is slug+priority matching in a section block. No eval requires subjective judgment, which limits the surface area for self-bias to near zero.

If gaming becomes observable (evals consistently pass but failures still occur in practice), the mitigation is to switch to manual-only invocation (`--no-eval` by default, explicit `/user-test-eval` in a new session).

### Iterate mode

Eval runs once after the final commit, not per-iteration. Grades the aggregate report. Eval 1 checks probe execution order for the first run only (subsequent runs use progressive narrowing where ordering constraints are relaxed).

### Partial runs

If `completed: false` in `.user-test-last-run.json`, eval aborts. Same guard as commit mode.

### Artifact overwrite risk

`.user-test-last-run.json` and `.user-test-last-report.md` are overwritten each run. If user runs `/user-test` again before running standalone eval, the previous artifacts are gone. The auto-trigger avoids this (eval runs immediately after commit).

**Manual eval guard:** Before grading, check if `run_timestamp` in the artifact matches the `run_timestamp` of the last entry in `skill-evals.json`. If they match, this run was already evaluated — warn "This run was already evaluated. Run again? (y/n)". Also warn if `run_timestamp` > 24h old (matching commit mode's staleness check).

### Concurrent writes

Not supported. `skill-evals.json` writes are not atomic. Concurrent eval invocations (e.g., two terminals) could corrupt the file. Low risk for single-user CLI tool.

### Eval evolution

`eval_version` in `skill-evals.json` enables filtering when comparing historical scores. When adding a 4th eval, bump `eval_version` to 2. Entries with version 1 have 3 evals; version 2 has 4. Comparison tools should filter by version.

### Graduation trigger

When evals pass for 5 consecutive runs, the eval should note: "All evals passing consistently (runs from <first date> to <last date>). Consider adding a 4th eval or shifting to query-level optimization." Surface the date range alongside the count so the span is visible.

**Gap reset:** If the gap between any two consecutive passing runs exceeds 14 days, reset the consecutive count. A run after a 3-week hiatus isn't comparable to daily sprint runs — the skill may have changed, the app may have changed, and the consecutive count would be misleading.

## Acceptance Criteria

- [x] `/user-test-eval` command exists and invokes the eval skill
- [x] Eval reads `.user-test-last-run.json` and `.user-test-last-report.md` (not conversation context)
- [x] 3 binary evals implemented: probe execution order, Proven regression distinction, P1 surfacing
- [x] Scores written to `tests/user-flows/skill-evals.json` with defined schema
- [x] Mutation proposals written to `tests/user-flows/skill-mutations.md` when evals fail
- [x] Prompts user to run `/user-test-eval` after commit mode (both auto-commit and standalone `/user-test-commit`)
- [x] `--no-eval` flag skips the auto-trigger
- [x] `.user-test-last-report.md` written during commit mode, gitignored
- [x] `execution_index` and `broad_exploration_start_index` added to last-run JSON schema
- [x] Manual eval warns if run_timestamp matches last skill-evals.json entry (already evaluated)
- [x] Graduation consecutive count resets if gap between runs exceeds 14 days
- [x] Schema bumped to v10 with v9 migration rule
- [x] Plugin version bumped to 2.52.0
- [x] CHANGELOG, README, plugin.json, marketplace.json updated

## Scope Boundaries

**In scope:**
- `/user-test-eval` skill + command
- 3 binary evals (mechanical, artifact-based)
- `skill-evals.json` + `skill-mutations.md` artifacts
- Report file artifact (`.user-test-last-report.md`)
- Execution order metadata in last-run JSON
- Auto-trigger from commit mode
- Schema v10

**Out of scope:**
- Autonomous mutation application (human review required)
- Query-level optimization (comes after skill evals are stable)
- More than 3 evals (expand after 5 consecutive passes)
- Cross-model evaluation (same model, different context)
- Mutation revert mechanism (use `git revert`)
- Extract mutation format template and JSON schema to `references/` (v2.53.0 consideration — eval skill is 184 lines, extraction warranted when approaching 300+ or when references would be reused across skills)

## Dependencies & Risks

**Dependencies:**
- Existing user-test skill and commit mode must be stable
- Schema v9 must be current (it is as of v2.51.0)

**Risks:**
- Self-evaluation bias on Eval 2 (mitigated by structural reformulation)
- Auto-trigger adds latency to every test session (~10-30s)
- Mutation proposals may be low quality initially (mitigated by human review gate)

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-17-user-test-self-eval-loop-brainstorm.md](../brainstorms/2026-03-17-user-test-self-eval-loop-brainstorm.md) — Key decisions: separate eval command (not Phase 5), artifact-based grading, `skill-mutations.md` for proposals, 3 binary evals targeting protocol/reasoning/presentation layers
- **Existing skill:** `plugins/compound-engineering/skills/user-test/SKILL.md` — Phase 4 report format, commit mode steps
- **Last-run schema:** `plugins/compound-engineering/skills/user-test/references/last-run-schema.md`
- **Learnings:** Agent-guided state transitions (docs/solutions/2026-02-26-agent-guided-state-and-mcp-resilience-patterns.md) — don't hardcode state transitions, use scoring rubrics
- **Learnings:** Monolith-to-skill split anti-patterns (docs/solutions/2026-02-26-monolith-to-skill-split-anti-patterns.md) — enforce size budgets deterministically, don't duplicate validation
- **Probe lifecycle plan:** docs/plans/2026-02-28-feat-user-test-compounding-probe-system-plan.md — binary verification separate from numeric scoring
- **Report dispatch format:** docs/plans/2026-03-01-refactor-user-test-report-dispatch-format-plan.md — NEEDS ACTION section rules
