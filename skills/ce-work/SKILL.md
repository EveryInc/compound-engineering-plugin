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

**Bundled references must be read, never approximated.** Resolve each reference or script path named below from this skill's loaded `SKILL.md` directory, using the full skill path the harness supplied, and never glob the target repository to find a bundled file. Read each reference when you enter the phase it governs; a read made before that phase does not satisfy it, and a reference this file says to read again is read again at its step even when already in context. If the harness does not expose the skill directory, or a required file cannot be read, stop before the action it governs and report which file is missing. Do not reconstruct its rules from memory; report the missing reference instead of continuing natively.

### Phase 0: Input Triage

**Recovery activation comes first.** Before classifying the input as a plan, a path, a blank, or a bare prompt, recognize requests to resume, inspect, reap, or clean up an existing run. Recovery never dispatches a new worker, selects a new route, discovers another plan, reruns completed verification, or enters either shipping path. If the run id is missing, ask for it; never guess one.

Before any other input decision, read `references/input-triage.md`. It decides source resolution, control tokens, recovery, read-only discovery, plan readiness, non-code routing, blank input, and bare-prompt sizing. Three rules from it hold here:

- A bare prompt that is Trivial — one or two files, no behavioral change — skips the task list but still resolves its execution engine before writing. A purely mechanical diff also ships without a post-PR watch. When either is uncertain, take the fuller route.
- A bare prompt that `ce-plan` already sized in this session is executed, not planned again. A decision the user would weigh is asked as a question, never as a route back to `ce-plan` or `ce-brainstorm`.
- If that reference cannot be read, stop; never treat control tokens or a non-executable artifact as code work.

When triage selects Return-to-Caller Mode, read `references/return-to-caller.md` immediately and record that it governs how this run ends. If it cannot be read, stop before any mutation; do not fall back to standalone behavior.

### Phase 1: Quick Start

1. **Establish the workspace.** Before moving branches, editing, dispatching, or committing, read `references/workspace-setup.md`. It decides the writable checkout, plan clarification, branch placement, the pre-work inventory, already-dirty files, and task setup. Never write without a writable canonical checkout, and never write on the real default branch unless the user explicitly directed that in this session.

   **Do not commit or publish anything the user did not offer.** When a unit needs a file that was already dirty, standalone mode asks once whether to include or exclude that file. Return-to-Caller Mode neither asks nor edits it; it returns blocked, naming the collision and how to recover.

2. **Resolve the engine, then strategy.** After bounded plan intake and task derivation, but before selecting a unit for execution, writing, dispatching, or committing, read `references/execution-engines.md` and complete its route selection. It applies with or without a typed binding; native execution is eligible only when that reference selects it or exhausts an allowed fallback. The engine choice never changes which reference governs how the run ends.

   If cross-model execution is selected, read `references/cross-model-execution.md` before any content or authority crosses to the other model. It defines controller initialization, the post-init engine lock, bounded egress, transactions, recovery, and receipts.

   Before choosing inline, serial, or parallel execution, and before dispatching any worker, read `references/execution-strategy.md`. It decides scheduling, isolation, the packet each worker receives, worker lifecycle, and integration. The host orchestrator keeps authoritative verification and makes the canonical commits.

### Phase 2: Execute

Before the first implementation write, including on the Trivial route, read `references/implementation-loop.md`. It decides how evidence is chosen, verification, when to stop a unit, incremental commits, following existing patterns, continuous testing, where simplification stops, UI work, progress tracking, and settled decisions.

The commit rule from this file stays in force throughout: every implementation commit names only that unit's owned files. A bare `git commit` can absorb the user's pre-existing index, so it is forbidden.

### Phase 3-4: Quality Check and Finishing Work

After the tasks and local verification are complete, standalone mode reads `references/shipping-workflow.md` before any quality check or delivery. It decides simplification, code-review receipts and fallbacks, leftover findings, final validation, and delivery.

**Code-review completion gate (standalone only).** Code review must actually happen before shipping. The run is not done, must not call a commit or shipping skill, and must not report that shipping is complete until the shipping reference has recorded either an actual completed `ce-code-review` receipt or one of its exact authorized skip states. Never substitute a mental self-review or findings already applied earlier. This rule does not apply in Return-to-Caller Mode.

## Return-to-Caller Mode

Return-to-Caller Mode performs implementation and local verification only. It must not enter Phase 3-4 or run final simplification, code review, PR creation, CI watching, babysitting, or any other standalone shipping action; the caller owns those steps.

Immediately before emitting the result, read `references/return-to-caller.md` again. It alone defines the full return envelope, the check that evidence is complete, the route and model records, recovery semantics, and `standalone_shipping_skipped: true`. Do not build a complete envelope from this file.

If that required read fails after planning or implementation created state, preserve every changed file, commit, workspace, and controller record. Return the minimum blocked result from this file: `status: blocked`, `plan_path`, `run_id` when known, `changed_state`, `blockers` naming the missing reference, and `recovery_path`. Do not erase partial state, report success, or fall into the standalone shipping path.
