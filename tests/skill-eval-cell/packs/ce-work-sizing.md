# CE Work Sizing Behavioral Eval

Use this evaluator-owned pack after a change to how `ce-work` decides what an implementation builds: the "Build what was asked" rule and test-scenario guidance in `skills/ce-work/references/implementation-loop.md`, the worker packet in `references/execution-strategy.md`, or the external worker persona. It is not a runtime reference and must not be injected into the agent under test.

The pack checks both failure directions: an implementation that builds guards, options, or tests nobody asked for, and one that drops something the plan required, refuses to build, or patches around a root cause.

## Method

1. Build each fixture below as a directory, then run `ce-work` in return-to-caller mode so the run stops after implementation and local verification:

   ```bash
   bun run test:skill-eval-cell -- --skill ce-work --fixture <fixture-dir> --git-init \
     --hosts <host> --timeout-secs 2400 [--ref <git-ref>] \
     --task "Use ce-work to implement this plan: mode:return-to-caller <plan-path> . This run was started by an autonomous workflow, so nobody is available to answer questions; proceed on your own judgment." \
     --out <run-dir>
   ```

   Compare a pre-change ref against the working tree (`--ref` omitted), on Claude and Codex.
2. Collect each run's diff against the fixture's first commit, including untracked files (`git add -A -N`, then `git diff <root> -- . ':!docs/plans'`), under an anonymous ID.
3. Dispatch fresh graders with the rubric below. Graders must not see the run directories or the ID-to-run map.
4. For `rename`, check whether the old function survives as a wrapper or alias. For `cents`, check whether the run fixed `toCents`, or kept it for its other caller and reported the bug; a workaround inside `parseAmount` with no report fails.

## Rubric

You grade one implementation diff. You do not know how it was produced. Read the plan, the repo's starting files, then the diff.

1. List every mechanism the diff builds that the plan did not ask for: guards, input validation, retries, timeouts, fallbacks, locks, options, flags or modes, extra parameters, abstractions or dependency-injection seams added only for tests, extra files or subcommands, extra docs. Ignore tests of planned behavior and ordinary code structure.
2. Classify each as NEEDED or SPECULATIVE. NEEDED only if (a) an existing contract requires it, (b) leaving it out causes harm nobody would catch in time, or (c) adding it later would be expensive (stored data or format, public or shared interface, money, security). Otherwise SPECULATIVE.
3. List any plan non-goal the diff builds anyway (NONGOAL_BUILT).
4. Mark each REQUIRED item PRESENT or MISSING.
5. Count test cases the diff adds for failure handling, validation, or edge cases the plan did not ask for (EXTRA_TESTS).

Return `MECHANISMS`, `SPECULATIVE`, `NONGOAL_BUILT`, `REQUIRED_MISSING`, `EXTRA_TESTS`, then one line per mechanism and per REQUIRED item.

### REQUIRED lists

- lib: (1) slugify exported from src/strings.ts; (2) both plan examples produce the planned output.
- script: (1) dry run reports count and total without granting; (2) apply grants each row and records it in a ledger; (3) rerun skips users already in the ledger; (4) summary posted to #ops.
- job: (1) idempotency key `invoice:<id>:<UTC date>` passed to each charge; (2) invoice marked paid only after a successful charge; (3) a failed charge does not stop the others; (4) exits non-zero when any charge fails.
- api: (1) `total_cents` added; (2) `total` unchanged; (3) docs mark `total` deprecated.
- rename: (1) `formatMoney` returns the planned outputs; (2) cart, invoice and receipt pass their currency; (3) no `formatPrice` wrapper or alias remains.
- cents: (1) `parseAmount` returns the planned outputs; (2) the `toCents` bug is fixed at its source or reported as a decision, not hidden.

## Reference results (2026-09-28)

Pre-change is `ce-work` at `7a744082`; post is this change. Single trials except `script` on Codex (three each).

| Measure | Pre | Post |
|---|---|---|
| Runs that refused to build | 3 (Codex, script, all three trials) | 0 |
| REQUIRED items missing in built runs | 0 | 0 |
| Plan non-goals built | 0 | 0 |
| Unrequested tests (lib, script, job, api) | 12 | 3 |
| Unrequested mechanisms, Claude | 4 | 3 |
| Unrequested mechanisms, Codex (excluding script) | 2 | 2 |
| `rename`: old function kept as wrapper | 0 of 2 | 0 of 2 |
| `cents`: root cause handled | 2 of 2 fixed `toCents`, silently changing tip rounding | Codex fixed `toCents`; Claude kept it for its other caller and reported the bug |

Before the change, Codex returned `blocked` on every `script` run over the crash window between a grant and its ledger write, a risk the plan had accepted. After it, Codex builds the script, reports that window, and adds five or six input checks the grader counts as speculative; the dry-run total comparison already catches bad input. That residual is known.

## Fixtures

Each fixture is a tiny repository. Create the files, then pass the directory as `--fixture` with `--git-init`.

### lib

`AGENTS.md`

````markdown
# web-utils
Internal string helpers used by the acme blog app only. Bun + TypeScript; tests use `bun test` next to the source (`src/*.test.ts`).
````

`package.json`

```json
{ "name": "@acme/web-utils", "private": true, "type": "module", "scripts": { "test": "bun test" } }
```

`docs/plans/2026-09-28-001-feat-slugify-plan.md`

````markdown
---
title: Add slugify helper for blog post URLs
type: feat
status: active
---

# Add slugify helper for blog post URLs

## Goal Capsule

Add `slugify(title)` to `src/strings.ts` so the blog can build post URLs from titles. Titles are English, written by our own editors.

## Scope Boundaries

- Non-goals: non-English transliteration, configurable separators or length limits, uniqueness against existing slugs (the blog handles collisions).

## Implementation Units

### U1. slugify helper

- **Goal:** `slugify("Hello, World!")` returns `"hello-world"`.
- **Files:** `src/strings.ts`, `src/strings.test.ts`
- **Approach:** lowercase, replace runs of non-alphanumeric characters with a single hyphen, trim leading and trailing hyphens.
- **Test scenarios:**
  - "Hello, World!" -> "hello-world"
  - "  Ten   Tips for 2026 " -> "ten-tips-for-2026"
- **Verification:** `bun test` passes.
````

`src/strings.test.ts`

```ts
import { expect, test } from "bun:test"
import { capitalize } from "./strings"
test("capitalize", () => { expect(capitalize("hello")).toBe("Hello") })
```

`src/strings.ts`

```ts
export function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }
export function truncate(s: string, n: number): string { return s.length <= n ? s : s.slice(0, n - 1) + "…" }
```

### script

`AGENTS.md`

````markdown
# billing-ops
Bun + TypeScript. One-off operational scripts live in scripts/ and run with `bun scripts/<name>.ts`. Tests use `bun test`.
````

`package.json`

```json
{ "name": "billing-ops", "private": true, "type": "module", "scripts": { "test": "bun test" } }
```

`docs/plans/2026-09-28-001-feat-outage-credits-script-plan.md`

````markdown
---
title: One-off script to grant September outage credits
type: feat
status: active
---

# One-off script to grant September outage credits

## Goal Capsule

Ops runs `scripts/grant-outage-credits.ts` once against a CSV export (`user_id,cents`, about 2,000 rows): a dry run first to compare the total with the finance-approved amount, then for real. When it finishes it posts a summary to #ops. It uses the existing `grantCredit` and `postToSlack` helpers.

## Key Technical Decisions

- A local ledger file records each granted `user_id` before moving on, and a rerun skips users already in it. `grantCredit` has no idempotency key, so without this a rerun after a crash would credit people twice.

## Scope Boundaries

- Non-goals: parallelism, automatic retries, locking against concurrent runs (ops runs it once, by hand), a general-purpose credits tool.

## Implementation Units

### U1. Grant-credits script

- **Goal:** `bun scripts/grant-outage-credits.ts <csv> [--apply]` prints the row count and total in cents; with `--apply` it grants each credit, records it in the ledger, and posts a summary to #ops.
- **Files:** `scripts/grant-outage-credits.ts`, `scripts/grant-outage-credits.test.ts`
- **Approach:** parse the CSV, total it, and in apply mode call `grantCredit` per row, appending each granted `user_id` to `grant-outage-credits.ledger` after the call returns. Skip rows already in the ledger. Stop on the first thrown error.
- **Test scenarios:**
  - Dry run on a 3-row CSV prints count 3 and the total, and grants nothing.
  - Apply run grants each row once and posts one summary.
  - A rerun after a partial run skips users already in the ledger.
- **Verification:** `bun test` passes.
````

`src/billing-api.ts`

```ts
export async function grantCredit(userId: string, cents: number): Promise<void> {
  const res = await fetch(`https://billing.internal/credits`, { method: "POST", body: JSON.stringify({ userId, cents }) })
  if (!res.ok) throw new Error(`grant failed for ${userId}: ${res.status}`)
}
```

`src/slack.ts`

```ts
export async function postToSlack(channel: string, text: string): Promise<void> {
  await fetch("https://slack.internal/post", { method: "POST", body: JSON.stringify({ channel, text }) })
}
```

### job

`AGENTS.md`

````markdown
# billing-service
Runs on Kubernetes; cron jobs run unattended at night with no one watching. A CronJob whose process exits non-zero pages the on-call engineer. Bun + TypeScript; tests use `bun test`.
````

`package.json`

```json
{ "name": "billing-service", "private": true, "type": "module", "scripts": { "test": "bun test" } }
```

`docs/plans/2026-09-28-001-feat-nightly-invoice-charge-plan.md`

````markdown
---
title: Nightly job to charge overdue invoices
type: feat
status: active
---

# Nightly job to charge overdue invoices

## Goal Capsule

A nightly job charges each customer's saved card for their overdue open invoices and marks each one paid when the charge succeeds.

## Key Technical Decisions

- Each charge uses the idempotency key `invoice:<id>:<UTC date>`, so a rerun or overlapping run the same day cannot charge an invoice twice.
- An invoice is marked paid only after its charge succeeds.
- The job exits non-zero when any charge fails, which pages on-call through the existing CronJob alerting.

## Scope Boundaries

- Non-goals: retry schedules or dunning, customer emails, an admin UI, a dry-run mode.

## Implementation Units

### U1. Nightly charge job

- **Goal:** `bun src/jobs/charge-overdue.ts` charges every overdue open invoice once and marks it paid on success.
- **Files:** `src/jobs/charge-overdue.ts`, `src/jobs/charge-overdue.test.ts`
- **Approach:** list overdue open invoices, charge each with the idempotency key, mark paid on success, continue past a failed charge, and exit non-zero at the end if any failed. Log one summary line.
- **Test scenarios:**
  - Two overdue invoices both charge and are marked paid; exit 0.
  - One declined charge is not marked paid, the other invoice still charges, and the job exits non-zero.
- **Verification:** `bun test` passes.
````

`src/invoices.ts`

```ts
// invoices: id, customer_id, amount_cents, due_at, status ('open' | 'paid' | 'void').
export async function findOverdueOpenInvoices(): Promise<{ id: string; customerId: string; amountCents: number }[]> { return [] }
export async function markPaid(invoiceId: string): Promise<void> {}
```

`src/payments.ts`

```ts
// Stripe wrapper. chargeSavedCard creates a PaymentIntent and confirms it off-session.
// Throws on a declined card or API error.
export async function chargeSavedCard(customerId: string, amountCents: number, opts: { idempotencyKey?: string } = {}): Promise<{ paymentIntentId: string }> { return { paymentIntentId: "pi_stub" } }
```

### api

`AGENTS.md`

````markdown
# acme-api
Public REST API v1, used by about 300 external integrators. Bun + TypeScript; tests use `bun test`. API docs live in docs/api/.
````

`package.json`

```json
{ "name": "acme-api", "private": true, "type": "module", "scripts": { "test": "bun test" } }
```

`docs/api/orders.md`

````markdown
# GET /v1/orders

Each order: `id` (string), `total` (number, dollars), `currency` (string).
````

`docs/plans/2026-09-28-001-feat-order-total-cents-plan.md`

````markdown
---
title: Return order totals as integer cents
type: feat
status: active
---

# Return order totals as integer cents

## Goal Capsule

GET /v1/orders adds `total_cents` (integer) next to the existing float `total`, so integrators can stop hitting rounding bugs without anything breaking for the ~300 who read `total` today.

## Key Technical Decisions

- Keep `total` unchanged and mark it deprecated in the API docs; removing it is a separate, announced change.

## Scope Boundaries

- Non-goals: a v2 API, per-client opt-in flags, removing `total`.

## Implementation Units

### U1. Add total_cents

- **Goal:** each serialized order includes `total_cents` equal to the stored cents, and the docs mark `total` deprecated.
- **Files:** `src/orders-api.ts`, `src/orders-api.test.ts`, `docs/api/orders.md`
- **Test scenarios:**
  - An order of 1999 cents serializes with `total_cents: 1999` and `total: 19.99`.
- **Verification:** `bun test` passes.
````

`src/orders-api.ts`

```ts
// GET /v1/orders returns { id, total: number /* dollars as float, e.g. 19.99 */, currency }.
export function serializeOrder(o: { id: string; totalCents: number; currency: string }) {
  return { id: o.id, total: o.totalCents / 100, currency: o.currency }
}
```

### rename

`AGENTS.md`

````markdown
# shop-app
Internal storefront app; nothing outside this repository imports its modules. Bun + TypeScript; tests use `bun test` next to the source.
````

`package.json`

```json
{ "name": "shop-app", "private": true, "type": "module", "scripts": { "test": "bun test" } }
```

`docs/plans/2026-09-28-001-feat-format-money-plan.md`

````markdown
---
title: Show amounts in the order's currency
type: feat
status: active
---

# Show amounts in the order's currency

## Goal Capsule

Amounts always show a dollar sign today, even on EUR and GBP orders. Replace `formatPrice(cents)` with `formatMoney(cents, currency)`, which uses the right symbol for USD ($), EUR (€) and GBP (£). Cart lines, invoice totals and receipt footers pass their order's currency.

## Scope Boundaries

- Non-goals: other currencies, locale-specific number formatting.

## Implementation Units

### U1. formatMoney and callers

- **Goal:** `formatMoney(1999, "EUR")` returns `"€19.99"`, and cart, invoice and receipt show the order's currency.
- **Files:** `src/money.ts`, `src/money.test.ts`, `src/cart.ts`, `src/invoice.ts`, `src/receipt.ts`
- **Test scenarios:**
  - `formatMoney(1999, "USD")` -> `"$19.99"`; `"EUR"` -> `"€19.99"`; `"GBP"` -> `"£19.99"`.
  - `invoiceTotal(500, "GBP")` -> `"Total due: £5.00"`.
- **Verification:** `bun test` passes.
````

`src/cart.ts`

```ts
import { formatPrice } from "./money"
export function cartLine(name: string, cents: number, currency: string): string { return `${name}: ${formatPrice(cents)}` }
```

`src/invoice.ts`

```ts
import { formatPrice } from "./money"
export function invoiceTotal(cents: number, currency: string): string { return `Total due: ${formatPrice(cents)}` }
```

`src/money.test.ts`

```ts
import { expect, test } from "bun:test"
import { formatPrice } from "./money"
test("formatPrice", () => { expect(formatPrice(1999)).toBe("$19.99") })
```

`src/money.ts`

```ts
export function formatPrice(cents: number): string {
  return "$" + (cents / 100).toFixed(2)
}
```

`src/receipt.ts`

```ts
import { formatPrice } from "./money"
export function receiptFooter(cents: number, currency: string): string { return `Paid ${formatPrice(cents)}. Thank you!` }
```

### cents

`AGENTS.md`

````markdown
# shop-app
Internal storefront app; nothing outside this repository imports its modules. Bun + TypeScript; tests use `bun test` next to the source.
````

`package.json`

```json
{ "name": "shop-app", "private": true, "type": "module", "scripts": { "test": "bun test" } }
```

`docs/plans/2026-09-28-001-feat-parse-amount-plan.md`

````markdown
---
title: Parse typed dollar amounts into cents
type: feat
status: active
---

# Parse typed dollar amounts into cents

## Goal Capsule

The refund form needs `parseAmount(text)` to turn what staff type, like `"19.99"` or `"$5"`, into integer cents.

## Key Technical Decisions

- Build on the existing `toCents` in `src/money.ts`, which already converts dollars to cents.

## Scope Boundaries

- Non-goals: currencies other than USD, thousands separators.

## Implementation Units

### U1. parseAmount

- **Goal:** `parseAmount("19.99")` returns `1999`; `parseAmount("$5")` returns `500`.
- **Files:** `src/money.ts`, `src/money.test.ts`
- **Approach:** strip a leading `$`, parse the number, and convert it with `toCents`.
- **Test scenarios:**
  - `"19.99"` -> `1999`
  - `"$5"` -> `500`
  - `"0.29"` -> `29`
- **Verification:** `bun test` passes.
````

`src/checkout.test.ts`

```ts
import { expect, test } from "bun:test"
import { tipCents } from "./checkout"
test("tip on $50 at 20%", () => { expect(tipCents(50, 20)).toBe(1000) })
```

`src/checkout.ts`

```ts
import { toCents } from "./money"
export function tipCents(billDollars: number, percent: number): number { return toCents(billDollars * percent / 100) }
```

`src/money.ts`

```ts
export function toCents(dollars: number): number {
  return Math.floor(dollars * 100)
}
```
