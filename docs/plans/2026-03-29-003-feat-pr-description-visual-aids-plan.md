---
title: "feat(git-commit-push-pr): Add conditional visual aids to PR descriptions"
type: feat
status: completed
date: 2026-03-29
---

# feat(git-commit-push-pr): Add conditional visual aids to PR descriptions

## Overview

Add visual communication guidance to git-commit-push-pr's Step 6 so PR descriptions can include mermaid diagrams, ASCII art, or comparison tables when the change is complex enough to warrant them. Follows the same content-pattern-based conditional approach already used in ce:brainstorm (#437) and ce:plan (#440), adapted for the PR description surface where reviewers scan quickly rather than study deeply.

## Problem Frame

Complex PRs with architectural changes, user flow modifications, or multi-component interactions currently get text-only descriptions. Even when the PR was built from a plan that contains visual aids, those visuals don't carry through to the PR description. Reviewers must reconstruct the mental model from prose alone.

PR #442 demonstrates this: a cross-target change with a 6-row decision matrix (which it did include as a markdown table) and multi-component interaction patterns. But for PRs involving workflow changes, data flow modifications, or component architecture shifts, the description has no guidance to include flow diagrams or interaction diagrams that would dramatically improve reviewer comprehension.

The gap: ce:brainstorm and ce:plan both now produce visual aids when content warrants it, but the downstream PR description -- the artifact reviewers actually see first -- has no equivalent guidance.

## Requirements Trace

- R1. The skill includes guidance for when visual aids genuinely improve a PR description
- R2. Visual aids are conditional on content patterns (what the PR changes), not on PR size alone -- a small PR that changes a complex workflow may warrant a diagram; a large mechanical refactor may not
- R3. The trigger bar is higher than ce:brainstorm or ce:plan -- PR descriptions are scanned by reviewers, not studied deeply
- R4. Three visual aid types: mermaid flow/interaction diagrams, ASCII annotated flows, and markdown tables (tables already partially covered by the existing "Markdown tables for data" writing principle)
- R5. Within generated PR descriptions, visual aids are placed inline at the point of relevance, not in a separate section
- R6. The existing Step 6 structure, sizing table, writing principles, and state machine flow of the skill remain intact

## Scope Boundaries

- Not adding visual aids to every PR -- the guidance is conditional with explicit skip criteria
- Not changing the sizing table or other Step 6 subsections
- Not touching Steps 1-5 or Steps 7-8 (the state machine structure must be preserved per institutional learnings)
- Not adding plan/brainstorm document extraction -- this is about the PR diff, not upstream artifacts

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/git-commit-push-pr/SKILL.md` -- the skill to modify; Step 6 spans lines 187-333 with subsections: Detect base branch, Gather branch scope, Sizing the change, Writing principles, Numbering and references, Compound Engineering badge
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` (lines 223-249) -- visual communication pattern: "When to include / When to skip" table, format selection, prose-is-authoritative rule
- `plugins/compound-engineering/skills/ce-plan/SKILL.md` (lines 581-612) -- plan-readability visual aids following the same structural pattern, with disambiguation from Section 3.4
- Existing "Markdown tables for data" writing principle (line 280) -- already covers one visual medium (tables for before/after and trade-off data); the new guidance extends to mermaid and ASCII

### Institutional Learnings

- The git-commit-push-pr skill is structured as a state machine with explicit transition checks. Changes must be strictly additive to the PR body composition phase -- do not alter or reorder git state checks (see `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`)
- GitHub renders mermaid code blocks natively in PR descriptions (supported since 2022)
- No existing learnings about mermaid gotchas or diagram generation failures in docs/solutions/
- Prose-is-authoritative is an established invariant across brainstorm and document-review skills

## Key Technical Decisions

- **Insertion point: new `#### Visual communication` subsection after Writing principles (after line 290), before Numbering and references (line 292)**: This extends the writing guidance rather than the sizing logic. The sizing table determines description *depth*; visual aids are about *medium*. Placing here preserves the flow: size the description -> write it following principles -> add visual aids when warranted -> handle numbering -> add badge.

- **Higher trigger bar than sibling skills**: PR descriptions are a scanning surface, not a studying surface. ce:brainstorm triggers on "multi-step user workflow" and ce:plan triggers on "4+ units with non-linear dependencies." PR triggers should reflect what makes a *reviewer's job harder without a visual* -- architectural changes touching 3+ interacting components, workflow/pipeline changes with non-obvious flow, state or mode changes. The "When to skip" list should explicitly reinforce that small/simple changes (already handled by the sizing table) never get diagrams.

- **Extend beyond the existing "Markdown tables for data" principle**: The existing bullet at line 280 covers tables for performance data and trade-offs. The new Visual communication subsection incorporates table format guidance within its own format selection list (consistent with sibling skills' self-contained pattern) and extends coverage to mermaid flow diagrams and ASCII interaction diagrams. The existing bullet stays as-is.

- **Self-contained format selection, consistent with sibling skills**: Skills can't reference each other's guidance. Restate the format framework (mermaid default with TB direction, ASCII for annotated flows, markdown tables for comparisons) with PR-appropriate calibration. Keep diagrams smaller than plan/brainstorm -- 5-10 nodes typical for a PR description, up to 15 only for genuinely complex changes.

## Open Questions

### Resolved During Planning

- **Should the description update workflow (DU-3) also get visual aid guidance?** Yes. DU-3 says "write a new description following the writing principles in Step 6." Since visual communication guidance is part of Step 6's writing guidance, DU-3 inherits it automatically through the existing reference. No separate addition needed.
- **Should we extract plan/brainstorm visuals into PR descriptions?** No. The PR description should be derived from the branch diff, not from upstream artifacts. If the diff shows a workflow change, the PR description should diagram the workflow based on what the diff reveals.

### Deferred to Implementation

- Mermaid node count thresholds start at 5-10 typical, up to 15 for genuinely complex changes (per Key Technical Decisions). These are starting values -- monitor initial output and adjust if diagrams are too sparse or too dense

## Implementation Units

- [x] **Unit 1: Add visual communication subsection to Step 6**

**Goal:** Add a `#### Visual communication` subsection to Step 6 with conditional inclusion guidance following the established "When to include / When to skip" pattern.

**Requirements:** R1, R2, R3, R4, R5, R6

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/git-commit-push-pr/SKILL.md`

**Approach:**
- Insert the new subsection after the Writing principles section (after line 290) and before Numbering and references (line 292)
- Use the same structural template as ce:brainstorm and ce:plan: opening conditional principle, "When to include" table, "When to skip" list, format selection guidance, prose-is-authoritative rule, verification instruction
- Adapt triggers for PR-specific content patterns: architectural changes with 3+ components, workflow/pipeline changes, state/mode introduction, data model changes with entity relationships
- Calibrate to PR scanning context: higher bar for inclusion, smaller diagrams (5-10 nodes typical), explicit skip for small/simple changes
- Reference the existing "Markdown tables for data" writing principle for table guidance rather than duplicating it

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` lines 223-249 (visual communication section structure)
- `plugins/compound-engineering/skills/ce-plan/SKILL.md` lines 581-612 (plan-readability visual aids)

**Test scenarios:**
- Happy path: The new subsection is syntactically valid markdown with correct heading level (`####`) matching sibling subsections in Step 6
- Happy path: The "When to include" table has PR-appropriate triggers (not copy-pasted from brainstorm/plan)
- Happy path: The "When to skip" list explicitly covers small/simple changes to reinforce the sizing table
- Edge case: The existing "Markdown tables for data" writing principle at line 280 remains unchanged
- Integration: DU-3 inherits the new guidance through its existing "following the writing principles in Step 6" reference without any changes to the DU-3 section

**Verification:**
- The SKILL.md file has a new `#### Visual communication` subsection between Writing principles and Numbering and references
- The subsection follows the same structural pattern as ce:brainstorm lines 223-249 (conditional principle, When to include table, When to skip list, format selection, verification)
- The triggers are calibrated for PR descriptions (higher bar than plan/brainstorm)
- No changes outside of Step 6's description writing guidance area
- `bun test` passes (if any frontmatter or structure tests exist for this skill)

## System-Wide Impact

- **Interaction graph:** The description update workflow (DU-3) references Step 6's writing principles and inherits the new guidance automatically. No other skills reference git-commit-push-pr's internal guidance.
- **Unchanged invariants:** Steps 1-5 (git state machine), Step 7 (PR creation/update), Step 8 (reporting) are not touched. The sizing table, numbering/references, and badge sections within Step 6 are not modified.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Visual aids trigger too often, bloating simple PR descriptions | Higher trigger bar than sibling skills + explicit skip for small/simple changes + "Brevity matters" principle already in Step 6 |
| Mermaid diagrams don't render in all PR viewing contexts (email, Slack previews) | Mermaid source is readable as text fallback; TB direction keeps source narrow |
| Diagram accuracy -- no code to validate against | Verification instruction (same as sibling skills) to check diagram matches the diff |

## Sources & References

- Related PRs: #437 (brainstorm visual aids), #440 (plan visual aids)
- Related plans: `docs/plans/2026-03-29-001-feat-brainstorm-visual-aids-plan.md`, `docs/plans/2026-03-29-002-feat-plan-visual-aids-plan.md`
- Institutional learning: `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`
- GitHub mermaid support: confirmed natively in PR descriptions since 2022
