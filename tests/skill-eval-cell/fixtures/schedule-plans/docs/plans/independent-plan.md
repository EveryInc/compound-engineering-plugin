---
artifact_contract: ce-unified-plan/v1
execution: code
---

# Ledger utility helpers

## Goal Capsule

Add three standalone helpers to the ledger tools: a currency formatter, a date-range parser, and a budget checker.

## Product Contract

### Requirements

R1. `formatCurrency(cents, code)` formats integer cents for USD, EUR, and JPY with the correct symbol placement, grouping, and minor units, and rejects unknown codes.
R2. `parseRange(text)` parses `2026-01..2026-03`, `last-30-days`, and `ytd` relative to an injected clock into inclusive start and end dates, and rejects malformed input with a message.
R3. `checkBudget(totals, limits)` returns each category that exceeded its limit with the overage, ordered by overage descending, and ignores categories without a limit.

## Planning Contract

The three helpers share no code, types, or files with each other or with existing modules. No package.json changes. No external dependencies.

## Implementation Units

### U1. Currency formatter

- Covers R1.
- Dependencies: none.
- Files: create src/format-currency.js and tests/format-currency.test.js.
- Approach: a per-currency table of symbol, placement, grouping, and minor units; integer math only.
- Test scenarios: USD grouping; EUR symbol after amount; JPY with no minor units; negative amounts; unknown code rejected.
- Verification: node --test tests/format-currency.test.js.

### U2. Date-range parser

- Covers R2.
- Dependencies: none.
- Files: create src/parse-range.js and tests/parse-range.test.js.
- Approach: three small grammars with an injected `now` for relative ranges; month ranges expand to whole months.
- Test scenarios: month range across a year boundary; last-30-days with a fixed clock; ytd on January 1; malformed input message.
- Verification: node --test tests/parse-range.test.js.

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

R1-R3 pass their scenarios; existing behavior unchanged.
