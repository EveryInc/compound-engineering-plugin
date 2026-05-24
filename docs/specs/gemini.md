# Gemini CLI Spec (GEMINI.md, Commands, Skills, Subagents, Extensions)

Last verified: 2026-04-18

## Primary sources

```
https://github.com/google-gemini/gemini-cli
https://geminicli.com/docs/get-started/configuration/
https://geminicli.com/docs/cli/custom-commands/
https://geminicli.com/docs/cli/skills/
https://geminicli.com/docs/cli/creating-skills/
https://geminicli.com/docs/core/subagents/
https://geminicli.com/docs/extensions/reference/
https://developers.googleblog.com/subagents-have-arrived-in-gemini-cli/
https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html
```

## Config locations

- User-level config: `~/.gemini/settings.json`
- Project-level config: `.gemini/settings.json`
- Project-level takes precedence over user-level for most settings.
- GEMINI.md context file lives at project root (similar to CLAUDE.md).

## GEMINI.md context file

- A markdown file at project root loaded into every session's context.
- Used for project-wide instructions, coding standards, and conventions.
- Equivalent to Claude Code's CLAUDE.md.

## Custom commands (TOML format)

- Custom commands are TOML files stored in `.gemini/commands/`.
- Command name is derived from the file path: `.gemini/commands/git/commit.toml` becomes `/git:commit`.
- Directory-based namespacing: subdirectories create namespaced commands.
- Each command file has two fields:
  - `description` (string): One-line description shown in `/help`
  - `prompt` (string): The prompt sent to the model
- Supports placeholders:
  - `{{args}}` — user-provided arguments
  - `!{shell}` — output of a shell command
  - `@{file}` — contents of a file
- Example:

```toml
description = "Create a git commit with a good message"
prompt = """
Look at the current git diff and create a commit with a descriptive message.

User request: {{args}}
"""
```

## Skills (SKILL.md standard)

- A skill is a folder containing `SKILL.md` plus optional supporting files.
- Workspace skills live in `.gemini/skills/` or the `.agents/skills/` alias.
- User skills live in `~/.gemini/skills/` or the `~/.agents/skills/` alias.
- Extension skills live in an installed extension's `skills/` directory.
- Compound Engineering managed Gemini installs should use Gemini-owned roots (`~/.gemini/skills`, `~/.gemini/agents`, `~/.gemini/commands`) rather than `~/.agents/skills`, because `~/.agents/skills` can shadow Copilot plugin skills.
- `SKILL.md` uses YAML frontmatter with `name` and `description` fields.
- Gemini activates skills on demand via `activate_skill` tool based on description matching.
- The `description` field is critical — Gemini uses it to decide when to activate the skill.
- Format is identical to Claude Code's SKILL.md standard.
- Example:

```yaml
---
name: security-reviewer
description: Review code for security vulnerabilities and OWASP compliance
---

# Security Reviewer

Detailed instructions for security review...
```

## Subagents

- Gemini CLI supports custom subagents as Markdown files with YAML frontmatter.
- Project subagents live in `.gemini/agents/*.md`.
- User subagents live in `~/.gemini/agents/*.md`.
- Extension subagents live in an installed extension's `agents/*.md` directory.
- Current Gemini docs, `/agents reload` command text, and Gemini CLI 0.38.2 implementation name only `.gemini/agents` and `~/.gemini/agents` for local subagent discovery. The `.agents/skills` and `~/.agents/skills` aliases apply to skills; Gemini does not currently read `~/.agents/agents` or `.agents/agents` as subagent discovery paths.
- Subagents can be invoked explicitly with `@agent-name` or selected automatically by description.
- Subagents run in isolated context loops and can have restricted tool access.
- Subagents cannot call other subagents, even if granted wildcard tool access.

Example:

```yaml
---
name: security-auditor
description: Specialized in finding security vulnerabilities in code.
kind: local
tools:
  - read_file
  - grep_search
model: inherit
max_turns: 10
---

You are a ruthless Security Auditor.
```

## MCP server configuration

- MCP servers are configured in `settings.json` under the `mcpServers` key.
- Same MCP protocol as Claude Code; different config location.
- Supports `command`, `args`, `env` for stdio transport.
- Supports `url`, `headers` for HTTP/SSE transport.
- Additional Gemini-specific fields: `cwd`, `timeout`, `trust`, `includeTools`, `excludeTools`.
- Example:

```json
{
  "mcpServers": {
    "context7": {
      "url": "https://mcp.context7.com/mcp"
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-playwright"]
    }
  }
}
```

## Hooks

- Gemini supports hooks: `BeforeTool`, `AfterTool`, `SessionStart`, etc.
- Hooks use a different format from Claude Code hooks (matchers-based).
- Not converted by the plugin converter — a warning is emitted.

## Extensions

- Extensions are distributable packages for Gemini CLI.
- Install with `gemini extensions install <github-url-or-local-path>`.
- Unlike `gemini skills install`, current Gemini extension docs and local `gemini extensions install --help` output do not list a `--path` flag for installing an extension from a monorepo subdirectory.
- Remote extension installs are not local-only. Gemini supports Git repository distribution and GitHub Releases.
- For public gallery discovery and normal remote install, `gemini-extension.json` must be at the absolute root of the GitHub repository or release archive.
- Gemini CLI copies installed extensions under `~/.gemini/extensions`.
- `gemini extensions link <path>` creates a symlink for local development instead of copying the extension.
- Extension management commands run from the shell, not inside Gemini's interactive mode. Restart the Gemini session after install/update for commands and extension changes to take effect.
- Extensions can bundle commands, skills, subagents, hooks, MCP servers, context files, policies, settings, and themes.
- Every extension root must contain `gemini-extension.json`.
- Extension commands live in `commands/*.toml`.
- Extension skills live in `skills/<name>/SKILL.md`.
- Extension subagents live in `agents/*.md`.
- For Compound Engineering, native extension packaging is now the likely primary Gemini distribution path because it can preserve commands, skills, and subagents. Direct `.gemini/` writes should be treated as a legacy/custom install path unless retained for local development.
- Because this repo is a monorepo with the plugin under `plugins/compound-engineering/`, public Gemini extension distribution likely needs a generated extension-root source, a dedicated extension repo, or a distribution branch whose root is the Gemini extension root.
- Interim CE distribution should keep using the Bun installer, but change the writer to install into `~/.gemini/{skills,agents,commands}` with a manifest under `~/.gemini/compound-engineering`.

### Extension root shape

A distributable Gemini extension source should look like:

```text
gemini-extension.json
GEMINI.md                    # optional context file
skills/<skill-name>/SKILL.md
commands/<command>.toml
agents/<agent-name>.md
hooks/hooks.json             # optional
policies/*.toml              # optional
package.json                 # optional, if the extension has runtime code
```

Minimal manifest:

```json
{
  "name": "compound-engineering",
  "version": "1.0.0",
  "description": "Compound Engineering workflows for Gemini CLI",
  "contextFileName": "GEMINI.md"
}
```

Relevant manifest fields:

- `name`: Required. Local CLI validation allows letters, numbers, and dashes; docs recommend lowercase numbers/dashes and expect the extension directory name to match.
- `version`: Required. Validation warns if it is not standard semver.
- `description`: Optional but used by the public gallery.
- `contextFileName`: Optional. Defaults to `GEMINI.md` when present.
- `mcpServers`: Optional. Loaded like user `settings.json` MCP servers, except `trust` is ignored for extension MCP config.
- `settings`: Optional install-time/user configuration prompts; values are stored in extension `.env` or keychain for sensitive values.
- `excludeTools`, `migratedTo`, `plan`, `themes`: Optional target-specific behavior.

### Install commands

Install from a GitHub repository whose root is the extension root:

```bash
gemini extensions install https://github.com/EveryInc/compound-engineering-gemini
```

Install from a branch, tag, or commit:

```bash
gemini extensions install https://github.com/EveryInc/compound-engineering-gemini --ref stable
```

Install from a local extension root:

```bash
gemini extensions install ./dist/gemini-extension
```

Link a local extension root for development:

```bash
gemini extensions link ./dist/gemini-extension
```

Validate a local extension root:

```bash
gemini extensions validate ./dist/gemini-extension
```

Uninstall:

```bash
gemini extensions uninstall compound-engineering
```

### Release options

Gemini supports two remote release shapes:

1. **Git repository:** Users install the repository URL. The repository root must contain `gemini-extension.json`.
2. **GitHub Releases:** Users still install the repository URL. Gemini can use the latest release archive or a release tag via `--ref`; custom archives must be self-contained with `gemini-extension.json` at the archive root.

The public Gemini extension gallery indexes public GitHub repositories with the `gemini-cli-extension` topic when `gemini-extension.json` is at the repository or release archive root.

### Compound Engineering packaging implications

The current `plugins/compound-engineering/` source root is not currently a valid Gemini extension root because it lacks `gemini-extension.json`:

```bash
gemini extensions validate plugins/compound-engineering
# Configuration file not found at .../plugins/compound-engineering/gemini-extension.json
```

Adding only that manifest would make the root validate, but it would not be enough for correct agent packaging:

- CE agents currently live in nested category directories such as `agents/review/correctness-reviewer.md`.
- Gemini's local loader in `@google/gemini-cli` 0.38.2 reads only direct `*.md` files under the extension `agents/` directory.
- Gemini agent frontmatter is strict. CE's Claude-authored agent frontmatter can include Claude-only fields such as `color`, and some files use Claude string-form `tools: Read, Grep, Glob, Bash`; Gemini expects `tools` to be an array of valid Gemini tool names.

Therefore a proper CE Gemini extension should be generated or normalized, not just the Claude plugin root plus a manifest. This does not mean rewriting agent prompts into bespoke Gemini-only instructions. The agent bodies and most `name`/`description`/`model` frontmatter can usually pass through. The generated extension should:

- Copy pass-through `skills/<skill>/SKILL.md` directories that are not excluded for Gemini.
- Convert Claude agents into flat Gemini-compatible subagents under `agents/<agent-name>.md`.
- Strip or translate Claude-only frontmatter fields.
- Convert Claude tool names to Gemini tool names, or omit tools when there is no reliable mapping.
- Generate Gemini `commands/*.toml` only if CE ships source commands again.
- Include a `gemini-extension.json` at the generated extension root.
- Use `gemini extensions validate <generated-root>` in tests.

The same normalization is needed for the interim Bun installer, except the output root is `~/.gemini` instead of an extension root:

```text
~/.gemini/skills/<skill-name>/SKILL.md
~/.gemini/agents/<agent-name>.md
~/.gemini/commands/*.toml
~/.gemini/compound-engineering/install-manifest.json
```

Local smoke test on 2026-04-18 with Gemini CLI 0.38.2:

- A direct extension agent using CE/Claude-style `tools: Read, Grep, Glob, Bash` plus `color: blue` failed to load with Gemini validation errors: `tools: Expected array, received string` and `Unrecognized key(s) in object: 'color'`.
- A nested extension agent under `agents/review/nested-agent.md` produced no validation error because the loader only scans direct files under `agents/`; it was not discovered.

Do not place CE agents in `~/.agents/agents` as a shared cross-harness agent root. Gemini does not currently read it, and if Gemini adds that alias later, Claude/Copilot-shaped frontmatter could become a compatibility problem. For Gemini, use either a native extension with normalized `agents/*.md` files or a legacy/custom install under `~/.gemini/agents` with cleanup.

If the same Gemini agent name exists in multiple Gemini-read locations, Gemini registers user agents first, project agents next, and extension agents last. Later registrations override earlier ones by name. This avoids duplicate visible agent tools, but stale CE files in `~/.gemini/agents` can still emit validation errors or mask behavior when an extension is disabled, so cleanup remains necessary.

## Settings.json structure

```json
{
  "model": "gemini-2.5-pro",
  "mcpServers": { ... },
  "tools": {
    "sandbox": true
  }
}
```

- Only the `mcpServers` key is written during plugin conversion.
- Other settings (model, tools, sandbox) are user-specific and out of scope.
