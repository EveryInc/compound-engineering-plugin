# Tasks: smart-ralph-scaffolding

## Phase 1: Make It Work (Foundation - P0 + P1)

- [x] 1.1 Add `disable-model-invocation: true` to deepen-plan.md
  - **Do**: Open `plugins/compound-engineering/commands/deepen-plan.md`, find the YAML frontmatter block (between `---` delimiters), add the line `disable-model-invocation: true` after the last existing frontmatter field
  - **Files**: plugins/compound-engineering/commands/deepen-plan.md (modify)
  - **Done when**: Frontmatter contains `disable-model-invocation: true` as boolean (not string "true")
  - **Verify**: `grep 'disable-model-invocation: true' plugins/compound-engineering/commands/deepen-plan.md`
  - **Commit**: `fix(commands): add disable-model-invocation to deepen-plan`
  - _Requirements: US-1_
  - _Design: Frontmatter Audit_

- [x] 1.2 Add `disable-model-invocation: true` to feature-video.md
  - **Do**: Open `plugins/compound-engineering/commands/feature-video.md`, add `disable-model-invocation: true` to YAML frontmatter
  - **Files**: plugins/compound-engineering/commands/feature-video.md (modify)
  - **Done when**: Frontmatter contains `disable-model-invocation: true`
  - **Verify**: `grep 'disable-model-invocation: true' plugins/compound-engineering/commands/feature-video.md`
  - **Commit**: `fix(commands): add disable-model-invocation to feature-video`
  - _Requirements: US-1_

- [x] 1.3 Add `disable-model-invocation: true` to resolve_todo_parallel.md
  - **Do**: Open `plugins/compound-engineering/commands/resolve_todo_parallel.md`, add `disable-model-invocation: true` to YAML frontmatter
  - **Files**: plugins/compound-engineering/commands/resolve_todo_parallel.md (modify)
  - **Done when**: Frontmatter contains `disable-model-invocation: true`
  - **Verify**: `grep 'disable-model-invocation: true' plugins/compound-engineering/commands/resolve_todo_parallel.md`
  - **Commit**: `fix(commands): add disable-model-invocation to resolve_todo_parallel`
  - _Requirements: US-1_

- [x] 1.4 Add `disable-model-invocation: true` to test-browser.md
  - **Do**: Open `plugins/compound-engineering/commands/test-browser.md`, add `disable-model-invocation: true` to YAML frontmatter
  - **Files**: plugins/compound-engineering/commands/test-browser.md (modify)
  - **Done when**: Frontmatter contains `disable-model-invocation: true`
  - **Verify**: `grep 'disable-model-invocation: true' plugins/compound-engineering/commands/test-browser.md`
  - **Commit**: `fix(commands): add disable-model-invocation to test-browser`
  - _Requirements: US-1_

- [x] 1.5 Add `disable-model-invocation: true` to all 5 workflow commands
  - **Do**: Open each of these 5 files and add `disable-model-invocation: true` to YAML frontmatter: `workflows/brainstorm.md`, `workflows/compound.md`, `workflows/plan.md`, `workflows/review.md`, `workflows/work.md`
  - **Files**: plugins/compound-engineering/commands/workflows/brainstorm.md (modify), plugins/compound-engineering/commands/workflows/compound.md (modify), plugins/compound-engineering/commands/workflows/plan.md (modify), plugins/compound-engineering/commands/workflows/review.md (modify), plugins/compound-engineering/commands/workflows/work.md (modify)
  - **Done when**: All 5 workflow commands have `disable-model-invocation: true` in frontmatter
  - **Verify**: `for f in plugins/compound-engineering/commands/workflows/*.md; do echo "$f:"; grep 'disable-model-invocation' "$f"; done`
  - **Commit**: `fix(workflows): add disable-model-invocation to all 5 workflow commands`
  - _Requirements: US-1_

- [x] 1.6 Add `argument-hint` to deploy-docs.md
  - **Do**: Open `plugins/compound-engineering/commands/deploy-docs.md`, add `argument-hint: "[optional: --dry-run to preview changes]"` to YAML frontmatter
  - **Files**: plugins/compound-engineering/commands/deploy-docs.md (modify)
  - **Done when**: Frontmatter contains `argument-hint` field
  - **Verify**: `grep 'argument-hint' plugins/compound-engineering/commands/deploy-docs.md`
  - **Commit**: `fix(commands): add argument-hint to deploy-docs`
  - _Requirements: US-1_

- [x] 1.7 Verify all 24 commands have both frontmatter fields
  - **Do**: Run a scan across all 24 command files to confirm every one has both `argument-hint` and `disable-model-invocation: true`. List any that are missing.
  - **Files**: plugins/compound-engineering/commands/**/*.md (read-only)
  - **Done when**: 24/24 commands have `argument-hint` and 24/24 have `disable-model-invocation: true`
  - **Verify**: `for f in $(find plugins/compound-engineering/commands -name '*.md'); do name=$(basename "$f"); has_arg=$(grep -c 'argument-hint' "$f"); has_dmi=$(grep -c 'disable-model-invocation' "$f"); echo "$name: arg=$has_arg dmi=$has_dmi"; done | grep -v 'arg=1 dmi=1'`
  - **Commit**: skip (verification only)

- [x] 1.8 Quality Checkpoint
  - **Do**: Run existing test suite to verify frontmatter changes don't break anything
  - **Verify**: `bun test`
  - **Done when**: All existing tests pass with no regressions
  - **Commit**: skip (checkpoint only)

- [x] 1.9 Add critical header and prerequisites to reproduce-bug.md
  - **Do**: Open `plugins/compound-engineering/commands/reproduce-bug.md`. Add a `## CRITICAL: Use agent-browser CLI Only` section after the title (following the pattern from `test-browser.md`). Add a `## Prerequisites` section verifying `agent-browser` is installed. These sections warn against using Chrome MCP tools.
  - **Files**: plugins/compound-engineering/commands/reproduce-bug.md (modify)
  - **Done when**: Critical header and prerequisites sections exist at the top of the command body
  - **Verify**: `grep -c 'agent-browser' plugins/compound-engineering/commands/reproduce-bug.md` returns > 0
  - **Commit**: `fix(reproduce-bug): add agent-browser critical header and prerequisites`
  - _Requirements: US-2_
  - _Design: Area 7_

- [x] 1.10 Replace all 6 MCP tool references with agent-browser CLI equivalents
  - **Do**: In `reproduce-bug.md`, replace ALL `mcp__plugin_compound-engineering_pw__*` references: (1) `browser_navigate` + `browser_snapshot` -> `agent-browser open` + `agent-browser snapshot -i`, (2) `browser_take_screenshot` -> `agent-browser screenshot`, (3) `browser_click`/`browser_type` -> `agent-browser click @ref`/`agent-browser fill @ref "text"`, (4) `browser_console_messages` -> snapshot-based workaround (check visible error states via snapshot), (5) final screenshot -> `agent-browser screenshot "bug-[issue]-reproduced.png"`. Follow the exact pattern from `test-browser.md` and `feature-video.md`.
  - **Files**: plugins/compound-engineering/commands/reproduce-bug.md (modify)
  - **Done when**: Zero `mcp__plugin_compound-engineering_pw__` references remain in the file
  - **Verify**: `grep -c 'mcp__plugin_compound-engineering_pw__' plugins/compound-engineering/commands/reproduce-bug.md` returns 0
  - **Commit**: `fix(reproduce-bug): replace all MCP tool refs with agent-browser CLI`
  - _Requirements: US-2_

- [x] 1.11 Add agent-browser CLI reference section to reproduce-bug.md
  - **Do**: Add a `## agent-browser CLI Reference` section at the end of `reproduce-bug.md` with key commands (open, snapshot, screenshot, click, fill), copied/adapted from `test-browser.md`. Include the console error detection workaround note.
  - **Files**: plugins/compound-engineering/commands/reproduce-bug.md (modify)
  - **Done when**: CLI reference section exists with all key agent-browser commands documented
  - **Verify**: `grep -c 'agent-browser' plugins/compound-engineering/commands/reproduce-bug.md` returns >= 10
  - **Commit**: `fix(reproduce-bug): add agent-browser CLI reference section`
  - _Requirements: US-2_

- [x] 1.12 Verify no stale MCP references remain
  - **Do**: Search the entire `reproduce-bug.md` file and all other command files for any remaining `mcp__plugin_compound-engineering_pw__` references
  - **Files**: plugins/compound-engineering/commands/**/*.md (read-only)
  - **Done when**: Zero matches across all command files
  - **Verify**: `grep -r 'mcp__plugin_compound-engineering_pw__' plugins/compound-engineering/commands/`
  - **Commit**: skip (verification only)

- [x] 1.13 Create hooks directory structure
  - **Do**: Create `plugins/compound-engineering/hooks/` and `plugins/compound-engineering/hooks/scripts/` directories
  - **Files**: plugins/compound-engineering/hooks/ (create dir), plugins/compound-engineering/hooks/scripts/ (create dir)
  - **Done when**: Both directories exist
  - **Verify**: `ls -d plugins/compound-engineering/hooks/scripts/`
  - **Commit**: skip (directory creation only, commit with hook files)

- [x] 1.14 Create hooks.json configuration
  - **Do**: Create `plugins/compound-engineering/hooks/hooks.json` with: (1) `description` field, (2) PreToolUse matcher for `Bash` tool -> runs `validate-bash.sh` with 10s timeout, (3) PreToolUse matcher for `Write|Edit` tools -> runs `protect-env-files.sh` with 5s timeout. Use `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/` for script paths. Follow the exact JSON structure from TECH.md spec.
  - **Files**: plugins/compound-engineering/hooks/hooks.json (create)
  - **Done when**: Valid JSON file with 2 PreToolUse matchers
  - **Verify**: `cat plugins/compound-engineering/hooks/hooks.json | jq .`
  - **Commit**: `feat(hooks): add hooks.json configuration for safety guardrails`
  - _Requirements: US-4_
  - _Design: Area 6_

- [x] 1.15 Create validate-bash.sh hook script
  - **Do**: Create `plugins/compound-engineering/hooks/scripts/validate-bash.sh` that: (1) reads JSON from stdin, extracts `tool_input.command` via `jq`, (2) detects `git push --force`/`-f` -> returns "ask" with branch context, (3) detects `git reset --hard` -> returns "ask", (4) detects `rm -rf`/`rm -fr` with three-tier logic: hard deny catastrophic targets (`/`, `~`, `$HOME`, `.`), silent allow safe targets (`node_modules`, `.cache`, `tmp`, `__pycache__`, `.next`), ask for everything else, (5) all other commands: exit 0 (allow). Use `set -euo pipefail`. Follow the corrected implementation from TECH.md spec.
  - **Files**: plugins/compound-engineering/hooks/scripts/validate-bash.sh (create)
  - **Done when**: Script handles all patterns correctly per TECH spec
  - **Verify**: `echo '{"tool_input":{"command":"ls -la"}}' | bash plugins/compound-engineering/hooks/scripts/validate-bash.sh; echo "exit: $?"`
  - **Commit**: `feat(hooks): add validate-bash.sh for destructive command detection`
  - _Requirements: US-4_

- [x] 1.16 Create protect-env-files.sh hook script
  - **Do**: Create `plugins/compound-engineering/hooks/scripts/protect-env-files.sh` that: (1) reads JSON from stdin, extracts `tool_input.file_path` via `jq`, (2) matches curated secrets pattern: `\.env($|\.)`, `\.pem$`, `\.key$`, `credentials`, `secret.*\.(json|yml|yaml)`, (3) returns "ask" with reason for matches, (4) all other files: exit 0. Empty file_path: exit 0. Use `set -euo pipefail`.
  - **Files**: plugins/compound-engineering/hooks/scripts/protect-env-files.sh (create)
  - **Done when**: Script detects all secret file patterns per TECH spec
  - **Verify**: `echo '{"tool_input":{"file_path":".env"}}' | bash plugins/compound-engineering/hooks/scripts/protect-env-files.sh`
  - **Commit**: `feat(hooks): add protect-env-files.sh for secret file protection`
  - _Requirements: US-4_

- [ ] 1.17 Make hook scripts executable
  - **Do**: Run `chmod +x` on both hook scripts
  - **Files**: plugins/compound-engineering/hooks/scripts/validate-bash.sh (modify permissions), plugins/compound-engineering/hooks/scripts/protect-env-files.sh (modify permissions)
  - **Done when**: Both scripts have executable permission
  - **Verify**: `ls -la plugins/compound-engineering/hooks/scripts/*.sh | grep 'x'`
  - **Commit**: `chore(hooks): make hook scripts executable`
  - _Requirements: US-4_

- [ ] 1.18 Quality Checkpoint
  - **Do**: Run all quality checks. Verify hook scripts work with test inputs. Run existing test suite.
  - **Verify**: All commands must pass:
    - Test suite: `bun test`
    - Hook test: `echo '{"tool_input":{"command":"git push --force origin main"}}' | bash plugins/compound-engineering/hooks/scripts/validate-bash.sh | jq .`
    - Env hook test: `echo '{"tool_input":{"file_path":"credentials.json"}}' | bash plugins/compound-engineering/hooks/scripts/protect-env-files.sh | jq .`
  - **Done when**: All quality checks pass with no errors
  - **Commit**: `chore: pass Phase 1 quality checkpoint`

## Phase 2: Refactoring (Input Validation + CI)

- [ ] 2.1 Add input validation to workflows/work.md
  - **Do**: Insert an `## Input Validation` section (wrapped in `<input_validation>` tags) before Phase 1 in `workflows/work.md`. When `$ARGUMENTS` is provided, validate the plan file path: check file exists, ends in `.md`, is in `docs/plans/`. On failure, show What/Why/Fix error with `ls -1t docs/plans/*.md | head -5` to list available plans. Include "If validation passes: Proceed to Phase 1" at the end.
  - **Files**: plugins/compound-engineering/commands/workflows/work.md (modify)
  - **Done when**: Input validation section exists with plan file path validation and What/Why/Fix error format
  - **Verify**: `grep -c 'Input Validation' plugins/compound-engineering/commands/workflows/work.md` returns 1
  - **Commit**: `feat(work): add input validation for plan file path`
  - _Requirements: US-3_
  - _Design: Area 2_

- [ ] 2.2 Add input validation to workflows/review.md
  - **Do**: Insert an `## Input Validation` section (wrapped in `<input_validation>` tags) before Main Tasks in `workflows/review.md`. Parse argument as: PR number (numeric), GitHub URL (extract PR number), branch name (check `git rev-parse --verify`), or keyword ("latest", "current"). On unrecognizable input, show What/Why/Fix error listing valid formats. Validation must be permissive -- infer type from format, only fail when no reasonable interpretation exists.
  - **Files**: plugins/compound-engineering/commands/workflows/review.md (modify)
  - **Done when**: Input validation section exists with multi-format PR/branch/URL validation
  - **Verify**: `grep -c 'Input Validation' plugins/compound-engineering/commands/workflows/review.md` returns 1
  - **Commit**: `feat(review): add input validation for PR number/branch/URL`
  - _Requirements: US-3_

- [ ] 2.3 Add input validation to reproduce-bug.md
  - **Do**: Insert an `## Input Validation` section early in `reproduce-bug.md`. Validate that `$ARGUMENTS` is a numeric GitHub issue number. On non-numeric input, show What/Why/Fix error with correct usage example (`/reproduce-bug 42`). Optionally verify issue exists with `gh issue view`.
  - **Files**: plugins/compound-engineering/commands/reproduce-bug.md (modify)
  - **Done when**: Input validation section exists with numeric issue number validation
  - **Verify**: `grep -c 'Input Validation' plugins/compound-engineering/commands/reproduce-bug.md` returns 1
  - **Commit**: `feat(reproduce-bug): add input validation for issue number`
  - _Requirements: US-3_

- [ ] 2.4 Verify all validation error messages use What/Why/Fix format
  - **Do**: Review all 3 validation sections to confirm every error message includes: (a) What happened (clear statement), (b) Why (context), (c) Fix (actionable next step with usage example). This three-part format is critical for agent self-correction.
  - **Files**: plugins/compound-engineering/commands/workflows/work.md (read), plugins/compound-engineering/commands/workflows/review.md (read), plugins/compound-engineering/commands/reproduce-bug.md (read)
  - **Done when**: All error messages follow the three-part format
  - **Verify**: `grep -A5 'Error:' plugins/compound-engineering/commands/workflows/work.md | grep -c 'Why:\|Fix:'`
  - **Commit**: skip (verification only)

- [ ] 2.5 Quality Checkpoint
  - **Do**: Run test suite to verify validation additions don't break anything
  - **Verify**: `bun test`
  - **Done when**: All tests pass
  - **Commit**: `chore: pass input validation quality checkpoint`

- [ ] 2.6 Create tests/command-validation.test.ts
  - **Do**: Create a Bun test file that: (1) discovers all `.md` files in `plugins/compound-engineering/commands/` and `commands/workflows/` via glob, (2) uses existing `parseFrontmatter()` from `src/utils/frontmatter.ts`, (3) implements 6 assertion groups per command: YAML parses without error, `name` is non-empty string, `description` is non-empty string, `argument-hint` is string, `disable-model-invocation` is boolean `true` (unless `# ci-allow: model-invocation` escape hatch in body), body doesn't match `REMOVED_TOOL_PATTERNS` (starting with `/mcp__plugin_compound-engineering_pw__/`). (4) Add GitHub Actions inline annotations via `console.error('::error file=...')` for failures.
  - **Files**: tests/command-validation.test.ts (create)
  - **Done when**: Test file exists with all 6 assertion groups, uses existing parseFrontmatter, discovers all 24 commands
  - **Verify**: `bun test tests/command-validation.test.ts`
  - **Commit**: `feat(ci): add command frontmatter validation tests`
  - _Requirements: US-5_
  - _Design: Area 3_

- [ ] 2.7 Create tests/hook-scripts.test.ts
  - **Do**: Create a Bun test file that: (1) implements a `runHook(script, input)` helper using `Bun.spawn()` to pipe JSON to stdin, (2) adds `jq` availability check as first test (skip all if missing), (3) tests validate-bash.sh with 14 cases: normal command (allow), non-force git push (allow), `git push --force` (ask), `git push -f` (ask), `git reset --hard` (ask), `rm -rf src/components` (ask), `rm -fr dist/build` (ask), `rm -rf /` (deny), `rm -rf ~` (deny), `rm -rf $HOME` (deny), `rm -rf node_modules` (allow), `rm -rf .cache` (allow), empty command (allow), piped `cd && rm -rf` (ask). (4) Tests protect-env-files.sh with 10 cases: `.env` (ask), `.env.local` (ask), `.env.production` (ask), `src/index.ts` (allow), `cert.pem` (ask), `private.key` (ask), `credentials.json` (ask), `secret.yml` (ask), `src/env-utils.ts` (allow), empty file_path (allow).
  - **Files**: tests/hook-scripts.test.ts (create)
  - **Done when**: Test file exists with all 24 test cases using Bun.spawn
  - **Verify**: `bun test tests/hook-scripts.test.ts`
  - **Commit**: `feat(ci): add hook script unit tests (24 test cases)`
  - _Requirements: US-5_

- [ ] 2.8 Run full test suite and verify CI compatibility
  - **Do**: Execute `bun test` and verify ALL tests pass: existing 8 tests + new command-validation + new hook-scripts tests. Fix any failures.
  - **Files**: tests/ (read-only)
  - **Done when**: All tests pass with zero failures
  - **Verify**: `bun test`
  - **Commit**: skip (verification only, or fix commit if needed)

- [ ] 2.9 Quality Checkpoint
  - **Do**: Run all quality checks to verify Phase 2 changes
  - **Verify**: All commands must pass:
    - Full test suite: `bun test`
    - Hook scripts still work: `echo '{"tool_input":{"command":"ls"}}' | bash plugins/compound-engineering/hooks/scripts/validate-bash.sh; echo $?`
  - **Done when**: All quality checks pass
  - **Commit**: `chore: pass Phase 2 quality checkpoint`

## Phase 3: Testing (Interactive Patterns + State Management)

- [ ] 3.1 Add plan picker to workflows/work.md
  - **Do**: Insert an `## Input Handling` section (wrapped in `<input_handling>` tags) before Phase 1 (after Input Validation). **Autonomous mode** (`$ARGUMENTS` non-empty): validate plan path, proceed directly. **Interactive mode** (`$ARGUMENTS` empty): use AskUserQuestion to present plan picker -- scan `docs/plans/` for recent `.md` files (max 10), scan for `.*.local.md` state files, present max 5 options (state-files first, then most recent), include "Enter a file path manually" and "Browse all plans" options. Special cases: single plan -> "Found one plan: [name]. Work on this?"; no plans -> "No plans found."
  - **Files**: plugins/compound-engineering/commands/workflows/work.md (modify)
  - **Done when**: Input Handling section exists with AskUserQuestion plan picker and autonomous bypass
  - **Verify**: `grep -c 'AskUserQuestion' plugins/compound-engineering/commands/workflows/work.md` returns >= 1
  - **Commit**: `feat(work): add interactive plan picker with autonomous bypass`
  - _Requirements: US-6_
  - _Design: Area 4a_

- [ ] 3.2 Add target selector to workflows/review.md
  - **Do**: Insert an `## Input Handling` section (wrapped in `<input_handling>` tags) before Main Tasks (after Input Validation). **Autonomous mode** (`$ARGUMENTS` non-empty): parse as PR/URL/branch/keyword, proceed. **Interactive mode** (`$ARGUMENTS` empty): use AskUserQuestion -- check current branch, check for open PR on branch, list recent PRs by current user. Context-dependent options: feature branch with PR -> default to that PR; feature branch without PR -> default to branch; main/master -> show recent PRs. No review depth selector (comprehensive is default).
  - **Files**: plugins/compound-engineering/commands/workflows/review.md (modify)
  - **Done when**: Input Handling section exists with AskUserQuestion target selector and autonomous bypass
  - **Verify**: `grep -c 'AskUserQuestion' plugins/compound-engineering/commands/workflows/review.md` returns >= 1
  - **Commit**: `feat(review): add interactive target selector with autonomous bypass`
  - _Requirements: US-6_
  - _Design: Area 4b_

- [ ] 3.3 Add category confirmation to workflows/compound.md
  - **Do**: Insert a `### Category Confirmation` section (wrapped in `<category_confirmation>` tags) in Phase 1 after the Category Classifier subagent returns. **Autonomous mode** (`$ARGUMENTS` non-empty, from lfg/slfg): skip confirmation. **Interactive mode**: AskUserQuestion "Classified as '[category]'. Does this look right?" with options: (1) Yes, proceed (recommended), (2) Change category, (3) This is actually two problems. If "Change category": second AskUserQuestion with full category list.
  - **Files**: plugins/compound-engineering/commands/workflows/compound.md (modify)
  - **Done when**: Category confirmation section exists with AskUserQuestion and autonomous bypass
  - **Verify**: `grep -c 'AskUserQuestion' plugins/compound-engineering/commands/workflows/compound.md` returns >= 1
  - **Commit**: `feat(compound): add interactive category confirmation with autonomous bypass`
  - _Requirements: US-6_
  - _Design: Area 4c_

- [ ] 3.4 Add L1/L2/L3 layer detection to workflows/plan.md
  - **Do**: Add explicit layer detection to the Idea Refinement section in `workflows/plan.md`: **L1** (`$ARGUMENTS` >50 words or references a brainstorm doc): skip idea refinement, announce "Description is detailed, proceeding to research." **L2** (1-50 words): current single-question behavior. **L3** (empty): current full refinement dialogue.
  - **Files**: plugins/compound-engineering/commands/workflows/plan.md (modify)
  - **Done when**: Layer detection logic exists with L1/L2/L3 paths clearly documented
  - **Verify**: `grep -c 'L1\|L2\|L3' plugins/compound-engineering/commands/workflows/plan.md` returns >= 3
  - **Commit**: `feat(plan): add L1/L2/L3 layer detection for idea refinement`
  - _Requirements: US-6_
  - _Design: Area 4d_

- [ ] 3.5 Verify AskUserQuestion design rules consistency
  - **Do**: Review all 4 AskUserQuestion implementations to confirm: (1) recommended option is first, (2) max 5 options, (3) "skip/proceed with defaults" available when sensible, (4) questions framed as decisions not information requests, (5) autonomous bypass checks `$ARGUMENTS` non-empty
  - **Files**: plugins/compound-engineering/commands/workflows/work.md (read), plugins/compound-engineering/commands/workflows/review.md (read), plugins/compound-engineering/commands/workflows/compound.md (read), plugins/compound-engineering/commands/workflows/plan.md (read)
  - **Done when**: All 4 implementations follow the design rules consistently
  - **Verify**: Manual review of each file
  - **Commit**: skip (verification only)

- [ ] 3.6 Quality Checkpoint
  - **Do**: Run test suite to verify interactive pattern additions don't break anything
  - **Verify**: `bun test`
  - **Done when**: All tests pass
  - **Commit**: `chore: pass interactive patterns quality checkpoint`

- [ ] 3.7 Add State Checkpoint section to workflows/plan.md
  - **Do**: Insert a `### State Checkpoint` section at the end of `workflows/plan.md`, after the plan file is written. Logic: (1) derive feature slug from plan filename (strip date prefix `YYYY-MM-DD-`, type prefix `feat-`/`fix-`/`refactor-`, `-plan` suffix), (2) create `.{feature-slug}.local.md` in project root with YAML frontmatter (`feature`, `plan_file`, `phase: plan-complete`, `branch: ""`, `started`, `updated` as ISO 8601), (3) progress section with "Plan created" checked, all others unchecked, (4) announce "Progress saved to .{slug}.local.md (gitignored)". Include bash example for slug derivation.
  - **Files**: plugins/compound-engineering/commands/workflows/plan.md (modify)
  - **Done when**: State Checkpoint section creates `.local.md` files with correct YAML frontmatter schema
  - **Verify**: `grep -c 'State Checkpoint' plugins/compound-engineering/commands/workflows/plan.md` returns 1
  - **Commit**: `feat(plan): add state checkpoint for workflow resumability`
  - _Requirements: US-7_
  - _Design: Area 5_

- [ ] 3.8 Add State Discovery section to workflows/work.md
  - **Do**: Insert a `### State Discovery` section before Phase 1 (after Input Handling) in `workflows/work.md`. Logic: (1) scan for `.*.local.md` files in project root, (2) if a state file matches selected plan (by `plan_file` field): read state, parse phase/progress, show resume prompt via AskUserQuestion with options: Resume (recommended), Start fresh (deletes state), View saved state, (3) if no matching state file: proceed normally. Include staleness detection: <24h (recommended resume), 1-7d (neutral), >7d (warning), >30d (recommend fresh). Include branch divergence check via `git log --since`.
  - **Files**: plugins/compound-engineering/commands/workflows/work.md (modify)
  - **Done when**: State Discovery section with resume prompt, staleness detection, and branch divergence check
  - **Verify**: `grep -c 'State Discovery' plugins/compound-engineering/commands/workflows/work.md` returns 1
  - **Commit**: `feat(work): add state discovery for workflow resumability`
  - _Requirements: US-7_

- [ ] 3.9 Handle state management edge cases
  - **Do**: Add instructions in the State Discovery section for: (1) corrupt state file (invalid YAML): warn and delete, start fresh, (2) multiple state files for different features: list all, ask user which one, (3) plan file deleted: warn, offer to start fresh or enter new path, (4) phase mismatch: warn and suggest correct command
  - **Files**: plugins/compound-engineering/commands/workflows/work.md (modify)
  - **Done when**: All 4 edge cases are handled with clear instructions
  - **Verify**: `grep -c 'corrupt\|multiple.*state\|deleted\|mismatch' plugins/compound-engineering/commands/workflows/work.md`
  - **Commit**: `feat(work): handle state management edge cases`
  - _Requirements: US-7_

- [ ] 3.10 Quality Checkpoint
  - **Do**: Run all quality checks for Phase 3
  - **Verify**: All commands must pass:
    - Full test suite: `bun test`
    - Grep for any remaining issues: `grep -r 'mcp__plugin_compound-engineering_pw__' plugins/compound-engineering/commands/`
  - **Done when**: All checks pass
  - **Commit**: `chore: pass Phase 3 quality checkpoint`

## Phase 4: Quality Gates

- [ ] 4.1 Run full bun test suite
  - **Do**: Run `bun test` and verify ALL tests pass: existing tests + command-validation + hook-scripts
  - **Verify**: `bun test`
  - **Done when**: Zero test failures
  - **Commit**: skip (or fix commit if any failures found)

- [ ] 4.2 Verify all 12 QA acceptance criteria
  - **Do**: Check each acceptance criterion from `ai/tasks/spec/QA.md`:
    - AC-1: All 24 commands have valid frontmatter (verified by command-validation.test.ts)
    - AC-2: No stale Playwright MCP refs (verified by command-validation.test.ts)
    - AC-3: validate-bash.sh handles all 14 test cases (verified by hook-scripts.test.ts)
    - AC-4: protect-env-files.sh handles all 10 test cases (verified by hook-scripts.test.ts)
    - AC-5: lfg chain (manual -- document as TODO for integration testing)
    - AC-6: slfg chain (manual -- document as TODO)
    - AC-7: Context budget (manual -- document as TODO)
    - AC-8: State file lifecycle (manual verification)
    - AC-9: AskUserQuestion autonomous bypass (manual verification)
    - AC-10: bun test passes (verified this task)
    - AC-11: Existing tests still pass (verified this task)
    - AC-12: Hook scripts have executable permissions
  - **Files**: ai/tasks/spec/QA.md (read)
  - **Done when**: AC-1 through AC-4 and AC-10 through AC-12 pass. AC-5 through AC-9 documented as manual testing TODOs.
  - **Verify**: `bun test && ls -la plugins/compound-engineering/hooks/scripts/*.sh`
  - **Commit**: skip (verification only)

- [ ] 4.3 Final quality validation
  - **Do**: Run ALL quality checks one final time before creating PR
  - **Verify**: All commands must pass:
    - Full test suite: `bun test`
    - JSON validity: `cat plugins/compound-engineering/hooks/hooks.json | jq .`
    - Hook permissions: `test -x plugins/compound-engineering/hooks/scripts/validate-bash.sh && echo OK`
    - No stale refs: `grep -r 'mcp__plugin_compound-engineering_pw__' plugins/compound-engineering/commands/ || echo "clean"`
    - Frontmatter complete: `for f in $(find plugins/compound-engineering/commands -name '*.md'); do grep -q 'disable-model-invocation' "$f" || echo "MISSING: $f"; done`
  - **Done when**: All commands pass with no errors
  - **Commit**: `fix: address final quality issues` (if any fixes needed)

- [ ] 4.4 Create PR and verify CI
  - **Do**: Push branch and create PR with title "feat: smart-ralph command scaffolding improvements" and body summarizing all 8 improvement areas, linking to spec files
  - **Verify**: `gh pr checks --watch` shows all green
  - **Done when**: All CI checks passing, PR ready for review

## Phase 5: PR Lifecycle

- [ ] 5.1 Create pull request
  - **Do**: Create PR with proper title and description covering all changes
  - **Verify**: `gh pr view` shows PR URL
  - **Done when**: PR created

- [ ] 5.2 Monitor CI and fix failures
  - **Do**: Watch CI, fix failures iteratively
  - **Verify**: `gh pr checks` shows all green
  - **Done when**: All CI checks passing

- [ ] 5.3 Address code review comments
  - **Do**: Implement requested changes from reviews
  - **Verify**: No unresolved review comments
  - **Done when**: All review comments resolved

- [ ] 5.4 Final validation
  - **Do**: Verify all completion criteria met
  - **Done when**: All criteria met, PR approved
