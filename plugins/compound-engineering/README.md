# Compounding Engineering Plugin

AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last.

## Components

| Component | Count |
|-----------|-------|
| Agents | 30 |
| Commands | 25 |
| Skills | 21 |
| MCP Servers | 1 |

## Agents

Agents are organized into categories for easier discovery.

### Review (15)

| Agent | Description |
|-------|-------------|
| `agent-native-reviewer` | Verify features are agent-native (action + context parity) |
| `architecture-strategist` | Analyze architectural decisions and compliance |
| `code-simplicity-reviewer` | Final pass for simplicity and minimalism |
| `data-integrity-guardian` | Database migrations and data integrity |
| `data-migration-expert` | Validate ID mappings match production, check for swapped values |
| `deployment-verification-agent` | Create Go/No-Go deployment checklists for risky data changes |
| `dhh-rails-reviewer` | Rails review from DHH's perspective |
| `julik-frontend-races-reviewer` | Review JavaScript/Stimulus code for race conditions |
| `kieran-rails-reviewer` | Rails code review with strict conventions |
| `kieran-python-reviewer` | Python code review with strict conventions |
| `kieran-typescript-reviewer` | TypeScript code review with strict conventions |
| `pattern-recognition-specialist` | Analyze code for patterns and anti-patterns |
| `performance-oracle` | Performance analysis and optimization |
| `schema-drift-detector` | Detect unrelated schema.rb changes in PRs |
| `security-sentinel` | Security audits and vulnerability assessments |

### Research (6)

| Agent | Description |
|-------|-------------|
| `best-practices-researcher` | Gather external best practices and examples |
| `framework-docs-researcher` | Research framework documentation and best practices |
| `git-history-analyzer` | Analyze git history and code evolution |
| `learnings-researcher` | Search institutional learnings for relevant past solutions |
| `repo-research-analyst` | Research repository structure and conventions |
| `user-research-analyst` | Search research artifacts for relevant personas and insights |

### Design (3)

| Agent | Description |
|-------|-------------|
| `design-implementation-reviewer` | Verify UI implementations match Figma designs |
| `design-iterator` | Iteratively refine UI through systematic design iterations |
| `figma-design-sync` | Synchronize web implementations with Figma designs |

### Workflow (5)

| Agent | Description |
|-------|-------------|
| `bug-reproduction-validator` | Systematically reproduce and validate bug reports |
| `every-style-editor` | Edit content to conform to Every's style guide |
| `lint` | Run linting and code quality checks on Ruby and ERB files |
| `pr-comment-resolver` | Address PR comments and implement fixes |
| `spec-flow-analyzer` | Analyze user flows and identify gaps in specifications |

### Docs (1)

| Agent | Description |
|-------|-------------|
| `ankane-readme-writer` | Create READMEs following Ankane-style template for Ruby gems |

## Commands

### Workflow Commands

Core workflow commands use `workflows:` prefix to avoid collisions with built-in commands:

| Command | Description |
|---------|-------------|
| `/workflows:brainstorm` | Explore requirements and approaches before planning |
| `/workflows:plan` | Create implementation plans |
| `/workflows:research` | Plan research, process transcripts, and build personas |
| `/workflows:review` | Run comprehensive code reviews |
| `/workflows:work` | Execute work items systematically |
| `/workflows:compound` | Document solved problems to compound team knowledge |

### Utility Commands

| Command | Description |
|---------|-------------|
| `/lfg` | Full autonomous engineering workflow |
| `/slfg` | Full autonomous workflow with swarm mode for parallel execution |
| `/deepen-plan` | Enhance plans with parallel research agents for each section |
| `/changelog` | Create engaging changelogs for recent merges |
| `/create-agent-skill` | Create or edit Claude Code skills |
| `/generate_command` | Generate new slash commands |
| `/heal-skill` | Fix skill documentation issues |
| `/technical_review` | Multi-agent technical/architecture review in parallel |
| `/report-bug` | Report a bug in the plugin |
| `/reproduce-bug` | Reproduce bugs using logs and console |
| `/resolve_parallel` | Resolve TODO comments in parallel |
| `/resolve_pr_parallel` | Resolve PR comments in parallel |
| `/resolve_todo_parallel` | Resolve todos in parallel |
| `/triage` | Triage and prioritize issues |
| `/test-browser` | Run browser tests on PR-affected pages |
| `/xcode-test` | Build and test iOS apps on simulator |
| `/feature-video` | Record video walkthroughs and add to PR description |

## Skills

### Architecture & Design

| Skill | Description |
|-------|-------------|
| `agent-native-architecture` | Build AI agents using prompt-native architecture |

### Development Tools

| Skill | Description |
|-------|-------------|
| `andrew-kane-gem-writer` | Write Ruby gems following Andrew Kane's patterns |
| `compound-docs` | Capture solved problems as categorized documentation |
| `create-agent-skills` | Expert guidance for creating Claude Code skills |
| `dhh-rails-style` | Write Ruby/Rails code in DHH's 37signals style |
| `dspy-ruby` | Build type-safe LLM applications with DSPy.rb |
| `frontend-design` | Create production-grade frontend interfaces |
| `skill-creator` | Guide for creating effective Claude Code skills |

### Content & Workflow

| Skill | Description |
|-------|-------------|
| `brainstorming` | Explore requirements and approaches through collaborative dialogue |
| `document-review` | Improve documents through structured self-review |
| `every-style-editor` | Review copy for Every's style guide compliance |
| `file-todos` | File-based todo tracking system |
| `git-worktree` | Manage Git worktrees for parallel development |

### Multi-Agent Orchestration

| Skill | Description |
|-------|-------------|
| `orchestrating-swarms` | Comprehensive guide to multi-agent swarm orchestration |

### File Transfer

| Skill | Description |
|-------|-------------|
| `rclone` | Upload files to S3, Cloudflare R2, Backblaze B2, and cloud storage |

### Browser Automation

| Skill | Description |
|-------|-------------|
| `agent-browser` | CLI-based browser automation using Vercel's agent-browser |

### User Research

| Skill | Description |
|-------|-------------|
| `research-plan` | Create structured research plans with outcome-focused objectives |
| `transcript-insights` | Process interview transcripts into structured snapshots and insights |
| `persona-builder` | Synthesize insights across interviews into living persona documents |

### Image Generation

| Skill | Description |
|-------|-------------|
| `gemini-imagegen` | Generate and edit images using Google's Gemini API |

**gemini-imagegen features:**
- Text-to-image generation
- Image editing and manipulation
- Multi-turn refinement
- Multiple reference image composition (up to 14 images)

**Requirements:**
- `GEMINI_API_KEY` environment variable
- Python packages: `google-genai`, `pillow`

## MCP Servers

| Server | Description |
|--------|-------------|
| `context7` | Framework documentation lookup via Context7 |

### Context7

**Tools provided:**
- `resolve-library-id` - Find library ID for a framework/package
- `get-library-docs` - Get documentation for a specific library

Supports 100+ frameworks including Rails, React, Next.js, Vue, Django, Laravel, and more.

MCP servers start automatically when the plugin is enabled.

## Browser Automation

This plugin uses **agent-browser CLI** for browser automation tasks. Install it globally:

```bash
npm install -g agent-browser
agent-browser install  # Downloads Chromium
```

The `agent-browser` skill provides comprehensive documentation on usage.

## Installation

```bash
claude /plugin install compound-engineering
```

## Known Issues

### MCP Servers Not Auto-Loading

**Issue:** The bundled Context7 MCP server may not load automatically when the plugin is installed.

**Workaround:** Manually add it to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

Or add it globally in `~/.claude/settings.json` for all projects.

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

## License

MIT
