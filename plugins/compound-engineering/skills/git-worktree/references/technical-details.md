# Technical Details Reference

## Directory Structure

```
.worktrees/
├── feature-login/          # Worktree 1
│   ├── .git
│   ├── app/
│   └── ...
├── feature-notifications/  # Worktree 2
│   ├── .git
│   ├── app/
│   └── ...
└── ...

.gitignore (updated to include .worktrees)
```

## How Worktrees Work

- Uses `git worktree add` for isolated environments
- Each worktree has its own branch
- Changes in one worktree do not affect others
- Shares git history with main repo
- Can push from any worktree

## Performance Characteristics

- Worktrees are lightweight (file system links)
- No repository duplication
- Shared git objects for efficiency
- Creation is faster than cloning or stashing/switching

## Automatic .env Handling

The manager script copies these files from main repo to new worktrees:
- `.env`
- `.env.local`
- `.env.test`
- `.env.development`
- `.env.production`
- Any other `.env*` files

## Integration with Git

Worktrees share:
- Git objects and history
- Remote configurations
- Git hooks

Worktrees maintain separately:
- Working directory files
- Index (staging area)
- Current branch/HEAD

## Cleanup Behavior

When cleaning up:
1. Lists all non-current worktrees
2. Confirms before removal
3. Removes worktree directory
4. Removes branch if fully merged
5. Prunes stale entries
