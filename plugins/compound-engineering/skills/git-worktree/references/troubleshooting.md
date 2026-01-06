# Troubleshooting Reference

## Common Issues

### "Worktree already exists"

The script will ask if switching to the existing worktree is preferred.

### "Cannot remove worktree: it is the current worktree"

Switch out of the worktree first (to main repo), then cleanup:

```bash
cd $(git rev-parse --show-toplevel)
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
```

### Lost in a worktree?

Check current location and available worktrees:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh list
```

Navigate back to main:

```bash
cd $(git rev-parse --show-toplevel)
```

### .env files missing in worktree?

If a worktree was created without .env files (e.g., via raw `git worktree add`), copy them:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh copy-env feature-name
```

## Advanced Troubleshooting

### Worktree branch conflicts

If a branch already exists from a previous worktree:

```bash
# Delete orphaned branch
git branch -D feature-name

# Then create worktree again
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create feature-name
```

### Locked worktree

If git reports a worktree is locked:

```bash
git worktree unlock .worktrees/feature-name
```

### Stale worktree entries

Clean up stale entries from deleted directories:

```bash
git worktree prune
```
