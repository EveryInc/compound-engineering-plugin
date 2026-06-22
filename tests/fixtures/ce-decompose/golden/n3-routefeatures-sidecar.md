# n3 — RouteFeatures sidecar + promotion materialization + backfill

- **Stage:** work · **Model:** ceiling · **Depends on:** n2
- **Base commit:** `<main@decompose>`

> **Model-tier note (KTD6 in action):** this node is *fully specified* ("mirror `RouteRenderBundle`
> end to end"), which by settledness alone says `work`. But its *shape* is cross-cutting — a new
> model, a migration, a hook into the promotion path, and a backfill command — so the model tier is
> **ceiling**, not generation. Stage and model are assigned on independent axes.

## Goal

Persist n2's crossing output (and later canopy/solar) on routes via a 1:1 sidecar table, materialized
at promotion and backfillable, without touching `CandidateRoute` columns.

## Requirements

- `RouteFeatures` model: `OneToOneField(CandidateRoute, primary_key=True, related_name="routefeatures")`,
  `db_table="routes_routefeatures"`.
- Phase-A fields: `crossing_count` (Int), `crossings_per_mile` (Float), `crossing_burden` (Float).
- Add now, nullable, for forward-compat: `canopy_fraction` (Float), `shade_by_time` (JSONB) — so canopy
  v1 (n5) and solar v2 (n6) need no later migration.
- `features_version` distinct from `pipeline_version`.
- Materialize at **promotion**, sibling to `RouteRenderBundle` in `track_processor.process()`.
- `backfill_route_features` management command, idempotent.

## Dependencies

- **n2** — calls `compute_crossing_features` to populate the crossing fields. (Edge basis: imports and
  invokes the function n2 creates.)

## Files

- `src/routes/models.py` (modify) — add `RouteFeatures`.
- `src/routes/migrations/00XX_routefeatures.py` (create).
- `src/routes/pipeline/render_bundle.py` (modify — reference pattern) / `track_processor.py` (modify) —
  add the materialization hook beside render-bundle materialization.
- `src/routes/management/commands/backfill_route_features.py` (create).

## Approach

Mirror `RouteRenderBundle` end to end: model shape, the materialize-at-promotion hook, and the backfill
command. Stamp `features_version`. Keep the promotion hook cheap; watch `avg_features_materialize_s`
during the next active recluster.

## Test scenarios

- Promoting a route writes a `RouteFeatures` row with crossing fields populated and canopy/shade null.
- `backfill_route_features` populates existing routes idempotently (re-run is a no-op on already-current rows).
- `features_version` bump triggers re-materialization on the next promotion.

## Verification

Sidecar populated at promotion; one-time prod backfill complete (107,403 routes); promotion hook enabled
on prod. (Shipped: PRs #398, #408, #416.)
