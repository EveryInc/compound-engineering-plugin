# Sweep state schema (v1)

This is the canonical, versioned contract for the ce-sweep state file. The
deterministic state engine (`scripts/sweep-state.py`) is the **only** writer;
every peer agent (source connectors, the analyzer, the orchestrator) reads the
file and mutates it **exclusively** through the engine's subcommands so the
rules below are enforced in one place. Read this before touching state.

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

## Compatibility rule (forward/backward)

The engine is deliberately additive-safe so a newer writer and an older reader
can share a file:

| situation | engine behavior |
| --- | --- |
| Unknown top-level key | Preserved on every write-back. Never dropped. |
| Unknown field on an item or source | Preserved on write-back. Never dropped. |
| Unknown `status` value | Preserved and passed through. Skip-never-drop — the closed enum below is not a whitelist. |
| File parses but has no `schema_version` | Treated as `CORRUPT`; the engine refuses to write over it. |
| `schema_version` greater than the engine knows | Still read/written field-preservingly; the engine only *adds* rules per version, never removes fields. |

Bump `schema_version` only for a change that a v1 reader could misinterpret;
purely additive fields do not require a bump.

## Status enum

Closed set of known lifecycle states. Unknown values are preserved, never
dropped, so a future state can roll out writer-first.

| status | meaning |
| --- | --- |
| `ingested` | Captured from a source; not yet triaged. |
| `ack_deferred` | Receipt noted, but triage deferred to a later pass. |
| `acknowledged` | Triaged and accepted into the sweep pipeline. |
| `needs_download` | Referenced media/attachment must be fetched before analysis. |
| `needs_analysis` | Content present, awaiting analysis. |
| `manual_stuck` | Blocked; needs manual intervention to proceed. |
| `analyzed` | Analysis complete; findings recorded on the item. |
| `in_plan` | Folded into a plan or tracked work item. |
| `fix_pending` | A fix is underway or awaiting verification. Also the downgrade target for an under-evidenced `closed`. |
| `closed` | Resolved and verified. REQUIRES all three evidence fields (see below). |
| `source_gone` | The originating source or message no longer exists. |

## Evidence fields and the `validate` downgrade rule

A `closed` item is a claim that work shipped and was verified, so the engine
holds it to proof. An item may only remain `closed` if it carries all three:

| field | meaning |
| --- | --- |
| `fix_ref` | Reference to the fix (PR/commit/issue link). |
| `verified_merge_sha` | The merge commit SHA the fix landed on. |
| `verified_at` | ISO timestamp the fix was verified. |

`validate` scans every item and downgrades any `closed` item missing (or with a
falsy value for) any of these back to `fix_pending`, then rewrites the file and
returns the list of downgraded ids. This self-heals a state left inconsistent
by a crashed run. `validate` is lease-agnostic (it is a repair, run at sweep
start).

## `sensitive` semantics

The **primary** sensitivity mechanism is per-item: the orchestrator reads each
source's config `sensitive` flag and includes `"sensitive": true` in the item
JSON on every `upsert-item` for that source (SKILL.md phase 2d). A `sensitive:
true` on a **source entry** in state is a defensive fallback the engine also
honors, but nothing seeds it today — the per-item flag is what enforces R28, so
sensitivity works even though source entries carry only a `cursor`. On any
`upsert-item` where either the item or its source entry is sensitive, the engine
**drops `body` and `quote` before writing** — redacted content never reaches
disk. All other fields (title, url, status, ids) are retained. Redaction happens
at write time, so flipping a source to sensitive protects only items written
after the flag is set; re-ingest to redact prior items.

## id-keyed merge rule

Writers own keys, not the whole file. `upsert-item` performs an **id-keyed
merge**: it loads the existing item, replaces only the keys present in the
incoming JSON, and preserves every other field already on that item. `source`
is always (re)set from `--source`. No subcommand semantically rewrites the
whole file — each mutates only the keys it owns and preserves the rest — even
though the physical write re-emits the file atomically. This lets independent
connectors and the analyzer touch the same item across passes without clobbering
each other's fields.

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

The lease's guarantee depends on where the state file lives:

| topology | lease scope | protocol |
| --- | --- | --- |
| local-commit mode (default) | Single writer **per checkout**. | The lease serializes overlapping sweeps in the same working tree (e.g. a cron sweep and a manual one). The file is written in-tree (and may be committed locally). No cross-machine guarantee. |
| pushed-shared-branch | One writer **per repo**. | The state file lives on a shared branch multiple checkouts push to. `lease-acquire` must be committed, pushed, and confirmed (fetch back and verify our writer won) **before any source-side write**. This makes the lease a repo-wide mutex across machines. |

TTL-based reclaim (`STALE-RECLAIMED`) is what lets a crashed or killed writer's
lease be taken over after `ttl_minutes` without manual cleanup.

## run-record

Records the outcome of a sweep run under `last_run`.

| field | source | meaning |
| --- | --- | --- |
| `timestamp` | `--timestamp` (required) | Caller-supplied ISO run time. The engine never invents it. |
| `outcome` | `--outcome` | One of `completed`, `aborted-locked`, `partial`, `failed`. |
| `writer` | `--writer` | The writer id that recorded the run. |
| `counts` | `--counts` (JSON object) | Free-form tallies (per status, per source, etc.). |

`run-record` is intentionally **lease-agnostic**: a run that aborted precisely
because the lease was `LOCKED` (`outcome: aborted-locked`) must still be able to
record that fact — but that write happens while the lease holder is mid-sweep.
To keep it from clobbering the holder's concurrent upserts, every mutating
subcommand holds an **OS advisory lock** (`flock` on `<state>.lock`) across its
whole load-modify-write, so two concurrent invocations serialize their writes
regardless of lease ownership. The lease decides *who owns the sweep*; the file
lock decides *who is writing the file right now*. The `.lock` file is ephemeral
and never committed (the skill's commit step adds only the state file and the
plan, never `-A`).

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

## YAML subset

The state file is genuine YAML restricted to a small, deterministic subset so a
stdlib serializer/parser round-trips it exactly. Any YAML parser can read it;
only the engine writes it.

| construct | rule |
| --- | --- |
| Indentation | 2 spaces per level, no tabs. |
| Keys | Bare when they match `^[A-Za-z_][A-Za-z0-9_.-]*$`; otherwise a JSON double-quoted string (so ids with `:` are quoted). |
| Scalars | `null` / `true` / `false` / integers / floats are bare. **Strings are always JSON double-quoted on a single line** (fully escaped) — never block scalars or multiline. |
| Non-empty maps | Emitted as block mappings, recursing to any depth. |
| Lists and empty maps | Emitted as inline JSON flow on one line (e.g. `["a", "b"]`, `{}`) — itself valid YAML. |
| Key order | Deterministic: a preferred order for known keys, then remaining keys sorted, so diffs stay stable. |
| Comments / blank lines | Ignored on read. The engine does not emit comments. |

A file that fails to parse under these rules, or that parses without a
`schema_version`, is `CORRUPT`: the engine reports it and refuses to overwrite,
so a hand-mangled file is never silently clobbered.
