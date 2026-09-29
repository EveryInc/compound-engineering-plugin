---
title: Right-size plans by removing instructions that ask for more, then sizing with a usage-first test
date: 2026-09-28
category: skill-design
module: skills/ce-plan
problem_type: design_pattern
component: development_workflow
severity: high
applies_when:
  - A planning or review skill produces plans with guards, retries, modes, runbooks, or kill switches nobody asked for
  - Deciding whether to fix overbuilding by adding counter-prose or by removing instructions that ask for more
  - Writing a sizing test for unrequested mechanisms that must not over-cut real safeguards
  - A reviewer persona recommends edge-case or error handling that the planner merges without judging
  - A plan for an ambitious request narrows, gates, or caps a requested behavior in the name of safety
symptoms:
  - Plans, especially in autonomous lfg runs, commit speculative mechanisms that ce-work then builds
  - ce-doc-review findings asking for more edge-case handling get bolted onto the plan
  - Plans for ambitious requests narrow explicitly requested features (4 of 4 baseline runs)
  - A sizing test without a usage step dropped alerting on an unattended job and rerun protection on a money-moving script
related_components: [ce-doc-review, testing_framework]
tags: [skill-design, ce-plan, ce-doc-review, plan-sizing, subtraction, scope-guardian, skill-eval, cross-host]
---

# Right-size plans by removing instructions that ask for more, then sizing with a usage-first test

## Context

`ce-plan` plans overbuilt, most visibly in autonomous `lfg` runs where nobody was around to push back. Plans committed to guards, retries, recovery paths, modes, ledgers, runbooks, and kill switches that the request never asked for, and `ce-work` then built them. `ce-doc-review` made it worse: its reviewers often asked for more edge-case handling, and `ce-plan` added whatever they asked for. On ambitious requests the opposite failure also showed up. Plans narrowed features the user had explicitly requested and called it safety. In the dunning-system eval scenario, every baseline run (4 of 4) was missing at least one requested feature: one host invented a minimum gap and a daily cap on the requested "retry now", and the other skipped the requested pre-attempt email on manual retries.

Three approaches failed during iteration before the final shape:

- **Adding counter-prose.** During iteration, a "right-size the plan first" pass in plan handoff did nothing measurable on its own and was removed. An example in the sizing test about a "compatibility layer" made things worse: an API plan went on to make a breaking change. That example was removed too.
- **Starting from risk.** "Start from risk" has no stopping point, because any design has one more way to fail.
- **A sizing test with no usage step.** This version cut too much. Plans dropped alerting on an unattended job and rerun protection on a script that moves money.

## Guidance

### 1. Look for instructions that ask for more before you write anything that asks for less

The inflation came from existing skill prose that the model read as a demand for more work. Deleting that prose (about 240 lines net across `ce-plan` and `ce-doc-review`: 285 deleted, 44 added) did more than any new counter-instruction did. Look for these shapes:

- **Categories that read as checklists.** Test-scenario categories such as "error and failure paths ... downstream service failures, timeout behavior" were read as a list of failures to build handling for, not a list of behaviors to test. `skills/ce-plan/references/structure.md:100` now says "Scenarios test the behavior the unit builds; a category is not a list of failures to add handling for", and the category descriptions are scoped to what the unit builds (`structure.md:102-103`). `final-review.md` got the same change.
- **Risk bonuses in scoring.** Deepening section selection added a point for "high-risk" topics and had a separate candidate rule for high-risk domains. Every plan looks high-risk to a model, so both were removed. Only the trigger count and the critical-section bonus remain (`skills/ce-plan/references/deepening-workflow.md:9-14`).
- **"X missing" treated as a gap.** Deepening checklist items such as "failure propagation is underexplored", "state lifecycle ... risks are absent", "rollout, monitoring ... missing", and "security, privacy, performance, or data risks are absent" turned every absence into work. They were removed. "Risks are listed without mitigation" became "A named risk has no decision ... A risk accepted with a reason is decided; a missing mitigation alone is not a gap" (`deepening-workflow.md:79`).
- **"Pair each with a mitigation."** The security specialist's planning contract asked it to turn analysis into "required controls ... and rollout safeguards" and to "pair each with a concrete mitigation or verification step". It now reports risks with evidence that they can happen here, and the planner decides what changes the plan (`skills/ce-plan/references/agents/security-sentinel.md:7`, `:91`).
- **Specialists whose only output is more mechanism.** The deployment-verification agent (rollout checklists, rollback plans) and an orphaned data-migration reviewer prompt were deleted from `skills/ce-plan/references/agents/`.
- **Research output merged as committed work.** Flow-analysis edge cases now carry forward "as a concern for Phase 3 to judge, not as committed plan work" (`skills/ce-plan/references/research.md:203`).

### 2. Replace the removed prose with one usage-first sizing test

Put a single test where the plan is shaped, and route every other source of concerns through it.

- **Start from usage** (`structure.md:44`): who calls, runs, or depends on the result, what they see when it works, and who finds out when it fails. "When nobody would, making the failure visible is part of that usage, not an extra." This line is what brought back alerting on the unattended job after the usage-free test had cut it.
- **Build an unrequested mechanism only when** an existing contract requires it, or leaving it out causes harm nobody would catch in time, or adding it later would be expensive because it touches stored data or its format, a public or shared interface, money, or security (`structure.md:133-139`). The first condition includes a clause that matters: "Something that notices the failure counts; an instruction asking a person to avoid it, or to clean up by hand afterward, does not." Without that clause, "tell the operator not to rerun it" counted as protection against double-crediting.
- **Use the smallest form, and test add-ons separately.** A second guard or a recovery mode built around a needed mechanism has to pass the test on its own (`structure.md:140`).
- **Requested scope is off-limits** (`structure.md:142`): "This test sizes what the request did not ask for; it never trims what it did. A safeguard may not narrow a requested behavior by delaying, gating, capping, or skipping any part of it ... When a needed safeguard and a requested behavior truly conflict, plan the behavior as requested and record the conflict under Open Questions for the requester."
- **Record what was not built.** Failing concerns go under `Deferred to Follow-Up Work` as considered and not built, with the reason and what evidence would change the call. When you are unsure, build it (`structure.md:144`).
- **Every source's findings are claims to judge against this test.** Deepening agents (`deepening-workflow.md:243`), research (`research.md:203`), and document review (`plan-handoff.md:25`) all go through it. Plan handoff also keeps review claims that a committed mechanism fails the test, or that a not-built item passes it, and `ce-plan` makes the removal or restoration itself.

### 3. Pair the planner with a reviewer that sizes in both directions

A test that only cuts will over-cut, and a reviewer that only adds will undo it. `ce-doc-review`'s scope-guardian now runs on every plan (`skills/ce-doc-review/references/persona-selection.md:16`). It applies the same conditions in three directions (`skills/ce-doc-review/references/personas/scope-guardian-reviewer.md:54-67`):

- a committed mechanism that fails the test,
- a left-out item that passes it ("ask what happens when that failure occurs and who finds out"),
- a requested behavior the plan narrows.

It replaced a "completeness principle" that recommended edge-case handling because AI makes it cheap to write. The new text says the opposite: "Do not recommend edge-case handling, validation, or error handling on the grounds that it is cheap to write" (`scope-guardian-reviewer.md:67`). The two skills now enforce one standard together.

## Why This Matters

Instructions that ask for more work add up. Each one sounds reasonable alone, and a model that follows them faithfully produces a plan full of speculative machinery, which then gets implemented, reviewed, and maintained. Adding "but don't overbuild" alongside them leaves both instructions in place and the model has to pick one. Here that did nothing, and in one case the counter-example itself caused a regression. Removing the instructions that ask for more takes away the pull. The usage-first test then gives the model a way to decide what is actually needed, so the cut does not also drop the alerting or rerun protection that the situation required.

Blind-graded results (speculative mechanisms per run, before `dd1bf2b8` -> after):

| Scenario | Claude | Codex |
|---|---|---|
| script | 20, 24 -> 10, 9 | 6, 9 -> 5, 7 |
| job | 10 -> 6, 9 | 15 -> 14, 17 |
| migration | 5 -> 3, 1 | 12 -> 12, 6 |
| ambitious | 12, 14 -> 9, 9 | 18, 20 -> 17, 16 |

On the ambitious scenario, runs with a requested feature missing went from 4/4 at baseline, and still 4/4 before the "never trims what it did" paragraph, to 0/4 after it. Codex listed "manual retry cooldowns" as considered and not built. Claude sent the notice on manual retry and put the lead-time question under Open Questions. Known remaining signals: Codex still produces heavy plans on `job` and `ambitious`, and the deprecation notice for an old API field sometimes gets deferred.

The fixtures, rubric, REQUIRED lists, pass condition, and reference results are in `tests/skill-eval-cell/packs/ce-plan-sizing.md`. Rerun it after any change to how `ce-plan` decides what a plan builds. It runs `ce-doc-review` from the same ref through `--with-skill` so the companion skill is not the installed copy. For Grok, pass `--reasoning-effort`, because otherwise it inherits the operator's default.

## When to Apply

- A skill's output is consistently larger, more defensive, or more elaborate than the request needs, especially in unattended runs.
- A reviewer or specialist loop keeps adding to an artifact and never takes anything out.
- You are about to add a "keep it minimal" or "don't overbuild" instruction. Search the skill and its references for prose that asks for more before you do.
- Any sizing or scoping rule you write needs a counterweight in both directions: a usage anchor so it does not cut needed safety, and a rule that protects requested scope so safety cannot shrink it.

Do not turn the test into a table of mechanism types with verdicts. It gives a starting point and a goal (who finds out when it fails, what is expensive to add later) and leaves the call to the model.

## Examples

**Test-scenario categories** (`structure.md`):

Before:
> Consider each category below and include scenarios from every category that applies to this unit.
> - **Error and failure paths** (when the unit has failure modes) - invalid input, downstream service failures, timeout behavior, permission denials

After:
> Scenarios test the behavior the unit builds; a category is not a list of failures to add handling for. Include scenarios from each category below that applies to what this unit builds.
> - **Error and failure paths** (failure handling the unit builds) - how the unit behaves when that handling triggers

**Deepening gap** (`deepening-workflow.md`):

Before: `Risks are listed without mitigation`
After: `A named risk has no decision: it is neither mitigated nor recorded as considered and not built ... A risk accepted with a reason is decided; a missing mitigation alone is not a gap`

**Reviewer principle** (`scope-guardian-reviewer.md`):

Before:
> With AI-assisted implementation, the cost gap between shortcuts and complete solutions is 10-100x smaller. If the plan proposes partial solutions ... recommend complete. Applies to error handling, validation, edge cases

After: size in both directions (fails, passes, narrows), and "Do not recommend edge-case handling, validation, or error handling on the grounds that it is cheap to write."

**Requested scope versus a safeguard** (ambitious scenario, request includes "retry now" and "email before each attempt"):

- Before: the plan adds a 24-hour minimum gap and a daily cap to "retry now", or reads "each attempt" as "each scheduled attempt" and skips the email on manual retries.
- After: the plan builds retry-now as requested, sends the email on manual retries, lists a cooldown as considered and not built, and records the notice lead-time conflict as an Open Question.

## Related

- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — the standard; its "review prompts bias agents toward additive recommendations" and "diagnose before prescribing" rules are the skill-authoring form of this plan-content lesson.
- `docs/solutions/skill-design/strong-models-mask-defensive-skill-fixes.md` — "guard both failure directions"; the over-cut and the narrowing fix here are that rule applied to ce-plan.
- `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md` — same module; a concrete example in prose steering a literal host, like the compatibility-layer example that caused a breaking change here.
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` — the before/after eval method; its installed-copy leak also applies to a companion skill, which `--with-skill` closes.
- `docs/solutions/skill-design/confidence-anchored-scoring.md` — reviewer output must pass the same benefit requirement before routing.
