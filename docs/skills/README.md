# Skill Documentation

End-user-facing documentation for compound-engineering plugin skills. Each page covers the skill's high-level purpose, novel mechanics, use cases, and chain position relative to other skills.

For runtime behavior and contributor reference, the `SKILL.md` in each skill's source folder under `skills/` is authoritative.

Checkout-local defaults shared across skills are documented in [Compound Engineering configuration](./configuration.md).

Artifact paths shown throughout these pages (`docs/plans/`, `docs/solutions/`, `docs/ideation/`, and the rest) are the **defaults**. A project can relocate every CE artifact folder under one repo-relative root with `docs_root`; when it is set, read the shown paths as `<your-docs_root>/plans/`, `<your-docs_root>/solutions/`, and so on. See [Artifact root](./configuration.md#artifact-root).

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
| [`/ce-brainstorm`](./ce-brainstorm.md) | Define what something should become — collaborative dialogue, named gap lenses, requirements-only unified plan |
| [`/ce-plan`](./ce-plan.md) | Bound execution with guardrails — enrich unified plans with U-IDs, test scenarios, automatic confidence check; WHAT decisions, not HOW code |
| [`/ce-work`](./ce-work.md) | Execute against implementation-ready plan guardrails — figure out the HOW with code in front of you, ship through quality gates |
| [`/ce-compound`](./ce-compound.md) | Close the loop by capturing what you learned into `docs/solutions/` so the next iteration starts smarter — bug track + knowledge track |

---

## Around the Loop

Skills that anchor, feed, or maintain the loop without being steps inside it.

| Skill | Description |
|-------|-------------|
| [`/ce-strategy`](./ce-strategy.md) | Create or maintain `STRATEGY.md` — the upstream anchor read by `ce-ideate`, `ce-brainstorm`, and `ce-plan` as grounding |
| [`/ce-product-pulse`](./ce-product-pulse.md) | Outer feedback loop — single-page time-windowed report on usage, performance, errors, followups; saved to `docs/pulse-reports/` as a timeline |
| [`/ce-sweep`](./ce-sweep.md) | Recurring feedback sweep — ingest Slack/GitHub items (email experimental) since per-source cursors, acknowledge at source, analyze recordings, verify fixes merged, and reconcile an `/lfg`-ready rolling plan |
| [`/ce-compound-refresh`](./ce-compound-refresh.md) | Maintain `docs/solutions/` over time — five outcomes (Keep / Update / Consolidate / Replace / Delete), Interactive + Autofix modes |

---

## On-Demand

Invoked when a specific need arises — not part of any chain.

| Skill | Description |
|-------|-------------|
| [`/ce-pov`](./ce-pov.md) | Form a decisive, project-grounded POV as an adoption verdict, holistic document take, or position on supplied approaches — optional named/`oracle` panel with a blind initial round, bounded evidence-based reconciliation, and a user-extensible checkpoint |
| [`/ce-explain`](./ce-explain.md) | Turn a concept, a diff, an idea, or a window of your own recent work into a dense, self-contained visual document built to keep — evidence-grounded recaps, capability-detected destination ask, optional opt-in check-in (predict-then-reveal for diffs, corrected exercises) |
| [`/ce-debug`](./ce-debug.md) | Find root causes systematically — causal chain gate, predictions, post-fix polish/review, PR handoff |
| [`/ce-code-review`](./ce-code-review.md) | Structured code review with skill-local reviewer personas, confidence-gated findings, four modes |
| [`/ce-doc-review`](./ce-doc-review.md) | Review requirements or plan documents using skill-local reviewer personas — coherence, feasibility, product-lens, design-lens, security-lens, scope-guardian, adversarial |
| [`/ce-simplify-code`](./ce-simplify-code.md) | Refine recently changed code — reuse, quality, and efficiency review; behavior preservation verified |
| [`/ce-optimize`](./ce-optimize.md) | Metric-driven iterative optimization loops — three-tier evaluation, parallel experiments, persistence discipline |

---

## Research & Context

| Skill | Description |
|-------|-------------|
| [`/ce-riffrec-feedback-analysis`](./ce-riffrec-feedback-analysis.md) | Turn raw [Riffrec](https://github.com/kieranklaassen/riffrec) recordings into structured feedback — quick bug or extensive analysis with `ce-brainstorm` handoff |

---

## Git Workflow

| Skill | Description |
|-------|-------------|
| [`/ce-commit`](./ce-commit.md) | Create a single, well-crafted git commit — convention-aware, sensitive-file-safe, file-level logical splitting |
| [`/ce-commit-push-pr`](./ce-commit-push-pr.md) | Go from working changes to an open PR with adaptive descriptions, related-reference handling, three modes (full workflow / description update / description-only generation), and a concept-teaching section for anything the change newly introduces |
| [`/ce-babysit-pr`](./ce-babysit-pr.md) | Watch an open PR and keep it moving toward merge — react to incoming review comments (via `/ce-resolve-pr-feedback`) and CI failures (via `/ce-debug`) as each arrives, comments-first, with a crash-safe resumable tick, continuous or checkpoint mode per harness, and a settle window that avoids premature "ready to merge" |
| [`/ce-worktree`](./ce-worktree.md) | Ensure work happens in an isolated git worktree — detect existing isolation, prefer the harness's native worktree tool, fall back to plain git |

---

## Autonomous Pipeline

| Skill | Description |
|-------|-------------|
| [`/lfg`](./lfg.md) | Run the full hands-off engineering pipeline through a green PR, then conditionally recommend an opt-in fresh-session handoff for the next separately planned area |

---

## Frontend Design

| Skill | Description |
|-------|-------------|
| [`/ce-polish`](./ce-polish.md) | Conversational UX polish — start dev server, open browser, iterate together; auto-detects 8 frameworks (manual invocation only) |

---

## Collaboration

| Skill | Description |
|-------|-------------|
| [`/ce-proof`](./ce-proof.md) | Publish, view, comment on, and edit markdown via [Proof](https://www.proofeditor.ai), Every's collaborative editor — hosted v3 web API with owner credential lifecycle |

---

## Workflow Utilities

| Skill | Description |
|-------|-------------|
| [`/ce-promote`](./ce-promote.md) | Draft user-facing announcement copy for a shipped feature (X, changelog, LinkedIn, email) — voice-matched via the optional Spiral CLI, a lite layer of editorial & social expertise without it, drafts only |
| [`/ce-resolve-pr-feedback`](./ce-resolve-pr-feedback.md) | Evaluate, fix, and reply to PR review feedback in parallel — including nitpicks |
| [`/ce-dogfood`](./ce-dogfood.md) | Hands-off diff-scoped browser QA of the active branch — maps flows, autonomously fixes small breakages with regression tests and commits, writes a durable report (manual invocation only) |
| [`/ce-test-browser`](./ce-test-browser.md) | End-to-end browser tests using a host-native browser with `agent-browser` fallback |
| [`/ce-test-xcode`](./ce-test-xcode.md) | Build and test iOS apps on simulator using XcodeBuildMCP — screenshots, logs, human verification |
| [`/ce-setup`](./ce-setup.md) | Diagnose optional tool capabilities and bootstrap safe project-local config |
| [`/ce-handoff`](./ce-handoff.md) | Create a session handoff at the default temp store or a requested destination, then discover or orient from a selected source — no automatic continuation |

---

## See also

For the top-level install and usage guide, see [`README.md`](../../README.md). Each skill's authoritative runtime spec is in `skills/<skill>/SKILL.md`.
