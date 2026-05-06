---
title: "Native plugin install strategy for supported harnesses"
date: 2026-04-19
category: integrations
module: installer
problem_type: integration_decision
component: installer
symptoms:
  - "Multiple harnesses can discover the same CE skills from shared roots and create duplicates or shadowing"
  - "Some harnesses now support native Claude-compatible plugin installs, making custom Bun installs redundant"
  - "Old manual installs can leave stale skills and agents after CE renames or deprecations"
root_cause: evolving_platform_install_surfaces
resolution_type: install_strategy
severity: medium
tags:
  - install-strategy
  - native-plugins
  - legacy-cleanup
  - cursor
  - codex
  - copilot
  - droid
  - qwen
  - gemini
  - opencode
  - kiro
---

# Native Plugin Install Strategy

Last verified: 2026-04-19

This document records the intended install model by harness. The current priority is separating native marketplace installs from custom Bun installs so CE does not create duplicate or shadowing skills across tools.

## Summary

| Harness | Intended install path | Custom Bun install? | Legacy cleanup needed? | Notes |
| --- | --- | --- | --- | --- |
| Claude Code | Native plugin marketplace using existing `.claude-plugin/marketplace.json` and `plugins/compound-engineering/.claude-plugin/plugin.json` | No | Only for old/manual non-native installs, if any | Current repo shape already satisfies Claude Code. |
| Cursor | Native Cursor Plugin Marketplace using existing `.cursor-plugin/marketplace.json` and `plugins/compound-engineering/.cursor-plugin/plugin.json` | No, CE plugin install/convert target removed | No for marketplace installs; add targeted cleanup only if historical custom Cursor artifacts are confirmed | Users install from Cursor Agent chat with `/add-plugin compound-engineering` or by searching the plugin marketplace. |
| GitHub Copilot CLI | Native plugin marketplace using the same existing `.claude-plugin` metadata | No, CE plugin install/convert target removed | Yes, before or during migration from previous `.github/` custom installs | Tested manually: Copilot can install from the existing CE marketplace and load agents. |
| Factory Droid | Native plugin marketplace pointed at the CE GitHub repository | No, CE plugin install/convert target removed | Yes, before or during migration from previous `~/.factory` custom installs | Droid docs say Claude Code plugins install directly and are translated automatically; `ce-doc-review` was manually tested in Droid. |
| Qwen Code | Native extension install from the CE GitHub repository and existing Claude plugin metadata | No, CE plugin install/convert target removed | Yes, before or during migration from previous `~/.qwen` custom installs | Qwen docs say Claude Code extensions install directly from GitHub and are converted automatically; native install was manually tested on 2026-04-19. |
| OpenCode | Custom CE install to `~/.config/opencode/{skills,agents,plugins}` plus merged `opencode.json`; source commands are written only if present | Yes | Yes, every install | OpenCode plugins are JS/TS or npm hooks/tools, not a Claude-compatible marketplace install path for CE's full plugin payload. |
| Pi | Custom CE install to `~/.pi/agent/{skills,prompts,extensions}` plus MCPorter config; source commands are written only if present | Yes, until CE ships and tests a Pi package | Yes, every install | Pi has package install support, but CE has not yet packaged the compat extension, generated skills, prompts, and MCPorter config into a tested Pi package. |
| Codex | Custom CE install to `~/.codex/skills/compound-engineering/<skill>` and `~/.codex/agents/compound-engineering/<agent>.toml` | Yes, because native Codex plugins do not currently register bundled custom agents | Yes, every install | Avoid `~/.agents/skills` so Codex installs do not shadow Copilot's native plugin skills. Claude agents are converted to Codex TOML custom agents. |
| Gemini CLI | Custom CE install to `~/.gemini/{skills,agents}` for now; source commands are written only if present; native extension packaging exists but does not fit CE's current repo/package layout | Yes, until CE ships a Gemini extension root, release artifact, or dedicated distribution branch/repo | Yes, every install | Avoid `~/.agents/skills`; write normalized Gemini agents to `~/.gemini/agents`. |
| Kiro CLI | Custom CE install to project `.kiro/{skills,agents,steering,settings}` | Yes | Yes, every install; manual `cleanup --target kiro` also exists | Kiro has its own JSON agent format and project-local install root. |

Deprecated targets:

- Windsurf is no longer an active CE install, convert, or sync target. `cleanup --target windsurf` remains available only to back up old CE-owned files from previous Bun installs under `~/.codeium/windsurf/` or workspace `.windsurf/`.

Removed capabilities:

- Personal Claude Code home sync (`bunx @every-env/compound-plugin sync`) has been removed. Syncing arbitrary `~/.claude` skills, commands, agents, and MCP config across unrelated harnesses is not a bounded compatibility surface; CE only supports installing the CE plugin and cleaning up old CE-owned artifacts.

Current CE command posture:

- The `compound-engineering` plugin currently ships no Claude `commands/` files. Its workflow entry points are skills invoked with slash syntax, such as `/ce-plan`, `/ce-work`, and `/ce-doc-review`.
- The CLI still understands source plugin commands for legacy cleanup and for converting non-CE Claude plugins that still ship commands. CE install docs should not describe commands as part of the current CE payload except as legacy/source-plugin compatibility.

## Global Decision: Avoid `~/.agents` For CE-Owned Installs

Do not install CE-owned skills or agents into `~/.agents` for normal target installs.

Several harnesses read `~/.agents/skills`, but Copilot CLI gives personal/project skill roots precedence over plugin skills. A CE skill written for Codex, Gemini, Pi, or another target into `~/.agents/skills` can silently shadow the same skill from Copilot's native plugin install. That makes `~/.agents` unsafe as a shared CE-managed install root.

Use target-owned roots instead:

```text
OpenCode: ~/.config/opencode/skills/<skill>/SKILL.md
          ~/.config/opencode/agents/<agent>.md
          ~/.config/opencode/commands/*.md  # source commands only, if present
          ~/.config/opencode/opencode.json

Pi:       ~/.pi/agent/skills/<skill>/SKILL.md
          ~/.pi/agent/prompts/*.md  # source commands only, if present
          ~/.pi/agent/extensions/*.ts
          ~/.pi/agent/compound-engineering/mcporter.json

Codex:  ~/.codex/skills/compound-engineering/<skill>/SKILL.md
        ~/.codex/agents/compound-engineering/<agent>.toml

Gemini: ~/.gemini/skills/<skill>/SKILL.md
        ~/.gemini/agents/<agent>.md
        ~/.gemini/commands/*.toml  # source commands only, if present

Copilot: managed by native plugin install under ~/.copilot
Cursor:  managed by native Cursor Plugin Marketplace install
Droid:   managed by native plugin install under ~/.factory for user scope
Qwen:    managed by native extension install under ~/.qwen
```

`~/.agents/skills` remains a cleanup target only, because prior CE installs or experiments may have left shadowing skills there.

## Claude Code

### Decision

Claude Code is already satisfied by the current repo layout:

- Root marketplace: `.claude-plugin/marketplace.json`
- Plugin root: `plugins/compound-engineering/`
- Plugin manifest: `plugins/compound-engineering/.claude-plugin/plugin.json`
- Plugin components: `agents/`, `skills/`, and related files under the plugin root. Claude `commands/` would be supported if reintroduced, but CE does not currently ship them.

Users install with:

```text
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering
```

No custom Bun install or conversion should be used for Claude Code.

### Cleanup

Native Claude plugin installs are owned by Claude Code. The CE cleanup command should not delete Claude Code's plugin cache. It should only handle explicitly known old/manual CE artifacts if we discover any historical non-native Claude install path.

## Cursor

### Decision

Cursor should use the native Cursor Plugin Marketplace, not `bunx @every-env/compound-plugin install compound-engineering --to cursor`.
The custom Cursor plugin install/convert target has been removed from the CLI target registry.

The repo publishes Cursor marketplace metadata separately from the Claude marketplace:

- Root marketplace: `.cursor-plugin/marketplace.json`
- Plugin manifest: `plugins/compound-engineering/.cursor-plugin/plugin.json`

Users install from Cursor Agent chat with:

```text
/add-plugin compound-engineering
```

They can also search for "compound engineering" in the plugin marketplace.

No custom Bun install or conversion should be used for Cursor.

### Cleanup

Cursor marketplace installs are owned by Cursor. CE should not delete Cursor's plugin marketplace cache.

If we discover historical CE-owned Cursor artifacts from the old custom writer that can shadow marketplace installs, add a targeted cleanup path for those known artifacts. Do not reintroduce Cursor as an active `convert` or `install` target.

## GitHub Copilot CLI

### Decision

Copilot should use native plugin install, not `bunx @every-env/compound-plugin install compound-engineering --to copilot`.
The custom Copilot plugin install/convert target has been removed from the CLI target registry.

Copilot CLI can read:

- Marketplace manifests from `.claude-plugin/marketplace.json`
- Plugin manifests from `.claude-plugin/plugin.json`
- Plugin agents from the plugin `agents/` directory
- Plugin skills from the plugin `skills/` directory

Users install inside Copilot CLI with:

```text
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering@compound-engineering-plugin
```

Shell equivalents:

```bash
copilot plugin marketplace add EveryInc/compound-engineering-plugin
copilot plugin install compound-engineering@compound-engineering-plugin
```

Do not add a parallel `.github/plugin/marketplace.json`, `.github/plugin/plugin.json`, or generated `agents-copilot/` directory unless a real compatibility failure appears. Manual testing showed Copilot can install from the existing CE marketplace and load CE agents.

Copilot skill conflicts are not displayed like Codex duplicate skills. Copilot deduplicates skills by the `name` field in `SKILL.md` using first-found-wins precedence. Project and personal skill locations, including `~/.agents/skills`, load before plugin skills. Therefore a stale `~/.agents/skills/ce-plan/SKILL.md` with `name: ce-plan` would shadow the plugin's `ce-plan` and the plugin skill would be silently ignored.

### Cleanup

The old custom Copilot target wrote generated files under `.github/`-style output. Users who installed that way should run CE legacy cleanup before or during migration so they do not have duplicate agents or skills from both the old Bun output and the native plugin.

For Copilot, "duplicate" often means silent shadowing rather than two visible entries. Cleanup must remove CE-owned stale skills from project and personal skill roots before switching to native plugin install, otherwise users can appear to have the native plugin installed while actually running an old flat skill.

Run:

```bash
bunx @every-env/compound-plugin cleanup --target copilot
```

The cleanup command backs up known CE-owned Copilot artifacts such as:

- Generated `.github/agents/*.agent.md` files from old installs
- Generated `.github/skills/*/SKILL.md` directories from old installs
- Generated `~/.copilot/{agents,skills}` files from personal old installs
- Shared `~/.agents/skills/*` CE skills that would shadow native Copilot plugin skills
- Any tracked install-manifest entries from the old writer

It must not delete user-authored `.github/agents` or `.github/skills` content unless manifest/history proves CE ownership.

## Factory Droid

### Decision

Droid should use native plugin marketplace install, not `bunx @every-env/compound-plugin install compound-engineering --to droid`.
The custom Droid plugin install/convert target has been removed from the CLI target registry.

Users install with:

```bash
droid plugin marketplace add https://github.com/EveryInc/compound-engineering-plugin
droid plugin install compound-engineering@compound-engineering-plugin
```

Factory's docs describe GitHub marketplace installation, user/project/org plugin scopes, and direct Claude Code plugin compatibility. They explicitly say Droid can install a Claude Code plugin directly and automatically translate the format. Manual testing on 2026-04-19 confirmed Droid could run `ce-doc-review` from the CE plugin and load both the skill and agents.

This means Droid is now in the same category as Claude Code and Copilot for CE distribution: use the native marketplace/plugin install path, not a generated custom Bun install.

### Cleanup

The old custom Droid target wrote CE-owned artifacts under `~/.factory`, especially:

- `~/.factory/skills/*`
- `~/.factory/droids/*.md`
- `~/.factory/commands/*.md`
- any CE install manifest or managed backup directory created by the old writer

Before users migrate from the old Bun install to the native Droid plugin, legacy cleanup should remove or back up CE-owned generated files so the native plugin is not shadowed by stale local artifacts.

Run:

```bash
bunx @every-env/compound-plugin cleanup --target droid
```

The cleanup command must not delete Droid's native plugin cache or user-authored Droid files. It should only remove artifacts proven to be CE-owned by an install manifest, known historical CE names, or generated CE metadata.

## Qwen Code

### Decision

Qwen should use native extension install, not `bunx @every-env/compound-plugin install compound-engineering --to qwen`.
The custom Qwen plugin install/convert target has been removed from the CLI target registry.

Users install with:

```bash
qwen extensions install EveryInc/compound-engineering-plugin:compound-engineering
```

Qwen Code's extension docs say it can install Claude Code extensions directly from GitHub and convert Claude plugin metadata to Qwen extension metadata automatically. Manual testing on 2026-04-19 confirmed the CE plugin installed successfully through Qwen's native path.

This is a better fit than the old custom writer because Qwen now owns the Claude-plugin compatibility layer. The old writer duplicated that logic and did not fully rewrite CE's agent-heavy skill content into Qwen subagent invocation syntax.

### Cleanup

The old custom Qwen target wrote CE-owned artifacts under `~/.qwen`, especially:

- `~/.qwen/extensions/compound-engineering/` with CE-managed tracking keys in `qwen-extension.json`
- `~/.qwen/skills/*`
- `~/.qwen/agents/*.yaml`
- `~/.qwen/agents/*.md`
- `~/.qwen/commands/*.md`

Before users migrate from the old Bun install to the native Qwen extension, legacy cleanup should remove or back up CE-owned generated files so the native extension is not shadowed by stale local artifacts.

Run:

```bash
bunx @every-env/compound-plugin cleanup --target qwen
```

Cleanup only backs up the old extension root when it finds the CE-managed tracking keys written by the legacy writer. This avoids deleting Qwen's current native extension cache after a successful native install.

## OpenCode

### Current Platform Facts

OpenCode's current install/discovery model is file-based:

- Skills are direct child directories with `SKILL.md` under `.opencode/skills/<name>/`, `~/.config/opencode/skills/<name>/`, `.claude/skills/<name>/`, `~/.claude/skills/<name>/`, `.agents/skills/<name>/`, or `~/.agents/skills/<name>/`.
- Agents can be configured in `opencode.json` or as Markdown files under `~/.config/opencode/agents/` or `.opencode/agents/`.
- Commands can be configured in `opencode.json` or as Markdown files under `~/.config/opencode/commands/` or `.opencode/commands/`.
- Plugins are JavaScript/TypeScript modules loaded from `.opencode/plugins/` or `~/.config/opencode/plugins/`, or npm packages listed in the `plugin` option in `opencode.json`.

OpenCode has a plugin system, but it is not equivalent to Claude/Copilot/Droid plugin marketplaces. The official docs describe JS/TS hooks, custom tools, local plugin files, and npm package loading. They do not document a native marketplace command that can point at the CE GitHub repository, read `.claude-plugin/marketplace.json`, and install CE skills and agents as a complete plugin.

### Decision

Keep the custom CE OpenCode writer for now:

```text
~/.config/opencode/opencode.json
~/.config/opencode/skills/<skill>/SKILL.md
~/.config/opencode/agents/<agent>.md
~/.config/opencode/commands/*.md  # source commands only, if present
~/.config/opencode/plugins/*.ts
~/.config/opencode/compound-engineering/install-manifest.json
```

This matches OpenCode's documented global config root and lets CE convert the full Claude-authored payload: skills, agents, hooks/plugins, MCP config, and source commands if a plugin ships them. An npm OpenCode plugin could be useful later for hooks/tools, but it would not replace the need to place CE skills and agents into OpenCode's discovery roots unless OpenCode adds a richer package/install surface.

Avoid `~/.agents/skills` for CE-managed OpenCode installs for the same reason as Codex and Gemini: OpenCode can read that shared root, but Copilot can also read it and shadow native plugin skills.

### Cleanup

The OpenCode custom writer should continue to track and clean CE-owned files on every install:

- Old CE-owned `~/.config/opencode/skills/*`
- Old CE-owned `~/.config/opencode/agents/*`
- Old CE-owned `~/.config/opencode/commands/*`
- Old CE-owned `~/.config/opencode/plugins/*`
- Old CE-owned shared skills under `~/.agents/skills/*` from previous experiments or installs
- Manifest-tracked files that disappeared because a skill, agent, or command was renamed or removed

## Pi

### Current Platform Facts

Pi supports file-based skills and package installs. Its package surface can bundle skills, prompts, extensions, and related package metadata, and `pi install` can install from package sources such as npm, git, URLs, or local paths.

Pi also has shared skill discovery through `~/.agents/skills` and `.agents/skills`, but CE should not use those shared roots for the same reason as OpenCode, Codex, and Gemini: Copilot can read shared personal/project skills before plugin skills, so a CE skill installed there for Pi could shadow Copilot's native plugin install.

CE's current Pi compatibility is not a raw Claude-compatible plugin install. The converter currently:

- Copies platform-compatible CE skills.
- Converts Claude agents into generated Pi skills, because Pi does not provide a Claude-style plugin `agents/` runtime equivalent for this payload today.
- Writes a `compound-engineering-compat.ts` extension that provides compatibility tools such as subagent invocation and MCPorter access.
- Converts Claude MCP server config into `compound-engineering/mcporter.json` for MCPorter.
- Writes source commands as prompts only if a source plugin ships commands.

### Decision

Keep the custom CE Pi writer for now:

```text
~/.pi/agent/skills/<skill-name>/SKILL.md
~/.pi/agent/prompts/*.md
~/.pi/agent/extensions/compound-engineering-compat.ts
~/.pi/agent/compound-engineering/mcporter.json
~/.pi/agent/compound-engineering/install-manifest.json
~/.pi/agent/AGENTS.md  # CE-managed compatibility block
```

This is a pragmatic install target, not the desired long-term distribution shape. The long-term direction should be a real Pi package that can be installed with `pi install`, but CE should not promote that as the primary path until we package and test the full payload: copied skills, generated agent skills, prompts, the compatibility extension, MCPorter config, and cleanup behavior.

Do not install CE Pi artifacts into `~/.agents/skills`.

### Cleanup

The Pi custom writer should continue to track and clean CE-owned files on every install:

- Old CE-owned `~/.pi/agent/skills/*`
- Old CE-owned `~/.pi/agent/prompts/*`
- Old CE-owned `~/.pi/agent/extensions/*`
- Old generated agent-as-skill artifacts from prior CE installs
- Manifest-tracked files that disappeared because a skill, prompt, generated agent skill, or extension was renamed or removed

Manual cleanup is also available:

```bash
bunx @every-env/compound-plugin cleanup --target pi
```

Future Pi package work should preserve the same cleanup semantics before switching users from the current custom writer to a native `pi install` package.

## Codex

### Current Platform Facts

Current Codex docs describe user skills under `~/.agents/skills` and repo skills under `.agents/skills`. Codex also reads admin skills from `/etc/codex/skills` and system skills bundled by OpenAI. Codex supports symlinked skill folders and follows symlink targets.

Empirical note: Codex also still discovers legacy `~/.codex/skills` entries. On 2026-04-18, we created the same skill name in both `~/.agents/skills/ce-duplicate-discovery-smoke` and `~/.codex/skills/ce-duplicate-discovery-smoke`; the Codex skill picker showed both entries.

Despite current Codex docs favoring `~/.agents/skills`, CE should not write there because those files can shadow Copilot's native plugin skills. CE should use the Codex-specific compatibility root:

```text
~/.codex/skills/compound-engineering/<skill-name>/SKILL.md
```

This shape keeps CE Codex skills isolated from Copilot/Gemini shared discovery roots while still giving Codex a namespaced skill pack.

Codex also has custom agents and a plugin model:

- Custom agents are standalone TOML files under `~/.codex/agents/` or `.codex/agents/`.
- Each custom agent requires `name`, `description`, and `developer_instructions`.
- Codex only spawns subagents when explicitly asked.

Codex plugins exist, but current public distribution is still local/personal:

- Repo marketplace: `$REPO_ROOT/.agents/plugins/marketplace.json`
- Personal marketplace: `~/.agents/plugins/marketplace.json`
- Typical personal plugin storage: `~/.codex/plugins/<plugin-name>`
- Installed plugin cache: `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`
- Official public plugin publishing is still marked as coming soon.

This means Codex has a plugin model, but not yet a Copilot-style "point at GitHub marketplace repo and install globally" distribution path that is good enough to replace our CE custom install for normal users.

### What Superpowers Does

Superpowers' Codex install guide is a skill-discovery install, not a Codex plugin install:

```bash
git clone https://github.com/obra/superpowers.git ~/.codex/superpowers
mkdir -p ~/.agents/skills
ln -s ~/.codex/superpowers/skills ~/.agents/skills/superpowers
```

The real content lives under:

```text
~/.codex/superpowers
```

The discovery entry lives under:

```text
~/.agents/skills/superpowers -> ~/.codex/superpowers/skills
```

So `~/.codex/superpowers` is the backing store, and `~/.agents/skills/superpowers` is a symlink used to make Codex discover the skills. Their migration instructions also remove an old bootstrap block from `~/.codex/AGENTS.md`, which implies an earlier non-skill-discovery install path.

This is useful, but it has tradeoffs we should not copy blindly:

- It requires users to clone and update a Git repo manually.
- It uses a namespaced subfolder under `~/.agents/skills`.
- It is optimized for Codex, but `~/.agents/skills` can shadow Copilot native plugin skills.
- It works for pass-through source skills, but CE's Codex target also generates target-specific artifacts from agents/commands, transforms content, writes prompt wrappers, and manages cleanup. A raw clone plus symlink would still need a generation/cleanup step unless we intentionally drop those converted artifacts.

The useful part to emulate is the idea of isolating a plugin's files under a named folder. The part to avoid is writing CE-owned files into `~/.agents/skills` or requiring a manual clone/update workflow for normal users.

### Subfolder Decision

Do not use `~/.agents/skills` for CE Codex installs. Even if Codex discovers it, Copilot also reads it and will let those skills shadow native plugin skills.

For CE's Codex target, use a Codex-specific namespaced folder:

```text
~/.codex/skills/compound-engineering/<skill-name>/SKILL.md
```

This is not the documented modern Codex skill path, so the implementation should keep a smoke test for current Codex discovery behavior. The tradeoff is intentional: we prefer a Codex-only compatibility path over writing to a shared root that breaks Copilot plugin isolation.

### Source-of-Truth Decision

For Codex, `~/.codex` is the durable source of truth for CE-owned Codex artifacts. Keep all generated Codex artifacts under Codex-owned roots and track them with a manifest:

```text
~/.codex/skills/compound-engineering/<skill-name>/SKILL.md
~/.codex/agents/compound-engineering/<agent-name>.toml
~/.codex/compound-engineering/install-manifest.json
```

Do not create symlinks from `~/.agents/skills` to these Codex-owned files.

### Intended CE Codex Plan

For now:

- Keep a custom CE Codex install path.
- Run legacy cleanup on every custom Codex install.
- Install generated/converted skills under `~/.codex/skills/compound-engineering/<skill-name>/SKILL.md`.
- Convert Claude Markdown agents to Codex TOML custom agents under `~/.codex/agents/compound-engineering/<agent-name>.toml`.
- Name converted agents with the source category and CE agent name, for example `review-ce-correctness-reviewer` or `research-ce-repo-research-analyst`, and rewrite skill orchestration text to spawn those names.
- Track generated skills, prompts, and agents in `~/.codex/compound-engineering/install-manifest.json`.
- Keep Codex-only artifacts under `~/.codex`, such as prompt wrappers, `config.toml` MCP entries, and Codex TOML custom agents.
- Rewrite `Task`/agent references to spawn generated Codex custom agents when the referenced agent is known.
- Track an install manifest so removed skills and renamed skills can be cleaned later.
- Track historical CE artifacts from git history so old flat installs, prompt files, and converted-agent skills can be cleaned safely.

Do not require users to clone the CE repo for Codex. The CLI should continue to fetch/install from the package or branch source, then write the local Codex-compatible output.

### Smoke Test Result

On 2026-04-18, we verified the proposed Codex split with a local smoke test:

```text
~/.agents/skills/ce-codex-agent-smoke/SKILL.md
~/.codex/agents/ce-codex-agent-smoke.toml
```

The skill explicitly asked Codex to spawn the `ce_codex_agent_smoke` custom agent. Codex discovered the skill, spawned the TOML custom agent, waited for completion, and returned the expected marker:

```text
CODEX_TOML_AGENT_SMOKE_OK
```

This confirms the intended CE Codex architecture is viable: workflow skills can invoke Claude-authored agents converted to Codex TOML custom agents in `~/.codex/agents`. The skill root should now be moved from the tested `~/.agents/skills` path to the isolated CE path under `~/.codex/skills/compound-engineering`.

On 2026-04-19, we also verified that Codex discovers nested TOML custom agents under:

```text
~/.codex/agents/compound-engineering/<agent-name>.toml
```

and accepts hyphenated TOML `name` values such as `ce-codex-hyphen-toml-smoke`. CE should therefore use the nested `compound-engineering` agent root for cleanup parity with `~/.codex/skills/compound-engineering/`.

We also tested Codex native plugin-bundled agents in three shapes:

```text
plugins/<plugin>/agents/<agent>.toml
plugins/<plugin>/.codex/agents/<agent>.toml
plugins/<plugin>/.codex-plugin/plugin.json with "agents": "./agents/"
```

All installed plugin skills loaded, but spawning the bundled custom agents failed with `unknown agent_type`. Codex native plugins are therefore not a sufficient CE install path for agent-heavy workflows yet.

On the same day, we verified duplicate discovery behavior by installing two skills with the same `name`:

```text
~/.agents/skills/ce-duplicate-discovery-smoke/SKILL.md
~/.codex/skills/ce-duplicate-discovery-smoke/SKILL.md
```

Codex displayed both skill entries in the picker, one from `~/.agents/skills` and one from `~/.codex/skills`. This confirms that any old CE skills left in either root can cause visible duplicates. Cleanup must remove CE-owned stale skills from both `~/.agents/skills` and legacy flat `~/.codex/skills` before writing the namespaced `~/.codex/skills/compound-engineering` install.

Also on 2026-04-18, we tested nested skill discovery across Codex, Copilot, and Gemini with three shapes:

```text
~/.agents/skills/ce-flat-discovery-smoke/SKILL.md
~/.agents/skills/ce-nested-pack/ce-nested-discovery-smoke/SKILL.md
~/.agents/skills/ce-symlink-pack -> ~/.agents/ce-discovery-packs/ce-symlink-pack/skills
```

Results:

| Harness | Flat direct skill | Regular nested skill | Superpowers-style symlink pack |
| --- | --- | --- | --- |
| Codex | Worked | Worked | Worked |
| Copilot CLI | Worked | Not found | Not found |
| Gemini CLI | Worked | Not found | Not found |

Conclusion for shared skill roots: cross-harness `~/.agents/skills` installs only work portably when skills are direct children:

```text
~/.agents/skills/<skill-name>/SKILL.md
```

But CE should no longer install there because Copilot plugin skills can be shadowed by `~/.agents/skills`. Treat these results as cleanup/discovery context, not the target install shape.

### Future Codex Plugin Option

Codex now has a documented marketplace/plugin install path, including `codex marketplace add <source>`, but CE should not use it as the primary Codex install path yet because plugin-bundled custom agents did not register in testing.

Revisit Codex native plugins when Codex documents and supports plugin-bundled custom agents, or when the plugin installer can declare files that should be installed into the user's custom-agent roots.

Until then, Codex native plugins are useful for local development and testing skill-only packages, but not for CE's agent-heavy workflows.

## Gemini CLI

### Current Platform Facts

Gemini has two relevant install surfaces:

1. Shared/user skills:
   - Workspace skills: `.gemini/skills/` or `.agents/skills/`
   - User skills: `~/.gemini/skills/` or `~/.agents/skills/`
   - Extension skills bundled inside installed extensions
2. Extensions:
   - Installed with `gemini extensions install <source>`
   - `<source>` can be a GitHub repository URL or a local path
   - Gemini copies the extension during installation
   - Installed extensions live under `~/.gemini/extensions`
   - `gemini extensions link <path>` symlinks a local development extension for immediate iteration

Gemini extension roots require `gemini-extension.json`. An extension can bundle:

- `skills/<skill-name>/SKILL.md`
- `commands/*.toml`
- `agents/*.md` for preview subagents
- `GEMINI.md` context via `contextFileName`
- MCP server config
- hooks
- policies
- themes

For remote distribution and public gallery discovery, Gemini requires `gemini-extension.json` at the absolute root of the GitHub repository or release archive. `gemini extensions install <source>` accepts a GitHub repository URL or local path, but the documented and locally verified command does not include a monorepo `--path` option for extension installs.

Gemini subagents are Markdown files with YAML frontmatter. Local user/project agents are documented under:

```text
~/.gemini/agents/*.md
.gemini/agents/*.md
```

Extension subagents are documented under:

```text
<extension-root>/agents/*.md
```

The shared `.agents/*` alias is documented for skills, not subagents.

Gemini CLI 0.38.2 implementation confirms this: user agents resolve to `~/.gemini/agents`, project agents resolve to `.gemini/agents`, while shared aliases exist only for skill directories (`~/.agents/skills` and `.agents/skills`). Do not use `~/.agents/agents` as a shared CE agent install root for Gemini.

### Discovery Test Result

On 2026-04-18, we tested Gemini shared skill discovery with three shapes:

```text
~/.agents/skills/ce-flat-discovery-smoke/SKILL.md
~/.agents/skills/ce-nested-pack/ce-nested-discovery-smoke/SKILL.md
~/.agents/skills/ce-symlink-pack -> ~/.agents/ce-discovery-packs/ce-symlink-pack/skills
```

Gemini discovered only the flat direct skill. It did not discover the regular nested skill or the Superpowers-style symlink pack.

If `~/.agents/skills` is used manually, Gemini-compatible skills must be direct children:

```text
~/.agents/skills/<skill-name>/SKILL.md
```

CE should not use that path for managed Gemini installs because it can shadow Copilot plugin skills.

### Intended CE Gemini Plan

For now, keep a custom CE Gemini install path and write directly to Gemini-owned roots:

```text
~/.gemini/skills/<skill-name>/SKILL.md
~/.gemini/agents/<agent-name>.md
~/.gemini/commands/*.toml  # source commands only, if present
~/.gemini/compound-engineering/install-manifest.json
```

The Gemini writer should copy pass-through skills to `~/.gemini/skills`, generate normalized flat Gemini subagents in `~/.gemini/agents`, and write command TOML files under `~/.gemini/commands` if CE ships commands again.

Gemini extension distribution is already supported. The CE blocker is packaging shape: our source repo is a multi-plugin repo and the CE plugin root is `plugins/compound-engineering/`, while Gemini extension installs expect `gemini-extension.json` at the extension source root. Current Gemini extension install does not support a documented monorepo `--path` flow.

Native Gemini extension packaging should become the preferred Gemini distribution path once CE ships one of these shapes:

- a generated extension root published as the repository or release archive root
- a dedicated Gemini extension repository
- a distribution branch whose root is the Gemini extension root

That extension root should be generated/normalized, not just the Claude plugin directory with `gemini-extension.json` added, because Gemini loads direct `agents/*.md` files and validates Gemini-shaped agent frontmatter.

Open questions to validate in implementation:

- Whether Gemini supports any undocumented repository subdirectory syntax for extensions. Current docs and local help only show whole GitHub repository URLs or local paths.
- Whether Gemini preview subagents are enabled by default for all users or require settings in some versions/environments.
- How Gemini extension subagent invocation names map from nested Claude agent paths.

### Cleanup

The Gemini custom writer must clean old CE-owned artifacts so users do not see duplicates or stale converted-agent skills.

Cleanup should cover:

- Old CE-owned `.gemini/skills/*`
- Old CE-owned `.gemini/agents/*`
- Old CE-owned `.gemini/commands/*`
- Old CE-owned `~/.gemini/skills/*`
- Old CE-owned `~/.gemini/agents/*`
- Old CE-owned `~/.gemini/commands/*`
- Any CE-owned flat shared skills under `~/.agents/skills/*` from older experiments or installs
- Any future CE-owned extension install if we need to uninstall/reinstall a broken pre-release

## Sources

- Claude/Copilot marketplace metadata: `.claude-plugin/marketplace.json`
- Cursor marketplace metadata: `.cursor-plugin/marketplace.json`
- Claude plugin manifest: `plugins/compound-engineering/.claude-plugin/plugin.json`
- Cursor plugin manifest: `plugins/compound-engineering/.cursor-plugin/plugin.json`
- Copilot plugin reference: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference`
- Copilot CLI plugins overview: `https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-plugins`
- Factory Droid plugin configuration: `https://docs.factory.ai/cli/configuration/plugins`
- Factory Droid plugin build guide: `https://docs.factory.ai/guides/building/building-plugins`
- OpenCode config: `https://opencode.ai/docs/config/`
- OpenCode skills: `https://opencode.ai/docs/skills`
- OpenCode agents: `https://opencode.ai/docs/agents/`
- OpenCode commands: `https://opencode.ai/docs/commands/`
- OpenCode plugins: `https://opencode.ai/docs/plugins/`
- Pi overview: `https://buildwithpi.ai/README.md`
- Pi skills/packages: `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md`, `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md`
- Codex skills: `https://developers.openai.com/codex/skills`
- Codex plugin build/distribution docs: `https://developers.openai.com/codex/plugins/build`
- Superpowers Codex install guide: `https://github.com/obra/superpowers/blob/main/.codex/INSTALL.md`
- Gemini extension reference: `https://geminicli.com/docs/extensions/reference/`
- Gemini extension build guide: `https://geminicli.com/docs/extensions/writing-extensions/`
- Gemini skills: `https://geminicli.com/docs/cli/skills/`
- Gemini subagents: `https://geminicli.com/docs/core/subagents/`
- Gemini subagents announcement: `https://developers.googleblog.com/subagents-have-arrived-in-gemini-cli/`
