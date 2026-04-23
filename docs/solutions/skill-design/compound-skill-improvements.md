---
title: "ce-compound autofix modes (mode:autofix and mode:autofix-full) for unattended documentation capture"
category: skill-design
date: 2026-04-23
module: plugins/compound-engineering/skills/ce-compound
component: SKILL.md
tags:
  - skill-design
  - ce-compound
  - autofix-mode
  - platform-agnostic
  - pipeline-invocation
severity: medium
description: "Add mode:autofix and mode:autofix-full to ce-compound so it can be invoked programmatically (post-merge hooks, CI, orchestrator pipelines) without the four mandatory interactive prompts that normally block unattended runs. mode:autofix routes through the existing Lightweight execution path for low-cost capture at scale; mode:autofix-full routes through Full with prompts guarded for thorough capture when quality matters more than token cost. Mirrors the pattern already established by ce-compound-refresh and ce-code-review, extended with a depth variant so callers can pick fast vs thorough."
related:
  - docs/solutions/skill-design/compound-refresh-skill-improvements.md
  - plugins/compound-engineering/skills/ce-compound-refresh/SKILL.md
  - plugins/compound-engineering/skills/ce-code-review/SKILL.md
  - plugins/compound-engineering/skills/ce-doc-review/SKILL.md
---

## Problem

`ce-compound` had no headless affordance. Its Execution Strategy section enforced four mandatory blocking prompts — a Full-vs-Lightweight mode selection, a session-history opt-in (Full only), a Discoverability Check consent question, and a post-completion "What's next?" menu — each requiring the platform's blocking question tool (`AskUserQuestion` / `request_user_input` / `ask_user`) and each explicitly forbidden from silent skips ("Do NOT pre-select a mode. Do NOT skip this prompt.").

This blocked programmatic callers. A post-merge hook, CI step, or orchestrator pipeline invoking `claude -p "/ce-compound ..."` or `codex exec "Run /ce-compound" --ephemeral` had no way to drive the skill to completion: the blocking question tool errors in headless sessions, the documented fallback is "present options in chat" with "Never silently skip the question," and there is no user to respond. The result was hang, partial execution, or undefined degradation depending on the harness.

The inconsistency was especially visible against the other compound-engineering skills in the same plugin:

- `ce-compound-refresh` — ships `mode:autofix` for unattended sweeps.
- `ce-code-review` — ships both `mode:autofix` and `mode:headless` for programmatic review.
- `ce-doc-review` — ships `mode:headless` for pipeline callers.
- `ce-compound` — no mode affordance.

`ce-compound` is the lone holdout among the high-traffic skills. Pipelines that want to capture learnings after successful work (e.g., a Jira-driven dev orchestrator running `/ce-compound-refresh mode:autofix` post-merge to maintain `docs/solutions/`) are forced to either invoke `ce-compound` interactively (not possible in the pipeline context) or skip new-learning capture entirely.

A second gap, related but distinct: even a user who knows they want Lightweight execution has **no way to request it via argument**. The Lightweight Mode section exists and is fully specified, but the only entry point is the interactive prompt. There is no `/ce-compound lightweight` or equivalent flag — `$ARGUMENTS` is not parsed for mode hints. Exposing Lightweight through a no-prompt argument benefits both programmatic callers and users who already know what depth they want.

## Root Cause

Three independent pressures pushed ce-compound toward interactive-only:

1. **The mode-selection prompt is load-bearing in interactive mode.** Full mode vs Lightweight mode is a real tradeoff (token cost, overlap-check depth, specialized reviewer dispatch), and upstream correctly wants a human to pick. Past fixes (#460, #620) *tightened* the prompt's enforcement to stop silent skips, not loosen it.
2. **The Discoverability Check can edit project config.** A skill that modifies `AGENTS.md` / `CLAUDE.md` should have consent in interactive mode. The current text carries explicit consent gating for that reason.
3. **The "What's next?" menu is a guided next-step prompt.** It chains to follow-up skills (`ce-compound-refresh`, linking docs, etc.) and assumes a human will pick.

None of these pressures require interactive-only. A headless caller has different defaults that stay safe:

1. **Route through an execution path that has no inline prompts.** Lightweight is already this — single-pass, no parallel subagents. Full mode's Phase 1 research subagents and Phase 3 specialized reviewers return text data and do not themselves prompt the user; Full's interactive prompts are all *outside* its execution body (mode-selection, session-history opt-in, Discoverability consent, post-completion menu). So both paths can be made headless-safe by guarding those four external prompts.
2. **Surface Discoverability as a recommendation, not an edit.** Instruction-file edits are project config, not the skill's scope in headless mode. Print the suggested addition in the output and let a human apply it.
3. **Make the output the sole deliverable.** No "What's next?" menu — programmatic callers parse the output; they do not respond to interactive menus.

## Solution

Add **two** mode tokens as explicit opt-in arguments. Mirror the pattern established by `ce-compound-refresh` (commit `699f4840`, originally introduced as `mode:autonomous` and later renamed to `mode:autofix` for consistency with `ce-code-review`), and extend it with a depth variant so callers can pick the execution path:

- **`mode:autofix`** — autofix + Lightweight execution. Default headless mode: cheap, fast, single-pass. No overlap check, no Phase 3 reviewers. Duplicates are caught later by `ce-compound-refresh`.
- **`mode:autofix-full`** — autofix + Full execution. Opt-in thorough headless mode: Phase 1 parallel research, overlap-update behavior, Phase 3 specialized reviewers. Session-history defaults to off (the opt-in is interactive-only). Higher token cost for higher quality capture.

Mutually exclusive — if both appear in arguments, the skill halts before any subagent dispatch and emits a conflict error mirroring `ce-code-review`'s conflict handling.

### Edits

One SKILL.md file, eight targeted edits:

1. **Frontmatter** — `argument-hint: "[mode:autofix or mode:autofix-full] [brief context]"`.
2. **New `## Mode Detection` section** — placed between Support Files and Execution Strategy. Defines the three-row mode table (Interactive default, Autofix, Autofix-full), the tokenization rule (`mode:autofix-full` is a distinct whole-token match, not a superstring of `mode:autofix`), the conflict rule, shared autofix rules, and per-variant specifics (including `mode:autofix-full`'s session-history-defaults-to-off decision).
3. **Execution Strategy guard** — at the top of the section: `mode:autofix` jumps to Lightweight, `mode:autofix-full` executes Full with prompts guarded per Mode Detection.
4. **Full Mode intro note** — clarifies that Full is used both by the interactive Full path and by `mode:autofix-full`, and that the Phase 1/Phase 3 subagents run unchanged because they don't prompt the user.
5. **Session-history follow-up note** — extended to cover both autofix variants: `mode:autofix` routes through Lightweight and never reaches the prompt; `mode:autofix-full` defaults session-history to off without a prompt.
6. **Discoverability Check step 4c** — add the autofix branch: "In both autofix modes (`mode:autofix` and `mode:autofix-full`), include it as a `Discoverability recommendation` line in the output — do not attempt to edit instruction files (autofix scope is doc capture, not project config)."
7. **Lightweight Mode intro** — note that this path is the execution target for `mode:autofix` specifically, and that `mode:autofix-full` uses Full Mode instead.
8. **Success Output "What's next?" guard + new `### Autofix mode output` subsection** — explicit "In both autofix modes, do NOT present the 'What's next?' prompt" plus four machine-parseable output shapes distinguished by their first line: (a) `✓ Documentation complete (mode:autofix)` — Lightweight doc-written; (b) `✓ Documentation complete (mode:autofix-full)` — Full new doc written; (c) `✓ Documentation updated (mode:autofix-full)` — Full overlap-update path; (d) `✓ No documentation written (autofix mode)` — preconditions failed.

### Design decisions

Six decisions, each paralleling a deliberate choice in compound-refresh's PR (#260 / commit `699f4840`) or in `ce-code-review`'s existing multi-mode grammar:

- **Explicit opt-in only.** Both `mode:autofix` and `mode:autofix-full` must appear in arguments. Auto-detection based on question-tool availability is explicitly rejected — a user in an interactive agent without a blocking-question tool (e.g., some harness variants) is still interactive; they just use plain-text replies. Headless is an invocation-context property, not a tool-availability property.
- **Lightweight is the default headless depth.** `mode:autofix` alone routes through Lightweight. Rationale: the most common headless invocation is a post-merge or CI hook firing on every successful work unit; cost matters more than cross-referencing for that use case. Callers who want thorough capture can opt in with `mode:autofix-full`. This also reuses Lightweight's existing "overlap-drift is acceptable, compound-refresh catches it later" contract.
- **Two distinct mode tokens, not a sub-mode.** Follows `ce-code-review`'s precedent of multiple distinct `mode:` tokens (`mode:autofix`, `mode:report-only`, `mode:headless`) rather than a nested `mode:autofix:full` sub-syntax. Parsing stays consistent with the rest of the plugin. Whole-token match handles the `mode:autofix` prefix-of-`mode:autofix-full` ambiguity cleanly.
- **Mutually exclusive with conflict error.** Two autofix modes cannot be combined. If both appear, halt before subagent dispatch and emit a conflict error mirroring `ce-code-review`'s format. Prevents callers from specifying contradictory intent silently.
- **`mode:autofix-full` defaults session-history to off.** The session-history opt-in is a user-preference question — there is no safe default without a user to ask. Off is the conservative default: it's cheaper (no Session Historian dispatch), it's predictable (no cross-session effects on the output), and callers that want session history can invoke interactively or pass curated context. Documented explicitly in the `mode:autofix-full` rules section.
- **Discoverability Check becomes a recommendation, not an edit.** Instruction files are project config outside the skill's doc-capture scope. In both autofix modes, print the suggested addition in the output; let a human apply it.
- **Conservative no-op path (both modes).** Autofix callers may invoke on any successful run regardless of whether something substantive was solved. The advisory Preconditions (`problem_solved`, `solution_verified`, `non_trivial`) become actionable in autofix mode: if they fail, emit a no-op output explaining which precondition blocked and what context was considered, rather than writing a low-quality doc. The `Mode:` line distinguishes which variant triggered the no-op for caller diagnostics.

## Prevention

### Consistency checklist for multi-mode skills

When any one skill in the plugin gains a `mode:autofix` / `mode:headless` / `mode:report-only` affordance, every sibling skill in its workflow neighborhood should be reviewed for the same affordance. Callers compose these skills (`ce-work` invokes `ce-code-review mode:autofix`; `adv:jira-*` pipelines invoke `ce-compound-refresh mode:autofix`), and a single gap forces callers to either abandon the automation or shadow-maintain the missing skill's logic.

### Anti-patterns worth naming

| Anti-pattern | Better pattern |
|---|---|
| Interactive-only skill in a workflow neighborhood where siblings have autofix | Add an explicit opt-in autofix mode that routes through an existing no-prompt execution path |
| Auto-detecting "no question tool = headless" | Explicit `mode:autofix` argument — invocation context is not the same as tool availability |
| Autofix writes to project config (AGENTS.md / CLAUDE.md) without consent | In autofix mode, surface config suggestions as recommendations in the output; let humans apply |
| Post-completion "What's next?" prompt that blocks autofix callers | Guard the prompt with a mode check; the output is the sole deliverable in autofix |
| Silent degradation when a blocking prompt errors in headless | Detect mode up front, route to a no-prompt path; never rely on fallback-in-chat for headless |
| Single-depth autofix when the skill already has two depth variants | Expose each variant via a distinct mode token with a documented conflict rule (see `ce-code-review`'s `mode:autofix` / `mode:report-only` / `mode:headless` grammar) |
| Nested colon sub-modes (`mode:autofix:full`) when the rest of the plugin uses distinct whole-token modes | Use distinct tokens with a whole-token tokenization rule to avoid prefix ambiguity (`mode:autofix` vs `mode:autofix-full`) |

## Cross-References

- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` — the precedent autofix addition for `ce-compound-refresh`, including the "explicit opt-in only" design rationale.
- Commit `699f4840 feat(skills): add autonomous mode to ce:compound-refresh` — original autonomous-mode introduction (later renamed to autofix for consistency).
- `ce-code-review` SKILL.md — the canonical template for `mode:autofix` and `mode:headless` coexistence.
- `ce-doc-review` SKILL.md — the canonical template for `mode:headless` in pipeline invocations.
