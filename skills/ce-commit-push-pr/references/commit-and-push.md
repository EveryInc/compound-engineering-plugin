# Committing and pushing

If `references/stack-submit.md` already built and committed the stack layers before this step, skip the ordinary single-branch commit and push and continue to Step 4 (compose the PR title and body); `gh stack submit` in Step 5 (apply and report) pushes the stack.

If you are on the default branch, creating the feature branch has to handle three things: a stale local `<base>`, unpushed commits on local `<base>`, and uncommitted changes that collide with the fresh remote base. Read `references/branch-creation.md` and follow its decision flow before continuing.

Scan changed files for naturally distinct concerns. If they clearly group into separate logical changes, create separate commits (2-3 max). Group at file level only — no `git add -p`. When ambiguous, one commit is fine.

Stage and commit each group. **Avoid `git add -A` and `git add .`** — they sweep in `.env`, build artifacts, and generated files. **Honor `exclude:<paths>` when the invocation carries it.** The caller names files that must stay uncommitted, typically the user's own in-progress edits it could not separate from its work. Never stage or commit them, and say in the report that they were left out. When a plan Implementation Unit ID is already in hand for this commit (conversation, caller, or the files belong to one unit), append that unit's U-ID in parentheses — `(U3)` means unit 3. Do not hunt for a plan. Omit when the commit spans units, the unit is unclear, or no plan is in hand.

```bash
git add file1 file2 file3 && git commit -m "$(cat <<'EOF'
commit message here
EOF
)" -- file1 file2 file3
```

The trailing path list on `git commit` matters. A bare `git commit` takes the whole index, so anything already staged before this run (a caller's `exclude:` paths, or work the user staged and did not name) would end up in the commit. Naming the paths commits exactly the group and leaves other index entries alone.

Then apply the **Project publishing gate**. Immediately before pushing, re-confirm you are on the intended feature branch with `git branch --show-current`. The branch gathered in Context is a hint, and Step 1 (resolve branch and PR state) may have created or switched branches since. Push the live `HEAD` so it reflects the current checkout, never a stale branch name:

```bash
git push -u origin HEAD
```

If the working tree is clean and all commits are already pushed, this step is a no-op.
