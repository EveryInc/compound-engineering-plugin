# Kimi CLI Spec (Config, Skills, Commands, Agents, MCP, Hooks)

Last verified: 2026-06-24

## Primary sources

```
https://github.com/MoonshotAI/kimi-cli
https://moonshotai.github.io/kimi-cli/en/configuration/config-files.html
https://moonshotai.github.io/kimi-cli/en/customization/mcp.html
https://moonshotai.github.io/kimi-cli/en/customization/skills.html
https://moonshotai.github.io/kimi-cli/en/customization/agents.html
https://moonshotai.github.io/kimi-cli/en/customization/hooks.html
https://moonshotai.github.io/kimi-cli/en/customization/plugins.html
```

## Config location and format

- The main config file is `~/.kimi/config.toml` (TOML; JSON is also accepted, and `~/.kimi/config.json` is auto-migrated to TOML). On first run Kimi creates a default config.
- Alternate config via `--config-file` / `--config`. Runtime data location is governed separately by `KIMI_SHARE_DIR` and does **not** affect skills discovery.
- `KIMI_HOME` is not a documented Kimi env var; the converter uses it only to let users override the output root (default `~/.kimi`).

## Skills (Agent Skills)

- A skill is a directory containing `SKILL.md`, optionally with `scripts/`, `references/`, `assets/`. A single flat `<name>.md` is also recognized (name = filename).
- `SKILL.md` uses YAML front matter; all fields are optional: `name` (1-64 chars, lowercase/digits/hyphens; defaults to dir name), `description` (1-1024 chars), `license`, `compatibility`, `metadata`. Open Agent Skills format — compatible with Claude and Codex.
- User-level discovery scans a **brand group** (first existing of `~/.kimi/skills/`, `~/.claude/skills/`, `~/.codex/skills/`) and a generic group (`~/.config/agents/skills/` or `~/.agents/skills/`). With `merge_all_available_skills = true` (default) all existing brand dirs are merged (priority kimi > claude > codex).
- Project-level discovery mirrors this relative to the repo root (nearest `.git`): `.kimi/skills/`, `.claude/skills/`, `.codex/skills/`, `.agents/skills/`. Extra dirs via `--skills-dir` or `extra_skill_dirs`.
- Because Kimi natively reads `~/.claude/skills/`, an existing Claude Code CE install surfaces in Kimi with no conversion.
- Skills are scanned at the skills **root** (`<name>/SKILL.md`), so a per-plugin subdirectory is not discovered. The converter therefore writes CE skills **flat** at `~/.kimi/skills/<name>/SKILL.md` and tracks managed names in `~/.kimi/<plugin>/install-manifest.json` for safe upgrade cleanup.

## Commands (slash invocation)

- Kimi has no custom-command-file mechanism. The closest equivalent is `/skill:<name>`, which loads a skill's `SKILL.md` as a prompt (optionally with trailing argument text). `/flow:<name>` runs flow-type skills.
- The converter maps Claude commands (those without `disableModelInvocation`) to skills, and rewrites known `/command` references in converted content to `/skill:<name>`.

## Agents and subagents

- Custom agents are YAML files loaded via `--agent-file`; tools are Python `module:ClassName` paths; subagents nest inside the YAML. There is no auto-discovered agent directory, and Claude tool names do not map to Kimi tool classes.
- `${KIMI_AGENTS_MD}` merges `AGENTS.md` from project root to CWD (including `.kimi/AGENTS.md`) into the system prompt.
- Given the low fidelity of YAML agent conversion, the converter renders Claude agent personas as **skills** (invoked via `/skill:<name>`) rather than Kimi YAML agents.

## MCP (Model Context Protocol)

- MCP servers live in `~/.kimi/mcp.json`, in the standard `{ "mcpServers": { ... } }` format (Claude-compatible). stdio servers use `command`/`args`/`env`; HTTP servers use `url`/`headers`. Managed via `kimi mcp add|list|remove|test`.
- The converter deep-merges CE servers into `mcp.json`, preserves user-owned keys, and removes previously-written keys recorded in the install manifest.

## Hooks (Beta)

- Hooks are defined as a `[[hooks]]` array in `~/.kimi/config.toml`. Fields: `event` (required), `command` (required, receives JSON on stdin), `matcher` (optional regex; empty matches all), `timeout` (optional, default 30s, fail-open).
- 13 events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `Stop`, `StopFailure`, `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `Notification`.
- Tool-name matchers differ from Claude (`WriteFile`, `StrReplaceFile`, `ReadFile`, `Shell`, `FetchURL`, `SearchWeb`, `Agent`, `SetTodoList`, ...). The converter emits only command-type hooks (prompt/agent hooks are skipped), remaps matcher tokens to Kimi names, drops unsupported events, and wraps its `[[hooks]]` entries in a managed marker block so user config is preserved.
