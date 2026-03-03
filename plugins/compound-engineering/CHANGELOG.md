# Changelog

All notable changes to the compound-engineering plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.49.0] - 2026-03-02

### Added

- **`user-test` skill — cross-area probes, probe isolation, proactive browser restart (schema v7):**
  - Cross-area probe table: scenario-level probes that test state carry-over between areas (trigger area → observation area)
  - Cross-area execution slot: runs before per-area testing in Phase 3, no reset between trigger and observation
  - Spot-check budget: max 3 passing cross-area probes per run, failing/untested always execute
  - Progressive narrowing: cross-area probes ignore SKIP/PROBES-ONLY classification
  - Cap: 10 active cross-area probes per test file
  - Probe isolation: multi-cause isolation pattern for generating cause-specific probes
  - `related_bug` field: optional field linking any probe to a bug ID for traceability
  - Bug lifecycle interaction: agent notes related_bug probe status when bug marked fixed
  - Proactive browser restart: page reload at configurable `mcp_restart_threshold` (default 15 MCP calls)
  - Connection resilience extracted to `references/connection-resilience.md` (SKILL.md budget savings)
  - Restart skipped during cross-area probe execution (preserves state carry-over)
  - New reference file: `connection-resilience.md` (reactive + proactive rules, disconnect tracking)
  - v6 → v7 schema migration: Cross-Area Probes section, `related_bug`, `mcp_restart_threshold`

## [2.48.0] - 2026-03-02

### Added

- **`user-test` skill — coverage expansion (schema v6):**
  - Orientation: first-run code reading identifies structural seams (translation layers, state boundaries, API edges, data coverage gaps) and generates 0-5 structural-hypothesis probes before any browser interaction
  - 4-command discovery sequence targets highest-probability files within 5-min/20-file budget
  - `seams_read` frontmatter flag prevents re-running orientation on subsequent sessions
  - Probe confidence field (high/medium/low): execution orders low-confidence probes first within priority level for maximum discovery value
  - Confidence defaults by trigger: observed failures → high, structural hypotheses → medium, timing signals → medium
  - Stable query rotation: active → `[stable]` (CLI-only) after 3 consecutive 5/5 → `[retired]` after 10 (CLI-capable only)
  - CLI gate: queries without `cli_test_command` max out at `[stable]`, continue browser spot-checks
  - Novelty budget (MANDATORY): Proven areas = 1 MCP call, Uncharted = 30% of probe+query calls min 2
  - Mandatory probe rule: at least 1 novel interaction per scored_output area generates a probe
  - Novelty log in report DETAILS section (ephemeral — does not persist to test file)
  - New reference file: `orientation.md` (four seam patterns, discovery sequence, graceful no-op)

## [2.47.0] - 2026-03-01

### Changed

- **`user-test` skill — verification gap closure:**
  - Per-area checklist inlined in SKILL.md Phase 3 (8 steps visible, no longer hidden behind pointer)
  - Step 0 CLI precheck gate covers three cases: prechecks low (skip), no prechecks tag (proceed), no CLI (proceed)
  - Filter areas verification: sub-filter count accuracy check (±10% or ±2 items tolerance)
  - Search/agent areas verification: scroll position check (`window.scrollY < 100px`) with calibration cross-reference
  - Filter chip dismiss verification: 3-step before/after check (chip gone, count changed, agent responds)
  - Interaction State Checks section: before/after table for non-batchable verifications (chip dismiss, scroll, agent follow-up)
  - Escalation rationale ("Why 3, not 5") moved to top of section in probes.md (rationale before rules)
  - Missing `cli_test_command` handling: treat as empty string regardless of schema version
  - Schema version range compressed with maintenance comment
  - File reorganization: `run-targeting.md` extracts area selection priority, git-aware targeting, and progressive narrowing into one discoverable file
  - SKILL.md Area Selection Priority replaced with pointer + quick reference (Known-bug sub-bullets kept inline)
  - All cross-references updated to point to run-targeting.md

## [2.46.0] - 2026-03-01

### Changed

- **`user-test` skill — iterate efficiency (progressive narrowing + MCP call reduction):**
  - Progressive narrowing upgraded: LOW/MEDIUM/HIGH replaced with sharper SKIP/PROBES-ONLY/FULL classification per area between iterate runs
  - Override priority table: git-diff (verify) > explicit user override > classification > Proven 3-MCP budget
  - SKIP areas still run CLI queries (lightweight quality signal) and failing/untested probes (uncap rule preserved)
  - Verification batching: single `javascript_tool` call replaces 5+ sequential MCP find calls for read-only verification
  - Selector compounding: discovered selectors held in context during run, persisted during commit mode for subsequent runs
  - Agent response polling: 1s interval, 30s max replaces fixed 5-10s waits after agent chat queries
  - Poll timeout ≠ disconnect: poll timeouts log timing but don't increment disconnect_counter
  - Disconnect pattern tracking: records call_number, tool, area per disconnect; surfaces patterns when count ≥ 3
  - Run focus vs. area budget: run focus shapes WHAT is tested (queries, edge cases), not treatment level
  - Incremental context loading: run 2+ skips reference file re-reads, loads only JSON scratchpad + FULL area details
  - Retest classification trajectory stored per-run in .user-test-last-run.json for N-run summary display

## [2.45.0] - 2026-03-01

### Added

- **`user-test` skill — probe lifecycle completion:**
  - Escalation threshold lowered from 5 to 3 consecutive failures, now auto-files to bugs.md (no manual offer)
  - Dedup via `escalated_to` field prevents duplicate bug filing; `gh` unauthenticated fallback files locally with `Issue: ---`
  - Quality spread ≥ 2 across iterate runs generates reliability probes (P1 priority, flakiness detection)
  - Within-session probe injection: R1-generated probes execute FIRST in R2 of same iterate session
  - Progressive narrowing: R2+ computes per-area retest value (superseded by v2.46.0 SKIP/PROBES-ONLY/FULL)
  - Consecutive failure counting is per-commit, not per-iterate-run (iterate×5 = 1 count)
- **`user-test` skill — research-informed quality:**
  - Per-query quality reporting with outlier flagging (✗ on scores ≤ 3) in DETAILS section of dispatch report
  - Evaluation provenance: CLI = cross-model, Browser = same-model (static labels in Quality Scores table)
  - Proven Area Verification: ephemeral `(verify)` annotation + causal links when git changes affect Proven areas
  - Known-bug areas with git changes override normal skip — run fix_check regardless of gh auth status
  - `quality_by_query` added to score-history.json schema for per-query trend tracking across sessions

## [2.44.0] - 2026-03-01

### Changed

- **`user-test` skill — dispatch report format:** Report restructured from broadcast (status update) to dispatch (tells you what to do next). Sections in priority order: NEEDS ACTION (open items with `⚠`), FILED THIS SESSION (confirmations with `✓`), IMPROVED (score deltas), STABLE (collapsed one-liner), EXPLORE NEXT RUN (now surfaces in printed report), SIGNALS (+/-/~ prefixed observations with context deltas). DETAILS section only prints when actionable. Demo line handles YES/PARTIAL/NO with mandatory P1 caveat. Probe failures only escalate to NEEDS ACTION for Proven areas (expected failures on Uncharted stay in DETAILS). Disconnects show delta from last session, never in NEEDS ACTION. SKILL.md dropped from 414 to 405 lines — freed 9 lines of budget.

## [2.43.0] - 2026-03-01

### Added

- **`user-test` skill — tool call tracking for CLI queries:**
  - **Tool call count per query:** Captures `toolCalls.length` and unique tool names from CLI response JSON. Adds `Tools` and `Results` columns to CLI Speed table. Free data already in the response.
  - **Result count tracking:** Counts items in primary search/retrieval tool call results. Ignores non-search tool calls (filter lookups, respond_to_user).
  - **Opportunistic token capture:** If response includes `usage` field (prompt/completion tokens), captures it. Null if not available.
  - **Tool call spike probes:** When a query uses 2x+ its historical average tool calls (minimum 3 data points), generates an informational probe. Tool call probes don't block maturity promotion — efficiency concern, not correctness.
  - **cli_metrics in score-history.json:** Per-area `avg_tool_calls` and `avg_time` tracked over time for trend detection.

### Improved

- **`user-test` skill — iterate mode auto-commit:** Iterate mode now auto-commits after the final run (same as normal `/user-test`). Persists git_sha, maturity, probes, and history automatically. Pass `--no-commit` to opt out.
- **`user-test` skill — git-aware targeting fix:** Main diff (origin/main..HEAD) now unconditionally triggers area targeting when non-empty. Eliminates agent dismissing upstream changes as "already tested" or "main is behind HEAD."

## [2.42.0] - 2026-03-01

### Improved

- **`user-test` skill — hybrid refinements from real test runs:**
  - **Performance probes from CLI speed variance:** CLI timing variance >50% between runs or any timeout now generates a performance probe (verify = timing threshold, not results). New probe generation trigger alongside existing score/verification triggers.
  - **Persistent ≤3 escalation to Known-bug:** If an area scores ≤3 for 3+ consecutive runs with the same issue noted, the agent offers to file it as Known-bug — manual escalation for reproducible defects that don't hit the automatic UX ≤2 threshold.
  - **Delta shows overlap context:** Report now displays "Delta: -0.3 (over N overlapping areas, M new excluded)" so denominator changes from new areas are visible, not hidden behind a misleading regression number.
  - **CLI evaluates full JSON response:** CLI Area Queries section now explicitly requires evaluating tool calls, inferred facets, result arrays, and suggestions — not just the message text. Catches "UI lies" at the CLI layer.
  - **TL;DR summary at top of report:** One-line verdict before all tables: `TL;DR: UX X.X | Quality X.X (CLI) | Demo ready: yes | Risk: <area>`. Scannable in 2 seconds.

## [2.41.0] - 2026-02-28

### Added

- **`user-test` skill v6** — Git-aware test targeting + hybrid CLI/browser improvements:
  - **Git-aware test targeting:** Captures `git_sha` at run start. On subsequent runs, uses `git diff --name-only <old_sha>..HEAD` to identify changed files and map them to test areas. Code-affected areas get full exploration regardless of maturity — even Proven areas bypass spot-check limits. Augments existing priority system (doesn't replace it). Edge cases: no .git, force push/rebase, >30 files, docs-only changes, monorepo paths.
  - **CLI runs area Queries (Phase 2.5):** When `cli_test_command` exists, Phase 2.5 now runs each `scored_output` area's Queries table through CLI (not just frontmatter `cli_queries`). Skip browser-specific queries. Budget: Proven areas max 2 Queries via CLI, Uncharted run all.
  - **Explicit score mapping:** CLI score → Quality, Browser score → UX. Report shows `UX: 5 | Quality: 2 (CLI)` with source explicit. CLI-only areas populate both. Browser-only areas show `(browser)` or nothing.
  - **Probe Results table shows all active probes:** Table now has `Previous | This Run` columns instead of single `Status`. Shows ALL probes (untested, passing, failing) — not just failures. New probes show `Previous: new`.
  - **Explore Next Run Mode column:** Table now `| Priority | Area | Mode | Why |`. Mode values: CLI, Browser, Both. Lets Phase 2.5 automatically pick up CLI-eligible items.
  - **CLI consistency patterns persist:** Step 11 in commit mode persists CLI observations to area Notes column. Marked `[confirmed]` if pattern holds on next run. Removed if contradicted. Only specific, actionable patterns.
  - **Code Changes report section:** When git targeting active, report shows files changed, areas targeted, and spot-check-only areas.

## [2.40.0] - 2026-02-28

### Added

- **`user-test` skill — CLI auto-discovery for bootstrapping:**
  - **CLI discovery in Phase 1:** When creating new test files, auto-discovers CLI-testable API surfaces (API endpoints, test scripts, curl-able routes) and pre-populates `cli_test_command` + `cli_queries` from area Queries. Discovery checks package.json scripts, .env files, route definitions, and existing test scripts.
  - **CLI precheck gate (step 0):** Per-area checklist now 8 steps. Step 0 gates browser testing on CLI precheck results — if a CLI query tagged with `prechecks: "area-slug"` scored ≤ 2, browser testing is skipped for that area with "CLI pre-check failed — agent reasoning broken, browser test skipped."
  - **CLI test command patterns:** Reference table for Express/Hono JSON, SSE-only, direct script, and REST GET patterns.
  - **Query-to-CLI mapping:** Automatic generation of `cli_queries` from `scored_output` area Queries, with reasoning-only filtering (skip pure UI queries).
  - **CLI response evaluation:** Full response assessment — tool calls, structured data, metadata — not just text.
  - **Existing file discovery:** CLI discovery also runs for existing test files with empty `cli_test_command` — not just new files. Writes changes immediately so CLI mode activates on the same run.

## [2.39.0] - 2026-02-28

### Added

- **`user-test` skill v5** — Rich area definitions with Queries and Multi-turn (schema v4→v5):
  - **Queries:** Exploratory test inputs that score an app's domain understanding. Table: `| Query | Ideal Outcome | Check | Notes |`. Scored 1-5. Failed queries (≤3) generate probes. Stable queries (`[stable]` tag after 3+ runs at 5/5) get abbreviated evaluation.
  - **Multi-turn sequences:** Test context retention across user turns. Table: `| Turn | Query | Check |`. Final turn scored for Quality. Context failures at intermediate turns generate probes.
  - **Per-area execution checklist:** 7-step structured flow per area: probes → queries → explore → verify → score → time → notes. Explicit scoring boundaries: probes, verification, and UX scores are three separate signals.
  - **Query compounding in commit mode:** Steps 8-10 — sharpen failed queries into probes, expand from exploration discoveries, mark stable queries.
  - **First-run bootstrapping guidance:** Rich area definitions from first run. Area Depth section in template with thin-vs-rich comparison, writing queries guide, multi-turn guide.
  - **Proven area query budget:** Queries count against 3-call MCP cap. Only failing/untested probes bypass.
  - **New reference file:** `queries-and-multiturn.md` (76 lines). Updated `test-file-template.md` with v5 schema, Area Depth guidance, rich bedding store worked example. Updated `probes.md` with query-sourced and multi-turn probe generation triggers.

## [2.38.0] - 2026-02-28

### Added

- **`user-test` skill v4** — Compounding probe system (schema v3→v4):
  - **Verification pass (Layer 2):** Structural verification after each area — audits the app's claims against visible reality. Standard checks by area type (filter, search, cart, count, sort). Zero tolerance for mismatches. Verification failures block promotion to Proven but don't demote.
  - **`verify:` blocks (Layer 1):** Optional per-area verification instructions in test file. Freeform "distrust the UI" instructions.
  - **Adversarial probe generation (Layer 3):** Auto-generates targeted probes from verification failures, scores ≤3, or worst_moment. Probes persist in test file per area with lifecycle: untested→passing/failing/flaky→graduated. Flaky detection after 3+ mixed runs. Escalation to bugs.md after 5+ consecutive failures. Graduation to CLI regression checks after 2+ consecutive passes.
  - **Multi-run mode (`/user-test N`):** Orchestrates N sequential runs with inter-run probe learning. Progressive Proven area reduction. N-run trajectory summary. Interruption-safe with JSON scratchpad for inter-run state.
  - **New reference files:** `verification-patterns.md`, `probes.md`. Updated `test-file-template.md` with v4 schema (verify blocks, probes table).

## [2.37.0] - 2026-02-28

### Changed

- **`user-test` skill v3** — Compounding UX intelligence system (schema v2→v3):
  - **Bug registry (`bugs.md`):** Persistent bug tracker with open/fixed/regressed lifecycle. Sequential IDs (B001...), multi-area support, fix_check tied to area's `pass_threshold`, regression detection.
  - **Per-area score history:** Machine-readable `score-history.json` with last 10 entries per area. Thin `Area Trends` table in test file (trend + last score + delta). Trend computation: improving/stable/declining/volatile/fixed.
  - **Structured skip reasons:** `skip_reason` field on each area (enum: null, proven_spotcheck, known_bug_open, known_bug_fixed, cli_precheck_failed, disconnect, user_skip). Pass rate excludes disconnects.
  - **Explicit pass thresholds:** Per-area `pass_threshold` (default 4) and `quality_threshold` (default 3) in area details. Promotion gate uses per-area thresholds.
  - **Queryable qualitative data:** Best/worst moments tagged with area slug. Pattern surfacing after 10+ runs with asymmetric thresholds (positive: 7/10, negative: 5/10).
  - **Discovery-to-regression graduation:** When a bug is fixed, offer to generate a CLI regression check. Manual trigger, batched prompts, browser-only detection.
  - **UX Opportunities + Good Patterns:** Two new report sections. P1/P2 improvement suggestions with status lifecycle (open/implemented/wont_fix). Good Patterns for preserving deliberate design choices, auto-expire after 5 unconfirmed runs.
  - **New reference files:** `bugs-registry.md`, `graduation.md`. Updated `test-file-template.md` with v3 sections.

---

## [2.36.0] - 2026-02-28

### Changed

- **`user-test` skill v2** — Major revision based on 7 rounds of real-world testing:
  - **Schema migration (v1→v2):** Existing test files upgrade non-destructively on commit. Forward-compatible reader ignores unknown fields.
  - **Run results persistence:** `.user-test-last-run.json` bridges `/user-test` and `/user-test-commit` sessions. Stale/missing file handling with 24h warn / 7d block.
  - **Timing tracking (1A):** Wall-clock time per area, `Last Time` column in template, `Time` column in report output.
  - **Qualitative summary (1B):** Best/worst moment, demo readiness, verdict with `context` note persisted to history.
  - **Delta tracking (1C):** Run-over-run delta in commit history. Flags regressions worse than -0.5.
  - **Explore-next-run generation (1D):** Auto-generates 2-3 items with P1/P2/P3 priority after scoring.
  - **CLI mode (2A):** Optional `cli_test_command` runs agent reasoning tests without browser. Explicit `prechecks` tag for browser area overlap detection.
  - **Output quality scoring (2B):** Dual UX + Quality scores for `scored_output` areas. Promotion gate: UX >= 4 AND Quality >= 3.
  - **Conditional regression checks (2C):** Known-bug areas auto-check if linked issue is closed, flip to Uncharted, run fix_check. Files "Regression of #N" on failure.
  - **Async wait pattern (3A):** Documented in browser-input-patterns.md.
  - **Performance thresholds (3B):** Optional per-project timing grades (fast/acceptable/slow/BROKEN).
  - **Iterate mode updates:** Timing variance alongside score variance, CLI iterate reset, delta vs. pre-session baseline.

---

## [2.35.0] - 2026-02-27

### Added

- **`user-test` skill** — Exploratory browser testing via claude-in-chrome MCP with quality scoring and compounding test files. Tests run in a visible Chrome window with shared login state. Features a maturity model (Proven/Uncharted/Known-bug) that compounds knowledge across runs, quality scoring rubric (1-5), area-based test decomposition, and structured issue deduplication via GitHub labels.
- **`/user-test` command** — Run browser-based user testing with quality scoring against a test file or description
- **`/user-test-iterate` command** — Run the same test scenario N times to measure consistency
- **`/user-test-commit` command** — Commit test results: update maturity map, file issues, append history
- **Reference files** — `test-file-template.md`, `browser-input-patterns.md`, `iterate-mode.md` extracted from day one per skill size budget best practices

---

## [2.34.0] - 2026-02-14

### Added

- **Gemini CLI target** — New converter target for [Gemini CLI](https://github.com/google-gemini/gemini-cli). Install with `--to gemini` to convert agents to `.gemini/skills/*/SKILL.md`, commands to `.gemini/commands/*.toml` (TOML format with `description` + `prompt`), and MCP servers to `.gemini/settings.json`. Skills pass through unchanged (identical SKILL.md standard). Namespaced commands create directory structure (`workflows:plan` → `commands/workflows/plan.toml`). 29 new tests. ([#190](https://github.com/EveryInc/compound-engineering-plugin/pull/190))

---

## [2.33.1] - 2026-02-13

### Changed

- **`/workflows:plan` command** - All plan templates now include `status: active` in YAML frontmatter. Plans are created with `status: active` and marked `status: completed` when work finishes.
- **`/workflows:work` command** - Phase 4 now updates plan frontmatter from `status: active` to `status: completed` after shipping. Agents can grep for status to distinguish current vs historical plans.

---

## [2.33.0] - 2026-02-12

### Added

- **`setup` skill** — Interactive configurator for review agents
  - Auto-detects project type (Rails, Python, TypeScript, etc.)
  - Two paths: "Auto-configure" (one click) or "Customize" (pick stack, focus areas, depth)
  - Writes `compound-engineering.local.md` in project root (tool-agnostic — works for Claude, Codex, OpenCode)
  - Invoked automatically by `/workflows:review` when no settings file exists
- **`learnings-researcher` in `/workflows:review`** — Always-run agent that searches `docs/solutions/` for past issues related to the PR
- **`schema-drift-detector` wired into `/workflows:review`** — Conditional agent for PRs with migrations

### Changed

- **`/workflows:review`** — Now reads review agents from `compound-engineering.local.md` settings file. Falls back to invoking setup skill if no file exists.
- **`/workflows:work`** — Review agents now configurable via settings file
- **`/release-docs` command** — Moved from plugin to local `.claude/commands/` (repo maintenance, not distributed)

### Removed

- **`/technical_review` command** — Superseded by configurable review agents

---

## [2.32.0] - 2026-02-11

### Added

- **Factory Droid target** — New converter target for [Factory Droid](https://docs.factory.ai). Install with `--to droid` to output agents, commands, and skills to `~/.factory/`. Includes tool name mapping (Claude → Factory), namespace prefix stripping, Task syntax conversion, and agent reference rewriting. 13 new tests (9 converter + 4 writer). ([#174](https://github.com/EveryInc/compound-engineering-plugin/pull/174))

---

## [2.31.1] - 2026-02-09

### Changed

- **`dspy-ruby` skill** — Complete rewrite to DSPy.rb v0.34.3 API: `.call()` / `result.field` patterns, `T::Enum` classes, `DSPy::Tools::Base` / `Toolset`. Added events system, lifecycle callbacks, fiber-local LM context, GEPA optimization, evaluation framework, typed context pattern, BAML/TOON schema formats, storage system, score reporting, RubyLLM adapter. 5 reference files (2 new: toolsets, observability), 3 asset templates rewritten.

## [2.31.0] - 2026-02-08

### Added

- **`document-review` skill** — Brainstorm and plan refinement through structured review ([@Trevin Chow](https://github.com/trevin))
- **`/sync` command** — Sync Claude Code personal config across machines ([@Terry Li](https://github.com/terryli))

### Changed

- **Context token optimization (79% reduction)** — Plugin was consuming 316% of the context description budget, causing Claude Code to silently exclude components. Now at 65% with room to grow:
  - All 29 agent descriptions trimmed from ~1,400 to ~180 chars avg (examples moved to agent body)
  - 18 manual commands marked `disable-model-invocation: true` (side-effect commands like `/lfg`, `/deploy-docs`, `/triage`, etc.)
  - 6 manual skills marked `disable-model-invocation: true` (`orchestrating-swarms`, `git-worktree`, `skill-creator`, `compound-docs`, `file-todos`, `resolve-pr-parallel`)
- **git-worktree**: Remove confirmation prompt for worktree creation ([@Sam Xie](https://github.com/samxie))
- **Prevent subagents from writing intermediary files** in compound workflow ([@Trevin Chow](https://github.com/trevin))

### Fixed

- Fix crash when hook entries have no matcher ([@Roberto Mello](https://github.com/robertomello))
- Fix git-worktree detection where `.git` is a file, not a directory ([@David Alley](https://github.com/davidalley))
- Backup existing config files before overwriting in sync ([@Zac Williams](https://github.com/zacwilliams))
- Note new repository URL ([@Aarni Koskela](https://github.com/aarnikoskela))
- Plugin component counts corrected: 29 agents, 24 commands, 18 skills

---

## [2.30.0] - 2026-02-05

### Added

- **`orchestrating-swarms` skill** - Comprehensive guide to multi-agent orchestration
  - Covers primitives: Agent, Team, Teammate, Leader, Task, Inbox, Message, Backend
  - Documents two spawning methods: subagents vs teammates
  - Explains all 13 TeammateTool operations
  - Includes orchestration patterns: Parallel Specialists, Pipeline, Self-Organizing Swarm
  - Details spawn backends: in-process, tmux, iterm2
  - Provides complete workflow examples
- **`/slfg` command** - Swarm-enabled variant of `/lfg` that uses swarm mode for parallel execution

### Changed

- **`/workflows:work` command** - Added optional Swarm Mode section for parallel execution with coordinated agents

---

## [2.29.0] - 2026-02-04

### Added

- **`schema-drift-detector` agent** - Detects unrelated schema.rb changes in PRs
  - Compares schema.rb diff against migrations in the PR
  - Catches columns, indexes, and tables from other branches
  - Prevents accidental inclusion of local database state
  - Provides clear fix instructions (checkout + migrate)
  - Essential pre-merge check for any PR with database changes

---

## [2.28.0] - 2026-01-21

### Added

- **`/workflows:brainstorm` command** - Guided ideation flow to expand options quickly (#101)

### Changed

- **`/workflows:plan` command** - Smarter research decision logic before deep dives (#100)
- **Research checks** - Mandatory API deprecation validation in research flows (#102)
- **Docs** - Call out experimental OpenCode/Codex providers and install defaults
- **CLI defaults** - `install` pulls from GitHub by default and writes OpenCode/Codex output to global locations

### Merged PRs

- [#102](https://github.com/EveryInc/compound-engineering-plugin/pull/102) feat(research): add mandatory API deprecation validation
- [#101](https://github.com/EveryInc/compound-engineering-plugin/pull/101) feat: Add /workflows:brainstorm command and skill
- [#100](https://github.com/EveryInc/compound-engineering-plugin/pull/100) feat(workflows:plan): Add smart research decision logic

### Contributors

Huge thanks to the community contributors who made this release possible! 🙌

- **[@tmchow](https://github.com/tmchow)** - Brainstorm workflow, research decision logic (2 PRs)
- **[@jaredmorgenstern](https://github.com/jaredmorgenstern)** - API deprecation validation

---

## [2.27.0] - 2026-01-20

### Added

- **`/workflows:plan` command** - Interactive Q&A refinement phase (#88)
  - After generating initial plan, now offers to refine with targeted questions
  - Asks up to 5 questions about ambiguous requirements, edge cases, or technical decisions
  - Incorporates answers to strengthen the plan before finalization

### Changed

- **`/workflows:work` command** - Incremental commits and branch safety (#93)
  - Now commits after each completed task instead of batching at end
  - Added branch protection checks before starting work
  - Better progress tracking with per-task commits

### Fixed

- **`dhh-rails-style` skill** - Fixed broken markdown table formatting (#96)
- **Documentation** - Updated hardcoded year references from 2025 to 2026 (#86, #91)

### Contributors

Huge thanks to the community contributors who made this release possible! 🙌

- **[@tmchow](https://github.com/tmchow)** - Interactive Q&A for plans, incremental commits, year updates (3 PRs!)
- **[@ashwin47](https://github.com/ashwin47)** - Markdown table fix
- **[@rbouschery](https://github.com/rbouschery)** - Documentation year update

### Summary

- 27 agents, 23 commands, 14 skills, 1 MCP server

---

## [2.26.5] - 2026-01-18

### Changed

- **`/workflows:work` command** - Now marks off checkboxes in plan document as tasks complete
  - Added step to update original plan file (`[ ]` → `[x]`) after each task
  - Ensures no checkboxes are left unchecked when work is done
  - Keeps plan as living document showing progress

---

## [2.26.4] - 2026-01-15

### Changed

- **`/workflows:work` command** - PRs now include Compound Engineered badge
  - Updated PR template to include badge at bottom linking to plugin repo
  - Added badge requirement to quality checklist
  - Badge provides attribution and link to the plugin that created the PR

---

## [2.26.3] - 2026-01-14

### Changed

- **`design-iterator` agent** - Now auto-loads design skills at start of iterations
  - Added "Step 0: Discover and Load Design Skills (MANDATORY)" section
  - Discovers skills from ~/.claude/skills/, .claude/skills/, and plugin cache
  - Maps user context to relevant skills (Swiss design → swiss-design skill, etc.)
  - Reads SKILL.md files to load principles into context before iterating
  - Extracts key principles: grid specs, typography rules, color philosophy, layout principles
  - Skills are applied throughout ALL iterations for consistent design language

---

## [2.26.2] - 2026-01-14

### Changed

- **`/test-browser` command** - Clarified to use agent-browser CLI exclusively
  - Added explicit "CRITICAL: Use agent-browser CLI Only" section
  - Added warning: "DO NOT use Chrome MCP tools (mcp__claude-in-chrome__*)"
  - Added Step 0: Verify agent-browser installation before testing
  - Added full CLI reference section at bottom
  - Added Next.js route mapping patterns

---

## [2.26.1] - 2026-01-14

### Changed

- **`best-practices-researcher` agent** - Now checks skills before going online
  - Phase 1: Discovers and reads relevant SKILL.md files from plugin, global, and project directories
  - Phase 2: Only goes online for additional best practices if skills don't provide enough coverage
  - Phase 3: Synthesizes all findings with clear source attribution (skill-based > official docs > community)
  - Skill mappings: Rails → dhh-rails-style, Frontend → frontend-design, AI → agent-native-architecture, etc.
  - Prioritizes curated skill knowledge over external sources for trivial/common patterns

---

## [2.26.0] - 2026-01-14

### Added

- **`/lfg` command** - Full autonomous engineering workflow
  - Orchestrates complete feature development from plan to PR
  - Runs: plan → deepen-plan → work → review → resolve todos → test-browser → feature-video
  - Uses ralph-loop for autonomous completion
  - Migrated from local command, updated to use `/test-browser` instead of `/playwright-test`

### Summary

- 27 agents, 21 commands, 14 skills, 1 MCP server

---

## [2.25.0] - 2026-01-14

### Added

- **`agent-browser` skill** - Browser automation using Vercel's agent-browser CLI
  - Navigate, click, fill forms, take screenshots
  - Uses ref-based element selection (simpler than Playwright)
  - Works in headed or headless mode

### Changed

- **Replaced Playwright MCP with agent-browser** - Simpler browser automation across all browser-related features:
  - `/test-browser` command - Now uses agent-browser CLI with headed/headless mode option
  - `/feature-video` command - Uses agent-browser for screenshots
  - `design-iterator` agent - Browser automation via agent-browser
  - `design-implementation-reviewer` agent - Screenshot comparison
  - `figma-design-sync` agent - Design verification
  - `bug-reproduction-validator` agent - Bug reproduction
  - `/review` workflow - Screenshot capabilities
  - `/work` workflow - Browser testing

- **`/test-browser` command** - Added "Step 0" to ask user if they want headed (visible) or headless browser mode

### Removed

- **Playwright MCP server** - Replaced by agent-browser CLI (simpler, no MCP overhead)
- **`/playwright-test` command** - Renamed to `/test-browser`

### Summary

- 27 agents, 20 commands, 14 skills, 1 MCP server

---

## [2.23.2] - 2026-01-09

### Changed

- **`/reproduce-bug` command** - Enhanced with Playwright visual reproduction:
  - Added Phase 2 for visual bug reproduction using browser automation
  - Step-by-step guide for navigating to affected areas
  - Screenshot capture at each reproduction step
  - Console error checking
  - User flow reproduction with clicks, typing, and snapshots
  - Better documentation structure with 4 clear phases

### Summary

- 27 agents, 21 commands, 13 skills, 2 MCP servers

---

## [2.23.1] - 2026-01-08

### Changed

- **Agent model inheritance** - All 26 agents now use `model: inherit` so they match the user's configured model. Only `lint` keeps `model: haiku` for cost efficiency. (fixes #69)

### Summary

- 27 agents, 21 commands, 13 skills, 2 MCP servers

---

## [2.23.0] - 2026-01-08

### Added

- **`/agent-native-audit` command** - Comprehensive agent-native architecture review
  - Launches 8 parallel sub-agents, one per core principle
  - Principles: Action Parity, Tools as Primitives, Context Injection, Shared Workspace, CRUD Completeness, UI Integration, Capability Discovery, Prompt-Native Features
  - Each agent produces specific score (X/Y format with percentage)
  - Generates summary report with overall score and top 10 recommendations
  - Supports single principle audit via argument

### Summary

- 27 agents, 21 commands, 13 skills, 2 MCP servers

---

## [2.22.0] - 2026-01-05

### Added

- **`rclone` skill** - Upload files to S3, Cloudflare R2, Backblaze B2, and other cloud storage providers

### Changed

- **`/feature-video` command** - Enhanced with:
  - Better ffmpeg commands for video/GIF creation (proper scaling, framerate control)
  - rclone integration for cloud uploads
  - Screenshot copying to project folder
  - Improved upload options workflow

### Summary

- 27 agents, 20 commands, 13 skills, 2 MCP servers

---

## [2.21.0] - 2026-01-05

### Fixed

- Version history cleanup after merge conflict resolution

### Summary

This release consolidates all recent work:
- `/feature-video` command for recording PR demos
- `/deepen-plan` command for enhanced planning
- `create-agent-skills` skill rewrite (official spec compliance)
- `agent-native-architecture` skill major expansion
- `dhh-rails-style` skill consolidation (merged dhh-ruby-style)
- 27 agents, 20 commands, 12 skills, 2 MCP servers

---

## [2.20.0] - 2026-01-05

### Added

- **`/feature-video` command** - Record video walkthroughs of features using Playwright

### Changed

- **`create-agent-skills` skill** - Complete rewrite to match Anthropic's official skill specification

### Removed

- **`dhh-ruby-style` skill** - Merged into `dhh-rails-style` skill

---

## [2.19.0] - 2025-12-31

### Added

- **`/deepen-plan` command** - Power enhancement for plans. Takes an existing plan and runs parallel research sub-agents for each major section to add:
  - Best practices and industry patterns
  - Performance optimizations
  - UI/UX improvements (if applicable)
  - Quality enhancements and edge cases
  - Real-world implementation examples

  The result is a deeply grounded, production-ready plan with concrete implementation details.

### Changed

- **`/workflows:plan` command** - Added `/deepen-plan` as option 2 in post-generation menu. Added note: if running with ultrathink enabled, automatically run deepen-plan for maximum depth.

## [2.18.0] - 2025-12-25

### Added

- **`agent-native-architecture` skill** - Added **Dynamic Capability Discovery** pattern and **Architecture Review Checklist**:

  **New Patterns in mcp-tool-design.md:**
  - **Dynamic Capability Discovery** - For external APIs (HealthKit, HomeKit, GraphQL), build a discovery tool (`list_*`) that returns available capabilities at runtime, plus a generic access tool that takes strings (not enums). The API validates, not your code. This means agents can use new API capabilities without code changes.
  - **CRUD Completeness** - Every entity the agent can create must also be readable, updatable, and deletable. Incomplete CRUD = broken action parity.

  **New in SKILL.md:**
  - **Architecture Review Checklist** - Pushes reviewer findings earlier into the design phase. Covers tool design (dynamic vs static, CRUD completeness), action parity (capability map, edit/delete), UI integration (agent → UI communication), and context injection.
  - **Option 11: API Integration** - New intake option for connecting to external APIs like HealthKit, HomeKit, GraphQL
  - **New anti-patterns:** Static Tool Mapping (building individual tools for each API endpoint), Incomplete CRUD (create-only tools)
  - **Tool Design Criteria** section added to success criteria checklist

  **New in shared-workspace-architecture.md:**
  - **iCloud File Storage for Multi-Device Sync** - Use iCloud Documents for your shared workspace to get free, automatic multi-device sync without building a sync layer. Includes implementation pattern, conflict handling, entitlements, and when NOT to use it.

### Philosophy

This update codifies a key insight for **agent-native apps**: when integrating with external APIs where the agent should have the same access as the user, use **Dynamic Capability Discovery** instead of static tool mapping. Instead of building `read_steps`, `read_heart_rate`, `read_sleep`... build `list_health_types` + `read_health_data(dataType: string)`. The agent discovers what's available, the API validates the type.

Note: This pattern is specifically for agent-native apps following the "whatever the user can do, the agent can do" philosophy. For constrained agents with intentionally limited capabilities, static tool mapping may be appropriate.

---

## [2.17.0] - 2025-12-25

### Enhanced

- **`agent-native-architecture` skill** - Major expansion based on real-world learnings from building the Every Reader iOS app. Added 5 new reference documents and expanded existing ones:

  **New References:**
  - **dynamic-context-injection.md** - How to inject runtime app state into agent system prompts. Covers context injection patterns, what context to inject (resources, activity, capabilities, vocabulary), implementation patterns for Swift/iOS and TypeScript, and context freshness.
  - **action-parity-discipline.md** - Workflow for ensuring agents can do everything users can do. Includes capability mapping templates, parity audit process, PR checklists, tool design for parity, and context parity guidelines.
  - **shared-workspace-architecture.md** - Patterns for agents and users working in the same data space. Covers directory structure, file tools, UI integration (file watching, shared stores), agent-user collaboration patterns, and security considerations.
  - **agent-native-testing.md** - Testing patterns for agent-native apps. Includes "Can Agent Do It?" tests, the Surprise Test, automated parity testing, integration testing, and CI/CD integration.
  - **mobile-patterns.md** - Mobile-specific patterns for iOS/Android. Covers background execution (checkpoint/resume), permission handling, cost-aware design (model tiers, token budgets, network awareness), offline handling, and battery awareness.

  **Updated References:**
  - **architecture-patterns.md** - Added 3 new patterns: Unified Agent Architecture (one orchestrator, many agent types), Agent-to-UI Communication (shared data store, file watching, event bus), and Model Tier Selection (fast/balanced/powerful).

  **Updated Skill Root:**
  - **SKILL.md** - Expanded intake menu (now 10 options including context injection, action parity, shared workspace, testing, mobile patterns). Added 5 new agent-native anti-patterns (Context Starvation, Orphan Features, Sandbox Isolation, Silent Actions, Capability Hiding). Expanded success criteria with agent-native and mobile-specific checklists.

- **`agent-native-reviewer` agent** - Significantly enhanced with comprehensive review process covering all new patterns. Now checks for action parity, context parity, shared workspace, tool design (primitives vs workflows), dynamic context injection, and mobile-specific concerns. Includes detailed anti-patterns, output format template, quick checks ("Write to Location" test, Surprise test), and mobile-specific verification.

### Philosophy

These updates operationalize a key insight from building agent-native mobile apps: **"The agent should be able to do anything the user can do, through tools that mirror UI capabilities, with full context about the app state."** The failure case that prompted these changes: an agent asked "what reading feed?" when a user said "write something in my reading feed"—because it had no `publish_to_feed` tool and no context about what "feed" meant.

## [2.16.0] - 2025-12-21

### Enhanced

- **`dhh-rails-style` skill** - Massively expanded reference documentation incorporating patterns from Marc Köhlbrugge's Unofficial 37signals Coding Style Guide:
  - **controllers.md** - Added authorization patterns, rate limiting, Sec-Fetch-Site CSRF protection, request context concerns
  - **models.md** - Added validation philosophy, let it crash philosophy (bang methods), default values with lambdas, Rails 7.1+ patterns (normalizes, delegated types, store accessor), concern guidelines with touch chains
  - **frontend.md** - Added Turbo morphing best practices, Turbo frames patterns, 6 new Stimulus controllers (auto-submit, dialog, local-time, etc.), Stimulus best practices, view helpers, caching with personalization, broadcasting patterns
  - **architecture.md** - Added path-based multi-tenancy, database patterns (UUIDs, state as records, hard deletes, counter caches), background job patterns (transaction safety, error handling, batch processing), email patterns, security patterns (XSS, SSRF, CSP), Active Storage patterns
  - **gems.md** - Added expanded what-they-avoid section (service objects, form objects, decorators, CSS preprocessors, React/Vue), testing philosophy with Minitest/fixtures patterns

### Credits

- Reference patterns derived from [Marc Köhlbrugge's Unofficial 37signals Coding Style Guide](https://github.com/marckohlbrugge/unofficial-37signals-coding-style-guide)

## [2.15.2] - 2025-12-21

### Fixed

- **All skills** - Fixed spec compliance issues across 12 skills:
  - Reference files now use proper markdown links (`[file.md](./references/file.md)`) instead of backtick text
  - Descriptions now use third person ("This skill should be used when...") per skill-creator spec
  - Affected skills: agent-native-architecture, andrew-kane-gem-writer, compound-docs, create-agent-skills, dhh-rails-style, dspy-ruby, every-style-editor, file-todos, frontend-design, gemini-imagegen

### Added

- **CLAUDE.md** - Added Skill Compliance Checklist with validation commands for ensuring new skills meet spec requirements

## [2.15.1] - 2025-12-18

### Changed

- **`/workflows:review` command** - Section 7 now detects project type (Web, iOS, or Hybrid) and offers appropriate testing. Web projects get `/playwright-test`, iOS projects get `/xcode-test`, hybrid projects can run both.

## [2.15.0] - 2025-12-18

### Added

- **`/xcode-test` command** - Build and test iOS apps on simulator using XcodeBuildMCP. Automatically detects Xcode project, builds app, launches simulator, and runs test suite. Includes retries for flaky tests.

- **`/playwright-test` command** - Run Playwright browser tests on pages affected by current PR or branch. Detects changed files, maps to affected routes, generates/runs targeted tests, and reports results with screenshots.
