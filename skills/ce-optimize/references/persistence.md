# Persistence: the rules, the checkpoints, and resume

Read this before Phase 0 and follow it for the whole run. The body states the invariant and names the six checkpoints; this file carries the rules that implement them, the state root, the checkpoint table, the file layout, the wait record, and the resume procedure.

### Core Rules

1. **Write each experiment result to disk IMMEDIATELY after measurement.** Not after the batch, not after evaluation, IMMEDIATELY. Append the experiment entry to the experiment log file the moment its metrics are known, before evaluating the next experiment. This is the #1 crash-safety rule.

2. **VERIFY every critical write.** After writing the experiment log, read the file back and confirm the entry is present. This catches silent write failures. Do not proceed to the next experiment until verification passes.

3. **Re-read from disk at every phase boundary and before every decision.** Never trust in-memory state across phase transitions, batch boundaries, or after any operation that might have taken significant time. Re-read the experiment log and strategy digest from disk.

4. **One experiment, one log entry.** Append a new experiment entry on its first measurement. Later ladder samples for that same experiment update that entry's metrics and outcome in place so a crash can resume the ladder without losing samples or duplicating the hypothesis. Distinct `comparisons` pairings accumulate on that same entry; in-place updates must not replace a previously persisted distinct pairing. Never rewrite a different experiment's samples or gate values. Outcome, `best`, and `hypothesis_backlog` are also updated in place at batch evaluation (CP-4). Do not rebuild the file from memory.

5. **Per-experiment result markers for crash recovery.** Each experiment writes a `result.yaml` marker in its worktree immediately after measurement. On resume, scan for these markers to recover experiments that were measured but not yet logged.

6. **Write the strategy digest after every batch, before generating new hypotheses.** The agent reads the digest (not its memory) when deciding what to try next.

7. **Never present results to the user without writing them to disk first.** The order is: measure -> write to disk -> verify -> THEN show the user. Not the reverse.

### The State Root

`<state-root>` is the directory that holds the run's ledger. Resolve it once, in Phase 0, by the body's Execution Surface rule: when the harness names a durable state root, `<state-root>` is `<that location>/ce-optimize/<spec-name>/`, placed where that location's own conventions keep working state rather than user-facing documents; otherwise it is `.context/compound-engineering/ce-optimize/<spec-name>/` in the repo checkout, which is gitignored and survives a local resume only on this machine. A run's root is wherever its log already is: never move a ledger mid-run, and a resume that finds the log at one root uses that root even when the other is now available. Give every subagent and worker the resolved path, not the rule.

Examples of what the three capabilities look like on some harnesses. This table is not a tool list; the body's rule decides.

| Harness | Durable state root | Wake after turn end | Detached worker |
|---|---|---|---|
| A coordinator harness with a persistent agent store (for example Cursor Projects' Agent Store) | The store path named in your context | Event subscriptions or a timer subscription that re-invokes the agent | A cloud-agent launch that returns a receipt and lands its work as a pushed branch or a store file |
| Grok (CLI/TUI) | None named; `.context/` | `scheduler_create --durable` | None; `worktree` |
| Claude Code, Codex, Cursor CLI sessions | None named; `.context/` | Whatever scheduling or wake tool the session lists; when it lists none, cron running the resume invocation is the user's escalation | None; `worktree` (or `codex` when the spec says so) |

When the harness shows the user a status surface for this run, write a one-line run status there at CP-4 and at each stop, in addition to the log.

### Mandatory Disk Checkpoints

These are non-negotiable write-then-verify steps. At each checkpoint, the agent MUST write the specified file and then read it back to confirm the write succeeded.

| Checkpoint | File Written | Phase |
|---|---|---|
| CP-0: Spec saved | `spec.yaml` | Phase 0, after user approval |
| CP-1: Baseline recorded | `experiment-log.yaml` (initial with baseline) | Phase 1, after baseline measurement |
| Approval recorded | `experiment-log.yaml` (`approval` section) | Phase 1.7, the moment the user approves |
| CP-2: Hypothesis backlog saved | `experiment-log.yaml` (hypothesis_backlog section) | Phase 2, after hypothesis generation |
| CP-3: Each experiment result | `experiment-log.yaml` (append on first measurement; update that entry on later samples) | Phase 3.3, immediately after each measurement |
| CP-4: Batch summary | `experiment-log.yaml` (outcomes + best + `run_state`) + `strategy-digest.md` | Phase 3.5, after batch evaluation |
| CP-5: Final summary | `experiment-log.yaml` (final state) | Phase 4, at wrap-up |

**Format of a verification step:**
1. Write the file using the native file-write tool
2. Read the file back using the native file-read tool
3. Confirm the expected content is present
4. If verification fails, retry the write. If it fails twice, alert the user.

### File Locations (all under `<state-root>`)

Anything the branch's readers need durably must be exported to a tracked path; the ledger does not travel with the branch from either root.

| File | Purpose | Written When |
|------|---------|-------------|
| `spec.yaml` | Optimization spec (fixed once the Phase 1 approval gate is cleared) | Phase 0 (CP-0) |
| `experiment-log.yaml` | Full history of all experiments, the approval record, and `run_state` | Initialized at CP-1, appended at first CP-3, updated on later samples and at CP-4 |
| `strategy-digest.md` | Compressed learnings for hypothesis generation | Written at CP-4 after each batch |
| `judge-cache.yaml` | Per-run judge results keyed by item content hash, so identical output is scored once (`references/experiment-log-schema.yaml`, JUDGE CACHE) | Phase 3.3, as each judge batch lands |
| `<worktree>/result.yaml` | Per-experiment crash-recovery marker | Immediately after measurement, before CP-3 |

### The Approval Record

The Phase 1 approval is a user decision the log records so that a resume, including an unattended wake, does not re-ask it. Write `approval` the moment the user approves, before Phase 2 starts, with the fields the log schema names: the time, the SHA-256 of the saved `spec.yaml` bytes, and the caps in force (`stopping.*`, `metric.judge.max_total_cost_usd`, `execution.max_concurrent`). The record is valid while the spec digest and every recorded cap match the spec on disk. A record that is absent or no longer matches means the Phase 1 gate is presented again; the answer is a new record.

The baseline and every logged experiment were measured under the spec that was approved, so what changed decides what still stands. When the change leaves how those measurements were produced untouched (a cap, or a holdout or calibration added to a spec that lacked one), the measurements stand and approving the new spec continues the run. When anything that produced them differs (the metric, the measurement command, the scope, the comparison), the measurements no longer describe this spec: while the log holds no hypothesis backlog and no experiments, go back through Phase 1 so the baseline matches the new spec; once it holds either, the spec is fixed for the run, so restore the approved spec or take Fresh start (Phase 0.4). Say which of the two applies when presenting the gate.

### The Wait Record and Ticks

Phase 3 runs as ticks (`references/loop.md`). Between ticks the run may be waiting on work that will finish later: a dispatched experiment or judge batch that returned a receipt instead of a result, or a timer. The body allows a turn to end with such work outstanding only under two conditions, and `run_state` is where the second one is met:

- every outstanding item waits on an event a registered wake will deliver, and
- `run_state.pending_waits` records each item: what is outstanding, how its result will arrive (the observable the wake delivers: a store file, a pushed ref, a host message naming the launch, a timer), the registered wake, and the action to take when it arrives.

Write `run_state` at CP-4 and again whenever a wait is registered or cleared, then verify. `run_state` also carries the two clocks the stopping rules read: `active_seconds` (time spent inside ticks since Phase 3 started, summed across ticks) and `phase3_started_at` (the wall-clock anchor for the backstop), plus the completed `tick` count and `status` (`running`, `waiting`, `blocked`, `final`). `blocked` is for a run that cannot make progress until something outside the loop changes (a dependency approval, a capability that disappeared, an unavailable worker pool): record what it waits for, report it, and stop; never spin on it.

Without a wake capability, a wait that this session cannot hold ends the turn as a checkpoint instead: the ledger is verified on disk, `run_state.status` is `waiting` with the pending waits recorded, you tell the user monitoring is paused, and you print the resume invocation. Never fake a wait with a foreground sleep or an unmanaged detached process.

**User-runnable resume syntax.** When this reference tells you to print or copy a resume invocation, default to `/ce-optimize <state-root>/spec.yaml`. Use `$ce-optimize <state-root>/spec.yaml` only when the active harness is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

### On Resume

A wake, a scheduler fire, or a manual re-run re-enters here. When Phase 0.4 detects an existing run:
1. Read the experiment log from `<state-root>`. It is the ground truth
2. Scan worktree directories for `result.yaml` markers not yet in the log
3. Recover any measured-but-unlogged experiments. The recovered first CP-3 entry copies `opportunity` from the hypothesis backlog as of dispatch; `result.yaml` holds metrics only, so a missing forecast stays unrecorded rather than being reconstructed from the result
4. Collect every `run_state.pending_waits` item whose result has arrived, by the shape recorded for it, and persist each at CP-3. An item whose result has not arrived stays pending; an item whose wake is gone (unregistered, expired, or no longer in the tool list) is re-registered or, when it cannot be, becomes a `blocked` state you report
5. Continue as the SKILL.md body's resume rule directs. Skip the work the log proves finished, and re-enter any gate whose record is absent or no longer matches

---
