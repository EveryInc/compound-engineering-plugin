# GitHub Copilot Spec (Agents, Skills, MCP)

Last verified: 2026-02-14

## Primary sources

```
https://docs.github.com/en/copilot/reference/custom-agents-configuration
https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent
```

## Config locations

| Scope | Path |
|-------|------|
| Project agents | `.github/agents/*.agent.md` |
| Project skills | `.github/skills/*/SKILL.md` |
| Project instructions | `.github/copilot-instructions.md` |
| Path-specific instructions | `.github/instructions/*.instructions.md` |
| Project prompts | `.github/prompts/*.prompt.md` |
| Org/enterprise agents | `.github-private/agents/*.agent.md` |
| Personal skills | `~/.copilot/skills/*/SKILL.md` |
| Directory instructions | `AGENTS.md` (nearest ancestor wins) |

## Agents (.agent.md files)

- Custom agents are Markdown files with YAML frontmatter stored in `.github/agents/`.
- File extension is `.agent.md` (or `.md`). Filenames may only contain: `.`, `-`, `_`, `a-z`, `A-Z`, `0-9`.
- `description` is the only required frontmatter field.

### Frontmatter fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | No | Derived from filename | Display name |
| `description` | **Yes** | — | What the agent does |
| `tools` | No | `["*"]` | Tool access list. `[]` disables all tools. |
| `target` | No | both | `vscode`, `github-copilot`, or omit for both |
| `infer` | No | `true` | Auto-select based on task context |
| `model` | No | Platform default | AI model (works in IDE, may be ignored on github.com) |
| `mcp-servers` | No | — | MCP config (org/enterprise agents only) |
| `metadata` | No | — | Arbitrary key-value annotations |

### Character limit

Agent body content is limited to **30,000 characters**.

### Tool names

| Name | Aliases | Purpose |
|------|---------|---------|
| `execute` | `shell`, `Bash` | Run shell commands |
| `read` | `Read` | Read files |
| `edit` | `Edit`, `Write` | Modify files |
| `search` | `Grep`, `Glob` | Search files |
| `agent` | `Task` | Invoke other agents |
| `web` | `WebSearch`, `WebFetch` | Web access |

## Skills (SKILL.md)

- Skills follow the open SKILL.md standard (same format as Claude Code and Cursor).
- A skill is a directory containing `SKILL.md` plus optional `scripts/`, `references/`, and `assets/`.
- YAML frontmatter requires `name` and `description` fields.
- Skills are loaded on-demand when Copilot determines relevance.

### Discovery locations

| Scope | Path |
|-------|------|
| Project | `.github/skills/*/SKILL.md` |
| Project (Claude-compatible) | `.claude/skills/*/SKILL.md` |
| Project (auto-discovery) | `.agents/skills/*/SKILL.md` |
| Personal | `~/.copilot/skills/*/SKILL.md` |

## MCP (Model Context Protocol)

- MCP configuration is set via **Repository Settings > Copilot > Coding agent > MCP configuration** on GitHub.
- Repository-level agents **cannot** define MCP servers inline; use repository settings instead.
- Org/enterprise agents can embed MCP server definitions in frontmatter.
- All env var names must use the `COPILOT_MCP_` prefix.
- Only MCP tools are supported (not resources or prompts).

### Config structure

```json
{
  "mcpServers": {
    "server-name": {
      "type": "local",
      "command": "npx",
      "args": ["package"],
      "tools": ["*"],
      "env": {
        "API_KEY": "COPILOT_MCP_API_KEY"
      }
    }
  }
}
```

### Server types

| Type | Fields |
|------|--------|
| Local/stdio | `type: "local"`, `command`, `args`, `tools`, `env` |
| Remote/SSE | `type: "sse"`, `url`, `tools`, `headers` |

## Prompts (.prompt.md)

- Reusable prompt files stored in `.github/prompts/`.
- Available in VS Code, Visual Studio, and JetBrains IDEs only (not on github.com).
- Invoked via `/promptname` in chat.
- Support variable syntax: `${input:name}`, `${file}`, `${selection}`.

## Precedence

1. Repository-level agents
2. Organization-level agents (`.github-private`)
3. Enterprise-level agents (`.github-private`)

Within a repo, `AGENTS.md` files in directories provide nearest-ancestor-wins instructions.
