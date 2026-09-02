# `ce-dogfood`

> Hands-off, diff-scoped browser QA of the active branch. Maps the journeys the diff touches, drives them in a real browser, fixes small breakages (with a regression test and a commit), and writes a durable report.

`ce-dogfood` is autonomous QA of what this branch changed versus the trunk. It maps those changes as user journeys, exercises them with `agent-browser`, judges correctness and feel (including per-persona paper cuts), fixes what is small and unambiguous, escalates the rest, and leaves a report under `docs/dogfood-reports/`.

It is diff-scoped, not a whole-app crawl. Once invoked it runs without check-ins, except for external flows (OAuth, real email, payments, SMS) and resume questions. It edits code and creates commits, so it is manual invocation only.

It is not `ce-test-browser` (test and report; fixes only if you pick "fix now"), not `ce-polish` (you drive live UX), and not `ce-simplify-code` (code cleanup, no browser).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Maps the branch diff to user flows, drives them in a browser, auto-fixes small issues, escalates the rest, writes a report |
| When to use it | Before shipping a branch, when you want a real-browser pass that also fixes what it can |
| What it produces | `docs/dogfood-reports/<YYYY-MM-DD>-<branch-slug>-dogfood.md`: flows, matrix, fixes, paper cuts, escalations, verdict. Plus any fix commits |
| How it differs from `ce-test-browser` | That skill tests and reports. This one also fixes, adds regression tests, commits, judges feel per persona, and keeps a resumable report |
| Invocation | Manual only. Type `/ce-dogfood` |

---

## Example invocations

Arguments pick which ref to dogfood and, optionally, which port. Empty runs in place on the current branch.

```text
# Current feature branch, in this checkout. Refuses main/master/the default branch
/ce-dogfood

# A PR. Always allowed, even if the head branch is named main. Offers a worktree
/ce-dogfood 847

# A named branch you are not on. Offers isolation, then dogfoods that ref
/ce-dogfood feature/new-dashboard

# Reuse or force a port (detection still applies if you omit this)
/ce-dogfood --port 5000

# Port plus a PR
/ce-dogfood 847 --port 5000
```

If a matching unfinished report already exists, it asks resume or start fresh. Use `/ce-test-browser` when you want a bounded route test rather than this QA loop.

---

## The Problem

A branch can pass review and unit tests and still be broken or rough in the browser. A manual click-through usually:

- Tests pages, not journeys (the email "sends" but opens the wrong thread)
- Stops at "does it work" and never asks whether it feels right for the people who use the product
- Produces a list of bugs and leaves the fixing for later
- Does not lock a fix in with a test
- Leaves no file the next person can resume

## The Solution

One pass:

- Map each user-visible change as a Mermaid flowchart before building the test matrix
- Ground flows in product personas (`STRATEGY.md`, `VISION.md`, persona docs, or one inferred persona)
- Walk each flow for paper cuts as well as functional failures
- Auto-fix only small, low-risk, unambiguous breakages, each with a regression test (or a documented replay/screenshot check when no automated test is meaningful) and its own commit
- Escalate architecture, schema, product, or large changes as "Decisions for a human"
- Run the project's existing test suite before calling the branch ready
- Write the report as soon as the matrix exists and update it after every scenario, so the run can stop and resume

---

## What Makes It Novel

### Flows before the matrix

Each user-visible change becomes a flowchart: entry, actions, branches, side effects, true end state (including email click-through). The matrix comes from those diagrams, not from a flat page list. A one-route change gets one small chart. Mapping is never skipped.

### Functional and experiential judgment

Every scenario is scored twice: right data, right destination, no console errors; and whether it feels aligned with the product. Walking the flow as each primary persona produces paper cuts, small frictions that still `Pass` functionally. A sharp paper cut can enter the fix loop. The rest stay in the report.

### Size-gated autonomous fixes

Auto-fix when the change is small, understood, and low-risk. Not when it needs an architecture or schema decision, changes product behavior, spans many files, or has competing answers. Each autonomous fix gets a regression test and a `ce-commit`. Too-big items go under "Decisions for a human" and the scenario becomes `Blocked (human decision)`.

### Resumable report

The report is created at the end of mapping (`docs/dogfood-reports/<date>-<branch-slug>-dogfood.md`) and updated as it goes. `<branch-slug>` is the branch name, lowercased, with non-alphanumeric runs collapsed to `-`. On resume, `Pass` / `Fixed` / `Skipped` stay done; `Pending` is re-queued. `Blocked (needs human verify)` and `Blocked (human decision)` are shown to you, not silently re-run.

### A suite check before "ready"

A green browser matrix with a red test suite is not ready. Before the verdict it runs the project's automated tests, including new regression tests. The command comes from the project's conventions, not a hardcoded runner.

---

## `ce-dogfood` vs `ce-test-browser`

Both take a PR or branch and drive a browser over diff-affected surfaces. `ce-test-browser` prefers a host-native browser and falls back to `agent-browser`. `ce-dogfood` requires `agent-browser`.

| | `ce-test-browser` | `ce-dogfood` |
|---|---|---|
| Output | A test summary in chat | A durable report plus fix commits |
| Fixes breakages? | Only if you pick "fix now" | Small ones on its own, with tests |
| Feel | Functional | Functional plus per-persona paper cuts |
| Model | Route-oriented | Journey-first (Mermaid flowcharts) |
| Autonomy | Asks how to proceed on failures | Fixes, escalates, continues |
| Invocation | Model or user | Manual only |
| Checkout | Diff only; does not switch branches | Current branch in place; PR / other branch offers a worktree |

Use `ce-test-browser` for "do these pages still work." Use `ce-dogfood` when you want the branch driven, fixed where safe, and written up.

---

## When to Reach For It

Use `ce-dogfood` when:

- You want the branch exercised as a user would, not only smoke-tested
- You want breakages fixed and locked with tests, not only listed
- Feel for real users matters, not only pass/fail
- You want a QA file that a later session can resume

Skip it when:

- The change is backend-only → the project's test runner
- You only want a quick render check → `/ce-test-browser`
- You want to sit with the page and direct the edits → `/ce-polish`
- `agent-browser` is missing → `/ce-setup`, then retry
- The dev server cannot run locally

---

## Chain Position

On-demand. Nothing in the core loop calls this. After a green (or explicitly blocked) report, ship with `/ce-commit-push-pr` if you want a PR. The skill may itself call `ce-worktree` (isolation), `ce-debug` (unclear failures), `ce-commit` (each fix), and `ce-compound` (a reusable lesson).

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Dogfood the current branch in place. Stops if that branch is the trunk |
| `<PR number>` | Dogfood that PR. Offers a worktree so this checkout stays put. Never refused for a `main`-named head, because a PR always has a base to diff against |
| `<branch name>` | Dogfood that branch. Offers a worktree if you are not already on it |
| `--port <number>` | Skip port detection |

Required: `agent-browser` on PATH (not `npx agent-browser`), and a local dev server the skill can start or reuse. If a server is already listening on the chosen port, it reuses it; otherwise it starts `bin/dev`, `rails server`, or `npm run dev` without asking. Port order matches the other browser skills: `--port`, a port already in active project instructions, `package.json`, `.env*`, then `3000`.

Report path relocates with `docs_root` (see [configuration](./configuration.md)).

---

## FAQ

**Why refuse the trunk?**
There is no branch diff to dogfood. A PR still has a base, so `/ce-dogfood 847` is fine even when the head is `main`.

**Does it always create a worktree?**
No. Current-branch runs stay here. Isolation is offered only for a PR or a different named branch.

**What if `agent-browser` is missing?**
It stops and tells you to run `/ce-setup`, then retry the same `/ce-dogfood` arguments.

**Will it rewrite product behavior?**
Not on its own. Large, ambiguous, or product-changing issues are escalated. Small obvious bugs get a test and a commit.

**What do the Blocked states mean?**
`Blocked (needs human verify)` is an external flow waiting on you. `Blocked (human decision)` is too big to auto-fix. Resume asks about those instead of re-running them.

---

## See Also

- [`ce-test-browser`](./ce-test-browser.md): lighter test-and-report sibling
- [`ce-polish`](./ce-polish.md): you drive UX on a working feature
- [`ce-worktree`](./ce-worktree.md): isolation offered for a PR or other branch
- [`ce-debug`](./ce-debug.md): used when a failure's cause is not obvious
- [`ce-commit`](./ce-commit.md): each autonomous fix
- [`ce-compound`](./ce-compound.md): reusable lessons from the pass
- [`ce-setup`](./ce-setup.md): install `agent-browser` when it is missing
