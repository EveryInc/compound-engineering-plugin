# Pass 1 — headless ce-doc-review invocation + envelope parsing

Pass 1 is the Claude panel (no egress). `ce-deep-review-beta` invokes `ce-doc-review` in headless
mode and parses its structured envelope, then carries the panel findings forward (untagged,
trusted) into the thin-slice draft / reconciled sidecar.

## Invocation

Invoke the `ce-doc-review` skill via the platform's skill-invocation primitive in **headless mode**,
passing the plan path:

- Claude Code: `Skill("ce-doc-review", "mode:headless <plan-path>")`
- Other platforms: the equivalent skill-invocation with the same `mode:headless <plan-path>` args.

Do NOT tell the user to type `/ce-doc-review` — invoke it programmatically. ce-doc-review runs its
own multi-persona panel (several minutes) and returns a text envelope terminated by `Review complete`.

## Envelope shape (what to parse)

The headless envelope uses these top-level sections (any with zero items are omitted):

```
Document review complete (headless mode).

Applied N fixes:
- <section>: <what was changed> (<reviewer>)

Proposed fixes (concrete fix, requires user confirmation):
[P0] Section: <section> — <title> (<reviewer>, confidence <anchor>)
  Why: <why_it_matters>
  Suggested fix: <suggested_fix>

Decisions (requires user judgment):
[P1] Section: <section> — <title> (<reviewer>, confidence <anchor>)
  Why: <why_it_matters>
  Suggested fix: <suggested_fix or "none">

FYI observations (anchor 50, no decision required):
[P3] Section: <section> — <title> (<reviewer>, confidence <anchor>)
  Why: <why_it_matters>

Residual concerns:
- <concern> (<source>)

Deferred questions:
- <question> (<source>)

Review complete
```

## Parsing rules

- **Detect completion** by the terminal `Review complete` line. If it is absent, treat pass 1 as
  failed (see Failure UX).
- Capture each section's items verbatim into a structured set: `applied_fixes[]`, `proposed_fixes[]`,
  `decisions[]`, `fyi[]`, `residual[]`, `deferred[]`. These become the **Claude panel findings** —
  carried into the report untagged (the panel is trusted; only cross-model findings get verified).
- Handle the high-count compact rendering (FYI/residual/deferred collapsed to one-line bullets when
  the combined count is ≥5) — parse the bullets, not per-item `Why`.
- The envelope is prose, not JSON. Match section headers leniently (`.toMatch`-style); do not assume
  exact spacing.

## Failure UX (load-bearing)

ce-doc-review is the no-egress half of the workflow. If pass 1 fails — the invocation errors, times
out, or returns an envelope **without** the `Review complete` terminal line — STOP:

> Pass 1 failed: <reason> — cannot open the consent gate without panel results. Re-invoke, or run
> ce-doc-review directly to diagnose.

**Do not open the consent gate or egress anything** when pass 1 did not complete. The gate exists to
authorize sending plan content to external vendors; with no panel results there is nothing to add
cross-model arms to, and proceeding would egress without the panel's no-egress baseline.
