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

`ce-product-pulse` queries the product's data sources for a given time window and produces a compact, single-page report covering usage, performance, errors, and followups. The report is saved to `<root>/pulse-reports/` and the key points are surfaced in chat.

**Done:** a report of 30-40 lines exists at `<root>/pulse-reports/YYYY-MM-DD_HH-MM.md`, its headlines and top followup are in chat, and Phase 3 has been reached.

## Boundaries

- **Read-only, everywhere.** The skill does not mutate the product, the database, or any external system. Its only writes are pulse settings appended to `.compound-engineering/config.local.yaml` (interview and opt-out writes stay on the local override) and the report file. MCP and other data-source tools are invoked read-only; if a tool offers write modes, do not use them. A database source must be a read-only connection — the interview refuses read-write credentials, and DB access is optional, since many products complete the pulse with analytics and tracing alone.
- **No PII in saved reports.** No user emails, account IDs, or message content in the file written to disk.
- **Read it like a founder.** No hardcoded thresholds, no default "good"/"bad" labels, no alerting: present the numbers and let the reader judge.
- **Single page.** Target 30-40 lines. If a section is thin, leave it thin; if the report is getting long, cut.
- **Not a shipping log or a dashboard replacement.** Shipped work lives in the issue tracker and commit history. Deep investigation still uses the native tools; this consolidates a single-page read, and every run is saved so past pulses browse as a timeline.

## Interaction Method

Default to the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to numbered options on the host's user-visible chat surface only when no such tool is in the list or a real question call errors. Never silently skip the question.

Ask one question at a time. Reserve multi-select for first-run configuration only.

## Lookback Window

The **lookback window** is the time range this skill was invoked with (e.g. `24h`, `7d`) — present in the current prompt or conversation, whether the user gave it directly or a calling skill passed it. Common forms are trailing hours (`24h`, `48h`, `72h`), trailing days (`7d`, `30d`), and `1h` for launches.

If the argument is empty, default to `pulse_lookback_default` from config (resolved in Phase 0); if that is also unset, fall through to the hard default of `24h`. If the argument is unparseable, ask the user to clarify.

Apply a **15-minute trailing buffer** to the window's upper bound. Many analytics and tracing tools have ingestion lag; querying right up to `now` under-reports the most recent events. For a `24h` window, query `[now - 24h - 15m, now - 15m]`.

## Artifact Root

This skill writes pulse reports under `<root>/pulse-reports/`. Resolve `<root>` when you first compose a `<root>/` path (per the block below), never before you need it. A write to `<root>/...` and a read of `<root>/solutions/` both count as composing a `<root>/` path, so either one triggers resolution; only a run that touches no `<root>/` path at all -- a scratch-only or no-repo flow -- skips it.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Phase 0: Route by config state

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

Resolve `<repo-root>` with `git rev-parse --show-toplevel`, then apply the ordinary-key rule above to the `pulse_*` keys. Read `references/config.md` whenever a `pulse_*` value has to be interpreted — it is the key schema and nothing else: each key, its allowed values, and its default, with an unset or invalid value taking the documented default rather than being guessed.

**Routing:** every run passes through Phase 2 and then Phase 3. Run Phase 1 first when `pulse_product_name` is unset after cascade, when the repo root cannot be resolved, or when the argument was `setup`, `reconfigure`, or `edit config`. Otherwise start at Phase 2.

## Phase 1: First-run interview

Read `references/setup.md` first — a non-optional load. It owns the strategy-doc seeding, the interview order and its pushback bar, the read-write database refusal, how the config is written to `config.local.yaml` without disturbing other keys, and the one-time scheduling offer. The questions themselves come from `references/interview.md`, which that file names as its own required read.

## Phase 2: Run the pulse

If Phase 1 ran, re-apply the ordinary-key rule (local then tracked) from the repo root using the native file-read tool before any query, to pick up edits accepted during the Phase 1 review step. Otherwise use the `pulse_*` values already extracted in Phase 0, applying the defaults in `references/config.md` for anything unset.

Then read `references/run.md` before dispatching any query — a non-optional load. It owns which queries run in parallel and which run serially, the `pulse_db_enabled` gate on database work, the optional quality sampling and its scoring discipline, the four report sections, and where the report is written.

## Phase 3: Scheduling

Setup offers a recurring run once (`references/setup.md`). On later runs, re-surface it lightly: if the argument was a schedule keyword (`daily`, `hourly`, `weekly`), say this run is ad-hoc and point at the harness's scheduling primitive; if no schedule is on file and this is the third or later run, mention once that scheduling is available. Do not nag on every run, and never schedule automatically — any handoff to a scheduling primitive requires explicit confirmation.
