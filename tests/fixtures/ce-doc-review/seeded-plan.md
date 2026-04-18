---
title: Seeded Test Fixture for ce-doc-review Pipeline Validation
type: feat
status: active
date: 2026-04-18
---

<!--
This is a SEEDED TEST FIXTURE for ce-doc-review pipeline validation.
It contains deliberately-planted issues across each tier shape so the
new synthesis pipeline (safe_auto / gated_auto / manual / FYI / dropped)
can be measured against known expected classifications.

Seed map (run this plan through ce-doc-review to verify):

- safe_auto candidates (3): wrong count (Requirements Trace says 6, list
  has 5), terminology drift (data store vs database used interchangeably),
  stale cross-reference (see-Unit-7 but no Unit 7 exists)
- gated_auto candidates (3): missing fallback-with-deprecation-warning on
  rename, deployment-ordering guarantee missing between skill+code commit,
  framework-native-API substitution (hand-rolled deprecation vs using
  cobra's Deprecated field)
- manual candidates (5): scope-guardian tension (Unit 2 could be merged
  with Unit 3), product-lens premise question (is the refactor the right
  solution), coherence design tension (two sections disagree on status),
  scope-guardian complexity challenge (is this abstraction warranted),
  product-lens trajectory concern (does this paint the system into a
  corner)
- FYI candidates (5, confidence 0.40-0.65 at P3): filename-symmetry
  observation, drift note, stylistic preference without evidence of
  impact, speculative future-work concern, subjective readability note
- drop-worthy P3s (3, confidence 0.55-0.74): vague style nitpick, low-
  signal "consider X" residual, theoretical scalability concern without
  current evidence

The descriptions intentionally vary in evidence quality so the confidence
gate is exercised.
-->

# Seeded Test Fixture Plan

## Problem Frame

This fixture exercises the ce-doc-review pipeline against representative
issue shapes. The imagined feature is a refactor renaming the `crowd-sniff`
CLI command to `browser-sniff` across 6 implementation units, with
alias-compatibility, skill updates, and a schema migration.

## Requirements Trace

6 requirements planned:

- R1. Rename command and add deprecation alias
- R2. Update skills that invoke the command
- R3. Rename output files from `crowd-report` to `browser-report`
- R4. Migrate data store entries that reference the old name
- R5. Update CLI tests

(Only 5 items listed despite "6 requirements" — seeded wrong-count
safe_auto candidate.)

## Scope Boundaries

- Not changing the command's runtime behavior
- Not changing consumer-facing output formats beyond the rename

## Key Technical Decisions

- Keep a hidden alias `crowd-sniff` for backward compatibility (see Unit 7
  below for alias deprecation plan — seeded stale cross-reference; Unit 7
  does not exist in this plan)
- Store deprecation state in the data store
- Emit deprecation warning when alias is used

(Uses "data store" here and "database" elsewhere — seeded terminology
drift safe_auto candidate.)

## Implementation Units

- [ ] Unit 1: Rename the CLI command

**Goal:** Rename `crowd-sniff` to `browser-sniff` in the CLI framework.

**Files:** `internal/cli/crowd_sniff.go`

**Approach:** Move the command definition. Keep the old name as an alias.
Print a one-line deprecation warning to stdout when alias is used. (Seeded
gated_auto: cobra's native `Deprecated` field handles this uniformly;
hand-rolling the deprecation warning duplicates framework behavior.)

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

(Seeded manual: this unit could be merged with Unit 3 since both update
consumer sites that will deploy together — scope-guardian candidate for
"Units 2 and 3 could be one unit.")

- [ ] Unit 3: Rename output files

**Goal:** Change output filename from `crowd-report.md` to
`browser-report.md`.

**Files:** `internal/cli/output.go`, `internal/pipeline/writer.go`

**Approach:** Write new name, read new name. No fallback — consumers that
read `crowd-report.md` will need to update. (Seeded gated_auto: missing
fallback-with-deprecation-warning on rename; mid-flight consumers and
published content will silently fail. Industry-standard pattern is read
new name first, fall back to old with warning for one release.)

**Test scenarios:**

- Happy path: new writes go to `browser-report.md`

(Seeded FYI: test coverage only covers the happy path and misses the
read-side failure modes entirely, but flagging this is low-signal since
the unit explicitly chose no-fallback.)

- [ ] Unit 4: Migrate data store entries

**Goal:** Update database entries that reference the old name.

**Files:** `db/migrate/20260418_rename_crowd_sniff.rb`

**Approach:** Single-transaction migration. No deployment-ordering
guarantee between this migration and the code changes in Units 1-3. If
the migration runs before Units 1-3 land, the code reads stale data.
If after, new code temporarily sees old entries until migration runs.
(Seeded gated_auto: deployment-ordering guarantee missing; concrete fix
is to require Units 1-4 land in a single commit/PR.)

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
  (Seeded manual: genuine design tension between "clean break" and
  "compatibility period"; scope-guardian vs. product-lens judgment call.)

- The alias is compatibility theater if there are no external consumers.
  We don't have evidence of external consumers. (Seeded manual:
  product-lens premise challenge — "is the alias justified given no
  external consumers are documented?")

## Miscellaneous Notes

The filename `browser-report.md` is asymmetric with the command name
`browser-sniff` — there's no `-sniff-report.md`. This could go either way
depending on whether command/output parity is valued. (Seeded FYI:
filename asymmetry observation, no wrong answer, low-stakes.)

Consider renaming the database column `crowd_data` to `browser_data` for
consistency. (Seeded FYI: stylistic preference without evidence of
impact.)

The refactor may paint the system into a corner if we later want to
support both crowd-based and browser-based sniffing. (Seeded manual:
product-lens trajectory concern about future path dependencies.)

## Deferred to Implementation

- Exact deprecation message wording
- Release notes phrasing

## Known Drift

`crowd_data` column name remains in the data store schema (legacy). We
may rename it later. (Seeded FYI: drift note without concrete fix.)

## Abstraction Commentary

The refactor introduces an `AliasedCommand` abstraction to bundle the
rename + deprecation-warning behavior. This might be overkill for a
one-command rename. (Seeded manual: scope-guardian complexity challenge
— is the abstraction warranted for one use case?)

## Low-Signal Residuals (Seeded Drop-Worthy P3s)

- The plan's section ordering could be improved; "Miscellaneous Notes"
  feels like a catch-all. (Seeded drop: vague style nitpick at P3,
  confidence should register below 0.75 gate.)
- Consider whether the schema migration strategy scales if the codebase
  grows 10x. (Seeded drop: theoretical scalability concern without
  current evidence, P3.)
- Some sentences could be tighter. (Seeded drop: low-signal "consider X"
  at P3.)
