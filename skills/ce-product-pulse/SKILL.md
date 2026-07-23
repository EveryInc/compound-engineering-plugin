---
name: ce-product-pulse
description: "Generate time-windowed product pulse reports from configured signals."
disable-model-invocation: true
argument-hint: "[lookback window, e.g. '24h', '7d', '1h'; default 24h]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
---

# Product Pulse

`ce-product-pulse` queries the product's data sources for a given time window and produces a compact, single-page report covering usage, performance, errors, and followups. The report is saved to `docs/pulse-reports/` and the key points are surfaced in chat.

The skill does not mutate the product, the database, or any external system. Its only writes are pulse settings appended to `.compound-engineering/config.local.yaml` (the unified CE local config, gitignored, machine-local) and the report file (`docs/pulse-reports/...`). MCP and other data-source tools are invoked read-only; if a tool offers write modes, do not use them.

## Interaction Method

Default to the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

Ask one question at a time. Reserve multi-select for first-run configuration only.

## Lookback Window

The **lookback window** is the time range this skill was invoked with (e.g. `24h`, `7d`) — present in the current prompt or conversation, whether the user gave it directly or a calling skill passed it. Interpret the argument as a trailing time window.

If the argument is empty, default to `pulse_lookback_default` from config (resolved in Phase 0); if that is also unset, fall through to the hard default of `24h`.

Apply a **15-minute trailing buffer** to the window's upper bound. Many analytics and tracing tools have ingestion lag; querying right up to `now` under-reports the most recent events. For a `24h` window, query `[now - 24h - 15m, now - 15m]`.

## Core Principles

1. **Read it like a founder.** No hardcoded thresholds. Do not label things "bad" or "good" by default - present the numbers and let the reader judge.
2. **Single page.** Target 30-40 lines of terminal output. If the report is getting long, cut.
3. **No PII in saved reports.** Do not include user emails, account IDs, or message content in the report written to disk.
4. **Memory through saved reports.** Every run writes to `docs/pulse-reports/` so past pulses are browseable as a timeline.
5. **Read-only database access only.** If a database is used as a data source, the connection must be read-only; the interview refuses read-write credentials. Database access is optional - many products complete the pulse with analytics and tracing alone.
6. **Strategy-seeded when available.** If `STRATEGY.md` exists, the interview reads it before asking questions and carries forward the product name and key metrics as seeds. The goal of data-source setup is to wire up whatever connections are needed to actually measure those metrics.
7. **Usage and system performance only.** Pulse does not report "what shipped" - that lives in the issue tracker and commit history - and does not replace tracing or analytics dashboards; deep investigation still uses the native tools.

## Execution Flow

### Phase 0: Route by Config State

**Read config.** Resolve `<repo-root>` at runtime by running `git rev-parse --show-toplevel` with the shell tool. Then read `<repo-root>/.compound-engineering/config.local.yaml` with the native file-read tool (e.g., Read in Claude Code, read_file in Codex). If the root cannot be resolved or the file does not exist, treat this as a first run. Otherwise extract values for the `pulse_*` keys listed under "Config keys" below.

**Config keys:**
- `pulse_product_name` -- string, used in report titles. Required for routing: if unset, skill is unconfigured.
- `pulse_lookback_default` -- one of `1h`, `24h`, `7d`, `30d` (default: `24h`)
- `pulse_primary_event` -- string, the engagement event name
- `pulse_value_event` -- string, the value-realization event name; may equal `pulse_primary_event`, or be `same-as-engagement` / `not-defined`
- `pulse_completion_events` -- comma-separated string of 0-3 event names
- `pulse_quality_scoring` -- `true` or default `false` (AI products only)
- `pulse_quality_dimension` -- string scored 1-5 when `pulse_quality_scoring` is true; ignored otherwise
- `pulse_analytics_source` -- string identifying analytics provider (e.g., `posthog`, `mixpanel`, `custom`)
- `pulse_tracing_source` -- string identifying tracing provider (e.g., `sentry`, `datadog`, `custom`)
- `pulse_payments_source` -- string identifying payments provider (e.g., `stripe`, `custom`); omit if not used
- `pulse_db_enabled` -- `true` or default `false`; when `true`, read-only DB access is part of the pulse
- `pulse_metric_sources` -- comma-separated `metric=source` pairs giving per-strategy-metric source overrides (e.g., `retention_d7=posthog,nps=delighted`). Strategy metrics not listed fall back to `pulse_analytics_source` and are rendered with a `(default source)` marker so the implicit routing is visible.
- `pulse_pending_metrics` -- comma-separated string of strategy-doc metric names awaiting instrumentation; rendered as `no data` in each pulse report until instrumentation lands
- `pulse_excluded_metrics` -- comma-separated string of strategy-doc metric names intentionally excluded from the pulse; the metric stays in `STRATEGY.md` but is not surfaced in pulse reports

**Routing:**

- **`pulse_product_name` is unset (or config file missing)** -> First run. Go to Phase 1 (interview), then Phase 2.
- **`pulse_product_name` is set** -> Skip to Phase 2.

If the argument was `setup`, `reconfigure`, or `edit config`, go to Phase 1 regardless of config state.

### Phase 1: First-Run Interview

#### 1.0 Seed from strategy (if available)

Before asking any questions, read `STRATEGY.md` using the native file-read tool. If the file exists, extract:

- The product name from the `name` key in the YAML frontmatter, falling back to the H1 title (stripping the trailing ` Strategy` suffix, e.g., `# Spiral Strategy` -> `Spiral`) if frontmatter is missing
- The list of key metrics from the `## Key metrics` section, one per line

Open the interview by surfacing what was extracted: announce that a strategy doc was found, show the seeded product name and the list of key metrics that will be carried into event/data setup, and invite the user to correct any of it before continuing.

If `STRATEGY.md` does not exist, note that explicitly in chat: no strategy doc on file, running setup from scratch, and mention that `ce-strategy` can seed pulse later if run first.

#### 1.1 Interview

Read `references/interview.md`. This load is non-optional - the pushback rules, anti-pattern examples, and metric-to-source mapping logic live there.

Run the interview in this order:

1. Product name (confirm or edit the seeded value)
2. Primary engagement event
3. Value-realization event
4. Completions or conversions (0-3)
5. Quality scoring (opt-in, AI products only)
6. Data sources - wire up connections for each agreed metric and event. Nudge toward MCP. Reject read-write database access. DB entirely optional.
7. System performance - a short recommended setup for top errors and latency. Users rarely have strong opinions here; present defaults and accept.
8. Default lookback window (24h for daily ops, 7d for weekly review, 1h for launches)

Apply the pushback rules in `references/interview.md` for each section, including the **SMART bar** in "Overall Rules" - push back on anything vague, vanity, or unactionable.

If the user offers read-write database access, refuse and offer the alternatives documented in `references/interview.md` section 6.

Write the captured config to `<repo-root>/.compound-engineering/config.local.yaml` as flat `pulse_*` keys, using the write rules in `references/interview.md` under "Config File Shape". Resolve the repo root with `git rev-parse --show-toplevel`. To write: (1) if the file or directory does not exist, create `.compound-engineering/` and write the YAML file; (2) if the file exists, merge new keys into the existing YAML, preserving any non-pulse keys (e.g., `plan_*`) untouched. If `.compound-engineering/config.local.yaml` is not already covered by the repo's `.gitignore`, offer to add the entry before writing. Show the resulting pulse block to the user in chat and offer one round of edits.

After the config is written, run the **scheduling recommendation** from `references/interview.md` section 9: offer to set up a recurring run so the user gets the pulse on a cadence instead of having to remember to run it. Accept yes or no. If yes, hand off to whichever scheduling primitive the current harness exposes — the in-plugin `schedule` skill if it is installed, otherwise note that scheduling is platform-specific (cron, GitHub Actions, the host's own automation) and emit a brief hint covering what would need to run. Never schedule inline or automatically; any scheduling handoff requires explicit confirmation. Then proceed to Phase 2.

### Phase 2: Run the Pulse

If Phase 1 ran (first run, or `setup`/`reconfigure` argument), re-read `.compound-engineering/config.local.yaml` from the repo root using the native file-read tool to pick up any edits accepted during the Phase 1 review step. Otherwise, use the `pulse_*` values already extracted in Phase 0. Apply hard defaults for any unset settings (see Phase 0 "Config keys").

#### 2.1 Dispatch Queries

Run these in **parallel** (different tools, no shared load):

- Product analytics query (primary event count, value-realization count, completions, conversion ratios) over the window
- Application tracing query (error counts by category, latency distribution, top error signatures) over the window
- Payments query, if configured (new customers, churn, revenue delta) over the window

Run these **serially**, after the parallel batch:

- Read-only database queries. One at a time. Tight, scoped queries only. Never full-table scans on large tables. If a DB query would be expensive, skip it and note "DB query skipped (estimated cost too high)".

#### 2.2 Optional: Sample Quality Scoring

If `pulse_quality_scoring` is `true` (AI products only), sample up to 10 sessions or conversations from the window and score each 1-5 on the dimension recorded in `pulse_quality_dimension`.

**Scoring discipline:** Default to 4 or 5 when the session looks normal. Reserve 1-3 for sessions with a clear failure mode (product gave wrong answer, user got stuck, error surfaced). If every session is scoring 3, the bar is too strict; if every session is scoring 5, the bar is too loose.

Capture a count distribution (e.g., "8x 5, 1x 4, 1x 2") and a short anonymized note on any session scored below 4 - no message content or user identifiers.

#### 2.3 Assemble the Report

Read `references/report-template.md` and fill it in using the query results. Keep the total to 30-40 lines. If a section is thin, leave it thin; do not pad.

#### 2.4 Write the Report

Save to `docs/pulse-reports/YYYY-MM-DD_HH-MM.md` using the local time of the run. Create `docs/pulse-reports/` if it does not exist.

Surface the Headlines and top Followup in chat with the saved file path; the file is the artifact, so do not paste the full report into chat.
