# Sweep state schema (v1)

The contract for the ce-sweep state file, which only `scripts/sweep-state.py`
writes. The engine is additive-safe and atomic — unknown keys and unknown
statuses are preserved, `upsert-item` merges by id (it replaces only the keys
present in the incoming JSON), and a file that does not parse or lacks
`schema_version` is reported `CORRUPT` rather than overwritten. You never
hand-edit the file, so its serialization is not your concern.

## Top-level shape

```yaml
schema_version: 1
lease:
  writer: "sweep-2026-07-02-cron"
  timestamp: "2026-07-02T12:00:00+00:00"
  ttl_minutes: 60
sources:
  "slack:C42":
    cursor: "1699999999.000100"
    sensitive: true          # optional; config-derived
items:
  "slack:C42:1699999999.000100":
    source: "slack:C42"
    status: "acknowledged"
    # ...arbitrary connector fields...
last_run:
  timestamp: "2026-07-02T12:05:00+00:00"
  outcome: "completed"
  writer: "sweep-2026-07-02-cron"
  counts: {"ingested": 5, "closed": 1}
```

| key | type | meaning |
| --- | --- | --- |
| `schema_version` | int | Contract version. Currently `1`. A file missing this key is treated as corrupt. |
| `lease` | map | Single-writer mutex (see Lease). Absent when no writer holds it. |
| `sources` | map keyed by source id | Per-source resume cursor and optional flags. |
| `items` | map keyed by `<source-id>:<item-id>` | Per-item lifecycle record. The key is source-scoped so a source-native id (a Slack ts, a GitHub issue number) never collides with the same id from another source. Personas pass a source-native `id` plus `--source`; the engine composes the storage key and records both `source` and `id` on the item so it stays self-describing. |
| `last_run` | map | Bookkeeping for the most recent sweep (see run-record). |

## Status enum

The known lifecycle states, written verbatim: `ingested`, `ack_deferred`,
`acknowledged`, `needs_download`, `needs_analysis`, `manual_stuck`, `analyzed`,
`in_plan`, `fix_pending` (also the downgrade target for an under-evidenced
`closed`), `closed`, `source_gone`.

## Evidence fields and the `validate` downgrade rule

A `closed` item is a claim that work shipped and was verified, so it may only
remain `closed` while it carries all three of `fix_ref` (PR/commit reference),
`verified_merge_sha` (the merge commit the fix landed on), and `verified_at`
(ISO timestamp). `validate` downgrades any `closed` item missing (or falsy on)
one of these back to `fix_pending` and returns the downgraded ids — report them.

## `sensitive` semantics

On any `upsert-item` where the item or its source entry is sensitive, the engine
**drops `body` and `quote` before writing**; all other fields (title, url,
status, ids) are retained. Redaction happens at write time, so flipping a source
to sensitive protects only items written after the flag is set; re-ingest to
redact prior items.

## Lease (single-writer mutex)

| field | meaning |
| --- | --- |
| `writer` | Unique id of the writer holding the lease. |
| `timestamp` | ISO time the lease was last stamped — on acquire, and re-stamped on every owned mutating write. |
| `ttl_minutes` | Minutes after which an un-refreshed lease is reclaimable (default 60). |

Rules the engine enforces:

- `lease-acquire` succeeds (`OK`) when the lease is free or already held by the
  same writer (re-entrant, re-stamps). It returns `LOCKED` when a *live* lease
  is held by another writer, or `STALE-RECLAIMED` (with `previous_writer` /
  `previous_timestamp`) when it takes over a lease older than its TTL.
- Every mutating call (`upsert-item`, `cursor-advance`) **re-checks ownership**
  before writing and returns `LEASE-LOST` (no write) if the caller is not the
  current holder; on success it **re-stamps** the lease timestamp so a long
  sweep keeps the lease alive.
- `lease-release` clears the caller's own lease (`OK`, also `OK` if none is
  held); releasing another writer's lease returns `LEASE-LOST` and does not
  write.
- Staleness is only asserted when it can be *proven* from parseable timestamps;
  an unparseable lease timestamp is treated as live (never stomped).

## Topology scope

By default the lease is a single writer **per checkout** (it serializes
overlapping sweeps in one working tree). With `sweep_shared_branch: true` the
state file lives on a branch several checkouts push to, and the lease is only a
repo-wide mutex if `lease-acquire` is committed, pushed, and confirmed **before
any source-side write**. TTL-based reclaim (`STALE-RECLAIMED`) lets a crashed
writer's lease be taken over after `ttl_minutes` without manual cleanup.

## run-record

Records the outcome of a sweep run under `last_run`.

| field | source | meaning |
| --- | --- | --- |
| `timestamp` | `--timestamp` (required) | Caller-supplied ISO run time. The engine never invents it. |
| `outcome` | `--outcome` | One of `completed`, `aborted-locked`, `partial`, `failed`. |
| `writer` | `--writer` | The writer id that recorded the run. |
| `counts` | `--counts` (JSON object) | Free-form tallies (per status, per source, etc.). |

`run-record` is intentionally **lease-agnostic** so a run that aborted because
the lease was `LOCKED` can still record that fact; an OS advisory lock keeps
that write from clobbering the holder's concurrent upserts. The ephemeral
`<state>.lock` file is never committed (the skill's commit step adds only the
state file and the plan, never `-A`).

## Engine status words

Every subcommand prints one status word on line 1, then an optional JSON payload
on line 2. Operational conditions **exit 0** (never a traceback); only CLI
misuse exits non-zero.

| word | when | payload |
| --- | --- | --- |
| `OK` | success | command-specific JSON (or none) |
| `NO-STATE` | `read` on a file that does not exist yet | — |
| `CORRUPT` | file exists but does not parse as this schema | — |
| `LOCKED` | `lease-acquire`: a live lease is held by another writer | — |
| `STALE-RECLAIMED` | `lease-acquire`: an expired lease was taken over | `{previous_writer, previous_timestamp}` |
| `LEASE-LOST` | mutating call by a non-owner, or releasing another's lease (no write) | — |
| `REFUSED` | `cursor-advance`: unknown `past-item`, or a cursor that would regress | — |
| `ERROR` | unexpected internal error (defensive; still exit 0) | — |

