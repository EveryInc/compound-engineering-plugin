---
name: setup
description: Configure compound-engineering environment. Checks dependencies, offers guided installation, and helps resolve environment issues. Review agent selection is handled automatically by ce:review.
disable-model-invocation: true
---

# Compound Engineering Setup

## Interaction Method

Ask the user each question below using the platform's blocking question tool (e.g., `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no structured question tool is available, present each question as a numbered list and wait for a reply before proceeding. For multiSelect questions, accept comma-separated numbers (e.g. `1, 3`). Never skip or auto-configure.

Interactive setup for compound-engineering — checks environment dependencies and helps configure required tools. Review agent selection is handled automatically by `ce:review`; project-specific review guidance belongs in `CLAUDE.md` or `AGENTS.md`.

## Phase 1: Dependencies & Environment

### Step D1: Run Diagnostics

Load the `doctor` skill and run it to produce an environment health report. This checks CLI dependencies, MCP servers, environment variables, plugin version, and .gitignore.

Display the diagnostic report to the user.

### Step D2: Evaluate Results

After the diagnostic report, check whether any installable dependencies are missing (items with an **Install** field in the registry that were reported as missing).

If everything is installed and all recommended env vars are set, display:

```
Environment healthy -- all dependencies found.
Review agent selection is automatic in ce:review.
Setup complete.
```

Stop here.

If any installable dependencies are missing, proceed to Step D3.

### Step D3: Offer Installation

Present the missing installable dependencies grouped by tier using a multiSelect question. Pre-select recommended items. Do not include detect-only items (those are informational only from doctor).

```
The following tools are missing. Select which to install:
(Recommended items are pre-selected)

Recommended:
  [x] agent-browser - Browser automation for testing and screenshots
  [x] gh - GitHub CLI for issues and PRs
  [x] jq - JSON processor

Optional:
  [ ] rtk - Token optimization CLI (60-90% savings)
  [ ] ffmpeg - Video/GIF creation for feature walkthroughs
  [ ] ctx7 - Library documentation CLI
```

Only show dependencies that are actually missing. Omit installed ones and detect-only items.

For context7/ctx7: if the context7 MCP server is available (detected in Step D1), do not offer ctx7 CLI installation -- the MCP server covers its functionality.

### Step D4: Install Selected Dependencies

For each selected dependency, in order:

1. **Show the install command** and ask for approval:

   ```
   Install agent-browser?
   Command: npm install -g agent-browser && agent-browser install

   1. Run this command
   2. Skip - I'll install it manually
   ```

2. **If approved:** Run the install command using a shell execution tool. After the command completes, verify installation by running the dependency's check command (e.g., `command -v agent-browser`).

3. **If verification succeeds:** Report success and check for related env vars.

4. **If verification fails or install errors:** Display the project URL as fallback:

   ```
   Installation did not succeed. Install manually:
   https://github.com/nichochar/agent-browser
   ```

   Continue to the next dependency.

5. **If the dependency has a Post-install step** (from the registry): Display it as guidance after successful install.

### Step D5: Configure Environment Variables (Per-Dependency)

Immediately after each successful dependency installation, check whether that dependency has related env vars (from the registry) that are not set.

If unset env vars exist for the just-installed dependency, prompt:

```
CONTEXT7_API_KEY is not set.
This key prevents rate limiting for Context7.

Enter your API key (or type "skip" to set it later):
```

If the user provides a value, advise where to persist it:

```
To persist this, add to your shell profile (~/.zshrc or ~/.bashrc):
  export CONTEXT7_API_KEY="the-value"

Or add it to your agent's environment settings.
```

If the user skips, continue without error.

### Step D6: Remaining Environment Variables

After all dependency installs are complete, check for any env vars from the registry's Environment Variables section that are still unset and were not already prompted in Step D5.

If any remain unset, prompt for each one with context about what it does and where to get it (from the registry's **How to get** field).

If all env vars are set, skip this step silently.

### Step D7: Dependency Phase Summary

Display a brief summary:

```
Dependencies configured.
  Installed: agent-browser, gh, jq
  Skipped:   rtk
  Env vars:  CONTEXT7_API_KEY (set)

Review agent selection is automatic in ce:review.
Project-specific review context belongs in CLAUDE.md or AGENTS.md.
```

## Future Use

This skill now focuses on environment and dependency setup. Future project-level configuration work can extend it without reintroducing review-agent selection.
