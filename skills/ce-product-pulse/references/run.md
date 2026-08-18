# Running the pulse

Required read before dispatching any query.

Before dispatching, make sure the `pulse_*` values in hand are current: if the interview just ran, re-apply the ordinary-key cascade (local then tracked) so edits accepted during its review step are picked up.

## Dispatch

Run these in **parallel** (different tools, no shared load):

- Product analytics query (primary event count, value-realization count, completions, conversion ratios) over the window
- Application tracing query (error counts by category, latency distribution, top error signatures) over the window
- Payments query, if configured (new customers, churn, revenue delta) over the window

Run these **serially**, after the parallel batch:

- Read-only database queries, only when `pulse_db_enabled` is `true`. One at a time. Tight, scoped queries only. Never full-table scans on large tables. If a DB query would be expensive, skip it and note "DB query skipped (estimated cost too high)".

## Optional: sample quality scoring

If `pulse_quality_scoring` is `true` (AI products only), sample up to 10 sessions or conversations from the window and score each 1-5 on the dimension recorded in `pulse_quality_dimension`.

**Scoring discipline:** Default to 4 or 5 when the session looks normal. Reserve 1-3 for sessions with a clear failure mode (product gave wrong answer, user got stuck, error surfaced). If every session is scoring 3, the bar is too strict; if every session is scoring 5, the bar is too loose.

**No PII in the score summary.** Capture a count distribution (e.g., "8x 5, 1x 4, 1x 2") and a short anonymized note on any session scored below 4. Do not include message content or user identifiers in the saved report.

## Assemble the report

Read `references/report-template.md`. Fill in the template using the query results. Four sections, in order:

1. **Headlines** - 2-3 lines summarizing the window
2. **Usage** - primary engagement, value realization, completions, quality sample
3. **System performance** - latency (p50/p95/p99) and top 5 errors by count with one-line explanation each
4. **Followups** - 1-5 things worth investigating

Keep the total to 30-40 lines. If a section is thin, leave it thin; do not pad.

## Write and surface

Save to `<root>/pulse-reports/YYYY-MM-DD_HH-MM.md` using the local time of the run. Create `<root>/pulse-reports/` if it does not exist.

Surface the Headlines and top Followup in chat. Provide the full file path so the user can open the saved report.

## Why this shape

The "read like a founder" posture and the single-page constraint are deliberate. Dashboards with 40 metrics produce attention sprawl; one page with the right four sections forces the reader to notice what matters. The saved-reports folder is designed to be a team's working memory, not a data warehouse - past pulses are grepable, diffable, and disposable.
