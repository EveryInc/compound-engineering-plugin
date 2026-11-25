# Motions

Each section names what the motion may start, the callee, and what stays with a person. Workers are told the end state and never receive permission to land.

## main-red

Start only when `observe` reports main red. One repair at a time. Callee: `ce-debug mode:return-to-caller <failing checks and log tails>` in a worktree on the default branch tip; it creates a branch and does not push. Its `fixed` return is then shipped with `ce-commit-push-pr mode:pipeline babysit:off`. Never run `ce-debug mode:pipeline` on the default branch, because it pushes the branch it is on. A failure with several unrelated causes is several repairs: fix the one that hides the most first. Unknown main is not red: wait.

A repair that edits CI itself always parks for a person.

## bugs

Sources: open issues that report wrong behavior, and the rolling `feedback-sweep-plan` that `ce-sweep` keeps with the repository's plans, when it has one. `ce-sweep` cannot be called from here; read what its own schedule produced. Callee: `lfg <issue URL>`, with the instruction not to merge. Pass `--origin issue:<n>`.

`lfg` returns prose. Find the PR from its branch rather than from its text, and treat a non-empty `## Needs your decision` as questions to answer here before landing.

## security

Sources: the host's dependency and code-scanning alerts where readable, and a bounded look at recently changed code that handles untrusted input. Reproduce before fixing. Callee: `lfg`. Follow the disclosure rule in `references/run.md`: in a repository other people can read, do not push a fix or describe the finding; park it in the digest.

## backlog

Every open PR and issue ends landed, fixed, closed with evidence, or parked with a recommendation. Oldest first. A request that needs product judgment is worked through the question ladder in SKILL.md before it is parked.

## stack

Sources: dependency bot PRs first, then outdated direct dependencies and the framework itself. One update per PR. Landing a bot's PR needs no job. For an update with no PR, the callee is `lfg`. Read the changelog between the two versions. A major update is worked and babysat, and a person lands it.

## climb

Improve a number: speed, cost, size, coverage. Look for what is slow in traces, logs, benchmarks and CI timings before choosing a target. Callee: `ce-optimize`, which stops for the owner's approval of a new target. So resume a run the owner already approved, or park a proposal naming the target, how it is measured, its guard metrics, and the first experiment. A result ships only with a repeated before-and-after measurement and unchanged guards.

## create

Off unless the repository enables it. Proposals for content, animation, polish, or features come from `ce-ideate <subject> output:md`, with the subject taken from policy rules, strategy, or the owner's request. Start it only when no other motion has work. Stop at the written proposal, do not answer its next-steps menu, and park it as `idea:<slug>`. Start no new batch while an earlier one is unanswered.
