# Compounding Engineering Plugin

AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last.

## Getting Started

After installing, run `/ce-setup` in any project. It diagnoses your environment, installs missing tools, and bootstraps project config in one interactive flow.

## Components

| Component | Count |
|-----------|-------|
| Agents | 36 |
| Skills | 19 |

## Skills

The primary entry points for engineering work, invoked as slash commands. Detailed user-facing documentation for many skills lives in [`docs/skills/`](../../docs/skills/) — each linked skill name below points to its page (purpose, novel mechanics, use cases, chain position). Skills without dedicated docs are still listed; their `SKILL.md` in the source tree is authoritative.

### Core Workflow

| Skill | Description |
|-------|-------------|
| [`/ce-ideate`](../../docs/skills/ce-ideate.md) | Optional big-picture ideation: generate and critically evaluate grounded ideas, then route the strongest one into brainstorming |
| [`/ce-brainstorm`](../../docs/skills/ce-brainstorm.md) | Interactive Q&A to think through a feature or problem and write a right-sized requirements doc before planning. Pass `output:html` to write the doc as a single self-contained HTML file instead of markdown (exclusive — md OR html, never both) |
| [`/ce-plan`](../../docs/skills/ce-plan.md) | Create structured plans for any multi-step task -- software features, research workflows, events, study plans -- with automatic confidence checking. Pass `output:html` to write the plan as a single self-contained HTML file instead of markdown (exclusive — md OR html, never both) |
| [`/ce-code-review`](../../docs/skills/ce-code-review.md) | Structured code review with tiered persona agents, confidence gating, and dedup pipeline |
| [`/ce-work`](../../docs/skills/ce-work.md) | Execute work items systematically; pass `delegate:codex` to offload execution to Codex |
| [`/ce-debug`](../../docs/skills/ce-debug.md) | Systematically find root causes and fix bugs -- traces causal chains, forms testable hypotheses, and implements test-first fixes |
| [`/ce-compound`](../../docs/skills/ce-compound.md) | Document solved problems to compound team knowledge, or refresh stale learnings with `mode:refresh` |
| [`/ce-optimize`](../../docs/skills/ce-optimize.md) | Run iterative optimization loops with parallel experiments, measurement gates, and LLM-as-judge quality scoring |

### Research & Context

| Skill | Description |
|-------|-------------|
| [`/ce-sessions`](../../docs/skills/ce-sessions.md) | Ask questions about session history across Claude Code, Codex, and Cursor |

### Git Workflow

| Skill | Description |
|-------|-------------|
| [`/ce-commit-push-pr`](../../docs/skills/ce-commit-push-pr.md) | Commit, push, and open a PR with an adaptive description; also update an existing PR description, or generate a description on its own without committing; or commit only without pushing |
| [`/ce-worktree`](../../docs/skills/ce-worktree.md) | Manage Git worktrees for parallel development |

### Workflow Utilities

| Skill | Description |
|-------|-------------|
| [`/ce-setup`](../../docs/skills/ce-setup.md) | Diagnose environment, install missing tools, and bootstrap project config |
| [`/ce-update`](../../docs/skills/ce-update.md) | Check compound-engineering plugin version and fix stale cache (Claude Code only) |

### Development Frameworks

| Skill | Description |
|-------|-------------|
| `/ce-agent-native-architecture` | Build AI agents using prompt-native architecture |
| `/ce-agent-native-audit` | Run comprehensive agent-native architecture review with scored principles |
| [`/ce-frontend-design`](../../docs/skills/ce-frontend-design.md) | Create production-grade frontend interfaces |
| [`/ce-polish`](../../docs/skills/ce-polish.md) | Conversational UX polish — start a dev server, open the feature in a browser, and iterate together; auto-detects 8 frameworks. Manual invocation only |

### Review & Quality

| Skill | Description |
|-------|-------------|
| [`/ce-doc-review`](../../docs/skills/ce-doc-review.md) | Review documents using parallel persona agents for role-specific feedback |
| [`/ce-simplify-code`](../../docs/skills/ce-simplify-code.md) | Simplify recent code changes for reuse, quality, and efficiency — parallel reviewers find issues, fixes applied, behavior verified by tests |

## Agents

Agents are specialized subagents invoked by skills — you typically don't call these directly.

### Review

| Agent | Description |
|-------|-------------|
| `ce-agent-native-reviewer` | Verify features are agent-native (action + context parity) |
| `ce-api-contract-reviewer` | Detect breaking API contract changes |
| `ce-architecture-strategist` | Analyze architectural decisions and compliance |
| `ce-code-simplicity-reviewer` | Final pass for simplicity and minimalism |
| `ce-correctness-reviewer` | Logic errors, edge cases, state bugs |
| `ce-data-integrity-guardian` | Database migrations and data integrity |
| `ce-data-migration-reviewer` | Schema drift, migration safety, mapping verification, deploy-window checks |
| `ce-deployment-verification-agent` | Create Go/No-Go deployment checklists for risky data changes |
| `ce-julik-frontend-races-reviewer` | Review JavaScript/Stimulus code for race conditions |
| `ce-maintainability-reviewer` | Coupling, complexity, naming, dead code |
| `ce-pattern-recognition-specialist` | Analyze code for patterns and anti-patterns |
| `ce-performance-oracle` | Performance analysis and optimization |
| `ce-performance-reviewer` | Runtime performance with confidence calibration |
| `ce-reliability-reviewer` | Production reliability and failure modes |
| `ce-security-reviewer` | Exploitable vulnerabilities with confidence calibration |
| `ce-security-sentinel` | Security audits and vulnerability assessments |
| `ce-testing-reviewer` | Test coverage gaps, weak assertions |
| `ce-project-standards-reviewer` | CLAUDE.md and AGENTS.md compliance |
| `ce-adversarial-reviewer` | Construct failure scenarios to break implementations across component boundaries |
| `ce-previous-comments-reviewer` | Conditional review persona that checks whether prior PR feedback has been addressed in the current diff |

### Document Review

| Agent | Description |
|-------|-------------|
| `ce-coherence-reviewer` | Review documents for internal consistency, contradictions, and terminology drift |
| `ce-design-lens-reviewer` | Review plans for missing design decisions, interaction states, and AI slop risk |
| `ce-feasibility-reviewer` | Evaluate whether proposed technical approaches will survive contact with reality |
| `ce-product-lens-reviewer` | Challenge problem framing, evaluate scope decisions, surface goal misalignment |
| `ce-scope-guardian-reviewer` | Challenge unjustified complexity, scope creep, and premature abstractions |
| `ce-security-lens-reviewer` | Evaluate plans for security gaps at the plan level (auth, data, APIs) |
| `ce-adversarial-document-reviewer` | Challenge premises, surface unstated assumptions, and stress-test decisions |

### Research

| Agent | Description |
|-------|-------------|
| `ce-best-practices-researcher` | Gather external best practices and examples |
| `ce-git-history-analyzer` | Analyze git history and code evolution |
| `ce-issue-intelligence-analyst` | Analyze GitHub issues to surface recurring themes and pain patterns |
| `ce-learnings-researcher` | Search institutional learnings for relevant past solutions |
| `ce-repo-research-analyst` | Research repository structure and conventions |
| `ce-session-historian` | Search prior Claude Code, Codex, and Cursor sessions for related investigation context |
| `ce-web-researcher` | Perform iterative web research and return structured external grounding (prior art, adjacent solutions, market signals, cross-domain analogies) |

### Design

| Agent | Description |
|-------|-------------|
| `ce-figma-design-sync` | Synchronize web implementations with Figma designs |

### Workflow

| Agent | Description |
|-------|-------------|
| `ce-spec-flow-analyzer` | Analyze user flows and identify gaps in specifications |

## Installation

See the repo root [Install section](../../README.md#install) for current installation instructions across Claude Code, Codex, Cursor, Copilot, Droid, Qwen, and converter-backed targets.

Then run `/ce-setup` to check your environment and install recommended tools.

## Version History

See the repo root [CHANGELOG.md](../../CHANGELOG.md) for canonical release history.

## License

MIT
