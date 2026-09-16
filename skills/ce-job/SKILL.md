---
name: ce-job
description: "Keep a repo-local job ledger for mixed human and agent work. Use when work needs visible state, decisions, evidence, reviews, guarded autonomy, or live Herdr supervision across more than one turn, branch, worker, or author."
argument-hint: "start|operator|list|status|feedback|test|attach|launch|watch|interrupt|pause|resume|review|prove|done [job path/id] [notes]"
---

# CE Job Ledger

## Outcome

- **Result:** A repo-local job ledger and, when available, an optional live attachment to the agent or pane working on it.
- **Next consumer:** `ce-plan`, `ce-doc-review`, `ce-work`, `ce-code-review`, `ce-commit-push-pr`, another agent, or a human operator uses the ledger to see scope, decisions, evidence, blockers, live state, and the next safe action.
- **Done:** The requested job action has updated or reported the ledger; every claim about readiness or completion is backed by recorded evidence or an explicit blocker; any delegated skill result is linked back to the job.
- **Boundary:** This skill owns job state and orchestration. It may create or edit ledger files, invoke CE skills whose job is explicitly requested, and control a Herdr-attached pane when the user asks. It does not implement product changes, commit, push, open PRs, merge, deploy, or mutate production data on its own.

## Deterministic helper

Resolve this skill's install directory first, then run its bundled helper from that anchor: `SKILL_DIR="<directory containing this SKILL.md>"; "$SKILL_DIR/scripts/ce-job" ...`. Do not run `scripts/ce-job` relative to the user's working directory. The helper provides deterministic `root`, `start`, `list`, `queue`, `status`, `feedback`, `capture`, `test`, `receipt`, `prove`, `pause`, `resume`, `ready`, `done`, `attach`, `live-status`, `heartbeat`, `operator-status`, and `next` operations, including job-root resolution, append-only event logging, section creation, frontmatter updates, proof gates, live sidecar state, and JSON status output. Prefer the helper over hand-editing for those operations. Hand-edit only for rich prose that the helper cannot express yet, and keep the same ledger schema.

## Job root

Resolve the job root before reading or writing a ledger:

1. Resolve the CE artifact root `<root>` by the `ce-setup` Artifact Root rule.
2. Read `job_state_root` from `.compound-engineering/config.local.yaml`, then `config.yaml`; unset means `<root>/jobs`.
3. If set, validate it as a repo-relative directory whose real path stays inside the repo and is neither the repo root nor under `.git/`.
4. Create the directory only when the action writes.

`job_state_visibility` is advisory metadata for setup and summaries: `tracked` means ledgers are expected to be committed when useful; `local` means the path should be gitignored. Missing means `tracked`. Never change `.gitignore` here; route that repair through `ce-setup`.

## Ledger shape

A ledger is a Markdown file with one job per file. Keep it readable in plain text and stable under repeated edits. Helper writes also append JSONL events: tracked ledgers use `<job-root>/.events/<job_id>.jsonl`; local ledgers use `.context/compound-engineering/jobs/<job_id>/events.jsonl`. Treat events as the machine append stream and Markdown as the human view.

Required sections:

```markdown
---
job_id: <safe id>
status: draft | active | blocked | paused | ready-for-work | needs-review | complete
mode: assist | guarded | lane
created: <ISO-8601>
updated: <ISO-8601>
owner: <human, agent, or team if known>
branch: <branch or unknown>
risk: low | medium | high | unknown
---

# <short title>

## Goal

## Scope

## Kickoff

## Decisions

## Plan links

## Work log

## Test requests

## Evidence

## Reviews

## Live control

## Open questions

## Done criteria
```

Preserve user-authored detail. Append dated bullets for new facts instead of rewriting history, except for the frontmatter `status` and `updated` fields and obvious typo fixes. If the file lacks a required section, add it before appending.

## Actions

### `start`

Create a new ledger from the user's goal, or from the current plan/spec when one is named. If a job for the same branch and goal already exists, report it and ask before creating a second ledger.

Set `mode` from the prompt when named:

- `assist`: human and agent may both work; ledger records context and warnings.
- `guarded`: agent may proceed autonomously inside agreed scope, but must record decisions, evidence, blockers, and review receipts before claiming progress.
- `lane`: a strict recipe or pipeline owns the sequence; the ledger records receipts rather than replacing the lane.

When mode is not named, choose `assist` for conversational work, `guarded` for an explicit autonomous implementation request, and `lane` only when the user names a pipeline.

For `guarded`, read `references/guarded-start.md` before creating the final active ledger or starting downstream work. Guarded start aligns first: it gathers bounded repo/job context, drafts a contract, asks only material questions, routes non-trivial work through `ce-plan`, requires the plan's `ce-doc-review` gate before implementation readiness, and records the plan path and review state. Do not mark a guarded job `ready-for-work` while that plan review is missing, failed, or blocked.

### `operator`

Read `references/operator.md` when the user wants one agent to coordinate a job, supervise workers, translate user feedback, or act as the control surface between the user and other agents. The operator keeps the ledger as source of truth, routes specialist work to `ce-plan`, `ce-doc-review`, `ce-work`, `ce-code-review`, or `ce-commit-push-pr`, and uses Herdr only as optional live transport. It records durable state before prompting workers and reports mismatches between live claims and ledger evidence.

### `list` / `status --all`

Read `references/job-index.md` before scanning multiple ledgers. When `scripts/ce-job` is available, use `scripts/ce-job queue --json` for operational buckets or `scripts/ce-job list --json` for the plain index, then enrich its output with any needed prose. Report every non-complete job's mode, status, branch, owner, latest update, open questions, blockers, review state, latest evidence, optional live state, and next safe action. Derive status from ledger sections plus optional Herdr state; never infer completion from a live agent saying it is done.

### `status`

Report one job in a compact form. When `scripts/ce-job` is available, use `scripts/ce-job status <job> --json` as the mechanical source, then add context if needed. Include status, mode, goal, branch, last update, open questions, blockers, latest evidence, review state, live state when attached, and next safe action. Do not claim the implementation is complete unless `done` has verified the done criteria.

### `capture`, `feedback`, and `test`

Read `references/feedback.md` before appending a user note or sending it to a live worker. When `scripts/ce-job` is available, use `scripts/ce-job feedback`, `scripts/ce-job capture`, or `scripts/ce-job test` for the durable append. Record durable state first, then attempt live delivery only when a Herdr attachment exists and live control is available.

- `capture` appends the supplied note to the narrowest matching section.
- `feedback` classifies the note as a decision, requirement, test request, blocker, or work-log note and records it in that section.
- `test` records a test request as an evidence requirement that the next worker must satisfy or block on.

If the target section is unclear, add a short `Work log` bullet and preserve the user's wording.

### `attach`, `launch`, `watch`, `read`, `interrupt`, `pause`, and `resume`

Read `references/herdr-control.md` before any Herdr command or live-agent prompt. These actions are optional live control over a job that already has durable state.

- `attach` binds a job to an existing Herdr agent or pane.
- `launch` starts a worker for the job when the user requested live execution.
- `watch` / `read` report current live output without changing the ledger except for a timestamped observation when useful.
- `interrupt` is a user-requested stop: record the interruption and then send the Herdr interrupt to the explicit target.
- `pause` records a durable paused or blocked state; if attached, it may also tell the worker to stop after its current safe point.
- `resume` reports the next safe action and may prompt the attached worker only after the ledger state has been updated.

If Herdr is unavailable, preserve the durable ledger action and report that live control is unavailable; do not invent a terminal command or switch to a background process.

### `review`

Run `ce-code-review` on the named diff or current branch with the job ledger as intent and scope context. After the review returns, append the report path or receipt, the verdict, and unresolved findings to `Reviews`. If `ce-code-review` cannot run, record the blocker instead of substituting a mental review.

### `prove`

Map each done criterion, plan requirement, explicit user acceptance point, and open test request to recorded evidence. When `scripts/ce-job` is available, run `scripts/ce-job prove <job> --json` and report its Proven, Missing evidence, Blocked, and Out of scope groups. Add the proof note to `Evidence` when it changes the state of the job.

### `done`

A job can close only when each done criterion and test request is either proven by evidence or explicitly marked out of scope by the user. When `scripts/ce-job` is available, use `scripts/ce-job done <job> --message ...`; it fails closed when proof is missing. If evidence is missing, leave `status: blocked`, record what is missing, and report the next action. If complete, set `status: complete`, append the final proof summary, and report the linked artifacts and remaining follow-ups.

## Finding the current job

When the user supplies a path or id, use it. Otherwise prefer an active ledger whose frontmatter branch matches the current git branch. If more than one ledger matches, choose none and ask the user to pick. If none matches, `status`, `capture`, `feedback`, `test`, `prove`, `review`, and `done` report that no current job exists and suggest `start`.

## Delegation contract

When invoking another CE skill for a job, give it the ledger path, goal, scope, mode, open questions, test requests, done criteria, and any live-control limits. The delegated skill remains bound by its own safety rules. When it returns, record only durable results: plan paths, review receipts, changed files, checks, report paths, findings, blockers, and evidence. Do not copy long transcripts into the ledger.
