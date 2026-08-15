---
title: Sandbox-bounded external workers must not write the linked-worktree Git index
date: 2026-08-14
category: skill-design
module: skills/ce-work
problem_type: convention
component: tooling
severity: high
applies_when:
  - Authoring or reviewing a ce-work external-worker persona, adapter prompt, or execution contract
  - A worker runs in a controller-owned detached linked worktree under Codex workspace-write or Cursor --sandbox enabled
  - Deciding whether an external worker should git add, git commit, or otherwise write the Git index
  - A Codex workspace-write packet probes sockets, OS permissions, or peer credentials and gets EPERM
  - Diagnosing index.lock Operation not permitted after a completed ce-work unit
tags:
  - ce-work
  - linked-worktree
  - git-index
  - sandbox
  - workspace-write
  - external-workers
  - terminalize
  - codex
related_components:
  - development_workflow
---

# Sandbox-bounded external workers must not write the linked-worktree Git index

## Context

Cross-model `ce-work` dispatches an external implementation worker into a controller-owned detached linked worktree. That worktree's files sit in one directory; its Git index and other admin state live in the repository's shared Git common dir, outside the workspace the adapter sandboxes.

The production adapters confine the worker to that workspace:

- Codex: `codex exec … -s workspace-write -C "$WORKSPACE"` (`skills/ce-work/scripts/cross-model-work.sh:100-101`).
- Cursor, Composer, and Grok-via-Cursor: `cursor-agent … --sandbox enabled --workspace "$WORKSPACE"` (`cross-model-work.sh:128`, `:133`, `:137`).

A sandboxed `git add` or `git commit` therefore tries to write the index in the common dir the sandbox cannot reach. The worker either fails the commit, treats a sandbox `EPERM` as a host-capability failure, or reports `blocked` after the unit is otherwise done.

The worker does not need that write. Host `unit-workspace.py terminalize` snapshots the complete working tree after the process is authoritatively `done` (`skills/ce-work/scripts/unit_workspace_jobs.py:1111-1134`). Worker commits are optional intermediate evidence only for a sandbox that can write the linked-worktree Git admin dir; they are never required (`skills/ce-work/references/cross-model-execution.md:43`).

Issue #1318 is the originating report. The contract, persona, adapter appendix, and eval fixture landed in PR #1382 (opened, unmerged as of this writing).

## Guidance

**Default: forbid worker Git index writes.** The implementation-worker persona is unconditional: edit and test; do not run `git add`, `git commit`, or another Git index write; leave the completed working tree uncommitted; report `completed` when files and scoped checks are done; the host snapshots the tree (`skills/ce-work/references/agents/implementation-worker.md:6`).

**Contract: commit only if the sandbox can write the linked-worktree Git admin dir.** Bound worker authority grants edit-only access inside the controller-owned detached worktree. Do not instruct the worker to run `git add`, `git commit`, or another Git index write unless that adapter's sandbox can write the linked-worktree Git admin dir. Codex `workspace-write` and Cursor `--sandbox enabled` cannot: the index lives in the shared Git common dir, outside the workspace (`cross-model-execution.md:43`).

**Host `terminalize` is the snapshot.** On authoritative `done`, the host calls `unit-workspace.py terminalize`. That path, not the worker, stages the complete tree and pins a synthetic transport commit:

1. `git add -A -- .` in the worker workspace (`unit_workspace_jobs.py:1111`).
2. `write-tree` of that index (`unit_workspace_jobs.py:1112`).
3. `commit-tree` of that tree, parented only on the recorded unit or wave base (`unit_workspace_jobs.py:1134`).

The serial protocol requires that pinned transport commit to have the recorded base as sole parent and the complete final workspace tree (`cross-model-execution.md:95`). Worker commits, if any, are never the transport.

**Codex capability probes are host-owned.** A Codex `workspace-write` packet must treat socket binds, OS permission checks, and peer-credential probes as host-owned. Preserve the host command and observed result; do not treat a sandbox `EPERM` as proof the host lacks the capability (`cross-model-execution.md:45`). The adapter injects that appendix only when `ROUTE=codex` (`cross-model-work.sh:604-606`).

**Do not weaken this into "commit if you can."** Worker commits remain optional intermediate evidence only for a sandbox that includes the Git admin dir, and they are never required. Today's shipped Codex and Cursor adapters cannot write that dir. Instructing those workers to commit is a protocol error even if a particular sandbox happens to succeed.

**Keep native and external commit ownership distinct.** Ordinary native workers also do not commit — the orchestrator owns staging, committing, and authoritative tests (`skills/ce-work/SKILL.md:239`). Shared-workspace native workers additionally must not `git add` because concurrent index writes corrupt the shared index (`SKILL.md:241`). That is a different failure class.

## Why This Matters

The failure is at the boundary between sandbox and Git worktree layout, not at "the worker forgot to commit."

- A linked worktree's checkout is the workspace. Its index, `HEAD`, and other admin files live in the shared Git common dir. `workspace-write` / `--sandbox enabled` confine writes to the checkout. `git add` and `git commit` must write the common dir. The write is rejected even when the file edits succeeded.
- Treating that rejection as "Git is unavailable" or "the host cannot commit" is false. The host terminalizes from outside the sandbox by staging the working tree and creating the transport with `commit-tree`.
- Asking the worker to commit also mixes evidence layers. The worker's `changed_files` and prose are evidence only; the host independently derives the complete Git tree (`implementation-worker.md:10`). A worker commit is not the transport and is not the canonical commit.
- A Codex sandbox `EPERM` on a socket bind or peer-credential probe is the same class of false negative: the sandbox cannot do it, the host can.

The cost of the wrong instruction is a finished unit that reports `blocked`, a wasted external spend, and a host that has no transport to inspect. The cost of the right instruction is zero: `terminalize` already snapshots whatever is in the working tree.

## When to Apply

- Authoring or revising the `ce-work` implementation-worker persona, the Bound worker authority section, or any adapter-injected appendix that tells an external worker how to finish a unit.
- Adding or changing a cross-model adapter whose sandbox is workspace-scoped (`workspace-write`, `--sandbox enabled`, or equivalent) against a linked worktree.
- Reviewing a worker prompt, unit packet, or eval fixture that still says the worker should `git add` / `git commit` when files and scoped checks are done.
- Diagnosing a Codex or Cursor unit that finished edits then failed or blocked on a Git index write, or that treated a sandbox `EPERM` as proof the host cannot bind a socket or read peer credentials.
- Do not apply this as a reason to skip host `terminalize`. The host still snapshots. Do not apply it to host-side `git add` / `commit-tree` in `terminalize` or to host-only canonical commits after `integrate`.
- Do not confuse it with native shared-workspace "no concurrent `git add`" (`SKILL.md:241`) or with `ce-commit`'s named-file staging rule.

## Examples

**Persona: leave the tree dirty; the host snapshots.**

```text
# skills/ce-work/references/agents/implementation-worker.md:6
You may edit and test in this workspace. Do not run `git add`, `git commit`,
or another Git index write. Leave the completed working tree uncommitted.
Report `completed` when files and scoped checks are done; the host snapshots
the tree.
```

**Contract: do not instruct a sandboxed worker to write the index.**

```text
# skills/ce-work/references/cross-model-execution.md:43
An external worker may edit only inside its controller-owned detached
worktree. Do not instruct it to run `git add`, `git commit`, or another Git
index write unless that adapter's sandbox can write the linked-worktree Git
admin dir. Codex workspace-write and Cursor --sandbox enabled cannot: the
index lives in the shared Git common dir, outside the workspace.
```

**Host snapshot (the sequence the worker must not duplicate).**

```python
# skills/ce-work/scripts/unit_workspace_jobs.py:1111-1134
git(workspace, "add", "-A", "--", ".")
tree = git_text(workspace, "write-tree")
# ...
commit = git(repo, "commit-tree", tree, "-p", base, ...)
```

**Codex appendix: sandbox `EPERM` is not a host-capability result.**

```bash
# skills/ce-work/scripts/cross-model-work.sh:604-606
if [ "$ROUTE" = codex ]; then
  printf '\n\nSocket binds, OS permission checks, peer credentials, and similar capability probes are host-owned. Preserve the host command and observed result; do not treat a sandbox EPERM as proof the host lacks the capability.\n'
fi
```

**Eval fixture E40.** A Codex or Cursor unit has finished files and scoped checks in its detached worktree; the worker is about to `git add`/`git commit`. Pass: do not instruct the worker to write the Git index. Leave the working tree uncommitted and treat completion as files plus scoped checks. Host `terminalize` snapshots the tree (`skills/ce-work/references/cross-model-work-eval.md:92`).

**Anti-pattern — instruct the sandboxed worker to commit so terminalize has a tip.** The transport is never the worker tip. `terminalize` builds a new base-parented commit from the complete working tree. Residual dirt after a worker commit is still supposed to enter that snapshot; asking the worker to commit neither completes the transport nor avoids host staging.

## Related

- Issue #1318 — originating report.
- PR #1382 — contract, persona, Codex appendix, and E40 fixture (opened, unmerged as of this writing).
- `skills/ce-work/references/agents/implementation-worker.md` — worker-facing forbid; host snapshots.
- `skills/ce-work/references/cross-model-execution.md` — Bound worker authority and serial terminalize step.
- `skills/ce-work/scripts/unit_workspace_jobs.py` — host `terminalize()` `git add -A` / `write-tree` / `commit-tree`.
- `skills/ce-work/scripts/cross-model-work.sh` — Codex `-s workspace-write`, Cursor `--sandbox enabled`, and the Codex host-owned probe appendix.
- `skills/ce-work/references/cross-model-work-eval.md` — fixture E40.
- `docs/solutions/skill-design/detached-job-lifecycle-for-delegated-work.md` — complements this; that doc owns detach survival and notes default-sandboxed Codex as unverified, not Git-admin writes.
