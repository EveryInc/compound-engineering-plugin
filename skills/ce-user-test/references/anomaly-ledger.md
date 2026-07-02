# Anomaly Ledger

The ledger is a per-run JSONL artifact for incidental observations found during Phase 3 and reconciled in Phase 4.

## Artifact

| Property | Value |
|----------|-------|
| Path | `tests/user-flows/.user-test-anomalies.jsonl` |
| Git state | Gitignored ephemeral artifact |
| Tier | Same tier as `tests/user-flows/.user-test-last-run.json` |
| Lifetime | Reset per run; durable outcomes graduate through report sections, `bugs.md`, or `explore_next_run` |

Delete the ledger file immediately before the first Phase 3 action. Do not delete it during Phase 1 or Phase 2; an early abort must not destroy a prior run's uncommitted ledger.

## Header Line

The first line is a JSON object:

```json
{"ledger_version": 1, "run_timestamp": "<same value as the run JSON>", "scenario_slug": "<slug>"}
```

The header binds the live ledger to the run JSON by `run_timestamp` and `scenario_slug`.

## Entry Lines

Append one JSON object per entry line.

| Field | Required | Value |
|-------|----------|-------|
| `area` | yes | Area slug, or `pre-area` for pre-area coverage |
| `kind` | yes | `anomaly` or `none` |
| `what` | anomaly only | One-sentence anomaly description |
| `evidence` | anomaly only | Array of evidence entries; may be empty |
| `index_range` | yes | Inclusive `[start, end]`, or null for an empty-range marker |
| `at_index` | when `index_range` is null | Counter value at the transition |

An anomaly line has this shape:

```json
{
  "area": "<area-slug>",
  "kind": "anomaly",
  "what": "<one-sentence description>",
  "evidence": [
    {"type": "action", "ref": 12, "note": "save action produced the toast"}
  ],
  "index_range": [12, 30]
}
```

A no-anomaly line has this shape:

```json
{
  "area": "<area-slug>",
  "kind": "none",
  "index_range": [31, 40]
}
```

Use `"area": "pre-area"` for journeys and cross-area probes that happen before the first normal area. The pre-area line starts at execution index `0`.

Do not include `what` or `evidence` on `none` lines.

For a transition that consumed no execution indices, use the empty-range marker:

```json
{
  "area": "<area-slug>",
  "kind": "none",
  "index_range": null,
  "at_index": 31
}
```

`at_index` is required when `index_range` is null. It records the counter value at the transition, and tiling treats it as a zero-width marker at that boundary.

## Evidence Entries

Ledger anomaly evidence and `areas[].evidence` in [last-run-schema.md](./last-run-schema.md) share one entry shape:

```json
{"type": "action|dom|timing|count", "ref": "<typed reference>", "note": "<what this supports>"}
```

| Type | `ref` value |
|------|-------------|
| `action` | Execution index integer |
| `dom` | Selector or observed value string |
| `timing` | Seconds number |
| `count` | Count number or `N of M` string |

Every evidence entry includes a `note` that states what the entry supports.

## Append Timing

Append a batch of lines at every area transition: one line per anomaly noticed en route, or exactly one explicit `none` line.

Append one dedicated `pre-area` line for journeys and cross-area probes that start before the first normal area.

Append the final batch at the end of the last area's verification pass. This final append still belongs to Phase 3.

## Range Semantics

`index_range` values are inclusive `[start, end]` execution-index spans.

A completed run's ledger coverage is disjoint and gap-free from `0` through `final_execution_index`.

The engine normalizes a width-1 gap or overlap at a boundary shared by adjacent lines.

Interior gaps up to the run's recorded disconnect count are tolerated.

The execution-index counter continues monotonically across iterate-mode iterations; do not reset it per iteration.

## Phase 4 Reconciliation

Every anomaly ledger line gets one entry in the run JSON's top-level `anomalies[]`.

Each reconciled anomaly entry copies the ledger line fields and adds:

| Field | Value |
|-------|-------|
| `disposition` | `filed`, `noted-in-area`, `explore-next-run`, or `dismissed` |
| `issue_ref` | Optional for `filed`; may reference a pre-existing issue |
| `reason` | Required and non-empty for `dismissed` |

Phase 4 records `anomaly_ledger_digest` in the run JSON with `{ "lines": <int>, "sha256": "<hex digest>" }`.

When a score is lowered past its evidence support, do not replace it with the higher evidence-supported score. Re-open the area to gather evidence, or disconnect-null the dimension.

## Validation Names

`commit-engine.py` is the single canonical home of the validation rules.

Validation error codes:

| Code |
|------|
| `anomaly_undispositioned` |
| `dismissal_reason_empty` |
| `evidence_minimum` |
| `evidence_ref_out_of_range` |
| `ledger_tiling` |
| `ledger_digest_mismatch` |
| `ledger_missing` |
| `ledger_foreign` |
| `marker_with_live_ledger` |
| `final_index_understated` |

Warning sentinel:

| Sentinel |
|----------|
| `MIGRATION-DEFAULTS-WARN` |

## Evidence Minimums

Every non-null score dimension needs at least one evidence entry.

Either score dimension at `2` or below needs at least two evidence entries, with at least one concrete `ref`.

A score drop of one or more points from the prior run's same dimension needs at least two evidence entries, with at least one concrete `ref`. The prior score lives in `score-history.json`.
