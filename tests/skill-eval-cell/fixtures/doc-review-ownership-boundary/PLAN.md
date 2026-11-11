# Export downloads and cleanup

## Required outcome

Account owners can download their exports without exposing another account's data. Automatic deletion of stored exports is required in this change.

## Decisions

- Downloads require the requesting account to own the export before signing.
- Preserve existing authorization behavior. Use project conventions for implementation choices.
- Retention is unresolved: deleting after 7 days saves storage; retaining for 30 days supports historical downloads. Neither period is approved and no customer commitment or budget ceiling selects one.

## Implementation

U1 implements the endpoint in src/endpoint.js. The shared helper in src/export.js is already used elsewhere; the endpoint duplicates its condition.
U2 deletes expired exports automatically using the retention period selected for this feature.

## Verification

Test owner download, cross-account rejection, expired links, missing exports, and automatic deletion at the selected retention boundary.
