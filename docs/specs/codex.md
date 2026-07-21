# Codex Spec (Config, Prompts, Skills, Subagents, MCP)

Last verified: 2026-07-21

## Primary sources

`developers.openai.com/codex/*` now 308-redirects to `learn.chatgpt.com/docs/*`; the list below reflects the current locations.

```
https://learn.chatgpt.com/docs/config-file/config-basic
https://learn.chatgpt.com/docs/config-file/config-advanced
https://learn.chatgpt.com/docs/custom-prompts
https://learn.chatgpt.com/docs/build-skills
https://learn.chatgpt.com/docs/build-skills#create-a-skill
https://learn.chatgpt.com/docs/agent-configuration/subagents
https://learn.chatgpt.com/docs/agent-configuration/agents-md
https://learn.chatgpt.com/docs/extend/mcp?surface=cli
```

## Config location and precedence

- Codex reads local settings from `~/.codex/config.toml`, shared by the CLI and IDE extension.
- Configuration precedence, highest to lowest, is: CLI flags and `--config` overrides → project `.codex/config.toml` (nearest the working directory wins) → the profile file selected by `--profile` → user `~/.codex/config.toml` → system `/etc/codex/config.toml` → built-in defaults.
- Project-scoped config loads only for projects you have explicitly trusted; untrusted projects skip that layer.
- Codex stores local state under `CODEX_HOME` (defaults to `~/.codex`) and includes `config.toml` there.

## Profiles and providers

- Profiles are separate files at `$CODEX_HOME/<name>.config.toml` (e.g. `~/.codex/worker.config.toml`), selected with `codex --profile <name>`, and overlaid on top of the base user config. Names may contain letters, numbers, hyphens, and underscores.
- **Changed in Codex 0.134.0:** "`--profile` no longer reads `[profiles.profile-name]` from `config.toml`, and the top-level `profile = "profile-name"` selector is no longer supported." Both forms are inert on current releases, so a config still using them silently loses its profile settings.
- Profiles are selected from the CLI; the docs do not describe IDE-extension support either way.
- Custom model providers can be defined with base URL, wire API, and optional headers, then referenced via `model_provider`.

## Custom prompts (slash commands)

- Custom prompts are Markdown files stored under `~/.codex/prompts/`.
- Custom prompts require explicit invocation and aren’t shared through the repository; use skills to share or auto-invoke.
- Prompts are invoked as `/prompts:<name>` in the slash command UI.
- Prompt front matter supports `description:` and `argument-hint:`.
- Prompt arguments support `$1`–`$9`, `$ARGUMENTS`, and named placeholders like `$FILE` provided as `KEY=value`.
- Codex ignores non-Markdown files in the prompts directory.

## AGENTS.md instructions

- Codex reads `AGENTS.md` files before doing any work and builds a combined instruction chain.
- Discovery order: global (`~/.codex`, using `AGENTS.override.md` then `AGENTS.md`) then project directory traversal from repo root to CWD, with override > AGENTS > fallback names.
- Codex concatenates files from root down; files closer to the working directory appear later and override earlier guidance.

## Skills (Agent Skills)

- A skill is a folder containing `SKILL.md` plus optional `scripts/`, `references/`, `assets/`, and an `agents/openai.yaml` config file.
- `SKILL.md` uses YAML front matter and requires `name` and `description`.
- Required fields are single-line with length limits (name ≤ 100 chars, description ≤ 500 chars).
- At startup, Codex loads only each skill’s name, description, and file path; full content is injected when invoked.
- An optional `agents/openai.yaml` inside the skill directory carries Codex-specific presentation and invocation config: an `interface` block (`display_name`, `short_description`, `icon_small`, `icon_large`, `brand_color`, `default_prompt`), a `policy.allow_implicit_invocation` flag, and a `dependencies.tools` list declaring MCP tool dependencies (`type`, `value`, `description`, `transport`, `url`).
- `policy.allow_implicit_invocation` defaults to `true`. Setting it `false` makes the skill reachable only by explicit `/skills` or `$skill-name` invocation, opting it out of task-matching auto-selection — the Codex counterpart to Claude Code’s `disable-model-invocation: true` frontmatter.
- Skills can be repo-scoped in `.agents/skills/` and are discovered from the current working directory up to the repository root. User-scoped skills live in `~/.agents/skills/`.
- Inference: some existing tooling and user setups still use `.codex/skills/` and `~/.codex/skills/` as compatibility paths, but those locations are not documented in the current OpenAI Codex skills docs linked above.
- Compound Engineering should avoid `~/.agents/skills` for managed installs because that shared root can shadow Copilot's native plugin skills. Use the Codex-specific compatibility root `~/.codex/skills/compound-engineering/<skill-name>/SKILL.md` for CE Codex skills, and track generated files with a CE manifest.
- Codex also supports admin-scoped skills in `/etc/codex/skills` plus built-in system skills bundled with Codex.
- Skills can be invoked explicitly using `/skills` or `$skill-name`.

## Subagents and custom agents

- Codex subagent workflows are enabled by default in current releases.
- Codex only spawns subagents when explicitly asked.
- Custom agent files are standalone TOML files under `~/.codex/agents/` for personal agents or `.codex/agents/` for project-scoped agents.
- Each TOML file defines one custom agent. Required fields:
  - `name`
  - `description`
  - `developer_instructions`
- Optional fields can include `nickname_candidates`, `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, and `skills.config`.
- `model_reasoning_effort` accepts `ultra`, `max`, `xhigh`, `high`, `medium`, `low`, `minimal`, or `none`.
- When `model` or `model_reasoning_effort` is omitted, the subagent inherits the parent session’s value — but the docs also state that Codex "can choose a setup that balances intelligence, speed, and price for the task", so do not treat inheritance as guaranteed.
- Global caps live under `[agents]` in `config.toml`: `max_threads` (default `6`) caps concurrent agent threads, and `max_depth` (default `1`) caps nesting, so by default a spawned subagent cannot itself spawn one.
- The TOML `name` field is the source of truth; matching the filename to the agent name is only a convention.
- The generic converter can convert Claude Markdown agents into Codex custom-agent TOML files under `~/.codex/agents/<plugin>/` for plugins that still ship standalone agents.
- Generated agents should live under `~/.codex/agents`, not `~/.agents/skills`, because `~/.agents` is shared across harnesses and can shadow native plugin installs.
- Generated TOML agent names preserve source naming and may include source category context for nested agent trees.
- Empirical test on 2026-04-19 confirmed Codex discovers nested custom-agent TOML files under `~/.codex/agents/<plugin>/` and accepts hyphenated TOML `name` values.
- Empirical plugin test on 2026-04-19 found Codex native plugins did not register custom agents bundled under plugin-local `agents/`, plugin-local `.codex/agents/`, or an undocumented plugin manifest `agents` field. Compound Engineering now avoids that gap by shipping specialist behavior as skill-local prompt assets inside native skills; no CE custom-agent installer is required.

## MCP (Model Context Protocol)

- MCP configuration lives in `~/.codex/config.toml` and is shared by the CLI and IDE extension.
- Each server is configured under `[mcp_servers.<server-name>]`.
- STDIO servers support `command` (required), `args`, `env`, `env_vars`, and `cwd`.
- Streamable HTTP servers support `url` (required), `bearer_token_env_var`, `http_headers`, and `env_http_headers`.
