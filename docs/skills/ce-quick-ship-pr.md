# `ce-quick-ship-pr`

> Review a routine change, verify it lightly, commit it, push it, and open or verify its pull request without turning the task into a release workflow.

`ce-quick-ship-pr` is the short path from a finished working tree to a reviewable pull request. It is intentionally narrower than [`/ce-commit-push-pr`](./ce-commit-push-pr.md): it does not merge, deploy, rewrite PR descriptions, capture evidence, add branding, teach concepts, or babysit CI.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Reviews the requested diff, runs the smallest meaningful checks, commits owned paths, pushes the branch, and opens or verifies a PR |
| When to use it | Routine "commit, push, and open a PR" work with no unusual history or release concerns |
| What it produces | A verified remote branch and an open or confirmed pull request |
| What's next | A human reviews and merges; use [`/ce-babysit-pr`](./ce-babysit-pr.md) only when CI/review monitoring is explicitly wanted |

---

## Safety boundaries

The user's request to review changes, commit, push, and open a PR authorizes those remote writes. It does **not** authorize merging, deploying, force-pushing, resetting, rebasing a published branch, deleting branches, or handling secrets.

The skill preserves unrelated staged, unstaged, and untracked work. It stages explicit owned paths and never sweeps `.env` files, credentials, tokens, dumps, caches, screenshots, or unrelated generated files into a commit.

---

## Workflow

1. **Preflight** — identify the repository root, branch, dirty paths, diff check, remote, default branch, recent commit style, and any existing PR for the branch.
2. **Scope the change** — separate unrelated work and keep the shipment to one commit when the boundary is unclear, or at most two or three clearly distinct commits.
3. **Verify lightly** — run the repository-native focused check when one exists. Always run `git diff --check`; `tests:skip` skips only optional tests, never diff review or secret screening.
4. **Commit explicitly** — stage only owned paths, read back the commit SHA, and confirm the branch is not the default branch before pushing.
5. **Push and verify** — use `git push -u origin HEAD`, then confirm the remote branch points to the local `HEAD`.
6. **Open or verify the PR** — re-check for a matching open PR immediately before creating one. Read back its URL, state, base, head branch, and head SHA.

If the checkout is dirty with unrelated changes, preserve it and isolate the owned work rather than staging around it carelessly. If the remote or GitHub CLI returns an error, report the exact blocker; do not infer that a PR does not exist or invent a URL.

---

## When to use a heavier workflow

Use [`/ce-commit-push-pr`](./ce-commit-push-pr.md) for adaptive descriptions, description-only or existing-PR rewrite modes, concept teaching, branding, evidence, or unusual branch history. Use [`/ce-babysit-pr`](./ce-babysit-pr.md) for CI/review monitoring. Use [`/ce-worktree`](./ce-worktree.md) when worktree setup itself is the task.

---

## See also

- [`ce-commit`](./ce-commit.md) — commit only, without push or PR
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — full shipping workflow
- [`ce-babysit-pr`](./ce-babysit-pr.md) — monitor an open PR toward merge-ready
