# KiloCode CLI Spec (Agents, Skills, MCP)

Last verified: 2026-03-19

## Primary sources

```
https://docs.kilocode.ai
https://docs.kilocode.ai/agents
https://docs.kilocode.ai/skills
https://docs.kilocode.ai/mcp
```

## Config locations

- Project-level config: `.kilocode/` directory at project root.
- User-level config: `~/.kilocode/` for global settings.
- Main config file: `kilo.json` (project) or `~/.kilocode/kilo.json` (user).

## Directory structure

```
.kilocode/
├── kilo.json                    # Main config (MCP servers, settings)
├── agents/
│   └── <name>.md                # Agent definitions with YAML frontmatter
└── skills/
    └── <name>/
        └── SKILL.md             # Skill definition
```

## Agents (Markdown with frontmatter)

- Agents are `.md` files in `.kilocode/agents/` (or `~/.kilocode/agents/`).
- YAML frontmatter defines agent metadata.
- KiloCode supports `mode: "primary" | "subagent" | "all"` to control agent activation.
- The converter outputs agents with mode set via `options.agentMode`.

### Agent frontmatter fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string | Yes | Human-readable description |
| `mode` | string | Yes | `"primary"`, `"subagent"`, or `"all"` |
| `model` | string | No | Model selection (e.g., `anthropic/claude-sonnet-4-20250514`) |
| `permission` | object | No | Edit/bash permissions (`allow` or `deny`) |

### Example agent

```yaml
---
description: Reviews code for security vulnerabilities
mode: subagent
model: anthropic/claude-sonnet-4-20250514
permission:
  edit: deny
  bash: deny
---

# Security Reviewer

You are a security-focused code reviewer...
```

## Skills (SKILL.md standard)

- Skills follow the open [Agent Skills](https://agentskills.io) standard.
- A skill is a folder containing `SKILL.md` plus optional supporting files.
- Skills live in `.kilocode/skills/` (project) or `~/.kilocode/skills/` (user).
- `SKILL.md` uses YAML frontmatter with `name` and `description` fields.

### Constraints

- Skill name: pattern `^[a-z][a-z0-9-]*$`.
- Skill description: used for skill activation matching.

### Example

```yaml
---
name: workflows-plan
description: Plan work by analyzing requirements and creating actionable steps
---

# Planning Workflow

Detailed instructions...
```

## MCP server configuration

- MCP servers are configured in `kilo.json` under the `mcp` key.
- Both stdio (`local`) and HTTP/SSE (`remote`) transports are supported.
- `mcpServers` key from Claude Code is renamed to `mcp`.
- Command is an array instead of string + args.

### MCP server fields

| Field | Type | Notes |
|---|---|---|
| `type` | string | `"local"` (stdio) or `"remote"` (HTTP/SSE) |
| `enabled` | boolean | Whether server is active |
| `command` | string[] | For local: command array (e.g., `["npx", "-y", "@anthropic/mcp-server"]`) |
| `environment` | object | For local: environment variables |
| `url` | string | For remote: server URL |
| `headers` | object | For remote: HTTP headers |

### Example

```json
{
  "mcp": {
    "playwright": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "-y", "@anthropic/mcp-playwright"],
      "environment": {
        "DEBUG": "1"
      }
    },
    "remote-server": {
      "type": "remote",
      "enabled": true,
      "url": "https://mcp.example.com/api",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  }
}
```

## Hooks

- KiloCode does not currently support hooks in the same way as Claude Code.
- The converter emits a warning when hooks are present and skips them.

## Conversion mappings

| Claude Code Feature | KiloCode Status | Notes |
|---|---|---|
| Agents | Converted | Frontmatter with `mode`, `description`, `model`, `permission` |
| Skills | Pass-through | SKILL.md format is compatible |
| Commands | Lost | No direct equivalent; consider creating skills |
| MCP servers (stdio) | Converted | `command` + `args` → `command` array, `env` → `environment` |
| MCP servers (http) | Converted | `url` + `headers` preserved as `remote` type |
| Hooks | Skipped | Not supported; warning emitted |
| `allowed-tools` | Lost | No tool permission scoping per agent |

## Overwrite behavior during conversion

| Content Type | Strategy | Rationale |
|---|---|---|
| Generated agents | Overwrite | Generated, not user-authored |
| Copied skills (pass-through) | Overwrite | Plugin is source of truth |
| `kilo.json` | Merge with backup | User may have added their own servers |
| User-created agents/skills | Preserved | Don't delete orphans |
