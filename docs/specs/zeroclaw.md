# ZeroClaw Spec (Skills)

Last verified: 2026-06-30

## Primary sources

```
https://github.com/zeroclaw-labs/zeroclaw
https://github.com/zeroclaw-labs/zeroclaw/blob/master/docs/book/src/tools/skills.md
https://github.com/zeroclaw-labs/zeroclaw/blob/master/docs/book/src/agents/filesystem.md
```

## Skills (primary CE install surface)

ZeroClaw skills follow the open [Agent Skills](https://agentskills.io) standard. Each skill is a directory containing `SKILL.md` with YAML frontmatter (`name`, `description`, `version`, `author`, `tags`). ZeroClaw loads skills at agent boot from the per-agent workspace and from configured shared skill bundles.

### Discovery paths (v0.8+)

| Scope | Path | Loaded by |
| --- | --- | --- |
| Per-agent workspace (primary) | `~/.zeroclaw/agents/<alias>/workspace/skills/<name>/` | `zeroclaw agent -a <alias>` |
| Shared skill bundle | `~/.zeroclaw/shared/skills/<bundle>/<name>/` | Agents with `[agents.<alias>].skill_bundles` referencing the bundle |
| Legacy (pre-v0.8 migration) | `~/.zeroclaw/workspace/skills/` | Not used by current agent loader |

CE ships skills at `./skills/<name>/SKILL.md` in this repository. Compound Engineering does **not** copy skills into a generated tree for ZeroClaw at release time; users install from a checkout with `.zeroclaw/scripts/install-skills.sh`.

### Copy-only install (no symlinks)

ZeroClaw's skill audit rejects symlinked skill directories and symlinked files inside a skill. The CE installer copies each skill directory into the target skills path. Re-run the installer after pulling a newer CE release to refresh copies.

### Do not use `zeroclaw skills install` for CE bulk install

The ZeroClaw CLI's `skills install` command writes under `config.data_dir/skills/`. Agent sessions load from `agent_workspace_dir(alias)/skills/` (and optional shared bundles), not from `data_dir`. The CE install script copies directly into agent workspace paths instead.

### Bundled scripts

Many CE skills include `scripts/*.sh` and `scripts/*.py`. ZeroClaw blocks script-like files unless `skills.allow_scripts = true` in `~/.zeroclaw/config.toml`.

### Manual-only skills

Some CE skills set `disable-model-invocation: true` so Claude and Codex do not auto-invoke them (for example `lfg`, `ce-dogfood`, `ce-polish`). ZeroClaw's frontmatter parser does not read that field. `.zeroclaw/scripts/install-skills.sh` skips manual-only skills by default; pass `--include-manual` to copy them anyway.

## Instruction files

ZeroClaw projects commonly use root `AGENTS.md` for workspace context. CE skills reference "the project's active instructions and conventions already in your context" rather than hardcoding harness-specific filenames.

## Install commands

Default agent workspace from a checkout:

```bash
/path/to/compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --global
```

Explicit agent or all agents:

```bash
/path/to/compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --agent my-agent
/path/to/compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --agent all
```

Shared bundle (requires config — see `.zeroclaw/INSTALL.md`):

```bash
/path/to/compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --shared
```

Manual-only skills require the opt-in flag:

```bash
/path/to/compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --global --include-manual
```

After installing or updating skills, restart the agent session or gateway if the skill list does not refresh.

## Update and removal

Re-run the install script after pulling a newer CE release. The script removes prior copies before reinstalling.

To remove CE skills, delete the skill directories from the target workspace or shared bundle path.

## Subagent and tool notes

CE skills dispatch generic subagents with skill-local prompt assets under `references/agents/` and `references/personas/`. ZeroClaw's subagent and MCP capabilities vary by deployment (CLI, gateway, zerocode). Skills degrade gracefully when a primitive is unavailable — the same cross-harness posture used for OpenCode and Pi.

Bundled shell scripts in skills use the model-filled `SKILL_DIR` anchor documented in the repository's contributor instructions so paths resolve when the agent's working directory is the user's project, not the skill directory.
