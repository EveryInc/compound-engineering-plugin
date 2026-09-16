# Job operator

Use this reference when the user wants one agent to coordinate a job while humans, specialist CE skills, or live workers do the actual work.

## Role

The operator is the user's control surface for the job. It owns state, routing, feedback, evidence checks, and status updates. It does not become the implementation worker unless the user explicitly asks for inline implementation.

The operator keeps the ledger as source of truth:

1. Read or create the job ledger.
2. Update durable state before sending prompts to workers.
3. Route specialist work to the right CE skill.
4. Watch live workers only when Herdr is attached and available.
5. Reconcile worker claims against ledger evidence before reporting progress.
6. Ask the user only for decisions that change scope, risk, design, or verification.

## Startup loop

On first contact:

1. Resolve the job with `scripts/ce-job status <job> --json`, or create one with `scripts/ce-job start` if the user asked to begin a new job.
2. If multiple jobs could match, list candidates and ask the user to pick.
3. Summarize:
   - goal
   - status and mode
   - current branch
   - open questions
   - latest evidence
   - review state
   - next safe action
4. If status is `draft`, `blocked`, or `paused`, do not launch workers until the blocker or pause reason is resolved.
5. If mode is `guarded` and no reviewed plan is linked for non-trivial work, route to guarded kickoff and `ce-plan` first.

## User feedback loop

When the user gives feedback, classify it before acting:

- scope change or requirement -> append to `Scope` via `scripts/ce-job feedback --kind requirement`
- decision -> append to `Decisions` via `--kind decision`
- requested verification -> append with `scripts/ce-job test`
- blocker -> append with `--kind blocker`
- general note -> append with `--kind work-log`

Only after the durable append may the operator send the same content to a live worker. If no worker is attached, report that the ledger is updated and name the next worker handoff.

## Worker routing

Pick the smallest specialist that can advance the job:

- planning or alignment needed -> `ce-plan job:<ledger> ...`
- plan quality review needed -> `ce-doc-review job:<ledger> <plan>`
- implementation needed -> `ce-work job:<ledger> <plan-or-brief>`
- code review needed -> `ce-code-review job:<ledger> ...`
- shipping requested after evidence and review -> `ce-commit-push-pr`, with the ledger as context

Do not route implementation to `ce-job`. Do not route code review to a generic mental review when `ce-code-review` is available. If a skill cannot be invoked in the host, record the blocker and give the exact recovery command.

## Live worker control

Herdr is optional live transport. Use it only after reading `herdr-control.md` and only when a job ledger exists.

The operator may:

- attach a ledger to a Herdr target
- launch a worker for an agreed handoff
- watch/read output
- send user feedback after first recording it in the ledger
- interrupt a named target when the user asks
- pause or resume after the ledger reflects that state

Never treat live output as durable evidence by itself. Convert useful claims into ledger evidence only when they cite files, checks, screenshots, reports, commits, or other verifiable artifacts.

## Status reports

Keep status concise and operational. Prefer this shape:

```text
Job: <id>
State: <status>, <mode>
Now: <what is happening or why idle>
Evidence: <latest useful proof or missing proof>
Review: <latest receipt or pending gate>
Next: <one safe action>
Needs you: <only material question, or none>
```

If the user asks "what's going on?", run `scripts/ce-job status <job> --json`, then optionally read attached live state. Report mismatches explicitly, such as "worker says done, but ledger still lacks test evidence."

## Completion gate

Before closing:

1. Run or emulate `ce-job prove` against the ledger: map done criteria and test requests to evidence.
2. Ensure plan review and code review receipts are present or explicitly skipped by the user.
3. Ensure no open blocker or material question remains.
4. Use `scripts/ce-job done <job> --message ...` only when the evidence supports closure.

If anything is missing, leave the job open and report the exact missing evidence or decision.
