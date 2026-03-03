# .user-test-last-run.json Schema

Written to `tests/user-flows/.user-test-last-run.json` after Phase 4 completes.

## Behavior

- **Overwritten each run** — only the last run is committable
- `completed: false` if the run was interrupted — commit mode rejects it
- If Phase 4 is interrupted before writing this file, no committable output exists
- **Exception:** `novelty_fingerprints` accumulates across runs (read-merge-write). All other keys are overwritten.

## Schema

```json
{
  "run_timestamp": "2026-02-28T14:30:00Z",
  "completed": true,
  "scenario_slug": "checkout",
  "git_sha": "abc1234",
  "areas": [
    {
      "slug": "cart-validation",
      "ux_score": 4,
      "quality_score": null,
      "time_seconds": 12,
      "skip_reason": null,
      "assessment": "Ready for promotion",
      "issues": [],
      "tactical_note": "filter → navigate → back → filter again surfaces stale state",
      "confirmed_selectors": {
        "activeFilters": "[data-filter-chip]",
        "resultCount": ".product-card",
        "sampleResults": ".product-card .title, .condition-badge"
      },
      "weakness_class": "stale-react-state",
      "adversarial_browser": false,
      "adversarial_trigger": null
    }
  ],
  "qualitative": {
    "best_moment": { "area": "cart-validation", "text": "Cart updates instantly on quantity change" },
    "worst_moment": { "area": "shipping-form", "text": "Shipping form accepts invalid zip codes" },
    "demo_readiness": "partial",
    "verdict": "Checkout works but shipping validation broken",
    "context": "shipping zip validation bypassed"
  },
  "explore_next_run": [
    { "priority": "P1", "area": "shipping-form", "mode": "Browser", "why": "Validation broken" },
    {
      "priority": "P1",
      "area": "[cross-area]",
      "mode": "Browser",
      "why": "stale-react-state in agent/filter-via-chat + browse/filters",
      "weakness_class": "stale-react-state",
      "affected_areas": ["agent/filter-via-chat", "browse/filters"],
      "adversarial_instruction": "Probe ALL navigation sequences that cross area boundaries..."
    }
  ],
  "ux_opportunities": [
    { "id": "UX001", "area": "shipping-form", "priority": "P1", "suggestion": "Should show inline validation before submit" }
  ],
  "good_patterns": [
    { "area": "cart-validation", "pattern": "Cart updates instantly on quantity change" }
  ],
  "verification_results": [
    { "area": "agent/filter-via-chat", "claims_checked": 8, "mismatches": [
      { "claim": "Condition: Like New", "actual": "Good", "element": "result-3 badge" }
    ]}
  ],
  "probes_run": [
    { "area": "agent/filter-via-chat", "query": "show me NWT only", "verify": "all badges say NWT", "status": "failing", "result_detail": "3 non-NWT results" }
  ],
  "probes_generated": [
    { "area": "agent/filter-via-chat", "query": "show me good condition only", "verify": "no NWT/like-new badges visible", "priority": "P1", "generated_from": "run-2 condition mismatch" }
  ],
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
  ],
  "journeys_run": [
    {
      "id": "J001",
      "name": "Primary user flow",
      "status": "failing-at-5",
      "on_failure": "abort",
      "checkpoints": [
        { "step": 1, "area": "<area-slug-1>", "passed": true },
        { "step": 2, "area": "<area-slug-2>", "passed": true },
        { "step": 3, "area": "<area-slug-3>", "passed": true },
        { "step": 4, "area": "<area-slug-4>", "passed": true },
        { "step": 5, "area": "<area-slug-1>", "passed": false,
          "detail": "stale state from step 2 still active" }
      ],
      "time_seconds": 45
    }
  ],
  "novelty_log": [],
  "novelty_fingerprints": {
    "agent/filter-via-chat": [
      "agent/filter-via-chat:edge-query:price-floor",
      "agent/filter-via-chat:edge-query:out-of-scope-question"
    ],
    "browse/filters": [
      "browse/filters:filter-combo:size+color"
    ]
  },
  "stable_queries_rotated": [],
  "disconnects": {
    "count": 0,
    "contexts": []
  }
}
```

## Journey Fields (v9 additions)

| Field | Type | Description |
|-------|------|-------------|
| `journeys_run` | array | Per-journey results with checkpoint data |
| `journeys_run[].id` | string | Journey ID (e.g., "J001") |
| `journeys_run[].name` | string | Journey name |
| `journeys_run[].status` | string | `untested`, `passing`, `failing-at-N`, `flaky`, or `stable` |
| `journeys_run[].on_failure` | string | `abort` or `continue` |
| `journeys_run[].checkpoints` | array | Per-step results: step, area, passed, detail |
| `journeys_run[].time_seconds` | number | Wall-clock time for the journey |

See [journeys.md](./journeys.md) for lifecycle, budget, and execution rules.

## Per-Area Fields (v8 additions)

| Field | Type | Default | Written by |
|-------|------|---------|-----------|
| `tactical_note` | string or null | null | Commit Mode — genuine tactical insight only |
| `confirmed_selectors` | object or {} | {} | Commit Mode — selectors confirmed by successful batch call |
| `weakness_class` | string or null | null | Commit Mode — when 2+ probes share a failure pattern |
| `adversarial_browser` | boolean | false | Phase 2.5 — CLI score 3 trigger |
| `adversarial_trigger` | string or null | null | Phase 2.5 — the query that triggered adversarial mode |

## Explore Next Run Fields (v8 additions)

Cross-area synthesis entries include:

| Field | Type | Present when |
|-------|------|-------------|
| `weakness_class` | string | Entry is from cross-area synthesis |
| `affected_areas` | string[] | Entry is from cross-area synthesis |
| `adversarial_instruction` | string | Entry is from cross-area synthesis |

## Novelty Fingerprints

| Property | Value |
|----------|-------|
| Key | `novelty_fingerprints` (top-level) |
| Structure | Object keyed by area slug, each value an array of fingerprint strings |
| Format | `<area-slug>:<action-type>:<key-parameter>` |
| Cap | 20 per area (drop oldest when exceeded) |
| Accumulation | Read existing → merge with new → apply cap → write back |
| Resilience | Missing/corrupted → empty (graceful degradation) |

See [queries-and-multiturn.md](./queries-and-multiturn.md) for fingerprint normalization taxonomy.
