# `ce-worktree`

> Create a git worktree under `.worktrees/<branch>` with branch-specific setup that `git worktree add` alone doesn't handle — `.env` copying, dev-tool trust with branch-aware safety, gitignore management.

`ce-worktree` is the **isolated-checkout** skill. Plain `git worktree add` creates the worktree but skips the per-checkout setup most projects need: `.env` files don't follow, `mise`/`direnv` configs aren't trusted (so hooks block on prompts), and `.worktrees/` doesn't get gitignored. This skill handles those for you, with safety rules that prevent untrusted PR-review branches from auto-trusting `.envrc` content the user hasn't seen.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Creates `.worktrees/<branch>`, copies `.env*` from main repo, trusts `mise`/`direnv` configs with safety rules, adds `.worktrees` to `.gitignore` |
| When to use it | Reviewing a PR while keeping the main checkout free; running multiple features in parallel; keeping the default branch clean |
| What it produces | A worktree at `.worktrees/<branch-name>` ready to `cd` into |
| Skip when | Single-task work that fits on a branch in the main checkout |

---

## The Problem

Plain `git worktree add` leaves you with a working tree that's *technically* checked out but practically broken:

- **`.env*` files don't follow** — the new worktree has no `.env`, so dev servers fail or fall back to fragile defaults
- **`mise`/`direnv` configs aren't trusted** — every `cd` into the worktree blocks on a trust prompt, slowing down agent flows
- **Dangerous `.envrc` auto-trust on review branches** — naïvely running `direnv allow` on a PR-review worktree trusts whatever the contributor put in `.envrc`, which can source files direnv doesn't validate
- **`.worktrees/` not in `.gitignore`** — every `git status` from the main checkout shows the worktree directory as untracked
- **Main checkout disturbed** — `git worktree add origin/<branch>` may end up changing the main checkout's state in ways the user doesn't expect
- **Cryptic auto-generated branch names** like `worktree-jolly-beaming-raven` from some tools obscure what the worktree is actually for

## The Solution

`ce-worktree` runs worktree creation as a structured pass:

- Creates the worktree at `.worktrees/<branch>` (consistent location, never random)
- Copies `.env`, `.env.local`, `.env.test`, etc. (skips `.env.example`)
- Trusts `mise`/`direnv` configs with branch-aware safety rules — never auto-trusts modified configs, never `direnv allow` on PR-review branches
- Adds `.worktrees` to `.gitignore` if not already there
- Fetches the `from-branch` instead of checking it out — main repo stays undisturbed
- Provides clear naming guidance to upstream callers (`feat/crowd-sniff`, `fix/email-validation`, never random)

---

## What Makes It Novel

### 1. Branch-aware dev-tool trust

Trust for `mise`/`direnv` is split by base branch:

| Base branch | Behavior |
|-------------|----------|
| **Trusted base** (`main`, `develop`, `dev`, `trunk`, `staging`, `release/*`) | Configs compared against that branch; unchanged configs auto-trusted; `direnv allow` permitted |
| **Other branches** (feature, PR review) | Configs compared against the default branch; `direnv allow` skipped regardless because `.envrc` can source files direnv doesn't validate |

The split exists because review branches often contain code from external contributors. Auto-trusting their `.envrc` is the same shape of mistake as auto-running their setup script — you wouldn't, so the skill doesn't.

**Modified configs are never auto-trusted.** When a config differs from the base, the skill prints the manual trust command and waits for the user to review the diff first.

### 2. `.env*` propagation with `.env.example` skip

Most projects need `.env`, `.env.local`, `.env.test`, etc. in the worktree to run anything. The skill copies all `.env*` files from the main repo, **except `.env.example`** (which is the committed template, not the user's local secrets). After creation, the worktree can run dev servers, tests, or scripts that depend on env state without manual setup.

### 3. Doesn't disturb the main checkout

`git worktree add` with a remote ref behaves differently depending on whether the local branch exists. Plain usage can accidentally check out something in the main repo or fail with a confusing error. This skill **fetches** the `from-branch` rather than checking it out — the new worktree is created from the remote ref, but the main checkout stays exactly where it was.

### 4. Consistent location: `.worktrees/<branch>`

Worktrees go to `.worktrees/<branch>` — no exceptions. Predictable for `cd` shortcuts, predictable for cleanup, predictable for tooling that scans for worktrees. Branch names with slashes (`feat/login`) become directory paths (`.worktrees/feat/login`), which all major filesystems support.

### 5. Auto-`.gitignore` for `.worktrees`

If `.worktrees` isn't already in `.gitignore`, the skill adds it. Without this, every `git status` from the main checkout shows the worktree directory as a noisy untracked entry. With it, the directory is invisible to git operations from the main checkout.

### 6. Naming guidance for upstream callers

When `/ce-work` or `/ce-code-review` invoke this skill, they pass a meaningful branch name derived from the work description (`feat/crowd-sniff`, `fix/email-validation`). The skill explicitly discourages auto-generated cryptic names — they obscure what the worktree is for and make cleanup harder later.

### 7. No wrapper for read/list/remove — just use `git`

Other worktree operations (list, remove, switch) don't get a wrapper. The skill explicitly tells you to use `git worktree list`, `git worktree remove .worktrees/<branch>`, `cd .worktrees/<branch>`, `cd "$(git rev-parse --show-toplevel)"` directly. Wrapping bare git commands adds no value and creates a maintenance burden — the skill is focused on the parts where setup matters.

---

## Quick Example

You're starting work on a notification-mute feature and want it isolated from your main checkout (which has another feature in progress). You invoke `/ce-worktree feat/notification-mute`.

The skill runs `bash scripts/worktree-manager.sh create feat/notification-mute`. Defaults: `from-branch` is `origin/main`. Creates `.worktrees/feat/notification-mute` from the fetched `origin/main`. Copies your `.env`, `.env.local`, `.env.test`. Detects you have a `.mise.toml` matching `main`'s; auto-trusts since the base branch is `main` and the config is unchanged. `.worktrees` is already in your `.gitignore`, so no edit there.

Output:

```text
Worktree created: .worktrees/feat/notification-mute
Copied .env files: .env, .env.local, .env.test
Trusted .mise.toml (matches main, auto-trust permitted)

Switch with: cd .worktrees/feat/notification-mute
```

You `cd .worktrees/feat/notification-mute`, run `bin/dev`, and start working — no env setup, no trust prompts, no disturbance to your other feature in the main checkout.

---

## When to Reach For It

Reach for `ce-worktree` when:

- You're reviewing a PR and want to keep the main checkout free for ongoing work
- You're running multiple features in parallel and don't want to context-switch via `git checkout`
- You want to keep the default branch free of in-progress state
- A skill (`ce-work`, `ce-code-review`) offered worktree as an option

Skip `ce-worktree` when:

- The work is single-task and fits on a branch in the main checkout — worktree overhead exceeds yield
- You're already inside a worktree — nested worktrees aren't a thing the skill is designed for
- The repo doesn't have `.env` files or dev-tool configs — plain `git worktree add` is sufficient

---

## Use as Part of the Workflow

`ce-worktree` is invoked from chain skills as their parallel-isolation option:

- **`/ce-work` Phase 1.2** — when starting work, the user can choose worktree (recommended for parallel features) over branching in the main checkout
- **`/ce-code-review`** — for reviewing PRs concurrently with browser tests on a separate checkout
- **`/ce-debug`** — when investigating a bug on a branch other than the current one without disturbing in-progress work

Upstream callers pass meaningful branch names; the skill expects `feat/...`, `fix/...`, `refactor/...` shapes — not auto-generated random names.

---

## Use Standalone

Direct invocation:

- `/ce-worktree feat/notification-mute` — create from default branch
- `/ce-worktree fix/email-validation develop` — create from a different base

Other worktree operations (list, remove, switch) use `git` directly:

```bash
git worktree list                          # list worktrees
git worktree remove .worktrees/<branch>    # remove a worktree
cd .worktrees/<branch>                     # switch to a worktree
cd "$(git rev-parse --show-toplevel)"      # return to main checkout
```

To copy `.env*` into an existing worktree created without them, run from the main repo (not from inside the worktree, because branch names with slashes confuse the relative path):

```bash
cp .env* .worktrees/<branch>/
```

---

## Reference

| Argument | Effect |
|----------|--------|
| `<branch-name>` | Create worktree from default branch |
| `<branch-name> <from-branch>` | Create worktree from specified base |

Defaults:
- `from-branch` defaults to origin's default branch (or `main` if that can't be resolved)
- The new branch is created at `origin/<from-branch>` (or the local ref if remote is unavailable)

---

## FAQ

**Why a separate worktree skill instead of just `git worktree add`?**
Because the per-checkout setup matters — `.env` copying, `mise`/`direnv` trust, `.gitignore` management. Plain `git worktree add` leaves you with a tree that doesn't run.

**Why is `direnv allow` skipped on review branches?**
Because `.envrc` can source other files that direnv doesn't validate. Auto-trusting an external contributor's `.envrc` is the same shape of mistake as auto-running their setup script. The skill skips `direnv allow` on review branches and prints the manual command — you review the diff, then trust if appropriate.

**What if the worktree was created without `.env*` files?**
Run `cp .env* .worktrees/<branch>/` from the main repo (not from inside the worktree, since branch names often contain slashes that confuse relative paths from inside).

**How do I clean up a worktree?**
`cd "$(git rev-parse --show-toplevel)"` to leave the worktree, then `git worktree remove .worktrees/<branch>`. If the branch was deleted upstream, `/ce-clean-gone-branches` handles worktree-and-branch cleanup together.

**Why `.worktrees/<branch>` and not somewhere else?**
Predictability. Tooling that scans for worktrees, tab-completion, branch-to-path lookup all benefit from one canonical location. The directory is gitignored so it doesn't pollute git status.

**Does it work for branches that don't exist on the remote yet?**
Yes — the new branch is created locally at the resolved base ref. The skill fetches `origin/<from-branch>` to be current, but doesn't require the new branch name to already exist on the remote.

---

## See Also

- [`/ce-work`](./ce-work.md) — calls this skill at Phase 1.2 when the user picks worktree mode for parallel features
- [`/ce-code-review`](./ce-code-review.md) — recommends worktree for review concurrent with browser tests
- [`/ce-clean-gone-branches`](./ce-clean-gone-branches.md) — cleans up worktrees and branches together when the remote tracking branch is gone
