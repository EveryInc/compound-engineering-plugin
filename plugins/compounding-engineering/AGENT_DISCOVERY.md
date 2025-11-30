# Agent Discovery Mechanism

## Problem Statement

Currently, compounding-engineering agents are isolated from other agent sources:
- **Seth's wshobson/agents repo**: 87+ agents in `/Users/mitchdornich/Documents/GitHub/agents/plugins/`
- **Every marketplace**: Agents in `~/.claude/plugins/marketplaces/every-marketplace/`

There's no way for the compounding-engineering review workflow to dynamically discover and use agents from other sources.

## Proposed Solution: Agent Registry

### 1. Registry File Structure

Create a central registry that indexes available agents from all sources:

```
~/.claude/agents/
├── registry.json           # Master index of all agents
├── sources.json            # Agent source configurations
└── cache/                  # Cached agent metadata
```

### 2. Registry Schema

**sources.json** - Define agent sources:
```json
{
  "sources": [
    {
      "id": "compounding-engineering",
      "name": "Compounding Engineering",
      "path": "~/.claude/plugins/marketplaces/every-marketplace/plugins/compounding-engineering/agents/",
      "priority": 1,
      "active": true
    },
    {
      "id": "wshobson-agents",
      "name": "Seth's Agent Marketplace",
      "path": "~/Documents/GitHub/agents/plugins/*/agents/",
      "priority": 2,
      "active": true
    }
  ]
}
```

**registry.json** - Agent index:
```json
{
  "lastUpdated": "2024-11-30T15:00:00Z",
  "agents": [
    {
      "name": "fastapi-pro",
      "source": "compounding-engineering",
      "path": "~/.claude/.../agents/fastapi-pro.md",
      "description": "FastAPI expert...",
      "tags": ["python", "fastapi", "backend"],
      "stackMatch": ["FastAPI", "Python"]
    },
    {
      "name": "frontend-developer",
      "source": "compounding-engineering",
      "path": "~/.claude/.../agents/frontend-developer.md",
      "description": "Next.js/React expert...",
      "tags": ["nextjs", "react", "typescript", "frontend"],
      "stackMatch": ["Next.js", "TypeScript", "React"]
    }
  ]
}
```

### 3. Stack Matching

Each project has a stack profile (from skills like `stable-mischief-stack`). Agents declare which stacks they're relevant for:

```yaml
# In agent frontmatter
---
name: supabase-specialist
stackMatch:
  - Supabase
  - PostgreSQL
  - RLS
---
```

The review command can then:
1. Detect project stack from `package.json`, `requirements.txt`, etc.
2. Query registry for agents matching that stack
3. Run only relevant agents

### 4. CLI Commands (Future)

```bash
# Scan all sources and update registry
claude agents scan

# List available agents for current project stack
claude agents list --stack-match

# Search agents by keyword
claude agents search "database"

# Show agent details
claude agents show fastapi-pro
```

### 5. Implementation Plan

**Phase 1: Manual Registry** (Current)
- Copy relevant agents from Seth's repo to compounding-engineering
- Keep agents aligned with tech stack skill
- No dynamic discovery

**Phase 2: Registry File**
- Create `sources.json` and `registry.json`
- Build scan script to populate registry
- Review command reads registry for agent list

**Phase 3: Stack Matching**
- Add `stackMatch` to agent frontmatter
- Auto-detect project stack in review command
- Filter agents by stack match

**Phase 4: CLI Integration**
- `claude agents` subcommands
- Interactive agent selection in review
- Agent recommendations based on code changes

## Current State

For now, we're at **Phase 1**: Agents have been manually copied and aligned with the Stable Mischief tech stack. The review.md command has been updated to use stack-relevant agents.

### Stack-Aligned Agents (29 total)

**Frontend (Next.js/TypeScript)**:
- kieran-typescript-reviewer
- frontend-developer
- typescript-pro

**Backend (FastAPI/Python)**:
- kieran-python-reviewer
- fastapi-pro

**Database (Supabase/PostgreSQL)**:
- supabase-specialist
- database-optimizer
- sql-pro
- pgvector-embeddings-expert
- data-integrity-guardian

**Deployment (Coolify/Docker)**:
- coolify-deployment-expert
- deployment-engineer
- devops-harmony-analyst

**Universal**:
- architecture-strategist
- code-philosopher
- code-simplicity-reviewer
- dependency-detective
- git-history-analyzer
- pattern-recognition-specialist
- performance-oracle
- security-sentinel
- best-practices-researcher
- framework-docs-researcher
- repo-research-analyst
- pr-comment-resolver
- feedback-codifier
- every-style-editor

**Legacy (kept but not in review workflow)**:
- kieran-rails-reviewer
- dhh-rails-reviewer
