# Persona Catalog

13 reviewer personas organized into always-on, cross-cutting conditional, and stack-specific conditional layers, plus CE-specific local prompt assets. The orchestrator uses this catalog to select which reviewers to spawn for each review.

## Always-on (4 structured personas + 2 local prompt assets)

Spawned on every review regardless of diff content.

**Structured persona prompt assets:**

| Persona | Prompt asset | Focus |
|---------|-------|-------|
| `correctness` | `correctness-reviewer` | Logic errors, edge cases, state bugs, error propagation, intent compliance |
| `testing` | `testing-reviewer` | Coverage gaps, weak assertions, brittle tests, missing edge case tests |
| `maintainability` | `maintainability-reviewer` | Structural quality, complexity deletion, 1k-line regressions, coupling, type-boundary leaks, dead code, premature abstraction |
| `project-standards` | `project-standards-reviewer` | CLAUDE.md and AGENTS.md compliance -- frontmatter, references, naming, cross-platform portability, tool selection |

**CE local prompt assets (unstructured output, synthesized separately):**

| Prompt asset | Focus |
|-------|-------|
| `agent-native-reviewer` | Verify new features are agent-accessible |
| `learnings-researcher` | Search docs/solutions/ for past issues related to this PR's modules and patterns |

## Conditional (7 personas)

Spawned when the orchestrator identifies relevant patterns in the diff. The orchestrator reads the full diff and reasons about selection -- this is agent judgment, not keyword matching.

| Persona | Agent | Select when diff touches... |
|---------|-------|---------------------------|
| `security` | `security-reviewer` | Auth middleware, public endpoints, user input handling, permission checks, secrets management |
| `performance` | `performance-reviewer` | Database queries, ORM calls, loop-heavy data transforms, caching layers, async/concurrent code |
| `api-contract` | `api-contract-reviewer` | Route definitions, serializer/interface changes, event schemas, exported type signatures, API versioning |
| `data-migration` | `data-migration-reviewer` | Migration files, schema dumps (`db/schema.rb`, `structure.sql`), backfill scripts, data transformations — **not** model/query-only changes without migration artifacts |
| `reliability` | `reliability-reviewer` | Error handling, retry logic, circuit breakers, timeouts, background jobs, async handlers, health checks |
| `adversarial` | `adversarial-reviewer` | Diff has >=50 changed non-test, non-generated, non-lockfile lines, OR touches auth, payments, data mutations, external API integrations, or other high-risk domains, OR adds/modifies a **silent-pass verification mechanism** — a guard whose failure mode is going green while the real thing is red: CI/CD gating logic, merge-blocking checks, build/deploy steps, coverage/lint gates, or test infrastructure/mocks that could mask production. This trigger fires on the *mechanism* independent of line count and the auth/data heuristics. Scope guard: it does **not** fire on ordinary per-feature test assertions — a unit test asserting business logic is `testing`'s job — only on gating/CI/build/deploy/harness changes |
| `previous-comments` | `previous-comments-reviewer` | **PR-only AND comment-gated.** Reviewing a PR that has existing review comments or review threads from prior review rounds. Skip entirely when no PR metadata was gathered in Stage 1, OR when Stage 1's `hasPriorComments` flag is false (no `reviews` and no `comments` on the PR). |

## Stack-Specific Conditional (2 personas)

These reviewers cover runtime behavior the always-on personas do not specialize in. Structural and maintainability concerns live in the always-on `maintainability` persona — do not spawn extra stack reviewers for philosophy or convention-only passes.

| Persona | Agent | Select when diff touches... |
|---------|-------|---------------------------|
| `julik-frontend-races` | `julik-frontend-races-reviewer` | Stimulus/Turbo controllers, DOM event wiring, timers, async UI flows, animations, or frontend state transitions with race potential |
| `swift-ios` | `swift-ios-reviewer` | Swift files, SwiftUI views, UIKit controllers, `.entitlements`, `PrivacyInfo.xcprivacy`, `.xcdatamodeld`, `Package.swift`, `Package.resolved`, storyboards, XIBs, or semantic build-setting / target-membership / code-signing changes in `.pbxproj` |

## CE Conditional Local Prompt Assets (migration-specific)

Use `deployment-verification-agent` when the migration-artifact gate applies **and** the change is risky (destructive DDL, backfills, NOT NULL without default, column renames/drops). Schema drift and migration safety live in the `data-migration` persona — not a separate typed agent.

| Prompt asset | Focus |
|-------|-------|
| `deployment-verification-agent` | Go/No-Go deployment checklist with SQL verification queries and rollback procedures |

## Selection rules

1. **Always spawn all 4 always-on personas** plus the 2 CE always-on local prompt assets.
2. **For each cross-cutting conditional persona**, the orchestrator reads the diff and decides whether the persona's domain is relevant. This is a judgment call, not a keyword match.
3. **For each stack-specific conditional persona**, use file types and changed patterns as a starting point, then decide whether the diff actually introduces meaningful work for that reviewer. Do not spawn language-specific reviewers just because one config or generated file happens to match the extension.
4. **For `data-migration`**, spawn only when the diff includes migration or schema artifacts (`db/migrate/*`, `db/schema.rb`, `db/structure.sql`, Alembic/Flyway/Liquibase paths, or explicit backfill/data-transform scripts). Do **not** spawn for model-only or query-only changes without those files.
5. **For CE conditional prompt assets**, use `deployment-verification-agent` when the migration-artifact gate applies and the change is risky (see above).
6. **Announce the team** before spawning with a one-line justification per conditional reviewer selected.
