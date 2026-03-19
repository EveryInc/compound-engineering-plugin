# Kiro CLI Spec (Custom Agents, Skills, Steering, MCP, Settings)

Last verified: 2026-03-18

## Primary sources

```
https://kiro.dev/docs/cli/
https://kiro.dev/docs/cli/custom-agents/configuration-reference/
https://kiro.dev/docs/cli/skills/
https://kiro.dev/docs/cli/steering/
https://kiro.dev/docs/cli/mcp/
https://kiro.dev/docs/cli/hooks/
https://agentskills.io
```

## Config locations

- Project-level config: `.kiro/` directory at project root.
- Global config: `~/.kiro/` (agents, steering, MCP). Local overrides global; warning on name conflicts.

## Directory structure

```
.kiro/
├── agents/
│   ├── <name>.json              # Agent configuration
│   └── prompts/
│       └── <name>.md            # Agent prompt files
├── hooks/
│   ├── <name>.kiro.hook         # Hook definition (JSON)
│   └── scripts/                 # Copied hook scripts
├── skills/
│   └── <name>/
│       └── SKILL.md             # Skill definition
├── steering/
│   └── <name>.md                # Always-on context files
└── settings/
    └── mcp.json                 # MCP server configuration
```

## Custom agents (JSON config + prompt files)

- Custom agents are JSON files in `.kiro/agents/`.
- Each agent has a corresponding prompt `.md` file, referenced via `file://` URI.
- Agent config has 14 possible fields (see below).
- Agents are activated by user selection (no auto-activation).
- The converter outputs a subset of fields relevant to converted plugins.

### Agent config fields

| Field | Type | Used in conversion | Notes |
|---|---|---|---|
| `name` | string | Yes | Agent display name |
| `description` | string | Yes | Human-readable description |
| `prompt` | string or `file://` URI | Yes | System prompt or file reference |
| `tools` | string[] | Yes (`["*"]`) | Available tools |
| `resources` | string[] | Yes | `file://`, `skill://`, `knowledgeBase` URIs |
| `includeMcpJson` | boolean | Yes (`true`) | Inherit project MCP servers |
| `welcomeMessage` | string | Yes | Agent switch greeting |
| `mcpServers` | object | No | Per-agent MCP config (use includeMcpJson instead) |
| `toolAliases` | Record | No | Tool name remapping |
| `allowedTools` | string[] | No | Auto-approve patterns |
| `toolsSettings` | object | No | Per-tool configuration |
| `hooks` | object | No | Per-agent hooks field (not used — hooks are converted to standalone `.kiro.hook` files in `.kiro/hooks/` instead) |
| `model` | string | No | Model selection |
| `keyboardShortcut` | string | No | Quick-switch shortcut |

### Example agent config

```json
{
  "name": "security-reviewer",
  "description": "Reviews code for security vulnerabilities",
  "prompt": "file://./prompts/security-reviewer.md",
  "tools": ["*"],
  "resources": [
    "file://.kiro/steering/**/*.md",
    "skill://.kiro/skills/**/SKILL.md"
  ],
  "includeMcpJson": true,
  "welcomeMessage": "Switching to security-reviewer. Reviews code for security vulnerabilities"
}
```

## Skills (SKILL.md standard)

- Skills follow the open [Agent Skills](https://agentskills.io) standard.
- A skill is a folder containing `SKILL.md` plus optional supporting files.
- Skills live in `.kiro/skills/`.
- `SKILL.md` uses YAML frontmatter with `name` and `description` fields.
- Kiro activates skills on demand based on description matching.
- The `description` field is critical — Kiro uses it to decide when to activate the skill.

### Constraints

- Skill name: max 64 characters, pattern `^[a-z][a-z0-9-]*$`, no consecutive hyphens (`--`).
- Skill description: max 1024 characters.
- Skill name must match parent directory name.

### Example

```yaml
---
name: workflows-plan
description: Plan work by analyzing requirements and creating actionable steps
---

# Planning Workflow

Detailed instructions...
```

## Steering files

- Markdown files in `.kiro/steering/`.
- Always loaded into every agent session's context.
- Equivalent to Claude Code's CLAUDE.md.
- Used for project-wide instructions, coding standards, and conventions.

## MCP server configuration

- MCP servers are configured in `.kiro/settings/mcp.json`.
- Supports both **stdio** (`command` + `args` + `env`) and **remote** (`url` + optional `headers`) transports.
- The converter handles both transport types and merges with existing config (with backup).

### Example

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-playwright"]
    },
    "context7": {
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

## Hooks

- Kiro hooks are **standalone `.kiro.hook` files** in `.kiro/hooks/`.
- They are independent of agents — not embedded in agent JSON configs.
- Each `.kiro.hook` file is a JSON object with `enabled`, `name`, `description`, `version`, `when`, and `then` fields.

### Hook trigger types (`when.type`)

| Kiro `when.type` | Claude Code equivalent | Notes |
|---|---|---|
| `preToolUse` | `PreToolUse` | 1:1. Uses `toolTypes` array for matching. |
| `postToolUse` | `PostToolUse` | 1:1. Uses `toolTypes` array for matching. |
| `agentStop` | `Stop` | 1:1. No `toolTypes` needed. |
| `promptSubmit` | `UserPromptSubmit` | 1:1. No `toolTypes` needed. |
| `agentSpawn` | — | No Claude Code equivalent. |

### Hook action types (`then.type`)

| Kiro `then.type` | Claude Code equivalent | Notes |
|---|---|---|
| `runCommand` | `command` | Direct mapping. `command` field. |
| `askAgent` | `prompt` / `agent` | `prompt` maps directly. `agent` converted lossily to askAgent with agent description. |

### `.kiro.hook` file schema

```json
{
  "enabled": true,
  "name": "Human-readable name",
  "description": "What the hook does",
  "version": "1",
  "when": {
    "type": "postToolUse",
    "toolTypes": ["write"]
  },
  "then": {
    "type": "runCommand",
    "command": "./scripts/validate.sh",
    "timeout": 120
  }
}
```

### Tool type mapping (Claude → Kiro `toolTypes`)

| Claude Matcher | Kiro toolType |
|---|---|
| `Bash` | `shell` |
| `Read` | `read` |
| `Write` | `write` |
| `Edit` | `write` |
| `Glob` | `read` |
| `Grep` | `read` |
| `WebFetch` | `web` |
| `Task` | `*` (wildcard) |
| `*` (wildcard) | omit `toolTypes` (matches all) |

Pipe-separated matchers (`Write|Edit`) are deduplicated (both map to `write`).

### Conversion notes

- 4 of 10+ Claude Code hook events map to Kiro (PreToolUse, PostToolUse, Stop, UserPromptSubmit). Unsupported events are skipped with a warning.
- All 3 Claude hook types convert: `command` → `runCommand`, `prompt` → `askAgent`, `agent` → `askAgent` (lossy).
- Plugin scripts referencing `$CLAUDE_PLUGIN_ROOT` convert to `askAgent` (not `runCommand`) because Kiro `runCommand` doesn't pipe stdin context. Scripts are copied to `.kiro/hooks/scripts/` for the agent to read.
- `$CLAUDE_PROJECT_DIR` in commands is rewritten to relative paths.
- Inline commands (no env var refs) stay as `runCommand`.
- `timeout` values map to the `then.timeout` field on `runCommand` hooks (seconds). `0` = disabled (Kiro default is 60s).
- Hook file names are prefixed with the plugin slug to prevent collisions between plugins (e.g. `aws-serverless-post-tool-use-write-0.kiro.hook`).

## Conversion lossy mappings

| Claude Code Feature | Kiro Status | Notes |
|---|---|---|
| `Edit` tool (surgical replacement) | Degraded -> `write` (full-file) | Kiro write overwrites entire files |
| `context: fork` | Lost | No execution isolation control |
| `!`command`` dynamic injection | Lost | No pre-processing of markdown |
| `disable-model-invocation` | Lost | No invocation control |
| `allowed-tools` per skill | Lost | No tool permission scoping per skill |
| `$ARGUMENTS` interpolation | Lost | No structured argument passing |
| Claude hooks | Converted (4/10+ events, all 3 types) | PreToolUse, PostToolUse, Stop, UserPromptSubmit map 1:1. `agent` type lossy → `askAgent`. |
| HTTP MCP servers | Converted | Kiro supports both `stdio` and remote (`url`) transports |

## Overwrite behavior during conversion

| Content Type | Strategy | Rationale |
|---|---|---|
| Generated agents (JSON + prompt) | Overwrite | Generated, not user-authored |
| Generated skills (from commands) | Overwrite | Generated, not user-authored |
| Copied skills (pass-through) | Overwrite | Plugin is source of truth |
| Steering files | Overwrite | Generated from CLAUDE.md |
| `mcp.json` | Merge with backup | User may have added their own servers |
| Hook files (`.kiro.hook`) | Overwrite | Generated, not user-authored |
| Hook scripts | Overwrite | Copied from plugin source |
| User-created agents/skills | Preserved | Don't delete orphans |
