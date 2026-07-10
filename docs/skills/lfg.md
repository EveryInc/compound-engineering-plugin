# `lfg`

> Run the full hands-off engineering pipeline from planning through a green PR.

`lfg` is the **autonomous pipeline** skill. It chains the main Compound Engineering workflow into one long-running run: plan the work, implement it, simplify the result, review it, apply eligible review fixes, run browser tests, commit, push, open a PR, then watch CI and repair failures within a bounded loop.

Use it when you want the full agentic shipping path and are comfortable with the agent taking the work from a feature description to an open PR. It is best after `/ce-brainstorm`, because the pipeline can then plan against real requirements instead of a one-line prompt.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs the full CE software pipeline from planning through PR and CI watch |
| When to use it | Software tasks that are ready for autonomous implementation |
| What it produces | Code changes, commits, usually a PR, and durable residual notes when something cannot be fully resolved |
| What's next | Review the PR, merge when ready, and run `/ce-compound` if there is reusable learning to capture |
| Distinguishing | Hard ordering gates, return-to-caller execution, review-fix persistence, browser test pass, bounded CI autofix loop |

---

## The Problem

The normal CE workflow is deliberately staged: plan, work, simplify, review, ship. That is useful when you want to inspect each step, but too much handoff when the task is well-bounded and you want the agent to carry the whole thing.

Without an explicit pipeline, autonomous runs tend to skip planning, treat review as optional, forget to persist residual findings, or stop at "PR opened" while CI is still red.

## The Solution

`lfg` makes the sequence explicit and gated:

- `/ce-plan` must produce an implementation-ready code plan before work starts
- `/ce-work` runs in return-to-caller mode so the pipeline regains control after implementation
- Behavior-changing implementation must return verification evidence from `/ce-work`; if evidence is missing, `lfg` retries `/ce-work` once for evidence completion and then stops blocked rather than shipping blind
- `/ce-simplify-code` runs before review unless the change is docs-only or trivial
- `/ce-code-review` reports findings, then `lfg` applies eligible fixes and commits them
- Residual review findings are made durable in the PR body or a fallback tracked file
- `/ce-test-browser` runs in pipeline mode
- `/ce-commit-push-pr` ships remaining changes when a remote exists
- CI is watched for up to three repair iterations on an open PR

The pipeline also has a local-only path: if the repository has no git remote, it commits locally and skips push, PR creation, and CI watch instead of retrying impossible network steps.

---

## When to Reach For It

Reach for `lfg` when:

- You have a software task that can be taken through plan, implementation, review, and PR
- You want hands-off progress while preserving CE's quality gates
- The task is already shaped by `/ce-brainstorm` or is clear enough for `/ce-plan` to turn into an implementation-ready plan
- You want CI failures handled automatically within a bounded loop

Skip `lfg` when:

- The work is non-software or answer-seeking
- You need interactive product shaping before implementation -> `/ce-brainstorm`
- You want to inspect and approve each stage manually -> run `/ce-plan`, `/ce-work`, `/ce-code-review`, and `/ce-commit-push-pr` yourself
- The repo has unusual shipping requirements that need hand-driven git or release work

---

## Use as Part of the Workflow

```text
/ce-brainstorm describe the feature
/lfg
```

Starting with `/ce-brainstorm` gives the pipeline better requirements. `lfg` then invokes `/ce-plan` itself and stops if the resulting plan is not an implementation-ready code plan.

You can also invoke it directly:

```text
/lfg add account-level notification mute settings
```

Direct invocation is useful for clear software tasks, but it gives the planner less product context.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Plans from current context, then runs the pipeline if the plan is eligible |
| `<feature description>` | Passes the description to `/ce-plan`, then runs the pipeline |

Output: code changes, commits, and usually a PR. If there is no configured git remote, output is local commits only. If CI remains red after the bounded repair loop, unresolved failures are recorded durably before the run ends.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md) — strongest upstream source of requirements
- [`ce-plan`](./ce-plan.md) — first required pipeline step
- [`ce-work`](./ce-work.md) — implementation engine called in return-to-caller mode
- [`ce-simplify-code`](./ce-simplify-code.md) — pre-review simplification step
- [`ce-code-review`](./ce-code-review.md) — review gate
- [`ce-test-browser`](./ce-test-browser.md) — browser validation step
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — shipping handoff when a remote exists
