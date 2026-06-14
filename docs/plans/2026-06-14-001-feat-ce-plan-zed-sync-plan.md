---
title: feat: Synchronize .agents/skills/ce-plan with plugins source
type: feat
status: active
date: 2026-06-14
---

## Summary

Bring `.agents/skills/ce-plan/` up to functional parity with `plugins/compound-engineering/skills/ce-plan/` through Zed-adapted synchronization: add all missing features (approach-altitude, universal-planning, scoping synthesis, plan quality bar, source document fidelity, external research framework, implementation unit detail, confidence check, final review), while stripping Claude Code platform specifics and HTML output support to stay within the 50KB Zed directory budget.

## Problem Frame

The Zed-installed ce-plan skill at `.agents/skills/ce-plan/` is a stale 326-line snapshot from an earlier version. The source at `plugins/compound-engineering/skills/ce-plan/` has grown to 793 lines with significant new capabilities. The installed version lacks `target: zed` frontmatter (required by AGENTS.md), approach-altitude routing, universal-planning for non-software tasks, scoping synthesis gates, plan quality bar, source document carry-forward rules, outstanding questions classification, external research decision framework, execution posture detection, detailed implementation unit definitions, final review before writing, confidence check and deepening detail, and anti-expansion rules. Zed users get a degraded planning experience compared to the canonical source.

## Requirements

R1. SKILL.md frontmatter includes `target: zed` field per AGENTS.md Zed platform constraint.

R2. SKILL.md includes all Zed-relevant workflow phases from the plugins source: 0.0 Resolve Output Mode (markdown-only), 0.1 Resume, 0.1a Approach-Altitude, 0.1b Classify Task Domain (with universal-planning routing), 0.2 Find Upstream Requirements, 0.3 Use Source Document as Primary Input, 0.4 Planning Bootstrap, 0.5 Classify Outstanding Questions, 0.6 Assess Plan Depth, 0.7 Solo-Mode Scoping Synthesis, Phase 1 Gather Context (1.1 Local Research, 1.1b Execution Posture, 1.2 Decide on External Research, 1.3 External Research, 1.4 Consolidate, 1.4b Reclassify Depth, 1.5 Flow Analysis), Phase 2 Resolve Planning Questions, Phase 3 Structure the Plan (3.1-3.7), Phase 4 Write the Plan, Phase 5 Final Review/Write/Handoff (5.1 Review, 5.1.5 Brainstorm-Sourced Scoping Synthesis, 5.2 Write Plan File, 5.3 Confidence Check and Deepening, 5.3.8-5.4 Post-Generation Options).

R3. SKILL.md excludes Claude Code platform-specific interaction patterns (AskUserQuestion, ToolSearch, Agent/Task dispatch syntax). All sub-agent dispatch uses Zed `spawn_agent` primitive. All user interaction uses Zed-native patterns (chat questions, numbered options).

R4. SKILL.md excludes HTML output mode references. Zed constraint is markdown-only. No `[output:html]` argument hint, no html-rendering.md references, no HTML composition timing notes.

R5. SKILL.md excludes Claude Code ecosystem features not available in Zed: Proof HITL review, Issue Creation, ce-doc-review integration. Post-generation menu has three Zed-native options only: Start ce-work, Open in browser, Done for now.

R6. SKILL.md post-generation routing is inline (not only in references). Per `docs/solutions/skill-design/post-menu-routing-belongs-inline.md`, the routing actions must execute from SKILL.md content, not require loading a separate reference to fire the routed action.

R7. All references files are self-contained within the `.agents/skills/ce-plan/references/` directory. No cross-directory or absolute path references per AGENTS.md skill file reference constraint.

R8. The complete skill directory (SKILL.md + references/) stays within 50KB budget per AGENTS.md Zed directory budget constraint.

R9. All shared references (deepening-workflow.md, markdown-rendering.md, plan-handoff.md, plan-sections.md, synthesis-summary.md) are synchronized from the plugins source with Zed adaptations: Claude Code platform specifics removed, HTML-rendering cross-references stripped, AskUserQuestion references replaced with Zed-native patterns.

R10. The `references/researchers.md` file is retained and updated with spawn_agent prompts that match the new Phase 1.1/1.2/1.3 dispatch structure from the plugins source.

R11. New references `approach-altitude.md` and `universal-planning.md` are copied from the plugins source with Zed adaptations (remove AskUserQuestion references, replace Agent/Task with spawn_agent).

R12. `references/html-rendering.md` is NOT included (Zed markdown-only constraint).

R13. All ce- prefixed agent/skill references use bare `ce-<name>` form per AGENTS.md skill agent reference convention.

R14. Description and argument-hint in frontmatter reflect the full Zed-adapted capability (including deepening, approach-altitude, and non-software planning routing), but omit the `[output:html]` token.

## Key Technical Decisions

KTD1. Zed adaptation strategy: rewrite-from-source rather than patch-the-old. The plugins source is 793 lines with deep structural changes (5 phases vs 4, new sub-phases throughout). Patching the 326-line old version would produce a fragile hybrid. Rewriting from the source with systematic Zed adaptations produces a coherent, maintainable artifact.

KTD2. Budget strategy: compress prose and strip platform specifics rather than drop functional features. The plugins source is 248KB total; the Zed budget is 50KB. The main size drivers are: html-rendering.md (29KB, to be dropped entirely), synthesis-summary.md (37KB, to be compressed ~50%), plan-sections.md (14.5KB, to be compressed ~40%), plan-handoff.md (17KB, to be compressed ~60%), deepening-workflow.md (17KB, to be compressed ~40%), SKILL.md (83KB, to be compressed ~60%). Dropping html-rendering.md alone saves 29KB. Prose compression (removing Claude Code-specific paragraphs, HTML-rendering cross-references, AskUserQuestion call patterns, and verbose examples that repeat the same principle) should bring the remaining ~219KB down to ~45KB.

KTD3. SKILL.md inline routing: post-generation menu routing actions (invoke ce-work, display path, end session) are written inline in SKILL.md Phase 5.4 rather than delegated entirely to `references/plan-handoff.md`. plan-handoff.md provides the detailed handoff logic but the routing skeleton must be executable from SKILL.md alone. This follows the institutional learning in `post-menu-routing-belongs-inline.md`.

KTD4. approach-altitude.md and universal-planning.md adaptation: these are domain-general features (not Claude Code-specific) that Zed users benefit from. Copy from plugins source and adapt: replace AskUserQuestion/ToolSearch references with numbered-options-in-chat, replace Agent/Task with spawn_agent, strip Proof/Issue Creation references.

KTD5. researchers.md retention: the existing researchers.md in .agents/ contains Zed-native spawn_agent prompts. It should be updated to match the new dispatch structure (repo-research, learnings-research, plus conditional external researchers per Phase 1.2/1.3 intent classification) rather than dropped.

## Implementation Units

### U1. Synchronize SKILL.md

**Goal:** Rewrite `.agents/skills/ce-plan/SKILL.md` from the plugins source with Zed adaptations, achieving functional parity while staying within budget.

**Requirements:** R1, R2, R3, R4, R5, R6, R14

**Dependencies:** none

**Files:**

- `.agents/skills/ce-plan/SKILL.md` (rewrite)

**Approach:**

1. Start from the plugins SKILL.md content (793 lines).
2. Add `target: zed` to frontmatter (R1). Update description to include deepening and approach-altitude but omit `[output:html]` (R14).
3. Strip Claude Code Interaction Method section (AskUserQuestion, ToolSearch, request_user_input, ask_user). Replace with Zed-native interaction: numbered options in chat, blocking questions where Zed supports them. (R3)
4. Phase 0.0: Simplify output mode to markdown-only gate. Remove CLI arg `output:` parsing, config resolution, pipeline override. Keep the Zed markdown-only constraint statement. (R4)
5. Phase 0.1: Keep resume logic but simplify format-specific routing (no .html path). Keep deepen-intent fast path.
6. Phase 0.1a: Keep approach-altitude concept. Adapt checkpoint to use numbered-options-in-chat instead of AskUserQuestion. Reference `references/approach-altitude.md`.
7. Phase 0.1b: Keep task domain classification with universal-planning routing. Reference `references/universal-planning.md`.
8. Phase 0.2: Keep upstream requirements search. Adapt blocking-question references to Zed.
9. Phase 0.3: Keep source document carry-forward rules (full fidelity). New content not in old version.
10. Phase 0.4: Keep planning bootstrap with ce-debug routing suggestion and ce-work routing suggestion. Adapt to Zed interaction. Add cross-repo handling logic.
11. Phase 0.5: Keep outstanding questions classification. New content.
12. Phase 0.6: Keep plan depth assessment. Moved from inline to dedicated sub-phase.
13. Phase 0.7: Keep solo-mode scoping synthesis. Reference `references/synthesis-summary.md`. New content.
14. Phase 1: Restructure from "Research" to "Gather Context". Keep 1.1, 1.1b, 1.2, 1.3, 1.4, 1.4b, 1.5 sub-phases. Adapt sub-agent dispatch from `Task ce-X(...)` to `spawn_agent` with researcher prompts from `references/researchers.md`. (R3, R10)
15. Phase 2: Keep resolve planning questions. Adapt interaction references.
16. Phase 3: Restructure to "Structure the Plan" with 3.1-3.7 sub-phases. Keep all new content (title/naming, stakeholder awareness, unit break, HTD, output structure, unit definition, planning-time/implementation-time separation, anti-expansion).
17. Phase 4: Keep "Write the Plan" with depth guidance, section contract, planning rules. Adapt rendering references (only markdown-rendering.md, no html-rendering.md).
18. Phase 5: New phase "Final Review, Write File, and Handoff". Keep 5.1 review checklist, 5.1.5 brainstorm-sourced scoping synthesis, 5.2 write plan file, 5.3 confidence check and deepening (auto + interactive modes, depth/risk classification, thin-grounding override, load-bearing external research override), 5.3.8-5.4 post-generation options. Adapt: remove ce-doc-review, remove Proof HITL, remove Issue Creation, remove HTML format gate. Menu: 3 options (Start ce-work, Open in browser, Done for now). Route ce-work via Skill invocation. (R5, R6)
19. Strip all remaining Claude Code specifics: `!` backtick pre-resolved config, `ToolSearch`, `AskUserQuestion`, `Agent`/`Task` syntax, `disable-model-invocation`, pipeline/LFG references. (R3)
20. Remove all html-rendering.md cross-references. (R4)
21. Compress verbose prose: remove examples that repeat the same principle, tighten multi-sentence explanations to single sentences where meaning is preserved, cut hedging language. Target ~35KB for SKILL.md. (KTD2)

**Test scenarios:**

- Happy path: SKILL.md loads in Zed, frontmatter parsed correctly with `target: zed`, all phases flow without referencing AskUserQuestion or HTML rendering
- Edge case: approach-altitude trigger correctly routes to `references/approach-altitude.md` without AskUserQuestion dependency
- Edge case: non-software task correctly routes to `references/universal-planning.md`
- Edge case: deepening intent correctly triggers Phase 5.3 confidence check flow
- Edge case: post-generation menu renders 3 options and routes ce-work via Skill invocation

**Verification:** SKILL.md loads in Zed without errors, contains all R1-R6 content, no AskUserQuestion/ToolSearch/html-rendering references, under ~35KB.

### U2. Synchronize shared references (5 files)

**Goal:** Update the 5 shared references files from the plugins source with Zed adaptations, preserving functional content while stripping Claude Code specifics.

**Requirements:** R7, R9, R8

**Dependencies:** U1 (SKILL.md references these files)

**Files:**

- `.agents/skills/ce-plan/references/deepening-workflow.md`
- `.agents/skills/ce-plan/references/markdown-rendering.md`
- `.agents/skills/ce-plan/references/plan-handoff.md`
- `.agents/skills/ce-plan/references/plan-sections.md`
- `.agents/skills/ce-plan/references/synthesis-summary.md`

**Approach:**
For each file, start from the plugins source version and adapt:

1. **deepening-workflow.md** (plugins: 252 lines/17KB → target ~10KB): Remove AskUserQuestion references, replace Agent/Task with spawn_agent, remove HTML format references, compress verbose prose.
2. **markdown-rendering.md** (plugins: 207 lines/8.4KB → target ~5KB): Remove html-rendering.md cross-references, remove format-choice prose (since Zed is always md), compress examples.
3. **plan-handoff.md** (plugins: 126 lines/17KB → target ~7KB): Remove ce-doc-review integration, remove Proof HITL flow, remove Issue Creation, remove HTML format gate, keep 3-option menu inline skeleton, compress. Key: keep routing logic but ensure SKILL.md has the executable skeleton (KTD3).
4. **plan-sections.md** (plugins: 286 lines/14.5KB → target ~9KB): Remove html-rendering.md cross-references in "Rendering" section, remove HTML metadata format notes, keep all content semantics (outcome, hard floor, include-when-material, prose economy, metadata fields, ID rules).
5. **synthesis-summary.md** (plugins: 396 lines/37KB → target ~15KB): Remove AskUserQuestion references, remove verbose worked examples that repeat the same principle, keep all structural rules (three-bucket, keep test, detail test, shape budgets, anti-patterns, auto-proceed, soft-cut, headless mode, self-redirect).

**Test scenarios:**

- Happy path: all 5 files load correctly, contain full content semantics, no AskUserQuestion/html-rendering references
- Edge case: plan-handoff.md contains routing skeleton that works without ce-doc-review
- Edge case: synthesis-summary.md contains all structural rules despite prose compression

**Verification:** All 5 files self-contained, no cross-directory references, content parity with plugins source on Zed-relevant semantics.

### U3. Add new references (2 files)

**Goal:** Copy and adapt the 2 missing references files from the plugins source.

**Requirements:** R7, R11, R12, R13

**Dependencies:** U1 (SKILL.md references these files)

**Files:**

- `.agents/skills/ce-plan/references/approach-altitude.md` (new)
- `.agents/skills/ce-plan/references/universal-planning.md` (new)

**Approach:**

1. **approach-altitude.md** (plugins: 55 lines/6.8KB): Copy from plugins source. Replace AskUserQuestion/ToolSearch references with numbered-options-in-chat. Replace `Skill` invocation references with Zed Skill invocation. Remove `Agent`/`Task` syntax. Keep all domain-general content (light recon, approach-plan composition, checkpoint, route). (KTD4)
2. **universal-planning.md** (plugins: 167 lines/14.9KB → target ~10KB): Copy from plugins source. Replace AskUserQuestion/ToolSearch with numbered-options-in-chat. Replace `Agent`/`Task` with spawn_agent. Remove Proof HITL reference. Remove pipeline/LFG/disable-model-invocation references. Compress verbose examples. Keep all content semantics (disposition, answer-seeking flow, plan-seeking flow, quality principles, format guidance, save/share). (KTD4)

**Test scenarios:**

- Happy path: approach-altitude.md referenced from SKILL.md Phase 0.1a, works without AskUserQuestion
- Happy path: universal-planning.md referenced from SKILL.md Phase 0.1b, handles non-software tasks correctly
- Edge case: answer-seeking flow runs without pipeline mode references

**Verification:** Both files self-contained, no cross-directory references, Zed-native interaction patterns, functional parity with plugins source.

### U4. Update researchers.md

**Goal:** Update researchers.md to match the new Phase 1.1/1.2/1.3 dispatch structure.

**Requirements:** R10, R13

**Dependencies:** U1 (SKILL.md references researchers.md for Phase 1.1)

**Files:**

- `.agents/skills/ce-plan/references/researchers.md`

**Approach:**

1. Update existing repo-research and learnings-research prompts to align with Phase 1.1 content (include STRATEGY.md, CONCEPTS.md, AGENTS.md guidance).
2. Add new researcher prompts for Phase 1.3 external research: implementation-guidance (ce-best-practices-researcher, ce-framework-docs-researcher equivalents) and landscape (ce-web-researcher equivalent).
3. All prompts use spawn_agent format (self-contained, return structured findings).
4. All agent references use bare `ce-<name>` form. (R13, KTD5)

**Test scenarios:**

- Happy path: researchers.md provides prompts for all Phase 1.1 and Phase 1.3 dispatch needs
- Edge case: external research prompts handle intent classification (implementation-guidance vs landscape)

**Verification:** researchers.md covers all dispatch needs referenced in SKILL.md Phase 1.1/1.3, all prompts are spawn_agent-compatible.

### U5. Size budget verification and final integrity check

**Goal:** Verify the complete skill directory stays within 50KB and passes Zed directory integrity checks.

**Requirements:** R8, R7

**Dependencies:** U1, U2, U3, U4

**Files:**

- `.agents/skills/ce-plan/` (directory-level verification)

**Approach:**

1. Measure total directory size with `du -sk .agents/skills/ce-plan/`. Target: ≤50KB.
2. If over budget, identify largest files and apply targeted compression (cut verbose examples, tighten prose, remove redundant restatements of the same principle).
3. Verify no cross-directory references (grep for `../` paths, absolute paths, references to files outside the skill directory).
4. Verify `target: zed` frontmatter present.
5. Verify SKILL.md contains all R1-R14 content.
6. Verify references/ contains exactly: approach-altitude.md, deepening-workflow.md, markdown-rendering.md, plan-handoff.md, plan-sections.md, synthesis-summary.md, researchers.md, universal-planning.md (8 files). No html-rendering.md.
7. Verify no html-rendering.md references anywhere in the directory.
8. Verify no AskUserQuestion/ToolSearch/Agent/Task references anywhere (all replaced with spawn_agent/Zed patterns).
9. Compare feature coverage against the plugins source checklist: approach-altitude (yes), universal-planning (yes), scoping synthesis (yes), plan quality bar (yes), source document fidelity (yes), outstanding questions (yes), external research framework (yes), execution posture (yes), implementation unit detail (yes), final review (yes), confidence check (yes), anti-expansion (yes).

**Test scenarios:**

- Happy path: total directory size ≤50KB, all integrity checks pass
- Edge case: if over budget, targeted compression brings it under without losing functional content
- Edge case: cross-directory reference detected → fix before declaring complete

**Verification:** du -sk shows ≤50KB, grep shows no violations, feature coverage checklist all yes.

## Scope Boundaries

### In scope

- Synchronizing `.agents/skills/ce-plan/` with Zed-adapted content from `plugins/compound-engineering/skills/ce-plan/`
- Prose compression to meet 50KB budget
- Stripping Claude Code platform specifics (AskUserQuestion, HTML output, Proof, Issue Creation, ce-doc-review)
- Adding missing references (approach-altitude.md, universal-planning.md)
- Updating shared references with Zed adaptations
- Updating researchers.md

### Out of scope (deferred for later)

- Creating `docs/specs/zed.md` (referenced by AGENTS.md but not yet created — separate task)
- Adding `convert --to zed` CLI support (v1 scope exclusion per AGENTS.md)
- Modifying `src/targets/index.ts` or existing converter/writer (v1 scope exclusion)
- Synchronizing other Zed skills (ce-brainstorm, ce-code-review, ce-work) — each is a separate sync task
- Running `bun test` or `bun run release:validate` (these validate CLI/marketplace, not Zed skill content)

### Outside this product's identity

- Changing the dual-tree synchronization strategy (manual copy from plugins/ to .agents/skills/)
- Adding automated Zed skill sync in CI
- Redesigning ce-plan's planning workflow

## Risks and Dependencies

R1. **50KB budget tightness** — the plugins source is 248KB. Even after dropping html-rendering.md (29KB) and aggressive prose compression, achieving ≤50KB requires ~78% compression on the remaining content. The risk is that over-compression loses functional nuance. Mitigation: prioritize keeping structural rules and decision logic (the "what to do" content) over verbose examples and hedging prose (the "why it matters" reinforcement). Accept some loss of illustrative examples as a budget trade-off.

R2. **Prose compression quality** — compressing 219KB to ~45KB (~78% reduction) while preserving all functional semantics is hard. The risk is accidentally dropping a key rule or constraint. Mitigation: maintain a feature coverage checklist (U5) and verify against the plugins source after compression.

R3. **SKILL.md post-generation routing** — the `post-menu-routing-belongs-inline.md` learning flags this as a known bug pattern. The risk is writing the menu in SKILL.md but routing actions in plan-handoff.md only, causing the agent to render the menu and stop. Mitigation: write routing skeleton inline in SKILL.md (KTD3), with plan-handoff.md providing detail but not being required for execution.

R4. **spawn_agent prompt design** — the plugins source uses named sub-agents (ce-repo-research-analyst, ce-learnings-researcher, etc.) via `Task` syntax. Zed uses `spawn_agent` which takes a free-form prompt. The risk is that the researcher prompts in researchers.md don't match the Phase 1 dispatch structure. Mitigation: U4 explicitly updates researchers.md to align with the new structure.

## Documentation / Operational Notes

- After synchronization, verify by manually loading the skill in Zed and triggering ce-plan on a sample task
- The dual-tree strategy means future changes to `plugins/compound-engineering/skills/ce-plan/` will need another manual sync — document this in the plan's commit message
- Track the 50KB budget as an ongoing concern — any future additions to ce-plan will need budget-aware editing
- The other Zed skills (ce-brainstorm, ce-code-review, ce-work) should be assessed for similar staleness in follow-up work

---

Plan written to /Users/laobaibai/Documents/compound-engineering-plugin/docs/plans/2026-06-14-001-feat-ce-plan-zed-sync-plan.md
