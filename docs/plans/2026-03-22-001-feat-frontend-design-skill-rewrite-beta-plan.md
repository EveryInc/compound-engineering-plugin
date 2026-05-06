---
title: "feat: Rewrite frontend-design skill with layered architecture and visual verification"
type: feat
status: completed
date: 2026-03-22
origin: docs/brainstorms/2026-03-22-frontend-design-skill-improvement.md
---

# feat: Rewrite frontend-design skill with layered architecture and visual verification

## Overview

Rewrite the `frontend-design` skill from a 43-line aesthetic manifesto into a structured, layered skill that detects existing design systems, provides context-specific guidance, and verifies its own output via browser screenshots. Add a surgical trigger in `ce-work-beta` to load the skill for UI tasks without Figma designs.

## Problem Frame

The current skill provides vague creative encouragement ("be bold", "choose a BOLD aesthetic direction") but lacks practical structure. It has no mechanism to detect existing design systems, no context-specific guidance (landing pages vs dashboards vs components in existing apps), no concrete constraints, no accessibility guidance, and no verification step. The beta workflow (`ce:plan-beta` -> `deepen-plan-beta` -> `ce:work-beta`) has no way to invoke it -- the skill is effectively orphaned.

Two external sources informed the redesign: Anthropic's official frontend-design skill (nearly identical to ours, same gaps) and OpenAI's comprehensive frontend skill from March 2026 (see origin: `docs/brainstorms/2026-03-22-frontend-design-skill-improvement.md`).

## Requirements Trace

- R1. Detect existing design systems before applying opinionated guidance (Layer 0)
- R2. Enforce authority hierarchy: existing design system > user instructions > skill defaults
- R3. Provide pre-build planning step (visual thesis, content plan, interaction plan)
- R4. Cover typography, color, composition, motion, accessibility, and imagery with concrete constraints
- R5. Provide context-specific modules: landing pages, apps/dashboards, components/features
- R6. Module C (components/features) is the default when working in an existing app
- R7. Two-tier anti-pattern system: overridable defaults vs quality floor
- R8. Visual self-verification via browser screenshot with tool cascade
- R9. Cross-agent compatibility (Claude Code, Codex, Gemini CLI)
- R10. ce-work-beta loads the skill for UI tasks without Figma designs
- R11. Verification screenshot reuse -- skill's screenshot satisfies ce-work-beta Phase 4's requirement

## Scope Boundaries

- The `frontend-design` skill itself handles all design guidance and verification. ce-work-beta gets only a trigger.
- ce-work (non-beta) is not modified.
- The design-iterator agent is not modified. The skill does not invoke it.
- The agent-browser skill is upstream-vendored and not modified.
- The design-iterator's `<frontend_aesthetics>` block (which duplicates current skill content) is not cleaned up in this plan -- that is a separate follow-up.

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/frontend-design/SKILL.md` -- target for full rewrite (43 lines currently)
- `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` -- target for surgical Phase 2 addition (lines 210-219, between Figma Design Sync and Track Progress)
- `plugins/compound-engineering/skills/ce-plan-beta/SKILL.md` -- reference for cross-agent interaction patterns (Pattern A: platform's blocking question tool with named equivalents)
- `plugins/compound-engineering/skills/reproduce-bug/SKILL.md` -- reference for cross-agent patterns
- `plugins/compound-engineering/skills/agent-browser/SKILL.md` -- upstream-vendored, reference for browser automation CLI
- `plugins/compound-engineering/agents/design/ce-design-iterator.agent.md` -- contains `<frontend_aesthetics>` block that overlaps with current skill; new skill will supersede this when both are loaded
- `plugins/compound-engineering/AGENTS.md` -- skill compliance checklist (cross-platform interaction, tool selection, reference rules)

### Institutional Learnings

- **Cross-platform tool references** (`docs/solutions/skill-design/compound-refresh-skill-improvements.md`): Never hardcode a single tool name with an escape hatch. Use capability-first language with platform examples and plain-text fallback. Anti-pattern table directly applicable.
- **Beta skills framework** (`docs/solutions/skill-design/beta-skills-framework.md`): frontend-design is NOT a beta skill -- it is a stable skill being improved. ce-work-beta should reference it by its stable name.
- **Codex skill conversion** (`docs/solutions/codex-skill-prompt-entrypoints.md`): Skills are copied as-is to Codex. Slash references inside SKILL.md are NOT rewritten. Use semantic wording ("load the `agent-browser` skill") rather than slash syntax.
- **Context token budget** (`docs/plans/2026-02-08-refactor-reduce-plugin-context-token-usage-plan.md`): Description field's only job is discovery. The proposed 6-line description is well-sized for the budget.
- **Script-first architecture** (`docs/solutions/skill-design/script-first-skill-architecture.md`): When a skill's core value IS the model's judgment, script-first does not apply. Frontend-design is judgment-based. Detection checklist should be inline, not in reference files.

## Key Technical Decisions

- **No `disable-model-invocation`**: The skill should auto-invoke when the model detects frontend work. Current skill does not have it; the rewrite preserves this.
- **Drop `license` frontmatter field**: Only the current frontend-design skill has this field. No other skill uses it. Drop it for consistency.
- **Inline everything in SKILL.md**: No reference files or scripts directory. The skill is pure guidance (~300-400 lines of markdown). The detection checklist, context modules, anti-patterns, litmus checks, and verification cascade all live in one file.
- **Fix ce-work-beta duplicate numbering**: The current Phase 2 has two items numbered "6." (Figma Design Sync and Track Progress). Fix this while inserting the new section.
- **Framework-conditional animation defaults**: CSS animations as universal baseline. Framer Motion for React, Vue Transition / Motion One for Vue, Svelte transitions for Svelte. Only when no existing animation library is detected.
- **Semantic skill references only**: Reference agent-browser as "load the `agent-browser` skill" not `/agent-browser`. Per AGENTS.md and Codex conversion learnings.

## Open Questions

### Resolved During Planning

- **Should the skill have `disable-model-invocation: true`?** No. It should auto-invoke for frontend work. The current skill does not have it.
- **Should Module A/B ever apply in an existing app?** No. When working inside an existing app, always default to Module C regardless of what's being built. Modules A and B are for greenfield work.
- **Should the `license` field be kept?** No. It is unique to this skill and inconsistent with all other skills.

### Deferred to Implementation

- **Exact line count of the rewritten skill**: Estimated 300-400 lines. The implementer should prioritize clarity over brevity but avoid bloat.
- **Whether the design-iterator's `<frontend_aesthetics>` block needs updating**: Out of scope. The new skill supersedes it when loaded. Cleanup is a separate follow-up.

## Implementation Units

- [x] **Unit 1: Rewrite frontend-design SKILL.md**

  **Goal:** Replace the 43-line aesthetic manifesto with the full layered skill covering detection, planning, guidance, context modules, anti-patterns, litmus checks, and visual verification.

  **Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9

  **Dependencies:** None

  **Files:**
  - Modify: `plugins/compound-engineering/skills/frontend-design/SKILL.md`

  **Approach:**
  - Full rewrite preserving only the `name` field from current frontmatter
  - Use the optimized description from the brainstorm doc (see origin: Section "Skill Description (Optimized)")
  - Structure as: Frontmatter -> Preamble (authority hierarchy, workflow preview) -> Layer 0 (context detection with concrete checklist, mode classification, cross-platform question pattern) -> Layer 1 (pre-build planning) -> Layer 2 (design guidance core with subsections for typography, color, composition, motion, accessibility, imagery) -> Context Modules (A/B/C) -> Hard Rules & Anti-Patterns (two tiers) -> Litmus Checks -> Visual Verification (tool cascade with scope control)
  - Carry forward from current skill: anti-AI-slop identity, creative energy for greenfield, tone-picking exercise, differentiation prompt
  - Apply AGENTS.md skill compliance checklist: imperative voice, capability-first tool references with platform examples, semantic skill references, no shell recipes for exploration, cross-platform question patterns with fallback
  - All rules framed as defaults that yield to existing design systems and user instructions
  - Copy guidance uses "Every sentence should earn its place. Default to less copy, not more." (not arbitrary percentage thresholds)
  - Animation defaults are framework-conditional: CSS baseline, then Framer Motion (React), Vue Transition/Motion One (Vue), Svelte transitions (Svelte)
  - Visual verification cascade: existing project tooling -> browser MCP tools -> agent-browser CLI (load the `agent-browser` skill for setup) -> mental review as last resort
  - One verification pass with scope control ("sanity check, not pixel-perfect review")
  - Note relationship to design-iterator: "For iterative refinement beyond a single pass, see the `design-iterator` agent"

  **Patterns to follow:**
  - `plugins/compound-engineering/skills/ce-plan-beta/SKILL.md` -- cross-agent interaction pattern (Pattern A)
  - `plugins/compound-engineering/skills/reproduce-bug/SKILL.md` -- cross-agent tool reference pattern
  - `plugins/compound-engineering/AGENTS.md` -- skill compliance checklist
  - `docs/solutions/skill-design/compound-refresh-skill-improvements.md` -- anti-pattern table for tool references

  **Test scenarios:**
  - Skill passes all items in the AGENTS.md skill compliance checklist
  - Description field is present and follows "what + when" format
  - No hardcoded Claude-specific tool names without platform equivalents
  - No slash references to other skills (uses semantic wording)
  - No `TodoWrite`/`TodoRead` references
  - No shell commands for routine file exploration
  - Cross-platform question pattern includes AskUserQuestion, request_user_input, ask_user, and a fallback
  - All design rules explicitly framed as defaults (not absolutes)
  - Layer 0 detection checklist is concrete (specific file patterns and config names)
  - Mode classification has clear thresholds (4+ signals = existing, 1-3 = partial, 0 = greenfield)
  - Visual verification section references agent-browser semantically ("load the `agent-browser` skill")

  **Verification:**
  - `grep -E 'description:' plugins/compound-engineering/skills/frontend-design/SKILL.md` returns the optimized description
  - `grep -E '^\`(references|assets|scripts)/[^\`]+\`' plugins/compound-engineering/skills/frontend-design/SKILL.md` returns nothing (no unlinked references)
  - Manual review confirms the layered structure matches the brainstorm doc's "Skill Structure" outline
  - `bun run release:validate` passes

- [x] **Unit 2: Add frontend-design trigger to ce-work-beta Phase 2**

  **Goal:** Insert a conditional section in ce-work-beta Phase 2 that loads the `frontend-design` skill for UI tasks without Figma designs, and fix the duplicate item numbering.

  **Requirements:** R10, R11

  **Dependencies:** Unit 1 (the skill must exist in its new form for the reference to be meaningful)

  **Files:**
  - Modify: `plugins/compound-engineering/skills/ce-work-beta/SKILL.md`

  **Approach:**
  - Insert new section after Figma Design Sync (line 217) and before Track Progress (line 219)
  - New section titled "Frontend Design Guidance" (if applicable), following the same conditional pattern as Figma Design Sync
  - Content: UI task detection heuristic (implementation files include views/templates/components/layouts/pages, creates user-visible routes, plan text contains UI/frontend/design language, or task builds something user-visible in browser) + instruction to load the `frontend-design` skill + note that the skill's verification screenshot satisfies Phase 4's screenshot requirement
  - Fix duplicate "6." numbering: Figma Design Sync = 6, Frontend Design Guidance = 7, Track Progress = 8
  - Keep the addition to ~10 lines including the heuristic and the verification-reuse note
  - Use semantic skill reference: "load the `frontend-design` skill" (not slash syntax)

  **Patterns to follow:**
  - The existing Figma Design Sync section (lines 210-217) -- same conditional "(if applicable)" pattern, same level of brevity

  **Test scenarios:**
  - New section follows same formatting as Figma Design Sync section
  - No duplicate item numbers in Phase 2
  - Semantic skill reference used (no slash syntax for frontend-design)
  - Verification screenshot reuse is explicit
  - `bun run release:validate` passes

  **Verification:**
  - Phase 2 items are numbered sequentially without duplicates
  - The new section references `frontend-design` skill semantically
  - The verification-reuse note is present
  - `bun run release:validate` passes

## System-Wide Impact

- **Interaction graph:** The frontend-design skill is auto-invocable (no `disable-model-invocation`). When loaded, it may interact with: agent-browser CLI (for verification screenshots), browser MCP tools, or existing project browser tooling. ce-work-beta Phase 2 will conditionally trigger the skill load. The design-iterator agent's `<frontend_aesthetics>` block will be superseded when both the skill and agent are active in the same context.
- **Error propagation:** If browser tooling is unavailable for verification, the skill falls back to mental review. No hard failure path.
- **State lifecycle risks:** None. This is markdown document work -- no runtime state, no data, no migrations.
- **API surface parity:** The skill description change affects how Claude discovers and triggers the skill. The new description is broader (covers existing app modifications) which may increase trigger rate.
- **Integration coverage:** The primary integration is ce-work-beta -> frontend-design skill -> agent-browser. This flow should be manually tested end-to-end with a UI task in the beta workflow.

## Risks & Dependencies

- **Trigger rate change:** The broader description may cause the skill to trigger for borderline cases (e.g., a task that touches one CSS class). Mitigated by the Layer 0 detection step which will quickly identify "existing system" mode and short-circuit most opinionated guidance.
- **Skill length:** Estimated 300-400 lines is substantial for a skill body. Mitigated by the layered architecture -- an agent in "existing system" mode can skip Layer 2's opinionated sections entirely.
- **design-iterator overlap:** The design-iterator's `<frontend_aesthetics>` block now partially duplicates the skill's Layer 2 content. Not a functional problem (the skill supersedes when loaded) but creates maintenance overhead. Flagged for follow-up cleanup.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-22-frontend-design-skill-improvement.md](docs/brainstorms/2026-03-22-frontend-design-skill-improvement.md)
- Related code: `plugins/compound-engineering/skills/frontend-design/SKILL.md`, `plugins/compound-engineering/skills/ce-work-beta/SKILL.md`
- External inspiration: Anthropic official frontend-design skill, OpenAI "Designing Delightful Frontends with GPT-5.4" skill (March 2026)
- Institutional learnings: `docs/solutions/skill-design/compound-refresh-skill-improvements.md`, `docs/solutions/skill-design/beta-skills-framework.md`, `docs/solutions/codex-skill-prompt-entrypoints.md`
