# n8 — Crossings calibration from Denver spot-check (BRIEF)

- **Stage:** plan · **Model:** ceiling · **Depends on:** n2, n3
- **Brief** (not a plan): findings are enumerated, but each needs empirical tuning judgment, so this
  enters at `plan` rather than `work`.

## Why this is a brief, not a plan

The first 10-route CO spot-check (2026-06-12) confirmed the pipeline works and ranks sanely (urban
3.86/mi vs mountain 0.06/mi). Three calibration findings are *known* but their fixes are judgment calls
that want a short planning pass and re-measurement, not a mechanical edit — hence `stage: plan`,
`model: ceiling`. (Borderline `plan`/`work`: it has concrete file targets but unresolved thresholds.
See FINDINGS F6.)

## Findings to address (in priority order)

1. **Split/duplicate intersection points inflate counts.** `ST_Dump` of a MultiPoint intersection emits
   one row per point, so a GPS line wiggling across an intersection is over-counted. Needs a
   dedupe/snapping rule — at what tolerance?
2. **Pedestrian-class weights are implicit.** Crossing a footway/cycleway should not weigh like crossing
   an arterial. Make the pedestrian-class weights explicit — what values?
3. **Per-road overlap gate.** A route running near/along a road shouldn't accrue repeated crossing credit
   — define the overlap gate.

## Likely files (to confirm during planning)

- `src/routes/pipeline/crossings.py` (modify) — dedupe, explicit weights, overlap gate.

## Exit criterion

Re-run the CO spot-check after each change; ranking direction stays sane and counts stop inflating on
the known problem routes. Promote to a `work` plan once thresholds are chosen.
