# `agent-browser` Driver

Read this file only after the run has selected `agent-browser`. That happens when the host has no built-in browser that can cover this run's matrix.

## Bootstrap

Verify the direct CLI is installed. Use the direct binary, never `npx agent-browser`.

```bash
command -v agent-browser >/dev/null 2>&1 && echo "Ready" || echo "NOT INSTALLED"
```

If it is missing, stop as the skill's Prerequisites section says. Otherwise load the workflow and troubleshooting guide that matches the installed CLI before the first browser action:

```bash
agent-browser skills get core
```

If the CLI exists but cannot launch its browser, follow that guide's troubleshooting and report the exact launch failure. Do not report a launch error as a missing CLI.

## Commands this skill relies on

Pass `--headed` so the user can watch the run, unless the machine has no display to show it on. Give each test user its own `--session <name>` so logins never leak between users.

```bash
SHOTS="$(mktemp -d "${TMPDIR:-/tmp}/ce-dogfood-XXXXXX")"   # once per run; reuse for every screenshot

agent-browser --headed open "http://localhost:${PORT}/<route>"
agent-browser snapshot -i            # interactive elements with refs
agent-browser click @e1
agent-browser fill @e2 "value"
agent-browser screenshot "$SHOTS/<scenario>.png"
agent-browser errors                 # page errors
agent-browser console                # console log
agent-browser set viewport 390 844   # phone width
agent-browser network route "<url>" --abort   # simulate a failed request
agent-browser --session viewer open "http://localhost:${PORT}/<route>"
```

Refs from `snapshot -i` go stale after navigation; snapshot again before the next interaction. Use the core guide for any command not shown here.
