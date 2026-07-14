---
title: Authoring "Make It Automatic" auto-invoke guidance for CE skills
date: 2026-07-12
category: skill-design
module: compound-engineering
problem_type: convention
component: development_workflow
severity: medium
applies_when:
  - Adding a "Make It Automatic" / "Make Capture Automatic" section to a skill's docs page
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

## Context

Several CE skills deliver their value at a moment that's easy to forget — `ce-simplify-code` right after a feature settles, `ce-compound` right after a fix verifies. Users bridge that gap by adding a standing instruction to their agent-instructions file (`AGENTS.md`/`CLAUDE.md`, or a global `~/.claude/CLAUDE.md` / `~/.codex/AGENTS.md`) so the agent invokes the skill on its own. A naive instruction does more harm than good in two concrete ways: it wastes cycles (a homegrown "always simplify after changes" rule ran `ce-simplify-code`'s three reviewer subagents on documentation-only diffs, which yield nothing), and it fires at the wrong moment (mid-build, where a simplification pass rewrites code still being shaped).

`ce-compound` established the pattern with its "Make Capture Automatic" section (PR #1110). This learning generalizes how to author these sections for any CE skill, based on adding one to `ce-simplify-code` (PR #1113), and pairs it with the skill-side self-guard that makes the whole thing robust.

## Guidance

### 1. Two layers, different jobs — duplicate the no-yield boundary, keep cost policy in the caller

Put the skip logic in **both** the standing instruction and the skill, but split responsibility:

- **The standing instruction carries the full activation gate**: timing, the no-yield exclusions, the size floor, and a not-already-run guard. This is the cheap layer — not invoking the skill at all beats invoking it only to have it bail.
- **The skill self-guards on the no-yield boundary only** — if the resolved scope has no substantive change of the kind the skill acts on, it short-circuits before spending subagents. Crucially, the skill gates on the **kind** of change, **never on size**: an explicit user-named scope on a small function is authoritative and must still run. The numeric size floor is a *cost policy* that belongs only in the caller/standing instruction, not baked into the skill where it would override a legitimate explicit invocation.

`ce-simplify-code` had no self-guard before this: `SKILL.md` Step 1 resolved any non-empty scope and Step 2 unconditionally dispatched three reviewers, so a markdown-only diff burned three dispatches. The added preflight (`skills/ce-simplify-code/SKILL.md` Step 1) short-circuits on a no-code scope and narrows to code files on a mixed diff.

### 2. Anchor timing to a completion boundary, not per-edit

The instruction must fire when a unit of work has *settled* — "when you finish a coherent unit of work / before you review, commit, or hand it off" — with an explicit negative: **not after every individual edit or intermediate fix while still building**. Firing per-edit makes the agent rewrite code it's still shaping, which is worse than not running at all. Vague wording like "after significant changes" with no boundary and no numeric floor lets eager agents fire constantly.

### 3. Present offer-first and auto-run as peer variants — don't reflexively recommend the "safe" one

When a skill is safe by construction — behavior-preserving, refuses to weaken tests/types, never strips a safety check, verifies before finishing, and lands edits on a branch the user reviews before commit — auto-run is **not** the reckless option and offer-first is **not** the safe one. Frame the choice as *interruption preference, not risk*, and let the reader pick. Reflexively stamping offer-first "recommended" over-weights a risk the skill design already handles.

### 4. Cross-harness phrasing rules

These sections are read by whatever agent the user runs (Claude Code, Codex, Gemini, Cursor):

- **"invoke the `<skill>` skill"**, never "run `/<skill>`" — the slash-command form is not reliably agent-callable across harnesses; reference the capability, not the keystroke.
- **"before review, commit, or handoff"**, not "at the end of the session" — an agent can't reliably detect session end but does know an imminent workflow boundary.
- Key the eligibility on **"substantive human-authored code"**, not a filename allowlist — tests, migrations, and code-bearing config carry real yield, and a mixed code+docs diff still qualifies (the skill scopes to the code).
- Exclusions are the **load-bearing** part and must be hard negatives: documentation-/Markdown-only, formatting/lint-only, dependency/lockfile, generated/vendored, other purely mechanical churn.

## Why This Matters

The failure this prevents is concrete: three reviewer subagents dispatched against a diff that can only come back empty, repeated on every docs commit, plus mid-build churn that fights the user. The two-layer split means the common automatic path is cheap (instruction gates before invoking) *and* direct invocation is safe (skill bails on a no-yield scope no matter how it was reached). Keeping the size floor out of the skill preserves the authority of an explicit `/ce-simplify-code` on a small change. Getting the cross-harness phrasing right is what makes a single authored section work on every harness the plugin targets.

## When to Apply

Apply when adding a "Make It Automatic" section to any CE skill's docs page, or when wiring a mutating skill to auto-invoke. The pattern assumes a skill whose value is concentrated at a completion boundary and whose reviewers/agents have a no-yield input class worth excluding. A skill that is cheap, always-relevant, or has no distinct no-yield class needs neither the exclusions nor the self-guard.

## Examples

The self-guard is verifiable: a cross-host routing eval (5 resolved-scope scenarios × Claude + Codex, fresh subagents reading the on-disk `SKILL.md`) scored 10/10 — docs-only and lockfile/generated scopes short-circuited, a mixed diff narrowed to its code file, and both a ~5-line explicit-scope case and a normal code diff ran, confirming the guard keys on change kind, not size.

Standing-instruction shape (auto-run variant, from `docs/skills/ce-simplify-code.md`):

> When you finish a coherent unit of work — a feature is complete, or you're wrapping up to open a PR — and before you review, commit, or hand it off, automatically invoke the `ce-simplify-code` skill on the changed code. Do this at that completion checkpoint only, not after every individual edit or intermediate fix while you're still building. Run it only when the accumulated diff has at least 10 substantive code lines and the skill hasn't already run since the last code edit. Never run it for documentation- or Markdown-only changes; formatting-, lint-, or dependency/lockfile-only changes; generated or vendored files; other purely mechanical changes; or code you've said to keep as written.

Skill-side preflight (from `skills/ce-simplify-code/SKILL.md` Step 1): if the resolved scope contains no substantive human-authored code, stop with a one-line "nothing to simplify" note; on a mixed diff, narrow to the code files. Gates on kind of change only, never size.

## See Also

- [`portable-agent-skill-authoring.md`](./portable-agent-skill-authoring.md) — the canonical cross-model/cross-harness authoring guide these phrasing rules instantiate
- [`discoverability-check-for-documented-solutions.md`](./discoverability-check-for-documented-solutions.md) — the sibling pattern of a skill making a small, principled edit to an instruction file
- [`post-menu-routing-belongs-inline.md`](./post-menu-routing-belongs-inline.md) — related SKILL.md authoring-placement discipline
- `ce-compound`'s "Make Capture Automatic" section (`docs/skills/ce-compound.md`, PR #1110) — the pattern this generalizes
