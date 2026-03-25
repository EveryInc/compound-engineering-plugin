---
title: "How lfg autopilot orchestration, resumability, and the manifest contract work"
category: skill-design
date: 2026-03-24
severity: high
component: plugins/compound-engineering/skills
tags:
  - lfg
  - autopilot
  - manifest
  - resumability
  - orchestration
  - skill-chaining
  - workflow
related:
  - docs/solutions/skill-design/lfg-slfg-pipeline-orchestration-and-autopilot-mode.md
  - docs/solutions/skill-design/beta-promotion-orchestration-contract.md
  - docs/solutions/workflow/todo-status-lifecycle.md
---

# How lfg Autopilot Orchestration, Resumability, and the Manifest Contract Work

## Problem

`lfg` had moved beyond "start the workflow" and was now expected to continue from whatever state the branch was already in. That exposed several correctness gaps:

- downstream skills could detect autopilot, but not all of them wrote back the exact gate state they changed
- direct and lightweight runs had intentionally missing planning artifacts, but the manifest did not make that absence clearly intentional
- late-stage work such as review, browser verification, and wrap-up could go stale after code changed
- environmental failures in `test-browser` or `feature-video` risked derailing the whole run even when those steps were best-effort

The result was fragility in exactly the place where autopilot needed to be strongest: resuming from mid-pipeline without guessing the wrong next step.

## Root Cause

The initial autopilot contract solved only the first layer of the problem: it made automation explicit through a marker plus manifest. That was necessary, but not sufficient.

The deeper issue was control-plane ambiguity:

- the manifest carried too much optional metadata and too little guidance about which fields actually affected routing
- some skills consumed the manifest without clearly owning the gate they were advancing
- `lfg` still needed to infer too much from ambient repo state, especially for later stages
- best-effort steps were treated too much like hard gates, even though their most common failures are environmental rather than product-critical

In short: the workflow had a run context, but not yet a crisp stage-ownership model.

## System Model

Autopilot works best when it is treated as a small workflow runtime with one orchestrator and a few explicit invariants.

### One orchestrator owns chaining

`lfg` is the only top-level autopilot orchestrator.

That means:

- `lfg` chooses the route: `direct`, `lightweight`, or `full`
- `lfg` decides which gate is next
- `lfg` is responsible for resuming, repairing stale state, and continuing forward
- downstream skills do not decide which phase comes next on their own

This matters because chaining logic drifts quickly when every skill starts inferring workflow state from caller wording.

### The manifest is control state, not just a log

The manifest exists so `/lfg` can resume correctly without re-deriving everything from scratch on every invocation.

Its job is to answer:

- what route this run is on
- which gates are complete, pending, skipped, or blocked
- which durable artifacts already exist
- whether late-stage work was completed against the current code state or an older one

That makes the manifest part of the control plane. It is not just observability or debugging output.

### Downstream skills receive explicit runtime context

Autopilot mode is passed downstream through:

- an explicit marker
- a manifest path

That lets each skill know:

- this is part of an active autopilot run
- which manifest to read
- which gate/artifact context already exists

The durable rule is: skills should not infer autopilot from prose like "called from lfg". They should detect it from the explicit marker plus manifest.

### Stage ownership is narrow by design

The workflow is safer when each skill owns only the gate it directly changes:

- `ce:brainstorm` -> `requirements`
- `ce:plan` -> `plan`
- `ce:work` -> `implementation`
- `ce:review` -> `review`
- `test-browser` -> `verification`
- `feature-video` -> `wrap_up`

That is the right granularity because those gate transitions are exactly what changes `lfg`'s next routing decision.

### Resume is "validate, repair, continue"

When `/lfg` runs again mid-pipeline, it should:

1. Prefer the manifest when one exists
2. Validate it against durable artifacts and current repo state
3. Repair it conservatively if it is missing, stale, or inconsistent
4. Recompute the first unmet gate
5. Continue from there

That is a better model than either extreme:

- blindly trusting the manifest
- ignoring the manifest and reconstructing everything every time

## How the Flow Chains Together

The workflow is not just a list of commands. It is an ordered gate engine.

### Route first, then gates

The first decision is route:

- `direct`
- `lightweight`
- `full`

That decision changes how missing artifacts are interpreted.

For example:

- in `full`, missing requirements/plan artifacts often mean work is incomplete
- in `direct` or `lightweight`, those same missing artifacts are often intentional and should be represented as `skipped`

This is why route inference has to happen before gate inference.

### Full pipeline chaining

In the full route, `lfg` advances through:

- `requirements`
- `plan`
- `implementation`
- `review`
- `verification`
- `wrap_up`

The chaining rule is simple:

- advance only when current evidence supports the gate transition
- if a gate cannot be proven complete, leave it `pending`, `skipped`, or `blocked`
- after each downstream skill returns, update the manifest and recompute the first unmet gate

That makes the workflow resumable even when the run is interrupted between stages.

### Direct and lightweight still need manifests

Direct and lightweight runs are not "manifest-less shortcuts." They still create a run manifest immediately.

The important difference is that they intentionally mark early planning gates as skipped:

- `requirements = skipped`
- `plan = skipped`

That absence is therefore a valid part of the route contract, not evidence that the run is broken.

### Late-stage work is separate from "implementation is done"

One of the biggest coordination lessons was that an open PR or a finished coding pass does not mean the workflow is done.

Autopilot still has to reason separately about:

- review completion
- todo follow-up
- browser validation where relevant
- wrap-up artifacts
- CI state for the current HEAD

This is why later gates must remain explicit instead of being collapsed into "implementation finished".

## Solution

Use a lean manifest that exists only to improve resume correctness, then pair it with explicit gate ownership rules for the skills that actually move the workflow forward.

### 1. Keep the manifest lean and routing-oriented

The durable fields are:

- `schema_version`
- `run_id`
- `route = direct | lightweight | full`
- `status = active | completed | aborted`
- `implementation_mode = standard | swarm`
- `feature_description`
- optional `current_gate`
- `gates.requirements | gates.plan | gates.implementation | gates.review | gates.verification | gates.wrap_up`
- `artifacts.requirements_doc | artifacts.plan_doc`

Each gate carries:

- `state = complete | skipped | pending | blocked | unknown`
- `evidence`

Only late-stage gates carry a code-state freshness anchor:

- `gates.review.ref`
- `gates.verification.ref`
- `gates.wrap_up.ref`

That cut is intentional. A field should exist only if it changes what `lfg` does next or makes stale resume state safer to detect.

### 2. Treat the manifest as primary, but never blindly trusted

`lfg` should resume from the manifest when present, but it must validate that state against durable artifacts and current repo state before trusting it.

When no valid manifest exists, reconstruct conservatively from:

- current branch/worktree state
- current feature description, if any
- requirements docs and plan docs tied to the branch/topic
- plan checkbox progress
- non-doc implementation changes
- PR and CI state for the current HEAD
- pending and ready todos

If ambiguity remains after that pass, ask one targeted question instead of guessing.

### 3. Infer route before inferring gates

Route controls what "missing artifacts" mean:

- `full` means requirements/plan artifacts are expected
- `direct` and `lightweight` mean requirements/plan can be intentionally absent

This is the key reason direct and lightweight runs still need manifests. Without `route`, a missing plan looks like corruption instead of a valid low-ceremony run.

### 4. Make stage ownership explicit

Resume correctness improved once each stage-owning skill was told exactly which gate it owns:

- `ce:brainstorm` owns `requirements`
- `ce:plan` owns `plan`
- `ce:work` owns `implementation`
- `ce:review` owns `review`
- `test-browser` owns `verification`
- `feature-video` owns `wrap_up`

The important pattern is not "every skill writes lots of bookkeeping." The pattern is: if a skill changes the answer to "what should run next?", it must write that state explicitly.

### 5. Use ref-based stale invalidation only where it pays off

`review`, `verification`, and `wrap_up` can become stale after code changes. Those gates should be invalidated when their stored `ref` no longer matches the current HEAD:

- stale `review.ref` resets `review`, `verification`, and `wrap_up`
- stale `verification.ref` resets `verification` and `wrap_up`
- stale `wrap_up.ref` resets `wrap_up`

This is a better tradeoff than timestamp-heavy bookkeeping. It directly protects against reusing stale late-stage completions without turning the manifest into a full workflow database.

## Gate Semantics That Actually Worked

### Implementation

`implementation = complete` does not mean "the work is perfect" or "everything is validated." It means the coding pass has reached a reviewable checkpoint:

- intended code changes for this route are in place
- implementation-blocking questions are resolved or externalized
- code-oriented verification for this slice has run
- the next rational step is review, not more core coding

### Review

`review = complete` means the review finished its inspection and externalized its findings.

If review creates todos, that does not make review incomplete. The unresolved work belongs to todo resolution and any rerun that follows, not to the review gate itself.

### Verification

`verification` should not mean "all testing everywhere." Most verification belongs inside implementation.

The separate verification gate is for extra validation, especially browser-level checks, when the work actually needs it.

That means:

- browser/UI verification is conditional, not universal
- environment/tooling failures usually produce `skipped`, not `blocked`
- failures that generate todos should leave verification `pending` so `lfg` can revisit it after follow-up work

### Wrap-Up

`wrap_up` is usually convenience work, not a shipping gate.

For autopilot, the durable rule is:

- success -> `complete`
- ordinary PR/auth/upload/environment issues -> `skipped`
- reserve `blocked` for the rare case where the task explicitly requires the wrap-up artifact

## Best-Effort Steps Must Not Derail Autopilot

`test-browser` and `feature-video` are especially sensitive to environment drift. Treating them as hard blockers by default makes `lfg` brittle for the wrong reason.

The better pattern is:

- if the step is inapplicable, skip it
- if the environment is unavailable, skip it with a brief reason
- if the user or task explicitly requires the step, then it may become blocking
- always tell the user briefly what was skipped and why

This preserves visibility without making the whole run fail because a dev server, browser auth session, or local toolchain is missing.

## Practical Prevention Rules

### Prefer route + gate state over inferred stage names

Do not let `lfg` "guess where it is" from one fuzzy heuristic. Route first, then gates, then late-stage freshness.

### Make every routing-critical state transition executable

If a doc says a skill owns a gate transition, add or update a contract test for that exact wording. The orchestration contract should be executable, not purely narrative.

### Keep best-effort steps visible but non-fatal

If a late-stage step is not essential to declare the run done, encode skip behavior directly in the skill contract. Do not depend on callers to remember that nuance later.

### Keep compatibility wrappers thin

The `slfg` lesson still holds: wrappers should forward into the canonical orchestrator, not become alternate policy surfaces.

### Promotion changes are orchestration changes

The `ce:review-beta` -> `ce:review` promotion reinforced an adjacent rule: when a skill that sits in the orchestration path changes semantics or becomes the stable entrypoint, update the orchestrators and contract tests in the same change.

## Applied Pattern

This pattern was applied to the current autopilot workflow as:

- one canonical top-level orchestrator: `lfg`
- a lean, resumability-focused manifest
- explicit gate ownership across brainstorm/plan/work/review/verification/wrap-up
- direct and lightweight manifests that intentionally mark early planning gates as `skipped`
- late-stage ref invalidation for stale review/verification/wrap-up state
- best-effort browser/video handling that records skip reasons instead of derailing the run

## Related Files

- `plugins/compound-engineering/skills/lfg/SKILL.md`
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md`
- `plugins/compound-engineering/skills/ce-plan/SKILL.md`
- `plugins/compound-engineering/skills/ce-work/SKILL.md`
- `plugins/compound-engineering/skills/ce-review/SKILL.md`
- `plugins/compound-engineering/skills/test-browser/SKILL.md`
- `plugins/compound-engineering/skills/feature-video/SKILL.md`
- `plugins/compound-engineering/AGENTS.md`
- `tests/autopilot-skill-contract.test.ts`
- `tests/review-skill-contract.test.ts`
