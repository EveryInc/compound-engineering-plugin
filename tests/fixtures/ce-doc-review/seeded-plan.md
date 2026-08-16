---
title: Rename crowd-sniff CLI Command to browser-sniff
type: feat
status: active
date: 2026-04-18
product_contract_source: ce-brainstorm
---

# Rename crowd-sniff CLI Command to browser-sniff

## Problem Frame

The `crowd-sniff` command name predates the current product framing and no
longer describes what the command does — it drives a headless browser and
captures a request trace. New users consistently misread the name as a
crowd-sourcing or telemetry-aggregation feature, and the mismatch shows up
in support threads and in our own skill docs.

This plan renames the `crowd-sniff` CLI command to `browser-sniff` across 6
implementation units, with alias-compatibility, skill updates, and a schema
migration.

## Requirements Trace

6 requirements planned:

- R1. Rename command and add deprecation alias
- R2. Update skills that invoke the command
- R3. Rename output files from `crowd-report` to `browser-report`
- R4. Migrate data store entries that reference the old name
- R5. Update CLI tests

## Scope Boundaries

- Not changing the command's runtime behavior
- Not changing consumer-facing output formats beyond the rename

## Key Technical Decisions

- Keep a hidden alias `crowd-sniff` for backward compatibility (see Unit 7
  below for the alias deprecation plan)
- Store deprecation state in the data store
- Emit deprecation warning when alias is used

## Implementation Units

- [ ] Unit 1: Rename the CLI command

**Goal:** Rename `crowd-sniff` to `browser-sniff` in the CLI framework.

**Files:** `internal/cli/crowd_sniff.go`

**Approach:** Move the command definition. Keep the old name as an alias.
Print a one-line deprecation warning to stdout when the alias is used.

**Test scenarios:**

- Happy path: `browser-sniff` runs without warning
- Happy path: `crowd-sniff` runs and prints deprecation warning
- Edge case: `-h` on either variant shows the same help

- [ ] Unit 2: Update skills to invoke new command

**Goal:** Update every skill that shells out to `crowd-sniff` to call
`browser-sniff` instead.

**Files:** `plugins/*/skills/*/SKILL.md` (grep for "crowd-sniff")

**Approach:** sed rename across skill files. Keep alias working for
external consumers that may still invoke `crowd-sniff` directly.

- [ ] Unit 3: Rename output files

**Goal:** Change output filename from `crowd-report.md` to
`browser-report.md`.

**Files:** `internal/cli/output.go`, `internal/pipeline/writer.go`

**Approach:** Write new name, read new name. No fallback — consumers that
read `crowd-report.md` will need to update.

**Test scenarios:**

- Happy path: new writes go to `browser-report.md`

- [ ] Unit 4: Migrate data store entries

**Goal:** Update database entries that reference the old name.

**Files:** `db/migrate/20260418_rename_crowd_sniff.rb`

**Approach:** Single-transaction migration. No deployment-ordering
guarantee between this migration and the code changes in Units 1-3. If
the migration runs before Units 1-3 land, the code reads stale data.
If after, new code temporarily sees old entries until migration runs.

- [ ] Unit 5: Update CLI tests

**Goal:** Update CLI tests to exercise both names.

**Files:** `internal/cli/cli_test.go`

**Approach:** Add test coverage for the new command name and the alias
behavior.

**Test scenarios:**

- Happy path: new name test
- Happy path: alias name test with deprecation warning assertion

## Risks

- The filename rename affects downstream consumers' readers. The chosen
  approach (no-fallback) is subjective and could go either way — keeping
  strict "move on" semantics vs. backward-compatible read fallback.

- The alias is compatibility theater if there are no external consumers.
  We don't have evidence of external consumers.

## Miscellaneous Notes

The filename `browser-report.md` is asymmetric with the command name
`browser-sniff` — there's no `-sniff-report.md`. This could go either way
depending on whether command/output parity is valued.

Consider renaming the database column `crowd_data` to `browser_data` for
consistency.

The refactor may paint the system into a corner if we later want to
support both crowd-based and browser-based sniffing.

## Deferred to Implementation

- Exact deprecation message wording
- Release notes phrasing

## Known Drift

`crowd_data` column name remains in the data store schema (legacy). We
may rename it later.

## Abstraction Commentary

The refactor introduces an `AliasedCommand` abstraction to bundle the
rename + deprecation-warning behavior. This might be overkill for a
one-command rename.

## Minor Observations

- The plan's section ordering could be improved; "Miscellaneous Notes"
  feels like a catch-all.
- Consider whether the schema migration strategy scales if the codebase
  grows 10x.
- Some sentences could be tighter.
