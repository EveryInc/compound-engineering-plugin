# Kiro CLI Spec (Custom Agents, Skills, Steering, MCP, Settings)

Last verified: 2026-02-17

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
- No global/user-level config directory — all config is project-scoped.

## Directory structure

```
.kiro/
├── agents/
│   ├── <name>.json              # Agent configuration
│   └── prompts/
│       └── <name>.md            # Agent prompt files
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
| `hooks` | object | No (future work) | 5 trigger types |
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
- **Only stdio transport is supported** — `command` + `args` + `env`.
- HTTP/SSE transport (`url`, `headers`) is NOT supported by Kiro CLI.
- The converter skips HTTP-only MCP servers with a warning.

### Example

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-playwright"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp-server"]
    }
  }
}
```

## Hooks

- Kiro supports 5 hook trigger types: `agentSpawn`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `stop`.
- Hooks are configured inside agent JSON configs (not separate files).
- 3 of 5 triggers map to Claude Code hooks (`preToolUse`, `postToolUse`, `stop`).
- Not converted by the plugin converter for MVP — a warning is emitted.

## Conversion lossy mappings

| Claude Code Feature | Kiro Status | Notes |
|---|---|---|
| `Edit` tool (surgical replacement) | Degraded -> `write` (full-file) | Kiro write overwrites entire files |
| `context: fork` | Lost | No execution isolation control |
| `!`command`` dynamic injection | Lost | No pre-processing of markdown |
| `disable-model-invocation` | Lost | No invocation control |
| `allowed-tools` per skill | Lost | No tool permission scoping per skill |
| `$ARGUMENTS` interpolation | Lost | No structured argument passing |
| Claude hooks | Skipped | Future follow-up (near-1:1 for 3/5 triggers) |
| HTTP MCP servers | Skipped | Kiro only supports stdio transport |

## Overwrite behavior during conversion

| Content Type | Strategy | Rationale |
|---|---|---|
| Generated agents (JSON + prompt) | Overwrite | Generated, not user-authored |
| Generated skills (from commands) | Overwrite | Generated, not user-authored |
| Copied skills (pass-through) | Overwrite | Plugin is source of truth |
| Steering files | Overwrite | Generated from CLAUDE.md |
| `mcp.json` | Merge with backup | User may have added their own servers |
| User-created agents/skills | Preserved | Don't delete orphans |
