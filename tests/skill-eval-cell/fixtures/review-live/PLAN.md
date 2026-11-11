---
title: Add CSV report downloads
type: feat
status: ready
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
---
# CSV report downloads

## Product Contract
Project owners need CSV versions of reports they can already download as JSON. The approved outcome is a UTF-8 attachment with a header row, existing column order, and existing row order. Access and errors must match JSON downloads. Cells contain trusted server-generated strings; the existing creation service caps report dimensions. Keep JSON behavior unchanged. No UI, new storage, deletion policy, dependencies, streaming, or provider abstraction. We deliberately defer spreadsheet formatting and export history.

## Planning Contract
Add downloadCsv beside downloadJson, reusing current storage and access conventions. CSV serialization belongs in a small local helper; helper names and splitting files are implementation choices. Use the same synchronous return shape as downloadJson with content-type text/csv; charset=utf-8 and a Content-Disposition attachment with a constant report.csv filename. Quote cells containing comma, double quote or newline and double embedded quotes. Join records with CRLF.

## Implementation Units
### U1: Serialize CSV
Add src/csv.js. Emit columns first, followed by rows. Do not sort or modify the stored report. Use the product contract's quoting rules. Cover an empty report, a normal report, and cells containing comma, quote and newline in csv.test.js.
### U2: Add download route
Add downloadCsv(reports, id, userId) in src/download.js. Call loadReport(id, reports), serialize the result, and return status 200 with the attachment headers. This unit depends on U1. Follow the Product Contract for access and errors.
### U3: Verify the integration
Add tests in download.test.js for CSV output and the attachment headers. Run node --test, including the unchanged JSON tests. Compare the CSV parsed by inspection with the source rows for the escaping fixtures.

## Verification Contract
The existing JSON tests must pass. CSV tests must preserve column and row order and each cell value under the stated quoting rule. Missing and unauthorized report requests must have the same status as JSON. No data is stored or deleted by this endpoint.

## Definition of Done
The new endpoint and serializer are covered, JSON remains unchanged, and all tests pass. The caller can implement ordinary details without choosing new product behavior.
