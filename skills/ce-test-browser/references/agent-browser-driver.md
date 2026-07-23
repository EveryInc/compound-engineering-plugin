# `agent-browser` Fallback Driver

Read this file only after the main skill selects `agent-browser` because no qualifying host-native integrated browser is available.

## Bootstrap

Verify the direct CLI is installed with `command -v agent-browser`. If it is missing, tell the user: "`agent-browser` is not installed. Use the `ce-setup` skill to print the current install command, then install `agent-browser` and retry." Then stop. An installed discovery skill does not imply that the CLI or its browser runtime is installed.

Before running browser actions, load the workflow and troubleshooting content that matches the installed CLI — it is the authoritative, version-correct command reference:

```bash
agent-browser skills get core
```

If the CLI exists but cannot launch its browser, follow the current core troubleshooting instructions and report the exact launch failure. Do not misreport a missing browser runtime or launch error as a missing CLI.

## Command surface

Take the commands from the core docs above. Two notes for this skill's use of them:

- `agent-browser open <url>` followed by `agent-browser snapshot -i` is what yields the `@e1`-style refs that `click`, `fill`, `type`, and `wait` consume. Refs come from the latest snapshot, never from guessed selectors.
- Add `--headed` only when the user asked to watch the run; otherwise headless.
