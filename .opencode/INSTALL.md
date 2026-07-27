# Installing Compound Engineering for OpenCode

Add Compound Engineering to the `plugin` array in your global or project `opencode.json`:

```json
{
  "plugin": ["compound-engineering@git+https://github.com/EveryInc/compound-engineering-plugin.git"]
}
```

Restart OpenCode after changing the config. The OpenCode plugin registers the Compound Engineering skills directory and the host-owned `ce_task` routing adapter directly; no Bun installer or generated skill copy is required. The adapter is the supported path for per-dispatch provider/model and effort/variant selection. Converter-produced OpenCode skill trees do not include this native adapter and classify configured OpenCode selectors as unavailable rather than claiming they ran.

To pin a release, add a tag. Replace `X.Y.Z` with the release you want — see the [releases page](https://github.com/EveryInc/compound-engineering-plugin/releases) for available tags:

```json
{
  "plugin": ["compound-engineering@git+https://github.com/EveryInc/compound-engineering-plugin.git#compound-engineering-vX.Y.Z"]
}
```

## Local Development

From this checkout, point OpenCode at the package path:

```json
{
  "plugin": ["/path/to/compound-engineering-plugin"]
}
```

Restart OpenCode after changing the package source.
