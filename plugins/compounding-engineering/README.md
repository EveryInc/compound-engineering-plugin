# Compounding Engineering Plugin

AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last.

## Components

- **17 Agents** - Specialized AI agents for code review, research, and analysis
- **7 Commands** - Slash commands for common workflows
- **1 Skill** - Image generation with Gemini API

## Agents

### Code Review
- **kieran-rails-reviewer** - Rails code review with strict conventions
- **kieran-python-reviewer** - Python code review with strict conventions
- **kieran-typescript-reviewer** - TypeScript code review with strict conventions
- **dhh-rails-reviewer** - Rails review from DHH's perspective
- **code-simplicity-reviewer** - Final pass for simplicity and minimalism

### Analysis & Research
- **framework-docs-researcher** - Research framework documentation and best practices
- **best-practices-researcher** - Gather external best practices and examples
- **pattern-recognition-specialist** - Analyze code for patterns and anti-patterns
- **repo-research-analyst** - Research repository structure and conventions
- **git-history-analyzer** - Analyze git history and code evolution

### Architecture & Security
- **architecture-strategist** - Analyze architectural decisions and compliance
- **security-sentinel** - Security audits and vulnerability assessments
- **performance-oracle** - Performance analysis and optimization
- **data-integrity-guardian** - Database migrations and data integrity

### Workflow
- **every-style-editor** - Edit content to conform to Every's style guide
- **pr-comment-resolver** - Address PR comments and implement fixes
- **feedback-codifier** - Codify feedback patterns into reviewer agents

## Commands

- **/review** - Run a comprehensive code review
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

## Installation

```bash
claude /plugin install compounding-engineering
```

## License

MIT
