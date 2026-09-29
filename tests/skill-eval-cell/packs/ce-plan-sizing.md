# CE Plan Sizing Behavioral Eval

Use this evaluator-owned pack after a change to how `ce-plan` decides what a plan builds: the sizing test in `skills/ce-plan/references/structure.md` (3.3, 3.8), the deepening filter in `references/deepening-workflow.md`, test-scenario guidance, specialist planning prompts, or `ce-doc-review`'s scope-guardian. It is not a runtime reference and must not be injected into the agent under test.

The pack checks both failure directions at once: a plan that builds mechanisms nobody needed, and a plan that drops something needed or narrows what the user asked for.

## Method

1. Build each fixture below as a directory, then run a headless plan per host with the requested skill and its review companion, so `ce-doc-review` runs from the same ref instead of an installed copy:

   ```bash
   bun run test:skill-eval-cell -- --skill ce-plan --with-skill ce-doc-review \
     --fixture <fixture-dir> --git-init --hosts <host> --timeout-secs 3600 \
     [--ref <git-ref>] [--reasoning-effort high] \
     --task "Use ce-plan to plan this change. This run was started by an autonomous workflow, so nobody is available to answer questions; proceed on your own judgment and write the plan. Request: \"<request>\"" \
     --out <run-dir>
   ```

   Pass `--reasoning-effort high` for Grok; without it the run inherits the operator's default. Compare a pre-change ref against the working tree (`--ref` omitted).
2. Copy each plan to a grading directory under an anonymous ID and keep the ID-to-run map out of the graders' reach.
3. Dispatch a fresh grader per batch with the rubric below and the scenario requests. Graders must not know the host or the skill version.
4. Run at least Claude and Codex on every scenario, two trials on `script`, `job`, and `ambitious`; add Grok when the change is structural.

## Rubric

You grade one implementation plan. You do not know how it was produced. Read the request and the repo files, then the plan's implementation units, key technical decisions, and design sections.

1. List every mechanism the plan commits to building that the request did not explicitly ask for: guards, validation, retries, timeouts, recovery or resume paths, locks, ledgers or journals, options, flags or modes, abstractions or interfaces, caches, queues, compatibility layers, extra subcommands, extra docs or runbooks. Ignore ordinary tests of requested behavior. Items listed only as deferred, follow-up, or considered and not built do not count as committed.
2. Classify each as NEEDED or SPECULATIVE. NEEDED only if (a) an existing contract requires it, (b) leaving it out causes harm nobody would catch in time (silent, landing on someone who cannot see it, or costly by the time anyone notices), or (c) adding it later would be expensive (stored data or format, public or shared interface, money, security). Otherwise SPECULATIVE.
3. Mark each item on the scenario's REQUIRED list PRESENT or MISSING in the committed plan. For `ambitious`, items 1-5 are requested scope: never SPECULATIVE, and MISSING when deferred, dropped, or reduced (a hard-coded schedule instead of a configurable one, a "retry now" delayed or gated by an interval or notice period the plan invented, manual attempts that skip the requested emails). A limit an external party imposes, such as a card-network wait, is not a reduction.

Return `MECHANISMS: <n>`, `SPECULATIVE: <n>`, `REQUIRED_MISSING: <n>`, one line per mechanism (`- [NEEDED|SPECULATIVE] <name> — <reason>`), and one line per required item (`- REQUIRED <item>: PRESENT|MISSING`).

### REQUIRED lists

- script: (1) a rerun after a partial or interrupted run cannot credit the same user twice; (2) dry run reports count and total without granting; (3) summary posted to #ops.
- csv: (1) the export contains only the signed-in user's orders.
- lib: none.
- migration: (1) existing data is backfilled into the new columns without losing information, including names that do not split cleanly; (2) the switch is staged so old and new app instances can run during the rollout without losing writes; (3) the backfill is safe on about 3M production rows.
- api: (1) existing integrators are not broken (new field, new version, opt-in, or equivalent, plus a deprecation path for the old field).
- job: (1) a retry or overlapping run cannot charge the same invoice twice; (2) a failed charge does not mark the invoice paid; (3) failures are surfaced to a person, since the job runs unattended.
- ambitious: (1) nightly job charges saved cards; (2) configurable retry schedule; (3) customer email before each attempt and after a failure; (4) admin page listing failed collections with a manual retry-now action; (5) per-customer pause switch; (6) a retry, overlapping run, or manual retry cannot charge the same invoice twice; (7) a failed charge does not mark the invoice paid; (8) failures are surfaced to a person.

## Pass condition

No REQUIRED item missing on any run, and the speculative count at or below the pre-change ref on the same host and scenario. A single missing item on one run of one host is a signal to rerun that cell before editing; the same miss on two runs is a `Change`.

## Reference results (2026-09-28)

Speculative count per run; a trailing `!` marks a run with a REQUIRED item missing. "Before" is the skill at `dd1bf2b8`; "after" is this change.

| Scenario | Claude before | Claude after | Codex before | Codex after |
|---|---|---|---|---|
| script | 20, 24 | 10, 9 | 6, 9 | 5, 7 |
| job | 10 | 6, 9 | 15 | 14, 17 |
| migration | 5 | 3, 1 | 12 | 12, 6 |
| lib | - | 0 | - | 0 |
| csv | - | 1 | - | 5 |
| ambitious | 12!, 14! | 9, 9 | 18!, 20! | 17, 16 |

Before the change, every ambitious plan narrowed one requested feature: Claude skipped the pre-attempt email on manual retry, and Codex put an invented 24-hour gap or daily cap on "retry now". Known open signals after the change: the `api` deprecation notice for the old field is sometimes deferred (Codex, Grok), and Codex stays heavy on `job` and `ambitious`.

## Fixtures

Each fixture is a tiny repository. Create the files, then pass the directory as `--fixture` with `--git-init`.

### script

Request: Add a one-off script that grants goodwill credits to users affected by the September outage. Input is a CSV export (user_id, cents) from the incident spreadsheet, about 2,000 rows. Ops will run it once: dry run first to review the total against the finance-approved amount, then for real. Post a summary to #ops when it finishes. Use the existing grantCredit and postToSlack helpers.

`AGENTS.md`

```markdown
# billing-ops
Bun + TypeScript. Plans go in docs/plans/. Tests use `bun test`.
```

`package.json`

```json
{ "name": "billing-ops", "private": true, "type": "module", "scripts": { "test": "bun test" } }
```

`scripts/README.md`

```markdown
# scripts/

One-off operational scripts. Run with `bun scripts/<name>.ts`. Delete a script once it has served its purpose.
```

`src/billing-api.ts`

```ts
export async function grantCredit(userId: string, cents: number): Promise<void> {
  const res = await fetch(`https://billing.internal/credits`, {
    method: "POST",
    body: JSON.stringify({ userId, cents }),
  })
  if (!res.ok) throw new Error(`grant failed for ${userId}: ${res.status}`)
}
```

`src/slack.ts`

```ts
export async function postToSlack(channel: string, text: string): Promise<void> {
  await fetch("https://slack.internal/post", { method: "POST", body: JSON.stringify({ channel, text }) })
}
```

### csv

Request: Add a "Download CSV" button to the orders page that exports the signed-in user's order history (date, status, total). Most users have fewer than 200 orders.

`AGENTS.md`

```markdown
# shop
Express + Postgres storefront. Plans go in docs/plans/.
```

`package.json`

```json
{ "name": "shop", "private": true, "dependencies": { "express": "^4", "pg": "^8", "hbs": "^4" } }
```

`src/auth.ts`

```ts
export function requireUser(req: any, res: any, next: any) { if (!req.user) return res.redirect("/login"); next() }
```

`src/db.ts`

```ts
import { Pool } from "pg"
export const db = { query: async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows }
const pool = new Pool()
```

`src/routes/orders.ts`

```ts
import { Router } from "express"
import { db } from "../db"
import { requireUser } from "../auth"

export const orders = Router()

// GET /orders — the signed-in user's order history page.
orders.get("/orders", requireUser, async (req, res) => {
  const rows = await db.query(
    "SELECT id, placed_at, status, total_cents FROM orders WHERE user_id = $1 ORDER BY placed_at DESC",
    [req.user.id],
  )
  res.render("orders", { orders: rows })
})
```

`src/views/orders.hbs`

```handlebars
<h1>Your orders</h1><table>{{#each orders}}<tr><td>{{placed_at}}</td><td>{{status}}</td><td>{{total_cents}}</td></tr>{{/each}}</table>
```

### lib

Request: Add a slugify(title) helper to src/strings.ts for the blog's new post URLs. Titles are English, written by our own editors.

`AGENTS.md`

```markdown
# web-utils
Internal string/date helpers used by the acme blog app only. Plans go in docs/plans/.
```

`package.json`

```json
{ "name": "@acme/web-utils", "private": true, "type": "module" }
```

`src/strings.ts`

```ts
export function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }
export function truncate(s: string, n: number): string { return s.length <= n ? s : s.slice(0, n - 1) + "…" }
```

### migration

Request: Split users.name into first_name and last_name columns. The app should read and write the new columns everywhere it uses name today, and name should eventually go away.

`AGENTS.md`

```markdown
# accounts
Node + Postgres. Deploys run migrations then roll the app out across 20 instances. Plans go in docs/plans/.
```

`db/migrations/0001_create_users.sql`

```sql
-- 0001_create_users.sql: CREATE TABLE users (id uuid primary key, email text unique not null, name text not null, created_at timestamptz not null default now());
```

`src/models/user.ts`

```ts
// users table: id, email, name (text, "First Last"), created_at. About 3 million rows in production Postgres.
// `name` is read in 12 places across the app (profile, emails, invoices, admin search).
export type User = { id: string; email: string; name: string; createdAt: Date }
```

### api

Request: Make GET /v1/orders return the order total as integer cents instead of float dollars, because integrators keep hitting rounding bugs.

`AGENTS.md`

```markdown
# acme-api
Public REST API. Plans go in docs/plans/.
```

`src/orders-api.ts`

```ts
// Public REST API v1, documented at developers.acme.com and used by ~300 external integrators.
// GET /v1/orders returns { id, total: number /* dollars as float, e.g. 19.99 */, currency }.
export function serializeOrder(o: { id: string; totalCents: number; currency: string }) {
  return { id: o.id, total: o.totalCents / 100, currency: o.currency }
}
```

### job

Request: Add a nightly job that charges each customer's saved card for their overdue open invoices and marks them paid.

`AGENTS.md`

```markdown
# billing-service
Runs on Kubernetes; cron jobs run unattended at night with no one watching. Plans go in docs/plans/.
```

`src/invoices.ts`

```ts
// invoices: id, customer_id, amount_cents, due_at, status ('open' | 'paid' | 'void').
export async function findOverdueOpenInvoices(): Promise<{ id: string; customerId: string; amountCents: number }[]> { return [] }
export async function markPaid(invoiceId: string): Promise<void> {}
```

`src/payments.ts`

```ts
// Stripe wrapper. chargeSavedCard creates a PaymentIntent and confirms it off-session.
export async function chargeSavedCard(customerId: string, amountCents: number, opts: { idempotencyKey?: string } = {}) { /* ... */ }
```

### ambitious

Request: Build a complete dunning system for overdue invoices: a nightly job that charges each customer's saved card, a configurable retry schedule (for example day 1, 3 and 7 after the due date), customer emails before each attempt and after a failure, an admin page that lists failed collections with a manual "retry now" button, and a per-customer switch to pause collection.

`AGENTS.md`

```markdown
# billing-service
Runs on Kubernetes; cron jobs run unattended at night with no one watching. Plans go in docs/plans/.
```

`src/invoices.ts`

```ts
// invoices: id, customer_id, amount_cents, due_at, status ('open' | 'paid' | 'void').
export async function findOverdueOpenInvoices(): Promise<{ id: string; customerId: string; amountCents: number }[]> { return [] }
export async function markPaid(invoiceId: string): Promise<void> {}
```

`src/payments.ts`

```ts
// Stripe wrapper. chargeSavedCard creates a PaymentIntent and confirms it off-session.
export async function chargeSavedCard(customerId: string, amountCents: number, opts: { idempotencyKey?: string } = {}) { /* ... */ }
```
