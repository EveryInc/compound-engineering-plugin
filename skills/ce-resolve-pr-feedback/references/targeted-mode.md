# Targeted Mode

Read this reference when Mode Detection (in SKILL.md) routes to **Targeted Mode** — a specific comment or thread URL was provided. Targeted mode addresses only that thread.

## 1. Extract Thread Context

Parse the URL to extract HOST, OWNER, REPO, PR number, and comment REST ID:
```
https://HOST/OWNER/REPO/pull/NUMBER#discussion_rCOMMENT_ID
```

**GitHub Enterprise host.** Take the host from the URL (targeted mode is always URL-triggered). When it is **not** `github.com`, pass it as a `GH_HOST=<host>` env prefix inline on **every** `gh api` / bundled-script call below (`gh api` honors `GH_HOST` as the request host) so an enterprise thread is fetched, replied to, and resolved on the right host instead of `github.com`. On `github.com`, drop the `GH_HOST=<host> ` prefix. Carry the same host into the reply/resolve calls you run from Full Mode steps 5-7.

**Step 1** -- Get comment details and GraphQL node ID via REST (cheap, single comment):
```bash
GH_HOST=<host> gh api repos/OWNER/REPO/pulls/comments/COMMENT_ID \
  --jq '{node_id, path, line, body}'   # omit GH_HOST=<host> on github.com
```

**Step 2** -- Map comment to its thread ID. Use [scripts/get-thread-for-comment](../scripts/get-thread-for-comment). Set `SKILL_DIR` to the absolute directory you loaded the ce-resolve-pr-feedback SKILL.md from — the Bash tool's CWD is the user's project, not the skill dir, and shell state does not persist between Bash calls, so set it inline. If the bundled script is missing, use Full Mode's fallback `gh` commands to inspect the PR comments:
```bash
SKILL_DIR="<absolute path of the directory containing the ce-resolve-pr-feedback SKILL.md>";
GH_HOST=<host> bash "$SKILL_DIR/scripts/get-thread-for-comment" PR_NUMBER COMMENT_NODE_ID [OWNER/REPO]
```

This fetches thread IDs and their first comment IDs (minimal fields, no bodies) and returns the matching thread with full comment details.

## 2. Judge, Fix, Reply, Resolve

**Judge first (the gate).** Apply the rubric in `references/evaluation-rubric.md` to this one thread, in your own context. Account for `isOutdated` and the location fields (`line`, `originalLine`, `startLine`, `originalStartLine`) -- targeted threads can be outdated too and need the same relocation handling. The cross-item reasoning in the rubric is a no-op for a single thread, but the read-depth and divert logic apply in full: deep-read (callers, invariants, `git blame`/PR rationale for author intent) before accepting a contestable finding or overriding code that looks deliberate. This is the legitimacy check — don't fix on the reviewer's authority alone.

**Then act on the verdict:**

- **`fixed` / `fixed-differently`** — read `references/agents/pr-comment-resolver.md` and spawn a single generic subagent seeded with that fixer prompt to implement it. Do not dispatch a standalone agent by type/name. Pass the file/location fields (resolved location or anchor if outdated), the comment text, and your note on what to change and why it's valid. The fixer is a pure executor.
- **`replied` / `not-addressing` / `declined`** — no subagent. Compose the reply text per the rubric and proceed to reply/resolve.
- **`needs-human`** — compose `decision_context` and the natural-sounding reply per the rubric, leave the thread open (don't resolve), and present the decision to the user (use the platform's blocking question tool as in Full Mode step 9). The shared reply step below posts the reply once — do not post it here.

Then follow the same validate -> commit -> push -> reply -> resolve flow as Full Mode steps 5-7 (in `references/full-mode.md`). Skip validate/commit when no code changed.
