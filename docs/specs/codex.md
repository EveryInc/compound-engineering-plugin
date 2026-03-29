# Codex Spec (Config, Prompts, Skills, MCP)

Last verified: 2026-03-23

## Primary sources

```
https://developers.openai.com/codex/config-basic
https://developers.openai.com/codex/config-advanced
https://developers.openai.com/codex/custom-prompts
https://developers.openai.com/codex/skills
https://developers.openai.com/codex/skills/create-skill
https://developers.openai.com/codex/guides/agents-md
https://developers.openai.com/codex/mcp
```

## Config location and precedence

- Codex reads local settings from `~/.codex/config.toml`, shared by the CLI and IDE extension. citeturn2view0
- Configuration precedence is: CLI flags -> profile values -> root-level values in `config.toml` -> built-in defaults. citeturn2view0
- Codex stores local state under `CODEX_HOME` (defaults to `~/.codex`) and includes `config.toml` there. citeturn4view0

## Profiles and providers

- Profiles are defined under `[profiles.<name>]` and selected with `codex --profile <name>`. citeturn4view0
- A top-level `profile = "<name>"` sets the default profile; CLI flags can override it. citeturn4view0
- Profiles are experimental and not supported in the IDE extension. citeturn4view0
- Custom model providers can be defined with base URL, wire API, and optional headers, then referenced via `model_provider`. citeturn4view0

## Custom prompts (slash commands)

- Custom prompts are Markdown files stored under `~/.codex/prompts/`. citeturn3view0
- Custom prompts require explicit invocation and aren't shared through the repository; use skills to share or auto-invoke. citeturn3view0
- Prompts are invoked as `/prompts:<name>` in the slash command UI. citeturn3view0
- Prompt front matter supports `description:` and `argument-hint:`. citeturn3view0turn2view3
- Prompt arguments support `$1`-`$9`, `$ARGUMENTS`, and named placeholders like `$FILE` provided as `KEY=value`. citeturn2view3
- Codex ignores non-Markdown files in the prompts directory. citeturn2view3

## AGENTS.md instructions

- Codex reads `AGENTS.md` files before doing any work and builds a combined instruction chain. citeturn3view1
- Discovery order: global (`~/.codex`, using `AGENTS.override.md` then `AGENTS.md`) then project directory traversal from repo root to CWD, with override > AGENTS > fallback names. citeturn3view1
- Codex concatenates files from root down; files closer to the working directory appear later and override earlier guidance. citeturn3view1

## Skills (Agent Skills)

- A skill is a folder containing `SKILL.md` plus optional `scripts/`, `references/`, and `assets/`. citeturn3view3turn3view4
- `SKILL.md` uses YAML front matter and requires `name` and `description`. citeturn3view3turn3view4
- Required fields are single-line with length limits (name <= 100 chars, description <= 500 chars). citeturn3view4
- At startup, Codex loads only each skill's name/description; full content is injected when invoked. citeturn3view3turn3view4
- Skills can be repo-scoped in `.agents/skills/` and are discovered from the current working directory up to the repository root. User-scoped skills live in `~/.agents/skills/`. citeturn1view1turn1view4
- Inference: some existing tooling and user setups still use `.codex/skills/` and `~/.codex/skills/` as legacy compatibility paths, but those locations are not documented in the current OpenAI Codex skills docs linked above.
- Codex also supports admin-scoped skills in `/etc/codex/skills` plus built-in system skills bundled with Codex. citeturn1view4
- Skills can be invoked explicitly using `/skills` or `$skill-name`. citeturn3view3

## MCP (Model Context Protocol)

- MCP configuration lives in `~/.codex/config.toml` and is shared by the CLI and IDE extension. citeturn3view2turn3view5
- Each server is configured under `[mcp_servers.<server-name>]`. citeturn3view5
- STDIO servers support `command` (required), `args`, `env`, `env_vars`, and `cwd`. citeturn3view5
- Streamable HTTP servers support `url` (required), `bearer_token_env_var`, `http_headers`, and `env_http_headers`. citeturn3view5

## Hooks

Codex supports lifecycle hooks via `hooks.json`, discovered at project level (`.codex/hooks.json`), user level (`~/.codex/hooks.json`), and system level (`/etc/codex/hooks.json`). Hooks must be enabled with `codex_hooks = true` under `[features]` in `config.toml`.

### Supported events

| Event | Scope | Capabilities | Upstream PR |
|---|---|---|---|
| PreToolUse | Shell/Bash only | Deny-only decisions; tool name hardcoded to "Bash" | [#15211](https://github.com/openai/codex/pull/15211) (merged) |
| PostToolUse | Shell/Bash only | Block + additionalContext; `updatedMCPToolOutput` rejected | [#15531](https://github.com/openai/codex/pull/15531) (draft) |
| UserPromptSubmit | All prompts | Block + additionalContext; no matchers; blocked prompts never enter history | [#14626](https://github.com/openai/codex/pull/14626) (merged) |
| SessionStart | Session lifecycle | additionalContext + should_stop/stop_reason | Exists on main |
| Stop | Session lifecycle | Fires at session end | Exists on main |

### hooks.json format

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "echo before", "timeout": 30 }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "echo prompt" }
        ]
      }
    ]
  }
}
```

### Converter behavior

- Only `command` type hooks are converted; `prompt` and `agent` types are skipped with warnings
- PreToolUse/PostToolUse matchers must be Bash-compatible (undefined, `*`, `""`, `Bash`, `^Bash$`); non-Bash matchers are skipped
- Mixed matchers (e.g. `Bash|Write`) are skipped entirely
- Wildcard matchers on tool-scoped events are normalized to `"Bash"`
- Non-tool-scoped events (UserPromptSubmit, SessionStart, Stop) omit the `matcher` field
- Unsupported events (PostToolUseFailure, PermissionRequest, Notification, SessionEnd, PreCompact, Setup, SubagentStart, SubagentStop) are skipped with warnings

### Constraints

- Only `type: "command"` hooks are supported (no `prompt` or `agent` types)
- Feature-gated behind `codex_hooks = true` in `config.toml` `[features]`
- `deny_unknown_fields` on all wire types -- extra fields cause parse failure
- Fail-open design: unsupported outputs, malformed JSON, non-zero/non-2 exit codes all resolve to "allow"
- No Windows support (entire hook system disabled)
- No async hooks (`async: true` is recognized but skipped with a warning)
- PreToolUse only supports deny decisions (allow/ask/updatedInput/additionalContext all fail open)
- Context injection uses developer messages (not user messages)
