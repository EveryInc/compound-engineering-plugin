---
title: Seeded Test Fixture — Auth Gateway Migration Plan
type: feat
status: active
date: 2026-04-19
---

<!--
This is a SEEDED TEST FIXTURE for ce-doc-review pipeline validation.
Second fixture alongside seeded-plan.md. Different domain (auth migration)
and different premise shape (security/reliability rather than naming)
so the pipeline can be measured against a second set of known
classifications.

Seed map (run this plan through ce-doc-review to verify):

- safe_auto candidates (3):
    - wrong count (Requirements Trace says 7 requirements, list has 6)
    - terminology drift (uses "token", "credential", "secret"
      interchangeably for the same API-key concept)
    - stale cross-reference (see-Unit-9 but only Units 1-6 exist)

- gated_auto candidates (3):
    - missing CSRF protection on the new session endpoints — the
      framework (OAuth2-Proxy) has a built-in option; the plan rolls
      its own partial check
    - deployment-ordering guarantee missing between gateway rollout
      and downstream service updates
    - framework-native-API substitution (plan describes hand-rolled
      token-refresh loop; the library ships refresh middleware)

- manual candidates with TWO valid premise roots (intentional — tests
  multi-root behavior):
    - ROOT A: "Is migration to managed auth justified?" (top-level
      premise) with dependents:
        - Service-mesh integration layer complexity
        - New secrets-rotation workflow scope
        - Rollout of token-refresh middleware
    - ROOT B: "Is the custom policy-enforcement layer warranted?"
      (narrower premise about a specific sub-component) with
      dependents:
        - Policy-DSL parser abstraction
        - Per-route policy cache design

  Expected synthesis: elevates BOTH roots; dependents assign to
  whichever root's fix most directly moots them. If the synthesizer
  picks only one root, the other's dependents strand as top-level
  manual findings — that's the regression we're watching for.

- manual candidates independent of either root (3, should NOT link):
    - SLO / error-budget commitment missing — operational gap that
      exists regardless of which auth path is chosen
    - Session-timeout cross-tab coordination not specified —
      behavior concern that applies under both migration and
      status-quo paths
    - PII handling during migration window unstated — compliance
      gap independent of premise

- FYI candidates (4, confidence 0.40-0.65 at P3):
    - naming preference ("AuthContext" vs "SessionContext" — both
      legible in the code)
    - speculative future-work concern (could reuse this for a
      hypothetical mobile SDK that isn't on the roadmap)
    - subjective readability note about the config schema shape
    - unit-organization preference (could group by route rather
      than by endpoint class — current split also reads fine)

- drop-worthy P3s (3, confidence 0.55-0.74):
    - vague performance concern without baseline ("could be slow
      under load")
    - theoretical multi-region concern not relevant to single-region
      deployment
    - nitpick about commit-message style in the rollout plan

The fixture includes multiple premise challenges at DIFFERENT scopes
to exercise the multi-root synthesis path. Unlike the rename-shape
fixture, the root candidates here are genuinely distinct (managed-auth
migration vs. custom policy layer) — neither subsumes the other.
-->

# Seeded Auth Gateway Migration Plan

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

(Only 6 items listed despite "7 requirements" — seeded wrong-count
safe_auto candidate.)

## Scope Boundaries

- Not changing the user-facing auth UX (login flows, error messages)
- Not migrating non-gateway services' internal auth (out of scope for this phase)

## Key Technical Decisions

- Use the managed auth service's service-mesh adapter rather than direct SDK integration
- Introduce a custom policy-DSL parser with a per-route policy cache layer (see Unit 9 for cache invalidation — seeded stale cross-reference; Unit 9 does not exist in this plan)
- Store API keys in the managed secrets store; remove app-local config entries
- Hand-roll the token-refresh loop (check expiry every 30s, renew if within 60s of expiry)

(Uses "API key", "token", "credential", and "secret" interchangeably
throughout — seeded terminology drift safe_auto candidate.)

## Implementation Units

- [ ] Unit 1: Service-mesh adapter integration

**Goal:** Wire the gateway to the managed auth service via the mesh sidecar.

**Files:** `internal/gateway/auth/mesh_adapter.go`

**Approach:** Implement adapter interface against mesh sidecar. Fall back to legacy JWT layer during cutover window if adapter fails. (Seeded manual dependent of ROOT A: this complexity exists only because the migration is happening; if the migration premise is rejected, the adapter layer is unnecessary.)

- [ ] Unit 2: Policy DSL parser

**Goal:** Parse the new policy DSL and compile to a per-route evaluator.

**Files:** `internal/gateway/policy/parser.go`, `internal/gateway/policy/evaluator.go`

**Approach:** Write a recursive-descent parser. Cache compiled evaluators in a concurrent map keyed by route. (Seeded manual dependent of ROOT B: the parser exists solely to support the custom policy layer; if the custom policy-layer premise is rejected in favor of the managed service's native policy language, the parser is dead code.)

- [ ] Unit 3: Per-route policy cache

**Goal:** Cache compiled policy evaluators with LRU eviction.

**Files:** `internal/gateway/policy/cache.go`

**Approach:** Concurrent LRU keyed by `(route_id, policy_version)`. Invalidate on config reload.

(Seeded manual dependent of ROOT B: cache design only matters if the custom policy layer exists.)

- [ ] Unit 4: CSRF protection on new session endpoints

**Goal:** Add CSRF checks on the three new session endpoints introduced by the migration.

**Files:** `internal/gateway/auth/session.go`

**Approach:** Check the `X-CSRF-Token` header against a session-scoped token stored server-side. Reject requests where the token is missing or mismatched. No double-submit cookie pattern because the gateway is same-origin.

(Seeded gated_auto: OAuth2-Proxy ships a built-in CSRF middleware that handles this uniformly — including rotation and HMAC signing — which the hand-rolled version lacks. The hand-rolled check also omits the Origin header check that OAuth2-Proxy's default includes.)

- [ ] Unit 5: Token-refresh middleware

**Goal:** Refresh short-lived tokens before they expire.

**Files:** `internal/gateway/auth/refresh.go`

**Approach:** Poll token expiry every 30 seconds. If within 60 seconds of expiry, call refresh endpoint and swap the token in-place. Log refresh failures but continue serving with the old token until it expires.

(Seeded gated_auto: the auth-service client library ships a refresh middleware that handles this uniformly — including backoff, concurrency guards against duplicate-refresh stampedes, and fail-closed semantics on refresh failure. The hand-rolled version is missing the concurrency guard and the fail-closed branch.)

- [ ] Unit 6: Coordinate cutover with downstream services

**Goal:** Coordinate the gateway's cutover with the 6 downstream services.

**Files:** `docs/rollout/auth-cutover-plan.md`

**Approach:** Stagger rollout over 3 business days. Gateway deploys first, then downstream services pick up the new auth contract over the following 48 hours.

(Seeded gated_auto: no explicit deployment-ordering guarantee between the gateway's secrets-migration step and the downstream services' config reload — if the secrets migration lands before downstream services reload, they fail auth against the new store; if after, the gateway has no credentials for the window between its deploy and the migration. A dual-read or versioned-secrets pattern would close this.)

## Risks

- The migration's premise is "infrastructure consolidation." We have no user-reported auth failures and no stated reliability or security gap in the current hand-rolled layer. The consolidation benefit is real but speculative — this is a large refactor on a working system. (Seeded manual — ROOT A premise challenge: "Is migration to managed auth justified given no user-facing problem motivates it?")

- The policy DSL is a new abstraction we build specifically for this gateway. The managed auth service ships its own policy language that covers 80% of our current rules natively. Hand-rolling the DSL means owning a parser, cache, and evaluator that the managed service would provide for free. (Seeded manual — ROOT B premise challenge: "Is the custom policy-enforcement layer warranted when the managed service ships one?")

- The hand-rolled token-refresh loop has no concurrency guard; multiple goroutines may attempt refresh simultaneously under burst traffic, producing refresh-endpoint load spikes. (Seeded manual, independent of roots: this is an operational concern that exists regardless of which auth path is chosen.)

## Miscellaneous Notes

The managed secrets store introduces a new rotation workflow we don't currently have. This is net-new operational surface: we'd need runbooks for manual rotation, automatic-rotation settings, and break-glass access. (Seeded manual dependent of ROOT A: this workflow only exists because of the migration; if the migration is rejected, the rotation surface stays as-is.)

Our error budget for the gateway is 0.1% monthly error rate. The plan does not state the expected error-rate impact of cutover, rollback criteria tied to the budget, or how the transition affects SLO burn. (Seeded manual independent of roots: operational obligation regardless of premise.)

We name the session context struct `AuthContext` in the new code but the existing code uses `SessionContext` for the same concept. (Seeded FYI: naming preference — both are legible, no wrong answer.)

The config-schema shape is fairly nested (4 levels deep) for a handful of flags. Could be flattened. (Seeded FYI: subjective readability note about schema shape.)

We could reuse this auth adapter pattern for a hypothetical future mobile SDK. That SDK isn't currently on the roadmap. (Seeded FYI: speculative future-work concern with no current signal.)

The gateway is single-region today. Multi-region is not on the near-term roadmap, but if it becomes relevant, the per-route policy cache would need cross-region invalidation. (Seeded drop: theoretical multi-region concern not relevant to current deployment, P3.)

## PII Handling

Migration touches user-identifier fields during the JWT layer retirement. (Seeded manual independent of roots: PII compliance gap that applies during the migration window regardless of which premise holds; even if both premises are accepted, the migration itself needs explicit PII-handling guidance.)

## Deferred to Implementation

- Exact SLO monitoring dashboards
- Per-service rollout timing

## Known Drift

- The existing hand-rolled JWT module is retained for one release after cutover as a fallback path (Unit 1). We may remove it later. (Seeded FYI: drift note without concrete action, low-stakes.)

- Unit-organization choice: units are grouped by component (adapter, parser, cache, CSRF, refresh, cutover) rather than by endpoint class. Reads fine either way. (Seeded FYI: unit-organization preference, no wrong answer.)

## Low-Signal Residuals (Seeded Drop-Worthy P3s)

- The new policy layer "could be slow under load" — no baseline or benchmark, speculative. (Seeded drop: vague performance concern without evidence, P3.)
- Commit-message style in the rollout plan uses short subjects; some may prefer longer. (Seeded drop: nitpick about commit-message convention, P3.)
- The migration window is described as "a few days" — could be tighter. (Seeded drop: vague-phrasing preference at P3 with no consequence.)
