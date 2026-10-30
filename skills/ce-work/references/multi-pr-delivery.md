# Multi-PR Delivery

Read this when the plan's execution profile says the work ships as several PRs and this run is standalone, before building the task list. A `mode:return-to-caller` run does not use this file: it builds every unit on one branch and returns, and its caller owns how the work splits into PRs.

**Outcome:** every PR group of the plan ends this run merged, in an open PR, built and waiting on a dependency, or not yet built because a start wait is unmet, and the report names each wait. The only things left for a person are confirming a deployment and merging when the user did not grant merging.

A run that a coordinator handed one named group builds and ships only that group, from the branch it was given, and returns that group's state. The rest of this file is how a run decides which groups to build and how they land.

## Group state

Each group carries one identity: the plan's file name without its extension plus the group's label, the `PR<N>` that starts the group's heading. The group's PR description carries it as one line, `Plan group: <plan path> <label>`, and its branch name ends with `<plan file name>-<label>` (lowercased). Match that identity exactly, with the label as a whole token, so `PR1` never matches `PR10` and another plan's `PR1` never matches this one. Read each group's state through it:

- **merged** when a merged PR carries it;
- **open** when an open PR carries it;
- **built** when an unpublished branch carries it and holds the group's finished work: every unit of the group is present and its verification passes. A branch carries the marker before its work is done, so a branch without finished work is a build in progress: resume its unfinished units on that branch;
- **unbuilt** otherwise.

Squash merges leave no ancestry, so commit history is not evidence of a merged group. Skip merged and open groups, and do not rebuild a built one. A branch is visible only in the checkout or session that made it. Treat a group with no PR and no visible branch as unbuilt only when no session started for this plan, by this run or an earlier one, may still be building it. An earlier run's report names those sessions; when you cannot rule one out, stop and report rather than build the group again. When the evidence conflicts or you cannot tell, stop and report what you found: rebuilding a group duplicates its PR, and skipping one ships the plan with a hole.

## Which groups to build

Each group's `Waits on:` line names the PRs it waits on and the kind of each wait.

- **Merge order only** does not stop a group from being built. A group that uses an earlier group's code is built on top of that group's built branch, so it starts once that group is built. Groups that share no code are built at the same time.
- **Needed before start** holds the group until the wait is met. A wait on a merge is met when that PR merges. A wait on a deployment is met only when the user confirms the deployment, because no skill observes deploys.

Each group is built and verified with the normal implementation loop and execution strategy, against its own units and the requirements they trace to. Read the plan's `Deferred / Open Questions` entries as open review items for the group. When the group settles one, remove its entry, and remove the review subsection and the section once they are empty.

## Publishing in merge order

- **The project allows stacked PRs:** open the built groups as one stack, bottom to top in merge order, through `ce-commit-push-pr` with explicit stack intent and one layer per group, each with its units, its marker line, and any deploy dependency.
- **It does not** (for example squash merges with a fresh branch from the default branch per PR, or no force-push): publish a group once every group it waits on has merged, on a fresh branch from the updated default branch that carries only that group's changes. Later groups stay built until then. Before publishing, rerun the group's final validation and code review on that branch. When the merged predecessor changed in a way that breaks the group, rebuild it rather than publish it, and say so in the report.

Each group's PR gets its own code review with `plan:<path>` and `plan_group:<label>`, its own final validation, and a description naming any deployment that must be live before it merges. Never merge past a deploy dependency on the user's behalf.

## Waiting and resuming

When the host can wake this session on a change to a PR, keep a watch on each PR that a waiting group depends on, and continue when it merges. When it cannot, end with the report. Re-running `ce-work` on the same plan continues from there, because the state rules above read what already exists.

## Separate sessions

Some hosts can start a separate long-lived session in its own checkout that outlives this turn, such as T3 delegated worktree tasks, Orca worktree children, or Codex cloud tasks. This is not a subagent: a subagent ends with the turn that started it, while a group's PR needs hours of CI, review, and merge.

Where the host offers such sessions and its own rules let the agent start them, hand each group to its own session automatically and coordinate from this one.

- **What a session receives:** the plan path, its group label, the branch it builds on, the marker convention, the user's constraints and publishing authority for this run (for example, leave changes local, or open no PR), and the instruction to build only that group and ship it within that authority. A session does not inherit this conversation, so a limit not passed here does not exist for it.
- **What the coordinator does:** keeps the group states; starts a group's session once the group it builds on is built and its start waits are met; watches each PR whose session the host does not let watch it.
- **When a session cannot reach the branch:** a chain that builds on a branch the host's sessions cannot reach, such as a local branch from a cloud session, is built in the main thread.

Without such sessions, or when the host's rules require the user to ask first, the main thread does all of the above itself.

## Report

List every group with its label, its state (merged; open, with its link; built and waiting; building in a session, naming where; blocked), what it still waits on, and for a blocked group what only the user can do. When every group is merged, say the plan is complete.
