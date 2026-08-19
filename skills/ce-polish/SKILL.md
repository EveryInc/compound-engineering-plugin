---
name: ce-polish
description: "Polish a working feature through user-directed live browser feedback. Use when a functional feature needs focused UX refinement before shipping."
disable-model-invocation: true
argument-hint: "[PR number, branch name, or blank for current branch]"
---

# Polish

Put a working feature in front of the user and turn their live observations into focused UX fixes on the running page.

**Done:** the user ends the polish loop, every requested fix is reflected in the live feature or reported as blocked, and the in-scope changes are saved in local commit(s). A server or checkout blocker also ends the run when it is reported with the evidence needed to resume.

**Boundaries:** the user drives what to inspect and change; do not invent an autonomous checklist or expand into general QA. Never work on the repository's default branch. This workflow may edit and locally commit the requested polish, but it never pushes or opens a PR.

## Run

1. **Get the live page ready.** Read `references/run.md` before resolving the requested ref or starting anything. It owns existing-worktree safety, dev-server discovery, the bundled-script calls, reachability, and the browser handoff.
2. **Wait for observations.** Tell the user where the server is running and ask what could be better. Do not start a review pass while they browse.
3. **Iterate.** For each requested change, inspect only as needed, edit the in-scope surface, and let hot reload update the page. When the user asks you to inspect the result, use a browser capability available in the active harness; if none exists, ask them to describe what they see.
4. **Close locally.** When the user says they are done, invoke `ce-commit` for the polish changes, then report the commit(s), the still-running server URL, and any residual blocker.
