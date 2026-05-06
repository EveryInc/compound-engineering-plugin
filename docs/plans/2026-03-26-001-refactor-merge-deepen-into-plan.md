---
title: "refactor: Merge deepen-plan into ce:plan as automatic confidence check"
type: refactor
status: completed
date: 2026-03-26
origin: docs/brainstorms/2026-03-26-merge-deepen-into-plan-requirements.md
---

# Merge deepen-plan into ce:plan as automatic confidence check

## Overview

Absorb the deepen-plan skill's confidence-gap evaluation and targeted research agent dispatching into ce:plan as an automatic post-write phase. Remove deepen-plan as a standalone skill. The user no longer decides whether to deepen — the agent evaluates and reports what it's strengthening.

## Problem Frame

The ce:plan and deepen-plan skills form a sequential workflow where the user is offered a choice ("want to deepen?") that they can't evaluate better than the agent can. When deepen-plan runs, it already self-gates (skips Lightweight, scores confidence gaps before acting). The user decision adds friction without adding value. (see origin: docs/brainstorms/2026-03-26-merge-deepen-into-plan-requirements.md)

## Requirements Trace

- R1. ce:plan automatically evaluates and deepens its own output after the initial plan is written, without asking the user for approval
- R2. When deepening runs, ce:plan reports what sections it's strengthening and why (transparency without requiring a decision)
- R3. Deepening is skipped for Lightweight plans unless high-risk topics are detected
- R4. For Standard and Deep plans, ce:plan scores confidence gaps using checklist-first, risk-weighted scoring; if no gaps exceed threshold, reports "confidence check passed" and moves on
- R5. When gaps are found, ce:plan dispatches targeted research agents to strengthen only the weak sections
- R6. deepen-plan is removed as standalone command; re-deepening is handled through ce:plan resume mode with the same confidence-gap evaluation (doesn't force deepening unless user explicitly requests it)
- R7. The "Run deepen-plan" post-generation option is removed; post-generation options become simpler

## Scope Boundaries

- This does not change what deepening does — only where it lives and who decides to run it
- Deepen-plan's separate-file `-deepened` option is dropped — ce:plan always writes in-place, and automatic deepening has no reason to create a separate file
- The confidence scoring checklist, agent mapping table, and synthesis rules are transplanted from deepen-plan, not rewritten
- No changes to ce:brainstorm or ce:work
- The planning boundary (no code, no commands) is preserved
- Historical docs referencing deepen-plan are not updated — they are historical records

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-plan/SKILL.md` — 6 phases (0-5). Phase 5 has sub-phases: 5.1 (Review), 5.2 (Write), 5.3 (Post-gen options). The new confidence check inserts between 5.2 and 5.3
- `plugins/compound-engineering/skills/deepen-plan/SKILL.md` — 409 lines, 7 phases (0-6). Phases 0-5 contain the logic to absorb; Phase 6 and Post-Enhancement Options are replaced by ce:plan's own post-gen flow
- `plugins/compound-engineering/skills/lfg/SKILL.md` — Step 3 conditionally invokes deepen-plan. Must be removed
- `plugins/compound-engineering/skills/slfg/SKILL.md` — Step 3 conditionally invokes deepen-plan. Must be removed
- Skills are auto-discovered from filesystem (no registry in plugin.json). Deleting the directory removes the skill
- The `deepened: YYYY-MM-DD` frontmatter field in plan templates signals that a plan was substantively strengthened

### Institutional Learnings

- `docs/solutions/skill-design/beta-skills-framework.md` — The workflow chain is `ce:brainstorm` -> `ce:plan` -> `deepen-plan` -> `ce:work`, orchestrated by lfg and slfg. When removing a skill, all callers must be updated atomically in one PR
- `docs/solutions/skill-design/beta-promotion-orchestration-contract.md` — Treat the merge as an orchestration contract change. Update every workflow that invokes deepen-plan in the same PR to avoid a broken intermediate state
- `docs/solutions/plugin-versioning-requirements.md` — Do not manually bump versions. Update README counts and tables. Run `bun run release:validate`

## Key Technical Decisions

- **New Phase 5.3 (Confidence Check and Deepening):** Insert between current 5.2 (Write Plan File) and current 5.3 (Post-Generation Options, renumbered to 5.4). This is the minimal structural change — only one sub-phase renumbers. Rationale: deepening operates on the written plan, so it must follow 5.2, and the user should see post-gen options only after deepening completes or is skipped
- **Resume mode fast path for re-deepening:** When ce:plan detects an existing complete plan and the user's request is specifically about deepening, it short-circuits to Phase 5.3 directly (skipping Phases 1-4). Rationale: re-running the full planning workflow to re-deepen would be 3-5x more expensive than the old standalone deepen-plan. The fast path preserves efficiency
- **Pipeline mode behavior:** Deepening runs in pipeline/disable-model-invocation mode using the same gate logic (Standard/Deep AND high-risk or confidence gaps). Rationale: lfg/slfg step 3 already had equivalent conditional logic; this preserves the same behavior internally
- **Remove ultrathink auto-deepen clause:** Line 625 of ce:plan currently auto-runs deepen-plan on ultrathink. This becomes redundant since every plan run now auto-evaluates deepening. Removing it prevents double-deepening
- **Scratch space:** Artifact-backed research uses `.context/compound-engineering/ce-plan/deepen/` with per-run subdirectory. Rationale: follows AGENTS.md namespace convention for ce-plan

## Open Questions

### Resolved During Planning

- **Where does the confidence check phase land?** As Phase 5.3, between Write (5.2) and Post-gen Options (renumbered 5.4). Minimal structural change
- **How does resume mode distinguish incomplete plan from re-deepen request?** Fast path: if the plan appears complete (all sections present, units defined, status: active) and the user's request is specifically about deepening, skip to Phase 5.3. Otherwise resume normal editing
- **Does deepening run in pipeline mode?** Yes, with the same gate logic. Pipeline mode already skips interactive questions; deepening doesn't ask questions, only reports
- **What replaces deepen-plan in post-gen options?** Nothing — the list shrinks by one. If auto-evaluation passed, the plan is adequately grounded. Users who disagree can re-invoke ce:plan with explicit deepening instructions
- **What about failed or empty agent results during deepening?** Preserve deepen-plan's Phase 4.2 fallback: "if an artifact is missing or clearly malformed, re-run that agent or fall back to direct-mode reasoning"

### Deferred to Implementation

- Exact wording of the transparency status message (R2) — best determined when writing the actual Phase 5.3 content
- Whether the deepen-plan Introduction section's distinction between `document-review` and `deepen-plan` should be preserved somewhere in ce:plan — likely as a brief note in Phase 5.3

## Implementation Units

- [ ] **Unit 1: Modify ce:plan SKILL.md — add Phase 5.3, update Phase 0.1, update post-gen options, update template**

  **Goal:** Absorb deepen-plan's confidence-gap evaluation and targeted research into ce:plan as the new Phase 5.3. Update Phase 0.1 for re-deepen fast path. Renumber current Phase 5.3 to 5.4 and simplify it. Update plan template frontmatter comment.

  **Requirements:** R1, R2, R3, R4, R5, R6, R7

  **Dependencies:** None

  **Files:**
  - Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`

  **Approach:**

  *Phase 5.3 (Confidence Check and Deepening):*
  - Insert new sub-phase between current 5.2 and 5.3
  - Transplant from deepen-plan (not rewrite):
    - Phase 0.2-0.3 gating logic (Lightweight skip, risk profile assessment) → becomes the gate at the top of 5.3
    - Phase 1 plan structure parsing → becomes a step within 5.3 (lighter version since ce:plan already knows its own structure)
    - Phase 2 confidence scoring (the full checklist from deepen-plan lines 119-200) → transplanted wholesale
    - Phase 3 deterministic section-to-agent mapping (lines 208-248) → transplanted wholesale
    - Phase 3.2 agent prompt shape → transplanted
    - Phase 3.3 execution mode decision (direct vs artifact-backed) → transplanted
    - Phase 4 research execution (direct and artifact-backed modes) → transplanted
    - Phase 5 synthesis and rewrite rules → transplanted
    - Phase 6 final checks → merged into ce:plan's existing Phase 5.1 review logic
  - Add transparency reporting (R2): before dispatching agents, report what sections are being strengthened and why. Example: "Strengthening [Key Technical Decisions, System-Wide Impact] — decision rationale is thin and cross-boundary effects aren't mapped"
  - Add "confidence check passed" path (R4): when no gaps exceed threshold, report and proceed to 5.4
  - Add pipeline mode note: deepening runs in pipeline mode using the same gate logic, no user interaction needed
  - Update scratch space path to `.context/compound-engineering/ce-plan/deepen/`
  - Transplant scratch cleanup logic from deepen-plan Phase 6 (lines 383-385): after the plan is safely written, clean up the temporary scratch directory. This is especially important since auto-deepening means users may never be aware artifacts were created

  *Phase 0.1 (Resume mode fast path):*
  - Add: when ce:plan detects an existing complete plan and the user's request is specifically about deepening or strengthening, short-circuit to Phase 5.3 directly
  - "Complete plan" detection: all major sections present, implementation units defined, `status: active`
  - Deepen-request detection: user's input contains signal words like "deepen", "strengthen", "confidence", "gaps", or explicitly says to re-deepen the plan. Normal editing requests (e.g., "update the test scenarios") should NOT trigger the fast path
  - Preserve existing resume behavior for incomplete plans
  - If plan already has `deepened: YYYY-MM-DD` and no explicit user request to re-deepen, apply the same confidence-gap evaluation (R6 — doesn't force deepening)

  *Phase 5.4 (Post-Generation Options, was 5.3):*
  - Remove option 2 ("Run `/deepen-plan`") and its handler
  - Remove the ultrathink auto-deepen clause (line 625)
  - Renumber remaining options (1-6 instead of 1-7)

  *Plan template frontmatter:*
  - Change comment on `deepened:` line from "set later by deepen-plan" to "set when confidence check substantively strengthens the plan"

  **Patterns to follow:**
  - deepen-plan SKILL.md is the source of truth for all transplanted content
  - ce:plan's existing sub-phase structure (numbered sub-phases within Phase 5)
  - ce:plan's existing pipeline mode handling (line 589)

  **Test scenarios:**
  - Fresh Lightweight plan → Phase 5.3 gates and skips deepening, reports "confidence check passed"
  - Fresh Standard plan with thin decisions → Phase 5.3 identifies gaps, reports what it's strengthening, dispatches agents, updates plan
  - Fresh Standard plan with strong confidence → Phase 5.3 evaluates and reports "confidence check passed"
  - Pipeline mode (lfg/slfg) → deepening runs automatically with same gate logic, no interactive questions
  - Resume mode with explicit deepen request → fast-paths to Phase 5.3
  - Resume mode without deepen request → normal plan editing flow

  **Verification:**
  - Phase 5.3 contains the complete confidence scoring checklist from deepen-plan
  - Phase 5.3 contains the complete section-to-agent mapping from deepen-plan
  - Phase 0.1 has the re-deepen fast path
  - No references to `/deepen-plan` remain in ce:plan SKILL.md
  - The ultrathink clause is gone
  - Plan template frontmatter comment is updated

---

- [ ] **Unit 2: Delete deepen-plan skill directory**

  **Goal:** Remove the deepen-plan skill from the plugin

  **Requirements:** R6

  **Dependencies:** Unit 1 (ce:plan must absorb the logic before it's deleted)

  **Files:**
  - Delete: `plugins/compound-engineering/skills/deepen-plan/SKILL.md` (entire `deepen-plan/` directory)

  **Approach:**
  - Delete the directory `plugins/compound-engineering/skills/deepen-plan/`
  - Skills are auto-discovered from filesystem, so no registry update needed

  **Verification:**
  - `plugins/compound-engineering/skills/deepen-plan/` no longer exists
  - No `deepen-plan` skill appears when listing skills

---

- [ ] **Unit 3: Update lfg and slfg orchestrators**

  **Goal:** Remove deepen-plan step from both orchestration skills since ce:plan now handles it internally

  **Requirements:** R1, R6

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `plugins/compound-engineering/skills/lfg/SKILL.md`
  - Modify: `plugins/compound-engineering/skills/slfg/SKILL.md`

  **Approach:**

  *lfg:*
  - Remove step 3 (lines 16-20: conditional deepen-plan invocation and its GATE)
  - Renumber steps 4-9 to 3-8
  - Update the opening instruction to remove reference to step 3 plan verification
  - Keep step 2 (`/ce:plan`) and its GATE unchanged — ce:plan now handles deepening internally

  *slfg:*
  - Remove step 3 (lines 14-17: conditional deepen-plan invocation)
  - Renumber step 4 to 3 (`/ce:work`)
  - Renumber steps 5-10 to 4-9
  - Keep step 2 (`/ce:plan`) unchanged

  **Patterns to follow:**
  - lfg's existing step structure with GATE markers
  - slfg's existing phase structure (Sequential, Parallel, Autofix, Finalize)

  **Verification:**
  - No references to `deepen-plan` or `deepen` in lfg or slfg
  - Step numbers are sequential with no gaps
  - lfg flow is: optional ralph-loop → ce:plan (with GATE) → ce:work (with GATE) → ce:review mode:autofix → todo-resolve → test-browser → feature-video → DONE. Preserve the existing GATE after ce:work
  - slfg flow is: optional ralph-loop → ce:plan → ce:work (swarm) → parallel ce:review mode:report-only + test-browser → ce:review mode:autofix → todo-resolve → feature-video → DONE

---

- [ ] **Unit 4: Update peripheral references**

  **Goal:** Remove stale deepen-plan references from README, AGENTS.md, learnings-researcher, and document-review

  **Requirements:** R6, R7

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `plugins/compound-engineering/README.md`
  - Modify: `plugins/compound-engineering/AGENTS.md`
  - Modify: `plugins/compound-engineering/agents/research/ce-learnings-researcher.agent.md`
  - Modify: `plugins/compound-engineering/skills/document-review/SKILL.md`

  **Approach:**

  *README.md:*
  - Remove `/deepen-plan` row from the Core Workflow table
  - Update the `/ce:plan` description to mention that it includes automatic confidence checking
  - Verify skill count in the Components table still says "40+" (removing 1 skill, adding 0)

  *AGENTS.md:*
  - Line 116: Replace `/deepen-plan` example with another valid skill (e.g., `/ce:compound` or `/changelog`)

  *learnings-researcher.md:*
  - Remove the `/deepen-plan` integration point line. The deepening behavior is now inside ce:plan, which already invokes learnings-researcher in Phase 1.1. The Phase 5.3 agent mapping also includes learnings-researcher for "Context & Research" gaps, so the integration is preserved

  *document-review SKILL.md:*
  - Line 196: Update the "do not modify" caller list — remove both `deepen-plan-beta` and `ce-plan-beta` (both are stale beta names). Update to the current accurate callers: `ce-brainstorm`, `ce-plan`

  **Verification:**
  - No references to `deepen-plan` or `/deepen-plan` in any of these files
  - README Core Workflow table has one fewer row
  - `bun run release:validate` passes

---

- [ ] **Unit 5: Update converter and writer tests**

  **Goal:** Replace deepen-plan references in test data with another skill name so tests still validate slash-command remapping behavior

  **Requirements:** R6

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `tests/codex-writer.test.ts`
  - Modify: `tests/codex-converter.test.ts`
  - Modify: `tests/droid-converter.test.ts`
  - Modify: `tests/copilot-converter.test.ts`
  - Modify: `tests/pi-converter.test.ts`
  - Modify: `tests/review-skill-contract.test.ts`

  **Approach:**
  - In each test file, replace `deepen-plan` in test input data and expected output with another existing skill name that has the same structural properties (a non-`ce:` prefixed skill with a hyphenated name). Good candidates: `reproduce-bug`, `git-commit`, or `todo-resolve`
  - `review-skill-contract.test.ts` line 157: update the test description from "deepen-plan reviewer" to match whichever skill name replaces it (or update to reflect what the test actually validates — it tests `data-migration-expert` agent content)
  - No converter source code changes needed — repo research confirmed no hardcoded deepen-plan references in `src/`

  **Patterns to follow:**
  - Existing test data structure in each file
  - Use a consistent replacement skill name across all test files for clarity

  **Test scenarios:**
  - All existing test assertions pass with the replacement skill name
  - Slash-command remapping behavior is still validated for each target (Codex, Droid, Copilot, Pi)

  **Verification:**
  - `bun test` passes
  - No references to `deepen-plan` in any test file

---

- [ ] **Unit 6: Validate plugin consistency**

  **Goal:** Ensure the skill removal doesn't break plugin metadata or marketplace consistency

  **Requirements:** R6

  **Dependencies:** Units 1-5

  **Files:**
  - Read (validation only): `plugins/compound-engineering/.claude-plugin/plugin.json`
  - Read (validation only): `.claude-plugin/marketplace.json`

  **Approach:**
  - Run `bun run release:validate` to check consistency
  - Run `bun test` to confirm all tests pass
  - Verify no remaining references to `deepen-plan` in active skill files (historical docs excluded)

  **Verification:**
  - `bun run release:validate` passes
  - `bun test` passes
  - `grep -r "deepen-plan" plugins/compound-engineering/skills/` returns no results
  - `grep -r "deepen-plan" plugins/compound-engineering/agents/` returns no results
  - `grep -r "deepen-plan" plugins/compound-engineering/README.md` returns no results
  - Note: CHANGELOG.md and historical docs in `docs/plans/`, `docs/brainstorms/`, `docs/solutions/` will still contain deepen-plan references — these are historical records and should not be updated

## System-Wide Impact

- **Interaction graph:** ce:plan's Phase 5.3 dispatches the same research and review agents that deepen-plan used. The agent contracts are unchanged — only the caller changes. lfg and slfg lose a step but gain nothing new since ce:plan handles deepening internally
- **Error propagation:** If agent dispatch fails during Phase 5.3, the fallback from deepen-plan Phase 4.2 is preserved: re-run the agent or fall back to direct-mode reasoning. The plan is still written to disk even if deepening partially fails
- **State lifecycle risks:** The `deepened:` frontmatter field continues to be set only when substantive changes are made. Plans that were deepened by the old standalone deepen-plan retain their `deepened:` date — no migration needed
- **API surface parity:** The converter tests use deepen-plan as sample data for slash-command remapping. After updating to a different skill name, all target converters (Codex, Droid, Copilot, Pi) continue to validate the same remapping behavior
- **Integration coverage:** The atomic update of all callers (lfg, slfg, ce:plan, README, AGENTS.md, learnings-researcher, document-review) in one PR prevents a broken intermediate state (per learnings from beta-promotion-orchestration-contract.md)

## Risks & Dependencies

- **Risk: Phase 5.3 content size.** Absorbing ~300 lines of deepen-plan logic into ce:plan makes it significantly longer (~950+ lines). Mitigation: the content is self-contained in one sub-phase and can be extracted to a reference file if token pressure becomes an issue
- **Risk: Converter test fragility.** Changing test input data could reveal implicit assumptions in converter logic. Mitigation: repo research confirmed no hardcoded deepen-plan references in `src/`. The tests use it as generic sample data
- **Risk: Orphaned scratch directories.** Existing `.context/compound-engineering/deepen-plan/` directories from prior runs will not be cleaned up. Mitigation: these are ephemeral scratch files with no functional impact; not worth special handling

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-26-merge-deepen-into-plan-requirements.md](docs/brainstorms/2026-03-26-merge-deepen-into-plan-requirements.md)
- Deepen-plan source: `plugins/compound-engineering/skills/deepen-plan/SKILL.md`
- Ce:plan source: `plugins/compound-engineering/skills/ce-plan/SKILL.md`
- Learnings: `docs/solutions/skill-design/beta-skills-framework.md`, `docs/solutions/skill-design/beta-promotion-orchestration-contract.md`, `docs/solutions/plugin-versioning-requirements.md`
