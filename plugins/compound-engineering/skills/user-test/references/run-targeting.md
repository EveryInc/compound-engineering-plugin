# Run Targeting

Rules for deciding which areas get tested each run, how deeply, and in what order.
Three mechanisms — area selection priority, git-aware targeting, and progressive
narrowing — work together to focus testing time where it has the most impact.

## Area Selection Priority

0. **Code-affected areas (if git diff available):** Full exploration regardless of maturity status — even Proven areas get the full checklist. See Git-Aware Targeting below.
1. **Pick highest-priority Explore Next Run items first** (P1 > P2 > P3), not FIFO
2. **Uncharted areas:** Full investigation with batched `javascript_tool` calls. See [browser-input-patterns.md](./browser-input-patterns.md) for input patterns and batching tips.
3. **Proven areas:** Quick spot-check only (max 3 MCP calls per area, plus any failing/untested probes). Verify the happy path still works.
4. **Known-bug areas:** Check if the linked issue is resolved before skipping:
   - If `gh` not authenticated: skip as normal
   - Run `gh issue view <issue-number> --json state -q '.state'`
   - If `closed`: flip area to Uncharted, run the `fix_check` as the first test
   - If `open`: skip as normal, note in output
   - If fix check fails (score <= 2): file new issue with "Regression of #N" referencing the original closed issue
5. **If all areas are Proven:** Spot-check all, then suggest new scenarios in "Explore Next Run"

## Git-Aware Targeting

Compute code diffs from **two sources**. If EITHER produces files, those files trigger area targeting — no exceptions.

1. **Branch diff:** If `git_sha` from the previous run differs from HEAD, run `git diff --name-only <old_sha>..HEAD`.
2. **Main diff:** Run `git diff --name-only origin/main..HEAD` (or `origin/master..HEAD`). This produces files whenever HEAD and origin/main differ — regardless of which is "ahead." Direction does not matter. If the diff returns files, those files are code changes.

**Interpreting results:** Union all files from both diffs. If the union is empty, report "No code changes since last run." If the union has ANY files, every file in that list is a code change that MUST be mapped to test areas for full exploration. Do NOT filter, dismiss, or deprioritize files for any reason — not "already tested," not "origin/main is behind HEAD," not "these are old changes." A non-empty diff = code-affected areas = full exploration.

**Why both diffs:** The branch diff catches new commits. The main diff catches divergence between your branch and main (squash merges, rebases, or simply being on a feature branch with changes vs main). Both are code the test areas need to cover.

### Priority Integration

Git targeting **augments** the priority list — it adds areas to the full-exploration set, it doesn't filter or demote existing priorities. Explore P1 items always get full exploration regardless of code changes.

1. **Code-affected areas** (full exploration, regardless of maturity)
2. P1 Explore Next Run items (full exploration — P1 means "test this thoroughly")
3. Uncharted areas (existing)
4. Proven areas — spot-check UNLESS code-affected (existing)
5. Known-bug areas (existing)

### Display at Run Start

When EITHER diff produces files, display this block. Never say "No code changes" unless BOTH diffs return zero files.
```
Code changes detected (27 files):
  Branch diff: <old_sha>..HEAD — 0 files (no new commits)
  Main diff: origin/main..HEAD — 27 files
Mapped to areas:
- src/agent/orchestrator.ts → agent/search-query, agent/filter-via-chat
- src/tools/cart/add-to-cart.ts → cart/add-remove
Full exploration: agent/search-query, agent/filter-via-chat, cart/add-remove
```

### Edge Cases

- **No .git:** Skip targeting. Note "Not a git repo — testing all areas equally."
- **SHA not in history (rebase/force push):** Warn, test all areas.
- **Feature branch (main behind HEAD):** The main diff still produces files — these ARE the branch's changes vs main and MUST trigger area targeting. "Behind HEAD" is not a reason to skip.
- **>30 changed files:** Treat as "everything affected." Display "Large changeset (N files) — testing all areas." CLI-first ordering still applies.
- **Only docs/config:** Note "Only docs/config changed — normal priority." Skip code targeting.
- **Monorepo:** Agent ignores paths outside app source tree.

### Report Section

Add to run summary when targeting was active:
```
Code Changes Since Last Run (abc1234 → def5678):
  12 files changed, 3 mapped to test areas
  Targeted: agent/search-query ← orchestrator.ts; cart/add-remove ← add-to-cart.ts
  Spot-check only: browse/product-grid, browse/filters, compare/add-view
```

## Progressive Narrowing (Run 2+)

After run K completes, classify each area for run K+1:

**SKIP** — Area scored ≥ 4 with 0 probe failures AND 0 verification mismatches in run K. No browser testing in run K+1. Note in report: "Skipped (stable in R{K})". CLI queries still run as a lightweight quality check (see D4 in plan). Failing/untested probes still execute if any exist — the probe uncap rule is not overridden by SKIP.

**PROBES-ONLY** — Area scored ≥ 4 but has active failing/flaky probes. Execute ALL probes (failing, untested, AND passing as spot-checks) in run K+1 plus 1 exploration MCP call. No broad exploration beyond that.

**FULL** — Area scored ≤ 3, OR had a verification mismatch, OR has a newly injected probe from run K, OR is the target of an Explore Next Run P1 item. Full exploration in run K+1 with injected probes.

**Override priority** (first match wins):
1. Git-diff `(verify)` → FULL (always)
2. Explicit user override → FULL (all areas)
3. This classification (SKIP/PROBES-ONLY/FULL)
4. Proven 3-MCP budget (R1 or N=1 only)

Time freed from SKIP areas redistributes to FULL areas. This makes R2 systematically different from R1 — it pushes on weakness, not uniformity.

**Interaction with within-session probe injection:** If R1 generates a new probe targeting a SKIP area, the injected probe has status `untested` and executes under the uncap rule. The area stays labeled SKIP in the display — the probe is an exception, not a reclassification to PROBES-ONLY.

**Display at R2 start:**
```
Progressive narrowing (based on R1 results):
  SKIP:        browse/product-grid (5), browse/filters (5),
               cart/add-remove (4), compare/add-view (4)
  PROBES-ONLY: agent/filter-via-chat (4, 1 active failing probe)
  FULL:        agent/search-query (Q2 outlier), browse/product-detail (P2 explore)
  Time saved:  ~12 min (4 areas skipped in browser)
```

**N=1 edge case:** Progressive narrowing only applies to runs 2+. N=1 iterate sessions test all areas per normal priority rules.

**Retest classification is stored per-run** in `.user-test-last-run.json` under each run's per-area data as `retest_classification: "SKIP"`. This feeds the N-run summary trajectory display (e.g., "cart/add-remove: R1 FULL → R2 SKIP → R3 SKIP (stable)"). SKIP areas that maintained score via CLI appear as "Stable (not retested in browser)" — distinct from "Stabilized (tested and passed)."
