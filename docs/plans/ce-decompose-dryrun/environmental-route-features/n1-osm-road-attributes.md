# n1 — OSM road attributes on ReferenceTrail (highway/lanes/maxspeed)

- **Stage:** work · **Model:** generation · **Depends on:** (none — root)
- **Base commit:** `<main@pre-A2>`

## Goal

Carry OpenStreetMap road classification onto `ReferenceTrail` so downstream crossing detection has the
attributes it needs (`highway`, `lanes`, `maxspeed`) to weight a crossing by how busy the road is.

## Requirements

- `ReferenceTrail` persists `highway`, `lanes`, `maxspeed` parsed from OSM tags.
- `load_reference_trails` carries the attributes through ingestion.
- Free-form OSM tag values must not overflow bounded integer columns (a tag like `maxspeed=signals`
  or an absurd lane count must degrade gracefully, not raise).

## Files

- `src/routes/models.py` (modify) — add `highway`, `lanes`, `maxspeed` to `ReferenceTrail`.
- `src/routes/migrations/0086_*.py` (create), `src/routes/migrations/0087_*.py` (create) — schema + backfill.
- `src/routes/loaders/load_reference_trails.py` (modify) — parse + carry the OSM tags through.

## Approach

Mirror existing `ReferenceTrail` attribute handling. Parse OSM tags defensively; cast free-form values
through a bounded-int guard (see learning `free-form-osm-tag-cast-overflows-bounded-int.md`). Load
Colorado OSM roads into prod as the first dataset.

## Test scenarios

- A road with `highway=residential`, `lanes=2`, `maxspeed=25` round-trips onto `ReferenceTrail`.
- A free-form / out-of-range tag (`maxspeed=signals`, lanes far beyond int range) is clamped or nulled,
  not an error.

## Verification

Migrations `0086`/`0087` apply cleanly; CO OSM roads present in prod; `load_reference_trails` carries
the three attributes. (Shipped: PR #375, hardened by #386 and #390.)
