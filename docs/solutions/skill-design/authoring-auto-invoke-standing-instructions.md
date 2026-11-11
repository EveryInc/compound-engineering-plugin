---
title: Authoring "Make It Automatic" auto-invoke guidance for CE skills
date: 2026-07-12
last_updated: 2026-09-02
category: skill-design
module: compound-engineering
problem_type: convention
component: development_workflow
severity: medium
applies_when:
  - Adding standing-instruction guidance to a skill's guide page (a "Make capture automatic" section, or a short paragraph like the one in ce-simplify-code's guide)
  - Writing a standing instruction that tells an agent to auto-invoke a skill from AGENTS.md/CLAUDE.md
  - Wiring a mutating skill (ce-simplify-code, ce-compound) to run on its own without user prompting
tags:
  - auto-invoke
  - standing-instruction
  - ce-simplify-code
  - ce-compound
  - defense-in-depth
  - cross-harness
related_components:
  - ce-simplify-code
  - ce-compound
---

# Authoring "Make It Automatic" auto-invoke guidance for CE skills

Users add a standing instruction to their agent-instructions file so a skill whose value sits at a completion boundary (`ce-simplify-code`, `ce-compound`) runs on its own. A naive instruction wastes cycles (a homegrown "always simplify after changes" rule ran three reviewer subagents on documentation-only diffs) and fires at the wrong moment (mid-build, rewriting code still being shaped).

The two-layer split, where the standing instruction carries the size/cost floor and the skill self-guards on the **kind** of change only, is stated in `docs/guides/ce-simplify-code.md` and the Preflight in `skills/ce-simplify-code/SKILL.md`; for `ce-compound`, the value gate is its Preconditions. This doc keeps what those do not say.

## Timing: a completion boundary, not per-edit

Fire when a unit of work has *settled* ("when you finish a coherent unit of work / before you review, commit, or hand it off") with an explicit negative: not after every individual edit while still building. Vague wording like "after significant changes" with no boundary and no numeric floor lets eager agents fire constantly.

## Offer-first is not the safe one

When a skill is safe by construction (behavior-preserving, never weakens tests or types to get green and removes a test only when it names the remaining test that covers it, verifies before finishing, lands edits on a branch the user reviews before commit), auto-run is not the reckless option and offer-first is not the safe one. Present them as peer variants and frame the choice as *interruption preference, not risk*. Reflexively stamping offer-first "recommended" over-weights a risk the skill design already handles.

## Cross-harness phrasing rules

These sections are read by whatever agent the user runs (Claude Code, Codex, Gemini, Cursor). The "invoke the skill, not `/skill`" rule is in `docs/guides/ce-compound.md` "Make capture automatic"; the substantive-code eligibility and the hard-negative exclusions are the `ce-simplify-code` Preflight. Two reasons those do not state:

- **"before review, commit, or handoff"**, not "at the end of the session": an agent cannot reliably detect session end but does know an imminent workflow boundary.
- Eligibility keyed on substantive code, not a filename allowlist: tests, migrations, and code-bearing config carry real yield.

## When to apply

A skill whose value is concentrated at a completion boundary and whose reviewers have a no-yield input class worth excluding. A skill that is cheap, always-relevant, or has no distinct no-yield class needs neither the exclusions nor a self-guard.

The kind-not-size self-guard was verified by a cross-host routing eval (5 resolved-scope scenarios on Claude and Codex, fresh subagents reading the on-disk `SKILL.md`, 10/10): docs-only and lockfile scopes short-circuited, a mixed diff narrowed to its code file, and both a ~5-line explicit scope and a normal code diff ran.

## See Also

- [`portable-agent-skill-authoring.md`](./portable-agent-skill-authoring.md): the cross-harness authoring guide these phrasing rules instantiate
- [`post-menu-routing-belongs-inline.md`](./post-menu-routing-belongs-inline.md): related SKILL.md authoring-placement discipline
- `docs/guides/ce-compound.md` "Make Capture Automatic", the pattern this generalizes
