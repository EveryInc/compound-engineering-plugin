# Every Marketplace

The official Every marketplace where engineers from Every.to share their workflows. Currently featuring the Compounding Engineering Philosophy plugin.

## Quick Start

### Standard Installation
Run Claude and add the marketplace:

```bash
/plugin marketplace add https://github.com/EveryInc/every-marketplace
```

Then install the plugin:

```bash
/plugin install compound-engineering
```

### One-Command Installation
Use the [Claude Plugins CLI](https://claude-plugins.dev) to skip the marketplace setup:

```bash
npx claude-plugins install @EveryInc/every-marketplace/compound-engineering
```

This automatically adds the marketplace and installs the plugin in a single step.

### Factory (Droid) quick start

1) Install Droid (Factory).

```bash
bunx droid-factory
```

What this does: copies Claude Code marketplace commands/agents/subagents and converts them to Droid format.

Next:
- Start Droid
- In Settings, enable Sub-agents

You're done: use this source from Droid. You don't need to add it in Claude Code anymore.

---

# Compounding Engineering Plugin

A Claude Code plugin that makes each unit of engineering work easier than the last. Transform how you plan, build, and review code using AI-powered tools that systematically improve your development workflow.

## What Is Compounding Engineering?

**Each unit of engineering work should make subsequent units of work easier—not harder.**

Traditional development accumulates technical debt. Every feature adds complexity. Every change increases maintenance burden. The codebase becomes harder to work with over time.

Compounding engineering inverts this. Each feature you build:
- Documents patterns for the next feature
- Creates reusable components that accelerate future work
- Establishes conventions that reduce decision fatigue
- Codifies knowledge that compounds across the team

This plugin provides the tools to make compounding engineering practical. It transforms vague ideas into structured plans, executes those plans systematically, and ensures every change meets your quality bar before merging.

```mermaid
graph LR
    A[Plan<br/>Plan it out<br/>in detail] --> B[Delegate<br/>Do the work]
    B --> C[Assess<br/>Make sure<br/>it works]
    C --> D[Codify<br/>Record<br/>learnings]
    D --> A

    style A fill:#f9f,stroke:#fff,stroke-width:2px,color:#333
    style B fill:#bbf,stroke:#fff,stroke-width:2px,color:#333
    style C fill:#bfb,stroke:#fff,stroke-width:2px,color:#333
    style D fill:#ffb,stroke:#fff,stroke-width:2px,color:#333
```

## How It Works

The plugin follows a three-step workflow that makes development compound:

### 1. Plan: Turn Ideas Into Structured Issues

Use `/compound-engineering:plan` to transform feature descriptions into comprehensive GitHub issues.

**What it does:**
- Researches your codebase to find similar patterns and conventions
- Analyzes framework documentation and best practices
- Creates detailed acceptance criteria and implementation plans
- Generates code examples that follow your existing patterns

**The result:** Issues that make implementation easier because they've already done the research and planning work.

### 2. Work: Execute Plans Systematically

Use `/compound-engineering:work` to execute work plans with isolated worktrees and systematic task tracking.

**What it does:**
- Creates isolated git worktrees for clean development
- Breaks down plans into trackable todos
- Executes tasks systematically with continuous validation
- Runs tests and quality checks after each change

**The result:** Features built correctly the first time, with full test coverage and no regressions.

### 3. Review: Ensure Quality Before Merging

Use `/compound-engineering:review` to perform exhaustive multi-agent code reviews.

**What it does:**
- Checks out your PR in an isolated worktree for deep analysis
- Runs 12+ specialized review agents in parallel
- Identifies security issues, performance problems, and architectural concerns
- Creates trackable todos for every finding

**The result:** Code that meets your quality bar and documents learnings for future work.

## Practical Examples

### Example: Plan a New Feature

```bash
# Create a detailed GitHub issue from a feature description
claude /compound-engineering:plan "Add user profile avatars with S3 upload and automatic resizing"
```

The command will:
1. Research how your codebase handles file uploads
2. Find similar features in your repository
3. Check framework documentation for best practices
4. Generate a complete issue with acceptance criteria, technical approach, and code examples

You can choose detail levels:
- **Minimal:** Quick issues for simple features
- **More:** Standard issues with technical considerations
- **A lot:** Comprehensive issues for major features

### Example: Execute a Work Plan

```bash
# Execute a plan document systematically
claude /compound-engineering:work path/to/plan.md
```

The command will:
1. Create a feature branch and isolated worktree
2. Analyze the plan and create a comprehensive todo list
3. Execute each task systematically
4. Run tests after every change
5. Create a pull request when complete

### Example: Review a Pull Request

```bash
# Review the latest PR
claude /compound-engineering:review

# Review a specific PR
claude /compound-engineering:review 123

# Review from a GitHub URL
claude /compound-engineering:review https://github.com/user/repo/pull/123
```

The command will:
1. Check out the PR in an isolated worktree
2. Run 12+ specialized review agents in parallel:
   - Language-specific reviewers (Rails, TypeScript, Python)
   - Security sentinel for vulnerability scanning
   - Performance oracle for optimization opportunities
   - Architecture strategist for design review
   - Data integrity guardian for database concerns
3. Present findings one by one for triage
4. Create todos for approved findings

## All Commands

The plugin includes six commands for different stages of development:

### `/compound-engineering:plan [feature description]`
Creates detailed GitHub issues from feature descriptions. Includes research, acceptance criteria, and implementation guidance.

### `/compound-engineering:work [plan file]`
Executes work plans systematically with worktrees, todos, and continuous validation.

### `/compound-engineering:review [PR number or URL]`
Performs exhaustive multi-agent code reviews with security, performance, and architecture analysis.

### `/compound-engineering:triage`
Presents findings one by one for review and converts approved items into trackable todos.

### `/compound-engineering:resolve_todo_parallel`
Resolves multiple todos in parallel with systematic execution and quality checks.

### `/compound-engineering:generate_command`
Generates new Claude Code commands from descriptions.

## All Agents

The plugin includes 17 specialized agents that provide expertise in different areas:

### Code Review Specialists
- **kieran-rails-reviewer:** Strict Rails code review with focus on conventions and simplicity
- **kieran-typescript-reviewer:** TypeScript code review with type safety and best practices
- **kieran-python-reviewer:** Python code review with focus on clarity and conventions
- **dhh-rails-reviewer:** Rails review from DHH's philosophy of simplicity
- **code-simplicity-reviewer:** Identifies opportunities to simplify complex code

### Quality Guardians
- **security-sentinel:** Comprehensive security audits and vulnerability detection
- **performance-oracle:** Performance analysis and optimization recommendations
- **data-integrity-guardian:** Database design review and data consistency checks

### Architecture & Patterns
- **architecture-strategist:** System design review and architectural guidance
- **pattern-recognition-specialist:** Identifies patterns and suggests improvements

### Research & Analysis
- **repo-research-analyst:** Analyzes repository patterns and conventions
- **best-practices-researcher:** Researches best practices for technologies
- **framework-docs-researcher:** Fetches relevant framework documentation
- **git-history-analyzer:** Analyzes git history for context and patterns

### Workflow & Communication
- **every-style-editor:** Edits content to match Every's style guide
- **feedback-codifier:** Converts feedback into actionable improvements
- **pr-comment-resolver:** Systematically resolves PR review comments

## Why This Makes Development Compound

Traditional development tools help you work faster. Compounding engineering tools make future work easier.

**Every `/compound-engineering:plan` you create:**
- Documents patterns that inform the next plan
- Establishes conventions that reduce planning time
- Builds institutional knowledge

**Every `/compound-engineering:work` execution:**
- Creates reusable components
- Refines your testing approach
- Improves your development process

**Every `/compound-engineering:review` you run:**
- Catches issues earlier
- Documents learnings for the team
- Raises the quality bar systematically

Over time, you're not just building features—you're building a development system that gets better with each use.

## Philosophy in Practice

The plugin embodies these compounding engineering principles:

**Prefer duplication over complexity:** Simple, clear code that's easy to understand beats complex abstractions. The kieran-rails-reviewer enforces this strictly.

**Document as you go:** Every command generates documentation—issues, todos, review findings—that makes future work easier.

**Quality compounds:** High-quality code is easier to modify. The multi-agent review system ensures every change meets your quality bar.

**Systematic beats heroic:** Consistent processes beat individual heroics. The `/compound-engineering:work` command executes plans systematically, with continuous validation.

**Knowledge should be codified:** Learnings should be captured and reused. The research agents analyze your codebase to apply your own patterns back to you.

## Getting Started

1. Install the plugin using one of the methods above
2. Run `/compound-engineering:plan` on your next feature idea
3. Use `/compound-engineering:work` to execute the plan
4. Run `/compound-engineering:review` before merging
5. Repeat, and watch your development process compound

Each cycle makes the next cycle easier. That's compounding engineering.

## Learn More

[Read the full story](https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it) about how compounding engineering transforms development workflows.