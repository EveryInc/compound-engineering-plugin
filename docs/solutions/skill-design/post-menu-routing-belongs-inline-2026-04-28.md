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

The plugin's own `plugins/compound-engineering/AGENTS.md` "Conditional and Late-Sequence Extraction" section guides extraction: extract content that is *conditional or late-sequence and represents ~20%+ of the skill*. The bare per-option routing was late-sequence (only fires after Phase 5) but **not conditional** — option 1 always means "invoke ce-work," option 4 always means "end the turn." The always-on subset should not have been extracted.

The same AGENTS.md, in "Skill Design Principles," already articulates the underlying rule: *"For load-bearing rules (those that MUST fire reliably), put strong language at the top of the relevant phase in SKILL.md, not just in the reference. References can be skipped; SKILL.md is always loaded."* The post-menu routing satisfies the load-bearing definition. Failing to apply this principle was the authoring mistake.

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

## Related Patterns

- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md` — same family: skills that render decision points need their state transitions to be deterministic in the loaded context, not one reference-load away.
- `docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md` — load-bearing scoring rubrics also belong inline in SKILL.md so they fire reliably across sessions.
