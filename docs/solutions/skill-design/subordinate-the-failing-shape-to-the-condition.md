---
title: "Condition over cases can regress a literal host: subordinate the concrete shape, and let nothing compete with the exclusion"
date: 2026-08-24
category: skill-design
module: skills/ce-plan
problem_type: design_pattern
component: development_workflow
severity: high
applies_when:
  - Replacing an enumeration of failing cases in skill prose with the condition that decides them
  - Acting on a review finding that a case list contradicts a test stated in the same block
  - Writing a negative rule ("X is not Y") in prose a weaker or more literal model must follow
  - Deciding whether a restatement that reads strictly better may ship on a read-through
tags:
  - skill-design
  - skill-eval
  - cross-host
  - state-conditions-not-cases
  - review-feedback
  - salience
  - ce-plan
related_pr: https://github.com/EveryInc/compound-engineering-plugin/pull/1535
---

# Condition over cases can regress a literal host — subordinate the concrete shape, and let nothing compete with the exclusion

This bounds "state conditions, not cases" (`AGENTS.md`, "Working on Skills"; `.agents/skills/ce-skill-work/references/edit-skill.md` carries the resulting rule under "Do not overcorrect away deterministic guidance"). `size-driven-skill-restructure.md` records the other restatement hazard, where a shortened rule comes out absolute. This is the measured cost of the same move in the opposite direction: a restatement that generalizes *correctly* and still loses behavior, because the concrete shape it dropped was what a more literal host was matching on.

## What was measured (PR #1535, `skills/ce-plan/references/plan-sections.md`, Goal Capsule Objective altitude)

The first version named the failing shapes: "a statement about what that component no longer does, or about what stays isolated inside it, is a Means however outcome-shaped its wording." A review bot correctly found that this case list contradicted the two-part test three sentences later (a black-box property of the changed component passes both halves of that test yet is excluded by the list). Restating as the condition was plainly right. Re-running the eval scenario (`ce-plan/objective-above-the-changed-component`, `tests/skill-eval-cell/catalog.ts`) on Claude and Codex showed **Codex had regressed** to component altitude ("Weekly digests complete reliably without model execution consuming Convex action runtime ...") while Claude held the contract from the condition alone. The enumeration had been doing real work for the literal model, invisibly.

**1. Subordinate the shape; do not choose.** Keep the condition as the decider and restore *one* concrete failing shape explicitly framed as the condition's usual failure, with the closing clause handing adjudication back to the condition:

> ... and one only its internals can settle is not the Objective however outcome-shaped its wording; the registry above decides where it does belong. The usual failure is an objective about the component's own execution -- the wall-clock it no longer holds, the runtime it no longer consumes, what stays isolated inside it -- which only its internals settle.

A case list competes with the condition and can contradict it; a subordinated shape carries no independent decision, so it cannot. After this, 3 of 3 Codex trials produced the right altitude.

**2. Let nothing after an exclusion decide anything.** A later round correctly weakened "is a Means" to "is not the Objective" (Means is a constrained slot needing a fixed approach and a KTD). The first draft of that fix then enumerated where the line could go instead -- "it is a requirement, a constraint, or a success criterion" -- and Codex drifted again on 1 of 2 trials. The clause after the exclusion offered somewhere else to land, so the reader landed there. Delegating the destination ("the registry above decides where it does belong") restored 3 of 3. This is a condition about competition, not position: the shipped text keeps a delegation and a subordinated shape after its exclusion, and neither rules on anything.

**3. The evidence only existed because the procedure required it.** Both restatements read strictly better than what they replaced, both answered correct findings, and both would have shipped on a read-through. They were caught only because the skill-editing procedure requires re-verifying a restatement against every path the old text served by running them, on more than one host.

## Why This Matters

A skill authored here ships to Claude Code, Codex, Cursor, and Gemini, so the weakest reader in that matrix sets whether a condition is sufficient on its own, and the strong model's success hides the gap: single-host verification returns green on both arms and reports the restatement as free. This is the same asymmetry as `strong-models-mask-defensive-skill-fixes.md` -- there a strong model masked the *value* of a defensive fix; here it masks the *cost* of removing one. Prose edits accrete at the end of a block, and an exclusion is the one construct that cannot survive that: each appended clause is individually correct and passes review, which is why the regression is detectable by eval and not by argument.

## When to Apply

- A review finding says a case list should be a condition, and it is correct. Restate, then verify on more than one host before concluding the restatement is free.
- Writing or editing a negative rule ("X is not Y", "never do Z"). Check whether anything after it decides something; move qualifications before it and delegate the alternative destination to an existing registry rather than enumerating it inline. An illustration that rules on nothing may stay.
- Where a condition is abstract enough that the failing instance is not obvious, one subordinated shape is cheap insurance for a weaker harness.

Not applicable when the "cases" are a genuine closed set the condition cannot express (an enum, a fixed list of section names) -- those are data, not an under-abstracted rule.
