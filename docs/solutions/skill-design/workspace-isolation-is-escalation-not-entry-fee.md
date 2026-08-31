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
  - Authoring or reviewing the coordination layer for multi-worker ce-work dispatch
  - Evaluating whether workspace isolation is necessary or whether conditions alone suffice to prevent failures
  - Diagnosing hidden write-surface corruption in parallel worker scenarios (lockfiles, codegen, snapshots, formatters, manifests, Git index)
tags:
  - ce-work
  - workspace-isolation
  - parallel-execution
  - conditions-over-mechanism
  - subagent-dispatch
  - escalation
  - design-pattern
related_components:
  - development_workflow
---

# Workspace isolation is a proxy — gate parallel workers on enforceable conditions, not isolation

## Context

`ce-work`'s execution reference required an isolated workspace for every concurrent implementation worker: a shared-workspace worker ran serially "regardless of declared file disjointness." On harnesses whose subagents share the orchestrator's working directory — Codex, and Claude Code without worktree isolation — that rule forced every multi-unit plan serial. Plans with four or five genuinely disjoint units ran one at a time for hours, with each unit blocked on nothing but the rule.

The rule was already contradicted by observed behavior. A real Codex run (2026-08-29) had parallel shared-checkout workers integrate cleanly — path-separated edits, no worker Git operations — before the serial-only rule forced the remainder of the run serial. The safety the rule bought was not coming from isolation; it was coming from conditions the run already satisfied.

The replacement contract landed in PR #1598 (opened, unmerged as of this writing) on `skills/ce-work/references/execution-strategy.md`.

## Guidance

**Workspace isolation is a proxy for a small set of enforceable conditions, not a requirement.** Isolation is strictly safer, but its marginal protection over a conditioned contract is one hazard only: an unreported overwrite of a sibling's owned file. Every hazard that actually corrupts or breaks a run — index corruption, unattributable output, contaminated verification, colliding hidden write surfaces — is prevented by conditions that apply identically with or without isolation. So state the conditions and gate on them.

**The Shared-workspace wave contract.** A parallel wave in a shared working directory is permitted only while all of these hold (`skills/ce-work/references/execution-strategy.md:49-55`); a unit that cannot meet one serializes or gets isolation:

1. **Clean committed baseline.** Dispatch the wave from a committed tree, so each worker's output is attributable and revertible by its file set, and an aborted wave restores to the baseline.
2. **Exclusive ownership, including hidden write surfaces.** Beyond disjoint declared files, every hidden write surface — lockfiles, generated artifacts, snapshots, formatter sweeps, package manifests — is either excluded from all workers or assigned to exactly one.
3. **No worker Git operations.** Concurrent index writes corrupt the shared index — the failure class already recorded in `docs/solutions/skill-design/sandbox-workers-must-not-write-linked-worktree-git-index.md`. The orchestrator stages and commits after the batch.
4. **Orchestrator-owned verification.** Workers run no mutating verification (full suites, installs, builds that write shared state); a worker may run a single focused test only if it touches no shared state. The authoritative run happens after the wave on the integrated tree.
5. **Abort on unowned writes.** A write outside a worker's exclusive set aborts the wave, restores the baseline, and disables further shared-workspace waves for the run.

**Isolation is the escalation, not the entry fee.** A worker that must commit, must run its own authoritative verification, or has write surfaces that cannot be audited takes an isolated workspace. Everything else can run in a conditioned shared wave.

**Rejected alternative: self-provisioned peer worktrees.** Teaching the native orchestrator to run `git worktree add` for its workers was considered and rejected for verified reasons. `git worktree add` writes the shared Git common dir (`$GIT_DIR/worktrees`), which the same workspace-scoped sandboxes that lack native isolation typically cannot write — it helps least exactly where it is needed. `skills/ce-work/references/cross-model-execution.md` explicitly forbids `ce-work` creating worktrees for native execution; only the external cross-model controller may create detached sibling worktrees. Eval E1 in `skills/ce-work/references/cross-model-work-eval.md` pins that native restraint.

## Why This Matters

The trade the old rule made was inverted: it paid a certain cost (hours of serial execution on every multi-unit plan, on the harnesses most people run) to buy protection against one residual hazard whose failure cost is bounded and small. If a worker silently overwrites a sibling's owned file, the abort-on-unowned-writes condition catches it at integration, the baseline restore discards the wave, and the redo costs minutes. Serial-by-default costs hours on every run, including the overwhelming majority where nothing would have gone wrong.

The blanket rule also violated this repo's own standard: state conditions, not cases. "Isolation or serial" is a case-shaped answer to a condition-shaped question — the real question is "what must hold for concurrent writes to one directory to be safe?", and it has a five-line answer. When a rule keeps forbidding runs that demonstrably work (the 2026-08-29 Codex run), the representation is wrong, and the fix is to name the conditions the safe runs satisfied.

Validation: a cross-model panel (Codex and Grok, independent, no host position shared) both independently chose the conditioned-contract approach over serial-only and over self-provisioned worktrees. A two-host decision probe (Claude Sonnet and Codex, edited reference injected; scenario: four disjoint units, one adding a dependency) had both hosts dispatch the three clean units as one parallel wave, serialize the install-owning unit, and forbid worker Git operations. The full `bun test` suite is green with deliberately updated pins.

## When to Apply

- Authoring or reviewing any skill or orchestration contract that gates concurrency on workspace isolation — ask whether isolation is load-bearing or a proxy, and if a proxy, name the conditions it stands in for.
- Reviewing a rule that serializes work "to be safe" on a hazard whose failure cost is bounded and detectable — weigh the certain serial cost against the residual risk before accepting it.
- Dispatching or evaluating `ce-work` parallel waves on harnesses without native worker isolation (Codex; Claude Code shared-directory fallback).
- Do **not** apply this to external cross-model workers: they keep their controller-owned detached worktrees, and only the external controller may create them.
- Do **not** read this as relaxing the no-worker-git-ops rule — it is condition 3 of the contract and holds in every mode, isolated or shared.

## Examples

**Before — isolation as requirement:**

```text
# execution-strategy.md (old)
a shared-workspace worker runs serially regardless of declared file disjointness
```

**After — conditions as the gate:**

```text
# skills/ce-work/references/execution-strategy.md:49
**Shared-workspace wave contract** — a parallel wave in a shared working
directory is permitted only while all of these hold; a unit that cannot meet
one serializes or gets isolation: [clean committed baseline; exclusive
ownership including hidden write surfaces; no worker Git operations;
orchestrator-owned verification; abort on unowned writes]
```

**Probe outcome.** Given four disjoint units where one adds a dependency (a lockfile write — a hidden write surface no other unit may share), both probe hosts dispatched the three clean units as a single parallel wave, serialized the dependency-adding unit, and forbade worker Git operations. That is the contract working as intended: concurrency where the conditions hold, serialization exactly where one fails, no blanket rule in either direction.

**Anti-pattern — re-adding isolation as a precondition "just in case."** If a review argues the shared wave is unsafe, the finding must name which of the five conditions is wrong or missing, not reinstate isolation as a case. A hazard the conditions already decide is answered with the condition.

## Related

- PR #1598 — the Shared-workspace wave contract (opened, unmerged as of this writing).
- `skills/ce-work/references/execution-strategy.md` — the contract (lines 49-55) and shared-workspace integration flow.
- `skills/ce-work/references/cross-model-execution.md` — native worktree-creation prohibition; controller-owned detached worktrees.
- `skills/ce-work/references/cross-model-work-eval.md` — eval E1 pins native restraint.
- `docs/solutions/skill-design/sandbox-workers-must-not-write-linked-worktree-git-index.md` — the Git-index failure class behind condition 3.
