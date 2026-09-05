---
title: Always-on post-menu routing must fire from loaded context — inline, or a required-read pointer that names what only the file carries
date: 2026-04-28
last_updated: 2026-08-18
category: skill-design
module: compound-engineering
problem_type: architecture_pattern
component: ce-plan
severity: medium
applies_when:
  - Authoring a skill that ends in a menu where the user picks the next action
  - Deciding whether per-option routing belongs in SKILL.md or in a reference file
  - Reviewing a skill where the agent renders a menu and stops at the user's selection without acting
tags:
  - skill-design
  - menu-routing
  - skill-md-vs-references
  - ce-plan
  - extraction-rule
  - load-bearing-rules
related_issue: https://github.com/EveryInc/compound-engineering-plugin/issues/714
---

## The failure (#714)

`ce-plan`'s post-generation menu had its per-option routing only in `references/plan-handoff.md`, mentioned from the body in passing. Agents rendered the menu, captured the selection, and stopped — acknowledging "Start /ce-work" in prose instead of invoking the skill. Two causes compounded: the agent never loaded the reference (references load on demand; an agent that renders past a "load now" line on its way to the menu has no routing in context), and even a loaded reference said "Call /ce-work," which reads as "tell the user to type it" rather than "fire the skill-invocation primitive now with the plan path."

## The condition, restated

Routing may live in a reference when the body names that file as a **required read at the step**, states **what only it carries**, and **leaves nothing partial to act on instead**. Routing may not live in a reference the body mentions once in passing, or summarizes — the summary suppresses the read, and then the agent stops in prose or drops an argument. Where the routed action is the agent's answer to a selection the user has already made, the step cannot complete without the file, which is why this shape is the safest one to relocate. `ce-plan` now uses this shape (`skills/ce-plan/SKILL.md`, "STOP. Read `references/plan-handoff.md`"), pinned by `tests/skills/ce-plan-handoff-routing.test.ts`.

Whichever placement, the routing line must be platform-explicit: name the skill-invocation primitive and the argument shape (plan path, file path), and say not to merely tell the user to type it.

**Two things belong in the body regardless of how well the pointer is written:**

- **The stop class that must hold when the file is never opened.** `ce-explain` keeps "ht-ml.app is public, so it must never be selected headlessly" and its non-interactive degradation path in the body, because those decide what happens on the path where the read did not occur.
- **Anything whose step acts before the read.** `ce-explain`'s ownership-checked `$RUN_DIR` fence was moved behind a required read once and moved back (#1451): that PR's own eval caught a harness creating `$RUN_DIR` without loading the file, and an improvised `mkdir` accepts a planted symlink or foreign-owned directory. A required read is reliable for a step whose first action *is* reading it, not for a step with something to do first.

**Move a contract test with the contract and you delete the guard.** If routing must be inline, the test asserts it is inline; if it must be in a named required read, the test asserts the pointer and the file. Pin where the rule says the text must be, not wherever the string currently lives — `ce-debug`'s `branding:on` test had been repointed at the reference along with the routing, so nothing was left watching the body.

## The measurements behind the condition

**A paraphrasing stub fails (ce-debug, 2026-08).** Phase 4's post-fix tail — quality tail and the commit/PR routing for both branch paths — was extracted to `references/post-fix-handoff.md` with a stub that summarized the branch paths. It looked like textbook conditional/late-sequence extraction (~22% of the skill, skipped in `mode:pipeline`). Three-arm paired injection on "you just finished a fix on a skill-owned branch," graded on firing `ce-commit-push-pr` with `branding:on`:

| Arm | Codex | Claude | Total |
|---|---|---|---|
| old — routing inline | 2/2 | 1/1 | **3/3** |
| extracted — paraphrasing stub, routing reference-only | 0/2 | 0/3 | **0/5** |
| re-inlined | 2/2 | 3/3 | **5/5** |

Two Claude runs emitted only `READ: references/post-fix-handoff.md` and stopped — the #714 shape. The one extracted run that continued invoked `ce-commit-push-pr` without `branding:on`. The stub was complete enough to act on and not complete enough to act on correctly, so it suppressed the load and lost the detail in one move. "Conditional or late-sequence" is necessary, not sufficient: the block is always executed once a fix lands.

**A pointer that names what only the file carries passes (ce-explain, 2026-08-18).** Phase 6's destination menu and routing were moved wholesale into `references/destinations.md`, the body naming it as a required read that "owns the destination menu, the per-option routing, each destination's sub-flow … Read it now; do not render the menu and do not act on the user's selection without it." Two matrices, graded on evidence (file actually copied, artifact actually created, publish withheld pending the required ask):

| Arm | Claude Code | Codex CLI | Total | Opened the reference |
|---|---:|---:|---:|---:|
| routing inline | 27/27 | 21/21 | **48/48** | 11/48 |
| routing in the required-read reference | 27/27 | 21/21 | **48/48** | **48/48** |

**The 0/5 does not reproduce once the pointer is written that way.** `ce-debug`'s routing was re-measured relocated into its required-read reference with the stub rewritten to name what only the file carries and what skipping costs, fire-the-action imperative kept in the body, three trials per arm: inline 6/6, reference 5/6, the one miss taking the skill's named safe direction on a no-network scenario. `ce-debug` keeps its routing inline anyway: relocating lands the body at 13,118 CRLF bytes, still far over the 8,000 target, so the move buys no headroom while spending a measured margin.

Scope: the `ce-babysit-pr` restructure (`size-driven-skill-restructure.md`) measured with a `FILES_READ` probe that Codex, Grok, and Claude all loaded references named at their point of use. None of this is evidence that references are not followed; it is evidence about what the body must say about the file.

## Related Patterns

- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines.md` — skills that render decision points need their transitions deterministic in loaded context.
- `docs/solutions/skill-design/confidence-anchored-scoring.md` — load-bearing scoring rubrics also stay where they fire reliably.
- `docs/solutions/skill-design/size-driven-skill-restructure.md` — the required-read-at-point-of-use measurement.
