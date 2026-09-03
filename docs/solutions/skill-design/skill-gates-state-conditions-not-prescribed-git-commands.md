---
title: "Skill ship gates state the required condition, not the git commands that prove it"
date: 2026-08-15
category: skill-design
module: skills/ce-debug
problem_type: design_pattern
component: development_workflow
severity: high
applies_when:
  - Authoring a skill gate that decides whether work is ready to ship, branch, push, or open a PR
  - Tempted to write a specific `git`/`gh` command into skill prose as the way to establish a condition
  - A review round proposes swapping one prescribed command for another instead of naming the condition
  - The same gate has been rewritten repeatedly and each revision breaks a different repository state
symptoms:
  - Six revisions of one gate across nine reviewed heads, every one wrong for some git configuration
  - "`git log <default-branch>..HEAD` refused a branch that already had an open PR, so the fix never shipped"
  - "`git log @{u}..HEAD` errors on a branch just created by `git checkout -b`, which has no upstream"
  - Branch-was-created-by-the-skill used as a proxy for a clean tree, which `git checkout -b` carries forward
  - No reviewer ever found the gate's intent unclear; every finding was a prescribed command failing
resolution_type: workflow_improvement
related_components:
  - tooling
tags:
  - skill-design
  - skill-authoring
  - git-state
  - ship-gate
  - prescribed-commands
  - protocol-vs-judgment
  - ce-debug
related_pr: https://github.com/EveryInc/compound-engineering-plugin/pull/1385
---

# Skill ship gates state the required condition, not the git commands that prove it

## Context

`ce-debug` Phase 4 has to decide one thing at the end of a fix: does this verified change go out as a PR, or does it stay as a local commit? The skill does not do the git work itself — it invokes `ce-commit-push-pr` or `ce-commit` and lets that skill handle branch, remote, and PR mechanics (`skills/ce-debug/SKILL.md`, Phase 4 routing).

The gate was originally written as skill prose that prescribed the git commands the agent should run to decide. Over nine rounds of automated review on PR #1385 (merged), it went through six revisions, and every one of them was wrong for some ordinary git configuration:

1. Used "this skill created the branch" as a proxy for "the tree was clean before the fix." False: `git checkout -b` carries uncommitted work onto the new branch, so a freshly created branch can already contain the user's WIP.
2. Used `git log <default-branch>..HEAD` to detect unoffered work. On a branch that already has an open PR, those commits are already in the range, so the gate refused to ship and the fix never reached the PR it belonged to.
3. Switched to an unpushed-only check. That treats work pushed for backup or to trigger CI as already "offered," so a first PR would sweep it in.
4. Split the arms, but the open-PR arm dropped the unpushed check entirely — local unpushed commits got published into the existing PR.
5. Applied `git log @{u}..HEAD` on every arm. A branch `git checkout -b` just created has no upstream, so the command errors and the most common path broke outright.
6. Compared against local refs, where the local default branch can itself be ahead of the remote — the range reads empty and those commits get published. The same revision leaned on "an open PR guarantees an upstream," which `git switch --no-track` and `git branch --unset-upstream` both falsify.

Across all nine rounds and 22 review threads, **not one reviewer said the intent was unclear**. Every finding was a prescribed command failing in a configuration the author had not enumerated. The explanation was never the defect; the mechanism was.

## Guidance

When a skill delegates the actual work to another skill, state **the condition that must hold** plus **the domain facts the reading agent cannot derive**. Do not prescribe the commands that establish the condition.

The shipped gate does exactly that (`skills/ce-debug/SKILL.md`, "Ships"). It names three conditions — the pre-fix tree was clean, nothing on the branch is work the user has not already offered, and `origin` is somewhere `gh` can actually open a PR against — and then says: "Establish those however fits the repo in front of you." No `git log` range, no `@{u}`, no branch-provenance heuristic.

What it *does* keep is the knowledge an agent cannot reason its way to from first principles:

- `ce-commit-push-pr` pushes the **whole branch** (`skills/ce-commit-push-pr/SKILL.md:101`, `git push -u origin HEAD`) and its PR spans every commit on that branch, not just the fix. So the question is about the branch, not about the diff.
- It pushes **before** creating the PR (push is Step 3 at `skills/ce-commit-push-pr/SKILL.md:101`; `gh pr create` is Step 5 at `skills/ce-commit-push-pr/SKILL.md:140`). A remote `gh` cannot open a PR against therefore leaves the branch published with no PR to show for it.
- Already pushed is not already **offered**. Commits in an open PR are under review and count as offered; a bare push for backup or CI does not.
- A local ref can be ahead of the remote, including the default branch the fix was branched from — so compare against the remote, not a local ref.
- `git checkout -b` carries uncommitted work forward, so how the branch came to exist proves nothing about what is on it.

Then give the failure direction explicitly: if the condition cannot be established, fall to the safe route (here, a local commit) rather than guessing.

**The boundary is ownership, not medium.** This is not "prose good, commands bad." Prescribe a mechanism when the skill itself owns that mechanism — `ce-commit-push-pr` should and does spell out `gh pr list --head <branch> --state open …` with its exit semantics, because PR detection is its job. Prescribe a *condition* when another skill owns the mechanism, because re-deriving it in the caller duplicates the callee's job with none of its coverage.

### Do not read "state machine" as "enumerate outcomes in prose"

`docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines.md` was cited *against* this simplification twice during review. Reading it settles the conflict: its subject is **observation freshness** — "Re-run the command that answers the current question at the point of decision. Do not rely on values gathered earlier if a mutating command may have changed them" (line 236) — for skills whose job *is* git mechanics, named in its own frontmatter as `ce-commit` and `ce-commit-push-pr`.

It is not a mandate to enumerate every branch/upstream/PR permutation in the prose of a skill that *delegates* the git work. Conflating "re-check state at the decision point" with "enumerate every state in prose" is what cost six revisions. Note that `ce-debug`'s gate still honors the freshness rule — it says to answer both questions "from the pre-fix scope Phase 3 recorded, checked now rather than inferred from how the branch came to exist". Freshness survived; enumeration went away.

### Prescribed commands also carry a security surface

An intermediate revision embedded `git log origin/<branch>..HEAD`. A security reviewer on PR #1385 flagged the unquoted branch placeholder as a shell-injection vector: a maliciously named branch interpolated into a shell command the agent then runs. Deleting the prescribed commands removed that surface as a side effect. Every command a skill hands an agent to run with interpolated repo-derived values is a place that has to be quoted correctly forever; a condition has no such surface.

## Why This Matters

Prescribed commands in a delegating skill encode a snapshot of one git configuration. Git has more configurations than any author enumerates on the first pass — no upstream, upstream unset, local ahead of remote, an existing open PR, WIP carried onto a new branch, a fork, no usable `origin`. Each missed configuration is a defect, and each defect gets fixed by adding another command, which introduces the next one. That is the loop that ran six times.

The cost is not only the churn. The failure modes were asymmetric and user-visible: revisions 3, 4, and 6 all published work the user never offered — the exact outcome the gate exists to prevent — and revision 5 broke the most common path outright.

The signal to read here is about the medium, not the effort. The reviewers were right every time about the defect; the author's fixes were responsive every time. A cycle where each correct fix introduces the next defect means the representation is wrong, not that the next revision needs to be more careful. Six rounds of "add a command for the case we just found" is the loop announcing itself.

Stating the condition also puts the decision where the information is. The agent is standing in the actual repo with the actual remote and the actual PR state; the skill author is not. A condition delegates to the agent's judgment against real state. A command delegates to the author's memory of git.

## When to Apply

- A skill hands its real work to another skill or tool that already owns that domain — git/PR mechanics, package management, deploys, migrations. State what must be true; let the callee own how.
- A gate is about *safety* (do not publish unoffered work) rather than *procedure*. Safety conditions are stable; the commands that establish them are configuration-dependent.
- A skill section has absorbed three or more rounds of "add a case" fixes, each fixing the last one's regression. Stop adding; ask whether the section should be stating a condition instead of a procedure.
- A prescribed command in skill prose interpolates a repo-derived value (branch name, remote name, path) into a shell string. Either quote it rigorously or replace the command with the condition it was checking.

Do **not** apply it when the skill owns the mechanism itself. `ce-commit-push-pr` reducing its own PR-detection logic to "determine whether a PR exists" would be a regression — the exit-code semantics and the branch-name-collision caveat documented in `git-workflow-skills-need-explicit-state-machines.md` §4 are precisely the non-derivable knowledge that skill exists to carry.

## Related

- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines.md` — the freshness rule for skills that *own* git mechanics. Read together with this doc: re-check state at the decision point (that doc) is not the same as enumerate every state in prose (this doc).
- PR #1385 — the nine review rounds and the final gate text in `skills/ce-debug/SKILL.md` under `#### Routing`.
