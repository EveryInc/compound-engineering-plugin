# Skill Documentation

End-user-facing documentation for compound-engineering plugin skills. Each page covers the skill's high-level purpose, novel mechanics, use cases, and chain position relative to other skills.

For runtime behavior and contributor reference, the `SKILL.md` in each skill's source folder under `plugins/compound-engineering/skills/` is authoritative.

---

## The compound-engineering core loop

```text
   [/ce-ideate]       (optional) "What's worth exploring?"
        │
        ▼
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

`/ce-compound` is the closer that makes the loop *compound*: it writes learnings into `docs/solutions/`, which the next iteration's `/ce-brainstorm` and `/ce-plan` read as grounding — that return arrow is the whole point. `/ce-ideate` is an optional prelude for when you don't yet know what to work on. Everything else in this catalog is either an anchor around the loop or an on-demand tool used when a specific need arises — not a step you walk through every time.

---

## The Core Loop

The steps of every engineering iteration. `/ce-ideate` runs only when you need to find a direction first; the other four run in order per piece of work.

| Skill | Description |
|-------|-------------|
| [`/ce-ideate`](./ce-ideate.md) | *Optional first step* — discover strong, qualified directions worth exploring with six conceptual frames, warrant requirement, adversarial filtering |
| [`/ce-brainstorm`](./ce-brainstorm.md) | Define what something should become — collaborative dialogue, named gap lenses, right-sized requirements doc |
| [`/ce-plan`](./ce-plan.md) | Bound execution with guardrails — U-IDs, test scenarios, automatic confidence check; WHAT decisions, not HOW code |
| [`/ce-work`](./ce-work.md) | Execute against the plan's guardrails — figure out the HOW with code in front of you, ship through quality gates |
| [`/ce-compound`](./ce-compound.md) | Close the loop by capturing what you learned into `docs/solutions/` so the next iteration starts smarter — bug track + knowledge track |

---

## Around the Loop

Skills that anchor, feed, or maintain the loop without being steps inside it.

| Skill | Description |
|-------|-------------|
| [`/ce-strategy`](./ce-strategy.md) | Create or maintain `STRATEGY.md` — the upstream anchor read by `ce-ideate`, `ce-brainstorm`, and `ce-plan` as grounding |
| [`/ce-product-pulse`](./ce-product-pulse.md) | Outer feedback loop — single-page time-windowed report on usage, performance, errors, followups; saved to `docs/pulse-reports/` as a timeline |
| [`/ce-compound-refresh`](./ce-compound-refresh.md) | Maintain `docs/solutions/` over time — five outcomes (Keep / Update / Consolidate / Replace / Delete), Interactive + Autofix modes |

---

## On-Demand

Invoked when a specific need arises — not part of any chain.

| Skill | Description |
|-------|-------------|
| [`/ce-debug`](./ce-debug.md) | Find root causes systematically — causal chain gate, predictions for uncertain links, smart escalation |
| [`/ce-code-review`](./ce-code-review.md) | Structured code review with tiered persona agents, confidence-gated findings, four modes |
| [`/ce-doc-review`](./ce-doc-review.md) | Review requirements or plan documents using parallel persona agents — coherence, feasibility, product-lens, design-lens, security-lens, scope-guardian, adversarial |
| [`/ce-simplify-code`](./ce-simplify-code.md) | Refine recently changed code — three parallel reviewer agents (reuse, quality, efficiency); behavior preservation verified |
| [`/ce-optimize`](./ce-optimize.md) | Metric-driven iterative optimization loops — three-tier evaluation, parallel experiments, persistence discipline |

---

## Research & Context

| Skill | Description |
|-------|-------------|
| [`/ce-sessions`](./ce-sessions.md) | Search session history across Claude Code, Codex, and Cursor for context relevant to a question |
| [`/ce-slack-research`](./ce-slack-research.md) | Search Slack for interpreted organizational context — workspace identity, research-value assessment, cross-cutting analysis |
| [`/ce-riffrec-feedback-analysis`](./ce-riffrec-feedback-analysis.md) | Turn raw [Riffrec](https://github.com/kieranklaassen/riffrec) recordings into structured feedback — quick bug or extensive analysis with `ce-brainstorm` handoff |

---

## Git Workflow

| Skill | Description |
|-------|-------------|
| [`/ce-commit`](./ce-commit.md) | Create a single, well-crafted git commit — convention-aware, sensitive-file-safe, file-level logical splitting |
| [`/ce-commit-push-pr`](./ce-commit-push-pr.md) | Go from working changes to an open PR with adaptive descriptions — three modes (full workflow / description update / description-only generation) |
| [`/ce-clean-gone-branches`](./ce-clean-gone-branches.md) | Delete local branches whose remote tracking branch is gone, including any associated worktrees |
| [`/ce-worktree`](./ce-worktree.md) | Create a git worktree at `.worktrees/<branch>` with `.env` copying, branch-aware dev-tool trust, and gitignore management |

---

## Frontend Design

| Skill | Description |
|-------|-------------|
| [`/ce-frontend-design`](./ce-frontend-design.md) | Build web interfaces with genuine design quality — context detection, visual-thesis pre-build, opinionated defaults, visual verification |

---

## Collaboration

| Skill | Description |
|-------|-------------|
| [`/ce-proof`](./ce-proof.md) | Create, share, and run human-in-the-loop review loops over markdown via [Proof](https://www.proofeditor.ai), Every's collaborative editor — Web API and Local Bridge surfaces |

---

## Workflow Utilities

| Skill | Description |
|-------|-------------|
| [`/ce-demo-reel`](./ce-demo-reel.md) | Capture visual evidence (GIF, terminal recording, screenshots) for PR descriptions — strict separation from test output |
| [`/ce-resolve-pr-feedback`](./ce-resolve-pr-feedback.md) | Evaluate, fix, and reply to PR review feedback in parallel — including nitpicks |
| [`/ce-test-browser`](./ce-test-browser.md) | End-to-end browser tests on PR / branch-affected pages using `agent-browser` exclusively |
| [`/ce-test-xcode`](./ce-test-xcode.md) | Build and test iOS apps on simulator using XcodeBuildMCP — screenshots, logs, human verification |
| [`/ce-setup`](./ce-setup.md) | Diagnose environment, install missing tools, bootstrap project-local config — interactive onboarding in one flow |
| [`/ce-update`](./ce-update.md) | Check the installed compound-engineering plugin version against `main` and recommend the update command (Claude Code only) |
| [`/ce-release-notes`](./ce-release-notes.md) | Look up what shipped in recent compound-engineering plugin releases — summary or specific question with version citation |
| [`/ce-report-bug`](./ce-report-bug.md) | Report a bug in the compound-engineering plugin — structured intake, automatic env gathering, GitHub issue creation |

---

## Beta / Experimental

| Skill | Description |
|-------|-------------|
| [`/ce-polish-beta`](./ce-polish-beta.md) | Conversational UX polish — start dev server, open browser, iterate together; auto-detects 8 frameworks |

---

## See also

For the complete catalog of skills (including those without dedicated docs here), see [`plugins/compound-engineering/README.md`](../../plugins/compound-engineering/README.md). Each skill's authoritative runtime spec is in `plugins/compound-engineering/skills/<skill>/SKILL.md`.
