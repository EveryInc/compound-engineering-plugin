# `agent-browser` Fallback Driver

Read this file only after the main skill selects `agent-browser` because no qualifying host-native integrated browser is available.

## Bootstrap

Verify the direct CLI is installed:

```bash
command -v agent-browser >/dev/null 2>&1 && echo "Ready" || echo "NOT INSTALLED"
```

If it is missing, tell the user: "`agent-browser` is not installed. Use the `ce-setup` skill to print the current install command, then install `agent-browser` and retry." Then stop. An installed discovery skill does not imply that the CLI or its browser runtime is installed.

Before running browser actions, load the workflow and troubleshooting content that matches the installed CLI:

```bash
agent-browser skills get core
```

If the CLI exists but cannot launch its browser, follow the current core troubleshooting instructions and report the exact launch failure. Do not misreport a missing browser runtime or launch error as a missing CLI.

## Commands Used by This Skill

Add `--headed` to commands when manual mode selected a visible browser. Pipeline mode defaults this fallback driver to headless.

```bash
# Navigate and inspect
agent-browser open <url>
agent-browser snapshot -i

# Interact using refs from the latest snapshot
agent-browser click @e1
agent-browser fill @e1 "text"
agent-browser type @e1 "text"
agent-browser press Enter

# Capture evidence
agent-browser screenshot out.png
agent-browser screenshot --full out-full.png

# Navigation and waits
agent-browser back
agent-browser wait @e1
```

Use the installed core documentation for console-error inspection and any command not shown here. Do not switch to another browser driver after the first route is tested.
