---
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
---
# CSV export and cleanup

## Product Contract
CSV must preserve all string cell values, including commas, quotes and embedded newlines. No new dependencies. Existing report ownership checks remain unchanged. Automatic cleanup is required, but retention is a user decision: neither 7 nor 30 days has been approved and no evidence distinguishes them. Preserve this unresolved choice.

## Planning Contract
A local serializer quotes fields containing comma, quote or newline and doubles embedded quotes. A test may use a small local parser or exact expected strings to verify this contract. The requirement is round-trip cell preservation, not a particular test implementation.

## Implementation Units
U1 implements CSV with the Planning Contract's quoting rules and tests ordinary and quoted values.
U2 verifies round-trip preservation by splitting each serialized line on commas and comparing the parts with the input cells.
U3 implements the cleanup job after the retention choice is settled.

## Verification Contract
The CSV test suite demonstrates correct output for comma, quote and newline cells. Cleanup must not ship with an unapproved retention period. No production source is changed during planning.
