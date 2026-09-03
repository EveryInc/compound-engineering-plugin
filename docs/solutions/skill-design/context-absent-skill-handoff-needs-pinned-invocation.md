---
title: "Context-absent skill handoffs need ownership transfer, a loaded callee, and fail-closed refusal"
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
  - "a harness lacks Claude Code's Skill tool and may invent a narrower substitute on load failure"
symptoms:
  - "agent runs skill B's underlying command from memory, skipping B's required bootstrap step"
  - "agent substitutes ci-watcher / gh pr checks --watch / ad-hoc poll when skill load fails"
  - "caller reports primary outcome (PR URL) as done without callee owning follow-on"
root_cause: missing_workflow_step
resolution_type: workflow_improvement
tags:
  - skill-handoff
  - context-absent-agent
  - ownership-transfer
  - fail-closed
  - ce-babysit-pr
  - ce-commit-push-pr
  - bootstrap-tokens
related_components:
  - ce-commit-push-pr
  - ce-babysit-pr
---

# Context-absent skill handoffs need ownership transfer, a loaded callee, and fail-closed refusal

## The failure shape

Two live failures at the `ce-commit-push-pr` -> `ce-babysit-pr` seam (Nugget #1933, #1983): an agent at the end of a long turn satisfied "auto-invoke `ce-babysit-pr`" by calling that skill's helper CLI from memory (`pr-snapshot watch --pr N --interval 60` — no bootstrap, no correlated tokens, an interval value the skill never documents), and on Cursor, where skill load failed, by soft-degrading to a CI-only watcher and reporting the PR URL as done. A helper invoked with parameter values that match none of the owning skill's documented defaults is strong evidence the skill's instructions were never in context.

The caller-side gate that closes this — ownership transfer to a loaded callee, named non-substitutes, hard-fail when load or start fails — lives in `skills/ce-commit-push-pr/SKILL.md` ("The completion gate is here") and is pinned by `tests/commit-push-pr-contract.test.ts`. This doc records the callee-side design and the alternatives that were rejected.

## The callee refuses and self-explains, but teaches no recipe

The refusal message is the only channel that reliably reaches an agent operating without the skill loaded: it cannot read `SKILL.md`, but it does read its own error output. `skills/ce-babysit-pr/scripts/pr-snapshot` wires `_WatchHintingParser` into the `watch` subcommand: a `watch` call missing any bootstrap flag still exits 2, and appends `WATCH_BOOTSTRAP_HINT` — what `watch` is (arms an invocation already bootstrapped by `snapshot --start-invocation`), a direction to invoke the `ce-babysit-pr` skill through the harness's callable skill mechanism, and "Never mint the bootstrap values yourself." Pinned by `tests/ce-babysit-pr-watch-bootstrap.test.ts`.

The hint deliberately carries **no copyable bootstrap command**. Teaching the raw snapshot+watch sequence would let a context-absent agent arm a watcher and keep operating outside the skill's mutation, wake-handling, and stop protocol — the exact ad-hoc path the caller-side gate forbids. The check is scoped to `watch` and to missing-bootstrap-flag errors only; `snapshot`/`mark` errors and a plain missing `--pr` never carry it.

## Rejected alternatives

- **A packaged `pr-snapshot start-watch` wrapper** bundling bootstrap+arm. (a) A context-absent agent does not know the wrapper exists either; it still types the `watch --pr N` it half-remembers. (b) A convenient one-shot start becomes a second budget-minting path: the skill's rule is "never use `--start-invocation` after the first snapshot," and a wrapper that is easy to reach for on re-arm or a stack transition tempts an agent into minting a fresh invocation budget exactly when it must not. (c) The correlated tokens (`invocation_id`, `invocation_started_at`, `invocation_budget_seconds`) pervade the whole loop — every `mark`, every re-arm, every `--continue-invocation` — so packaging only the start step hides where they come from without removing the need to hold them correctly later.
- **A self-bootstrapping `watch`** that runs snapshot internally when bootstrap flags are absent — rejected for the identical budget-minting reason.
- **A Cursor-specific `Read SKILL.md` recipe** in the caller — rejected: the missing piece is ownership plus success/fail criteria that hold on any harness, not a host-specific load recipe.

## When to Apply

- A skill auto-hands off to a follow-on skill as default behavior, especially near the end of a long turn where context pressure is highest.
- The callee exposes a CLI with multi-step state (bootstrap -> correlated tokens -> repeated re-arm), where a "shaped-like-the-callee" action without its protocol produces a plausible-looking but illegal call.

## Related

- `docs/solutions/skill-design/cross-harness-cross-model-tool-invocation.md` — same principle (pin portable outcomes, never let an agent invent a substitute), applied to tool selection across harnesses.
- `docs/solutions/agent-friendly-cli-principles.md` — Principle 4 (fail fast with actionable errors) is the general rubric the `pr-snapshot` refusal hint instantiates.
- `docs/solutions/skill-design/dispatch-script-failure-degrade-outcome-not-boundary.md` — the same "never weaken the enforced boundary on failure" shape in a different subsystem.
