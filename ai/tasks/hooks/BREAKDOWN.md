---
id: hooks.BREAKDOWN
module: hooks
priority: 3
status: pending
version: 1
origin: spec-workflow
dependsOn: []
tags: [smart-ralph, compound-engineering]
---
# Safety Hooks

## Context

The compound-engineering plugin has zero hooks -- no PreToolUse or PostToolUse safety guardrails exist. Commands like `lfg` and `slfg` chain destructive operations (git push, rm -rf) without confirmation gates. This module creates the plugin's first hooks directory with two PreToolUse bash scripts that provide safety guardrails for destructive bash commands and sensitive file edits, using the "ask" decision mode for all operations except catastrophic deletes.

## Tasks

1. **Create `hooks/` directory structure** -- Create `plugins/compound-engineering/hooks/` and `plugins/compound-engineering/hooks/scripts/` directories.

2. **Create `hooks/hooks.json`** -- Write the hook configuration file with:
   - A `description` field: "Safety guardrails for compound-engineering plugin. Prompts for confirmation before destructive operations."
   - PreToolUse matcher for `Bash` tool -> runs `validate-bash.sh`
   - PreToolUse matcher for `Write|Edit` tools -> runs `protect-env-files.sh`
   - Use `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/` for script paths
   - Timeout: 10s for bash validation, 5s for env file protection

3. **Create `hooks/scripts/validate-bash.sh`** -- Write the PreToolUse hook script that:
   - Reads JSON from stdin, extracts `tool_input.command` via `jq`
   - Pattern 1: Detects `git push --force` / `git push -f` -> returns "ask" with branch context
   - Pattern 2: Detects `git reset --hard` -> returns "ask" with warning about uncommitted changes
   - Pattern 3: Detects `rm -rf` / `rm -fr` (only these variants, not `rm -r`) -> three-tier logic:
     - Hard deny catastrophic targets: `/`, `~`, `$HOME`, `$CLAUDE_PROJECT_DIR`, `.`
     - Silent allow safe targets: `*/node_modules`, `*/.cache`, `*/tmp`, `*/__pycache__`, `*/.next`
     - Ask for everything else with target path in reason
   - All other commands: exit 0 (allow, no JSON output)
   - Uses `set -euo pipefail` for consistent error handling

4. **Create `hooks/scripts/protect-env-files.sh`** -- Write the PreToolUse hook script that:
   - Reads JSON from stdin, extracts `tool_input.file_path` via `jq`
   - Detects files matching the curated secrets pattern: `\.env($|\.)`, `\.pem$`, `\.key$`, `credentials`, `secret.*\.(json|yml|yaml)`
   - Returns "ask" with reason mentioning secrets for matching files
   - All other files: exit 0 (allow, no JSON output)
   - Empty file_path: exit 0

5. **Make hook scripts executable** -- Run `chmod +x` on both bash scripts.

6. **Verify hooks.json is discoverable** -- Confirm the file is at the path expected by the CLI's `loadHooks()` function (`hooks/hooks.json` relative to plugin root). The existing parser at `src/parsers/claude.ts:124` looks for this exact path.

7. **Test hooks locally** -- Verify hooks appear in Claude Code's `/hooks` menu as `[Plugin]` entries and fire correctly for test commands.

## Acceptance Criteria

- AC-3 (from QA): validate-bash.sh correctly handles all 14 test cases (normal commands allow, force push asks, hard reset asks, rm -rf meaningful path asks, rm -rf / denies, safe targets allow, etc.).
- AC-4 (from QA): protect-env-files.sh correctly handles all 10 test cases (.env asks, .env.local asks, .pem asks, .key asks, credentials asks, normal files allow, etc.).
- AC-12 (from QA): Hook scripts have executable permissions.
- Hooks use "ask" mode for all destructive operations (per PM Q2), never "deny" except for catastrophic `rm -rf /` / `rm -rf ~` / `rm -rf $HOME`.
- Hooks fire for all tool calls including those from subagents (per UX Q2).
- Hook scripts use only `jq` and standard bash tools -- no new dependencies.
- Hook scripts complete within their configured timeouts (10s for validate-bash.sh, 5s for protect-env-files.sh).

## Files to Create/Modify

### New Files (3)

| File | Purpose |
|------|---------|
| `plugins/compound-engineering/hooks/hooks.json` | Hook configuration -- defines PreToolUse matchers for Bash and Write/Edit tools |
| `plugins/compound-engineering/hooks/scripts/validate-bash.sh` | PreToolUse hook: validates destructive bash commands (force push, hard reset, rm -rf) |
| `plugins/compound-engineering/hooks/scripts/protect-env-files.sh` | PreToolUse hook: protects .env, .pem, .key, credentials, and secret files from unintended edits |
