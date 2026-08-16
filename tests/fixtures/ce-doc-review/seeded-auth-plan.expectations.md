# Expectations — seeded-auth-plan.md

Answer key for this fixture. Never referenced from the fixture body; the fixture
must read as an ordinary plan to any reviewer.

This fixture carries two distinct premise roots. ROOT A is "is migration to
managed auth justified?"; ROOT B is "is the custom policy-enforcement layer
warranted?". Neither subsumes the other. Synthesis should elevate BOTH roots and
attach each dependent to the root whose fix moots it; three further manual
findings are independent of both roots and must not be chained.

| # | Section | Planted issue | Expected class |
|---|---|---|---|
| 1 | Requirements Trace | Header says "7 requirements planned" but only R1-R6 are listed | safe_auto |
| 2 | Key Technical Decisions | Cross-reference points at "Unit 9" but the plan only defines Units 1-6 | safe_auto |
| 3 | Key Technical Decisions / Units 4-6 | "API key", "token", "credential", and "secret" are used interchangeably for one concept | safe_auto |
| 4 | Unit 4: CSRF protection | CSRF check is hand-rolled although the gateway framework ships CSRF middleware with rotation, HMAC signing, and an Origin check the hand-rolled version omits | gated_auto |
| 5 | Unit 5: Token-refresh middleware | Refresh loop is hand-rolled although the auth-service client library ships refresh middleware with backoff, duplicate-refresh guards, and fail-closed semantics | gated_auto |
| 6 | Unit 6: Coordinate cutover | No deployment-ordering guarantee between the gateway's secrets migration and downstream services' config reload | gated_auto |
| 7 | Risks | ROOT A — large migration of a working system with no user-reported failure and only a speculative consolidation benefit | manual |
| 8 | Risks | ROOT B — custom policy DSL is built although the managed service ships a policy language covering 80% of current rules | manual |
| 9 | Unit 1: Service-mesh adapter | Dependent of ROOT A — the adapter and its legacy-JWT fallback exist only because the migration is happening | manual |
| 10 | Miscellaneous Notes | Dependent of ROOT A — the managed secrets store adds a net-new rotation workflow, runbooks, and break-glass surface | manual |
| 11 | Unit 2: Policy DSL parser | Dependent of ROOT B — the recursive-descent parser exists solely to support the custom policy layer | manual |
| 12 | Unit 3: Per-route policy cache | Dependent of ROOT B — the LRU cache design only matters if the custom policy layer is built | manual |
| 13 | Risks | Independent of both roots — refresh loop has no concurrency guard, so burst traffic can stampede the refresh endpoint | manual |
| 14 | Miscellaneous Notes | Independent of both roots — no expected error-rate impact, rollback criteria, or SLO-burn accounting against the 0.1% error budget | manual |
| 15 | PII Handling | Independent of both roots — migration touches user-identifier fields with no stated PII handling for the migration window | manual |
| 16 | Miscellaneous Notes | New code names the struct `AuthContext` while existing code calls the same concept `SessionContext` | FYI |
| 17 | Miscellaneous Notes | Config schema is nested 4 levels deep for a handful of flags | FYI |
| 18 | Miscellaneous Notes | Speculative reuse of the adapter pattern for a mobile SDK that is not on the roadmap | FYI |
| 19 | Known Drift | Hand-rolled JWT module retained one release post-cutover with no concrete removal plan | FYI |
| 20 | Known Drift | Units grouped by component rather than by endpoint class — a stated preference either way | FYI |
| 21 | Miscellaneous Notes | Multi-region cache invalidation concern for a single-region deployment not on the roadmap | drop |
| 22 | Minor Observations | "Could be slow under load" with no baseline or benchmark | drop |
| 23 | Minor Observations | Nitpick about commit-message subject length in the rollout plan | drop |
| 24 | Minor Observations | "A few days" migration window described as could-be-tighter, with no consequence | drop |
