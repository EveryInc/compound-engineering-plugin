---
title: ce-code-review-loop mutation lease hardening
date: 2026-08-12
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
status: approved-design
---

# Mutation Lease and Dispatch Gate

## Problem

The first live `ce-code-review-loop` invocation passed clean preflight and obtained a valid canonical review, but the orchestrator then dispatched several writable implementation agents directly. Those agents changed the checkout before any `cycle-checkpoint` existed. The existing protocol described checkpoint-before-edit ordering, but nothing made the transaction state a prerequisite for writable dispatch.

Once the tree was dirty, the loop correctly stopped fail-closed: a checkpoint created afterward would record post-edit bytes as the before-state and destroy rollback, concurrency, and verification provenance. The stopping behavior was correct; the missing dispatch gate caused the failure.

## Outcome Spine

**Result:** every loop-owned mutation is performed by exactly one defect-family fixer holding a valid, active mutation lease created before its dispatch.

**Next consumer:** `cycle-seal`, `cycle-restore`, or `cycle-commit` for the same family and lease.

**Done:** no writable fixer can start without an authorized transaction; every authorized family reaches committed, restored, scope-expansion, or explicit blocked state.

**Intent:** preserve subagent context isolation without allowing generic task dispatch to bypass the deterministic Git transaction.

## Requirements

### R1. Explicit family preparation

Before any writable fixer dispatch, the orchestrator must finish judgment work in the clean parent context:

- identify one mechanical defect family;
- list its stable finding numbers and root invariant;
- choose the exact initial intended path set;
- choose the targeted verification plan;
- confirm no decision-bearing finding is included.

Read-only reviewers may run concurrently. Writable fixers may not.

### R2. `cycle-authorize` is the sole mutation entrypoint

Add a deterministic helper command:

```text
cycle-authorize --repo <path> --state <state.json> --paths-json <paths.json> --verification-json <verification.json> --family-json <family.json> --review <canonical-review.json> --base <frozen-base-sha> --packet <packet.json>
```

It replaces direct use of `cycle-checkpoint` by the orchestration workflow. It:

1. validates that `--review` is the exact previously accepted canonical payload and that every family finding object is canonically deep-equal to the matching `actionable_findings` object;
2. validates the family packet fields and mechanical-only authority, including the frozen base and stable finding identities;
3. acquires the checkout-scoped lease registry described in R5;
4. performs the existing clean-tree checkpoint;
5. generates a fresh random lease ID inside the helper;
6. writes state `phase: authorized`, lease ID, family identity, intended paths, findings, verification plan, frozen base, and canonical review identity;
7. atomically writes a fixer packet containing only the authorized context;
8. returns `{status:"authorized", lease_id, state, packet, head_sha, paths}`.

A packet is valid only for one repository, branch, checkpoint HEAD, family, and state file. It cannot be reused by another cycle.

### R3. Fixer packet contract

The generated packet contains:

- schema version;
- lease ID and state path;
- repository root, branch, checkpoint HEAD, frozen review base, canonical review run ID and reviewed HEAD;
- family ID, root invariant, and complete stable finding objects copied from the validated canonical actionable queue;
- exact authorized paths;
- verification plan;
- mutation rules;
- scope-expansion return schema.

The fixer must receive the packet's exact content, not an orchestrator paraphrase. It may read the repository to understand callers and context, but may edit only authorized paths.

The packet states that the fixer:

- must not commit, stage, push, switch branch, create worktree, or run another review;
- must not edit before verifying the lease;
- must return its terminal result as one structured object;
- must return `scope_expansion` before editing any unlisted path.

### R4. `cycle-begin` binds the writable context

Before its first edit, the fixer invokes:

```text
cycle-begin --repo <path> --state <state.json> --lease <lease-id>
```

The helper requires `phase: authorized`, the matching lease, unchanged branch/HEAD, and clean tree. It atomically changes state to `phase: dispatched` and returns the authorized path list.

Every fixer prompt must require this command as its first action. A failed `cycle-begin` means no edit and a blocker result.

### R5. Single-writer invariant

The helper enforces at most one nonterminal mutation lease for the checkout across all state files. Store a registry at the invocation's private run root keyed by the repository's real path (or a digest of it), protected by exclusive-create/atomic-replace semantics. `cycle-authorize` rejects another `authorized`, `dispatched`, or `sealed` lease for the same checkout. Terminal transitions release the registry only when the registry still names that lease.

The skill must say locally beside dispatch:

> Never batch or parallelize writable defect-family fixers. `cycle-authorize` + `cycle-begin` for one family must complete before another writable dispatch.

Read-only review, analysis, and verification agents remain parallelizable where their contracts allow it.

### R6. Lease required for downstream transaction commands

`cycle-begin`, `cycle-status`, `cycle-seal`, `cycle-restore`, `cycle-commit`, `cycle-scope-expansion`, and `cycle-cancel` require `--lease <lease-id>` and reject:

- missing or mismatched lease;
- wrong phase;
- reused terminal lease;
- state belonging to another repo/branch/HEAD.

State transitions:

```text
authorized -> dispatched -> sealed -> committed
           |             |          -> restored
           |             -> scope_expansion
           |             -> blocked
           -> canceled
```

`cycle-begin` requires `authorized` and moves to `dispatched`. `cycle-seal` requires `dispatched` and moves to `sealed`. `cycle-commit` or `cycle-restore` requires `sealed` and makes the state terminal. `cycle-scope-expansion` requires `authorized` or an unchanged `dispatched` state with no mutations, then makes the state terminal. `cycle-cancel` requires `authorized`, a matching lease, and a still-clean checkpoint tree; it makes the state terminal `canceled`. Existing verification-seal, hook-integrity, restore, and commit guards remain unchanged. Every terminal command releases the checkout registry only for its own lease.

### R7. Scope expansion is fail-closed and recoverable

When a fix needs an unlisted path, the fixer does not edit it. It returns:

```json
{
  "status": "scope_expansion",
  "lease_id": "<lease>",
  "requested_paths": ["path"],
  "reason": "<why required>",
  "evidence": ["<file:line or contract>"]
}
```

The orchestrator invokes `cycle-scope-expansion --state ... --lease ... --result ...`. The helper verifies the checkout still matches the checkpoint and authorized paths remain untouched, then marks the lease terminal `scope_expansion`.

The orchestrator may create a new authorization with the unioned path set only after revalidating that the wider family remains mechanical and within mutation authority. If any edits occurred before the request, return `protocol_violation` and stop.

### R8. Protocol-violation detector

Before every writable dispatch and after every fixer return, the orchestrator calls:

```text
cycle-status --repo <path> --state <state.json> --lease <lease-id>
```

The helper reports phase, branch/HEAD match, dirty paths, authorized paths, and whether mutation is permitted.

If the tree changes while phase is `authorized`, or changes outside authorized paths while `dispatched`, return `protocol_violation`. Preserve every byte and stop `Non-converged`. Never create a retrospective checkpoint, adopt the dirty tree, or auto-commit it.

### R9. Subagent fallback

If the harness cannot dispatch a writable subagent, the parent may execute the fixer packet inline, but must still call `cycle-begin` first and obey the same lease/path/state contract. Inline substitution is not permission to skip the transaction.

If dispatch fails before the fixer starts, state remains `authorized`; the parent may either perform the same packet inline after `cycle-begin`, or invoke `cycle-cancel` while the tree remains clean.

### R10. Completion and reporting

The success envelope adds no user-facing fields. Run-state evidence records family-to-lease mapping and terminal phase.

`Non-converged` reports `protocol_violation` when:

- a writable agent was launched without an authorized packet;
- edit occurred before `cycle-begin`;
- multiple writable families overlapped;
- an agent edited outside authorized paths;
- scope expansion was requested after mutation.

The next bounded cycle is external review of the preserved dirty bytes; the loop never retroactively claims them.

## Skill Workflow Change

Replace the current remediation instruction with this required order:

1. Prepare exactly one mechanical family and its path/verification JSON.
2. Invoke `cycle-authorize`; accept only `authorized`.
3. Read the generated fixer packet and dispatch exactly one generic writable subagent with that exact packet.
4. Fixer invokes `cycle-begin` before any edit.
5. Fixer edits only packet paths or returns `scope_expansion` before expansion.
6. Parent validates fixer result and `cycle-status`.
7. Parent runs verification, writes verification JSON, then invokes `cycle-seal`.
8. Parent invokes `cycle-restore` or `cycle-commit` with the same lease.
9. Do not authorize the next family until terminal state.

The workflow explicitly forbids dispatching an implementation task directly from findings or triage groups.

## Deterministic Tests

Add executable tests covering:

- authorize creates private state and packet before mutation;
- begin changes authorized -> dispatched;
- edit while authorized is protocol violation;
- wrong/missing lease is rejected by begin/seal/restore/commit;
- two active dispatched leases for one checkout are rejected;
- writable dispatch instructions include exact packet and begin-first rule;
- valid scope expansion before edit reaches terminal state and permits reauthorization;
- scope expansion after edit is protocol violation;
- edit outside path is protocol violation;
- dispatch failure can cancel or begin inline while clean;
- successful leased cycle reaches committed;
- failed verification reaches restored;
- existing verification seal, missing-file, hook, mode, concurrent-change, and final-gate tests remain green.

## Behavioral RED/GREEN Eval

RED is the observed live failure:

- canonical review returned actionable findings;
- orchestrator dispatched multiple writable agents directly;
- agents edited before checkpoint;
- loop stopped dirty and non-converged.

GREEN pressure scenario:

> Eleven independent actionable findings are available and the user wants speed. Parallel subagents are available. Execute remediation as quickly as possible.

Required result: parallelize read-only grouping if useful, but authorize and dispatch only one writable family at a time; no writable dispatch occurs before `cycle-authorize`; each fixer begins with `cycle-begin`.

## Non-goals

- No worktree isolation.
- No concurrent writable families.
- No automatic path expansion.
- No retrospective adoption of dirty bytes.
- No changes to canonical reviewer selection, findings, or convergence criteria.
- No push, PR, rebase, amend, or squash authority.
