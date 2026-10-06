---
artifact_contract: ce-unified-plan/v1
execution: code
---

# Ledger monthly report

## Goal Capsule

Add a currency formatter and a date-range parser, then a monthly report that uses both.

## Product Contract

### Requirements

R1. `formatCurrency(cents, code)` formats integer cents for USD, EUR, and JPY with the correct symbol placement, grouping, and minor units, and rejects unknown codes.
R2. `parseRange(text, now)` parses `2026-01..2026-03`, `last-30-days`, and `ytd` relative to an injected clock into inclusive start and end dates, and rejects malformed input with a message.
R3. `monthlyReport(entries, rangeText, code, now)` filters entries (`{ date, amount }` with integer cents) to the parsed range, totals them per month, and returns lines of `YYYY-MM  <formatted total>` in month order.

## Planning Contract

U1 and U2 share no code, types, or files with each other. U3 imports both and depends on their exported signatures. No package.json changes. No external dependencies.

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

### U3. Monthly report

- Covers R3.
- Dependencies: U1 and U2 (calls formatCurrency and parseRange).
- Files: create src/monthly-report.js and tests/monthly-report.test.js.
- Approach: parse the range, filter entries inclusively, group by month, format each total.
- Test scenarios: entries across three months inside the range; entries outside the range excluded; empty result returns no lines; unknown currency propagates the formatter's error.
- Verification: node --test tests/monthly-report.test.js.

## Verification Contract

Run npm test. Every unit's tests pass and the existing ledger sum test still passes.

## Definition of Done

R1-R3 pass their scenarios; existing behavior unchanged.
