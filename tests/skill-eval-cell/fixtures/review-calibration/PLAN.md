---
artifact_readiness: implementation-ready
execution: code
---

# Export links

## Goal

Account owners can download their exports without exposing another account's data.

## Decisions

- Downloads require the requesting account to own the export.
- Keep stored exports private. A signed link does not replace the ownership check.
- Use the existing ownership helper before generating a signed link.
- Keep the existing queue's retry policy. This change does not configure retries.
- Retention is unresolved: deleting after 7 days saves storage; retaining for 30 days supports historical downloads. Neither period is approved.

## Implementation

U1 adds signed links to `src/export.js`, using `assertOwner` before signing.
U2 adds the download endpoint. It loads an export by its identifier and signs a link.

## Verification

Test owner download, cross-account rejection, expired links, and missing exports.
The terms "download link" and "export URL" both refer to the same signed URL.
