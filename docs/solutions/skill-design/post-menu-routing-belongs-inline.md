---
title: Always-on routing for interactive menus belongs inline in SKILL.md, not in references
date: 2026-04-28
category: skill-design
module: compound-engineering
problem_type: architecture_pattern
component: ce-plan
severity: medium
applies_when:
  - Authoring a skill that ends in an `AskUserQuestion`-style menu where the user picks the next action
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

## Problem

`ce-plan` Phase 5.4 presented a four-option post-generation menu (`Start /ce-work`, `Create Issue`, `Open in Proof`, `Done for now`). The action that should fire when the user picked an option lived only in `references/plan-handoff.md`. The skill body said "Routing each selection ... lives in `references/plan-handoff.md` — follow it for every branch" plus a "Load `references/plan-handoff.md` now" instruction in 5.3.8.

In practice, agents rendered the menu, captured the user's selection, and stopped without firing the routed action. The user picked "Start `/ce-work` (Recommended)" and watched the agent acknowledge the choice in prose ("User picked Start /ce-work. Handing off — invoke `/ce-work` next") instead of programmatically invoking `ce-work`.

## Root Cause

Two failure modes compounded:

1. **The agent didn't load the reference.** SKILL.md content caches at session start; references load on demand. An agent that renders past the "Load `references/plan-handoff.md` now" instruction on the way to the menu has no per-option routing in its loaded context. The menu becomes a textual handoff with no associated action.
2. **Even an agent that loaded the reference saw ambiguous language.** The reference said `**Start /ce-work** -> Call /ce-work with the plan path`. That doesn't name the platform's skill-invocation primitive. "Call /ce-work" can be read as "tell the user to type /ce-work in chat" rather than "fire the Skill tool now."

The plugin's own `AGENTS.md` "Extract Conditional and Late-Sequence Blocks" rule (under "Writing Skill Instructions") guides extraction: extract content that is *conditional or late-sequence and represents ~20%+ of the skill*. The bare per-option routing was late-sequence (only fires after Phase 5) but **not conditional** — option 1 always means "invoke ce-work," option 4 always means "end the turn." The always-on subset should not have been extracted.

The same AGENTS.md, in "Inline the Trigger, Not the Content," already articulates the underlying rule: a load-bearing instruction (one that MUST fire reliably) belongs inline at the top of its phase, because references load on demand and an agent that skipped one would stop or guess. The post-menu routing satisfies the load-bearing definition. Failing to apply this principle was the authoring mistake.

## Fix

1. Inline a `### Routing` block in SKILL.md Phase 5.4 with one explicit action per menu option. Use platform-explicit invocation language: "Invoke the `ce-work` skill via the platform's skill-invocation primitive (`Skill` in Claude Code, `Skill` in Codex, the equivalent on Gemini/Pi), passing the plan path as the skill argument. Do not merely tell the user to type `/ce-work` — fire the invocation now so the plan executes in this session."
2. Mirror the same platform-explicit phrasing in `references/plan-handoff.md` so both surfaces converge. The reference still owns the elaborate sub-flows (Proof HITL state machine, Issue Creation tracker detection, post-HITL `ce-doc-review` resync, upload-failure fallback) — those are genuinely conditional and multi-step.
3. Add a regression test (`tests/skills/ce-plan-handoff-routing.test.ts`) that fails if any of the four inline routing lines disappear, and specifically asserts that the `Start /ce-work` routing names the skill-invocation primitive and the plan path.

## Authoring Checklist for Future Skills

Before extracting a block to a reference file, ask:

- **Is the block always executed when this phase is reached?** If yes, lean toward inlining. References are for branches the agent enters only sometimes.
- **Does the block carry routing for an interactive menu the skill renders?** If yes, the bare per-option action belongs inline. The elaborate sub-flow for each option (multi-status state machines, retry logic, downstream skill dispatch) can stay in a reference.
- **Could an agent that skips the reference still complete the skill correctly?** If no — if the agent without the reference would stop or guess — the missing content is load-bearing and belongs inline.
- **Is the language platform-explicit?** When a routing line says "Call /ce-work," ask whether an agent could read it as "tell the user" rather than "fire the tool." Name the platform primitive (Skill tool, skill-invocation primitive) and the argument shape (plan path, file path).
- **Does the inline block command the agent to load and act, or does it summarize what the reference contains?** Inlining is two-sided. The firing imperative and the load instruction belong inline (the rest of this checklist). But a *paraphrase of the reference's substance* backfires the opposite way: it drifts from the reference (nothing tests the two copies against each other), and it suppresses the load — an agent that already has a workable inline summary judges it "has enough" and never opens the file, so the reference's templates and examples never reach it. Inline the trigger; keep the substance in the one reference that owns it. Test: if the inline text is complete enough to act on alone, the agent will, and the reference's nuance never lands. (See `AGENTS.md` → "Inline the Trigger, Not the Content.")

## Confirmed by eval on a second skill (2026-08)

The `ce-plan` case above was diagnosed from an observed failure. The same mistake was later made in `ce-debug` during a slimming pass and then *measured*, which turns the checklist above from a plausible rule into a demonstrated one.

`ce-debug`'s Phase 4 post-fix tail was extracted wholesale to `references/post-fix-handoff.md` — quality tail **and** the commit/PR routing for both branch paths. It looked like textbook conditional/late-sequence extraction: ~22% of the skill, skipped entirely in `mode:pipeline` and on diagnosis-only runs. Every mechanical gate stayed green, because the `branding:on` contract test had been repointed at the reference — the guard moved along with the thing it was guarding, so nothing was left watching the body.

A three-arm paired injection (old inline / extracted / re-inlined) over a "you just finished a fix on a skill-owned branch" scenario, graded on whether the agent fires `ce-commit-push-pr` with `branding:on`:

| Arm | Codex | Claude | Total |
|---|---|---|---|
| old — routing inline | 2/2 | 1/1 | **3/3** |
| extracted — routing reference-only | 0/2 | 0/3 | **0/5** |
| re-inlined — routing back in the body | 2/2 | 3/3 | **5/5** |

Both predicted failure shapes appeared. Two Claude runs emitted **only** `READ: references/post-fix-handoff.md` and stopped — the #714 shape exactly, an agent that loads and then never routes. The one extracted-arm run that did continue invoked `ce-commit-push-pr` **without `branding:on`**, silently dropping the provenance signal.

Three things generalize:

1. **"Conditional or late-sequence" is necessary, not sufficient.** The size and lateness tests both passed here. The checklist question that failed was *"is the block always executed when this phase is reached?"* — it is, once a fix lands. Run all four questions, not the extraction heuristic alone.
2. **A stub that paraphrases the reference is worse than either extreme.** The first stub summarized the branch paths ("skill-owned commits and opens a PR without prompting; pre-existing branch asks") — complete enough to act on, not complete enough to act on *correctly*. It suppressed the load and lost the detail in one move.
3. **Move a contract test with the contract, and you delete the guard.** If routing must be inline, the test must assert it is inline. Pin the body, not wherever the string currently lives.

The fix followed `ce-plan`'s: a `#### Routing` block inline with the bare per-option action for each branch, elaborate sub-flows left in the reference, and a regression test asserting the routing lines and the stub's skip-failure clause stay in `SKILL.md`.

## Related Patterns

- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines.md` — same family: skills that render decision points need their state transitions to be deterministic in the loaded context, not one reference-load away.
- `docs/solutions/skill-design/confidence-anchored-scoring.md` — load-bearing scoring rubrics also belong inline in SKILL.md so they fire reliably across sessions.
