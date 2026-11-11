---
artifact_readiness: implementation-ready
execution: code
---
# Add signed export downloads

## Goal Capsule
Deliver a download endpoint for existing private exports. Preserve account isolation and existing JSON behavior. No new dependencies or storage policy.

## Product Contract
Only the owning account can obtain a signed URL. Missing records return 404; other accounts receive 403. Inputs are validated by the existing request adapter. Retention is not part of this endpoint change: neither 7 nor 30 days is approved.

## Planning Contract
Reuse assertOwner and the existing injected signing function. Keep the small function-based service design. Preserve the existing JSON export path. No retry, provider hierarchy, cleanup job, or new persistence.

## Implementation Units
U1 adds downloadLink in src/endpoint.js and tests it in endpoint.test.js. Load the requested export, enforce the Product Contract, and return its signed URL. The implementation and tests in the staged files belong to this request.

## Verification Contract
Run node --test. Verify the owning account gets the URL, another account cannot cause a link to be signed, a missing record returns 404, and JSON behavior is unchanged.

## Definition of Done
The endpoint satisfies the Product Contract, tests pass, review findings are resolved within scope, and no retention choice was made. This run stops at local completion; do not commit, publish, or create tickets.
