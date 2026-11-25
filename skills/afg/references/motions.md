# Motions

Each section names what the motion may start, the callee, and what stays with a person. Workers are told the end state and never receive permission to land.

On the `direct` route, every "PR" below is one local commit: `lfg` ends by opening a PR, so use `ce-work mode:return-to-caller <plan path or work statement>` in its place, planning first with `ce-plan mode:pipeline` when the work needs a plan. Tell the worker to commit on its branch and publish nothing.

## main-red

Start only when `observe` reports main red, or, with `autonomous_ci: ignored`, when a saved check fails on the tip in a clean worktree. One repair job at a time, covering as many causes as it takes: a repair that fixes its own cause but fails only on another is unfinished, so fix the next cause on top of it and land them together as one commit or PR. Callee: `ce-debug mode:return-to-caller <failing checks and log tails>` in a worktree on the default branch tip; it creates a branch and does not push. Its `fixed` return is then shipped with `ce-commit-push-pr mode:pipeline babysit:off`, or on `direct` adopted as the commit it is. Never run `ce-debug mode:pipeline` on the default branch, because it pushes the branch it is on. Start with the cause that hides the most. When all checks cannot pass within this run, park the branch and continue from it next time instead of starting another. Otherwise unknown main is not red: wait.

A repair that edits CI itself always parks for a person. On `direct`, hosted checks stay red until a person fixes CI, so do not let that motion hold up the others: once its CI repair is parked, move on.

## bugs

Sources: open issues that report wrong behavior, and the rolling `feedback-sweep-plan` that `ce-sweep` keeps with the repository's plans, when it has one. When feedback sources are configured and `sweep_shared_branch` is not set, run `ce-sweep mode:non-interactive` first, in a worktree on its own branch, so its commit never reaches the default branch from here. Its approved acknowledgements at the source are allowed; it lands nothing and needs no job. Callee: `lfg <issue URL>`, with the instruction not to merge. Pass `--origin issue:<n>`, or `--origin external` for anything that came from outside GitHub.

`lfg` returns prose. Find the PR from its branch rather than from its text, and treat a non-empty `## Needs your decision` as questions to answer here before landing.

## security

Sources: the host's dependency and code-scanning alerts where readable, and a bounded look at recently changed code that handles untrusted input. Reproduce before fixing. Callee: `lfg`. Follow the disclosure rule in `references/run.md`: in a repository other people can read, do not push a fix or describe the finding; park it as `security:<slug>`.

## backlog

Every open PR and issue ends landed, fixed, closed with evidence, or parked with a recommendation. Oldest first. A request that needs product judgment is worked through the question ladder in SKILL.md before it is parked.

## stack

Sources: dependency bot PRs first, then outdated direct dependencies and the framework itself. One update per PR. Landing a bot's PR needs no job. For an update with no PR, the callee is `lfg`. Read the changelog between the two versions. A major update is worked and babysat, and a person lands it.

## climb

Improve a number: speed, cost, size, coverage; or make code simpler without changing what it does. Look for what is slow in traces, logs, benchmarks and CI timings before choosing a target. Callee: `ce-optimize mode:return-to-caller <goal, workload and where it is slow>`. For simpler code the callee is `ce-simplify-code <one area>`, chosen for how often it changes and how hard it is to follow; the checks must already cover what it does, and public names stay. On `direct`, either ends as a commit. The `ce-optimize` return decides what happens next:

- `complete` with a confirmed gain: ship its branch as a PR with `ce-commit-push-pr mode:pipeline babysit:off`, adopt it, and land it like any other.
- `complete` without one: record the target as `idea:<slug>` with what was learned, and choose another target next time.
- `blocked`: remove the block when that is in-scope work, such as adding the missing benchmark or behavior check as its own PR. Otherwise park it.

## create

Off unless the repository enables it, and started only when no other motion has work. Callee: `ce-ideate mode:return-to-caller <subject>`, with the subject from policy rules, strategy, or the owner's request. Take the strongest survivor that fits the level. Settle its open product questions through the question ladder in SKILL.md, then hand it to `lfg` to build and end in an open PR with a preview or screenshots. At level `report`, park it as `idea:<slug>` instead. Tests cannot judge taste, so start no new idea while an earlier one is open or unanswered.
