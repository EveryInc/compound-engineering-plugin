# Anomaly Ledger

The ledger is a per-run JSONL artifact for incidental observations found during Phase 3 and reconciled in Phase 4.

## Artifact

| Property | Value |
|----------|-------|
| Path | `tests/user-flows/.user-test-anomalies.jsonl` |
| Git state | Gitignored ephemeral artifact |
| Tier | Same tier as `tests/user-flows/.user-test-last-run.json` |
| Lifetime | Reset per run; in iterate mode, reset once before iteration 1 and keep appending through the session. Durable outcomes graduate through report sections, `bugs.md`, or `explore_next_run` |

Delete the ledger file immediately before the first Phase 3 action. Do not delete it during Phase 1 or Phase 2; an early abort must not destroy a prior run's uncommitted ledger.

After reset, write the header line before the first entry line.

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

`at_index` is required when `index_range` is null. It records the counter value at the transition.

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

## Score Evidence Collection

For every final non-null UX or Quality score, write score evidence into that area's `evidence` array.

Use evidence notes to name the supported score dimension (`UX` or `Quality`) and the observed behavior.

Every non-null score dimension needs at least one evidence entry.

A dimension scored `2` or below, or dropped one or more points from the prior run's same dimension, needs at least two evidence entries with at least one concrete `ref`. The prior score lives in `score-history.json`.

When the final score needs more support than the collected evidence supplies, gather more evidence by re-opening the area or set the dimension to null because a disconnect prevents supported scoring.

Never replace a lowered score with a higher evidence-supported score.

## Append Timing

Append a batch of lines at every area transition: one line per anomaly noticed en route, or exactly one explicit `none` line.

Append one dedicated `pre-area` line for journeys and cross-area probes that start before the first normal area.

Append the final batch at the end of the last area's verification pass. This final append still belongs to Phase 3.

## Range Semantics

`index_range` values are inclusive `[start, end]` execution-index spans.

Write ranges that are disjoint and gap-free from `0` through `final_execution_index` from the agent's view of the run.

If disconnect recovery makes a span uncertain, record the disconnect in run results instead of inventing a range.

The execution-index counter continues monotonically across iterate-mode iterations; do not reset it per iteration.

In iterate mode, keep one session ledger across all iterations; do not reset it after iteration 1.

## Phase 4 Reconciliation

Before writing `.user-test-last-run.json`, reconcile the live ledger.

In iterate mode, each iteration reconciles only the ledger lines appended during that iteration.

Every anomaly ledger line gets one entry in the run JSON's top-level `anomalies[]`. `none` lines do not become anomaly entries.

Each reconciled anomaly entry copies the ledger line fields and adds:

| Field | Value |
|-------|-------|
| `disposition` | `filed`, `noted-in-area`, `explore-next-run`, or `dismissed` |
| `issue_ref` | Optional for `filed`; may reference a pre-existing issue |
| `reason` | Required and non-empty for `dismissed` |

Compute `anomaly_ledger_digest` from the exact on-disk ledger bytes after the final append, immediately before writing the run JSON:

```bash
python3 -c "import hashlib,sys; b=open('tests/user-flows/.user-test-anomalies.jsonl','rb').read(); print(len(b.splitlines()), hashlib.sha256(b).hexdigest())"
```

Phase 4 records `anomaly_ledger_digest` in the run JSON with `{ "lines": <int>, "sha256": "<hex digest>" }`.

Phase 4 records `final_execution_index` as the run's last consumed execution-index value.

If reconciliation or score-evidence review exposes missing support, re-open the relevant area before Run Results Persistence or set the affected score dimension to null because of disconnect.

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

Agent remediation:

| Code | Agent remediation |
|------|-------------------|
| `anomaly_undispositioned` | Add a disposition for the cited ledger line in `anomalies[]`. |
| `dismissal_reason_empty` | Complete the cited `dismissed` disposition with a non-empty reason in `anomalies[]`. |
| `evidence_minimum` | Gather more evidence by re-opening the area or disconnect-null the dimension; never restore the higher score. |
| `evidence_ref_out_of_range` | Correct `final_execution_index` or the offending evidence `ref`; the error payload names both values. |
| `final_index_understated` | Correct `final_execution_index` or the offending indexed payload value; the error payload names both values. |
| `ledger_tiling` | Fix the cited ledger line's `index_range` so coverage is disjoint and gap-free from `0` through `final_execution_index`. |
| `ledger_digest_mismatch` | Recompute the digest from the on-disk ledger with the recipe above and rebuild the payload. |
| `ledger_missing` | The ledger for this run is absent; re-run Phase 3's ledger protocol before committing and do not hand-forge a ledger. |
| `ledger_foreign` | The ledger belongs to another run; re-run Phase 3's ledger protocol before committing and do not hand-forge a ledger. |
| `marker_with_live_ledger` | The run is v11-live; remove the stale migration marker by completing Phase 4 reconciliation properly and rebuild the payload. |
| `MIGRATION-DEFAULTS-WARN` | Non-blocking; continue after `PLANNED`. |

Warning sentinel:

| Sentinel |
|----------|
| `MIGRATION-DEFAULTS-WARN` |
