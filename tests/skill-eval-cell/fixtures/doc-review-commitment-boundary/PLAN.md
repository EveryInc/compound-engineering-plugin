---
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
---
# Shared document access

## Product Contract
Members can share a document with another named member. Owners can revoke a recipient's access. Existing owner-only documents remain private. Reduce the risk of unintended disclosure without expanding the first release.

## Scope
This release adds recipient grants and revocation. Existing membership and sign-in rules remain. A later policy review will decide whether access should also expire automatically; the current release has no expiry commitment.

## Acceptance
A granted recipient can read the document; an ungranted member cannot. Revocation removes access immediately. Access checks run on every read. The project already has a grant table and the authorization helper needed for those checks.
