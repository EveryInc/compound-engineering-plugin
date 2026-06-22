# n9 — Canopy follow-ups: NULL-vs-0.0 semantics + sort index + priority cliff (BRIEF)

- **Stage:** plan · **Model:** generation · **Depends on:** n5
- **Brief** (not a plan): a small mixed bag of follow-ups, one of which (no-data semantics) is a data-
  model judgment call — so it enters at `plan`. None block CO v1; items 1 and 3 should land before
  expanding canopy beyond CO.

## Findings to address

1. **`canopy_fraction` conflates "no data" with "shadeless."** `compute_canopy_fraction` returns `0.0`
   both when a route has genuinely no canopy and when no `CanopyCoverage` is loaded for the region.
   Decide NULL-vs-0.0 semantics so `min_shade` and any future sort don't treat unmapped regions as
   "fully sunny." (This is the judgment call that makes the node `plan`, not `work`.)
2. **`canopy_fraction` sort index.** v1 shipped filter-only; add a sort key without breaking the cursor
   pagination index (same constraint n4/n5 respected).
3. **KTD5 priority cliff** (from the n5 review) — confirm and address.

## Likely files (to confirm during planning)

- `src/routes/pipeline/canopy.py` (modify) — no-data semantics.
- `src/routes/api/filters.py` / cursor-pagination migration (modify/create) — sort index.

## Exit criterion

Unmapped regions are distinguishable from genuinely-shadeless routes; `canopy_fraction` is sortable
without a cursor regression.
