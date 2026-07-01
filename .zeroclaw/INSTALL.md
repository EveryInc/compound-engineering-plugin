# Installing Compound Engineering for ZeroClaw

[ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw) loads CE through native **skills** discovery — the same `SKILL.md` directories shipped in this repository's `skills/` folder. No Bun converter or generated copy step is required.

## Prerequisites

1. Install ZeroClaw ([install guide](https://github.com/zeroclaw-labs/zeroclaw#install)).
2. Run `zeroclaw quickstart` so you have at least one agent (typically `default`) under `~/.zeroclaw/agents/`.
3. If you use a non-default profile, the installer follows ZeroClaw runtime precedence for the install root: `ZEROCLAW_CONFIG_DIR`, then `ZEROCLAW_DATA_DIR`, then legacy `ZEROCLAW_WORKSPACE`. Per-agent destinations honor `[agents.<alias>.workspace.path]` when set in `config.toml`.
4. Enable bundled scripts in your ZeroClaw config. Many CE skills ship `scripts/*.sh` and `scripts/*.py`; ZeroClaw's skill audit blocks script files unless you opt in:

```toml
# ~/.zeroclaw/config.toml
[skills]
allow_scripts = true
```

## Install skills

ZeroClaw v0.8+ loads skills from **per-agent workspace** paths (`~/.zeroclaw/agents/<alias>/workspace/skills/`), not the legacy `~/.zeroclaw/workspace/skills/` tree. The installer copies skill directories into the paths agents actually read.

From a clone of this repository:

```bash
# Default agent (recommended after quickstart)
./compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --global

# Explicit agent alias
./compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --agent my-agent

# Every configured agent
./compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --agent all
```

### Shared skill bundle (multi-agent hosts)

To install once under `~/.zeroclaw/shared/skills/compound_engineering/` and reference it from agent config:

```bash
./compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --shared
```

Then add to `~/.zeroclaw/config.toml`:

```toml
[skill_bundles.compound_engineering]

[agents.default]
skill_bundles = ["compound_engineering"]
```

The script **copies** skill directories (ZeroClaw rejects symlinks at audit time). It does **not** call `zeroclaw skills install` — that CLI writes to `config.data_dir/skills`, which agent sessions do not load. The installer honors `ZEROCLAW_CONFIG_DIR` when set, and refuses unknown agent aliases (run `zeroclaw quickstart` before `--global` or `--agent`).

Re-run the script after `git pull` to refresh installed copies when skill content changes.

Skills marked `disable-model-invocation: true` (for example `lfg`, `ce-dogfood`, `ce-polish`) are **not** installed by default. ZeroClaw does not honor that frontmatter field. Opt in when you need those workflows:

```bash
./compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --global --include-manual
```

## Pin a release

Clone the tag you want, then run the install script against that checkout:

```bash
git clone --branch compound-engineering-vX.Y.Z --depth 1 \
  https://github.com/EveryInc/compound-engineering-plugin.git
./compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --global
```

Replace `X.Y.Z` with a tag from the [releases page](https://github.com/EveryInc/compound-engineering-plugin/releases).

## Local development

From your working copy:

```bash
/path/to/compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --global
```

Edit skills under `skills/` and re-run the install script to refresh copies. Restart the agent session or gateway if skills do not reload immediately.

## Uninstall

Remove CE skill directories from the install target (for example `~/.zeroclaw/agents/default/workspace/skills/ce-brainstorm`). Names match folders under `skills/`.

For `--shared` installs, remove skills from `~/.zeroclaw/shared/skills/compound_engineering/` and drop the bundle reference from agent config.

## Project context

ZeroClaw reads workspace context from standard instruction files. CE skills reference "the project's active instructions and conventions already in your context" rather than hardcoding harness-specific filenames. Root `AGENTS.md` in your project is the conventional target.
