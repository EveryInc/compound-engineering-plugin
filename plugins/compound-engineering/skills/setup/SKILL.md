---
name: setup
description: Configure compound-engineering environment and review agents. Checks dependencies, offers guided installation, auto-detects stack, and writes compound-engineering.local.md.
disable-model-invocation: true
---

# Compound Engineering Setup

## Interaction Method

Ask the user each question below using the platform's blocking question tool (e.g., `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no structured question tool is available, present each question as a numbered list and wait for a reply before proceeding. For multiSelect questions, accept comma-separated numbers (e.g. `1, 3`). Never skip or auto-configure.

Interactive setup for compound-engineering — checks environment dependencies, then configures which agents run during `ce:review` and `ce:work`.

---

## Phase 1: Dependencies & Environment

### Step D1: Run Diagnostics

Load the `doctor` skill and run it to produce an environment health report. This checks CLI dependencies, MCP servers, environment variables, plugin version, and .gitignore.

Display the diagnostic report to the user.

### Step D2: Evaluate Results

After the diagnostic report, check whether any installable dependencies are missing (items with an **Install** field in the registry that were reported as missing).

If everything is installed and all recommended env vars are set, display:

```
Environment healthy -- all dependencies found.
Proceeding to review agent configuration.
```

Skip to Phase 2 (Step 1).

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

Proceeding to review agent configuration.
```

---

## Phase 2: Review Agent Configuration

### Step 1: Check Existing Config

Read `compound-engineering.local.md` in the project root. If it exists, display current settings and ask:

```
Settings file already exists. What would you like to do?

1. Reconfigure - Run the interactive setup again from scratch
2. View current - Show the file contents, then stop
3. Cancel - Keep current settings
```

If "View current": read and display the file, then stop.
If "Cancel": stop.

## Step 2: Detect and Ask

Auto-detect the project stack:

```bash
test -f Gemfile && test -f config/routes.rb && echo "rails" || \
test -f Gemfile && echo "ruby" || \
test -f tsconfig.json && echo "typescript" || \
test -f package.json && echo "javascript" || \
test -f pyproject.toml && echo "python" || \
test -f requirements.txt && echo "python" || \
echo "general"
```

Ask:

```
Detected {type} project. How would you like to configure?

1. Auto-configure (Recommended) - Use smart defaults for {type}. Done in one click.
2. Customize - Choose stack, focus areas, and review depth.
```

### If Auto-configure → Skip to Step 4 with defaults:

- **Rails:** `[kieran-rails-reviewer, dhh-rails-reviewer, code-simplicity-reviewer, security-sentinel, performance-oracle]`
- **Python:** `[kieran-python-reviewer, code-simplicity-reviewer, security-sentinel, performance-oracle]`
- **TypeScript:** `[kieran-typescript-reviewer, code-simplicity-reviewer, security-sentinel, performance-oracle]`
- **General:** `[code-simplicity-reviewer, security-sentinel, performance-oracle, architecture-strategist]`

### If Customize → Step 3

## Step 3: Customize (3 questions)

**a. Stack** — confirm or override:

```
Which stack should we optimize for?

1. {detected_type} (Recommended) - Auto-detected from project files
2. Rails - Ruby on Rails, adds DHH-style and Rails-specific reviewers
3. Python - Adds Pythonic pattern reviewer
4. TypeScript - Adds type safety reviewer
```

Only show options that differ from the detected type.

**b. Focus areas** — multiSelect (user picks one or more):

```
Which review areas matter most? (comma-separated, e.g. 1, 3)

1. Security - Vulnerability scanning, auth, input validation (security-sentinel)
2. Performance - N+1 queries, memory leaks, complexity (performance-oracle)
3. Architecture - Design patterns, SOLID, separation of concerns (architecture-strategist)
4. Code simplicity - Over-engineering, YAGNI violations (code-simplicity-reviewer)
```

**c. Depth:**

```
How thorough should reviews be?

1. Thorough (Recommended) - Stack reviewers + all selected focus agents.
2. Fast - Stack reviewers + code simplicity only. Less context, quicker.
3. Comprehensive - All above + git history, data integrity, agent-native checks.
```

## Step 4: Build Agent List and Write File

**Stack-specific agents:**
- Rails → `kieran-rails-reviewer, dhh-rails-reviewer`
- Python → `kieran-python-reviewer`
- TypeScript → `kieran-typescript-reviewer`
- General → (none)

**Focus area agents:**
- Security → `security-sentinel`
- Performance → `performance-oracle`
- Architecture → `architecture-strategist`
- Code simplicity → `code-simplicity-reviewer`

**Depth:**
- Thorough: stack + selected focus areas
- Fast: stack + `code-simplicity-reviewer` only
- Comprehensive: all above + `git-history-analyzer, data-integrity-guardian, agent-native-reviewer`

**Plan review agents:** stack-specific reviewer + `code-simplicity-reviewer`.

Write `compound-engineering.local.md`:

```markdown
---
review_agents: [{computed agent list}]
plan_review_agents: [{computed plan agent list}]
---

# Review Context

Add project-specific review instructions here.
These notes are passed to all review agents during ce:review and ce:work.

Examples:
- "We use Turbo Frames heavily — check for frame-busting issues"
- "Our API is public — extra scrutiny on input validation"
- "Performance-critical: we serve 10k req/s on this endpoint"
```

## Step 5: Confirm

```
Saved to compound-engineering.local.md

Stack:        {type}
Review depth: {depth}
Agents:       {count} configured
              {agent list, one per line}

Tip: Edit the "Review Context" section to add project-specific instructions.
     Run /doctor anytime to check environment health.
     Re-run this setup anytime to reconfigure.
```
