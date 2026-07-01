# Antigravity CLI (`agy`) target spec

Status: spike findings, verified empirically against `agy` v1.0.10 on macOS (2026-06-22). This
documents the Antigravity CLI plugin format so a `claude-to-antigravity` converter target can be
built. It supersedes `docs/specs/gemini.md` for new work; Gemini CLI is being removed as a target.

## Background

Google replaced the consumer Gemini CLI with **Antigravity CLI** (binary `agy`), a Go-based terminal
agent that still runs on Gemini models. It is a distinct CLI with its own install model, plugin
format, and permission system -- not a rename of `gemini`. Per public reporting, consumer Gemini CLI
access (free / AI Pro / Ultra) was cut off ~2026-06-18 while enterprise Gemini Code Assist and paid
API-key access continue; this repo's decision is to remove the Gemini target entirely and target
Antigravity instead.

All facts below were verified by building a fixture plugin and running `agy plugin validate` /
`agy plugin install` / `agy plugin list` / `agy plugin uninstall`, not from documentation
(antigravity.google/docs renders client-side and is not machine-readable).

## Install model (user-facing)

`agy` installs a plugin from a **local directory** or a **remote Git repository URL** when the source contains a root `plugin.json`:

```bash
agy plugin install https://github.com/EveryInc/compound-engineering-plugin
```

Local checkout (repository root or bundled `.agy/` entry point):

```bash
git clone https://github.com/EveryInc/compound-engineering-plugin
agy plugin install ./compound-engineering-plugin
agy plugin install ./compound-engineering-plugin/.agy   # equivalent via symlinked manifest
```

- `agy plugin install <target>` requires `<target>` to be a directory containing a `plugin.json` at
  its root (`agy plugin validate .` fails with "missing plugin.json" otherwise), or a remote Git URL
  whose root contains `plugin.json`.
- `agy plugin install <plugin>@<marketplace>` exists for marketplaces; Antigravity does not yet
  ship a curated marketplace catalog equivalent to Kimi's `.kimi-plugin/marketplace.json`.
- `agy plugin import [gemini|claude]` imports an existing Gemini-CLI / Claude install; on this machine
  `agy plugin list` showed `compound-engineering` already imported with `source: gemini-cli`.
- Other subcommands: `list`, `uninstall <name>`, `enable <name>`, `disable <name>`, `validate [path]`,
  `link <mp> <target>`.

Compound Engineering publishes root `plugin.json` plus `skills/` so remote Git install works without
a clone step. The committed `.agy/` bundle holds a symlinked manifest (`plugin.json -> ../plugin.json`)
and `skills -> ../skills` for explicit local `.agy` installs.

See `.agy/INSTALL.md` for pinning, validation, and uninstall.

Installed/imported plugins are tracked in an internal registry surfaced by `agy plugin list --json`
(not a readable `plugins/` directory tree). Each entry records `name`, `source`
(`antigravity` | `gemini-cli` | `claude`), `importedAt`, and the `components` recognized.

## Plugin layout (what the converter must emit)

```
<plugin-root>/
  plugin.json              # required manifest, at root
  skills/<name>/SKILL.md   # skills (SKILL.md with YAML frontmatter)
  agents/<name>.md         # subagents (markdown + frontmatter)
  commands/<name>.{toml,md} # commands -- CONVERTED TO SKILLS on install/import
  mcp_config.json          # MCP servers (root file)
  hooks.json               # hooks (root file)
```

`agy plugin validate` reports each section as `processed` or `skipped (not found)`, so all component
dirs/files are optional and discovered by convention.

### `plugin.json`

Minimal valid manifest (verified):

```json
{ "name": "compound-engineering", "version": "0.0.0" }
```

- `name` and `version` are sufficient to validate. `description` and other fields are optional and
  were not required by the validator. (Version is release-owned in this repo -- see release notes.)

### Skills

- `skills/<name>/SKILL.md` with standard YAML frontmatter (`name`, `description`). Same SKILL.md
  contract already used by the Claude/Gemini surfaces -- skills appear to port directly.

### Agents (subagents)

- `agents/<name>.md`, markdown with frontmatter (`name`, `description`). One `.md` per agent.

### Commands -> skills

- `commands/<name>.toml` and `commands/<name>.md` both validate and are reported as
  **"converted to skills"**. Antigravity has no separate runtime command primitive; commands become
  skills on install. Converter implication: we can emit commands as skills directly rather than
  shipping a command format.

### MCP servers (`mcp_config.json`)

Root file shaped `{ "mcpServers": { "<name>": { ... } } }`. Verified field names:

- **stdio server:** `{ "command": "...", "args": [...] }`
- **remote server:** `{ "serverUrl": "https://..." }`  -- NOT `url` and NOT `httpUrl`.
  Validator error for the wrong key: `MCP server "<name>" must have either command or serverUrl`.

Converter implication: map the Gemini/Claude remote-MCP `url` field to `serverUrl`.

### Hooks (`hooks.json`)

Root file shaped `{ "hooks": { ... } }`. A `{ "hooks": { "PreToolUse": [] } }` shape validates
(top-level container confirmed). The per-event hook schema (matchers, command shape, event names
beyond `PreToolUse`) was NOT exhaustively verified in this spike and must be confirmed before
emitting real hooks.

## Permissions / interactive question tool

- `agy` gates tool execution via TUI permission prompts (`/permissions` slash command and a
  `toolPermission` setting: `always-proceed` | `request-review` | `strict` | `proceed-in-sandbox`),
  plus `permissions` allow/deny/ask rules in settings -- not a Gemini-CLI-style `ask_user` tool.
- The interactive blocking-question tool exposed to agents is **`ask_question`** (confirmed in live
  usage). Plugin skill prose that lists per-harness blocking-question tools should use
  `ask_question` for Antigravity (this was applied in the Wave 1 skill sweep).

## Context files

- `agy` still reads `GEMINI.md` (workspace) and `AGENTS.md` as context. `GEMINI.md` is therefore
  retained even though the Gemini *converter target* is removed. Google may later consolidate this
  into `AGENTS.md`; treat that as TBD.

## Settings (reference)

Global settings live at `~/.gemini/antigravity-cli/settings.json` (keys observed in the bundled CLI
guide include `permissions`, `toolPermission`, `trustedWorkspaces`, model, sandbox, status line).
Builtin skills ship under `~/.gemini/antigravity-cli/builtin/skills/`.

## Open questions for implementation

- Exact `hooks.json` per-event schema (matcher/command shape, supported event names).
- Whether `agy plugin install` supports a monorepo subdirectory or only a root `plugin.json`.
- Whether a generated root `plugin.json` (vs `.claude-plugin/plugin.json`) is the right emission
  target, and how it coexists with the existing Claude/Codex manifests at the repo root.
  **Resolved for CE:** root `plugin.json` is the Antigravity manifest; `.agy/plugin.json` symlinks to it.
- Marketplace (`<plugin>@<marketplace>`, `agy plugin link`) distribution — deferred until Antigravity
  documents a stable catalog schema (unlike Kimi's `.kimi-plugin/marketplace.json`).
