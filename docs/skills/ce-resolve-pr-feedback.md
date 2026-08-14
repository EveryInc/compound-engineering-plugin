# `ce-resolve-pr-feedback`

> Evaluate, fix, and reply to PR review feedback in one pass. Fix what is real. Do not churn on what is not.

`ce-resolve-pr-feedback` is the **fix-the-comments-now** skill. It is a git-workflow tool, not a core-loop step. After reviewers comment, it fetches unresolved threads, judges every finding in one place, and dispatches fixers only for items it has already approved. Then it commits, pushes, replies, and resolves threads.

That is a single pass (at most two fix-verify cycles). It is not a watch loop. `/ce-babysit-pr` is the skill that sits on an open PR over time and *calls this one* whenever new comments arrive. Use this skill when you want the comments handled now. Use babysit when you want that repeated until the PR looks ready.

It judges on merit, not source or form. Human or bot, inline thread or top-level comment: the finding is either real or it is not. The default is to fix. It diverts only when reading the code trips a concrete signal.

GitHub only, including GitHub Enterprise that `gh` is configured for.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Fetches unresolved review feedback, judges it centrally, fixes the approved items, commits, replies, and resolves |
| When to use it | A PR has review comments you want addressed now |
| What it produces | Commits with fixes, a reply on each item, resolved threads (except `needs-human`), and a per-verdict summary |
| Modes | Full (all unresolved feedback) or Targeted (one `#discussion_r` thread) |

---

## Example invocations

Empty, a PR number, or a bare `/pull/N` URL is **Full** mode. Only a `#discussion_r` fragment is **Targeted**. A `#issuecomment-` URL is Full: top-level comments have no review thread to pin.

```text
# All new unresolved feedback on this branch's PR
/ce-resolve-pr-feedback

# Same Full pass on a numbered PR
/ce-resolve-pr-feedback 1234

# Full pass from a URL (fork-safe; GHE host is taken from the URL)
/ce-resolve-pr-feedback https://github.com/acme/widgets/pull/1234

# Targeted: only that inline review thread. Every other thread is left alone.
/ce-resolve-pr-feedback https://github.com/acme/widgets/pull/1234#discussion_r5678901

# Top-level comment URL: Full mode, not Targeted
/ce-resolve-pr-feedback https://github.com/acme/widgets/pull/1234#issuecomment-9876543
```

To keep handling later rounds as they arrive, use `/ce-babysit-pr` instead.

---

## The Problem

Resolving a pile of review comments by hand, or with a "fix everything" reflex, fails in familiar ways:

- Review bots over-flag. Blindly applying them churns the PR
- A finding is taken on authority ("a reviewer said so") without checking the code
- Top-level comments and review bodies have no resolve API, so they come back every run
- Bot wrapper text ("Here are some automated review suggestions...") inflates the work count
- Twelve threads handled one at a time waste wall-clock. Twelve in parallel collide on the same file
- Each fixer tests only its own change. Cross-agent breakage slips through

## The Solution

The skill runs a fixed pipeline:

1. Fetch unresolved review threads, PR comments, and review bodies
2. Triage new vs already handled. A substantive deferral counts as handled. Bot wrappers are dropped silently
3. Judge every new item in the orchestrator's own context (the legitimacy gate)
4. Dispatch fixers only for approved fixes. Overlapping files serialize
5. One full validation run on the combined diff
6. Commit and push
7. Reply with a quote of the original ask, then resolve review threads via GraphQL
8. Re-fetch. If new threads remain, one more cycle. After two cycles, escalate the pattern as `needs-human`

If you have an unsubmitted (PENDING) review on the PR, the skill stops before it replies. Those replies would disappear into the draft. Submit or discard that review yourself; the skill will not.

---

## What Makes It Novel

### Default to fixing. Divert only on a tripwire

Most feedback, nitpicks included, is correct. Validation is not a separate analysis pass. The agent has to read the code to make the fix anyway, and it diverts only on a signal it notices during that read:

- The finding does not hold -> `not-addressing` with evidence
- The fix would make the code worse -> `declined`, citing the harm
- The change buys nothing real (the bar is "no benefit," not "minor") -> `replied`
- Risk cannot be bounded -> de-risk with a test if possible, else `needs-human`
- It is a question -> `replied`, or `needs-human` for a product call
- The fix would reverse a *deliberate* design choice (positive evidence of intent, plus a real disagreement) -> `needs-human`. "The code currently does X" is not evidence of intent

"I'm uneasy" is not a tripwire. Source does not matter. A bot can be right; a human can be wrong.

### Judge once, then fan out only the fixes

The orchestrator holds every thread from a single fetch. It can read a file once, cluster a systematically wrong reviewer, and weigh the author's design intent. Subagents implement approved fixes. They do not re-judge.

1-4 fixes run in parallel. 5+ go in batches of 4. Two fixers that touch the same file never run at the same time. Harnesses without parallel dispatch run them sequentially.

When the same invariant applies to other sites **this PR introduced**, those sites become one class fix, not a drip of follow-up nits.

### Six verdicts

| Verdict | Meaning | Action |
|---------|---------|--------|
| `fixed` | Change made as requested | Commit + reply + resolve |
| `fixed-differently` | Change made, better approach than suggested | Commit + reply explaining the divergence + resolve |
| `replied` | No code change: question answered, or change not warranted | Reply + resolve |
| `not-addressing` | Finding is factually wrong about the code | Reply with evidence + resolve |
| `declined` | Suggested fix would make the code worse | Reply citing harm + resolve |
| `needs-human` | Cannot determine the right action | Reply with `decision_context`, leave open |

`needs-human` is rare. It includes what the reviewer said, what was investigated, why a decision is needed, and options with tradeoffs. Escalations never block the rest of the run. That is what lets `/ce-babysit-pr` call this skill unattended.

### Full vs Targeted

| Mode | When | Behavior |
|------|------|----------|
| **Full** (default) | Empty, PR number, `/pull/N` URL, or `#issuecomment-` | All unresolved feedback on that PR |
| **Targeted** | `#discussion_r` fragment | That review thread only |

---

## Quick Example

A reviewer and a review bot leave eight comments. You invoke `/ce-resolve-pr-feedback`.

Fetch returns six unresolved threads, two review bodies (one is a CodeRabbit wrapper), and no PR comments. The wrapper is dropped. One thread already has a deferral from yesterday; it stays pending. Five threads and one review body are new.

The orchestrator judges all six, reading `app/services/dispatcher.rb` once for the two threads that land there:

- Two findings are correct -> `fixed`
- One suggested approach works; a cleaner one exists -> `fixed-differently`
- One bot "possible null deref" is already ruled out by the type system -> `not-addressing`
- One "is this intentional?" is answerable from the code -> `replied`
- The review body is a design question -> `replied`

Only three items need a fixer. The two `dispatcher.rb` edits serialize; the third runs in parallel. Combined validation passes. Commit and push. Five threads resolve; the review body gets a top-level reply. Verify is empty. The summary lists what was done per verdict.

---

## When to Reach For It

Use `ce-resolve-pr-feedback` when:

- A PR has review feedback you want addressed now
- A review bot left a pile of findings and you want them checked against the code
- You want one comment handled in isolation (Targeted mode, `#discussion_r` URL)
- A previous run left `needs-human` items and you have decided what to do

Skip it when:

- The PR has no feedback yet
- You only want to acknowledge comments. This skill expects to act
- The feedback is on a brainstorm or plan doc, not code -> `/ce-doc-review`
- You want comments *and* CI *and* later rounds handled while you step away -> `/ce-babysit-pr`

---

## Chain Position

One-shot closer after a PR has comments. Not a watch.

```text
/ce-work  ->  /ce-commit-push-pr  ->  reviewers comment  ->  /ce-resolve-pr-feedback
                                                              ^
/ce-babysit-pr -----------------------------------------------/
```

`/ce-code-review` reviews *before* the PR is open. This skill handles incoming feedback *after*. `/ce-debug` is for broken behavior, not review comments.

---

## Use Standalone

- Current branch: `/ce-resolve-pr-feedback`
- Specific PR: `/ce-resolve-pr-feedback 1234` or a `/pull/N` URL
- One thread: `/ce-resolve-pr-feedback https://github.com/.../pull/1234#discussion_r5678901`

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Full mode, current branch's PR |
| `<PR number>` | Full mode, that PR |
| `<PR URL>` (`.../pull/N`, no fragment) | Full mode on that host/repo/PR |
| `<#discussion_r URL>` | Targeted mode: only that review thread |
| `<#issuecomment- URL>` | Full mode (no thread to target) |
| `mode:pipeline` | Non-interactive. Used by `/ce-babysit-pr`. Parks `needs-human` on the thread and returns residuals. |

Scripts (from this skill's directory): `get-pr-comments`, `get-thread-for-comment`, `reply-to-pr-thread`, `resolve-pr-thread`.

---

## FAQ

**Does it still fix nitpicks?**
Yes, by default. A correct nit that improves the code gets fixed. A purely cosmetic one with no benefit gets a brief reply. The skip bar is "no benefit," not "minor."

**Does it treat bot feedback differently from human feedback?**
No. Reading the code is the same work either way. An "it's a bot, so ignore it" rule would drop real bugs. Form only changes the reply mechanic: inline threads resolve via GraphQL; review bodies and top-level comments get a top-level reply.

**Why drop bot wrappers silently?**
Announcing them adds noise. The wrapper around CodeRabbit findings is not actionable. The findings inside it still go through the gate.

**What if two parallel fixers conflict?**
Overlapping files serialize before dispatch. If a fix expands to callers in another file, combined validation and the verify pass catch the breakage, and those agents re-run sequentially.

**What does `needs-human` mean?**
The agent investigated and still cannot choose. The thread stays open. The summary includes `decision_context`: quoted feedback, findings, options, and a lean if any.

**What if the loop never converges?**
After two fix-verify cycles, it stops and escalates the recurring pattern as `needs-human`. It does not retry forever.

**I have an unsubmitted review on the PR.**
The skill stops. Replies posted during a PENDING review are swallowed by that draft. Submit or discard the review, then re-invoke.

---

## See Also

- [`/ce-babysit-pr`](./ce-babysit-pr.md): watch the PR over time; calls this skill for each comment round
- [`/ce-code-review`](./ce-code-review.md): pre-PR review
- [`/ce-commit-push-pr`](./ce-commit-push-pr.md): opens the PR this skill responds to
- [`/ce-debug`](./ce-debug.md): broken behavior, not review comments
- [`/ce-doc-review`](./ce-doc-review.md): feedback on requirements or plan docs
