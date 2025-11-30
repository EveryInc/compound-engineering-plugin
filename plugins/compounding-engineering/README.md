# Compounding Engineering Plugin

AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last.

## Components

- **29 Agents** - Specialized AI agents for code review, research, and analysis
- **7 Commands** - Slash commands for common workflows
- **1 Skill** - Image generation with Gemini API

## Agents

### Frontend (Next.js/TypeScript)
- **kieran-typescript-reviewer** - TypeScript code review with strict conventions
- **frontend-developer** - Next.js 15+, React 19, modern frontend architecture
- **typescript-pro** - Advanced TypeScript patterns and type safety

### Backend (FastAPI/Python)
- **kieran-python-reviewer** - Python code review with strict conventions
- **fastapi-pro** - FastAPI, async patterns, Pydantic, SQLAlchemy

### Database (Supabase/PostgreSQL)
- **supabase-specialist** - RLS, auth, storage, realtime, Supabase-specific patterns
- **database-optimizer** - Query optimization, indexing, performance tuning
- **sql-pro** - SQL queries, schema design, PostgreSQL features
- **pgvector-embeddings-expert** - Vector search, RAG, embeddings with PGVector
- **data-integrity-guardian** - Database migrations and data integrity

### Deployment (Coolify/Docker)
- **coolify-deployment-expert** - Coolify-specific deployment patterns
- **deployment-engineer** - CI/CD pipelines, GitOps, container orchestration
- **devops-harmony-analyst** - Infrastructure code, Dockerfiles, GitHub Actions

### Code Review
- **code-simplicity-reviewer** - Final pass for simplicity and minimalism
- **code-philosopher** - Deep reasoning about design decisions and trade-offs

### Analysis & Research
- **framework-docs-researcher** - Research framework documentation and best practices
- **best-practices-researcher** - Gather external best practices and examples
- **pattern-recognition-specialist** - Analyze code for patterns and anti-patterns
- **repo-research-analyst** - Research repository structure and conventions
- **git-history-analyzer** - Analyze git history and code evolution
- **dependency-detective** - Dependency analysis, version conflicts, security

### Architecture & Security
- **architecture-strategist** - Analyze architectural decisions and compliance
- **security-sentinel** - Security audits and vulnerability assessments
- **performance-oracle** - Performance analysis and optimization

### Workflow
- **every-style-editor** - Edit content to conform to Every's style guide
- **pr-comment-resolver** - Address PR comments and implement fixes
- **feedback-codifier** - Codify feedback patterns into reviewer agents

### Legacy (kept for other projects)
- **kieran-rails-reviewer** - Rails code review
- **dhh-rails-reviewer** - Rails review from DHH's perspective

## Commands

- **/review** - Run a comprehensive code review (stack-aware)
- **/plan** - Create an implementation plan
- **/work** - Execute work items systematically
- **/triage** - Triage issues and prioritize work
- **/codify** - Capture learnings to make future work easier
- **/resolve_todo_parallel** - Resolve todos in parallel
- **/generate_command** - Generate new slash commands

## Skills

### gemini-imagegen
Generate and edit images using Google's Gemini API.

**Features:**
- Text-to-image generation
- Image editing and manipulation
- Multi-turn refinement
- Multiple reference image composition

**Requirements:**
- `GEMINI_API_KEY` environment variable
- Python packages: `google-genai`, `pillow`

**Usage:**
```bash
python scripts/generate_image.py "A cat wearing a wizard hat" output.png
python scripts/edit_image.py input.png "Add a rainbow" output.png
```

## Stack Alignment

This plugin is optimized for the **Stable Mischief Tech Stack**:
- Frontend: Next.js 14+ / TypeScript / Tailwind / shadcn/ui
- Backend: FastAPI / Python 3.11+
- Database: Supabase PostgreSQL / PGVector
- AI: Claude / OpenAI embeddings / LangChain
- Deployment: Coolify (Docker) / Vercel

See `AGENT_DISCOVERY.md` for agent registry and future cross-marketplace discovery plans.

## Installation

```bash
claude /plugin install compounding-engineering
```

## License

MIT
