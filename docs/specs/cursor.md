# Cursor Spec (Rules, Commands, Skills, MCP)

Last verified: 2026-02-12

## Primary sources

```
https://docs.cursor.com/context/rules
https://docs.cursor.com/context/rules-for-ai
https://docs.cursor.com/customize/model-context-protocol
```

## Config locations

| Scope | Path |
|-------|------|
| Project rules | `.cursor/rules/*.mdc` |
| Project commands | `.cursor/commands/*.md` |
| Project skills | `.cursor/skills/*/SKILL.md` |
| Project MCP | `.cursor/mcp.json` |
| Project CLI permissions | `.cursor/cli.json` |
| Global MCP | `~/.cursor/mcp.json` |
| Global CLI config | `~/.cursor/cli-config.json` |
| Legacy rules | `.cursorrules` (deprecated) |

## Rules (.mdc files)

- Rules are Markdown files with the `.mdc` extension stored in `.cursor/rules/`.
- Each rule has YAML frontmatter with three fields: `description`, `globs`, `alwaysApply`.
- Rules have four activation types based on frontmatter configuration:

| Type | `alwaysApply` | `globs` | `description` | Behavior |
|------|:---:|:---:|:---:|---|
| Always | `true` | ignored | optional | Included in every conversation |
| Auto Attached | `false` | set | optional | Included when matching files are in context |
| Agent Requested | `false` | empty | set | AI decides based on description relevance |
| Manual | `false` | empty | empty | Only included via `@rule-name` mention |

- Precedence: Team Rules > Project Rules > User Rules > Legacy `.cursorrules` > `AGENTS.md`.

## Commands (slash commands)

- Custom commands are Markdown files stored in `.cursor/commands/`.
- Commands are plain markdown with no YAML frontmatter support.
- The filename (without `.md`) becomes the command name.
- Commands are invoked by typing `/` in the chat UI.
- Commands support parameterized arguments via `$1`, `$2`, etc.

## Skills (Agent Skills)

- Skills follow the open SKILL.md standard, identical to Claude Code and Codex.
- A skill is a folder containing `SKILL.md` plus optional `scripts/`, `references/`, and `assets/`.
- `SKILL.md` uses YAML frontmatter with required `name` and `description` fields.
- Skills can be repo-scoped in `.cursor/skills/` or user-scoped in `~/.cursor/skills/`.
- At startup, only each skill's name/description is loaded; full content is injected on invocation.

## MCP (Model Context Protocol)

- MCP configuration lives in `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global).
- Each server is configured under the `mcpServers` key.
- STDIO servers support `command` (required), `args`, and `env`.
- Remote servers support `url` (required) and optional `headers`.
- Cursor infers transport type from whether `command` or `url` is present.

Example:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": { "KEY": "value" }
    }
  }
}
```

## CLI (cursor-agent)

- Cursor CLI launched August 2025 as `cursor-agent`.
- Supports interactive mode, headless mode (`-p`), and cloud agents.
- Reads `.cursor/rules/`, `.cursorrules`, and `AGENTS.md` for instructions.
- CLI permissions controlled via `.cursor/cli.json` with allow/deny lists.
- Permission tokens: `Shell(command)`, `Read(path)`, `Write(path)`, `Delete(path)`, `Grep(path)`, `LS(path)`.
