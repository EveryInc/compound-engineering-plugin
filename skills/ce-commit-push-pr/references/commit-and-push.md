# Committing and pushing

If the stack reference constructed and committed retrospective layers before this step, skip ordinary single-branch commit/push and continue to Step 4; `gh stack submit` in Step 5 pushes the stack.

If on the default branch, branch creation needs to handle stale local `<base>`, unpushed commits on local `<base>`, and uncommitted changes that collide with the fresh remote base. Read `references/branch-creation.md` and follow its decision flow before continuing.

Scan changed files for naturally distinct concerns. If they clearly group into separate logical changes, create separate commits (2-3 max). Group at file level only — no `git add -p`. When ambiguous, one commit is fine.

Stage and commit each group. **Avoid `git add -A` and `git add .`** — they sweep in `.env`, build artifacts, and generated files. **Honor `exclude:<paths>` when the invocation carries it:** a caller names files that must stay uncommitted (typically a user's own in-progress edits it could not separate from its work); never stage or commit them, and say in the report that they were left out. When a plan Implementation Unit ID is already in hand for this commit (conversation, caller, or the files belong to one unit), append that unit's U-ID in parentheses — `(U3)` means unit 3. Do not hunt for a plan. Omit when the commit spans units, the unit is unclear, or no plan is in hand.

```bash
git add file1 file2 file3 && git commit -m "$(cat <<'EOF'
commit message here
EOF
)" -- file1 file2 file3
```

The trailing path list on `git commit` is load-bearing: a bare `git commit` takes the whole index, so anything already staged before this run (a caller's `exclude:` paths, or work the user staged and did not name) would ride into the commit. Naming the paths commits exactly the group and leaves other index entries alone.

Then push. Immediately before pushing, re-confirm you are on the intended feature branch (`git branch --show-current`) — the branch gathered in Context is a hint, and Step 1 may have created or switched branches since. Push the live `HEAD` so it reflects the current checkout, never a stale branch name:

```bash
git push -u origin HEAD
```

If the working tree is clean and all commits are already pushed, this step is a no-op.
