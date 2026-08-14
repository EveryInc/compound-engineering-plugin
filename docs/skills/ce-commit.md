# `ce-commit`

> Make local git commit(s) from the working tree. No push, no PR.

`ce-commit` is a **git-workflow** skill, not a core-loop step. Use it when you want changes saved on the current branch and nothing else. It reads the repo's commit convention, stages named files only, and splits into separate commits when the files fall into distinct concerns.

It is the local-only sibling of `/ce-commit-push-pr`. That skill ships a PR. This one stops after the commit.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Commits current work locally, following repo conventions, staging files by name |
| When to use it | "Commit this" or "save my changes" when you do not want a push or a PR |
| What it produces | One commit, or up to three when files split cleanly. Stays on the branch. |
| What's next | `/ce-commit-push-pr` when you want a PR, or `git push` yourself |

---

## Example invocations

Most prompts are a hint for the subject or the file grouping. There is no mode flag. An empty invoke is the common case.

```text
# Current work, local only. On main or detached HEAD, create a feature branch first.
# Clean tree: report nothing to commit and stop.
/ce-commit

# Steer the subject and which files belong together
/ce-commit commit the auth changes

# Mid-flow save. Same local-only path.
/ce-commit save my changes
```

For commit plus push plus an open PR, use `/ce-commit-push-pr` instead.

---

## The Problem

A rushed commit often does one of these:

- `git add -A` or `git add .` pulls in `.env` files, build output, generated files, or scratch notes
- The message follows conventional commits in a repo that uses ticket prefixes, or the other way around
- Backend, frontend, and docs land in one commit because splitting felt like extra work
- The subject lists files (`update foo.rb`) instead of the outcome
- The commit lands on a detached HEAD or on the default branch, where it is easy to lose or fights branch protection

## The Solution

`ce-commit` treats commit creation as a short, fixed pass:

- Convention comes from project instructions already in context, then the last 10 commits, then conventional commits
- Files are staged by name. Never `git add -A` or `git add .`
- Distinct concerns become separate commits at file level only (2-3 max, no `git add -p`). Ambiguous grouping stays one commit
- Detached HEAD or the default branch gets a feature branch first, with no prompt
- The subject is imperative and names what is now possible or fixed. A body is added only when the why is not obvious

---

## What Makes It Novel

### Convention before the message

The skill matches the repo rather than forcing a house style:

1. Project conventions already in context
2. A clear pattern in the last 10 commits (conventional commits, ticket prefixes, emoji prefixes)
3. Conventional commits as fallback: `type(scope): description`

When conventional commits are in use and both `fix:` and `feat:` fit, it defaults to `fix:` (a change that remedies broken or missing behavior, even if it adds code). You can override.

### Named files only

It stages an explicit list (`git add file1 file2 file3`). That keeps `.env` credentials, `dist/` / `.next/` output, generated files, and untracked notes out of the commit.

### File-level splits only

If the changed files group into two or three distinct concerns (a data-layer change in one directory, a UI change in another), it makes separate commits. Splits stay at the file boundary. `git add -p` is out of scope. When the grouping is unclear, one commit is correct.

### Feature branch when HEAD is unsafe

On detached HEAD, or on `main` / `master` / the resolved default, it creates a feature branch from the change content and continues there. It does not ask, and it does not leave the only copy of the work on detached HEAD or the default branch.

---

## Quick Example

You finish a notification-mute change that touches a model, a controller, and a JS component. You invoke `/ce-commit`.

Git status shows four modified files. Recent commits use conventional commits with a scope (`feat(auth): ...`). The branch is `tmchow/notification-mute`, not the default.

Model and controller group as the data layer. The JS component is the UI. Two commits:

```text
feat(notifications): add per-subscription mute_until column

Subscriptions can now carry a mute timestamp; nil means not muted.
Controller exposes the toggle endpoint.
```

```text
feat(notifications): wire toggle UI to mute endpoint
```

The skill reports both hashes and subjects. Nothing is pushed.

---

## When to Reach For It

Use `ce-commit` when:

- You want the work on the local branch only
- You are mid-flow and will push later
- You want the repo's commit style and named-file staging handled for you

Skip it when:

- You also want a push and a PR -> `/ce-commit-push-pr`
- You need hunk-level splits -> `git add -p` yourself; this skill is file-level
- There is nothing to commit. The skill reports that and stops.

---

## Chain Position

`ce-commit` is on-demand. It is not a required pipeline stage.

```text
/ce-work  ->  /ce-commit              (local only)
/ce-work  ->  /ce-commit-push-pr      (open a PR)

/ce-debug ->  /ce-commit              (when you pick commit-only on a branch you already had)
```

`/ce-work` and `/ce-debug` can hand off here when you choose not to open a PR. Most people invoke it directly.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Commit current changes on this branch. Creates a feature branch first if HEAD is detached or on the default. |
| `<hint>` | Natural-language steer for the subject or which files to group, e.g. `commit the auth changes` |

No mode flags. No push. No PR.

---

## FAQ

**Why not `git add -A`?**
It sweeps in files you did not mean to commit. Staging by name keeps secrets and junk out.

**Why no hunk-level splitting?**
`git add -p` is interactive and easy to get wrong in an agent flow. Distinct concerns usually already sit in different files. If you need hunks, do that yourself, then invoke this skill.

**What if the repo does not use conventional commits?**
Project instructions win, then recent history. Conventional commits are only the fallback.

**Why a feature branch on the default or on detached HEAD?**
A default-branch commit fights PR workflow and branch protection. A detached HEAD commit is easy to lose. Creating a feature branch is the same safe default `/ce-commit-push-pr` uses.

**What if I want the PR after all?**
Run `/ce-commit-push-pr`. It will see the commits already made and continue from there.

---

## See Also

- [`/ce-commit-push-pr`](./ce-commit-push-pr.md): commit, push, and open a PR
- [`/ce-babysit-pr`](./ce-babysit-pr.md): watch an already-open PR over time
- [`/ce-worktree`](./ce-worktree.md): isolate the checkout before you start committing
