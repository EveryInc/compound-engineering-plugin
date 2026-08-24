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

## Context

This bounds two rules this repository already holds, and does not re-derive
either. `portable-agent-skill-authoring.md` is the standard; the "state
conditions, not cases" rule and the restatement prescription in
`prose-review-is-unbounded-answer-with-the-condition.md` are what a skill edit
is supposed to do. `size-driven-skill-restructure.md` records the other
restatement hazard, where a shortened rule comes out absolute and forbids paths
the original allowed. What follows is the measured cost of the same move in the
opposite direction: a restatement that generalizes *correctly* and still loses
behavior, because the concrete shape it dropped was what a more literal host was
matching on.

PR #1535 anchored the plan Objective above the component being changed. The
defect it fixed: a Goal Capsule Objective could be outcome-shaped and still
describe only the component under edit — "long model calls no longer occupy the
action's wall-clock" — and pass an implementation-independence test, because the
surrounding platform reads as fixed context rather than as the thing that had to
change. The shipped rule now anchors the Objective to users or operators and
makes the altitude question one of *who can check it*
(`skills/ce-plan/references/plan-sections.md:125-135`).

That edit is not what this doc is about. The learning is what happened while
getting the rule's *representation* right, twice, in the same PR.

The first version stated the rule bluntly, by naming the concrete failing
shapes: "a statement about what that component no longer does, or about what
stays isolated inside it, is a Means however outcome-shaped its wording." A
review bot correctly found that this case list contradicted the two-part test
three sentences later in the same block
(`skills/ce-plan/references/plan-sections.md:142-146`): a black-box property of
the changed component — the reviewer's example, a CLI that writes no file for a
trivial query — survives a different implementation *and* is checkable from
outside, yet the enumeration excluded it. This repository's own standard says to
state conditions, not cases (`AGENTS.md`, "Working on Skills";
`.agents/skills/ce-skill-work/references/edit-skill.md:34`), so restating the
block was plainly the right call.

The surprise was in the verification. Re-running the block's eval scenario
(`ce-plan/objective-above-the-changed-component`,
`tests/skill-eval-cell/catalog.ts:665`) on Claude and Codex showed that **Codex
had regressed**. With the blunt shapes gone, it produced "Weekly digests
complete reliably without model execution consuming Convex action runtime or
risking its 10-minute limit" — straight back to component altitude, and the
exact failure the block exists to prevent. Claude was unaffected: it held the
contract from the condition alone. The blunt enumeration had been doing real
work for the more literal model, invisibly, and deleting it removed a load
outside the strong model's line of sight.

## Guidance

Two distinct mechanisms came out of this, and they are worth keeping separate.

### 1. Removing a concrete shape can cost determinism even when the condition is more correct. Subordinate it; do not choose.

"State conditions, not cases" is right about which text *decides*. It is not a
license to delete every concrete instance. A condition is an abstraction, and a
more literal model may not instantiate it under prompt pressure — it will find
some reading of "outside the component" that its draft satisfies.

The resolution is not a choice between the condition and the enumeration. Keep
the condition as the decider, and restore **one** concrete failing shape
explicitly subordinated to it as the condition's usual failure. The shipped text
does exactly that: the condition rules
(`plan-sections.md:127-133`), and then

> The usual failure is an objective about the component's own execution — the
> wall-clock it no longer holds, the runtime it no longer consumes, what stays
> isolated inside it — which only its internals settle.
> (`plan-sections.md:133-135`)

The shape is present for the literal reader, framed as an illustration of the
condition rather than as the rule, and the closing clause hands adjudication
back to the condition ("which only its internals settle"). This is not the case
list returning: a case list competes with the condition and can contradict it,
which is what the reviewer caught; a subordinated shape cannot, because it
carries no independent decision. After this change, 3 of 3 Codex trials produced
an Objective at the correct altitude.

### 2. A competing decision after an exclusion dilutes it. Let nothing after one decide anything.

The same block regressed a second time, by a different route. A later review
round pointed out — correctly — that the rule asserted a destination it could
not guarantee: it said a component-settled outcome "is a Means", but Means is a
constrained slot that requires a fixed approach and a KTD or Key Decision to
cite (`plan-sections.md:137-141`). A component-settled line often has neither.
The fix was to weaken the claim to "is not the Objective".

The first draft of *that* fix then enumerated where such a line could instead
go — "a requirement, a constraint, or a success criterion" — and Codex drifted
again, on one of two trials, producing a mixed Objective that named the Convex
action window. The enumeration was itself a case list, so it was wrong on the
first mechanism too, but the operative failure was competition: the clause after
the exclusion offered the reader somewhere else to land, so the reader landed
there. Tightening the sentence so the destination is delegated rather than
listed — leaving nothing after the exclusion that rules on anything —

> …and one only its internals can settle is not the Objective however
> outcome-shaped its wording; the registry above decides where it does belong.
> (`plan-sections.md:131-133`)

— restored 3 of 3 clean trials. Both regressions in this PR were the exclusion
losing salience: once by deletion, once by burial behind an enumeration.

### 3. The evidence only existed because the procedure required it.

Neither regression is visible by reading. Both restatements read strictly better
than what they replaced, both were made in direct response to correct findings,
and both would have shipped on a read-through. They were caught only because
this repo's skill-editing procedure requires re-verifying a restatement against
every path the old text served, including paths the current review round does
not re-raise (`.agents/skills/ce-skill-work/references/edit-skill.md:34`;
`.agents/skills/ce-skill-work/references/respond-to-review.md:13`). The vehicle
was the eval cell — `bun run test:skill-eval-cell` (`package.json:26`,
`tests/skill-eval-cell/README.md`) — run on Claude and Codex, grading the
declared Objective by reading it across arms rather than by keyword, as the
scenario's `why` field records (`tests/skill-eval-cell/catalog.ts:673`).

## Why This Matters

The repo's standard and this finding pull in opposite directions if you read the
standard as "delete the cases." A skill authored here ships to Claude Code,
Codex, Cursor, and Gemini, so the weakest reader in that matrix — not the
strongest — sets whether a condition is sufficient on its own. A block that a
frontier model satisfies from the condition alone can be a coin flip on a more
literal host, and the strong model's success actively hides it: single-host
verification returns green on both arms and reports the restatement as free.
This is the same asymmetry recorded in
`docs/solutions/skill-design/strong-models-mask-defensive-skill-fixes.md` —
there, a strong model masked the *value* of a defensive fix; here, it masks the
*cost* of removing one.

The second mechanism matters because prose edits accrete at the end. Every
review round appends: a clarification, a qualification, a list of alternatives.
An exclusion is the one construct that cannot survive that treatment, because
a later clause that decides anything competes with it for the same reader. Note
that this is a condition about competition, not about position: the shipped
example above keeps both a delegation and a subordinated shape after its
exclusion, and neither displaces it, because neither rules on anything. Blocks
that regress this way still pass review — each appended clause is individually
correct — which is why the regression is detectable by eval and not by
argument.

Together they narrow the "state conditions, not cases" rule to what it actually
claims: the condition owns the decision; a single concrete shape can stay,
subordinated to it, when a real host needs it to instantiate the abstraction —
and nothing that decides anything follows an exclusion.

## When to Apply

- A review finding says a case list in skill prose should be a condition, and
  the finding is correct. Restate — then verify on more than one host before
  concluding the restatement is free.
- Any restatement of a skill block, per
  `.agents/skills/ce-skill-work` respond mode. "Re-verify against every path the
  old text served" means running them, not re-reading them: a restatement that
  reads better is the expected appearance of a silent regression.
- Writing or editing a negative rule ("X is not Y", "never do Z") in prose a
  model must follow. Check whether anything after it in the paragraph decides
  something; move qualifications before it, and delegate the alternative
  destination to an existing registry or section rather than enumerating it
  inline. An illustration that rules on nothing may stay.
- Deciding what a skill block owes a weaker harness. Where a condition is
  abstract enough that the failing instance is not obvious, one subordinated
  shape is cheap insurance.

Not applicable when the "cases" are a genuine closed set the condition cannot
express (an enum, a fixed list of section names) — those are data, not an
under-abstracted rule.

## Examples

**Round 1 — the case list the reviewer correctly rejected:**

```
…a statement about what that component no longer does, or about what stays
isolated inside it, is a Means however outcome-shaped its wording.
```

Contradicts the two-part test three sentences later: a black-box property of the
changed component (a CLI that writes no file for a trivial query) passes both
halves of that test but is excluded by this list.

**Round 1 fix, condition only — reads better, regressed Codex:**

```
It sits outside the component being changed, which is a question of who can
check it rather than of which nouns it uses: an outcome someone outside that
component can verify without knowing its internals is an Objective even when
that component is what changed, and one only its internals can settle is a
Means however outcome-shaped its wording.
```

Codex output under this text:

```
Objective: Weekly digests complete reliably without model execution consuming
Convex action runtime or risking its 10-minute limit
```

Component altitude — the exact failure the block exists to prevent. Claude was
unaffected.

**Round 1 resolution — condition decides, shape subordinated (3/3 Codex clean):**

```
…and one only its internals can settle is a Means however outcome-shaped its
wording. The usual failure is an objective about the component's own execution
— the wall-clock it no longer holds, the runtime it no longer consumes, what
stays isolated inside it — which only its internals settle.
```

**Round 2 — correct finding, diluted fix.** The rule could not guarantee
"Means" (that slot needs a fixed approach and a KTD to cite), so the claim was
weakened to "is not the Objective" — but the draft then enumerated the
alternatives:

```
…is not the Objective however outcome-shaped its wording; it is a requirement,
a constraint, or a success criterion.
```

Codex drifted on 1 of 2 trials, producing a mixed Objective that named the
Convex action window. The enumeration is a case list *and* it displaced the
exclusion from the end of the sentence.

**Round 2 resolution — exclusion stays salient, destination delegated (3/3
clean):**

```
…is not the Objective however outcome-shaped its wording; the registry above
decides where it does belong.
```

Shipped text: `skills/ce-plan/references/plan-sections.md:131-135`. Scenario:
`ce-plan/objective-above-the-changed-component`,
`tests/skill-eval-cell/catalog.ts:665`. Trial counts and the quoted Codex
outputs are from this session's eval runs on Claude and Codex; the catalog entry
independently records the three post-change Codex trials at the right altitude
(`tests/skill-eval-cell/catalog.ts:673`).
