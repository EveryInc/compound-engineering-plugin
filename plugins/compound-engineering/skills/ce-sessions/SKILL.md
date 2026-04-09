---
name: ce-sessions
description: "Search and ask questions about your coding agent session history. Use when asking what you worked on, what was tried before, how a problem was investigated across sessions, what happened recently, or any question about past agent sessions. Also use when the user references prior sessions, previous attempts, or past investigations — even without saying 'sessions' explicitly."
---

# /ce-sessions

Search your session history.

## Usage

```
/ce-sessions [question or topic]
/ce-sessions
```

## Pre-resolved context

**Repo name (pre-resolved):** !`common=$(git rev-parse --git-common-dir 2>/dev/null); if [ "$common" = ".git" ]; then basename "$(git rev-parse --show-toplevel 2>/dev/null)"; else basename "$(dirname "$common")"; fi`

**Git branch (pre-resolved):** !`git rev-parse --abbrev-ref HEAD 2>/dev/null`

If the lines above resolved to plain values (a folder name like `my-repo` and a branch name like `feat/my-branch`), they are ready to pass to the agent. If they still contain backtick command strings or are empty, they did not resolve — omit them from the dispatch and let the agent derive them at runtime.

## Execution

If no argument is provided, ask what the user wants to know about their session history. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, ask in plain text and wait for a reply.

Dispatch `compound-engineering:research:session-historian` with the user's question as the task prompt. Omit the `mode` parameter so the user's configured permission settings apply. Include in the dispatch prompt:

- The user's question
- The current working directory
- The repo name and git branch from pre-resolved context (only if they resolved to plain values — do not pass literal command strings)
