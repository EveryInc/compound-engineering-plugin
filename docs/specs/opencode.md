# OpenCode Spec (Config, Agents, Plugins)

Last verified: 2026-07-27

## Primary sources

```
https://opencode.ai/docs/config/
https://opencode.ai/docs/tools
https://opencode.ai/docs/permissions
https://opencode.ai/docs/plugins/
https://opencode.ai/docs/agents/
https://opencode.ai/docs/commands/
https://opencode.ai/docs/skills
https://opencode.ai/config.json
```

## Config files and precedence

- OpenCode supports JSON and JSONC configs.
- Config sources are merged rather than replaced, with global and project config both participating in the final config.
- Global config is stored at `~/.config/opencode/opencode.json`, and project config is `opencode.json` in the project root.
- Custom config file and directory can be provided via `OPENCODE_CONFIG` and `OPENCODE_CONFIG_DIR`.
- The `.opencode` and `~/.config/opencode` directories use plural subdirectory names (`agents/`, `commands/`, `modes/`, `plugins/`, `skills/`, `tools/`, `themes/`).

## Core config keys

- `model` and `small_model` set the primary and lightweight models; `provider` configures provider options.
- `tools` is still supported but deprecated as of OpenCode v1.1.1; permissions are now the canonical control surface.
- `permission` controls tool approvals and can be configured globally or per tool, including pattern-based rules.
- `mcp`, `instructions`, `disabled_providers`, `enabled_providers`, and `plugin` are supported config sections.
- `plugin` can list npm packages to load at startup.
- `skills.paths` and `skills.urls` can add extra skill discovery locations, but CE should not depend on them until the layout is smoke-tested locally with OpenCode.

## Tools

- OpenCode ships with built-in tools, and permissions determine whether each tool runs automatically, requires approval, or is denied.
- Tools are enabled by default; permissions provide the gating mechanism.

## Permissions

- Permissions resolve to `allow`, `ask`, or `deny` and can be configured globally or per tool, with pattern-based rules.
- Defaults are permissive, with special cases such as `.env` file reads.
- Agent-level permissions override the global permission block.

## Agents

- Agents can be configured in `opencode.json` or as markdown files in `~/.config/opencode/agents/` or `.opencode/agents/`.
- Agent config supports `mode`, `model`, `variant`, `temperature`, `top_p`, `hidden`, `steps`, `options`, `permission`, and other schema fields. `tools` still exists but is deprecated.
- `mode` can be `primary`, `subagent`, or `all`; omitted mode defaults to `all`.
- `hidden: true` hides subagents from the `@` autocomplete menu.
- `permission.task` controls which subagents an agent may invoke.
- Model IDs use the `provider/model-id` format.

## Skills

- Skills are reusable `SKILL.md` definitions loaded on demand through OpenCode's native `skill` tool.
- OpenCode searches direct child skill directories in its built-in roots:
  - `.opencode/skills/<name>/SKILL.md`
  - `~/.config/opencode/skills/<name>/SKILL.md`
  - `.claude/skills/<name>/SKILL.md`
  - `~/.claude/skills/<name>/SKILL.md`
  - `.agents/skills/<name>/SKILL.md`
  - `~/.agents/skills/<name>/SKILL.md`
- The config schema also exposes `skills.paths` and `skills.urls` for extra skill sources. Do not switch CE to those until tested against a local OpenCode install; direct `~/.config/opencode/skills/<name>/SKILL.md` remains the stable writer shape.
- Skill frontmatter recognizes `name`, `description`, `license`, `compatibility`, and `metadata`; unknown fields are ignored.
- Skill names must be lowercase alphanumeric with single hyphen separators and must match the directory name.

## Commands

- Commands can be configured in `opencode.json` or as Markdown files in `~/.config/opencode/commands/` or `.opencode/commands/`.
- Markdown command frontmatter can include fields such as `description`, `agent`, `model`, and `subtask`; the body becomes the prompt template.
- If a command targets an agent whose mode is `subagent`, OpenCode invokes it as a subagent by default. `subtask: true` can force subagent invocation.

## Plugins and events

- Local plugins are loaded from `.opencode/plugins/` and `~/.config/opencode/plugins/`. npm plugins can be listed in `plugin` in `opencode.json`.
- Plugins are JavaScript/TypeScript modules. Each exported plugin function receives OpenCode context and returns hooks/event handlers.
- Local plugins and custom tools can use npm dependencies declared in a `package.json` in the OpenCode config directory; OpenCode runs `bun install` at startup.

## Compound Engineering routed task adapter

- The native CE package registers `ce_task_prepare` and `ce_task` because OpenCode's native Task tool has no per-call model/variant selector. The owning workflow prepares its complete selected wave before mutation. `native` and `opencode` preparation results pass only an opaque session/role/instance-bound handle to each routed task; `external` returns CE Work to its durable external controller instead of generic `ce_task`.
- The adapter is tested against `@opencode-ai/plugin` and `@opencode-ai/sdk` `1.18.3`. At runtime it preflights observable session, agent, config, model, prompt, abort, and status APIs rather than treating an injected or package version string as server attestation.
- It selects the registered `general` agent and mirrors TaskTool permission derivation: parent-session deny and `external_directory` rules survive, the general agent's explicit `task`/`todowrite` rules suppress duplicate defaults, missing recursion denies and `experimental.primary_tools` denies are appended without exact duplicates, and `subagent_depth` is enforced before child creation.
- Missing or malformed capability data, provider/model, an unadvertised variant, any candidate `route`, or depth exhaustion is unavailable before a child prompt call. A model-less candidate prefers the selected `general` agent's configured model before the parent model.
- OpenCode `1.18.3` does not expose native Task's prompt-reference expansion through its public SDK. Routed prompts with `@file`, `@directory`, or `@agent`-shaped references fail unavailable before child creation unless a future host exposes that stable capability; the adapter does not hand-expand or silently degrade them.
- Serving identity comes only from the assistant response's `providerID`, `modelID`, and `variant`, verified against the concrete preflight provider/model/variant even when configuration used an unqualified model ID. Worker text cannot supply identity.
- Tool abort is forwarded to the child prompt. Abort, transport failure, and parent deletion remain unknown/in-flight until child abort/status or deletion proves terminality; no second candidate starts from an unproven state.
- Resolver snapshots, attempt locks, candidates, permissions, and serving claims never enter tool arguments. Only the typed adapter family, opaque selected-wave handle, and non-authoritative external comparison identifiers cross the tool boundary. Handles are process-local and cannot be recovered after plugin restart. The fixed package-owned Python wrapper invokes canonical internal OpenCode operations; ordinary generated/public resolver CLIs do not expose those operations, and public parent/finalize calls reject wrapper snapshots. Configured external CE Work routes continue only after the controller independently resolves public configuration and matches source and binding identifiers. The controller derives OpenCode origin from the parsed request and blocks omission, so converted or non-native OpenCode cannot use external execution.
- Candidate family follows the first selected ordinal. `[external, opencode]` starts at the durable controller and `[opencode, external]` starts at the native adapter. Crossing adapters later is unsupported in either direction: the controller cannot recover a process-local native handle, and the native adapter cannot transfer authoritative preflight history into the controller. Both block without skipping or reordering. Direct-input authority may advance past a preflight-unavailable external candidate only to a later in-process OpenCode/native candidate and can never dispatch externally.
- OpenCode task routing intent is accepted only from an exact-grammar `ce-routing-intent/v1` carrier at the start of direct top-level user or command input. A command carrier survives its immediately following expanded chat hook once. The in-process plugin applies accepted intent; the public Python resolver rejects forged `opencode-direct-input` provenance. Unauthorized or malformed carriers remain byte-identical, and repository/model prose has no task-recipient authority.
- A no-route or `ce-default` result returns to native Task with its exact built-in arguments. Converted OpenCode trees contain portable skills and generated resolver assets but no adapter, so configured OpenCode selectors are unavailable there.

## Notes for this repository

- The current documented global CE install root should stay `~/.config/opencode`, not `~/.agents`, to avoid conflicts with harnesses that also read `~/.agents`.
- The current CE writer shape is still appropriate in April 2026:
  - `~/.config/opencode/opencode.json`
  - `~/.config/opencode/agents/*.md`
  - `~/.config/opencode/commands/*.md` only when a source plugin ships commands
  - `~/.config/opencode/plugins/*.ts`
  - `~/.config/opencode/skills/*/SKILL.md`
- OpenCode's plugin system is useful for JS/TS hooks and custom tools, but current docs do not describe a native marketplace command that consumes CE's `.claude-plugin/marketplace.json` and installs the full skills/agents/commands payload.
- Keep the custom Bun writer until OpenCode documents a native distribution path for packaged skills and agents.
- The converter emits skills and subagent Markdown files for OpenCode but does not claim the native package's `ce_task` capability. It should not emit deprecated `tools` config; permission config is enough for non-default permission modes.
