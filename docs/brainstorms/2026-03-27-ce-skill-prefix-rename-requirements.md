---
date: 2026-03-27
topic: ce-skill-prefix-rename
---

# Consistent `ce-` Prefix for All Skills and Agents

## Problem Frame

As the Claude Code plugin ecosystem grows, generic skill names like `setup`, `plan`, `review`, and `frontend-design` collide when users have multiple plugins installed. Typing `/plan` surfaces every plugin's plan skill, forcing users to scan descriptions. Agent names also collide across plugins — generic names like `adversarial-reviewer` or `security-reviewer` are common enough that multiple plugins could define them. The compound-engineering plugin currently uses an inconsistent mix: 8 core workflow skills have a `ce:` colon prefix, while 33 others have no prefix at all. Agents use verbose 3-segment references (`compound-engineering:<category>:<agent-name>`) that are cumbersome and can be simplified now that agents will have a unique `ce-` prefix. This creates collision risk, a confusing naming taxonomy, and unnecessarily verbose agent references.

Standardizing on a `ce-` hyphen prefix for all owned skills and agents eliminates collisions, creates a consistent namespace, simplifies agent references, and removes the colon character that requires filesystem sanitization on Windows.

Related: [GitHub Issue #337](https://github.com/EveryInc/compound-engineering-plugin/issues/337)

## Requirements

When doing renames of files and folders, you are required to use `git mv` whenever possible for simplicity and explicit intent and history preservation.  You can fallback provided you notify when it happens and why.

### Naming Rules

- R1. All compound-engineering-owned skills and agents adopt a `ce-` hyphen prefix
- R2. Skills currently using `ce:` colon prefix change to `ce-` hyphen prefix (e.g., `ce:plan` -> `ce-plan`)
- R3. Skills and Agents currently without a prefix get `ce-` prepended (e.g., `setup` -> `ce-setup`, `frontend-design` -> `ce-frontend-design`, `repo-research-analyst` -> `ce-repo-research-analyst`)
- R4. `git-*` skills replace the `git-` prefix with `ce-` (e.g., `git-commit` -> `ce-commit`, `git-worktree` -> `ce-worktree`)
- R5. `report-bug-ce` normalizes to `ce-report-bug` (drops redundant suffix)

### Exclusions

- R6. `agent-browser` and `rclone` are excluded (sourced from upstream, not our skills)
- R7. `lfg` and `slfg` are excluded from renaming (short memorable workflow entry points), but their internal skill invocations must be updated per R12	

### Propagation

- R8. The skill and agent frontmatter `name:` field must match after rename (no more colon-vs-hyphen divergence). Directories need to reflect the new names as well when applicable.
- R9. All cross-references updated: skill-to-skill invocations (`/ce:plan` -> `/ce-plan`), fully-qualified references (`/compound-engineering:todo-resolve` -> `/compound-engineering:ce-todo-resolve`), `Skill("compound-engineering:...")` programmatic invocations, prose mentions, skill `description:` frontmatter fields, and intra-skill path references (`${CLAUDE_PLUGIN_ROOT}/skills/<old-name>/...`)
- R10. Active documentation updated: root README, plugin README, AGENTS.md. Note: the AGENTS.md "Why `ce:`?" rationale section (lines 53-60) needs a conceptual rewrite explaining the `ce-` convention, not just find-and-replace. Historical docs in `docs/` (past brainstorms, plans, solutions) are left as-is -- they are records of past decisions.
- R11. Agent prompt files updated where they reference skill names.
- R11b. Skill prompt files updated where they reference Agent names.
- R11c. Agent references drop the `compound-engineering:` plugin prefix and keep the category. The agent name itself gets the `ce-` prefix. (e.g. `compound-engineering:review:adversarial-reviewer` -> `review:ce-adversarial-reviewer`)
- R12. lfg and slfg orchestration chains updated to use new skill names (lfg/slfg themselves are not renamed per R7, but their internal skill and agent invocations must reflect new names)
- R13. Converter infrastructure preserved: `sanitizePathName()` and colon-handling logic stays as future protection, not removed. Add a test assertion that no skill `name:` field contains a colon, so the sanitizer is defense-in-depth rather than a silent workaround.
- R17. Codex converter's `isCanonicalCodexWorkflowSkill()` and `toCanonicalWorkflowSkillName()` in `src/converters/claude-to-codex.ts` updated to match `ce-` prefix pattern (currently hardcodes `ce:` prefix check). Related test fixtures in `tests/codex-converter.test.ts` and `tests/codex-writer.test.ts` updated accordingly.

### Testing

- R14. Path sanitization tests updated to reflect new naming (collision detection still works)
- R15. `bun test` passes after all changes
- R16. `bun run release:validate` passes after all changes
- R18. Converter test fixtures that hardcode `ce:plan` etc. updated to `ce-plan` where they test compound-engineering plugin behavior. Fixtures testing abstract colon-handling for other plugins may remain.
- R19. Sanity check and for every skill and agent name, grep to confirm new names are correct and old names do not persist except in historical planning, requirements, etc docs.

---

## Complete Rename Map

### Excluded (no change) - 4 skills

| Current Name | Reason |
|---|---|
| `agent-browser` | External/upstream |
| `rclone` | External/upstream |
| `lfg` | Exception (memorable name) |
| `slfg` | Exception (memorable name) |

### `ce:` -> `ce-` (frontmatter only, dirs already match) - 8 skills

| Current Name | New Name | Dir Rename? |
|---|---|---|
| `ce:brainstorm` | `ce-brainstorm` | No |
| `ce:compound` | `ce-compound` | No |
| `ce:compound-refresh` | `ce-compound-refresh` | No |
| `ce:ideate` | `ce-ideate` | No |
| `ce:plan` | `ce-plan` | No |
| `ce:review` | `ce-review` | No |
| `ce:work` | `ce-work` | No |
| `ce:work-beta` | `ce-work-beta` | No |

### `git-*` -> `ce-*` (replace prefix) - 4 skills

| Current Name | New Name | Dir Rename |
|---|---|---|
| `git-clean-gone-branches` | `ce-clean-gone-branches` | `git-clean-gone-branches/` -> `ce-clean-gone-branches/` |
| `git-commit` | `ce-commit` | `git-commit/` -> `ce-commit/` |
| `git-commit-push-pr` | `ce-commit-push-pr` | `git-commit-push-pr/` -> `ce-commit-push-pr/` |
| `git-worktree` | `ce-worktree` | `git-worktree/` -> `ce-worktree/` |

### Special normalization - 1 skill

| Current Name | New Name | Dir Rename |
|---|---|---|
| `report-bug-ce` | `ce-report-bug` | `report-bug-ce/` -> `ce-report-bug/` |

### Standard prefix addition - 24 skills

| Current Name | New Name | Dir Rename |
|---|---|---|
| `agent-native-architecture` | `ce-agent-native-architecture` | `agent-native-architecture/` -> `ce-agent-native-architecture/` |
| `agent-native-audit` | `ce-agent-native-audit` | `agent-native-audit/` -> `ce-agent-native-audit/` |
| `andrew-kane-gem-writer` | `ce-andrew-kane-gem-writer` | `andrew-kane-gem-writer/` -> `ce-andrew-kane-gem-writer/` |
| `changelog` | `ce-changelog` | `changelog/` -> `ce-changelog/` |
| `claude-permissions-optimizer` | `ce-claude-permissions-optimizer` | `claude-permissions-optimizer/` -> `ce-claude-permissions-optimizer/` |
| `deploy-docs` | `ce-deploy-docs` | `deploy-docs/` -> `ce-deploy-docs/` |
| `dhh-rails-style` | `ce-dhh-rails-style` | `dhh-rails-style/` -> `ce-dhh-rails-style/` |
| `document-review` | `ce-document-review` | `document-review/` -> `ce-document-review/` |
| `dspy-ruby` | `ce-dspy-ruby` | `dspy-ruby/` -> `ce-dspy-ruby/` |
| `every-style-editor` | `ce-every-style-editor` | `every-style-editor/` -> `ce-every-style-editor/` |
| `feature-video` | `ce-feature-video` | `feature-video/` -> `ce-feature-video/` |
| `frontend-design` | `ce-frontend-design` | `frontend-design/` -> `ce-frontend-design/` |
| `gemini-imagegen` | `ce-gemini-imagegen` | `gemini-imagegen/` -> `ce-gemini-imagegen/` |
| `onboarding` | `ce-onboarding` | `onboarding/` -> `ce-onboarding/` |
| `orchestrating-swarms` | `ce-orchestrating-swarms` | `orchestrating-swarms/` -> `ce-orchestrating-swarms/` |
| `proof` | `ce-proof` | `proof/` -> `ce-proof/` |
| `reproduce-bug` | `ce-reproduce-bug` | `reproduce-bug/` -> `ce-reproduce-bug/` |
| `resolve-pr-feedback` | `ce-resolve-pr-feedback` | `resolve-pr-feedback/` -> `ce-resolve-pr-feedback/` |
| `setup` | `ce-setup` | `setup/` -> `ce-setup/` |
| `test-browser` | `ce-test-browser` | `test-browser/` -> `ce-test-browser/` |
| `test-xcode` | `ce-test-xcode` | `test-xcode/` -> `ce-test-xcode/` |
| `todo-create` | `ce-todo-create` | `todo-create/` -> `ce-todo-create/` |
| `todo-resolve` | `ce-todo-resolve` | `todo-resolve/` -> `ce-todo-resolve/` |
| `todo-triage` | `ce-todo-triage` | `todo-triage/` -> `ce-todo-triage/` |

**Total: 37 skills renamed, 4 excluded (41 skills total)**

### Agent renames - 49 agents

All agents are renamed with `ce-` prefix within their existing category subdirs. The `compound-engineering:` plugin prefix is dropped from references, keeping the `<category>:ce-<agent-name>` format. Category subdirs are preserved for organization.

| Current File | New File | Old Reference | New Reference |
|---|---|---|---|
| `agents/design/design-implementation-reviewer.md` | `agents/design/ce-design-implementation-reviewer.md` | `compound-engineering:design:design-implementation-reviewer` | `design:ce-design-implementation-reviewer` |
| `agents/design/design-iterator.md` | `agents/design/ce-design-iterator.md` | `compound-engineering:design:design-iterator` | `design:ce-design-iterator` |
| `agents/design/figma-design-sync.md` | `agents/design/ce-figma-design-sync.md` | `compound-engineering:design:figma-design-sync` | `design:ce-figma-design-sync` |
| `agents/docs/ankane-readme-writer.md` | `agents/docs/ce-ankane-readme-writer.md` | `compound-engineering:docs:ankane-readme-writer` | `docs:ce-ankane-readme-writer` |
| `agents/document-review/adversarial-document-reviewer.md` | `agents/document-review/ce-adversarial-document-reviewer.md` | `compound-engineering:document-review:adversarial-document-reviewer` | `document-review:ce-adversarial-document-reviewer` |
| `agents/document-review/coherence-reviewer.md` | `agents/document-review/ce-coherence-reviewer.md` | `compound-engineering:document-review:coherence-reviewer` | `document-review:ce-coherence-reviewer` |
| `agents/document-review/design-lens-reviewer.md` | `agents/document-review/ce-design-lens-reviewer.md` | `compound-engineering:document-review:design-lens-reviewer` | `document-review:ce-design-lens-reviewer` |
| `agents/document-review/feasibility-reviewer.md` | `agents/document-review/ce-feasibility-reviewer.md` | `compound-engineering:document-review:feasibility-reviewer` | `document-review:ce-feasibility-reviewer` |
| `agents/document-review/product-lens-reviewer.md` | `agents/document-review/ce-product-lens-reviewer.md` | `compound-engineering:document-review:product-lens-reviewer` | `document-review:ce-product-lens-reviewer` |
| `agents/document-review/scope-guardian-reviewer.md` | `agents/document-review/ce-scope-guardian-reviewer.md` | `compound-engineering:document-review:scope-guardian-reviewer` | `document-review:ce-scope-guardian-reviewer` |
| `agents/document-review/security-lens-reviewer.md` | `agents/document-review/ce-security-lens-reviewer.md` | `compound-engineering:document-review:security-lens-reviewer` | `document-review:ce-security-lens-reviewer` |
| `agents/research/best-practices-researcher.md` | `agents/research/ce-best-practices-researcher.md` | `compound-engineering:research:best-practices-researcher` | `research:ce-best-practices-researcher` |
| `agents/research/framework-docs-researcher.md` | `agents/research/ce-framework-docs-researcher.md` | `compound-engineering:research:framework-docs-researcher` | `research:ce-framework-docs-researcher` |
| `agents/research/git-history-analyzer.md` | `agents/research/ce-git-history-analyzer.md` | `compound-engineering:research:git-history-analyzer` | `research:ce-git-history-analyzer` |
| `agents/research/issue-intelligence-analyst.md` | `agents/research/ce-issue-intelligence-analyst.md` | `compound-engineering:research:issue-intelligence-analyst` | `research:ce-issue-intelligence-analyst` |
| `agents/research/learnings-researcher.md` | `agents/research/ce-learnings-researcher.md` | `compound-engineering:research:learnings-researcher` | `research:ce-learnings-researcher` |
| `agents/research/repo-research-analyst.md` | `agents/research/ce-repo-research-analyst.md` | `compound-engineering:research:repo-research-analyst` | `research:ce-repo-research-analyst` |
| `agents/review/adversarial-reviewer.md` | `agents/review/ce-adversarial-reviewer.md` | `compound-engineering:review:adversarial-reviewer` | `review:ce-adversarial-reviewer` |
| `agents/review/agent-native-reviewer.md` | `agents/review/ce-agent-native-reviewer.md` | `compound-engineering:review:agent-native-reviewer` | `review:ce-agent-native-reviewer` |
| `agents/review/api-contract-reviewer.md` | `agents/review/ce-api-contract-reviewer.md` | `compound-engineering:review:api-contract-reviewer` | `review:ce-api-contract-reviewer` |
| `agents/review/architecture-strategist.md` | `agents/review/ce-architecture-strategist.md` | `compound-engineering:review:architecture-strategist` | `review:ce-architecture-strategist` |
| `agents/review/cli-agent-readiness-reviewer.md` | `agents/review/ce-cli-agent-readiness-reviewer.md` | `compound-engineering:review:cli-agent-readiness-reviewer` | `review:ce-cli-agent-readiness-reviewer` |
| `agents/review/cli-readiness-reviewer.md` | `agents/review/ce-cli-readiness-reviewer.md` | `compound-engineering:review:cli-readiness-reviewer` | `review:ce-cli-readiness-reviewer` |
| `agents/review/code-simplicity-reviewer.md` | `agents/review/ce-code-simplicity-reviewer.md` | `compound-engineering:review:code-simplicity-reviewer` | `review:ce-code-simplicity-reviewer` |
| `agents/review/correctness-reviewer.md` | `agents/review/ce-correctness-reviewer.md` | `compound-engineering:review:correctness-reviewer` | `review:ce-correctness-reviewer` |
| `agents/review/data-integrity-guardian.md` | `agents/review/ce-data-integrity-guardian.md` | `compound-engineering:review:data-integrity-guardian` | `review:ce-data-integrity-guardian` |
| `agents/review/data-migration-expert.md` | `agents/review/ce-data-migration-expert.md` | `compound-engineering:review:data-migration-expert` | `review:ce-data-migration-expert` |
| `agents/review/data-migrations-reviewer.md` | `agents/review/ce-data-migrations-reviewer.md` | `compound-engineering:review:data-migrations-reviewer` | `review:ce-data-migrations-reviewer` |
| `agents/review/deployment-verification-agent.md` | `agents/review/ce-deployment-verification-agent.md` | `compound-engineering:review:deployment-verification-agent` | `review:ce-deployment-verification-agent` |
| `agents/review/dhh-rails-reviewer.md` | `agents/review/ce-dhh-rails-reviewer.md` | `compound-engineering:review:dhh-rails-reviewer` | `review:ce-dhh-rails-reviewer` |
| `agents/review/julik-frontend-races-reviewer.md` | `agents/review/ce-julik-frontend-races-reviewer.md` | `compound-engineering:review:julik-frontend-races-reviewer` | `review:ce-julik-frontend-races-reviewer` |
| `agents/review/kieran-python-reviewer.md` | `agents/review/ce-kieran-python-reviewer.md` | `compound-engineering:review:kieran-python-reviewer` | `review:ce-kieran-python-reviewer` |
| `agents/review/kieran-rails-reviewer.md` | `agents/review/ce-kieran-rails-reviewer.md` | `compound-engineering:review:kieran-rails-reviewer` | `review:ce-kieran-rails-reviewer` |
| `agents/review/kieran-typescript-reviewer.md` | `agents/review/ce-kieran-typescript-reviewer.md` | `compound-engineering:review:kieran-typescript-reviewer` | `review:ce-kieran-typescript-reviewer` |
| `agents/review/maintainability-reviewer.md` | `agents/review/ce-maintainability-reviewer.md` | `compound-engineering:review:maintainability-reviewer` | `review:ce-maintainability-reviewer` |
| `agents/review/pattern-recognition-specialist.md` | `agents/review/ce-pattern-recognition-specialist.md` | `compound-engineering:review:pattern-recognition-specialist` | `review:ce-pattern-recognition-specialist` |
| `agents/review/performance-oracle.md` | `agents/review/ce-performance-oracle.md` | `compound-engineering:review:performance-oracle` | `review:ce-performance-oracle` |
| `agents/review/performance-reviewer.md` | `agents/review/ce-performance-reviewer.md` | `compound-engineering:review:performance-reviewer` | `review:ce-performance-reviewer` |
| `agents/review/previous-comments-reviewer.md` | `agents/review/ce-previous-comments-reviewer.md` | `compound-engineering:review:previous-comments-reviewer` | `review:ce-previous-comments-reviewer` |
| `agents/review/project-standards-reviewer.md` | `agents/review/ce-project-standards-reviewer.md` | `compound-engineering:review:project-standards-reviewer` | `review:ce-project-standards-reviewer` |
| `agents/review/reliability-reviewer.md` | `agents/review/ce-reliability-reviewer.md` | `compound-engineering:review:reliability-reviewer` | `review:ce-reliability-reviewer` |
| `agents/review/schema-drift-detector.md` | `agents/review/ce-schema-drift-detector.md` | `compound-engineering:review:schema-drift-detector` | `review:ce-schema-drift-detector` |
| `agents/review/security-reviewer.md` | `agents/review/ce-security-reviewer.md` | `compound-engineering:review:security-reviewer` | `review:ce-security-reviewer` |
| `agents/review/security-sentinel.md` | `agents/review/ce-security-sentinel.md` | `compound-engineering:review:security-sentinel` | `review:ce-security-sentinel` |
| `agents/review/testing-reviewer.md` | `agents/review/ce-testing-reviewer.md` | `compound-engineering:review:testing-reviewer` | `review:ce-testing-reviewer` |
| `agents/workflow/bug-reproduction-validator.md` | `agents/workflow/ce-bug-reproduction-validator.md` | `compound-engineering:workflow:bug-reproduction-validator` | `workflow:ce-bug-reproduction-validator` |
| `agents/workflow/lint.md` | `agents/workflow/ce-lint.md` | `compound-engineering:workflow:lint` | `workflow:ce-lint` |
| `agents/workflow/pr-comment-resolver.md` | `agents/workflow/ce-pr-comment-resolver.md` | `compound-engineering:workflow:pr-comment-resolver` | `workflow:ce-pr-comment-resolver` |
| `agents/workflow/spec-flow-analyzer.md` | `agents/workflow/ce-spec-flow-analyzer.md` | `compound-engineering:workflow:spec-flow-analyzer` | `workflow:ce-spec-flow-analyzer` |

**Total: 49 agents renamed in place (category subdirs preserved)**

---

## Success Criteria

- Every owned skill (except the 4 exclusions) has a `ce-` prefix in both directory name and frontmatter
- Every agent has a `ce-` prefix in filename and frontmatter within its category subdir
- All cross-references across skills, agents, docs, and orchestration chains use new names
- All 3-segment agent references (`compound-engineering:<category>:<agent>`) simplified to `<category>:ce-<agent>`
- `bun test` and `bun run release:validate` pass
- No colon characters remain in any skill `name:` field (though sanitization infra is preserved)
- Slash command invocations work with new names (e.g., `/ce-plan`)
- lfg and slfg orchestration chains reference new skill and agent names (R12)
- Grep sanity check confirms no old names persist in active code (R19)

## Scope Boundaries

- **Not removing sanitization infrastructure** — `sanitizePathName()` stays as future protection for any colons
- **Not adding backward-compatibility aliases** — No alias mechanism exists; this is a clean break
- **Not renaming external skills** — `agent-browser` and `rclone` are upstream
- **Not renaming lfg/slfg** — Kept as memorable exceptions
- **Historical docs are not updated** — Past brainstorms, plans, and solutions in `docs/` reference old names; this is expected and acceptable (they're historical records). R10 applies only to active docs (README, AGENTS.md), not historical docs.

## Key Decisions

- **Hyphen over colon**: `ce-` not `ce:` — eliminates filesystem sanitization divergence and is more portable
- **git-* replaces prefix**: `git-commit` -> `ce-commit` rather than `ce-git-commit` — avoids verbose double-prefix
- **report-bug-ce normalizes**: Drops redundant `-ce` suffix -> `ce-report-bug`
- **Agents renamed in place**: Category subdirs preserved for organization. Agent files get `ce-` prefix within their category dir. 3-segment refs drop plugin prefix: `compound-engineering:review:adversarial-reviewer` -> `review:ce-adversarial-reviewer`.
- **Major version bump**: This is a breaking change; plugin version will bump the major version to signal it.
- **Clean break, no aliases**: Users learn new names immediately; the old names stop working
- **Preserve sanitization**: Keep colon-handling code even though no skills currently use colons — future-proofing
- **git mv required**: All renames use `git mv` for history preservation. Fallback only with notification.

## Dependencies / Assumptions

- Skill directory renames via `git mv` preserve git history. Commit strategy (single vs multiple commits) deferred to planning.
- lfg/slfg reference other skills both by short name (`/ce:plan`) and fully-qualified (`/compound-engineering:todo-resolve`) — both patterns need updating
- README may contain stale skill references (e.g., `/sync`) — clean up during R10 documentation pass

## Outstanding Questions

### Deferred to Planning

- [Affects R9][Needs research] Exact inventory of every cross-reference in every SKILL.md, agent file, and doc that needs updating — planner should grep comprehensively
- [Affects R8][Technical] Should directory renames be done via `git mv` in a single commit or spread across multiple commits for reviewability?
- [Affects R14, R18][Technical] What specific test assertions reference skill names and need updating? Which test fixtures test compound-engineering behavior (should update) vs abstract colon-handling (may keep)?

## Next Steps

-> `/ce:plan` for structured implementation planning (will itself be renamed to `/ce-plan` as part of this work)
