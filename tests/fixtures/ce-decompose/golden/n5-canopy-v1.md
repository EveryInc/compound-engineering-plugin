# n5 — Canopy shade v1: canopy_fraction feature + min_shade filter

- **Stage:** work · **Model:** generation · **Depends on:** n3
- **Base commit:** `<main@decompose>`

> **Delivery note (key status finding):** this node's *code* is mergeable in isolation, but the feature
> is **inert until n10 loads the canopy data**. Re-orient will derive `done` from a merged PR while the
> feature returns nothing in prod. The graph keeps this honest only because the data load is a separate
> node (n10) that is still `not-started`. See FINDINGS F1.

## Goal

Time-independent `canopy_fraction` (% of a route under tree canopy) plus a `min_shade` search filter —
the cheap "lots of shade" approximation that loosely answers the shade ask without solar geometry.
Reuses all of n3's plumbing.

## Requirements

- `CanopyCoverage(region, geom MultiPolygon 3857, source, resolution_m)` model for vectorized
  canopy ≥ threshold polygons (USGS NLCD Tree Canopy Cover, 30m CONUS).
- `load_canopy` loader (shells out to `ogr2ogr` — shares the IAM path that n7 fixes).
- `compute_canopy_fraction(display_geometry, *, db_alias)` pure compute → fraction in [0,1].
- Materialize `canopy_fraction` into the n3 sidecar at promotion (field already reserved by n3).
- `min_shade` search filter (filter-only, cursor-compatible, like n4).

## Dependencies

- **n3** — writes `canopy_fraction` into the `RouteFeatures` field n3 reserved. (Edge basis: writes a
  column n3 creates.)

## Files

- `src/routes/models.py` (modify) — add `CanopyCoverage`.
- `src/routes/migrations/00XX_canopycoverage.py` (create).
- `src/routes/pipeline/canopy.py` (create) — `compute_canopy_fraction`.
- `src/routes/loaders/load_canopy.py` (create) — NLCD vector loader (ogr2ogr).
- `src/routes/api/filters.py` (modify) — add `min_shade`.

## Approach

Mirror the n2→n3 split: pure compute in `canopy.py`, persistence via the reserved sidecar field, filter
beside the crossing filters. Vectorize canopy ≥ ~20% offline; load as `CanopyCoverage` polygons.

## Test scenarios

- A tree-lined route gets a high `canopy_fraction`; an open route gets low.
- `min_shade=0.5` excludes the open route.
- **No-data case:** a region with no `CanopyCoverage` loaded → `compute_canopy_fraction` returns `0.0`
  today (this conflation of "no data" vs "shadeless" is the subject of follow-up n9).

## Verification

Code path works end to end on loaded data; `min_shade` filters. (Shipped: PR #414. **Feature inert in
prod until n10 runs.**)
