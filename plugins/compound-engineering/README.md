# Compounding Engineering Plugin

AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last.

## Getting Started

After installing, run `/ce-setup` in any project. It diagnoses your environment, installs missing tools, and bootstraps project config in one interactive flow.

## Components

| Component | Count |
|-----------|-------|
| Agents | 16 |
| Skills | 16 |

## Skills

The primary entry points for engineering work, invoked as slash commands. Detailed user-facing documentation for many skills lives in [`docs/skills/`](../../docs/skills/) — each linked skill name below points to its page (purpose, novel mechanics, use cases, chain position). Skills without dedicated docs are still listed; their `SKILL.md` in the source tree is authoritative.

### Core Workflow

| Skill | Description |
|-------|-------------|
| [`/ce-brainstorm`](../../docs/skills/ce-brainstorm.md) | Interactive Q&A to think through a feature or problem and write a right-sized requirements doc before planning. Pass `output:html` to write the doc as a single self-contained HTML file instead of markdown (exclusive — md OR html, never both) |
| [`/ce-plan`](../../docs/skills/ce-plan.md) | Create structured plans for any multi-step task -- software features, research workflows, events, study plans -- with automatic confidence checking. Pass `output:html` to write the plan as a single self-contained HTML file instead of markdown (exclusive — md OR html, never both) |
| [`/ce-code-review`](../../docs/skills/ce-code-review.md) | Structured code review with tiered persona agents, confidence gating, and dedup pipeline |
| [`/ce-work`](../../docs/skills/ce-work.md) | Execute work items systematically; pass `delegate:codex` to offload execution to Codex |
| [`/ce-debug`](../../docs/skills/ce-debug.md) | Systematically find root causes and fix bugs -- traces causal chains, forms testable hypotheses, and implements test-first fixes |
| [`/ce-compound`](../../docs/skills/ce-compound.md) | Document solved problems to compound team knowledge, or refresh stale learnings with `mode:refresh` |
| `/ce-subagent-driven` | Execute a plan or multi-task change by dispatching one fresh subagent per task, with an adversarial audit between tasks |

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
| [`/ce-frontend-design`](../../docs/skills/ce-frontend-design.md) | Create production-grade frontend interfaces |

### Review & Quality

| Skill | Description |
|-------|-------------|
| [`/ce-doc-review`](../../docs/skills/ce-doc-review.md) | Review documents using parallel persona agents for role-specific feedback |
| [`/ce-simplify-code`](../../docs/skills/ce-simplify-code.md) | Simplify recent code changes for reuse, quality, and efficiency — parallel reviewers find issues, fixes applied, behavior verified by tests |
| `/ce-verify-before-complete` | Verification gate before claiming work complete — runs the repo-native verifier, reads back changed files, ghost-checks removed names, and diffs delivery against the original request |

## Agents

Agents are specialized subagents invoked by skills — you typically don't call these directly.

### Review

| Agent | Description |
|-------|-------------|
| `ce-architecture-strategist` | Analyze architectural decisions and compliance, plus optional flow-analysis mode for specs and plans (absorbed spec-flow analysis) |
| `ce-correctness-reviewer` | Logic errors, edge cases, state bugs, production reliability, structural quality, and code simplicity |
| `ce-performance-reviewer` | Runtime performance with confidence calibration |
| `ce-security-reviewer` | Exploitable vulnerabilities with confidence calibration |
| `ce-testing-reviewer` | Test coverage gaps, weak assertions, API contract stability, and project-standards compliance |
| `ce-adversarial-reviewer` | Construct failure scenarios to break implementations across component boundaries |
| `ce-previous-comments-reviewer` | Conditional review persona that checks whether prior PR feedback has been addressed in the current diff |

### Document Review

| Agent | Description |
|-------|-------------|
| `ce-coherence-reviewer` | Review documents for internal consistency, contradictions, and terminology drift |
| `ce-feasibility-reviewer` | Evaluate technical viability, design completeness, and plan-level security coverage |
| `ce-adversarial-document-reviewer` | Challenge premises and assumptions, assess strategic consequences, and stress-test scope decisions |

### Research

| Agent | Description |
|-------|-------------|
| `ce-best-practices-researcher` | Gather external best practices and examples |
| `ce-learnings-researcher` | Search institutional learnings for relevant past solutions |
| `ce-repo-research-analyst` | Research repository structure, conventions, and implementation patterns, with optional `history` (git evolution) and `patterns` (design/anti-pattern) scopes (absorbed git-history and pattern-recognition) |
| `ce-session-historian` | Search prior Claude Code, Codex, and Cursor sessions for related investigation context |
| `ce-web-researcher` | Perform iterative web research and return structured external grounding (prior art, adjacent solutions, market signals, cross-domain analogies) |

### Planning

| Agent | Description |
|-------|-------------|
| `ce-plan-specialist-reviewer` | Deep plan analysis for performance, security, and data-integrity risks, dispatched with a scope hint (absorbed performance-oracle, security-sentinel, and data-integrity-guardian) |

## Installation

See the repo root [Install section](../../README.md#install) for current installation instructions across Claude Code, Codex, Cursor, Copilot, Droid, Qwen, and converter-backed targets.

Then run `/ce-setup` to check your environment and install recommended tools.

## Version History

See the repo root [CHANGELOG.md](../../CHANGELOG.md) for canonical release history.

## License

MIT
