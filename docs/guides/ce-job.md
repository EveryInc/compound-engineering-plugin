# ce-job

`ce-job` creates and maintains a repo-local job ledger for work that crosses turns, agents, or authors. It is the control-plane wrapper around the normal CE loop, not a replacement for the loop.

Use it when a change needs visible state: scope, decisions, evidence, review receipts, blockers, live agent state, and the next safe action. Humans and agents can both update the same file while `ce-plan`, `ce-work`, `ce-code-review`, and `ce-doc-review` keep owning their specialist phases.

## What it writes

By default, job ledgers live under `docs/jobs/` and follow `docs_root` if your repo moves CE artifacts. You can set `job_state_root` to another repo-relative directory. A ledger is one Markdown file with stable sections for goal, scope, kickoff context, decisions, plan links, work log, test requests, evidence, reviews, live control, open questions, and done criteria.

## Deterministic helper

The skill ships a small helper at `skills/ce-job/scripts/ce-job` so common operations are real commands, not only prompt instructions. Agents should use it for file mechanics when available, and humans can run it directly from a checkout:

```bash
skills/ce-job/scripts/ce-job start --id stripe-refund-audit --mode guarded --goal "Add a Stripe refund audit trail"
skills/ce-job/scripts/ce-job list --json
skills/ce-job/scripts/ce-job status stripe-refund-audit --json
skills/ce-job/scripts/ce-job feedback stripe-refund-audit --kind decision --message "Use the existing refund detail page."
skills/ce-job/scripts/ce-job test stripe-refund-audit --message "Create a refund and attach admin evidence."
skills/ce-job/scripts/ce-job pause stripe-refund-audit --message "Waiting on product decision."
skills/ce-job/scripts/ce-job resume stripe-refund-audit --message "Decision recorded; continue."
skills/ce-job/scripts/ce-job done stripe-refund-audit --message "All criteria proven."
```

The helper resolves `docs_root`, honors `job_state_root`, validates paths stay inside the repo, creates missing required sections, updates `status` and `updated`, appends dated bullets, writes append-only JSONL events, and can emit JSON for dashboards or future TUI work. Tracked ledgers keep events under `<job-root>/.events/`; local ledgers keep them under `.context/compound-engineering/jobs/<job_id>/events.jsonl`.

Factory-oriented commands include:

```bash
skills/ce-job/scripts/ce-job receipt refund-audit plan --status passed --artifact docs/plans/refund-audit.md
skills/ce-job/scripts/ce-job receipt refund-audit code-review --status passed --artifact docs/reviews/refund-audit.md
skills/ce-job/scripts/ce-job prove refund-audit --json
skills/ce-job/scripts/ce-job queue --json
skills/ce-job/scripts/ce-job operator-status refund-audit --json
skills/ce-job/scripts/ce-job next refund-audit --json
skills/ce-job/scripts/ce-job attach refund-audit agent:refund-worker --target-type herdr-agent
skills/ce-job/scripts/ce-job live-status refund-audit --json
```

`done` is gated: it fails when proof is missing instead of simply setting `status: complete`.

## Modes

- `assist`: shared notes and warnings while a human and agent work together.
- `guarded`: an agent can proceed inside agreed scope, but must record decisions, evidence, blockers, and review receipts before claiming progress.
- `lane`: a strict recipe or pipeline owns the sequence; the ledger records receipts.

## Guarded kickoff

`guarded` mode starts with alignment, not implementation.

A guarded start gathers bounded repo context, drafts a job contract, asks only material questions, and routes non-trivial work through `ce-plan`. The resulting plan runs through `ce-doc-review` before the job becomes ready for implementation. The ledger records the plan path, review state, open decisions, and launch blocker if review could not run.

Example:

```text
/ce-job start guarded: add Stripe refund audit trail
```

Then implementation can start from the reviewed plan:

```text
/ce-work job:docs/jobs/stripe-refund-audit.md docs/plans/stripe-refund-audit-plan.md
```

In Codex, use `$ce-job` and `$ce-work` instead of slash invocations.

## Workstream visibility

Use `list` or `status --all` to see active jobs:

```text
/ce-job list
/ce-job status --all
```

The report shows status, mode, branch, owner, open questions, blockers, review state, latest evidence, optional Herdr live state, and next safe action. A live agent saying it is done never makes the job complete by itself; `done` still requires evidence.

## Feedback and test requests

Feedback writes to the ledger before any live prompt is sent:

```text
/ce-job feedback docs/jobs/stripe-refund-audit.md "Do not add a new admin page; use the existing refund detail page."
/ce-job test docs/jobs/stripe-refund-audit.md "Start the dev server, create a refund, verify the audit row in admin, and attach a screenshot."
```

A test request stays open until `prove` maps it to evidence or the user marks it out of scope.

## Operator mode

Use `operator` when you want one agent to be the user-facing coordinator while other agents or CE skills do the specialist work:

```text
/ce-job operator docs/jobs/stripe-refund-audit.md
```

The operator reads the ledger, reports the current state, records user feedback before forwarding it, routes work to `ce-plan`, `ce-doc-review`, `ce-work`, or `ce-code-review`, and checks worker claims against evidence before calling the job done. If Herdr is attached, the operator can watch, prompt, pause, resume, or interrupt the named worker. The ledger still remains the source of truth.

## Optional Herdr control

When running inside Herdr, `ce-job` can attach to or launch a live worker and then read, watch, prompt, pause, resume, or interrupt it:

```text
/ce-job attach docs/jobs/stripe-refund-audit.md agent:refund-worker
/ce-job watch docs/jobs/stripe-refund-audit.md
/ce-job interrupt docs/jobs/stripe-refund-audit.md
```

Herdr is optional. Outside `HERDR_ENV=1`, the ledger still works and live actions report that control is unavailable.

## Closing a job

Use `prove` before `done`:

```text
/ce-job prove docs/jobs/stripe-refund-audit.md
/ce-job done docs/jobs/stripe-refund-audit.md
```

`done` closes only when each done criterion and open test request is backed by evidence or explicitly marked out of scope.

## Factory seed, not pipeline

`ce-job` can coordinate several workstreams, but it is not a Builders replacement or a mandatory lane. Builders-style systems center the pipeline; `ce-job` centers shared state. A job may be advanced by a human, a CE skill, a Herdr worker, or a strict external lane, as long as decisions, receipts, evidence, and blockers return to the ledger.

Use `queue --json` for portfolio views, typed `receipt` commands for skill outputs, `prove`/`done` for gates, and Herdr sidecars for live process state. The event log makes helper updates append-only and easier for agents to merge; the Markdown ledger stays the readable source for humans.

## Chain position

`ce-job` sits around the normal loop:

- Start a ledger before `ce-plan`, `ce-work`, or a human coding session when state must survive handoff.
- Use guarded kickoff to align and review the plan before autonomous work begins.
- Capture decisions, feedback, test requests, and evidence while work proceeds.
- Use `review` to run `ce-code-review` with the job as scope context and attach the receipt.
- Use `prove` or `done` before shipping claims.

It does not commit, push, or open PRs. Use `ce-commit-push-pr` for that tail.
