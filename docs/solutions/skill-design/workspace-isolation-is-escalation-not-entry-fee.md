---
title: Workspace isolation for parallel subagent writes is escalation, not an entry fee
date: 2026-08-31
category: skill-design
module: skills/ce-work
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - Deciding whether to isolate parallel subagents in separate worktrees or run them in a shared workspace with coordinated conditions
  - Evaluating whether workspace isolation is necessary or whether conditions alone suffice to prevent failures
  - A rule serializes work "to be safe" on a hazard whose failure cost is bounded and detectable
tags:
  - ce-work
  - workspace-isolation
  - parallel-execution
  - conditions-over-mechanism
  - subagent-dispatch
  - escalation
related_components:
  - development_workflow
---

# Workspace isolation is a proxy — gate parallel workers on enforceable conditions, not isolation

`ce-work`'s execution reference once required an isolated workspace for every concurrent worker ("a shared-workspace worker runs serially regardless of declared file disjointness"). On harnesses whose subagents share the orchestrator's directory -- Codex, and Claude Code without worktree isolation -- that forced every multi-unit plan serial for hours, while a real Codex run (2026-08-29) had already shown parallel shared-checkout workers integrating cleanly. The replacement, the **Shared-workspace wave contract**, is in `skills/ce-work/references/execution-strategy.md` (PR #1598); this doc keeps the reasoning.

## Isolation is a proxy for five conditions

Isolation is strictly safer, but its marginal protection over a conditioned contract is one hazard only: an unreported overwrite of a sibling's owned file. Every hazard that actually corrupts or breaks a run is prevented by a condition that applies identically with or without isolation:

| Hazard | Condition that prevents it |
|---|---|
| Unattributable or unrevertible output | clean committed baseline before the wave |
| Colliding hidden write surfaces (lockfiles, codegen, snapshots, formatter sweeps, manifests) | exclusive ownership including hidden surfaces -- each excluded from all workers or assigned to exactly one |
| Shared Git index corruption (a linked worktree's index lives in the common dir; `cross-model-execution.md` states the rule) | no worker Git operations; the orchestrator stages and commits after the batch |
| Contaminated verification | orchestrator-owned verification on the integrated tree; workers run at most a single focused test touching no shared state |
| The one residual: silent overwrite of a sibling's file | abort on unowned writes, rolling back only worker-attributable changes (an unaccounted change may be the user's) |

So isolation is the escalation: a worker that must commit, must run its own authoritative verification, or has write surfaces that cannot be audited takes an isolated workspace. Everything else runs in a conditioned shared wave. The old rule inverted the trade -- a certain cost of hours on every multi-unit plan, to buy protection against one hazard whose detection is mechanical and whose redo costs minutes.

## Rejected alternative: self-provisioned peer worktrees

Teaching the native orchestrator to run `git worktree add` for its workers was rejected. `git worktree add` writes the shared Git common dir (`$GIT_DIR/worktrees`), which the same workspace-scoped sandboxes that lack native isolation typically cannot write -- it helps least exactly where it is needed. `cross-model-execution.md` forbids `ce-work` creating worktrees for native execution; only the external cross-model controller may create detached sibling worktrees, and eval E1 in `cross-model-work-eval.md` pins that restraint.

Validation: a cross-model panel (Codex and Grok, independent) both chose the conditioned contract over serial-only and over self-provisioned worktrees, and a two-host decision probe (four disjoint units, one adding a dependency) had both hosts dispatch the three clean units as one wave, serialize the lockfile-owning unit, and forbid worker Git operations.

## When to Apply

- Any skill or orchestration contract that gates concurrency on workspace isolation: ask whether isolation is load-bearing or a proxy, and if a proxy, name the conditions it stands in for. A review arguing a shared wave is unsafe must name which condition is wrong or missing, not reinstate isolation as a case.
- Do **not** apply to external cross-model workers: they keep their controller-owned detached worktrees.
- Do **not** read this as relaxing the no-worker-git-ops rule; it holds in every mode.

## Related

- `skills/ce-work/references/execution-strategy.md` -- the contract and shared-workspace integration flow.
- `skills/ce-work/references/cross-model-execution.md` -- native worktree-creation prohibition.
- `skills/ce-work/references/cross-model-work-eval.md` -- eval E1.
