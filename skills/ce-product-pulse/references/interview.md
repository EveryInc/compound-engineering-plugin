# Product Pulse First-Run Interview

Loaded by `SKILL.md` at the start of Phase 1. Captures the configuration that will be merged into `.compound-engineering/config.local.yaml` (the unified CE local config, gitignored, machine-local) as `pulse_*` keys and re-read on every subsequent run.

For each section: ask the opening question, evaluate the answer against the quality bar, push back when it falls into a named anti-pattern, and capture the final answer in the user's own language.

## Overall Rules

1. **Push back, but don't spiral.** One round of pushback per section max. If the second answer still isn't usable, capture what the user gave and move on.
2. **Name events in the user's own words.** The config will be readable by the whole team - use the terms they actually use, not a generic template.
3. **Ask about tools, not credentials.** The interview captures *which* tool and *what shape of query*. It does not collect API keys, tokens, or database passwords. Those stay in the user's environment.
4. **Honor strategy seeds.** If `SKILL.md` Phase 1.0 surfaced a product name or a list of key metrics from `STRATEGY.md`, start with those as defaults and let the user edit. Do not re-ask questions that the strategy doc already answered unambiguously.
5. **Evaluate metrics against the SMART bar.** Every event, metric, and signal the user proposes should be:
   - **Specific** - a named event or a named metric, not a category. `message_sent` passes; "engagement" does not.
   - **Measurable** - you can point to the tool and query that returns a number. "Users like it" does not pass; "NPS score from Delighted" does.
   - **Actionable** - if the number moves, the team knows what to do next. "Daily active users" alone usually fails this - pair it with a conversion or retention signal that surfaces a decision.
   - **Relevant** - ties to the product's target problem and persona (from the strategy doc if seeded). Generic funnel metrics that don't connect to the strategy are suspect.
   - **Timely** - reads in the pulse window (24h, 7d, etc.) and reflects the current state. Lagging metrics that only move quarterly don't belong in a daily pulse.

   When a metric fails one of these, push back by naming the specific dimension in plain English. Do not use the word "SMART" with the user.

---

## 1. Product Name

Ask whether to keep or edit the seeded strategy name, or - if there was no seed - what the product is called. Capture verbatim.

---

## 2. Primary Engagement Event

**Opening question:** "When someone is using your product, what single event fires? The one that tells you a user is active right now."

This is the heartbeat of the pulse. Pick one event - the one that represents a user actually using the product, not opening a page.

**Engagement vs value test.** After the user names an event, ask yourself: does this event fire when the user is *using* the product, or when the user has *gotten value* from it? Engagement is earlier (they're in it). Value is later (it worked). If the candidate is really value-realization, push back and point out that the value event belongs in section 3. Common slips: `agent_accepted_draft` (value) vs `agent_received_draft` (engagement); `ride_completed` (value) vs `ride_started` (engagement); `question_answered_correctly` (value) vs `question_asked` (engagement).

**Anti-patterns and pushback:**

- **Page view or visit** ("pageview", "app opened", "login") -> those say someone showed up, not that they used the product. Ask what fires when a user is doing the thing the product is for.
- **Multiple events with no clear primary** -> ask for the one closest to "a user is active using the core product". Tie-break toward the event where the user spends time in exchange for value (for async products, usually "contributed content" over "opened app").
- **Too deep in the funnel** ("purchase_completed") -> that is a conversion event, captured in section 4. Ask what happens earlier, while they are using the product.
- **Vague** ("interaction", "activity") -> ask for the literal event name in their analytics tool, so the query is repeatable.

---

## 3. Value-Realization Event

**Opening question:** "What event fires when a user actually gets value - when the product delivered what they came for?"

Different from engagement. Engagement says "they're using it"; value-realization says "they got what they wanted." Some products have a clear distinction (engagement: `typed_in_box`; value: `got_useful_answer`); for others it's the same event (engagement: `ride_requested`; value: `ride_completed`). Value-realization is often felt rather than fired, so the proxy test below matters more here than in any other section.

**Anti-patterns and pushback:**

- **Same as engagement event, accidentally** -> that's allowed; confirm it, or ask whether a later signal says "this user got the thing they came for".
- **Revenue event** ("purchase") -> conversion, captured in section 4. Value-realization is the moment a user knows the product worked, usually before or separate from payment.
- **Value is a feeling, not an event** ("they feel like the team aligned", "they trust the output") -> a feeling can't be measured directly in the pulse, so ask for a correlated proxy event. Common patterns: a completion event (workflow finished), a time-to-first-X metric (seconds from open to output), a short-window return rate (came back the next day), or a copy/share/export event (took the output into their actual work). Pick the one closest to the feeling.
- **Can't name one** -> ask whether a session or workflow *completion* stands in ("they finished the task they opened the product to do"). If not, treat engagement as the value proxy and note it in the config.

---

## 4. Completion or Conversion Events

**Opening question:** "Any conversion or completion events worth tracking - signups, upgrades, trial starts, purchases?"

Optional section. 0-3 events is typical. Each conversion event should tie to a decision: if `trial_started` moves ±20%, what would the team do? If the answer is "nothing", the event is a vanity metric and shouldn't be in the pulse.

**Anti-patterns and pushback:**

- **Long list** ("we have 12 of them") -> keep the top 3 that move the business; the rest can be queried ad-hoc.
- **Non-actionable conversion** ("email_opens", "logo_impressions") -> ask what the team would do if that number swung. If the answer is "nothing", ask for a tighter signal further down the funnel.

---

## 5. Quality Scoring (optional, AI products)

**Opening question:** "Is this an AI product where a conversation or session could be rated for quality? If yes, I'll sample up to 10 sessions per run and score each 1-5 on a dimension you define. Say no if this isn't applicable."

If the user opts in, ask: "What dimension should sessions be scored on? (e.g., 'got to a useful answer', 'response was accurate', 'no hallucinations')."

**Pushback:**

- **Vague dimension** ("quality", "goodness", "helpful") -> ask which axis specifically. The dimension should be something a human could look at a transcript and judge consistently.
- **Multiple dimensions** ("accurate AND actionable") -> start with one; more dimensions can be added by editing the config later, and one keeps scores comparable across runs.
- **Reviewability test** - after the user names a dimension, check silently: could two separate reviewers look at the same session and agree on the score? If no, push back once and ask what makes a session a 5 versus a 3. If they can name the distinction in one sentence, fold that sentence into `pulse_quality_dimension` so the calibration travels with the dimension.

---

## 6. Data Sources

**Opening framing:** "Now we wire up the connections needed to actually report on the events and metrics you've named. The goal is the smallest set of sources that covers everything above - one source can be enough. Let's walk through each metric."

### 6.0 Build the metric-to-source list

Compile the full list of signals that need a source:

- The primary engagement event (section 2)
- The value-realization event (section 3), if different from engagement
- Each completion/conversion event (section 4)
- Each key metric carried from the strategy doc, if strategy was seeded

For each entry, ask one question: "Where does `{{event or metric}}` live? Name the tool (e.g. Mixpanel, PostHog, Amplitude, Stripe, internal DB) and how the agent would query it."

The answer produces (tool name, query shape). If multiple entries land in the same tool, consolidate them into one source entry.

**Persist per-strategy-metric source mapping.** For each strategy metric whose source differs from the default (`pulse_analytics_source` for analytics-class metrics, `pulse_payments_source` for revenue/payments-class metrics, etc.), record the override in `pulse_metric_sources` as a `metric=source` pair. Example: if `pulse_analytics_source` is `posthog` but `nps` is captured in Delighted, write `pulse_metric_sources: "nps=delighted"`. Strategy metrics whose source matches the class default do not need an entry. Without this mapping, multi-source setups silently lose the per-metric routing between runs.

**Dual-source arbitration.** If a single signal could be answered from two different sources (e.g., both PostHog and a read-only DB replica have the search events), ask which is the source of truth, and record that one as canonical in the config. The pulse queries one source per signal so numbers stay consistent across runs. The other tool may still be used for ad-hoc investigation but is not wired into the pulse.

**If the user says "we don't have that instrumented yet"** (common for strategy-seeded metrics like retention or NPS): offer two off-ramps and let them pick.

- **Defer** - append the metric name to `pulse_pending_metrics` (CSV). The metric renders as `no data` in each pulse report until instrumentation lands. Right call when the metric matters and the team will instrument it.
- **Drop from pulse** - append the metric name to `pulse_excluded_metrics` (CSV). The metric stays in `STRATEGY.md` but the pulse skips it entirely. Right call when the metric is aspirational and won't have data any time soon.

Do not silently skip. Every un-instrumented strategy metric must land in exactly one of `pulse_pending_metrics` (visible as `no data`) or `pulse_excluded_metrics` (omitted from the report).

### 6.1 MCP nudge

For each named source, check the MCP registry (`search_mcp_registry`) rather than guessing from memory, and ask whether an existing MCP is already connected. Record `mcp` or `manual` per source; for `manual`, note what shape of query the agent should use (CLI, API, etc.). Do not set up MCP connections inside this interview - that's a separate flow.

### 6.2 Database access (optional, read-only only)

Ask explicitly: "Do you have a read-only database connection you'd like the agent to use for any signals that live in the DB? Read-only only - I will refuse a read-write connection."

**Handling the answer:**

- **"No" or "skip"** -> capture `pulse_db_enabled: false` and move on. DB is entirely optional; many products report the pulse from analytics and tracing alone.
- **"Yes, read-only"** (read replica, read-only user, row-level-security enforced) -> capture connection shape and which tables are available. Ask about cost: "For pulse queries, scans need to be cheap - what indexed columns are available, and are there any tables to avoid?"
- **"Yes, but it's my prod credential"** or any indication the connection has write access -> refuse: "For safety the pulse will not query a database with write access, even read-only in intent. The options are: (a) set up a read-only replica or a read-only user, (b) skip the DB entirely - analytics usually covers the pulse. Which do you want?" Do not proceed until the user picks (a) with verified read-only scope or (b) skip. Do not capture a read-write connection under any framing.

### 6.3 Consolidated source list

When every signal has a source (or is marked "covered by analytics above"), summarize the source list back to the user and ask whether any signal they care about is missing a source. Capture the final list in the config. A minimum of one source is acceptable.

If sources clearly outnumber the signals they cover, ask whether one tool could cover most of it - more sources means more auth, latency, and failure modes on every run.

---

## 7. System Performance

Default setup, which most teams accept: top 5 error signatures from the tracing tool by count descending (each with a one-line explanation), plus p50/p95/p99 latency over the window compared to the prior equal-length window. Ask one question - keep the default or customize - and record any override (e.g. "top 3 instead of 5", "skip latency", "always surface this signature").

If no tracing tool was named in section 6, ask which tool they use for tracing and errors (e.g., Datadog, Sentry, Honeycomb, New Relic). Record it as `pulse_tracing_source`. If they have none, leave that key unset and omit the system performance section from reports; the pulse reports usage and followups instead.

---

## 8. Default Lookback Window

Ask for the default window to use when none is specified: 24h for daily ops, 7d for weekly review, 1h for launches.

---

## 9. Scheduling Recommendation

After the config is written and shown to the user, make a scheduling offer: pulses are most useful on a cadence, since the value compounds through the saved-reports timeline. Ask once whether they want a recurring run - daily (time they pick), weekly (day + time), or not now.

If they say yes, hand the cadence to the harness's scheduling primitive (the `schedule` skill where present, otherwise a platform-native option like cron) and let it own the recurring job. Do not schedule inline. If they decline, move on without a nag; the skill does not require a schedule to function.

---

## Config File Shape

Write the captured answers as flat `pulse_*` keys (names, types, and defaults: `SKILL.md` Phase 0 "Config keys") into `<repo-root>/.compound-engineering/config.local.yaml`. Resolve the repo root with `git rev-parse --show-toplevel`.

- If the file or directory does not exist, create both. If the file exists, merge the `pulse_*` keys in and leave every non-`pulse_*` key (e.g. `plan_*`) untouched.
- Quote string and comma-separated values; omit any key with no answer rather than writing an empty value.
- For `pulse_value_event`, write the event name, or the sentinel `same-as-engagement` or `not-defined` when there is no distinct value event.
- If `.compound-engineering/config.local.yaml` is not already covered by `.gitignore`, offer to add the entry before writing.

Connection details (URLs, API keys, query specifics) are never written here - they live with the user's MCP configuration.

After writing, surface the resulting `pulse_*` block to the user in chat. Offer one round of edits. Then return to SKILL.md Phase 2.
