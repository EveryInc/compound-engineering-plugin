---
name: ce-setup
description: "Diagnose and configure compound-engineering environment. Checks CLI dependencies, plugin version, and repo-local config. Offers guided installation for missing tools. Use when troubleshooting missing tools, verifying setup, or before onboarding."
disable-model-invocation: true
---

# Compound Engineering Setup

## Interaction Method

Ask the user each question below using the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to presenting each question as a numbered list in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip or auto-configure. For multiSelect questions, accept comma-separated numbers (e.g. `1, 3`).

Interactive setup for compound-engineering: diagnose environment health, configure required tools. Review agent selection is handled by `ce-code-review`; project-specific review guidance belongs in `CLAUDE.md` or `AGENTS.md`.

## Phase 1: Diagnose

### Step 1: Determine Plugin Version

Detect the installed plugin version from the plugin metadata or manifest. This is platform-specific -- use whatever mechanism is available (e.g., reading `plugin.json` from the plugin root or cache directory). If the version cannot be determined, skip this step.

If a version is found, pass it to the check script via `--version`; otherwise omit the flag.

### Step 2: Run the Health Check Script

Before running the script, display: "Compound Engineering -- checking your environment..."

Run the bundled check script. Do not perform manual dependency checks -- the script handles all CLI tools, agent skills, repo-local CE file checks, and `.gitignore` guidance in one pass.

```bash
bash scripts/check-health --version VERSION
```

Or without version if Step 1 could not determine it:

```bash
bash scripts/check-health
```

Display the script's output to the user.

### Step 3: Evaluate Results

**Plugin root (pre-resolved):** !`echo "${CLAUDE_PLUGIN_ROOT}"`

If the line above resolved to an absolute path (starts with `/`, no `${`), this is a Claude Code session and `/ce-update` is available. Anything else — empty, the literal `${CLAUDE_PLUGIN_ROOT}` token, or an unresolved command string like `echo "${CLAUDE_PLUGIN_ROOT}"` left in place by a non-Claude harness that doesn't process `!` pre-resolution — means this is not Claude Code; omit any `/ce-update` references from output.

After the diagnostic report, check whether:

- any CLI tools are missing (yellow in the Tools section)
- any agent skills are missing (yellow in the Skills section)
- `.compound-engineering/config.local.yaml` does not exist or is not safely gitignored
- `.compound-engineering/config.local.example.yaml` is missing or outdated

If everything is installed and `.compound-engineering/config.local.yaml` exists and is gitignored, display the tool and skill list and completion message. Parse the tool and skill names from the script output and list each with a green circle. Omit the Skills line if that section is absent from the script output:

```
 ✅ Compound Engineering setup complete

    Tools:  🟢 agent-browser  🟢 gh  🟢 jq  🟢 vhs  🟢 silicon  🟢 ffmpeg  🟢 ast-grep
    Skills: 🟢 ast-grep
    Config: ✅

    Run /ce-setup anytime to re-check.
```

If this is a Claude Code session (**Plugin root** above resolved to a non-empty path), append: "Run /ce-update to grab the latest plugin version."

Stop here.

Otherwise proceed to Phase 2. Handle config bootstrapping (Step 4) first, then missing dependencies (Step 5).

## Phase 2: Fix

### Step 4: Bootstrap Project Config

Resolve the repository root (`git rev-parse --show-toplevel`). All paths below are relative to the repo root, not the current working directory.

**Example file (always refresh):** Copy `references/config-template.yaml` to `<repo-root>/.compound-engineering/config.local.example.yaml`, creating the directory if needed. This file is committed and always overwritten with the latest template so teammates can see available settings.

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

If the local config already exists, check whether it is safely gitignored. If not, offer the `.gitignore` entry as above.

### Step 5: Offer Installation

Present the missing tools and skills using a multiSelect question with all items pre-selected. Use the install commands and URLs from the script's diagnostic output. Group items under `Tools:` and `Skills:` so the user sees which runtime each targets; omit a group whose items are all installed.

```
The following items are missing. Select which to install:
(All items are pre-selected)

Tools:
  [x] agent-browser - Browser automation for testing and screenshots
  [x] gh - GitHub CLI for issues and PRs
  [x] jq - JSON processor
  [x] vhs (charmbracelet/vhs) - Create GIFs from CLI output
  [x] silicon (Aloxaf/silicon) - Generate code screenshots
  [x] ffmpeg - Video processing for feature demos
  [x] ast-grep - Structural code search using AST patterns

Skills:
  [x] ast-grep - Agent skill for structural code search with ast-grep
```

Only show missing items. Omit installed ones.

### Step 6: Install Selected Dependencies

For each selected dependency, in order:

1. **Show the install command** (from the diagnostic output) and ask for approval:

   ```
   Install agent-browser?
   Command: CI=true npm install -g agent-browser --no-audit --no-fund --loglevel=error && agent-browser install && npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser -g -y

   1. Run this command
   2. Skip - I'll install it manually
   ```

2. **If approved:** Run the install command via a shell execution tool. After it completes, verify installation:
   - For a CLI tool, run the dependency's check command (e.g., `command -v agent-browser`).
   - For an agent skill, prefer `npx --yes skills list --global --json | jq -r '.[].name' | grep -qx <skill-name>` when `npx` is available; otherwise check that `~/.claude/skills/<skill-name>`, `~/.agents/skills/<skill-name>`, or `~/.codex/skills/<skill-name>` exists (file, directory, or symlink).

3. **If verification succeeds:** Report success.

4. **If verification fails or install errors:** Display the project URL as fallback and continue to the next dependency.

### Step 7: Summary

Display a brief summary:

```
 ✅ Compound Engineering setup complete

    Installed: agent-browser, gh, jq
    Skipped:   rtk

    Run /ce-setup anytime to re-check.
```

If this is a Claude Code session (per Step 3 detection), append: "Run /ce-update to grab the latest plugin version."
