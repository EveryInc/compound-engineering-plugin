# Codex Spec (Config, Prompts, Skills, MCP)

Last verified: 2026-01-21

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

- Codex reads local settings from `~/.codex/config.toml`, shared by the CLI and IDE extension. citeturn2view0
- Configuration precedence is: CLI flags → profile values → root-level values in `config.toml` → built-in defaults. citeturn2view0
- Codex stores local state under `CODEX_HOME` (defaults to `~/.codex`) and includes `config.toml` there. citeturn4view0

## Profiles and providers

- Profiles are defined under `[profiles.<name>]` and selected with `codex --profile <name>`. citeturn4view0
- A top-level `profile = "<name>"` sets the default profile; CLI flags can override it. citeturn4view0
- Profiles are experimental and not supported in the IDE extension. citeturn4view0
- Custom model providers can be defined with base URL, wire API, and optional headers, then referenced via `model_provider`. citeturn4view0

## Custom prompts (slash commands)

- Custom prompts are Markdown files stored under `~/.codex/prompts/`. citeturn3view0
- Custom prompts require explicit invocation and aren’t shared through the repository; use skills to share or auto-invoke. citeturn3view0
- Prompts are invoked as `/prompts:<name>` in the slash command UI. citeturn3view0
- Prompt front matter supports `description:` and `argument-hint:`. citeturn3view0turn2view3
- Prompt arguments support `$1`–`$9`, `$ARGUMENTS`, and named placeholders like `$FILE` provided as `KEY=value`. citeturn2view3
- Codex ignores non-Markdown files in the prompts directory. citeturn2view3

## AGENTS.md instructions

- Codex reads `AGENTS.md` files before doing any work and builds a combined instruction chain. citeturn3view1
- Discovery order: global (`~/.codex`, using `AGENTS.override.md` then `AGENTS.md`) then project directory traversal from repo root to CWD, with override > AGENTS > fallback names. citeturn3view1
- Codex concatenates files from root down; files closer to the working directory appear later and override earlier guidance. citeturn3view1

## Skills (Agent Skills)

- A skill is a folder containing `SKILL.md` plus optional `scripts/`, `references/`, and `assets/`. citeturn3view3turn3view4
- `SKILL.md` uses YAML front matter and requires `name` and `description`. citeturn3view3turn3view4
- Required fields are single-line with length limits (name ≤ 100 chars, description ≤ 500 chars). citeturn3view4
- At startup, Codex loads only each skill’s name/description; full content is injected when invoked. citeturn3view3turn3view4
- Skills can be repo-scoped in `.agents/skills/` and are discovered from the current working directory up to the repository root. User-scoped skills live in `~/.agents/skills/`. citeturn1view1turn1view4
- Inference: some existing tooling and user setups still use `.codex/skills/` and `~/.codex/skills/` as legacy compatibility paths, but those locations are not documented in the current OpenAI Codex skills docs linked above.
- Codex also supports admin-scoped skills in `/etc/codex/skills` plus built-in system skills bundled with Codex. citeturn1view4
- Skills can be invoked explicitly using `/skills` or `$skill-name`. citeturn3view3

## MCP (Model Context Protocol)

- MCP configuration lives in `~/.codex/config.toml` and is shared by the CLI and IDE extension. citeturn3view2turn3view5
- Each server is configured under `[mcp_servers.<server-name>]`. citeturn3view5
- STDIO servers support `command` (required), `args`, `env`, `env_vars`, and `cwd`. citeturn3view5
- Streamable HTTP servers support `url` (required), `bearer_token_env_var`, `http_headers`, and `env_http_headers`. citeturn3view5
