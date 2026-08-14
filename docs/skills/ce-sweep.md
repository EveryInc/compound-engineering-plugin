# `ce-sweep`

> Sweep configured feedback sources for new items, track each one to a verified merge, and keep one rolling `/lfg`-ready plan.

`ce-sweep` sits **around the loop**. It turns incoming customer feedback into a requirements-only plan. It is not a step in `/ce-ideate` → `/ce-brainstorm` → `/ce-plan` → `/ce-work`. The loop invents or refines work; this skill ingests what customers already sent.

You invoke it yourself (it is not model-invoked). First run is interactive setup. Later runs can be manual or scheduled with `mode:non-interactive`. The output is `docs/plans/feedback-sweep-plan.md`, which `/lfg` can execute. It is not a time-windowed metrics report (`ce-product-pulse`) and not a one-off recording analysis (`ce-riffrec-feedback-analysis`).

```text
customer Slack / GitHub / email
        |
        v
/ce-sweep  -->  docs/plans/feedback-sweep-plan.md  -->  /lfg
        |
        +-- source-side ack / close-out
        +-- verified merge, not a thread claim
```

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Fetches new items since each source's cursor, acknowledges them, analyzes attached recordings, closes an item only after a verified merge to the default branch, and reconciles one rolling plan |
| When to use it | An alpha or beta channel (Slack, GitHub Issues; email is experimental) that outruns ad-hoc triage |
| What it produces | `docs/plans/feedback-sweep-plan.md` (requirements-only), a durable state file, configured source-side acks, a run summary with an `/lfg` handoff |
| What's next | `/lfg docs/plans/feedback-sweep-plan.md` for the open items, or stay in the plan and answer outstanding questions |

---

## Example invocations

Empty follows config. First run is setup, then a sweep. Later empty is a sweep only. `setup` / `reconfigure` re-enter the interview and then sweep.

```text
# No feedback_sources yet: interactive setup (sources, approvals, state location, ack cap), then the first sweep
/ce-sweep

# Configured: fetch, acknowledge, analyze recordings, verify merges, reconcile the plan
/ce-sweep

# Re-enter setup to add or edit sources, then sweep with the new config
/ce-sweep reconfigure
/ce-sweep setup

# Scheduled or unattended: never prompts. Ambiguous product calls go into the plan. Refuses if setup has not run.
/ce-sweep mode:non-interactive

# After a sweep, ship the reconciled open items through the autonomous pipeline
/lfg docs/plans/feedback-sweep-plan.md
```

A scheduled job should register `mode:non-interactive` so the run defers instead of blocking. First-run setup cannot run unattended.

---

## The Problem

Feedback triage tends to become a private ritual: scan Slack since last time, react so the customer knows it was seen, download recordings, guess whether something already shipped, keep a list in someone's head. Every project rebuilds this. "Fixed" claims get trusted without a merge.

## The Solution

`ce-sweep` makes the sweep repeatable.

Sources are declared once in `feedback_sources`. Each run fetches items newer than that source's cursor, acknowledges them at the source (emoji on Slack, label on GitHub Issues; email is tracked in state only), analyzes attached recordings, and closes an item only when a claimed fix has merged to the default branch. Open actionable items land in one rolling plan that `/lfg` can run.

The [configuration reference](./configuration.md) lists the feedback-source and sweep keys that first-run setup writes.

Item lifecycle lives in a durable YAML state file. Runs resume cleanly. A crash does not double-acknowledge a customer's message.

The skill never replies to customers. Its only source-side writes are the ack and close-out actions you approved at setup.

---

## What Makes It Novel

### Durability before the cursor moves

For each new item the order is fixed: acknowledge at the source, confirm the ack is visible, write state, then advance the cursor. A crash in the middle recovers without a second customer-visible action. The bundled state engine is the only writer of that file.

If another sweep holds the lease, this run stops rather than interleaving writes.

### Merge evidence, not thread claims

A message that says "this is fixed" does not close the item. Close-out needs a verified merge to the default branch, recorded with the merge SHA. Unverified claims stay open. An item deleted at the source is marked gone and drains from the plan.

### One rolling plan, not a log

Every run reconciles `docs/plans/feedback-sweep-plan.md`. New items append. Closed items drain. A human-owned notes region is left untouched. If that path exists and is not both `product_contract_source: ce-sweep` and `artifact_readiness: requirements-only` (for example after `/lfg` has enriched it), the sweep archives the file to a dated sibling and writes a fresh view. It does not overwrite someone else's execution state.

Customer quotes in the plan are marked untrusted data. Sensitive sources withhold body and quote from state and from the plan.

### Safe to schedule

`mode:non-interactive` never prompts. Product calls become Outstanding Questions on the plan. If new unacked items on one source exceed the ack cap (default 25), the run defers that batch instead of mass-reacting on a bad cursor. A harness with no blocking-question tool behaves the same way even without the token.

---

## Quick Example

You have a Slack alpha channel and a GitHub issues inbox. You run `/ce-sweep`. No `feedback_sources` key exists, so setup starts.

You add sources one at a time: type, target (Slack channel ID, or `owner/repo`), ack and close-out actions, standing approval for those writes, and whether content is sensitive. Then you pick where state lives (committed under `docs/feedback-sweep/`, or machine-local under `/tmp`), set the ack cap (default 25), and optionally import a legacy tracker so already-seen items are not acked again. Setup offers a schedule. Then the first sweep runs.

A later `/ce-sweep` fetches items newer than each cursor, applies the approved ack, analyzes any recordings in parallel, checks `fix_pending` items against `gh` / git, and rewrites the machine-owned region of the plan. Interactive mode may ask one product question per category. The summary lists new items, recordings, closes with evidence, anything stuck or deferred, and the `/lfg` line for `docs/plans/feedback-sweep-plan.md`.

---

## When to Reach For It

Reach for `ce-sweep` when:

- Customer feedback in Slack or GitHub Issues accumulates faster than ad-hoc triage
- You want items acknowledged quickly and closed only when the fix has actually landed
- You want a schedulable path from "someone reported this" to an executable plan

Skip `ce-sweep` when:

- You are analyzing one recording → `/ce-riffrec-feedback-analysis`
- You want a time-windowed usage and error report → `/ce-product-pulse`
- You are still deciding what to build from a blank slate → `/ce-ideate` or `/ce-brainstorm`

---

## Use as Part of the Workflow

`ce-sweep` feeds the loop. It does not walk it.

```text
/ce-sweep  -->  docs/plans/feedback-sweep-plan.md  -->  /lfg
                         |
                         +--> stay in the plan and answer Outstanding Questions
```

The plan is requirements-only with `product_contract_source: ce-sweep`. `/lfg` is the intended next skill. You can also open the plan and work the items by hand.

`ce-strategy` and `ce-product-pulse` are separate anchors. Pulse reports numbers over a window. Sweep tracks individual feedback items.

---

## Use Standalone

- First run: `/ce-sweep` (no config yet)
- Later run: `/ce-sweep`
- Add or edit sources: `/ce-sweep reconfigure` or `/ce-sweep setup`
- Unattended: `/ce-sweep mode:non-interactive` (setup must already exist)
- Execute the plan: `/lfg docs/plans/feedback-sweep-plan.md`

State location is a setup choice. Committed state is the right default when more than one agent or machine shares the branch. Machine-local state under `/tmp` stays off the repo and is invisible to other checkouts.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | `feedback_sources` unset: interactive setup, then sweep. Otherwise: sweep. |
| `setup` / `reconfigure` | Re-run the interview regardless of config state, then sweep. Combined with `mode:non-interactive` this stops (`first run requires interactive setup`). |
| `mode:non-interactive` | No prompts. Deferred decisions go on the plan. Unconfigured repos stop. Deprecated alias: `mode:headless`. |

Source types: `slack`, `github-issues`, `email` (experimental, read-only, no source-side ack). Slack acks default to the `eyes` reaction and close out with `white_check_mark`. GitHub acks default to the `feedback:ack` label and close out with `feedback:resolved`.

Config keys (interview writes `config.local.yaml`): `feedback_sources`, `sweep_state_path`, `sweep_ack_cap`, `sweep_shared_branch`. `sweep_lease_ttl_minutes` is written at its default of 60 and is not asked. See the [configuration reference](./configuration.md).

Default paths (`docs/` is the artifact root unless `docs_root` is set):

- Plan: `docs/plans/feedback-sweep-plan.md`
- Committed state fallback: `docs/feedback-sweep/state.yml`

On Codex, the handoff is `$lfg` with the same plan path.

---

## FAQ

**Where does state live?**
Your choice at setup: committed to the repo (recommended when several agents or machines share branches) or machine-local under `/tmp`. The schema is a versioned contract in the skill's `references/state-schema.md`.

**Can it reply to customers?**
No. The only source-side writes are the configured acknowledgment and close-out actions, standing-approved at setup. A `no` on approval keeps that source read-only; items land as deferred for you to handle.

**What about prompt injection from feedback content?**
Bodies, titles, quotes, media filenames, and text read back from state are treated as data, never as instructions. The emitted plan marks customer text as untrusted so `/lfg` inherits the same posture.

**What happened to Cora's `alpha-feedback-pulse`?**
`ce-sweep` generalizes it. Setup can import that legacy state file (cursors and item statuses) so migration does not re-ingest or double-acknowledge.

**What if two sweeps run at once?**
A single-writer lease stops the second run. If state is committed on a shared docs branch (`sweep_shared_branch: true`), the lease is also push-gated so two machines cannot ack the same item.

**Does a non-interactive run acknowledge everything?**
Not past the ack cap, and not on a source you left unapproved. Over-cap batches and product calls are deferred into the plan.

---

## See Also

- [`ce-product-pulse`](./ce-product-pulse.md): time-windowed metrics reports, not item-level triage
- [`ce-riffrec-feedback-analysis`](./ce-riffrec-feedback-analysis.md): the recording analyzer this sweep can run per attachment
- [`lfg`](./lfg.md): executes the emitted plan end to end
