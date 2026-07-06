# `/ce-sweep` — Recurring Feedback Sweep

| | |
|---|---|
| **Purpose** | Sweep configured feedback sources for new items, track each item's lifecycle to verified resolution, and emit an `/lfg`-ready plan |
| **Inputs** | `feedback_sources` config (set up on first run); optional `setup`/`reconfigure` and `mode:headless` tokens |
| **Outputs** | A rolling requirements-only unified plan (`docs/plans/feedback-sweep-plan.md`), a durable state file, source-side acknowledgments, a run summary |
| **Invocation** | Manual (`/ce-sweep`) or scheduled (`/ce-sweep mode:headless`); never model-invoked |
| **Position** | Around the loop — feeds `/lfg` and `ce-plan` from customer feedback |

## Problem

Feedback triage tends to become a bespoke, per-repo ritual: scan a Slack channel since last time, react to show it was seen, download and watch screen recordings, figure out whether something already got fixed, and keep a private list of what's still open. Every project rebuilds this by hand, the state lives in someone's head or a one-off file, and "fixed" claims get trusted without evidence.

## Solution

`ce-sweep` makes the sweep a repeatable skill. Sources are declared once in a shared `feedback_sources` config. Each run fetches items newer than a per-source cursor, acknowledges them at the source (emoji reaction on Slack, label on GitHub Issues), analyzes attached recordings in parallel subagents, verifies claimed fixes are actually merged to the main branch before closing anything out, and reconciles one rolling plan of open actionable items that `/lfg` can execute directly.

Every item's lifecycle lives in a durable YAML state file with a versioned schema, so runs resume cleanly, peer agents can share the state, and a crashed run never double-acknowledges a customer's message.

## What Makes It Novel

1. **Connectors are persona files over a code-pinned core.** Each source type is one markdown persona describing how that source maps onto the lifecycle; the correctness-critical steps (cursor advance, no-double-ack guard, merge-evidence check) are pinned in a deterministic bundled script. Adding a source type is one new persona plus a config entry.
2. **Per-item durability ordering.** Acknowledge at source → confirm it's readable → write state → advance the cursor last. A crash at any point recovers without duplicate customer-visible actions.
3. **Fix verification trusts only merge evidence.** Thread claims never close an item — only a verified merge to the default branch does, recorded with the merge SHA.
4. **The plan is a view, not a log.** One rolling plan at a stable path is reconciled every run: new items append, verified-fixed items drain, and a human-owned notes region survives untouched. If `/lfg` has enriched the plan in place, the sweep archives it and starts a fresh view rather than clobbering execution state.
5. **Headless-safe by contract.** `mode:headless` never prompts: ambiguous product calls defer into the plan's outstanding questions, and an acknowledgment volume circuit-breaker defers rather than mass-reacting when a cursor looks wrong.

## Quick Example

```
/ce-sweep                    # first run: interactive setup (sources, approvals, state location, schedule offer)
/ce-sweep                    # subsequent runs: sweep, acknowledge, analyze, verify, reconcile plan
/ce-sweep mode:headless      # scheduled/unattended run — defers decisions into the plan
/ce-sweep reconfigure        # re-enter setup to add or edit sources
```

After a sweep: `/lfg docs/plans/feedback-sweep-plan.md` ships the open items.

## When to Reach For It

- You run an alpha/beta channel (Slack, GitHub Issues) where customer feedback accumulates faster than ad-hoc triage keeps up.
- You want feedback acknowledged quickly and closed out only when the fix has really landed.
- You want a standing, schedulable pipeline from "customer said something" to "an executable plan exists."

Not for one-off analysis of a single recording (`/ce-riffrec-feedback-analysis`) or time-windowed metrics reporting (`/ce-product-pulse`).

## FAQ

**Where does state live?** Your choice at setup: committed to the repo (recommended when multiple agents or machines share branches) or machine-local under `/tmp`. The schema is documented in the skill's `references/state-schema.md` and is a versioned contract peer agents can read and write.

**Can it reply to customers?** No — by design. Its only source-side writes are the configured acknowledgment and close-out actions, standing-approved at setup.

**What about prompt injection from feedback content?** All source content — messages, issue bodies, transcripts, recording content — is treated as data, never instructions, and the emitted plan structurally marks customer text as untrusted so downstream consumers inherit the same posture.

**What happened to Cora's `alpha-feedback-pulse`?** `ce-sweep` generalizes it. Setup imports its legacy state file (cursors and item statuses), so migration causes no re-ingestion and no duplicate acknowledgments.

## See Also

- [`/ce-product-pulse`](./ce-product-pulse.md) — time-windowed metrics reports; the structural sibling
- [`/ce-riffrec-feedback-analysis`](./ce-riffrec-feedback-analysis.md) — the recording analyzer ce-sweep bundles
- [`/lfg`](./lfg.md) — executes the emitted plan end-to-end
