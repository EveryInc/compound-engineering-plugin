---
title: CSV Report Download - Plan
type: feat
date: 2026-09-09
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# CSV Report Download - Plan

## Goal Capsule

- **Objective:** A project owner can download any of their existing reports as a CSV file that opens correctly in spreadsheet tools, under exactly the access rules the JSON download already enforces.
- **Means:** Add a CSV download function beside the JSON one, reusing the existing report lookup and ownership check, and a small local CSV serializer (KTD1, KTD2).
- **Authority hierarchy:** `README.md` product statement, then this plan, then the existing `src/download.js` pattern.
- **Stop conditions:** Stop and surface a blocker if the JSON download's access or error behavior would have to change, if a dependency seems required, or if any cell must be treated as untrusted input.
- **Execution profile:** Pure JavaScript, ES modules, `node --test`. No network, no persistence, no UI.
- **Tail ownership:** The implementer runs the test suite. Committing and shipping are outside this plan.

## Product Contract

### Summary

Add a CSV download for existing reports that mirrors the JSON download's access behavior and error format, producing a UTF-8 body with one header row and RFC 4180 style quoting.

### Problem Frame

Owners can already download a report as JSON through `downloadJson` in `src/download.js`, which resolves the report from the store and enforces ownership before returning a 200 response. Spreadsheet users need the same data as CSV. No product decision is open: the README fixes the format, the access rules, the size bounds, and the scope exclusions.

### Requirements

**Access and errors**

- R1. The CSV download resolves the report and checks ownership the same way the JSON download does: a missing report raises an error with status 404, a non-owner raises an error with status 403, and the thrown error shape matches the JSON path.
- R2. A successful CSV download returns status 200 with a CSV content type header.

**CSV body**

- R3. The body is UTF-8 text with exactly one header row taken from the report's columns, followed by one row per report row, preserving row order and column order.
- R4. A cell containing a comma, a double quote, a carriage return, or a line feed is wrapped in double quotes, with each embedded double quote doubled. Other cells are emitted unchanged.
- R5. A report with zero rows produces a body containing only the header row.

**Scope constraints**

- R6. No new dependency, storage backend, provider abstraction, UI, or retention policy is introduced. The CSV is generated on request and never persisted.

### Success Criteria

- The plan's test scenarios pass under `node --test`, and the existing JSON download tests remain unchanged and green.
- A body produced for a report whose cells contain commas, quotes, and newlines round-trips through a strict RFC 4180 reader back to the original cells.

### Scope Boundaries

- Cells are trusted server-generated strings (README). No input sanitization, no CSV injection guard for formula-leading cells.
- Reports are bounded to 200 rows and 10 columns by the creation service. No streaming or chunked output.
- No changes to `src/store.js` or `src/access.js`.

#### Deferred to Follow-Up Work

- None identified.

## Planning Contract

### Key Technical Decisions

- KTD1. **`downloadCsv` is a sibling of `downloadJson` in `src/download.js` with the same signature `(reports, id, userId)`.** It calls `loadReport` then `assertOwner` in the same order so R1 holds by construction rather than by re-implementation.
- KTD2. **CSV serialization lives in a new local module, `src/csv.js`, with no dependency.** The 200 by 10 bound (R6, Scope Boundaries) makes a whole-string build adequate, and a separate module keeps the quoting rule testable without the access layer.
- KTD3. **Quoting is minimal, not universal.** Only cells that need it under R4 are quoted. This keeps simple bodies readable and diff-friendly while staying RFC 4180 compatible.
- KTD4. **Row terminator is CRLF, including after the final row.** RFC 4180 specifies CRLF, and spreadsheet importers accept it universally. The serializer must therefore treat a lone LF inside a cell as a quoting trigger (R4), never as a row break.
- KTD5. **Tests use `node:test` and `node:assert/strict` in root-level `*.test.js` files**, matching `download.test.js` and the `npm test` script.

### Assumptions

These are agent bets not confirmed by the request. Each is cheap to change during implementation.

- The content type header value is `text/csv; charset=utf-8`. The README requires UTF-8 and does not name the header.
- No `content-disposition` header is set, mirroring the JSON download, which sets only `content-type`. If the caller needs a filename hint, add the header in U2 without changing anything else.
- No byte order mark is written. Plain UTF-8 satisfies the README and avoids a stray first cell in tools that do not strip a BOM.
- Cells are already strings (README). The serializer does not coerce or validate cell types.
- Column names are quoted under the same rule as data cells (R4), since they are report-provided strings too.

## Implementation Units

### U1. CSV serializer

- **Goal:** Turn a column list and a row list into a CSV string that satisfies R3, R4, R5.
- **Requirements:** R3, R4, R5, R6
- **Dependencies:** None
- **Files:** `src/csv.js` (new), `csv.test.js` (new)
- **Approach:**
  1. Export one function that takes columns and rows and returns the full CSV text (KTD2).
  2. A cell formatter applies the R4 quoting rule; the row joiner uses commas; rows join with CRLF and the text ends with CRLF (KTD3, KTD4).
  3. The header row is the columns array passed through the same cell formatter.
- **Execution note:** Write the quoting tests first. The escaping edge cases are the only real logic in this feature and are easy to get subtly wrong.
- **Patterns to follow:** Small named exports, one concern per file, as in `src/access.js` and `src/store.js`.
- **Test scenarios:**
  - Columns `name, total` and one row `A, 5` produce `name,total` CRLF `A,5` CRLF.
  - A cell `a,b` is emitted as `"a,b"`.
  - A cell `say "hi"` is emitted as `"say ""hi"""`.
  - A cell containing a line feed is quoted and the line feed is preserved inside the quotes, so the output still has exactly two CRLF row terminators for a header plus one row.
  - A cell containing a carriage return is quoted.
  - An empty string cell is emitted as an empty field with no quotes, so a row `["", "x"]` renders as `,x`.
  - Zero rows with two columns produce only the header line terminated by CRLF.
  - Row order and column order in the output match input order for a three-row, three-column input.
  - A column name containing a comma is quoted in the header row.
  - Round trip: a fixture whose cells contain commas, double quotes, a carriage return, a line feed, and an empty string is serialized and then parsed by a small strict RFC 4180 reader defined inside `csv.test.js` (test-local, no import, no dependency), and the parsed cells deep-equal the input. This is the test that proves the Success Criteria round-trip item.
- **Verification:** `csv.test.js` passes under `node --test`, including the round-trip scenario, and the serializer has no imports.

### U2. CSV download function

- **Goal:** Expose `downloadCsv` with the JSON download's access behavior and a 200 CSV response.
- **Requirements:** R1, R2, R3, R6
- **Dependencies:** U1
- **Files:** `src/download.js` (modify), `download.test.js` (modify)
- **Approach:**
  1. Add `downloadCsv(reports, id, userId)` beside `downloadJson` (KTD1).
  2. Call `loadReport` then `assertOwner`, exactly as `downloadJson` does.
  3. Return `{status: 200, headers: {"content-type": <assumed value>}, body}` where `body` comes from the U1 serializer over `report.columns` and `report.rows`.
- **Patterns to follow:** `downloadJson` in `src/download.js` is the template. Keep the response object shape identical apart from header value and body.
- **Test scenarios:**
  - Owner downloads CSV: status is 200 and the content type header starts with `text/csv`.
  - Owner downloads CSV: body equals the expected CSV text for the fixture report, including the CRLF terminators.
  - Non-owner gets an error with status 403 and the CSV path throws the same error message as the JSON path.
  - Missing report gets an error with status 404.
  - A fixture report whose cell contains a comma and a quote produces a body where that cell is correctly quoted, proving the serializer is wired in.
  - Existing JSON download tests still pass unchanged.
- **Verification:** All tests in `download.test.js` and `csv.test.js` pass under `node --test`; `downloadJson` is untouched.

## Verification Contract

| Gate | Command | Applies to | Pass signal |
|---|---|---|---|
| Unit tests | `npm test` (runs `node --test`) | U1, U2 | All tests pass, including the three pre-existing JSON tests and the U1 round-trip scenario that proves the Success Criteria round-trip item |
| Dependency check | Inspect `package.json` | U1, U2 | No `dependencies` or `devDependencies` added |
| Scope check | Inspect the diff | U1, U2 | Only `src/csv.js`, `src/download.js`, `csv.test.js`, `download.test.js` changed or added |

## Definition of Done

- Both units implemented and every listed test scenario has a corresponding passing test.
- `downloadJson`, `src/access.js`, and `src/store.js` are byte-for-byte unchanged.
- No new dependency, no persisted files, no UI.
- No experimental or abandoned code left in the diff.
