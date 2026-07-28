---
title: "Validate skill-prose behavior with cross-host evals — unit tests and code review can't see what an agent emits from the instructions"
date: 2026-07-21
category: skill-design
module: "skills (behavioral validation; cross-host command-construction prose)"
problem_type: convention
component: tooling
severity: medium
tags:
  - skill-design
  - evals
  - cross-host
  - skill-creator
  - agent-behavior
  - validation
applies_when:
  - Making a material change to skill or agent prose that instructs constructing a command or following a multi-step protocol
  - A skill is authored once and converted across harnesses (Claude Code, Codex, Cursor, Gemini)
  - Skill prose names a recorded shell variable (e.g. RUN_STARTED_AT) that the agent must map to a CLI flag
  - Deciding whether passing unit tests plus code review are sufficient validation for a skill change
---

# Validate skill-prose behavior with cross-host evals

## Context

A change to `ce-babysit-pr` (PR #1216) added active-watch-time budget accounting to the `pr-snapshot` script, including a managed-stack continuation protocol described in `skills/ce-babysit-pr/SKILL.md` and `skills/ce-babysit-pr/references/watch-loop.md`. It shipped with 111 passing babysit unit tests, the full suite green, both release/plugin validators passing, and **five rounds of independent code review** (Cursor Bugbot + Codex) that each found and fixed a real correctness edge.

Then a simple question — "did we run tests in various scenarios to ensure the scripts work in evals?" — exposed that one whole validation layer had never run: **the skill *prose* an agent must interpret at runtime.** `bun test` exercises the Python script; it says nothing about what command a fresh agent *emits* after reading the instructions.

A cross-host behavioral eval (fresh Claude subagents + Codex, given the managed-stack continuation scenario) immediately found a real bug: **3 of 4 agents emitted `--invocation-started-at`, a flag `pr-snapshot` rejects as unrecognized** (the only accepted anchor flag is `--session-started-at`). The continuation prose named the recorded *variable* (`RUN_STARTED_AT`) but never the *flag*, so agents guessed — and guessed wrong. Naming the flag explicitly in both prose surfaces fixed it; a re-run of the eval confirmed both models then emit `--session-started-at`.

## Guidance

For a material change to skill/agent **prose** (not just a bundled script), run a **behavioral eval** in addition to the deterministic tests:

1. Inject the *current* prose the agent actually loads (the relevant `SKILL.md` and any `references/*.md` sections) into a fresh agent, give it a concrete scenario, and check the **command or behavior it emits** — not whether the underlying script is correct. This is the `skill-creator` eval pattern; a lightweight direct version (dispatch a fresh subagent with the prose + scenario, grep the output for the expected/forbidden tokens) is enough to catch the systematic failures.
2. Run it **cross-host — Claude and Codex both** — by default. A prose ambiguity often fails on one model and not the other (here: 2/2 Codex wrong, 1/2 Claude wrong).
3. Run several trials (behavioral output is non-deterministic) and read the *pass rate*, not a single run.
4. Close the loop: after fixing the prose, **re-run the same eval** to confirm the failure rate drops.

And a specific authoring rule this surfaced: **when skill prose instructs constructing a command, name the actual CLI flags, not just the recorded variable names.** Agents map `RUN_STARTED_AT` → a flag by guessing, and a variable named `..._STARTED_AT` invites `--invocation-started-at` over the real `--session-started-at`. If you must reference variables, pair them with the flag: `--session-started-at "$RUN_STARTED_AT"`.

## Why This Matters

Unit tests and code-review bots are blind to this class:

- **`bun test`** validates the script's behavior for given inputs. It never constructs the invocation the way an agent would, so a prose bug that yields a wrong flag passes every test.
- **Code review** (human or bot) reviews the diff's logic and the prose's *content*. Across five review rounds on this exact PR, no reviewer simulated "what command would an agent emit from this paragraph?" — that is not what review does.
- Only a **behavioral eval** puts a fresh agent in front of the loaded prose and inspects the output. It is the sole validation layer that catches instruction-interpretation defects — and for an authored-once-converted-many plugin, those defects ship silently to every harness.

The failure is quiet: the round-4 review finding on the same PR ("`SKILL.md` updated but `watch-loop.md` not") was the *same class* — "will an agent following the prose do the right thing?" — caught by luck of a review bot, not by evaluating it.

## When to Apply

- Any material revision to skill/agent prose that tells the agent to build a command, thread arguments, or follow a multi-step protocol.
- Especially for cross-host plugins, where a single implicit mapping breaks on some harnesses.
- Not needed for a purely mechanical script/test change with no prose-behavior surface — that is exactly what `bun test` already covers.

## Examples

Before (agents guess the flag from the variable name — 3/4 emit `--invocation-started-at`, a runtime error):

```
... initialize its own snapshot state with `--continue-invocation` and the same
`RUN_INVOCATION_ID`, `RUN_STARTED_AT`, and `RUN_BUDGET_SECONDS` ...
```

After (name the flag; agents emit `--session-started-at`):

```
... initialize its own snapshot state with `--continue-invocation` and the same
three recorded values on the flags the first snapshot used —
`--invocation-id "$RUN_INVOCATION_ID" --session-started-at "$RUN_STARTED_AT"
--invocation-budget-seconds "$RUN_BUDGET_SECONDS"` (the anchor flag is
`--session-started-at`, not `--invocation-started-at`) ...
```

Lightweight cross-host eval shape (what actually caught it): write the loaded prose + a concrete scenario to a file, dispatch 2 fresh Claude subagents and run 2 Codex trials asking only for the emitted command, then check each for the required token (`--session-started-at`, `--continue-dead-time-seconds`) and the forbidden one (`--invocation-started-at`). Fix, then re-run to confirm the rate flips.
