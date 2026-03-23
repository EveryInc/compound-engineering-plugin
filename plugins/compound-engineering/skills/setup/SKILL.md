---
name: setup
description: Configure which review agents run for your project. Auto-detects stack and writes compound-engineering.local.md.
disable-model-invocation: true
---

# Compound Engineering Setup

## Interaction Method

Ask the user each question below using the platform's blocking question tool (e.g., `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no structured question tool is available, present each question as a numbered list and wait for a reply before proceeding. For multiSelect questions, accept comma-separated numbers (e.g. `1, 3`). Never skip or auto-configure.

Interactive setup for `compound-engineering.local.md` — configures which agents run during `ce:review` and `ce:work`.

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
     Re-run this setup anytime to reconfigure.
```
