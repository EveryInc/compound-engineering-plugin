---
title: "feat: Compounding Quality — Richer Writebacks, Weakness Synthesis, Fingerprints, CLI Adversarial"
type: feat
status: completed
date: 2026-03-02
---

# feat: Compounding Quality

Four changes to make the existing compound loop actually compound. Each run
becomes smarter automatically — no new commands, no extra steps.

## Overview

| Change | Where | What It Does |
|--------|-------|-------------|
| 1. Richer commit writebacks | Commit Mode Step 1 | Persists tactical intelligence (selectors, timing, weakness class) back into area details |
| 2. Weakness-class synthesis | Phase 4, Step 6 | Cross-area adversarial targeting from failure patterns, not just instances |
| 3. Novelty fingerprint persistence | `.user-test-last-run.json` + Phase 3 | Prevents re-exploring territory already covered in prior runs |
| 4. CLI score 3 → adversarial browser | Phase 2.5 + Phase 3 | Partially-correct CLI results trigger harder browser probing |

## Problem Statement

Run-over-run, the user-test skill rediscovers the same information:

1. **Selectors are found then forgotten.** Run 1 discovers working DOM selectors
   (3-5 MCP calls). Run 2 discovers them again. The verify block has no way to
   persist confirmed selectors.

2. **Weakness patterns are instance-level, not class-level.** Three areas share
   the same "stale-react-state" failure pattern. Each is treated independently.
   No mechanism identifies or targets the shared weakness class.

3. **Novelty log expires between runs.** The novelty budget forces exploration,
   but the log resets each run. Run N+1 re-explores territory N already covered.

4. **CLI score 3 is a dead signal.** Score ≤2 skips browser. Score ≥4 passes
   through. Score 3 ("surface-level right, deeper reasoning wrong") proceeds
   normally — the adversarial sweet spot is wasted.

## SKILL.md Line Budget Strategy

SKILL.md is at **420 lines** (hard ceiling). All changes must net zero.

### Extraction Plan

| Extraction | Source Lines | Savings | Target |
|-----------|-------------|---------|--------|
| `.user-test-last-run.json` schema | SKILL.md:282-333 (52 lines) | ~45 lines (replace with 5-line pointer + version ref) | New `references/last-run-schema.md` |
| Phase 3 novelty budget inline | SKILL.md:110-115 (6 lines) | ~4 lines (compress to 2-line pointer) | Already in `queries-and-multiturn.md:128-194` |
| Phase 2.5 CLI detail | SKILL.md:84-97 (14 lines) | ~6 lines (compress to 8-line version) | Already in `queries-and-multiturn.md:62-83` |
| **Total freed** | | **~55 lines** | |

### Addition Plan

| Addition | Lines | Location |
|---------|-------|----------|
| Commit Mode Step 1: 3 new bullet points (notes, selectors, weakness_class) | ~8 | SKILL.md Commit Mode |
| Phase 4 Step 6: cross-area synthesis pointer | ~5 | SKILL.md Phase 4 |
| Phase 3: fingerprint check + adversarial mode trigger | ~6 | SKILL.md Phase 3 |
| Phase 2.5: adversarial flag check | ~5 | SKILL.md Phase 2.5 |
| JSON schema pointer to `last-run-schema.md` | ~5 | SKILL.md (replaces extracted block) |
| **Total added** | **~29** | |

**Net: -55 + 29 = -26 lines.** Comfortable margin. SKILL.md lands at ~394.

## Schema Version

All four changes ship together as **v8**. One migration event.

```
v7 → v8 changes:
- Area Details: optional **weakness_class:** field (below pass_threshold)
- Area Details: **verify:** blocks auto-updated with confirmed selectors by commit mode
- Areas table: Notes column receives tactical run notes in [Run N] format (max 3 entries)
- .user-test-last-run.json: new fields per area (tactical_note, confirmed_selectors,
  weakness_class, adversarial_browser, adversarial_trigger)
- .user-test-last-run.json: new top-level key novelty_fingerprints (accumulates across runs)
- .user-test-last-run.json schema extracted to references/last-run-schema.md
```

**Migration:** Treat missing `weakness_class` as absent. Treat missing
`novelty_fingerprints` as empty. Treat missing `adversarial_browser` as false.
Do NOT rewrite v7 files on read.

---

## Change 1: Richer Commit Writebacks

### What changes

Commit Mode Step 1 (currently SKILL.md:363-369) writes three new categories of
intelligence back into each area after every run. Currently this data is
discovered during execution then discarded.

### A. Tactical notes (Areas table, Notes column)

After scoring, commit mode appends a short tactical note to the area's Notes
column. Format: `[Run N] <finding>`. Cap at 3 entries; drop oldest when exceeded.

**Write only when there's a genuine tactical insight:**
- A reliable JS selector pattern: `[Run 4] batch read via [data-filter-chip] + .product-card reliable`
- A timing pattern: `[Run 3] agent response 8-12s on first query, faster on follow-ups`
- An interaction sequence that revealed a bug: `[Run 2] filter → navigate → back → filter again surfaces stale state`

Do NOT write: generic observations, maturity updates, restatements of probe results.

### B. Verified selectors into `verify:` blocks

When Phase 3 exploration discovers working DOM selectors confirmed by a
successful `javascript_tool` batch call, commit mode writes them into the area's
`**verify:**` block.

```markdown
**verify:**
- Apply filter. Batch-check via javascript_tool:
  activeFilters (`[data-filter-chip]`), resultCount (`.product-card`),
  sample 5 results (`.product-card .title`, `.condition-badge`).
  Every result's attribute must match the active filter.
  _Selectors confirmed run 3._
```

Rules:
- Only write selectors confirmed by a successful batch call this run
- Append `_Selectors confirmed run N._` so future runs know the source
- APPEND new selectors below existing user-authored content — never replace
- Update with new selectors if they changed; preserve unchanged ones
- If selectors are unknown (first run): `_Selectors not yet confirmed — discover during exploration._`

This is the highest-leverage writeback: run 1 discovers selectors through
sequential trial (3-5 MCP calls), run 2 reads the verify block and batches them
into one `javascript_tool` call.

### C. `weakness_class` field

New optional field in area details, written by commit mode when 2+ probes in the
same area share a recognizable failure pattern. Lives just below `pass_threshold`.

```markdown
**weakness_class:** stale-react-state
```

**Predefined classes:**
- `stale-react-state` — filters/state not resetting on navigation
- `count-display-lag` — displayed counts don't match actual DOM counts
- `multi-turn-context-loss` — agent forgets constraints from earlier turns
- `async-render-race` — results appear but attributes/badges haven't updated
- `filter-intersection-empty` — compound filter combinations return 0 results unexpectedly
- `agent-reasoning-shallow` — CLI quality consistently 3, partially correct but missing nuance

**Freeform:** For novel failure modes that don't fit a predefined class, write a
freeform string (e.g., `weakness_class: checkout-state-leaked-across-sessions`).
Change 2 handles freeform classes with custom adversarial instruction generation.

**Classification:** Commit mode reads each failing probe's `query`, `verify`,
and `result_detail` fields and matches against predefined class descriptions
using agent judgment. No mechanical matching rule — agent decides which class (if
any) best describes the failure pattern. If classification is ambiguous, prefer
freeform over forcing a predefined class. Matching for C2 synthesis uses exact
string equality after normalization (lowercase, hyphenated).

**Lifecycle:**
- Write when 2+ probes share a pattern (one probe = insufficient signal)
- Update each run: if the class's probes have all passed for 3+ consecutive
  runs, remove the field (weakness resolved)
- If a new pattern emerges with more probes than the current class, replace it
- One `weakness_class` per area — the dominant pattern. Probe count decides dominance.

### `.user-test-last-run.json` additions (per area)

```json
{
  "slug": "agent/filter-via-chat",
  "ux_score": 3,
  "tactical_note": "filter → navigate away → back → filter again surfaces stale state",
  "confirmed_selectors": {
    "activeFilters": "[data-filter-chip]",
    "resultCount": ".product-card",
    "sampleResults": ".product-card .title, .condition-badge"
  },
  "weakness_class": "stale-react-state"
}
```

`tactical_note: null` → skip Notes update. `confirmed_selectors: {}` → skip
verify block update. `weakness_class: null` → no class identified (or resolved).

### Detail spec locations

- Selector persistence rules → `verification-patterns.md` (new section: "Selector Discovery and Writeback")
- `weakness_class` lifecycle and predefined class definitions → `probes.md` (new section: "Weakness Classification")
- Tactical notes format and cap rules → `queries-and-multiturn.md` (append to commit mode guidance)

---

## Change 2: Weakness-Class Synthesis in Explore Next Run

### What changes

Phase 4 Step 6 (currently SKILL.md:209-212) gains a cross-area synthesis pass.
After generating per-area Explore Next Run items, it looks across all areas for
shared failure classes. When a class appears in 2+ areas, it generates one
`[cross-area]` Explore Next Run entry targeting the class systemically.

### Synthesis pass

Synthesis reads `weakness_class` fields from the test file as written by the
previous run's commit — first-run appearance of a weakness_class does not trigger
synthesis until the following run.

1. Collect all areas with a `weakness_class` field set in the test file
2. Group by weakness_class value (exact string match)
3. For each class appearing in 2+ areas: generate one `[cross-area]` Explore
   Next Run entry

**Format:**
```
P1  [cross-area]  Browser  stale-react-state in agent/filter + browse/filters — probe ALL navigation sequences next run
```

**Cap:** Maximum 2 cross-area synthesis entries per run.

**Tiebreaker when >2 classes qualify:**
Rank by (1) number of affected areas — more areas = higher priority; then (2)
number of failing probes in the class. Deterministic, favors widespread patterns.

### Adversarial instruction templates (predefined classes)

| Class | Adversarial Instruction |
|-------|------------------------|
| `stale-react-state` | Probe ALL navigation sequences that cross area boundaries — apply filter → navigate away → return → verify state reset |
| `count-display-lag` | After every action changing result count, wait 2s then re-read count vs DOM — check for lag window |
| `multi-turn-context-loss` | On every multi-turn sequence, inject a context-breaking action at turn 3, then return to prior context — verify retention |
| `async-render-race` | After every action triggering async rendering, immediately read badges/attributes — check for race window |
| `filter-intersection-empty` | Probe all 2-filter compound combinations systematically — check for empty-intersection cases |
| `agent-reasoning-shallow` | Replace simple queries with competing-constraint and ambiguous queries across all affected areas |

**Freeform classes:** When `weakness_class` is freeform (no matching template),
the agent generates a custom adversarial instruction based on the class name and
probe failure details.

**Persistence signal:** If the same class appeared last run's Explore Next Run,
was targeted, and still didn't resolve: `PERSISTENT — stale-react-state active
N runs — escalate to Known-bug consideration`

### Report placement

Cross-area synthesis entries appear at the top of EXPLORE NEXT RUN:

```
EXPLORE NEXT RUN
  P1  [cross-area]  Browser  stale-react-state in 3 areas — probe all navigation events
  P1  shipping-form  Browser  Validation broken — edge cases
  P2  checkout/promo  Both    Adjacent to cart, untested
```

### Why Explore Next Run entries, not cross-area probes

Cross-area synthesis produces targeting instructions ("test this pattern across
these areas next run"). These are ephemeral — regenerated each run from current
state. Cross-area probes (from v7) are persistent regression tests with a full
lifecycle. Different purpose: synthesis directs exploration, probes track
regressions. If a synthesis target repeatedly fails, the agent should generate a
cross-area probe from the failure — that's the natural escalation path.

### `.user-test-last-run.json` additions (explore_next_run entries)

```json
{
  "priority": "P1",
  "area": "[cross-area]",
  "mode": "Browser",
  "why": "stale-react-state in agent/filter-via-chat + browse/filters",
  "weakness_class": "stale-react-state",
  "affected_areas": ["agent/filter-via-chat", "browse/filters"],
  "adversarial_instruction": "Probe ALL navigation sequences that cross area boundaries..."
}
```

### Detail spec location

Cross-area synthesis rules, tiebreaker logic, template table → `probes.md`
(new section: "Cross-Area Weakness Synthesis")

---

## Change 3: Novelty Fingerprint Persistence

### What changes

The novelty log expires between runs (documented v2 limitation). This change
persists a compact fingerprint of each novel interaction across sessions so run
N+1 knows what run N already explored.

### Fingerprint format

`<area-slug>:<action-type>:<key-parameter>`

Examples:
- `agent/filter-via-chat:edge-query:price-floor`
- `browse/filters:filter-combo:size+color`
- `checkout/shipping-form:invalid-input:zip-letters`

**Normalization taxonomy (intentionally fuzzy):**
- Price/number inputs → `price-floor`, `price-ceiling`, `price-range`
- Filter combinations → `filter-combo:<f1>+<f2>`
- Invalid inputs → `invalid-input:<input-type>`
- Edge case queries → `edge-query:<topic>`
- Navigation sequences → `nav-sequence:<from>-<to>`
- **Doesn't fit taxonomy → `<area>:freeform:<3-word-summary>`** — coverage over consistency

### Storage in `.user-test-last-run.json`

```json
"novelty_fingerprints": {
  "agent/filter-via-chat": [
    "agent/filter-via-chat:edge-query:price-floor",
    "agent/filter-via-chat:edge-query:out-of-scope-question"
  ],
  "browse/filters": [
    "browse/filters:filter-combo:size+color"
  ]
}
```

Cap: 20 fingerprints per area. Drop oldest when exceeded.

### Read-Merge-Write Sequence

`.user-test-last-run.json` is overwritten on each run (SKILL.md:331). Fingerprints
are the only key that accumulates. The sequence:

1. **Phase 1 (Load Context):** Read existing `novelty_fingerprints` from
   `.user-test-last-run.json` into memory before the run starts.
2. **Phase 3 (Execute):** Use fingerprints to skip already-explored interactions.
   Generate new fingerprints for novel interactions this run.
3. **Phase 4 (Write):** Merge existing fingerprints + new fingerprints. Apply
   20-per-area cap (drop oldest). Write the merged set into the new JSON file.

This is safe because the JSON is written once at the end of Phase 4. There is no
partial-write risk — the entire file is written atomically.

### Iterate mode exemption

Iterate mode measures consistency by running the same scenario N times.
**Fingerprints are ignored in iterate mode** — all runs test the same interaction
set. The between-run page reload resets `mcp_call_counter` but does NOT apply
fingerprint filtering. Fingerprints still accumulate for use in the next
non-iterate session.

### Fingerprint matching semantics

Agent exercises judgment on what "matches" — the goal is to skip interactions of
the same *type*, not require exact parameter matches. `edge-query:price-floor`
and `edge-query:price-ceiling` are different fingerprints (different key params).
`edge-query:price-floor` from run 1 means "don't test price-floor edge cases
again" — test price-ceiling or price-range instead.

### Interaction with adversarial mode (C4)

Adversarial mode overrides fingerprint skipping for its specific actions.
Competing-constraint queries triggered by C4 are always run regardless of
fingerprint state — the adversarial signal takes priority over "already tried."

### Interaction with Proven area budget

Proven areas have a 3-MCP-call cap. Fingerprint filtering does NOT increase the
budget — it changes WHAT those 3 calls test. If fingerprints exclude obvious
interactions, the 3 calls target genuinely novel territory. This is the desired
behavior: Proven areas get spot-checked on untested ground, not re-tested on
familiar ground.

### Resilience

If `.user-test-last-run.json` is deleted or corrupted, fingerprint history resets
to empty. Acceptable — the skill re-explores previously covered territory, same
as before this change. Fingerprints are an optimization, not a correctness
requirement.

### Report signal

Add to SIGNALS when fingerprints meaningfully constrained novelty choices:
```
~ agent/filter-via-chat novelty: 3 fingerprints excluded, 2 new interactions found
```

### Detail spec location

Normalization rules, freeform fallback, accumulation behavior →
`queries-and-multiturn.md` (new section: "Novelty Fingerprint Persistence")

---

## Change 4: CLI Score 3 → Browser Adversarial Signal

### What changes

CLI score 3 ("partially correct — surface-level right, deeper reasoning wrong")
triggers adversarial browser mode for that area. Currently this signal is lost.

**Why score 3 specifically:**
- Score ≤2 already skips browser via `prechecks`
- Score ≥4 proceeds normally
- Score 3 = the adversarial sweet spot: the app functions, but the CLI revealed
  shallow reasoning that browser testing can expose as real user-facing failure

### Trigger condition

Adversarial mode triggers when **any individual CLI query** for the area scores
exactly 3. Per-query scores, not averages.

**Secondary check:** If the area's CLI Quality average across queries is 3.0-3.4
AND no single query hit exactly 3 (all queries borderline), also trigger
adversarial mode. Record `adversarial_trigger: "cli-avg-3.x: <average>"`.

### Adversarial browser mode behaviors

When triggered, the area's Phase 3 execution changes:

1. **Skip the happy path.** Start with the query most likely to expose the
   shallow reasoning — not the simplest, expected query.

2. **Front-load competing-constraint queries.** If the area has Queries defined,
   execute any query with competing constraints before single-intent queries.

3. **Pre-emptive probe (before exploration).** Generate an `untested` probe:
   - `generated_from: "cli-score-3: <query that scored 3>"`
   - Priority: P1 (CLI already revealed the weakness)

4. **Increased novelty budget.**
   - Proven areas: all 3 MCP calls must be adversarial, not happy-path spot-checks
   - Uncharted areas: novelty budget increases to 40% of calls (from 30%), min 3

5. **Report flag** in DETAILS:
   ```
   agent/filter-via-chat: CLI 3 → browser adversarial mode
     Pre-emptive probe: "competing filter constraints" (P1)
     Exploration front-loaded with competing-constraint queries
   ```

### Interaction with progressive narrowing

If a SKIP-classified area has a CLI query scoring 3, **adversarial mode overrides
SKIP for that area only** — it gets promoted to PROBES-ONLY with adversarial
execution. The CLI signal is too strong to ignore. PROBES-ONLY areas with
adversarial mode execute their probes + the pre-emptive probe, but skip full
exploration.

### Phase 2.5 addition

After scoring CLI queries, add one step:

> **Adversarial flag check:** For each area with `prechecks`-tagged queries: if
> any individual query score == 3, set `adversarial_browser: true`. If average is
> 3.0-3.4 with no single query at 3, also set `adversarial_browser: true`.
> Record the triggering query in `adversarial_trigger`.

### `.user-test-last-run.json` additions (per area)

```json
{
  "slug": "agent/filter-via-chat",
  "adversarial_browser": true,
  "adversarial_trigger": "cli-score-3: show me items under $50 in good condition"
}
```

### SIGNALS addition

```
~ 2 areas in CLI-adversarial mode (CLI score 3): agent/filter-via-chat, agent/search-query
```

### Detail spec location

Full adversarial mode behavior, competing-constraint query identification,
novelty budget adjustment → `queries-and-multiturn.md` (new section: "CLI
Adversarial Mode")

---

## SpecFlow Gap Resolutions

Issues identified by flow analysis, resolved here:

| Gap | Resolution |
|-----|-----------|
| Fingerprint persistence vs JSON overwrite | Read-merge-write sequence documented in C3 (Phase 1 read, Phase 4 merge+write) |
| Iterate mode + fingerprints | Explicit exemption: iterate mode ignores fingerprints (C3) |
| C4 adversarial vs fingerprint skipping | Adversarial overrides fingerprints for its specific actions (C3) |
| C4 adversarial vs progressive narrowing SKIP | Adversarial overrides SKIP → promotes to PROBES-ONLY (C4) |
| C4 adversarial vs Proven 3-call budget | Budget unchanged — adversarial reshapes WHAT those 3 calls do (C4) |
| weakness_class classification method | Agent judgment on probe query/verify/result_detail fields. Prefer freeform over forcing predefined. Documented in C1 spec. |
| weakness_class matching for C2 synthesis | Exact string match. Predefined classes are canonical strings. Synthesis restricted to areas where weakness_class already set in test file (no re-derivation). |
| Synthesis output vs cross-area probes | Synthesis produces ephemeral Explore Next Run entries, not probes. Repeated failures escalate to cross-area probes naturally. |
| C1→C2 timing (2-run delay) | By design. Run N writes weakness_class via commit. Run N+1 reads it but synthesis requires 2+ areas — fires earliest at N+2 if a second area develops the same class. Stated explicitly in C2 synthesis pass. |
| Fingerprints machine-local (gitignored JSON) | Intentional. Fingerprints are an optimization, not canonical state. Other compounding mechanisms (probes, queries, weakness_class) persist in committed test file. |
| weakness_class removal in multi-run mode | Each run within a multi-run session counts as a separate run toward the 3-run removal threshold. |

---

## Design Decisions

### D1. Net-zero SKILL.md via JSON schema extraction

The `.user-test-last-run.json` schema block (52 lines) is the largest inline
block in SKILL.md that can move to a reference file without hurting agent
performance. The JSON schema is read once at run start and write once at run end —
the agent doesn't need it inline during execution phases.

### D2. Predefined weakness classes + freeform fallback

Predefined classes accelerate C2 template lookup but freeform strings ensure
novel failure modes aren't lost. Exact string matching (post-normalization) is
strict enough to prevent false synthesis but simple to implement.

### D3. Fingerprints as optimization, not truth

Fingerprints are gitignored, machine-local, and lossy (20 cap with oldest-drop).
This is deliberate — they guide novelty exploration but don't gate correctness.
A fresh machine re-explores territory, which is the same as the pre-C3 behavior.

### D4. Adversarial mode reshapes budget, doesn't increase it

Proven areas keep their 3-call cap. Adversarial mode changes WHAT those calls
test (competing constraints instead of happy paths). This maintains the
efficiency property of Proven areas while exploiting the CLI signal.

### D5. Explore Next Run entries, not cross-area probes

Synthesis produces targeting instructions that are regenerated each run.
Cross-area probes are persistent regression tests. Different tools for different
purposes. If a synthesis target fails repeatedly, the agent generates a
cross-area probe — natural escalation from ephemeral to persistent.

---

## Implementation Phases

### Phase 1: Schema Extraction + Foundation (C1 prep)

**Goal:** Create room in SKILL.md. Extract JSON schema. Add v8 migration notes.

- [x] Create `references/last-run-schema.md` with full JSON schema from SKILL.md:282-333
  - Include all current fields + C1/C2/C3/C4 additions
  - Include behavioral notes (overwrite-per-run, fingerprint accumulation exception)
- [x] Replace SKILL.md:282-333 with 5-line pointer to `last-run-schema.md`
- [x] Compress Phase 3 novelty budget inline (SKILL.md:110-115) to 2-line pointer
- [x] Compress Phase 2.5 CLI detail (SKILL.md:84-97) to 8-line version
- [x] Add v7→v8 migration notes to `test-file-template.md`
- [x] Add `weakness_class` field to area details template in `test-file-template.md`
- [x] Verify SKILL.md line count after extraction (target: ~358; after Phases 2-5 additions: ~394)

### Phase 2: Richer Commit Writebacks (C1)

**Goal:** Commit mode persists tactical intelligence.

- [x] Add 3 new bullet points to Commit Mode Step 1 in SKILL.md (~8 lines):
  - Tactical notes (Notes column, cap 3, drop oldest)
  - Verified selectors (verify: block, append only, tag with run number)
  - weakness_class (below pass_threshold, 2+ probes threshold)
- [x] Add "Selector Discovery and Writeback" section to `verification-patterns.md` (~20 lines)
  - Rules: only confirmed selectors, append-only, run-tagged, first-run placeholder
- [x] Add "Weakness Classification" section to `probes.md` (~20 lines)
  - Predefined classes table, freeform guidance, lifecycle (write/update/remove)
- [x] Add tactical notes format/cap to `queries-and-multiturn.md` (~10 lines)
  - `[Run N] <finding>` format, 3-entry cap, write-only-when-genuine rule
- [x] Update `last-run-schema.md` with C1 per-area fields

### Phase 3: Weakness-Class Synthesis (C2)

**Goal:** Cross-area adversarial targeting from shared failure patterns.

- [x] Add cross-area synthesis pointer to Phase 4 Step 6 in SKILL.md (~5 lines)
- [x] Add "Cross-Area Weakness Synthesis" section to `probes.md` (~20 lines)
  - Synthesis pass (3 steps), cap of 2, tiebreaker rules
  - Adversarial instruction templates table (6 predefined + freeform)
  - Persistence signal format
  - Report placement (top of EXPLORE NEXT RUN)
- [x] Update `last-run-schema.md` with C2 explore_next_run additions

### Phase 4: Novelty Fingerprint Persistence (C3)

**Goal:** Novel interactions tracked across runs.

- [x] Add fingerprint merge note to Commit Mode in SKILL.md (~3 lines)
- [x] Add fingerprint check to Phase 3 in SKILL.md (~3 lines)
- [x] Add "Novelty Fingerprint Persistence" section to `queries-and-multiturn.md` (~30 lines)
  - Fingerprint format and normalization taxonomy
  - Read-merge-write sequence
  - Iterate mode exemption
  - Adversarial mode override
  - Proven area budget interaction
  - Matching semantics
  - SIGNALS format
- [x] Update `last-run-schema.md` with `novelty_fingerprints` top-level key

### Phase 5: CLI Adversarial Browser Mode (C4)

**Goal:** CLI score 3 triggers adversarial browser testing.

- [x] Add adversarial flag check to Phase 2.5 in SKILL.md (~5 lines)
- [x] Add adversarial mode trigger to Phase 3 in SKILL.md (~3 lines)
- [x] Add "CLI Adversarial Mode" section to `queries-and-multiturn.md` (~20 lines)
  - Trigger condition (per-query score 3, secondary avg 3.0-3.4 check)
  - 5 behavior changes (skip happy path, front-load, pre-emptive probe, increased novelty, report flag)
  - Progressive narrowing override (SKIP → PROBES-ONLY)
  - Fingerprint override rule
- [x] Update `last-run-schema.md` with C4 per-area fields

### Phase 6: Version Bump + Validation + Install

- [x] Verify SKILL.md ≤ 420 lines (actual: 368)
- [x] Verify all cross-references between files are correct
- [x] Bump plugin.json: 2.49.0 → 2.50.0 (no marketplace.json found)
- [x] Add CHANGELOG entry for v2.50.0
- [x] Install locally to `~/.claude/skills/user-test/`
- [x] Clean up any stale files from previous install

---

## Files to Change

| File | Current Lines | Delta | After | What Changes |
|------|-------------|-------|-------|-------------|
| `SKILL.md` | 420 | ~-55 extracted, +29 added = net -26 | ~394 | JSON schema extraction, Phase 2.5 compress, Phase 3 compress, C1-C4 additions |
| `references/last-run-schema.md` | 0 (new) | +~70 | ~70 | Full JSON schema + behavioral notes + C1-C4 field additions |
| `references/test-file-template.md` | 536 | +~12 | ~548 | v8 migration notes, weakness_class in area details template |
| `references/probes.md` | 401 | +~40 | ~441 | Weakness Classification section (C1), Cross-Area Weakness Synthesis section (C2) |
| `references/queries-and-multiturn.md` | 194 | +~60 | ~254 | Tactical notes (C1), Novelty Fingerprint Persistence (C3), CLI Adversarial Mode (C4) |
| `references/verification-patterns.md` | 131 | +~20 | ~151 | Selector Discovery and Writeback section (C1) |
| `plugin.json` | — | version bump | — | 2.49.0 → 2.50.0 |
| `marketplace.json` | — | version bump | — | 2.49.0 → 2.50.0 |
| `CHANGELOG.md` | — | +~20 | — | v2.50.0 entry |

---

## Acceptance Criteria

### Change 1: Richer Commit Writebacks
- [ ] Tactical notes written to Notes column in `[Run N] <finding>` format
- [ ] Notes capped at 3 entries; oldest dropped when exceeded
- [ ] Notes written only for genuine tactical insights (not generic observations)
- [ ] Verified selectors appended to verify: blocks with `_Selectors confirmed run N._`
- [ ] Selector writeback is append-only (never replaces user-authored content)
- [ ] First-run placeholder: `_Selectors not yet confirmed — discover during exploration._`
- [ ] `weakness_class` written when 2+ probes share a failure pattern
- [ ] `weakness_class` removed after 3 consecutive pass runs
- [ ] One `weakness_class` per area — dominant pattern by probe count
- [ ] `.user-test-last-run.json` includes `tactical_note`, `confirmed_selectors`, `weakness_class` per area
- [ ] Detail specs in verification-patterns.md, probes.md, queries-and-multiturn.md

### Change 2: Weakness-Class Synthesis
- [ ] Phase 4 Step 6 runs cross-area synthesis after per-area Explore Next Run generation
- [ ] `[cross-area]` entries generated when weakness_class appears in 2+ areas
- [ ] Cap of 2 cross-area synthesis entries per run
- [ ] Tiebreaker: (1) area count, (2) probe count
- [ ] Predefined class templates produce correct adversarial instructions
- [ ] Freeform classes produce custom adversarial instructions
- [ ] Persistence signal when class active N+ runs: "PERSISTENT — escalate to Known-bug"
- [ ] Cross-area entries appear at top of EXPLORE NEXT RUN in report
- [ ] `.user-test-last-run.json` explore_next_run includes weakness_class, affected_areas, adversarial_instruction

### Change 3: Novelty Fingerprint Persistence
- [ ] Fingerprints stored in `.user-test-last-run.json` under `novelty_fingerprints`
- [ ] Format: `<area-slug>:<action-type>:<key-parameter>`
- [ ] Cap: 20 per area, drop oldest when exceeded
- [ ] Read-merge-write: existing fingerprints read at Phase 1, merged at Phase 4
- [ ] Phase 3 skips interactions matching existing fingerprints
- [ ] Iterate mode ignores fingerprints (consistency measurement preserved)
- [ ] Adversarial mode (C4) overrides fingerprint skipping for its actions
- [ ] Proven area budget unchanged (fingerprints reshape, not expand)
- [ ] SIGNALS line when fingerprints constrained novelty: `~ <area> novelty: N fingerprints excluded, M new found`
- [ ] Resilience: missing/corrupted JSON → empty fingerprints (graceful degradation)

### Change 4: CLI Adversarial Browser Mode
- [ ] Triggers on any individual CLI query score == 3
- [ ] Secondary trigger: CLI average 3.0-3.4 with no single query at 3
- [ ] Skip happy path — start with query exposing shallow reasoning
- [ ] Front-load competing-constraint queries before single-intent queries
- [ ] Pre-emptive P1 probe: `generated_from: "cli-score-3: <query>"`
- [ ] Proven areas: all 3 MCP calls adversarial (not happy-path spot-checks)
- [ ] Uncharted areas: novelty budget 40% (from 30%), min 3 calls (from 2)
- [ ] Progressive narrowing override: SKIP → PROBES-ONLY when CLI score 3
- [ ] Report flag in DETAILS section
- [ ] SIGNALS line: `~ N areas in CLI-adversarial mode (CLI score 3): <areas>`
- [ ] `.user-test-last-run.json` includes `adversarial_browser`, `adversarial_trigger` per area

### Infrastructure
- [ ] `.user-test-last-run.json` schema extracted to `references/last-run-schema.md`
- [ ] Schema version v7 → v8
- [ ] SKILL.md ≤ 420 lines after all changes
- [ ] All new fields additive (missing = absent/default)
- [ ] v7 files readable without rewrite
- [ ] Version bump 2.49.0 → 2.50.0
- [ ] CHANGELOG entry for v2.50.0
- [ ] Locally installed and stale files cleaned

---

## Implementation Order

**1 → 2 → 3 → 4 → 5 → 6** — Phase 1 creates room, then C1 → C2 → C3 → C4.

C1 before C2: `weakness_class` written in C1 is consumed by C2's synthesis.
C3 after C1/C2: probe system is richer, more meaningful territory to fingerprint.
C4 last: touches the most phases but is the most self-contained conceptually.

---

## What "Getting Smarter Run-Over-Run" Looks Like

**Run 1:** Standard execution. Selectors unknown — sequential finds, 3-5 MCP
calls per area. Novelty fingerprints empty. No weakness class. Explore Next Run
is per-area only. CLI score 3 on one area triggers adversarial browser.

**Run 2:** Selectors confirmed from run 1 — verification is now one batch
`javascript_tool` call per area. Novelty fingerprints exclude run 1 territory.
If `weakness_class` was written, it's visible in area details.

**Run 3:** `weakness_class` confirmed (2+ probes). Cross-area synthesis generates
adversarial Explore Next Run entry. Fingerprints cover 2 runs — agent must find
genuinely new territory.

**Run 5+:** Weakness classes resolve (probes pass, field removed) or deepen (more
probes confirm). Fingerprints cover most obvious paths. Selectors battle-tested.

**Run 10:** Qualitatively different from run 1. Targeted adversarial probing of
known weakness classes with one-call batch verification, guided by 9 runs of
accumulated fingerprints and pattern recognition.

---

## Verification: Would This Have Caught Real Bugs?

| Bug | Without this plan | With this plan |
|-----|-------------------|----------------|
| Selectors rediscovered each run | 3-5 MCP calls per area per run | 1 batch call from run 2 onward |
| Stale-react-state in 3 areas | Each treated independently | Cross-area synthesis targets pattern systemically |
| Novelty re-exploration | Same territory tested twice | Fingerprints exclude, forcing novel ground |
| CLI score 3 on filter-via-chat | Passes through to normal browser mode | Adversarial browser: competing constraints, pre-emptive P1 probe |

---

## Sources

### Current File References
- Commit Mode: `SKILL.md:335-397`
- Phase 2.5 CLI Testing: `SKILL.md:84-97`
- Phase 3 Novelty Budget: `SKILL.md:110-115` (inline), `queries-and-multiturn.md:128-194` (detail)
- Phase 4 Step 6 Explore Next Run: `SKILL.md:209-212`
- `.user-test-last-run.json` schema: `SKILL.md:282-333`
- Selector lifecycle: `verification-patterns.md:92-94`
- Area details template: `test-file-template.md:41-49`
- CLI Area Queries: `queries-and-multiturn.md:62-83`
- Novelty Log: `queries-and-multiturn.md:165-194`

### Institutional Learnings
- Agent-guided state transitions: `docs/solutions/2026-02-26-agent-guided-state-and-mcp-resilience-patterns.md`
- Line budget enforcement: `docs/solutions/2026-02-26-monolith-to-skill-split-anti-patterns.md`
- Plugin versioning: `docs/solutions/plugin-versioning-requirements.md`
