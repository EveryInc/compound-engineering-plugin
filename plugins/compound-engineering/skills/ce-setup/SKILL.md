---
name: ce-setup
description: "Diagnose and configure compound-engineering environment. Checks CLI dependencies, plugin version, and repo-local config. Offers guided installation for missing tools. Use when troubleshooting missing tools, verifying setup, or before onboarding."
disable-model-invocation: true
---

# Compound Engineering Setup

## Interaction Method

Ask the user each question below using the platform's blocking question tool (e.g., `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no structured question tool is available, present each question as a numbered list and wait for a reply before proceeding. For multiSelect questions, accept comma-separated numbers (e.g. `1, 3`). Never skip or auto-configure.

Interactive setup for compound-engineering — diagnoses environment health, cleans obsolete repo-local CE config, and helps configure required tools. Review agent selection is handled automatically by `ce-code-review`; project-specific review guidance belongs in `CLAUDE.md` or `AGENTS.md`.

## Phase 1: Diagnose

### Step 1: Determine Plugin Version

Detect the installed compound-engineering plugin version by reading the plugin metadata or manifest. This is platform-specific -- use whatever mechanism is available (e.g., reading `plugin.json` from the plugin root or cache directory). If the version cannot be determined, skip this step.

If a version is found, pass it to the check script via `--version`. Otherwise omit the flag.

### Step 2: Run the Health Check Script

Before running the script, display: "Compound Engineering -- checking your environment..."

Run the bundled check script. Do not perform manual dependency checks -- the script handles all CLI tools, repo-local CE file checks, and `.gitignore` guidance in one pass.

```bash
bash scripts/check-health --version VERSION
```

Or without version if Step 1 could not determine it:

```bash
bash scripts/check-health
```

Script reference: `scripts/check-health`

Display the script's output to the user.

### Step 3: Evaluate Results

**Platform detection (pre-resolved):** !`[ -n "${CLAUDE_PLUGIN_ROOT}" ] && echo "CLAUDE_CODE" || echo "OTHER"`

If the line above resolved to `CLAUDE_CODE`, this is a Claude Code session and `/ce-update` is available. Otherwise, omit any `/ce-update` references from output.

After the diagnostic report, check whether:

- any dependencies are missing (reported as yellow in the script output)
- `compound-engineering.local.md` is present and needs cleanup
- `.compound-engineering/config.local.yaml` does not exist or is not safely gitignored
- `.compound-engineering/config.local.example.yaml` is missing or outdated

If everything is installed, no repo-local cleanup is needed, and `.compound-engineering/config.local.yaml` already exists and is gitignored, display the tool list and completion message. Parse the tool names from the script output and list each with a green circle:

```
 ✅ Compound Engineering setup complete

    Tools: 🟢 agent-browser  🟢 gh  🟢 jq  🟢 vhs  🟢 silicon  🟢 ffmpeg
    Config: ✅

    Run /ce-setup anytime to re-check.
```

If this is a Claude Code session, append to the message: "Run /ce-update to grab the latest plugin version."

Stop here.

Otherwise proceed to Phase 2 to resolve any issues. Handle repo-local cleanup (Step 4) first, then config bootstrapping (Step 5), then missing dependencies (Step 6).

## Phase 2: Fix

### Step 4: Resolve Repo-Local CE Issues

Resolve the repository root (`git rev-parse --show-toplevel`). If `compound-engineering.local.md` exists at the repo root, explain that it is obsolete because review-agent selection is automatic and CE now uses `.compound-engineering/config.local.yaml` for any surviving machine-local state. Ask whether to delete it now. Use the repo-root path when deleting.

### Step 5: Bootstrap Project Config

Resolve the repository root (`git rev-parse --show-toplevel`). All paths below are relative to the repo root, not the current working directory.

**Example file (always refresh):** Copy `references/config-template.yaml` to `<repo-root>/.compound-engineering/config.local.example.yaml`, creating the directory if needed. This file is committed to the repo and always overwritten with the latest template so teammates can see available settings.

**Local config (create once):** If `.compound-engineering/config.local.yaml` does not exist, ask whether to create it:

```
Set up a local config file for this project?
This saves your Compound Engineering preferences (like which tools to use and how workflows behave).
Everything starts commented out -- you only enable what you need.

1. Yes, create it (Recommended)
2. No thanks
```

If the user approves, copy `references/config-template.yaml` to `<repo-root>/.compound-engineering/config.local.yaml`. If `.compound-engineering/config.local.yaml` is not already covered by `.gitignore`, offer to add the entry:

```text
.compound-engineering/*.local.yaml
```

If the local config already exists, check whether it is safely gitignored. If not, offer to add the `.gitignore` entry as above.

### Step 6: Offer Installation

Present the missing dependencies using a multiSelect question with all items pre-selected. Use the install commands and URLs from the script's diagnostic output.

```
The following tools are missing. Select which to install:
(All items are pre-selected)

Recommended:
  [x] agent-browser - Browser automation for testing and screenshots
  [x] gh - GitHub CLI for issues and PRs
  [x] jq - JSON processor
  [x] vhs (charmbracelet/vhs) - Create GIFs from CLI output
  [x] silicon (Aloxaf/silicon) - Generate code screenshots
  [x] ffmpeg - Video processing for feature demos
```

Only show dependencies that are actually missing. Omit installed ones.

### Step 7: Install Selected Dependencies

For each selected dependency, in order:

1. **Show the install command** (from the diagnostic output) and ask for approval:

   ```
   Install agent-browser?
   Command: CI=true npm install -g agent-browser --no-audit --no-fund --loglevel=error && agent-browser install && npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser -g -y

   1. Run this command
   2. Skip - I'll install it manually
   ```

2. **If approved:** Run the install command using a shell execution tool. After the command completes, verify installation by running the dependency's check command (e.g., `command -v agent-browser`).

3. **If verification succeeds:** Report success.

4. **If verification fails or install errors:** Display the project URL as fallback and continue to the next dependency.

### Step 8: Summary

Display a brief summary:

```
 ✅ Compound Engineering setup complete

    Installed: agent-browser, gh, jq
    Skipped:   rtk

    Run /ce-setup anytime to re-check.
```

If this is a Claude Code session (per platform detection in Step 3), append: "Run /ce-update to grab the latest plugin version."
