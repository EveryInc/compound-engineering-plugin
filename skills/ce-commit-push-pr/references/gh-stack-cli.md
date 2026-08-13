# `gh stack` semantics this skill relies on

Verified against `gh stack version 0.1.0`. `gh stack <command> --help` is authoritative — if it
disagrees with anything here, follow `--help` and say so in your report. (`gh stack help <command>`
does not work; it prints top-level help.)

Only the behavior that changes a decision in stack mode is listed. This file is self-contained on
purpose: do not depend on the user having a separate `gh-stack` skill installed.

## Classifying a parent

```bash
gh stack checkout "<parent-pr-number>"
```

Resolve a parent by **PR number** whenever one exists — that is what pulls a stack down from
GitHub. A bare branch name resolves against **local** stacks only, so a branch-only parent can be
classified locally and no further.

Branch on the exit code; status text goes to stderr and must not be parsed.

| Exit | Meaning | What it means here |
|---|---|---|
| 0 | Success | Parent is in a stack, and `HEAD` has moved to it |
| 2 | Not in a stack | Parent is standalone; nothing was checked out or fetched |
| 5 | Invalid arguments | Fix the invocation; see `--help` |
| 6 | Disambiguation required | Branch is in several stacks — check out a non-shared branch |
| 9 | Stacked PRs unavailable | Not enabled on this repository; tell the user and stop |

```bash
gh stack view --json    # JSON on stdout: trunk, currentBranch,
                        # branches[] { name, head, base, isCurrent, isMerged, needsRebase,
                        #              pr { number, url, state } }
```

`base` is the parent SHA the branch was last known to contain, not the parent's current tip;
`needsRebase` is true when that tip is no longer an ancestor. There is no field naming the top of
the stack and no documented branch ordering, so do not derive position from this payload — use
`add`'s exit 5 instead.

## Resolving a PR head

`gh pr view "<n>" --json headRefName,headRefOid,author` identifies the head; `headRefName` alone
does not, because a same-repo name can be absent or stale locally and can collide with an unrelated
branch. Create a local branch at `headRefOid`, fetching `refs/pull/<n>/head` when that commit is not
reachable — reachability leaves the commit with no branch to name.

## Building

```bash
gh stack init [--base "<trunk>"] "<branch>"...
```

Processes branches bottom to top and checks out the **last** one. **Existing branches are adopted;
missing ones are created** — the first from the trunk, each later one from the branch before it.
There is no separate adopt mode: existence decides. `--base` selects a non-default trunk, so a
parent branch can serve as the trunk without joining the stack.

```bash
gh stack add "<branch>"
```

Must run from the **top** branch of the stack (or the trunk while it is still empty); anywhere else
exits **5**. Exit 5 here means "you are not on the top", and moving there with `gh stack top` is a
decision, not a fix: it changes which layer the new branch is parented to. Whether that is correct
belongs to the caller — when a specific parent was named, it is not. Without `-Am`, `add` does not
touch the working tree, so staged and unstaged changes follow onto the new branch.

```bash
gh stack submit --auto [--open]
```

`--auto` avoids a title prompt per new PR. `--open` creates PRs ready for review instead of drafts,
and also marks pre-existing drafts ready.

## Never

- **`gh stack link`** — GitHub-only by design, creates no local tracking, so a later
  `gh stack submit`, `gh stack view`, or `gh stack merge` will not see the layer. It exists for
  branches managed by external tools (jj, Sapling, git-town).
- **`gh pr merge`** on a stack member — it cannot merge a stack. Landing uses `gh stack merge`.
- **Bare `view` / `submit` / `init` / `add` / `checkout`** — each prompts or opens a TUI that
  blocks under a PTY. Always pass the arguments and flags shown above.
