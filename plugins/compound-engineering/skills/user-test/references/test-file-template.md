# Test File Template

Test files live in `tests/user-flows/<scenario-slug>.md` in the target project. Each file is a living document that compounds knowledge across runs.

## Template

```markdown
---
schema_version: 8
scenario: "<scenario-name>"
app_url: "http://localhost:3000"
created: "<YYYY-MM-DD>"
last_run: "<YYYY-MM-DD>"
seams_read: false  # set to true after first code-reading pass (see orientation.md)
cli_test_command: ""  # optional, e.g. "node scripts/test-cli.js --query '{query}'"
cli_queries:  # optional
  # - query: "example query"
  #   expected: "description of correct response (agent evaluates semantically)"
  #   prechecks: "area-slug"  # optional — browser area to skip on CLI failure
  #   graduated_from: "B001"  # optional — bug ID that spawned this check (see graduation.md)
performance_thresholds:  # optional, seconds
  # fast: 2
  # acceptable: 8
  # slow: 20
  # broken: 60
mcp_restart_threshold: 15  # optional, proactive page reload after N MCP calls
---

# <Scenario Name>

## Areas

| Area | Status | Last Score | Last Quality | Last Time | Consecutive Passes | Notes |
|------|--------|------------|-------------|-----------|-------------------|-------|
| <area-slug> | Uncharted | — | — | — | 0 | |

## Area Details

### <area-slug>

**Interactions:** <1-3 user-facing tasks this area covers>

**What's tested:** <what does "good" look like for this area? Be specific about the domain. What are the ways the output could be subtly wrong?>

**pass_threshold:** 4

**weakness_class:** <!-- optional, written by commit mode when 2+ probes share a failure pattern. See probes.md Weakness Classification. -->

**verify:**
- <optional: freeform verification instructions — what claims to audit>
- <e.g., "read every condition badge, compare against requested filter">

**Queries:** <!-- For scored_output areas. Remove for non-output areas. See Area Depth below. -->

| Query | Ideal Outcome | Check | Status | Notes |
|-------|--------------|-------|--------|-------|

**Multi-turn:** <!-- For conversational/multi-step areas. Remove if single-interaction. -->

| Turn | Query | Check |
|------|-------|-------|

**Probes:**

| Query | Verify | Status | Priority | Confidence | Generated From | Run History |
|-------|--------|--------|----------|------------|---------------|-------------|

Run History format: comma-separated P/F entries, most recent first. Example: `P,P,F,P` (4 runs: latest passed twice, then failed, then passed). Cap at 10 entries, drop oldest. Consecutive count for escalation/graduation is computed from the leading streak.

## Cross-Area Probes

<!-- Probes that test state carry-over between areas. Run before per-area
     testing. See probes.md for lifecycle and generation triggers. -->

| Trigger Area | Action | Observation Area | Verify | Status | Priority | Confidence | Generated From | Run History |
|-------------|--------|-----------------|--------|--------|----------|------------|---------------|-------------|

## Area Trends

<!-- Auto-maintained from score-history.json. Do not edit manually. -->

| Area | Trend | Last Score | Delta |
|------|-------|------------|-------|

## Explore Next Run

<!-- Priority: P1 = likely user-facing friction, P2 = edge case worth knowing, P3 = curiosity -->
<!-- Mode: CLI = agent reasoning only, Browser = rendering/interaction, Both = CLI reasoning + browser verification -->

| Priority | Area | Mode | Why |
|----------|------|------|-----|
| P1 | | | |

## Run History

<!-- Keep last 50 entries. Oldest entries rotate out. -->

| Date | Areas Tested | Quality Avg | Delta | Pass Rate | Best Area | Worst Area | Demo Ready | Context | Key Finding |
|------|-------------|-------------|-------|-----------|-----------|------------|------------|---------|-------------|

## UX Opportunities Log

<!-- Action items: things to improve. Keep last 20 open entries. -->

| ID | Area | Priority | Status | Suggestion |
|----|------|----------|--------|-----------|

## Good Patterns

<!-- Preservation notes: things to protect. Auto-expire after 5 unconfirmed runs. -->

| Area | Pattern | First Seen | Last Confirmed |
|------|---------|------------|----------------|
```

## Schema Migration

**v1 → v2 changes:**
- Areas table: added `Last Quality` and `Last Time` columns
- Run History table: added `Delta` and `Context` columns
- Frontmatter: added optional `cli_test_command`, `cli_queries`, `performance_thresholds`

**v2 → v3 changes:**
- New section: `## Area Trends` (thin summary from score-history.json)
- New section: `## UX Opportunities Log` (P1/P2 improvement suggestions with status lifecycle)
- New section: `## Good Patterns` (patterns worth preserving, separate from opportunities)
- New standalone file: `tests/user-flows/score-history.json` (machine-readable per-area history)
- Run History table: added `Best Area` and `Worst Area` columns
- Area Details: added optional `pass_threshold` and `quality_threshold` fields
- Frontmatter: added optional `graduated_from` field on cli_queries entries

**Reading v1 files:** Fill missing columns with defaults (`—` for scores/times, empty for notes). Do NOT rewrite the file on read.

**Reading v2 files:** Fill missing sections (Area Trends, UX Opportunities Log, Good Patterns) with empty tables. Fill missing Run History columns (Best Area, Worst Area) with `—`. Do NOT rewrite the file on read.

**Reading v3 files:** Treat missing `verify:` blocks and `Probes:` tables as absent (no verification steps, no probes). Do NOT rewrite the file on read.

**Reading v4 files:** Treat missing `**Queries:**` and `**Multi-turn:**` tables as absent (no queries, no multi-turn sequences). Do NOT rewrite the file on read.

**Reading any file missing `cli_test_command`:** Treat as `cli_test_command: ""`
regardless of schema version. CLI discovery runs in Phase 1 step 3.

**v4 → v5 changes:**
- Area Details: added optional `**Queries:**` table (`| Query | Ideal Outcome | Check | Notes |`) (v6 adds Status column)
- Area Details: added optional `**Multi-turn:**` table (`| Turn | Query | Check |`)
- Area Details: `**What's tested:**` expanded to include domain-specific guidance
- New reference file: `queries-and-multiturn.md` (per-area execution checklist, scoring boundaries, query compounding)
- New section in this file: Area Depth (thin vs rich definitions, writing queries, multi-turn, first-run quality)

**v5 → v6 changes:**
- Probes table: added `Priority`, `Confidence`, `Generated From`, `Run History` columns (replaces `Generated`)
- Queries table: added `Status` column (between Check and Notes)
- Frontmatter: added `seams_read` field (boolean, default `false`)
- New reference file: `orientation.md` (code-reading step for first-run structural hypothesis probes)
- New probe generation trigger: `structural-hypothesis` (from code reading)
- New query status lifecycle: active → `[stable]` → `[retired]` (see queries-and-multiturn.md step 12)

**Reading v5 files:** Probes without `Confidence` column → treat as `confidence: high` (existing probes were generated from observed failures). Probes without `Priority` column → infer from `Generated From` (verification failure → P1, score-based → P2). Queries without `Status` column → treat as active. Existing `[stable]` tags in Notes column → migrate to Status column on first v6 commit, remove from Notes. Missing `seams_read` → treat as `false` (triggers Orientation on first v6 run). Do NOT rewrite the file on read.

**v6 → v7 changes:**
- New section: `## Cross-Area Probes` (scenario-level probe table for interactions spanning two areas)
- Probe generation: optional `related_bug` field for isolation probes (any probe, per-area or cross-area)
- Test file frontmatter: optional `mcp_restart_threshold` field (default 15)
- Connection resilience extracted to `references/connection-resilience.md`

**Reading v6 files:** Treat missing `## Cross-Area Probes` section as empty table. Treat missing `mcp_restart_threshold` as 15. Treat probes without `related_bug` as unlinked. Do NOT rewrite on read.

**v7 → v8 changes:**
- Area Details: optional `**weakness_class:**` field (below `pass_threshold`), written by commit mode when 2+ probes share a failure pattern
- Area Details: `**verify:**` blocks auto-updated with confirmed selectors by commit mode (append-only, run-tagged)
- Areas table: Notes column receives tactical run notes in `[Run N] <finding>` format (max 3 entries, drop oldest)
- `.user-test-last-run.json` schema extracted to `references/last-run-schema.md`
- `.user-test-last-run.json`: new per-area fields (`tactical_note`, `confirmed_selectors`, `weakness_class`, `adversarial_browser`, `adversarial_trigger`)
- `.user-test-last-run.json`: new top-level key `novelty_fingerprints` (accumulates across runs, 20-per-area cap)
- `.user-test-last-run.json`: cross-area synthesis entries in `explore_next_run` with `weakness_class`, `affected_areas`, `adversarial_instruction`

**Reading v7 files:** Treat missing `weakness_class` as absent. Treat missing `novelty_fingerprints` as empty. Treat missing `adversarial_browser` as false. Do NOT rewrite on read.

**CLI gate for query retirement:** Only queries in test files with `cli_test_command` set can reach `[retired]` status. Queries without CLI backstop max out at `[stable]` and continue receiving browser spot-checks via the Proven area MCP budget. If `cli_test_command` is removed from a file with `[retired]` queries, those queries demote to `[stable]` on next commit.

**Writing any file:** Upgrade to v8 on commit. Bump `schema_version: 8` in frontmatter on the first commit under v8 skill logic. The version number reflects which skill version last wrote the file.

**Forward compatibility:** Ignore unknown frontmatter fields from future schema versions. Preserve unknown table columns on write.

## Pass Thresholds

Each area can define explicit pass thresholds in its area details:

```markdown
### checkout/shipping-form
**Interactions:** Enter address, select method, see estimate
**What's tested:** Form validation + shipping logic
**pass_threshold:** 4
```

For `scored_output` areas, add a quality threshold:

```markdown
### agent/search-results
**Interactions:** Enter query, review results, refine search
**What's tested:** Result relevance and ranking quality
**scored_output:** true
**pass_threshold:** 4
**quality_threshold:** 3
```

**Defaults:** `pass_threshold: 4`, `quality_threshold: 3` (for scored_output areas). These match the v2 implicit behavior but are now explicit and per-area configurable.

**Promotion gate:** "2+ consecutive passes" means 2+ consecutive runs where UX >= `pass_threshold` (and Quality >= `quality_threshold` for scored_output areas).

## Known-Bug Area Details

Areas with `Known-bug` status include additional fields:

```markdown
### cart-quantity-update
**Status:** Known-bug
**Issue:** #47
**Bug ID:** B001
**Fix check:** Verify quantity updates in <5s and cart badge reflects new count
```

The `**Issue:** #<number>` field is the canonical reference for `gh issue view`. The `**Bug ID:** B00N` field links to the bug registry entry. The `**Fix check:**` field describes what to verify when the issue is closed — fix_check passes when score >= area's `pass_threshold`.

## Score History JSON

Per-area score history is stored in `tests/user-flows/score-history.json`:

```json
{
  "areas": {
    "checkout/cart": {
      "scores": [
        { "date": "2026-02-28", "ux": 3, "quality": null, "time": 8 },
        {
          "date": "2026-03-01", "ux": 4, "quality": 4.1, "time": 7,
          "quality_by_query": [
            { "query": "vintage denim jacket", "scores": [4, 5], "avg": 4.5 },
            { "query": "y2k accessories", "scores": [3, 2], "avg": 2.5, "outlier": true }
          ]
        }
      ],
      "cli_metrics": [
        { "date": "2026-03-01", "avg_tool_calls": 2.5, "avg_time": 17.0 }
      ],
      "trend": "improving"
    }
  }
}
```

**Storage:** Last 10 entries per area. Oldest drops when 11th is recorded. One file per project. `quality_by_query` follows the same rotation — last 10 entries per query.

**`quality_by_query`:** Only present for `scored_output: true` areas with multiple Queries. The `outlier: true` flag is set when avg ≤ 3. Query text is the key — when commit mode sharpens a query (step 8), the old query gets a final entry and the new sharpened query starts fresh. Sharpening breaks per-query trend continuity; the area-level quality trend (which averages all queries) provides continuity across sharpening events. Old test files without `quality_by_query` parse fine — the field is purely additive.

**Trend values:** `improving` (last 3 trending up), `stable` (variance < 0.5), `declining` (last 3 trending down), `volatile` (variance >= 1.0), `fixed` (previous <= 2, current >= pass_threshold).

**Gitignore:** Add `score-history.json` to `.gitignore` if the project treats test data as ephemeral. Otherwise keep it committed for team visibility.

## UX Opportunity Lifecycle

| Status | Meaning |
|--------|---------|
| open | Suggestion logged, not yet acted on |
| implemented | Improvement was made (agent detects or user marks) |
| wont_fix | Explicitly declined (prevents re-suggestion) |

Keep last 20 `open` entries. `implemented` and `wont_fix` age out after 30 days.

Dedup: anchored on area slug + priority level. Agent decides whether to update or create new — no automated text matching.

## Good Patterns Lifecycle

`Last Confirmed` updates each run that observes the pattern. Patterns not confirmed for 5+ runs are removed. Dedup on area slug only (one pattern entry per area).

Only log patterns at score 4-5 that represent a deliberate design choice, not just "page loaded successfully."

## Area Granularity

Each area should cover 1-3 scored interaction units. An interaction unit is one user-facing task completion (e.g., "add item to cart"), not a page load or navigation step.

### Worked Example: Checkout Flow

Instead of one large "checkout" area, decompose into:

| Area | Interactions | What's Tested |
|------|-------------|---------------|
| `checkout/cart-validation` | Add item, verify count, change quantity | Cart state management |
| `checkout/shipping-form` | Enter address, select method, see estimate | Form validation + shipping logic |
| `checkout/payment-submission` | Enter card, submit, see confirmation | Payment flow + success state |

This granularity ensures:
- A single bug doesn't reset a huge chunk of proven territory
- Areas are small enough to accumulate consecutive passes meaningfully
- Each area maps to a distinct `user-test:<area-slug>` label for issue tracking

### Worked Example: Settings Page

| Area | Interactions | What's Tested |
|------|-------------|---------------|
| `settings/profile-update` | Edit name, upload avatar, save | Profile persistence |
| `settings/notifications` | Toggle email prefs, save, verify | Notification preferences |
| `settings/account-delete` | Click delete, confirm dialog, verify | Destructive action flow |

### Worked Example: AI-Powered App

Apps with AI output (search, recommendations, chatbots, generated content) need rich area definitions with Queries that test domain understanding. Decompose by capability:

| Area | Interactions | What's Tested |
|------|-------------|---------------|
| `agent/search-quality` | Enter query, review results | Domain vocabulary mapping |
| `agent/conversation` | Multi-turn refinement | Context retention across turns |
| `agent/edge-cases` | Confusing or out-of-scope input | Graceful degradation |

Here's what a rich `agent/search-quality` area looks like for a bedding store:

```markdown
### agent/search-quality
**Interactions:** Enter query, review results, assess whether the app understood what the user actually meant — not just the keywords
**What's tested:** Does the app translate lifestyle language into correct domain attributes? Does it surface results the user didn't know to ask for but would love?
**scored_output:** true
**pass_threshold:** 4
**quality_threshold:** 3

**Queries:**

| Query | Ideal Outcome | Check | Status | Notes |
|-------|--------------|-------|--------|-------|
| "I run warm and want crisp not silky" | Percale, linen. NOT sateen/flannel | (1) cooling (2) crisp feel | | |
| "earth tones — terracotta, sage, clay" | Specific warm colors, not generic neutrals | Color precision | | |
| "my partner and I disagree on temperature" | Compromise or dual-zone solutions | Both needs addressed | | |
| "something nice" | Clarifying questions, not random guesses | Handles vagueness | | |
| "linen because it's so soft and wrinkle-free" | Corrects both misconceptions gently | Factual accuracy | | |

**Multi-turn:**

| Turn | Query | Check |
|------|-------|-------|
| 1 | "show me white sheets" | Broad white results |
| 2 | "boring — add color" | NOT white added, muted tones |
| 3 | "sage, but cozy not crisp" | Sage + cozy materials, turns 1-2 remembered |

**verify:**
- Sample 5-8 results, read material/color attributes
- Every result should match stated filters
- If agent claims "all cooling" — verify no flannel/heavy cotton
```

When `scored_output: true`, the area is scored on both UX (1-5) and output quality (1-5). The `Last Quality` column tracks the output quality score.

**Translating to other domains:** The query types are universal. For a recipe app: "I run warm" becomes "quick weeknight dinner for a picky toddler." "Crisp not silky" becomes "healthy but my kids will eat it." "Linen because it's soft" becomes "sear meat to lock in juices" (common misconception). For a code assistant: "something nice" becomes "fix it." "Competing constraints" becomes "fast but maintainable." The structure is the same — the domain content is different.

## Area Depth

Granularity determines how many areas you have. **Depth** determines how useful each area is. A thin area produces generic scores. A rich area produces specific, actionable findings that compound across runs.

### Thin vs. Rich Area Definitions

**Thin (produces "4/5, looked fine"):**

```markdown
### search-results
**Interactions:** Enter query, review results
**What's tested:** Result relevance
**scored_output:** true
```

**Rich (produces "4/5, but missed terracotta — returned generic neutrals. Agent correctly mapped 'crisp' to percale but didn't exclude sateen"):**

```markdown
### search-results
**Interactions:** Enter query, review results, assess domain interpretation
**What's tested:** Does the app translate natural language into correct domain attributes? Does it understand subjective vocabulary, competing constraints, and emotional context?
**scored_output:** true
**pass_threshold:** 4
**quality_threshold:** 3

**Queries:**

| Query | Ideal Outcome | Check | Status | Notes |
|-------|--------------|-------|--------|-------|
| "I run warm and want crisp not silky" | Percale, linen. NOT sateen/flannel | (1) cooling (2) crisp feel | | |
| "earth tones — terracotta, sage, clay" | Specific warm colors, not generic neutrals | Color precision | | |
| "my partner and I disagree on temperature" | Compromise solutions (dual-zone, blends) | Both needs addressed | | |
| "something nice" | Clarifying questions, not random results | Handles vagueness | | |
| "I want linen because it's soft" | Gentle correction — linen is crisp, not soft | Factual accuracy | | |

**Multi-turn:**

| Turn | Query | Check |
|------|-------|-------|
| 1 | "show me white sheets" | Broad white results |
| 2 | "boring — add color" | NOT white added, muted tones |
| 3 | "sage, but cozy not crisp" | Sage + cozy materials, context retained |

**verify:**
- Sample 5-8 results, read material/color attributes
- Every result should match the stated filters
- If agent claims "all cooling materials" — verify no flannel/heavy cotton
```

The rich definition tells the agent exactly what to look for, what "good" means in this specific domain, and how the output could be subtly wrong. It compounds: queries that fail generate probes, probes that persist generate bugs, bugs that fix generate CLI regression checks.

### Writing Good Queries

Queries test the app's **understanding**, not just its functionality. "Show me blue sheets" tests filtering. "I want something calming for my bedroom — maybe ocean-inspired?" tests whether the app understands that "calming + ocean" means soft blues and greens, not literal ocean-print sheets.

**Queries are only valid in `scored_output: true` areas.** If an area has Queries but not `scored_output: true`, the agent flags it during Phase 1 and suggests adding `scored_output: true`.

**Include at least:**

1. **Subjective/lifestyle query** — uses natural language the app must interpret. For a bedding app: "I want to feel like I'm sleeping in a cloud." For a recipe app: "quick weeknight dinner for a picky toddler." For a code assistant: "make this function more readable, not clever."

2. **Competing constraints** — two preferences that tension against each other. Bedding: "soft but cool." Recipes: "healthy but my kids will eat it." Code: "fast but maintainable."

3. **Edge case** — tests the boundary of the app's domain. Bedding: "do you have bath towels?" Recipes: "I only have canned goods and spite." Code: "rewrite this in a language you don't support."

4. **Wrong premises** — the user believes something incorrect. Bedding: "linen because it's so soft." Recipes: "sear the meat to lock in juices." Code: "use a singleton because it's the cleanest pattern."

5. **Vague input** — the minimal useful query. Bedding: "something nice." Recipes: "dinner." Code: "fix it." Should the app ask for more info or make smart defaults?

**Queries compound across runs.** A query that scores 3/5 generates a probe. That probe either gets fixed (the app improves) or escalates to a bug. Either way, you now know exactly where the app's understanding breaks.

### Writing Good Multi-turn Sequences

Multi-turn sequences test whether the app maintains context as the user changes their mind or evolves their preferences.

**Each turn should build on or contradict the previous turn:**
- Turn 1: Broad starting point
- Turn 2: Refine or pivot ("actually, not that — more like this")
- Turn 3: Specific constraint that requires remembering turns 1-2

**Scoring:** The final turn gets the Quality score. Context failures at intermediate turns generate probes targeting the specific turn that broke, and are noted in the area assessment, but do not directly reduce UX or Quality scores. This follows the same pattern as verification failures — they're important findings recorded separately.

### First-Run Query Quality

Run 1 queries will be approximate. The agent is seeing the app for the first time and writing its best guess at domain-specific tests. That's expected and fine.

After run 1, commit mode sharpens them: failed queries generate probes targeting the specific gap, exploration reveals new queries worth adding. By run 3, the Queries table is specific to THIS app's actual strengths and weaknesses — not because anyone hardcoded domain knowledge, but because the queries evolved from real observations.

## CLI Discovery

During Phase 1, actively look for a CLI-testable API surface. This runs for **both new and existing test files** — if an existing file has `cli_test_command: ""`, discovery runs and populates it. CLI mode catches agent reasoning errors in ~30 seconds without browser overhead — browsers should only test what CLI can't (rendering, animations, SSE delivery, click interactions).

### Discovery Steps

Try ALL approaches below in order. If one fails (e.g., a script has runtime errors), proceed to the next. Do NOT conclude "CLI not viable" until every approach has been attempted.

1. **Check for API indicators:**
   - `package.json` scripts containing `dev`, `start`, or `serve`
   - `.env` or `.env.local` files with `PORT`, `API_URL`, or endpoint references
   - Directories: `src/api/`, `src/server/`, `src/routes/`, `routes/`, `api/`
   - Files: `server.ts`, `server.js`, `index.ts` with express/hono/fastify imports

2. **Check for curl-able endpoints (try this FIRST — most reliable):**
   - Look for route definitions (POST/GET handlers) in the codebase
   - Identify the chat/agent/search endpoint that powers the app's core feature
   - Test it: `curl -s -X POST http://localhost:{port}/{endpoint} -H "Content-Type: application/json" -d '{"message": "test"}'`
   - **If curl returns JSON:** Use this as `cli_test_command`. Stop — no need to try test scripts.
   - **If curl fails or times out:** The server may not be running. Still populate `cli_test_command` from code analysis (route definitions, package.json scripts) even if the endpoint can't be verified live.

3. **Check for existing test scripts (fallback if curl doesn't work):**
   - `scripts/verify*.ts`, `scripts/test-cli*`, `scripts/smoke-test*`
   - `package.json` scripts with `verify`, `test:e2e`, `test:api`
   - **If a script errors:** Try to fix trivially (missing dependency, wrong import). If not trivially fixable, skip it and note "test script broken — using curl instead" or "no CLI surface found."

4. **If ANY testable surface was found:**
   - Set `cli_test_command` in frontmatter (use the curl pattern that returns JSON, not SSE)
   - Generate `cli_queries` from `scored_output` area Queries, mapping:
     - Query → `query` field
     - Ideal Outcome → `expected` field (semantic description)
     - Area slug → `prechecks` field (gates browser testing)

### CLI Test Command Patterns

| App Type | Pattern |
|----------|---------|
| Express/Hono API with JSON fallback | `curl -s -X POST http://localhost:{port}/{endpoint} -H "Content-Type: application/json" -d '{"message": "{query}"}'` |
| Express API with SSE only | CLI testing may not be viable. Check for a separate REST route, a JSON fallback (omit `Accept: text/event-stream`), or a test script. Don't parse SSE streams from curl — it's fragile and wastes time. |
| Direct script invocation | `npx tsx scripts/verify-agent.ts "{query}"` |
| REST API (GET) | `curl -s "http://localhost:{port}/api/search?q={query}"` |

### Mapping Area Queries to CLI Queries

For each `scored_output` area with a **Queries:** table, generate one `cli_queries` entry per query:

```yaml
# From area agent/search-quality Query: "I run warm and want crisp not silky"
cli_queries:
  - query: "I run warm and want crisp not silky"
    expected: "Results include percale and linen. No sateen or flannel."
    prechecks: "agent/search-quality"
```

**Only map queries that test agent reasoning** — skip queries that test pure UI behavior (click interactions, filter panel rendering, suggestion chip behavior). Those need browser testing and have no CLI equivalent.

**Queries that test both reasoning and rendering** can still map to CLI — the CLI tests the reasoning half. The browser area tests the rendering half independently. Example: "add the cheapest one to my cart" becomes a CLI query with expected "identifies the lowest-priced item and calls add-to-cart tool" — the browser separately checks whether the cart badge updated. One query, two test layers.

### When CLI Discovery Finds Nothing

If the app has no backend API (pure static frontend, no server-side logic), set `cli_test_command: ""` and skip CLI query generation. The test file works exactly as before — browser-only testing.

### CLI Response Evaluation

When evaluating CLI responses, assess the **full response** — not just the text message. Check tool calls (were the right tools used with correct arguments?), structured data (are search facets, filters, and categories correct?), and metadata (suggestions, confidence scores, session state). The `expected` field should describe what a correct *response* looks like, not just what correct *text* looks like.

### Run 1 CLI Queries Will Be Approximate

Same principle as browser Queries: run 1 is the agent's best guess. Commit mode sharpens them. If a CLI query's `expected` description is too vague ("returns good results"), the scoring will be generous. By run 2, the agent has seen real responses and writes sharper expectations.

## Probe Statuses Reference

| Status | Meaning |
|--------|---------|
| `untested` | Generated, not yet run |
| `passing` | Ran, verification passed |
| `failing` | Ran, verification failed |
| `flaky` | Mixed results across 3+ runs (at least 1 pass and 1 fail, no streak) |
| `graduated` | Promoted to CLI regression check (read-only historical record) |

See [probes.md](./probes.md) for lifecycle rules, dedup, cap/rotation, escalation, and graduation.

## Probe Confidence Reference

| Confidence | Meaning |
|-----------|---------|
| `high` | Generated from observed failure, or confirmed by a failing run |
| `medium` | Generated from structural read or timing signal — not yet confirmed |
| `low` | Generated from weak signal or wide inference — run early to validate |

See [probes.md](./probes.md) for default confidence values by generation trigger, execution priority within confidence levels, and update rules.

## Query Status Reference

| Status | Meaning | Execution |
|--------|---------|-----------|
| (empty) | Active, exploratory | Full browser + CLI execution |
| `[stable]` | 5/5 for 3+ consecutive runs | CLI only — no browser execution |
| `[retired]` | Stable for 10+ consecutive runs (CLI-capable only) | Skip entirely |

See [queries-and-multiturn.md](./queries-and-multiturn.md) step 12 for transition rules, regression thresholds, and CLI gate.

## Maturity Status Reference

| Status | Symbol | Meaning |
|--------|--------|---------|
| Proven | Proven | 2+ consecutive passes, no functional regressions, no verification failures |
| Uncharted | Uncharted | Default state, or demoted from Proven |
| Known-bug | Known-bug | Issue filed, skip until fix deployed |
