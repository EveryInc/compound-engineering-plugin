---
title: "Context-absent skill handoffs need a pinned invocation mechanism and a self-explaining refusal"
date: 2026-07-31
category: skill-design
module: skill-design
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - "skill A auto-invokes a follow-on skill B whose start path is a multi-step bootstrap"
  - "skill B exposes a CLI or command with flags/tokens that must be minted before first use"
  - "authoring a handoff seam between two skills in this plugin"
symptoms:
  - "agent runs skill B's underlying command from memory, skipping B's required bootstrap step"
  - "CLI invocation fails with argparse/usage error (e.g. exit 2) despite plausible-looking flags"
  - "invocation is missing correlated tokens or uses a default/guessed interval value"
root_cause: missing_workflow_step
resolution_type: workflow_improvement
tags:
  - skill-handoff
  - context-absent-agent
  - invocation-mechanism
  - fail-closed
  - ce-babysit-pr
  - ce-commit-push-pr
  - bootstrap-tokens
related_components:
  - ce-commit-push-pr
  - ce-babysit-pr
---

# Context-absent skill handoffs need a pinned invocation mechanism and a self-explaining refusal

## Context

`ce-commit-push-pr` auto-invokes `ce-babysit-pr` after opening a PR, so the ship pipeline can keep watching a PR through review and CI without the user asking twice. In a live run against Esper-Labs/nugget#1933, the shipping agent's handoff to babysit did not go through the skill at all: instead of invoking `ce-babysit-pr`, it called that skill's helper CLI directly — `pr-snapshot watch --pr 1933 --interval 60`. `ce-babysit-pr` Step 2 requires a bootstrap-then-arm sequence: create a state dir, run `pr-snapshot snapshot ... --start-invocation --invocation-budget-seconds N`, capture the emitted `invocation_id` / `invocation_started_at` / `invocation_budget_seconds`, and only then call `watch` with all three tokens plus `--state-dir`. The bare `watch --pr 1933 --interval 60` call skipped bootstrap entirely and was missing every required flag, so argparse correctly failed closed with exit 2.

The diagnostic tell was the `--interval 60` value: the skill's own documented command block uses `--interval 150` with the full bootstrap flag set. The agent hadn't misremembered one flag — it had reconstructed the entire command from a vague memory of "there's a watch command." That is strong evidence (not proof — loaded-but-ignored can't be fully excluded) that it did not have `ce-babysit-pr`'s `SKILL.md` in context when it acted.

## Guidance

When a skill (the caller) auto-invokes a follow-on skill (the callee) that has a multi-step bootstrap protocol, the soft prose "auto-invoke `<callee>`" is not enough — an agent at the end of a long turn can satisfy that instruction by doing callee-shaped things directly, without the callee's `SKILL.md` in context, and silently skip its state machine. Harden both ends:

1. **Pin the invocation mechanism at the handoff seam**, in the caller's skill body, not just the intent. The "Babysit handoff" paragraph in `skills/ce-commit-push-pr/SKILL.md` now requires invoking `ce-babysit-pr` "through the platform's skill-invocation primitive (the `Skill` tool in Claude Code, the equivalent elsewhere) so its full instructions load," and adds an explicit negative: "Never start babysit mechanics yourself: do not run its `pr-snapshot` helper, arm a watcher, or reconstruct its watch loop from memory — the invoked skill's own bootstrap is the only legal start path." This mirrors `ce-babysit-pr`'s own "Invoking another skill" rule for the skills it delegates to — the same discipline applied one level up.
2. **Make the callee's CLI fail closed AND self-explain.** The refusal message is the only channel that reliably reaches an agent operating without the skill's instructions loaded — it can't read `SKILL.md`, but it does read its own error output. `skills/ce-babysit-pr/scripts/pr-snapshot` defines `_WatchHintingParser`, an `argparse.ArgumentParser` subclass wired in via `parser_class` on the subcommand registry. When `watch` is missing any bootstrap flag (`--state-dir`, `--invocation-id`, `--session-started-at`, `--invocation-budget-seconds`), the parser still exits 2 but appends `WATCH_BOOTSTRAP_HINT`: what `watch` actually is (arms an invocation already bootstrapped by `snapshot --start-invocation`, the ce-babysit-pr Step 2 bootstrap), a recovery instruction to invoke the `ce-babysit-pr` skill through the harness's callable skill mechanism, and "Never mint the bootstrap values yourself." The hint deliberately does **not** carry a copyable bootstrap command recipe — a follow-up review round caught that teaching the raw snapshot+watch sequence would let a context-absent agent arm a watcher and keep operating outside the skill's mutation, wake-handling, and stop protocol, the exact ad-hoc path the caller-side boundary forbids. The check is scoped to the `watch` subcommand and to missing-required-bootstrap-flag errors specifically, so `snapshot`/`mark` errors and a plain missing `--pr` never carry the hint.
3. **Regression guards** pin both layers so they can't silently regress: `tests/ce-babysit-pr-watch-bootstrap.test.ts` asserts a bare `watch` call exits 2 with the bootstrap guidance and that unrelated errors stay unscoped; the "babysit handoff is a hard skill invocation, never ad-hoc babysit mechanics" test in `tests/commit-push-pr-contract.test.ts` pins that the `ce-commit-push-pr` handoff prose contains the pinned-mechanism and never-start-mechanics constraints.

A tempting alternative — a packaged single start entrypoint like `pr-snapshot start-watch` that bundles bootstrap+arm into one call — was considered and rejected. It doesn't close this failure class: (a) a context-absent agent doesn't know the wrapper exists either; it will still type the `watch --pr N` it half-remembers. (b) A convenient one-shot start command becomes a second budget-minting path. `ce-babysit-pr`'s documented rule is "never use `--start-invocation` after the first snapshot" — a wrapper that's easy to reach for on re-arm or a stack transition would tempt an agent into minting a fresh invocation budget exactly when it shouldn't. (c) The correlated tokens (`invocation_id`, `invocation_started_at`, `invocation_budget_seconds`) pervade the entire loop — every `mark`, every re-arm, every `--continue-invocation` — so packaging only the start step hides where the tokens come from without removing the need to understand and hold them correctly later. A self-bootstrapping `watch` (auto-run snapshot internally when bootstrap flags are absent) was rejected for the identical budget-minting reason.

## Why This Matters

The failure mode here is specific to skill-to-skill handoffs where the callee has stateful, multi-step mechanics (bootstrap tokens, budgets, watch loops) rather than being a single stateless action. A caller that only says "auto-invoke X" trusts the executing agent to also independently know X's internal protocol — but the entire reason X is a separate skill is that its protocol lives in X's own `SKILL.md`, which the caller's agent has not read. The fix is not "write better prose reminding the agent to be careful" (that degrades with turn length and context pressure); it is pinning the actual invocation *mechanism* so the callee's instructions are guaranteed to load, plus making the callee itself refuse-and-explain when its stateful protocol is skipped. Reading the failure signature — an interval value that didn't match the documented default, combined with every bootstrap flag missing — is what located the fix at the seam layer instead of prompting a deeper rewrite of the bootstrap protocol itself, which was already correct.

## When to Apply

- A skill (A) auto-invokes a follow-on skill (B) as a default/background behavior (not a one-shot user-initiated call), especially near the end of a long-running turn where context pressure is highest.
- B exposes a CLI or script with multi-step state (bootstrap -> correlated tokens -> repeated re-arm/continuation calls), where doing a "shaped-like-B" action without B's protocol produces a plausible-looking but illegal call.
- You observe an agent invoking a sibling skill's *helper script* directly instead of the skill itself, particularly with parameter values that don't match that skill's own documented defaults — a strong signal the skill's instructions were never loaded.

## Examples

**Before (observed failure):**

```
pr-snapshot watch --pr 1933 --interval 60
```

Missing `--state-dir`, `--invocation-id`, `--session-started-at`, `--invocation-budget-seconds`; `--interval 60` doesn't match the skill's documented `--interval 150`. Argparse failed with a bare "required arguments" usage dump — correct exit code, no actionable recovery path.

**Legal bootstrap sequence (ce-babysit-pr Step 2):**

```
pr-snapshot snapshot --pr 1933 --repo OWNER/REPO --state-dir DIR \
  --start-invocation --invocation-budget-seconds SECS
# capture emitted invocation_id / invocation_started_at / invocation_budget_seconds
pr-snapshot watch --pr 1933 --repo OWNER/REPO --state-dir DIR \
  --invocation-id ID --session-started-at TS --invocation-budget-seconds SECS --interval 150
```

**Refusal message, after:** a bare `watch --pr N` still exits 2, but now the stderr also carries `WATCH_BOOTSTRAP_HINT` — it names what is missing (the `--start-invocation` bootstrap, ce-babysit-pr Step 2), directs the agent to invoke the `ce-babysit-pr` skill through the harness's callable skill mechanism rather than teaching the raw command sequence, and closes with "Never mint the bootstrap values yourself" — so the same context-absent agent that produced the illegal call is routed back into the skill (whose instructions own bootstrap, arming, marks, and stopping) instead of being handed enough helper commands to keep operating outside it.

**Handoff seam, after:** the "Babysit handoff — default on." paragraph in `skills/ce-commit-push-pr/SKILL.md` now requires invoking `ce-babysit-pr` "through the platform's skill-invocation primitive... so its full instructions load" and states "Never start babysit mechanics yourself: do not run its `pr-snapshot` helper, arm a watcher, or reconstruct its watch loop from memory."

## Related

- `docs/solutions/skill-design/cross-harness-cross-model-tool-invocation.md` — same principle (pin the platform mechanism explicitly rather than letting an agent infer it), applied to tool selection across harnesses instead of skill-to-skill handoff.
- `docs/solutions/agent-friendly-cli-principles.md` — Principle 4 (fail fast with actionable errors) is the general rubric that the `pr-snapshot` refusal hint instantiates concretely.
- `docs/solutions/skill-design/dispatch-script-failure-degrade-outcome-not-boundary.md` — shares the "never weaken the enforced boundary on failure" shape in a different subsystem.
