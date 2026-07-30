# `ce-babysit-pr`

> Watch an open PR and keep it moving toward merge. React to review feedback, CI, and base-branch movement as each arrives, and report when it *looks* ready, surfacing anything that needs a human decision rather than forcing it.

`ce-babysit-pr` is the **post-open PR watch loop**. After `/ce-commit-push-pr` opens a PR, this skill watches three independent attention streams — incoming review comments, CI status, and branch currency against the PR's base — until the PR looks merge-ready, is blocked on a human decision, or is terminal. It is a thin conductor: it does not resolve feedback or fix CI itself. It **delegates** review comments to `/ce-resolve-pr-feedback` and CI failures to `/ce-debug`, while owning the loop, ordering, dedup across ticks, settle window, safe branch maintenance, and stop decision.

**It cannot guarantee merge-readiness, and does not pretend to.** A reviewer can always add feedback later; required checks can change. The skill drives the PR forward and tells you when it *looks* ready — the merge stays yours. The safety judgment for "would this fix change behavior I intended?" lives in `/ce-resolve-pr-feedback` (which escalates such fixes to `needs-human`), so the babysit loop can run autonomously without silently changing intended behavior.

The compound-engineering shipping chain is `/ce-work → /ce-commit-push-pr → (reviewers comment) → /ce-resolve-pr-feedback`. `ce-babysit-pr` sits **on top of** that last step, invoking it on a schedule instead of by hand, and interleaving CI fixes.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Watches an open PR and keeps it moving toward merge, reacting to review comments, CI, and base-branch movement as they arrive |
| When to use it | After a PR is open and you want it moved toward merge hands-off (offered automatically at the end of `/ce-commit-push-pr`) |
| What it produces | Delegated fixes (feedback + CI), surfaced human-decision escalations, and a high-level summary of what got the PR to where it is |
| How it does work | Delegates comments to `/ce-resolve-pr-feedback` and CI to `/ce-debug`; owns bounded branch-currency maintenance and the loop |
| Modes | Self-sustaining in-session watch (default) or Checkpoint (one tick + resume command, where the harness has no background-and-wake capability) |

---

## Example invocations

```text
# Watch the pull request for the current branch until it is ready or blocked
/ce-babysit-pr

# Watch a specific pull request by number or URL
/ce-babysit-pr 1234
/ce-babysit-pr https://github.com/acme/widgets/pull/1234

# Run one checkpoint tick and return a copyable resume command
/ce-babysit-pr 1234 checkpoint
```

---

## The Problem

Babysitting a PR by hand — or with a naive loop — fails in predictable ways:

- **Serialized timelines** — the common mistake is "wait for the whole CI run, *then* read comments." That burns an entire CI cycle per round. A comment fix pushes a new commit that re-triggers CI anyway, so comments should be handled *while CI runs*.
- **Premature "ready to merge"** — CI goes green, the loop declares victory, and then review feedback lands. You go to merge and find surprises.
- **Reinventing engines** — a monolithic babysitter re-implements feedback resolution and CI debugging that already exist as dedicated skills, and drifts from them.
- **Loops that don't survive the harness** — an in-session `sleep` loop can't run in a GUI app harness that sandboxes the turn, and Claude Code blocks foreground `sleep` outright.
- **Opaque endings** — the run stops and you're not sure what it did, or it dumps a wall of per-thread receipts you have to wade through.

## The Solution

`ce-babysit-pr` runs as a **stateless, resumable tick**, driven by whatever background-and-wake capability the current harness actually has:

- **Comments-first ordering with stale-SHA cancellation** — each tick handles new review threads before CI; after the comment pass it re-snapshots, and if that pass pushed a commit it discards the now-stale CI failure rather than fixing a dead SHA.
- **Delegation, not reimplementation** — `/ce-resolve-pr-feedback` for comments, `/ce-debug` for real CI failures (dispatched once per new failure signature, never every poll). The only inline CI logic is cheap flaky-vs-real classification to decide *which* skill to call.
- **Bounded branch-currency maintenance** — an eligible PR that falls behind its normal base becomes a third attention stream. The skill may converge it automatically only when the update mechanically preserves the PR's established intent; any reasonably disputable resolution becomes a sticky `needs-human` residual instead.
- **A settle window with a bounded stalled-review path** — "looks ready" requires GitHub to report the PR mergeable (`mergeStateStatus == CLEAN`), no open feedback, and enough elapsed quiet time. A review signal that persists or disappears without completion gets a 15-minute minimum, one evidence-backed extension, and a 30-minute ceiling rather than blocking forever.
- **A self-sustaining in-session watch (the default)** — a token-free background change-detector (`pr-snapshot watch`) wakes the agent *in-session* only when something actionable changes, so the loop keeps every decision the conversation made. Where the harness has no background-and-wake capability, it falls back to checkpoint (one tick + the exact resume command).
- **One authoritative watcher** — a newer invocation cancels any older invocation still preflighting, but takes active ownership only after its own first snapshot succeeds; it then promptly stops the prior watcher. Wakes carry a persisted generation, so delayed notifications from a superseded process are coalesced against a fresh snapshot without resetting the session or settle clocks.
- **A fully paginated source of truth** — `pr-snapshot` follows the review-thread connection through its final page. One-shot diagnostic queries such as `reviewThreads(first:50)` never override that canonical snapshot.
- **A high-level final summary** — outcome first, grouped and counted, no receipts.

---

## What Makes It Novel

### 1. Comments-before-CI, then cancel the stale SHA

The ordering invariant is the point of the skill. Within a tick: terminal check → resolve new comments → **re-snapshot** → only then act on CI, and only if the comment pass didn't already push (which would have re-triggered CI on a new SHA). A CI fix is never applied against a pre-comment SHA. This collapses the comment and CI timelines instead of serializing them.

### 2. Stateless, resumable tick — one loop, any driver

All state lives on disk (`/tmp/compound-engineering-<effective-uid>/ce-babysit-pr/<owner>-<repo>-<pr>/state.json`), so a tick is idempotent and any re-invocation drives it: an in-session background-and-wake wait, `/loop`, a durable scheduler, or the user re-running the skill an hour later. This is what makes a single authored-once skill portable across CLI and app harnesses — the loop mechanics don't depend on any one driver that may not exist.

### 3. A self-sustaining in-session watch, not a per-harness scheduler

A skill's turn ends when it returns, so *the skill sets up its own loop* — nothing re-invokes it by magic. The robust, cross-harness-verified way is **not** to call a specific scheduler; it is to background a cheap deterministic change-detector — `pr-snapshot watch` (same fetch→diff, **no agent tokens**, prints one `BABYSIT_WAKE` sentinel *only* on an actionable change or a stop condition) — and **stay in-session**, woken by that sentinel. The one capability needed is generic — *run a background process and be woken when it emits a line, without ending the turn* — so the skill **describes the capability and uses whatever tool the harness exposes** (Claude Code background `Bash` + a `Monitor`/wait, Grok `get_command_or_subagent_output` or `scheduler_create --durable`, Cursor `Shell` + `notify_on_output`, a runtime-owned background exec on Codex — a detached `nohup` is reaped there). Staying in-session is what preserves the conversation's decisions — declined nits, a reviewer judged wrong, mid-run steering — and spends reasoning only when something changed. Where no such capability exists, it falls back to **checkpoint**: one tick, persist, print the resume command, say plainly monitoring is *paused* — the same loop, hand-cranked. For an unattended multi-day watch, escalate to a durable scheduler (Grok `scheduler_create --durable`, or cron running `<cli> exec "/ce-babysit-pr <url>"`), accepting that a fresh headless run reconstructs from disk and is context-blind.

### 4. Quiet time bounds unreliable bot signals

The skill does not maintain a brittle per-bot format matrix, but it does preserve whether an in-progress signal appeared on the current head. If 👀 persists or disappears without a completion marker, the lifecycle remains incomplete: the first stale judgment comes after 15 quiet minutes, concrete timing from earlier rounds may justify one extension, and 30 quiet minutes after the last observable movement is the terminal ceiling. Any new comment, signal transition, check change, or head resets quiet time. The result is still a **cooling-off judgment, not a guarantee**, so the skill reports "cautiously looks ready" and explains the stalled reviewer rather than claiming approval.

### 5. Branch currency preserves intent, not merely a green merge box

For each unchanged head/base/status observation, the skill claims at most one autonomous branch-changing repair and then confirms the result from remote truth. If a run is interrupted or the result is ambiguous, the next run reconciles what actually happened instead of blindly repeating the operation. One retry is available only when the skill can prove that neither local nor remote state changed.

The two repair paths have different authority. A `BEHIND` PR can use the hosting service's ordinary branch-update capability when that capability is positively reported. A conflicted `DIRTY` PR requires separate proof that the authenticated Git route can push normally to the exact PR head, plus a clean preview against the exact observed base. Host update capability is not proof of direct push authority.

Automatic conflict resolution is limited to cases with one answer fixed by the PR's intent, tests, or an authoritative generated source. If two reasonable behaviors remain, the skill aborts the preview and parks the conflict as `needs-human`, explaining the competing intents and decision needed. That residual stays merge-blocking across restarts and unrelated base movement; it reopens automatically only when the head, route, status, or conflict itself materially changes.

### 6. Claim → act → confirm (crash-safe dedup)

The snapshot never marks an item handled just from *observing* it. An item leaves the actionable set only when the agent confirms it acted (a `mark` after a resolve/debug pass) or when remote truth removes it (a resolved thread drops out of the unresolved fetch). So a resolve pass that crashes, errors, or returns without finishing leaves its items actionable on the next tick — the loop cannot silently drop work. A failing check stays actionable until marked dispatched at the current head; a new head SHA clears that, re-evaluating every check against the new commit. New activity on an escalated thread (an edited or added comment) reactivates it automatically.

### 7. A trustworthy ending

Every stop and every checkpoint tick ends with an outcome-first summary — looks-ready / cautiously looks-ready / blocked / paused, then grouped-and-counted work (threads resolved across N rounds, CI failures fixed, branch maintenance performed), then the specific blocker or resume command. No per-thread receipts. Crucially, it surfaces the **judgment calls** — where the loop did something other than the literal ask, where a reviewer signal stalled, or where branch movement could not be resolved mechanically — with a one-line why, while routine changes stay in the aggregate count. You see the decisions made on your behalf, not a transcript of every edit.

---

## When to Reach For It

Reach for `ce-babysit-pr` when:

- A PR is open and you want it driven toward merge without hand-holding each round
- You're about to context-switch away but want CI failures and review comments handled as they come in
- `/ce-commit-push-pr` just opened a PR and offered the babysit handoff

Skip it when:

- The repo is **not on GitHub** — the skill is GitHub-only (it and its delegates use `gh`, review threads, and Actions). It detects a non-GitHub remote (GitLab, Bitbucket) up front and stops rather than half-running.
- No PR exists yet, or the PR is already merged/closed
- You want to review and approve each fix yourself before it's pushed — use `/ce-resolve-pr-feedback` directly, one pass at a time
- The only issue is a single known bug to fix — use `/ce-debug`

**Platform support.** GitHub only today. GitLab is mappable in principle — `glab`, merge requests, MR discussions (`resolvable`/`resolved`), pipelines, and `detailed_merge_status` are clean equivalents — but it would require `glab`-based variants in *both* `pr-snapshot`'s `fetch` layer and `ce-resolve-pr-feedback`'s resolve scripts, and hasn't been built or tested. The platform-specific seam is `pr-snapshot`'s `fetch`/`fetch_threads`; a future GitLab path would swap those behind a platform flag.

---

## Use as Part of the Workflow

```text
/ce-work → /ce-commit-push-pr → /ce-babysit-pr
                                     ├── new review comments → /ce-resolve-pr-feedback
                                     ├── real CI failure      → /ce-debug
                                     └── base branch moved    → bounded branch maintenance
```

It complements:

- **`/ce-resolve-pr-feedback`** — the engine `ce-babysit-pr` calls for each round of comments; run it directly when you want a single manual pass
- **`/ce-debug`** — the engine `ce-babysit-pr` calls for genuine CI failures
- **`/ce-commit-push-pr`** — opens the PR and offers the babysit handoff

---

## Use Standalone

- **Current branch's PR** — `/ce-babysit-pr`
- **Specific PR** — `/ce-babysit-pr 1234` or `/ce-babysit-pr <PR-url>`
- **Force a mode** — `/ce-babysit-pr 1234 checkpoint` (or `watch`)

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Current branch's PR, mode inferred from harness capability |
| `<PR number or URL>` | That PR |
| `watch` / `checkpoint` | Force the execution mode |

`scripts/pr-snapshot` is the deterministic snapshot + state helper: it fully paginates review threads, fetches review, CI, and branch-currency state, reads/writes state atomically under a lock, and emits the per-tick actionable set with `quiet_seconds` for the settle window. Its `watch` subcommand is the token-free change-detector that backs the in-session loop. Watch ownership is latest-valid-wins: a successfully prefetched replacement records a new `watch_generation`, terminates its predecessor, and becomes the only process allowed to persist polls or emit `BABYSIT_WAKE`. Queued wakes from older generations are stale hints to refresh, not independent work, and handoff preserves the original session and settle clocks. `references/watch-loop.md` documents how the watch sustains itself, the state schema, dedup identities, settle window, and edge cases.

---

## FAQ

**Does it merge the PR for me?**
No. It keeps the PR moving and tells you when it *looks* ready — once GitHub reports it mergeable and the PR has been quiet for the settle window; the merge itself stays yours. It cannot guarantee no further feedback is coming.

**Why not just wait for CI, then handle comments?**
Because a comment fix pushes a commit that re-triggers CI anyway. Handling comments while CI runs collapses the two timelines; waiting serializes them and wastes a full CI cycle per round.

**How does it avoid the "green, then surprise feedback" trap?**
It never calls a PR ready on a single green snapshot. It requires the PR to be unchanged for a settle window (default 5 min when no review signal was observed) *and* GitHub to report it mergeable. A started-but-unfinished review gets at least 15 quiet minutes and at most 30; late activity resets the clock. Even then it says "looks ready, your call" or "cautiously looks ready" — never a promise that no review is coming.

**Does it run forever in the background?**
By default it runs a **self-sustaining in-session watch**: a token-free background change-detector (`pr-snapshot watch`) wakes it only when something actionable changes, so it keeps watching without burning reasoning on quiet polls — but it's session-bound (re-invoking resumes cleanly from disk). Where the harness has no background-and-wake capability, it falls back to **checkpoint** — one tick, then the resume command — and for an unattended multi-day watch you escalate to a durable scheduler (e.g. Grok `scheduler_create --durable`, or cron). It never fakes a loop with blocked/foreground sleep or a reaped `nohup`.

**Does it fix CI failures itself?**
It classifies cheaply (flaky → one rerun; real failure → `/ce-debug`) but delegates the actual diagnosis and fix to `/ce-debug`, and comment fixes to `/ce-resolve-pr-feedback`. It doesn't reimplement either.

**What about merge conflicts?**
For an eligible PR against a normal base branch, it first previews the exact observed base without changing the PR. It can complete the merge only when every conflict has one mechanically determined answer that preserves the PR's established intent, and when normal push authority to the exact head is positively known. Otherwise it aborts and reports a sticky `needs-human` decision with the competing intents in plain language. It never rebases or force-pushes.

Managed stacks stay on their manager's refresh/restack path; the ordinary branch-maintenance route does not restructure them. A manual dependency target with an open parent is also excluded. An eligible root may still have open child dependents, but the skill updates only the target: it never rebases, rewrites, or mutates those child heads, and it reports any dependent that becomes stale.

**What happens when the base branch keeps moving?**
Each distinct head/base/status observation has a bounded claim-and-reconcile lifecycle, not a wall-clock guess or lifetime update limit. Routine movement can converge automatically many times over a long watch, but the same unchanged observation cannot trigger repeated branch-changing attempts across restarts. A parked semantic conflict remains parked when unrelated base commits do not change the conflict itself, and the final summary explains what was observed, what was automated, and what decision is still needed.

For a behind PR, the host update itself carries the claimed head SHA as a precondition. If another actor pushes first, GitHub rejects the stale operation instead of applying it to the newer head, and the skill re-snapshots before deciding what remains.

---

## See Also

- [`ce-resolve-pr-feedback`](./ce-resolve-pr-feedback.md) — the per-round feedback engine this skill calls
- [`ce-debug`](./ce-debug.md) — the CI-failure engine this skill calls
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — opens the PR and offers the babysit handoff
