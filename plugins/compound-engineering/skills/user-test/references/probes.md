# Adversarial Probes

Code inspection finds candidates. Interaction confirms fragility.

Probes are targeted test cases generated from observed failures and structural hypotheses. They transform luck ("the agent happened to notice") into a repeatable process. Over time, the Probes section in each area becomes a self-built adversarial test suite.

## Probe Execution Flow

At the start of Phase 3, before broad exploration:

1. Read the `**Probes:**` table from each area's details in the test file
2. In multi-run mode, also read `probes_run` from `.user-test-last-run.json` for inter-run state updates
3. Execute probes in priority order: P1 first, then P2. **Priority gates execution order** — a P2 failing probe waits until all P1 probes complete.
4. Within a priority level, execute in this order:
   1. `failing` probes (regardless of confidence)
   2. `untested` + `confidence: low` (most uncertain — most likely to surprise)
   3. `untested` + `confidence: medium`
   4. `untested` + `confidence: high` (confirming what's already expected)
   5. `passing` spot-checks
5. For each probe: navigate to the area, execute the query, run the verify check, record pass/fail

### Proven Area MCP Budget

Failing and untested probes **always run regardless of budget cap**. The 3-call MCP budget for Proven areas only constrains passing-probe spot-checks. If a Proven area has 4 failing probes, all 4 run (no spot-check). The budget prevents stable areas from consuming exploration time — it does not suppress known-failing assertions. See [run-targeting.md](./run-targeting.md) for override priority.

## Probe Generation

After each run (Phase 4), generate probes for areas with:
- A **verification failure** (Layer 2 structural check mismatch)
- A **score of 3 or below**
- A **worst_moment** designation
- A **Query score ≤ 3** (see [queries-and-multiturn.md](./queries-and-multiturn.md) step 8 for conversion rules)
- A **Multi-turn context failure** (see [queries-and-multiturn.md](./queries-and-multiturn.md) for detection patterns)
- A **CLI timing variance >50%** between runs OR any CLI query timeout. Performance probes verify timing, not results: `verify: "Completes in <Xs (no timeout)"`. Priority P1 for timeouts, P2 for variance. Generated as `"run-N timing flakiness: <query>"`.
- A **CLI tool call spike** (2x+ the query's historical average, minimum 3 data points before flagging). Tool call probes verify agent efficiency: `verify: "Completes with ≤N tool calls"`. Priority P2. Generated as `"run-N tool call spike: <query> (N vs avg M)"`. Tool call probes are **informational** — failing tool call probes do not block promotion to Proven and do not affect UX or Quality scores.
- A **quality spread ≥ 2** across runs for the same query in iterate mode (e.g., Q5 in R1, Q2 in R2 — same query, wildly different outcomes). "Spread" = max score minus min score across runs in the session. These generate reliability probes: `verify: "Returns consistent results (same category/count ±30%) across 2 consecutive runs."` Priority P1 — flakiness is worse than consistently low quality because it's unpredictable. Applies to Quality score dimension per-query. If the query already has an active probe, skip (existing 70% word-overlap dedup applies).
- A **structural hypothesis from code reading** — generated in Phase 1 from source file analysis before the first test pass (not after Phase 4). These are hypotheses, not observed failures. Default confidence: medium. Format: `generated_from: "structural-hypothesis: <filename> <line or function>"`. See [orientation.md](./orientation.md).

Each generated probe has:
- `query`: A specific action to perform (e.g., "show me NWT only")
- `verify`: The testable claim to audit (e.g., "all visible condition badges say NWT")
- `status`: Initial status is `untested`
- `priority`: P1 for verification failures, P2 for score-based
- `confidence`: Default assigned by generation trigger (see table below)
- `generated_from`: Origin trail (e.g., "run-3 condition mismatch")
- `related_bug`: (optional) Bug ID from bugs.md if this probe tests a symptom of a known open bug. Check bugs.md for bugs affecting the same area — if exactly one open bug matches, link it. Stored inline in the `Generated From` column: `"run-3 condition mismatch | related_bug: B003"`

### Confidence Defaults by Trigger

| Trigger | Default Confidence |
|---------|-------------------|
| verification failure (observed mismatch) | high |
| score <= 3 (observed low quality) | high |
| worst_moment | high |
| query failure (score <= 3) | high |
| multi-turn context failure | high |
| CLI timing variance | medium |
| CLI tool call spike | medium |
| quality spread >= 2 (iterate) | medium |
| structural-hypothesis (code reading) | medium |

`low` confidence is reserved for future generation triggers or manual assignment. No current trigger produces `low` automatically, but the execution order (line 16) prioritizes `low` first within untested probes to maximize discovery value.

**Confidence update rules (commit mode):**

- Probe passes: confidence unchanged
- Probe fails: upgrades to `high` (fragility confirmed)
- Probe flaky: stays `medium` (fragility real but inconsistent)
- Probe graduates: records `high` in graduated entry (frozen on graduation)
- Probe escalated: retains `high` (3+ consecutive failures = confirmed)

**v5 migration:** Probes without confidence field → treat as `confidence: high` (existing probes were generated from observed failures). Do NOT rewrite on read.

### Multi-Cause Isolation

When a probe targets a symptom that could have multiple causes (e.g., two open bugs producing the same "0 results" failure), generate separate probes per hypothesized cause. Each probe's setup must isolate the variable being tested:

**Pattern:**

```
Symptom: y2k accessories returns 0 results
Cause A: empty data intersection (BUG003)
Cause B: search bar state contamination (UX010)

Isolated probe A:
  Setup: fresh session (no prior search bar usage)
  Query: "y2k accessories"
  Verify: "results include y2k-tagged items — tests data coverage
    independent of search bar state"
  related_bug: BUG003

Isolated probe B (cross-area):
  Trigger: browse/product-grid — search "dresses" via search bar
  Observation: agent/filter-via-chat — ask for "y2k accessories"
  Verify: "agent clears stale category filter before applying y2k"
  related_bug: B002
```

**`related_bug` field:** Optional field on any probe (per-area or cross-area) linking the probe to a specific bug ID. When the probe passes, it provides evidence that the linked bug is fixed. When it fails, it confirms the linked bug is still active. Multiple probes can reference the same bug — each tests the bug from a different angle.

**When to isolate:** The agent should consider isolation when:
- A probe has `escalated_to` linking to a bug, AND another open bug affects the same area or a related area
- A failing probe's `result_detail` is ambiguous ("0 results" without specifying whether the data is missing or the query is wrong)
- Two bugs in bugs.md have overlapping area slugs

**When NOT to isolate:** If only one bug exists for the symptom, or if the causes are clearly distinguishable from the probe result alone, isolation adds complexity without value. Single probes are preferred when the cause is unambiguous.

**Bug lifecycle interaction:** When a bug is marked `fixed` in commit mode, the agent should note whether probes with `related_bug` pointing to that bug are passing or failing. If the bug is fixed but its related probes fail, note the discrepancy in the report: "BUG003 marked fixed but related probe still failing — investigate." This keeps `related_bug` informational while giving it a concrete use during the bug lifecycle.

## Per-Query Quality Reporting

When an area has `scored_output: true` and multiple Queries were evaluated, the report must surface per-query breakdown — not just the average.

**Report format for scored_output areas (in DETAILS section):**

```
Quality: 4.1 (range: 2-5)
  ✓ vintage denim jacket: Q5
  ✓ boots under $40: Q4
  ✗ y2k accessories: Q2 ← outlier
  ✓ cottagecore dresses: Q5
```

The outlier flag (✗) appears on any query scoring ≤ 3. This prevents the "4.1 looks fine" problem where an average hides a broken query.

Per-query breakdown appears in the **DETAILS section** of the dispatch report (only when outliers exist — if all queries scored ≥ 4, omit). Outlier queries also surface in **NEEDS ACTION** when the area is Proven (unexpected regression).

In iterate mode, show per-query scores across runs:

```
  y2k accessories: R1:Q3 → R2:Q2 (degrading)
  vintage denim:   R1:Q4 → R2:Q5 (flaky — spread ≥ 2 triggers probe)
```

**Scope:** Applies to CLI queries (explicit `cli_queries` and area Queries tables) AND browser Queries tables when present. Areas without Queries tables show only the aggregate score (existing behavior unchanged).

Per-query scores are stored in `.user-test-last-run.json` under each area's `quality_scores_by_query` field (array of {query, scores[], avg}).

**Interaction with existing probe generation:** Per-query outlier flagging (✗ marker) is cosmetic — it does not trigger additional probe generation beyond what already exists (queries scoring <= 3 already generate probes via commit mode step 8). The flag helps the reader spot the problem; the probe system handles the automated response.

### Evaluation Provenance

When CLI queries are evaluated, the testing agent (Claude) judges output from the app's agent (often Gemini or another model). This is inherently cross-model evaluation — free of self-preference bias.

Note this in the report's Quality Scores table:

```
Quality Scores (scored_output areas — cross-model: Gemini→Claude)
| Area               | R1 Q   | R2 Q   | Avg |
| agent/search-query | 4 (CLI) | 5 (CLI) | 4.5 |
```

When browser evaluation scores quality (same model observes and judges), note `(browser)` instead of `(CLI)`. The provenance tag tells the reader which scores have cross-model validation and which might have self-bias.

**Static labels:** CLI = cross-model, Browser = same-model. These are static based on evaluation mode, not dynamically detected. If the app under test uses the same model as the evaluator, add a note in the report footer: "Note: app LLM is also Claude — CLI evaluation is same-model for this app."

If the app's model changes (e.g., Gemini Flash → Claude Sonnet), update the provenance header. Model changes invalidate previous quality baselines — note "model change: re-baseline quality" in the report.

## Probe Lifecycle

```
untested → [run] → passing / failing
                      ↓          ↓
              [2+ consecutive]  [3+ consecutive]
                      ↓          ↓
              graduation offer  escalation to bugs.md
                      ↓
                  graduated (CLI regression check)
```

### Status Definitions

| Status | Meaning |
|--------|---------|
| `untested` | Generated, not yet run |
| `passing` | Ran, verification passed |
| `failing` | Ran, verification failed |
| `flaky` | Mixed results across 3+ runs |
| `graduated` | Promoted to CLI regression check (read-only) |

### Flaky Transition

A probe becomes `flaky` when:
- It has run at least 3 times
- It has both at least 1 pass and 1 fail
- It has no 2+ consecutive streak either way

Revert rules:
- Flaky → `failing`: 2 consecutive failures
- Flaky → `passing`: 2 consecutive passes (eligible for graduation)

### Escalation (3+ Consecutive Failures)

**Why 3, not 5:** The original design specified 5. Changed to 3 because a
probe failing 3 times has been observed across at least 2 separate sessions
(generation run + 2 failure runs). That's sufficient evidence. Auto-filing
at 3 removes the manual confirmation step — the 3-run failure history IS
the confirmation.

A probe failing for 3+ consecutive runs auto-escalates during commit mode:

1. **Dedup check:** If probe already has `escalated_to: "B00N"` field, skip (already filed)
2. Create a bug entry in `bugs.md` with next sequential ID
3. Set bug summary from probe's `verify` clause
4. Set bug `Found` date from the probe's `Generated From` field
5. Link probe to bug: add `escalated_to: "B00N"` to probe entry
6. Probe stays active (keeps running). Bug entry tracks the fix.
7. If `gh` is not authenticated: file to `bugs.md` with `Issue: ---`. Log warning: "Bug filed locally but GitHub issue not created — run `gh auth login` to sync." On next commit with `gh` authenticated, detect `Issue: ---` entries and offer to file.

**Interaction with area-level escalation:** If a probe in the area has been auto-escalated (has `escalated_to` field), suppress the area-level "persistent <= 3 scores" manual escalation offer for that area. The probe-level escalation is more specific and already covers the intent.

Escalation checks run at commit time only — never mid-iterate-session. Consecutive failure count increments once per commit, not once per iterate run. An iterate×5 where a probe fails all 5 runs adds 1 to the consecutive count.

### Graduation (2+ Consecutive Passes)

A passing probe (2+ consecutive) is eligible for CLI graduation — same path as bug graduation in [graduation.md](./graduation.md).

- Uses the same `cli_queries` format with `graduated_from: "probe-<area>-<run>"`
- **Skip for visual checks:** Layout, animation, cursor state, visual feedback — these can't be tested via CLI
- **Manual trigger:** User confirms each graduation
- The test file Probes table entry changes to status `graduated`

### Proven Area Verification (Git-Aware)

When git diff shows files affecting a Proven area:

1. Area keeps Proven status but gains a `(verify)` annotation in the report
2. Full exploration runs (existing git-aware targeting already does this)
3. If the area still passes: remove `(verify)`, increment consecutive passes, note in report: "Verified after <file> change"
4. If the area fails: the code change caused a regression — generate probe targeting the specific change, flag in report as "regression after <file>"

**What this adds beyond existing git-aware targeting:** Git-aware targeting gives full exploration. This adds: (a) visible annotation so the reader knows WHY full exploration ran, (b) causal link in the report connecting score changes to specific commits, (c) targeted probe generation on regression that names the file change.

The `(verify)` annotation is ephemeral — it appears only in the current run's report, not persisted in the test file. Next run without code changes, the area reverts to normal Proven spot-check behavior.

When git diff is unavailable (no .git, first run, force push): skip verification. Proven areas tested normally per existing rules.

**Known-bug areas with git changes:** When git changes affect a Known-bug area, the git-aware rule overrides the normal Known-bug skip. Run fix_check even if `gh` is not authenticated. If fix_check passes without `gh` confirmation, note: "fix_check passed but cannot verify issue state — authenticate gh to complete lifecycle." If fix_check passes with `gh` available, note: "fix_check passed but issue #N still open — close issue to complete fix lifecycle."

## Dedup

Dedup key: **area slug + verify text**. Two probes with the same area and >70% word overlap in their `verify:` clause are the same probe — update the existing entry, don't create a duplicate.

Probes with the same query but different `verify:` clauses are distinct probes — both are kept.

## Cap and Rotation

- **Failing/flaky probes:** Keep indefinitely
- **Passing probes:** Rotate out after 10 runs (they've proven stability)
- **Graduated probes:** Stay in the table as read-only historical record
- No cap per area — accumulation is natural. If an area has many failing probes, that's signal worth preserving.

## Multi-Run Mode

When invoked as `/user-test N`, the skill orchestrates N sequential runs with inter-run probe learning.

### Inter-Run State

Probes live in the test file markdown (canonical source, written on commit). Between runs within a multi-run session, probe state is tracked in `.user-test-last-run.json` as a scratchpad:
- Each run reads probes from the test file (start of session) AND from the last-run JSON's `probes_run` field (inter-run updates)
- Full commit happens only at the end of the N-run session (or on interruption)

### Progressive Treatment

```
Run 1: Broad exploration → discover issues → generate initial probes
Run 2: Execute run-1 probes first → verify/refute → generate sharper probes
Run 3: Targeted at specific failure modes → verification catches what broad exploration missed
Run 4+: Proven areas spot-checked only → all time on weak areas and active probes
Run N: Final summary with trajectory across all N runs
```

### Interruption Handling

If `/user-test N` is interrupted at run K:
- The last-run JSON contains probe state through run K
- Run `/user-test-commit` to persist what exists
- Probes generated during the interrupted run get status `untested`
- No special resume logic — next `/user-test` reads probes from the test file

### N-Run Summary

After all N runs complete, display a trajectory summary:

```
N-Run Summary: <scenario-name>

Areas that stabilized:      <area> (N/N), <area> (N/N)
Areas with persistent issues: <area> (0/N — <reason>)
Areas that regressed:       <area> (K/N — <detail>)
New issues discovered:      <count> (run X: <issue>, run Y: <issue>)
Probes generated:           <total>, <active failures> active failures
Demo ready:                 <yes/no> — <reason>
```

### Time Estimate

Before starting a multi-run session, display estimated total time:
```
Starting N-run session for <scenario>. Estimated time: ~X minutes (N runs × ~Y min each including verification passes).
```

### Within-Session Probe Injection

After each run K < N completes:

1. Read `probes_generated` from the run-K results
2. Add them to the probe execution list for run K+1 with status `untested`
3. These injected probes execute FIRST in run K+1 (before existing probes)
4. Record results in `probes_run` with `generated_from: "run-K <detail>"`

This turns iterate from "test, then test again" into "test, discover, verify discovery." A stale filter probe generated in R1 gets tested in R2 instead of sitting untested until next session.

If the newly generated probe has a `prechecks` tag and `cli_test_command` exists, run it via CLI first (same Phase 2.5 rules apply).

**N=1 edge case:** When iterate mode runs with N=1, probes generated in the single run remain `untested` and are committed normally. No special handling — they execute on the next session (single or iterate).

**Inter-run probe status:** R2 sees R1's probe results via the `.user-test-last-run.json` scratchpad. A probe that flipped from `failing` to `passing` in R1 is deprioritized in R2 (failing/untested before passing). This is correct and intentional.

Progressive narrowing (SKIP/PROBES-ONLY/FULL classification for run 2+) has moved to [run-targeting.md](./run-targeting.md).

## Cross-Area Probes

Cross-area probes test interactions that span two areas — where an action in one area affects state in another. They live in a scenario-level table (not per-area) and run before per-area testing in Phase 3.

### Lifecycle

Same as per-area probes (status transitions, escalation, confidence). One exception: CLI graduation requires BOTH trigger and observation areas to have CLI coverage.

### Generation Triggers

Cross-area probes are generated when:
- A per-area probe fails AND the failure symptom could be caused by state from another area (agent judgment — look for stale filters, carry-over context, shared state)
- The novelty budget discovers a cross-area interaction worth tracking
- Orientation (code reading) identifies a state ownership boundary that crosses two areas
- The user explicitly requests a cross-area probe

Cross-area probes are NOT generated automatically from every per-area failure. The agent must identify a plausible cross-area cause before generating one. This keeps the table focused on genuine seam tests, not duplicates of per-area probes.

### Execution

1. Navigate to trigger area
2. Perform action (do NOT reset between trigger and observation)
3. Navigate to observation area
4. Run verify check
5. Record result

The "no reset" between steps 2 and 3 is the critical difference from per-area probes. The whole point is testing state carry-over. If you reset between areas, you're testing two independent areas, not a seam.

### Report Section

Cross-area probe results appear in their own report section, between the header and NEEDS ACTION:

```
Cross-Area Probes:
| Trigger → Observation | Action | Status | Detail |
|-----------------------|--------|--------|--------|
| browse/product-grid → agent/filter-via-chat | search "dresses" via search bar | failing | agent chat shows stale "Dresses" filter on follow-up |
```

### Dedup

Key: `trigger_area + observation_area + verify text`. Same 70% word-overlap rule as per-area probes, applied to the area pair. A probe from A→B and a probe from B→A are different probes (different causal direction).

### Bug Filing

When a cross-area probe escalates (3+ consecutive failures), the bug entry in bugs.md lists the trigger area as primary and the observation area in the summary: "Also affects: <observation_area>". This matches the existing multi-area bug format in bugs-registry.md.

### Spot-Check Budget

Passing cross-area probes are spot-checked — execute at most 3 passing probes per run, rotating round-robin by table order (advance start position each run). Failing and untested cross-area probes always execute. This bounds the front-load: a stable test file with 5 passing cross-area probes spot-checks 3, not all 5.

### Progressive Narrowing Interaction

Progressive narrowing classifications (SKIP/PROBES-ONLY/FULL) apply to per-area testing only. Cross-area probes execute in their own slot regardless of the trigger or observation area's narrowing classification. An area classified SKIP for per-area testing can still be a trigger or observation target for cross-area probes.

### Cap

Maximum 10 active cross-area probes per test file. Cross-area probes are more expensive than per-area (two navigation steps, no reset). If the table exceeds 10 active entries, the oldest passing probes rotate out first (same as per-area rotation).

### Proactive Restart Interaction

Cross-area probes must NOT be interrupted by a proactive restart — they depend on state carry-over between trigger and observation areas. The restart check is skipped during cross-area probe execution. The MCP call counter still increments; the restart happens after the cross-area probe sequence completes.

### .user-test-last-run.json Schema

Cross-area probe results are stored alongside `probes_run`:

```json
"cross_area_probes_run": [
  {
    "trigger_area": "browse/product-grid",
    "action": "search 'dresses' via search bar",
    "observation_area": "agent/filter-via-chat",
    "verify": "agent chat responds without stale category filter",
    "status": "failing",
    "result_detail": "agent showed stale Dresses filter on follow-up",
    "related_bug": "B002"
  }
]
```
