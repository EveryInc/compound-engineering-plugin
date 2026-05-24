# `ce-product-pulse`

> Generate a time-windowed pulse report on what users experienced and how the product performed — usage, quality, errors, signals worth investigating. One page, every time.

`ce-product-pulse` is the **observation-loop** skill. It queries the product's data sources for a given time window (24h, 7d, 1h, etc.) and produces a single-page report covering usage, performance, errors, and follow-ups. The report saves to `docs/pulse-reports/` as a browseable timeline of what users experienced — the team's working memory of how the product is actually performing in the world.

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-product-pulse` **closes the outer loop** — once features are shipped, the pulse surfaces signals from real usage that feed back into ideation ("what's worth exploring?") and brainstorming ("what does this need to be?"). Combined with `ce-strategy` as the upstream anchor and `ce-compound` capturing learnings, the chain becomes a feedback system rather than a one-way pipeline.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Queries analytics, tracing, payments (and optionally a read-only DB) for a time window; produces a single-page report |
| When to use it | "Run a pulse", weekly recap, launch-day check, "how are we doing", `/ce-product-pulse 7d` |
| What it produces | A report saved to `docs/pulse-reports/YYYY-MM-DD_HH-MM.md`; key points surfaced in chat |
| What's next | Surface follow-ups to `/ce-ideate` or `/ce-brainstorm`; investigate specific issues with the native tools |

---

## The Problem

Most "how are we doing?" reports fail in predictable ways:

- **Dashboard sprawl** — 40 metrics across 6 tools; nobody reads any of it
- **Threshold theater** — red/yellow/green color-coding based on guessed-at thresholds that don't match the product's actual operating ranges
- **Stale by ingestion lag** — the most recent 15 minutes of analytics are under-reported, so "what just happened?" answers are wrong
- **PII bleed into reports** — emails, account IDs, message content end up in saved files and Slack threads
- **Mutating side effects** — a "report generation" tool that accidentally writes to the database or marks events
- **No memory** — pulses live in chat, not on disk; you can't compare last week to this week
- **No anchor** — the pulse measures what happens to be instrumented, not what the strategy says matters

## The Solution

`ce-product-pulse` runs as a structured observation pass with explicit invariants:

- **Single-page output** (30-40 lines) — sprawl is the enemy of attention
- **Read like a founder** — no thresholds, no red/yellow/green; present numbers, the reader judges
- **15-minute trailing buffer** — the upper bound of every query is `now - 15m` to avoid ingestion-lag under-reporting
- **No PII in saved reports** — emails, account IDs, message content stay out of disk
- **Read-only invariant** — every data source is queried read-only; if a database is configured, the connection must be read-only (the interview refuses read-write credentials)
- **Strategy-seeded** — when `STRATEGY.md` exists, the interview reads it and seeds metrics from there; data-source setup wires up connections to actually measure what the strategy says matters
- **Memory through saved reports** — every run writes to `docs/pulse-reports/` so past pulses are a browseable timeline

---

## What Makes It Novel

### 1. Single-page constraint — 30-40 lines, hard

The report is constrained to four sections (Headlines, Usage, System performance, Followups) and a 30-40 line target. Sections that are thin stay thin; sections aren't padded to fill space. The constraint forces the report to surface what matters, not what's available.

### 2. "Read like a founder" — no thresholds

The skill never labels things "good" or "bad." It presents the numbers and lets the reader judge. Hardcoded thresholds (e.g., "p95 > 500ms is red") create theater — they're guesses by the threshold-setter, not signals about the product. A founder reading the pulse knows what's normal for their product; the skill respects that.

### 3. Strategy-seeded interview

When `STRATEGY.md` exists, the first-run setup reads it before asking questions. It surfaces the seeded product name and the list of key metrics, and the interview wires up data sources to actually measure those metrics. The result: the pulse reports on what the strategy says matters, not what's coincidentally instrumented. When no strategy doc exists, the skill notes that explicitly and runs setup from scratch.

### 4. Read-only invariant

The skill never mutates the product, the database, or any external system. The only writes are pulse settings appended to `.compound-engineering/config.local.yaml` (gitignored, machine-local) and the report file (`docs/pulse-reports/...`). MCP and other data-source tools are invoked read-only; if a tool offers write modes, they're not used.

For database access specifically, the interview **refuses** read-write credentials and points the user at alternatives (read replicas, BI views, snapshot exports). DB access is optional; many products complete the pulse with analytics + tracing alone.

### 5. 15-minute trailing buffer

Many analytics and tracing tools have ingestion lag — querying right up to `now` under-reports the most recent events. Every query window's upper bound is `now - 15m`. For a `24h` window, the skill queries `[now - 24h - 15m, now - 15m]`. The buffer is invisible to the reader but eliminates a common source of "why does the pulse say zero events in the last hour?" confusion.

### 6. PII-free saved reports

Saved reports contain count distributions and anonymized notes only — no user emails, account IDs, or message content. When optional quality scoring is enabled (AI products), low-scored sessions get a short anonymized note describing the failure mode, not the message text. This makes the saved reports safe to commit, share, or browse without privacy concerns.

### 7. Parallel + serial query dispatch

Phase 2.1 dispatches analytics, tracing, and payments queries in parallel (different tools, no shared load), then runs read-only DB queries serially (one at a time, scoped, no full-table scans). The split prevents accidental load on the production database while still using available wall-clock budget effectively.

### 8. SMART metric pushback

The interview applies a SMART bar (specific, measurable, actionable, relevant, timely) to every metric, event, and signal the user proposes. Vanity metrics get pushed back on; vague metrics get sharpened. The result is a config that produces signal, not noise.

### 9. Optional quality scoring with discipline

For AI products, quality scoring of sampled sessions (1-5 on a defined dimension) is opt-in. The discipline: default to 4 or 5 for normal sessions; reserve 1-3 for clear failure modes (wrong answer, user got stuck, error surfaced). If everything scores 3, the bar is too strict; if everything scores 5, too loose. The score distribution is what the report carries — not session content.

### 10. Memory through saved reports

Every pulse writes to `docs/pulse-reports/YYYY-MM-DD_HH-MM.md` (local time). Past pulses are grepable, diffable, and disposable — a team's working memory of how the product has performed. The saved-reports folder is designed to be working memory, not a data warehouse. After 100 reports, the timeline is a real artifact you can scroll through.

---

## Quick Example

It's Monday morning. You want to see how things went over the weekend. You run `/ce-product-pulse 72h`.

The skill detects this is a configured project (`pulse_product_name` is set in `.compound-engineering/config.local.yaml`), so it skips the interview and goes straight to Phase 2. It applies the 15-minute trailing buffer: `[Friday 5:45pm — Monday 8:45am]`.

Phase 2.1 dispatches in parallel: PostHog query (primary engagement event count, value-realization, completion ratio), Sentry query (error counts by category, latency p50/p95/p99, top error signatures), Stripe query (new customers, churn, revenue delta). Then the read-only DB query runs serially (a small scoped query for active-user count by tier).

Phase 2.2 samples 10 sessions for quality scoring (your product is AI; quality scoring is enabled). The distribution comes back: 7×5, 2×4, 1×2 — one session went sideways with a clearly wrong answer.

Phase 2.3 fills the report template: Headlines (3 lines), Usage section (engagement, value, completion, quality sample), System performance (latency, top 5 errors with one-line explanations), Followups (the failed-quality session is worth investigating; one error pattern climbed week-over-week).

The report writes to `docs/pulse-reports/2026-05-04_08-45.md`. The Headlines and top Followup surface in chat. You see the followup, decide to investigate the climbing error pattern with `/ce-debug`.

---

## When to Reach For It

Reach for `ce-product-pulse` when:

- You want a snapshot of what users experienced over a time window (24h, 7d, post-launch)
- A launch just happened and you want a 1h or 4h check on early signal
- The team does a weekly "how are we doing" recap
- You want to surface follow-ups for ideation or debugging without staring at four dashboards

Skip `ce-product-pulse` when:

- You're doing deep investigation of a specific issue → use the native tools (Sentry, PostHog, etc.)
- You need real-time alerting → that's monitoring, not pulse
- You want to know "what shipped" → that's git log + PR list, not the pulse (the pulse is about user experience and system performance, not changelog content)

---

## Use as Part of the Workflow

`ce-product-pulse` closes the outer feedback loop:

```text
                    /ce-strategy ──┐
                                    ↓ (key metrics seed pulse)
   ↗── /ce-product-pulse ──────────┐
   │       (followups)             ↓ (signals feed into)
   │                          /ce-ideate → /ce-brainstorm → /ce-plan → /ce-work
   │                                                                      ↓
   └──────────────────────────────────────────────────── shipped ─────────┘
                       (the pulse measures what shipped, in production)
```

In a configured project:

- `STRATEGY.md` (from `/ce-strategy`) seeds the metrics that get measured
- `/ce-product-pulse` produces the report and surfaces follow-ups
- Follow-ups feed back into `/ce-ideate` (what's worth exploring), `/ce-debug` (what's broken), or `/ce-brainstorm` (what to build next)

The pulse doesn't replace dashboards, tracing, or analytics — it consolidates them into a single-page read so the team can spend attention on the few things that matter rather than re-deriving "what happened" from four sources.

---

## Use Standalone

The skill is invoked directly with a lookback window:

- **Default 24h** — `/ce-product-pulse`
- **Specific window** — `/ce-product-pulse 7d`, `/ce-product-pulse 1h` (launch check), `/ce-product-pulse 30d`
- **Reconfigure** — `/ce-product-pulse setup` (or `reconfigure`, `edit config`) re-runs the interview
- **First run** — `/ce-product-pulse` with no config triggers the setup interview, then the pulse

---

## Output Artifact

```text
docs/pulse-reports/YYYY-MM-DD_HH-MM.md  (local time)
```

Four sections (target 30-40 lines total):

- **Headlines** — 2-3 lines summarizing the window
- **Usage** — primary engagement, value realization, completions, quality sample distribution (when enabled)
- **System performance** — latency (p50/p95/p99) and top 5 errors by count with one-line explanations
- **Followups** — 1-5 things worth investigating

Past reports remain in the folder as a browseable timeline. The folder is meant to be grepped, diffed, and occasionally pruned — not curated.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Use `pulse_lookback_default` from config (or `24h` if unset) |
| `24h`, `48h`, `72h`, `7d`, `30d`, `1h` | Trailing time window |
| `setup` / `reconfigure` / `edit config` | Re-run the interview regardless of config state |

Configuration lives in `.compound-engineering/config.local.yaml` (gitignored, machine-local) under `pulse_*` keys: product name, primary event, value event, completion events, quality scoring, quality dimension, analytics source, tracing source, payments source, DB enabled, per-metric source overrides, pending metrics, excluded metrics, default lookback.

---

## FAQ

**Why no thresholds in the report?**
Because thresholds are theater unless they're calibrated for the specific product, and calibrating them for every metric is more work than the pulse itself. A founder reading the pulse knows what's normal — the report respects that. If a number looks wrong, the reader notices; if it doesn't, they don't.

**Why a 15-minute trailing buffer?**
Most analytics and tracing tools have ingestion lag — events from the last 15 minutes are under-reported. Without the buffer, every "what just happened?" pulse would understate recent activity. The buffer is invisible but eliminates a common source of confusion.

**Why is database access read-only?**
Because a "generate a report" tool should never accidentally mutate production data. The interview refuses read-write credentials and points at alternatives (read replicas, BI views, snapshot exports). Many products complete the pulse without DB access entirely — analytics + tracing is enough.

**Why is the report a single page?**
Sprawl is the enemy of attention. Dashboards with 40 metrics produce attention sprawl; one page with the right four sections forces the reader to notice what matters. If you need more depth, the native tools are still there.

**What's the relationship to `STRATEGY.md`?**
The first-run interview seeds product name and key metrics from `STRATEGY.md` when it exists. The pulse measures what the strategy says matters, not what's coincidentally instrumented. When no strategy doc exists, the skill notes that and runs setup from scratch.

**Does it support scheduling?**
Yes — first-run setup offers to set up a recurring pulse via the harness's available scheduling primitive (the in-plugin `schedule` skill where present, or platform-native options like cron/GitHub Actions). Scheduling never happens automatically; it requires explicit confirmation.

**What about non-Claude-Code platforms?**
The skill works on any platform with read-only data-source tools. The pre-resolution of config is harness-specific (Claude Code reads it via `!` backtick), but the rest is platform-agnostic. The interview never schedules inline — it hands off to whatever scheduling primitive the harness exposes.

---

## Learn More

The "read like a founder" posture and the single-page constraint are deliberate. Dashboards with 40 metrics produce attention sprawl; one page with the right four sections forces the reader to notice what matters. The saved-reports folder is designed to be working memory — past pulses are grepable, diffable, and disposable.

---

## See Also

- [`ce-strategy`](./ce-strategy.md) — seeds the metrics that the pulse measures
- [`ce-ideate`](./ce-ideate.md) — common follow-up destination for surfaced signals
- [`ce-debug`](./ce-debug.md) — common follow-up destination for error patterns the pulse surfaces
- [`ce-brainstorm`](./ce-brainstorm.md) — when a pulse follow-up needs scope clarification before fixing
