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

`ce-brainstorm` writes requirements, `ce-plan` adds implementation planning to that same file without reopening the product decisions, and `ce-work` builds from the result. `ce-work` will not build from requirements alone.

## How hands-on to stay

`lfg` is optional. It is a way to hand off the remaining steps, and it can start at any of the points below. Staying hands-on and handing off are both valid, so this is the user's preference, not a right or wrong answer. If they have not signaled a preference, show both and say what each one means. If they have, follow it.

| Where they are | Run the next skill | Hand off |
|---|---|---|
| A clear request, nothing written yet | `ce-plan`, or `ce-work` if it needs no plan | `lfg <request>` |
| Just finished `ce-brainstorm` | `ce-plan` | `lfg` |
| `ce-plan` wrote a plan this session | `ce-work` | `lfg` |
| A plan from an earlier session | `ce-work <path>` if it is implementation-ready, otherwise `ce-plan <path>` | `lfg <path>` |
| A bug | `ce-debug` | `lfg <bug>` |

What the choice comes down to:

- Running the skills separately gives the user a checkpoint between them.
- `ce-work` also reaches a PR, so a PR is not a reason to choose `lfg`. Someone who wants to read the code before anything is pushed can ask `ce-work` to commit only.
- `lfg` does not wait for approval of the plan, diff, or findings, and it pushes without asking. Merging normally stays with the user.

The `lfg` guide page owns how it handles each starting point and what each stage does, so fetch it before describing them.

## What already runs on its own

Do not send someone to repeat a step a skill runs itself. `ce-work` carries work through simplification, review, and the PR, and that PR gets watched. `ce-debug` can carry a fix through review and a PR. `ce-plan` reviews its own plan. Check the recommended skill's guide page for its current chain and thresholds.

`ce-compound` is the exception on the `ce-work` route: the user runs it when the work taught something the final code does not show. `lfg` can run it, and a standing instruction can make it automatic.
