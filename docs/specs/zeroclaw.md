# ZeroClaw Spec (Skills)

Last verified: 2026-06-30

## Primary sources

```
https://github.com/zeroclaw-labs/zeroclaw
https://github.com/zeroclaw-labs/zeroclaw/blob/master/docs/book/src/tools/skills.md
https://github.com/zeroclaw-labs/zeroclaw/blob/master/docs/book/src/agents/filesystem.md
```

## Skills (primary CE install surface)

ZeroClaw skills follow the open [Agent Skills](https://agentskills.io) standard. Each skill is a directory containing `SKILL.md` with YAML frontmatter (`name`, `description`, `version`, `author`, `tags`). ZeroClaw loads skills from the agent workspace at install time and injects them into the agent prompt (full or compact mode per config).

### Discovery paths

| Scope | Path |
| --- | --- |
| Default workspace | `~/.zeroclaw/workspace/skills/<name>/` |
| Per-agent workspace | `~/.zeroclaw/agents/<alias>/workspace/skills/<name>/` |
| Shared bundles (config) | `<install>/shared/skills/<bundle>/` |

CE ships skills at `./skills/<name>/SKILL.md` in this repository. Compound Engineering does **not** copy skills into a generated tree for ZeroClaw at release time; users install from a checkout with `.zeroclaw/scripts/install-skills.sh`.

### Copy-only install (no symlinks)

ZeroClaw's skill audit rejects symlinked skill directories and symlinked files inside a skill. The CE installer copies each skill directory into the target skills path. Re-run the installer after pulling a newer CE release to refresh copies.

### Bundled scripts

Many CE skills include `scripts/*.sh` and `scripts/*.py`. ZeroClaw blocks script-like files unless `skills.allow_scripts = true` in `~/.zeroclaw/config.toml`. Without that setting, `zeroclaw skills install` fails audit for script-bearing CE skills.

### Manual-only skills

Some CE skills set `disable-model-invocation: true` so Claude and Codex do not auto-invoke them (for example `lfg`, `ce-dogfood`, `ce-polish`). ZeroClaw's frontmatter parser does not read that field. `.zeroclaw/scripts/install-skills.sh` skips manual-only skills by default; pass `--include-manual` to copy them anyway.

## CLI integration

ZeroClaw exposes native skill management:

```bash
zeroclaw skills list
zeroclaw skills install /path/to/skill-dir
zeroclaw skills remove <name>
zeroclaw skills audit <name>
```

The CE install script wraps per-skill `zeroclaw skills install` when the binary is available, with a plain `cp -R` fallback.

## Instruction files

ZeroClaw projects commonly use root `AGENTS.md` for workspace context. CE skills reference "the project's active instructions and conventions already in your context" rather than hardcoding harness-specific filenames.

## Install commands

Default workspace from a checkout:

```bash
/path/to/compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --global
```

Per-agent workspace:

```bash
/path/to/compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh \
  --dir ~/.zeroclaw/agents/<alias>/workspace/skills
```

Manual-only skills require the opt-in flag:

```bash
/path/to/compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --global --include-manual
```

After installing or updating skills, restart the agent session or gateway if the skill list does not refresh.

## Update and removal

Re-run the install script after pulling a newer CE release. The script removes prior copies (via `zeroclaw skills remove` or `rm -rf`) before reinstalling.

To remove CE skills, delete the directories from the skills path or run `zeroclaw skills remove <name>` for each skill id.

## Subagent and tool notes

CE skills dispatch generic subagents with skill-local prompt assets under `references/agents/` and `references/personas/`. ZeroClaw's subagent and MCP capabilities vary by deployment (CLI, gateway, zerocode). Skills degrade gracefully when a primitive is unavailable — the same cross-harness posture used for OpenCode and Pi.

Bundled shell scripts in skills use the model-filled `SKILL_DIR` anchor documented in the repository's contributor instructions so paths resolve when the agent's working directory is the user's project, not the skill directory.
