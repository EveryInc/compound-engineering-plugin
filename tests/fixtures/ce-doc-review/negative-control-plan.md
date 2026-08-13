---
title: Add Request Duration to Structured Request Logs
type: feat
status: active
date: 2026-05-04
product_contract_source: ce-brainstorm
---

# Add Request Duration to Structured Request Logs

## Problem Frame

Our structured request logs record the method, path, status code, and a request
ID, but not how long the request took. Anyone answering "was that endpoint slow
last Tuesday?" has to join the access log against the metrics backend by request
ID — a two-system lookup for a value the process already holds at the moment the
log line is written.

This plan adds one numeric field to the existing request-log record. No new log
lines are emitted, no existing field changes shape, and log volume is unchanged.

## Requirements Trace

5 requirements planned:

- R1. Record elapsed wall-clock time for every request the logger already covers
- R2. Emit the value as a number rather than a preformatted string
- R3. Name the field consistently with the record's existing field-naming style
- R4. Leave existing fields, field ordering, and log volume unchanged

## Scope Boundaries

- Not adding new log lines or new log levels
- Not changing sampling, retention, or shipping configuration
- Not touching the metrics backend or any dashboard that reads from it
- Not backfilling the field into already-written logs

## Key Technical Decisions

- Reuse the monotonic start instant the middleware already records for the
  request-ID span instead of starting a second timer
- Record the value as an integer count of milliseconds, named `duration_ms`
- Emit the field on every request-log record, including responses on the error
  path (see Unit 5 for the error-path wiring)

## Implementation Units

- [ ] Unit 1: Capture elapsed time in the request middleware

**Goal:** Compute elapsed milliseconds at the point the request-log record is
assembled.

**Files:** `internal/httpx/middleware/request_log.go`

**Approach:** The middleware already stores a monotonic start instant on the
request context for the request-ID span. Read that instant when the response is
finalized, take the difference as an integer count of milliseconds, and set it on
the record the middleware already assembles before handing it to the encoder. The
error path finalizes through the same function, so there is no second call site.

- [ ] Unit 2: Add the field to the log record type

**Goal:** The record struct carries the new value so the encoder emits it.

**Files:** `internal/httpx/logging/record.go`

**Approach:** Add one integer field with the JSON tag `duration_ms`, placed after
`status_code` so the emitted key order matches the order the fields are already
declared in.

- [ ] Unit 3: Update the encoder test and its golden record

**Goal:** The encoder test asserts the exact JSON shape of a record, so its
expected output has to carry the new field.

**Files:** `internal/httpx/logging/record_test.go`

**Approach:** Add `elapsed_ms` to the expected record in the encoder test, and
update the checked-in golden file `internal/httpx/logging/testdata/request_log.golden.json`
so the two agree.

- [ ] Unit 4: Update the log-schema reference

**Goal:** The published log schema lists every field the request logger emits; it
needs the new one.

**Files:** `docs/reference/log-schema.md`

**Approach:** Add a table row with the field's name, type, unit, and a one-line
description, and extend the worked example on the same page so it carries the
field too.

## Verification

- `go test ./internal/httpx/...` passes with the updated golden record
- A request against the local dev server emits one record containing
  `elapsed_ms` alongside the existing fields, with no other field changed
- The field list in the schema reference matches the field list in an emitted
  record

## Rollout

The change ships in a single PR. There is no feature flag and no coordination
with the log pipeline: the shipper forwards whatever fields a record contains,
and the query layer treats an unrecognized field as an ordinary attribute. Logs
written before the deploy simply lack the field; Scope Boundaries above already
rules out backfilling them.

## Notes

The unit is milliseconds rather than microseconds because every other duration in
this codebase is expressed in milliseconds, and the request logger has no
sub-millisecond consumers.
