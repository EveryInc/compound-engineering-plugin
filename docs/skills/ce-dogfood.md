# `ce-dogfood`

> Hands-off, diff-scoped browser QA of the active branch — maps flows, drives a real browser, autonomously fixes small breakages with regression tests and commits, and writes a durable report. Manual invocation only.

`ce-dogfood` acts as a QA engineer who dogfoods the **active branch** end to end: it understands every change versus the trunk, maps the user flows the diff touches, exercises each flow in a real browser via `agent-browser`, judges both correctness and experience (including per-persona paper cuts), fixes what's safely fixable on its own — adding a regression test and committing each fix — escalates what isn't, and leaves a durable report under `docs/dogfood-reports/`.

It is **diff-scoped**, not whole-app exploration, and it is **hands-off**: once invoked it runs the full loop autonomously. Because it edits code and creates commits, it is **manual-invocation only** (`disable-model-invocation: true`).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Maps diff → flows → test matrix, drives each flow in a browser, autonomously fixes small breakages (with regression tests + commits), escalates big ones, writes a report |
| When to use it | Before shipping a branch, when you want a real-browser pass that also *fixes* what it finds — not just reports |
| What it produces | A durable report (`docs/dogfood-reports/<date>-<branch>-dogfood.md`): flows, test matrix, fixes, paper cuts, escalations, learnings, verdict |
| How it differs from `ce-test-browser` | `ce-test-browser` tests and reports; `ce-dogfood` adds autonomous fixing, regression tests, fix commits, persona-level experiential judgment, and a durable report artifact |
| Invocation | Manual only — type `/ce-dogfood` |

---

## The Problem

A branch can pass static review and unit tests and still be broken or rough in the browser — and finding that out usually means a manual click-through that:

- **Tests pages, not journeys** — the email "sends" but lands in the wrong thread; the form saves but the redirect drops you somewhere confusing
- **Stops at "does it work"** — it never asks whether the change *feels* right for the people who actually use the product
- **Finds bugs but doesn't fix them** — the QA pass produces a list, and the fixing is a separate, later task
- **Lets fixed bugs regress** — nothing locks in the fix with a test
- **Leaves no durable trace** — the next person re-derives the same flows from scratch

## The Solution

`ce-dogfood` runs the whole loop as one hands-off pass:

- **Flow-first** — it maps the journeys the diff touches as Mermaid flowcharts *before* building the test matrix, so it tests the journey, not isolated widgets
- **Persona-grounded** — it grounds flows in the product's personas (from `STRATEGY.md` / `VISION.md` / persona docs, or an inferred persona) and walks each flow looking for **paper cuts**
- **Autonomous fix loop** — small, low-risk, unambiguous breakages get fixed in place, each with a regression test that fails-before/passes-after and its own commit
- **Knows when to stop** — large, ambiguous, or product-altering changes are escalated as "Decisions for a human," not forced
- **Verifies before the verdict** — runs the project's existing test suite once before declaring the branch ready
- **Durable artifact** — a report doc that doubles as a resume checkpoint

---

## What Makes It Novel

### 1. Flows before the matrix

The skill maps each user-visible change as a Mermaid `flowchart` — entry point, actions, branch points, side effects, true end state (including email click-through destinations) — and only then derives the test matrix from those diagrams. The flowcharts are the understanding; they become the spine of the matrix and ship in the report. The mapping scales to the diff: a one-route change gets one small flowchart, never a skipped step.

### 2. Functional *and* experiential judgment

Every scenario is judged twice: "does it work?" (right data, right destination, no console errors) and "does it feel right?" The skill walks each flow as each primary persona and records **paper cuts** — small frictions that pass a functional test but degrade the experience for that persona. A scenario can `Pass` functionally and still carry paper cuts.

### 3. Autonomous fix loop with a size gate

When a scenario fails — or a passing scenario carries a sharp paper cut worth fixing now — the skill first judges whether the fix is **its** to make. It auto-fixes only small, well-understood, low-risk changes; anything requiring an architecture/schema decision, changing product behavior, spanning many files, or with plausible competing solutions is escalated instead of forced. Each autonomous fix gets a regression test (or, for a pure copy/visual fix, a documented replay/screenshot check and a note on why no automated test was meaningful) and its own commit.

### 4. Escalation as a first-class outcome

"Too big to fix autonomously" is a normal result, not a failure. The skill records each one under **Decisions for a human** — what's broken, why it's not a safe autonomous fix, the options with trade-offs, and a recommendation — and marks the scenario `Blocked (human decision)`.

### 5. Resumable by design

The report doc is created as soon as the matrix exists and updated incrementally, so a run can be interrupted and resumed (or picked up by a teammate). On resume, done scenarios stay done and pending ones re-queue — but the two `Blocked` states are surfaced to the user rather than silently re-run, because they're waiting on a person.

### 6. A suite check before "ready"

A green browser matrix with a red test suite is not "ready." Before the verdict, the skill runs the project's existing automated tests (plus the new regression tests), discovering the command from the project's conventions rather than assuming a runner.

---

## `ce-dogfood` vs `ce-test-browser`

Both take a PR / branch and drive a browser over diff-affected pages. `ce-test-browser` prefers a capable host-native browser and falls back to `agent-browser`; `ce-dogfood` currently requires `agent-browser`. Pick by what you want at the end:

| | `ce-test-browser` | `ce-dogfood` |
|---|---|---|
| Output | A test summary | A durable report + committed fixes |
| Fixes breakages? | No — reports them | Yes — small ones autonomously, with regression tests |
| Experiential judgment | Functional focus | Functional + per-persona paper cuts |
| Flow modeling | Route-oriented | Journey-first (Mermaid flowcharts) |
| Autonomy | Asks how to proceed on failures | Hands-off: fixes, escalates, continues |
| Invocation | Model- or user-invokable | Manual only |

Use `ce-test-browser` for a lighter "do the affected pages still work" pass; reach for `ce-dogfood` when you want the branch driven to genuinely-ready, with fixes applied.

---

## When to Reach For It

Reach for `ce-dogfood` when:

- You have a branch you want driven to genuinely-ready in a real browser, not just smoke-tested
- You want breakages *fixed and locked in with tests*, not just listed
- You care whether the change feels right for real users, not only whether it works
- You want a durable QA artifact for the branch

Skip it when:

- The change is backend-only with no browser-visible behavior → use the project's test runner
- You only want a quick "does it still render" check → use `/ce-test-browser`
- `agent-browser` isn't installed → run `/ce-setup` first
- The dev server can't be brought up locally → use a different approach

---

## Use Standalone

- **Current branch** — `/ce-dogfood`
- **Specific PR** — `/ce-dogfood 847`
- **Specific branch** — `/ce-dogfood feature/new-dashboard`
- **Custom port** — `/ce-dogfood --port 5000`

The skill refuses to run on the trunk (there is no diff to dogfood) and offers to run in an isolated worktree so the main checkout stays untouched.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Dogfoods the current branch |
| `<PR number>` | Checks out and dogfoods that PR |
| `<branch name>` | Checks out and dogfoods that branch |
| `--port <number>` | Override port detection |

Required: `agent-browser` CLI installed (run `/ce-setup` if missing); a local dev server the skill can start.

---

## See Also

- [`ce-test-browser`](./ce-test-browser.md) — the lighter test-and-report sibling
- [`ce-worktree`](./ce-worktree.md) — isolation offered in Phase 0
- [`ce-debug`](./ce-debug.md) — root-cause analysis for non-obvious failures
- [`ce-commit`](./ce-commit.md) — well-scoped commit messages for each fix
- [`ce-compound`](./ce-compound.md) — capture reusable lessons surfaced during the pass
- [`ce-setup`](./ce-setup.md) — reports whether `agent-browser` is available and prints the install command when missing
