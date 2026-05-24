# GitHub Copilot Spec (Agents, Skills, MCP)

Last verified: 2026-04-18

## Primary sources

```
https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli
https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference
https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-plugins
https://docs.github.com/en/copilot/reference/custom-agents-configuration
https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent
```

## Config locations

| Scope | Path |
|-------|------|
| Project agents | `.github/agents/*.agent.md` |
| Project agents (Claude-compatible) | `.claude/agents/*.md` |
| Personal agents | `~/.copilot/agents/*.agent.md` |
| Personal agents (Claude-compatible) | `~/.claude/agents/*.md` |
| Plugin agents | `agents/` by default, overridable in plugin manifest |
| Project skills | `.github/skills/*/SKILL.md` |
| Project skills (auto-discovery) | `.agents/skills/*/SKILL.md` |
| Project instructions | `.github/copilot-instructions.md` |
| Path-specific instructions | `.github/instructions/*.instructions.md` |
| Project prompts | `.github/prompts/*.prompt.md` |
| Org/enterprise agents | `.github-private/agents/*.agent.md` |
| Personal skills | `~/.copilot/skills/*/SKILL.md` |
| Personal skills (auto-discovery) | `~/.agents/skills/*/SKILL.md` |
| Directory instructions | `AGENTS.md` (nearest ancestor wins) |

## Agents (.agent.md files)

- Custom agents are Markdown files with YAML frontmatter stored in `.github/agents/`.
- File extension is `.agent.md` (or `.md`). Filenames may only contain: `.`, `-`, `_`, `a-z`, `A-Z`, `0-9`.
- The documented custom-agent extension is singular `.agent.md`, not `.agents.md`.
- `description` is the only required frontmatter field.
- Current Copilot CLI docs do not list `.agents/agents` or `~/.agents/agents` as custom-agent discovery paths. The `.agents/*` convention is documented for skills (`.agents/skills`, `~/.agents/skills`), not agents.
- Copilot CLI also loads Claude-compatible agent directories (`.claude/agents`, `~/.claude/agents`) after native Copilot agent directories and before plugin agents.
- `AGENTS.md` files are supported as custom instruction/context files, not as custom-agent profile files.

## Plugins

- Copilot CLI plugins bundle reusable agents, skills, hooks, MCP servers, and related configuration.
- Install from a registered marketplace with:

```text
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering@compound-engineering-plugin
```

- The terminal equivalents are:

```bash
copilot plugin marketplace add EveryInc/compound-engineering-plugin
copilot plugin install compound-engineering@compound-engineering-plugin
```

- Copilot CLI looks for plugin manifests at `.plugin/plugin.json`, `plugin.json`, `.github/plugin/plugin.json`, or `.claude-plugin/plugin.json`.
- Copilot CLI looks for marketplace manifests at `marketplace.json`, `.plugin/marketplace.json`, `.github/plugin/marketplace.json`, or `.claude-plugin/marketplace.json`.
- Therefore the existing repository-level `.claude-plugin/marketplace.json` and plugin-level `plugins/compound-engineering/.claude-plugin/plugin.json` are expected to be sufficient for Copilot native plugin install. Do not add a parallel `.github/plugin` surface unless Copilot requires a Copilot-only manifest field in the future.

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
| Personal (auto-discovery) | `~/.agents/skills/*/SKILL.md` |

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

1. Built-in agents
2. `~/.copilot/agents`
3. `<project>/.github/agents`
4. `<parents>/.github/agents`
5. `~/.claude/agents`
6. `<project>/.claude/agents`
7. `<parents>/.claude/agents`
8. Plugin `agents/` directories
9. Remote organization/enterprise agents

Within a repo, `AGENTS.md` files in directories provide nearest-ancestor-wins instructions.

Skills use separate first-found-wins precedence. Current docs list project `.github/skills`, `.agents/skills`, `.claude/skills`, inherited project skills, personal `~/.copilot/skills`, personal `~/.agents/skills`, personal `~/.claude/skills`, then plugin skill directories.

Skills are deduplicated by the `name` field inside `SKILL.md`, not by directory name. If a personal or project skill has the same `name` as a plugin skill, Copilot uses the first-loaded personal/project skill and silently ignores the plugin skill. For example, a stale `~/.agents/skills/ce-plan/SKILL.md` with `name: ce-plan` would shadow the native plugin's `ce-plan`; it should not show as two separate skills in Copilot CLI. Use `/skills info ce-plan` to confirm which location won.

This makes Copilot cleanup different from Codex duplicate cleanup: stale CE skills in `~/.agents/skills`, `~/.copilot/skills`, `.agents/skills`, or `.github/skills` may not create visible duplicates, but they can silently override newer plugin-provided CE skills.
