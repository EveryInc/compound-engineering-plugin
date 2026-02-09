---
id: ci-validation.BREAKDOWN
module: ci-validation
priority: 4
status: pending
version: 1
origin: spec-workflow
dependsOn: [frontmatter-audit, hooks]
tags: [smart-ralph, compound-engineering]
---
# CI Validation

## Context

The CI pipeline (`ci.yml`) runs `bun test` but does not validate command markdown files -- no YAML frontmatter lint, no field completeness checks, no broken-reference detection. This module adds two test files to the existing `bun test` suite: one for command frontmatter validation (6 assertion groups across 24 commands) and one for hook script unit tests (24 test cases across 2 scripts). Both run automatically in CI with zero new dependencies.

## Tasks

1. **Create `tests/command-validation.test.ts`** -- Write a Bun test file that:
   - Discovers all `.md` files in `plugins/compound-engineering/commands/` and `commands/workflows/` via glob
   - Uses the existing `parseFrontmatter()` utility from `src/utils/frontmatter.ts`
   - Implements 6 assertion groups per command file:
     - **1.1**: YAML frontmatter parses without error (parseFrontmatter returns non-empty data)
     - **1.2**: `name` field is a non-empty string
     - **1.3**: `description` field is a non-empty string
     - **1.4**: `argument-hint` field is a string
     - **1.5**: `disable-model-invocation` is boolean `true` -- UNLESS the command body contains `# ci-allow: model-invocation` (escape hatch)
     - **1.6**: Command body does not match any pattern in `REMOVED_TOOL_PATTERNS` array (starting with `/mcp__plugin_compound-engineering_pw__/`)

2. **Add GitHub Actions inline annotations** -- For each test failure, emit `::error file=<relative-path>,line=1::<message>` via `console.error()` so GitHub shows annotations inline on PR diffs.

3. **Define `REMOVED_TOOL_PATTERNS` array** -- Create a constant array of regex patterns for known-removed tools. Start with `[/mcp__plugin_compound-engineering_pw__/]`. This array is extended when tools are deprecated in the future.

4. **Create `tests/hook-scripts.test.ts`** -- Write a Bun test file that tests both hook scripts using `Bun.spawn()`:
   - Implements a `runHook(script, input)` helper function that pipes JSON to stdin via `Bun.spawn()`, waits for completion, and returns `{ exitCode, stdout, stderr }`
   - **validate-bash.sh tests** (14 cases):
     - 2.1: Normal command (`ls -la`) -> allow (exit 0, no JSON)
     - 2.2: Non-force git push -> allow
     - 2.3: `git push --force origin feat/auth` -> ask, reason contains "Force push"
     - 2.4: `git push -f origin main` -> ask
     - 2.5: `git reset --hard HEAD~3` -> ask, reason contains "Hard reset"
     - 2.6: `rm -rf src/components` -> ask, reason contains "Recursive delete"
     - 2.7: `rm -fr dist/build` -> ask (flag reorder)
     - 2.8: `rm -rf /` -> deny, reason contains "Catastrophic"
     - 2.9: `rm -rf ~` -> deny
     - 2.10: `rm -rf $HOME` -> deny
     - 2.11: `rm -rf node_modules` -> allow (safe target)
     - 2.12: `rm -rf .cache` -> allow (safe target)
     - 2.13: Empty command -> allow
     - 2.14: `cd src && rm -rf dist` -> ask (piped command)
   - **protect-env-files.sh tests** (10 cases):
     - 2.15: `.env` -> ask
     - 2.16: `.env.local` -> ask
     - 2.17: `.env.production` -> ask
     - 2.18: `src/index.ts` -> allow
     - 2.19: `cert.pem` -> ask
     - 2.20: `private.key` -> ask
     - 2.21: `credentials.json` -> ask
     - 2.22: `secret.yml` -> ask
     - 2.23: `src/env-utils.ts` -> allow (similarly named safe file)
     - 2.24: Empty file_path -> allow

5. **Add `jq` availability check** -- As the first test in `hook-scripts.test.ts`, check if `jq` is available on the system. If not, skip all hook tests with a descriptive message: "jq is required for hook scripts. Install with: brew install jq (macOS) or apt-get install jq (Linux)".

6. **Verify both test files are picked up by `bun test`** -- Confirm tests run as part of the existing `bun test` command (which runs all `tests/*.test.ts`). No changes to `.github/workflows/ci.yml` needed.

7. **Run full test suite** -- Execute `bun test` and verify all new tests pass alongside the existing 8 tests (AC-11).

## Acceptance Criteria

- AC-1 (from QA): All 24 commands have valid YAML frontmatter with name, description, argument-hint, and disable-model-invocation. command-validation.test.ts passes.
- AC-2 (from QA): No command body references removed Playwright MCP tools. Removed-pattern check passes.
- AC-3 (from QA): validate-bash.sh correctly handles all 14 test cases.
- AC-4 (from QA): protect-env-files.sh correctly handles all 10 test cases.
- AC-10 (from QA): `bun test` passes on both macOS and ubuntu-latest.
- AC-11 (from QA): All existing 8 tests continue to pass alongside new tests.
- Test failures include file path and Fix instruction for GitHub Actions inline annotations.
- The escape hatch (`# ci-allow: model-invocation` comment in command body) correctly exempts commands from the disable-model-invocation check.

## Files to Create/Modify

### New Files (2)

| File | Purpose |
|------|---------|
| `tests/command-validation.test.ts` | CI test: validates all 24 command files for frontmatter completeness, required fields, and removed tool references |
| `tests/hook-scripts.test.ts` | CI test: validates both hook scripts with 24 test cases covering all decision paths (allow, ask, deny) |
