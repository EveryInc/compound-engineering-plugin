# Skill Documentation

End-user-facing documentation for compound-engineering plugin skills. Each page covers the skill's high-level purpose, novel mechanics, use cases, and chain position relative to other skills.

For runtime behavior and contributor reference, the `SKILL.md` in each skill's source folder under `plugins/compound-engineering/skills/` is authoritative.

---

## The compound-engineering core loop

```text
┌─→ /ce-brainstorm    "What does this need to be?"
│       │
│       ▼
│   /ce-plan          "What's needed to accomplish this?"
│       │
│       ▼
│   /ce-work          "Build it."
│       │
│       ▼
└── /ce-compound      "Capture what we learned."
```

`/ce-compound` is the closer that makes the loop *compound*: it writes learnings into `docs/solutions/`, which the next iteration's `/ce-brainstorm` and `/ce-plan` read as grounding — that return arrow is the whole point. Everything else in this catalog is either an anchor around the loop or an on-demand tool used when a specific need arises — not a step you walk through every time.

---

## The Core Loop

The steps of every engineering iteration. They run in order per piece of work.

| Skill | Description |
|-------|-------------|
| [`/ce-brainstorm`](./ce-brainstorm.md) | Define what something should become — collaborative dialogue, named gap lenses, right-sized requirements doc |
| [`/ce-plan`](./ce-plan.md) | Bound execution with guardrails — U-IDs, test scenarios, automatic confidence check; WHAT decisions, not HOW code |
| [`/ce-work`](./ce-work.md) | Execute against the plan's guardrails — figure out the HOW with code in front of you, ship through quality gates |
| [`/ce-compound`](./ce-compound.md) | Close the loop by capturing what you learned into `docs/solutions/` so the next iteration starts smarter — bug track + knowledge track |

---

## On-Demand

Invoked when a specific need arises — not part of any chain.

| Skill | Description |
|-------|-------------|
| [`/ce-debug`](./ce-debug.md) | Find root causes systematically — causal chain gate, predictions for uncertain links, smart escalation |
| [`/ce-code-review`](./ce-code-review.md) | Structured code review with tiered persona agents, confidence-gated findings, four modes |
| [`/ce-doc-review`](./ce-doc-review.md) | Review requirements or plan documents using parallel persona agents — coherence, feasibility (with interior design and security lenses), adversarial-document (with interior strategic and scope lenses) |
| [`/ce-simplify-code`](./ce-simplify-code.md) | Refine recently changed code — three parallel reviewer agents (reuse, quality, efficiency); behavior preservation verified |

---

## Research & Context

| Skill | Description |
|-------|-------------|
| [`/ce-sessions`](./ce-sessions.md) | Search session history across Claude Code, Codex, and Cursor for context relevant to a question |

---

## Git Workflow

| Skill | Description |
|-------|-------------|
| [`/ce-commit-push-pr`](./ce-commit-push-pr.md) | Go from working changes to an open PR with adaptive descriptions — four modes (full workflow / commit-only / description update / description-only generation) |
| [`/ce-worktree`](./ce-worktree.md) | Create a git worktree at `.worktrees/<branch>` with `.env` copying, branch-aware dev-tool trust, and gitignore management |

---

## Frontend Design

| Skill | Description |
|-------|-------------|
| [`/ce-frontend-design`](./ce-frontend-design.md) | Build web interfaces with genuine design quality — context detection, visual-thesis pre-build, opinionated defaults, visual verification |

---

## Workflow Utilities

| Skill | Description |
|-------|-------------|
| [`/ce-setup`](./ce-setup.md) | Diagnose environment, install missing tools, bootstrap project-local config — interactive onboarding in one flow |
| [`/ce-update`](./ce-update.md) | Check the installed compound-engineering plugin version against `main` and recommend the update command (Claude Code only) |

---

## See also

For the complete catalog of skills (including those without dedicated docs here), see [`plugins/compound-engineering/README.md`](../../plugins/compound-engineering/README.md). Each skill's authoritative runtime spec is in `plugins/compound-engineering/skills/<skill>/SKILL.md`.
