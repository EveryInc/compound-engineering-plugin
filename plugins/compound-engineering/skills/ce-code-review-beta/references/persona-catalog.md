# Persona Catalog

18 reviewer personas organized into always-on, cross-cutting conditional, and stack-specific conditional layers, plus CE-specific agents. The orchestrator uses this catalog to select which reviewers to spawn for each review.

## Always-on (4 personas + 2 CE agents)

Spawned on every review regardless of diff content.

**Persona agents (structured JSON output):**

| Persona | Agent | Lane | Focus |
|---------|-------|------|-------|
| `correctness` | `ce-correctness-reviewer` | Local (high-stakes) | Logic errors, edge cases, state bugs, error propagation, intent compliance |
| `testing` | `ce-testing-reviewer` | Delegation-eligible | Coverage gaps, weak assertions, brittle tests, missing edge case tests |
| `maintainability` | `ce-maintainability-reviewer` | Delegation-eligible | Coupling, complexity, naming, dead code, premature abstraction |
| `project-standards` | `ce-project-standards-reviewer` | Delegation-eligible | CLAUDE.md and AGENTS.md compliance -- frontmatter, references, naming, cross-platform portability, tool selection |

**CE agents (unstructured output, synthesized separately):**

| Agent | Lane | Focus |
|-------|------|-------|
| `ce-agent-native-reviewer` | Local (unstructured) | Verify new features are agent-accessible |
| `ce-learnings-researcher` | Local (unstructured) | Search docs/solutions/ for past issues related to this PR's modules and patterns |

## Conditional (7 personas)

Spawned when the orchestrator identifies relevant patterns in the diff. The orchestrator reads the full diff and reasons about selection -- this is agent judgment, not keyword matching.

| Persona | Agent | Lane | Select when diff touches... |
|---------|-------|------|---------------------------|
| `security` | `ce-security-reviewer` | Local (high-stakes) | Auth middleware, public endpoints, user input handling, permission checks, secrets management |
| `performance` | `ce-performance-reviewer` | Delegation-eligible | Database queries, ORM calls, loop-heavy data transforms, caching layers, async/concurrent code |
| `api-contract` | `ce-api-contract-reviewer` | Delegation-eligible | Route definitions, serializer/interface changes, event schemas, exported type signatures, API versioning |
| `data-migrations` | `ce-data-migrations-reviewer` | Delegation-eligible | Migration files, schema changes, backfill scripts, data transformations |
| `reliability` | `ce-reliability-reviewer` | Delegation-eligible | Error handling, retry logic, circuit breakers, timeouts, background jobs, async handlers, health checks |
| `adversarial` | `ce-adversarial-reviewer` | Local (high-stakes) | Diff has >=50 changed non-test, non-generated, non-lockfile lines, OR touches auth, payments, data mutations, external API integrations, or other high-risk domains |
| `previous-comments` | `ce-previous-comments-reviewer` | Local (gh auth required; must NOT be delegated to scrubbed-env Codex lane to keep GitHub credentials out of the delegated trust boundary) | **PR-only AND comment-gated.** Reviewing a PR that has existing review comments or review threads from prior review rounds. Skip entirely when no PR metadata was gathered in Stage 1, OR when Stage 1's `hasPriorComments` flag is false (no `reviews` and no `comments` on the PR). |

## Stack-Specific Conditional (6 personas)

These reviewers keep their original opinionated lens. They are additive with the cross-cutting personas above, not replacements for them.

| Persona | Agent | Lane | Select when diff touches... |
|---------|-------|------|---------------------------|
| `dhh-rails` | `ce-dhh-rails-reviewer` | Delegation-eligible | Rails architecture, service objects, authentication/session choices, Hotwire-vs-SPA boundaries, or abstractions that may fight Rails conventions |
| `kieran-rails` | `ce-kieran-rails-reviewer` | Delegation-eligible | Rails controllers, models, views, jobs, components, routes, or other application-layer Ruby code where clarity and conventions matter |
| `kieran-python` | `ce-kieran-python-reviewer` | Delegation-eligible | Python modules, endpoints, services, scripts, or typed domain code |
| `kieran-typescript` | `ce-kieran-typescript-reviewer` | Delegation-eligible | TypeScript components, services, hooks, utilities, or shared types |
| `julik-frontend-races` | `ce-julik-frontend-races-reviewer` | Delegation-eligible | Stimulus/Turbo controllers, DOM event wiring, timers, async UI flows, animations, or frontend state transitions with race potential |
| `swift-ios` | `ce-swift-ios-reviewer` | Delegation-eligible | Swift files, SwiftUI views, UIKit controllers, `.entitlements`, `PrivacyInfo.xcprivacy`, `.xcdatamodeld`, `Package.swift`, `Package.resolved`, storyboards, XIBs, or semantic build-setting / target-membership / code-signing changes in `.pbxproj` |

## CE Conditional Agents (migration-specific)

These CE-native agents provide specialized analysis beyond what the persona agents cover. Spawn them when the diff includes database migrations, schema.rb, or data backfills.

| Agent | Lane | Focus |
|-------|------|-------|
| `ce-schema-drift-detector` | Local (unstructured) | Cross-references schema.rb changes against included migrations to catch unrelated drift |
| `ce-deployment-verification-agent` | Local (unstructured) | Produces Go/No-Go deployment checklist with SQL verification queries and rollback procedures |

## Selection rules

1. **Always spawn all 4 always-on personas** plus the 2 CE always-on agents.
2. **For each cross-cutting conditional persona**, the orchestrator reads the diff and decides whether the persona's domain is relevant. This is a judgment call, not a keyword match.
3. **For each stack-specific conditional persona**, use file types and changed patterns as a starting point, then decide whether the diff actually introduces meaningful work for that reviewer. Do not spawn language-specific reviewers just because one config or generated file happens to match the extension.
4. **For CE conditional agents**, spawn when the diff includes migration files (`db/migrate/*.rb`, `db/schema.rb`) or data backfill scripts.
5. **Announce the team** before spawning with a one-line justification per conditional reviewer selected.

## Lane assignment policy

The `Lane` column is the canonical declaration of where each reviewer runs in the beta delegation flow. Local-lane assignment is required when ANY of the following is true:

- **High-stakes:** the reviewer's findings carry critical correctness or security weight that justifies the session model rather than a delegated mid-tier model (`correctness`, `security`, `adversarial`).
- **Auth-bound:** the reviewer needs orchestrator-side credentials such as `gh` or repo authentication (`previous-comments`). The delegated lane is intentionally scrubbed of `GH_TOKEN` and `gh` config; auth-bound reviewers must NOT be delegated.
- **Unstructured output:** the reviewer returns prose or a checklist rather than findings JSON conforming to `findings-schema.json` (the `ce-agent-native-reviewer`, `ce-learnings-researcher`, `ce-schema-drift-detector`, and `ce-deployment-verification-agent` are all local for this reason).

Every other persona reviewer with a structured JSON output contract is delegation-eligible. When adding a new reviewer to this catalog, declare its lane explicitly using the rules above; the contract test enforces that the catalog's declared lane matches the delegated-mapping table in `references/codex-delegation-workflow.md`. A reviewer added without a Lane column is a missing decision, not a default.
