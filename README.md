# Compound Engineering (Frontend Focus)

AI skills that make each unit of engineering work easier than the last.

This is a streamlined fork of [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin), focused on the workflow of a frontend engineering team building large-scale client-side rendered React + TypeScript applications. The converter/marketplace/release infrastructure and skills outside a frontend team's workflow (iOS testing, feedback ops, product analytics, launch copy, the Proof editor) have been removed. The 26 remaining skills are domain-agnostic engineering workflow skills plus browser/frontend QA skills.

## Philosophy

**Each unit of engineering work should make subsequent units easier -- not harder.**

Invocation syntax: this README uses `/skill-name` examples for slash-skill hosts. In Codex, invoke installed skills with `$skill-name` (for example, `$ce-plan` and `$lfg`); `/goal` remains a Codex built-in command.

Traditional development accumulates technical debt. Every feature adds complexity. Every bug fix leaves behind a little more local knowledge that someone has to rediscover later. The codebase gets larger, the context gets harder to hold, and the next change becomes slower.

Compound engineering inverts this. 80% is in planning and review, 20% is in execution:

- Plan thoroughly before writing code with `/ce-brainstorm` and `/ce-plan` using one readiness-based plan artifact
- Review to catch issues and calibrate judgment with `/ce-code-review` and `/ce-doc-review`
- Codify knowledge so it is reusable with `/ce-compound`
- Keep quality high so future changes are easy

The point is not ceremony. The point is leverage. A good brainstorm makes the plan sharper. A good plan makes execution smaller. A good review catches the pattern, not just the bug. A good compound note means the next agent does not have to learn the same lesson from scratch.

**Learn more**

- [Skill documentation catalog](docs/skills/README.md)
- [Compound engineering: how Every codes with agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)


## Workflow

The core loop is six steps: **brainstorm** the requirements, **plan** the implementation, **work** through the plan, **simplify** what you wrote, **review** the result, then **compound** the learning -- and repeat with better context.

| Skill | Purpose |
|-------|---------|
| [`/ce-brainstorm`](docs/skills/ce-brainstorm.md) | Interactive Q&A to think through a feature or problem and write a requirements-only unified plan before planning |
| [`/ce-plan`](docs/skills/ce-plan.md) | Enrich feature ideas or requirements-only plans into implementation-ready plans |
| [`/ce-work`](docs/skills/ce-work.md) | Execute implementation-ready plans with worktrees and task tracking |
| [`/ce-simplify-code`](docs/skills/ce-simplify-code.md) | Refine the freshly written code for clarity and reuse before review |
| [`/ce-code-review`](docs/skills/ce-code-review.md) | Multi-agent review against the plan before merging; local apply is explicit |
| [`/ce-compound`](docs/skills/ce-compound.md) | Capture the learning into `docs/solutions/` so the next loop starts smarter |

Each cycle compounds: `/ce-compound` writes learnings that the next `/ce-brainstorm` and `/ce-plan` read as grounding -- brainstorms sharpen plans, plans inform future plans, reviews catch more issues, patterns get documented. That return arrow is the whole point.

### Additional skills

These sit around the loop or get reached for on demand -- not every cycle needs them.

| Skill | When to reach for it |
|-------|---------|
| [`/ce-ideate`](docs/skills/ce-ideate.md) | *Before the loop*, when you don't yet know what to build -- generates and critically ranks grounded ideas, then routes the strongest one into `/ce-brainstorm` |
| [`/ce-strategy`](docs/skills/ce-strategy.md) | *Upstream anchor* -- creates and maintains `STRATEGY.md`, read as grounding by ideate, brainstorm, and plan so strategy choices flow into every feature |
| [`/ce-debug`](docs/skills/ce-debug.md) | *Instead of brainstorm -> plan -> work* when the input is a bug rather than a feature -- reproduce, trace root cause, fix, then polish/review before PR handoff when warranted |
| [`/ce-pov`](docs/skills/ce-pov.md) | *On demand, before you commit* -- a decisive, project-grounded verdict on whether to adopt, switch to, or revisit an external technology, library, pattern, or platform |
| [`/ce-explain`](docs/skills/ce-explain.md) | *On demand, to keep learning* -- turns a concept, a diff, an idea, or "what did I do this week?" into a dense, visual explainer written for you personally |

For the full catalog and how each skill chains together, see [docs/skills](docs/skills/README.md). The complete inventory is [below](#full-skill-inventory).

## Quick Example

**Finding a direction** -- when you don't have a specific idea yet, ideate first, then carry the strongest survivor into the loop:

```text
/ce-ideate new canvas interactions
/ce-ideate surprise me
/ce-ideate github issues   # ground ideas in your open issues instead of a prompt
```

`/ce-ideate` does the homework first (codebase, past learnings, prior art on the web, optionally your issue tracker), then hands you a ranked set of grounded candidates to take into `/ce-brainstorm`.

**Standard feature loop** -- turn a rough idea into shipped, reviewed code:

```text
/ce-brainstorm make the data table virtualize rows over 10k
/ce-plan
/ce-work
/ce-simplify-code
/ce-code-review
/ce-compound
```

**Simplifying code** -- use it after fresh implementation work, or point it at code that keeps slowing changes down:

```text
/ce-simplify-code
/ce-simplify-code simplify the code in my most-churned file
```

The first pass tightens recent branch changes before review. The targeted pass is useful when one file keeps absorbing unrelated fixes, follow-ups, or merge conflicts.

**Debugging a bug** -- when you start from broken behavior instead of a feature:

```text
/ce-debug the Konva layer flickers on rapid re-renders
/ce-code-review
/ce-compound
```

**Autonomous** -- hand off a feature and let the agent run the whole pipeline:

```text
/ce-brainstorm describe the feature
/lfg
```

`/lfg` runs the loop hands-off: it plans, works through the plan, simplifies, runs code review and applies the fixes, runs browser tests, commits, pushes, opens a PR, then watches CI and repairs failures until it's green. Start it after `/ce-brainstorm` so it plans against real requirements rather than a one-line prompt. It's the autopilot version of the standard loop -- neat when you want to step away and come back to an open, green PR.

## Getting Started

After installing the skills in your agent harness, run `/ce-setup` in any project. It checks repo-local config, reports optional tool capabilities, and helps keep machine-local settings safely gitignored.

The plugin ships 26 skills. Specialist review, research, and workflow behavior lives inside the owning skills as skill-local prompt assets.

### Full Skill Inventory

| Skill | Purpose |
|-------|---------|
| [`/ce-strategy`](docs/skills/ce-strategy.md) | Create or maintain `STRATEGY.md` |
| [`/ce-ideate`](docs/skills/ce-ideate.md) | Generate and critically evaluate grounded ideas |
| [`/ce-pov`](docs/skills/ce-pov.md) | Form a decisive, project-grounded verdict on an external input |
| [`/ce-explain`](docs/skills/ce-explain.md) | Explain a concept, diff, idea, or window of your own work as a personal learning artifact |
| [`/ce-brainstorm`](docs/skills/ce-brainstorm.md) | Explore requirements and write a right-sized requirements doc |
| [`/ce-plan`](docs/skills/ce-plan.md) | Create structured implementation plans |
| [`/ce-work`](docs/skills/ce-work.md) | Execute implementation-ready plans with worktrees and task tracking |
| [`/ce-code-review`](docs/skills/ce-code-review.md) | Review code with skill-local reviewer personas |
| [`/ce-doc-review`](docs/skills/ce-doc-review.md) | Review requirements and plan documents |
| [`/ce-debug`](docs/skills/ce-debug.md) | Reproduce failures, trace root cause, fix bugs, and prepare non-trivial fixes for PR |
| [`/ce-compound`](docs/skills/ce-compound.md) | Document solved problems to compound team knowledge |
| [`/ce-compound-refresh`](docs/skills/ce-compound-refresh.md) | Refresh stale or drifting learnings |
| [`/ce-optimize`](docs/skills/ce-optimize.md) | Run iterative optimization loops |

| [`/ce-resolve-pr-feedback`](docs/skills/ce-resolve-pr-feedback.md) | Resolve PR review feedback |
| [`/ce-commit`](docs/skills/ce-commit.md) | Create a git commit with a clear message |
| [`/ce-commit-push-pr`](docs/skills/ce-commit-push-pr.md) | Commit, push, and open a PR that teaches any concept the change newly introduces |
| [`/ce-babysit-pr`](docs/skills/ce-babysit-pr.md) | Watch an open PR and keep it moving toward merge, reacting to review comments and CI as they arrive |
| [`/ce-worktree`](docs/skills/ce-worktree.md) | Ensure work happens in an isolated git worktree |
| [`/ce-test-browser`](docs/skills/ce-test-browser.md) | Run browser tests on PR-affected pages |
| [`/ce-setup`](docs/skills/ce-setup.md) | Diagnose optional tool capabilities and project config |
| [`/ce-simplify-code`](docs/skills/ce-simplify-code.md) | Simplify recent code changes |
| [`/ce-polish`](docs/skills/ce-polish.md) | Start a dev server and iterate on UX polish |
| [`/ce-dogfood`](docs/skills/ce-dogfood.md) | Hands-off diff-scoped browser QA of the active branch, with autonomous fixes |
| [`/ce-jira-update`](docs/skills/ce-jira-update.md) | After PR approval, update the Jira ticket's description and Test Behaviors field from the branch diff |
| [`/ce-fix-bugs`](docs/skills/ce-fix-bugs.md) | Walk through every open item on a Jira ticket's checklist, one commit per item on a per-ticket branch, then flip fixed items to `qa ready` by rewriting the checklist markdown via the MCP server |
| [`/lfg`](docs/skills/lfg.md) | Full autonomous engineering workflow |

---


## License

[MIT](LICENSE)
