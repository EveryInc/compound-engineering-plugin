---
status: accepted
---

# Verification-child custody on interrupted resume

## Context

`_verify_run_locked` / `cmd_integrate` write the artifact-transaction journal to `captured`, then spawn the verification command as a child process (`subprocess.run`). If the controller is killed after the child starts but before the transaction reaches `complete`, the child can survive as an orphan. Nothing recorded the child's identity, so `resume` treats the transaction as a merely-interrupted verification: it restores checkout state and releases the integration lock **while the orphaned command is still mutating precious/tracked files**. The delayed restoration can then overwrite user edits made after the original command, with a receipt that claims custody was proven.

## Decision

`resume` **fails closed** on unprovable child liveness. It never restores checkout state or releases the integration lock over a verification child it cannot prove is dead.

To make that decidable, the verification child is spawned in its own session/process group and its identity is recorded before the controller waits on it:

- **Spawn** with `start_new_session=True` (`setsid`), so the child and any workers it forks share one process group.
- **Record** `{pid, pgid, started_at}` in the journal immediately after the process starts, before waiting on it. `started_at` is the OS process create-time.
- **Probe on resume:** inspect the recorded process group; compare `started_at` against the live process to defeat PID reuse.
  - Provably dead (no live member, or start-time mismatch ⇒ recycled PID) → restore as normal.
  - Alive, or liveness cannot be established → **fail closed**: retain the integration lock and recovery state, hand to the operator.
- **No recorded identity on a `captured` transaction ⇒ fail closed.** Absence of a death proof is treated as maybe-live. This also covers the microsecond window between spawn and the identity write (a kill there leaves a live child the journal cannot name).

Recovery from a fail-closed state is the existing operator handoff (`retain_recovery_state`, retained integration lock) — the same path already used when precious restoration cannot be proven.

The guarantee holds on **every** path that could restore custody, not just interrupted `resume`:

- **Success path.** After `proc.wait()` returns (the session leader exited), the process group is proven empty (`_verification_group_drained`) before restoring — a backgrounded worker still alive in the group fails closed.
- **Post-spawn persistence failure.** If recording the child identity fails after a successful spawn, the group is killed and reaped and the run fails closed — never left as a launch-failure exit code with a live orphan.
- **Resume via settlement.** The lifecycle resume path reaches restoration through `settle_artifact_transaction`, not `resume_artifact_transaction`; it passes `require_child_provably_dead=True`, so that entry applies the same liveness gate. Live (non-resume) settlement callers, which have just awaited and drained the child, restore directly.

## Considered options

- **Terminate the child first, then restore.** Rejected: signalling an arbitrary verification command (a test runner, `npm ci`, a script forking workers) and *proving* it and its descendants are gone is strictly harder than refusing to act; a missed grandchild reintroduces the corruption. Fail-closed is the safe floor. Recording `pgid` keeps this option open later without a schema change.
- **Bare PID identity.** Rejected: PID reuse can read a recycled PID as "alive" or as the wrong process, and a bare PID is blind to forked grandchildren still writing after the tracked PID exits — exactly the hole this closes.
- **No-identity ⇒ assume dead ⇒ restore.** Rejected: reintroduces the original bug for the narrow pre-spawn window.
- **Two-phase intent-first spawn** (reserve the session leader, record it, then exec) to eliminate the spawn↔record window entirely. Deferred: correct but adds a two-phase spawn mechanism for a window measured in microseconds; the fail-closed no-identity rule already covers it safely.

## Consequences

- A controller crash that legitimately never spawned a child (identity never written) also wedges into operator handoff. Accepted: the recovery is the same cheap operator unwedge, and it preserves the invariant that absence-of-proof never auto-restores.
- Supervision is POSIX-only (`start_new_session`, process-group + create-time probing). ce-work verification already assumes a POSIX host.
- This is a custody-recovery contract: changing it later changes when `resume` is allowed to touch user data, so it is hard to reverse. Recorded here so a future reader does not "simplify" `resume` back into auto-restoring.
