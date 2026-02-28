# Decision Record

**Deepened on:** 2026-02-26
**Sections enhanced:** 11 of 13
**Research agents used:** 14
**Total recommendations applied:** 37 (22 implement, 9 fast_follow, 6 defer)

## Pre-Implementation Verification

1. [ ] Verify current component counts: `ls -d plugins/compound-engineering/skills/*/ | wc -l` and `ls plugins/compound-engineering/commands/*.md plugins/compound-engineering/commands/workflows/*.md | wc -l`
2. [ ] Verify current plugin version in `plugins/compound-engineering/.claude-plugin/plugin.json`
3. [ ] Confirm `claude-in-chrome` MCP tool names by running `/mcp` and selecting `claude-in-chrome`
4. [ ] Review `plugins/compound-engineering/skills/deepen-plan/SKILL.md` frontmatter format as canonical thin-wrapper reference
5. [ ] Verify `plugins/compound-engineering/commands/deepen-plan.md` as canonical thin-wrapper command template
6. [ ] Check that `tests/user-flows/` does not already exist in any target project (no namespace collision)

## Implementation Sequence

1. **Create `skills/user-test/references/` files first** — the SKILL.md references these, so they must exist before the skill is validated
2. **Create `skills/user-test/SKILL.md`** — the core skill with 5-phase execution logic + commit mode, under 500 lines
3. **Create thin wrapper commands** — `commands/user-test.md`, `commands/user-test-iterate.md`, and `commands/user-test-commit.md`
4. **Update metadata files** — plugin.json, marketplace.json, README.md, CHANGELOG.md (use dynamic counts, not hardcoded numbers)
5. **Run `/release-docs`** — regenerate documentation site
6. **Validate** — JSON validity, component count consistency, SKILL.md line count

## Key Improvements

1. **[Strong Signal -- 5 agents] Maturity model: guidance over rigid rules** — Replace hardcoded "3 consecutive passes = Proven" and "any failure = reset to Uncharted" with agent-guided judgment. Provide a rubric and guidelines, but let the agent decide based on context (e.g., a cosmetic issue in a Proven area should not trigger full demotion). Simplify initial threshold to 2 consecutive passes.

2. **[Strong Signal -- 4 agents] Extract reference files from SKILL.md from day one** — Split the skill into SKILL.md (~300 lines of execution logic) plus `references/` directory containing test-file-template.md, browser-input-patterns.md, and iterate-mode.md. The monolith-to-skill-split learning explicitly warns that stated size budgets without enforcement are ignored.

3. **[Strong Signal -- 4 agents] Extension disconnect handling with specific recovery instructions** — Replace generic "retry-once" with: wait 3 seconds, retry once, on second failure instruct user to run `/chrome` and select "Reconnect extension". Track cumulative disconnects and abort after 3 with a clear stability message.

4. **[Strong Signal -- 3 agents] Add `disable-model-invocation: true` to both thin wrapper commands** — The commands have side effects (file creation, browser interaction, issue filing). Official docs require this flag for side-effect workflows.

5. **[Strong Signal -- 3 agents] Explicit distinction from agent-browser/test-browser in SKILL.md intro** — Two browser tools creates confusion. The SKILL.md intro must state: "This skill is for exploratory testing in a visible Chrome window with shared login state. For automated headless regression testing, use /test-browser instead."

6. **[Strong Signal -- 3 agents] Dynamic component counts in acceptance criteria** — Do not hardcode "Skills: 21, Commands: 24". Count actual files and verify description strings match.

7. **[Strong Signal -- 3 agents] Enhanced preflight check with `/chrome` guidance, WSL detection, and site permissions** — Phase 0 must guide users to run `/chrome` if MCP tools are unavailable, detect WSL and abort with a clear message, and verify the target URL is within Chrome extension's allowed sites.

8. **Quality scoring rubric with concrete calibration anchors** — Define what scores 1-5 mean with examples, making scoring reproducible across runs.

9. **Test file schema version for forward compatibility** — Add `schema_version: 1` to test file template frontmatter.

10. **SKILL.md description must be single-line string** — Multiline YAML indicators break the skill indexer. Use a single line with trigger keywords for auto-discovery.

## Research Insights

### Browser Automation (claude-in-chrome)
- Actions run in a **visible Chrome window** in real time — the user can watch and intervene. This is the core differentiator from headless agent-browser and should be prominently documented.
- Claude **shares browser login state** — eliminates most authentication concerns. Users sign in once in Chrome; Claude inherits the session.
- **GIF recording** is available as a built-in capability. Phase 7 (Summary) can offer to record sessions for evidence attached to GitHub issues.
- **Site-level permissions** from the Chrome extension control which URLs Claude can interact with. Preflight should verify this.
- **Modal dialogs** (alert, confirm, prompt) block all browser commands. The skill should detect unresponsive commands and instruct users to dismiss dialogs manually.

### Skill Architecture (Claude Code Plugins)
- SKILL.md description must be a **single-line string** — multiline YAML breaks the indexer.
- Skills use **progressive disclosure**: only frontmatter loads initially (~100 tokens); full content loads on activation. This makes the 500-line target a recommendation, not just a budget.
- `context:fork` is available for isolated execution but is not needed for this skill's use case.

### Security Considerations
- **Path traversal**: test file path resolution must be validated to stay within `tests/user-flows/`.
- **Credential prohibition**: the skill must never persist passwords, tokens, or session IDs in any written output.
- **Issue body sanitization**: content derived from test results should be sanitized before passing to `gh issue create`.

## New Considerations Discovered

1. **MCP tool batching for performance** — Each claude-in-chrome MCP call involves a Chrome extension round-trip. Batch simple checks (element visibility, text content) into single `javascript_tool` calls. Define "quick spot-check" for Proven areas as max 3 MCP calls.

2. **Iterate mode token cap** — Each 7-phase run consumes significant tokens. Add a default cap of N <= 10 with explicit override.

3. **State clearing between iterate runs is incomplete** — Full page reload to app entry URL is the reset mechanism. This does not cover IndexedDB, service worker caches, or HttpOnly cookies. Document this limitation.

4. **Test history file rotation** — `tests/user-flows/test-history.md` will grow unbounded. Add a rotation strategy: keep last 50 entries, archive older ones.

5. **Atomic file writes** — "Full rewrite" is not truly atomic. Use write-to-temp-then-rename pattern for test file updates.

6. **Area granularity definition** — The maturity map tracks "areas" but never defines what size an area should be. Without guidance, two runs will decompose the same scenario differently, making consecutive-pass tracking meaningless. Define areas as 1-3 user interactions each (e.g., "checkout" → cart-validation, shipping-form, payment-submission). Include a worked example in `references/test-file-template.md`.

7. **Explore Next Run needs prioritization** — The Explore Next Run section is append-only with no signal about urgency. After 5-6 runs it becomes a backlog with no entry point. Add priority levels: `P1` (likely user-facing friction), `P2` (edge case worth knowing), `P3` (curiosity). Instruct Phase 3 to pick highest-priority uncharted items first.

8. **Issue deduplication needs structured labels** — Semantic search via `gh issue list --search` is fragile — two runs will describe the same bug differently. Use a structured `user-test:<area-slug>` label on every issue (e.g., `user-test:checkout/cart-count`) for exact-match dedup via `--label` flag, with semantic search as fallback only.

9. **Qualitative assessments evaporate after each run** — The Run Summary asks "Demo ready?" but this answer never persists in test-history.md. Add a `demo_readiness` field (yes/no/partial) to the history table schema so trend data captures qualitative signal, not just scores.

10. **App-level environment sanity check** — Phase 0 validates tool availability but not app health. Stale auth tokens, empty search indices, or silent API 500s produce misleading test results that look like quality issues. Add a Phase 2 "environment sanity check": one known-good navigation + one content assertion before executing test scenarios.

## Fast Follow (ticket before merge)

**Tier 1 -- Blocks demo/UX quality** (fix within 1-2 days):
- Add cross-reference from `agent-browser/SKILL.md` back to `user-test` to prevent user confusion between the two browser testing approaches

**Tier 2 -- Improves robustness** (fix within 1 sprint):
- Add file upload workaround documentation: pause user-test and use `/agent-browser` for upload steps, then resume
- MCP tool mapping table (agent-browser CLI vs claude-in-chrome MCP equivalents) in a shared reference file
- Test file concern separation: evaluate splitting run history into a sidecar `.json` for machine parsing while keeping the `.md` human-readable

## Cross-Cutting Concerns

1. **SKILL.md size budget enforcement** — Four agents independently recommend the `references/` extraction. The structural decision affects the content outline (section 8), technical considerations (section 5), thin wrapper templates (section 9), and the SpecFlow analysis (section 10). This is the single most impactful structural change.

2. **Maturity model rigidity vs agent judgment** — Five agents flag this across scoring (section 4), SKILL.md phases (section 8), and success metrics (section 12). The resolution: provide guidance and rubrics, not rigid rules.

3. **MCP reliability and graceful degradation** — Four agents converge on this across preflight (section 5), execution (section 8), and risks (section 11). The pattern: specific recovery instructions for known failure modes, graceful degradation for mid-run tool failures.

4. **`disable-model-invocation: true`** — Three agents confirm this is required for both wrapper commands. Single-section impact but high confidence from official docs.

## Deferred to Future Work

- **MCP abstraction layer** for future tool swaps (agent-browser <-> claude-in-chrome) — adds unnecessary complexity for v1
- **Test file concern separation** into spec + state sidecar — evaluate after real-world usage reveals whether the single-file approach causes friction
- **`/mcp` runtime discovery** of available tools instead of hardcoded tool names — low confidence (0.65), nice-to-have for forward compatibility
- **`context:fork` isolation** for iterate mode runs — not needed for current architecture but could improve memory isolation for long iterate sessions

## Research Gaps Addressed

| Source | Recommendation | Status |
|--------|---------------|--------|
| docs-researcher-claude-code-plugins | Single-line description | Implemented in SKILL.md frontmatter |
| docs-researcher-claude-code-plugins | Keep SKILL.md under 500 lines | Implemented via references/ extraction |
| docs-researcher-claude-code-plugins | disable-model-invocation: true | Implemented in both wrapper commands |
| docs-researcher-claude-code-plugins | /chrome activation guidance | Implemented in Phase 0 preflight |
| docs-researcher-claude-code-plugins | Service worker idle disconnects | Implemented in disconnect handling |
| docs-researcher-claude-code-plugins | WSL not supported | Implemented in Phase 0 preflight |
| docs-researcher-claude-code-plugins | Login page/CAPTCHA pausing | Implemented in Phase 2 setup |
| docs-researcher-claude-in-chrome | Visible Chrome window | Implemented in SKILL.md intro |
| docs-researcher-claude-in-chrome | Shared browser login state | Implemented in Phase 2 setup |
| docs-researcher-claude-in-chrome | GIF recording | Acknowledged in Phase 7 as optional enhancement |
| docs-researcher-claude-in-chrome | Site-level permissions | Implemented in Phase 0 preflight |
| docs-researcher-claude-in-chrome | Named pipe conflicts (Windows) | Implemented in Phase 0 preflight |
| docs-researcher-claude-in-chrome | Modal dialogs block commands | Implemented in Phase 3 execution |
| docs-researcher-claude-in-chrome | /mcp runtime discovery | Deferred — low confidence (0.65), nice-to-have |

---
# Implementation Spec
---

---
title: "Add user-test browser testing skill and commands"
type: feat
status: active
date: 2026-02-26
---

# Add user-test Browser Testing Skill and Commands

## Overview

Add a new `user-test` skill and three companion commands (`/user-test`, `/user-test-iterate`, `/user-test-commit`) to the compound-engineering plugin. This implements browser-based exploratory user testing via `claude-in-chrome` MCP tools with a compounding maturity model — each run makes the test file smarter by promoting proven areas, filing new bugs, and expanding coverage.

This skill is for **exploratory testing in a visible Chrome window** with shared login state. The user watches the test happening in real-time and can intervene if needed. For automated headless regression testing, use `/test-browser` instead — it uses the `agent-browser` CLI for deterministic, CI-oriented QA checks.

The three commands separate concerns: `/user-test` runs and scores a test, `/user-test-iterate` runs it N times for consistency data, and `/user-test-commit` applies results (updates the test file maturity map, files issues, appends history). This separation keeps the fast feedback loop (run + score) lightweight and lets the user decide when to commit results.

## Problem Statement / Motivation

The plugin has `test-browser` (deterministic QA regression via `agent-browser` CLI) but no exploratory user testing capability. Teams need a way to:

- Simulate real user behavior against their app in a visible browser
- Track which areas are stable vs. fragile across runs
- Automatically file and deduplicate GitHub issues from testing sessions
- Compound knowledge: skip proven areas, skip known bugs, focus effort on uncharted territory

This fills a distinct niche from `test-browser` — exploratory quality assessment with compounding knowledge, not regression checking.

## Proposed Solution

### Architecture: Skill + Thin Wrapper Commands

Following the `deepen-plan` precedent (v2.36.0 refactor), implement as:

| File | Type | Purpose |
|------|------|---------|
| `skills/user-test/SKILL.md` | Skill | Core 5-phase execution logic + commit mode (~300 lines) |
| `skills/user-test/references/test-file-template.md` | Reference | Test file template for new scenarios (~100 lines) |
| `skills/user-test/references/browser-input-patterns.md` | Reference | React-safe input patterns and MCP tool tips (~30 lines) |
| `skills/user-test/references/iterate-mode.md` | Reference | Iterate mode execution details (~50 lines) |
| `commands/user-test.md` | Thin wrapper | `Skill(user-test)` invocation for `/user-test` |
| `commands/user-test-iterate.md` | Thin wrapper | `Skill(user-test)` invocation with iterate mode for `/user-test-iterate` |
| `commands/user-test-commit.md` | Thin wrapper | `Skill(user-test)` invocation for committing results |

**Why skill + thin wrapper?**
- The execution logic is ~300 lines — well within the 500-line skill recommendation
- Reference files extract the test template, input patterns, and iterate mode details — each reusable independently
- Thin wrappers prevent command bloat (learnings: monolith-to-skill split anti-patterns)
- Both commands share the same skill logic, just with different invocation modes
- Consistent with the Pattern A convention used by `deepen-plan`, `create-agent-skill`, etc.

**Why extract to `references/` from day one?**
The monolith-to-skill-split learning (convergence from 4 agents) explicitly warns: "Stating max 1200 lines in a plan is a policy wish. Without a gate that fails the pipeline, the file will grow past the budget." By starting with the split structure, the SKILL.md stays focused on execution phases and the reference files can grow independently without threatening the line budget.

### Key Design Decisions

**1. Browser tool: `claude-in-chrome` MCP (not `agent-browser` CLI)**

The skill uses `mcp__claude-in-chrome__*` tools (find, javascript_tool, read_page, screenshots). This is intentionally different from `test-browser` which uses the headless `agent-browser` CLI. The rationale:
- `user-test` simulates a real user in a **visible** Chrome window — interactive, visual. The user can watch the test happening and intervene.
- `test-browser` runs headless regression checks — deterministic, CI-oriented
- Different tools for different testing philosophies
- `claude-in-chrome` shares the browser's login state, so authenticated app testing requires no credential handling — the user simply signs in once in Chrome

**2. Test file as the product, not the run report**

Living test files in `tests/user-flows/<scenario-slug>.md` get rewritten each run with updated maturity maps, scores, and history. The test file compounds intelligence across runs.

Test files include a `schema_version: 1` field in frontmatter to enable forward-compatible migrations when the maturity model or file structure evolves.

**3. Maturity model drives test efficiency**

The maturity model provides guidance for the agent's judgment, not rigid rules:

| Status | Behavior | Guidance |
|--------|----------|----------|
| Proven | Quick spot-check only (max 3 MCP calls) | Promote after 2+ consecutive passes with no significant issues. Cosmetic issues do not warrant demotion. |
| Uncharted | Full investigation, edge cases | Default state. Demote from Proven only on functional regressions or new features. |
| Known bug | Skip entirely | Issue filed. Skip until fix deployed. |

The agent exercises judgment on promotions and demotions using the scoring rubric rather than following mechanical counters. A minor CSS issue in a Proven area stays Proven with a note. A broken API in an Uncharted area gets a Known-bug issue filed.

**Partial run safety:** If a run is interrupted before scoring completes, no maturity updates are produced. Only `/user-test-commit` writes maturity state, and only from a completed run's results.

**Area granularity:** Each area should cover 1-3 user interactions — small enough that a single bug doesn't reset a huge chunk of proven territory, large enough to accumulate consecutive passes. Example decomposition for "checkout":

| Area | Interactions | What's tested |
|------|-------------|---------------|
| `checkout/cart-validation` | Add item, verify count, change quantity | Cart state management |
| `checkout/shipping-form` | Enter address, select method, see estimate | Form validation + shipping logic |
| `checkout/payment-submission` | Enter card, submit, see confirmation | Payment flow + success state |

A worked example with this decomposition pattern is included in [test-file-template.md](./references/test-file-template.md).

**Quality Scoring Rubric**

Each score applies to one **scored interaction unit** — a single user-facing task completion (e.g., "add item to cart", "submit shipping form", "complete payment"). Navigation steps, page loads, and setup actions are not scored individually; they are part of the interaction they serve.

| Score | Meaning | Example |
|-------|---------|---------|
| 1 | Broken — cannot complete the task | Button unresponsive, page crashes |
| 2 | Completes with major friction | 3+ confusing steps, error messages shown |
| 3 | Completes with minor friction | Small UX issues, unclear labels |
| 4 | Smooth experience | Clear flow, no confusion |
| 5 | Delightful | Exceeds expectations, helpful feedback |

## Technical Considerations

### Distinct from existing `test-browser` command

| Aspect | `test-browser` | `user-test` (new) |
|--------|---------------|-------------------|
| Tool | `agent-browser` CLI (headless) | `claude-in-chrome` MCP (visible browser) |
| Purpose | QA regression on PR-affected pages | Exploratory user testing |
| State | Stateless per run | Stateful via test files |
| Output | Pass/fail per route | Quality scores 1-5 per interaction |
| Issues | No issue creation | Auto-files and deduplicates issues |
| Auth | Handles login flows | Shares browser login state |
| Observation | Results only | Real-time visual — user watches the test |

### MCP dependency

The skill requires `claude-in-chrome` MCP to be connected. Phase 0 (Preflight Check) validates availability and provides specific guidance:

<!-- ready-to-copy -->
```
## Phase 0: Preflight Check
1. Check if claude-in-chrome MCP tools are available
2. If NOT available:
   - Display: "claude-in-chrome not connected. Run /chrome or restart with claude --chrome"
   - Abort with clear instructions
3. Detect WSL environment:
   - If running in WSL: "Chrome integration is not supported in WSL. Run Claude Code directly on Windows."
   - Abort
4. Verify the target app URL is within Chrome extension's allowed sites
   - If permission denied: "Grant site permission in Chrome extension settings for [URL]"
5. Windows: if EADDRINUSE error on named pipe:
   - "Close other Claude Code sessions that might be using Chrome, then retry"
```

### `gh` CLI dependency

Issue creation (Phase 6) requires `gh auth status`. The skill handles this gracefully:
- If `gh` is not authenticated: skip issue creation, note in summary
- If `gh` is authenticated: proceed with duplicate detection and filing
- **Structured dedup labels:** Every issue gets a label `user-test:<area-slug>` (e.g., `user-test:checkout/cart-count`). Duplicate detection uses `gh issue list --label "user-test:<area-slug>" --state open` for exact match, falling back to semantic title search only if no label match found. Labels are machine-parseable and immune to description rewording.
- Issue body content sanitized before passing to `gh issue create` to prevent markdown injection

### React-safe input pattern

The React-specific native setter pattern for bypassing virtual DOM is extracted to [browser-input-patterns.md](./references/browser-input-patterns.md). This keeps framework-specific tool logic reusable and out of the main SKILL.md.

### MCP tool performance

Each claude-in-chrome MCP call involves a round-trip through the Chrome extension. To manage latency:
- Batch simple checks (element visibility, text content, price display) into single `javascript_tool` calls
- Define "quick spot-check" for Proven areas as max 3 MCP calls per area
- Full investigations for Uncharted areas have no artificial cap but should use batched checks where possible

<!-- illustrative -->
```javascript
// Batch multiple checks into one javascript_tool call:
mcp__claude-in-chrome__javascript_tool({
  code: `JSON.stringify({
    submitBtn: !!document.querySelector('[type=submit]'),
    errorMsg: !!document.querySelector('.error'),
    price: document.querySelector('.price')?.textContent
  })`
})
```

### Connection resilience

Extension disconnects are a known issue — the Chrome extension service worker can go idle during extended sessions.

<!-- ready-to-copy -->
```
## Disconnect Handling
1. After MCP tool failure: wait 3 seconds
2. Retry the call once
3. If retry fails: "Extension disconnected. Run /chrome and select Reconnect extension"
4. Track disconnect_counter for the session
5. If disconnect_counter >= 3: abort with "Extension connection unstable. Check Chrome extension status and restart the session."
```

### Modal dialog handling

JavaScript dialogs (alert, confirm, prompt) block all browser events and prevent Claude from receiving commands. If commands stop responding after a dialog trigger, instruct the user to dismiss the dialog manually before continuing.

### Graceful degradation

Apply the same pattern used for `gh` CLI absence to MCP tool failures mid-run:
- If screenshot fails: continue but note "screenshots unavailable" in the report
- If javascript_tool fails: fall back to individual find/click calls
- If all MCP tools fail: abort with specific recovery instructions

## System-Wide Impact

- **Interaction graph**: Skill invoked by two thin wrapper commands. No callbacks or middleware. Writes to `tests/user-flows/` (user's project, not the plugin). Calls `gh` CLI for issue creation.
- **Error propagation**: MCP disconnects handled with retry-once + specific recovery instructions. `gh` failures gracefully degraded (skip issue creation). Mid-run MCP tool failures degrade individual capabilities rather than aborting.
- **State lifecycle risks**: Test file writes use write-to-temp-then-rename pattern for atomic updates. Partial runs produce no committable output (maturity safety). Iterate mode resets between runs via full page reload to the app entry URL. Note: this does not clear IndexedDB, service worker caches, or HttpOnly cookies — document this limitation in iterate mode reference.
- **API surface parity**: No overlap with existing commands — distinct MCP tool set, distinct file structure, distinct purpose.
- **Security**: Test file paths validated to stay within `tests/user-flows/`. No credentials persisted in any written output (test files, run history, issue bodies). Issue body content sanitized before `gh` CLI invocation.

## Acceptance Criteria

### Files to Create

- [x] `plugins/compound-engineering/skills/user-test/SKILL.md` — Core skill with 5 phases + commit mode, ~300 lines
- [x] `plugins/compound-engineering/skills/user-test/references/test-file-template.md` — Test file template for new scenarios
- [x] `plugins/compound-engineering/skills/user-test/references/browser-input-patterns.md` — React-safe input patterns
- [x] `plugins/compound-engineering/skills/user-test/references/iterate-mode.md` — Iterate mode details
- [x] `plugins/compound-engineering/commands/user-test.md` — Thin wrapper with `disable-model-invocation: true`
- [x] `plugins/compound-engineering/commands/user-test-iterate.md` — Thin wrapper with `disable-model-invocation: true` and iterate argument forwarding
- [x] `plugins/compound-engineering/commands/user-test-commit.md` — Thin wrapper with `disable-model-invocation: true` for committing results

### Files to Modify

- [x] `plugins/compound-engineering/.claude-plugin/plugin.json` — bump version, update description with dynamic counts
- [x] `.claude-plugin/marketplace.json` — bump version, update description with dynamic counts
- [x] `plugins/compound-engineering/README.md` — Update component count table, add skill row under Browser Automation, add two command rows
- [x] `plugins/compound-engineering/CHANGELOG.md` — Add new version entry with `### Added` section

### Post-Change Validation

- [x] Validate JSON: `cat .claude-plugin/marketplace.json | jq .` and `cat plugins/compound-engineering/.claude-plugin/plugin.json | jq .`
- [x] Verify skill count matches description: `SKILL_COUNT=$(ls -d plugins/compound-engineering/skills/*/ | wc -l) && grep -q "$SKILL_COUNT skill" plugins/compound-engineering/.claude-plugin/plugin.json`
- [x] Verify command count matches description: `CMD_COUNT=$(ls plugins/compound-engineering/commands/*.md plugins/compound-engineering/commands/workflows/*.md | wc -l) && grep -q "$CMD_COUNT command" plugins/compound-engineering/.claude-plugin/plugin.json`
- [x] Verify SKILL.md line count: `SKILL_LINES=$(wc -l < plugins/compound-engineering/skills/user-test/SKILL.md) && [ "$SKILL_LINES" -le 500 ] && echo "OK: $SKILL_LINES lines" || echo "FAIL: $SKILL_LINES lines (max 500)"`
- [x] Verify SKILL.md frontmatter compliance: `name: user-test`, single-line description with trigger keywords
- [x] Verify reference files are linked with proper markdown links (not backtick references)
- [ ] Run `claude /release-docs` to regenerate all docs site pages

### Functional Requirements

- [ ] `/user-test tests/user-flows/checkout.md` — loads existing test file, runs phases 0-4 (score + report)
- [ ] `/user-test "Test the checkout flow"` — creates new test file from description, runs phases 0-4
- [ ] `/user-test-commit` — applies results from last run: updates maturity map, files issues, appends history
- [ ] `/user-test-iterate tests/user-flows/checkout.md 5` — runs the scenario 5 times, reports consistency
- [ ] Maturity model correctly promotes (2+ consistent passes with agent judgment) and demotes (functional regression with agent judgment)
- [ ] Issues include `user-test:<area-slug>` label; dedup uses `--label` flag first, semantic fallback second
- [ ] Test file template created for new scenarios with all required sections including `schema_version: 1`
- [ ] `tests/user-flows/test-history.md` appended after each run (rotation: keep last 50 entries, includes quality avg + pass rate + disconnects + demo_readiness + key finding)
- [ ] Test file path validated to stay within `tests/user-flows/` (no directory traversal)
- [ ] Iterate mode: N capped at 10 by default, error on N=0, N=1 valid
- [ ] Iterate mode: reset between runs = full page reload to app entry URL (limitations: IndexedDB, SW caches, HttpOnly cookies not cleared)
- [ ] Iterate mode: partial run handling (disconnects mid-iterate produce valid partial results)
- [ ] `test-history.md` includes `demo_readiness` column (yes/no/partial) persisted each run
- [ ] Explore Next Run items include priority (P1/P2/P3); Phase 3 picks highest priority first
- [ ] Area granularity: worked example in test-file-template.md showing 1-3 interactions per area
- [ ] Phase 2 environment sanity check: verifies app loads with expected content before test execution
- [ ] Given a new scenario, full pipeline (phases 0-4 + commit) produces: test file with schema_version: 1, quality score, maturity map, and summary — all without manual intervention beyond initial command
- [ ] Given a test file with an Uncharted area, after iterate N=3 where all runs score >= 4, the area's maturity status is Proven

### Security Requirements

- [ ] Test file path resolution prevents directory traversal
- [ ] No credentials (passwords, tokens, session IDs) persisted in any output file
- [ ] Issue body content sanitized before `gh issue create`
- [ ] `user-test:<area-slug>` label convention documented for duplicate detection

## SKILL.md Content Outline

The skill contains 5-phase execution logic (run + score) plus a commit mode (update files + file issues), with references to supporting files:

<!-- ready-to-copy -->
```
---
name: user-test
description: Run browser-based user testing via claude-in-chrome MCP with quality scoring and compounding test files. Use when testing app quality from a real user's perspective, scoring interactions, tracking test maturity, or filing issues from test sessions.
argument-hint: "[scenario-file-or-description]"
---

# User Test

Exploratory testing in a visible Chrome window. You watch the test happening
in real-time and can intervene if needed. Claude shares your browser's login
state — sign into your app in Chrome before running.

For automated headless regression testing, use /test-browser instead.

**v1 limitation:** This skill targets localhost / local dev server apps. External
or staging URLs are not validated for deployment status — if you test against a
remote URL, verify it's live and accessible before running.

## Phase 0: Preflight
[Validate: claude-in-chrome MCP available (if not: "Run /chrome"), WSL detection,
site permissions, gh auth status, app URL resolvable]

## Phase 1: Load Context
[Resolve test file from path/description, validate path stays within tests/user-flows/,
extract maturity map + history, validate schema_version]
[If no argument: scan tests/user-flows/ for test files, present list, or prompt for description]
[If test file corrupted: offer to regenerate from template]

## Phase 2: Setup
[Ensure user is signed into target app in Chrome (shared login state),
take baseline screenshot]
[If login page or CAPTCHA encountered: pause for manual handling]
[Environment sanity check: navigate to app URL, verify page loaded with expected content
(not an error page, not a stale auth redirect, not an empty state). If the app loads but
shows error banners, API failures, or empty data that should be populated — abort with
"App environment issue detected" rather than producing misleading quality scores]

## Phase 3: Execute
[Maturity-guided selection (agent judgment, not mechanical counters),
Proven areas: quick spot-check (max 3 MCP calls),
Uncharted areas: full investigation with batched javascript_tool calls,
Known-bug areas: skip entirely]
[Connection resilience: retry once with 3s delay, then /chrome reconnect guidance]
[If all areas Proven: spot-check all, suggest new scenarios in "Explore Next Run"]
[Explore Next Run items have priority: P1 (likely user-facing friction), P2 (edge case),
P3 (curiosity). Pick highest-priority uncharted items first, not FIFO]
[Modal dialog detection: instruct user to dismiss manually]

## Phase 4: Score and Report
[Quality scoring 1-5 using calibration rubric per scored interaction unit]
[A scored interaction unit = one user-facing task completion (e.g., "add item to cart",
"submit shipping form", "complete payment"). Navigation steps, page loads, and setup
actions are not scored individually — they are part of the interaction they serve.]
[Scores are ABSOLUTE per rubric, not relative to scenario framing.]
[Output: run summary block with per-area scores, disconnect count, overall quality avg]
[If run is interrupted before scoring completes, do NOT produce committable output —
partial runs must not corrupt maturity state]

## Commit Mode
[Invoked separately via /user-test-commit after reviewing run results]
[Maturity updates using agent judgment, run history, promotion/demotion with rubric]
[Atomic write: write to .tmp then rename]
[History rotation: keep last 50 entries in test-history.md]
[Include structured label `user-test:<area-slug>` on every issue]
[Duplicate detection: `gh issue list --label "user-test:<area-slug>" --state open` for
exact match; fall back to semantic title search only if no label match found]
[Sanitize issue body content, skip gracefully if gh not authenticated]
[Never persist credentials in issue bodies or test files]
[Persist demo_readiness (yes/no/partial) in test-history.md alongside quality scores]

## Iterate Mode
See [iterate-mode.md](./references/iterate-mode.md) for details.
N capped at 10 (default), N=0 is error, N=1 valid.
State clearing limitations documented.
Partial run handling: if disconnect mid-iterate, write results for completed runs and report
"Completed M of N runs" — partial results are valid and maturity updates apply.
Output format: per-run scores table + aggregate consistency metrics + maturity transitions.

## Test File Template
See [test-file-template.md](./references/test-file-template.md).

## Browser Input Patterns
See [browser-input-patterns.md](./references/browser-input-patterns.md).
```

## Thin Wrapper Command Templates

### `commands/user-test.md`

<!-- ready-to-copy -->
```markdown
---
name: user-test
description: Run browser-based user testing with quality scoring and compounding test files
disable-model-invocation: true
allowed-tools: Skill(user-test)
argument-hint: "[scenario-file-or-description]"
---

Invoke the user-test skill for: $ARGUMENTS
```

### `commands/user-test-iterate.md`

<!-- ready-to-copy -->
```markdown
---
name: user-test-iterate
description: Run the same user test scenario N times to measure consistency
disable-model-invocation: true
allowed-tools: Skill(user-test)
argument-hint: "[scenario-file] [n]"
---

Invoke the user-test skill in iterate mode for: $ARGUMENTS
```

### `commands/user-test-commit.md`

<!-- ready-to-copy -->
```markdown
---
name: user-test-commit
description: Commit user-test results — update test file maturity map, file issues, append history
disable-model-invocation: true
allowed-tools: Skill(user-test)
---

Invoke the user-test skill in commit mode for the last completed run.
```

## SpecFlow Analysis -- Gaps Addressed in Implementation

The SpecFlow analyzer identified gaps. Here is how the implementation addresses each genuine gap:

| Gap | Resolution |
|-----|-----------|
| No-argument behavior | Phase 1: scan `tests/user-flows/` for test files, present list, or prompt for description |
| MCP not connected | Phase 0 preflight: check MCP availability, instruct to run `/chrome` or restart with `claude --chrome` |
| gh not authenticated | Phase 6: check `gh auth status` before creating issues, skip gracefully if not authenticated |
| Test file corruption | Phase 1: validate required sections and schema_version, offer to regenerate from template if missing |
| All areas Proven | Phase 3: spot-check all Proven areas, add note suggesting new scenarios in "Explore Next Run" |
| N=0 for iterate | Iterate mode: treat N=0 as error, require N >= 1, cap N <= 10. N=1 is valid (single run with consistency tracking) |
| State between iterate runs | Iterate mode: full page reload to app entry URL between each run. Document limitation: does not clear IndexedDB, service worker caches, or HttpOnly cookies |
| Preflight check | Phase 0: validates MCP, gh, app URL, WSL detection, site permissions, Windows named pipe conflicts |
| Authentication/login | Phase 2: leverage shared browser login state. User signs in once in Chrome. If CAPTCHA encountered, Claude pauses for manual handling |

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| `claude-in-chrome` MCP may not be installed | Phase 0 preflight check with specific "/chrome" instructions |
| Extension service worker goes idle during extended sessions | Retry once with 3s delay, then specific "/chrome Reconnect" guidance. Abort after 3 cumulative disconnects. |
| File upload not supported | Explicit `MANUAL ONLY` marking in test file template. Workaround: pause user-test and use `/agent-browser` for upload steps. |
| SKILL.md growth past 500 lines | References/ extraction from day one. Validation gate: `wc -l < SKILL.md` must be <= 500 |
| Component count drift | Dynamic count validation in acceptance criteria (count files, verify descriptions match) |
| Test history unbounded growth | Rotation: keep last 50 entries in test-history.md |
| Modal dialogs block browser commands | Detection guidance in Phase 3, instruct user to dismiss manually |
| WSL environment | Preflight detection and abort with clear message |
| Windows named pipe conflicts | Preflight detection with "close other Claude Code sessions" guidance |
| Directory traversal via test file path | Path validation in Phase 1: resolved path must start with `tests/user-flows/` |
| External/staging app not deployed or stale | v1 targets localhost/local dev. Document limitation: no deployment verification for remote URLs. User must verify external apps are live before testing. |
| App loads but environment is broken (stale auth, empty data, API 500s) | Phase 2 environment sanity check: navigate + content assertion before test execution. Abort with "App environment issue" rather than producing misleading scores |
| Issue dedup fails on different descriptions of same bug | Structured `user-test:<area-slug>` label on every issue for exact-match dedup via `--label`; semantic search as fallback only |

## Success Metrics

- Skill loads and executes without errors on first invocation
- Test file is correctly created from description with `schema_version: 1`
- Maturity model state transitions work across 3+ consecutive runs using agent judgment
- No duplicate GitHub issues created across iterate runs
- SKILL.md <= 500 lines (enforced by validation gate)
- All component counts match across plugin.json, marketplace.json, and README.md (verified dynamically)
- **Compounding metric**: After 3 runs on the same scenario, Proven area count > 0 and total test duration decreases (spot-checks are faster than full investigations)

## Sources & References

### Internal References
- Thin wrapper pattern: `plugins/compound-engineering/commands/deepen-plan.md:1-9`
- Skill structure: `plugins/compound-engineering/skills/deepen-plan/SKILL.md` (frontmatter + phases pattern)
- Browser automation: `plugins/compound-engineering/skills/agent-browser/SKILL.md` (MCP tool reference)
- Existing test command: `plugins/compound-engineering/commands/test-browser.md` (distinct tool set)
- Plugin checklist: `CLAUDE.md` "Adding a New Skill" section
- Anti-patterns: `docs/solutions/2026-02-26-monolith-to-skill-split-anti-patterns.md`
- Versioning: `docs/solutions/plugin-versioning-requirements.md`

### Conventions Applied
- Skill compliance: name matches directory, single-line description with trigger keywords
- Thin wrapper: `allowed-tools: Skill(user-test)`, `disable-model-invocation: true`
- Version bump: MINOR for new functionality (dynamic — count at implementation time)
- CHANGELOG: Keep a Changelog format with `### Added` section
- Reference files linked with proper markdown links: `[filename.md](./references/filename.md)`
