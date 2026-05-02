# Hermes Agent Spec (Skills, MCP)

Last verified: 2026-05-02

## Primary sources

```
https://hermes-agent.nousresearch.com/docs/developer-guide/creating-skills
https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
https://hermes-agent.nousresearch.com/docs/developer-guide/adding-tools
https://hermes-agent.nousresearch.com/docs/guides/migrate-from-openclaw
```

The MCP feature page is the canonical reference for the `mcp_servers` schema verified during planning. The migration page is used only as a reference for the persona/cron/hooks paradigm Hermes uses.

## Config locations

| Scope | Path |
|-------|------|
| Hermes home | `~/.hermes/` |
| Skills | `~/.hermes/skills/<name>/SKILL.md` |
| Top-level config | `~/.hermes/config.yaml` |
| Secrets | `~/.hermes/.env` |
| Persona | `~/.hermes/SOUL.md` |
| Memory | `~/.hermes/memories/` |
| Managed install manifest (per plugin) | `~/.hermes/<pluginName>/install-manifest.json` |

## How CE installs to Hermes

The CLI converter writes Compound Engineering content into `~/.hermes/skills/` and merges the plugin's MCP servers into `~/.hermes/config.yaml`. Skills, commands, and agents all land under `skills/` because Hermes has no separate command or agent directory — kind is preserved via name prefixes (`cmd-` and `agent-`) and `metadata.hermes.tags`.

```bash
bunx @every-env/compound-plugin install compound-engineering --to hermes
bunx @every-env/compound-plugin install compound-engineering --to hermes --hermes-home ~/.hermes
bunx @every-env/compound-plugin cleanup --target hermes
```

## Skills (Agent Skills)

- Skills follow the open SKILL.md standard (same format as Claude Code, Cursor, Copilot).
- A skill is a directory containing `SKILL.md` plus optional `scripts/`, `references/`, and `assets/`.
- YAML frontmatter is parsed by Hermes; `name` is the skill's stable identifier and `description` controls relevance ranking.
- Hermes additionally supports a `metadata.hermes.*` section for tags, related skills, toolset gating, and per-skill config — see Hermes' creating-skills page for the full schema.

### Passthrough vs. generated skills

| Source kind | Skill name | Frontmatter behavior |
|-------------|-----------|----------------------|
| Passthrough skill (`plugins/.../skills/<name>/SKILL.md`) | `<name>` | Original frontmatter preserved verbatim. Body rewritten by `transformContentForHermes`. |
| Command (`plugins/.../commands/<name>.md`, only when not `disableModelInvocation`) | `cmd-<name>` | Generated frontmatter: `name`, `description`, `version`, `metadata.hermes.tags: ["Command"]`. |
| Agent (`plugins/.../agents/<name>.md`) | `agent-<name>` | Generated frontmatter: `name`, `description`, `version`, `metadata.hermes.tags: ["Agent"]`. `capabilities` folded into a `## Capabilities` body section. |

The skill name prefix is the load-bearing kind identifier. `metadata.hermes.tags: ["Command" | "Agent"]` is advisory and may be ignored by future Hermes versions; the prefix preserves kind regardless.

### Frontmatter mapping for generated skills

| Claude field | Hermes field | Notes |
|--------------|--------------|-------|
| `name` | `name` | Prefixed with `cmd-` or `agent-` |
| `description` | `description` | JSON-quoted when value contains `:` / `[` / `{` / `*` / leading `"` |
| _plugin manifest version_ | `version` | Read from `plugin.json` `version` |
| _kind_ | `metadata.hermes.tags` | `["Command"]` or `["Agent"]` |
| `capabilities` (agents only) | _body_ | Folded as `## Capabilities\n- ...` above the original body |
| `model` | _dropped_ | Hermes routes models via `config.yaml`'s top-level `model` field |
| `argument-hint` | _dropped_ | No Hermes equivalent |
| `allowedTools`, `disableModelInvocation` | _dropped_ | Claude-specific; not part of Hermes' contract |

### Body content rewrites

The converter applies `transformContentForHermes` to every emitted body:

| Pattern | Rewrite |
|---------|---------|
| `Task <agent-name>(args)` | `Use the <agent-name> skill to: args` |
| `Task <agent-name>()` | `Use the <agent-name> skill` |
| `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskStop`, `TaskOutput`, `TodoWrite`, `TodoRead` | `the platform's task-tracking primitive` |
| `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_SKILL_DIR}` | `${HERMES_SKILL_DIR}` |
| `~/.claude/...` / `.claude/...` | `~/.hermes/...` / `.hermes/...` |
| `/workflows:plan`, `/prompts:foo` | `/plan`, `/foo` (namespace prefixes stripped) |
| `/skill:bar` | `/skill:bar` (preserved per existing convention) |

Slash-command rewrites use a negative-lookahead regex with an inline allowlist (`dev`, `tmp`, `etc`, `usr`, `var`, `bin`, `home`, `users`, `opt`, `sys`, `proc`, `Applications`, `Users`) so URLs (`https://example.com/path`), API paths (`POST /users`), shell paths (`/etc/passwd`), and markdown reference-style links (`[text](/path/to/page)`) pass through unchanged.

## Commands

Commands without `disableModelInvocation: true` emit as skills with `metadata.hermes.tags: ["Command"]` and a `cmd-` prefix. Hermes invokes them via slash command on supported platforms or as model-invoked skills elsewhere.

Commands with `disableModelInvocation: true` are **dropped** at conversion time with a stderr warning naming each dropped command. The default reflects Claude semantics (the field marks "humans only — do not auto-invoke") combined with Hermes' headless posture (autonomous invocation is the primary mode). Users who explicitly want these commands available on Hermes should remove `disableModelInvocation: true` from the source.

## Agents

Agents emit as skills with `metadata.hermes.tags: ["Agent"]` and an `agent-` prefix. `capabilities` is folded into a `## Capabilities` section above the original body. The Claude `model` field is dropped — Hermes' top-level `config.yaml` `model` field controls routing.

Hermes supports a Parallel Sub-Agents primitive that dispatches skills concurrently. CE agents converted to Hermes skills are dispatchable via that primitive without converter-side changes.

## MCP (Model Context Protocol)

MCP servers from the plugin are merged into `~/.hermes/config.yaml`'s `mcp_servers` section.

### Config structure (verified against the Hermes user-guide MCP page)

```yaml
mcp_servers:
  filesystem:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
  github:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "***"
    tools:
      include: [create_issue, list_issues]
  company_api:
    url: "https://mcp.internal.example.com"
    headers:
      Authorization: "Bearer ***"
```

### Server types

| Type | Distinguished by | Fields |
|------|------------------|--------|
| Stdio | presence of `command` | `command`, `args`, `env`, `cwd`, `timeout`, `connect_timeout`, `enabled`, `tools.*`, `sampling.*` |
| HTTP | presence of `url` | `url`, `headers`, `timeout`, `connect_timeout`, `enabled`, `tools.*`, `sampling.*` |

`tools.include` / `tools.exclude` filter which MCP tools are exposed. `tools.resources: false` and `tools.prompts: false` opt out of those MCP utility surfaces.

### Merge semantics

The writer reads any existing `~/.hermes/config.yaml`, deep-merges the plugin's `mcp_servers` into the existing map with **existing entries winning on key collision** (defensive — user-tuned servers are not clobbered), and writes the result back. Top-level user keys (`model`, `gateway`, `channels`, `tts`, etc.) are preserved verbatim.

The write path is atomic: `js-yaml`'s `dump` to `<configPath>.tmp` with mode `0600`, then `fs.rename` over `config.yaml`. The previous `config.yaml` is also backed up to `config.yaml.bak.<timestamp>` before overwrite.

### Limitations

- **Comments are not preserved** across YAML round-trip. `js-yaml`'s `dump` emits canonical YAML without comment retention. Users who heavily comment `config.yaml` should review the diff after each install.
- **MCP entries are not tracked in the install manifest.** The shared cleanup helpers operate on filesystem entries, not YAML keys. CE-introduced MCP servers that the plugin later removes will remain in `config.yaml` until the user removes them manually. `cleanup --target hermes` emits a stderr note pointing the user at `config.yaml` for any MCP cleanup needed.
- **`sampling.*` is not derived from Claude.** Claude `mcpServers` has no equivalent. Users who want Hermes sampling should add it to `config.yaml` directly; CE will preserve those entries on reinstall.

## Hooks

Claude `hooks` blocks are dropped with a stderr warning. Hermes uses cron jobs (`hermes cron create`) and gateway hooks (`hermes webhook`) for the equivalent paradigm — recreate any dropped hooks using those mechanisms.

## Install manifest

Each install records `~/.hermes/<pluginName>/install-manifest.json`:

```json
{
  "version": 1,
  "pluginName": "compound-engineering",
  "groups": {
    "skills": ["ce-plan", "agent-ce-research-analyst", "cmd-ce-plan", "..."]
  }
}
```

Only the `skills` group is tracked. Reinstall removes manifest-listed skills no longer present in the bundle, then writes the new bundle. User-authored skills not in the manifest are preserved.

Multi-plugin coexistence: each plugin gets its own `~/.hermes/<pluginName>/install-manifest.json`. Cleanup of plugin A does not touch plugin B's skills.

## Cross-plugin skill-name collisions

If two plugins both ship a skill named `code-reviewer`, the second install detects the collision (the target dir exists AND another plugin's manifest claims ownership), emits a stderr warning, and skips the conflicting write. The first plugin's skill stays in place. Resolve manually by renaming one of the conflicting skills.

## Path safety

- All path components run through `sanitizePathName()` for filesystem safety (`:`, `\`, `/` → `-`).
- Hermes-specific NFKD normalization handles non-ASCII inputs (`ce:plán` → `ce-plan`).
- Manifest entries are path-safety-filtered at read time via `isSafeManagedPath` (defends against tampered manifests with `../` or absolute paths).
- Before any `fs.rm` on a manifest-tracked dir, a `fs.realpath` containment check rejects user-created symlinks pointing out of the managed tree.

## Blocking questions and user input

Several CE workflows pause to ask the user a question (mode selection, plan confirmation, routing decisions, PR title approval, etc.). Claude Code provides this via the `AskUserQuestion` tool; other targets have native equivalents (`request_user_input` on Codex, `ask_user` on Gemini and Pi-with-extension). Hermes does not expose a dedicated blocking-question primitive.

**The skills already handle this.** Every CE skill that asks a blocking question carries explicit fallback prose:

> *"Use the platform's blocking question tool ... Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors. Never silently skip the question."*

How that lands on Hermes depends on the execution surface:

| Hermes surface | Behavior |
|----------------|----------|
| Conversational gateways (Telegram, Discord, Slack, Matrix, CLI chat) | The skill renders options as a numbered list in the channel and waits for the user's reply. The user replies with the letter or label; the skill continues. **Works as designed.** |
| Direct `hermes chat` REPL | Same — the agent emits the numbered list, the user types a choice, execution continues. |
| True-autonomous execution (cron jobs, gateway hooks with no attached user) | The skill renders the question but has no channel to receive a reply. The agent loop pauses until session timeout or until a user attaches to the conversation. **Genuinely degraded** — prefer skills that don't require user input for unattended workflows. |

If an interactive skill is critical and the workflow is fully unattended (no user channel ever attaches), either run it on Claude Code instead, or add `ce_platforms: [claude]` (or any explicit list excluding `hermes`) to the source `SKILL.md` — the converter honors the soft filter and drops the skill from Hermes output entirely.

The plugin emits a guidance block to your `~/.hermes/AGENTS.md` on install (see "AGENTS.md compatibility block" below) so the runtime guidance lives next to your other Hermes config.

## AGENTS.md compatibility block

The Hermes writer upserts a managed block into `~/.hermes/AGENTS.md` (or `<output>/.hermes/AGENTS.md` for project-rooted installs) so the Hermes runtime sees CE-specific guidance as part of the user's own agent instructions. The block is delimited by `<!-- BEGIN COMPOUND HERMES TOOL MAP -->` / `<!-- END COMPOUND HERMES TOOL MAP -->` markers and is rewritten in place on every reinstall.

The block currently advises:

- Blocking-question rendering — render numbered options in the active conversation channel and wait for the user's reply
- Slash-command behavior — `/<command>` refs in skill bodies refer to converted commands at `~/.hermes/skills/cmd-<name>/`
- Sub-agent dispatch — `Use the X skill to: ...` patterns delegate via `skill_view`
- Restart guidance — restart Hermes after each install/reinstall so MCP changes load

Users may freely edit content outside the markers; the writer never touches it. Editing inside the markers will be overwritten on the next install.

## Operational notes

- **Restart Hermes after every install or reinstall** to pick up new MCP configuration. The install command logs this reminder.
- **User-edited generated skills are overwritten on reinstall.** CE-owned skill dirs (those in the install manifest) are deleted-and-recreated on each install. To preserve modifications, copy the skill out of `~/.hermes/skills/cmd-<name>/` to a non-CE-managed name (e.g., `~/.hermes/skills/my-<name>/`); the manifest does not track copies.
- **Detection probe:** `--to all` checks for `~/.hermes/config.yaml` (proves Hermes has been run), not the bare directory (which could be stale from an uninstalled product).
- **Cleanup is home-only.** `cleanup --target hermes` reads the manifest at `~/.hermes/<pluginName>/install-manifest.json` and removes the listed skill directories. No project-level Hermes layout is currently supported.

## Notes for this repository

This converter target is new (mid-2026); the verification surface for runtime correctness is the user's first install. If you hit a runtime mismatch — wrong frontmatter shape, MCP config not loading, skill not discovered — please file an issue with:

- The Hermes version (`hermes --version`)
- The relevant `~/.hermes/skills/.../SKILL.md` and `~/.hermes/config.yaml` excerpts
- The exact CE command that produced the install

Future work could include an opt-in `bun test:hermes-runtime` smoke pass that exercises a real Hermes install end-to-end.
