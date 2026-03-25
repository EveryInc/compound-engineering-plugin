# Iterate Mode

Run the same test scenario N times to measure consistency and build confidence
in maturity promotions.

## Invocation

```
/user-test-iterate tests/user-flows/checkout.md 5
```

Arguments: `<scenario-file> <N>`

## Constraints

- **N must be >= 1.** N=0 is an error.
- **N is capped at 10** by default. Higher values consume significant tokens.
- **N=1 is valid** — runs once with consistency tracking output format.

## Per-Run Flow

Each iteration follows this sequence:

1. **CLI queries (Phase 2.5):** If `cli_test_command` is present, run ALL `cli_queries` first. Score each. Apply precheck gates.
2. **Browser reset:** Navigate to app entry URL (full page reload) for clean state.
3. **Browser areas (Phase 3):** Test browser areas, skipping any gated by CLI precheck failures.
4. **Score (Phase 4):** Score all areas for this run.

**CLI-only mode:** If all areas have `prechecks` tags and CLI covers everything, skip steps 2-3 entirely — no browser needed for that run.

**CLI command with side effects:** If the CLI command writes to a database or calls external APIs, each iteration may produce different results due to accumulated state. Document this in the test file's area details when relevant.

**Known limitations — not cleared by page reload:**
- IndexedDB data
- Service worker caches
- HttpOnly cookies

Document these limitations when they affect test results. If an app relies
heavily on these storage mechanisms, note it in the test file's area details.

### Incremental Context Loading (Run 2+)

After run 1, the skill has all reference files in context. For runs 2+:

- Do NOT re-read reference files (SKILL.md, probes.md, etc.)
- Do NOT re-read the full test file
- DO re-read: `.user-test-last-run.json` (inter-run probe state + [progressive narrowing](./run-targeting.md) classification)
- DO re-read: area details for FULL-classified areas only (Queries tables, verify blocks needed for execution)

Order: read JSON → compute retest classification → load details for non-SKIP areas just-in-time before execution.

This reduces Phase 1 from ~3 minutes to ~1 minute for run 2+.

## Partial Run Handling

If a disconnect occurs mid-iterate (e.g., on run 3 of 5):
- Write results for completed runs (runs 1-2)
- Report "Completed 2 of 5 runs"
- Partial results are valid — maturity updates apply to completed runs only
- Do NOT produce committable output for incomplete runs

## Output Format

Iterate mode produces:
1. **Per-run scores table** — each run's per-area scores and timing
2. **Aggregate consistency metrics** — score variance, timing variance, min/max/avg per area
3. **Maturity transitions** — which areas would promote/demote based on results

**Timing variance** is reported alongside score variance. A consistent 28s is
acceptable; wild swings between 5s and 45s indicate flakiness worth investigating.

**Delta computation:** Delta is computed between the iterate session's aggregate
and the previous non-iterate run. Per-iteration deltas within a session are NOT
computed (they are noise, not signal).

After the final run completes, **automatically proceed to Commit Mode** — same as a normal `/user-test` run. This persists `git_sha`, maturity updates, probes, and history. Commit uses the aggregate scores (not individual run scores). The user can pass `--no-commit` to skip and run `/user-test-commit` manually later.

### Example Output

Per-run table first, then dispatch summary (same format as normal `/user-test`):

```
## Iterate Results: checkout.md (3 of 3 runs completed)

| Area | Run 1 | Run 2 | Run 3 | Avg | Variance | Avg Time | Time Var |
|------|-------|-------|-------|-----|----------|----------|----------|
| cart-validation | 4 | 4 | 5 | 4.3 | 0.3 | 9s | 2s |
| shipping-form | 3 | 4 | 4 | 3.7 | 0.3 | 14s | 5s |
| payment-submission | 4 | 4 | 4 | 4.0 | 0.0 | 11s | 1s |

SESSION SUMMARY: checkout  [2026-03-01 · iterate x 3]
UX 4.0 | Quality — | 3 areas | 1 need action

NEEDS ACTION (1)
  ⚠ shipping-form inconsistent (3,4,4) — not promoting

IMPROVED (1)
  cart-validation  3→4.3  Consistent across 3 runs

STABLE (1)
  payment-submission

EXPLORE NEXT RUN
  P1  shipping-form  Browser  Inconsistent — push edge cases

Demo: PARTIAL (shipping-form inconsistent)
```
