---
title: "Evaluating a skill other skills call needs caller-shaped tasks and overreach grading"
date: 2026-10-14
category: skill-design
module: skill-evaluation
problem_type: best_practice
component: testing_framework
severity: medium
applies_when:
  - Evaluating a skill that other skills or a standing instruction invoke, not only the user
  - A skill's behavior depends on who started the run (a mode token, or the user's own request)
  - A skill edits files and must stay inside the current work
tags:
  - skill-eval
  - evaluation-design
  - callee-skill
  - overreach
  - fixture-design
---

# Evaluating a skill other skills call needs caller-shaped tasks and overreach grading

## Context

`ce-simplify-code` gained two modes: a pipeline mode for runs another skill or the agent starts (prune only the current work, apply without asking) and a standalone mode for runs the user asks for (report first). The behavioral eval for it, `tests/skill-eval-cell/packs/ce-simplify-code-pruning.md`, ran seven scenarios on Claude, Codex, and Grok. Four things about evaluating a callee skill only showed up while building that pack. None of them is recoverable from the pack's final scripts, because the scripts encode the fix, not the failure that forced it.

## Guidance

**1. Make the task text exactly what a caller would pass.** The first agent-started scenario asked the agent to "confirm `bun test` passes for the addMonths tests, finish the work as the project instructions require, and hand off". Agents read that as permission to do more: Claude and Grok added new tests and Codex restructured the function, and a marker-only grader counted all of it as the skill's behavior. A caller passes a token, a scope, and at most one line of context, so the scenario should too: `mode:pipeline proof-test:tests/months.test.ts` plus "invoked by ce-work after it implemented addMonths", or for the agent-started path "addMonths is implemented in the working tree and its tests pass. Hand off."

**2. Grade overreach, not only the intended edits.** Checking which marked tests and comments survived passed runs that also did unrelated work. The grader now also fails a run when:

- production code outside the current work changes (the fixture's pre-existing `addBusinessDays` bug must survive untouched, so a "helpful" fix fails)
- anything is committed or a new file appears outside `tests/`
- a test is added that does not encode a comment the run deleted

That third check caught a real skill defect, not a task artifact. The comment reviewer's rule said to encode any "live constraint that nothing enforces" as a test, and agents turned the descriptive comment "n can be negative" into a new test in 7 of 24 pipeline runs across all three hosts, including runs with minimal caller-shaped tasks. Narrowing the rule to "a rule the code must keep, one a later change could silently break" (`skills/ce-simplify-code/references/personas/comment-reviewer.md`) took it to 0 of 27.

**3. Put pre-existing items in the files the current work touches.** A rule like "prune only what the current work added or changed" passes trivially when the current work lives in its own files. The fixture commits a baseline with restating comments, mock-only tests, and a test-only export in the fixture's dates module and its test file, then leaves an uncommitted change that edits those same files. Only then does "left every pre-existing item alone" mean anything.

**4. Do not start the caller-path scenarios with `--skill <callee>` alone.** The eval cell prefixes every task with "Read the skill at `<dir>/SKILL.md` first" and presents the task as the user's message (`wrapPrompt` in `tests/skill-eval-cell/hosts.ts`). A run started with `--skill ce-simplify-code` therefore looks user-requested to any mode rule that asks "did the user ask for this run". Caller-started scenarios put the caller's token in the task; the agent-started scenario puts a standing instruction in the fixture's agent-instructions file and asks only for the hand-off. Say in the pack which scenarios are built which way, so a reader does not mistake a user-shaped run for a caller-shaped one.

## Why This Matters

A callee skill runs inside other workflows with no one watching, so its failure mode is quiet overreach: edits nobody asked for, landing in a PR as noise or as a silent behavior change. An eval that only checks the intended outcome cannot see that, and a loose task makes the agent produce it on its own, so the eval measures the task text instead of the skill.

## When to Apply

Use this when the skill under test is invoked by another skill, an orchestrator, or a standing instruction, and especially when its behavior branches on who started the run or it edits files under a scope limit. For a skill only users invoke, the cell's user-message framing is already the right shape.

## Examples

The pack's scenario table and grader (`tests/skill-eval-cell/packs/ce-simplify-code-pruning.md`) are the worked example: three caller-shaped pipeline scenarios (calling skill, lfg-style with the user's audit-sounding words in context, agent-started via a standing instruction), four user-started scenarios, a marker grader with overreach checks, and pre/post results on three hosts.

Related: [paired-old-vs-new-injection-skill-evals](paired-old-vs-new-injection-skill-evals.md) covers paired pre/post injection and fixture discrimination in general; [authored-eval-corpora-contain-the-happy-path](authored-eval-corpora-contain-the-happy-path.md) covers the same trivial-pass risk for authored corpora.
