# `ce-babysit-pr`

> Watch an open GitHub PR and keep it moving toward merge-ready. Report when it *looks* ready. Land only if you asked.

`ce-babysit-pr` is the post-open watch. It is a git-workflow skill, not a core-loop step. After `/ce-commit-push-pr` opens a PR, this skill watches three streams (review comments, CI, base-branch movement) until the PR looks ready, is blocked, hits a budget, or is merged or closed.

It is a conductor. It does not fix comments or diagnose CI itself. Comments go to `/ce-resolve-pr-feedback`. Real CI failures go to `/ce-debug`. This skill owns the loop, the order, dedup across ticks, the settle window, bounded branch maintenance, and the stop. `/ce-resolve-pr-feedback` by contrast is a one-pass "fix the comments now" skill. Use that when you want a single round you watch. Use this when you want the PR driven over time.

Posture sets the scope. Default is `target`, the named PR only. On a confirmed managed stack you can choose `stack-ready` (advance upstack as soon as a layer has nothing actionable, even while its CI is still running, with lower layers kept under probe; no merge) or `stack-land` (same walk, plus `gh stack merge` of the bottom-most open settled prefix). Settled is not merged. A layer can look ready and still be OPEN.

It cannot promise merge-readiness. A reviewer can still comment later. Required checks can change. Under `target` and `stack-ready`, you merge. Selecting `stack-land` *is* land authorization for that managed prefix.

GitHub only, including GitHub Enterprise that `gh` is configured for.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Watches an open PR (or a confirmed managed stack) and reacts to comments, CI, and base movement |
| When to use it | A PR is open and you want it driven toward merge without handling each round yourself |
| What it produces | Delegated comment and CI fixes, surfaced `needs-human` items, optional stack-layer moves, and an outcome-first summary |
| How it works | Delegates comments to `/ce-resolve-pr-feedback` and CI to `/ce-debug`. Owns the loop, posture, and stop. |
| Modes | In-session watch (default) or Checkpoint. Postures: `target` / `stack-ready` / `stack-land`. |

---

## Example invocations

Empty invoke watches the current branch's PR. A number or URL pins the PR. `watch` / `checkpoint` force the loop style. `posture:` is separate from that.

```text
# Current branch's PR. In-session watch if the harness can wake you; else one checkpoint tick.
/ce-babysit-pr

# Named PR
/ce-babysit-pr 1234
/ce-babysit-pr https://github.com/acme/widgets/pull/1234

# One tick, persist, print the exact resume command. Monitoring is paused.
/ce-babysit-pr 1234 checkpoint

# Force the in-session watch even if the harness would have picked checkpoint
/ce-babysit-pr 1234 watch

# Cap the active-time budget (default is 8 hours of active watch time)
/ce-babysit-pr 1234 2 hours

# Confirmed managed stack: walk upstack as layers go quiet (CI may still run). Do not merge.
/ce-babysit-pr posture:stack-ready

# Same walk, and land the settled prefix when green
/ce-babysit-pr posture:stack-land
```

For a single pass over comments you want to watch yourself, use `/ce-resolve-pr-feedback` instead.

---

## The Problem

Hand-babysitting, or a naive loop, usually fails in the same ways:

- Wait for the whole CI run, *then* read comments. A comment fix pushes and retriggers CI, so that wait burned a cycle
- CI goes green, the loop says ready, and review lands after
- The watcher reimplements feedback resolution and CI debugging, then drifts from those skills
- An in-session `sleep` loop cannot run in a sandboxed GUI harness, and Claude Code blocks foreground `sleep`
- The run stops and you cannot tell what it did, or you get a wall of per-thread receipts

## The Solution

Each tick is stateless and resumable from disk. The harness only has to wake the agent when something changed.

- Comments first. New review threads and non-thread comments get handled before CI. If that pass pushed a commit, the old CI failure sits on a dead SHA and gets skipped
- Delegation. `/ce-resolve-pr-feedback` for comments, `/ce-debug` for real failures (once per new signature). The only inline CI work is a cheap flaky-vs-real split
- Consumption-only branch currency. The base gets merged or updated into the PR only when the snapshot emits a `branch_currency` item (`BEHIND` via GitHub's update-branch endpoint, `DIRTY` via an exact-base local repair) and only after it is claimed. Ordinary base movement on a CLEAN PR, a sibling merging, or someone saying "update the branch" never triggers one. A disputable conflict becomes a sticky `needs-human`; an unrequested base merge on the head gets flagged as a defect
- Settle window. "Looks ready" needs GitHub `CLEAN`, no open feedback, no parked `needs-human`, and enough quiet time. A started-but-unfinished review waits at least 15 quiet minutes and at most 30
- In-session watch by default. `pr-snapshot watch` polls with no agent tokens and prints `BABYSIT_WAKE` only on an actionable change. If the harness cannot background-and-wake, the skill runs one checkpoint tick and prints the resume command
- Posture for confirmed managed stacks. `target` stops at the named PR. `stack-ready` continues upstack without merging. `stack-land` continues and lands the settled prefix

A `needs-human` item blocks the ready call. It does not end the watch. New comments and CI still get handled.

---

## What Makes It Novel

### Comments before CI, then drop the stale SHA

Within a tick: terminal check, then comments, then re-check the head SHA, then CI only if that SHA did not move. A CI fix never lands against a pre-comment commit.

The same rule applies to a review that is still running. Already-posted comments get handled immediately; a review in flight only withholds the "looks ready" call.

### One tick, any driver

State lives under `/tmp/compound-engineering-<effective-uid>/ce-babysit-pr/<host>-<owner>-<repo>-<pr>/` (under `$TMPDIR/compound-engineering-<effective-uid>/` instead when `/tmp` cannot host a writable private root, as in a sandbox that only allowlists `$TMPDIR`). A later invoke, a checkpoint resume, or a durable scheduler all drive the same tick. That is why the skill can run in a CLI session or fall back in a GUI harness that cannot keep a background wait.

Default budget is 8 hours of active watch time; laptop-sleep gaps do not count. A 3-calendar-day wall-clock backstop caps every run. You can pass a shorter duration at invoke.

### Looks ready is a cooling-off judgment

Ready is not "CI is green." GitHub must report the PR mergeable against the current base, the attention set must be empty, and the quiet window (5 minutes by default) must have elapsed. Then the skill judges separately whether a review is still on its way, from what the current head shows. A reviewer that announced itself earns a bounded extra wait until something it produced accounts for the review it announced, whatever that output concluded. An unrelated check from the same app finishing is not that. Even then the summary says "looks ready, your call" or "cautiously looks ready."

When a fork PR's CI is waiting on maintainer approval, the skill drains review for a bounded window (5, 15, or 30 minutes) and then hands back. It never approves the workflow run. Pipeline mode returns that blocker immediately.

### Posture is a run value, not a keyword guess

Only a fresh probe with `manager_status == "confirmed"` activates stack-wide continuation. A manual base/head chain never does.

| Posture | Behavior |
|---------|----------|
| `target` | Named PR only. Stop at looks-ready. May offer once to continue upstack. Never merges. |
| `stack-ready` | Once a layer is quiescent (zero actionable backlog, no standing residual), continue to the next open non-draft layer that needs work; lower layers stay probed and pull the walk back if they re-open. Never merges. |
| `stack-land` | Like `stack-ready`, plus `gh stack merge` of the bottom-most open settled PR, then `gh stack sync`. |

A just-landed `MERGED` under `stack-land` is a layer transition, not the end of the whole run.

---

## Why All This Machinery

Much simpler PR-watch skills exist, a page of prose that polls `gh pr checks`, fixes comments, and stops after a few rounds. If a strong model can reason from a goal statement, why does this skill carry a ~3,500-line snapshot engine and a directory of references?

Because the prose here *is* the goal statement. The always-loaded body is about 60 lines. The engine holds the parts that prose has already failed at in production. The split is deliberate and documented: the engine reports what is observable and cheap to establish, and the agent decides what those observations mean (see `docs/solutions/skill-design/liveness-judgment-belongs-to-the-agent.md`, which records the one time a judgment leaked into the engine and had to be deleted).

Each major piece of the engine exists because a specific failure happened without it:

| Machinery | The failure it prevents |
|-----------|------------------------|
| Consumption-only branch currency | A run merged the base into two CLEAN, MERGEABLE PRs after a sibling merged. The correct rule was stated three times in prose and still missed; the engine now emits the item and prose only consumes it |
| File-locked state, claim -> act -> confirm dedup | Re-fixing the same thread or CI failure across restarts and resumes; a superseded watcher acting after a newer invocation takes ownership. (Not a concurrent-session guarantee: feedback is confirmed after the delegate acts, so two invocations overlapping in the same window can still both act once) |
| Token-free `watch` with agent wake | An 8-hour unattended run. Polling in agent prose burns tokens every interval; the Python watcher spends none and wakes the agent only on actionable change |
| Active-time budget accounting | Laptop sleep does not count against the 8-hour budget; a wall-clock budget would silently expire overnight |
| `needs-human` decision ledger | Unattended and pipeline runs must surface a human decision durably and keep watching, instead of blocking on a question nobody is there to answer or silently dropping it |
| Trajectory / non-convergence evidence | A fix loop that oscillates (A fixed, B appears, A returns) looks like progress from inside any single tick. Session history is lossy across compaction, so the evidence has to live on disk |
| Stack topology via the host's manager probe | Advancing or landing the wrong layer of a stack; only a confirmed manager probe activates stack posture |

Simpler skills do not solve these problems. They export them. A bounded "3 rounds then stop" cap is a budget the user enforces by re-invoking. "Poll until all reviewers are finished" with no definition of finished hangs on a reviewer that announces itself and never signals completion, the exact bug fixed here in #1606/#1611. And a watcher with no comment-trust rule will follow instructions planted in PR comments, a concretely exploited injection class.

The machinery still has to pay rent. When a piece turns out to encode a judgment rather than an observation, it gets deleted. #1611 removed a nine-function review-liveness detector and replaced it with a stated goal in `settle.md`. The direction of travel is thinner prose over a boring, observable-facts engine, not fewer facts.

---

## Quick Example

`/ce-commit-push-pr` opens PR #1234 and hands off. `/ce-babysit-pr` confirms GitHub, checks out the PR head, and starts `pr-snapshot watch`.

A review bot posts three inline threads while CI is still running. The next tick sends them to `/ce-resolve-pr-feedback`, which fixes two and parks one as `needs-human`. That push invalidates the in-flight CI SHA, so the skill does not debug the old failure.

New CI comes back red on a real test. `/ce-debug` fixes and pushes. Base moves; the PR is `BEHIND`. Host branch-update succeeds because the merge is mechanical.

The parked thread still blocks "ready." A reviewer answers it. The next tick resolves the rest, waits out the settle window, and reports looks-ready. You merge.

---

## When to Reach For It

Use `ce-babysit-pr` when:

- A PR is open and you want it driven toward merge without handling each round
- You are about to context-switch and still want comments and CI handled
- `/ce-commit-push-pr` just opened a PR (handoff is the default)
- You own a confirmed managed stack and want `stack-ready` or `stack-land`

Skip it when:

- The remote is not GitHub (GitLab, Bitbucket). The skill stops up front rather than half-running
- No PR exists, or the PR is already merged or closed
- An automatic handoff landed on a draft. A direct invoke that resolves to that draft is fine; `watch` / `checkpoint` also arms it
- You want to approve each fix before it is pushed -> `/ce-resolve-pr-feedback` one pass at a time
- The only issue is one known bug -> `/ce-debug`

---

## Chain Position

On-demand, after a PR exists.

```text
/ce-work  ->  /ce-commit-push-pr  ->  /ce-babysit-pr
                                       |-- new comments -> /ce-resolve-pr-feedback
                                       |-- real CI      -> /ce-debug
                                       |-- base moved   -> bounded branch maintenance
```

Use `/ce-resolve-pr-feedback` directly when you want one manual pass. Use this skill when you want that pass (and CI, and base movement) repeated until ready.

---

## Use Standalone

- Current branch: `/ce-babysit-pr`
- Specific PR: `/ce-babysit-pr 1234` or a URL
- One tick: `/ce-babysit-pr 1234 checkpoint`
- Stack: `/ce-babysit-pr posture:stack-ready` or `posture:stack-land`

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Current branch's PR. Mode from harness capability. Posture `target`. |
| `<PR number or URL>` | That PR |
| `watch` / `checkpoint` | Force the execution mode |
| `<duration>` | Active-time budget (default 8 hours). Example: `2 hours`. |
| `posture:target\|stack-ready\|stack-land` | Run scope on a confirmed managed stack |
| `mode:pipeline` | Bounded synchronous ticks for an orchestrator. No settle wait. Structured return. |

`scripts/pr-snapshot` is the snapshot and state helper: it paginates review threads, records CI and branch currency, and emits the per-tick attention set. Its `watch` subcommand is the token-free change detector (with `--downstack-pr` it also probes lower stack layers so the walk returns when one re-opens). A newer successful invoke takes ownership; older wakes are stale hints. The skill body itself is a short always-loaded kernel; the tick commands, currency routes, stack contract, settle policy, and report shape live in the skill's `references/` (`tick.md`, `branch-currency.md`, `stack.md`, `settle.md`, `report.md`, `watch-loop.md`).

---

## FAQ

**Does it merge the PR?**
Under `target` and `stack-ready`, no. It tells you when the PR *looks* ready. For a managed stack it prints the exact `gh stack merge` command when ready-as-next. Under `stack-land`, that posture authorizes landing the bottom-most open settled prefix via `gh stack merge` + sync.

**Why not wait for CI, then handle comments?**
A comment fix pushes and retriggers CI. Handling comments during the run collapses the two timelines.

**How does it avoid "green, then surprise review"?**
It never calls ready on one green snapshot. It needs `CLEAN`, an empty attention set, and a settle window. A started review gets 15 to 30 quiet minutes. Late activity resets the clock. The wording stays "looks ready, your call."

**Does it run forever in the background?**
The default is an in-session watch: a token-free detector wakes the agent only when something changed. Close the session and re-invoke to resume from disk. For a multi-day unattended watch, use a durable scheduler (or cron running the resume command). It never fakes a loop with foreground `sleep`.

**Does it fix CI itself?**
It classifies (flaky -> one rerun; real -> `/ce-debug`) and delegates. Comments go to `/ce-resolve-pr-feedback`.

**What about merge conflicts?**
It previews the exact observed base first. It completes a merge only when every conflict has one mechanical answer that preserves the PR's intent, and when push authority to that head is known. Otherwise it parks a `needs-human`. It never rebases or force-pushes. Managed stacks stay on the manager's restack path.

**What happens when the base keeps moving?**
Each distinct head/base/status observation has a bounded claim-and-confirm cycle. Routine movement can be applied many times. The same unchanged observation is not retried across restarts. A parked semantic conflict stays parked when later base commits do not change the conflict.

---

## See Also

- [`/ce-resolve-pr-feedback`](./ce-resolve-pr-feedback.md): the per-round comment engine this skill calls
- [`/ce-debug`](./ce-debug.md): the CI-failure engine this skill calls
- [`/ce-commit-push-pr`](./ce-commit-push-pr.md): opens the PR and offers this handoff
