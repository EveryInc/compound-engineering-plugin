---
title: "fix: add explicit stdin piping guidance for Codex delegation"
type: fix
status: active
date: 2026-03-24
---

# fix: add explicit stdin piping guidance for Codex delegation

## Problem

When ce:work-beta delegates to Codex CLI, the skill says "piping the prompt file via stdin" but provides no concrete command example. The agent interprets this as a shell redirect:

```bash
codex --dangerously-bypass-approvals-and-sandbox < /tmp/codex_task_20980.txt 2>&1
```

This fails with:

```
Error: Exit code 1
Error: stdin is not a terminal
```

Codex CLI checks whether stdin is a terminal (likely `isatty()`) and rejects shell redirects (`< file`). A pipe (`cat file | codex`) works because it presents data differently to the process.

## Approach

In step 5 ("Delegate") of the External Delegate Mode section in `ce-work-beta/SKILL.md`, add:

1. A concrete command example using `cat file | codex ...`
2. An explicit warning that `< file` (shell redirect) does NOT work -- Codex rejects it with "stdin is not a terminal"
3. Keep the existing note about avoiding argv expansion for large prompts

## Files

- `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` -- step 5 of External Delegate Mode

## Acceptance Criteria

- [ ] Step 5 contains a concrete `cat ... | codex exec ...` command example with placeholder flags from step 2
- [ ] Explicit warning: shell redirects (`< file`) fail with "stdin is not a terminal"
- [ ] Existing guidance about avoiding argv expansion is preserved
