---
artifact_contract: ce-unified-plan/v1
execution: code
---

# Ledger helpers

## Goal Capsule

Add two standalone helpers to the ledger tools: a currency formatter and a budget checker, and keep the generated API reference current.

## Product Contract

### Requirements

R1. `formatCurrency(cents, code)` formats integer cents for USD, EUR, and JPY with the correct symbol placement, grouping, and minor units, and rejects unknown codes.
R2. `checkBudget(totals, limits)` returns each category that exceeded its limit with the overage, ordered by overage descending, and ignores categories without a limit.
R3. The API reference in docs/api.md lists every exported helper.

## Planning Contract

The two helpers share no code, types, or files with each other. No external dependencies.

## Implementation Units

### U1. Currency formatter

- Covers R1.
- Dependencies: none.
- Files: create src/format-currency.js and tests/format-currency.test.js; add a case to tests/ledger.test.js that formats `sum()` output with `formatCurrency`.
- Approach: a per-currency table of symbol, placement, grouping, and minor units; integer math only. Document the export with JSDoc.
- Test scenarios: USD grouping; EUR symbol after amount; JPY with no minor units; unknown code rejected; ledger sum formatted as USD.
- Verification: node --test tests/format-currency.test.js tests/ledger.test.js.

### U2. Budget checker

- Covers R2, R3.
- Dependencies: none.
- Files: create src/check-budget.js and tests/check-budget.test.js; docs/api.md (generated).
- Approach: compare totals to limits, compute overage, sort descending, skip categories with no limit. Document the export with JSDoc, then run `npm run docs` to regenerate docs/api.md.
- Test scenarios: two categories over; one exactly at its limit is not reported; category without a limit ignored; empty totals.
- Verification: node --test tests/check-budget.test.js, and docs/api.md lists checkBudget.

## Verification Contract

Run npm test. Every unit's tests pass and the existing ledger sum test still passes.

## Definition of Done

R1-R3 pass; existing behavior unchanged.
