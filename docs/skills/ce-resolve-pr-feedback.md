# `ce-resolve-pr-feedback`

> Evaluate, fix, and reply to PR review feedback in parallel — including nitpicks. Agent time is cheap; tech debt is expensive.

`ce-resolve-pr-feedback` is the **incoming-feedback resolution** skill. After your PR gets review comments, this skill fetches all unresolved threads, classifies them as new vs already-handled, dispatches parallel agents to fix what's valid (or reply with reasoning), commits and pushes, then posts replies and resolves threads via GitHub's GraphQL API. It addresses everything legitimate — including style nitpicks — because once you're already in the code, fixing it is cheaper than punting it.

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-resolve-pr-feedback` is the **post-PR feedback loop** — invoked after reviewers leave comments, complementary to `/ce-code-review` (which reviews *before* the PR is open) and `/ce-debug` (which investigates broken behavior, not review feedback).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Fetches unresolved review threads + PR comments, dispatches parallel agents to fix valid feedback, commits/pushes, replies and resolves threads |
| When to use it | After a PR receives review feedback you want to address |
| What it produces | Commits with fixes, replies on each thread, resolved threads via GraphQL, summary of what was done per verdict |
| Modes | Full (all unresolved threads), Targeted (single thread URL) |

---

## The Problem

Resolving PR feedback at scale fails in predictable ways:

- **Nitpicks get punted** — "I'll address this later" turns into tech debt; the reviewer's time is wasted
- **Already-replied items re-surface every run** — top-level PR comments and review bodies have no resolve mechanism, so they keep appearing until manually checked
- **Bot wrapper noise** — review-bot boilerplate ("Here are some automated review suggestions...") inflates the work count
- **Sequential fixes are slow** — addressing 12 threads one at a time is 12× the wall-clock time
- **Parallel fixes collide** — two agents writing the same file silently lose one of the changes
- **No combined validation** — each agent runs targeted tests on its own change; cross-agent regressions slip through
- **Recurring patterns** — the same kind of feedback shows up across multiple review rounds because the underlying issue was never holistically addressed
- **Outdated comment line numbers** — feedback on lines that have since drifted is hard to relocate

## The Solution

`ce-resolve-pr-feedback` runs feedback resolution as a structured pipeline:

- **Fetch all unresolved feedback** (review threads + PR comments + review bodies) via GraphQL
- **Triage new vs already-handled** — a substantive reply that defers action counts as handled; only new items are processed
- **Drop bot wrapper noise silently** — non-actionable boilerplate is filtered, not announced
- **Cross-invocation cluster analysis** — when the same theme spans multiple review rounds, broader investigation replaces another surgical fix
- **Parallel agent dispatch with file-collision avoidance** — agents that touch overlapping files serialize automatically
- **Combined validation** — one full validation run after all agents complete, catches cross-agent regressions
- **Reply with quoted context** — every reply quotes the relevant feedback for continuity, then states what was done
- **Resolve via GraphQL** — review threads get resolved; PR comments and review bodies get a top-level reply (no resolve mechanism in the API)

---

## What Makes It Novel

### 1. Fix everything valid — including nitpicks

The default policy is to address everything legitimate. **Agent time is cheap; tech debt is expensive.** Nitpicks compound; punting them costs more than fixing them. The narrow exception: when implementing the suggested fix would actively make the code worse (violates a CLAUDE.md/AGENTS.md rule, adds dead defensive code, suppresses errors that should propagate, premature abstraction, restates code in comments), the agent uses the `declined` verdict and cites the specific harm.

### 2. Six verdicts — each with a different action

| Verdict | Meaning | Action |
|---------|---------|--------|
| `fixed` | Code change made as requested | Commit + reply + resolve |
| `fixed-differently` | Code change made, with a better approach than suggested | Commit + reply explaining the divergence + resolve |
| `replied` | No code change needed; question answered or design explained | Reply + resolve |
| `not-addressing` | Feedback is factually wrong about the code | Reply with evidence + resolve |
| `declined` | Implementing the suggested fix would actively make code worse | Reply citing harm + resolve |
| `needs-human` | Cannot determine the right action | Reply with structured `decision_context` + leave open |

`needs-human` is high-signal and rare — it includes structured analysis of what the reviewer said, what the agent investigated, why a decision is needed, and concrete options with tradeoffs.

### 3. Triage — new vs already-handled

For each piece of feedback, the skill classifies before processing:

- **Review threads** — read the thread; a substantive reply that defers action ("need to align on this", "going to think through this") is **pending**, don't reprocess. Only original-comment-only threads are **new**.
- **PR comments + review bodies** — no resolve mechanism, so they reappear every run. Two filters: actionability (skip review wrappers, approvals, status badges, CI summaries with no asks), then already-replied (existing reply that quotes and addresses the feedback). Anything passing both is **new**.

Bot wrappers from CodeRabbit, Codex, Gemini Code Assist, Copilot are dropped silently — recognized by boilerplate content, never announced or counted.

### 4. Cross-invocation cluster analysis

When the same theme spans multiple review rounds (e.g., 3 rounds of error-handling feedback in the auth module), the skill detects the pattern and dispatches a single agent with a `<cluster-brief>` that includes both the new threads and the previously-resolved threads in the same area. The agent reads the broader area before fixing — recognizing that recurring feedback signals a deeper issue than another surgical fix would solve.

The gate has two stages: **signal** (prior resolved threads exist) and **spatial-overlap** (new threads share files or directory subtrees with prior ones). Both must pass. Single-round clustering across new-only threads is deliberately not performed — too thin evidence, too high false-positive rate.

### 5. Parallel dispatch with file-collision avoidance

For 1-4 dispatch units (clusters + individual items), all run in parallel. For 5+, batches of 4. **Before dispatching, the skill checks file overlaps across all units** — overlapping units serialize so two agents never write the same file in parallel.

Sequential fallback: platforms without parallel dispatch run agents sequentially, with cluster units dispatched first (higher leverage), then individual items.

### 6. Combined validation after all agents complete

Each resolver agent runs targeted tests on its own changes. After all agents return, the skill aggregates `files_changed` and runs the project's full validation **once** — catching cross-agent interactions targeted runs can't see.

| Outcome | Action |
|---------|--------|
| Green | Proceed to commit |
| Red, failures touch resolver-changed files | One inline diagnose-and-fix pass; if still red, escalate as `needs-human` and don't commit |
| Red, failures touch only files no resolver changed | Treat as pre-existing; commit with a footer note |

### 7. Reply format with quoted context

Every reply quotes the relevant part of the original feedback for continuity, then states what was done:

- **Fixed:** `> [quoted feedback]` followed by `Addressed: [brief description of the fix]`
- **Not addressing:** `> [quoted feedback]` followed by `Not addressing: [reason with evidence]`
- **Declined:** `> [quoted feedback]` followed by `Declined: [specific harm cited]`

This keeps reviewers oriented when they read the reply weeks later — they see what's being addressed without re-reading the whole thread.

### 8. Outdated comment relocation

Threads on outdated lines often have `line: null` and require fallback to `originalLine`. The skill carries the `isOutdated` flag and all four location fields (`line`, `originalLine`, `startLine`, `originalStartLine`) into each agent's dispatch so the agent knows the reported line may have drifted and can relocate appropriately.

### 9. Two-pass loop with escalation

If new threads remain after the verify step, the skill repeats from triage for the remaining threads (re-fetched feedback picks up resolved-this-run threads as resolved, which feeds the cross-invocation gate). After two fix-verify cycles, the skill stops looping and surfaces the recurring pattern as `needs-human`: "Multiple rounds of feedback on [theme] suggest a deeper issue."

### 10. Two modes — Full and Targeted

| Mode | When | Behavior |
|------|------|----------|
| **Full** _(default)_ | No URL provided | Process all unresolved threads on the PR |
| **Targeted** | Comment/thread URL provided | Process only that specific thread |

Targeted mode is for "address just this one comment" cases — common when the user wants to handle one piece of feedback in isolation.

---

## Quick Example

A reviewer leaves 8 comments on your PR. You invoke `/ce-resolve-pr-feedback`.

The skill detects the PR from the current branch, fetches via GraphQL: 6 unresolved review threads, 2 review bodies (one is a CodeRabbit wrapper), 0 PR comments. Triage: the CodeRabbit wrapper is a bot wrapper — dropped silently. One review thread has a substantive reply from yesterday deferring action — pending, skip. That leaves 5 review threads + 1 review body as **new**.

Cross-invocation gate: signal stage passes (prior resolved threads exist from 2 rounds ago), spatial-overlap stage passes (3 of the new threads touch files in `app/services/notifications/` where prior resolved threads also lived). Cluster analysis identifies one cluster: error-handling theme spanning the auth-token error path. The other 2 threads dispatch as individuals.

Step 5 dispatches: 1 cluster agent (handles 3 threads with broader investigation) + 2 individual agents + 1 review-body agent. File-collision check: the cluster touches `app/services/notifications/dispatcher.rb` and one individual also touches that file → those two serialize. Other 2 dispatch in parallel.

All 4 agents return: 1 cluster `fixed` (3 threads), 1 individual `fixed`, 1 individual `fixed-differently` (a better approach than suggested), 1 review-body `replied` (answered a question). Combined validation runs once; tests pass. Commit + push.

Step 8 posts replies: each thread reply quotes the original feedback and states what was done. Threads resolved via GraphQL. Review-body answered with a top-level PR comment quoting the original. Step 9 verify: fetched again — empty. Done. Summary surfaces.

---

## When to Reach For It

Reach for `ce-resolve-pr-feedback` when:

- Your PR received review feedback you want to address
- You want to handle a specific comment in isolation (Targeted mode with the comment URL)
- A previous run left `needs-human` items and you've decided how to proceed
- The same kind of feedback keeps recurring across rounds — the cluster analysis catches the pattern

Skip `ce-resolve-pr-feedback` when:

- The PR has no feedback yet
- You only want to ack the feedback without fixing — the skill expects to act, not just acknowledge
- The feedback is on a brainstorm or plan doc, not code → use `/ce-doc-review`

---

## Use as Part of the Workflow

`ce-resolve-pr-feedback` is the closing loop after `/ce-commit-push-pr` opens a PR:

```text
/ce-work → /ce-commit-push-pr → reviewer leaves comments → /ce-resolve-pr-feedback
```

It complements:

- **`/ce-code-review`** — reviews *before* the PR is open; this skill handles incoming feedback *after*
- **`/ce-debug`** — for broken behavior; this skill is for review-comment resolution

After resolution lands on the PR, the standard merge / re-review cycle applies. If the next review round produces more feedback, this skill can run again — the cross-invocation gate uses the prior round's resolutions as evidence.

---

## Use Standalone

The skill works directly:

- **Current branch's PR** — `/ce-resolve-pr-feedback`
- **Specific PR** — `/ce-resolve-pr-feedback 1234`
- **Targeted (single thread)** — `/ce-resolve-pr-feedback https://github.com/.../pull/1234#discussion_r5678901`

In Targeted mode, only the URL's specific thread is addressed — no other threads are fetched or processed.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Full mode — current branch's PR |
| `<PR number>` | Full mode — that PR |
| `<comment/thread URL>` | Targeted mode — only that thread |

Scripts in `scripts/`: `get-pr-comments` (GraphQL fetch), `get-thread-for-comment` (map comment → thread for targeted), `reply-to-pr-thread` (GraphQL mutation), `resolve-pr-thread` (GraphQL mutation).

---

## FAQ

**Why fix nitpicks? Aren't they low-priority?**
Because agent time is cheap and tech debt is expensive. Once you're already in the code addressing the bigger feedback, fixing the nit costs nothing. Punting it means it accumulates, and the reviewer's time was wasted. The narrow exception is when implementing the suggested fix would actively make the code worse — that's `declined` with a cited harm.

**Why drop bot wrappers silently?**
Because announcing them adds noise without value. CodeRabbit boilerplate ("Here are some automated review suggestions...") wraps real findings; the wrapper itself isn't actionable. Counting or listing dropped wrappers in the summary clutters the report. The script-level filter handles only CI/status bots; the content-aware drop catches the rest.

**What's a cluster?**
A group of threads sharing a concern category (error-handling, validation, type-safety, etc.) AND spatial proximity (same file or directory subtree) AND containing at least one previously-resolved thread (cross-round evidence). Single-round groupings are dispatched as individuals — the evidence is too thin.

**What if two parallel agents conflict?**
The file-collision check before dispatch catches most cases — overlapping units serialize. For rare cases where a fix expands beyond its referenced file (rename updates callers elsewhere), the combined validation in step 6 catches test breakage and the verify step in step 9 catches unresolved threads. If either surfaces inconsistency, the skill re-runs the affected agents sequentially.

**What does `needs-human` mean?**
The agent investigated the feedback and the code, but cannot determine the right action confidently — usually because the choice depends on user intent the agent can't infer. The thread stays open with an acknowledgment reply, and the summary surfaces a structured `decision_context`: quoted feedback, investigation findings, options with tradeoffs, the agent's lean if any.

**What if the feedback loop never converges?**
After two fix-verify cycles, the skill stops looping and escalates the recurring pattern as `needs-human` with the cumulative context. It doesn't retry indefinitely.

---

## See Also

- [`ce-code-review`](./ce-code-review.md) — pre-PR review; this skill handles post-PR feedback
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — opens the PR that this skill responds to
- [`ce-debug`](./ce-debug.md) — for broken behavior reported as a bug, not review feedback
- [`ce-doc-review`](./ce-doc-review.md) — for feedback on requirements or plan docs, not code
