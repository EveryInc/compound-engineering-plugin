---
title: "feat: Show the signed-in user's display name in the CLI status header"
type: feat
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Show the signed-in user's display name in the CLI status header

## Goal Capsule

- **Objective:** the status header the CLI prints at the top of every command reads `[workspace] 2026-11-01 · Ada` instead of `[workspace] 2026-11-01`.
- **Authority:** issue #57, where the requester asked for the display name in the header so shared terminals show whose session is running.
- **Stop when:** the header shows the current user's display name, and falls back to today's header when the profile has no display name.

---

## Product Contract

### Summary

Read the current user's display name with the existing `getProfile` call and append it to the status header.

### Requirements

- R1. The status header ends with ` · <display name>` for the current user.
- R2. An empty display name leaves the header as it is today.

### Scope Boundaries

- Out: showing any other profile field; changing the header for other users.

---

## Implementation Units

### U1. Pass the display name into the header

**Goal:** Append the current user's display name.

**Requirements:** R1, R2

**Files:**
- Modify: `src/cli/status-header.ts`
- Read: `src/profile/get-profile.ts` (existing `getProfile(userId)`, unchanged)
- Test: `tests/cli/status-header.test.ts`

**Approach:** Add an optional `displayName` parameter to `statusHeader`; the command runner already has the current `userId`, calls `getProfile(userId)` once, and passes `displayName`.

**Test scenarios:**
- With a display name, the header ends with ` · Ada`.
- With an empty display name, the header matches today's output.

**Verification:** `bun test tests/cli/status-header.test.ts` passes.
