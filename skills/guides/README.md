# Skill Documentation

End-user-facing documentation for compound-engineering plugin skills. Each page covers the skill's high-level purpose, novel mechanics, use cases, and chain position relative to other skills.

For runtime behavior and contributor reference, the `SKILL.md` in each skill's source folder under `skills/` is authoritative.

Checkout-local defaults shared across skills are documented in [Compound Engineering configuration](./configuration.md). Prescriptive rule packs the pipeline grounds in are documented in [Compound Packs](./packs.md).

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

`/ce-compound` is the closer that makes the loop *compound*: it writes learnings into `docs/solutions/`, which the next iteration's `/ce-brainstorm` and `/ce-plan` read as grounding. That return arrow is the whole point. `/ce-ideate` is an optional prelude for when you don't yet know what to work on. Everything else in this catalog is either an anchor around the loop or an on-demand tool used when a specific need arises, not a step you walk through every time.

---

## The Core Loop

The steps of every engineering iteration. `/ce-ideate` runs only when you need to find a direction first; the other four run in order per piece of work.

| Skill | Description |
|-------|-------------|
| [`/ce-ideate`](./ce-ideate.md) | *Optional first step*: discover grounded directions worth exploring (six frames, tagged basis, adversarial cut) |
| [`/ce-brainstorm`](./ce-brainstorm.md) | Define what something should become: one question at a time, ask only decisions, named gap lenses, requirements-only unified plan |
| [`/ce-plan`](./ce-plan.md) | Bound execution with guardrails (U-IDs, test scenarios, automatic confidence check). WHAT decisions, not HOW code |
| [`/ce-work`](./ce-work.md) | Execute an implementation-ready plan: figure out the HOW with code in front of you, then ship through quality gates |
| [`/ce-compound`](./ce-compound.md) | Close the loop by writing what you learned into `docs/solutions/` so the next iteration can read it |

---

## Around the Loop

Skills that anchor, feed, or maintain the loop without being steps inside it.

| Skill | Description |
|-------|-------------|
| [`/ce-strategy`](./ce-strategy.md) | Create or maintain `STRATEGY.md`, the upstream anchor `ce-ideate`, `ce-brainstorm`, and `ce-plan` read as grounding |
| [`/ce-product-pulse`](./ce-product-pulse.md) | Outer observation loop: a time-windowed report on usage, performance, errors, and follow-ups, saved to `docs/pulse-reports/` |
| [`/ce-sweep`](./ce-sweep.md) | Recurring feedback sweep: ingest Slack/GitHub items (email experimental), acknowledge at source, and keep an `/lfg`-ready rolling plan |
| [`/ce-compound-refresh`](./ce-compound-refresh.md) | Maintain `docs/solutions/` over time (Keep / Update / Consolidate / Replace / Delete), Interactive or Autofix |

---

## On-Demand

Invoked when a specific need arises, not part of any chain.

| Skill | Description |
|-------|-------------|
| [`/ce-pov`](./ce-pov.md) | A project-grounded verdict: adopt/hold/reject, a document take, or a position on supplied approaches. Optional named/`oracle` panel. |
| [`/ce-explain`](./ce-explain.md) | A durable teaching document for a concept, a diff, an idea, or a window of recent work. Optional opt-in check-in. |
| [`/ce-prototype`](./ce-prototype.md) | Build a throwaway prototype so someone can experience how the product should work, feel, or read, then write those decisions into an existing plan or continue into brainstorm or plan |
| [`/ce-debug`](./ce-debug.md) | Find the root cause of broken behavior: causal chain, predictions, then an optional fix and PR handoff |
| [`/ce-code-review`](./ce-code-review.md) | Structured review of a diff or PR: skill-local personas, confidence-gated findings |
| [`/ce-doc-review`](./ce-doc-review.md) | Structured review of a requirements or plan document: findings, not a holistic verdict |
| [`/ce-simplify-code`](./ce-simplify-code.md) | Refine recently changed code for reuse, quality, and efficiency, with behavior preserved |
| [`/ce-optimize`](./ce-optimize.md) | Metric-driven optimization loops with parallel experiments and a durable experiment log |
| [`/ce-retune`](./ce-retune.md) | Retune a skill corpus for a new model: baseline, noise floor, then measured cut passes |

---

## Research & Context

| Skill | Description |
|-------|-------------|
| [`/ce-riffrec-feedback-analysis`](./ce-riffrec-feedback-analysis.md) | Turn a [Riffrec](https://github.com/kieranklaassen/riffrec) recording into structured feedback: a quick bug in chat, or an extensive analysis that hands off to `ce-brainstorm` |

---

## Git Workflow

| Skill | Description |
|-------|-------------|
| [`/ce-commit`](./ce-commit.md) | Local git commit(s) only: convention-aware, named-file staging, file-level splits (up to three). No push. |
| [`/ce-commit-push-pr`](./ce-commit-push-pr.md) | Working changes to an open PR. Three modes: full ship, rewrite an existing description, or description-only from a URL. |
| [`/ce-babysit-pr`](./ce-babysit-pr.md) | Watch an open PR over time: incoming review via `/ce-resolve-pr-feedback`, CI via `/ce-debug`. Does not merge under `target` or `stack-ready`; `stack-land` can merge a confirmed managed stack. |
| [`/ce-worktree`](./ce-worktree.md) | Isolate work in a git worktree: detect existing isolation, prefer the host's native tool, else plain git |

---

## Autonomous Pipeline

| Skill | Description |
|-------|-------------|
| [`/lfg`](./lfg.md) | Hands-off pipeline through an open PR (plan, implement, review, ship, bounded CI watch). Pushes without prompting when a remote exists; local commits only otherwise. Does not merge. |

---

## Frontend Design

| Skill | Description |
|-------|-------------|
| [`/ce-polish`](./ce-polish.md) | Conversational UX polish on a feature that already works: start the dev server, open a browser, iterate. Manual invoke only. |

---

## Collaboration

| Skill | Description |
|-------|-------------|
| [`/ce-proof`](./ce-proof.md) | Publish, view, comment on, or pull markdown via [Proof](https://www.proofeditor.ai). One-way publish; not a review skill. |

---

## Workflow Utilities

| Skill | Description |
|-------|-------------|
| [`/ce-promote`](./ce-promote.md) | Draft announcement copy for a shipped feature (X, changelog, LinkedIn, email, blog, demo). Drafts only; never posts. |
| [`/ce-resolve-pr-feedback`](./ce-resolve-pr-feedback.md) | One pass to evaluate, fix, and reply to PR review comments, including nitpicks. Babysit is the watch that calls this. |
| [`/ce-dogfood`](./ce-dogfood.md) | Hands-off browser QA of the branch: map flows, fix small breakages, write a report. Manual invoke only. |
| [`/ce-test-browser`](./ce-test-browser.md) | End-to-end browser tests of the current diff using a host-native browser with `agent-browser` fallback. Does not check out a PR or branch. |
| [`/ce-test-xcode`](./ce-test-xcode.md) | Build and test an iOS app on the simulator (screenshots, logs, human verification). Not XCUITest. |
| [`/ce-setup`](./ce-setup.md) | Diagnose optional tool capabilities and create or repair repo `config.yaml` |
| [`/ce-handoff`](./ce-handoff.md) | Write a session handoff, or find and orient from a selected source. Does not auto-continue. |

---

## See also

For the top-level install and usage guide, see [`README.md`](../../README.md). Each skill's authoritative runtime spec is in `skills/<skill>/SKILL.md`.
