# Antigravity (`agy`) native plugin spec

Status: verified against `agy` v1.5.18 on macOS and the official Antigravity plugin docs (`https://antigravity.google/docs/build-plugins.md`, `https://antigravity.google/docs/plugins.md`, `https://antigravity.google/docs/subagents.md`).

## Background

Google replaced the consumer Gemini CLI with **Antigravity** (App, CLI `agy`, IDE, and IDE extensions). Antigravity has a native plugin system shared across surfaces via `~/.gemini/config/plugins/<plugin-name>/` (global) and `<workspace-root>/.agents/plugins/<plugin-name>/` (workspace).

Compound Engineering installs natively as an Antigravity plugin from this repository — no Bun converter or clone step is required.

## Install model (user-facing)

`agy` installs a plugin from a **remote Git repository URL**, a **local directory**, or the **Antigravity Marketplace** (`<plugin>@antigravity-plugins-official` / `<plugin>@antigravity-plugins-partners`):

```bash
agy plugin install https://github.com/EveryInc/compound-engineering-plugin
```

Local checkout (repository root or bundled `.agy/` entry point):

```bash
git clone https://github.com/EveryInc/compound-engineering-plugin
agy plugin install ./compound-engineering-plugin
agy plugin install ./compound-engineering-plugin/.agy   # equivalent via symlinked manifest
```

- **Manifest precedence:** Antigravity checks `.antigravity-plugin/plugin.json` first, falling back to root `plugin.json`. In multi-tool repos, `.antigravity-plugin/plugin.json` lets us ship Antigravity-specific presentation fields (`$schema`, `displayName`, `logo`, `suggestedPrompts`) without colliding with root `plugin.json`'s Agent Plugins v1.0.0 closed field set.
- **Storage & sync:** Installed plugins are staged in `~/.gemini/config/plugins/<name>/` and sync across the Antigravity App, CLI, and IDE. `agy plugin list --json` reports `name`, `enabled`, `version`, `source`, `path`, and discovered component arrays.
- **Committed `.agy/` entry point:** holds symlinks (`plugin.json -> ../.antigravity-plugin/plugin.json`, `skills -> ../skills`, `assets -> ../assets`) plus `.agy/INSTALL.md` for explicit local `.agy` installs and zero-warning `agy plugin validate --strict ./.agy`.
- Other subcommands: `list [--json]`, `uninstall <name>`, `enable <name>`, `disable <name>`, `validate [target] [--strict] [--json]`, `import [gemini|claude]`, `link <mp> <target>`.

See `.agy/INSTALL.md` for pinning, local development, uninstall, and upgrading from legacy Gemini CLI imports.

## Native plugin layout

```text
<plugin-root>/
├── .antigravity-plugin/plugin.json  # preferred manifest in multi-tool repos (or root plugin.json)
├── README.md                        # optional pre-install docs shown in Marketplace UI
├── assets/logo.png                  # optional square icon (>=128x128px, referenced by manifest `logo`)
├── scripts/                         # optional helper scripts (executable 0755)
├── skills/<name>/SKILL.md           # skills (YAML frontmatter: name, description, optional disable-model-invocation)
├── agents/<name>.md                 # optional custom agents & subagents
├── rules/AGENTS.md                  # optional always-on plugin rule (or rules/<rule>.md with trigger frontmatter)
├── mcp_config.json                  # optional MCP servers
└── hooks.json                       # optional lifecycle hooks (must live at plugin root)
```

### Manifest (`.antigravity-plugin/plugin.json`)

Official schema: `https://antigravity.google/schemas/v1/plugin.json` (`additionalProperties: false`).

Key fields:
- `name` (required, lowercase kebab-case)
- `displayName`, `description`, `version`, `logo`, `author` (required for Marketplace)
- `suggestedPrompts` (up to 3 starter prompt chips in the Antigravity App)
- `homepage`, `repository`, `license`, `keywords`, `skills`, `disabled`, `extensions` (optional)

Compound Engineering ships `.antigravity-plugin/plugin.json` with `displayName`, `logo: "assets/logo.png"`, and 3 `suggestedPrompts`. Version is release-owned via `.github/release-please-config.json`.

### Skills

- `skills/<name>/SKILL.md` with YAML frontmatter (`name` matching folder name, `description` <= 1,024 chars, optional `disable-model-invocation`, `license`, `compatibility`).
- Loaded via progressive disclosure (names + descriptions at session start; full body on demand or via `/<name>`).
- Extra Claude keys (`argument-hint`, `allowed-tools`) are tolerated without validation errors; `allowed-tools` is not enforced by Antigravity.

### Agents (subagents)

- `agents/<name>.md` or `agents/<name>/agent.md` with YAML frontmatter: `name`, `description`, `mainAgent` (default `true`), `subagent` (default `true`), `model` (`inherit` | `flash_lite` | `flash` | `pro`), `tools`, `commandExecutionPolicy` (`off` | `auto` | `eager` | `sandbox`), `skills`, `inheritMcp`, `inheritCustomizations`.
- Runtime subagent invocation uses `invoke_subagent` (asynchronous background execution with reactive wakeup; built-in types `self`, `research`, `browser`).

### Rules and `GEMINI.md`

- Native Antigravity plugins load rules **only** from `rules/` (`rules/AGENTS.md`, `rules/GEMINI.md`, or `rules/<name>.md` with `trigger: always_on | model_decision | glob | manual`).
- Root `AGENTS.md` and `GEMINI.md` are **never loaded** by installed plugins (`agy plugin validate .` warns when they exist at root).
- Root `GEMINI.md` was removed from this repository because: (1) installed Antigravity plugins ignore it completely, and (2) when contributors open this repo checkout in Antigravity, Antigravity loads both `AGENTS.md` and `GEMINI.md` as workspace rules — causing the legacy extension-user instructions in `GEMINI.md` to contradict `AGENTS.md`.
- Root `AGENTS.md` remains intentionally ignored by Antigravity's plugin loader so repo contributor guidance does not leak into end-user sessions.

### MCP servers (`mcp_config.json`)

Root file shaped `{ "mcpServers": { "<name>": { ... } } }`:
- **Stdio:** `{ "command": "...", "args": [...], "env": {...} }` (supports `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`)
- **Streamable HTTP (remote):** `{ "url": "https://..." }` (`serverUrl` is accepted as a legacy alias; supports `headers`, `variables`, and `oauth`).

### Hooks (`hooks.json`)

Root file where each top-level key is a **named hook group**:

```json
{
  "<hook-name>": {
    "enabled": true,
    "PreToolUse": [{ "matcher": "run_command", "hooks": [{ "type": "command", "command": "./scripts/check.sh" }] }],
    "Stop": [{ "type": "command", "command": "./scripts/verify.sh" }]
  }
}
```

- `PreToolUse` and `PostToolUse` wrap handlers in `{ matcher, hooks }`; `SessionStart`, `PreInvocation`, `PostInvocation`, and `Stop` take flat handler arrays.
- Native plugins do **not** stage `hooks/hooks.json` or load `commands/`.

## Interactive question tool & permissions

- The interactive blocking-question tool exposed to agents is **`ask_question`**.
- Tool execution is gated via `/permissions` and `toolPermission` settings (`always-proceed` | `request-review` | `strict` | `proceed-in-sandbox`).

## Validation in multi-tool repositories

Run `agy plugin validate .` to verify zero errors. In a multi-tool repo, `agy plugin validate --strict .` emits expected warnings for root `AGENTS.md` (contributor instructions) and root `plugin.json` (shadowed by `.antigravity-plugin/plugin.json`). Running `agy plugin validate --strict ./.agy` validates the symlinked bundle with zero warnings.
