# Kimi Code CLI Spec (Config, Skills, Commands, Agents, MCP, Hooks)

Last verified: 2026-06-24

## Product note: Kimi Code CLI vs. legacy kimi-cli

The `kimi` target writes for **Kimi Code CLI**, the current terminal agent
installed via `curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash`
or `npm install -g @moonshot-ai/kimi-code` (binary name `kimi`). It is the
successor to the older Python **kimi-cli** (`MoonshotAI/kimi-cli`, docs at
`moonshotai.github.io/kimi-cli`), which used `~/.kimi` and a different set of
built-in tool names (`Shell`, `WriteFile`, `StrReplaceFile`, ...). Installing
Kimi Code CLI migrates the old config and renames the legacy binary to
`kimi-legacy`. Target this current product, not the legacy one.

## Primary sources

```
https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/config-files.html
https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html
https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html
https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html
https://www.kimi.com/code/docs/en/kimi-code-cli/reference/tools.html
https://github.com/MoonshotAI/kimi-cli  (legacy; "evolving into Kimi Code CLI")
```

## Config location and format

- The main config file is `~/.kimi-code/config.toml` (TOML), created on first run.
- `KIMI_CODE_HOME` overrides the data root (config becomes `$KIMI_CODE_HOME/config.toml`).
- The installer's `KIMI_INSTALL_DIR` (default `$HOME/.kimi-code`) governs where the binary lands; the converter writes the data root, defaulting to `$KIMI_CODE_HOME` or `~/.kimi-code`, overridable with `--kimi-home`.

## Skills (Agent Skills)

- A skill is a directory containing `SKILL.md` (YAML front matter + Markdown body). Front-matter fields include `name`, `description`, `type` (`prompt` default, `inline`, `flow`), `whenToUse`, `disableModelInvocation`, and `arguments` (exposed as `$<name>` placeholders). Open Agent Skills format — compatible with Claude and Codex skill bodies.
- User-level discovery scans `$KIMI_CODE_HOME/skills/` (default `~/.kimi-code/skills/`) and `~/.agents/skills/`. Project-level discovery scans `.kimi-code/skills/` and `.agents/skills/` relative to the working directory; project entries override user entries.
- Unlike legacy kimi-cli, Kimi Code CLI does **not** scan `~/.claude/skills/` or `~/.codex/skills/`. An existing Claude Code install is therefore not auto-discovered; the converter writes skills into the Kimi Code root.
- Skills are scanned at the skills **root** (`<name>/SKILL.md`), so a per-plugin subdirectory is not discovered. The converter writes CE skills **flat** at `~/.kimi-code/skills/<name>/SKILL.md` and tracks managed names in `~/.kimi-code/<plugin>/install-manifest.json` for safe upgrade cleanup. A target name that collides with an unmanaged (foreign) directory is moved aside to a timestamped backup, never overwritten.

## Commands (slash invocation)

- Kimi Code CLI has no custom-command-file mechanism. The closest equivalent is `/skill:<name>`, which loads a skill's `SKILL.md` as a prompt (optionally with trailing argument text). `flow`-type skills run as flows.
- The converter maps Claude commands (those without `disableModelInvocation`) to skills, and rewrites known `/command` references in converted content to `/skill:<name>`.

## Agents and subagents

- There is no auto-discovered agent directory whose format maps cleanly from Claude agents. The converter renders Claude agent personas as **skills** (invoked via `/skill:<name>`) rather than native Kimi agents.

## MCP (Model Context Protocol)

- MCP servers live in `~/.kimi-code/mcp.json` (or `$KIMI_CODE_HOME/mcp.json`), in the standard `{ "mcpServers": { ... } }` format. Entries with a `command` field are stdio servers (`command`/`args`/`env`/`cwd`); entries with a `url` field are HTTP servers (`url`/`headers`, optional `transport = "sse"` for legacy SSE). Project-level `.kimi-code/mcp.json` overrides user-level.
- The converter deep-merges CE servers into `mcp.json`, preserves user-owned keys, and removes previously-written keys recorded in the install manifest.

## Hooks

- Hooks are a `[[hooks]]` array in `~/.kimi-code/config.toml`. Fields: `event` (required), `command` (required, receives JSON on stdin), `matcher` (optional regex; empty matches all), `timeout` (optional, 1-600s, default 30s, fail-open). Exit code `0` allows, `2` blocks; only `PreToolUse`, `Stop`, and `UserPromptSubmit` can block.
- Events: `UserPromptSubmit`, `PreToolUse`, `Stop`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionResult`, `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `StopFailure`, `Interrupt`, `PreCompact`, `PostCompact`, `Notification`.
- Tool-name matchers largely match Claude's: `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `WebSearch` are identical and pass through unchanged. Only a few differ: `WebFetch -> FetchURL`, `Task -> Agent`, `TodoWrite -> TodoList`, `MultiEdit -> Edit`. The converter emits only command-type hooks (prompt/agent hooks are skipped), drops unsupported events, and wraps its `[[hooks]]` entries in a managed marker block so user config is preserved.
