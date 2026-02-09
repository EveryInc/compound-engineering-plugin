---
title: Reduce compound-engineering plugin context token usage
type: refactor
date: 2026-02-08
---

# Reduce compound-engineering Plugin Context Token Usage

## Overview

The compound-engineering plugin is **overflowing the default context budget by ~3x**, causing Claude Code to silently drop components. The plugin consumes ~50,500 characters in always-loaded descriptions against a default budget of 16,000 characters (2% of context window). This means Claude literally doesn't know some agents/skills exist during sessions.

## Problem Statement

### How Context Loading Works

Claude Code uses progressive disclosure for plugin content:

| Level | What Loads | When |
|-------|-----------|------|
| **Always in context** | `description` frontmatter from skills, commands, and agents | Session startup (unless `disable-model-invocation: true`) |
| **On invocation** | Full SKILL.md / command body / agent body | When triggered |
| **On demand** | Reference files in skill directories | When Claude reads them |

The total budget for ALL descriptions combined is **2% of context window** (~16,000 chars fallback). When exceeded, components are **silently excluded**.

### Current State: 316% of Budget

| Component | Count | Always-Loaded Chars | % of 16K Budget |
|-----------|------:|--------------------:|----------------:|
| Agent descriptions | 29 | ~41,400 | 259% |
| Skill descriptions | 16 | ~5,450 | 34% |
| Command descriptions | 24 | ~3,700 | 23% |
| **Total** | **69** | **~50,500** | **316%** |

### Root Cause: Bloated Agent Descriptions

Agent `description` fields contain full `<example>` blocks with user/assistant dialog. These examples belong in the agent body (system prompt), not the description. The description's only job is **discovery** — helping Claude decide whether to delegate.

Examples of the problem:

- `design-iterator.md`: 2,488 chars in description (should be ~200)
- `spec-flow-analyzer.md`: 2,289 chars in description
- `security-sentinel.md`: 1,986 chars in description
- `kieran-rails-reviewer.md`: 1,822 chars in description
- Average agent description: ~1,400 chars (should be 100-250)

Compare to Anthropic's official examples at 100-200 chars:

```yaml
# Official (140 chars)
description: Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code.

# Current plugin (1,822 chars)
description: "Use this agent when you need to review Rails code changes with an extremely high quality bar...\n\nExamples:\n- <example>\n  Context: The user has just implemented..."
```

### Secondary Cause: No `disable-model-invocation` on Manual Commands

Zero commands set `disable-model-invocation: true`. Commands like `/deploy-docs`, `/lfg`, `/slfg`, `/triage`, `/feature-video`, `/test-browser`, `/xcode-test` are manual workflows with side effects. Their descriptions consume budget unnecessarily.

The official docs explicitly state:
> Use `disable-model-invocation: true` for workflows with side effects: `/deploy`, `/commit`, `/triage-prs`. You don't want Claude deciding to deploy because your code looks ready.

---

## Proposed Solution

Three changes, ordered by impact:

### Phase 1: Trim Agent Descriptions (saves ~35,600 chars)

For all 29 agents: move `<example>` blocks from the `description` field into the agent body markdown. Keep descriptions to 1-2 sentences (100-250 chars).

**Before** (agent frontmatter):
```yaml
---
name: kieran-rails-reviewer
description: "Use this agent when you need to review Rails code changes with an extremely high quality bar. This agent should be invoked after implementing features, modifying existing code, or creating new Rails components. The agent applies Kieran's strict Rails conventions and taste preferences to ensure code meets exceptional standards.\n\nExamples:\n- <example>\n  Context: The user has just implemented a new controller action with turbo streams.\n  user: \"I've added a new update action to the posts controller\"\n  ..."
---

Detailed system prompt...
```

**After** (agent frontmatter):
```yaml
---
name: kieran-rails-reviewer
description: Review Rails code with Kieran's strict conventions. Use after implementing features, modifying code, or creating new Rails components.
---

<examples>
<example>
Context: The user has just implemented a new controller action with turbo streams.
user: "I've added a new update action to the posts controller"
...
</example>
</examples>

Detailed system prompt...
```

The examples move into the body (which only loads when the agent is actually invoked).

**Impact:** ~41,400 chars → ~5,800 chars (86% reduction)

### Phase 2: Add `disable-model-invocation: true` to Manual Commands (saves ~3,100 chars)

Commands that should only run when explicitly invoked by the user:

| Command | Reason |
|---------|--------|
| `/deploy-docs` | Side effect: deploys |
| `/release-docs` | Side effect: regenerates docs |
| `/changelog` | Side effect: generates changelog |
| `/lfg` | Side effect: autonomous workflow |
| `/slfg` | Side effect: swarm workflow |
| `/triage` | Side effect: categorizes findings |
| `/resolve_parallel` | Side effect: resolves TODOs |
| `/resolve_todo_parallel` | Side effect: resolves todos |
| `/resolve_pr_parallel` | Side effect: resolves PR comments |
| `/feature-video` | Side effect: records video |
| `/test-browser` | Side effect: runs browser tests |
| `/xcode-test` | Side effect: builds/tests iOS |
| `/reproduce-bug` | Side effect: runs reproduction |
| `/report-bug` | Side effect: creates bug report |
| `/agent-native-audit` | Side effect: runs audit |
| `/heal-skill` | Side effect: modifies skill files |
| `/generate_command` | Side effect: creates files |
| `/create-agent-skill` | Side effect: creates files |

Keep these **without** the flag (Claude should know about them):
- `/workflows:plan` — Claude might suggest planning
- `/workflows:work` — Claude might suggest starting work
- `/workflows:review` — Claude might suggest review
- `/workflows:brainstorm` — Claude might suggest brainstorming
- `/workflows:compound` — Claude might suggest documenting
- `/deepen-plan` — Claude might suggest deepening a plan

**Impact:** ~3,700 chars → ~600 chars for commands in context

### Phase 3: Add `disable-model-invocation: true` to Manual Skills (saves ~1,000 chars)

Skills that are manual workflows:

| Skill | Reason |
|-------|--------|
| `skill-creator` | Only invoked manually |
| `orchestrating-swarms` | Only invoked manually |
| `git-worktree` | Only invoked manually |
| `resolve-pr-parallel` | Side effect |
| `compound-docs` | Only invoked manually |
| `file-todos` | Only invoked manually |

Keep without the flag (Claude should auto-invoke):
- `dhh-rails-style` — Claude should use when writing Rails code
- `frontend-design` — Claude should use when building UI
- `brainstorming` — Claude should suggest before implementation
- `agent-browser` — Claude should use for browser tasks
- `gemini-imagegen` — Claude should use for image generation
- `create-agent-skills` — Claude should use when creating skills
- `every-style-editor` — Claude should use for editing
- `dspy-ruby` — Claude should use for DSPy.rb
- `agent-native-architecture` — Claude should use for agent-native design
- `andrew-kane-gem-writer` — Claude should use for gem writing
- `rclone` — Claude should use for cloud uploads
- `document-review` — Claude should use for doc review

**Impact:** ~5,450 chars → ~4,000 chars for skills in context

---

## Projected Result

| Component | Before (chars) | After (chars) | Reduction |
|-----------|---------------:|-------------:|-----------:|
| Agent descriptions | ~41,400 | ~5,800 | -86% |
| Command descriptions | ~3,700 | ~600 | -84% |
| Skill descriptions | ~5,450 | ~4,000 | -27% |
| **Total** | **~50,500** | **~10,400** | **-79%** |
| **% of 16K budget** | **316%** | **65%** | -- |

From 316% of budget (components silently dropped) to 65% of budget (room for growth).

---

## Acceptance Criteria

- [x] All 29 agent description fields are under 250 characters
- [x] All `<example>` blocks moved from description to agent body
- [x] 18 manual commands have `disable-model-invocation: true`
- [x] 6 manual skills have `disable-model-invocation: true`
- [x] Total always-loaded description content is under 16,000 characters
- [ ] Run `/context` to verify no "excluded skills" warnings
- [x] All agents still function correctly (examples are in body, not lost)
- [x] All commands still invocable via `/command-name`
- [x] Update plugin version in plugin.json and marketplace.json
- [x] Update CHANGELOG.md

## Implementation Notes

- Agent examples should use `<examples><example>...</example></examples>` tags in the body — Claude understands these natively
- Description format: "[What it does]. Use [when/trigger condition]." — two sentences max
- The `lint` agent at 115 words shows compact agents work great
- Test with `claude --plugin-dir ./plugins/compound-engineering` after changes
- The `SLASH_COMMAND_TOOL_CHAR_BUDGET` env var can override the default budget for testing

## References

- [Skills docs](https://code.claude.com/docs/en/skills) — "Skill descriptions are loaded into context... If you have many skills, they may exceed the character budget"
- [Subagents docs](https://code.claude.com/docs/en/sub-agents) — description field used for automatic delegation
- [Skills troubleshooting](https://code.claude.com/docs/en/skills#claude-doesnt-see-all-my-skills) — "The budget scales dynamically at 2% of the context window, with a fallback of 16,000 characters"
