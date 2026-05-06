# `ce-debug`

> Find root causes systematically — trace the full causal chain before proposing any fix, refuse symptom-level patches, escalate when stuck.

`ce-debug` is the **investigation-first** debugging skill. It refuses to propose a fix until it can explain the full causal chain from trigger to symptom with no gaps. For uncertain links in that chain, it requires a **prediction** — something in a different code path or scenario that must also be true if the link is right. **When a prediction is wrong but a fix appears to work, the skill flags it: you found a symptom, not the cause.**

It self-sizes. A missing-import bug flows through phases in seconds; a tangled cross-subsystem regression spends more time in each naturally. No complexity classification, no phase skipping. The fix is optional — diagnosis-only is a first-class outcome.

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-debug` is the bug-shaped sibling to `/ce-work` — when the input is broken behavior rather than a feature to build, this skill takes over. It can also escalate to `/ce-brainstorm` when investigation reveals the bug isn't really a bug; it's a design problem.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Investigates a bug end-to-end (reproduce, trace, root-cause), forms hypotheses with predictions, optionally implements a test-first fix, and hands off to commit + PR |
| When to use it | Failed tests, error messages, regressions, GitHub/Linear/Jira issue references, "I've been stuck on this for hours" |
| What it produces | A debug summary with root cause, recommended tests, and (if you opt in) a PR with the fix |
| What's next | Auto commit + PR by default; or "diagnosis only" if you'd rather take it from there |

---

## The Problem

Common debugging anti-patterns:

- **Shotgun fixes** — change three things at once "to see if it helps"; if anything works, you don't know why
- **Symptom-level patches** — the bug stops manifesting after the change, but the root cause is still active and surfaces somewhere else weeks later
- **Wrong-assumption fixation** — the hypothesis is correct, but you're testing it against an assumption (the framework behaves this way, this function returns what its name implies) that isn't true
- **"Just try one more thing" loops** — three failed fixes in a row means the diagnosis is wrong; trying harder makes it worse
- **Fixing the first thing that looks wrong** — the root cause is where bad state originates, not where it's first observed

## The Solution

`ce-debug` runs investigation as a structured process with explicit gates:

- **Causal chain gate** — no fix proposed until the chain is explained end-to-end with no gaps
- **Predictions for uncertain links** — something in a different code path that must also be true if the link is right
- **Assumption audit** — list "this must be true" beliefs your understanding depends on, mark each verified or assumed
- **One change at a time** — anti-shotgun discipline
- **Smart escalation when stuck** — diagnose *why* hypotheses are exhausted, don't just try harder
- **Test-first fix** — write the failing test, verify it fails for the right reason, then implement; never both at once

---

## What Makes It Novel

### 1. Causal chain gate — no fix until the chain is explained

`ce-debug` does not propose a fix until it can explain the full causal chain from trigger to symptom with no gaps. "Somehow X leads to Y" is a gap. The fix gate is structural: there's an explicit phase transition that requires the chain explanation to pass.

### 2. Predictions for uncertain links — anti-symptom-fix

For each uncertain link in the causal chain, the skill states a **prediction**: something in a different code path or scenario that must also be true if this link is correct. **If the prediction is wrong but a fix appears to work, you found a symptom, not the cause.** Predictions aren't required for obvious links (missing imports, clear null dereference); they're a tool for testing uncertainty, not a ritual for every hypothesis.

### 3. Assumption audit — catches right-hypothesis-wrong-assumption

Before forming hypotheses, the skill enumerates the "this must be true" beliefs your understanding depends on — the framework behaves this way here, this function returns what its name implies, the config loads before this runs, the database is in the state the test implies. Each is marked verified (you read the code, checked state, or ran it) or assumed. Many "wrong hypotheses" are actually correct hypotheses tested against a wrong assumption.

### 4. Smart escalation when stuck — diagnose, don't try harder

After 2-3 hypotheses are exhausted without confirmation, the skill diagnoses *why* you're stuck:

- Hypotheses point to different subsystems → likely architecture problem; suggest `/ce-brainstorm`
- Evidence contradicts itself → wrong mental model of the code; step back and re-read without assumptions
- Works locally, fails in CI/prod → environment problem; focus on env, config, dependencies, timing
- Fix works but prediction was wrong → symptom fix; the real cause is still active

### 5. Issue tracker integration — reads the full thread

When the input references an issue (`#123`, GitHub URL, Linear URL, Jira key), the skill fetches the full conversation including all comments — not just the original description. Comments frequently contain updated reproduction steps, narrowed scope, prior failed attempts, and pivots to a different suspected root cause. Treating the opening post as the whole picture often sends the investigation in the wrong direction.

### 6. Test-first fix discipline

If you opt to fix (rather than "diagnosis only"), the skill writes a failing test that captures the bug, verifies it fails for the right reason (the root cause, not unrelated setup), implements the minimal fix, and verifies the test passes. The test-and-fix-in-the-same-step shortcut is explicitly disallowed.

### 7. Conditional defense-in-depth

When the root-cause pattern appears in 3+ other files, or the bug would have been catastrophic in production, the skill considers four defense layers (entry validation, invariant check, environment guard, diagnostic breadcrumb) and applies what fits. For one-off errors with no realistic recurrence, defense-in-depth is skipped.

### 8. Brainstorm escalation when bug reveals a design problem

Concrete signals trigger a `/ce-brainstorm` recommendation rather than a fix: the root cause is a wrong responsibility or interface; the requirements are wrong or incomplete; every fix is a workaround. Size alone doesn't make something a design problem — clear-fix-but-large bugs are still bugs.

---

## Quick Example

You paste a stack trace or a GitHub issue URL. The skill fetches the full issue thread (including comments with the latest reproduction details), reproduces the bug locally, and verifies environment sanity (correct branch, dependencies installed, env vars present).

It traces the code path from the error back upstream, asking "where did this value come from?" until it reaches the point where valid state first became invalid. It performs an assumption audit and flags one belief as unverified.

It forms two hypotheses, ranked by likelihood. The first is testable directly; the second has an uncertain link, so it generates a prediction: if this link is right, a different code path that calls the same function under different conditions should also fail. It tests the prediction.

The prediction holds. The skill presents the root cause with file:line references, the proposed fix, and the specific tests that should be added (with assertion guidance). It asks: fix it now, diagnosis only, or rethink the design?

You pick "fix it now." It creates a feature branch, writes the failing test, verifies it fails for the right reason, implements the minimal fix, runs tests, and hands off to `/ce-commit-push-pr`.

---

## When to Reach For It

Reach for `ce-debug` when:

- A test is failing and you need to know why
- You have an error message, stack trace, or unexpected behavior
- A regression appeared and you need to find when it broke
- You have a GitHub, Linear, or Jira issue reference
- You've been stuck on a problem after a few failed fix attempts
- You suspect the bug surface is wider than one symptom (defense-in-depth territory)

Skip `ce-debug` when:

- You already know the root cause and the fix is obvious — just fix it (or use `/ce-work` for a small change)
- The "bug" is really a feature decision in disguise → `/ce-brainstorm`
- The work is implementing something new, not investigating something broken → `/ce-work`

---

## Use as Part of the Workflow

`ce-debug` interlocks with the rest of the chain in three ways:

- **Called from `/ce-plan`** — when a planning prompt is bug-shaped (error message, "fix the bug where X", regression), `ce-plan` surfaces `ce-debug` as a route-out option before doing structural planning
- **Escalates to `/ce-brainstorm`** — when investigation reveals a design problem rather than a logic error, the skill recommends rethinking before implementing
- **Hands off to `/ce-commit-push-pr`** — after a successful fix on a skill-created branch, the skill defaults to commit-and-PR without further prompting (with an explicit override path if your repo's `AGENTS.md` says otherwise)

After a PR opens, the skill optionally offers `/ce-compound` to capture learning — but only when the bug is generalizable (3+ recurrence, wrong assumption about a shared dependency). Localized mechanical fixes are skipped silently to avoid cluttering `docs/solutions/` with one-off entries.

---

## Use Standalone

`ce-debug` is the standalone entry point for most bug work:

- **Failing test** — `/ce-debug spec/models/notification_subscription_spec.rb`
- **Error message paste** — `/ce-debug` followed by a stack trace
- **GitHub issue** — `/ce-debug #1234` or `/ce-debug https://github.com/.../issues/1234`
- **Linear ticket** — `/ce-debug ABC-456` or paste the URL
- **Stuck on something** — `/ce-debug "why is X returning undefined when Y"`

When you only want the diagnosis (you'll handle the fix yourself), pick "Diagnosis only — I'll take it from here" at the Phase 2 handoff. The summary is still produced; the test recommendations are part of the diagnosis regardless.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks for the bug description |
| `<error message or stack trace>` | Direct investigation |
| `<test path>` | Reproduces the failing test, traces from there |
| `<issue reference>` (`#123`, URL, Linear ID, Jira key) | Fetches the full thread, reads all comments |
| `<description>` | e.g., "why is the cart total wrong on checkout" |

---

## FAQ

**Why investigate before fixing?**
Fixes that aren't tied to a clear causal chain often address symptoms rather than the cause. The bug stops manifesting, but the real problem is still active and surfaces somewhere else weeks later. The causal chain gate is the structural defense against this.

**What's the difference between a hypothesis and a prediction?**
A hypothesis says "I think this is the cause." A prediction says "if my hypothesis is right, then *this other thing* must also be true." Predictions test the hypothesis against independent evidence — and if the prediction is wrong but a fix works, you've found a symptom.

**When should the skill suggest `/ce-brainstorm`?**
Only when the bug can't be properly fixed within the current design — wrong responsibility, wrong interface, requirements gap, or every fix is a workaround. Size alone doesn't make something a design problem.

**What if I just want to fix it without all this process?**
Skip the skill — go directly to `/ce-work` or just edit the file. `ce-debug` is for cases where the root cause isn't obvious or the fix has failed to stick.

**Does it work for non-software bugs?**
Not really — the skill assumes code, tests, and a tracker. The investigation discipline (causal chain, predictions, assumption audit) generalizes, but the skill's mechanics (test-first fix, defense-in-depth, PR handoff) are software-shaped.

---

## See Also

- [`ce-plan`](./ce-plan.md) — routes bug-shaped prompts here when you start at planning
- [`ce-brainstorm`](./ce-brainstorm.md) — escalation target when the bug reveals a design problem
- [`ce-work`](./ce-work.md) — sibling skill for feature work; use this when input isn't bug-shaped
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — handles the final commit + PR after a fix
- [`ce-compound`](./ce-compound.md) — capture reusable learning when the bug is generalizable
