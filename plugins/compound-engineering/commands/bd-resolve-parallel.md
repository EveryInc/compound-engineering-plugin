---
name: bd-resolve-parallel
description: Resolve bd issues in parallel using graph-optimized execution
argument-hint: "[pattern|--all-ready]"
---

# bd Parallel Resolution

Resolve bd issues in parallel using bv's execution plan for optimal ordering.

## Workflow

### 1. Get Ready Issues

```bash
bd ready --json
```

If `$ARGUMENTS` contains a pattern, filter:
```bash
bd list --status open --json | jq '.[] | select(.title | contains("pattern"))'
```

### 2. Get Execution Plan

```bash
bv --robot-plan
```

Parse the plan to identify:
- **Parallel tracks:** Independent work streams
- **Sequential chains:** Dependencies within tracks
- **Blocking issues:** What each issue unblocks

### 3. Present Plan

```markdown
## Execution Plan

**Total Issues:** [N]
**Parallel Tracks:** [M]
**Estimated Parallelism:** [M] agents can work simultaneously

### Track Breakdown

**Track 1:**
- bd-xxx: [Title] (ready)
  → bd-aaa: [Title] (blocked by bd-xxx)

**Track 2:**
- bd-yyy: [Title] (ready)
  → bd-ccc: [Title] (blocked by bd-yyy)

**Track 3 (Independent):**
- bd-zzz: [Title] (ready)
```

### 4. User Confirmation

Ask:
```
Proceed with parallel resolution?
1. yes - resolve all ready issues
2. select - choose specific issues
3. preview - see more details first
```

### 5. Spawn Parallel Agents

For all ready issues in each track, spawn agents in parallel:

```
# Track 1 + Track 2 + Track 3 ready items in parallel:
Task bd-issue-resolver(bd-xxx): "Resolve issue bd-xxx: [title]"
Task bd-issue-resolver(bd-yyy): "Resolve issue bd-yyy: [title]"
Task bd-issue-resolver(bd-zzz): "Resolve issue bd-zzz: [title]"
```

**IMPORTANT:** Launch ALL ready issues at once using parallel Task calls.

### 6. Monitor Progress

As agents complete:
- Track which issues are resolved
- Identify newly unblocked issues
- Report progress to user

### 7. Handle Next Wave

After first wave completes, check for newly ready issues:

```bash
bd ready --json
```

If more issues are now unblocked:
```
Wave 1 complete: 3/3 resolved

Newly unblocked issues:
- bd-aaa: [Title]
- bd-ccc: [Title]

Continue with Wave 2? (yes/no)
```

Spawn next wave of agents.

### 8. Commit Changes

After all resolutions:

```bash
git add .
git add .beads/issues.jsonl
git status
```

Present commit summary:
```markdown
## Resolution Complete

**Resolved:** [N] issues
**Files Changed:** [M]

### Changes by Issue

- **bd-xxx:** Fixed [description]
  - `app/models/user.rb`: Added validation
  - `test/models/user_test.rb`: Added tests

- **bd-yyy:** Fixed [description]
  - `app/controllers/posts_controller.rb`: Fixed N+1

### Ready to Commit

```bash
git commit -m "fix: resolve [N] issues from code review

- bd-xxx: [brief]
- bd-yyy: [brief]

Generated with [Claude Code](https://claude.com/claude-code)"
```
```

### 9. Final Summary

```markdown
## Parallel Resolution Complete

**Total Resolved:** [N] issues
**Waves:** [M]
**Still Open:** [X] issues (if any)

### Resolution Report

| ID | Status | Summary |
|----|--------|---------|
| bd-xxx | Resolved | Fixed validation |
| bd-yyy | Resolved | Fixed N+1 query |

### Remaining Work

If issues remain:
```bash
bd list --status open --json
```

### Next Steps

1. Push changes: `git push`
2. Check remaining: `/bd-status`
3. Run tests: `bin/rails test`
```

## Agent Orchestration Pattern

The key is parallel execution:

```
# CORRECT - All at once
Task bd-issue-resolver(bd-xxx): "..."
Task bd-issue-resolver(bd-yyy): "..."
Task bd-issue-resolver(bd-zzz): "..."

# WRONG - Sequential
Task bd-issue-resolver(bd-xxx): "..."
[wait]
Task bd-issue-resolver(bd-yyy): "..."
[wait]
```

## Error Handling

If an agent fails:
1. Report the failure
2. Keep the issue open
3. Continue with other issues
4. Present failure details in summary

```markdown
### Failed Resolutions

- **bd-xxx:** Failed - [error reason]
  - Issue remains open
  - May need manual intervention
```

## Integration

Works with:
- `/bd-triage` - Creates issues to resolve
- `/bd-plan` - Provides execution plan
- `bd-issue-resolver` agent - Does actual work
- `/workflows:review` - Source of findings
