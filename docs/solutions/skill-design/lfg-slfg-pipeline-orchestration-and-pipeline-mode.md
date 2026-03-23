---
title: "LFG/SLFG pipeline orchestration and the Pipeline Mode pattern"
category: skill-design
date: 2026-03-22
severity: medium
component: plugins/compound-engineering/skills
tags:
  - lfg
  - slfg
  - pipeline-mode
  - orchestration
  - ce-brainstorm
  - ce-plan
  - skill-chaining
  - autonomous-workflow
---

# LFG/SLFG Pipeline Orchestration and the Pipeline Mode Pattern

## Problem

The `lfg` (sequential) and `slfg` (swarm/parallel) skills are full autonomous engineering workflows that chain multiple `ce:*` skills in sequence. Both were missing `ce:brainstorm` -- the requirements exploration step that precedes `ce:plan`. This caused two issues:

1. Users running `/lfg` or `/slfg` with vague feature descriptions went straight to planning without requirements clarification.
2. The brainstorm step (which answers WHAT to build) was skipped, forcing `ce:plan` (which answers HOW to build) to also handle requirements gathering -- a responsibility mismatch.

Adding `ce:brainstorm` to the pipeline was not straightforward because brainstorm had interactive behaviors that would block an autonomous pipeline.

## Investigation

### Pipeline structure before the fix

**lfg** ran skills sequentially:

1. plan
2. deepen-plan (conditional)
3. work
4. review
5. resolve-todos
6. test-browser
7. feature-video

**slfg** was the same pipeline but used swarm mode for `ce:work` and ran review + test-browser as parallel background agents.

### Why naive insertion would not work

Three behaviors in `ce:brainstorm` prevented simple insertion:

1. **No short-circuit for clear requirements.** Phase 0.2 was supposed to be a fast path for unambiguous feature descriptions, but it always continued to Phase 1.3 (interactive dialogue), which asks the user questions one at a time. In a pipeline, this would block indefinitely on each question.

2. **Phase 4 handoff invoked ce:plan directly.** After generating a requirements doc, brainstorm would invoke `ce:plan` as a chained handoff. If brainstorm was followed by `ce:plan` in the pipeline, plan would run twice.

3. **No awareness of pipeline context.** `ce:brainstorm` did not detect `disable-model-invocation` frontmatter (the signal that a skill is running inside an automated pipeline), so it could not adjust its behavior.

### Existing pipeline-aware precedent

`ce:plan` already had a "Pipeline mode" section (line 555 of its SKILL.md) that detects `disable-model-invocation` context and skips interactive prompts. This established the pattern but it was undocumented as a general convention.

## Root Cause

Two gaps:

1. `ce:brainstorm` lacked pipeline mode awareness -- it did not know how to behave when invoked from an automated pipeline.
2. The brainstorm short-circuit (Phase 0.2) was not a genuine skip in any context -- even for clear requirements it continued to interactive dialogue.

## Solution

Three-part fix across four files.

### 1. Added Pipeline Mode to ce:brainstorm

Added a `## Pipeline Mode` section that defines behavior when invoked from LFG/SLFG/disable-model-invocation context:

- **Phase 0.1:** If a relevant requirements doc already exists in `docs/brainstorms/`, check staleness first: skip the doc if a completed plan in `docs/plans/` already references it (via `origin:` + `status: completed`), or if its scope meaningfully diverges from the current `$ARGUMENTS`. If the doc is still relevant, check for `Resolve Before Planning` items -- if blocking questions remain, resume the brainstorm to resolve them rather than returning control (otherwise the pipeline dead-ends). If the doc is plan-ready, return control immediately.
- **Empty feature description:** Ask the user. This is the one interaction that cannot be skipped -- brainstorm owns "what do you want to build?"
- **Phase 0.2:** Genuine skip when requirements are clear. Do NOT proceed to Phase 1.3 (interactive dialogue) or Phase 3.
- **Workflow prompts** (handoff menus, "what do you want to do next?", "resume or start fresh?", post-generation options): Skip. The pipeline controls routing.
- **Content prompts** (clarifying what to build, resolving ambiguity, scoping questions): Still ask. The user is present and bad requirements waste every downstream step.
- **Phase 4 handoff:** Skip entirely. Do not invoke `ce:plan`, do not present options. Write the requirements doc and return control to the calling pipeline.

### 2. Added complexity-aware routing to lfg and slfg

Both skills now assess task complexity in Phase 0 before invoking any downstream skills:

- **Direct:** Trivial, obvious fixes (typos, renames). Makes the change, verifies, done. No skills loaded.
- **Lightweight:** Clear, bounded tasks where requirements are already in the description. Does the work directly with verification and self-review. Skips brainstorm, plan, and multi-agent review.
- **Full Pipeline:** Tasks with enough scope, ambiguity, or risk that structured planning prevents wasted work. Runs the complete skill chain including brainstorm.

The routing biases toward under-routing -- when the boundary between tiers is unclear, it prefers the cheaper path (Direct over Lightweight, Full Pipeline over Lightweight when ambiguity exists).

Within the Full Pipeline path, `/ce:brainstorm $ARGUMENTS` runs as step 1 (before optional ralph-loop). Ralph-loop is repositioned to step 2 -- after brainstorm (which may need user interaction) but before plan (which is autonomous).

In slfg specifically: brainstorm runs in the Brainstorm Phase without swarm mode -- only `ce:work` uses swarm.

### 3. Documented Pipeline Mode Convention in AGENTS.md

Added a `## Pipeline Mode Convention` section to `plugins/compound-engineering/AGENTS.md` that documents the pattern for future skill authors:

- When to add pipeline mode (skills with interactive handoff menus or post-generation AskUserQuestion calls)
- What pipeline mode means (skip prompts, skip handoffs, write outputs, return control)
- How context is detected (`disable-model-invocation` frontmatter)

## Key Design Decisions

### Full Pipeline always invokes brainstorm, not conditionally

Within the Full Pipeline path, brainstorm is always invoked rather than duplicating its skip criteria in the router. Brainstorm's own Phase 0.2 handles the skip assessment internally -- this keeps the decision logic in one place and avoids the pipeline second-guessing the skill. The Direct and Lightweight paths bypass brainstorm entirely because those tasks have clear, specified requirements by definition.

### Pipeline mode is skill-internal

The skill itself detects pipeline context and adjusts behavior. The calling pipeline does not override the skill's behavior or pass special flags. This preserves the skill's autonomy and keeps the pipeline definition simple -- it is just a list of skills to invoke.

### Empty arguments mean brainstorm asks

Brainstorm owns the question "what do you want to build?" If the user invokes `/lfg` without arguments, brainstorm is the skill that asks for clarification -- not `ce:plan`. This is the one AskUserQuestion that pipeline mode does NOT skip.

### Step ordering matters for resolve-todo

The old lfg ran resolve-todo before test-browser, meaning test-browser findings were never resolved. The corrected order is: review -> test-browser -> resolve-todo-parallel. This ensures all findings from both review and testing get addressed.

### Feature-video is conditional on project type

Not all projects have a browser-based UI to record. CLI tools, plugins, libraries, and APIs have no visual walkthrough to capture. Feature-video is skipped when the project has no browser-based UI.

### No explicit wiring between brainstorm output and plan input

`ce:plan` Phase 0 already searches `docs/brainstorms/` for matching requirements docs. When brainstorm writes its output there and returns control, `ce:plan` discovers it through its existing search. No new data-passing mechanism was needed.

## Prevention

- When adding new skills that have interactive handoff menus or post-generation options, add a `## Pipeline Mode` section if the skill might be invoked from lfg/slfg. The AGENTS.md Pipeline Mode Convention section documents this expectation.
- Skills with pipeline mode as of this writing: `ce:brainstorm`, `ce:plan`.
- Test pipeline integration by invoking the full `/lfg` flow, not just the individual skill. A skill that works perfectly in isolation can still block a pipeline.

## Related Files

- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` -- Pipeline Mode section added
- `plugins/compound-engineering/skills/lfg/SKILL.md` -- brainstorm step inserted
- `plugins/compound-engineering/skills/slfg/SKILL.md` -- brainstorm step inserted
- `plugins/compound-engineering/AGENTS.md` -- Pipeline Mode Convention section added
- `plugins/compound-engineering/skills/ce-plan/SKILL.md` -- pipeline mode promoted from one-liner to proper section with workflow-vs-content distinction
