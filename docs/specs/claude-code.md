# Claude Code Plugin Spec

Last verified: 2026-07-21

## Primary sources

`docs.claude.com/en/docs/claude-code/*` now redirects to `code.claude.com/docs/en/*`; the list below uses the current locations.

```
https://code.claude.com/docs/en/plugins-reference
https://code.claude.com/docs/en/skills
https://code.claude.com/docs/en/sub-agents
https://code.claude.com/docs/en/hooks
https://code.claude.com/docs/en/mcp
https://code.claude.com/docs/en/plugin-marketplaces
```

## Plugin layout and file locations

- A plugin is a self-contained directory. Its optional manifest lives at `.claude-plugin/plugin.json`; default component locations at the plugin root include `skills/`, `commands/`, `agents/`, `output-styles/`, `themes/`, `monitors/`, `hooks/`, `bin/`, `settings.json`, `.mcp.json`, and `.lsp.json`.
- The plugin manifest belongs at `.claude-plugin/plugin.json`; component directories and runtime configuration files belong at the plugin root. A repository that is also a marketplace keeps its catalog at `.claude-plugin/marketplace.json`.
- `commands/` contains legacy flat Markdown skills. New skills should use `skills/<name>/SKILL.md`; a root `SKILL.md` also loads as a single-skill plugin when no `skills/` directory or manifest field is present.
- A root `CLAUDE.md` is not loaded as project context. Plugins contribute context through skills, agents, and hooks.

## Manifest schema (`.claude-plugin/plugin.json`)

- The manifest is optional. When present, `name` is its only required field and must be a kebab-case identifier with no spaces.
- Metadata fields are `$schema`, `displayName`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, and `defaultEnabled`.
- Component fields are `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `outputStyles`, `lspServers`, `experimental.themes`, and `experimental.monitors`. Skills, commands, agents, output styles, and themes accept paths; hooks, MCP, and LSP also accept inline objects, while monitors accept a path or inline entries. `userConfig`, `channels`, and `dependencies` configure plugin options, message channels, and plugin dependencies.
- Custom `skills` paths add to the default `skills/` scan. Custom `commands`, `agents`, `outputStyles`, `experimental.themes`, and `experimental.monitors` paths replace their defaults. Hooks, MCP, and LSP use component-specific merge rules.
- All component paths are relative to the plugin root and start with `./`; arrays can specify multiple paths.
- `version` is optional but pins update detection when set. `plugin.json` wins over a marketplace entry's version; when neither declares one, git-backed sources use their commit SHA, while npm sources and local directories outside a git repository resolve to `unknown`.
- Unknown top-level fields are ignored at runtime and reported as validation warnings; wrong field types are load errors. `claude plugin validate --strict` promotes warnings to errors.

## Commands (legacy flat skills)

- Custom commands have been merged into skills. Flat Markdown files under `commands/` remain supported and use the same frontmatter as `SKILL.md`; `skills/` is preferred because a skill directory can carry supporting files.

## Skills (`skills/<name>/SKILL.md`)

- A skill is a directory containing `SKILL.md` plus optional supporting files. Plugin skills and commands are discovered when the plugin is installed.
- Personal skills live in `~/.claude/skills/`, project skills in `.claude/skills/`, and plugin skills in `<plugin>/skills/`. Users invoke personal and project skills as `/<skill-name>`; plugin skills are namespaced as `/<plugin-name>:<skill-name>`. For plugin skills, frontmatter `name` replaces the final command segment, and the bare `/<skill-name>` alias also works unless another command already uses it.
- Every frontmatter field is optional; `description` is recommended for automatic matching. Current fields are `name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context`, `agent`, `hooks`, `paths`, and `shell`.
- By default both the user and Claude can invoke a skill. `disable-model-invocation: true` makes it manual-only and removes its description from Claude's context; `user-invocable: false` hides it from the `/` menu but does not block Claude. `allowed-tools` grants permission only for the invoking turn, while `disallowed-tools` removes tools for that turn.

## Agents (`agents/*.md`)

- Agents are Markdown files with YAML frontmatter followed by the agent's system prompt. `name` and `description` are required.
- Plugin agents support `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, and `isolation`; the only valid isolation value is `worktree`. For security, plugin agents do not support `hooks`, `mcpServers`, or `permissionMode`.
- Enabled plugin agents are available for automatic delegation and manual invocation under scoped names such as `plugin-name:agent-name`.

## Hooks (`hooks/hooks.json` or inline)

- Plugins provide hooks in `hooks/hooks.json` or inline through `plugin.json`. Configuration is organized as event -> matcher -> handler list.
- Enabled plugin hooks merge with user and project hooks. All matching handlers run in parallel, with identical handlers deduplicated.
- Supported events are `SessionStart`, `Setup`, `InstructionsLoaded`, `UserPromptSubmit`, `UserPromptExpansion`, `MessageDisplay`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`, `ElicitationResult`, and `SessionEnd`.
- Hook handler types are `command`, `http`, `mcp_tool`, `prompt`, and `agent`.
- Plugins can reference `${CLAUDE_PLUGIN_ROOT}` for the installed version, `${CLAUDE_PLUGIN_DATA}` for persistent state, and `${CLAUDE_PROJECT_DIR}` for the project root. Substitution fields vary by component.

## MCP servers

- Plugins define MCP servers in `.mcp.json` or inline under `mcpServers` in the manifest. Supported transports are stdio, HTTP, SSE, and WebSocket; SSE is deprecated in favor of HTTP.
- Stdio configurations use `command` with optional `args` and `env`. Remote configurations specify a `type` (`http`, `sse`, or `ws`) and `url`, with transport-specific fields such as `headers` and `headersHelper`.
- Plugin MCP servers start automatically when enabled and expose standard MCP tools under scoped names that include the plugin and server names.

## LSP servers

- LSP servers are defined in `.lsp.json` or inline under `lspServers`. Each server requires `command` and `extensionToLanguage`.
- Optional fields are `args`, `transport`, `env`, `initializationOptions`, `settings`, `workspaceFolder`, `startupTimeout`, `shutdownTimeout`, `restartOnCrash`, `maxRestarts`, and `diagnostics`.
- LSP plugins configure the connection but do not bundle the language-server binary; the binary must be installed separately and available on `PATH`.

## Plugin caching and path limits

- Marketplace-installed plugins are copied into versioned directories under `~/.claude/plugins/cache` rather than used in place. Each installed version is separate; orphaned versions remain for 14 days so running sessions can finish.
- Installed plugins cannot reference paths outside their copied root, so traversal such as `../shared-utils` fails after installation.
- A symlink whose target stays inside the plugin is preserved. A link to another location inside the same marketplace is dereferenced and copied into the cache; a link outside the marketplace is skipped. Local-path and `--plugin-dir` installs preserve only links whose targets remain inside the plugin.

## Marketplace schema (`.claude-plugin/marketplace.json`)

- A marketplace requires `name`, `owner`, and `plugins`; `owner.name` is required and `owner.email` is optional. Optional top-level fields include `$schema`, `description`, `version`, `metadata.pluginRoot`, `allowCrossMarketplaceDependenciesOn`, and `renames`.
- Every plugin entry requires a kebab-case `name` and a `source`. Sources can be a relative path or `github`, `url`, `git-subdir`, or `npm` objects. Relative sources normally start with `./` and resolve from the marketplace root; `metadata.pluginRoot` supplies a base directory and allows entries such as `"source": "formatter"` without that prefix.
- Plugin entries can include manifest fields plus marketplace-only `category`, `tags`, `strict`, and `relevance`; `defaultEnabled` in the marketplace takes precedence over the same manifest field.
- `strict` defaults to `true`: `plugin.json` is authoritative and the marketplace entry can add components. With `strict: false`, the marketplace entry is the whole definition, and component declarations in a present `plugin.json` are a load conflict.
