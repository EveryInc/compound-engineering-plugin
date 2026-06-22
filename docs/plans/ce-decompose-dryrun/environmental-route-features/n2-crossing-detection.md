# n2 — Street-crossing detection + busyness weighting (pure compute)

- **Stage:** work · **Model:** generation · **Depends on:** n1
- **Base commit:** `<main@decompose>`

## Goal

Pure-compute module that, given a route's geometry, detects where it crosses roads and produces a
traffic-weighted crossing score. No schema, no wiring — reviewable and tunable in isolation.

## Requirements

- New pure function `compute_crossing_features(display_geometry_4326, distance_meters, *, db_alias="default") -> CrossingFeatures`.
- `CrossingFeatures` is a frozen dataclass: `crossing_count`, `crossings_per_mile`, `crossing_burden`.
- Busyness weighting derives from the `highway`/`lanes`/`maxspeed` attributes carried by n1.
- Mirror the purity/shape of the existing `pipeline/seasonal.py` module.

## Dependencies

- **n1** — reads `ReferenceTrail.highway/lanes/maxspeed`. Without n1's attributes there is nothing to
  weight a crossing by. (Edge basis: file-level read of the columns n1 creates.)

## Files

- `src/routes/pipeline/crossings.py` (create) — the pure compute module.
- `src/routes/pipeline/seasonal.py` (modify — none expected; reference only for shape).

## Approach

Intersect the route line against the OSM road network (PostGIS), classify each intersection by the
crossed road's attributes, weight by a busyness function, normalize by route distance. Keep all DB
access read-only and parameterized; no persistence here (that is n3).

## Test scenarios

- Urban route crosses many busy roads → high `crossings_per_mile` and `crossing_burden`.
- Mountain route crosses almost nothing → near-zero (Denver spot-check: urban 3.86/mi vs mountain 0.06/mi).
- A route that runs *along* a road without crossing it is not counted as a crossing.

## Verification

`compute_crossing_features` returns the dataclass with sane ranking direction on a CO sample.
(Shipped: PR #396.)
