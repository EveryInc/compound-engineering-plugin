# Herdr control

Use this reference before any `ce-job` action reads or controls a Herdr pane or agent.

## Boundary

Herdr is optional live transport. The job ledger remains the durable source of truth. If Herdr is unavailable, stale, or blocked, keep the ledger action and report live control as unavailable or blocked.

Before any Herdr command, verify the current agent is running inside Herdr:

```bash
test "${HERDR_ENV:-}" = 1
```

If this fails, do not run Herdr commands. Record or report the durable job state only.

## Targeting

Use explicit live agent names or pane IDs recorded for this job, or supplied by the user for this action. Never rely on another client's focused pane or omitted Herdr targets.

Discover live state from Herdr JSON responses:

```bash
herdr agent list
herdr agent get <agent-or-pane-id>
herdr pane get <pane-id>
```

A live target may be `idle`, `done`, `working`, `blocked`, or `unknown`. `idle` and `done` mean ready for input; `blocked` means inspect before sending input; `unknown` is not success.

## Local binding state

Store session-scoped Herdr attachments in the CE scratch root by default, such as `.context/compound-engineering/jobs/<job_id>.json`, with job id, pane id, agent name, workspace id, attached_at, and last_seen. Do not commit this sidecar. In a tracked ledger, mention only that a local live binding exists or was last seen; do not treat pane IDs as durable team truth.

If `job_state_visibility: local`, the ledger may carry pane IDs because the ledger itself is local. Still rediscover state before control; pane IDs can go stale when panes move or sessions restart.

## Reading and watching

For a coding agent target, prefer:

```bash
herdr agent read <target> --source recent-unwrapped --lines 120
herdr agent wait <target> --timeout 120000
```

Use `pane read` / `pane wait-output` for ordinary commands, servers, or test panes. Reads do not prove completion and do not mark a job done.

## Prompting

Send feedback or test requests through the agent surface only after the ledger update is written:

```bash
herdr agent prompt <target> "Read <ledger path>; act on the latest Feedback/Test request entry and update the ledger with evidence or blockers." --wait --timeout 120000
```

If `agent prompt` reports `agent_blocked`, stalled, or timed out, inspect `agent get` and `agent read` before deciding what to do. Do not blindly resend.

## Launching

`launch` creates topology only when the user asked for a live worker. Default to a sibling pane in the current tab and the current working directory. Preserve user focus with `--no-focus`. Start the requested or default agent kind in the new pane, then record the local binding.

Do not create a worktree, new workspace, remote machine, or server pane unless the user asked for that topology or the job contract requires it.

## Interrupt and pause

`interrupt` is explicit user control. Record the interruption in the ledger, then send a validated Herdr key to the explicit target:

```bash
herdr agent send-keys <target> ctrl+c
```

`pause` records durable paused/blocker state. If a live target is ready for input, tell it to stop after a safe point and update the ledger. If it is working or blocked, report that state and avoid adding more input unless the user explicitly asks to interrupt.

## Servers and test panes

A test request may need a dev server or command pane. Use pane commands for ordinary processes, not agent commands. Record the pane id and observed readiness as evidence only when the output proves it, such as a ready URL or successful health check. A running server is not evidence that the product behavior works; the requested observation or screenshot still needs to be recorded.
