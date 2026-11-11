The loader delves into the config and leverages a robust fallback. As the maintainer put it, "we don't just parse the file, we validate every field". The entry point is `loadConfig(path)` and the default path is `~/.app/config.toml`.

```ts
const rows = fetchAll(users)
return rows.filter((r) => r.active)
```

See [the setup guide](https://example.com/docs/setup) for the flags.
