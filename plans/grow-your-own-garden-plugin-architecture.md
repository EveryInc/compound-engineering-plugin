# Grow Your Own Garden: Adaptive Agent Ecosystem

> **Issue:** https://github.com/EveryInc/compound-engineering-plugin/issues/20

## The Idea

Everyone grows their own garden, but we're all using the same process.

Start from a **seed** (minimal core: `/plan`, `/work`, `/review`, `/compound`). Each `/compound` loop can suggest adding agents based on what you're working on—like building up a test suite to prevent regressions, but for code review expertise.

## Current Problem

- Monolithic plugin: 24 agents, users use ~30%
- No personalization (same agents for Rails dev and Python dev)
- Static collection that doesn't adapt

## Proposed Solution

### The Seed (Core Plugin)

4 commands + minimal agents:

| Component | What's Included |
|-----------|-----------------|
| Commands | `/plan`, `/work`, `/review`, `/compound` |
| Review Agents | security, performance, simplicity, architecture, patterns |
| Research Agents | best-practices, framework-docs, git-history, repo-analyst |
| Skills | compound-docs, file-todos, git-worktree |
| MCP Servers | playwright, context7 |

### The Growth Loop

After each `/compound`:

```
✅ Learning documented

💡 It looks like you're using Rails.
   Would you like to add the "DHH Rails Reviewer"?

   [y] Yes  [n] No  [x] Never ask
```

Three sources of new agents:
1. **Predefined** - "You're using Rails, add DHH reviewer?"
2. **Dynamic** - "You're using actor model, create an expert?"
3. **Custom** - "Want to create an agent for this pattern?"

### Agent Storage

```
.claude/agents/       → Project-specific (highest priority)
~/.claude/agents/     → User's garden
plugin/agents/        → From installed plugins
```

## Implementation Phases

### Phase 1: Split the Plugin
- Create `agent-library/` with framework-specific agents (Rails, Python, TypeScript, Frontend)
- Keep `compound-engineering` as core with universal agents
- No breaking changes—existing users unaffected

### Phase 2: Agent Discovery
- `/review` discovers agents from all three locations
- Project agents override user agents override plugin agents

### Phase 3: Growth via /compound
- Detect tech stack (Gemfile, package.json, etc.)
- Suggest relevant agents after documenting learnings
- Install accepted agents to `~/.claude/agents/`

### Phase 4: Management
- `/agents list` - See your garden
- `/agents add <name>` - Add from library
- `/agents disable <name>` - Temporarily disable

## What Goes Where

**Core (seed):** 11 framework-agnostic agents
- security-sentinel, performance-oracle, code-simplicity-reviewer
- architecture-strategist, pattern-recognition-specialist
- 4 research agents, 2 workflow agents

**Agent Library:** 10 specialized agents
- Rails: kieran-rails, dhh-rails, data-integrity (3)
- Python: kieran-python (1)
- TypeScript: kieran-typescript (1)
- Frontend: julik-races, design-iterator, design-reviewer, figma-sync (4)
- Editorial: every-style-editor (1)

## Key Constraint

Claude Code doesn't support plugin dependencies. Each plugin must be independent. Users manually install what they need, or we suggest additions via `/compound`.

## Acceptance Criteria

- [ ] Core plugin works standalone with universal agents
- [ ] `/compound` suggests agents based on detected tech stack
- [ ] Users can accept/decline suggestions
- [ ] `/agents` command for garden management
- [ ] No breaking changes for existing users
