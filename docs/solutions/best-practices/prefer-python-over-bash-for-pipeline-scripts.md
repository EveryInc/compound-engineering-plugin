---
title: "Prefer Python over bash for multi-step pipeline scripts"
date: 2026-04-09
last_refreshed: 2026-09-02
category: best-practices
module: "skill scripting"
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - Script orchestrates 2+ external CLI tools (ffmpeg, curl, silicon, vhs)
  - Script needs retry logic or graceful degradation on tool failure
  - Script will run on macOS where bash 3.2 is the default
  - Script needs to be tested from a non-shell test runner (Bun, Jest, pytest)
  - Script has conditional failure paths where some errors should be caught and others should abort
tags:
  - bash-vs-python
  - pipeline-scripts
  - skill-scripting
  - set-e-footguns
  - error-handling
---

# Prefer Python over bash for multi-step pipeline scripts

A bash pipeline script in a since-removed skill hit four distinct bug classes over four review rounds. None was a coding slip; each is inherent to bash's execution model, so the same four recur in any bash script that chains external CLIs with error handling.

| Trap | Cause | Bash workaround (easy to forget) |
|---|---|---|
| `url=$(curl ...)` exits the script on network failure, before retry logic runs | `set -e` + command substitution | `\|\| true` on every line that may fail |
| `${array[-1]}` fails | macOS default bash 3.2 lacks negative indexing | `${array[${#array[@]}-1]}` |
| Frame reduction kept all frames for n=3,4 | Integer math `step=(n-1)/2` floored to 1 | Explicit minimum step |
| `command -v ffmpeg` fails when spawned from Bun tests | `command` is a shell builtin, not an executable | Use `which` |

In Python each disappears: `subprocess.run(..., check=False)` with an explicit `returncode` branch and `except subprocess.TimeoutExpired`, `frames[-1]`, `max(2, (n - 1) // 2)`, `shutil.which("ffmpeg")`.

## When to apply

Use Python when the script orchestrates 2+ external tools, needs retry or graceful degradation, must run under bash 3.2, is driven from a non-shell test runner, or has more than ~3 subcommands.

Bash is still right for simple sequential scripts where `set -e` is the whole error policy, one-liner wrappers around a single tool, POSIX-only scripts with no arrays, and git hooks or CI steps whose only failure mode is "abort".

Interpreter resolution for Python scripts is its own rule: see `docs/solutions/conventions/resolve-python-interpreter-not-python3.md`.

## Related

- `docs/solutions/agent-friendly-cli-principles.md`: exit-code contract from the consumer side
