---
title: Add a --format Option to the report Command
type: feat
status: active
date: 2026-05-06
product_contract_source: ce-brainstorm
---

# Add a `--format` Option to the `report` Command

## Problem Frame

`report` prints one fixed human-readable table. Teams that feed it into their own
tooling re-parse that table with `awk`, which breaks every time a column width
changes. Three teams have now written the same fragile parser, and two of them
have filed bugs against us when a column grew. Giving the command a
machine-readable output mode removes the reason to parse the table at all.

## Requirements Trace

4 requirements planned:

- R1. Accept an option that selects the output representation
- R2. Support at least one representation suitable for piping into other tools
- R3. Support writing the rendered output to a file instead of stdout
- R4. Leave the default output byte-identical for callers that pass no option

## Scope Boundaries

- Not changing which rows or columns `report` computes
- Not adding new subcommands
- Not changing the flags of any other command

## Command Surface

`report` accepts these options today:

| Option | Help string |
|---|---|
| `--since` | Only include records after this date |
| `--team` | Restrict the report to one team |
| `--limit` | Maximum number of records to include |

This plan adds one:

| Option | Help string |
|---|---|
| `--format` | Output format for the report. |

## Verification

- `report` with no option produces output byte-identical to today's
- `report --format=json` produces a document a strict JSON parser accepts
- `report --format=csv` produces a header row followed by one row per record
- An unrecognized value exits non-zero with a message naming the accepted values

## Implementation Units

- [ ] Unit 1: Add the option and its accepted values

**Goal:** `report` accepts `--format` with the values `table`, `json`, and `csv`.

**Files:** `cli/commands/report.go`

**Approach:** Register a string option on the command. The accepted values are
`table`, `json`, and `csv`. The default comes from the config key
`report_output_style` when that key is set, and is `table` otherwise.

- [ ] Unit 2: Add the JSON and CSV renderers

**Goal:** Each accepted value has a renderer that turns the computed record set
into bytes.

**Files:** `cli/render/json.go`, `cli/render/csv.go`

**Approach:** Both renderers take the record set the table renderer already takes
and return bytes. The JSON renderer emits a single array of objects keyed by
column name. The CSV renderer emits a header row from the same column names and
then one row per record, quoting any value that contains a comma, a quote, or a
newline. The two renderers share nothing beyond the record set they read.

- [ ] Unit 3: Route the selected value to a renderer

**Goal:** The command dispatches to the renderer the option names and rejects
anything it does not recognize.

**Files:** `cli/commands/report.go`

**Approach:** Look the value up in a map from name to renderer. The map is
populated with `table` and `json`. On a lookup miss, exit non-zero with a message
listing the map's keys.

## Configuration

The default value can be set per repository. The key is named
`report_output_style`, matching the prose-style key names the rest of that file
already uses (`report_row_limit`, `report_default_team`). A value passed on the
command line wins over the config key; when neither is present the default is
`table`.

## Design Notes

**Renderer.** A renderer is a function from the computed record set to bytes,
paired with the name that selects it. The table renderer already exists in
`cli/render/table.go` and is unchanged by this plan; the two new renderers match
its signature.

**Third-party renderers.** Nothing in this shape prevents a plugin from
registering its own renderer someday. No plugin surface exists in the CLI today
and none is on the roadmap.

**Large reports.** The CSV renderer assembles its output in memory before writing
it out.

## Rollout

The change ships in one PR. Callers that pass no option are unaffected, so there
is no flag and no staged rollout.
