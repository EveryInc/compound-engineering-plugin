---
title: "Prove a skill prose change moved behavior with paired old-vs-new blind injection"
date: 2026-07-01
category: skill-design
module: compound-engineering-plugin skill evaluation
problem_type: design_pattern
component: testing_framework
severity: medium
applies_when:
  - Validating a prose/behavior edit to a SKILL.md, agent persona, or prompt
  - Needing to tell "demonstrated improvement" apart from "no regression"
  - One skill's output is consumed or gated by another skill or a test
  - Adding or renaming a field in a cross-skill output contract
related_components:
  - tooling
  - development_workflow
tags:
  - skill-evals
  - paired-injection
  - behavior-verification
  - cross-skill-contract
  - anti-drift-test
  - frontier-model
  - named-fields
---

# Prove a skill prose change moved behavior with paired old-vs-new blind injection

## Context

Editing the prose of an agent skill (a `SKILL.md`, an embedded persona, or any behavior-shaping prompt) is cheap; *knowing whether the edit actually changed agent behavior* is not. Prose changes look self-evidently good in a diff, so they ship on the author's intuition. Two failure modes hide in that gap:

- **The change is a no-op at the current model tier.** A frontier model may already do the "new" thing by default, so the added rule buys nothing you can observe — you shipped tokens, not behavior.
- **The change creates a cross-skill contract that no test enforces.** One skill's output is supposed to be gated by another skill (or a test), but the two ends can drift independently and every existing test stays green.

This methodology came out of validating a set of prose edits that added a *behavior-verification evidence* contract across four orchestration skills (`ce-work`, `ce-debug`, `ce-plan`, `lfg`): one producer skill emits verification evidence, and a downstream orchestrator gates shipping on that evidence. The goal was to prove — not assume — that the edits changed behavior, and to leave behind a test that fails when the contract is broken.

## Guidance

Validate behavior-changing prose edits with four complementary techniques. The first two establish *whether* the edit does anything; the last two make a *cross-skill* contract durable.

### 1. Paired old-vs-new blind injection

Extract the **actual** pre-change excerpt of the changed section from `git HEAD~1` and the post-change excerpt from the working tree — the real bytes, not a paraphrase. Dispatch two subagents:

- one seeded with the OLD excerpt, one with the NEW excerpt;
- **both blind** to which version they hold and blind to the expected answer;
- **identical** realistic scenario given to each;
- each must return a **concrete decision plus an artifact** — the ordered steps it would take, the structured return object it would emit, the next pipeline action it would invoke — not a vague opinion.

Then compare the two artifacts.

- If both produce the **same correct** decision, you have proven **no-regression only** — the new prose did not break the behavior. That is a real result, but it is not evidence of improvement.
- To claim **improvement**, you need a scenario where the OLD excerpt *fails* and the NEW excerpt *succeeds*. Design for that discriminating case explicitly; if you cannot find one, the honest conclusion is that the change is not an improvement at this tier (see technique 2).

Complement the paired runs with **new-only restraint negatives**: scenarios that prove the new rule does *not* over-fire. If you add a rule "emit an execution note when X," run a plain case with no X and confirm the new prose still omits the note; if you tighten a testing gate, run a pure-config task and confirm it still takes the legitimate no-test exception. A rule that fires on everything is as broken as one that fires on nothing.

### 2. Read a non-discriminating result honestly

At a capable model tier, many prose rules buy **determinism, weaker-model insurance, and run-to-run variance reduction** — not a behavior flip. When a paired eval comes out non-discriminating (old and new both do the right thing, and the old-prose agent even *justifies* the right thing with its own reasoning), do not relabel it as proof of improvement. Record it as: "already emergent at this tier; the rule locks in determinism and protects weaker models." Separate the changes that genuinely discriminate from the ones that only harden — both are worth shipping, but only the former is a behavior change you can demonstrate.

### 3. Standardize the field NAME, not just the information

When one skill's output must be consumed or gated by another skill or a test, the value of the edit is giving the consumer a **stable token to match on**. A capable producer already surfaces the relevant information — but as improvised free-text under an inconsistent name, which nothing downstream can key on. Change the contract to emit a **named field with named subfields**, and write the consumer's gate against that name. "Prompt the producer to consider X" is not testable; "the producer emits `X` and the consumer requires `X` when a condition holds" is mechanically checkable.

### 4. Prove the parity test fails on one-sided drift

Prose-presence tests (`SKILL.md` `.toContain("field_name")`) guard each skill **in isolation** — both stay green if the producer renames the field but the consumer's gate is not updated, or vice versa. To guard the *contract*, write a structural **parity test** that:

- **scopes** its assertions to the *owning section* of each file (the producer's return block, the consumer's gate block) via string-slice anchors, not "anywhere in the file" — an unscoped match passes on an incidental mention elsewhere; and
- **cross-checks a shared facts map** so both ends are asserted to name the *same* facts (the producer's backtick token `existing_tests_inspected` matched against the consumer's prose "existing tests inspected").

Then do the step that is almost always skipped: **inject one-sided drift and watch the test fail.** Rename the field on the producer side only, run the parity test, confirm it goes red, and restore. A parity test you have never seen fail on injected drift is not known to work — it may be asserting something trivially true.

## Why This Matters

- **Prose diffs are persuasive and unfalsifiable by inspection.** Reading a "better" rule tells you nothing about whether the model's output changes. Blind paired injection is the cheapest way to convert a hunch into evidence.
- **Blindness removes the two biggest confounds.** An agent told "you have the new, improved version" will rationalize a better answer; an agent told the expected answer will pattern-match to it. Withholding both makes the decision reflect the prose, not the framing.
- **Honest non-discriminating results prevent overclaiming.** Shipping a rule as a "behavior fix" when it is really weaker-model insurance pollutes the record and inflates confidence in prose as a behavior lever.
- **Named fields are the unit of cross-skill testability.** Gates and tests key on tokens. Without a stable name, the contract lives only in the model's judgment and silently rots.
- **Parity tests are a common false comfort.** A test that has never been observed to fail may be asserting a tautology. Injected-drift verification is what separates a real guard from decoration.

## When to Apply

Apply the full methodology when:

- The edit changes the **prose/behavior** of a skill, agent persona, or prompt (not mechanical code that a normal unit test already exercises).
- The change is intended to **flip a decision** the agent makes, or to **add/rename a field** in an output contract.
- The output of one skill is **consumed or gated by another skill or a test** (apply techniques 3 and 4).

Scale down when:

- The change is a **pure no-op cleanup** (typo, formatting) — no eval needed.
- The change only touches a **single skill in isolation** with no downstream consumer — techniques 1 and 2 suffice; skip the parity test.

Note on tooling: use a skill-authoring/eval harness that **injects the excerpt into a fresh subagent's prompt at dispatch time**, so each run reads the current source. Do not iterate by dispatching the already-loaded plugin skill in the same session — cached skill definitions run pre-edit content.

## Examples

### Paired-injection dispatch shape

```
# Extract the real bytes of the changed section, both sides.
git show HEAD~1:skills/ce-work/SKILL.md   # -> OLD excerpt of the Return-to-Caller block
# working tree                            # -> NEW excerpt of the same block

Subagent A (blind): [OLD excerpt] + [identical scenario] -> "return the structured object you would emit"
Subagent B (blind): [NEW excerpt] + [identical scenario] -> "return the structured object you would emit"

Neither subagent is told which version it holds or what the expected answer is.
```

Reading the result:

- Both emit the same correct object  ->  NO-REGRESSION proven. Not improvement.
- Old fails / new succeeds           ->  IMPROVEMENT proven (this is the case you must design for).
- Old already succeeds on its own reasoning -> NON-DISCRIMINATING: rule buys determinism / weaker-model insurance, not a behavior flip. Say so.

Restraint negative (new-only): give the NEW excerpt a plain task with no triggering
condition and confirm it does NOT emit the new field / note (proves the rule doesn't over-fire).

### Discriminating vs hardening, from one real change set

- **Discriminating (behavior flipped):** old prose let the pipeline ship after a producer returned with no evidence field ("gate satisfied -> proceed to simplify/ship"); new prose retried the producer once, then STOPPED BLOCKED. Old vs new produced different next pipeline actions -> genuine improvement.
- **Hardening only (non-discriminating):** an "update the stale test in place, do not add a duplicate" guardrail — both old- and new-prose agents chose update-in-place, the old one reasoning "two contradictory assertions can't both be green." Ship it for determinism, but do not call it a behavior fix.

### Parity test with injected-drift proof

```ts
// Scope to the OWNING section, then cross-check a shared facts map.
const EVIDENCE_FACTS = {
  existing_tests_inspected: "existing tests inspected",   // producer token -> consumer prose
  tests_added_or_changed:   "tests added/changed",
  behavior_changed:         "behavior_change: true",
};

const producerBlock = slice(ceWorkSrc, "## Return-to-Caller Mode", "Engine selection ("); // owning section
const consumerGate  = slice(lfgSrc, "2. Invoke the `ce-work`", "3. Invoke the `ce-simplify-code`");

for (const [token, prose] of Object.entries(EVIDENCE_FACTS)) {
  expect(producerBlock).toContain(token);  // producer names the field
  expect(consumerGate).toContain(prose);   // consumer gate names the same fact
}
```

Proving it works (the step people skip):

```
1. Rename `existing_tests_inspected` -> `existing_tests_reviewed` in the PRODUCER only.
2. Run the parity test  ->  MUST go red (consumer still says "existing tests inspected").
3. Restore the original name.
```

If step 2 does not turn the test red, the parity test is not actually guarding the contract — fix the scoping or the facts map before trusting it.

## Related

- [fake-cli-harness-for-skill-judgment-evals](fake-cli-harness-for-skill-judgment-evals.md) — sibling method: new-vs-old skill comparison over a *discriminating* fixture. Same "an easy fixture proves nothing" insight; different mechanism (mocks a CLI boundary rather than injecting SKILL.md excerpts into blind subagents).
- [frontier-model-skill-modernization-methodology](frontier-model-skill-modernization-methodology.md) — parent eval methodology; its "fresh subagent, bypass the plugin cache, mechanical transcript grading" step is what paired old-vs-new injection refines into a controlled A/B.
- [safe-auto-rubric-calibration](safe-auto-rubric-calibration.md) — prior art for technique 2: frames a shipped prose change as "mostly a determinism patch, not a rate increase," and argues for measuring variance, not just outcome shift.
- [cross-skill-shared-cache-primitive](cross-skill-shared-cache-primitive.md) — origin of the field-name contract and the parity-drift gap: renaming a schema field can pass a byte-identity parity test yet silently break per-skill consumers. Technique 4 is the mitigation.
- [ce-doc-review-calibration-patterns](ce-doc-review-calibration-patterns.md) — reinforces technique 2: skill judgment is non-deterministic, so grade across reps rather than trusting a single run.
- Source: PR [#1054](https://github.com/EveryInc/compound-engineering-plugin/pull/1054) "fix(testing): require behavior verification evidence" (HEAD `3923315a`), plus the follow-up parity test in `tests/pipeline-review-contract.test.ts`.
