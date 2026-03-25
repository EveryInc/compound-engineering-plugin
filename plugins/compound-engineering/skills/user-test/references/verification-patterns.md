# Verification Patterns

After exploring each area, the skill runs a structural verification pass — independent of what the agent noticed during exploration. This is the "distrust the UI" layer.

## Standard Checks by Area Type

| Area Type | Verification Steps |
|-----------|-------------------|
| Filter areas | Read active filter chip state. Sample 5-8 visible results. Read the corresponding badge/attribute on each. Every result must match the filter. If sub-filter options show counts ("Like New (14)"), read one count, apply that sub-filter, count visible results — displayed count must be within ±10% or ±2 items of actual. Zero results when count > 0 is always a failure. |
| Search/agent areas | Extract any summary claim the agent made ("showing like-new items"). Sample 5-8 results. Read the attribute the claim references. Every result must match. After results load, check `window.scrollY` — must be < 100px (see Interaction State Checks for calibration). If ≥ 100px, the page did not scroll to top. |
| Cart areas | Read the cart badge count. Open the cart drawer/page. Count visible items. Numbers must match. |
| Count displays | Read any "N items" or "N results" text. Count visible items on screen. Numbers must match (pagination: compare against the count on the current page, not total). |
| Sort areas | Read the claimed sort order (e.g., "Price: Low to High"). Read the sort attribute on the first 5 visible results. Each successive value must be >= the previous (or <= for descending). |
| Filter chip dismiss | After dismissing any filter chip: verify chip is gone from DOM, result count changed, and (if area has agent component) agent responds to a follow-up message within 10s. Non-response after chip dismiss is a verification failure. |

## Tolerance Rules

**Zero tolerance** for filter, search, cart, and count mismatches. If 6 of 8 sampled results match and 2 don't, that's a failure. A filter that works 75% of the time is broken. Record exact counts: "2 of 8 sampled results had mismatched condition badges."

**Sort order exception:** Position drift of ±1 is acceptable (ties, identical values). Position drift of ±2 or more is a failure.

## Interaction State Checks

Some verifications require a before/after pattern — read state, trigger
an interaction, read state again. These cannot be batched into a single
javascript_tool call. Run them AFTER the standard batch verification pass.

| Interaction | Before | Action | After | Pass Condition |
|-------------|--------|--------|-------|---------------|
| Filter chip dismiss | Read chip list + result count | Click dismiss | Read chip list + result count | Chip gone; result count changed |
| Search query submit | — | Submit query, wait for results | Read `window.scrollY` | scrollY < 100px |
| Agent follow-up after filter change | — | Dismiss chip; send follow-up | Poll for response (10s max) | Response received |

**Scroll tolerance:** 100px accommodates sticky headers. Document app-specific
threshold in the area's `verify:` block if different.

**Agent timeout:** 10s is generous for 2-3s baseline apps. Calibrate against
`score-history.json` timing data.

## Scoring Impact

Verification results, probe results, and UX scores are three separate signals — none subsumes the others. See SKILL.md Phase 3 checklist. An area can have:
- Good UX + passing verification = healthy
- Good UX + failing verification = data integrity issue (the UI lies)
- Poor UX + passing verification = genuine UX problem (the data is correct)

## Maturity Interaction

- **Promotion blocked:** A verification failure blocks promotion to Proven, even if UX score >= `pass_threshold`. Area stays Uncharted with note "verification failure blocks promotion."
- **No demotion:** A Proven area that fails verification on a subsequent run does NOT demote. Instead: a probe is generated for the next run and a warning appears in the report. Demotion only happens via the bug registry path (score drops below threshold).
- **Probe generation:** Any verification failure triggers adversarial probe generation — see [probes.md](./probes.md).

## Batching Verification Reads

Verification passes are read-only — they observe DOM state without interacting. All verification reads SHOULD use a single `javascript_tool` call that returns a JSON object with all checked claims.

**Pattern (replaces sequential find calls):**

```javascript
mcp__claude-in-chrome__javascript_tool({
  code: `JSON.stringify({
    activeFilters: [...document.querySelectorAll('[data-filter-chip]')]
      .map(c => ({ text: c.textContent, active: c.classList.contains('active') })),
    resultCount: document.querySelectorAll('.product-card').length,
    sampleResults: [...document.querySelectorAll('.product-card')]
      .slice(0, 5).map(c => ({
        title: c.querySelector('.title')?.textContent?.trim(),
        price: c.querySelector('.price')?.textContent?.trim(),
        condition: c.querySelector('[data-condition]')?.textContent?.trim(),
        category: c.querySelector('[data-category]')?.textContent?.trim()
      }))
  })`
})
```

This replaces 5+ individual MCP calls with 1. At ~2-3s per MCP round trip, saves 8-12s per area.

**When to use individual calls instead:**
- DOM structure unknown (first run, no selectors documented)
- javascript_tool fails (fall back per Graceful Degradation rules)
- Verification requires interaction (clicking to reveal hidden state)

**Selector discovery:** On first run, the agent discovers selectors during exploration. Document working selectors in the area's `**verify:**` block so subsequent runs can batch directly. Example:

```markdown
**verify:** Apply a category filter. Batch-check via javascript_tool:
activeFilters (`[data-filter-chip]`), resultCount (`.product-card`),
sample 5 results (`.product-card .title`, `.condition-badge`).
Every result's category must match the filter.
```

**First-run selector lifecycle:** Selectors discovered during exploration are used for verification in the same run (held in context). They are persisted to the verify: block during commit mode. Subsequent runs read the persisted selectors directly. Do NOT write selectors to the test file mid-Phase-3 — that's a commit-time operation.

Selectors compound: by run 3, most verification passes are single-call batched reads because the selectors were discovered in runs 1-2.

**Failure handling:** A batch failure increments `disconnect_counter` once (it is an MCP tool failure). Area gets `verification_results: null`. Retry with individual calls before recording skip_reason.

## Disconnect Pattern Tracking

When `disconnect_counter` increments, record the context: which MCP tool was called, which area was being tested, and the session MCP call count.

At run end, if `disconnect_counter >= 3`, append a disconnect analysis:

```
Disconnects: 10
  Pattern: 7/10 after javascript_tool calls
  Cluster: 6/10 after MCP call #15+
  Worst area: agent/search-query (4 disconnects)
  Suggestion: Extension unstable under sustained javascript_tool use.
              Consider browser restart between iterate runs.
```

**Schema in .user-test-last-run.json:**

```json
"disconnects": {
  "count": 10,
  "contexts": [
    { "call_number": 18, "tool": "javascript_tool", "area": "agent/search-query" },
    { "call_number": 22, "tool": "click", "area": "browse/filters" }
  ]
}
```

This data compounds: after 3+ sessions, patterns emerge (e.g., "always after 20+ MCP calls" → connection fatigue, restart between runs).

## verify: Blocks

Areas can include an optional `**verify:**` block in their area details — freeform instructions that tell the agent what claims to audit. The structural checks above run regardless; verify blocks add area-specific auditing on top.

When to add a verify block: any area with a filter, search result set, count, sort order, or agent response that summarizes data — anywhere the app could lie and the user wouldn't immediately notice.

## Selector Discovery and Writeback

Commit mode persists confirmed selectors into each area's `**verify:**` block. This is the highest-leverage writeback: run 1 discovers selectors through sequential trial (3-5 MCP calls), run 2 reads the verify block and batches them into one `javascript_tool` call.

### Rules

1. **Only write selectors confirmed by a successful batch call this run.** A selector that appeared in the DOM but wasn't used in a batch call is not confirmed — it may be fragile.
2. **Append-only.** Never replace user-authored verify content. New selectors go below existing lines.
3. **Tag with run number:** Append `_Selectors confirmed run N._` so future runs know the source.
4. **Update changed selectors:** If a confirmed selector changed from the previous run (e.g., `.product-card` → `.item-card`), update the selector and reset the tag to the current run.
5. **Preserve unchanged selectors:** If selectors from a previous run still work, leave them and their tag intact.
6. **First-run placeholder:** If no selectors are confirmed yet, write `_Selectors not yet confirmed — discover during exploration._`

### Format

```markdown
**verify:**
- Apply filter. Batch-check via javascript_tool:
  activeFilters (`[data-filter-chip]`), resultCount (`.product-card`),
  sample 5 results (`.product-card .title`, `.condition-badge`).
  Every result's attribute must match the active filter.
  _Selectors confirmed run 3._
```

### Interaction with `.user-test-last-run.json`

Confirmed selectors are stored per area in the `confirmed_selectors` object:

```json
"confirmed_selectors": {
  "activeFilters": "[data-filter-chip]",
  "resultCount": ".product-card",
  "sampleResults": ".product-card .title, .condition-badge"
}
```

`confirmed_selectors: {}` means no selectors were confirmed this run — skip verify block update for this area.
