---
title: "feat: Integrate user personas into compound-engineering workflow"
type: feat
status: active
date: 2026-04-10
---

# Integrate User Personas into Compound-Engineering Workflow

## Overview

Add a new persona type — user personas — to the compound-engineering plugin. Unlike code reviewers (who analyze diffs and output structured JSON findings), user personas imagine using a feature from distinct perspectives and produce narrative scenarios. They participate at multiple workflow stages: after concept/brainstorm, after planning, after implementation, and before rollout.

Five user personas already exist in `JumpstartLab/ce-reviewers-jsl` under `users/` (Nancy, Dorry, Chuck, Betty, Mark). The registry already has a `jsl-users` source entry. This plan covers the plugin-side integration: sync support, a new skill to orchestrate persona evaluation, and workflow phase additions.

## Problem Frame

Features ship half-baked because testing focuses on implementation correctness, not user experience. The Projects feature in Radar had working models, controllers, and views — but "Open Project" reopened the sidebar, the Edit button did nothing, and there was no way to add tasks from the project page. No existing test or review caught these gaps because nothing in the workflow evaluates features from a user's perspective before or after implementation.

## Requirements Trace

- R1. User personas must sync from external repos via `/ce:refresh`, parallel to reviewer sync
- R2. A new skill (`ce:user-scenarios`) must spawn all user personas in parallel against a feature description and collect their narratives
- R3. The skill must support multiple evaluation stages: concept scenarios, plan questions, implementation testing, and final presentation
- R4. Erin's orchestrator must include user persona phases at appropriate workflow points
- R5. User persona output must be narrative (markdown), not structured JSON findings
- R6. Persona synthesis must distill narratives into actionable items: acceptance test scenarios, UX gaps, and design issues

## Scope Boundaries

- Not building acceptance test auto-generation from narratives (future work)
- Not modifying the code review pipeline — user personas are separate from reviewers
- Not adding new personas — the five existing ones are sufficient
- Not building a visual/screenshot-based testing capability for the implementation stage (future work)

## Context & Research

### Relevant Code and Patterns

- `skills/refresh/sync-reviewers.sh` — Generic sync script, takes `(registry, output-dir, config-name)`. Already supports multiple persona types via the config-name parameter.
- `skills/refresh/SKILL.md` — Currently only invokes sync for reviewers. Needs additional invocation for users.
- `skills/ce-review/SKILL.md` — Pattern for spawning parallel sub-agents, collecting output, and synthesizing. The user-scenarios skill follows the same orchestration pattern but with narrative output instead of JSON.
- `skills/ce-review/references/subagent-template.md` — Template for reviewer sub-agents. User personas need an analogous template with different framing (feature description instead of diff, narrative output instead of JSON).
- `agents/review/` — Existing agent directory with `.gitignore` for synced files. `agents/user/` mirrors this pattern.
- `orchestrators/erin.md` — Current workflow phases. New user persona phases insert between existing phases.

### Institutional Learnings

- The sync script processes sources in reverse order so first-listed source wins on conflicts — same mechanism works for user personas
- Reviewer registry already has a `jsl-users` source entry pointing to `users/` path in the JSL repo
- Persona files use `type: user-persona` in frontmatter with `traits` section (pace, tech-comfort, frustration-trigger, usage-pattern)
- Each persona has its own output format template (e.g., "Nancy's Experience", "Chuck's Run-Through") embedded in its markdown body

## Key Technical Decisions

- **Separate `agents/user/` directory**: User personas are not code reviewers. Mixing them into `agents/review/` would confuse the reviewer selection logic in `ce:review`. Clean separation.
- **Single skill with stage parameter**: Rather than four separate skills for each workflow stage, `ce:user-scenarios` accepts a `stage` parameter (concept, plan, implementation, presentation) that changes the framing given to personas. The persona files themselves don't change — the prompt context does.
- **Narrative output, not JSON**: User personas produce markdown narratives in their own voice. A synthesis step distills these into actionable items. This preserves the persona voice while making the output useful for planning.
- **Haiku for persona agents**: User personas are well-defined characters with clear instructions. Haiku handles this well and keeps cost low when spawning five agents in parallel.
- **Separate user-sources.yaml config**: Following the existing pattern where reviewers have `reviewer-sources.yaml` and orchestrators have `orchestrator-sources.yaml`, user personas get `user-sources.yaml`. Independent configuration.

## Open Questions

### Resolved During Planning

- **Where do user persona phases go in Erin's workflow?** After brainstorm (concept stage), after plan (questions stage), after work+review (testing stage). The presentation stage is optional and triggered by the user.
- **Should the skill filter which personas to spawn?** No — always spawn all five. They're designed to cover complementary perspectives. Unlike reviewers where 40+ exist and selection matters, five personas is a manageable fixed set.

### Deferred to Implementation

- **How should the implementation testing stage work without browser automation?** For now, personas evaluate based on the plan and implementation description. Visual testing (screenshots, browser automation) is future work.
- **Should persona narratives persist as files?** TBD — may write to `docs/user-scenarios/` or just present inline. Decide during implementation based on what feels right.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Workflow with user personas:

  brainstorm ──► user-scenarios(concept) ──► plan ──► user-scenarios(plan) ──► work ──► review ──► user-scenarios(testing) ──► compound
                 │                                    │                                           │
                 ▼                                    ▼                                           ▼
            Spawn 5 personas              Spawn 5 personas                                 Spawn 5 personas
            in parallel                   in parallel                                      in parallel
                 │                                    │                                           │
                 ▼                                    ▼                                           ▼
            Collect narratives            Collect questions                                Collect test results
                 │                                    │                                           │
                 ▼                                    ▼                                           ▼
            Synthesize into:              Surface blocking                                 Synthesize into:
            - Scenario list               questions before                                 - UX gaps found
            - UX gaps                     implementation                                   - Acceptance test gaps
            - Acceptance criteria                                                          - Polish items
```

The `ce:user-scenarios` skill:
1. Reads all `.md` files from `agents/user/`
2. Constructs a prompt from the subagent template + stage-specific framing + feature context
3. Spawns each persona as a parallel Agent with `model: haiku`
4. Collects markdown narratives from each
5. Runs a synthesis pass that distills into actionable output

## Implementation Units

- [ ] **Unit 1: Create `agents/user/` directory with sync infrastructure**

**Goal:** Establish the directory where synced user persona files will live, mirroring the `agents/review/` pattern.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `agents/user/.gitignore`

**Approach:**
- Create `agents/user/` directory
- Add `.gitignore` that ignores all `.md` files except templates (matching `agents/review/.gitignore` pattern)
- This is the target directory for the sync script

**Patterns to follow:**
- `agents/review/.gitignore`

**Test expectation:** none — pure scaffolding

**Verification:**
- Directory exists with `.gitignore`
- `.gitignore` pattern matches `agents/review/.gitignore`

---

- [ ] **Unit 2: Update refresh skill to sync user personas**

**Goal:** Make `/ce:refresh` sync user personas from external repos into `agents/user/`, in addition to existing reviewer and orchestrator sync.

**Requirements:** R1

**Dependencies:** Unit 1

**Files:**
- Modify: `skills/refresh/SKILL.md`

**Approach:**
- Add a third sync invocation in Step 3 that calls `sync-reviewers.sh` with output dir `agents/user` and config name `user`
- Update Step 2 to also read and display user sources from `user-sources.yaml`
- Update Step 1's plugin location discovery to also check for `agents/user` path
- The sync script already handles the config-name parameter generically — no changes to `sync-reviewers.sh` needed

**Patterns to follow:**
- Existing Step 3 pattern for reviewer sync invocation
- The orchestrator sync pattern (if one exists in the skill)

**Test scenarios:**
- Happy path: `/ce:refresh` syncs reviewers, orchestrators, AND user personas, showing summary for each
- Happy path: First run creates `user-sources.yaml` from registry defaults
- Edge case: `agents/user/` directory doesn't exist yet — sync script creates it via `mkdir -p`
- Edge case: No user sources configured — script reports "No external user sources configured" and continues with reviewer sync

**Verification:**
- Running `/ce:refresh` produces three sync summaries (reviewers, orchestrators, users)
- User persona files appear in `agents/user/` after sync

---

- [ ] **Unit 3: Create user persona subagent template**

**Goal:** Define the prompt template used to spawn each user persona agent, analogous to the reviewer subagent template but oriented around feature narratives instead of code review findings.

**Requirements:** R2, R3, R5

**Dependencies:** None

**Files:**
- Create: `skills/ce-user-scenarios/references/user-subagent-template.md`

**Approach:**
- Template receives: persona file content, feature context, stage-specific framing
- Stage-specific framing blocks for each stage:
  - `concept`: "You're hearing about this feature for the first time. Imagine how you'd use it day-to-day."
  - `plan`: "The team is about to build this. What questions do you have? What concerns you?"
  - `implementation`: "This has been built. Walk through it as if you're using it. What works? What doesn't?"
  - `presentation`: "The team is showing you the finished feature. Give your honest reaction."
- Output contract: narrative markdown in the persona's own voice, using the output format from their persona file
- No JSON, no structured findings, no confidence scores

**Patterns to follow:**
- `skills/ce-review/references/subagent-template.md` for overall template structure
- Persona output format sections in the persona files themselves (e.g., "Nancy's Experience", "Chuck's Run-Through")

**Test expectation:** none — template file, not executable code

**Verification:**
- Template has clear variable slots for persona, feature context, and stage framing
- Template explicitly instructs narrative output, not JSON
- Each stage has distinct framing that changes the persona's evaluation posture

---

- [ ] **Unit 4: Create `ce:user-scenarios` skill**

**Goal:** Build the orchestration skill that spawns user personas in parallel, collects their narratives, and synthesizes actionable output.

**Requirements:** R2, R3, R5, R6

**Dependencies:** Unit 3

**Files:**
- Create: `skills/ce-user-scenarios/SKILL.md`

**Approach:**
- Skill accepts args: `stage:<concept|plan|implementation|presentation>` and optionally `plan:<path>` or inline feature description
- Step 1: Locate plugin and read all `.md` files from `agents/user/`
- Step 2: Build feature context from args — read plan file, brainstorm output, or use inline description
- Step 3: Select stage-specific framing from the subagent template
- Step 4: Spawn each persona as a parallel Agent sub-agent with `model: haiku`, injecting persona file + feature context + stage framing
- Step 5: Collect all narrative responses
- Step 6: Synthesis — run a synthesis pass that reads all five narratives and produces:
  - Common themes across personas (issues multiple personas hit)
  - Unique perspective items (issues only one persona found, but important)
  - Actionable items categorized as: acceptance test scenarios, UX gaps, design issues, missing features
  - Priority ordering based on how many personas were affected and severity
- Present synthesis to user, then present individual persona narratives for detail

**Patterns to follow:**
- `skills/ce-review/SKILL.md` for the parallel agent spawning and synthesis pattern
- `skills/ce-brainstorm/SKILL.md` for skill frontmatter format

**Test scenarios:**
- Happy path: Skill reads 5 personas, spawns 5 agents, collects 5 narratives, produces synthesis
- Happy path: `stage:concept` with a feature description produces usage scenarios
- Happy path: `stage:plan` with a plan file path reads the plan and produces questions
- Edge case: No persona files in `agents/user/` — skill reports error and suggests `/ce:refresh`
- Edge case: One persona agent times out — skill continues with the 4 that responded

**Verification:**
- Skill produces five persona narratives and a synthesis section
- Synthesis categorizes findings into acceptance tests, UX gaps, and design issues
- Each persona's narrative uses their defined output format

---

- [ ] **Unit 5: Update Erin's orchestrator with user persona phases**

**Goal:** Add user persona evaluation phases to Erin's workflow at the right insertion points.

**Requirements:** R4

**Dependencies:** Unit 4

**Files:**
- Modify: `orchestrators/erin.md`

**Approach:**
- Add three new phases to Erin's phases list:
  1. `user-scenarios` — after brainstorm, before plan. `skill: ce:user-scenarios`, `args: "stage:concept $ARGUMENTS"`. Optional, skip when: "Backend-only change with no user-facing behavior. Pure refactor. Bug fix with no UX change."
  2. `user-plan-review` — after plan-review, before work. `skill: ce:user-scenarios`, `args: "stage:plan plan:$PLAN_PATH"`. Optional, skip when: "Plan is simple and low-risk. No user-facing changes. Time-sensitive fix."
  3. `user-testing` — after review (before todo-resolve). `skill: ce:user-scenarios`, `args: "stage:implementation plan:$PLAN_PATH"`. Optional, skip when: "Backend-only change. API-only change with no UI. The feature was already tested with users at concept stage and implementation matches exactly."
- Update Erin's skip rules section to include guidance for user persona phases
- Gate for user-scenarios: "User personas must produce scenario narratives. If output is thin or personas couldn't engage meaningfully with the concept, the feature description may need more detail."
- Gate for user-testing: "User persona testing must surface any UX gaps. Critical gaps (can't complete core task) must be fixed before proceeding."

**Patterns to follow:**
- Existing phase definitions in `orchestrators/erin.md` (brainstorm, plan-review phases with optional/skip-when)

**Test scenarios:**
- Happy path: Erin workflow with a UI feature invokes user-scenarios after brainstorm, user-plan-review after plan, and user-testing after review
- Happy path: Erin skips user persona phases for backend-only work
- Edge case: User explicitly skips a user persona phase — Erin notes the skip and continues

**Verification:**
- Erin's phases list includes three new user persona phases at correct positions
- Each phase has appropriate optional/skip-when conditions
- Phase args correctly reference skill and pass stage/plan variables

---

- [ ] **Unit 6: Update AGENTS.md with user persona documentation**

**Goal:** Document the new `agents/user/` directory and `ce:user-scenarios` skill in the plugin's agent documentation.

**Requirements:** R1, R2

**Dependencies:** Units 1, 4

**Files:**
- Modify: `AGENTS.md`

**Approach:**
- Add `agents/user/` to the directory structure section alongside `agents/review/`, `agents/document-review/`, etc.
- Document the user persona type, its frontmatter schema (`type: user-persona`, `traits` section), and how it differs from reviewers
- Add `ce:user-scenarios` to the skill listing

**Patterns to follow:**
- Existing directory and skill documentation in `AGENTS.md`

**Test expectation:** none — documentation only

**Verification:**
- AGENTS.md accurately reflects the new directory and skill

## System-Wide Impact

- **Interaction graph:** `ce:refresh` → `sync-reviewers.sh` → `agents/user/`. `ce:user-scenarios` → `agents/user/*.md` → parallel Agent sub-agents. Erin orchestrator → `ce:user-scenarios` at three workflow points.
- **Error propagation:** If user persona sync fails, it should not block reviewer or orchestrator sync. If a persona agent fails during `ce:user-scenarios`, the skill should continue with remaining personas.
- **State lifecycle risks:** None — user personas are stateless. No persistent state between invocations.
- **API surface parity:** The `ce:user-scenarios` skill should be invocable both from orchestrators (Erin's phases) and directly by users (`/ce:user-scenarios stage:concept "feature description"`).
- **Unchanged invariants:** The existing `ce:review` pipeline, reviewer sync, and orchestrator behavior are completely unchanged. User personas are additive only.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Plugin cache changes are lost on plugin update | Changes must be committed to the plugin source repo, not just the cache |
| Five Haiku agents in parallel may be slow | Haiku is fast; parallel execution keeps wall-clock time low. Monitor and adjust. |
| Persona narratives may be too generic or repetitive | The personas are well-differentiated with distinct voices and concerns. Synthesis step deduplicates. |
| Concept-stage evaluation without a built product may produce vague feedback | Stage-specific framing guides personas to be concrete. "Imagine clicking through this" not "what do you think about this idea." |

## Sources & References

- User persona files: `JumpstartLab/ce-reviewers-jsl` repo, `users/` directory
- Sync script: `skills/refresh/sync-reviewers.sh`
- Reviewer subagent template: `skills/ce-review/references/subagent-template.md`
- Erin orchestrator: `orchestrators/erin.md`
