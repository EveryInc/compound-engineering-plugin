# Skill map

Recommend one skill. Bring in a second when the situation falls between two skills listed under "Skills that sound alike", or when `references/workflow.md` makes the choice a preference. A skill's guide page states its preconditions and when to skip it, so check the page before recommending the skill when you can. `(manual)` marks a skill an agent cannot start, so the user has to type it.

## Skills

| Goal | Skill |
|---|---|
| Find ideas worth working on | `ce-ideate` |
| Turn a rough idea into requirements | `ce-brainstorm` |
| Plan multi-step work, or deepen a plan | `ce-plan` |
| Build from a plan or a clear request | `ce-work` |
| Hand off the remaining steps from any point, ending in an open PR for a code change | `lfg` |
| Capture a lesson from solved work that the final code does not show | `ce-compound` |
| Review captured learnings: update, merge, shorten, or delete them, and keep standards current | `ce-compound-refresh` |
| Write or update `STRATEGY.md` | `ce-strategy` |
| Get a report on usage, errors, and performance | `ce-product-pulse` (manual) |
| Collect feedback from Slack or GitHub into a plan | `ce-sweep` (manual) |
| Find and fix the cause of a bug or failing behavior | `ce-debug` |
| Move a measurable metric on a working system | `ce-optimize` |
| Learn how or why something works, or what happened over a stretch of work | `ce-explain` |
| Get a verdict on a technology, a document, or some options | `ce-pov` |
| Develop competing solutions and pick a winner | `ce-bakeoff` |
| Try how something should work or feel with a throwaway build | `ce-prototype` |
| Review code or a PR | `ce-code-review` |
| Review a requirements doc or plan | `ce-doc-review` |
| Simplify code, or prune low-value tests and comments | `ce-simplify-code` |
| Commit without pushing | `ce-commit` |
| Commit, push, and open a PR, or write a PR description | `ce-commit-push-pr` |
| Address feedback already left on a PR | `ce-resolve-pr-feedback` |
| Watch a PR, fix comments and CI, and judge whether an old PR still belongs | `ce-babysit-pr` |
| Work in an isolated git worktree | `ce-worktree` |
| Run browser tests for the current change | `ce-test-browser` |
| Test an iOS app on the simulator | `ce-test-xcode` (manual) |
| Refine the UX of a working feature with live feedback | `ce-polish` (manual) |
| Have an agent test the branch in a browser and fix small breaks | `ce-dogfood` (manual) |
| Share or edit markdown in Proof | `ce-proof` |
| Continue work in another session or agent | `ce-handoff` |
| Draft launch copy for a shipped feature | `ce-promote` (manual) |
| Rewrite, check, or draft prose with no AI tells | `ce-noslop` |
| Have the last message, or supplied text, explained plainly | `wtf` (manual) |
| Turn a Riffrec recording, video, or notes into feedback | `ce-riffrec-feedback-analysis` |
| Check tools and repo config, or scaffold a pack or review docs | `ce-setup` (manual) |
| Retune a skill collection for a new model | `ce-retune` (manual) |
| Get oriented in CE | `ce-help` (manual) |

## Skills that sound alike

- `ce-ideate` finds what to work on. `ce-brainstorm` shapes an idea the user already has. `ce-plan` works out how to build what is already decided.
- `ce-work` takes a plan or scoped request through to a PR. `lfg` hands off everything from the current point without waiting for approval. Which to use is a preference; `references/workflow.md` covers it.
- `ce-debug` is for a cause that is not known yet, including "why is this slow?". `ce-work` is for a change that is already known. `ce-optimize` is for moving a metric on a working system.
- `ce-explain` says how and why something is the way it is. `ce-pov` gives a judgment. `wtf` explains text the user did not follow and investigates nothing.
- `ce-pov` judges options that already exist, and asking it to "oracle this" adds other models' opinions. `ce-bakeoff` develops the options first. `ce-doc-review` reviews a document but gives no overall verdict.
- `ce-prototype` tests how something should work or feel. `ce-brainstorm` decides what to build. `ce-polish` refines something that already works.
- `ce-simplify-code` improves code with behavior unchanged. `ce-code-review` looks for bugs and regressions.
- `ce-code-review` produces new findings. `ce-resolve-pr-feedback` handles feedback already on a PR. `ce-babysit-pr` watches a PR over time.
- `ce-test-browser` tests the current change. `ce-dogfood` works through the user flows hands-off and fixes small breakages.
- `ce-compound` holds one lesson in its cheapest form: a test or lint rule, a coding standard, or a learning. `ce-compound-refresh` maintains the learnings already captured and keeps the standards in step with the repo's checks.

## Explaining one skill

When the question is what a skill does or why to use it, the user wants the gist, and the guide page holds the rest. Give three things in a sentence or two each: what it does, what it gives them beyond asking the agent directly, and when to skip it. Be fair about the last two: a capable agent can do much of this unaided, and the guide's reasoning is design intent, not measured results. Use no tables, and leave out internal stages and flags unless they ask. Add a command only if they are deciding to use the skill now.
