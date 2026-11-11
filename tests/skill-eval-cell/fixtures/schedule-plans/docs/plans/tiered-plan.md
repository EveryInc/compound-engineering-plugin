---
artifact_contract: ce-unified-plan/v1
execution: code
---

# Ledger currency support

## Goal Capsule

Add a currency formatter and a budget checker, and make the ledger total safe when entries carry different currencies.

## Product Contract

### Requirements

R1. `formatCurrency(cents, code)` formats integer cents for USD, EUR, and JPY with the correct symbol placement, grouping, and minor units, and rejects unknown codes.
R2. Summing ledger entries that carry different currencies never produces a silently wrong number. Existing callers of `sum` that pass single-currency entries keep working.
R3. `checkBudget(totals, limits)` returns each category that exceeded its limit with the overage, ordered by overage descending, and ignores categories without a limit.

## Planning Contract

U1 and U3 share no code, types, or files with each other or with existing modules. U2 is the only unit that touches `src/ledger.js`. No package.json changes. No external dependencies.

## Implementation Units

### U1. Currency formatter

- Covers R1.
- Dependencies: none.
- Files: create src/format-currency.js and tests/format-currency.test.js.
- Approach: a per-currency table of symbol, placement, grouping, and minor units; integer math only.
- Test scenarios: USD grouping; EUR symbol after amount; JPY with no minor units; negative amounts; unknown code rejected.
- Verification: node --test tests/format-currency.test.js.

### U2. Mixed-currency ledger totals

- Covers R2.
- Dependencies: none.
- Files: src/ledger.js, tests/ledger.test.js, and whichever callers the chosen design requires.
- Approach: not settled. Decide whether `sum` should reject mixed currencies, return per-currency totals, or convert through a rate source, and choose how the return type changes for existing callers. Investigate how `sum` is used before deciding.
- Test scenarios: single-currency entries still total as before; mixed-currency entries follow the chosen design.
- Verification: npm test.

### U3. Budget checker

- Covers R3.
- Dependencies: none.
- Files: create src/check-budget.js and tests/check-budget.test.js.
- Approach: compare totals to limits, compute overage, sort descending, skip categories with no limit.
- Test scenarios: two categories over; one exactly at its limit is not reported; category without a limit ignored; empty totals.
- Verification: node --test tests/check-budget.test.js.

## Verification Contract

Run npm test. Every unit's tests pass and the existing ledger sum test still passes.

## Definition of Done

R1-R3 pass their scenarios; existing single-currency behavior unchanged.
