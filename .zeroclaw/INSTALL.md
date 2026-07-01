# Installing Compound Engineering for ZeroClaw

[ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw) loads CE through native **skills** discovery — the same `SKILL.md` directories shipped in this repository's `skills/` folder. No Bun converter or generated copy step is required.

## Prerequisites

1. Install ZeroClaw ([install guide](https://github.com/zeroclaw-labs/zeroclaw#install)).
2. Enable bundled scripts in your ZeroClaw config. Many CE skills ship `scripts/*.sh` and `scripts/*.py`; ZeroClaw's skill audit blocks script files unless you opt in:

```toml
# ~/.zeroclaw/config.toml
[skills]
allow_scripts = true
```

3. Run `zeroclaw quickstart` (or confirm your agent workspace) so `~/.zeroclaw/workspace/skills/` exists.

## Install skills

From a clone of this repository:

```bash
# Default workspace (~/.zeroclaw/workspace/skills/)
./compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --global

# Per-agent workspace (replace <alias> with your agent name)
./compound-engineering-plugin/.zeroclaw/scripts/install-skills.sh --dir ~/.zeroclaw/agents/<alias>/workspace/skills
```

The script **copies** skill directories into ZeroClaw's skills tree. ZeroClaw rejects symlinked skill directories at audit time, so CE does not symlink like the Cline installer.

For the default global path (`~/.zeroclaw/workspace/skills/`), the script uses `zeroclaw skills install` when the CLI is on `PATH` (security audit + copy into `config.data_dir`). Custom destinations (`--dir` or `ZEROCLAW_SKILLS_DIR`) always use direct copy — the ZeroClaw CLI has no flag to target a different skills directory.

Pass `--use-zeroclaw-cli` to require the native CLI for default global installs only.

Re-run the script after `git pull` to refresh installed copies when skill content changes.

Skills marked `disable-model-invocation: true` (for example `lfg`, `ce-dogfood`, `ce-polish`) are **not** installed by default. ZeroClaw does not honor that frontmatter field — installing them makes their instructions available like any other skill. Opt in when you need those workflows:

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

Remove CE skill directories from `~/.zeroclaw/workspace/skills/` (or your `--dir` target). Names match folders under `skills/` (for example `ce-brainstorm`, `ce-plan`). For the default global install you can also use:

```bash
zeroclaw skills remove ce-brainstorm
```

`zeroclaw skills remove` only affects skills under `config.data_dir`, not custom `--dir` targets.

## Project context

ZeroClaw reads workspace context from standard instruction files. CE skills reference "the project's active instructions and conventions already in your context" rather than hardcoding harness-specific filenames. Root `AGENTS.md` in your project is the conventional target.
