---
title: "feat: Cross-Area Probes, Probe Isolation, and Proactive Browser Restart"
type: feat
status: completed
date: 2026-03-02
schema_version_target: 7
---

# feat: Cross-Area Probes, Probe Isolation, and Proactive Browser Restart

## Problem Statement

Three gaps identified from run 9 results on sg-resale:

**1. Cross-area seams are untestable.** The search bar -> chat contamination
bug (UX010) lives between `browse/product-grid` and `agent/filter-via-chat`.
Neither area owns the interaction. Every probe belongs to exactly one area,
so there's no way to represent "do X in area A, verify behavior in area B."
Agent-native apps break at boundaries -- state contamination, stale context
carry-over, filter pollution across surfaces -- and the current structure
can't test any of them.

**2. Multi-cause symptoms produce ambiguous probe results.** BUG003 (y2k
intersection empty) and UX010 (search bar contamination) both produce 0
results on y2k queries. The existing probe tests the symptom, not the
cause. When it fails, you can't tell which bug you're looking at. Fixing
either bug confidently requires isolated probes that control for the other
variable.

**3. Browser connection degrades after ~18 MCP calls.** Run 6: 90s timing
spike. Run 9: 3 disconnects all after call #18+. The skill tracks and
reports this pattern (C4 disconnect tracking) but doesn't prevent it.
Reactive recovery (wait 3s, retry) costs more time than proactive
prevention.

## Changes

### X1. Cross-Area Probe Table

**Files:** `test-file-template.md`, `probes.md`, `SKILL.md`
**Problem:** No way to represent probes that span two areas
**Fix:** Scenario-level probe table with trigger area + observation area

#### X1a. Test File Schema Addition

Add `## Cross-Area Probes` section to the test file template, positioned
after `## Area Details` and before `## Area Trends`. This is scenario-level
-- one table for the whole test file, not per-area.

```markdown
## Cross-Area Probes

<!-- Probes that test interactions spanning two areas. Run before
     per-area testing in Phase 3. -->

| Trigger Area | Action | Observation Area | Verify | Status | Priority | Confidence | Generated From | Run History |
|-------------|--------|-----------------|--------|--------|----------|------------|---------------|-------------|
```

**Column definitions:**

- `Trigger Area`: The area where the initial action happens (e.g.,
  `browse/product-grid`)
- `Action`: What to do in the trigger area (e.g., "search 'dresses'
  via search bar")
- `Observation Area`: The area where the effect is verified (e.g.,
  `agent/filter-via-chat`)
- `Verify`: What to check in the observation area (e.g., "agent chat
  responds to follow-up without stale category filter from search bar")
- Status through Run History: Same as per-area probes -- uses the
  existing probe lifecycle (untested/passing/failing/flaky/graduated),
  confidence field, escalation at 3 failures, graduation at 2 passes

**Dedup key:** `trigger_area + observation_area + verify text` (same
70% word-overlap rule as per-area probes, extended to the area pair).

#### X1b. Execution Slot in Phase 3

Cross-area probes run BEFORE per-area testing. They need both areas
accessible in sequence, which doesn't fit the area-by-area Phase 3
flow. Running them first also informs how you interpret per-area
scores -- if search bar -> chat contamination fails, agent/filter-via-chat
scores may be polluted.

**Add to SKILL.md Phase 3 (slim pointer, detail in probes.md):**

```markdown
### Cross-Area Probes (Before Per-Area Testing)

Execute cross-area probes before per-area testing -- they test state
carry-over between areas and inform per-area score interpretation.
Results do NOT affect per-area scores. See [probes.md](./references/probes.md).
```

**Delta:** +4 lines in SKILL.md (after mitigation B).

#### X1c. Lifecycle Rules in probes.md

Cross-area probes use the existing probe lifecycle with two additions.
Add a new section after the Multi-Run Mode section:

```markdown
## Cross-Area Probes

Cross-area probes test interactions that span two areas -- where an
action in one area affects state in another. They live in a scenario-
level table (not per-area) and run before per-area testing in Phase 3.

### Lifecycle

Cross-area probes follow the same lifecycle as per-area probes:
- Status transitions: untested -> passing/failing -> flaky/graduated
- Escalation: 3+ consecutive failures -> auto-file to bugs.md
- Graduation: 2+ consecutive passes -> eligible for CLI graduation
  (only if BOTH areas have CLI coverage)
- Confidence field: same defaults and update rules as per-area

### Generation Triggers

Cross-area probes are generated when:
- A per-area probe fails AND the failure symptom could be caused by
  state from another area (agent judgment -- look for stale filters,
  carry-over context, shared state)
- The novelty budget discovers a cross-area interaction worth tracking
- Orientation (code reading) identifies a state ownership boundary
  that crosses two areas
- The user explicitly requests a cross-area probe

Cross-area probes are NOT generated automatically from every per-area
failure. The agent must identify a plausible cross-area cause before
generating one. This keeps the table focused on genuine seam tests,
not duplicates of per-area probes.

### Execution

1. Navigate to trigger area
2. Perform action (do NOT reset between trigger and observation)
3. Navigate to observation area
4. Run verify check
5. Record result

The "no reset" between steps 2 and 3 is the critical difference from
per-area probes. The whole point is testing state carry-over. If you
reset between areas, you're testing two independent areas, not a seam.

### Report Section

Cross-area probe results appear in their own report section, between
the header and NEEDS ACTION:

```
Cross-Area Probes:
| Trigger -> Observation | Action | Status | Detail |
|-----------------------|--------|--------|--------|
| browse/product-grid -> agent/filter-via-chat | search "dresses" via search bar | failing | agent chat shows stale "Dresses" filter on follow-up |
```

### Dedup

Key: `trigger_area + observation_area + verify text`. Same 70%
word-overlap rule as per-area probes, applied to the area pair.
A probe from A->B and a probe from B->A are different probes (different
causal direction).

### Bug Filing

When a cross-area probe escalates (3+ consecutive failures), the bug
entry in bugs.md lists the trigger area as primary and the observation
area in the summary: "Also affects: <observation_area>". This matches
the existing multi-area bug format in bugs-registry.md.

### Spot-Check Budget

Passing cross-area probes are spot-checked -- execute at most 3 passing
probes per run (selected randomly). Failing and untested cross-area
probes always execute. This bounds the front-load: a stable test file
with 5 passing cross-area probes spot-checks 3, not all 5.

### Progressive Narrowing Interaction

Progressive narrowing classifications (SKIP/PROBES-ONLY/FULL) apply to
per-area testing only. Cross-area probes execute in their own slot
regardless of the trigger or observation area's narrowing classification.
An area classified SKIP for per-area testing can still be a trigger or
observation target for cross-area probes.

### Cap

Maximum 10 active cross-area probes per test file. Cross-area probes
are more expensive than per-area (two navigation steps, no reset). If
the table exceeds 10 active entries, the oldest passing probes rotate
out first (same as per-area rotation).

### Proactive Restart Interaction

Cross-area probes must NOT be interrupted by a proactive restart --
they depend on state carry-over between trigger and observation areas.
The restart check is skipped during cross-area probe execution. The
MCP call counter still increments; the restart happens after the
cross-area probe sequence completes.
```

**Delta:** +72 lines in probes.md.

#### X1d. Test File Template Update

Add the `## Cross-Area Probes` section to test-file-template.md in the
template block, after `## Area Details` closing and before `## Area Trends`:

```markdown
## Cross-Area Probes

<!-- Probes that test state carry-over between areas. Run before per-area
     testing. See probes.md for lifecycle and generation triggers. -->

| Trigger Area | Action | Observation Area | Verify | Status | Priority | Confidence | Generated From | Run History |
|-------------|--------|-----------------|--------|--------|----------|------------|---------------|-------------|
```

Add to schema migration section:

```markdown
**v6 -> v7 changes:**
- New section: `## Cross-Area Probes` (scenario-level probe table for
  interactions spanning two areas)
- Probe generation: `related_bug` field for isolation probes
- Test file frontmatter: optional `mcp_restart_threshold` field

**Reading v6 files:** Treat missing `## Cross-Area Probes` section as
empty table. Do NOT rewrite on read.
```

**Delta:** +12 lines in test-file-template.md.

#### X1e. .user-test-last-run.json Schema

Add `cross_area_probes_run` field alongside existing `probes_run`:

```json
"cross_area_probes_run": [
  {
    "trigger_area": "browse/product-grid",
    "action": "search 'dresses' via search bar",
    "observation_area": "agent/filter-via-chat",
    "verify": "agent chat responds without stale category filter",
    "status": "failing",
    "result_detail": "agent showed stale Dresses filter on follow-up"
  }
]
```

**Delta:** 0 SKILL.md lines (documented in reference files only, same
pattern as existing schema additions).

---

### X2. Probe Isolation Guidance

**File:** `probes.md` Probe Generation section
**Problem:** Single probe tests symptom with multiple possible causes
**Fix:** Guidance for generating cause-isolated probes with `related_bug`

```markdown
### Multi-Cause Isolation

When a probe targets a symptom that could have multiple causes (e.g.,
two open bugs producing the same "0 results" failure), generate separate
probes per hypothesized cause. Each probe's setup must isolate the
variable being tested:

**Pattern:**

Symptom: y2k accessories returns 0 results
Cause A: empty data intersection (BUG003)
Cause B: search bar state contamination (UX010)

Isolated probe A:
  Setup: fresh session (no prior search bar usage)
  Query: "y2k accessories"
  Verify: "results include y2k-tagged items -- tests data coverage
    independent of search bar state"
  related_bug: BUG003

Isolated probe B (cross-area):
  Trigger: browse/product-grid -- search "dresses" via search bar
  Observation: agent/filter-via-chat -- ask for "y2k accessories"
  Verify: "agent clears stale category filter before applying y2k"
  related_bug: UX010

**`related_bug` field:** Optional field on any probe (per-area or
cross-area) linking the probe to a specific bug ID. When the probe
passes, it provides evidence that the linked bug is fixed. When it
fails, it confirms the linked bug is still active. Multiple probes
can reference the same bug -- each tests the bug from a different
angle.

**When to isolate:** The agent should consider isolation when:
- A probe has `escalated_to` linking to a bug, AND another open bug
  affects the same area or a related area
- A failing probe's `result_detail` is ambiguous ("0 results" without
  specifying whether the data is missing or the query is wrong)
- Two bugs in bugs.md have overlapping area slugs

**When NOT to isolate:** If only one bug exists for the symptom, or
if the causes are clearly distinguishable from the probe result alone,
isolation adds complexity without value. Single probes are preferred
when the cause is unambiguous.

**Bug lifecycle interaction:** When a bug is marked `fixed` in commit
mode, the agent should note whether probes with `related_bug` pointing
to that bug are passing or failing. If the bug is fixed but its related
probes fail, note the discrepancy in the report: "BUG003 marked fixed
but related probe still failing -- investigate." This keeps `related_bug`
informational while giving it a concrete use during the bug lifecycle.
```

**Delta:** +35 lines in probes.md.

---

### X3. Proactive Browser Restart

**Files:** `SKILL.md` (pointer), `references/connection-resilience.md` (NEW), `browser-input-patterns.md`
**Problem:** Connection degrades after ~18 MCP calls, reactive recovery
costs more than prevention
**Fix:** Proactive page reload at configurable threshold

#### X3a. Connection Resilience Reference File (NEW)

Create `references/connection-resilience.md`:

```markdown
# Connection Resilience

## Reactive (On Failure)

1. After any MCP tool failure: wait 3 seconds (`Bash: sleep 3`)
2. Retry the call once
3. If retry fails: display "Extension disconnected. Run `/chrome` and
   select Reconnect extension"
4. Track `disconnect_counter` for the session
5. If `disconnect_counter >= 3`: abort with "Extension connection
   unstable. Check Chrome extension status and restart the session."

## Proactive (Prevent Degradation)

6. Track `mcp_call_counter` for the session (increments on every
   successful MCP tool call)
7. When `mcp_call_counter` reaches `mcp_restart_threshold` (default: 15,
   configurable in test file frontmatter): navigate to the app entry URL
   (full page reload). Reset `mcp_call_counter` to 0. Log: "Proactive
   restart at call #N to prevent connection degradation."
8. The restart happens between areas, not mid-area. If the threshold is
   reached during an area, finish the current area first, then restart
   before the next area.
9. In iterate mode, the between-run reset counts as a restart. Reset
   `mcp_call_counter` at each between-run page reload.

## Disconnect Pattern Tracking

When `disconnect_counter` increments, record the context: which MCP tool
was called, which area was being tested, and the session MCP call count.

At run end, if `disconnect_counter >= 3`, append a disconnect analysis
to the SIGNALS section of the report.
```

#### X3b. SKILL.md Connection Resilience Pointer

Replace current Connection Resilience section with a slim pointer:

```markdown
### Connection Resilience

See [connection-resilience.md](./references/connection-resilience.md) for
reactive recovery, proactive restart at configurable MCP call threshold,
and disconnect tracking rules.
```

**Delta:** Replaces 7 lines with 3 lines = -4 lines in SKILL.md.

#### X3c. Frontmatter Addition

Add `mcp_restart_threshold` to test-file-template.md frontmatter:

```yaml
mcp_restart_threshold: 15  # optional, proactive page reload after N MCP calls
```

**Delta:** +1 line in test-file-template.md.

#### X3d. browser-input-patterns.md Note

Add after Modal Dialog Handling:

```markdown
## Proactive Restart

Sustained MCP tool usage degrades browser extension connections. The
skill proactively restarts (full page reload to app entry URL) after
a configurable number of MCP calls -- see Connection Resilience in
SKILL.md.

**What a restart clears:**
- Extension message channel state
- In-memory JavaScript variables
- Pending network requests

**What a restart does NOT clear:**
- Cookies and session storage (login state preserved)
- IndexedDB data
- Service worker caches

**Timing:** Restarts happen between areas. If a restart is triggered
mid-area, the current area completes first. The next area starts with
a fresh page load.

**Impact on cross-area probes:** Cross-area probes must NOT be
interrupted by a proactive restart -- they depend on state carry-over
between trigger and observation areas. The restart check is skipped
during cross-area probe execution. The counter still increments.
```

**Delta:** +18 lines in browser-input-patterns.md.

---

## Design Decisions

### D1. Cross-area probes run BEFORE per-area testing

Running cross-area probes first provides context for per-area scoring.
If search bar -> chat contamination fails, the agent knows that
agent/filter-via-chat results may be unreliable. This changes the
interpretation of per-area scores ("UX 4 on filter-via-chat, but
cross-area contamination probe failing -- score may be inflated in
clean sessions").

The alternative -- running after per-area testing -- means per-area
scores are computed without this context. Running before is more
informative.

### D2. Cross-area probes do NOT affect per-area scores

A failing cross-area probe means the seam between two areas is broken.
It doesn't mean either individual area is broken in isolation. Mixing
cross-area results into per-area scores would pollute maturity tracking
and make it impossible to determine whether an area is individually
healthy.

Cross-area probes have their own lifecycle. They can escalate to bugs
independently. The bug references both areas.

### D3. No reset between trigger and observation

This is the defining characteristic of cross-area probes. A per-area
probe with "navigate to area A, then navigate to area B" and a reset
between them is just two per-area probes. The cross-area probe's value
is testing what happens when state carries over -- stale filters, polluted
context, shared session state.

### D4. 10 active cross-area probe cap

Cross-area probes are expensive -- two navigations, no reset, harder to
debug when they fail. 10 is enough for a test file with 7-10 areas
(testing the most important seams). If more seams need testing, that's
a signal the app has too many state-sharing boundaries, which is itself
a finding worth reporting.

### D5. Proactive restart skips during cross-area execution

A proactive restart between the trigger and observation steps of a
cross-area probe would clear the exact state the probe is testing.
The restart check is suppressed during cross-area probe execution.
The MCP call counter still increments -- the restart happens after
the cross-area probe sequence completes.

### D6. Probe isolation is guidance, not automation

The skill cannot automatically determine that two bugs produce the same
symptom. The agent applies judgment: when a probe fails and the failure
could have multiple causes, generate isolated probes. This is documented
in the generation section as a pattern to follow, not a rule to enforce.
Automated isolation would require causal reasoning the agent doesn't
reliably have.

### D7. `related_bug` is optional and informational

The `related_bug` field links a probe to a bug for human/agent
comprehension. It does NOT change probe behavior -- a probe with
`related_bug: BUG003` follows the same lifecycle as any other probe.
The field provides traceability: when reviewing bugs.md, you can see
which probes are testing which bugs. When a bug is marked fixed,
you can check whether its related probes are passing.

---

## Line Budget

| File | Baseline | Delta | After | Notes |
|------|----------|-------|-------|-------|
| SKILL.md | 420 | +4 (X1b) -4 (X3b) | 420 | At ceiling |
| probes.md | ~283 | +72 (X1c) +35 (X2) | ~390 | |
| test-file-template.md | ~516 | +12 (X1d) +1 (X3c) | ~529 | |
| browser-input-patterns.md | ~121 | +18 (X3d) | ~139 | |
| connection-resilience.md | NEW | +30 (X3a) | ~30 | Extracted from SKILL.md |
| **Total** | | **+168** | | |

**SKILL.md stays at 420.** Cross-area pointer (+4) offset by connection
resilience extraction (-4). Net zero.

---

## Implementation Phases

### Phase 1: Schema (no behavior change)

- [x] Update `references/test-file-template.md` -- cross-area probe table,
  v7 migration notes, `mcp_restart_threshold` frontmatter, `related_bug`
  field documentation
- [x] Update `references/probes.md` -- cross-area probe lifecycle, generation
  triggers, execution, report section, dedup, bug filing, cap, restart
  interaction

### Phase 2: Probe Isolation

- [x] Update `references/probes.md` -- multi-cause isolation guidance,
  `related_bug` field, isolation pattern example, when to/not to isolate

### Phase 3: Proactive Browser Restart

- [x] Create `references/connection-resilience.md` -- reactive + proactive
  rules, disconnect tracking
- [x] Update `SKILL.md` -- replace Connection Resilience with 3-line pointer
- [x] Update `references/browser-input-patterns.md` -- proactive restart
  section (clears/preserves, timing, cross-area interaction)

### Phase 4: Cross-Area Execution

- [x] Update `SKILL.md` Phase 3 -- add cross-area probes pointer (4 lines)
- [x] Update `.user-test-last-run.json` schema -- `cross_area_probes_run`
  documented in probes.md cross-area section (0 SKILL.md lines per X1e)

### Phase 5: Version Bump & Validation

- [x] Bump version in `plugin.json` and `marketplace.json` (2.48.0 -> 2.49.0)
- [x] Update `CHANGELOG.md` with v7 schema changes
- [x] Line-count checkpoint: SKILL.md = 420 lines
- [x] Install locally to `~/.claude/skills/user-test/`
- [x] Verify: v6 test files read correctly (missing cross-area section = empty)
- [x] Verify: cross-area probe execution order (before per-area)
- [x] Verify: proactive restart fires between areas, not mid-area
- [x] Verify: restart skipped during cross-area probe execution

---

## Acceptance Criteria

### X1: Cross-Area Probes
- [ ] `## Cross-Area Probes` section in test file template
- [ ] Table schema: Trigger Area, Action, Observation Area, Verify,
      Status, Priority, Confidence, Generated From, Run History
- [ ] Execution slot: before per-area testing in Phase 3
- [ ] No reset between trigger action and observation verify
- [ ] Results in separate report section (not mixed into per-area table)
- [ ] Same lifecycle as per-area probes (escalation, graduation, confidence)
- [ ] Graduation requires both areas to have CLI coverage
- [ ] Dedup key: trigger_area + observation_area + verify text
- [ ] Bug filing: trigger area as primary, observation area in summary
- [ ] Cap: 10 active cross-area probes per test file
- [ ] Spot-check budget: max 3 passing probes per run, failing/untested always execute
- [ ] Progressive narrowing: cross-area probes ignore SKIP/PROBES-ONLY classification
- [ ] `cross_area_probes_run` in .user-test-last-run.json
- [ ] v6 -> v7 migration: missing section treated as empty table

### X2: Probe Isolation
- [ ] Multi-cause isolation pattern documented in probes.md
- [ ] `related_bug` field documented (optional, on any probe)
- [ ] Isolation example shows per-area + cross-area probe pair
- [ ] "When to isolate" checklist (multiple bugs, ambiguous detail,
      overlapping areas)
- [ ] "When NOT to isolate" guidance (single cause, unambiguous result)
- [ ] Bug lifecycle interaction: agent notes related_bug probe status when bug marked fixed

### X3: Proactive Browser Restart
- [ ] `mcp_call_counter` tracked per session
- [ ] Proactive restart at `mcp_restart_threshold` (default 15)
- [ ] Threshold configurable in test file frontmatter
- [ ] Restart happens between areas, not mid-area
- [ ] Restart skipped during cross-area probe execution
- [ ] `mcp_call_counter` reset on between-run page reload (iterate mode)
- [ ] Restart logged in report: "Proactive restart at call #N"
- [ ] browser-input-patterns.md documents what restart clears/preserves
- [ ] Connection resilience extracted to reference file (SKILL.md budget)

### Schema & Migration
- [ ] Schema version: v6 -> v7
- [ ] Cross-Area Probes section additive (missing = empty table)
- [ ] `related_bug` field additive (missing = no linked bug)
- [ ] `mcp_restart_threshold` additive (missing = default 15)
- [ ] Forward compatibility: v6 skill reads v7 files safely
- [ ] SKILL.md <= 420 lines after all changes

---

## Verification: Would This Have Caught the Real Bugs?

| Bug | Without this plan | With this plan |
|-----|-------------------|----------------|
| Search bar -> chat contamination (UX010) | Not testable -- no area owns the seam | Cross-area probe: trigger `browse/product-grid` search, observe `agent/filter-via-chat` state |
| y2k + contamination tangled (BUG003 + UX010) | Single probe fails ambiguously | Two isolated probes: fresh-session y2k (per-area, related_bug: BUG003) + contamination path (cross-area, related_bug: UX010) |
| 3 disconnects after call #18 | Tracked and reported, not prevented | Proactive restart at call #15 prevents degradation |

---

## Sources

### Internal References
- Current probe lifecycle: `probes.md`
- Current probe generation: `probes.md` (generation triggers section)
- Current connection resilience: `SKILL.md` (Phase 3)
- Current report output: `SKILL.md` (Phase 4)
- Current test file template: `test-file-template.md`
- Cross-area bug format: `bugs-registry.md`
- Multi-area bug filing: `bugs-registry.md`

### Institutional Learnings Applied
- **Agent-guided state transitions** (`docs/solutions/2026-02-26-agent-guided-state-and-mcp-resilience-patterns.md`): Cross-area probe generation uses agent judgment, not automated rules. The agent must identify plausible cross-area cause before generating.
- **Line budget enforcement** (`docs/solutions/2026-02-26-monolith-to-skill-split-anti-patterns.md`): Connection resilience extracted to reference file. Cross-area execution uses slim pointer. SKILL.md stays at 420.
- **Plugin versioning** (`docs/solutions/plugin-versioning-requirements.md`): MINOR version bump (2.48.0 -> 2.49.0) for new schema version.
