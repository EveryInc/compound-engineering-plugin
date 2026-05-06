---
title: "feat(ce-work): reduce token usage by extracting late-sequence references"
type: feat
status: completed
date: 2026-04-09
---

# feat(ce-work): reduce token usage by extracting late-sequence references

## Overview

Apply the "conditional and late-sequence extraction" pattern (established in PR #489 for ce:plan) to ce:work and ce:work-beta. Both skills carry Phase 3/4 shipping content through the entire Phase 2 execution loop without using it. Extracting this late-sequence content into on-demand reference files eliminates that compounding context cost.

## Problem Frame

ce:work sessions are the longest-running skill in the plugin — a typical execution session involves 20-60+ tool calls across Phase 0-4. Phase 3 (quality check) and Phase 4 (ship it) content, plus the duplicative Quality Checklist and Code Review Tiers summary sections, ride in context for the entire Phase 2 execution loop without being used until the very end. This compounds token costs proportional to message count.

ce:work-beta already extracted its Codex delegation workflow into `references/codex-delegation-workflow.md` (315 lines), but its Phase 3/4 content has the same late-sequence problem as stable. Both variants benefit from the same extraction.

## Requirements Trace

- R1. Extract late-sequence blocks (Phase 3 + Phase 4 + Quality Checklist + Code Review Tiers) into an on-demand reference file for ce:work
- R2. Extract the same late-sequence blocks for ce:work-beta
- R3. Replace extracted blocks with 1-3 line stubs per the AGENTS.md "Conditional and Late-Sequence Extraction" rule
- R4. Update contract tests to read from reference files where assertions moved

## Scope Boundaries

- Not changing any behavioral content — purely restructuring for token efficiency
- Not extracting Phase 0, Phase 1, or Phase 2 content (needed during the core execution loop)
- Not extracting Key Principles or Common Pitfalls (small, general-purpose guidance used throughout)
- Not extracting ce:work-beta's Argument Parsing or Codex Delegation Mode sections (already handled or needed early)
- Beta is on a separate evolutionary track from stable — extraction follows the same pattern but the files are independent, not shared

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-plan/SKILL.md` — established extraction pattern with stub syntax
- `plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md` — example of late-sequence extraction
- `plugins/compound-engineering/skills/ce-brainstorm/references/handoff.md` — another late-sequence extraction (ce:brainstorm already did this)
- `plugins/compound-engineering/skills/ce-work-beta/references/codex-delegation-workflow.md` — beta already uses extraction for its conditional delegation workflow
- `tests/pipeline-review-contract.test.ts` — existing contract tests for ce:work (lines 9-98) and ce:work-beta (lines 100-219)
- `plugins/compound-engineering/AGENTS.md` — "Conditional and Late-Sequence Extraction" rule

### Institutional Learnings

- PR #489 validated that extracting ~36% of ce:plan saved ~130,000-167,000 context tokens per session with zero premature reference file reads
- ce:brainstorm has already applied the same pattern (Phase 3/4 extracted to `references/requirements-capture.md` and `references/handoff.md`)

## Key Technical Decisions

- **Bundle Phase 3 + Phase 4 + Quality Checklist + Code Review Tiers into one reference file**: These are all used at the same point in the workflow (after all Phase 2 tasks complete). The Quality Checklist is "Before creating PR" and Code Review Tiers duplicates Phase 3 Step 2 — they're the same workflow stage. One file is simpler than four. This matches the bundling strategy ce:brainstorm used for its late-sequence content.
- **Keep Key Principles, Common Pitfalls in SKILL.md**: They're small (~40 lines combined) and provide behavioral guardrails throughout execution. Extracting them saves little and risks execution quality.
- **Independent reference files for stable and beta**: Per AGENTS.md skill self-containment rules, each skill's references directory is its own unit. Beta already has a `references/` directory with `codex-delegation-workflow.md`; the shipping workflow file goes alongside it. Stable creates its `references/` directory fresh.

## Implementation Units

- [x] **Unit 1: Create `references/shipping-workflow.md` for ce:work**

**Goal:** Extract Phase 3 (Quality Check), Phase 4 (Ship It), Quality Checklist, and Code Review Tiers into a single reference file for the stable skill.

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md`
- Modify: `plugins/compound-engineering/skills/ce-work/SKILL.md`

**Approach:**
- Move Phase 3 (lines 271-315), Phase 4 (lines 317-374), Quality Checklist (lines 408-423), and Code Review Tiers (lines 425-435) into the new reference file
- Add a header comment: "This file contains the shipping workflow (Phase 3-4). Load it only when all Phase 2 tasks are complete and execution transitions to quality check."
- Replace Phase 3 + Phase 4 in SKILL.md with a 2-line stub stating the condition and backtick path reference
- Remove the standalone Quality Checklist and Code Review Tiers sections at the bottom of SKILL.md (they're consolidated into the reference file)

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md` — late-sequence extraction with header comment and stub pattern
- `plugins/compound-engineering/skills/ce-brainstorm/references/handoff.md` — same pattern for brainstorm's shipping phase

**Test scenarios:**
- Happy path: SKILL.md stub contains backtick path to `references/shipping-workflow.md` and states the loading condition
- Happy path: reference file contains Phase 3 (quality checks, code review, final validation, operational validation plan) and Phase 4 (screenshots, commit/PR, plan status update, notify user) and the quality checklist and code review tiers
- Edge case: SKILL.md does not contain `gh pr create` — the existing contract test at line 35 continues to pass since this string was never in ce:work SKILL.md

**Verification:**
- SKILL.md line count decreases by ~130 lines (445 -> ~315)
- Reference file contains all Phase 3, Phase 4, Quality Checklist, and Code Review Tiers content
- SKILL.md stub clearly states when to load the reference

---

- [x] **Unit 2: Create `references/shipping-workflow.md` for ce:work-beta**

**Goal:** Extract the same late-sequence shipping content from ce:work-beta into its already-existing references directory, alongside the existing `codex-delegation-workflow.md`.

**Requirements:** R2, R3

**Dependencies:** None (can run in parallel with Unit 1)

**Files:**
- Create: `plugins/compound-engineering/skills/ce-work-beta/references/shipping-workflow.md`
- Modify: `plugins/compound-engineering/skills/ce-work-beta/SKILL.md`

**Approach:**
- Move Phase 3 (lines 336-381), Phase 4 (lines 382-438), Quality Checklist (lines 481-496), and Code Review Tiers (lines 498-508) into the new reference file
- Same header comment pattern as Unit 1
- Replace with the same 2-line stub pattern
- Remove standalone Quality Checklist and Code Review Tiers sections
- Beta has an additional Phase 2 subsection ("Frontend Design Guidance" at lines 322-328) that stays in SKILL.md since it's used during execution
- The Codex Delegation Mode stub (lines 442-444) stays untouched — it's a separate extraction

**Sync decision:** Propagating extraction to beta — this is a structural optimization that applies equally to both variants. The shipping workflow content is identical between stable and beta.

**Patterns to follow:**
- Unit 1 output for stable variant
- Beta's existing `codex-delegation-workflow.md` extraction as precedent

**Test scenarios:**
- Happy path: beta SKILL.md stub contains backtick path to `references/shipping-workflow.md`
- Happy path: beta reference file contains the same Phase 3/4 content as stable's reference
- Edge case: existing `codex-delegation-workflow.md` reference is untouched

**Verification:**
- Beta SKILL.md line count decreases by ~130 lines (518 -> ~388)
- Beta `references/` directory now contains both `codex-delegation-workflow.md` and `shipping-workflow.md`

---

- [x] **Unit 3: Update contract tests**

**Goal:** Update existing contract tests to read assertions from reference files where content moved, and add stub pointer tests.

**Requirements:** R4

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `tests/pipeline-review-contract.test.ts`

**Approach:**

Tests that need restructuring (some assertions move to reference file, negative assertions may stay on SKILL.md):
- "requires code review before shipping" (line 10) — positive assertions (`"2. **Code Review**"`, tier names, `ce:review`, `mode:autofix`, quality checklist review line) read from `references/shipping-workflow.md`; negative assertions (`not.toContain("Consider Code Review")`, `not.toContain("Code Review** (Optional)")`) stay reading SKILL.md to confirm extraction completeness
- "delegates commit and PR to dedicated skills" (line 28) — positive assertions (`git-commit-push-pr`, `git-commit`) read from `references/shipping-workflow.md`; negative assertions (`not.toContain("gh pr create")`) stay reading SKILL.md
- "ce:work-beta mirrors review and commit delegation" (line 39) — same dual-read pattern from beta's reference and beta's SKILL.md
- "quality checklist says Testing addressed" (line 66) — positive assertion (`"Testing addressed"`) reads from `references/shipping-workflow.md`; negative assertions (`not.toContain("Tests pass...")`) stay reading SKILL.md
- "ce:work-beta mirrors testing deliberation and checklist changes" (line 77) — testing deliberation stays reading beta SKILL.md; checklist assertions read from beta reference

Tests that stay unchanged (content not extracted):
- "includes per-task testing deliberation in execution loop" (line 52) — Phase 2 content, stays in SKILL.md
- "ce:work remains the stable non-delegating surface" (line 91) — checks SKILL.md absence of delegation content
- All ce:work-beta delegation contract tests (lines 100-219) — check SKILL.md stubs and delegation reference

New tests to add:
- Stub pointer test: SKILL.md contains backtick path `references/shipping-workflow.md` (for both stable and beta)
- Negative test: SKILL.md does not contain `"2. **Code Review**"` directly (confirms extraction, not duplication)

**Patterns to follow:**
- Lines 283-289 in `tests/pipeline-review-contract.test.ts` — PR #489's stub pointer test pattern (`"SKILL.md stub points to plan-handoff reference"`)

**Test scenarios:**
- Happy path: all existing ce:work and ce:work-beta contract tests pass after updating file paths
- Happy path: new stub pointer tests verify both SKILL.md files reference `shipping-workflow.md`
- Edge case: tests checking Phase 2 content (testing deliberation, delegation routing) still read from SKILL.md unchanged

**Verification:**
- `bun test tests/pipeline-review-contract.test.ts` passes
- No contract test reads from SKILL.md for content that moved to a reference file

## System-Wide Impact

- **Interaction graph:** No behavioral change — content is restructured, not modified. The agent reads the same instructions, just from a reference file instead of inline.
- **Error propagation:** If reference file read fails at runtime, the agent would lack shipping instructions. Low risk since file reads are reliable and the files are co-located in the skill directory.
- **API surface parity:** Both stable and beta get the same extraction. Beta's existing Codex delegation reference is untouched.
- **Integration coverage:** Contract tests in `tests/pipeline-review-contract.test.ts` are the primary integration surface.
- **Unchanged invariants:** Phase 0-2 execution behavior, subagent dispatch, test discovery, and all other execution-time content remains inline and unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Contract tests break if file paths change | Unit 3 explicitly updates all affected tests |
| Agent fails to load reference file at the right time | Stub wording follows the validated pattern from PR #489 and ce:brainstorm |
| Beta-specific content accidentally dropped | Unit 2 only extracts Phase 3/4 content identical to stable; delegation stubs/references are untouched |

## Token Savings Estimate

| Skill | Extraction | Lines | Est. tokens | Loaded when |
|---|---|---|---|---|
| ce:work | `references/shipping-workflow.md` | ~130 | ~2,200 | All Phase 2 tasks complete |
| ce:work-beta | `references/shipping-workflow.md` | ~130 | ~2,200 | All Phase 2 tasks complete |

**ce:work reduction:** 445 lines (~6,500 tokens) -> ~315 lines (~4,600 tokens) — **~29% reduction**

**ce:work-beta reduction:** 518 lines (~7,600 tokens) -> ~388 lines (~5,700 tokens) — **~25% reduction**

**Per-session savings (each skill):** For a typical 40-message execution session:
- Shipping workflow: ~2,200 tokens x ~32 messages before it's needed = **~70,400 context tokens per session**

## Sources & References

- Related PRs: #489 (ce:plan extraction — established the pattern)
- Related code: `plugins/compound-engineering/AGENTS.md` (extraction rule)
- Precedent: ce:brainstorm already applied this pattern to its Phase 3/4 content
