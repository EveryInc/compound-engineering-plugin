# Installing Compound Engineering for Antigravity

Antigravity installs CE as a native plugin bundle. The repository ships a dedicated `.antigravity-plugin/plugin.json` manifest (which takes precedence over root `plugin.json`) alongside the root `skills/` directory and `assets/logo.png`. The committed `.agy/` subdirectory is a compatibility entry point for local checkouts that prefer an explicit bundle path.

## One-command install (recommended)

With [Antigravity CLI](https://antigravity.google) (`agy`) installed:

```bash
agy plugin install https://github.com/EveryInc/compound-engineering-plugin
```

Verify:

```bash
agy plugin list
agy plugin validate https://github.com/EveryInc/compound-engineering-plugin
```

No clone step is required. `agy` stages the plugin under `~/.gemini/config/plugins/compound-engineering/`, which automatically syncs across the Antigravity App, CLI, and IDE.

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

For workspace-scoped installs in the Antigravity App or IDE, place the plugin directory inside `<workspace-root>/.agents/plugins/`.

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

Edit skills under `skills/` and restart `agy` (or run `/skills reload` / start a new session) to pick up prose changes.

## Uninstall

```bash
agy plugin uninstall compound-engineering
```

## Upgrading from a legacy Gemini CLI import

If `agy plugin list` shows `compound-engineering` with `Source: gemini-cli`, uninstall the imported copy and install natively from GitHub:

```bash
agy plugin uninstall compound-engineering
agy plugin install https://github.com/EveryInc/compound-engineering-plugin
```
