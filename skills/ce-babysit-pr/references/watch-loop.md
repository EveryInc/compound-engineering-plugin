# Watch loop — scheduling, state, dedup, edge cases

Read this once per babysit session, before acting on the first tick's output. It covers how ticks are scheduled on each harness, what the on-disk state file holds, the claim→act→confirm protocol that keeps ticks idempotent and crash-safe, and the edge cases. SKILL.md states the tick ordering; `references/tick.md` holds the commands.

## How the watch sustains itself

Keep monitoring in the current session until a stop condition is met. The change detector is `pr-snapshot watch`. It runs the snapshot's fetch→diff on an interval, uses **no agent tokens**, and prints one `BABYSIT_WAKE {reason,url,...}` line *only* when there is work to inspect or a stop condition, then exits. Wait for that line with the harness's tools, run one tick, and re-arm the detector. Keep the session active while waiting, so each wake returns to this agent with the conversation's decisions intact.

The tick decides from the fresh snapshot, not from the wake reason. The reason says why the detector fired and which reference owns the follow-up:

| Wake reason | Why the detector fired | Owned by |
|---|---|---|
| `actionable` | An unresolved thread or a failed check on the current head | `references/tick.md` |
| `feedback-candidate` | Non-thread feedback that still needs the resolver's judgment. A resolver pass that silently drops it is a normal classification outcome, not a detector false positive. | `references/tick.md` |
| `branch-currency` | A currency item that needs a claim, inspection, a decision, or reconciliation | `references/branch-currency.md` |
| `unrequested-base-merge` | A base merge on the head that no claimed currency item produced | `references/branch-currency.md` |
| `base-ref-blocked` | Current-base identity is not proven (see **Current-base merge identity** below) | this file |
| `stack-blocked`, `blocked-failing`, `needs-human` | A standing residual | `references/settle.md` |
| `downstack-actionable` | A lower managed-stack layer re-opened | `references/stack.md` |
| `blocked-external`, `blocked-external-drained` | CI is waiting on maintainer approval; `blocked-external-drained` marks the end of the review drain | `references/settle.md` |
| `merge-ready` | The PR stayed quiet through the settle window with a clean merge state | `references/settle.md` |
| `review-evidence-moved` | Readiness-bearing state moved while a widened settle window was running. Re-judge instead of sleeping out a window armed against evidence that has since moved. | `references/settle.md` |
| `terminal`, `max-runtime` | The PR closed or merged, or the invocation budget ran out | `references/settle.md` |
| `stop-signal` | The watcher was told to stop; end the loop and report | this file |
| `invocation-superseded` | A later explicit invocation owns the state | this file |

At the fixed deadline, the final refresh preserves `terminal` and already-settled `merge-ready` stops. Otherwise `max-runtime` outranks every non-terminal work or residual wake, so the cap cannot start another agent round.

Watcher ownership is **latest-valid-watcher-wins**: the newest invocation that completes a valid first snapshot takes over. A newer invocation cancels an older invocation whose first fetch is still in flight, so network completion order cannot hand ownership back to the older one. That reservation does not displace the watcher that is already active. Only a successful first snapshot supersedes the active watcher and terminates it gracefully; a failed preflight leaves the active watcher healthy. Every wake and snapshot carries `watch_generation`. When a wake arrives, compare its generation with a fresh snapshot. A stale wake is discarded and coalesced into that current read. If the generation matches but the attention set (the items the snapshot says still need action) has already cleared, do no work. An `invocation-superseded` wake means a later explicit invocation now owns the state: end the old loop without a tick or a re-arm. A replacement watcher keeps `last_change_at`, `invocation_started_at`, and `invocation_budget_seconds`, so it polls immediately without adding a new settle delay or renewing the budget.

Use the harness's tools to run the detector and wait for its output. A skill drives tool calls; it does not type slash commands the way a user would. The rows below are examples, not a required tool list:

| Harness | Run and wait tools | Durable beyond the session? |
|---------|--------------------|-----------------------------|
| Claude Code (CLI) | background `Bash` + a `Monitor`/wait; or `ScheduleWakeup` under `/loop` | No (session-bound) — cron for durable |
| Grok (CLI/TUI) | background `run_terminal_command` + `get_command_or_subagent_output`; `scheduler_create --durable` for a cross-session schedule | Yes via `scheduler_create --durable` (60s min, 7d) |
| Cursor (CLI) | `Shell` background + `notify_on_output` sentinel (its `/loop` is user-typed, **not** skill-invocable) | No (session-bound) |
| Codex (CLI) | `exec_command` to start the detector, then `write_stdin` to wait on the returned process session | No (session-bound) |

**User-runnable resume syntax.** Whenever this reference tells the skill to print or copy a resume invocation, default to `/ce-babysit-pr <url>` and, when the run posture is not `target`, append the same `posture:stack-ready` or `posture:stack-land` token so checkpoint / durable / session re-entry keeps stack scope. Use `$ce-babysit-pr <url> [posture:…]` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

**Checkpoint:** Use checkpoint mode only when the user requests it or the harness cannot keep the session active while waiting for the detector's output. Run one tick, persist state, report, and print the exact host-rendered resume invocation. Say monitoring is paused. Never fake a loop with a foreground `sleep` or an unmanaged detached process.

**Durability:** the in-session watch dies with the session. Re-invoking the skill resumes from disk, because `/tmp` persists across ticks. For an unattended multi-day watch, escalate to a durable scheduler: Grok's `scheduler_create --durable`, or cron running `<cli> exec '<host-rendered resume invocation>'`. A fresh headless run has no memory of this conversation, so persist consequential decisions to disk.

## Cadence (the watch interval)

- `pr-snapshot watch --interval` is the poll cadence: about 2-3 minutes while the PR is active, widened to about 5-10 minutes when it is quiet. The detector is cheap, but each poll is a `gh` call. Honor GitHub rate-limit reset headers and back off on `403`/`429`; claim→act→confirm makes resuming after a transient API error safe.
- `--settle-seconds` (default 300) is the quiet window before a `merge-ready` wake. Leave it unset on the normal arm; the script's default is the initial policy. The only invocation that sets it is the re-arm after a `merge-ready` wake you judged not ready yet (`references/settle.md`).
- `--feedback-coalesce-seconds` (default 180) is the quiet window before a **comment-only** wake. Leave it unset on the normal arm. Waking on the first comment would spend a full `ce-resolve-pr-feedback` dispatch to conclude "status noise", and would split the ordinary sequence (push -> bots comment -> CI finishes) into two agent rounds. The candidates stay actionable while the window runs, so any other wake handles them in its tick; nothing is dropped, only deferred.
- `--blocked-external-drain-seconds` is set only after an interactive approval-gate wake (`blocked-external`: CI is waiting on a human approval). Keep the active ~150s interval throughout this short 300/900/1800-second review drain: a quiet 5-10 minute poll could consume an entire tier before any signal arrives. The persisted head-scoped review clock decides expiry, not the arm time and not the broader merge-ready quiet clock.
- A push or other mutation moves the head. Re-arm `watch` at the active cadence so it reads the new state.
- Every re-arm presents the same `--invocation-id "$RUN_INVOCATION_ID" --session-started-at "$RUN_STARTED_AT" --invocation-budget-seconds "$RUN_BUDGET_SECONDS"`; the helper rejects a changed token, anchor, or budget. Only the first snapshot uses `--start-invocation`; only a managed-stack layer transition uses `--continue-invocation`.

## Pipeline mode bound (`mode:pipeline`)

An orchestrator (`lfg`) drives ticks in-line and needs the loop to terminate. Run ticks back-to-back until one of the stops below. **To wait for CI to progress between ticks, use the harness's native non-blocking wait — never a bare foreground `sleep`** (blocked on Claude Code, discouraged elsewhere). Examples: Claude Code's `Monitor` until-loop; Grok's `get_command_or_subagent_output(timeout_ms=…)` or a `monitor`; Cursor's `Await` on a backgrounded `gh pr checks --watch`. If the harness has no non-blocking wait, do one tick and return control to the orchestrator rather than busy-spinning. Loop until:

- **Report success only when** `all_checks_ok` is true, the actionable backlog and canonical `needs_human_residuals` set are empty, `mergeability_certain` is true, `merge_state_status == "CLEAN"`, `base_ref_blocker` and `stack_blocker` are null, `branch_currency_blocker` is null, and `unrequested_base_merge` is null. A red check, a human decision, an empty check rollup, uncertain merge/base/stack state, or an open/claimed/parked currency item is not success: keep ticking until it clears or the time budget expires; or
- when the canonical set (the persisted `needs_human_residuals`) is non-empty and no autonomous work remains, return `{ status: "needs-human", checks_terminal, fixes_applied, residuals: needs_human_residuals }` immediately without waiting for human input or the budget; or
- a **budget** is hit. The default is **3 CI fix rounds** per head-lineage and an overall time cap of about 30-45 minutes. When the budget runs out, the still-red checks and any `needs-human` items become residuals.

Never wait on the merge-ready settle window or human review in pipeline mode; those are interactive stops. A check stuck `IN_PROGRESS` past the time cap ends the run with a "CI still running" residual rather than blocking forever.

The round/time budget is a coarse cost limit that catches a runaway. Prefer to stop *because the work is demonstrably not converging*. The next section covers how that is decided.

## Non-convergence (trigger → route → park → re-open)

A loop can churn without finishing. Three shapes: CI **ping-pong** (fix A surfaces B, fix B brings A back, often an emergent trade-off); a review-bot **treadmill** (each commit spawns fresh nits); and **wrong-approach whack-a-mole** (each nit is valid, but the approach, say a regex, is the problem). A raw attempt counter cannot tell these apart from *legitimate progress* (four independent failures, each fixed once). So the decision is agent reasoning over the trajectory, and the split of responsibilities is strict:

- **`pr-snapshot` (babysit) reports facts.** The `trajectory` block is deterministic and coarse. `check_recur_max`/`recurring_checks` count a check that failed, cleared, then failed again on a *new* head; same-head flapping is excluded, so this is not flaky noise. `unresolved_trend` + `new_threads_this_tick` show a growing backlog and fresh threads arriving. `stream_alternations` counts ci↔review bouncing, which is cross-stream churn only babysit can see. `heads_since_progress` counts heads that moved without a new low in open problems. `invariant_rounds` counts resolver-supplied `invariant_key` values per unique head; the script never infers a key from paths, regexes, or comment text. Babysit **never** labels any of this "non-convergence."
- **The leaf judges.** The leaf is the delegated skill for that tick: `ce-debug` for CI, `ce-resolve-pr-feedback` for review. When a trigger is crossed (the thresholds live only in `references/tick.md`), pass the trajectory to that tick's leaf as **mandatory input**, before it may fix, commit, or push. The leaf then does one of two things. It demonstrates progress by naming the invariant its next bounded fix resolves. Or it returns a `needs-human` that **parks the whole stream** (puts it on hold as a standing residual) with a `decision_context`: the tension or root cause, the options, their tradeoffs, and its lean.
- **Invariant keys.** On a **fix** outcome the leaf returns a stable `invariant_key` for each root it fixed, associated with the items that root covered. The leaf does not run `pr-snapshot` and does not mark. Babysit persists each key on its existing dispatched mark (`--thread` / `--comment` plus `--invariant-key`). Unrelated keys stay independently actionable, and one- or two-round progress on a key is not a blocker.

**The anti-cry-wolf line (put it to the leaf):** *progressive failure migration* (A fixed, B appears once, B fixed, done) is ordinary repair; **do not park.** *Oscillation* is non-convergence; park. Oscillation looks like any of these: A returns after B's fix; the failing set cycles; defects migrate X→Y→Z with the same invariant unsatisfied; or fix size grows superlinearly. "We've tried a lot" is never enough.

**A third case the counter must not miss: a *correct* finding recurring across sibling sites.** Sometimes each new head brings a fresh thread that is *valid* and shares one root and one treatment with an already-fixed thread. That is not a wrong-approach cluster and not oscillation. It is one fix with a multi-site blast radius, surfacing one site per head. Fixing it one site per head is as wasteful as parking it is wrong. **Route it, don't decide it here:** pass the recurring feedback cluster **plus** the trajectory to `ce-resolve-pr-feedback` and request a **bounded-class assessment**. The resolver has the diff and makes the call. It decides whether the sites are genuinely equivalent (same invariant, same fix, only behavior this PR touched), enumerates the concrete locations, and fixes the class in one pass. Babysit does **not** infer the root or the sites from the `trajectory`; those are churn counts, not semantic identity. If the resolver judges the sites *not* equivalent, it falls back to per-site fixes. If it judges the shared root a wrong approach, it parks, as above.

**Guards:**

- **Moving-target ≠ non-convergence.** Base-branch merges, dependency bumps, flaky infra, and bot-rule changes create unrelated new failures. Recurrence already excludes same-SHA flapping. Still, do not park a failure the leaf attributes to an external cause rather than the approach.
- **Cross-stream contradiction.** If `ce-debug` concludes the review-requested behavior is invalid while `ce-resolve-pr-feedback` concludes it is required, that is a single **cross-stream** residual. Do not arbitrarily park one side.
- **A parked stream re-opens only through the decision lifetime below.** No stream has its own reopen rule.

## On-disk state contract

State lives at `<scratch-root>/ce-babysit-pr/<host>-<owner>-<repo>-<pr>/state.json`. That path is stable and reusable across invocations, so any later tick (scheduled or hand-run) finds it. The `<host>` segment (from the PR URL; `github.com` on the public host) is required for GitHub Enterprise: without it, two PRs sharing `owner/repo#N` on different hosts would reuse one `state.json` and cross-contaminate dispositions. The `pr-snapshot` script performs all reads and writes under a file lock. Shape:

```json
{
  "pr": { "owner": "...", "repo": "...", "number": 123, "url": "..." },
  "head_sha": "abc123",
  "tick": 7,
  "state_created_at": "<iso8601>",
  "started_at": "<iso8601>",
  "invocation_id": "<opaque invocation token>",
  "invocation_budget_seconds": 28800,
  "last_activity_at": "<iso8601 — activity heartbeat: last watch poll or agent snapshot/mark>",
  "dead_time_seconds": 0,
  "invocation_backstop_seconds": 259200,
  "watch_generation": "<opaque generation>",
  "watch_pid": 12345,
  "watch_process_identity": "<pid-reuse guard>",
  "checks": { "<check_key>": { "name": "...", "status": "COMPLETED", "conclusion": "FAILURE", "head_sha": "abc123" } },
  "threads": { "<thread_id>": { "last_comment_id": "...", "last_comment_at": "<iso8601>", "disposition": "open|dispatched", "acted_identity": ["<comment_id>", "<comment_at>"] } },
  "feedback": { "<comment_or_review_id>": { "kind": "comment|review", "author": "...", "disposition": "open|dispatched", "acted_identity": ["<edit_id>"] } },
  "ci_dispatched": { "<head_sha>": ["<check_key>", "..."] },
  "human_decisions": [{ "id": "decision:<hash>", "residual": "<complete typed residual>", "sources": [{ "kind": "check", "id": "CI/test", "observation": "<frozen source facts>" }] }],
  "answered_human_decisions": [{ "id": "decision:<hash>", "answer": "<exact human response>", "residual": "<complete typed residual>", "sources": ["<same frozen observations>"] }],
  "review_decision": "APPROVED",
  "blocked_external_head_sha": "abc123",
  "blocked_external_first_seen_at": "<iso8601>",
  "blocked_external_review_last_activity_at": "<iso8601>",
  "mergeable": "MERGEABLE",
  "merge_state_status": "CLEAN",
  "base": {
    "host": "github.com",
    "repository": "owner/repo",
    "ref": "main",
    "oid": "live-base-sha",
    "graphql_oid": "graphql-live-base-sha",
    "historical_oid": "historical-pr-base-sha",
    "merge_commit_oid": "generated-test-merge-sha",
    "merge_parent_oids": ["live-base-sha", "head-sha"],
    "identity": "current"
  },
  "base_ref_blocker": null,
  "branch_currency_state": {
    "current_key": "currency:<identity-hash>",
    "head_sha": "abc123",
    "items": { "<currency-key>": { "status": "BEHIND|DIRTY", "disposition": "open|claimed|confirmed", "host_branch_update_capability": true, "recovery_state": "claimed|mutation-observed|ambiguous|retry-authorized|retry-exhausted", "semantic_conflict_fingerprint": "<paths-and-stage-blobs>" } },
    "semantic_parks": { "<fingerprint>": { "head_sha": "abc123", "status": "DIRTY", "route": "normal-base", "observation_key": "<currency-key>" } }
  },
  "pr_chain": {
    "manager_status": "confirmed|absent|probe-error",
    "manager_source": "gh-stack|graphql|null",
    "relationship_status": "dependent|independent|probe-error",
    "target_position": 2,
    "target_needs_rebase": false,
    "upstack_needs_rebase": [],
    "entries": [],
    "parent_prs": [],
    "dependent_prs": []
  },
  "last_change_at": "<iso8601>",
  "last_action": "<short string>",
  "trajectory": {
    "check_history": { "<check_key>": { "state": "failing|clear", "last_head": "abc123", "recur": 0 } },
    "seen_threads": { "<thread_id>": 3 },
    "unresolved_series": [2, 3, 4],
    "stream_series": ["ci", "review", "ci"],
    "min_open_problems": 1,
    "heads_since_progress": 0,
    "invariant_heads": {}
  }
}
```

`human_decisions` is the one durable decision set across review, CI, and branch currency. A current decision is a hard blocker: the PR is *not* merge-ready while it stands. It covers the exact observations frozen in its `sources`; the source records keep only their ordinary open/dispatched/claimed facts. The snapshot emits each unchanged payload in `needs_human_residuals` and pairs it with its `decision_id` in the `human_decisions` view, for rendering and for routing the answer. Any covered observation changing or disappearing invalidates the whole decision and makes the surviving ordinary sources actionable again; remote activity is never inferred to be an answer. `mark --answer-decision <decision_id> --answer-file <path>` is the only answer transition. It moves the exact record to `answered_human_decisions`, preserves the response while matching sources remain actionable, and prevents the unchanged evidence from immediately re-parking. An explicit source `--disposition open` may cancel a covering decision when the agent has separately proved the observation is no longer the question. Never auto-decline, auto-resolve, or wait silently on a decision. Legacy parked records without a complete payload fail open: they do not block, and their sources return to ordinary actionable work.

A `check_key` is `"<workflow>/<name>"` (or `"<name>"` when there is no workflow). It is stable across polls for the same head, which is all the dedup needs. Two snapshot fields are easy to misread. `persisted_state_age_seconds` is how long the resumable PR journal has existed; it never counts toward the invocation budget, which `invocation_elapsed_seconds` measures. `blocked_external_review_moved_this_tick` is true when a review started or changed during an approval-gate wait. It wakes the agent even though the gate itself was already present at arm time, so the agent can choose the longer drain. `references/settle.md` owns the drain clock.

## Claim → act → confirm (the dedup protocol)

This is the rule that makes ticks idempotent *and* crash-safe: **the snapshot never marks an item handled just from observing it.** An item leaves the actionable set only when the agent confirms it acted (via `mark`) or when remote truth removes it. So if a resolve or debug pass crashes, errors, or returns without finishing, the item is still actionable on the next tick. The loop cannot silently drop work.

- **Review threads.** A thread is actionable while it is unresolved and you have not recorded acting on it. After a resolve pass, `mark --thread <id> --disposition dispatched` handles an ordinary unresolved thread; when the leaf returned an `invariant_key`, that same mark carries `--invariant-key`. The shared residual mark freezes its complete source observations without changing their dispositions. A later reviewer comment invalidates any covering decision and reopens every surviving sibling; it does not answer the decision. Every mark carries the active invocation tuple (invocation ID, start anchor, budget), so stale ticks cannot silence work in a newer invocation.
- **Non-thread feedback candidates** (top-level PR comments + review-submission bodies). There is no remote resolve action for these, so every candidate passed to the resolver must either be marked `dispatched` or be covered by one validated current decision. A dispatched candidate stays silent across body edits, because status bots routinely rewrite their comments; an edit to a covered candidate invalidates the decision. A new comment has a new ID and is actionable. Both feedback surfaces count as one review stream for trajectory and backlog accounting.
- **CI checks.** A failing check on the current head is actionable until you `mark --check <key>`. A typed decision enters the same canonical set through the shared residual mark, never through check-specific decision state. A new head clears dispatch state, invalidates check-sourced residuals, and re-evaluates the decision against the new commit.
- **Current-base merge identity.** GitHub's mergeable verdict is usable only when it was computed against the base as it is now. `base.historical_oid` is the PR's historical `baseRefOid`; it may legitimately lag after the base branch advances and never blocks by itself. `base.graphql_oid` is `baseRef.target.oid`, and `base.oid` comes from an independent exact read of the base ref. A mergeable result is current (`base.identity == "current"`) only when those two live-base reads match and `potentialMergeCommit` names that base and the observed head as its two parents. Otherwise the identity is a blocker: `race` when the base moved between reads, `mergeability-pending` when GitHub has not generated the test merge yet, `probe-error` when a read failed or was malformed. A blocker disables `mergeability_certain`, emits no branch-currency item, and wakes `base-ref-blocked`; readiness waits for a fresh observation that proves the binding. One kind of `race` does not clear on its own: when the only mismatch is the test merge's base parent (head and live base agree), GitHub can leave the test merge on the old base indefinitely. After `STALE_MERGE_COMPUTATION_SECONDS` of stability it degrades to `stale-computation`, which no longer blocks; `merge_computation_stale` carries the disclosure. `DIRTY` / `CONFLICTING` is the fallback: GitHub may omit `potentialMergeCommit`, so matching live-base reads make the conflict result usable without a generated merge.
- **Branch currency.** `branch_currency` is the third attention stream. Its identity binds the host-qualified live base repository/ref/OID, the head SHA, the merge status, and the route. "Mergeable against the current base" and "head contains the latest base" are separate questions: only `BEHIND`, `DIRTY`, a branch-protection requirement, or an explicitly selected always-current policy requires maintenance. Ordinary historical base movement with GitHub reporting `CLEAN` does not. A root with open child dependents remains eligible for its own item. A claimed item stays reconciliation-only until it is confirmed or handed to the shared decision step, and a claim or decision never transfers to a moved head or base. A terminal currency result with no safe autonomous continuation becomes a residual whose source is `{ id: <currency_key>, kind: "currency" }`; it uses the shared answer transition above and has no separate answer state. Which statuses emit an item, the claim lifecycle, and the `BEHIND`/`DIRTY` repairs are in `references/branch-currency.md`.

`human_decisions`, `answered_human_decisions`, `ci_dispatched`, the thread and feedback dispositions, and `branch_currency_state` share the locked state journal. There is no second decision ledger and no route-specific crash-recovery record.

## Merge-readiness and the settle window

Do not re-derive "required checks" or required reviews; GitHub already computes them. `references/settle.md` owns the looks-ready gate. The engine facts it reads:

- `UNSTABLE` means mergeable but a non-required check is red; `BLOCKED` means a required gate is unmet. `has_failing_checks` lets you act on a red check even while `merge_state_status` is `UNSTABLE`.
- The script stamps `last_change_at` whenever readiness-bearing state moves: a check status or conclusion, a thread's identity (added, edited, or resolved-away), the head SHA, `review_decision`, `mergeable`, `merge_state_status`, or the current-base identity. The `race` -> `stale-computation` transition is presentation-only and does not stamp it. Each snapshot emits `quiet_seconds` since that stamp, so a reviewer or bot still working shows up as recent activity.
- Quiet is a cooling-off signal, not a guarantee. Whether a review is still coming is the agent's judgment at the settle decision, not a state the engine tracks.

## Concurrency

- **Lock.** The script takes a file lock around each state read and write. The lock cannot cover the agent's own mutations, which happen between script calls, so it is necessary but not sufficient. Treat the snapshot as a hint, never as a guarantee that the world is unchanged at mutation time. A currency mutation revalidates its claimed observation first (`references/branch-currency.md`).

## Managed-stack continuation

`references/stack.md` owns posture, layer transitions, upstack maintenance, and landing. The watch mechanics it relies on: one active PR target and one watcher, never a watcher per stack layer. Initialize each new layer's state dir with `--continue-invocation` and these values:

- `--invocation-id`, `--session-started-at` (the anchor flag, not `--invocation-started-at`), and `--invocation-budget-seconds`, with the same recorded values the first snapshot used.
- `--continue-dead-time-seconds <prior layer's invocation_dead_time_seconds>`.
- On the continue invocation, re-state the same `posture:` token.

 Each layer's state dir accumulates its own dead time, so omitting the carry value would re-count the prior layer's suspended time as active. One fixed budget covers the entire accepted traversal rather than restarting per PR. A just-landed MERGED from this run's `stack-land` land step is a layer transition, not a Terminal exit for the run.

## Edge cases

- **Managed stack:** trunk movement alone is not a reason to restack. The manager's `needsRebase` flag turns on for plain trunk drift, and GitHub already prices that into the target's mergeability against its parent base, so `stack_blocker` is null and the target may be ready whenever GitHub reports a certain `MERGEABLE`/`CLEAN`. `stack_blocker` is `target-needs-rebase` / `managed-freshness-unknown` only when the target is stale or of unknown freshness **and** GitHub does not clear it; that becomes `stack-blocked`. Never use `gh pr update-branch` or a local base merge on a managed target. The pre-push baseline and post-push upstack maintenance are in `references/stack.md`.
- **Manual dependency chain:** keep the requested PR as the target, qualify readiness relative to its parent, and report downstream impact. An eligible emitted `normal-base` item may still be repaired target-locally (`references/branch-currency.md`), but never rebase, rewrite, restack, or otherwise mutate its dependent branches. A target push may make open children stale; that is a residual only.
- **External head change / force-push:** the head SHA moved under the loop. The snapshot clears SHA-scoped CI state automatically; just re-snapshot. Never clobber unrelated pushed work.
- **PR closed or merged externally:** detected as `pr_state != "OPEN"` on any tick, which is a clean exit with a final status. The exception is a just-landed MERGED from this run's authorized `stack-land` land step, which is a layer transition (see Managed-stack continuation above), not a Terminal exit.
- **No push access / fork PR:** a delegated push will fail. Detect that from the delegated skill's result, report it, and stop. The loop cannot make progress it has no permission to make.
- **CI that never completes:** a check stuck `IN_PROGRESS` keeps the loop from settling until the invocation budget ends it (`references/settle.md`, Budget exhausted). Hand back with the measured `invocation_elapsed_seconds` and the `max_runtime_ceiling` that was hit, so the user can tell the active budget from the 3-day backstop.

## Sustaining the watch (Step 5, full text)

**The self-sustaining watch runs autonomously after scope is set.** It never asks permission for the fixes, pushes, replies, resolves, and PR-description refreshes it is allowed to make, and a stack-wide posture does not re-ask at each layer. In interactive continuous mode, re-arm after a tick that reached neither a stop that ends the watch nor a managed-stack transition; a standing residual stays visible and blocks readiness or advancement while the watch continues around it. In `mode:pipeline`, apply the bounded stop above instead: when the canonical decision set is non-empty and no autonomous work remains, return it immediately rather than re-arming.

Re-arm `watch` after any mutation that moved the head, with the same invocation ID, start, and budget. A not-ready-but-not-blocked state is neither a stop nor a question; keep waiting for the background sentinel. Watcher silence carries no PR-state information; it means only that no wake condition has fired. Never infer review state from silence. When the user asks for status before a wake, run a fresh `snapshot` with the same invocation fields and report that state. The loop's only interactive question is Step 1's one-time posture and scope choice, asked once under `target` when a managed stack is confirmed.

In **checkpoint mode** you are done after Step 4; the next tick is the user re-running the skill. Because every tick is resumable from disk, each wake (a `watch` sentinel, a scheduler fire, or a manual re-run) is a clean re-entry into Step 2.
