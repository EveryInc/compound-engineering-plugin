---
title: "Review feedback on skill prose is unbounded; answer a covered case with the condition, not a patch"
date: 2026-08-15
category: skill-design
module: skills/ce-resolve-pr-feedback
problem_type: design_pattern
component: development_workflow
severity: high
applies_when:
  - Acting on PR review feedback (bot or human) that targets a `SKILL.md`, a skill reference, a persona prompt, or a rule file
  - Running `ce-resolve-pr-feedback` under `ce-babysit-pr` on a PR that touches `skills/**`
  - A second review round lands on text the first round added
  - Writing review guidance for a repo whose product is agent instructions
symptoms:
  - Nine review rounds and 24 findings on a change whose intent nobody questioned
  - Every finding valid in isolation; every fix a new case, caveat, or exit-code check on the previous fix
  - The block under review grows each round and reads worse; the reviewer then reviews the mechanics you added
  - A per-invocation "stop after two cycles" cap never fires because the orchestrator re-invokes the resolver fresh each round
  - The lesson was already recorded in `docs/solutions/` the day before and did not prevent it
resolution_type: workflow_improvement
related_components:
  - tooling
tags:
  - skill-design
  - code-review
  - review-feedback
  - accretion
  - ce-resolve-pr-feedback
  - ce-babysit-pr
related_pr: https://github.com/EveryInc/compound-engineering-plugin/pull/1397
---

# Review feedback on skill prose is unbounded; answer a covered case with the condition, not a patch

## Context

PR #1397 changed one step of `ce-work`: stop asking the user about branches and do the reversible thing. The change was two conditions — work lands on a feature branch; nothing the user did not offer gets committed or published. It shipped after nine automated review rounds and 24 findings, and for most of that time the step was getting longer and worse.

The rounds were not a bot malfunction. Each finding was correct in isolation: the upstream check misses a branch pushed without `-u`; the `ls-remote` probe fails open on a network error; that probe should use `--exit-code`; the branch name should be quoted; `git status --short` collapses untracked directories; the local default can be behind its remote; and so on. Each was fixed with a new case, and each fix produced the next round's finding, because the reviewer was now reviewing the mechanics the previous round had added. The block converged only when it was restated as the two conditions it began as and the accreted mechanism (an automatic branch rename) was deleted outright.

Two guards existed and did not fire:

- The repo's authoring guidance already said this ("Repeated case-specific repair is the defect signal"; "Applying Feedback to Skills", step 5), and `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md` had recorded the same lesson from PR #1385 the previous day. Both live in authoring context read at session start. The instruction actually running during the babysit loop was `ce-resolve-pr-feedback`'s rubric, whose headline is "default to fixing; nitpicks included are correct and worth fixing", with project conventions consulted only as a veto for fixes that would harm code.
- `full-mode.md` already capped the loop at two fix-verify cycles and escalated a recurring pattern. The cap counted cycles per invocation; `ce-babysit-pr` re-invokes the resolver fresh each round, so the counter reset every time.

## Why prose is different

"Default to fixing" is the right rule for code because a valid finding maps to a bounded edit and a test proves it. Instruction prose has neither property. A natural-language condition can always be made more specific, so a reviewer can produce a valid-looking edge case against any rule indefinitely; and each case added to a rule dilutes it — the reader now has to hold the enumeration instead of the condition, and the next configuration the enumeration did not name is a new defect. On prose, the unit of correctness is the condition (goal, done state, safe failure direction), not the case.

## Guidance

1. **When acting on feedback that targets instruction prose, invert the default.** A case the stated condition already decides is answered — `not-addressing` quoting the condition, or `replied` for a question — not fixed. Edit only when the condition itself is wrong or missing, or a mechanism sits at the wrong owning layer. Hand a fixer "restate the condition as …" or "move this to `<owner>`", never "add the case".
2. **Two rounds on the same block means restate, not qualify.** When findings land on text the previous round added, delete the additions and restate the block as its goal, done condition, and safe direction; re-verify the restatement against every path the additions served. If a mechanism keeps needing cases to be safe (here, auto-rename), the cheapest correct restatement is often to delete it.
3. **Count rounds per PR, not per invocation.** An orchestrator that re-invokes the resolver each round defeats a per-invocation cap; derive the count from the branch (earlier review-fix commits) so the cap survives re-entry.
4. **Put the rule where the reviewer and the reviewee both read it.** Review bots here cite the repo's instruction file line-by-line in their findings; the resolver reads the same file as project conventions. A `## Code Review Guidelines` section addressed to both — what a finding is on `skills/**`, and how feedback on `skills/**` is judged — shapes what gets filed and what gets fixed from one place. Authoring guidance the author reads once at session start is not enough; the rule has to be in the runtime protocol that is active when the feedback arrives.

## Where it landed

- `AGENTS.md` — the `## Working on Skills` lifecycle: authoring, editing an existing skill (bring the touched block to the standard), reviewing a skill change (what a finding is), and acting on review feedback.
- `skills/ce-resolve-pr-feedback/references/evaluation-rubric.md` — the project's review guidance frames the verdict, not just the harm veto; an "instruction prose is not code" section with the covered-case, condition-or-layer, and second-round rules.
- `skills/ce-resolve-pr-feedback/references/full-mode.md` — the loop cap counts rounds per PR via the branch's review-fix commits.
- `skills/ce-resolve-pr-feedback/references/agents/pr-comment-resolver.md` — a fixer editing prose implements the restatement it was handed and returns `blocked` rather than adding a case.
