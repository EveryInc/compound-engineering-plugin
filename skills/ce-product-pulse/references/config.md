# Pulse configuration and first-run setup

Required read on a first run, a `setup`/`reconfigure`/`edit config` run, or whenever a `pulse_*` value has to be interpreted.

## Config keys

- `pulse_product_name` -- string, used in report titles. Required for routing: if unset, skill is unconfigured.
- `pulse_lookback_default` -- one of `1h`, `24h`, `7d`, `30d` (default: `24h`)
- `pulse_primary_event` -- string, the engagement event name
- `pulse_value_event` -- string, the value-realization event name
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

## Seed from strategy (if available)

Before asking any questions, read `STRATEGY.md` using the native file-read tool. If the file exists, extract:

- The product name from the `name` key in the YAML frontmatter, falling back to the H1 title (stripping the trailing ` Strategy` suffix, e.g., `# Spiral Strategy` -> `Spiral`) if frontmatter is missing
- The list of key metrics from the `## Key metrics` section, one per line

Open the interview by surfacing what was extracted: announce that a strategy doc was found, show the seeded product name and the list of key metrics that will be carried into event/data setup, and invite the user to correct any of it before continuing.

If `STRATEGY.md` does not exist, note that explicitly in chat: no strategy doc on file, running setup from scratch, and mention that `ce-strategy` can seed pulse later if run first.

## Interview

Read `references/interview.md`. This load is non-optional - the pushback rules, anti-pattern examples, and metric-to-source mapping logic live there.

Run the interview in this order:

1. Product name (confirm or edit the seeded value)
2. Primary engagement event
3. Value-realization event
4. Completions or conversions (0-3)
5. Quality scoring (opt-in, AI products only)
6. Data sources - wire up connections for each agreed metric and event. Nudge toward MCP. Reject read-write database access. DB entirely optional.
7. System performance - a short recommended setup for top errors and latency. Users rarely have strong opinions here; present defaults and accept.
8. Default lookback window

Apply the pushback rules in `references/interview.md` for each section. Treat every metric, event, and signal the user proposes against the **SMART bar** (specific, measurable, actionable, relevant, timely) spelled out in `references/interview.md` under "Overall Rules" - push back on anything vague, vanity, or unactionable.

If the user offers read-write database access, refuse and offer the alternatives documented in `references/interview.md` section 6.

## Writing the config

Write the captured config to `<repo-root>/.compound-engineering/config.local.yaml` as flat `pulse_*` keys, using the schema in `references/interview.md` under "Config file shape". Resolve the repo root with `git rev-parse --show-toplevel`. To write: (1) if the file or directory does not exist, create `.compound-engineering/` and write the YAML file; (2) if the file exists, merge new keys into the existing YAML, preserving any non-pulse keys (e.g., `plan_*`) untouched. If `.compound-engineering/config.local.yaml` is not already covered by the repo's `.gitignore`, offer to add the entry before writing. Show the resulting pulse block to the user in chat and offer one round of edits.

## Scheduling

After the config is written, run the **scheduling recommendation** from `references/interview.md` section 9: offer to set up a recurring run so the user gets the pulse on a cadence instead of having to remember to run it. Accept yes/no/later. If yes, hand off to whichever scheduling primitive the current harness exposes — the in-plugin `schedule` skill if it is installed, otherwise note that scheduling is platform-specific (cron, GitHub Actions, the host's own automation) and emit a brief hint covering what would need to run. Do not schedule inline.

On later runs, re-surface scheduling lightly rather than repeating setup:

- If the argument was a known schedule keyword (`daily`, `hourly`, `weekly`), note that this run is ad-hoc and suggest scheduling via the harness's available primitive (the in-plugin `schedule` skill where present; otherwise a platform-native option) for recurring runs.
- If no schedule is on file and this is the third or later pulse run the user has done, mention once that scheduling is available. Don't nag on every run.
