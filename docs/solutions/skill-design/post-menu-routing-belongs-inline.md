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

The live `docs/solutions/skill-design/portable-agent-skill-authoring.md` "Load instructions when they can change behavior" section guides extraction: extract content that is *conditional or late-sequence and represents ~20%+ of the skill*. The bare per-option routing was late-sequence (only fires after Phase 5) but **not conditional** — option 1 always means "invoke ce-work," option 4 always means "end the turn." The always-on subset should not have been extracted.

`AGENTS.md` "User-Facing Skill Invocations" and `docs/solutions/skill-design/portable-agent-skill-authoring.md` "Load instructions when they can change behavior" already articulate the underlying rule: a load-bearing instruction (one that MUST fire reliably) belongs inline at the top of its phase, because references load on demand and an agent that skipped one would stop or guess. The post-menu routing satisfies the load-bearing definition. Failing to apply this principle was the authoring mistake.

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
- **Does the inline block command the agent to load and act, or does it summarize what the reference contains?** Inlining is two-sided. The firing imperative and the load instruction belong inline (the rest of this checklist). But a *paraphrase of the reference's substance* backfires the opposite way: it drifts from the reference (nothing tests the two copies against each other), and it suppresses the load — an agent that already has a workable inline summary judges it "has enough" and never opens the file, so the reference's templates and examples never reach it. Inline the trigger; keep the substance in the one reference that owns it. Test: if the inline text is complete enough to act on alone, the agent will, and the reference's nuance never lands. (See `AGENTS.md` → "User-Facing Skill Invocations" and `docs/solutions/skill-design/portable-agent-skill-authoring.md` → "Load instructions when they can change behavior.")

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

## Scope note (2026-08-17)

The 0/5 vs 5/5 result above is about a menu whose *only* routing lived in a reference the body mentioned once, in passing. It is not evidence that references are never followed. The `ce-babysit-pr` 90KB -> 8KB restructure (`size-driven-skill-restructure.md`) named each reference at the step that needs it ("read `references/tick.md` before the first snapshot") and measured with a `FILES_READ` probe: Codex, Grok, and Claude all loaded the references on the paths under test. Rule that reconciles both: always-on routing stays inline; a required read is named at its point of use and its loading is measured, not assumed.

## Refined by measurement (2026-08-18): what the reference has to be, not where the routing lives

The scope note above left "inline or reference" as the open question. It is the wrong axis. `ce-explain`'s Phase 6 destination menu and its per-option routing were moved wholesale into `references/destinations.md`, with the body naming that file as a required read before the phase renders anything, and the move was measured against the inline body it replaced.

Two matrices, four and five scenarios, graded on evidence rather than on what the run said it would do — the file actually copied for **Local file**, an artifact actually created for **Claude Artifact**, the run-dir path and its impermanence reported for **Leave it**, the publish withheld pending the required ask for a **ht-ml.app** menu bypass, and each improvement observation routed to its owning skill as an offer for the closing handoffs:

| Arm | Claude Code | Codex CLI | Total | Opened the reference |
|---|---:|---:|---:|---:|
| routing inline (main) | 27/27 | 21/21 | **48/48** | 11/48 |
| routing in the required-read reference | 27/27 | 21/21 | **48/48** | **48/48** |

Nothing regressed, and no relocated-arm run on either harness reached the menu without the file. The 0/5 in `ce-debug`'s three-arm result above is therefore not about references. What separated it from this one is what the body said about the file:

- **The failing stub paraphrased the reference.** It summarized the branch paths, which is complete enough to act on and not complete enough to act on correctly — so the agent judged it had enough and never opened the file. That is the checklist's last question, and it is the whole failure.
- **The passing pointer names what only the file carries, and what skipping it costs.** "It owns the destination menu, the per-option routing, each destination's sub-flow, the audience re-render offer and its ordering against a publisher's consent gate, and the improvement observations the run closes on. Read it now; do not render the menu and do not act on the user's selection without it." There is nothing here to act on, so the read is the only way forward.

**The 0/5 does not reproduce once the pointer is written that way.** `ce-debug`'s own Phase 4 handoff was re-measured with its routing relocated into `references/post-fix-handoff.md` — already a required read at that step — and its stub rewritten to name the routing as something only that file carries and to state what skipping it costs, with the fire-the-action imperative kept in the body. Three trials per arm on Claude Code and Codex, graded on whether the run fires `ce-commit-push-pr` with `branding:on`:

| Arm | Claude Code | Codex CLI | Total |
|---|---:|---:|---:|
| routing inline | 3/3 | 3/3 | **6/6** |
| routing in the reference | 3/3 | 2/3 | **5/6** |

Nothing resembling the 0/5, and no run stopped in prose or dropped `branding:on`. The one miss took the local-commit route instead of shipping, which is the safe direction the skill names for an unestablished ship gate, on a scenario that told the run the network was unavailable. `ce-debug` keeps its routing inline anyway: relocating it lands the body at 13,118 CRLF bytes, still far over 8,000, so the move would buy no headroom while spending a measured margin.

**The condition, restated.** Routing may live in a reference when the body names that file as a required read at the step, states what only it carries, and leaves nothing partial to act on instead. Routing may not live in a reference the body mentions once in passing, or summarizes — the summary suppresses the read, and then the agent stops in prose or drops an argument. Where the routed action is the agent's answer to a selection the user has already made, the step cannot complete without the file at all, which is why this shape is the safest one to relocate.

**Two things still belong in the body regardless of how well the pointer is written.**

- **The stop class that must hold when the file is never opened.** `ce-explain` keeps "ht-ml.app is public, so it must never be selected headlessly" and the non-interactive degradation path in the body, because those decide what happens on the path where the read did not occur.
- **Anything whose step acts before the read.** `ce-explain`'s ownership-checked `$RUN_DIR` fence was moved behind a required read once and moved back (#1451): that PR's own eval caught a harness creating `$RUN_DIR` without loading the file, and an improvised `mkdir` accepts a planted symlink or a foreign-owned directory that then receives the explainer. A required read is reliable for a step whose first action *is* reading it, and not for a step that has something to do first.
