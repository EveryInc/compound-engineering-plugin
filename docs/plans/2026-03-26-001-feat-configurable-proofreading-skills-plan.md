---
title: "feat: Replace every-style-editor with configurable proofread and create-style-guide skills"
type: feat
status: active
date: 2026-03-26
---

# Replace every-style-editor with configurable proofread and create-style-guide skills

## Overview

Replace the hardcoded `every-style-editor` skill with two new skills: a configurable `proofread` skill that works with any style guide, and a `create-style-guide` skill that helps users build custom style guides through a guided interview process. Every's editorial style guide becomes a bundled default rather than the only option.

## Problem Frame

The current `every-style-editor` skill is tightly coupled to a single style guide and produces a rigid QA report format. Users need:
- Support for different style guides (editorial vs technical, custom team guides)
- Flexible output modes (direct edits, Proof comments for collaborative review, or summary)
- A way to create style guides for their own voice or team
- Configuration that persists across sessions via the established `.local.md` pattern

Updated style guides (including a technical variant) are expected from a colleague; the architecture should accommodate multiple bundled guides without redesign.

## Requirements Trace

- R1. Configurable style guide selection via `.claude/compound-engineering.local.md` YAML frontmatter
- R2. Fallback chain: project config -> project docs (AGENTS.md/CLAUDE.md) -> bundled Every editorial guide
- R3. Document type classification to calibrate review focus
- R4. Three output modes: direct edit, Proof comments (via Proof skill), summary only
- R5. Guided interview process to create custom style guides (5-phase: gather examples, interview, react, synthesize, save)
- R6. Created style guides integrate with proofread skill config
- R7. Preserve author voice during editing — polish, not rewrite
- R8. All callers of `every-style-editor` updated atomically with removal

## Scope Boundaries

- Do not hand-bump plugin versions or write changelog entries (release automation handles this)
- Do not bundle a technical style guide yet — only the existing editorial guide ships as default
- Do not build a script-first architecture — the core value is model judgment, not mechanical processing
- Do not add a beta period — `every-style-editor` has no complex orchestration callers; direct replacement is safe

## Context & Research

### Relevant Code and Patterns

- **Config pattern**: `.claude/compound-engineering.local.md` with YAML frontmatter is the established convention. Skills read it at runtime with fallback to defaults.
- **Cross-skill references**: Use semantic wording ("load the `proof` skill") not slash syntax, per AGENTS.md compliance checklist
- **Reference files**: Backtick paths for on-demand loading (the style guide is 530 lines — too large for `@` inline)
- **Interview pattern**: `ce-brainstorm` is the best model for interview-based skills — one question at a time via platform question tool
- **Proof integration**: `POST /share/markdown` to create doc, `POST /api/agent/{slug}/ops` for comments/suggestions with `by: "ai:proofread"`

### Institutional Learnings

- **Config fields must be load-bearing** (`docs/solutions/workflow/todo-status-lifecycle.md`): The `style_guide` config must actually branch behavior — don't add advisory-only fields
- **No contradictory rules across phases** (`docs/solutions/skill-design/compound-refresh-skill-improvements.md`): Trace each instruction through all phases to ensure consistency
- **Beta promotion requires atomic caller updates** (`docs/solutions/skill-design/beta-promotion-orchestration-contract.md`): All references to the old skill must update in the same change
- **Cross-platform tool refs**: Name all three platform question tools + fallback in every user interaction point

### Callers of every-style-editor (Must Update)

| File | Reference type |
|------|---------------|
| `skills/ce-compound/SKILL.md` | Lists as documentation reviewer (lines 336, 411) |
| `agents/research/best-practices-researcher.md` | Lists under Documentation category (line 46) |
| `README.md` | Skill catalog table (line 77) |
| `CHANGELOG.md` | Historical references only — no update needed |

## Key Technical Decisions

- **Two separate skills** (not modes of one skill): Proofreading and style guide creation are distinct workflows with different triggers, different interactions, and different outputs. Separate skills are cleaner for triggering and cognitive load.
- **Every guide renamed to `every-editorial.md`**: Signals it's one variant among potentially many (future: `every-technical.md`). The sentinel config value `every-editorial` maps to this bundled file.
- **Direct replacement, no beta**: `every-style-editor` has only 2 callers (ce-compound, best-practices-researcher) and no orchestration contract complexity. A beta period would add friction without mitigating real risk.
- **Proof integration via skill loading**: The `proofread` skill loads the `proof` skill at runtime rather than duplicating API knowledge. This keeps the Proof API as a single source of truth.
- **Style guide template as reference file**: The `create-style-guide` skill bundles a `references/style-guide-template.md` that structures the interview output. This keeps the SKILL.md lean.

## Open Questions

### Resolved During Planning

- **Should create-style-guide output Every-format guides or a generic format?** Generic format — the template includes all recommended sections from Every's AI style guide article but isn't tied to Every's specific rules. Any guide conforming to the template works with `proofread`.
- **Where does the created style guide get saved?** User's choice — the skill asks (repo path, `.claude/` dir, or custom location) and optionally configures the `proofread` skill to point to it.

### Deferred to Implementation

- **Exact interview questions for create-style-guide**: The skill defines question categories but the exact phrasing should emerge from testing and iteration via the skill-creator eval loop.
- **Multiple style guide variants per document type**: Future work when the colleague provides additional guides. The current `style_guide` config key is a single path; multi-guide routing can be added later without breaking the config schema.

## Implementation Units

- [ ] **Unit 1: Create proofread skill with bundled Every guide**

  **Goal:** Ship the core proofread skill with config-driven style guide loading, document classification, three output modes, and Every's editorial guide as the default.

  **Requirements:** R1, R2, R3, R4, R7

  **Dependencies:** None

  **Files:**
  - Create: `skills/proofread/SKILL.md`
  - Create: `skills/proofread/references/every-editorial.md` (copy from `skills/every-style-editor/references/EVERY_WRITE_STYLE.md`)

  **Approach:**
  - Copy and rename the existing Every style guide to `every-editorial.md` (content unchanged)
  - Refine the SKILL.md draft already started in this session — ensure compliance with the full skill checklist (quoted description, imperative voice, cross-platform tool refs, backtick path for reference file)
  - Config resolution: `.local.md` frontmatter -> AGENTS.md/CLAUDE.md search -> bundled default
  - Document classification table calibrates review strictness per type
  - Three output modes: direct edit (default for repo files), Proof comments (loads `proof` skill), summary only (default for pasted content)
  - "Preserve the author's voice" as a first-class instruction, not an afterthought

  **Patterns to follow:**
  - `skills/proof/SKILL.md` — cross-skill loading pattern
  - `skills/ce-brainstorm/SKILL.md` — user interaction via platform question tool
  - `skills/ce-compound/SKILL.md` — on-demand reference loading with backtick paths

  **Test scenarios:**
  - Config with custom `style_guide` path loads that file instead of default
  - Missing config falls back to bundled Every editorial guide
  - Document classification correctly identifies editorial vs technical content
  - Direct edit mode makes inline changes without adding AI-sounding language
  - Proof mode creates a document and adds suggestions/comments
  - Summary mode lists findings without modifying the file
  - Preserves author voice — doesn't flatten personality or add hedges

  **Verification:**
  - `bun test tests/frontmatter.test.ts` passes with the new SKILL.md
  - Skill loads correctly and the reference file resolves via backtick path

---

- [ ] **Unit 2: Create create-style-guide skill with template**

  **Goal:** Ship a guided interview skill that helps users build custom style guides compatible with the proofread skill.

  **Requirements:** R5, R6

  **Dependencies:** Unit 1 (the proofread config pattern must be defined first)

  **Files:**
  - Create: `skills/create-style-guide/SKILL.md`
  - Create: `skills/create-style-guide/references/style-guide-template.md`

  **Approach:**
  - Five-phase interview process: gather examples -> interview (targeted questions, not blank-page self-description) -> react to specifics (generate sample paragraphs for feedback) -> synthesize into structured guide -> save and configure
  - The template reference file defines the recommended guide structure: Voice/Tone, Structure, Sentence-Level Preferences, Signature Moves, Anti-Patterns (blacklist), Positive Examples, Negative Examples, Revision Checklist
  - Phase 5 (save) asks where to store the guide and optionally writes the `style_guide` key to `.claude/compound-engineering.local.md`
  - Cross-skill reference: "load the `create-style-guide` skill" from proofread, "the `proofread` skill will use this guide" from create-style-guide
  - Use platform question tool for interview, one question at a time

  **Patterns to follow:**
  - `skills/ce-brainstorm/SKILL.md` — progressive interview pattern
  - `skills/ce-compound/SKILL.md` — reference file loading with backtick paths
  - Every's AI style guide article — the 5-phase process and section recommendations

  **Test scenarios:**
  - Interview adapts questions based on user responses (not a fixed questionnaire)
  - Generated style guide includes all template sections with concrete examples
  - Anti-patterns section includes before/after fixes (the most useful section per Every's guidance)
  - Save step writes the guide to the user's chosen location
  - Config step correctly updates `.local.md` to point to the new guide
  - Generated guide is usable by the proofread skill without modification

  **Verification:**
  - `bun test tests/frontmatter.test.ts` passes
  - Generated style guide follows the template structure

---

- [ ] **Unit 3: Update callers and remove every-style-editor**

  **Goal:** Atomically update all references to `every-style-editor` and remove the old skill directory.

  **Requirements:** R8

  **Dependencies:** Units 1 and 2

  **Files:**
  - Modify: `skills/ce-compound/SKILL.md` (lines 336, 411 — replace `every-style-editor` with `proofread`)
  - Modify: `agents/research/best-practices-researcher.md` (line 46 — replace reference)
  - Modify: `README.md` (line 77 — replace skill table entry, add `create-style-guide` entry, update counts)
  - Remove: `skills/every-style-editor/` (entire directory)

  **Approach:**
  - Replace all `every-style-editor` references with `proofread` in ce-compound and best-practices-researcher
  - Update README skill table: remove `every-style-editor` row, add `proofread` and `create-style-guide` rows, update skill count
  - Remove `skills/every-style-editor/` directory (SKILL.md + references/EVERY_WRITE_STYLE.md)
  - All changes in a single commit to maintain atomicity

  **Test scenarios:**
  - No remaining references to `every-style-editor` in the plugin (grep verification)
  - README counts match actual skill directory count
  - `bun run release:validate` passes

  **Verification:**
  - `grep -r "every-style-editor" plugins/compound-engineering/` returns only CHANGELOG.md (historical)
  - `bun run release:validate` passes
  - `bun test` passes

---

- [ ] **Unit 4: Run skill-creator eval loop and iterate**

  **Goal:** Test both skills against realistic prompts, collect feedback, and iterate until quality is solid.

  **Requirements:** All

  **Dependencies:** Units 1-3

  **Files:**
  - Create: `proofread-workspace/` (sibling to skill directory, eval results and iterations)
  - Create: `create-style-guide-workspace/` (sibling to skill directory, eval results and iterations)

  **Approach:**
  - Write 2-3 test prompts per skill reflecting realistic usage
  - For proofread: test with an editorial blog post, a technical doc, and pasted content with no file context
  - For create-style-guide: test with a user who has writing samples, and one who wants to start from scratch
  - Run with-skill vs baseline (old `every-style-editor` snapshot for proofread, no-skill for create-style-guide)
  - Use `eval-viewer/generate_review.py` to generate the review interface
  - Iterate based on feedback: refine skill instructions, rerun, repeat
  - After iterations converge, run description optimization loop

  **Verification:**
  - User has reviewed outputs in the eval viewer and confirmed quality
  - Description optimization scores are acceptable on held-out test set

## System-Wide Impact

- **Skill catalog**: README.md gains one net skill (+2 new, -1 removed). Skill count in plugin.json description needs updating via release:validate.
- **Cross-skill references**: ce-compound and best-practices-researcher reference the old name — Unit 3 handles this atomically.
- **Config surface**: Introduces `style_guide` as the first actively consumed key in `.local.md`. The setup skill is currently a placeholder — a future enhancement could have it offer style guide configuration.
- **No API surface changes**: These are prompt-level skills, not code changes. No migration or rollback concerns.

## Risks & Dependencies

- **Updated style guides from colleague**: The architecture supports adding new bundled guides later, but the specific guides aren't available yet. This doesn't block the current work — Every's editorial guide ships as the sole bundled default.
- **Proof skill availability**: The Proof comment output mode depends on the Proof MCP/API being accessible. The skill gracefully falls back to other modes if Proof isn't available.
- **Eval quality**: The skill-creator eval loop is subjective for writing-quality skills. Lean on qualitative human review rather than forcing quantitative assertions on style judgments.

## Sources & References

- Related code: `skills/every-style-editor/` (being replaced)
- Related code: `skills/proof/SKILL.md` (integration target)
- Related code: `skills/ce-brainstorm/SKILL.md` (interview pattern model)
- External docs: https://every.to/guides/ai-style-guide (style guide creation methodology)
- Learnings: `docs/solutions/skill-design/compound-refresh-skill-improvements.md`
- Learnings: `docs/solutions/skill-design/beta-skills-framework.md`
- Learnings: `docs/solutions/workflow/todo-status-lifecycle.md`
