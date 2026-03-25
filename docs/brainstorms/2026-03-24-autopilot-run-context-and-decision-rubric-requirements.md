---
date: 2026-03-24
topic: autopilot-run-context-and-decision-rubric
---

# Autopilot Run Context and Decision Rubric

## Problem Frame

`lfg` currently describes autopilot behavior in prose, and `slfg` adds a second top-level entrypoint with overlapping intent. Downstream skills do not have a deterministic runtime contract for knowing that autopilot is active. That makes the pipeline brittle: skills infer autopilot from caller wording, skip prompts inconsistently, and have no shared place to record substantive decisions made on the user's behalf.

Separately, `lfg` currently behaves mainly like a "start the workflow" entrypoint. That is narrower than the more useful user expectation: `/lfg` should be able to resume from whatever state the work is already in. If requirements already exist, it should plan. If a plan exists, it should work. If implementation is done and a PR is open, it should verify CI, run local/browser checks, finish wrap-up artifacts, and keep pushing toward DONE. The orchestrator should not require the user to remember which phase-specific command comes next.

At the same time, the plugin needs a clearer decision rubric for both interactive and autopilot workflows. Core skills such as `ce:brainstorm`, `ce:plan`, `deepen-plan`, and `ce:work` should use the same role-based judgment model when recommending options in normal mode and when auto-deciding bounded questions in autopilot mode. Without that shared rubric, autopilot either stalls too often or makes decisions without a clear basis.

The goal is to make `lfg` the single autopilot entrypoint with a deterministic run contract and resume-anywhere orchestration, while also improving decision quality and recommendation consistency across the core workflow skills. `slfg` should be deprecated into a compatibility wrapper that routes to `lfg` with swarm mode enabled, with future project-level defaulting handled through `compound-engineering.local.md`.

## Requirements

- R1. `lfg` is the only skill that activates full autopilot mode for an end-to-end run. Downstream skills must not infer autopilot solely from prose like "when called from lfg/slfg" or similar caller wording without a deterministic runtime signal.

- R2. `lfg` must create a run-scoped autopilot manifest under `.context/compound-engineering/` before invoking downstream skills. The manifest must be the shared source of truth for the run's status and durable workflow artifacts.

- R2a. `lfg` must be able to resume from existing repo/worktree/PR state even when no active autopilot manifest exists. In that case, `lfg` must reconstruct the current workflow gate state, create a fresh run-scoped manifest, record the inferred current state there, and continue from the next appropriate step instead of forcing the user to restart from the beginning.

- R3. The autopilot manifest must track, at minimum:
  - run identity
  - active/completed/aborted status
  - top-level entry skill (`lfg`)
  - original or clarified feature description
  - inferred or explicit current workflow stage
  - ordered workflow gate status, including which gates are complete, pending, blocked, or unknown
  - what evidence was used to mark a gate complete when the run was reconstructed from ambient state
  - requirements document path, when created
  - plan document path, when created
  - decision log path

- R3a. The exact phase-1 manifest shape should be:
  - `schema_version`
  - `run_id`
  - `route` with the enum `direct | lightweight | full`
  - `status` with the enum `active | completed | aborted`
  - `implementation_mode` with the enum `standard | swarm`
  - `feature_description`
  - `current_gate` (optional, advisory only)
  - `gates`, keyed by `requirements`, `plan`, `implementation`, `review`, `verification`, and `wrap_up`
  - `artifacts`, containing `requirements_doc` and `plan_doc`

- R3b. Each manifest gate entry should include:
  - `state` with the enum `complete | skipped | pending | blocked | unknown`
  - `evidence`, as a short list of strings or references explaining why the gate was marked that way
  - `ref` only for late-stage gates that can go stale after code changes: `review`, `verification`, and `wrap_up`

- R3c. Manifest lifecycle should be:
  - created or backfilled as `active`
  - remain `active` while any gate is still `pending` or `blocked`
  - transition to `completed` only when all required gates are `complete` or `skipped` and no required external blocker such as CI remains
  - transition to `aborted` only when the run is intentionally stopped or cannot continue

- R3d. Direct and lightweight routes should still create a manifest immediately. In those routes, `requirements` and `plan` may be marked `skipped` with routing evidence, and `artifacts.requirements_doc` / `artifacts.plan_doc` may remain unset by design.

- R4. Downstream skills must detect autopilot through an explicit, common-denominator invocation marker plus the manifest it points to. The contract must not rely on line breaks, XML parsing, or platform-specific positional argument features.

- R5. The autopilot invocation marker must be short, self-delimiting, and easy for skills to strip before processing the normal user/task input. The remainder after the marker is the skill's real input.

- R5a. `slfg` should be deprecated as a separate top-level workflow. Swarm execution should instead be modeled as an implementation option within `lfg` when explicitly requested by the user, with a later path to project-level defaulting through `compound-engineering.local.md` frontmatter `implementation_mode: standard | swarm`.

- R5b. `lfg` must begin by detecting the current workflow state. It should prefer an active autopilot manifest when one exists. Otherwise it should infer state conservatively from durable artifacts and repo context such as requirements docs, plan docs, branch state, implementation changes, PR state, and CI status.

- R5c. `lfg` should determine the next step through an explicit ordered gate model rather than ad hoc heuristics. At minimum, it must evaluate:
  - requirements readiness
  - plan readiness
  - implementation readiness
  - review/todo resolution readiness
  - verification readiness (local tests, browser validation where relevant, CI status)
  - wrap-up readiness (PR state and required PR artifacts)
  `lfg` should advance the first unmet gate it can safely determine.

- R5d. When resuming without an active manifest, `lfg` must distinguish between stages that can be proven complete from ambient evidence and stages that cannot. If a stage cannot be reliably proven complete from repo/PR state alone, `lfg` should treat it as pending instead of silently assuming it already happened.

- R5e. For PR-stage resume, `lfg` must inspect GitHub CI state and use it as part of orchestration. It may continue local verification and wrap-up work while CI is pending, but it must not silently declare the workflow complete while required external CI for the current HEAD is still failing or pending.

- R5f. `slfg` should become a deprecation wrapper or equivalent compatibility path that points users to `lfg` with swarm mode enabled, rather than remaining a parallel second contract surface.

- R5g. The resume engine must define explicit evidence rules for late-stage gates. In particular, local verification, browser validation, review/todo resolution, and wrap-up gates should remain pending unless `lfg` can point to durable current-run or current-HEAD evidence that those steps were completed.
- R5i. Late-stage best-effort steps must not derail the workflow by default. When browser validation or feature-video is inapplicable or blocked by ordinary environment/auth/tooling issues, `lfg` should record a skipped gate with a brief reason and continue unless the user or task explicitly requires that step.

- R5h. The resume engine must use a deterministic precedence order when reconstructing state:
  - active manifest state for the current run
  - explicit user-provided direction in the current `lfg` invocation
  - durable workflow artifacts and repo state
  - PR and CI state for the current branch/HEAD
  - targeted user clarification only when the gate state is still genuinely ambiguous after the earlier evidence sources

- R6. Core workflow skills must use the same role vocabulary in both normal and autopilot modes:
  - `Product Manager`
  - `Designer`
  - `Engineer`

- R7. Each core workflow skill must define its own ordered role weighting and orchestration bias so the model knows how to make recommendations in normal mode and bounded decisions in autopilot mode. The same roles apply in both modes; autopilot changes decision authority, not the rubric itself.

- R8. `ce:brainstorm` must use the role rubric even in normal interactive mode to recommend options, frame follow-up questions, and explain why one direction is preferred. Brainstorm should not wait for full autopilot support before adopting the rubric for recommendations.

- R9. Each core workflow skill that participates in autopilot (`ce:brainstorm`, `ce:plan`, `deepen-plan`, `ce:work`, and any other substantive decision-making workflow added later) must define:
  - what decisions it may make automatically
  - what decisions require user input
  - what decisions must be logged when made in autopilot

- R9a. The first implementation wave must cover the end-to-end autopilot entrypoints and the substantive decision-making workflow skills:
  - `lfg`
  - `ce:brainstorm`
  - `ce:plan`
  - `deepen-plan`
  - `ce:work`
  This wave should be thorough for those skills. Other autopilot-aware skills may continue using their existing prompt-skipping behavior and adopt the manifest/rubric/logging contract later if they begin making substantive autonomous product or implementation decisions.

- R9b. `document-review` must remain a review utility, not a primary autonomous decision-maker. In autopilot-related workflows, it may return findings, classifications, and deterministic document-quality fixes, but substantive product or implementation decisions discovered through review must be resolved by the owning workflow skill (`ce:brainstorm`, `ce:plan`, `deepen-plan`, or another future substantive skill), not by `document-review` itself.

- R9c. `document-review` should use these exact finding classes:
  - `mechanical-fix`: deterministic wording, formatting, terminology, or structure fix that does not change substantive meaning
  - `bounded-decision`: substantive issue with a small set of viable resolutions that the owning skill may auto-decide using its role rubric
  - `must-ask`: issue that exceeds the owning skill's documented decision authority and requires user input
  - `note`: non-blocking observation worth surfacing to the caller without forcing immediate resolution

- R10. The decision log must capture substantive autopilot decisions only: product choices, scoped behavior defaults, implementation path choices, and other bounded judgments that materially affect the output. Workflow trivia such as headless mode, cleanup choices, or whether a video step ran do not belong at the same level.

- R11. The decision log must be run-scoped, durable for the life of the autopilot run, and append-only so multiple skills can contribute decisions safely. It must exist even before a plan file is created so early autopilot decisions are not lost.

- R12. The canonical decision log must live in the run-scoped autopilot state under `.context/compound-engineering/`. If a plan document exists, the workflow must append a compact "Autopilot Decisions" summary there for the subset of logged decisions that materially affected the plan or implementation direction. The plan is a promoted summary, not the only source of truth.

- R12a. The plan-promotion rule should be:
  - include all logged rows from `brainstorm`, `plan`, or `deepen-plan` when they changed product behavior, scope, sequencing, risk handling, implementation direction, or verification strategy reflected in the plan
  - include `work` rows only when execution forced a meaningful plan-level deviation or resolved an implementation decision the plan had left open
  - exclude rows that are purely operational, already obsolete, or irrelevant to understanding the current plan
  - use the same column schema in the plan summary as in the canonical run log

- R13. A decision log row is required whenever the agent resolves a substantive question or ambiguity on the user's behalf without asking first. This includes both:
  - pre-existing open questions already called out in requirements, plans, or other workflow documents
  - new questions, conflicts, or discoveries surfaced during planning, deepening, or execution that require a bounded choice to keep moving

- R13a. When a substantive question is surfaced by `document-review` during an autopilot run, the review finding itself does not count as the logged decision. The owning workflow skill must evaluate the finding using its role ordering and orchestration bias, then log the resulting autonomous decision if it resolves the issue without asking the user.

- R14. A logged decision must represent a real autonomous choice, not a mechanical consequence. A row is required when there were multiple plausible paths and the selected path materially affected product behavior, implementation direction, scope within the local blast radius, or another outcome the user would reasonably want visibility into.

- R15. The human-facing decision log format should be easy to scan. A Markdown table is the target presentation format for the canonical run log and for any promoted plan summary.

- R15a. The exact phase-1 Markdown decision-log columns should be:
  - `#`
  - `Phase`
  - `Question`
  - `Decision`
  - `Why`
  - `Impact`
  - `Type`

- R15b. The `Type` column should use:
  - `documented-open-question`
  - `execution-discovery`
  - `conflict-resolution`

- R16. The runtime decision rubric must be available to the installed skills themselves. Because skills are packaged and copied independently, the solution must not depend on a plugin-root runtime file that is not guaranteed to ship with each installed skill.

- R17. The packaging strategy for the rubric must support cross-platform installs. A shared source-of-truth is acceptable during authoring, but the installed runtime form must be accessible from each skill's own installed directory.

## Success Criteria

- A full `lfg` run can activate autopilot deterministically without downstream skills guessing from caller prose.
- `/lfg` can start or resume from the current workflow gate state instead of only working as a fresh-start command.
- Core workflow skills make more consistent recommendations in normal mode because they use explicit role weighting and orchestration bias.
- Core workflow skills can make bounded autopilot decisions with a clear basis and leave a visible audit trail for substantive decisions.
- The autopilot run state makes artifact handoff deterministic: downstream skills can read the manifest instead of guessing which requirements doc or plan file was created earlier in the run.
- The decision log captures both documented open questions that autopilot resolved and new decisions discovered during execution, so forward-momentum choices are visible rather than silent.
- Review findings raised by `document-review` do not bypass the workflow owner's judgment; the owning skill remains responsible for deciding, updating the artifact, and logging substantive autonomous choices.
- Swarm mode remains available when explicitly requested, but it no longer requires a second top-level entrypoint to carry the same autopilot contract.
- When no active manifest exists, `lfg` can reconstruct the current gate state from repo and PR state, create a new manifest, and continue from the right next step.
- The resume engine uses a documented, deterministic gate order so two implementers would choose the same next step from the same repo/PR state.
- A PR-stage `/lfg` run can inspect CI, rerun local verification as needed, run browser validation when applicable, update PR artifacts, and stop short of DONE when an external blocker such as CI is still unresolved.
- `slfg` can be deprecated without breaking existing users abruptly because it clearly routes them onto the `lfg` contract and swarm mode rather than silently disappearing.
- The design works across Claude Code, Codex, and other installed targets without requiring platform-specific argument parsing features.

## Scope Boundaries

- Not redesigning the overall skill format or replacing skills with a single giant orchestrated prompt.
- Not redesigning swarm execution itself beyond moving it under `lfg` as an execution option instead of a separate top-level workflow.
- Not requiring perfect historical reconstruction of every past step; when `lfg` resumes without an active manifest, it only needs enough state inference to choose the safest next step and seed a new manifest.
- Not treating workflow trivia as first-class audit decisions.
- Not giving autopilot authority to invent major product direction without bounded criteria.
- Not depending on a single plugin-root runtime policy file unless that policy is copied into each installed skill's local runtime surface.
- Not specifying the full implementation details of every target platform's parser behavior beyond defining a common-denominator contract.

## Key Decisions

- **Autopilot is run-scoped, not session-scoped**: Long-lived agent sessions can span unrelated work. Autopilot state belongs to a single `lfg` invocation.
- **`lfg` is the autopilot entrypoint**: Downstream skills do not self-elect into autopilot mode, and `slfg` should not remain as a second top-level entrypoint.
- **Swarm is a mode, not a workflow**: Parallel/swarm execution should be requested through `lfg` or future repo/project configuration, not through a separate slash command with duplicated orchestration. `slfg` should remain only as a deprecation/compatibility path while users transition.
- **`lfg` is a resume-anywhere orchestrator**: It should be able to inspect current workflow state, decide what gate the work is currently blocked on, create a manifest if one is missing, and continue from the next appropriate step rather than assuming every run starts from ideation.
- **Resume uses ordered gates, not vague stage guesses**: `lfg` should evaluate ordered workflow gates and advance the first unmet one. Stages that cannot be reliably proven complete from ambient evidence should be treated as pending.
- **Late-stage evidence must be explicit**: Review resolution, local verification, browser verification, CI, and wrap-up artifacts should not be inferred from a generic "PR exists" signal. Those gates are complete only when `lfg` has current evidence for them.
- **PR-stage completion is explicit**: CI status, local verification, browser validation, unresolved todos/findings, and required PR artifacts are separate late-stage checks. `lfg` should not compress them into a single fuzzy "PR exists, therefore done" state.
- **Hybrid signaling**: Use a short explicit invocation marker plus a run manifest on disk. The marker activates autopilot deterministically; the manifest carries shared state and artifacts.
- **The manifest schema is fixed for phase 1**: `status` stays at the run level with `active | completed | aborted`; gate-by-gate progress and blockers live under `gates`, not as extra top-level run statuses.
- **Common-denominator parsing over platform-specific parsing**: Do not rely on Claude-only positional args or formatting assumptions that other targets may not preserve.
- **Roles are always active**: `Product Manager`, `Designer`, and `Engineer` shape recommendations in normal mode and bounded decisions in autopilot mode.
- **Orchestration bias is per skill, not a peer role**: It changes how aggressively a skill should continue, ask, or defer without replacing the substantive decision roles.
- **Only substantive autonomous decisions are logged**: The audit log is for product and implementation decisions the agent actually made on the user's behalf, including both pre-existing open questions and new execution discoveries, not routine workflow mechanics.
- **Review utilities inform but do not own substantive decisions**: `document-review` can surface and classify issues, but the skill that owns the artifact must decide how to resolve substantive findings in autopilot.
- **Run log first, plan summary second**: The run-scoped decision log is the canonical record. A plan, when it exists, gets a compact promoted summary of the relevant subset using the same row schema.
- **Decision rows have a fixed schema**: Use `# | Phase | Question | Decision | Why | Impact | Type` so the log captures both the ambiguity being resolved and the chosen path.
- **`document-review` classifications are fixed for phase 1**: Review findings should classify into `mechanical-fix`, `bounded-decision`, `must-ask`, or `note` so callers can resolve them consistently.
- **Runtime rubric must ship with the skill**: Installed skills need local access to the rubric they are expected to follow.

## Dependencies / Assumptions

- Assumes `.context/compound-engineering/` is the correct place for run-scoped workflow state and decision logs.
- Assumes `lfg` can consistently prepend a short marker to downstream skill input across supported targets.
- Assumes skills can read a manifest path passed in their argument payload and treat the remainder as normal input.
- Assumes the role rubric can be expressed compactly enough inside each participating skill, or through co-located references that ship with that skill.
- Assumes the workflow can promote relevant rows from the run log into a plan doc after the plan exists, without requiring the plan to be present when the first decisions are made.
- Assumes `document-review` can expose findings in a way the calling workflow skill can interpret and act on without turning review into a hidden decision-maker.
- Assumes swarm-mode selection can move behind `lfg` without losing the ability to request parallel execution explicitly, and that later repo/project defaults can live in `compound-engineering.local.md`.
- Assumes `lfg` can infer enough workflow gate state from repo artifacts and PR context to resume safely when no active manifest exists, and can fall back to a targeted user question when the state is genuinely ambiguous.
- Assumes late-stage verification steps can be modeled conservatively: if `lfg` cannot prove they were completed for the current HEAD, it may rerun or recheck them rather than assuming success.

## Outstanding Questions

### Resolve Before Planning

- [Affects R4][User decision] What exact syntax should be standardized for the already-chosen short prefix invocation marker used to activate autopilot runs?

### Deferred to Planning

- [Affects R2a][Technical] What exact repo/PR heuristics should `lfg` use to infer each workflow gate when resuming without an active manifest?
- [Affects R5c][Technical] What exact gate order and evidence rules should define resume-stage detection, especially for PR-stage verification and completion?
- [Affects R11][Technical] What append/update strategy should the Markdown decision log use so multiple skills can contribute rows safely and predictably during one run?
- [Affects R7][Technical] What is the exact role ordering and orchestration bias for each participating skill (`ce:brainstorm`, `ce:plan`, `deepen-plan`, `ce:work`, and any others)?
- [Affects R16][Technical] Should the runtime rubric live inline in each skill, in each skill's `references/`, or be authored centrally and copied into each skill during build/release?

## Next Steps

-> Proceed through planning and implementation with the prefix-marker approach, the ordered gate model, and `slfg` deprecation-wrapper behavior treated as settled direction for phase 1
