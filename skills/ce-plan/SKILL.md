---
name: ce-plan
description: "Create structured plans for multi-step work, including software and non-software tasks. Use when asked to plan, break down implementation, plan from requirements, or deepen an existing plan; prefer ce-brainstorm for exploratory framing."
argument-hint: "[optional: feature description, requirements doc path, plan path to deepen, or any task to plan] [output:html]"
---

# Create Technical Plan

**Note: The current year is 2026.**

**Outcome:** a plan an implementer can start from confidently — a few sentences in chat, a chat brief, or a durable plan artifact — handed off through its owning terminal workflow. `ce-brainstorm` defines **WHAT** to build as a requirements-only unified plan; `ce-plan` enriches it with **HOW**; `ce-work` executes it. A prior brainstorm is useful but never required.

**An explicit invocation always produces a plan.** Never classify a direct invocation as "not a planning task" and route out. It may select any output contract below, and the smallest valid plan is a few sentences in chat.

**Research, decide, and write the plan — never implement.** Do not write production code, run tests, or learn from execution-time results. Directional pseudo-code and grammar sketches may communicate design; changing code to see what happens belongs in `ce-work`.

## Mandatory Completion Contract

A run is complete when its output contract's done condition is met. Every normal interactive branch that produces a plan artifact or checkpoint is incomplete until its owning handoff question is presented: for a Durable software implementation-plan run that continues past Phase 0.1b, the Phase 5.4 menu presented and any selected action has actually fired. For Direct, the change stated and the handoff offered; for a Chat brief, the brief and its one-line save-or-`ce-work` offer in chat. Neither presents the Phase 5.4 menu. Non-software and approach-altitude routes use their reference workflow's terminal handoff. Answer-seeking may end after the answer unless its owner requires save/share.

Writing the file, checking confidence, and running or explicitly skipping `ce-doc-review` are intermediate milestones. Pipeline mode is complete only when the plan, confidence check, and non-interactive document-review state are returned to its caller; the caller owns the next action.

## Interaction Method

Ask one question at a time through the host's blocking question tool already in the current tool list. Match by capability; never probe a user-facing tool to discover it. If none is listed or a real question call errors, render numbered choices in chat; never silently skip a required question. If no feature description was supplied, ask what to plan and wait.

## Output Contract

The gate resolves at the start of Phase 0.6, before depth and the scoping synthesis. It applies only when no Phase 0.1 route fired and Phase 0.2 found no upstream artifact. Ground it with bounded inline reads of the surfaces the request names; dispatch no subagent. Select one:

- **Direct** — the work can be stated, done, and verified in one pass with no decision the user would weigh. State the change in a few sentences and offer the handoff to `ce-work` or the user; execution starts only with implementation authority, which `references/output-contracts.md` defines.
- **Chat brief** — bounded work with at most one decision the user would weigh and no risk surface. Deliver it in chat and stop.
- **Durable** — everything else. Continue the workflow below.

`references/output-contracts.md` owns Direct and Chat brief; read it when either is selected. When the tier is still uncertain after those reads, take the heavier one. When a read surfaces a decision the user would weigh, a risk surface, or multi-pass verification, re-resolve to the heavier tier before emitting anything. Durable regardless of size: a run with no synchronous user to act on chat this turn (pipeline, headless, goal- or scheduler-driven), a request whose wording asks for a plan, a plan file, or an output format, a request that continues an existing plan's item, and a risk surface — authentication, payments, migrations, external contracts.

## Workflow

Phases run in order unless an owner routes out or short-circuits. Read a phase's required reference when that phase is entered, completely; a read made before that phase does not satisfy it, and a terminal owner is read again at its step even when already in context. If a required reference cannot be read, stop before its governed action and report the blocker and recovery path; never reconstruct the missing mechanism from memory. In pipeline mode, every required-owner failure returns `status: blocked`, `phase`, `blocker`, and `recovery_path`; include `artifact_path` and preserve the artifact when one exists. Blocked status outranks artifact presence.

### Phase 0: Output, Resume, and Scope

1. **Output first.** Read `references/output-mode.md` before interpreting any phase. It owns token parsing, output and confirmation precedence, renderer selection, artifact-root rules, and when a repository may be resolved.
2. **Resume, deepen, approach, and domain.** Read `references/resume.md` before acting. It owns repo-backed resume discovery, requirements-only enrichment, deepen fast paths, approach-altitude routing, and the software/non-software split. Follow any terminal route it selects; otherwise continue.
3. **Source and scope.** Read `references/intake.md` before Phase 0.2 and follow it through Phase 0.7. It owns upstream-contract discovery, preservation, bootstrap route-outs, blocking questions, depth, named-resource handling, and solo scoping synthesis; the Output Contract gate above resolves inside it. Do not cross a required gate that has not resolved.

### Phases 1-4: Research and Compose

4. Read `references/research.md` before gathering context. It owns local and external research, agent-native triage, consolidation, depth reclassification, and flow analysis.
5. Read `references/structure.md` before resolving questions or structuring the plan. It owns settled-decision handling, stable U-IDs, technical design, depth, and planning boundaries.
6. Compose from `references/plan-sections.md` plus the format-rendering reference selected by `output-mode.md`.

### Phase 5: Review, Write, Deepen, and Hand Off

7. Read `references/final-review.md` before pre-write review. It owns Phase 5.1 through 5.3.2, including scoping synthesis, write-path mechanics, unified-plan metadata, confidence mode, and the deepening gate. When directed, read `references/deepening-workflow.md` for steps 5.3.3-5.3.7.
8. **Model elevation.** Immediately before authoring, read `references/reasoning-elevation.md`, resolve the choice at this boundary, and follow it. Do not author until activation resolution has completed and any selected dispatch or transparent fallback has settled.
9. In pipeline mode, invalidating evidence against a session-settled decision stops the write. Return the exact token `settled-decision-invalidated`, the decision, and the reason; do not resolve it silently.
10. Write the plan before presenting options, then complete the confidence path owned by `final-review.md`.

**STOP. Read `references/plan-handoff.md` immediately before Phase 5.3.8 and 5.4.** Document review is mandatory for a Durable plan and the default is non-interactive (`mode:non-interactive`). The reference owns final checks, menu visibility and rendering, every selected route, and issue creation. In interactive software runs, ask exactly: "Plan ready at `<absolute path to plan>`. What would you like to do next?" Present the owner-defined menu and wait. If the selection arrives after a user turn, reload `references/plan-handoff.md` before acting. Rendering the menu, receiving a selection, or announcing a route is not completion; execute the selected action.
