# Installing Compound Engineering for OpenCode

Add Compound Engineering to the `plugins` array in your global or project `opencode.json`:

```json
{
  "plugins": ["compound-engineering@git+https://github.com/EveryInc/compound-engineering-plugin.git"]
}
```

On OpenCode 1.x, the config key is `plugin` (singular):

```json
{
  "plugin": ["compound-engineering@git+https://github.com/EveryInc/compound-engineering-plugin.git"]
}
```

Restart OpenCode after changing the config. The plugin registers the Compound Engineering skills and `/commands` directly; no Bun installer or generated skill copy is required.

To pin a release, add a tag. Replace `X.Y.Z` with the release you want — see the [releases page](https://github.com/EveryInc/compound-engineering-plugin/releases) for available tags:

```json
{
  "plugins": ["compound-engineering@git+https://github.com/EveryInc/compound-engineering-plugin.git#compound-engineering-vX.Y.Z"]
}
```

## Local Development

From this checkout, point OpenCode at the package path:

```json
{
  "plugins": ["/path/to/compound-engineering-plugin"]
}
```

Restart OpenCode after changing the package source. Opening this checkout as an OpenCode project also works without any config entry: OpenCode auto-discovers `.opencode/plugins/compound-engineering.js`.
