# Hook Scripts

This directory contains scripts for Claude Code hooks that enable automatic validation and linting.

## Available Scripts

### `lint-on-edit.sh`
**Type:** PostToolUse hook
**Trigger:** After Edit or Write operations
**Purpose:** Auto-runs appropriate linter based on file extension

Supports:
- TypeScript/JavaScript: ESLint + Prettier
- Python: Ruff or Black
- CSS/SCSS: Prettier
- JSON: Prettier

**Used by agents:**
- `senior-typescript-reviewer`
- `senior-python-reviewer`
- `code-simplicity-reviewer`

### `validate-yaml-frontmatter.sh`
**Type:** PreToolUse hook
**Trigger:** Before Write operations to `docs/solutions/`
**Purpose:** Validates YAML frontmatter against schema before writing

Validates:
- Required fields: module, date, problem_type, component, symptoms, root_cause, resolution_type, severity
- Enum values for problem_type, component, severity
- Date format (YYYY-MM-DD)

**Exit codes:**
- `0` = Allow (validation passed or not a docs/solutions file)
- `2` = Block (validation failed, error message passed to Claude)

**Used by skills:**
- `compound-docs`

### `run-tests-after-review.sh`
**Type:** SubagentStop hook (project-level)
**Trigger:** After review agents complete
**Purpose:** Auto-runs test suite after code review

Detects project type and runs:
- Node.js: `npm test`
- Python: `pytest` or `unittest`
- Rust: `cargo test`
- Go: `go test ./...`

## Enabling SubagentStop Hook

The `run-tests-after-review.sh` script requires a project-level hook in your `settings.json`.

Add this to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "senior-typescript-reviewer|senior-python-reviewer|code-simplicity-reviewer|security-sentinel|architecture-strategist",
        "hooks": [
          {
            "type": "command",
            "command": "./plugins/compound-engineering/scripts/run-tests-after-review.sh"
          }
        ]
      }
    ]
  }
}
```

Or add it globally in `~/.claude/settings.json` to apply to all projects.

## How Hooks Work

1. **PreToolUse hooks** run before a tool executes
   - Exit 0 = allow the operation
   - Exit 2 = block the operation (stderr message shown to Claude)

2. **PostToolUse hooks** run after a tool completes
   - Always advisory (exit 0)
   - Used for linting, formatting, notifications

3. **SubagentStop hooks** run when a subagent finishes
   - Project-level only (in settings.json)
   - Used for cleanup, final validation, test runs

## Hook Input Format

Hooks receive JSON via stdin with tool information:

```json
{
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "content": "file contents..."
  }
}
```

Use `jq` to parse:
```bash
FILE_PATH=$(cat | jq -r '.tool_input.file_path // empty')
```
