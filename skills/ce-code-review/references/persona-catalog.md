# Persona Catalog

Reviewer personas organized into a small core plus generic, cross-cutting, and stack-specific conditionals. The orchestrator uses this catalog to select only reviewers whose domain is present in the diff.

## Core and standards gate

Correctness is spawned on every multi-agent review. Project-standards is spawned only when Stage 3b finds at least one applicable standards file, or when standards discovery fails and the review must fail closed.

**Structured persona prompt assets:**

| Persona | Prompt asset | Focus |
|---------|-------|-------|
| `correctness` | `correctness-reviewer` | Logic errors, edge cases, state bugs, error propagation, intent compliance |
| `project-standards` | `project-standards-reviewer` | CLAUDE.md and AGENTS.md compliance -- frontmatter, references, naming, cross-platform portability, tool selection |

## Generic conditional

These lenses are broadly applicable but not automatically useful. Spawn only when their concrete surface is present.

| Persona / asset | Prompt asset | Select when diff touches... |
|---------|-------|-------|
| `testing` | `testing-reviewer` | Test files, test infrastructure, fixtures, mocks, or harness behavior; or meaningful runtime behavior changed without corresponding test work. Behavioral triggers include new or changed branches, state mutation, API/control-flow behavior, and error handling. Production-file presence alone and non-behavioral edits do not select it. |
| `maintainability` | `maintainability-reviewer` | Large or structural work: substantial refactors, new abstractions, file moves, coupling/type-boundary changes, or at least 200 executable changed lines. |
| `agent-native` | `agent-native-reviewer` | Agent-facing features or surfaces: skills, agents, prompts, commands, tools, MCP, or a product capability expected to be agent-accessible. |
| `learnings` | `learnings-researcher` | An existing `<root>/solutions/` corpus has a plausible path/title match for the changed modules or patterns. Run a cheap search first; corpus existence alone does not select it. |

## Conditional (7 personas)

Spawned when the orchestrator identifies relevant patterns in the diff. The orchestrator reads the full diff and reasons about selection -- this is agent judgment, not keyword matching.

| Persona | Agent | Select when diff touches... |
|---------|-------|---------------------------|
| `security` | `security-reviewer` | Auth middleware, public endpoints, user input handling, permission checks, secrets management |
| `performance` | `performance-reviewer` | Concrete performance-sensitive behavior: database/ORM query shape, algorithmic complexity, large loop-heavy transforms, batching/fan-out, or cache policy with material resource impact. Async/concurrent code or a cache data structure alone does not select it when correctness/reliability already own the changed semantics. |
| `api-contract` | `api-contract-reviewer` | An externally consumed boundary changes: route/request/response definitions, serializers, published event schemas, API versioning, or a public package signature with evidenced downstream callers. A new or changed exported symbol inside one module is insufficient by itself. |
| `data-migration` | `data-migration-reviewer` | Migration files, schema dumps (`db/schema.rb`, `structure.sql`), backfill scripts, data transformations — **not** model/query-only changes without migration artifacts |
| `reliability` | `reliability-reviewer` | Error handling, retry logic, circuit breakers, timeouts, background jobs, async handlers, health checks |
| `adversarial` | `adversarial-reviewer` fallback | >=50 changed code lines; auth/payments; persistence writes or event publication; retry/partial-failure or concurrency/ordering semantics; external APIs; or a silent-pass verification mechanism. The lens runs through the independent cross-model peer when a sanctioned peer starts. Spawn this in-process persona only when the peer cannot start. A started peer and the fallback are mutually exclusive. |
| `previous-comments` | `previous-comments-reviewer` | **PR-only AND comment-gated.** Reviewing a PR that has existing review comments or review threads from prior review rounds. Skip entirely when no PR metadata was gathered in Stage 1, OR when Stage 1's `hasPriorComments` flag is false (no `reviews` and no `comments` on the PR). |

## Stack-Specific Conditional (2 personas)

These reviewers cover specialized runtime behavior. Structural and maintainability concerns live in the conditional `maintainability` persona — do not spawn extra stack reviewers for philosophy or convention-only passes.

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

1. **Always spawn correctness.** Spawn project-standards only for a non-empty applicable standards path list; skip it on a successful empty search and fail closed by spawning it when discovery is uncertain.
2. **For each generic conditional**, require its explicit surface. For `testing`, that surface is changed tests/harnesses or concrete meaningful runtime behavior with no corresponding test work; production-file presence alone is insufficient. Absence means skip, not "run just in case."
3. **For each cross-cutting conditional persona**, read the diff and decide whether its domain is relevant. This is a judgment call, not a keyword match.
4. **For each stack-specific conditional persona**, use file types and changed patterns as a starting point, then decide whether the diff actually introduces meaningful work for that reviewer. Do not spawn language-specific reviewers just because one config or generated file happens to match the extension.
5. **For `data-migration`**, spawn only when the diff includes migration or schema artifacts (`db/migrate/*`, `db/schema.rb`, `db/structure.sql`, Alembic/Flyway/Liquibase paths, or explicit backfill/data-transform scripts). Do **not** spawn for model-only or query-only changes without those files.
6. **For CE conditional prompt assets**, use `deployment-verification-agent` when the migration-artifact gate applies and the change is risky (see above).
7. **Announce the team** before spawning with a one-line justification per conditional reviewer selected.
