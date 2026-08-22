---
name: ce-work
description: Execute a plan or concrete work prompt end-to-end. Use when implementing from a plan document, a spec path, or a clear build request; use ce-debug for open-ended bugs. Use when an outer orchestrator needs implementation and local verification only, without the shipping tail.
argument-hint: "[Plan path, work description, or recovery request with run id; blank uses latest] | [mode:return-to-caller [implementation_engine:<compact-json>] [implementation_run:<safe-id>] <plan path> for outer orchestrators]"
---

# Work Execution Command

## Outcome

- **Result:** A fully implemented, locally verified change set from a plan, specification, or concrete work prompt.
- **Next consumer:** In standalone use, the shipping workflow takes the verified change through review and delivery. In Return-to-Caller Mode, the invoking workflow receives the structured implementation and verification envelope and owns its remaining gates.
- **Done:** Every in-scope task is complete, required verification evidence is recorded, relevant checks pass, and the run reaches either its owned shipping handoff (with a code-review receipt or explicit skip phrase — see Phase 3-4), a complete return envelope, or an explicit blocker.
- **Intent:** Finish the requested feature without renegotiating the plan or transferring canonical integration authority. Workers receive bounded units; the host orchestrator inspects actual changes and owns authoritative verification and canonical commits.

## Execution Workflow

**Bundled reference loading is fail-closed.** Resolve every bundled reference or script path named below from this skill's loaded `SKILL.md` directory, using the skill full path supplied by the harness; never glob the target repository to find a bundled file. Read a phase's owner when that phase is entered; a read made before that phase does not satisfy it, and an owner named for re-reading is read again at its step even when already in context. If the harness does not expose that directory or a required file cannot be read, stop before the action governed by it and report the missing reference instead of approximating the protocol or continuing natively.

### Phase 0: Input Triage

**Recovery activation comes first.** Before normal plan, path, blank-input, or bare-prompt classification, recognize semantic requests to resume, inspect, reap, or clean up an existing run. Recovery never dispatches a new worker, selects a new route, discovers another plan, reruns completed verification, or enters either shipping tail; a missing run id is requested, never guessed.

Before any other input decision, read `references/input-triage.md`. A bare prompt that is Trivial — one or two files, no behavioral change — skips the task list and still passes the engine-before-write gate; a purely mechanical diff also ships without a post-PR watch. When that is uncertain, take the fuller route. A bare prompt this session's `ce-plan` already sized is executed, not re-planned; a decision the user would weigh surfaces as a question, never as a route back to `ce-plan` or `ce-brainstorm`. It owns source resolution, control grammar, recovery, read-only discovery, plan readiness, non-code routing, blank discovery, and bare-prompt intake. An unreadable owner stops triage rather than letting control data or a non-executable artifact fall through as code work.

When triage enters Return-to-Caller Mode, immediately read `references/return-to-caller.md`. Record that tail owner for the run; if it cannot load, stop before mutation instead of reverting to standalone behavior.

### Phase 1: Quick Start

1. **Establish the workspace.** Before a branch move, edit, dispatch, or commit, read `references/workspace-setup.md`. It owns writable-checkout selection, plan clarification, branch placement, pre-work inventory, collision handling, and task setup. Do not write without a writable canonical checkout or on the real default branch without the user's explicit same-session direction.

   **WIP/write gate.** Nothing the user did not offer may be committed or published. When a unit needs a file that was already dirty, standalone mode asks once whether to include or exclude it; Return-to-Caller Mode does not ask or edit it and returns blocked with the collision and recovery path. An unreadable workspace owner stops before the branch move or edit.

2. **Resolve the engine, then strategy.** After bounded plan intake and task derivation, but before selecting a unit for execution, writing, dispatching, or committing, read `references/execution-engines.md` and complete its route-resolution gate. It applies with or without a typed binding; native execution is eligible only when that owner selects it or exhausts an allowed fallback. Engine choice never changes the Phase 0 tail owner.

   If cross-model execution is selected, read `references/cross-model-execution.md` before content or authority crosses that route. It owns controller initialization, the post-init engine lock, bounded egress, transactions, recovery, and receipts; do not approximate it with native dispatch.

   Before choosing inline, serial, or parallel execution or dispatching a worker, read `references/execution-strategy.md`. It owns scheduling, isolation, unit packets, worker lifecycle, and integration. The host orchestrator keeps authoritative verification and canonical commits.

### Phase 2: Execute

Before the first implementation write — including a Trivial route — read `references/implementation-loop.md`. It owns evidence choice, implementation, verification, completion stops, incremental commits, pattern-following, continuous testing, simplification boundaries, UI work, progress tracking, and settled-decision handling.

The kernel's write gate remains active: every implementation commit is path-limited to that unit's owned files; a bare commit can absorb the user's pre-existing index and is forbidden.

### Phase 3-4: Quality Check and Finishing Work

After tasks and local verification complete, standalone mode must read `references/shipping-workflow.md` before quality checks or delivery. It owns simplify, review receipts and fallback mechanics, residuals, final validation, and delivery.

**Code-review completion gate (standalone only).** The run is **not done** and must not call a commit or shipping skill, or report ship-complete, until `shipping-workflow.md` records either an actual completed `ce-code-review` receipt or one of its exact authorized skip states. Never substitute mental self-review or already-applied findings. This gate does not apply in Return-to-Caller Mode.

## Return-to-Caller Mode

Return-to-Caller Mode performs implementation and local verification only. It must not enter Phase 3-4 or run final simplify, code review, PR creation, CI watching, babysitting, or any other standalone shipping action; the caller owns those gates.

Immediately before emitting the result, read `references/return-to-caller.md` again. It alone owns the full envelope, evidence completion gate, route and model receipts, recovery semantics, and `standalone_shipping_skipped: true`. Do not reconstruct a complete envelope from this kernel.

If that required read fails after planning or implementation created state, preserve every changed file, commit, workspace, and controller receipt. Return the minimum blocked recovery result from this kernel: `status: blocked`, `plan_path`, `run_id` when known, `changed_state`, `blockers` naming the missing owner, and `recovery_path`. Do not erase partial state, report success, or fall into the standalone tail.
