# n10 — Ops: vectorize + load CO NLCD canopy into prod, run canopy backfill

- **Stage:** work · **Model:** generation · **Depends on:** n5, n7
- **Base commit:** `<main@decompose>`

> **Ops / no-code node (key status finding).** This is an operator runbook, not a code change — it will
> produce **no branch and no PR**. Under the status rules (KTD10), a no-PR node can only reach `done`
> via a `manual_status: done` pin; re-orient will otherwise show it `not-started` forever. The decompose
> phase flags that here so the human knows to pin it on completion. See FINDINGS F2. (Embedded as a
> `work` node because the steps are fully settled, but "work" presumes code+PR — there is no `ops`
> stage in the v1 vocabulary.)

## Goal

Turn on `min_shade` for Colorado by loading real canopy data: n5's code is merged and deployed, but
`routes_canopycoverage` is empty, so `canopy_fraction` is `0.0` everywhere and `min_shade` returns
nothing useful.

## Dependencies

- **n5** — the `CanopyCoverage` model, `load_canopy`, and `compute_canopy_fraction` must be deployed
  first. (Edge basis: this runbook invokes code n5 creates.)
- **n7** — `load_canopy` shells out to `ogr2ogr`, which needs the IAM auth fix. (Edge basis: runtime
  dependency on n7's loader auth path.)

## Runbook (steps, not files)

1. Offline raster → vector prep: clip USGS NLCD Tree Canopy Cover to CO, threshold (≥~20%), vectorize to
   `MultiPolygon` 3857.
2. `load_canopy` the vectorized polygons into prod `routes_canopycoverage` (under IAM auth, via n7).
3. `backfill_route_features` for CO so `canopy_fraction` populates on existing routes.
4. Spot-check `min_shade` returns shaded CO routes; confirm `canopy_fraction` distribution is sane.

## Verification

`min_shade` returns useful results for CO in prod. **On completion, set `manual_status: done` on this
node** (no PR will exist to derive `done` from).
