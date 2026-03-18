# Queries and Multi-turn Sequences

Queries test the app's **understanding** of its domain. Multi-turn sequences test **context retention** across turns. Both are optional — areas without them still work. Queries are only valid in `scored_output: true` areas. If an area has Queries but not `scored_output: true`, flag it during Phase 1 and suggest adding `scored_output: true`.

**Queries vs Probes:** Queries are exploratory (scored 1-5, stateless). Probes are regression tests (pass/fail, full lifecycle). Failed queries generate probes — queries feed the probe system, they don't replace it.

## During Execution (Phase 3)

### Per-Area Checklist

For each selected area, complete these steps in order:

0. **CLI precheck gate:** If this area has a `prechecks` tag in any `cli_queries` entry AND that CLI query scored ≤ 2, skip browser testing for this area with note "CLI pre-check failed — agent reasoning broken, browser test skipped." If no prechecks tag exists for this area, or CLI scored ≥ 3, proceed normally.
1. Run probes (failing/untested first) — see [probes.md](./probes.md)
2. Execute Queries and Multi-turn sequences (if defined)
3. Explore beyond the defined queries — try something the queries don't cover
4. Run verification pass — see [verification-patterns.md](./verification-patterns.md)
5. Score UX (+ Quality if scored_output)
6. Record timing
7. Note: what surprised you? What would you test next time?

Empty Queries or Multi-turn tables are no-ops at step 2. Step 7 feeds directly into Explore Next Run generation and new Query creation during commit.

### Scoring Boundaries

Probes, verification, and UX scores are three separate signals — none subsumes the others. See SKILL.md Phase 3 checklist for the canonical definition.

### CLI + Browser Score Mapping

When an area has both CLI and browser results:
- **CLI score → Quality** (did the agent reason correctly?)
- **Browser score → UX** (did the interface deliver it smoothly?)
- Report shows: `UX: 5 | Quality: 2 (CLI)` — source explicit

CLI-only areas: CLI score populates both UX and Quality. Browser-only areas: browser scores both UX and Quality (existing behavior) — do NOT show `(CLI)` tag; show `(browser)` or nothing to distinguish the source.

### Multi-turn Scoring

Multi-turn sequences contribute to the area's Quality score (scored against the final turn's ideal outcome). Context failures at intermediate turns generate probes targeting the specific broken turn, and are noted in the area assessment, but do not directly reduce the UX or Quality score.

**Context failure:** When a subsequent turn's result indicates the app lost state from a prior turn. Detection patterns:

- **Filter state:** Turn 1 set "queen size" → Turn 3 results include non-queen items
- **Conversational:** Turn 1 said "budget is $200" → Turn 3 recommends $400 items without acknowledging the constraint
- **Preference:** Turn 2 said "NOT white" → Turn 3 results include white items

**Detection rule:** After each turn, check whether prior turns' constraints are still reflected in the current state/results. If not, that's a context failure — generate a probe: query = the failing turn's action, verify = "context from turn N preserved."

### Proven Area Query Budget

Active queries count against the tiered MCP budget for Proven areas (see [run-targeting.md](./run-targeting.md) for budget by consecutive pass count). `[stable]` queries run via CLI only and do not count. Only failing/untested probes bypass the cap (existing rule from [probes.md](./probes.md)).

**Worked example (3-call tier, consecutive passes 2-5):**
```
Proven area with 5 queries (2 active, 3 stable), 2 failing probes, 3-call budget:
→ 2 failing probes run (uncapped): 2 browser calls
→ 3 stable queries run via CLI (uncapped): 0 browser calls
→ 1 remaining browser call → spot-check 1 active query
→ 1 active query skipped this run

At 1-call tier (10+ consecutive passes), same area:
→ 2 failing probes run (uncapped): 2 browser calls
→ 3 stable queries run via CLI (uncapped): 0 browser calls
→ 0 remaining browser calls (budget exhausted by probes)
→ 2 active queries skipped this run
```

### CLI Area Queries

When `cli_test_command` is present, Phase 2.5 also runs each `scored_output` area's **Queries:** table through CLI:

- Query text → substituted into `cli_test_command`
- Ideal Outcome → used as `expected` for semantic evaluation
- Score → area's CLI Quality score
- **Evaluate the full JSON response** — tool calls (correct tools, correct arguments), inferred facets, result data, and suggestions — not just the message text. The `expected` field should describe correct behavior across the full response structure.

**Skip rules:** Only `scored_output: true` areas. Skip queries mentioning clicks, scrolling, visual layout in Check column. Multi-turn = browser-only (requires session state).

**Budget:** Proven areas: max 2 Queries via CLI (spot-check). Uncharted areas: run all.

**Timing:** Record wall-clock time per CLI query. If timing variance exceeds 50% between runs or any query times out, generate a performance probe — see [probes.md](./probes.md).

**Tool call tracking:** For each CLI query response, capture from the JSON:
- `tool_calls`: count of `toolCalls` array entries
- `tool_names`: unique tool names from `toolCalls[*].tool`
- `result_count`: count of items in the primary search/retrieval tool call's results array. If multiple search calls, sum them. Ignore non-search tool calls (filter lookups, respond_to_user, etc.)
- `tokens`: `{ prompt, completion }` from `usage` field if present (null if not)

Include `Tools` and `Results` columns in the CLI Speed table. Tool call spike flagging (2x+ historical avg) activates after 3+ data points for a query — before that, track but don't flag. Same minimum sample pattern as probe flaky transition.

## During Commit

### Tactical Notes (Commit Mode Step 1)

After scoring, commit mode may append a short tactical note to the area's Notes column in the Areas table. Format: `[Run N] <finding>`.

**Cap:** 3 entries per area. Drop oldest when exceeded.

**Write only when there's a genuine tactical insight:**
- A reliable JS selector pattern: `[Run 4] batch read via [data-filter-chip] + .product-card reliable`
- A timing pattern: `[Run 3] agent response 8-12s on first query, faster on follow-ups`
- An interaction sequence that revealed a bug: `[Run 2] filter → navigate → back → filter again surfaces stale state`

**Do NOT write:** generic observations ("tested 3 areas"), maturity updates ("promoted to Proven"), restatements of probe results.

In `.user-test-last-run.json`, `tactical_note: null` means skip Notes update for this area.

### Query Compounding (Steps 8-10)

These steps run AFTER existing commit mode steps 1-7.

**8. Sharpen Queries from failures:** For each Query that scored ≤ 3, generate an adversarial probe targeting the specific gap. The probe goes in the area's `**Probes:**` table (not the `**Queries:**` table). One failed query generates one probe. Probe fields: query = adversarial version, verify = specific gap observed, status = untested, generated_from = "run-N query failure: <query text>". Existing probe dedup (70% word overlap) catches duplicates.

Example: "earth tones" scored 3 because results were generic neutrals → Probe: query "terracotta and rust specifically", verify "results include warm red/orange tones, not beige/cream."

**9. Expand Queries from discovery:** If exploration (checklist step 3) revealed an interesting interaction the existing Queries don't cover, add it as a new Query in the `**Queries:**` table with Ideal Outcome and Check columns filled from what was observed. New queries are exploratory — they'll be scored next run and may themselves generate probes if they fail.

**10. Mark stable Queries:** If a Query has scored 5/5 for 3+ consecutive runs (commit-level, not per-iterate-run), update Status to `[stable]`. Stable queries shift to CLI-only execution — no browser testing. This frees browser time for novelty exploration. See Step 12 below for full rotation rules.

**11. Persist CLI consistency patterns:** Persist a CLI observation to the area's Notes column on first sighting. Mark it `[confirmed]` if the pattern holds on the next run (same quality score range on the same query type). Remove if contradicted. Detection: compare this run's per-query CLI scores against the pattern claim — e.g., "strong on single-intent" is confirmed if single-intent CLI queries scored >= 4 again. Only persist patterns that are specific and actionable (not "sometimes works").

### Step 12: Rotate Query Status

Transition rules (applied per-query, commit mode only):

- Active → `[stable]`: Scores 5/5 for 3 consecutive runs (commits)
- `[stable]` → `[retired]`: Scores 5/5 for 10 consecutive runs AND `cli_test_command` is set (long-term maturity state — most queries won't reach this quickly)
- `[stable]` → active: Scores Q4 twice consecutively (soft regression — note "previously stable query softened") OR scores Q≤3 once (immediate — generate probe per step 8)
- `[retired]` → active: CLI spot-check scores ≤ 4 (generate probe)

**CLI gate:** Queries without `cli_test_command` in the test file max out at `[stable]`. They receive browser spot-checks via the Proven area MCP budget.

**Execution by status:**

| Status | Browser | CLI | Proven cap |
|--------|---------|-----|------------|
| (active) | Yes | Yes | Counts |
| `[stable]` | No | Yes | Does not count |
| `[retired]` | No | No | Skipped |

**Report SIGNALS:** Note freed browser time: "+ N stable queries → CLI-only."

**Iterate mode timing:** An iterate×N session counts as 1 commit toward consecutive thresholds. A query scoring 5 all N runs counts as 1 toward the 3-consecutive threshold.

**Data source:** The `scores` array in `quality_by_query` (see `score-history.json`) stores one entry per commit, not per iterate run. For iterate sessions, record the aggregate query score as a single entry. Consecutive count = length of the leading streak of 5s in the array (most recent first).

Commit mode marks status automatically based on run history — no manual project-file edits needed.

## Novelty Budget

**Step 3 enforcement.** After running probes and queries, the agent MUST use the novelty budget on interactions not in any Query, Probe, or Multi-turn table for this area.

### "Not Documented" Definition

Any interaction where the core action (query text, filter applied, button sequence) does not appear in any existing table entry for this area. Rephrasing a stable query is not novel. A different filter combination is novel. A user behavior with no table representation is novel.

**Run 1 state boundary:** Novelty is measured against the test file state at run start. On run 1 of a new file, all Queries defined during Phase 1 area creation are "documented" even though they were just written. The novelty budget requires interactions beyond those Queries.

### MCP Budget by Area Type

```
Proven area (tiered cap, see run-targeting.md):
  → novelty = 1 MCP call after probes and active queries (at 3-call tier)
  → at 1-call tier: single call used for probe spot-check OR novelty (agent discretion)

Uncharted/FULL area (no hard cap):
  → novelty = 30% of calls used on probes + queries, minimum 2 calls
  → Example: 10 calls on probes/queries → 3 novelty calls
  → Example: 4 calls on probes/queries → still minimum 2 novelty calls
```

**Proven area budget exhaustion:** When the tiered budget cap is fully consumed by failing/untested probes and active queries, the novelty budget is 0 for that area. Probes and queries take priority — novelty defers, not the other way around. Passing-probe spot-checks also defer when novelty would compete for the last call.

### Mandatory Probe Rule

At least 1 novel interaction per `scored_output` area MUST generate a probe each run, even if the interaction appeared clean. The probe verify clause can be "confirm this path remains clean after code changes." This prevents the agent from classifying everything as uninteresting.

### Progressive Narrowing Interaction

| Run 2+ Classification | Novelty Budget |
|----------------------|---------------|
| SKIP | 0 (area skipped entirely) |
| PROBES-ONLY | 0 explicit — but 1 exploration call IS the novelty |
| FULL | Normal budget (1 for Proven, 30%/min-2 for Uncharted) |

### Novelty Log

Novelty log entries appear in DETAILS section of the report:

```
Novelty (agent/filter-via-chat — 2 novel interactions):
  ✓ "show me everything under $10" — sparse results (3 items). Probe generated.
  ~ "show me your favorites" — agent confused, returned random. Probe generated.
```

Format: `✓` tried and clean (probe generated per mandatory rule), `~` tried and interesting/broken (probe generated from finding).

**Persistence:** Novelty log entries do NOT persist to the test file between runs — they're ephemeral. If a novel interaction was worth keeping, it's now a Probe or Query.

**`.user-test-last-run.json` schema:**

```json
"novelty_log": [
  {
    "area": "agent/filter-via-chat",
    "interaction": "show me everything under $10",
    "observation": "sparse results (3 items)",
    "probe_generated": true,
    "probe_query": "price floor behavior — under $10 returns sparse results"
  }
],
"stable_queries_rotated": ["cottagecore dresses", "leather jacket"]
```

## Novelty Fingerprint Persistence

Resolves the v2 limitation where novelty logs expired between runs. Fingerprints persist a compact record of each novel interaction so run N+1 knows what run N already explored.

### Fingerprint Format

`<area-slug>:<action-type>:<key-parameter>`

Examples:
- `agent/filter-via-chat:edge-query:price-floor`
- `browse/filters:filter-combo:size+color`
- `checkout/shipping-form:invalid-input:zip-letters`

### Normalization Taxonomy

| Pattern | Format |
|---------|--------|
| Price/number inputs | `price-floor`, `price-ceiling`, `price-range` |
| Filter combinations | `filter-combo:<f1>+<f2>` |
| Invalid inputs | `invalid-input:<input-type>` |
| Edge case queries | `edge-query:<topic>` |
| Navigation sequences | `nav-sequence:<from>-<to>` |
| Doesn't fit taxonomy | `<area>:freeform:<3-word-summary>` |

Coverage is more important than taxonomy consistency. Use freeform when unsure.

### Read-Merge-Write Sequence

1. **Phase 1 (Load Context):** Read existing `novelty_fingerprints` from `.user-test-last-run.json` into memory
2. **Phase 3 (Execute):** Use fingerprints to skip already-explored interactions. Generate new fingerprints for novel interactions this run.
3. **Phase 4 / Commit (Write):** Merge existing + new fingerprints. Apply 20-per-area cap (drop oldest). Write merged set to JSON.

Safe because the JSON is written once atomically at the end. No partial-write risk.

### Iterate Mode Exemption

Iterate mode measures consistency by running the same scenario N times. **Fingerprints are ignored in iterate mode** — all runs test the same interaction set. Fingerprints still accumulate for use in the next non-iterate session.

### Adversarial Mode Override

Adversarial mode (CLI score 3 trigger) overrides fingerprint skipping for its specific actions. Competing-constraint queries triggered by adversarial mode always run regardless of fingerprint state.

### Proven Area Budget Interaction

Proven areas keep their tiered MCP budget (see [run-targeting.md](./run-targeting.md)). Fingerprint filtering does NOT increase the budget -- it changes WHAT those calls test. If fingerprints exclude obvious interactions, the budgeted calls target genuinely novel territory.

### Matching Semantics

Agent exercises judgment on what "matches." The goal is to skip interactions of the same *type*, not requiring exact parameter matches. `edge-query:price-floor` and `edge-query:price-ceiling` are different fingerprints. `edge-query:price-floor` from run 1 means "don't test price-floor edge cases again."

### SIGNALS Format

When fingerprints meaningfully constrained novelty choices:
```
~ agent/filter-via-chat novelty: 3 fingerprints excluded, 2 new interactions found
```

### Resilience

If `.user-test-last-run.json` is deleted or corrupted, fingerprint history resets to empty. Acceptable — the skill re-explores previously covered territory (same as pre-fingerprint behavior). Fingerprints are an optimization, not a correctness requirement.

## CLI Adversarial Mode

CLI score 3 ("partially correct — surface-level right, deeper reasoning wrong") triggers adversarial browser mode for the affected area. Score 3 is the adversarial sweet spot: the app functions, but CLI revealed shallow reasoning that browser testing can expose.

### Trigger Condition

**Primary:** Adversarial mode triggers when **any individual CLI query** for the area scores exactly 3. Per-query scores, not averages.

**Secondary:** If the area's CLI Quality average across queries is 3.0-3.4 AND no single query hit exactly 3 (all queries borderline), also trigger adversarial mode. Record `adversarial_trigger: "cli-avg-3.x: <average>"`.

### Phase 2.5 Addition

After scoring CLI queries, for each area with `prechecks`-tagged queries:
- If any individual query score == 3: set `adversarial_browser: true`, record triggering query
- If average 3.0-3.4 with no single 3: also set `adversarial_browser: true` (secondary check)

### Adversarial Browser Mode Behaviors

When triggered, the area's Phase 3 execution changes in five ways:

1. **Skip the happy path.** Start with the query most likely to expose the shallow reasoning — not the simplest, expected query.

2. **Front-load competing-constraint queries.** If the area has Queries defined, execute any query with competing constraints (e.g., "crisp not silky") before single-intent queries.

3. **Pre-emptive probe (before exploration).** Generate an `untested` probe targeting the specific CLI weakness:
   - `generated_from: "cli-score-3: <query that scored 3>"`
   - Priority: P1 (CLI already revealed the weakness)

4. **Increased novelty budget.**
   - Proven areas: all budgeted MCP calls must be adversarial, not happy-path spot-checks
   - Uncharted areas: novelty budget increases to 40% of calls (from 30%), minimum 3 (from 2)

5. **Report flag** in DETAILS:
   ```
   agent/filter-via-chat: CLI 3 → browser adversarial mode
     Pre-emptive probe: "competing filter constraints" (P1)
     Exploration front-loaded with competing-constraint queries
   ```

### Progressive Narrowing Override

If a SKIP-classified area has a CLI query scoring 3, **adversarial mode overrides SKIP for that area only** — promoted to PROBES-ONLY with adversarial execution. The CLI signal is too strong to ignore. PROBES-ONLY areas with adversarial mode execute their probes + the pre-emptive probe, but skip full exploration.

### SIGNALS Addition

```
~ 2 areas in CLI-adversarial mode (CLI score 3): agent/filter-via-chat, agent/search-query
```

### .user-test-last-run.json Fields

Per-area: `adversarial_browser` (boolean, default false) and `adversarial_trigger` (string or null). See [last-run-schema.md](./last-run-schema.md) for full schema.
