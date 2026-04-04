---
title: "refactor: Rename all skills and agents to consistent ce- prefix"
type: refactor
status: completed
date: 2026-03-27
origin: docs/brainstorms/2026-03-27-ce-skill-prefix-rename-requirements.md
deepened: 2026-03-27
---

# Rename All Skills and Agents to Consistent `ce-` Prefix

## Overview

Rename all 37 compound-engineering-owned skills and all 49 agents to use a consistent `ce-` hyphen prefix, eliminating namespace collisions with other plugins and removing the colon character that required filesystem sanitization. Agent files are renamed with `ce-` prefix within their existing category subdirs, and 3-segment fully-qualified references (`compound-engineering:<category>:<agent>`) are simplified to `<category>:ce-<agent>` (drop plugin prefix, keep category). This is a cross-cutting mechanical rename touching skill directories, agent files, frontmatter, cross-references, converter source code, tests, and documentation.

## Problem Frame

Generic skill names (`setup`, `plan`, `review`) collide when users install multiple Claude Code plugins. The current naming is inconsistent: 8 core workflow skills use `ce:` colon prefix while 33 others have no prefix. Agent references use verbose 3-segment format (`compound-engineering:review:adversarial-reviewer`). Standardizing on `ce-` eliminates collisions, aligns directory names with frontmatter names, and simplifies agent references. (see origin: docs/brainstorms/2026-03-27-ce-skill-prefix-rename-requirements.md)

## Requirements Trace

- R1. All owned skills AND agents adopt `ce-` hyphen prefix
- R2. `ce:` colon prefix -> `ce-` hyphen prefix (e.g., `ce:plan` -> `ce-plan`)
- R3. Unprefixed skills and agents get `ce-` prepended (e.g., `setup` -> `ce-setup`, `repo-research-analyst` -> `ce-repo-research-analyst`)
- R4. `git-*` skills replace prefix with `ce-` (e.g., `git-commit` -> `ce-commit`)
- R5. `report-bug-ce` normalizes to `ce-report-bug`
- R6. `agent-browser` and `rclone` excluded (upstream)
- R7. `lfg` and `slfg` excluded (memorable names), but internal references updated (R12)
- R8. Skill/agent frontmatter `name:` must match; directories reflect new names
- R9. All cross-references updated (slash commands, fully-qualified, prose, descriptions, intra-skill paths)
- R10. Active documentation updated (README, AGENTS.md); historical docs left as-is
- R11. Agent prompt files updated where they reference skill names
- R11b. Skill prompt files updated where they reference agent names
- R11c. Agent references `compound-engineering:<category>:<agent>` simplified to `<category>:ce-<agent>`
- R12. lfg/slfg orchestration chains updated (skill AND agent invocations)
- R13. Sanitization infrastructure preserved; add lint assertion for no-colon invariant
- R14-R16. Tests pass, release:validate passes
- R17. Codex converter hardcoded `ce:` checks updated
- R18. Test fixtures updated appropriately
- R19. Grep sanity check: new names correct, old names do not persist in active code

## Scope Boundaries

- Not removing `sanitizePathName()` (defense-in-depth for future colons)
- Not adding backward-compatibility aliases (clean break)
- Not updating historical docs in `docs/`
- Not renaming `agent-browser`, `rclone`, `lfg`, `slfg`
- All renames use `git mv`; fallback only with notification
- Single commit for the entire change

## Context & Research

### Relevant Code and Patterns

- `src/parsers/claude.ts:108` — Skill name from frontmatter `data.name`, fallback to dir basename
- `src/utils/files.ts:84-86` — `sanitizePathName()` replaces colons with hyphens
- `src/converters/claude-to-codex.ts:180-195` — Hardcoded `ce:` prefix checks for canonical workflow skills
- `src/utils/codex-content.ts:75-86` — `normalizeCodexName()` for Codex flat naming
- `tests/path-sanitization.test.ts` — Collision detection test loading real plugin

### Institutional Learnings

- `docs/solutions/integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md` — Documents the colon/hyphen duality and three-layer sanitization (target writers, sync paths, converter dedupe sets). After this rename, the duality is eliminated for CE skills but sanitization stays for other plugins.
- `docs/solutions/codex-skill-prompt-entrypoints.md` — Codex derives skill names from directory basenames. The `isCanonicalCodexWorkflowSkill()` function identifies which skills get prompt wrappers. After rename, ALL skills start with `ce-`, so prefix-based detection breaks — needs frontmatter-field-based detection instead.
- `docs/solutions/skill-design/beta-skills-framework.md` — Validates that stale cross-references after rename cause routing bugs. Must search all SKILL.md files for old names after rename.

## Key Technical Decisions

- **Codex canonical skill detection via frontmatter field**: After rename, `startsWith("ce-")` matches ALL skills. Rather than a hardcoded allowlist (fragile, poor discoverability), add `codex-prompt: true` to the 8 workflow SKILL.md frontmatter files, extend `ClaudeSkill` type with `codexPrompt?: boolean`, and parse it in `loadSkills()`. The converter then checks `skill.codexPrompt === true` instead of name patterns. This follows the codebase grain (parser already extracts frontmatter fields) and naturally propagates when copying workflow skill templates. New workflow skills are discoverable because the field is right where the skill is defined.
- **`workflows:` alias mapping**: `toCanonicalWorkflowSkillName()` currently produces `ce:plan` from `workflows:plan`. Update to produce `ce-plan`. The `isDeprecatedCodexWorkflowAlias()` check (`startsWith("workflows:")`) is unaffected.
- **Converter content-transformation is idempotent — no other converter code changes needed**: All 6 converters with slash-command rewriting (Windsurf, Droid, Kiro, Copilot, Pi, Codex) use generic `normalizeName()` that replaces colons with hyphens via `.replace(/[:\s]+/g, "-")`. So `/ce:plan` and `/ce-plan` both normalize to `ce-plan` — identical output. The 4 converters without slash-command rewriting (OpenClaw, Qwen, OpenCode, Gemini) pass skill content through untransformed. Only the Codex `isCanonicalCodexWorkflowSkill()` function needs updating.
- **Droid converter behavioral change (expected, beneficial)**: Droid's `flattenCommandName()` strips everything before the last colon: `/ce:plan` -> `/plan`. After rename, `/ce-plan` has no colon so it passes through as `/ce-plan`. This preserves the `ce-` prefix in Droid target output, which is an improvement. No code change needed — it happens automatically from the content change.
- **Test fixture strategy**: Fixtures testing compound-engineering-specific behavior (Codex prompt wrappers, review skill contracts) update to `ce-plan`. Fixtures testing abstract colon handling (path-sanitization) change examples to non-CE names like `other:skill` to preserve coverage of the colon path.
- **Agent rename in place (no flattening)**: Category subdirs preserved for organization. Agent files renamed with `ce-` prefix within their category dir: `agents/review/adversarial-reviewer.md` -> `agents/review/ce-adversarial-reviewer.md`. References drop the `compound-engineering:` plugin prefix but keep category: `compound-engineering:review:adversarial-reviewer` -> `review:ce-adversarial-reviewer`.
- **Major version bump**: This is a breaking change affecting all users; plugin version will bump major to signal it.
- **git mv required**: All renames use `git mv` for history preservation per requirements. Fallback only with notification.
- **Single atomic commit**: All directory renames, content changes, code changes, and test updates in one commit. Intermediate states would have broken tests and stale references.

## Open Questions

### Resolved During Planning

- **Codex `isCanonicalCodexWorkflowSkill` fix strategy**: Use `codex-prompt: true` frontmatter field instead of prefix check or hardcoded allowlist. Follows the codebase grain, is self-documenting, and naturally propagates via skill template copying.
- **Other converter content-transformation**: Verified all 6 converters with slash-command rewriting use generic `normalizeName()` — idempotent on colon/hyphen. No code changes needed beyond Codex `isCanonicalCodexWorkflowSkill`.
- **Commit strategy**: Single commit. The PR is the review artifact.
- **Test fixtures for colon handling**: Change `ce:plan` examples in path-sanitization tests to `other:skill` so colon sanitization is still tested without depending on CE skill names.
- **`/sync` stale reference in README**: Clean up during documentation pass.
- **Cross-reference scope**: Exhaustive inventory found 24 files with ~100+ replacements across 7 distinct reference patterns (see Unit 3).

### Deferred to Implementation

- Exact wording of the AGENTS.md "Why `ce-`?" rationale rewrite — depends on how the surrounding context reads after all name changes
- Whether any additional agent files beyond the 5 identified contain skill name references — implementer should grep comprehensively

## Implementation Units

- [ ] **Unit 1: Skill directory renames**

**Goal:** Rename all 29 skill directories that need new names via `git mv`.

**Requirements:** R1, R3, R4, R5, R8

**Dependencies:** None (first unit)

**Files:**
- `git mv` 29 directories under `plugins/compound-engineering/skills/`:
  - 4 git-* replacements: `git-commit/` -> `ce-commit/`, `git-commit-push-pr/` -> `ce-commit-push-pr/`, `git-worktree/` -> `ce-worktree/`, `git-clean-gone-branches/` -> `ce-clean-gone-branches/`
  - 1 normalization: `report-bug-ce/` -> `ce-report-bug/`
  - 24 prefix additions: `agent-native-architecture/` -> `ce-agent-native-architecture/`, `agent-native-audit/` -> `ce-agent-native-audit/`, `andrew-kane-gem-writer/` -> `ce-andrew-kane-gem-writer/`, `changelog/` -> `ce-changelog/`, `claude-permissions-optimizer/` -> `ce-claude-permissions-optimizer/`, `deploy-docs/` -> `ce-deploy-docs/`, `dhh-rails-style/` -> `ce-dhh-rails-style/`, `document-review/` -> `ce-document-review/`, `dspy-ruby/` -> `ce-dspy-ruby/`, `every-style-editor/` -> `ce-every-style-editor/`, `feature-video/` -> `ce-feature-video/`, `frontend-design/` -> `ce-frontend-design/`, `gemini-imagegen/` -> `ce-gemini-imagegen/`, `onboarding/` -> `ce-onboarding/`, `orchestrating-swarms/` -> `ce-orchestrating-swarms/`, `proof/` -> `ce-proof/`, `reproduce-bug/` -> `ce-reproduce-bug/`, `resolve-pr-feedback/` -> `ce-resolve-pr-feedback/`, `setup/` -> `ce-setup/`, `test-browser/` -> `ce-test-browser/`, `test-xcode/` -> `ce-test-xcode/`, `todo-create/` -> `ce-todo-create/`, `todo-resolve/` -> `ce-todo-resolve/`, `todo-triage/` -> `ce-todo-triage/`
- 8 `ce:` skills need NO directory rename (dirs already use hyphens: `ce-brainstorm/`, `ce-plan/`, etc.)

**Approach:**
- Execute all `git mv` operations in sequence
- The 4 excluded skills remain: `agent-browser/`, `rclone/`, `lfg/`, `slfg/`

**Verification:**
- All 41 skill directories present with correct names
- `git status` shows 29 renames tracked

---

- [ ] **Unit 1b: Agent file renames (in place)**

**Goal:** Rename all 49 agent files with `ce-` prefix within their existing category subdirs.

**Requirements:** R1, R3, R8

**Dependencies:** None (can run in parallel with Unit 1)

**Files:**
- `git mv` 49 agent files within their category subdirs: `agents/<category>/<name>.md` -> `agents/<category>/ce-<name>.md`
- Category subdirs preserved: `design/`, `docs/`, `document-review/`, `research/`, `review/`, `workflow/`

**Approach:**
- For each agent file: `git mv agents/<category>/<name>.md agents/<category>/ce-<name>.md`
- See the complete agent rename map in the requirements doc for all 49 mappings

**Verification:**
- 49 `ce-*.md` files across category subdirs
- Category directory structure unchanged
- `git status` shows 49 renames tracked

---

- [ ] **Unit 2: Frontmatter and description updates**

**Goal:** Update the `name:` and `description:` fields in all 37 renamed skills' SKILL.md files. Add `codex-prompt: true` to the 8 workflow skills.

**Requirements:** R1, R2, R3, R4, R5, R8, R9, R17

**Dependencies:** Unit 1 (directories exist at new paths)

**Files:**
- Modify: All 37 `SKILL.md` files in renamed skill directories
  - 8 `ce:` skills: change `name: ce:X` to `name: ce-X` in frontmatter
  - 29 others: change `name: X` to `name: ce-X` (with appropriate prefix rule)
  - Update `description:` fields that reference old skill names (confirmed: `ce-work-beta` references "ce:work", `setup` references "ce:review", `ce-plan` references "ce:brainstorm")
  - Add `codex-prompt: true` to frontmatter of the 8 workflow skills: `ce-brainstorm`, `ce-compound`, `ce-compound-refresh`, `ce-ideate`, `ce-plan`, `ce-review`, `ce-work`, `ce-work-beta`

**Approach:**
- For each SKILL.md, edit the YAML frontmatter `name:` field
- Search each `description:` field for references to old skill names and update
- Add `codex-prompt: true` field to the 8 workflow skill frontmatter blocks
- Use the rename map from the requirements doc as the authoritative mapping

**Patterns to follow:**
- Frontmatter format: `name: ce-plan` (no colons)
- Keep `description:` prose style consistent with existing descriptions

**Test scenarios:**
- Every SKILL.md has a `name:` field matching its directory name
- No `name:` field contains a colon character
- Exactly 8 SKILL.md files have `codex-prompt: true`

**Verification:**
- `grep -r "^name: ce:" plugins/compound-engineering/skills/` returns zero results
- Every `name:` matches its containing directory name
- `grep -rl "codex-prompt: true" plugins/compound-engineering/skills/` returns exactly 8 files

---

- [ ] **Unit 3: Intra-skill cross-reference updates**

**Goal:** Update all skill-to-skill references inside SKILL.md content (not frontmatter). Exhaustive inventory: 20 SKILL.md files, ~100+ individual replacements across 7 reference patterns.

**Requirements:** R9, R12

**Dependencies:** Unit 2

**Files:**
- Modify (20 SKILL.md files with cross-references):
  - `skills/ce-plan/SKILL.md` — ~8 `/ce:work` refs + 7 `document-review` backtick refs
  - `skills/ce-brainstorm/SKILL.md` — ~12 `/ce:plan`, `/ce:work` refs + 1 `document-review` ref
  - `skills/ce-compound/SKILL.md` — ~7 `/ce:compound-refresh`, `/ce:plan` refs
  - `skills/ce-ideate/SKILL.md` — `/ce:brainstorm`, `/ce:plan` refs
  - `skills/ce-review/SKILL.md` — routing table refs + 2 `todo-create` backtick refs
  - `skills/ce-work/SKILL.md` — `/ce:plan`, `/ce:review` + `skill: git-worktree` loader ref
  - `skills/ce-work-beta/SKILL.md` — same as ce-work + `frontend-design` backtick ref
  - `skills/lfg/SKILL.md` — `/ce:plan`, `/ce:work`, `/ce:review` + `/compound-engineering:todo-resolve`, `:test-browser`, `:feature-video`
  - `skills/slfg/SKILL.md` — same patterns as lfg
  - `skills/ce-worktree/SKILL.md` — `/ce:review`, `/ce:work` + 20 `${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/` path refs + 2 `call git-worktree skill` self-refs
  - `skills/ce-todo-create/SKILL.md` — `/ce:review` + `todo-triage` backtick ref + `/todo-resolve`, `/todo-triage` slash refs
  - `skills/ce-todo-triage/SKILL.md` — `todo-create` backtick ref + 2 `/todo-resolve` slash refs
  - `skills/ce-todo-resolve/SKILL.md` — `/ce:compound` + 2 `.context/compound-engineering/todo-resolve/` scratch paths
  - `skills/ce-agent-native-audit/SKILL.md` — `/compound-engineering:agent-native-architecture` + bare name ref
  - `skills/ce-test-browser/SKILL.md` — `agent-browser` backtick ref + `todo-create` backtick ref + 4 `/test-browser` self-refs
  - `skills/ce-feature-video/SKILL.md` — 3 `agent-browser` backtick refs + 5 `/feature-video` self-refs + 11 `.context/compound-engineering/feature-video/` scratch paths
  - `skills/ce-reproduce-bug/SKILL.md` — `agent-browser` backtick ref
  - `skills/ce-frontend-design/SKILL.md` — `agent-browser` backtick ref
  - `skills/ce-report-bug/SKILL.md` — `/report-bug-ce` self-ref
  - `skills/ce-document-review/SKILL.md` — skill reference patterns (verify agent refs vs skill refs)

**Approach:**
- Seven reference patterns to update:
  1. `/ce:X` -> `/ce-X` (slash command invocations of workflow skills)
  2. `ce:X` -> `ce-X` (prose mentions of workflow skills without slash)
  3. `/compound-engineering:X` -> `/compound-engineering:ce-X` (fully-qualified skill refs for skills that gained `ce-` prefix — e.g., `/compound-engineering:todo-resolve` -> `/compound-engineering:ce-todo-resolve`)
  4. `${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/` -> `${CLAUDE_PLUGIN_ROOT}/skills/ce-worktree/` (intra-skill paths)
  5. Backtick skill refs: `` `document-review` `` -> `` `ce-document-review` ``, `` `todo-create` `` -> `` `ce-todo-create` ``, `skill: git-worktree` -> `skill: ce-worktree`, etc.
  6. Self-referencing slash commands: `/test-browser` -> `/ce-test-browser`, `/feature-video` -> `/ce-feature-video`, `/todo-resolve` -> `/ce-todo-resolve`, `/report-bug-ce` -> `/ce-report-bug`
  7. Scratch space paths: `.context/compound-engineering/feature-video/` -> `.context/compound-engineering/ce-feature-video/`, `.context/compound-engineering/todo-resolve/` -> `.context/compound-engineering/ce-todo-resolve/`

**Critical exclusions — do NOT update:**
- `agent-browser` references — this skill is EXCLUDED from renaming (R6, upstream). Many skills reference it with `the \`agent-browser\` skill`; these must stay as-is
- `rclone` references — also excluded
- `lfg`/`slfg` references — excluded from renaming (R7), though their internal refs ARE updated

**Note:** Agent references like `compound-engineering:review:code-simplicity-reviewer` ARE now in scope (R11c) — they will be updated in Unit 3b.

**Test scenarios:**
- `grep -r "/ce:" plugins/compound-engineering/skills/` returns zero results (after excluding agent refs like `compound-engineering:category:agent`)
- lfg/slfg chains reference new skill names
- ce-worktree script paths point to `ce-worktree/` directory
- No stale bare skill name references for renamed skills in backtick patterns

**Verification:**
- No stale `/ce:` skill references remain in any SKILL.md
- No stale `/compound-engineering:todo-resolve` (without `ce-` prefix) patterns remain for renamed skills
- No stale bare `document-review`, `todo-create`, `git-worktree` backtick refs (replaced with `ce-` prefixed names)

---

- [ ] **Unit 3b: Agent reference updates across skills and agents**

**Goal:** Update all agent references throughout skills and agent files. Drop `compound-engineering:` plugin prefix from 3-segment refs, keeping `<category>:ce-<agent>`. Update agent frontmatter `name:` fields.

**Requirements:** R8, R11, R11b, R11c, R12

**Dependencies:** Unit 1b (agent files at new paths)

**Files:**
- Modify: All 49 agent `.md` files — update frontmatter `name:` to `ce-<agent-name>`
- Modify: All skill SKILL.md files that reference agents via `compound-engineering:<category>:<agent>` pattern (many files — ce-plan, ce-review, ce-brainstorm, ce-ideate, ce-document-review, ce-work, ce-work-beta, ce-orchestrating-swarms, ce-resolve-pr-feedback, lfg, slfg, and others)
- Modify: Agent files that reference other agents via fully-qualified names
- Modify: Agent `description:` frontmatter fields that may reference the old format
- Modify: `project-standards-reviewer` agent — its review criteria explicitly enforce the old 3-segment convention; needs conceptual update

**Approach:**
- Update all 49 agent frontmatter `name:` fields to `ce-<agent-name>`
- Replace all `compound-engineering:<category>:<agent>` references with `<category>:ce-<agent>` across ALL skill and agent files. Key patterns:
  1. `Task compound-engineering:<category>:<agent>` -> `Task <category>:ce-<agent>` (Task tool invocations in skills)
  2. `subagent_type: compound-engineering:<category>:<agent>` -> `subagent_type: <category>:ce-<agent>` (orchestrating-swarms and similar)
  3. `` `compound-engineering:<category>:<agent>` `` -> `` `<category>:ce-<agent>` `` (backtick references in prose)
  4. Bare prose mentions of fully-qualified agent names
- Agent files that reference skill names (handled in Unit 6) — but agent files referencing OTHER agents by old name need updating here
- lfg/slfg agent invocations updated per R12
- `project-standards-reviewer` agent's review criteria updated to enforce `<category>:ce-<agent>` format instead of `compound-engineering:<category>:<agent>`

**Test scenarios:**
- `grep -r "compound-engineering:" plugins/compound-engineering/skills/ plugins/compound-engineering/agents/` returns zero results for agent references (skill fully-qualified refs like `/compound-engineering:ce-todo-resolve` may still exist)
- Every agent frontmatter `name:` starts with `ce-`

**Verification:**
- No `compound-engineering:<category>:<agent>` references remain in active skill/agent files
- All 49 agent `name:` fields updated
- `project-standards-reviewer` enforces new naming convention

---

- [ ] **Unit 4: Codex converter and parser updates**

**Goal:** Replace the Codex converter's hardcoded `ce:` prefix logic with a frontmatter-driven `codex-prompt` field. Update the parser and types to support the new field.

**Requirements:** R17

**Dependencies:** Unit 2 (the 8 workflow SKILL.md files must have `codex-prompt: true` in frontmatter)

**Files:**
- Modify: `src/types/claude.ts` — Add `codexPrompt?: boolean` to `ClaudeSkill` type
- Modify: `src/parsers/claude.ts` — Extract `codex-prompt` from frontmatter in `loadSkills()`
- Modify: `src/converters/claude-to-codex.ts`
  - Replace `isCanonicalCodexWorkflowSkill(name)` with a check on `skill.codexPrompt === true`
  - Update `toCanonicalWorkflowSkillName` to produce `ce-` instead of `ce:`

**Approach:**
- Add `codexPrompt?: boolean` to the `ClaudeSkill` type alongside existing fields like `disableModelInvocation`
- In `loadSkills()`, extract `codex-prompt` from frontmatter: `codexPrompt: data['codex-prompt'] === true`
- In the Codex converter, change `isCanonicalCodexWorkflowSkill` to accept the skill object (not just name) and check `skill.codexPrompt === true`. This may require adjusting the call sites to pass the full skill rather than just `skill.name`
- Update `toCanonicalWorkflowSkillName` to produce `ce-` prefix: `ce-${name.slice("workflows:".length)}`
- The `isDeprecatedCodexWorkflowAlias` function (`startsWith("workflows:")`) needs no change
- No other converter code changes needed — all other content transformations are idempotent on colon/hyphen

**Patterns to follow:**
- Existing frontmatter field extraction pattern in `src/parsers/claude.ts` (see `disableModelInvocation` extraction)
- Existing `ClaudeSkill` type field pattern in `src/types/claude.ts`

**Test scenarios:**
- A skill with `codex-prompt: true` gets identified as a workflow skill
- A skill without the field (or `codex-prompt: false`) is NOT a workflow skill
- `toCanonicalWorkflowSkillName("workflows:plan")` returns `"ce-plan"`
- The 8 workflow skills from the real plugin all have `codexPrompt: true` when parsed

**Verification:**
- Codex converter correctly identifies the 8 canonical workflow skills via frontmatter field
- `workflows:*` aliases map to `ce-*` names
- No hardcoded skill name checks remain in converter code

---

- [ ] **Unit 5: Test fixture updates**

**Goal:** Update all test files with hardcoded skill names to reflect the new `ce-` prefix.

**Requirements:** R14, R15, R18

**Dependencies:** Unit 4 (converter changes affect test expectations)

**Files:**
- Modify (compound-engineering specific fixtures — update to `ce-plan`):
  - `tests/codex-converter.test.ts` — ~10 fixtures with `ce:plan`, `ce:brainstorm`
  - `tests/codex-writer.test.ts` — ~5 fixtures
  - `tests/review-skill-contract.test.ts` — string assertions for `/ce:review`
  - `tests/compound-support-files.test.ts` — describe label
  - `tests/release-metadata.test.ts` — mkdir and file content
  - `tests/release-components.test.ts` — commit message parsing
  - `tests/release-preview.test.ts` — title fixture
  - Writer tests (all have `ce:plan` fixtures): `tests/kiro-writer.test.ts`, `tests/pi-writer.test.ts`, `tests/droid-writer.test.ts`, `tests/gemini-writer.test.ts`, `tests/copilot-writer.test.ts`, `tests/windsurf-writer.test.ts`
  - `tests/windsurf-converter.test.ts` — collision dedup fixture
  - `tests/copilot-converter.test.ts` — collision detection fixture
  - `tests/openclaw-converter.test.ts` — fixture
  - `tests/claude-home.test.ts` — frontmatter fixture
- Modify (abstract colon-handling — change to non-CE example):
  - `tests/path-sanitization.test.ts` — change `ce:brainstorm`/`ce:plan` examples to `other:skill`/`other:tool` to preserve colon sanitization coverage
- Add: assertion in `tests/path-sanitization.test.ts` that no CE skill name contains a colon (R13 lint requirement)

**Approach:**
- For CE-specific tests: mechanically replace `ce:plan` with `ce-plan`, `ce:brainstorm` with `ce-brainstorm`, etc.
- For path-sanitization tests: replace CE examples with generic colon examples to maintain coverage of the `sanitizePathName()` colon path
- Add a new test case that loads the real plugin and asserts `!skill.name.includes(":")` for every skill

**Test scenarios:**
- All existing test assertions still pass with new fixture values
- Path sanitization test still covers colon-to-hyphen conversion (with non-CE example)
- New no-colon invariant test passes

**Verification:**
- `bun test` passes with zero failures

---

- [ ] **Unit 6: Skill-name references in agent files**

**Goal:** Update agent `.md` files that reference skill names with old patterns (`/ce:plan`, bare `git-worktree`, etc.). Agent files are now at `agents/ce-*.md` after Unit 1b.

**Requirements:** R11

**Dependencies:** Unit 1b (agent files at new paths), Unit 3b (agent frontmatter and agent-to-agent refs already done)

**Files:**
- Modify (agent files with skill name references — paths reflect post-rename location):
  - `plugins/compound-engineering/agents/research/ce-git-history-analyzer.md` — references `/ce:plan`
  - `plugins/compound-engineering/agents/research/ce-issue-intelligence-analyst.md` — references `/ce:ideate`
  - `plugins/compound-engineering/agents/research/ce-learnings-researcher.md` — references `/ce:plan`
  - `plugins/compound-engineering/agents/review/ce-code-simplicity-reviewer.md` — references `/ce:plan`, `/ce:work`
  - `plugins/compound-engineering/agents/research/ce-best-practices-researcher.md` — references `agent-native-architecture`, `git-worktree` bare names (now `ce-agent-native-architecture`, `ce-worktree`)
  - `plugins/compound-engineering/agents/workflow/ce-bug-reproduction-validator.md` — references `agent-browser` skill (excluded, no change needed — verify only)
- Comprehensive grep to find any other agent files with old skill references

**Approach:**
- Replace `/ce:X` with `/ce-X` in skill slash-command references
- Replace bare old skill names with `ce-` prefixed names in prose
- Do NOT update `agent-browser` references (excluded per R6)

**Verification:**
- `grep -r "/ce:" plugins/compound-engineering/agents/` returns zero results
- No agent file references old skill names (except excluded `agent-browser`)

---

- [ ] **Unit 7: Documentation updates**

**Goal:** Update active documentation to reflect new skill AND agent names. Rewrite naming convention rationale. Update agent reference convention from 3-segment to flat `ce-` format.

**Requirements:** R10

**Dependencies:** Unit 1, Unit 1b (all names finalized)

**Files:**
- Modify: `plugins/compound-engineering/README.md` — skill tables, agent references
- Modify: `plugins/compound-engineering/AGENTS.md` — command listing, "Why `ce:`?" section needs full conceptual rewrite to explain `ce-` convention for both skills and agents, agent reference convention section (was `compound-engineering:<category>:<agent>`, now `<category>:ce-<agent>`)
- Modify: `README.md` (root) — Workflow table, prose references, Codex output notes. Clean up stale `/sync` reference.
- Modify: `AGENTS.md` (root) — update agent reference convention if present

**Approach:**
- Skill tables: mechanical find-and-replace of `/ce:X` -> `/ce-X` and bare skill names
- Agent references: update all `compound-engineering:<category>:<agent>` examples to `<category>:ce-<agent>`
- AGENTS.md: rewrite naming convention section to explain unified `ce-` prefix for both skills and agents; update "Agent References in Skills" section to reflect new `<category>:ce-<agent>` format (was `compound-engineering:<category>:<agent>`)
- Root README: update tables and remove stale `/sync` skill reference
- Do NOT update historical docs in `docs/brainstorms/`, `docs/plans/`, `docs/solutions/`

**Verification:**
- No active doc references old `ce:` skill names or `compound-engineering:<category>:<agent>` agent patterns
- AGENTS.md rationale section explains `ce-` convention coherently for both skills and agents
- Agent reference convention updated from `compound-engineering:<category>:<agent>` to `<category>:ce-<agent>`

---

- [ ] **Unit 8: Verification sweep and commit**

**Goal:** Final verification that no stale references remain for both skills AND agents, all tests pass, and release validation succeeds.

**Requirements:** R14, R15, R16, R19

**Dependencies:** All previous units

**Files:**
- No new files

**Approach:**
- Run comprehensive grep for stale SKILL names across the entire repo:
  - `grep -r "ce:brainstorm\|ce:plan\|ce:review\|ce:work\|ce:ideate\|ce:compound" plugins/ src/ tests/` (should return zero outside historical docs)
  - `grep -r "/git-commit\b\|/git-worktree\b\|/git-clean-gone\|/report-bug-ce\b" plugins/` (should return zero)
  - `grep -r "/compound-engineering:todo-resolve\b\|/compound-engineering:test-browser\b\|/compound-engineering:feature-video\b\|/compound-engineering:setup\b" plugins/` (should return zero)
- Run comprehensive grep for stale AGENT references:
  - `grep -r "compound-engineering:review:\|compound-engineering:research:\|compound-engineering:design:\|compound-engineering:workflow:\|compound-engineering:document-review:\|compound-engineering:docs:" plugins/ src/ tests/` (should return zero — all converted to `ce-<agent>`)
  - Verify no agent files remain in category subdirs
- Run `bun test`
- Run `bun run release:validate`
- Fix any stragglers found
- Commit all changes in a single commit

**Verification:**
- `bun test` passes with zero failures
- `bun run release:validate` passes
- No stale skill or agent name references in active code (plugins/, src/, tests/)
- No 3-segment agent references remain

## System-Wide Impact

- **Interaction graph:** Skill-to-skill handoff chains (`brainstorm` -> `plan` -> `work` -> `review`) are the primary interaction surface. lfg/slfg orchestrate these chains. Skills dispatch agents via `Task` or `subagent_type` — these change from `compound-engineering:<category>:<agent>` to `<category>:ce-<agent>`. All handoff and dispatch references must use new names.
- **Error propagation:** A missed cross-reference would cause skill invocation to fail at runtime with "skill not found". Grep-based verification in Unit 8 is the primary defense.
- **State lifecycle risks:** Existing scratch directories at `.context/compound-engineering/ce-review/` are unaffected (already use hyphens). Renamed skills' scratch dirs (e.g., `feature-video/` -> `ce-feature-video/`) will start creating new paths; old orphaned scratch dirs from previous runs are harmless and ephemeral.
- **Converter content-transformation (verified safe):** All 6 converters with slash-command rewriting (Windsurf, Droid, Kiro, Copilot, Pi, Codex) use generic `normalizeName()` that is idempotent on colon/hyphen — `/ce:plan` and `/ce-plan` both produce `ce-plan`. The 4 converters without content transformation (OpenClaw, Qwen, OpenCode, Gemini) pass content through unmodified. Only the Codex `isCanonicalCodexWorkflowSkill()` function needs code changes.
- **Droid target behavioral change:** Droid's `flattenCommandName()` strips everything before the last colon: `/ce:plan` -> `/plan`. After rename, `/ce-plan` has no colon so it passes through as `/ce-plan`. This preserves the `ce-` prefix in Droid target output — an improvement, no code change needed.
- **API surface parity:** `sanitizePathName()` becomes a no-op for CE skills but remains functional for other plugins that may use colons.
- **Integration coverage:** The collision detection test in `tests/path-sanitization.test.ts` loads the real plugin — it will validate that no two renamed skills collide after sanitization.

## Risks & Dependencies

- **Very large diff size**: 29 skill directory renames + 49 agent file renames + content changes across 70+ files. Mitigation: single commit with clear commit message; PR description with summary table.
- **Agent reference blast radius**: 3-segment `compound-engineering:<category>:<agent>` references appear in many skill files (ce-plan, ce-review, ce-brainstorm, ce-ideate, ce-document-review, ce-work, ce-orchestrating-swarms, ce-resolve-pr-feedback, lfg, slfg). All must be updated to `ce-<agent>`. Mitigation: comprehensive grep in Unit 8 verification.
- **Missed cross-references**: 7+ distinct reference patterns across skills, plus agent reference patterns. Mitigation: exhaustive skill inventory from deepening; grep-based verification for both skills and agents.
- **Codex converter behavioral change**: Moving from prefix-based to frontmatter-field-based detection. Mitigation: explicit test scenarios; field is self-documenting and follows existing codebase patterns.
- **`agent-browser` exclusion discipline**: Many skills reference `the \`agent-browser\` skill` — these must NOT be updated since agent-browser is excluded (R6). Mitigation: explicit exclusion list in Unit 3 approach notes.
- **User muscle memory**: `/ce:plan` stops working; `compound-engineering:review:adversarial-reviewer` format stops working. Mitigation: clean break is intentional; major version bump signals the change.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-27-ce-skill-prefix-rename-requirements.md](docs/brainstorms/2026-03-27-ce-skill-prefix-rename-requirements.md)
- Related issue: [#337](https://github.com/EveryInc/compound-engineering-plugin/issues/337)
- Related learning: `docs/solutions/integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md`
- Related learning: `docs/solutions/codex-skill-prompt-entrypoints.md`
- Related learning: `docs/solutions/skill-design/beta-skills-framework.md`
