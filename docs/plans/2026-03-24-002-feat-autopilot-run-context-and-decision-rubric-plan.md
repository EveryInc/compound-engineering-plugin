---
title: "feat: add deterministic autopilot run context and role-based decision rubric"
type: feat
status: active
date: 2026-03-24
origin: docs/brainstorms/2026-03-24-autopilot-run-context-and-decision-rubric-requirements.md
deepened: 2026-03-24
---

# Add Deterministic Autopilot Run Context and Role-Based Decision Rubric

## Overview

Introduce a deterministic runtime contract for `lfg` autopilot runs, plus a shared role-based decision rubric that core workflow skills use in both interactive and autopilot modes. `lfg` will become the single autopilot entrypoint and a resume-anywhere orchestrator: it should evaluate ordered workflow gates, create or backfill a run-scoped manifest and decision log, and pass a short invocation marker downstream from whatever stage the work is already in. `slfg` should be deprecated into a compatibility wrapper that routes to `lfg` with swarm mode enabled, with a later path to project-level defaulting via `compound-engineering.local.md`. `ce:brainstorm`, `ce:plan`, `deepen-plan`, and `ce:work` will adopt explicit role ordering, orchestration bias, and bounded auto-decision/logging rules. `test-browser` and `feature-video` are also in scope as autopilot contract consumers: they need deterministic autopilot recognition and manifest compatibility, but they do not participate in the substantive role-rubric decision model. `document-review` will remain a review utility that can classify findings, but substantive decisions discovered through review will still be resolved and logged by the owning workflow skill.

## Problem Frame

Today the autopilot contract is described in prose across `lfg`, `slfg`, and several workflow skills, but there is no deterministic runtime mechanism that tells a downstream skill "this is an active autopilot run." That makes autopilot brittle and encourages caller-inference rules like "when called from `lfg`/`slfg`" instead of a real shared state model. Maintaining both `lfg` and `slfg` also duplicates entrypoint surface area for what is fundamentally the same autopilot workflow. Separately, `lfg` is still framed too much as a start-of-workflow command rather than a universal "keep the work moving" orchestrator. A stronger design lets the user run `/lfg` from any stage: from idea, from requirements, from a plan, from an implementation branch, or from an open PR that mainly needs verification and wrap-up. At the same time, the plugin lacks a consistent role-based decision rubric for recommendations and bounded autonomous decisions: `ce:brainstorm`, `ce:plan`, `deepen-plan`, and `ce:work` need explicit `Product Manager` / `Designer` / `Engineer` ordering and per-skill orchestration bias so they can recommend or decide consistently without inventing product behavior. (see origin: `docs/brainstorms/2026-03-24-autopilot-run-context-and-decision-rubric-requirements.md`)

## Requirements Trace

- R1-R5h. `lfg` is the autopilot entrypoint, creates or backfills a run manifest, evaluates ordered workflow gates, and passes a deterministic invocation marker that does not depend on platform-specific positional parsing. `slfg` is deprecated into a compatibility wrapper for swarm mode inside `lfg`
- R6-R9a. Core workflow skills use the same role vocabulary and define per-skill role ordering, orchestration bias, and `may decide / must ask / must log` boundaries
- R9b. `document-review` remains a review utility; owning workflow skills resolve substantive findings
- R10-R15. The canonical decision log is run-scoped, logs substantive autonomous decisions from both documented open questions and execution discoveries, and promotes a compact summary into a plan when relevant
- R16-R17. The runtime rubric must be available from the installed skills' own directories and work across converted targets

## Scope Boundaries

- Not redesigning the global skill format or replacing skills with a monolithic orchestrated prompt
- Not turning workflow trivia into first-class audit decisions
- Not giving autopilot authority to invent major product direction without bounded criteria
- Not requiring plugin-root runtime files that are not guaranteed to ship with each installed skill
- Not fully rolling the substantive role-rubric contract out to every autopilot-aware utility skill in the same change; the first-wave decision owners are `lfg`, `ce:brainstorm`, `ce:plan`, `deepen-plan`, and `ce:work`
- Not treating `test-browser` or `feature-video` as substantive product/implementation decision owners; they are first-wave autopilot contract consumers only
- Not designing the full long-term `compound-engineering.local.md` swarm configuration surface in this same change; only preserve a clear path for it

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/lfg/SKILL.md` and `plugins/compound-engineering/skills/slfg/SKILL.md` currently split the same autopilot workflow across two top-level entrypoints; this plan collapses that split so `lfg` owns the contract and swarm becomes an execution mode while `slfg` survives only as a deprecation wrapper
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md`, `plugins/compound-engineering/skills/ce-plan/SKILL.md`, `plugins/compound-engineering/skills/deepen-plan/SKILL.md`, and `plugins/compound-engineering/skills/ce-work/SKILL.md` already have `## Autopilot Mode` behavior and are the substantive decision-making skills in scope
- `plugins/compound-engineering/skills/document-review/SKILL.md` and `plugins/compound-engineering/agents/document-review/*.md` already provide persona-based document review with synthesized findings
- `plugins/compound-engineering/skills/test-browser/SKILL.md` and `plugins/compound-engineering/skills/feature-video/SKILL.md` already have autopilot-specific best-effort behavior and are invoked by the end-to-end workflow, so they need to consume the new run contract even though they are not substantive decision owners
- `src/parsers/claude.ts` discovers skills from `SKILL.md` directories only; runtime policy cannot safely depend on an arbitrary plugin-root file
- `src/utils/files.ts` and target writers (`src/targets/codex.ts`, `src/targets/gemini.ts`, `src/targets/copilot.ts`, etc.) copy each skill directory independently, reinforcing that runtime rubric content must ship from the skill's own directory
- `tests/review-skill-contract.test.ts` is an existing pattern for asserting text contracts in workflow skills and reference files

### Institutional Learnings

- `docs/solutions/skill-design/lfg-slfg-pipeline-orchestration-and-autopilot-mode.md` documents the first-generation autopilot convention and the current `lfg`/`slfg` split that this plan simplifies
- `docs/plans/2026-03-23-001-feat-plan-review-personas-beta-plan.md` and the completed persona-based `document-review` implementation establish the pattern of persona generation + orchestrator synthesis, which should remain separate from artifact-owner judgment
- Existing skill-contract tests for `ce-review-beta` show the repo already protects fragile orchestration contracts with text assertions rather than relying only on human review

### External References

- None required. This plan is dominated by plugin-local skill design, packaging behavior, and orchestration conventions already present in the repo.

## Key Technical Decisions

- **Use a short prefix invocation marker plus a run manifest**: The chosen signaling family is a small explicit autopilot prefix at the start of downstream skill input, plus a run-scoped manifest file under `.context/compound-engineering/autopilot/<run-id>/`. This avoids relying on line breaks, XML blocks, or platform-specific positional args.
- **Resolve the marker as a technical choice now**: Standardize on a prefix marker in the shape `[ce-autopilot manifest=<path>] :: <actual input>` (or the equivalent parsing contract without semantic drift). The family is already decided; the plan should not reopen broader signaling alternatives.
- **The manifest owns artifact discovery**: The minimum manifest shape should include `schema_version`, `run_id`, `route`, `status`, `feature_description`, `requirements_doc`, and `plan_doc`. Downstream skills should read and update those fields instead of rediscovering artifacts heuristically.
- **The manifest also records gate state and completion evidence**: In addition to artifact paths, the run state should capture ordered gate status (`complete`, `pending`, `blocked`, `unknown`) and the evidence used to mark reconstructed gates complete.
- **The exact phase-1 manifest schema is fixed**: Use:
  - `schema_version`
  - `run_id`
  - `route` = `direct | lightweight | full`
  - `status` = `active | completed | aborted`
  - `implementation_mode` = `standard | swarm`
  - `feature_description`
  - `current_gate` (optional, advisory only)
  - `gates.requirements | gates.plan | gates.implementation | gates.review | gates.verification | gates.wrap_up`, each with `state` = `complete | skipped | pending | blocked | unknown` plus `evidence`
  - `gates.review.ref | gates.verification.ref | gates.wrap_up.ref` for stale late-stage invalidation after code changes
  - `artifacts.requirements_doc | artifacts.plan_doc`
  - direct and lightweight routes still create a manifest; they mark `requirements` and `plan` as `skipped` with evidence when those artifacts are intentionally absent
- **Run status stays coarse; gate state carries detail**: "Waiting on CI" or "review incomplete" should be expressed in gate state and evidence while the overall run remains `active`. Only `completed` and `aborted` are terminal, and `completed` allows required gates to be either `complete` or `skipped`.
- **`lfg` is the only top-level autopilot entrypoint**: `slfg` should stop owning its own orchestration contract. When users want parallel execution, `lfg` should expose swarm as an execution mode, and `slfg` should become a compatibility wrapper that points there.
- **Swarm selection belongs behind `lfg`**: In phase 1, swarm should be selected explicitly by user intent. Repo/project defaults should use `compound-engineering.local.md` frontmatter `implementation_mode: standard | swarm`, with missing treated as `standard`.
- **`lfg` resumes from current state, not only from scratch**: If an active autopilot manifest exists, resume from it. If no active manifest exists, inspect repo artifacts and PR state, infer the current gate state conservatively, create a fresh manifest seeded with that state, and continue from the next appropriate step.
- **Resume is a deterministic ordered-gate engine**: `lfg` should not "guess the stage" loosely. It should evaluate, in order, `requirements`, `plan`, `implementation`, `review`, `verification`, and `wrap-up`, then advance the first unmet gate it can justify from evidence.
- **State reconstruction has explicit evidence precedence**: Gate completion should be derived in this order: active manifest state, explicit user direction in the current `lfg` invocation, durable workflow artifacts and repo state, then PR/CI state for the current branch/HEAD. If ambiguity remains after those sources, `lfg` should ask one targeted question rather than take a risky leap.
- **Late-stage gates must be conservative**: Review resolution, local verification, browser validation, and wrap-up should remain pending unless `lfg` has current evidence for them. A generic open PR or historical branch activity is not enough.
- **Best-effort late-stage steps should degrade gracefully**: Browser testing and feature-video should usually record `skipped` with a brief reason when environment/auth/tooling prevents them, not derail the whole run.
- **PR-stage orchestration is a first-class contract**: When resuming from an implementation or PR stage, `lfg` should inspect CI status for the current HEAD, decide whether local tests or browser checks need reruns, and distinguish "waiting on CI" from truly DONE.
- **Keep the runtime rubric in-skill for the first wave**: Because installed skills must be self-sufficient and packaging a shared runtime reference adds complexity, phase 1 should place the rubric and role ordering directly in the relevant skill files. A shared authored source copied into each skill can be reconsidered later.
- **Use one shared decision-criteria set across the first-wave skills**: The substantive roles should evaluate choices using a common criteria vocabulary so recommendations and autonomous decisions stay consistent across phases:
  - `User Value` -- which option better serves the intended user or product outcome
  - `Completeness` -- which option covers real states, edge cases, and follow-through within the chosen scope
  - `Local Leverage` -- whether nearby blast-radius work is worth expanding now because it is adjacent and cheap
  - `Reuse` -- whether an existing pattern, capability, or implementation should be reused instead of creating a parallel one
  - `Clarity` -- whether the approach is explicit, understandable, and unsurprising
  - `Momentum` -- whether materially equivalent options should be resolved quickly so work can continue
- **Roles are always active; autopilot changes authority**: `Product Manager`, `Designer`, and `Engineer` guide recommendations in normal mode and bounded decisions in autopilot mode. The difference between modes is whether the skill recommends or decides, not whether the roles apply.
- **Role definitions are expansive, not UI-only**:
  - `Product Manager` optimizes for user value, scope coherence, success criteria, and priority alignment
  - `Designer` optimizes for user experience broadly: interaction flow, defaults, terminology, state coverage, error recovery, information architecture, and visual/interaction clarity when relevant
  - `Engineer` optimizes for correctness, reuse, maintainability, implementation clarity, and repo-fit
- **Orchestration bias is per skill, not a peer role**: Each substantive workflow skill declares its own bias toward continuation or escalation; `lfg` remains orchestration-first rather than a substantive decider.
- **Separate decision owners from contract consumers**: `ce:brainstorm`, `ce:plan`, `deepen-plan`, and `ce:work` own substantive role-rubric decisions. `test-browser` and `feature-video` must recognize the new autopilot contract and participate in the shared run context, but they are not part of the first-wave role-rubric decision-authority work.
- **Only decision-owner skills write substantive decision rows**: Utility skills such as `document-review`, `test-browser`, and `feature-video` may surface findings, todos, or operational notes, but they should not append substantive product or implementation decisions to the canonical decision log. The owning workflow skill decides and logs.
- **The decision-log row schema is fixed for phase 1**: Use the Markdown columns `# | Phase | Question | Decision | Why | Impact | Type`, where `Type` is one of `documented-open-question`, `execution-discovery`, or `conflict-resolution`.
- **The run log is canonical; plan summary is promoted**: The decision log lives first in `.context`. If a plan exists, only the relevant subset is promoted into an `Autopilot Decisions` section using the same column schema.
- **Promotion into the plan follows a fixed rule**: Promote all `brainstorm`, `plan`, and `deepen-plan` rows that changed product behavior, scope, sequencing, risk handling, implementation direction, or verification strategy reflected in the plan. Promote `work` rows only when execution forced a meaningful plan-level deviation or resolved an implementation question the plan left open.
- **`document-review` stays a utility**: Persona findings should classify into `mechanical-fix`, `bounded-decision`, `must-ask`, or `note`, and the owning skill remains responsible for making and logging substantive autonomous decisions.

## Open Questions

### Resolved During Planning

- **Should the exact invocation marker still block planning?** No. The high-level signaling approach is already settled. Standardize on a short prefix marker contract and finalize exact syntax during implementation without routing back to `ce:brainstorm`.
- **Should runtime rubric content live in a shared plugin-root file?** Not in phase 1. Installed skills must work from their own shipped directories, so phase 1 should keep the rubric inline in the participating skills.
- **Should `document-review` become an autopilot decision-maker?** No. It should remain a review utility that returns findings and classifications; the artifact owner resolves substantive issues.
- **Should `test-browser` and `feature-video` be in phase 1?** Yes, as autopilot contract consumers only. They need deterministic autopilot recognition and shared-run compatibility because the end-to-end workflow invokes them, but they do not own substantive role-rubric decisions.
- **Should `slfg` remain as a separate workflow?** No. Deprecate it into a compatibility wrapper so the top-level contract surface collapses to `lfg` without breaking the few existing users abruptly. Swarm remains available as a mode within `lfg` and later through project configuration.
- **Should `lfg` only kick off from the beginning?** No. It should resume from the current gate state whenever possible, creating a manifest if one is missing and carrying that forward for the rest of the run.

### Deferred to Implementation

- Whether phase 2 should extend the substantive role-rubric model to `test-browser`, `feature-video`, or other autopilot-aware utility skills after they first adopt the run contract as consumers

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
Autopilot flow:

1. User runs /lfg
2. Entry skill checks for an active autopilot manifest for the current branch/worktree
3. If found:
   - resume from that manifest
4. If not found:
   - inspect state using ordered evidence precedence:
     - explicit user direction in the current invocation
     - durable workflow artifacts and repo state
     - PR and CI state for the current branch/HEAD
   - evaluate ordered workflow gates:
     - requirements
     - plan
     - implementation
     - review
     - verification
     - wrap-up
   - mark a gate complete only when current evidence supports it
   - create .context/compound-engineering/autopilot/<run-id>/
     - session.json
     - decisions.md
   - seed the manifest with inferred gate state, evidence, and known artifacts
5. Entry skill advances the first unmet gate it can justify safely
6. Entry skill invokes downstream skills with:
   [ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] :: <normal input>
7. Downstream skill:
   - strips prefix marker
   - validates manifest (mode=autopilot, status=active)
   - applies its role ordering + orchestration bias
   - writes artifact paths or decision rows back through the run-scoped files
8. Substantive decisions resolved by the artifact-owning skill create decision-log rows
9. If a plan exists, relevant rows are promoted into an Autopilot Decisions summary

Decision log schema:

| # | Phase | Question | Decision | Why | Impact | Type |
|---|-------|----------|----------|-----|--------|------|

- `Type` is one of:
  - `documented-open-question`
  - `execution-discovery`
  - `conflict-resolution`

Late-stage resume rule:

- If `implementation` is complete or an open PR exists:
  - evaluate `review`, `verification`, and `wrap-up` separately
  - inspect CI state for the current HEAD
  - rerun local tests or browser checks when current evidence is missing or stale
  - treat "waiting on required CI" as distinct from DONE

Document review utility flow:

1. Owning skill writes/updates requirements or plan
2. Owning skill invokes document-review
3. document-review returns findings + classifications
4. Owning skill decides:
   - auto-fix mechanical
   - auto-decide bounded issue and log it
   - leave open
   - ask user

document-review classifications:

- `mechanical-fix`
- `bounded-decision`
- `must-ask`
- `note`

Utility-skill rule:

- test-browser / feature-video:
  - validate the same prefix marker + manifest
  - preserve best-effort operational behavior
  - create todos or operational notes when appropriate
  - do not write substantive decision rows

Role and bias matrix:

- ce:brainstorm
  - roles: Product Manager > Designer > Engineer
  - dominant criteria: User Value, Completeness, Clarity
  - orchestration bias: low
  - behavior: recommend strongly in normal mode; auto-decide only bounded requirement/scope questions in autopilot

- ce:plan
  - roles: Engineer > Product Manager > Designer
  - dominant criteria: Clarity, Reuse, Completeness
  - orchestration bias: medium
  - behavior: resolve bounded planning and implementation-direction choices; do not invent new product behavior

- deepen-plan
  - roles: Engineer > Product Manager > Designer
  - dominant criteria: Completeness, Clarity, Reuse
  - orchestration bias: low-medium
  - behavior: strengthen weak sections and risk treatment; surface true product gaps instead of silently resolving them

- ce:work
  - roles: Engineer > Designer > Product Manager
  - dominant criteria: Clarity, Reuse, Local Leverage, Momentum
  - orchestration bias: high
  - behavior: keep execution moving within approved bounds; log bounded execution discoveries and escalate plan-breaking changes

- lfg
  - role model: orchestration-first, not a substantive decision owner
  - behavior: detect current gate state, create or backfill run context, carry it forward, gate progression between skills, and select swarm execution only when explicitly requested or later configured
```

## Implementation Units

- [ ] **Unit 1: Collapse the top-level autopilot entrypoint to `lfg`, define the marker/manifest contract, and deprecate `slfg`**

**Goal:** Make `lfg` the only top-level skill that owns the autopilot contract, while turning `slfg` into a thin compatibility wrapper rather than a second orchestration surface.

**Requirements:** R1-R5f, R9a, R10-R12

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/lfg/SKILL.md`
- Modify: `plugins/compound-engineering/skills/slfg/SKILL.md`
- Modify: `plugins/compound-engineering/AGENTS.md`
- Modify: `plugins/compound-engineering/README.md`

**Approach:**
- Standardize the downstream invocation contract around a short prefix marker carrying only the manifest path and normal task input
- Define the exact phase-1 manifest schema and lifecycle rules, including `active | completed | aborted` at the run level and per-gate `complete | pending | blocked | unknown`
- Replace prose-only caller-context language with the new deterministic contract where appropriate
- Deprecate `slfg` into a compatibility wrapper that routes users onto `lfg` with swarm mode enabled, while clearly signaling that `lfg` is the canonical entrypoint
- Define how users explicitly request swarm execution through `lfg`, while leaving repo/project defaulting to a later `compound-engineering.local.md` follow-up
- Update `AGENTS.md` and `README.md` to document the single-entrypoint model plus swarm-as-mode behavior

**Patterns to follow:**
- Existing `## Autopilot Mode` sections in `ce:brainstorm`, `ce:plan`, `deepen-plan`, and `ce:work`
- `docs/solutions/skill-design/lfg-slfg-pipeline-orchestration-and-autopilot-mode.md`

**Test scenarios:**
- `lfg` with empty arguments still routes to `ce:brainstorm`, but now seeds the run manifest first
- `slfg` routes users onto `lfg` with swarm mode instead of silently preserving a second orchestration contract
- `lfg` can still select swarm execution when explicitly requested without needing a second workflow entrypoint
- No remaining top-level docs imply that `slfg` is required for autopilot or swarm behavior

**Verification:**
- `lfg` explicitly initializes run-scoped autopilot state
- `slfg` no longer acts as a separate top-level contract surface
- `AGENTS.md` and `README.md` document the new autopilot contract clearly enough for future skill authors and users

---

- [ ] **Unit 2: Build the deterministic resume engine and PR-stage orchestration in `lfg`**

**Goal:** Make `lfg` resume safely from any workflow point by evaluating ordered gates and explicit evidence instead of relying on loose stage guesses.

**Requirements:** R2a-R5h, R9a

**Dependencies:** Unit 1

**Files:**
- Modify: `plugins/compound-engineering/skills/lfg/SKILL.md`

**Approach:**
- Define the ordered gate model explicitly: `requirements`, `plan`, `implementation`, `review`, `verification`, `wrap-up`
- Define evidence precedence for reconstructed runs:
  - active manifest for the current run
  - explicit user direction in the current invocation
  - durable workflow artifacts and repo state
  - PR and CI state for the current branch/HEAD
- Require `lfg` to mark a gate complete only when current evidence supports it, otherwise leave it pending or ask a targeted clarifying question
- Make late-stage checks first-class: separate `review`, `verification`, and `wrap-up` instead of treating "open PR" as DONE
- Define current-HEAD PR-stage behavior:
  - inspect GitHub CI status
  - decide when local tests must rerun
  - decide when browser validation should rerun
  - distinguish "waiting on CI" from DONE
- Require manifest backfill to record both inferred gate state and the evidence used for those inferences
- Define how "waiting on CI" is represented: keep the run `active`, mark `verification` or `wrap_up` as `blocked`/`pending` with current-HEAD CI evidence, and avoid any pseudo-terminal intermediate run status

**Patterns to follow:**
- Existing `lfg` direct-path vs full-pipeline routing
- Late-stage workflow expectations already embedded across `ce:work`, `test-browser`, and `feature-video`

**Test scenarios:**
- `lfg` invoked when a requirements doc exists but no active manifest creates a fresh manifest and continues at planning
- `lfg` invoked when a plan exists but code has not started advances to implementation
- `lfg` invoked on an implementation branch with unresolved review todos treats `review` as pending even if an open PR exists
- `lfg` invoked on an open PR with passing local evidence but pending GitHub CI continues with remaining wrap-up work but does not declare DONE
- `lfg` invoked on an open PR with no durable browser-verification evidence reruns or re-requests browser validation instead of assuming it already happened

**Verification:**
- `lfg` uses an explicit ordered gate model rather than vague stage inference
- Late-stage orchestration is specified clearly enough that two implementers would pick the same next step from the same repo/PR state
- PR-stage completion and "waiting on CI" are distinct outcomes

---

- [ ] **Unit 3: Add role rubric and autopilot marker handling to `ce:brainstorm`**

**Goal:** Make `ce:brainstorm` use the role rubric in both interactive and autopilot modes and write requirements artifact state into the run manifest.

**Requirements:** R6-R9, R10-R14, R16-R17

**Dependencies:** Units 1-2

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md`

**Approach:**
- Add explicit role ordering (`Product Manager` > `Designer` > `Engineer`) and low orchestration bias guidance
- Add the shared decision criteria and explain how brainstorm uses them to recommend options in normal mode
- Define how brainstorm recommends options in normal mode using that role ordering
- Define how brainstorm strips the autopilot marker, validates the manifest, and logs bounded autonomous decisions only when in autopilot mode
- Require brainstorm to register the generated requirements doc path in the run manifest

**Patterns to follow:**
- Existing `ce:brainstorm` distinction between workflow prompts vs content questions
- Existing brainstorm requirements-document structure and Phase 0 short-circuiting

**Test scenarios:**
- Standalone brainstorm recommends one option using the role rubric but still asks the user
- Autopilot brainstorm logs a bounded product decision made on behalf of the user
- Empty-input autopilot brainstorm still asks the user for the missing feature description instead of inventing one

**Verification:**
- `ce:brainstorm` explicitly applies the role rubric in both modes
- Requirements doc path registration is part of the autopilot contract

---

- [ ] **Unit 4: Add role rubric, manifest updates, and promoted decision summaries to `ce:plan` and `deepen-plan`**

**Goal:** Make planning skills use deterministic autopilot detection, skill-specific role ordering, and plan-aware decision promotion.

**Requirements:** R4-R9, R10-R17

**Dependencies:** Units 1-3

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`
- Modify: `plugins/compound-engineering/skills/deepen-plan/SKILL.md`

**Approach:**
- Add explicit role ordering and orchestration bias for both skills (`Engineer`-first, with different continuation pressure for plan vs deepening)
- Add the shared decision criteria and specify which ones dominate for each skill
- Define how each skill parses the marker, validates the manifest, and strips the prefix from normal input
- Require `ce:plan` to update the manifest with the written plan path
- Lock the row schema to `# | Phase | Question | Decision | Why | Impact | Type` and define the promotion rule for copying the relevant subset into a compact `Autopilot Decisions` section when a plan exists, using the run log as the canonical source
- Clarify when planning/deepening may resolve bounded technical questions versus surfacing them back to brainstorm/user

**Patterns to follow:**
- Existing `ce:plan` plan-writing contract and filename pattern
- Existing `deepen-plan` guidance on not inventing product requirements and routing true product blockers back to brainstorm

**Test scenarios:**
- `ce:plan` writes a plan, updates the manifest, and returns control in autopilot mode without post-generation menus
- `deepen-plan` uses the same run context instead of inventing its own autopilot inference
- Plan-affecting autonomous decisions are promoted from the run log into the plan summary, while workflow trivia is not

**Verification:**
- Planning skills can operate from the shared run contract without relying on caller prose
- Plan summaries are derived from the canonical run log, not maintained as a second source of truth

---

- [ ] **Unit 5: Add execution-time decision logging and role rubric to `ce:work`**

**Goal:** Capture bounded implementation decisions and execution discoveries made to preserve forward momentum.

**Requirements:** R6-R14, R16-R17

**Dependencies:** Units 1-4

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-work/SKILL.md`

**Approach:**
- Add explicit role ordering and high orchestration bias for execution
- Add the shared decision criteria and clarify that `Local Leverage` and `Momentum` are stronger in `ce:work` than in planning skills
- Define how `ce:work` uses the run manifest and logs substantive autonomous decisions created by execution discoveries, not just pre-existing open questions
- Clarify `may decide / must ask / must log` boundaries so `ce:work` can keep moving without silently making plan-level changes beyond its authority

**Patterns to follow:**
- Existing `ce:work` branch/worktree safety split between autopilot and standalone use
- The origin requirements document's distinction between execution discoveries and documented open questions

**Test scenarios:**
- `ce:work` discovers a new bounded implementation ambiguity during execution and logs the chosen path
- `ce:work` escalates a true product-level behavior change instead of silently deciding it
- `ce:work` does not create decision-log rows for mechanical or workflow-only actions

**Verification:**
- Execution discoveries are first-class logged decisions when the skill resolves them autonomously
- `ce:work` keeps decision authority within its documented bounds

---

- [ ] **Unit 6: Update `document-review` to support autopilot-owning callers without becoming a decider**

**Goal:** Make `document-review` return findings that autopilot-owning workflow skills can act on without turning review into hidden authorship.

**Requirements:** R9b, R13a, R16-R17

**Dependencies:** Units 3-5

**Files:**
- Modify: `plugins/compound-engineering/skills/document-review/SKILL.md`
- Modify: `plugins/compound-engineering/skills/document-review/references/findings-schema.json`
- Modify: `plugins/compound-engineering/skills/document-review/references/subagent-template.md`
- Modify: `plugins/compound-engineering/skills/document-review/references/review-output-template.md`
- Possibly modify: `plugins/compound-engineering/agents/document-review/*.md`

**Approach:**
- Keep personas as issue-finders and synthesis inputs
- Standardize the exact phase-1 classes as `mechanical-fix`, `bounded-decision`, `must-ask`, and `note`
- Preserve the current mechanical auto-fix behavior where appropriate
- Explicitly document that substantive decisions discovered through review are resolved by the owning skill, which then logs the resulting choice if it auto-decides

**Patterns to follow:**
- Existing persona-based document review orchestration
- Existing findings schema / template pattern from `document-review` and `ce-review-beta`

**Test scenarios:**
- `document-review` returns a bounded judgment finding that `ce:plan` could decide in autopilot
- `document-review` returns a must-ask finding that remains unresolved for the caller to escalate
- Mechanical terminology or formatting fixes remain auto-fixable without changing substantive meaning

**Verification:**
- `document-review` remains a utility, not a substantive decision owner
- Callers receive enough classification signal to apply their own role rubric

---

- [ ] **Unit 7: Make autopilot utility skills consume the new run contract**

**Goal:** Ensure utility skills invoked by the end-to-end workflow recognize the deterministic autopilot contract and coexist with the shared run manifest without taking on substantive role-rubric authority.

**Requirements:** R1-R5, R9a, R10-R12

**Dependencies:** Units 1-2

**Files:**
- Modify: `plugins/compound-engineering/skills/test-browser/SKILL.md`
- Modify: `plugins/compound-engineering/skills/feature-video/SKILL.md`

**Approach:**
- Update both skills to recognize the new autopilot marker/manifest contract instead of relying only on legacy caller-prose conventions
- Preserve their current best-effort, non-blocking autopilot behavior
- Clarify whether they should read any manifest fields directly and whether they should write operational state into the run directory
- Make it explicit that these skills can emit todos, skip notes, or run-status artifacts, but not substantive decision-log rows
- Keep them out of the substantive decision-rubric model except where they already emit durable artifacts like todos or run notes

**Patterns to follow:**
- Existing autopilot mode sections in `test-browser` and `feature-video`
- The decision-owner vs utility split established for `document-review`

**Test scenarios:**
- `test-browser` detects autopilot from the new run contract and continues using non-blocking failure handling
- `feature-video` detects autopilot from the new run contract and preserves its best-effort skip behavior
- `test-browser` writes a todo for a browser failure without polluting the substantive decision log
- `feature-video` records an operational skip without claiming a product/implementation decision
- Neither skill claims authority to make substantive product or implementation decisions via the role rubric

**Verification:**
- Both utility skills are compatible with the shared run contract
- Their behavior remains best-effort and operational rather than substantive

---

- [ ] **Unit 8: Add contract tests and release validation coverage**

**Goal:** Protect the new cross-skill autopilot contract from drifting in future edits.

**Requirements:** R1-R17

**Dependencies:** Units 1-7

**Files:**
- Create: `tests/autopilot-skill-contract.test.ts`
- Modify: `tests/review-skill-contract.test.ts`

**Approach:**
- Add text-contract tests for:
  - run manifest path convention
  - invocation marker contract
  - role vocabulary / orchestration bias presence in the first-wave decision-owner skills
  - utility-skill autopilot contract consumption in `test-browser`, `feature-video`, and `document-review`
- Keep release validation in the final verification pass

**Patterns to follow:**
- `tests/review-skill-contract.test.ts`

**Test scenarios:**
- Contract test fails if one decision-owner skill drops the role rubric or manifest contract
- Contract test fails if a decision-owner skill drops the shared decision-criteria vocabulary or its per-skill role/bias declaration
- Contract test fails if `test-browser` or `feature-video` no longer document deterministic autopilot recognition
- Contract test fails if `document-review` starts claiming substantive decision ownership

**Verification:**
- `bun test` passes
- `bun run release:validate` passes

## System-Wide Impact

- **Interaction graph:** `lfg` becomes the explicit autopilot run initializer; `ce:brainstorm`, `ce:plan`, `deepen-plan`, `ce:work`, `test-browser`, and `feature-video` all consume the same manifest and invocation marker contract, while only the core workflow skills own substantive decisions
- **State reconstruction:** `lfg` must be able to infer enough workflow gate state from repo artifacts and PR context to resume safely when no active manifest exists, then create a manifest for the resumed run
- **Determinism pressure:** Ordered gates and evidence precedence are the main guardrail against drift; if those rules are underspecified in implementation, different agents will resume the same repo state differently
- **Error propagation:** Missing or invalid manifest state must degrade safely and visibly rather than silently running with the wrong autopilot posture
- **State lifecycle risks:** Run manifests and decision logs should be per-run and gitignored; the design must avoid stale workspace-global state
- **Operational vs substantive outputs:** Utility-skill outputs (todos, skip notes, video artifacts) must not be conflated with the substantive autopilot decision log, or the audit trail will become noisy and less trustworthy
- **API surface parity:** The contract must survive cross-platform installs because skills are copied across Claude, Codex, Gemini, Copilot, and other targets
- **Integration coverage:** End-to-end skill chaining and contract tests matter more than unit-level validation for this work because the risk is orchestration drift across multiple SKILL.md files

## Risks & Dependencies

- The main risk is overcomplicating the first wave by trying to factor a shared runtime rubric file before the core contract works; keeping the rubric inline in phase 1 mitigates that
- Deprecating `slfg` still requires careful documentation and wrapper behavior so users do not lose discoverability for swarm execution
- Resume-anywhere orchestration increases the risk of misdetecting the current gate state, so `lfg` must be conservative and prefer one targeted question over a wrong autonomous leap when state is ambiguous
- Late-stage PR orchestration is easy to over-assume; verification and wrap-up gates must not be marked complete from weak evidence
- The marker syntax must stay minimal and portable; if it grows into a mini protocol, the common-denominator benefit disappears
- `document-review` classification changes must not break its existing caller contract or terminal signal
- Utility-skill integration must not blur the boundary between operational artifacts and substantive autonomous decisions

## Documentation / Operational Notes

- Update `plugins/compound-engineering/README.md` if autopilot behavior or skill descriptions become materially more specific after implementation
- Consider adding a follow-up `docs/solutions/skill-design/` write-up after the contract lands, but treat that as compounding work, not a prerequisite for phase 1

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-24-autopilot-run-context-and-decision-rubric-requirements.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/docs/brainstorms/2026-03-24-autopilot-run-context-and-decision-rubric-requirements.md)
- Related code: [plugins/compound-engineering/skills/lfg/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/plugins/compound-engineering/skills/lfg/SKILL.md)
- Related code: [plugins/compound-engineering/skills/slfg/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/plugins/compound-engineering/skills/slfg/SKILL.md)
- Related code: [plugins/compound-engineering/skills/ce-brainstorm/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/plugins/compound-engineering/skills/ce-brainstorm/SKILL.md)
- Related code: [plugins/compound-engineering/skills/ce-plan/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/plugins/compound-engineering/skills/ce-plan/SKILL.md)
- Related code: [plugins/compound-engineering/skills/deepen-plan/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/plugins/compound-engineering/skills/deepen-plan/SKILL.md)
- Related code: [plugins/compound-engineering/skills/ce-work/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/plugins/compound-engineering/skills/ce-work/SKILL.md)
- Related code: [plugins/compound-engineering/skills/test-browser/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/plugins/compound-engineering/skills/test-browser/SKILL.md)
- Related code: [plugins/compound-engineering/skills/feature-video/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/plugins/compound-engineering/skills/feature-video/SKILL.md)
- Related code: [plugins/compound-engineering/skills/document-review/SKILL.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/plugins/compound-engineering/skills/document-review/SKILL.md)
- Related tests: [tests/review-skill-contract.test.ts](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/tests/review-skill-contract.test.ts)
- Related learning: [docs/solutions/skill-design/lfg-slfg-pipeline-orchestration-and-autopilot-mode.md](/Users/tmchow/conductor/workspaces/compound-engineering-plugin/biarritz-v2/docs/solutions/skill-design/lfg-slfg-pipeline-orchestration-and-autopilot-mode.md)
