# Report Sections

Use this section contract for the final Zed report.

## Coverage

- base ref
- files changed
- untracked files excluded (if any)

## Findings

| ID | Severity | Confidence | File | Description |
|----|----------|------------|------|-------------|
| F1 | P0 | 85 | auth/login.ts | missing CSRF token on state change |
| F2 | P1 | 72 | db/query.ts | N+1 in user fetch loop |

## Actionable Findings

List only findings that require action.

## Testing Gaps

List missing test coverage for the diff.

## Residual Risks

Call out risks accepted intentionally.

## Verdict

- Ready / Needs work / Blocked
