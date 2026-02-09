---
name: reproduce-bug
description: Reproduce and investigate a bug using logs, console inspection, and browser screenshots
argument-hint: "[GitHub issue number]"
disable-model-invocation: true
---

# Reproduce Bug Command

<command_purpose>Reproduce and investigate a bug using logs, console inspection, and browser screenshots via agent-browser CLI.</command_purpose>

## CRITICAL: Use agent-browser CLI Only

**DO NOT use Chrome MCP tools (mcp__claude-in-chrome__*).**

This command uses the `agent-browser` CLI exclusively. The agent-browser CLI is a Bash-based tool from Vercel that runs headless Chromium. It is NOT the same as Chrome browser automation via MCP.

If you find yourself calling `mcp__claude-in-chrome__*` tools, STOP. Use `agent-browser` Bash commands instead.

## Prerequisites

<requirements>
- Local development server running (e.g., `bin/dev`, `rails server`, `npm run dev`)
- agent-browser CLI installed (see Setup below)
- Git repository with the bug to investigate
</requirements>

### Setup

**Check installation:**
```bash
command -v agent-browser >/dev/null 2>&1 && echo "Installed" || echo "NOT INSTALLED"
```

**Install if needed:**
```bash
npm install -g agent-browser
agent-browser install  # Downloads Chromium (~160MB)
```

### Verify agent-browser Installation

Before starting ANY browser-based reproduction, verify agent-browser is installed:

```bash
command -v agent-browser >/dev/null 2>&1 && echo "Ready" || (echo "Installing..." && npm install -g agent-browser && agent-browser install)
```

If installation fails, inform the user and stop.

Look at github issue #$ARGUMENTS and read the issue description and comments.

## Phase 1: Log Investigation

Run the following agents in parallel to investigate the bug:

1. Task rails-console-explorer(issue_description)
2. Task appsignal-log-investigator(issue_description)

Think about the places it could go wrong looking at the codebase. Look for logging output we can look for.

Run the agents again to find any logs that could help us reproduce the bug.

Keep running these agents until you have a good idea of what is going on.

## Phase 2: Visual Reproduction with Playwright

If the bug is UI-related or involves user flows, use Playwright to visually reproduce it:

### Step 1: Verify Server is Running

```bash
agent-browser open "http://localhost:3000"
agent-browser snapshot -i
```

If server not running, inform user to start `bin/dev`.

### Step 2: Navigate to Affected Area

Based on the issue description, navigate to the relevant page:

```bash
agent-browser open "http://localhost:3000/[affected_route]"
agent-browser snapshot -i
```

### Step 3: Capture Screenshots

Take screenshots at each step of reproducing the bug:

```bash
agent-browser screenshot "bug-[issue]-step-1.png"
```

### Step 4: Follow User Flow

Reproduce the exact steps from the issue:

1. **Read the issue's reproduction steps**
2. **Execute each step using agent-browser CLI:**
   - `agent-browser click @ref` for clicking elements (use refs from snapshot)
   - `agent-browser fill @ref "text"` for filling forms
   - `agent-browser snapshot -i` to see the current state and get element refs
   - `agent-browser screenshot "step-N.png"` to capture evidence

3. **Check for errors:**
   ```bash
   agent-browser snapshot -i  # Check for visible error states, error messages, or red indicators
   ```
   Note: agent-browser does not have a direct console log API. Instead, check for visible error states in the snapshot output (error banners, validation messages, 500 pages, etc.).

### Step 5: Capture Bug State

When you reproduce the bug:

1. Take a screenshot of the bug state
2. Check for visible error states via snapshot
3. Document the exact steps that triggered it

```bash
agent-browser screenshot "bug-[issue]-reproduced.png"
```

## Phase 3: Document Findings

**Reference Collection:**

- [ ] Document all research findings with specific file paths (e.g., `app/services/example_service.rb:42`)
- [ ] Include screenshots showing the bug reproduction
- [ ] List console errors if any
- [ ] Document the exact reproduction steps

## Phase 4: Report Back

Add a comment to the issue with:

1. **Findings** - What you discovered about the cause
2. **Reproduction Steps** - Exact steps to reproduce (verified)
3. **Screenshots** - Visual evidence of the bug (upload captured screenshots)
4. **Relevant Code** - File paths and line numbers
5. **Suggested Fix** - If you have one

## agent-browser CLI Reference

**ALWAYS use these Bash commands. NEVER use mcp__claude-in-chrome__* tools.**

```bash
# Navigation
agent-browser open <url>           # Navigate to URL
agent-browser back                 # Go back
agent-browser close                # Close browser

# Snapshots (get element refs)
agent-browser snapshot -i          # Interactive elements with refs (@e1, @e2, etc.)
agent-browser snapshot -i --json   # JSON output

# Interactions (use refs from snapshot)
agent-browser click @e1            # Click element
agent-browser fill @e1 "text"      # Fill input
agent-browser type @e1 "text"      # Type without clearing
agent-browser press Enter          # Press key

# Screenshots
agent-browser screenshot out.png       # Viewport screenshot
agent-browser screenshot --full out.png # Full page screenshot

# Headed mode (visible browser)
agent-browser --headed open <url>      # Open with visible browser
agent-browser --headed click @e1       # Click in visible browser

# Wait
agent-browser wait @e1             # Wait for element
agent-browser wait 2000            # Wait milliseconds
```

**Console error detection workaround:** agent-browser does not have a direct console log API. Instead, check for visible error states in the snapshot output (error banners, validation messages, 500 pages, red indicators, etc.). Use `agent-browser snapshot -i` after each action to inspect the page for error states.
