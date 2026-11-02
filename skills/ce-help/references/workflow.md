# Moving work through CE

Two questions get separate answers. The state of the work decides where it starts. The user's preference decides how hands-on they stay from there.

## Where the work starts

Go by what is already settled.

| What is settled | Start with |
|---|---|
| Nothing yet; they want to know what is worth working on | `ce-ideate`. In a repo, a chosen idea goes on to `ce-brainstorm`, not straight to `ce-plan`. |
| A direction, but the scope or product shape is open, or several solutions could fit | `ce-brainstorm` |
| A named technology or approach that needs a yes or no | `ce-pov` |
| What to build, but how it should work or feel needs trying | `ce-prototype` |
| The outcome is clear (a detailed issue, a PRD, a clear description) and the work is multi-step or touches a risk surface | `ce-plan`. A brainstorm helps but is not required. |
| Small or medium work scoped well enough to start without a plan | `ce-work` with a plain request. It sizes the work and recommends planning if it turns out large. |
| A failure or wrong behavior whose cause is not known, including "why is this slow?" | `ce-debug`. With a known cause and an obvious fix, just fix it or use `ce-work`. |

To choose between `ce-brainstorm` and `ce-plan`, ask whether two reasonable people would build different things from this request. If they would, start with `ce-brainstorm`. It is cheap to try on a small idea, because its lightest tier ends in chat with no file. If the user is unsure of the problem itself, that also points to `ce-brainstorm`.

## How `ce-brainstorm`, `ce-plan`, and `ce-work` connect

- `ce-brainstorm` writes a requirements-only plan. Its lightest tier may write nothing.
- `ce-plan` enriches that same file in place and does not reopen the product decisions. Small work may get a short answer or a chat brief from `ce-plan` instead of a plan file.
- `ce-work` refuses a requirements-only plan and points back to `ce-plan`.
- Run with no argument, `ce-plan` uses the current conversation, and `ce-work` looks at the newest plan and stops unless it is implementation-ready.

## How hands-on to stay

`lfg` is optional. It is a way to hand off the remaining steps, and it can start at any of the points below. Staying hands-on and handing off are both valid, so this is the user's preference, not a right or wrong answer. If they have not signaled a preference, show both and say what each one means. If they have, follow it.

| Where they are | Run the next skill | Hand off |
|---|---|---|
| A clear request, nothing written yet | `ce-plan`, or `ce-work` if it needs no plan | `lfg <request>`. `lfg` plans with less product context than it would have after a brainstorm. If the request has several plausible readings and the user is there to answer, `lfg` runs `ce-brainstorm` first. |
| Just finished `ce-brainstorm` | `ce-plan` | `lfg`. It plans from the brainstorm, then carries on. This is the usual path in the `lfg` guide. Passing the plan path also works. Running `ce-plan` first and `lfg` afterward is fine too, for someone who wants to review the plan before handing off. |
| `ce-plan` wrote a plan this session | `ce-work` | `lfg`, with or without the path. It does not plan again and goes straight to implementing. |
| A plan from an earlier session | `ce-work <path>` if it is implementation-ready, otherwise `ce-plan <path>` | `lfg <path>`. It runs `ce-plan` first to enrich the plan or check it for drift. `lfg` never searches for a plan, so pass the path. |
| A bug | `ce-debug` | `lfg <bug>`, which sends it to `ce-debug`. Use `ce-debug` directly to see the diagnosis before any fix. |

What the choice changes:

- Running the skills separately gives the user a checkpoint between them. `ce-brainstorm` and `ce-plan` confirm scope and offer next steps.
- `ce-work` does not stop between its own stages. It implements, simplifies larger changes, reviews, and opens a PR, pausing only when it needs a decision, so handing off is not the only route to a PR. Someone who wants to look before anything is pushed can tell `ce-work` to commit only.
- `lfg` does not pause for approval of the plan, diff, or findings. It pushes and opens a PR without asking. It applies eligible review fixes and lists the rest in the PR. It captures any durable learning, runs browser tests, and watches CI within a limited repair budget. Merging normally stays with the user.
- Neither route can push without a git remote; both stop at local commits. Mention this only when the repo has no remote.
- `lfg` is a poor fit for non-software work, or for repos whose shipping needs hand-driven steps. Given a request that is not a code change, such as an explanation, `lfg` ends with the owning skill's result.

## What already runs on its own

Tell the user not to repeat a step that a skill runs itself.

- `ce-work` runs `ce-simplify-code` on changes of about 30 or more substantive lines, then `ce-code-review`, then `ce-commit-push-pr`.
- `ce-commit-push-pr` hands off to `ce-babysit-pr` by default, which calls `ce-resolve-pr-feedback` and `ce-debug` as needed.
- `ce-debug` runs simplify and review on an interactive fix. It opens a PR without asking when the branch holds only that fix.
- `ce-plan` runs `ce-doc-review` on its plan. Run `ce-doc-review` by hand to go deeper.
- `ce-code-review` and `ce-simplify-code` start nothing afterward. Run by hand, `ce-code-review` only reports.
- `lfg` runs `ce-compound` when the work taught something the final code does not show, `ce-debug` can offer it, and a standing instruction can make it automatic. `ce-work` and the skills it runs do not start it, so on that route the user runs it, ideally while the learning can still go in the same PR.
