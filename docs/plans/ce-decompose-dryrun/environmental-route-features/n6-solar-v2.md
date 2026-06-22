# n6 — Solar shade v2: time-of-day / day-of-year shade (BRIEF)

- **Stage:** brainstorm · **Model:** ceiling · **Depends on:** n3
- **Brief** (not a plan): this node is genuinely unresolved and enters the pipeline at `brainstorm`.

## Why this is a brief, not a plan

This is the real *"shaded morning run"* ask — shade as a function of sun position (time-of-day ×
day-of-year), not a static canopy fraction. It is a large data-engineering effort with unresolved
approach, so ce-decompose writes a brief and tags `stage: brainstorm` / `model: ceiling` rather than
embedding a `ce-plan` plan. **Write a dedicated brainstorm/plan before building.**

## What is already locked (constrains the eventual design)

- The `shade_by_time` JSONB column was added up front in n3, so the schema is already compatible — the
  output of this node has a home on the sidecar without a new migration.

## Open questions to resolve in brainstorm

- **Height surface (the bulk of the work):** USGS 3DEP bare-earth DEM (1–10m) **plus** an above-ground
  layer (canopy *height*, and building heights for cities). How are these sourced, merged, and stored?
- **Shade computation:** sun-position model × the height surface → is a point shaded at (lat, lon, t)?
  What time/day granularity is stored, and at what spatial resolution?
- **Storage shape:** what exactly goes in `shade_by_time` — a coarse grid? per-route precomputed
  buckets? How does it stay backfillable and `features_version`-aware like the rest of n3's sidecar?
- **Search exposure:** how does a time-parameterized shade value become a filter/sort target without
  breaking the cursor index (the constraint n4/n5 respected)?

## Rough scope signal

Larger than every other node combined; almost certainly decomposes into its own multi-node sub-graph
(data sourcing, height-surface build, shade compute, materialization, search exposure). Do not attempt
to plan it as one unit.
