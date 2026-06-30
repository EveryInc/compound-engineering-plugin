# Installing Compound Engineering for Antigravity CLI (`agy`)

Antigravity installs CE as a native plugin bundle. The repository root is the plugin package: `plugin.json` plus the `skills/` directory. The committed `.agy/` subdirectory is a compatibility entry point for local checkouts that prefer an explicit bundle path.

## One-command install (recommended)

With [Antigravity CLI](https://antigravity.google) installed:

```bash
agy plugin install https://github.com/EveryInc/compound-engineering-plugin
```

Verify:

```bash
agy plugin list
agy plugin validate https://github.com/EveryInc/compound-engineering-plugin
```

No clone step is required. `agy` stages the plugin under `~/.gemini/antigravity-cli/plugins/compound-engineering/`.

## Local checkout install

Clone first when you need a specific branch, tag, or unpublished changes:

```bash
git clone https://github.com/EveryInc/compound-engineering-plugin
agy plugin install ./compound-engineering-plugin
```

Or install the bundled `.agy/` entry point (equivalent manifest via symlink):

```bash
agy plugin install ./compound-engineering-plugin/.agy
```

## Pin a release

Install from a release tag:

```bash
git clone --branch compound-engineering-vX.Y.Z --depth 1 \
  https://github.com/EveryInc/compound-engineering-plugin.git
agy plugin install ./compound-engineering-plugin
```

Replace `X.Y.Z` with a tag from the [releases page](https://github.com/EveryInc/compound-engineering-plugin/releases).

## Local development

From your working copy:

```bash
agy plugin install "$PWD"
agy plugin validate "$PWD"
```

Edit skills under `skills/` and restart `agy` or start a new session to pick up prose changes.

## Context files

`agy` reads `GEMINI.md` and `AGENTS.md` as workspace context. Run `agy` from a project that includes those files, or from this checkout when developing CE itself.

## Uninstall

```bash
agy plugin uninstall compound-engineering
```

## Legacy Gemini CLI import

If you previously installed CE under Gemini CLI:

```bash
agy plugin import gemini
```

Prefer the native install commands above for new setups.
