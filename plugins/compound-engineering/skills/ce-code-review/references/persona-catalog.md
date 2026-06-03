# Persona Catalog

14 reviewer personas organized into always-on, cross-cutting conditional, and stack-specific conditional layers, plus CE-specific agents. The orchestrator uses this catalog to select which reviewers to spawn for each review.

## Always-on (4 personas + 2 CE agents)

Spawned on every review regardless of diff content.

**Persona agents (structured JSON output):**

| Persona | Agent | Focus |
|---------|-------|-------|
| `correctness` | `ce-correctness-reviewer` | Logic errors, edge cases, state bugs, error propagation, intent compliance |
| `testing` | `ce-testing-reviewer` | Coverage gaps, weak assertions, brittle tests, missing edge case tests |
| `maintainability` | `ce-maintainability-reviewer` | Structural quality, complexity deletion, 1k-line regressions, coupling, type-boundary leaks, dead code, premature abstraction |
| `project-standards` | `ce-project-standards-reviewer` | CLAUDE.md and AGENTS.md compliance -- frontmatter, references, naming, cross-platform portability, tool selection |

**CE agents (unstructured output, synthesized separately):**

| Agent | Focus |
|-------|-------|
| `ce-agent-native-reviewer` | Verify new features are agent-accessible |
| `ce-learnings-researcher` | Search docs/solutions/ for past issues related to this PR's modules and patterns |

## Conditional (7 personas)

Spawned when the orchestrator identifies relevant patterns in the diff. The orchestrator reads the full diff and reasons about selection -- this is agent judgment, not keyword matching.

| Persona | Agent | Select when diff touches... |
|---------|-------|---------------------------|
| `security` | `ce-security-reviewer` | Auth middleware, public endpoints, user input handling, permission checks, secrets management |
| `performance` | `ce-performance-reviewer` | Database queries, ORM calls, loop-heavy data transforms, caching layers, async/concurrent code |
| `api-contract` | `ce-api-contract-reviewer` | Route definitions, serializer/interface changes, event schemas, exported type signatures, API versioning |
| `data-migration` | `ce-data-migration-reviewer` | Migration files, schema dumps (`db/schema.rb`, `structure.sql`), backfill scripts, data transformations — **not** model/query-only changes without migration artifacts |
| `reliability` | `ce-reliability-reviewer` | Error handling, retry logic, circuit breakers, timeouts, background jobs, async handlers, health checks |
| `adversarial` | `ce-adversarial-reviewer` | Diff has >=50 changed non-test, non-generated, non-lockfile lines, OR touches auth, payments, data mutations, external API integrations, or other high-risk domains |
| `previous-comments` | `ce-previous-comments-reviewer` | **PR-only AND comment-gated.** Reviewing a PR that has existing review comments or review threads from prior review rounds. Skip entirely when no PR metadata was gathered in Stage 1, OR when Stage 1's `hasPriorComments` flag is false (no `reviews` and no `comments` on the PR). |

## Stack-Specific Conditional (2 personas)

These reviewers cover runtime behavior the always-on personas do not specialize in. Structural and maintainability concerns live in the always-on `maintainability` persona — do not spawn extra stack reviewers for philosophy or convention-only passes.

| Persona | Agent | Select when diff touches... |
|---------|-------|---------------------------|
| `julik-frontend-races` | `ce-julik-frontend-races-reviewer` | Stimulus/Turbo controllers, DOM event wiring, timers, async UI flows, animations, or frontend state transitions with race potential |
| `swift-ios` | `ce-swift-ios-reviewer` | Swift files, SwiftUI views, UIKit controllers, `.entitlements`, `PrivacyInfo.xcprivacy`, `.xcdatamodeld`, `Package.swift`, `Package.resolved`, storyboards, XIBs, or semantic build-setting / target-membership / code-signing changes in `.pbxproj` |

## CE Conditional Agents (migration-specific)

Spawn `ce-deployment-verification-agent` when the migration-artifact gate applies **and** the change is risky (destructive DDL, backfills, NOT NULL without default, column renames/drops). Schema drift and migration safety live in the `data-migration` persona — not separate CE agents.

| Agent | Focus |
|-------|-------|
| `ce-deployment-verification-agent` | Probes live prod state for already-applied migrations, then produces a state-aware Go/No-Go deployment checklist (pristine / partial-prior / already-applied) with SQL verification queries and rollback procedures |

## CE Conditional Agents (frontend-bundle-specific)

| Agent | Focus |
|-------|-------|
| `ce-frontend-build-verifier` | Runs the project's production frontend build (`pnpm next build` / `pnpm vite build` / etc.) and surfaces compile failures that `tsc --noEmit` cannot catch — React Server Component / `"use client"` boundary violations, missing Suspense around `useSearchParams`, prerender errors, bad framework config. Every reported error is a P0 merge-block. |

## Selection rules

1. **Always spawn all 4 always-on personas** plus the 2 CE always-on agents.
2. **For each cross-cutting conditional persona**, the orchestrator reads the diff and decides whether the persona's domain is relevant. This is a judgment call, not a keyword match.
3. **For each stack-specific conditional persona**, use file types and changed patterns as a starting point, then decide whether the diff actually introduces meaningful work for that reviewer. Do not spawn language-specific reviewers just because one config or generated file happens to match the extension.
4. **For `data-migration`**, spawn only when the diff includes migration or schema artifacts (`db/migrate/*`, `db/schema.rb`, `db/structure.sql`, Alembic/Flyway/Liquibase paths, `**/prisma/migrations/*/`, or explicit backfill/data-transform scripts). Do **not** spawn for model-only or query-only changes without those files.
5. **For `ce-deployment-verification-agent`**, spawn when the migration-artifact gate from rule 4 applies and the change is risky (destructive DDL, backfills, NOT NULL without default, column renames/drops). The agent runs a read-only Stage 0 probe against the live migration tracking table before generating the checklist, then renders a state-aware Go/No-Go.
6. **For `ce-frontend-build-verifier`**, spawn when the diff touches files that participate in a production frontend bundle: Next.js App Router pages (`**/app/**/*.tsx`), components reachable from the bundle (`**/components/**`, `**/pages/**`), framework config (`next.config.*`, `vite.config.*`, etc.), or the frontend `package.json` `dependencies` / `scripts`. The agent runs the actual prod build, so it costs 1–5 min wall-clock — worth it for any UI-touching PR, skip for server-only / mobile-only / docs-only diffs.
7. **Announce the team** before spawning with a one-line justification per conditional reviewer selected.
