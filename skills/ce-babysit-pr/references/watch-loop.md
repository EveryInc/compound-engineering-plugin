# Watch loop — scheduling, state, dedup, edge cases

Read this once per babysit session, before acting on the first tick's output. It explains four things: how ticks are scheduled on each harness, what the on-disk state file contains, the claim→act→confirm protocol that keeps ticks idempotent and crash-safe, and how edge cases are handled. SKILL.md states the tick ordering; this file explains the mechanics behind it.

## How the watch sustains itself

Keep monitoring in the current session until a stop condition is met. Run the deterministic change detector and wait for its output using the harness's tools:

- **`pr-snapshot watch`** is that detector. It runs the same fetch→diff on an interval, uses **no agent tokens**, and prints one `BABYSIT_WAKE {reason,url,...}` line *only* when there is work to inspect or a stop condition, then exits. Work reasons: `actionable` (unresolved threads or failed CI), `feedback-candidate` (non-thread content that still needs the resolver's judgment), and `branch-currency` (an item that needs a claim, semantic inspection, or reconciliation). Stop reasons: `terminal`, `blocked-external`, `blocked-external-drained`, `blocked-failing` (a dispatched check was left terminally red), `base-ref-blocked`, `needs-human`, `merge-ready` after settle, `review-evidence-moved`, `max-runtime`, `stop-signal`, and `invocation-superseded`. A `review-evidence-moved` wake means readiness-bearing state changed while a widened settle window was still running; the agent re-judges instead of sleeping out a window that was armed against evidence that has since moved. A `feedback-candidate` that the resolver silently drops is a normal classification outcome, not a detector false positive.
- At the fixed deadline, the final refresh preserves `terminal` and already-settled `merge-ready` stops; `max-runtime` outranks every non-terminal work/residual wake so the cap cannot start another agent round.
- The agent waits for that line, runs a tick, and re-arms the detector. Keep the session active while waiting so each wake returns to this agent with the conversation's decisions intact.

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

**Durability:** the in-session watch dies with the session. Re-invoking the skill resumes from disk, because `/tmp` persists across ticks. For an unattended multi-day watch, escalate to a durable scheduler: Grok's `scheduler_create --durable`, or cron running `<cli> exec '<host-rendered resume invocation>'`. A fresh headless run has no memory of this conversation, so persist consequential decisions to disk. **Shell env vars do not persist between separate tool calls** on any harness — re-set `SKILL_DIR`/`STATE_DIR` inline in every command.

## Cadence (the watch interval)

- `pr-snapshot watch --interval` is the poll cadence: about 2-3 minutes while the PR is active, widened to about 5-10 minutes when it is quiet. The detector is cheap, but each poll is a `gh` call, so respect rate limits.
- `--settle-seconds` (default 300) is the quiet window before a `merge-ready` wake, so the agent is woken to declare readiness only once the PR has actually cooled off, not on every poll. Leave it unset on the normal arm; the script's default is the initial policy. The only invocation that sets it is the re-arm after a rejected `merge-ready` wake, described in SKILL.md Step 3 (the merge-ready wake protocol).
- `--feedback-coalesce-seconds` (default 180) is the quiet window before a **comment-only** wake. Every non-empty top-level body is a candidate the resolver classifies. Waking on the first one would spend a full `ce-resolve-pr-feedback` dispatch to conclude "status noise", and would split the ordinary sequence (push -> bots comment -> CI finishes) into two agent rounds. The candidates stay actionable while the window runs, so any other wake reason claims the tick and handles them with it; nothing is dropped, only deferred. Leave it unset on the normal arm.
- `--blocked-external-drain-seconds` is set only after an interactive approval-gate wake (`blocked-external`: CI is waiting on a human approval). Keep the active ~150s interval throughout this short 300/900/1800-second review drain: a quiet 5-10 minute poll could consume an entire tier before any signal arrives. The persisted head-scoped review clock decides expiry, not the arm time and not the broader merge-ready quiet clock.
- A push or other mutation moves the head. Re-arm `watch` at the active cadence so it reads the new state.
- Every re-arm presents the same `--invocation-id "$RUN_INVOCATION_ID" --session-started-at "$RUN_STARTED_AT" --invocation-budget-seconds "$RUN_BUDGET_SECONDS"`; the helper rejects a changed token, anchor, or budget. Only the first snapshot uses `--start-invocation`; only a managed-stack layer transition uses `--continue-invocation`.
- Honor GitHub rate-limit reset headers; back off on `403`/`429`.
- After any mutation, re-snapshot at the *start of the next tick*, not mid-tick.

## Pipeline mode bound (`mode:pipeline`)

An orchestrator (`lfg`) drives ticks in-line and needs the loop to terminate. Run ticks back-to-back until one of the stops below. **To wait for CI to progress between ticks, use the harness's native non-blocking wait — never a bare foreground `sleep`** (blocked on Claude Code, discouraged elsewhere). Examples: Claude Code's `Monitor` until-loop; Grok's `get_command_or_subagent_output(timeout_ms=…)` or a `monitor`; Cursor's `Await` on a backgrounded `gh pr checks --watch`. If the harness has no non-blocking wait, do one tick and return control to the orchestrator rather than busy-spinning. Loop until:

- **Report success only when** `all_checks_ok` is true, the actionable backlog and canonical `needs_human_residuals` set are empty, `mergeability_certain` is true, `merge_state_status == "CLEAN"`, `base_ref_blocker` and `stack_blocker` are null, `branch_currency_blocker` is null, and `unrequested_base_merge` is null. A red check, a human decision, an empty check rollup, uncertain merge/base/stack state, or an open/claimed/parked currency item is not success: keep ticking until it clears or the time budget expires; or
- when the canonical set (the persisted `needs_human_residuals`) is non-empty and no autonomous work remains, return `{ status: "needs-human", checks_terminal, fixes_applied, residuals: needs_human_residuals }` immediately without waiting for human input or the budget; or
- a **budget** is hit. The default is **3 CI fix rounds** per head-lineage (the same cap `lfg` has always used) and an overall time cap of about 30-45 minutes. When the budget runs out, the still-red checks and any `needs-human` items become residuals.

Never wait on the merge-ready settle window or human review in pipeline mode; those are interactive stops. A check stuck `IN_PROGRESS` past the time cap ends the run with a "CI still running" residual rather than blocking forever.

The round/time budget above is a coarse cost limit, not a convergence detector. It catches a runaway that never trips the trajectory-driven stop below. Prefer to stop *because the work is demonstrably not converging*, not because a timer expired.

## Non-convergence (trigger → route → park → re-open)

A loop can churn without finishing. Three shapes: CI **ping-pong** (fix A surfaces B, fix B brings A back, often an emergent trade-off); a review-bot **treadmill** (each commit spawns fresh nits); and **wrong-approach whack-a-mole** (each nit is valid, but the approach, say a regex, is the problem). A raw attempt counter cannot tell these apart from *legitimate progress* (four independent failures, each fixed once). So the decision is agent reasoning over the trajectory, and the split of responsibilities is strict:

- **`pr-snapshot` (babysit) reports facts.** The `trajectory` block is deterministic and coarse. Its fields: `check_recur_max`/`recurring_checks` (a check that failed, cleared, then failed again on a *new* head; same-head flapping is excluded, so this is not flaky noise), `unresolved_trend` + `new_threads_this_tick` (backlog growing, fresh threads arriving), `stream_alternations` (ci↔review bouncing, which is cross-stream churn only babysit can see), `heads_since_progress` (heads moved without a new low in open problems), and `invariant_rounds` (resolver-supplied `invariant_key` values counted per unique head; the script never infers a key from paths, regexes, or comment text). Babysit **never** labels this "non-convergence."
- **The leaf judges.** The leaf is the delegated skill for that tick: `ce-debug` for CI, `ce-resolve-pr-feedback` for review. When a trigger is crossed (the thresholds are listed in SKILL.md Step 2 / `references/tick.md`, the single source of truth; do not re-list them here), pass the trajectory into that tick's leaf as **mandatory input**. The leaf must do one of two things. Either it demonstrates progress by naming the invariant the next bounded fix resolves, or it returns a `needs-human` that **parks the whole stream** (puts it on hold as a standing residual) with a `decision_context` (the tension or root cause, options, tradeoffs, and its lean). On a **fix** outcome, the leaf **returns** a stable `invariant_key` for each root it fixed, associated with the items that root covered. The leaf does not run `pr-snapshot` and must not mark. Babysit persists each key at its existing atomic dispatched-mark step (`--thread` / `--comment` plus `--invariant-key`). A pass that would begin a third unique-head round for the same key is itself a trigger: `invariant_rounds[].rounds >= 2`, because a round is recorded only after its fix completes. Route the trajectory **before** another fix/commit/push so the leaf returns one approach-level `needs-human` instead of mutating again. Unrelated keys stay independently actionable. One- and two-round progress is not a blocker.

**The anti-cry-wolf line (put it to the leaf):** *progressive failure migration* (A fixed, B appears once, B fixed, done) is ordinary repair; **do not park.** *Oscillation* is non-convergence; park. Oscillation looks like any of these: A returns after B's fix; the failing set cycles; defects migrate X→Y→Z with the same invariant unsatisfied; or fix size grows superlinearly. "We've tried a lot" is never enough.

**A third case the counter must not miss: a *correct* finding recurring across sibling sites.** Sometimes each new head brings a fresh thread that is *valid* and shares one root and one treatment with an already-fixed thread. That is not a wrong-approach cluster and not oscillation. It is a single fix with a multi-site blast radius, surfacing one site per head. Fixing it one site per head is as wasteful as parking it is wrong. **Route it, don't decide it here:** pass the recurring feedback cluster **plus** the trajectory to `ce-resolve-pr-feedback` and request a **bounded-class assessment**. The resolver has the diff and makes the call. It decides whether the sites are genuinely equivalent (same invariant, same fix, only behavior this PR touched), enumerates the concrete locations, and fixes the class in one pass. Babysit does **not** infer the root or the sites from the `trajectory`; those are churn counts, not semantic identity. If the resolver judges the sites *not* equivalent, it falls back to per-site fixes. If it judges the shared root a wrong approach, it parks, unchanged from above.

**Guards:**

- **Moving-target ≠ non-convergence.** Base-branch merges, dependency bumps, flaky infra, and bot-rule changes create unrelated new failures. Recurrence already excludes same-SHA flapping. Still, do not park a failure the leaf attributes to an external cause rather than the approach.
- **Cross-stream contradiction.** If `ce-debug` concludes the review-requested behavior is invalid while `ce-resolve-pr-feedback` concludes it is required, that is a single **cross-stream** residual. Do not arbitrarily park one side.
- **A current decision is a hard blocker with one lifetime condition.** It makes the PR *not* merge-ready until the shared answer transition consumes it or any frozen source observation changes or disappears. The latter invalidates the whole decision automatically and makes the surviving ordinary sources actionable; it never counts as the human's answer. An explicit source `--disposition open` may cancel a covering decision when the agent has separately proved the observation is no longer the question. No stream has its own reopen rule.

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

`human_decisions` is the one durable decision set across review, CI, and branch currency. Source records keep only their ordinary open/dispatched/claimed facts. A current decision covers the exact observations frozen in its `sources`. The snapshot emits each unchanged payload in `needs_human_residuals` and pairs it with its `decision_id` in the `human_decisions` view, for rendering and for routing the answer. Any covered observation changing or disappearing invalidates the whole decision and makes the surviving ordinary sources actionable again; remote activity is never inferred to be an answer. `mark --answer-decision <decision_id> --answer-file <path>` is the only answer transition. It moves the exact record to `answered_human_decisions`, preserves the response while matching sources remain actionable, and prevents the unchanged evidence from immediately re-parking. Legacy parked records without a complete payload fail open: they do not block, and their sources return to ordinary actionable work.

A `check_key` is `"<workflow>/<name>"` (or `"<name>"` when there is no workflow). It is stable across polls for the same head, which is all the dedup needs (see below). Each `snapshot` emits `changed_this_tick`, `quiet_seconds`, `invocation_id`, `invocation_started_at`, `invocation_elapsed_seconds`, `invocation_budget_seconds`, `invocation_remaining_seconds`, `persisted_state_created_at`, `persisted_state_age_seconds`, `pr_chain`, `stack_blocker`, `blocked_external_first_seen_at`, `blocked_external_review_last_activity_at`, `blocked_external_review_quiet_seconds`, `blocked_external_review_moved_this_tick`, and the derived `trajectory` facts (see **Non-convergence** above). The blocked-external clock is head-scoped and narrower than `quiet_seconds`: external thread, comment, or review movement, or a new head, resets it; check, base, stack, and disposition-only movement does not. An announcement the engine does not fetch (a body reaction, for example) cannot reset it either. So a reviewer that announces itself mid-drain is discovered by the agent at the expiry wake rather than by this clock, and the drain the agent then selects is measured from the last movement the engine did see. `blocked_external_review_moved_this_tick` lets a newly started or changed lifecycle wake through an already-baselined gate so the agent can select the longer tier. The first snapshot starts one fixed invocation; later calls must match its token, anchor, and budget. Persisted-state age describes how long the resumable PR journal has existed and never counts toward the invocation cap. The chain probe is CLI-first: accept `gh stack view --json` only when it contains the target PR, then use the GraphQL fallback. Only a stack-field schema-unavailable response with a successful read-only default-branch lookup degrades to `absent`; auth, transport, rate-limit, malformed, other GraphQL, and failed default-branch probes stay `probe-error`. Ordinary open-PR base/head relationships classify manual dependencies only when no manager is confirmed. The `trajectory` sub-state is deterministic bookkeeping the script maintains; the leaves reason over the emitted facts.

## Claim → act → confirm (the dedup protocol)

This is the rule that makes ticks idempotent *and* crash-safe: **the snapshot never marks an item handled just from observing it.** An item leaves the actionable set only when the agent confirms it acted (via `mark`) or when remote truth removes it. So if a resolve or debug pass crashes, errors, or returns without finishing, the item is still actionable on the next tick. The loop cannot silently drop work.

- **Review threads.** A thread is actionable while it is unresolved and you have not recorded acting on it. After a resolve pass, `mark --thread <id> --disposition dispatched` handles an ordinary unresolved thread; when the leaf returned an `invariant_key`, that same mark carries `--invariant-key`. The shared residual mark freezes its complete source observations without changing their dispositions. A later reviewer comment invalidates any covering decision and reopens every surviving sibling; it does not answer the decision. Every mark carries the active invocation tuple (invocation ID, start anchor, budget), so stale ticks cannot silence work in a newer invocation.
- **Non-thread feedback candidates** (top-level PR comments + review-submission bodies). These appear as `actionable.comments` when feedback has no inline thread. The detector excludes only empty bodies and never classifies content, authors, or posting surfaces; `ce-resolve` makes that judgment. Because there is no remote resolve action for these, every passed candidate must either be marked `dispatched` or be covered by one validated current decision. A dispatched candidate stays silent across body edits, because status bots routinely rewrite comments; an edit to a covered candidate invalidates the decision. A new comment has a new ID and is actionable. Both feedback surfaces remain one review stream for trajectory and backlog accounting.
- **CI checks.** A failing check on the current head is actionable until you `mark --check <key>`. A typed decision enters the same canonical set through the shared residual mark, never through check-specific decision state. A new head clears dispatch state, invalidates check-sourced residuals, and re-evaluates the decision against the new commit.

- **Current-base merge identity.** `base.historical_oid` is the PR's historical `baseRefOid`; it may legitimately differ after the base branch advances and never blocks by itself. `base.graphql_oid` comes from `baseRef.target.oid`. `base.oid` comes from an independent exact ref read on `base.host`: the REST Git-ref endpoint first, then non-interactive `git ls-remote` only when REST returns 404 (authenticated through the `gh` session via `gh auth git-credential`, so it needs no separately configured Git credential helper). A mergeable result is current only when those live-base OIDs match and `potentialMergeCommit` names that base and the observed head as its two parents. Base movement between probes emits `race`; a temporarily absent generated merge emits `mergeability-pending`; failed, deleted, or malformed ref/identity reads emit `probe-error`. Those blocking identities disable `mergeability_certain`, emit no branch-currency item, wake `base-ref-blocked`, and reset the settle clock when readiness-bearing identity or freshness changes. A `race` whose only mismatch is the test merge's base parent (head and live base agree) degrades to `stale-computation` after `STALE_MERGE_COMPUTATION_SECONDS` of stability and no longer blocks; `merge_computation_stale` carries the disclosure. That transition is presentation-only and keeps the existing quiet clock. `DIRTY` / `CONFLICTING` is the fallback: GitHub may omit `potentialMergeCommit`, so matching live-base observations make the conflict result usable without inventing a generated merge.
- **Branch currency.** `branch_currency` is the third attention stream. Its identity binds the host-qualified live base repository/ref/OID, the head SHA, the merge status, and the route. "Mergeable against the current base" and "head contains the latest base" are separate questions: only `BEHIND`, `DIRTY`, a branch-protection requirement, or an explicitly selected always-current policy requires maintenance. Ordinary historical base movement with GitHub reporting `CLEAN` does not. `UNKNOWN` mergeability or any non-null `base_ref_blocker` emits no item. Managed stacks and manager/relationship `probe-error` are excluded. A `normal-base` target may be independent or an eligible target-local manual dependency, and a root with open child dependents remains allowed. Never mutate those dependents.

  A current open item with carried `parked_semantic_fingerprints` must be previewed first. Compute the current fingerprint from the sorted conflicted paths plus stage blob identities, excluding the base OID, and mark `--currency-inspected-fingerprint <fingerprint>`. Unchanged evidence remains parked; changed evidence retires the old park and reopens attention. Before either a host update or a local merge, atomically mark the exact item with `--currency-key <currency_key> --currency-disposition claimed`, plus `--invocation-id "$RUN_INVOCATION_ID" --session-started-at "$RUN_STARTED_AT" --invocation-budget-seconds "$RUN_BUDGET_SECONDS"`. Stale invocation fencing and `max-runtime` take precedence over a new claim or mutation.

  Re-entry into `claimed` is reconciliation-only, never a direct resubmission. Record the observed recovery as `--currency-outcome mutation-observed`, `--currency-outcome proven-no-mutation`, or `--currency-outcome ambiguous`. Continue autonomously only through the recovery the recorded outcome leaves safe: reconcile an observed mutation toward confirmation. Exactly one retry follows only conclusive no-mutation proof and the engine backoff. Ambiguous recovery never retries or resubmits. Confirm the same exact item with `--currency-disposition confirmed`. Every terminal currency result with no safe autonomous continuation includes one complete `--residual-file` in that same locked mark with source `{ id: <currency_key>, kind: "currency" }`. Answers use the shared decision-ID transition above; branch currency has no separate answer state. Never transfer a claim or decision to a moved head/base observation.

`human_decisions`, `answered_human_decisions`, `ci_dispatched`, the thread and feedback dispositions, and `branch_currency_state` share the locked state journal. There is no second decision ledger and no route-specific crash-recovery record. An unmarked review or CI item stays actionable. A current decision covers its exact observations. A claimed currency item stays reconciliation-only until it is explicitly confirmed or handed to the shared decision step.

## Merge-readiness and the settle window

Do not re-derive "required checks" or required reviews; GitHub already computes them. For GitHub's part of readiness, use `mergeability_certain`, `mergeable == "MERGEABLE"`, and `merge_state_status == "CLEAN"` once the merge computation is bound to the current base and head. Then require the chain and branch currency to be clear. A managed target is ready only when `stack_blocker == null`. The snapshot derives that field: it defers to GitHub's certain `MERGEABLE`/`CLEAN` read for plain trunk drift and emits a blocker only for a stale-or-unknown target that GitHub does not clear. Any current `base_ref_blocker` or `branch_currency_blocker` blocks ready until fresh remote evidence clears it. A manual dependency can be ready relative to its parent but is not independently landable while that parent remains open. `UNSTABLE` means mergeable but a non-required check is red; `BLOCKED` means a required gate is unmet. The snapshot also emits `has_failing_checks` so you can act on a red check even while `merge_state_status` is `UNSTABLE`.

The settle window guards against the most damaging false positive: "CI went green, told the user to merge, then feedback landed."

- The script stamps `last_change_at` whenever readiness-bearing state moves: a check status or conclusion, a thread's identity (added, edited, or resolved-away), the head SHA, `review_decision`, `mergeable`, or `merge_state_status`. The bounded `race` -> `stale-computation` presentation transition is excluded. Each snapshot emits `quiet_seconds`.
- "Looks ready" requires `quiet_seconds >= 300` (default) on top of a CLEAN mergeable state and zero actionable backlog (threads **and** non-thread feedback). A reviewer or bot still working shows up as recent activity, which resets `quiet_seconds`.
- Whether a review is still coming is the agent's judgment at the settle decision, not a state the engine tracks. `references/settle.md` defines that judgment; the engine only reports that the PR went quiet.
- **It is a cooling-off signal, not a guarantee.** Five quiet minutes is evidence the PR stopped moving, not proof no review is coming. Report "looks ready — your call," never "safe to merge"; a stalled lifecycle uses the stronger cautious-ready disclosure and resume path from SKILL.md.

## Concurrency

- **Lock.** The script takes a file lock around each state read and write. The lock cannot cover the agent's own mutations, which happen between script calls, so it is necessary but not sufficient.
- **Pre-mutation claim and revalidation.** Before a `BEHIND`/`DIRTY` external mutation, claim the exact item, then immediately prove its observed head and base OIDs are still current. A moved head or base invalidates the stale action. Treat the snapshot as a hint, never as a guarantee that the world is unchanged at mutation time.
- **Interrupted local merge.** On re-entry, inspect the checkout and the remote before acting. Reconcile an interrupted merge to the already-validated commit or abort it safely; never begin another merge over unknown local state.

## Managed-stack continuation

Sequential babysitting (moving up the stack one PR at a time) is available only while a fresh probe positively reports `manager_status == "confirmed"` for the active PR and the run posture is `stack-ready` or `stack-land`. Under `target` it becomes available after the one-time offer is accepted, which selects `stack-ready`. It uses one active PR target and one watcher, never a watcher per stack layer.

On an authorized transition to the next layer: stop the old watcher; re-read `gh stack view --json`; require the next PR to be the manager's immediate open entry and either non-draft or explicitly included by the user; check out that branch; and initialize its own state directory with `--continue-invocation` plus the same recorded values on the same flags the first snapshot used: `--invocation-id`, `--session-started-at` (the anchor flag, not `--invocation-started-at`), and `--invocation-budget-seconds`. Also pass **`--continue-dead-time-seconds <prior layer's `invocation_dead_time_seconds`>`** so the shared active-time budget carries the suspended time already excluded on earlier layers, **and re-state the same `posture:`**. One fixed budget covers the entire accepted traversal rather than restarting per PR. Each layer's state dir accumulates its own dead time, so omitting the carry value would re-count the prior layer's excluded suspend time as active.

The transition condition under `stack-ready` is quiescence, not settle. Quiescence means zero actionable backlog, no standing residual (needs-human, blocked-failing, stack-blocked, or an open/claimed currency item), and no delegate in flight. Landing under `stack-land` still requires the full settled gate. Arm the active watcher with `--downstack-pr <N>` for every open lower layer, so a lower layer that gains a new thread, comment, failing check, or head wakes `downstack-actionable`. Also recheck downstack quiescence at transitions, immediately before a mutation, and at readiness. On either signal, return to the lowest re-opened layer rather than writing to both concurrently. Loss of manager confirmation ends continuation.

Under `stack-land`, after settle the caller-owned land step merges the bottom-most open settled PR and then syncs before continuing; the recipes are in `references/stack-commands.md`. A just-landed MERGED outcome is a layer transition, not a Terminal exit for the run.

The one-time semantic-scope offer (under `target`), the posture table, and the draft/human boundaries are stated inline in SKILL.md, because they are routing decisions rather than detector mechanics. A manual dependency chain never enters this continuation path; it remains target-local even when its base/head relationships have the same shape.

## Edge cases

- **Managed stack:** trunk movement alone is not a reason to restack. The manager's `needsRebase` flag turns on for plain trunk drift, and GitHub already prices that into the target's mergeability against its parent base, so `stack_blocker` is null and the target may be ready whenever GitHub reports a certain `MERGEABLE`/`CLEAN`. `stack_blocker` is `target-needs-rebase` / `managed-freshness-unknown` only when the target is stale or of unknown freshness **and** GitHub does not clear it; that becomes `stack-blocked`. Never use `gh pr update-branch` or a local base merge on a managed target.

  Before a delegate may push the target, record the manager-ordered open branches at or above the target and each one's remote-tracking OID (see SKILL.md pre-push baseline). If the worktree is not clean or manager membership cannot be confirmed, stop without delegating. Do not stop for missing atomic multi-ref proof (`github/gh-stack#216`).

  After an authorized target push: retain the pushed SHA; re-confirm that local `gh stack view --json` still owns the target/current branch; require a clean worktree; fetch the target branch; and verify its local and remote-tracking heads remain at the pushed SHA. Select the first open dependent immediately above the target, then run `gh stack rebase "<first-dependent-branch>" --upstack --no-trunk --remote <tracking-remote>` followed by `gh stack push --remote <tracking-remote>` only; never use a raw force push. If there is no dependent, skip the cascade. Quote the branch name. Starting at the dependent excludes the target from the rebase; verify the target local head is still unchanged before pushing. The rebase confines the cascade to inter-branch propagation.

  After push success or rejection, re-probe the target against the pushed SHA and every **open dependent** in the baseline against its recorded OID and expected tip. Do not treat the target's intentional post-push OID change as divergence. Treat partial dependent updates as observed progress, and name the first rejected or divergent dependent layer in a recoverable residual. Prefer all-or-none when the installed manager proves atomic push, but never assume it. This manager-owned continuation is implicit in babysitting a managed layer. On a rebase conflict, run `gh stack rebase --abort` and leave a `needs-human`/upstack residual. On target movement or lease rejection, leave the residual and never retry with raw force. If local CLI membership cannot be re-confirmed, do not import or guess at the stack. Never claim stack readiness until manager order, ancestry, review, and CI are re-proven on every current head.
- **Manual dependency chain:** keep the requested PR as the target, qualify readiness relative to its parent, and report downstream impact. An eligible emitted `normal-base` item may be repaired target-locally, but never rebase, rewrite, restack, or otherwise mutate its dependent branches. A root with open child dependents remains eligible; a target push may make those children stale, which is a residual only.
- **Normal-base `BEHIND`:** require `host_branch_update_capability == true`; denied/`false` or `unknown` becomes `needs-human`, and that capability is never treated as Git push or direct push authority. Claim the exact item and revalidate its observed head and base OIDs. Invoke the host update operation once through GitHub's `PUT /repos/{owner}/{repo}/pulls/{number}/update-branch` endpoint with `expected_head_sha` set to the claimed observation's head SHA; never use an update helper that cannot transmit that precondition. Treat an HTTP 422 head mismatch as a stale claim: re-snapshot and reconcile without resubmitting. Host acceptance or a `mutation-observed` outcome is not completion. Confirm only after a fresh snapshot plus ancestry evidence proves the resulting head contains the observed base OID and the currency gate is clear. Remote head movement alone is not proof.
- **Normal-base `DIRTY`:** `host_branch_update_capability` is irrelevant and does not apply. Separately prove ordinary direct push authority to the exact head ref without mutating; unknown or denied proof parks the item. Require a verified clean PR-head checkout at the observed head, fetch the exact observed base OID, and perform a non-mutating merge preview against it. Fingerprint the sorted conflicted paths and stage blob identities, explicitly excluding the base OID. If `parked_semantic_fingerprints` is present, record `--currency-inspected-fingerprint` before any claim: an unchanged fingerprint remains parked, while changed evidence retires the old park and reopens the item.

  A resolution is mechanical only when positive intent evidence leaves no reasonable alternative behavior. Two plausible resolutions, a material intent change, stale/unauthorized/incomplete evidence, or unbounded work requires a safe abort and the shared typed currency residual above; pass `--semantic-conflict-fingerprint <fingerprint>` with its residual mark and include options, tradeoffs, and a lean. For a mechanical case, claim and revalidate, merge the exact observed base, and mark `--currency-outcome mutation-observed` when the local merge starts. Resolve only the previewed conflict, validate proportionally, and use a normal push. Never rebase or force-push. Confirm only after the remote head equals or contains the validated merge commit and a fresh snapshot clears the gate; remote head movement alone is not confirmation. An interrupted local merge must reconcile or abort safely.
- **Manager/relationship probe error:** continue the review and CI streams, but perform no branch-currency mutation and do not declare ready until classification succeeds.
- **External head change / force-push:** the head SHA moved under the loop. The snapshot clears SHA-scoped CI state automatically; just re-snapshot. Never clobber unrelated pushed work.
- **PR closed or merged externally:** detected as `pr_state != "OPEN"` on any tick, which is a clean exit with a final status. The exception is a just-landed MERGED from this run's authorized `stack-land` land step, which is a layer transition (see Managed-stack continuation above), not a Terminal exit.
- **needs-human decision:** persist the complete returned residual once through the shared mark, show it immediately, and leave every covered review thread open. Keep handling independent streams. In interactive continuous mode the decision remains a standing residual that blocks merge-ready and stack advancement without ending the watch; in `mode:pipeline`, return the canonical set as soon as no autonomous work remains. Never auto-decline, auto-resolve, or wait silently on the decision.
- **No push access / fork PR:** a delegated push will fail. Detect that from the delegated skill's result, report it, and stop. The loop cannot make progress it has no permission to make.
- **CI that never completes:** a check stuck `IN_PROGRESS` for a long time will keep the loop from settling. The invocation budget is reached at either the 8h **active** cap (`invocation_elapsed_seconds`, which excludes suspended time) or the 3-calendar-day **wall-clock backstop** (`invocation_wall_elapsed_seconds`). When it is, hand back with the measured `invocation_elapsed_seconds` and the `max_runtime_ceiling` that was hit. Never substitute the age of persisted PR state, and never automatically start another budget.
- **Rate limits / transient API errors:** honor the reset time, back off, resume. The claim→confirm protocol protects against replay.

## Sustaining the watch (Step 5, full text)

**The self-sustaining watch runs autonomously after scope is set.** It never asks permission for the fixes, pushes, replies, resolves, and PR-description refreshes it is allowed to make, and a stack-wide posture does not re-ask at each layer. In interactive continuous mode, re-arm after a tick that reached neither a true stop nor a managed-stack transition; a standing residual stays visible and blocks readiness or advancement while the watch continues around it. In `mode:pipeline`, apply the bounded stop above instead: when the canonical decision set is non-empty and no autonomous work remains, return it immediately rather than re-arming.

Re-arm `watch` after any mutation that moved the head, with the same invocation ID, start, and budget. A not-ready-but-not-blocked state is neither a stop nor a question; keep waiting for the background sentinel. Watcher silence carries no PR-state information; it means only that no wake condition has fired. Never infer review state from silence. When the user asks for status before a wake, run a fresh `snapshot` with the same invocation fields and report that state. The loop's only interactive question is Step 1's one-time posture and scope choice, asked once under `target` when a managed stack is confirmed.

In **checkpoint mode** you are done after Step 4; the next tick is the user re-running the skill. Because every tick is resumable from disk, each wake (a `watch` sentinel, a scheduler fire, or a manual re-run) is a clean re-entry into Step 2.
