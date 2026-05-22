# Compounding Engineering Plugin

AI-powered development tools that get smarter with every use. Make each unit of engineering work easier than the last.

## Getting Started

After installing, run `/ce-setup` in any project. It diagnoses your environment, installs missing tools, and bootstraps project config in one interactive flow.

## Components

| Component | Count |
|-----------|-------|
| Agents | 50+ |
| Skills | 38+ |

## Skills

The primary entry points for engineering work, invoked as slash commands. Detailed user-facing documentation for many skills lives in [`docs/skills/`](../../docs/skills/) — each linked skill name below points to its page (purpose, novel mechanics, use cases, chain position). Skills without dedicated docs are still listed; their `SKILL.md` in the source tree is authoritative.

### Core Workflow

`ce-strategy` anchors the loop upstream; `ce-product-pulse` closes it with a read on user outcomes.

| Skill | Description |
|-------|-------------|
| [`/ce-strategy`](../../docs/skills/ce-strategy.md) | Create or maintain `STRATEGY.md` — the product's target problem, approach, persona, key metrics, and tracks. Re-runnable to update. Read as grounding by `/ce-ideate`, `/ce-brainstorm`, and `/ce-plan` when present |
| [`/ce-ideate`](../../docs/skills/ce-ideate.md) | Optional big-picture ideation: generate and critically evaluate grounded ideas, then route the strongest one into brainstorming |
| [`/ce-brainstorm`](../../docs/skills/ce-brainstorm.md) | Interactive Q&A to think through a feature or problem and write a right-sized requirements doc before planning |
| [`/ce-plan`](../../docs/skills/ce-plan.md) | Create structured plans for any multi-step task -- software features, research workflows, events, study plans -- with automatic confidence checking |
| [`/ce-code-review`](../../docs/skills/ce-code-review.md) | Structured code review with tiered persona agents, confidence gating, and dedup pipeline |
| [`/ce-work`](../../docs/skills/ce-work.md) | Execute work items systematically |
| [`/ce-debug`](../../docs/skills/ce-debug.md) | Systematically find root causes and fix bugs -- traces causal chains, forms testable hypotheses, and implements test-first fixes |
| [`/ce-compound`](../../docs/skills/ce-compound.md) | Document solved problems to compound team knowledge |
| [`/ce-compound-refresh`](../../docs/skills/ce-compound-refresh.md) | Refresh stale or drifting learnings and decide whether to keep, update, replace, or archive them |
| [`/ce-optimize`](../../docs/skills/ce-optimize.md) | Run iterative optimization loops with parallel experiments, measurement gates, and LLM-as-judge quality scoring |
| [`/ce-product-pulse`](../../docs/skills/ce-product-pulse.md) | Generate a single-page, time-windowed report on usage, performance, errors, and followups. Saves reports to `docs/pulse-reports/` as a browseable timeline of what users experienced |

### Research & Context

| Skill | Description |
|-------|-------------|
| [`/ce-sessions`](../../docs/skills/ce-sessions.md) | Ask questions about session history across Claude Code, Codex, and Cursor |
| [`/ce-slack-research`](../../docs/skills/ce-slack-research.md) | Search Slack for interpreted organizational context -- decisions, constraints, and discussion arcs |
| [`ce-riffrec-feedback-analysis`](../../docs/skills/ce-riffrec-feedback-analysis.md) | Convert [Riffrec](https://github.com/kieranklaassen/riffrec) recordings, videos, audio, or notes into structured feedback. Routes between setup, quick bug report, and extensive analysis that hands off to `ce-brainstorm` |

### Git Workflow

| Skill | Description |
|-------|-------------|
| [`ce-clean-gone-branches`](../../docs/skills/ce-clean-gone-branches.md) | Clean up local branches whose remote tracking branch is gone |
| [`ce-commit`](../../docs/skills/ce-commit.md) | Create a git commit with a value-communicating message |
| [`ce-commit-push-pr`](../../docs/skills/ce-commit-push-pr.md) | Commit, push, and open a PR with an adaptive description; also update an existing PR description, or generate a description on its own without committing |
| [`ce-worktree`](../../docs/skills/ce-worktree.md) | Manage Git worktrees for parallel development |

### Workflow Utilities

| Skill | Description |
|-------|-------------|
| [`/ce-demo-reel`](../../docs/skills/ce-demo-reel.md) | Capture a visual demo reel (GIF demos, terminal recordings, screenshots) for PRs with project-type-aware tier selection |
| [`/ce-report-bug`](../../docs/skills/ce-report-bug.md) | Report a bug in the compound-engineering plugin |
| [`/ce-resolve-pr-feedback`](../../docs/skills/ce-resolve-pr-feedback.md) | Resolve PR review feedback in parallel |
| [`/ce-test-browser`](../../docs/skills/ce-test-browser.md) | Run browser tests on PR-affected pages |
| [`/ce-test-xcode`](../../docs/skills/ce-test-xcode.md) | Build and test iOS apps on simulator using XcodeBuildMCP |
| [`/ce-setup`](../../docs/skills/ce-setup.md) | Diagnose environment, install missing tools, and bootstrap project config |
| [`/ce-update`](../../docs/skills/ce-update.md) | Check compound-engineering plugin version and fix stale cache (Claude Code only) |
| [`/ce-release-notes`](../../docs/skills/ce-release-notes.md) | Summarize recent compound-engineering plugin releases, or answer a question about a past release with a version citation |

### Development Frameworks

| Skill | Description |
|-------|-------------|
| `ce-agent-native-architecture` | Build AI agents using prompt-native architecture |
| `ce-dhh-rails-style` | Write Ruby/Rails code in DHH's 37signals style |
| [`ce-frontend-design`](../../docs/skills/ce-frontend-design.md) | Create production-grade frontend interfaces |

### Review & Quality

| Skill | Description |
|-------|-------------|
| [`ce-doc-review`](../../docs/skills/ce-doc-review.md) | Review documents using parallel persona agents for role-specific feedback |
| [`/ce-simplify-code`](../../docs/skills/ce-simplify-code.md) | Simplify recent code changes for reuse, quality, and efficiency — parallel reviewers find issues, fixes applied, behavior verified by tests |

### Content & Collaboration

| Skill | Description |
|-------|-------------|
| [`ce-proof`](../../docs/skills/ce-proof.md) | Create, edit, and share documents via Proof collaborative editor |

### Automation & Tools

| Skill | Description |
|-------|-------------|
| `ce-gemini-imagegen` | Generate and edit images using Google's Gemini API |

### Beta / Experimental

| Skill | Description |
|-------|-------------|
| [`ce-polish-beta`](../../docs/skills/ce-polish-beta.md) | Human-in-the-loop polish phase after /ce-code-review — verifies review + CI, starts a dev server from `.claude/launch.json`, generates a testable checklist, and dispatches polish sub-agents for fixes. Emits stacked-PR seeds for oversized work |
| `ce-dogfood-beta` | Diff-scoped browser QA of the active branch: builds an exhaustive test matrix of every change, drives the app with agent-browser, then auto-fixes issues, adds regression tests, and commits each fix until green |
| `/lfg` | Full autonomous engineering workflow |

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
| `ce-swift-ios-reviewer` | Swift and iOS code review -- SwiftUI state, retain cycles, concurrency, Core Data threading, accessibility |
| `ce-testing-reviewer` | Test coverage gaps, weak assertions |
| `ce-project-standards-reviewer` | CLAUDE.md and AGENTS.md compliance |
| `ce-adversarial-reviewer` | Construct failure scenarios to break implementations across component boundaries |

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
| `ce-framework-docs-researcher` | Research framework documentation and best practices |
| `ce-git-history-analyzer` | Analyze git history and code evolution |
| `ce-issue-intelligence-analyst` | Analyze GitHub issues to surface recurring themes and pain patterns |
| `ce-learnings-researcher` | Search institutional learnings for relevant past solutions |
| `ce-repo-research-analyst` | Research repository structure and conventions |
| `ce-session-historian` | Search prior Claude Code, Codex, and Cursor sessions for related investigation context |
| `ce-slack-researcher` | Search Slack for organizational context relevant to the current task |
| `ce-web-researcher` | Perform iterative web research and return structured external grounding (prior art, adjacent solutions, market signals, cross-domain analogies) |

### Design

| Agent | Description |
|-------|-------------|
| `ce-design-implementation-reviewer` | Verify UI implementations match Figma designs |
| `ce-design-iterator` | Iteratively refine UI through systematic design iterations |
| `ce-figma-design-sync` | Synchronize web implementations with Figma designs |

### Workflow

| Agent | Description |
|-------|-------------|
| `ce-pr-comment-resolver` | Address PR comments and implement fixes |
| `ce-spec-flow-analyzer` | Analyze user flows and identify gaps in specifications |

### Docs

| Agent | Description |
|-------|-------------|
| `ce-ankane-readme-writer` | Create READMEs following Ankane-style template for Ruby gems |

## Installation

See the repo root [Install section](../../README.md#install) for current installation instructions across Claude Code, Codex, Cursor, Copilot, Droid, Qwen, and converter-backed targets.

Then run `/ce-setup` to check your environment and install recommended tools.

## Version History

See the repo root [CHANGELOG.md](../../CHANGELOG.md) for canonical release history.

## License

MIT
