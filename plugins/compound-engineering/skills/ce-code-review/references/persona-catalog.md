# Persona Catalog

6 reviewer personas in always-on and cross-cutting conditional layers, plus a CE-specific agent. The orchestrator uses this catalog to select which reviewers to spawn per review.

## Always-on (2 personas + 1 CE agent)

Spawned on every review regardless of diff content.

**Persona agents (structured JSON output):**

| Persona | Agent | Focus |
|---------|-------|-------|
| `correctness` | `ce-correctness-reviewer` | Logic errors, edge cases, state bugs, error propagation, intent compliance, production reliability gaps, structural quality, and code simplicity |
| `testing` | `ce-testing-reviewer` | Coverage gaps, weak assertions, brittle tests, missing edge case tests, API contract stability, and project-standards compliance |

**CE agents (unstructured output, synthesized separately):**

| Agent | Focus |
|-------|-------|
| `ce-learnings-researcher` | Search docs/solutions/ for past issues related to this PR's modules and patterns |

## Conditional (4 personas)

Spawned when the orchestrator identifies relevant patterns in the diff. The orchestrator reads the full diff and reasons about selection: agent judgment, not keyword matching.

| Persona | Agent | Select when diff touches... |
|---------|-------|---------------------------|
| `security` | `ce-security-reviewer` | Auth middleware, public endpoints, user input handling, permission checks, secrets management |
| `performance` | `ce-performance-reviewer` | Database queries, ORM calls, loop-heavy data transforms, caching layers, async/concurrent code |
| `adversarial` | `ce-adversarial-reviewer` | Diff has >=50 changed non-test, non-generated, non-lockfile lines, OR touches auth, payments, data mutations, external API integrations, or other high-risk domains |
| `previous-comments` | `ce-previous-comments-reviewer` | **PR-only AND comment-gated.** Reviewing a PR that has existing review comments or review threads from prior review rounds. Skip entirely when no PR metadata was gathered in Stage 1, OR when Stage 1's `hasPriorComments` flag is false (no `reviews` and no `comments` on the PR). |

## Selection rules

1. **Always spawn both always-on personas** plus the CE always-on agent (`ce-learnings-researcher`).
2. **For each cross-cutting conditional persona**, read the diff and decide whether the persona's domain is relevant. A judgment call, not a keyword match.
3. **Announce the team** before spawning with a one-line justification per conditional reviewer selected.
