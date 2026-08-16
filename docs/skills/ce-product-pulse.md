# `ce-product-pulse`

> A time-windowed pulse on what users experienced and how the product performed: usage, quality, errors, and signals worth investigating. One page, every time.

`ce-product-pulse` is the **observation** skill. After work has shipped, it queries the product's data sources for a lookback window and writes a single-page report. It is not a step in `/ce-ideate` → `/ce-brainstorm` → `/ce-plan` → `/ce-work`. The loop decides and builds; this skill reports what users actually hit.

You invoke it yourself (it is not model-invoked). Combined with `ce-strategy` as the upstream anchor, follow-ups from the pulse can feed `ce-ideate` ("what's worth exploring?") or `ce-brainstorm` ("what does this need to be?"). It does not replace Sentry, PostHog, or your dashboards. It consolidates one page so you are not re-deriving "what happened" from four tools.

```text
/ce-strategy (metrics seed the pulse)
        |
        v
/ce-product-pulse  -->  follow-ups  -->  /ce-ideate or /ce-brainstorm or /ce-debug
        ^
        |  shipped work, measured in production
        +-------------------------------------------- /ce-work
```

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Queries analytics, tracing, payments, and optionally a read-only DB for a time window, then writes a single-page report |
| When to use it | "Run a pulse", weekly recap, launch-day check, "how are we doing" |
| What it produces | `docs/pulse-reports/YYYY-MM-DD_HH-MM.md` (local time; `docs/` is the default artifact root). Headlines and the top follow-up also appear in chat. |
| What's next | Take follow-ups to `/ce-ideate` or `/ce-brainstorm`, or investigate a specific error with `/ce-debug` or the native tool |

---

## Example invocations

Windows are trailing lookbacks. An empty invoke on an unconfigured repo runs setup first. `setup` / `reconfigure` / `edit config` re-run the interview, then still run a pulse.

```text
# Unconfigured: interview (seeds from STRATEGY.md when present), write pulse_* keys, then run the first pulse
/ce-product-pulse

# Configured: use pulse_lookback_default, or 24h if that key is unset
/ce-product-pulse

# Weekly operating review
/ce-product-pulse 7d

# Launch check. The 15-minute trailing buffer still applies, so this is not "right now."
/ce-product-pulse 1h

# Weekend or other multi-day window
/ce-product-pulse 72h

# Monthly recap
/ce-product-pulse 30d

# Re-run the source and metric interview, then pulse with the new config
/ce-product-pulse reconfigure

# Same interview path as reconfigure
/ce-product-pulse setup
/ce-product-pulse edit config
```

Pick the shortest window that answers the question. A launch check and a weekly review should not share a horizon.

---

## The Problem

"How are we doing?" reports fail in familiar ways:

- Forty metrics across six tools, and nobody reads any of them
- Red / yellow / green based on guessed thresholds that do not match how the product actually runs
- The last 15 minutes of analytics are under-reported, so "what just happened?" is wrong
- Emails, account IDs, and message content land in saved files and Slack threads
- A "report" tool that can write to the database or mark events
- Pulses live in chat, so you cannot compare last week to this week
- The pulse measures whatever happens to be instrumented, not what the strategy says matters

## The Solution

`ce-product-pulse` is a structured observation pass with a few hard rules:

- One page, about 30-40 lines. Thin sections stay thin.
- Numbers only. No "good" / "bad" labels and no hardcoded thresholds. You judge.
- Every query's upper bound is `now - 15m`, so ingestion lag does not under-count the tail of the window
- Saved reports hold counts and anonymized notes. No emails, account IDs, or message text.
- Every data source is queried read-only. The interview refuses read-write database credentials.
- When `STRATEGY.md` exists, setup seeds product name and key metrics from it, then wires sources to measure those metrics
- Every run writes `docs/pulse-reports/` so past pulses are a browseable timeline

---

## What Makes It Novel

### One page, no scoreboard

The report has four sections: Headlines (2-3 lines), Usage, System performance, Followups (1-5 items). Target length is 30-40 lines. If a tracing tool was never configured, System performance is omitted rather than padded.

Deltas compare this window to the previous equal-length window. If a comparison is impossible, the delta is omitted.

### Strategy-seeded setup

On first run (or `reconfigure`), the interview reads `STRATEGY.md` when present, shows the seeded product name and key metrics, and lets you correct them before wiring sources. Metrics that are not instrumented yet are not silently dropped: each one is either marked pending (`no data` in every report) or explicitly excluded from the pulse while staying in `STRATEGY.md`.

When no strategy file exists, setup says so and starts from scratch. It also notes that `ce-strategy` can seed a later reconfigure.

Every metric, event, and signal you propose is checked for being specific, measurable, actionable, relevant, and timely. Vanity metrics get a sharper question. The interview never uses the word "SMART" with you.

### Read-only, and a trailing buffer

The only writes are `pulse_*` keys in `.compound-engineering/config.local.yaml` and the report file. MCP and other tools are called read-only even when they offer a write mode.

Database access is optional. Many products finish the pulse on analytics and tracing alone. If you offer a read-write credential, the interview refuses and points at a read replica, a BI view, or a snapshot export.

Analytics, tracing, and payments queries run in parallel. Database queries run one at a time, scoped, never as a full-table scan. An expensive DB query is skipped and noted.

The 15-minute buffer is why a `24h` run queries `[now - 24h - 15m, now - 15m]`. Without it, every short window under-states recent activity.

### Optional quality scoring

For AI products, you can opt in to scoring up to 10 sampled sessions 1-5 on one dimension you define. Normal sessions default to 4 or 5. Scores 1-3 are for a clear failure (wrong answer, user stuck, error shown). The report carries the distribution and a short anonymized note on anything below 4, not the transcript.

---

## Quick Example

Monday morning, you want the weekend. The project is already configured, so `/ce-product-pulse 72h` skips the interview.

The skill applies the buffer and queries the 72 hours ending 15 minutes ago. Analytics, tracing, and payments (if configured) run together. A read-only DB query, if enabled, runs after that, one scoped statement.

If quality scoring is on, it samples up to 10 sessions. A distribution like 7×5, 2×4, 1×2 means one session had a clear failure.

The report lands at `docs/pulse-reports/2026-05-04_08-45.md` with Headlines, Usage (engagement, value, completions, any strategy metrics, the quality sample), System performance (p50 / p95 / p99 and the top 5 errors), and Followups. Chat shows the Headlines, the top follow-up, and the path, not the whole file.

A climbing error pattern is a `/ce-debug` follow-up. A product-shaped gap is `/ce-ideate` or `/ce-brainstorm`.

---

## When to Reach For It

Reach for `ce-product-pulse` when:

- You want a snapshot of what users experienced over a window (24h, 7d, post-launch)
- A launch just happened and you want a short check such as `1h`
- The team does a weekly "how are we doing" recap
- You want follow-ups for ideation or debugging without opening four dashboards

Skip `ce-product-pulse` when:

- You are investigating one known issue → the native tool (Sentry, PostHog, and so on) or `/ce-debug`
- You need real-time alerting. That is monitoring.
- You want "what shipped" → git log and the issue tracker. Pulse is user experience and system performance, not a changelog.
- You want item-level customer feedback triaged into a plan → `/ce-sweep`

---

## Use as Part of the Workflow

`ce-product-pulse` sits outside the build loop and feeds it.

```text
                    /ce-strategy
                         |
                         v  (key metrics seed pulse)
   /ce-product-pulse ----+---- follow-ups ----> /ce-ideate --> /ce-brainstorm --> /ce-plan --> /ce-work
         ^                                                                              |
         +------------------------ shipped, observed in production ---------------------+
```

In a configured project:

- `STRATEGY.md` (from `/ce-strategy`) names the metrics
- `/ce-product-pulse` writes the report and surfaces follow-ups
- Follow-ups go to `/ce-ideate`, `/ce-debug`, or `/ce-brainstorm`

The pulse does not decide what to build. It reports what happened so you can choose the next loop step.

First-run setup offers a recurring run via the harness scheduler (the in-plugin `schedule` skill when present, otherwise cron or GitHub Actions). It never schedules unless you confirm. After three or more manual runs with no schedule on file, it mentions the offer once.

---

## Use Standalone

- Default window: `/ce-product-pulse` (configured default, or 24h)
- Named window: `/ce-product-pulse 7d`, `/ce-product-pulse 1h`, `/ce-product-pulse 30d`
- Reconfigure: `/ce-product-pulse setup` (or `reconfigure`, `edit config`)
- First run: `/ce-product-pulse` with no `pulse_product_name` starts the interview, then pulses

Reports stay in `docs/pulse-reports/` as working memory: greppable, diffable, and safe to prune. The folder is not a warehouse.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Unconfigured (`pulse_product_name` unset): interview, then pulse. Configured: use `pulse_lookback_default`, or `24h` if unset. |
| `24h`, `48h`, `72h`, `7d`, `30d`, `1h` | Trailing time window. Upper bound is always `now - 15m`. An unparseable argument asks you to clarify. |
| `setup` / `reconfigure` / `edit config` | Re-run the interview regardless of config state, then run a pulse |

Configuration lives in CE config (`config.local.yaml` then `config.yaml`; the interview writes local) under `pulse_*` keys: product name, default lookback, primary / value / completion events, quality scoring and dimension, analytics / tracing / payments sources, DB enabled, per-metric source overrides, pending metrics, excluded metrics. See the [configuration reference](./configuration.md).

Default report path: `docs/pulse-reports/YYYY-MM-DD_HH-MM.md`. If `docs_root` is set, that folder moves with the other CE artifacts.

---

## FAQ

**Why no thresholds in the report?**
Thresholds are theater unless they are calibrated for this product, and calibrating every metric is more work than the pulse. You already know what is normal. If a number looks wrong, you notice.

**Why a 15-minute trailing buffer?**
Most analytics and tracing tools under-report the last few minutes. Without the buffer, every short window understates recent activity.

**Why is database access read-only?**
A report skill should not be able to mutate production. The interview refuses read-write credentials. Many products never enable the DB at all.

**Why is the report a single page?**
A 40-metric dashboard spreads attention. Four sections on one page force a choice about what matters. Depth still lives in the native tools.

**What's the relationship to `STRATEGY.md`?**
The first-run interview seeds product name and key metrics from it. Each later pulse re-reads those metrics. Pending ones render as `no data`. Excluded ones stay in the strategy file and do not appear.

**Does it support scheduling?**
Yes, as an offer during setup (and a one-time reminder after several manual runs). Confirmation is required. The skill does not schedule itself.

**What about non-Claude-Code platforms?**
It runs anywhere you have read-only data-source tools. Config is resolved from the repo at runtime. The interview hands scheduling off to whatever the harness exposes.

---

## See Also

- [`ce-strategy`](./ce-strategy.md): seeds the metrics the pulse measures
- [`ce-ideate`](./ce-ideate.md): common follow-up for a product-shaped signal
- [`ce-debug`](./ce-debug.md): common follow-up for an error pattern
- [`ce-brainstorm`](./ce-brainstorm.md): when a follow-up needs scope before you build
- [`ce-sweep`](./ce-sweep.md): item-level feedback triage, not a time-windowed metrics report
