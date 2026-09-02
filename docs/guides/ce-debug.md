# `ce-debug`

> Find the root cause before proposing a fix. Trace the causal chain, refuse symptom-level patches, escalate when stuck.

`ce-debug` is the on-demand investigation skill for broken behavior. It refuses to propose a fix until it can explain the full causal chain from trigger to symptom with no gaps. For uncertain links in that chain it requires a prediction, something in a different code path that must also be true if the link is right. When a prediction is wrong but a fix appears to work, the skill flags it: you found a symptom, not the cause.

It right-sizes. Trivial bugs (typos, missing imports, obvious one-line fixes) take a fast path in triage: present the cause, ask Fix / Diagnosis only, then stop. Everything else goes through the full framework. The fix is optional, and diagnosis-only is a first-class outcome. When you do choose a fix, non-trivial diffs continue through simplify and code review before the PR handoff.

It is not a verdict (`ce-pov`), not findings on a document (`ce-doc-review`), and not findings on a diff (`ce-code-review`). Use this when something is observably broken, including observably slow. A performance regression's reproduction is a numeric baseline measurement, and the fix is verified by re-measuring, not by reading code.

`ce-plan` offers this skill when a planning prompt is bug-shaped. Orchestrators such as `ce-babysit-pr` and `lfg` invoke it with `mode:pipeline` to fix convergent CI failures without asking.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Investigates a bug (reproduce, trace, root-cause), forms hypotheses with predictions, optionally implements a test-first fix, then polishes and reviews non-trivial fixes |
| When to use it | Failed tests, error messages, regressions, a reliably slow operation, an issue reference from your tracker or error monitor (GitHub, Linear, Jira, Sentry), "I've been stuck on this for hours" |
| What it produces | A debug summary with root cause, recommended tests, and (if you opt in) an applied fix plus post-fix quality notes. Pipeline mode returns structured JSON |
| What's next | Fix it now, diagnosis only, or rethink the design. After a fix, it commits and, when the branch holds only that fix, opens a PR without asking |

---

## Example invocations

A failing test, a tracker issue, observed behavior, or a paste. Empty invoke waits for the error. `mode:pipeline` is for orchestrators.

```text
# Start from a failing test. Reproduces that test, then traces from there.
/ce-debug spec/models/notification_subscription_spec.rb

# Start from an issue and read the full comment thread, not just the opening post
/ce-debug https://github.com/acme/widgets/issues/1234
/ce-debug #1234
/ce-debug ABC-456

# Start from observed behavior when no ticket exists
/ce-debug the digest job sends duplicate emails after a retry

# Empty invoke: asks for the bug description. Paste a stack trace in the next turn.
/ce-debug

# Orchestrator path (ce-babysit-pr, lfg). No questions. Fixes convergent bugs only.
/ce-debug mode:pipeline the checkout job fails on test/checkout_spec.rb
```

Describe what is observably broken, not the fix you suspect. The skill validates the causal chain before changing code.

---

## The Problem

Debugging fails in predictable ways:

- Shotgun fixes. Change three things at once "to see if it helps." If anything works, you don't know why
- Symptom-level patches. The bug stops manifesting, but the root cause is still active and surfaces somewhere else later
- Wrong-assumption fixation. The hypothesis is correct, but you are testing it against an assumption that isn't true
- "Just try one more thing" loops. Three failed fixes in a row means the diagnosis is wrong
- Fixing the first thing that looks wrong. The root cause is where bad state originates, not where it is first observed

## The Solution

`ce-debug` runs the investigation with explicit gates:

- Causal chain gate. No fix proposed until the chain is explained end-to-end with no gaps
- Diagnosis before the choice. The findings block is written in full before the Fix / Diagnosis-only / Rethink question opens
- Predictions for uncertain links. Something in a different code path that must also be true if the link is right
- Assumption audit. List "this must be true" beliefs, mark each verified or assumed
- One change at a time
- Escalation when stuck. Diagnose why hypotheses are exhausted instead of trying variants
- Test-first fix. Inspect existing tests first, use or strengthen the right test home, verify it fails for the right reason, then implement
- Post-fix quality tail. For non-trivial fixes, simplify the relevant diff, run a scoped code review, and preserve residuals before shipping

---

## What Makes It Novel

### Causal chain gate

The skill does not propose a fix until it can explain the full causal chain from trigger to symptom. "Somehow X leads to Y" is a gap.

The findings block (root cause with file:line references, the proposed fix, the recommended tests, any related ticket or PR) is written in full before the Fix it now / Diagnosis only / Rethink the design question opens. Blocking-question tools render only their own stem on modal harnesses, so a question fired on "root cause confirmed" alone would leave you choosing with none of the chain on screen.

### Predictions for uncertain links

For each uncertain link, the skill states a prediction: something in a different code path or scenario that must also be true if this link is correct. If the prediction is wrong but a fix appears to work, you found a symptom. Obvious links (missing imports, a clear null dereference) don't need predictions.

### Assumption audit

Before forming hypotheses, the skill lists the "this must be true" beliefs the understanding depends on: the framework behaves this way here, this function returns what its name implies, the config loads before this runs. Each is marked verified or assumed. Many "wrong hypotheses" are correct hypotheses tested against a wrong assumption.

### Escalation when stuck

After 2-3 hypotheses are exhausted without confirmation, the skill diagnoses why:

- Hypotheses point to different subsystems: likely an architecture problem. Suggest `/ce-brainstorm`
- Evidence contradicts itself: wrong mental model. Step back and re-read without assumptions
- Works locally, fails in CI/prod: environment problem. Focus on env, config, dependencies, timing
- Fix works but prediction was wrong: symptom fix. The real cause is still active

Three failed fix attempts hits the same gate: invalidate the current hypothesis before forming a new one. Don't retry variants of the same theory.

### Issue tracker integration

When the input references an issue (`#123`, GitHub URL, Linear URL, Jira key, Sentry issue), the skill fetches the full conversation, including all comments. Comments frequently contain updated reproduction steps, narrowed scope, prior failed attempts, and pivots to a different suspected root cause.

Whatever you hand it becomes the issue of record. The skill links back to that one and never opens a duplicate for the same bug in another system, even when the repo's own tracker is something else. A Sentry issue counts as much as a Linear ticket. New tickets are only ever filed for a different problem found along the way.

### A dirty tree is a suspect

If you have uncommitted work when you invoke the skill, it treats that as a hypothesis rather than noise. The most common reason to be debugging at all is that your own in-progress edit caused the failure. When the changed files could plausibly reach the failing behavior, it stashes them (`-u`, so untracked files go too), reruns the reproduction, and pops immediately with `--index` so your staging survives. If the failure disappears, your edit is the cause and the investigation ends. If it persists, your edit is ruled out and the tree is clean to trace. It never auto-resolves a pop conflict in your work, and it never stashes just to simplify its own shipping route.

### Test-first fix, then a scoped quality tail

If you opt to fix, the skill first inspects existing tests for the affected behavior. It uses an existing failing test when one already captures the bug, updates or strengthens the test that owns the contract, or adds a focused regression test only when nothing fits. It verifies the failure, applies the smallest root-cause fix, reruns the focused test plus broader checks, then self-reviews the diff.

After the fix is green, non-trivial diffs run the same quality tail as the shipping workflow: simplify first when the diff is large enough to benefit, then review the final fix. Tiny mechanical fixes skip this with a reason. Simplify always gets an explicit scope of the bug-fix files, never the branch diff, so it cannot reach unrelated work in progress. Review is scoped the same way unless the tree was clean enough to prove a diff base is the fix. Files with overlapping pre-existing edits skip file-level simplification. Accepted residual findings are written to a durable sink even when you choose commit-only or stop.

### Defense-in-depth, and brainstorm when it is not a bug

When the root-cause pattern appears in 3+ other files, or the bug would have been catastrophic in production, the skill considers four defense layers (entry validation, invariant check, environment guard, diagnostic breadcrumb) and applies what fits. One-off errors with no realistic recurrence skip this.

Concrete signals trigger a `/ce-brainstorm` recommendation rather than a fix: the root cause is a wrong responsibility or interface, the requirements are wrong or incomplete, or every fix is a workaround. Size alone does not make something a design problem.

### Pipeline mode

`mode:pipeline` (set by `ce-babysit-pr` or `lfg`) runs fully non-interactively. It fixes convergent bugs (the code is not meeting its planned or tested intent) and defers divergent ones (the "failure" would reverse a deliberate contract or product decision). It does not create branches, does not run the polish/review tail, and returns a structured JSON result: `fixed-and-pushed`, `fixed-not-pushed` when the fix is committed but could not be pushed, `diagnosed-no-fix`, `flaky-infra`, or `needs-human`. A design problem becomes a `needs-human` residual, never a brainstorm handoff.

---

## Quick Example

You paste a GitHub issue URL. The skill fetches the full issue thread, reproduces the bug locally, and checks environment sanity (correct branch, dependencies installed, env vars present).

It traces the code path from the error back upstream, asking "where did this value come from?" until it reaches the point where valid state first became invalid. The assumption audit flags one belief as unverified.

It forms two hypotheses, ranked by likelihood. The first is testable directly. The second has an uncertain link, so it generates a prediction: if this link is right, a different code path calling the same function under different conditions should also fail. It tests the prediction.

The prediction holds. The skill presents the root cause with file:line references, the proposed fix, and the specific tests to use, update, strengthen, or add. Then it asks: fix it now, diagnosis only, or rethink the design?

You pick "fix it now." It creates a feature branch (you were on the default branch), updates the right test or adds a focused one, verifies it fails for the right reason, implements the minimal fix, and runs tests. Because the fix is non-trivial, it runs simplify before code review, applies clear review findings when the review scope is fix-only, reruns targeted checks, records Post-Fix Quality, and hands off to `/ce-commit-push-pr`.

---

## When to Reach For It

Use `ce-debug` when:

- A test is failing and you need to know why
- You have an error message, stack trace, or unexpected behavior
- A regression appeared and you need to find when it broke
- You have an issue reference from a tracker or error monitor (GitHub, Linear, Jira, Sentry)
- You have been stuck after a few failed fix attempts
- You suspect the bug surface is wider than one symptom

Skip `ce-debug` when:

- You already know the root cause and the fix is obvious. Just fix it, or use `/ce-work` for a small change
- The "bug" is really a feature decision in disguise: `/ce-brainstorm`
- The work is implementing something new, not investigating something broken: `/ce-work`
- You want findings on a diff, not an investigation: `/ce-code-review`
- You want a verdict on exposure (is this CVE ours?) rather than a live failure: `/ce-pov`

---

## Use as Part of the Workflow

`ce-debug` is an on-demand investigation that other skills route into:

- Offered from `/ce-plan` when a planning prompt is bug-shaped (error message, "fix the bug where X", regression)
- Called from `/ce-babysit-pr` or `lfg` with `mode:pipeline` on failing jobs
- Escalates to `/ce-brainstorm` when investigation reveals a design problem rather than a logic error
- Runs post-fix quality checks through `/ce-simplify-code` and `/ce-code-review` on non-trivial interactive fixes
- Hands off to `/ce-commit-push-pr` with `branding:on` after a successful fix, without asking permission, when the branch holds only that fix. It previews what it is about to commit so you can interrupt. If the branch also carries unrelated work, or there is no remote, it commits just the fix-owned files locally and pushes nothing. Project instructions that say otherwise (for example "don't open PRs from skills") outrank the default

After a PR opens, the skill offers `/ce-compound` only when the verified fix produced non-obvious, durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. If removing the learning document would not make a future engineer likely to repeat the mistake or redo substantial investigation, the skill skips the offer.

---

## Use Standalone

- **Failing test:** `/ce-debug spec/models/notification_subscription_spec.rb`
- **Error message paste:** `/ce-debug` followed by a stack trace
- **GitHub issue:** `/ce-debug #1234` or `/ce-debug https://github.com/.../issues/1234`
- **Linear or Jira ticket:** `/ce-debug ABC-456` or paste the URL
- **Stuck on something:** `/ce-debug "why is X returning undefined when Y"`

When you only want the diagnosis, pick **Diagnosis only** at the fix-choice gate. The summary is still produced, and the test recommendations are part of the diagnosis either way.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks for the bug description |
| `<error message or stack trace>` | Direct investigation |
| `<test path>` | Reproduces the failing test, traces from there |
| `<issue reference>` (`#123`, URL, Linear ID, Jira key, Sentry issue) | Fetches the full thread, including comments |
| `<description>` | e.g. "why is the cart total wrong on checkout" |
| `mode:pipeline` | Non-interactive. Used by orchestrators. Fixes convergent bugs, defers divergent ones, returns JSON |

---

## FAQ

**Why investigate before fixing?**
Fixes not tied to a clear causal chain often address symptoms. The bug stops manifesting, but the real problem is still active. The causal chain gate is the structural defense against this.

**What's the difference between a hypothesis and a prediction?**
A hypothesis says "I think this is the cause." A prediction says "if my hypothesis is right, this other thing must also be true." Predictions test the hypothesis against independent evidence.

**When should the skill suggest `/ce-brainstorm`?**
Only when the bug cannot be properly fixed within the current design: wrong responsibility, wrong interface, requirements gap, or every fix is a workaround. Size alone does not make something a design problem.

**What if I just want to fix it without all this process?**
Skip the skill. Go directly to `/ce-work` or just edit the file. `ce-debug` is for cases where the root cause is not obvious or the fix has failed to stick.

**Does it always open a PR?**
Whenever the branch holds only the fix, which is the common case and the one the skill optimizes for. It previews the commit and opens a PR without asking: a reviewed fix belongs in a PR, and the preview already gives you a chance to stop it.

If the branch also carries unrelated work it does not push, because pushing would publish work you never offered up. It commits just the fix-owned files locally, tells you what it held back, and opens the PR if you ask. The one case where it stops and asks is entanglement: a file the fix had to touch already contained your own edits, so no commit can separate them and every option costs something.

Diagnosis-only stops after the summary. With no remote configured it commits locally. `mode:pipeline` commits and pushes on the current branch and does not open a PR.

**Does it work for non-software bugs?**
Not really. The skill assumes code, tests, and a tracker. The investigation discipline (causal chain, predictions, assumption audit) generalizes, but the mechanics (test-first fix, defense-in-depth, PR handoff) are software-shaped.

---

## See Also

- [`ce-plan`](./ce-plan.md): routes bug-shaped prompts here when you start at planning
- [`ce-brainstorm`](./ce-brainstorm.md): escalation target when the bug reveals a design problem
- [`ce-work`](./ce-work.md): sibling skill for feature work. Use this when the input is not bug-shaped
- [`ce-simplify-code`](./ce-simplify-code.md): post-fix cleanup pass for non-trivial bug-fix diffs
- [`ce-code-review`](./ce-code-review.md): scoped post-fix review before PR handoff
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): handles the final commit + PR after a fix
- [`ce-compound`](./ce-compound.md): capture reusable learning when the bug is generalizable
- [`ce-pov`](./ce-pov.md): exposure verdict (is this CVE ours?), not a live failure
