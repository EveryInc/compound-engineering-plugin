---
artifact_contract: ce-unified-plan/v1
execution: code
---

# Ledger import pipeline

## Goal Capsule

Import CSV ledger exports, normalize them, and print a monthly summary from the CLI.

## Product Contract

### Requirements

R1. `parseCsv(text)` turns a ledger CSV export (date, payee, amount, category columns, quoted fields allowed) into entry objects and reports the line number of any malformed row.
R2. `normalize(entries)` converts amounts to integer cents, trims payees, maps unknown categories to `uncategorized`, and drops exact duplicates.
R3. `ledger summary <file>` prints per-month totals by category from a CSV file.

## Planning Contract

Each stage consumes the previous stage's output types directly. The entry shape is defined in U1 and extended in U2; U3 depends on both. No external dependencies.

## Implementation Units

### U1. CSV parser

- Covers R1.
- Dependencies: none.
- Files: create src/parse-csv.js and tests/parse-csv.test.js.
- Approach: a small state-machine tokenizer for quoted fields, header validation, and per-row error reporting with line numbers. Defines the `Entry` shape.
- Test scenarios: plain rows; quoted commas; escaped quotes; missing column reports its line; empty file.
- Verification: node --test tests/parse-csv.test.js.

### U2. Normalizer

- Covers R2.
- Dependencies: U1 (consumes and extends the `Entry` shape U1 defines).
- Files: create src/normalize.js and tests/normalize.test.js.
- Approach: cents conversion with rounding rules, payee trimming, category mapping table, duplicate detection on the full normalized entry.
- Test scenarios: fractional amounts round correctly; unknown category maps to uncategorized; duplicates dropped; whitespace payees trimmed.
- Verification: node --test tests/normalize.test.js.

### U3. Summary command

- Covers R3.
- Dependencies: U1 and U2 (calls parseCsv then normalize).
- Files: create src/cli.js and tests/cli.test.js; edit package.json to add the `bin` entry.
- Approach: read the file, run parse then normalize, group by month and category, print an aligned table.
- Test scenarios: two months of entries; a malformed row exits non-zero with its line number; empty file prints no rows.
- Verification: node --test tests/cli.test.js.

## Verification Contract

Run npm test. Every unit's tests pass and the existing ledger sum test still passes.

## Definition of Done

R1-R3 pass their scenarios; existing behavior unchanged.
