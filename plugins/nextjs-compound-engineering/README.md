# Next.js Compound Engineering Plugin

AI-powered development tools for Next.js 16+ / TypeScript / Tailwind / shadcn/ui / Drizzle ORM. Includes 27 specialized agents, 24 commands, and 13 skills.

Forked from [compound-engineering](https://github.com/EveryInc/compound-engineering-plugin) with Rails/Ruby/Python agents replaced by Next.js-specific tooling.

## Components

| Component | Count |
|-----------|-------|
| Agents | 27 |
| Commands | 24 |
| Skills | 13 |
| MCP Servers | 1 |

## Agents

### Review (14)

| Agent | Description |
|-------|-------------|
| `agent-native-reviewer` | Verify features are agent-native (action + context parity) |
| `architecture-strategist` | Analyze architectural decisions and compliance |
| `code-simplicity-reviewer` | Final pass for simplicity and minimalism |
| `data-integrity-guardian` | Database migrations and data integrity |
| `data-migration-expert` | Validate ID mappings, check for swapped values (Drizzle) |
| `deployment-verification-agent` | Create Go/No-Go deployment checklists |
| `julik-frontend-races-reviewer` | Review React code for race conditions |
| `kieran-typescript-reviewer` | TypeScript code review with strict conventions |
| `nextjs-reviewer` | Next.js App Router review (RSC, server actions, caching) |
| `nextjs-performance-reviewer` | Next.js performance (bundle size, Core Web Vitals) |
| `pattern-recognition-specialist` | Identify design patterns and anti-patterns |
| `performance-oracle` | Analyze performance bottlenecks |
| `react-component-reviewer` | React/shadcn/ui component review with accessibility |
| `security-sentinel` | Security vulnerability scanning |

### Research (5)

| Agent | Description |
|-------|-------------|
| `best-practices-researcher` | Research external best practices and documentation |
| `framework-docs-researcher` | Gather framework/library documentation |
| `git-history-analyzer` | Analyze git history for code evolution patterns |
| `learnings-researcher` | Search institutional learnings in docs/solutions/ |
| `repo-research-analyst` | Comprehensive repository structure analysis |

### Design (3)

| Agent | Description |
|-------|-------------|
| `design-implementation-reviewer` | Compare UI implementation against Figma designs |
| `design-iterator` | Iterative design refinement with screenshots |
| `figma-design-sync` | Synchronize implementation with Figma designs |

### Workflow (5)

| Agent | Description |
|-------|-------------|
| `bug-reproduction-validator` | Reproduce and validate bug reports |
| `every-style-editor` | Review text content for style guide compliance |
| `pr-comment-resolver` | Address PR review comments |
| `spec-flow-analyzer` | Analyze specifications for user flows and gaps |
| `typescript-lint` | Run ESLint, Prettier, TypeScript, and Vitest checks |

## Commands

### Workflows

| Command | Description |
|---------|-------------|
| `workflows:plan` | Create structured project plans from feature descriptions |
| `workflows:work` | Execute work plans with quality and progress tracking |
| `workflows:review` | Multi-agent code review with worktrees |
| `workflows:compound` | Document solved problems for knowledge compounding |
| `workflows:brainstorm` | Collaborative requirements exploration |

### Utilities

| Command | Description |
|---------|-------------|
| `deepen-plan` | Enhance plans with parallel research agents |
| `plan_review` | Multi-agent plan review |
| `generate_command` | Create custom slash commands |
| `test-browser` | Run browser tests on affected pages |
| `feature-video` | Record feature walkthrough videos |
| `reproduce-bug` | Reproduce and investigate bugs |
| `triage` | Triage and categorize findings |
| `resolve_parallel` | Resolve TODO comments in parallel |
| `resolve_pr_parallel` | Resolve PR comments in parallel |
| `resolve_todo_parallel` | Resolve pending todos in parallel |
| `changelog` | Generate changelogs from recent merges |
| `deploy-docs` | Validate and prepare documentation |
| `release-docs` | Build documentation site |
| `report-bug` | Report plugin bugs |
| `heal-skill` | Fix incorrect SKILL.md files |
| `create-agent-skill` | Create or edit skills |
| `agent-native-audit` | Run agent-native architecture review |
| `lfg` | Full autonomous engineering workflow |
| `xcode-test` | Build and test iOS apps on simulator |

## Skills

| Skill | Description |
|-------|-------------|
| `nextjs-patterns` | Next.js App Router, RSC, Drizzle, shadcn/ui, Tailwind patterns |
| `agent-native-architecture` | Build applications where agents are first-class citizens |
| `agent-browser` | Browser automation using Vercel's agent-browser CLI |
| `brainstorming` | Pre-implementation exploration and design decisions |
| `compound-docs` | Capture solved problems as searchable documentation |
| `create-agent-skills` | Expert guidance for creating Claude Code skills |
| `every-style-editor` | Style guide compliance for written content |
| `file-todos` | File-based todo tracking in todos/ directory |
| `frontend-design` | Production-grade frontend interface creation |
| `gemini-imagegen` | Image generation using Gemini API |
| `git-worktree` | Git worktree management for parallel development |
| `rclone` | Cloud storage file management |
| `skill-creator` | Guide for creating effective skills |

## MCP Servers

| Server | Description |
|--------|-------------|
| `context7` | Up-to-date documentation for 100+ frameworks |

## Installation

```bash
claude /install-plugin https://github.com/EveryInc/compound-engineering-plugin
```

Then install the Next.js plugin:

```bash
claude /plugin install nextjs-compound-engineering
```

## Philosophy

**Each unit of engineering work should make subsequent units of work easier -- not harder.**

## License

MIT
