---
name: setup
description: Configure which review agents run for your project. Auto-detects stack and writes compound-engineering.local.md.
disable-model-invocation: true
---

# Compound Engineering Setup

Interactive setup for `compound-engineering.local.md` — configures which agents run during `/workflows:review` and `/workflows:work`.

## Step 1: Check Existing Config

Read `compound-engineering.local.md` in the project root. If it exists, display current settings summary and use AskUserQuestion:

```
question: "Settings file already exists. What would you like to do?"
header: "Config"
options:
  - label: "Reconfigure"
    description: "Run the interactive setup again from scratch"
  - label: "View current"
    description: "Show the file contents, then stop"
  - label: "Cancel"
    description: "Keep current settings"
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

Use AskUserQuestion:

```
question: "Detected {type} project. How would you like to configure?"
header: "Setup"
options:
  - label: "Auto-configure (Recommended)"
    description: "Use smart defaults for {type}. Done in one click."
  - label: "Customize"
    description: "Choose stack, focus areas, and review depth."
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
question: "Which stack should we optimize for?"
header: "Stack"
options:
  - label: "{detected_type} (Recommended)"
    description: "Auto-detected from project files"
  - label: "Rails"
    description: "Ruby on Rails — adds DHH-style and Rails-specific reviewers"
  - label: "Python"
    description: "Python — adds Pythonic pattern reviewer"
  - label: "TypeScript"
    description: "TypeScript — adds type safety reviewer"
```

Only show options that differ from the detected type.

**b. Focus areas** — multiSelect:

```
question: "Which review areas matter most?"
header: "Focus"
multiSelect: true
options:
  - label: "Security"
    description: "Vulnerability scanning, auth, input validation (security-sentinel)"
  - label: "Performance"
    description: "N+1 queries, memory leaks, complexity (performance-oracle)"
  - label: "Architecture"
    description: "Design patterns, SOLID, separation of concerns (architecture-strategist)"
  - label: "Code simplicity"
    description: "Over-engineering, YAGNI violations (code-simplicity-reviewer)"
```

**c. Depth:**

```
question: "How thorough should reviews be?"
header: "Depth"
options:
  - label: "Thorough (Recommended)"
    description: "Stack reviewers + all selected focus agents."
  - label: "Fast"
    description: "Stack reviewers + code simplicity only. Less context, quicker."
  - label: "Comprehensive"
    description: "All above + git history, data integrity, agent-native checks."
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
These notes are passed to all review agents during /workflows:review and /workflows:work.

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

## Step 6: Foundations Check (optional)

Use AskUserQuestion:

```
question: "Would you like to audit your repo's foundations? Checks CLAUDE.md quality, conventions, tech debt tracking, and more."
header: "Foundations"
options:
  - label: "Yes (Recommended)"
    description: "Run tiered audit: CLAUDE.md quality, conventions, tech debt, architecture docs."
  - label: "Skip"
    description: "Finish setup without auditing foundations."
```

If "Skip": end setup.
If "Yes": explicitly load the foundations skill, then run its audit workflow:

1. Load skill: `skill: compound-foundations`
2. Invoke workflow: `workflows/audit-foundations.md`
3. After audit results are shown, use AskUserQuestion:

```
question: "Audit complete. Do you want to create all missing foundation files now?"
header: "Generate Files"
options:
  - label: "Create all missing (Recommended)"
    description: "Generate every missing artifact from compound-foundations templates."
  - label: "Choose files"
    description: "Select specific missing artifacts to generate."
  - label: "Skip"
    description: "Keep audit report only, no file generation."
```

If "Create all missing":
- Invoke `compound-foundations` workflow `workflows/generate-artifacts.md`
- Pass all missing artifacts from the audit scorecard
- Create files immediately in `docs/` (and `CLAUDE.md` only if missing)

If "Choose files":
- Invoke `compound-foundations` workflow `workflows/generate-artifacts.md`
- Generate only selected missing artifacts

If "Skip":
- End setup and keep the scorecard as follow-up guidance

Do not run foundations checks inline in `setup`; always delegate to the `compound-foundations` skill.
