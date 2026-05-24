# Branch creation from default branch

Local `<base>` may have stale commits (another session/worktree advanced it) or commits the user authored intending to branch from later. Local git can't distinguish these — ask when unpushed commits are present.

## Decision flow

### 1. Fetch fresh remote base

```bash
git fetch --no-tags origin <base>
```

If fetch fails (network, auth, no remote), use the fallback at the bottom.

### 2. Check for unpushed local commits on `<base>`

```bash
git log origin/<base>..HEAD --oneline
```

- **Empty output:** set `BASE_REF=origin/<base>` and proceed to step 3.
- **Non-empty output:** show the commit list and ask (per the "Asking the user" convention in `SKILL.md`):

  > "Local `<base>` has N unpushed commits not on `origin/<base>`. Carry them onto the new feature branch, or leave them on local `<base>`?"

  - **Carry forward** → `BASE_REF=HEAD`. The new branch starts from local HEAD, preserving the commits.
  - **Leave on `<base>`** → `BASE_REF=origin/<base>`. The new branch starts clean; commits remain on local `<base>`.

  Never default silently — carrying foreign commits into a PR is worse than asking again.

### 3. Create the feature branch

```bash
git checkout -b <branch-name> "$BASE_REF"
```

If checkout fails because uncommitted changes would be overwritten, stash and retry:

```bash
git stash push -u -m "ce-commit-push-pr: pre-branch <branch-name>"
git checkout -b <branch-name> "$BASE_REF"
git stash pop
```

If `git stash pop` reports conflicts, surface the conflict output and the stash ref to the user — do not auto-resolve.

## Fetch failure fallback

If `git fetch` fails, branch from current local HEAD:

```bash
git checkout -b <branch-name>
```

Note in the user-facing summary that base freshness was not verified. Skip the unpushed-commits check — without a fresh `origin/<base>`, the answer is unreliable.
