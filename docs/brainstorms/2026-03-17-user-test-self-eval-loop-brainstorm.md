---
date: 2026-03-17
topic: user-test-self-eval-loop
---

# User-Test Self-Eval Loop

## What We're Building

A closed-loop self-evaluation system for the `user-test` skill. After each testing session, a separate `/user-test-eval` command grades the skill's output against a fixed set of binary evals, records scores, and proposes one targeted mutation to the skill's instructions. The human reviews and accepts/rejects. Over time this produces a durable research artifact — a history of what was tried, what improved signal, and what didn't.

## Why This Approach

The auto-research pattern (run → eval → mutate → run again) applies to the user-test skill, but two constraints shape the design:

1. **Skill first, queries second.** The skill has known structural issues (probe execution order violations, Proven regression conflation, P1 item burial). These corrupt signal — optimizing queries through a miscalibrated instrument produces noise. Fix the instrument first, validate it holds, then turn it on query optimization.

2. **Semi-automated, not autonomous.** Full autonomous mutation (run every 2 minutes, keep winner) risks unreviewed prompt drift. The skill is complex enough (SKILL.md + 14 reference files, schema v9) that mutations need human review. The friction cost of review is low; the risk of unreviewed drift is high.

## Key Decisions

### Eval runs as a separate command, not inside the skill

- **Decision:** New `/user-test-eval` command (Option 2), not a Phase 5 inside the skill (Option 1) or added to `/user-test-commit` (Option 3).
- **Rationale:** Same context window grading its own output is the exact failure mode we've already seen — structurally correct reports that technically satisfy format requirements while burying findings. Separate invocation context = harder to game. `/user-test-commit` is already doing post-processing; coupling eval logic there mixes "did this run complete" with "is the skill producing good outputs over time" — different questions on different timescales.

### Eval reads both JSON and rendered report

- **Decision:** `/user-test-eval` reads `.user-test-last-run.json` AND the rendered report output.
- **Rationale:** The presentation layer is where actual failures occur. A P1 item technically present in JSON but buried in report formatting is a real failure. Grading JSON alone misses the class of problems that have been the persistent issue.

### Two artifacts: scores in JSON, reasoning in markdown

- **Decision:** `skill-evals.json` for score history; `skill-mutations.md` for proposed changes and accept/reject log.
- **Rationale:** Scores need to be parseable by future runs. Mutation proposals need to be readable and editable by humans. Different purposes, different formats. `skill-mutations.md` becomes the durable research artifact — the "big list of things tried" that is the most underrated output of the whole process.

### Start with exactly 3 binary evals

- **Decision:** 3 evals, not more. Expand only after these are stable.
- **Rationale:** Too many evals invites reward hacking — the agent finding ways to technically pass all checks without improving quality. Three is tight enough to avoid gaming, broad enough to cover three distinct failure layers.

## The Binary Eval Set

### Eval 1: Probe Execution Order (protocol layer)

**Question:** "Did all failing/untested probes in each area execute before broad exploration began?"

- **Grading:** Yes/no per area. Overall FAIL if any area violated.
- **Tests:** Whether the agent followed the probe-first protocol, which exists because probes are the highest-signal checks and broad exploration can mask their results.
- **Known failure mode:** Agent exploring broadly first, then running probes in whatever order, reducing probe signal quality.

### Eval 2: Proven Regression Reasoning (reasoning layer)

**Question:** "Did the report distinguish between 'new bug in Proven area' and 'area no longer meets Proven criteria'?"

- **Grading:** PASS if these are treated as categorically different events. FAIL if all regressions are treated as the same type.
- **Tests:** Whether the agent understood that a Proven area failing is categorically different from a Known-bug area failing — not just a score change but a status change with different implications.
- **Known failure mode:** Agent filing bugs and updating scores without surfacing that a Proven regression is a different class of event. Treating all regressions uniformly.

### Eval 3: P1 Surfacing (presentation layer)

**Question:** "Did every P1 item (active probe failure OR new bug) appear in the NEEDS ACTION section, not only in DETAILS?"

- **Grading:** PASS if every P1 item is in NEEDS ACTION. FAIL if any P1 item appears only in DETAILS.
- **Tests:** Whether the report's summary layer actually surfaces the most important findings, or buries them in structural completeness.
- **Known failure mode:** Structurally correct reports where P1 items exist in the data but don't surface to the section the human actually reads and acts on.

## Artifact Locations

```
tests/user-flows/
  skill-evals.json        # Score history per run
  skill-mutations.md      # Proposed diffs + accept/reject log
```

### skill-evals.json structure

```json
{
  "evals": [
    {
      "run_timestamp": "2026-03-17T14:30:00Z",
      "git_sha": "abc1234",
      "skill_version": "2.51.0",
      "test_file": "resale-clothing.md",
      "results": {
        "probe_execution_order": { "pass": true, "areas_violated": [] },
        "proven_regression_reasoning": { "pass": false, "detail": "Login area regressed from Proven but report filed bug without noting status change" },
        "p1_surfacing": { "pass": true, "p1_count": 2, "surfaced_count": 2 }
      },
      "overall_pass": false,
      "proposed_mutation": "Clarify Phase 4 to require explicit 'Proven → Regressed' status callout when a Proven area scores below pass_threshold"
    }
  ]
}
```

### skill-mutations.md structure

```markdown
# Skill Mutations Log

## Mutation 1 — 2026-03-17

**Triggered by:** Eval 2 failure (Proven regression reasoning)
**Eval scores:** 1/3 pass (probe order: PASS, regression reasoning: FAIL, P1 surfacing: PASS)
**Proposed change:** Add explicit instruction in Phase 4 scoring section: "When a Proven area scores below pass_threshold, the report MUST include a 'Proven Regression' callout distinct from any bug filing. This is a status change, not just a score change."
**Diff:** [specific lines in SKILL.md or reference file]
**Status:** PENDING | ACCEPTED | REJECTED
**Outcome after acceptance:** [filled in after next run]
```

## Scope Boundaries

**In scope:**
- `/user-test-eval` command that grades last run against 3 binary evals
- `skill-evals.json` for score persistence
- `skill-mutations.md` for mutation proposals and history
- One mutation proposal per eval run (not one per failing eval)

**Out of scope (for now):**
- Autonomous mutation (no auto-editing SKILL.md)
- Query-level optimization (comes after skill evals are stable)
- More than 3 evals (expand only when current set is consistently passing)
- Integration with `/user-test-commit` (eval stays independent)

## Open Questions

- Should `/user-test-eval` auto-run after `/user-test-commit`, or stay fully manual? Leaning manual to keep the separation clean, but convenience might win.
- Where exactly do `skill-evals.json` and `skill-mutations.md` live — in `tests/user-flows/` (alongside test files) or in the skill directory itself? The skill directory is plugin-managed; `tests/user-flows/` is project-local.
- When evals are consistently passing (say, 5 consecutive runs all pass), what's the trigger to add a 4th eval or shift to query optimization?

## Next Steps

-> `/workflows:plan` for implementation details (the `/user-test-eval` command, artifact formats, eval logic)
