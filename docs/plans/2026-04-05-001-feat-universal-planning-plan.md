---
title: "feat: Add universal planning support for non-software tasks"
type: feat
status: completed
date: 2026-04-05
origin: docs/brainstorms/2026-04-05-universal-planning-requirements.md
---

# feat: Add universal planning support for non-software tasks

## Overview

ce:plan currently self-gates on non-software tasks because its description, trigger phrases, and workflow phases are all software-specific. This plan adds a detection stub to Phase 0 that identifies non-software tasks early and routes them to a dedicated reference file (`references/universal-planning.md`) containing a domain-agnostic planning workflow. The software path is completely unchanged.

## Problem Frame

Users reach for `/ce:plan` for any multi-step planning — trip itineraries, study plans, team offsites. The model refuses because ce:plan's language signals software-only use. The structured thinking (ambiguity assessment, research, sequencing, dependencies) is domain-agnostic; only the current implementation is software-specific. (see origin: `docs/brainstorms/2026-04-05-universal-planning-requirements.md`)

## Requirements Trace

- R1. Update ce:plan YAML description and trigger phrases for non-software planning
- R2. Detect non-software tasks early in Phase 0
- R3. Error policy: default to software when uncertain, ask when ambiguous
- R4. Verify ce:brainstorm doesn't self-gate (confirmed: it doesn't — no changes needed)
- R5. Non-software path loads `references/universal-planning.md`, skips Phases 0.2 through 5.1 (all software-specific phases)
- R6. Ambiguity assessment before planning
- R7. Focused inline Q&A (~3 questions guideline)
- R8. Quality principles guide output, not a template
- R9. Web research capability (Phase 2 extension — not in this plan)
- R10. Local file interaction (Phase 2 extension — not in this plan)
- R11. Reference file extraction for token cost management
- R12. Negligible token cost increase for software users

## Scope Boundaries

- Software planning path is NOT modified — zero changes to Phases 0.2-5.4
- ce:brainstorm NOT modified — verified domain-agnostic, no self-gating
- ce:work NOT modified — remains software-only
- R9 (web research) and R10 (local files) deferred to Phase 2 extension
- No domain-specific templates — quality principles only
- Pipeline mode (LFG/SLFG): non-software tasks produce a stop message, not a plan

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-plan/SKILL.md` — 688-line skill with phased workflow (0.1-5.4). Detection inserts at Phase 0.1b (after resume, before requirements doc search).
- `plugins/compound-engineering/skills/ce-plan/references/` — existing reference files loaded via backtick paths: `deepening-workflow.md` (Phase 5.3), `plan-handoff.md` (Phase 5.4), `visual-communication.md` (Phase 4.4). Pattern: "read `references/<file>.md` for [what it contains]"
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` — description is domain-agnostic ("Explore requirements and approaches through collaborative dialogue"). Does not self-gate.
- `plugins/compound-engineering/skills/lfg/SKILL.md` — pipeline gate at step 2: "Verify that the ce:plan workflow produced a plan file in `docs/plans/`. If no plan file was created, run `/ce:plan $ARGUMENTS` again." Must handle non-software gracefully.
- `plugins/compound-engineering/skills/slfg/SKILL.md` — similar pipeline, step 2 records plan path from `docs/plans/`.

### Institutional Learnings

- `docs/solutions/skill-design/beta-skills-framework.md` — Config-driven routing within a single SKILL.md was rejected due to instruction blending risk. Our approach (early detection stub that branches to a reference file) is the recommended pattern: "clear, early context-detection phase that sets the mode before instructions diverge."
- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` — Auto-detection of context to switch modes is unreliable; explicit arguments are safer. Mitigated by R3 error policy (default to software, ask when uncertain). Known tradeoff worth monitoring.
- `docs/solutions/skill-design/research-agent-pipeline-separation-2026-04-05.md` — Don't skip research entirely for non-software tasks; substitute rather than remove. Core path defers research to Phase 2 extension.
- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md` — Use explicit state checks for conditional behavior, not prose-described hedging. Detection uses structured signal lists, not vague instructions.

## Key Technical Decisions

- **Detection as explicit state checks, not prose**: Detection uses enumerated software signals (code references, programming languages, APIs, etc.) and classifies based on presence/absence, not vague heuristic matching. This follows the state-machine learning.
- **Reference file extraction justified**: The non-software workflow is ~80-100 lines of entirely different phase instructions. This exceeds the "~20% of skill content, conditional" threshold for extraction per the Plugin AGENTS.md compliance checklist.
- **Self-contained reference file**: `references/universal-planning.md` handles its own write and handoff rather than reusing Phase 5.2 and plan-handoff.md, because the handoff options differ substantially (no ce:work, no issue creation, user-chosen file location). This duplicates ~8 lines of Proof upload logic and the file-write step. Accepted tradeoff: self-containment is simpler to maintain than conditional notes threaded through the software phases.
- **Pipeline mode stop signal**: In pipeline mode, detection outputs a clear message and stops. LFG/SLFG get a one-line addition to handle this gracefully rather than retrying.
- **No ce:brainstorm changes**: Verified domain-agnostic. Repo scan waste on non-software tasks is acceptable — optimizing it is a separate concern.

## Open Questions

### Resolved During Planning

- **Detection heuristics**: Use explicit signal lists (software: code/repo/language/API/database/test references; non-software: clearly non-software domain + no software signals). Default to software when uncertain.
- **Quality principles**: Actionable steps, dependency-sequenced, time-aware, resource-identified, contingency-aware, appropriately detailed, domain-appropriate format.
- **ce:brainstorm self-gating**: Confirmed domain-agnostic. No changes needed.
- **LFG/SLFG contract**: ce:plan outputs a stop message; LFG/SLFG get a note to handle non-software gracefully.
- **Plan file location**: User-chosen via prompt (docs/plans/ if exists, CWD, /tmp, or custom).

### Deferred to Implementation

- **Exact detection wording**: The signal lists are defined but exact phrasing will be refined during implementation to avoid instruction blending.
- **Quality principle effectiveness**: May need tuning after manual testing with diverse non-software prompts.
- **Research opt-in UX (Phase 2 extension)**: When the non-software path determines external research would improve the plan, prompt the user before dispatching — don't auto-research. This keeps token cost under user control. Frame as: "I think researching [topics] would improve this plan. Want me to look into it?"
- **Haiku model for research agents (Phase 2 extension)**: When running in Claude Code, dispatch web research sub-agents with `model: "haiku"`. Web search and result synthesis don't need Opus-level reasoning. This significantly reduces the 15x token overhead documented in Anthropic's multi-agent research system patterns. The Agent tool's `model` parameter supports this directly.
- **Research decomposition pattern (Phase 2 extension)**: Per Anthropic's multi-agent research findings, decompose the planning goal into 2-5 independent research questions and dispatch parallel web searches rather than sequential queries. Scale research depth to task complexity (0 searches for simple tasks, 2-3 for medium, 5+ for complex). Start with broad queries, narrow based on findings.

## Implementation Units

- [ ] **Unit 1: Update ce:plan YAML frontmatter**

**Goal:** Update the skill description and argument-hint to include non-software planning triggers so the model routes non-software requests to ce:plan.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md` (lines 1-4, YAML frontmatter)

**Approach:**
- Update `description` to include non-software planning triggers. Keep software triggers intact; add non-software ones alongside.
- **Routing boundary with ce:brainstorm**: ce:plan is for structuring an already-decided task into an actionable plan; ce:brainstorm is for exploring what to do when uncertain. Include this distinction in trigger phrasing — e.g., ce:plan triggers on "plan this", "break this down", "create a plan for [specific goal]"; ce:brainstorm triggers on "help me think through", "what should we build", "I'm not sure about scope."
- Update `argument-hint` to include non-software examples.
- Keep the description concise — avoid making it so broad that the model over-routes to ce:plan. Include a negative signal where natural (e.g., "for exploratory or ambiguous requests, prefer ce:brainstorm first" — already present, keep it).

**Patterns to follow:**
- ce:brainstorm's description style: domain-agnostic framing with specific trigger phrases

**Test scenarios:**
- Happy path: `/ce:plan a 3 day trip to Disney World` triggers ce:plan (previously would not)
- Happy path: `/ce:plan plan the auth refactor` still triggers ce:plan (no regression)
- Edge case: Conversational "help me plan my team offsite" — model should consider ce:plan as a candidate (not just ce:brainstorm)

**Verification:**
- Description includes both software and non-software trigger phrases
- Argument-hint includes a non-software example

---

- [ ] **Unit 2: Add detection stub to ce:plan SKILL.md**

**Goal:** Insert a non-software detection phase (0.1b) after the resume check (0.1) and before requirements doc search (0.2) that classifies the task and branches to the non-software path when appropriate.

**Requirements:** R2, R3, R11, R12, pipeline scope boundary

**Dependencies:** Unit 3 (the reference file must exist for the detection stub to function in testing, though the SKILL.md edit can be written first)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md` (insert new section after Phase 0.1, ~line 75)

**Approach:**
- New section `#### 0.1b Detect Non-Software Task` placed between Phase 0.1 (resume) and Phase 0.2 (find upstream requirements doc)
- **Resume/deepen interaction**: If Phase 0.1 identified an existing plan with `domain: non-software` in frontmatter, route to `references/universal-planning.md` for editing/deepening instead of short-circuiting to Phase 5.3. The `domain` frontmatter field is the authoritative signal, not re-classification of the user's input.
- Enumerate software signals and non-software signals as explicit lists (state-machine pattern from learnings). **Distinguish task-type from topic-domain**: the signal is "does the task involve building/modifying/architecting software" not "does the task mention software topics." A study guide about Rust is non-software; a Rust library refactor is software.
- When non-software detected in interactive mode: instruct to read `references/universal-planning.md` and follow that workflow, skipping all subsequent software phases
- When non-software detected in pipeline mode: output a stop message explaining LFG/SLFG don't support non-software, and stop. Use the same pipeline detection pattern as Phases 5.2/5.3: "If invoked from an automated workflow such as LFG, SLFG, or any disable-model-invocation context."
- When uncertain: default to software path, or ask the user if genuinely ambiguous
- Target: ~20-25 lines of SKILL.md content (slightly larger due to resume handling and task-vs-topic distinction)

**Patterns to follow:**
- Existing reference file loading pattern: "read `references/deepening-workflow.md` for..." (ce:plan SKILL.md line 681)
- State-machine detection pattern from `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`

**Test scenarios:**
- Happy path: "plan a 3 day Disney trip" → detects non-software, loads reference file
- Happy path: "plan the database migration for multi-tenancy" → detects software, continues normal flow
- Edge case: "plan a migration" with no other context → uncertain, asks user or defaults to software
- Edge case: "create a study guide for learning Rust" → non-software task despite mentioning a programming language. The task is producing educational content, not building/modifying software. Should route to non-software path.
- Edge case: "refactor the Rust authentication module" → software task. The task involves modifying code.
- Error path: Pipeline mode + non-software task → outputs stop message, does not write a plan file
- Integration: Software task after detection stub → Phases 0.2-5.4 proceed identically to before (no regression)

**Verification:**
- Software tasks pass through detection with zero behavioral change
- Non-software tasks route to `references/universal-planning.md`
- Pipeline mode + non-software produces a stop message
- Detection stub is ~15-20 lines (negligible token cost per R12)

---

- [ ] **Unit 3: Create `references/universal-planning.md`**

**Goal:** Write the non-software planning workflow that replaces the software-specific phases. Contains ambiguity assessment, focused Q&A, quality principles, file location prompt, and handoff.

**Requirements:** R5, R6, R7, R8

**Dependencies:** Unit 2 (detection stub references this file)

**Files:**
- Create: `plugins/compound-engineering/skills/ce-plan/references/universal-planning.md`

**Approach:**
- Self-contained workflow with 5 steps: (1) assess ambiguity, (2) focused Q&A if needed, (3) structure the plan using quality principles, (4) prompt for file location, (5) write file and present handoff options. Research capability (R9) is added in Phase 2 when implemented — no placeholder step in v1.
- Quality principles defined inline: actionable steps, dependency-sequenced, time-aware, resource-identified, contingency-aware, appropriately detailed, domain-appropriate format, research-aware (when the model lacks domain knowledge, offer to research before planning — prompt user first, don't auto-research)
- File location prompt: docs/plans/ (if exists), CWD, /tmp, or custom path. Use platform's question tool.
- Handoff options: open in editor, share to Proof, done. NO ce:work (software-only) or issue creation.
- Frontmatter for non-software plans: `title`, `status`, `date`, and `domain: non-software`. Omit `type`, `origin`, `deepened`. The `domain` field serves as a marker for resume/deepen flows and downstream consumers (LFG gate, ce:work) to recognize non-software plans.
- Filename convention: `YYYY-MM-DD-<descriptive-name>-plan.md` (no sequence number or type prefix)
- Target: ~80-100 lines
- Follow cross-platform interaction rules: use "the platform's question tool" with named examples

**Patterns to follow:**
- Existing reference files in ce:plan (`deepening-workflow.md`, `plan-handoff.md`) — header comment explaining when/why the file is loaded
- Cross-platform question tool references from Plugin AGENTS.md compliance checklist
- Backtick-path references for any future sub-references

**Test scenarios:**
- Happy path: Clear request ("plan a 3 day Disney trip with 2 kids ages 11 and 13") → skips Q&A, produces structured itinerary-style plan
- Happy path: Ambiguous request ("plan my team offsite") → asks 1-3 clarifying questions, then produces event-style plan
- Happy path: File location prompt shows docs/plans/ only when directory exists; falls back to CWD/tmp/custom when it doesn't
- Edge case: Very simple request ("plan dinner tonight") → minimal plan, appropriately brief
- Edge case: Complex request ("plan a 3-month study curriculum for the GRE") → detailed plan with phases, resources, milestones
- Integration: Handoff options do NOT include ce:work or issue creation

**Verification:**
- Non-software tasks produce domain-appropriate structured plans (not software plan template)
- Q&A fires only when needed, with ~3 questions max
- File is written to user-chosen location
- Handoff options are non-software appropriate

---

- [ ] **Unit 4: Update LFG/SLFG pipeline handling**

**Goal:** Add a one-line note to LFG and SLFG skills so they handle non-software detection gracefully instead of retrying indefinitely.

**Requirements:** Pipeline scope boundary

**Dependencies:** Unit 2 (detection stub produces the stop message)

**Files:**
- Modify: `plugins/compound-engineering/skills/lfg/SKILL.md` (after line 14, the ce:plan gate)
- Modify: `plugins/compound-engineering/skills/slfg/SKILL.md` (after line 13, the ce:plan step)

**Approach:**
- Rewrite the LFG gate as an explicit 3-branch state check (not an advisory note appended to the existing gate): "If ce:plan produced a plan file in `docs/plans/`, proceed. If ce:plan reported the task is non-software and stopped, stop the pipeline and inform the user that LFG requires software tasks. Otherwise, run `/ce:plan $ARGUMENTS` again."
- The non-software branch must appear before the retry branch so it takes precedence.
- Similar rewrite for SLFG step 2.
- Keep changes to 2-3 sentences each.

**Patterns to follow:**
- Existing gate language style in LFG/SLFG

**Test scenarios:**
- Happy path: Software task → LFG proceeds normally (no regression)
- Error path: Non-software task in LFG → ce:plan outputs stop message → LFG stops gracefully instead of retrying

**Test expectation: none** — LFG/SLFG are orchestration skills tested by manual invocation, not automated tests.

**Verification:**
- LFG does not retry when ce:plan reports non-software
- SLFG does not retry when ce:plan reports non-software

---

- [ ] **Unit 5: Validate and update documentation**

**Goal:** Verify ce:brainstorm doesn't need changes (R4), update README component descriptions if needed, run release validation.

**Requirements:** R4

**Dependencies:** Units 1-4

**Files:**
- Read (verify): `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md`
- Possibly modify: `plugins/compound-engineering/README.md` (if skill descriptions need updating)

**Approach:**
- Manually test ce:brainstorm with a non-software prompt to verify it doesn't refuse
- Check if README component tables need description updates for ce:plan
- Run `bun run release:validate` to ensure plugin consistency

**Test scenarios:**
- Happy path: ce:brainstorm accepts "plan my team offsite" without refusing
- Integration: `bun run release:validate` passes

**Verification:**
- ce:brainstorm confirmed domain-agnostic (no changes needed)
- release:validate passes
- README accurately reflects ce:plan's expanded capability

## System-Wide Impact

- **Interaction graph:** ce:plan detection stub fires on every invocation. Non-software detection routes to `references/universal-planning.md`. LFG/SLFG get a graceful stop for non-software. ce:brainstorm unchanged.
- **Error propagation:** Detection uncertainty → ask user → user answers → correct path. Detection false negative (non-software → software path) → existing refusal behavior (status quo, not worse). Detection false positive (software → non-software path) → disconnected plan (mitigated by defaulting to software).
- **State lifecycle risks:** None. Detection is stateless; it runs once at the start of each invocation.
- **API surface parity:** ce:plan's description change affects how all platforms (Claude Code, Codex, Gemini) route to the skill. The converter copies SKILL.md as-is for skills, so no converter changes needed.
- **Integration coverage:** Manual testing required — no automated skill behavioral tests in this repo.
- **Unchanged invariants:** The entire software planning workflow (Phases 0.2-5.4) is not touched. All existing plans, deepening flows, and pipeline behaviors for software tasks are unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Detection auto-classification is unreliable (per learnings) | R3 error policy: default to software, ask when uncertain. Monitor false positive rate after release. |
| Description broadening causes over-routing to ce:plan | Keep non-software triggers specific ("events, study plans") not generic ("any task"). Include negative signal ("for simple questions, ask directly"). |
| Non-software plan quality varies without a template | Quality principles provide guardrails. Manual testing with diverse prompts before release. Iterate on principles based on output quality. |
| LFG retry loop if stop message not handled | Unit 4 adds explicit handling. Test the pipeline path. |

## Documentation / Operational Notes

- Update `plugins/compound-engineering/README.md` skill description for ce:plan if the table entry mentions software-only planning
- No changelog entry needed (handled by release automation)
- No version bump (per Plugin AGENTS.md contributor rules)

## Sources & References

- **Origin document:** `docs/brainstorms/2026-04-05-universal-planning-requirements.md`
- Related code: `plugins/compound-engineering/skills/ce-plan/SKILL.md`, `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md`, `plugins/compound-engineering/skills/lfg/SKILL.md`, `plugins/compound-engineering/skills/slfg/SKILL.md`
- Related issue: [#517](https://github.com/EveryInc/compound-engineering-plugin/issues/517)
- Related learnings: `docs/solutions/skill-design/beta-skills-framework.md`, `docs/solutions/skill-design/compound-refresh-skill-improvements.md`, `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`
