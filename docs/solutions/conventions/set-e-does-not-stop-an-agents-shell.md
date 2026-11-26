---
title: "`set -e` does not stop a chain of commands in an agent's shell"
date: 2026-11-25
category: conventions
module: "shell commands agents run, and fenced blocks in skills"
problem_type: convention
component: tooling
severity: high
applies_when:
  - "Chaining a publish, push or delete after steps that must succeed"
  - "Writing a shell block that a skill tells an agent to run"
tags: [shell, errexit, agents, publishing]
---

# `set -e` does not stop a chain of commands in an agent's shell

## Context

A multi-line command began with `set -e`, hit a merge conflict, and went on to publish files that held conflict markers. `set -e` was on and did not stop it.

## Guidance

Claude Code runs a command roughly as `eval '<command>' && <bookkeeping>`. Both bash and zsh ignore errexit for everything on the left of `&&`, including inside `eval`. Measured 2026-11-25 in a Claude Code session on macOS, where `$-` contained `e` and the last line still ran:

```bash
set -e
false
echo reached
```

The same text run by plain `bash -c` or `zsh -c` stops at `false`, so trying it that way shows the opposite. Other harnesses were not measured.

Make each step depend on the one before it with `&&` or `|| exit 1`, or put the chain in a script file and run that file. A script run as its own process keeps its own `set -e`. Before something irreversible, check its input directly (for a publish, that no conflict marker is in the files).

`tests/skill-shell-safety.test.ts` refuses errexit in a skill's fenced blocks. Nothing mechanical covers a command an agent composes itself.

## When to Apply

Any agent-run command where a later line must not run after an earlier one fails. Retire this when the measurement above stops at `false`.
