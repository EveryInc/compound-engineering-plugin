# `ce-resolve-pr-feedback`

> Evaluate, fix, and reply to PR review feedback in parallel. Fix what's real; don't churn on what isn't.

`ce-resolve-pr-feedback` is the **incoming-feedback resolution** skill. After your PR gets review comments, this skill fetches all unresolved threads, classifies them as new vs already-handled, dispatches parallel agents to validate each finding and fix what's genuinely correct (or reply with reasoning), commits and pushes, then posts replies and resolves threads via GitHub's GraphQL API. It judges every item on its merits — regardless of source (human or bot) or form (inline thread, formal review body, or top-level comment) — and defaults to fixing, diverting only when reading the code trips a concrete signal (the finding's wrong, the fix would harm, it buys nothing, or the risk can't be bounded).

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-resolve-pr-feedback` is the **post-PR feedback loop** — invoked after reviewers leave comments, complementary to `/ce-code-review` (which reviews *before* the PR is open) and `/ce-debug` (which investigates broken behavior, not review feedback).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Fetches unresolved review threads + PR comments, dispatches parallel agents to validate each finding and fix what's genuinely correct, commits/pushes, replies and resolves threads |
| When to use it | After a PR receives review feedback you want to address |
| What it produces | Commits with fixes, replies on each thread, resolved threads via GraphQL, summary of what was done per verdict |
| Modes | Full (all unresolved threads), Targeted (single thread URL) |

---

## The Problem

Resolving PR feedback at scale fails in predictable ways:

- **Over-fixing bot noise** — auto-review bots over-flag, flag immaterial things, and are sometimes wrong; a "fix everything" reflex churns the code and the PR with low-value changes
- **Findings taken on authority, not merit** — fixing because a reviewer (or bot) said so, without confirming the issue actually exists in the code
- **Already-replied items re-surface every run** — top-level PR comments and review bodies have no resolve mechanism, so they keep appearing until manually checked
- **Bot wrapper noise** — review-bot boilerplate ("Here are some automated review suggestions...") inflates the work count
- **Sequential fixes are slow** — addressing 12 threads one at a time is 12× the wall-clock time
- **Parallel fixes collide** — two agents writing the same file silently lose one of the changes
- **No combined validation** — each agent runs targeted tests on its own change; cross-agent regressions slip through
- **Outdated comment line numbers** — feedback on lines that have since drifted is hard to relocate

## The Solution

`ce-resolve-pr-feedback` runs feedback resolution as a structured pipeline:

- **Fetch all unresolved feedback** (review threads + PR comments + review bodies) via GraphQL
- **Triage new vs already-handled** — a substantive reply that defers action counts as handled; only new items are processed
- **Drop bot wrapper noise silently** — non-actionable boilerplate is filtered, not announced
- **Fix by default; validate as a tripwire** — each finding is judged on its merits regardless of source or form; the agent fixes unless reading the code trips a concrete signal (the finding's wrong, the fix would harm, it buys nothing, or the risk can't be bounded)
- **Parallel agent dispatch with file-collision avoidance** — agents that touch overlapping files serialize automatically
- **Combined validation** — one full validation run after all agents complete, catches cross-agent regressions
- **Reply with quoted context** — every reply quotes the relevant feedback for continuity, then states what was done
- **Resolve via GraphQL** — review threads get resolved; PR comments and review bodies get a top-level reply (no resolve mechanism in the API)

---

## What Makes It Novel

### 1. Default to fixing — divert only on a tripwire

Most review feedback — across P0–P2, nitpicks included — is correct and worth fixing, so the default is to fix it. Crucially, validation isn't a separate analysis pass: the agent has to read the code to make the fix anyway, and the checks are *tripwires it notices during that read*, not a gate every item must argue its way through. When nothing trips, it fixes and moves on — no per-item deliberation. The deep work (reading callers, assessing blast radius, writing a decision for the user) is spent only on the minority of items that trip a wire.

An item diverts from a fix only on a concrete signal:

- **the finding doesn't hold** (reading the code disproves it) → `not-addressing` with evidence
- **the fix would make the code worse** → `declined` citing the harm
- **the change buys nothing real** (cosmetic or immaterial — small *real* improvements still get fixed; the skip bar is "no benefit," not "minor") → `replied`
- **the change is risky and the blast radius can't be bounded** (a one-line edit can hit a hot path or thinly-tested code; the reviewer, especially a bot, usually couldn't see it) → de-risk with a test and fix if possible, else `needs-human`
- **it's a question, not a change** → `replied`, or `needs-human` for a product/business call

The guardrail against over-thinking is explicit: "I'm uneasy" is not a tripwire; "I read the callers and this breaks X" is. This matters most for auto-review bots, which over-flag — but the rule is source-agnostic: a bot or a human asserting something is not evidence it's correct.

### 2. Judge on merit, not source or form

Every item is evaluated the same way regardless of **who** raised it (human reviewer or review bot) or **what form** it arrived in (inline review thread, formal review body, or top-level PR comment). Correctness doesn't depend on the source or the surface. Structural form changes only the *response mechanics* (inline threads resolve via GraphQL; review bodies and top-level comments get a top-level reply) — never whether a finding is right.

### 3. Six verdicts — each with a different action

| Verdict | Meaning | Action |
|---------|---------|--------|
| `fixed` | Code change made as requested | Commit + reply + resolve |
| `fixed-differently` | Code change made, with a better approach than suggested | Commit + reply explaining the divergence + resolve |
| `replied` | No code change needed; question answered, design explained, or change not warranted | Reply + resolve |
| `not-addressing` | Feedback is factually wrong about the code | Reply with evidence + resolve |
| `declined` | Implementing the suggested fix would actively make code worse | Reply citing harm + resolve |
| `needs-human` | Cannot determine the right action | Reply with structured `decision_context` + leave open |

`needs-human` is high-signal and rare — it includes structured analysis of what the reviewer said, what the agent investigated, why a decision is needed, and concrete options with tradeoffs.

### 4. Triage — new vs already-handled

For each piece of feedback, the skill classifies before processing:

- **Review threads** — read the thread; a substantive reply that defers action ("need to align on this", "going to think through this") is **pending**, don't reprocess. Only original-comment-only threads are **new**.
- **PR comments + review bodies** — no resolve mechanism, so they reappear every run. Two filters: actionability (skip review wrappers, approvals, status badges, CI summaries with no asks), then already-replied (existing reply that quotes and addresses the feedback). Anything passing both is **new**.

Bot wrappers from CodeRabbit, Codex, Gemini Code Assist, Copilot are dropped silently — recognized by boilerplate content, never announced or counted. This is a *content* check (is there anything actionable here?), not a source check, so it holds regardless of which bot's format changes.

### 5. Parallel dispatch with file-collision avoidance

For 1-4 items, all run in parallel. For 5+, batches of 4. **Before dispatching, the skill checks file overlaps across items** — overlapping items serialize so two agents never write the same file in parallel.

Sequential fallback: platforms without parallel dispatch run agents sequentially.

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

If new threads remain after the verify step, the skill repeats from triage for the remaining threads. After two fix-verify cycles, the skill stops looping and surfaces the recurring pattern as `needs-human`: "Multiple rounds of feedback on [theme] suggest a deeper issue."

### 10. Two modes — Full and Targeted

| Mode | When | Behavior |
|------|------|----------|
| **Full** _(default)_ | No URL provided | Process all unresolved threads on the PR |
| **Targeted** | Comment/thread URL provided | Process only that specific thread |

Targeted mode is for "address just this one comment" cases — common when the user wants to handle one piece of feedback in isolation.

---

## Quick Example

A reviewer (and a review bot) leave 8 comments on your PR. You invoke `/ce-resolve-pr-feedback`.

The skill detects the PR from the current branch, fetches via GraphQL: 6 unresolved review threads, 2 review bodies (one is a CodeRabbit wrapper), 0 PR comments. Triage: the CodeRabbit wrapper is non-actionable boilerplate — dropped silently. One review thread has a substantive reply from yesterday deferring action — pending, skip. That leaves 5 review threads + 1 review body as **new**.

Step 4 dispatches 6 generic resolver subagents seeded with the skill-local `pr-comment-resolver.md` prompt, in batches of 4. File-collision check: two threads touch `app/services/dispatcher.rb` → those two serialize; the rest run in parallel. Each resolver reads the actual code and judges its finding on the merits:

- 2 findings are clearly correct → `fixed`
- 1 suggests an approach that works, but a cleaner one exists → `fixed-differently`
- 1 is a bot finding flagging a "possible null deref" the type system already rules out → confirmed against the code, doesn't hold → `not-addressing` with evidence (no churn)
- 1 asks "is this intentional?" → answerable from the code → `replied`
- the review body asks a design question → `replied`

Combined validation runs once against the 3 changed files; tests pass. Commit + push.

Step 7 posts replies: each quotes the original feedback and states what was done. All 5 review threads resolve via GraphQL; the review body gets a top-level PR comment (no resolve mechanism in the API). Step 8 verify: fetched again — empty. Done. Summary surfaces.

---

## When to Reach For It

Reach for `ce-resolve-pr-feedback` when:

- Your PR received review feedback you want to address
- An auto-review bot left a pile of findings and you want them validated against the code, not blindly applied
- You want to handle a specific comment in isolation (Targeted mode with the comment URL)
- A previous run left `needs-human` items and you've decided how to proceed

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

After resolution lands on the PR, the standard merge / re-review cycle applies. If the next review round produces more feedback, this skill can run again on the new round.

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

**Do you still fix nitpicks?**
Yes — by default. Most feedback, nitpicks included, is correct and worth fixing, so the agent fixes unless reading the code trips a concrete signal: the finding doesn't hold, the fix would make the code worse, or the change buys nothing real. A correct nit that improves the code (even slightly) gets fixed; a purely cosmetic one with no benefit gets a brief reply instead of churn. The skip bar is "no benefit," not "minor."

**Does it treat bot feedback differently from human feedback?**
No — and that's deliberate. Validation is judged on merit, not authority: reading the actual code to confirm a finding is the same work whether a bot or a human raised it, and an authority heuristic ("bot → probably noise") risks dismissing a real bot-caught bug. The merit tripwires (does the finding hold? does the fix actually help?) naturally filter bot noise — mostly speculative or immaterial — without ever needing to classify the source. The same applies to *form* — inline thread vs. formal review body vs. top-level comment changes only how the reply is posted and resolved, never whether the finding is correct.

**Why drop bot wrappers silently?**
Because announcing them adds noise without value. CodeRabbit boilerplate ("Here are some automated review suggestions...") wraps real findings; the wrapper itself isn't actionable. Counting or listing dropped wrappers in the summary clutters the report. The script-level filter handles only CI/status bots; the content-aware drop (an actionability check, not a source check) catches the rest.

**What if two parallel agents conflict?**
The file-collision check before dispatch catches most cases — overlapping items serialize. For rare cases where a fix expands beyond its referenced file (rename updates callers elsewhere), the combined validation in step 5 catches test breakage and the verify step in step 8 catches unresolved threads. If either surfaces inconsistency, the skill re-runs the affected agents sequentially.

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
