---
name: setup
description: Configure review agents, implementation mode, and autopilot features for your project. Auto-detects stack and writes compound-engineering.local.md.
disable-model-invocation: true
---

# Compound Engineering Setup

## Interaction Method

Ask the user each question below using the platform's blocking question tool (e.g., `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no structured question tool is available, present each question as a numbered list and wait for a reply before proceeding. For multiSelect questions, accept comma-separated numbers (e.g. `1, 3`). Never skip or auto-configure.

Interactive setup for `compound-engineering.local.md` — configures which agents run during `ce:review` and `ce:work`, which implementation mode `lfg` should prefer by default, and which autopilot features are enabled for end-to-end workflows (`lfg`; `slfg` remains only as a legacy wrapper).

## Step 1: Check Existing Config

Read `compound-engineering.local.md` in the project root. If it exists, display current settings and ask:

```
Settings file already exists. What would you like to do?

1. Reconfigure - Run the interactive setup again from scratch
2. View current - Show the file contents, then stop
3. Cancel - Keep current settings
```

If "View current": read and display the file, then stop.
If "Cancel": stop.

When reconfiguring an existing file:
- Read and preserve the current `implementation_mode` unless the user explicitly changes it during setup
- If the existing file has no `implementation_mode`, treat the current value as `standard`

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

Auto-configure defaults for autopilot features: both `feature_video` and `test_browser` enabled.
Auto-configure defaults for implementation mode: preserve the existing `implementation_mode` when present; otherwise use `standard`.

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

## Step 3b: Implementation Mode

Ask only when the user chose the Customize path:

```
How should lfg handle implementation by default?

1. Standard (Recommended) - Normal ce:work execution. Can still use ordinary parallel helpers when appropriate.
2. Swarm - Prefer swarm / agent-team style implementation during the implementation gate.
```

If an existing file already has `implementation_mode`, show that option as the current value.

## Step 3c: Autopilot Features

Ask only when the user chose the Customize path (auto-configure silently defaults both to enabled):

```
When you run end-to-end workflows (lfg/slfg), the system can
automatically record feature videos and run browser tests.
Which of these would you like included? (comma-separated, e.g. 1, 2)

1. Feature video - Record a walkthrough and add it to PRs
2. Browser testing - Verify changes work in a real browser
```

Both are selected by default. If the user deselects both, set both to `false`. If the user selects only one, set the other to `false`.

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
implementation_mode: {existing value or chosen value, default standard}
autopilot_features:
  feature_video: {true or false}
  test_browser: {true or false}
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

Stack:            {type}
Review depth:     {depth}
Agents:           {count} configured
                  {agent list, one per line}
Autopilot:        feature video {on/off}, browser testing {on/off}
Implementation:  {standard or swarm}

Tip: Edit the "Review Context" section to add project-specific instructions.
     Re-run this setup anytime to reconfigure.
```
