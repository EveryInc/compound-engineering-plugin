# Targeted Mode

Read this reference when Mode Detection (in SKILL.md) routes to **Targeted Mode** — a specific comment or thread URL was provided. Targeted mode addresses only that thread.

## 1. Extract Thread Context

Parse the URL to extract OWNER, REPO, PR number, and comment REST ID:
```
https://github.com/OWNER/REPO/pull/NUMBER#discussion_rCOMMENT_ID
```

**Step 1** -- Get comment details and GraphQL node ID via REST (cheap, single comment):
```bash
gh api repos/OWNER/REPO/pulls/comments/COMMENT_ID \
  --jq '{node_id, path, line, body}'
```

**Step 2** -- Map comment to its thread ID. Use [scripts/get-thread-for-comment](../scripts/get-thread-for-comment):
```bash
if [ -n "${CLAUDE_SKILL_DIR}" ] && [ -f "${CLAUDE_SKILL_DIR}/scripts/get-thread-for-comment" ]; then
  SCRIPT_DIR="${CLAUDE_SKILL_DIR}/scripts"
else
  echo "ce-resolve-pr-feedback bundled scripts are unavailable in this harness; use Full Mode's fallback gh commands to inspect the PR comments." >&2
  exit 1
fi

bash "$SCRIPT_DIR/get-thread-for-comment" PR_NUMBER COMMENT_NODE_ID [OWNER/REPO]
```

This fetches thread IDs and their first comment IDs (minimal fields, no bodies) and returns the matching thread with full comment details.

## 2. Fix, Reply, Resolve

Read `references/agents/pr-comment-resolver.md` and spawn a single generic subagent seeded with that resolver prompt for the thread. Do not dispatch a standalone agent by type/name. Pass the same fields full mode does, including `isOutdated` and the location fields (`line`, `originalLine`, `startLine`, `originalStartLine`) -- targeted threads can be outdated too and need the same relocation handling. Then follow the same validate -> commit -> push -> reply -> resolve flow as Full Mode steps 5-7 (in `references/full-mode.md`).
