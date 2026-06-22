# n4 — Search API filter for crossing burden (index-compatible)

- **Stage:** work · **Model:** generation · **Depends on:** n3
- **Base commit:** `<main@decompose>`

## Goal

Expose the crossing feature in the search API as a filter (v1 = filter only, no sort, no cursor change).

## Requirements

- `max_crossings_per_mile` and `max_crossing_burden` query params.
- Filter must stay compatible with the existing cursor pagination index (no new sort key in v1; see
  migration `0059` / `RouteModelCursorPagination`).

## Dependencies

- **n3** — filters on `routefeatures__crossings_per_mile` / `routefeatures__crossing_burden`, which only
  exist once the sidecar (n3) is materialized. (Edge basis: queries columns n3 creates.)

## Files

- `src/routes/api/filters.py` (modify) — extend `apply_attribute_filters` with the two params, parsed via
  the existing `_parse_float`, filtering `routefeatures__*__lte=...`.
- `src/routes/api/views.py` (modify) — `select_related("routefeatures")` in `_promoted_search_queryset`.

## Approach

Add the two `__lte` filters; reuse `_parse_float`; `select_related` to avoid an N+1 on the sidecar. No
ordering change — staying filter-only keeps the cursor index valid.

## Test scenarios

- `max_crossings_per_mile=1.0` excludes the urban route, keeps the mountain route.
- Cursor pagination over a filtered result set returns stable pages (no index regression).
- Absent params → no behavior change.

## Verification

Filters apply, cursor pagination unaffected. (Shipped: PR #411.)
