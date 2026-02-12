---
name: compound-engineering-setup
description: Configure review agents for your project
disable-model-invocation: true
---

# Compound Engineering Setup

Create a `compound-engineering.local.md` settings file with review agent defaults for this project.

## Step 1: Check Existing Config

Read `compound-engineering.local.md`. If it exists, display the current contents and use AskUserQuestion:

**Question:** "Settings file already exists. What would you like to do?"
**Options:**
1. **Regenerate with new defaults** — Overwrite with fresh auto-detected defaults
2. **View and edit** — Open the file for manual editing
3. **Cancel** — Keep current settings

If "View and edit": show the file contents and remind user to edit it directly.
If "Cancel": stop.

## Step 2: Detect Project Type

```bash
test -f Gemfile && test -f config/routes.rb && echo "rails" || \
test -f Gemfile && echo "ruby" || \
test -f tsconfig.json && echo "typescript" || \
test -f package.json && echo "javascript" || \
test -f pyproject.toml && echo "python" || \
test -f requirements.txt && echo "python" || \
echo "general"
```

## Step 3: Write Settings File

Create `compound-engineering.local.md` using the Write tool with defaults for the detected project type:

**Rails:**
```markdown
---
review_agents: [kieran-rails-reviewer, dhh-rails-reviewer, code-simplicity-reviewer, security-sentinel, performance-oracle]
plan_review_agents: [kieran-rails-reviewer, code-simplicity-reviewer]
---
```

**Python:**
```markdown
---
review_agents: [kieran-python-reviewer, code-simplicity-reviewer, security-sentinel, performance-oracle]
plan_review_agents: [kieran-python-reviewer, code-simplicity-reviewer]
---
```

**TypeScript:**
```markdown
---
review_agents: [kieran-typescript-reviewer, code-simplicity-reviewer, security-sentinel, performance-oracle]
plan_review_agents: [kieran-typescript-reviewer, code-simplicity-reviewer]
---
```

**General:**
```markdown
---
review_agents: [code-simplicity-reviewer, security-sentinel, performance-oracle]
plan_review_agents: [code-simplicity-reviewer, architecture-strategist]
---
```

Always append this body after the frontmatter:

```markdown

# Review Context

Add project-specific review instructions here.
These notes are available to all review agents during /workflows:review.
```

## Step 4: Confirm

Display:

```
Settings saved to compound-engineering.local.md

Detected: {project_type}
Review agents: {agent list}
Plan review agents: {agent list}

Edit the file anytime to add/remove agents or add review context.
Run /workflows:review to use your configured agents.
```
