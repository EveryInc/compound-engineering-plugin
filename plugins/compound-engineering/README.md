# Compounding Engineering Plugin

AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last.

## Components

| Component | Count |
|-----------|-------|
| Agents | 35+ |
| Skills | 40+ |
| MCP Servers | 1 |

## Agents

Agents are organized into categories for easier discovery.

### Review

| Agent | Description |
|-------|-------------|
| `agent-native-reviewer` | Verify features are agent-native (action + context parity) |
| `api-contract-reviewer` | Detect breaking API contract changes (ce:review-beta persona) |
| `architecture-strategist` | Analyze architectural decisions and compliance |
| `code-simplicity-reviewer` | Final pass for simplicity and minimalism |
| `correctness-reviewer` | Logic errors, edge cases, state bugs (ce:review-beta persona) |
| `data-integrity-guardian` | Database migrations and data integrity |
| `data-migration-expert` | Validate ID mappings match production, check for swapped values |
| `data-migrations-reviewer` | Migration safety with confidence calibration (ce:review-beta persona) |
| `deployment-verification-agent` | Create Go/No-Go deployment checklists for risky data changes |
| `dhh-rails-reviewer` | Rails review from DHH's perspective |
| `julik-frontend-races-reviewer` | Review JavaScript/Stimulus code for race conditions |
| `kieran-rails-reviewer` | Rails code review with strict conventions |
| `kieran-python-reviewer` | Python code review with strict conventions |
| `kieran-typescript-reviewer` | TypeScript code review with strict conventions |
| `maintainability-reviewer` | Coupling, complexity, naming, dead code (ce:review-beta persona) |
| `pattern-recognition-specialist` | Analyze code for patterns and anti-patterns |
| `performance-oracle` | Performance analysis and optimization |
| `performance-reviewer` | Runtime performance with confidence calibration (ce:review-beta persona) |
| `reliability-reviewer` | Production reliability and failure modes (ce:review-beta persona) |
| `schema-drift-detector` | Detect unrelated schema.rb changes in PRs |
| `security-reviewer` | Exploitable vulnerabilities with confidence calibration (ce:review-beta persona) |
| `security-sentinel` | Security audits and vulnerability assessments |
| `testing-reviewer` | Test coverage gaps, weak assertions (ce:review-beta persona) |

### Document Review

| Agent | Description |
|-------|-------------|
| `coherence-reviewer` | Review documents for internal consistency, contradictions, and terminology drift |
| `design-lens-reviewer` | Review plans for missing design decisions, interaction states, and AI slop risk |
| `feasibility-reviewer` | Evaluate whether proposed technical approaches will survive contact with reality |
| `product-lens-reviewer` | Challenge problem framing, evaluate scope decisions, surface goal misalignment |
| `scope-guardian-reviewer` | Challenge unjustified complexity, scope creep, and premature abstractions |
| `security-lens-reviewer` | Evaluate plans for security gaps at the plan level (auth, data, APIs) |

### Research

| Agent | Description |
|-------|-------------|
| `best-practices-researcher` | Gather external best practices and examples |
| `framework-docs-researcher` | Research framework documentation and best practices |
| `git-history-analyzer` | Analyze git history and code evolution |
| `issue-intelligence-analyst` | Analyze GitHub issues to surface recurring themes and pain patterns |
| `learnings-researcher` | Search institutional learnings for relevant past solutions |
| `repo-research-analyst` | Research repository structure and conventions |

### Design

| Agent | Description |
|-------|-------------|
| `design-implementation-reviewer` | Verify UI implementations match Figma designs |
| `design-iterator` | Iteratively refine UI through systematic design iterations |
| `figma-design-sync` | Synchronize web implementations with Figma designs |

### Workflow

| Agent | Description |
|-------|-------------|
| `bug-reproduction-validator` | Systematically reproduce and validate bug reports |
| `lint` | Run linting and code quality checks on Ruby and ERB files |
| `pr-comment-resolver` | Address PR comments and implement fixes |
| `spec-flow-analyzer` | Analyze user flows and identify gaps in specifications |

### Docs

| Agent | Description |
|-------|-------------|
| `ankane-readme-writer` | Create READMEs following Ankane-style template for Ruby gems |

## Commands

### Workflow Commands

Core workflow commands use `ce:` prefix to unambiguously identify them as compound-engineering commands:

| Command | Description |
|---------|-------------|
| `/ce:ideate` | Discover high-impact project improvements through divergent ideation and adversarial filtering |
| `/ce:brainstorm` | Explore requirements and approaches before planning |
| `/ce:plan` | Transform features into structured implementation plans grounded in repo patterns |
| `/ce:review` | Run comprehensive code reviews |
| `/ce:work` | Execute work items systematically |
| `/ce:compound` | Document solved problems to compound team knowledge |
| `/ce:compound-refresh` | Refresh stale or drifting learnings and decide whether to keep, update, replace, or archive them |

### Utility Commands

| Command | Description |
|---------|-------------|
| `/lfg` | Full autonomous engineering workflow |
| `/slfg` | Full autonomous workflow with swarm mode for parallel execution |
| `/deepen-plan` | Stress-test plans and deepen weak sections with targeted research |
| `/changelog` | Create engaging changelogs for recent merges |
| `/generate_command` | Generate new slash commands |
| `/sync` | Sync Claude Code config across machines |
| `/report-bug-ce` | Report a bug in the compound-engineering plugin |
| `/reproduce-bug` | Reproduce bugs using logs and console |
| `/resolve-pr-parallel` | Resolve PR comments in parallel |
| `/todo-resolve` | Resolve todos in parallel |
| `/todo-triage` | Triage and prioritize pending todos |
| `/test-browser` | Run browser tests on PR-affected pages |
| `/test-xcode` | Build and test iOS apps on simulator |
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
| `dhh-rails-style` | Write Ruby/Rails code in DHH's 37signals style |
| `dspy-ruby` | Build type-safe LLM applications with DSPy.rb |
| `frontend-design` | Create production-grade frontend interfaces |


### Content & Workflow

| Skill | Description |
|-------|-------------|
| `document-review` | Review documents using parallel persona agents for role-specific feedback |
| `every-style-editor` | Review copy for Every's style guide compliance |
| `todo-create` | File-based todo tracking system |
| `git-worktree` | Manage Git worktrees for parallel development |
| `proof` | Create, edit, and share documents via Proof collaborative editor |
| `claude-permissions-optimizer` | Optimize Claude Code permissions from session history |
| `resolve-pr-parallel` | Resolve PR review comments in parallel |
| `setup` | Configure which review agents run for your project |

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

### Beta Skills

Experimental versions of core workflow skills. These are being tested before replacing their stable counterparts. They work standalone but are not yet wired into the automated `lfg`/`slfg` orchestration.

| Skill | Description | Replaces |
|-------|-------------|----------|
| `ce:review-beta` | Structured review with tiered persona agents, confidence gating, and dedup pipeline | `ce:review` |

To test: invoke `/ce:review-beta` directly.

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

**Authentication:** To avoid anonymous rate limits, set the `CONTEXT7_API_KEY` environment variable with your Context7 API key. The plugin passes this automatically via the `x-api-key` header. Without it, requests go unauthenticated and will quickly hit the anonymous quota limit.

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
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "x-api-key": "${CONTEXT7_API_KEY:-}"
      }
    }
  }
}
```

Set `CONTEXT7_API_KEY` in your environment to authenticate. Or add it globally in `~/.claude/settings.json` for all projects.

## Version History

See the repo root [CHANGELOG.md](../../CHANGELOG.md) for canonical release history.

## License

MIT
