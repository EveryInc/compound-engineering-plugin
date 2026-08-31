---
title: Harness worktree isolation is not a faithful snapshot — verify HEAD before acting
date: 2026-08-31
category: skill-design
module: skills (isolated-worktree dispatch across harnesses)
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "a skill dispatches a subagent with harness worktree isolation (e.g. Claude Code Agent isolation: \"worktree\")"
  - "the dispatched work mutates or verifies files and assumes it holds the session's reviewed tree"
  - "the session itself runs inside a managed or linked worktree (Codex desktop, Cursor, Orca)"
tags: [worktree-isolation, subagent-dispatch, snapshot-fidelity, cross-harness, mutation-testing, ce-code-review]
---

# Harness worktree isolation is not a faithful snapshot — verify HEAD before acting

## Context

`ce-code-review` dispatches its `testing` persona into an isolated worktree (Claude Code's Agent `isolation: "worktree"`) so mutation testing cannot write transient lines into the shared checkout that concurrent read-only reviewers observe (PR #1584, issue #1566). The dispatch prose originally assumed that when the reviewed tree is committed `HEAD`, "the harness supplies the snapshot" — that an isolated worktree is automatically a faithful copy of the tree the session is reviewing.

A live probe falsified that assumption. Most harness apps (Codex desktop, Cursor, Orca) run the whole session inside a managed/linked worktree, so skills routinely execute from one. Spawning a worktree-isolated subagent from inside such a session on this repo produced an isolated copy cut from the **primary checkout's default branch**, not from the session worktree's checked-out branch: the isolated HEAD matched neither the session's HEAD nor the reviewed commit, and its tree differed from the reviewed tree by 53 files. A mutation-testing reviewer dropped there would have silently tested the wrong code.

## Guidance

When a skill hands work to a harness-created isolated worktree, treat snapshot fidelity as a condition to verify, never a property of the mechanism:

1. **Pass the intended commit SHA** to the isolated worker as part of its dispatch.
2. **Have the worker verify before acting**: its copy's `HEAD` must equal that commit (`git rev-parse HEAD`).
3. **Fall back on any mismatch** to an explicit scratch copy of the intended tree, made by the worker itself.
4. Uncommitted state never survives worktree isolation: a review scope that includes staged/unstaged changes (`local-aligned`) needs a scratch copy that preserves them regardless of what the harness supplies.

The fix on PR #1584's branch (open as of this writing) states this in both files that govern the behavior — the dispatch layer in `skills/ce-code-review/references/dispatch-reviewers.md` ("Exception — tree-mutating reviewers"), and independently in the persona prompt in `skills/ce-code-review/references/personas/testing-reviewer.md`, because a fresh subagent receives only the persona file and never inherits the dispatch reference. The verify condition is pinned in `tests/review-skill-contract.test.ts` (`"HEAD equals the reviewed commit"`).

## Why This Matters

The failure is silent and wrong-by-content, not loud: the isolated worker runs happily, the suite passes or fails, and every conclusion refers to a tree nobody asked about. Worktree-based session managers are the default setup for a growing share of users, so "session runs inside a linked worktree" is the common case, not the edge. And because git worktrees share one object store, the wrong-base copy looks completely normal from inside — only comparing `HEAD` against the intended commit exposes it.

## When to Apply

- Any skill or dispatch path that uses a harness isolation feature (Claude Code Agent `isolation: "worktree"` or an analogue) to give a worker its own copy of the repo.
- Any worker whose job depends on operating over a specific tree: mutation testing, build verification, refactoring probes, benchmark runs.
- Reviews or checks whose scope includes uncommitted changes — isolation from committed `HEAD` is stale for those by construction, on every harness.

## Examples

The probe that demonstrated the trap, runnable from any session already inside a linked worktree: spawn a subagent with `isolation: "worktree"` and have it report `pwd`, `git rev-parse HEAD`, and `git worktree list`. In the observed run, the session worktree sat at the reviewed commit on the PR branch, while the isolated copy's `HEAD` was a commit on top of the default branch tip from the primary checkout — the two trees differed by 53 files (`git diff --stat <session-head> <isolated-head>`).

The corrected dispatch shape, from `dispatch-reviewers.md`: dispatch with `isolation: "worktree"` *and* the reviewed commit SHA; the persona verifies `HEAD` equals that SHA before mutating and falls back to a scratch copy on any mismatch.

## Related

- [sandbox-workers-must-not-write-linked-worktree-git-index.md](sandbox-workers-must-not-write-linked-worktree-git-index.md) — sibling worktree-dispatch pitfall: a worktree handed to a sandboxed worker cannot take git index writes.
- [bundled-script-path-resolution-across-harnesses.md](bundled-script-path-resolution-across-harnesses.md) — same meta-pattern: a cross-harness assumption falsified empirically, then generalized into an authoring rule.
- [harness-agent-gate-workaround.md](harness-agent-gate-workaround.md) — lifecycle rule for harness workarounds; if harnesses later anchor isolation worktrees to the session worktree's HEAD, its exit condition applies to this guard.
- Issue #1566 (originating), PR #1584 (carrier).
