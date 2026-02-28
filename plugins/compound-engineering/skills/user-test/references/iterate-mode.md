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

## Reset Between Runs

Between each iteration, reset by navigating to the app entry URL (full page
reload). This provides a clean starting state for each run.

**CLI mode reset:** If the test file uses `cli_test_command`, iterate simply
re-runs the command (no browser reload needed). If the CLI command has side
effects (database writes, external API calls), each iteration may produce
different results due to accumulated state. Document this in the test file's
area details when relevant.

**Known limitations — not cleared by page reload:**
- IndexedDB data
- Service worker caches
- HttpOnly cookies

Document these limitations when they affect test results. If an app relies
heavily on these storage mechanisms, note it in the test file's area details.

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

Results are not committed automatically. Use `/user-test-commit` to apply.

### Example Output

```
## Iterate Results: checkout.md (3 of 3 runs completed)

| Area | Run 1 | Run 2 | Run 3 | Avg | Variance | Avg Time | Time Var |
|------|-------|-------|-------|-----|----------|----------|----------|
| cart-validation | 4 | 4 | 5 | 4.3 | 0.3 | 9s | 2s |
| shipping-form | 3 | 4 | 4 | 3.7 | 0.3 | 14s | 5s |
| payment-submission | 4 | 4 | 4 | 4.0 | 0.0 | 11s | 1s |

Delta vs. previous run: +0.3 (baseline: 3.7)

Maturity transitions (pending /user-test-commit):
- cart-validation: Uncharted -> Proven (3 consecutive passes >= 4)
- shipping-form: stays Uncharted (inconsistent scores)
- payment-submission: Uncharted -> Proven (3 consecutive passes >= 4)
```
