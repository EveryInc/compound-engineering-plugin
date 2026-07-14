# Installing Compound Engineering for Cline

Cline loads CE through native **skills** discovery — the same `SKILL.md` directories shipped in this repository's `skills/` folder. No Bun converter or generated copy step is required.

## Extension (VS Code, Cursor, JetBrains)

1. Install the [Cline extension](https://docs.cline.bot/getting-started/installing-cline) in your editor.
2. Enable **Settings -> Features -> Enable Skills**.
3. Link CE skills globally or into your project (see below).
4. Start a new Cline task. Skills such as `ce-brainstorm` and `ce-plan` appear when their descriptions match your request.

## Install skills

From a clone of this repository:

```bash
# Global (~/.cline/skills/) — available in every project
./compound-engineering-plugin/.cline/scripts/install-skills.sh --global

# Project (.cline/skills/ in the current directory)
./compound-engineering-plugin/.cline/scripts/install-skills.sh --project
```

The script creates symlinks so Cline reads the live skill directories from your checkout. Re-run it after `git pull` to refresh links when skill folder names change. It only ever creates or replaces CE-owned symlinks (links whose target resolves under this checkout's `skills/` tree); an existing `~/.cline/skills/<name>` pointing at your own skill, a fork, or another checkout is left untouched. Default installs also remove only manual-only symlinks that are CE-owned.

Skills marked `disable-model-invocation: true` (for example `ce-dogfood`, `ce-polish`, `ce-setup`) are **not** linked by default — Cline auto-activates from description matching and has no manual-only gate, so linking them would let them fire unintentionally. Those slash commands are unavailable until you opt in:

```bash
./compound-engineering-plugin/.cline/scripts/install-skills.sh --global --include-manual
```

`--include-manual` links manual-only skills so `/ce-polish` and similar commands work, with a warning that Cline may still auto-activate them when descriptions match. Omit the flag if you do not need those workflows on Cline.

## Pin a release

Clone the tag you want, then run the install script against that checkout:

```bash
git clone --branch compound-engineering-vX.Y.Z --depth 1 \
  https://github.com/EveryInc/compound-engineering-plugin.git
./compound-engineering-plugin/.cline/scripts/install-skills.sh --global
```

Replace `X.Y.Z` with a tag from the [releases page](https://github.com/EveryInc/compound-engineering-plugin/releases).

## Local development

From your working copy:

```bash
/path/to/compound-engineering-plugin/.cline/scripts/install-skills.sh --global
```

Edit skills under `skills/` and start a new Cline task to pick up prose changes.

## Uninstall

Remove CE skill symlinks from `~/.cline/skills/` or `.cline/skills/`. Skill directory names match the folders under `skills/` (for example `ce-brainstorm`, `ce-plan`).

## Cline CLI

The Cline CLI supports separate `AgentPlugin` installs for custom tools and hooks. CE does not require a CLI plugin for its skills to work. Use the skills install script above when running Cline from the terminal.
