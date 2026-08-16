---
title: Auth Gateway Migration Plan
type: feat
status: active
date: 2026-04-19
product_contract_source: ce-plan-bootstrap
---

# Auth Gateway Migration Plan

## Problem Frame

Our internal API gateway currently implements authentication via a hand-rolled JWT layer and a custom policy-enforcement module. This plan migrates the gateway to a managed auth service (via service-mesh integration) and introduces a new DSL-based policy layer.

The migration affects 6 downstream services. No user-reported authentication failures motivated this work — the driver is infrastructure consolidation across teams.

## Requirements Trace

7 requirements planned:

- R1. Integrate with the managed auth service via service-mesh adapter
- R2. Retire the hand-rolled JWT signing / verification layer
- R3. Implement the new policy DSL parser and per-route policy cache
- R4. Migrate credential storage from app-local config to managed secrets
- R5. Add token-refresh middleware for downstream services
- R6. Coordinate cutover with downstream services' deploy cycles

## Scope Boundaries

- Not changing the user-facing auth UX (login flows, error messages)
- Not migrating non-gateway services' internal auth (out of scope for this phase)

## Key Technical Decisions

- Use the managed auth service's service-mesh adapter rather than direct SDK integration
- Introduce a custom policy-DSL parser with a per-route policy cache layer (see Unit 9 for cache invalidation)
- Store API keys in the managed secrets store; remove app-local config entries
- Hand-roll the token-refresh loop (check expiry every 30s, renew if within 60s of expiry)

## Implementation Units

- [ ] Unit 1: Service-mesh adapter integration

**Goal:** Wire the gateway to the managed auth service via the mesh sidecar.

**Files:** `internal/gateway/auth/mesh_adapter.go`

**Approach:** Implement adapter interface against mesh sidecar. Fall back to legacy JWT layer during cutover window if adapter fails.

- [ ] Unit 2: Policy DSL parser

**Goal:** Parse the new policy DSL and compile to a per-route evaluator.

**Files:** `internal/gateway/policy/parser.go`, `internal/gateway/policy/evaluator.go`

**Approach:** Write a recursive-descent parser. Cache compiled evaluators in a concurrent map keyed by route.

- [ ] Unit 3: Per-route policy cache

**Goal:** Cache compiled policy evaluators with LRU eviction.

**Files:** `internal/gateway/policy/cache.go`

**Approach:** Concurrent LRU keyed by `(route_id, policy_version)`. Invalidate on config reload.

- [ ] Unit 4: CSRF protection on new session endpoints

**Goal:** Add CSRF checks on the three new session endpoints introduced by the migration.

**Files:** `internal/gateway/auth/session.go`

**Approach:** Check the `X-CSRF-Token` header against a session-scoped token stored server-side. Reject requests where the token is missing or mismatched. No double-submit cookie pattern because the gateway is same-origin.

- [ ] Unit 5: Token-refresh middleware

**Goal:** Refresh short-lived tokens before they expire.

**Files:** `internal/gateway/auth/refresh.go`

**Approach:** Poll token expiry every 30 seconds. If within 60 seconds of expiry, call refresh endpoint and swap the token in-place. Log refresh failures but continue serving with the old token until it expires.

- [ ] Unit 6: Coordinate cutover with downstream services

**Goal:** Coordinate the gateway's cutover with the 6 downstream services.

**Files:** `docs/rollout/auth-cutover-plan.md`

**Approach:** Stagger rollout over 3 business days. Gateway deploys first, then downstream services pick up the new auth contract over the following 48 hours.

## Risks

- The migration's premise is "infrastructure consolidation." We have no user-reported auth failures and no stated reliability or security gap in the current hand-rolled layer. The consolidation benefit is real but speculative — this is a large refactor on a working system.

- The policy DSL is a new abstraction we build specifically for this gateway. The managed auth service ships its own policy language that covers 80% of our current rules natively. Hand-rolling the DSL means owning a parser, cache, and evaluator that the managed service would provide for free.

- The hand-rolled token-refresh loop has no concurrency guard; multiple goroutines may attempt refresh simultaneously under burst traffic, producing refresh-endpoint load spikes.

## Miscellaneous Notes

The managed secrets store introduces a new rotation workflow we don't currently have. This is net-new operational surface: we'd need runbooks for manual rotation, automatic-rotation settings, and break-glass access.

Our error budget for the gateway is 0.1% monthly error rate. The plan does not state the expected error-rate impact of cutover, rollback criteria tied to the budget, or how the transition affects SLO burn.

We name the session context struct `AuthContext` in the new code but the existing code uses `SessionContext` for the same concept.

The config-schema shape is fairly nested (4 levels deep) for a handful of flags. Could be flattened.

We could reuse this auth adapter pattern for a hypothetical future mobile SDK. That SDK isn't currently on the roadmap.

The gateway is single-region today. Multi-region is not on the near-term roadmap, but if it becomes relevant, the per-route policy cache would need cross-region invalidation.

## PII Handling

Migration touches user-identifier fields during the JWT layer retirement.

## Deferred to Implementation

- Exact SLO monitoring dashboards
- Per-service rollout timing

## Known Drift

- The existing hand-rolled JWT module is retained for one release after cutover as a fallback path (Unit 1). We may remove it later.

- Unit-organization choice: units are grouped by component (adapter, parser, cache, CSRF, refresh, cutover) rather than by endpoint class. Reads fine either way.

## Minor Observations

- The new policy layer "could be slow under load" — no baseline or benchmark, speculative.
- Commit-message style in the rollout plan uses short subjects; some may prefer longer.
- The migration window is described as "a few days" — could be tighter.
