# OpenCode Spec (Config, Agents, Plugins)

Last verified: 2026-04-19

## Primary sources

```
https://opencode.ai/docs/config/
https://opencode.ai/docs/tools
https://opencode.ai/docs/permissions
https://opencode.ai/docs/plugins/
https://opencode.ai/docs/agents/
https://opencode.ai/docs/commands/
https://opencode.ai/docs/skills
https://opencode.ai/config.json
```

## Config files and precedence

- OpenCode supports JSON and JSONC configs.
- Config sources are merged rather than replaced, with global and project config both participating in the final config.
- Global config is stored at `~/.config/opencode/opencode.json`, and project config is `opencode.json` in the project root.
- Custom config file and directory can be provided via `OPENCODE_CONFIG` and `OPENCODE_CONFIG_DIR`.
- The `.opencode` and `~/.config/opencode` directories use plural subdirectory names (`agents/`, `commands/`, `modes/`, `plugins/`, `skills/`, `tools/`, `themes/`).

## Core config keys

- `model` and `small_model` set the primary and lightweight models; `provider` configures provider options.
- `tools` is still supported but deprecated as of OpenCode v1.1.1; permissions are now the canonical control surface.
- `permission` controls tool approvals and can be configured globally or per tool, including pattern-based rules.
- `mcp`, `instructions`, `disabled_providers`, `enabled_providers`, and `plugin` are supported config sections.
- `plugin` can list npm packages to load at startup.
- `skills.paths` and `skills.urls` can add extra skill discovery locations, but CE should not depend on them until the layout is smoke-tested locally with OpenCode.

## Tools

- OpenCode ships with built-in tools, and permissions determine whether each tool runs automatically, requires approval, or is denied.
- Tools are enabled by default; permissions provide the gating mechanism.

## Permissions

- Permissions resolve to `allow`, `ask`, or `deny` and can be configured globally or per tool, with pattern-based rules.
- Defaults are permissive, with special cases such as `.env` file reads.
- Agent-level permissions override the global permission block.

## Agents

- Agents can be configured in `opencode.json` or as markdown files in `~/.config/opencode/agents/` or `.opencode/agents/`.
- Agent config supports `mode`, `model`, `variant`, `temperature`, `top_p`, `hidden`, `steps`, `options`, `permission`, and other schema fields. `tools` still exists but is deprecated.
- `mode` can be `primary`, `subagent`, or `all`; omitted mode defaults to `all`.
- `hidden: true` hides subagents from the `@` autocomplete menu.
- `permission.task` controls which subagents an agent may invoke.
- Model IDs use the `provider/model-id` format.

## Skills

- Skills are reusable `SKILL.md` definitions loaded on demand through OpenCode's native `skill` tool.
- OpenCode searches direct child skill directories in its built-in roots:
  - `.opencode/skills/<name>/SKILL.md`
  - `~/.config/opencode/skills/<name>/SKILL.md`
  - `.claude/skills/<name>/SKILL.md`
  - `~/.claude/skills/<name>/SKILL.md`
  - `.agents/skills/<name>/SKILL.md`
  - `~/.agents/skills/<name>/SKILL.md`
- The config schema also exposes `skills.paths` and `skills.urls` for extra skill sources. Do not switch CE to those until tested against a local OpenCode install; direct `~/.config/opencode/skills/<name>/SKILL.md` remains the stable writer shape.
- Skill frontmatter recognizes `name`, `description`, `license`, `compatibility`, and `metadata`; unknown fields are ignored.
- Skill names must be lowercase alphanumeric with single hyphen separators and must match the directory name.

## Commands

- Commands can be configured in `opencode.json` or as Markdown files in `~/.config/opencode/commands/` or `.opencode/commands/`.
- Markdown command frontmatter can include fields such as `description`, `agent`, `model`, and `subtask`; the body becomes the prompt template.
- If a command targets an agent whose mode is `subagent`, OpenCode invokes it as a subagent by default. `subtask: true` can force subagent invocation.

## Plugins and events

- Local plugins are loaded from `.opencode/plugins/` and `~/.config/opencode/plugins/`. npm plugins can be listed in `plugin` in `opencode.json`.
- Plugins are JavaScript/TypeScript modules. Each exported plugin function receives OpenCode context and returns hooks/event handlers.
- Local plugins and custom tools can use npm dependencies declared in a `package.json` in the OpenCode config directory; OpenCode runs `bun install` at startup.

## Notes for this repository

- The current documented global CE install root should stay `~/.config/opencode`, not `~/.agents`, to avoid conflicts with harnesses that also read `~/.agents`.
- The current CE writer shape is still appropriate in April 2026:
  - `~/.config/opencode/opencode.json`
  - `~/.config/opencode/agents/*.md`
  - `~/.config/opencode/commands/*.md` only when a source plugin ships commands
  - `~/.config/opencode/plugins/*.ts`
  - `~/.config/opencode/skills/*/SKILL.md`
- OpenCode's plugin system is useful for JS/TS hooks and custom tools, but current docs do not describe a native marketplace command that consumes CE's `.claude-plugin/marketplace.json` and installs the full skills/agents/commands payload.
- Keep the custom Bun writer until OpenCode documents a native distribution path for packaged skills and agents.
- The `compound-engineering` plugin currently emits skills and subagent Markdown files for OpenCode. It should not emit deprecated `tools` config; permission config is enough for non-default permission modes.
