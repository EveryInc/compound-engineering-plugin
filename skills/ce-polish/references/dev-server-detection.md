# Dev-server port detection

Port resolution runs via `scripts/resolve-port.sh`. This document explains the probe order, framework defaults, and intentional divergences from the `test-browser` skill's inline cascade.

This cascade runs **only when** `.claude/launch.json` is absent or has no `port` field for the resolved configuration. When `launch.json` specifies a port, use it verbatim and skip this cascade entirely.

## Priority order

1. **Explicit `--port` flag** -- if the caller passed `--port <n>`, use it directly.
2. **Framework config files** -- `next.config.*`, `vite.config.*`, `nuxt.config.*`, `astro.config.*` scanned with a conservative regex matching only numeric literal port values. Variable references (`process.env.PORT`, `getPort()`) are deliberately not matched.
3. **Rails `config/puma.rb`** -- grep for `port <n>`.
4. **`Procfile.dev`** -- web line scanned for `-p <n>` / `--port <n>` / `-p=<n>` / `--port=<n>`.
5. **`docker-compose.yml`** -- line-anchored grep for `"<n>:<n>"` port mapping patterns. Not full YAML parsing.
6. **`package.json`** -- `dev`/`start` scripts scanned for `--port <n>` / `-p <n>` / `--port=<n>` / `-p=<n>`.
7. **`.env` files** -- checked in override order: `.env.local` -> `.env.development` -> `.env` (first hit wins). Parses `PORT=<n>` with quote stripping and comment truncation.
8. **Framework default lookup table** -- see table below.

## Framework defaults

| Framework | Default port |
|-----------|-------------|
| Rails | 3000 |
| Next.js | 3000 |
| Nuxt | 3000 |
| Remix (classic) | 3000 |
| Vite | 5173 |
| SvelteKit | 5173 |
| Astro | 4321 |
| Procfile | 3000 |
| Unknown | 3000 |

## Sync-note block

`resolve-port.sh` and the `test-browser` skill's inline cascade overlap in purpose but diverge in two specific ways (a, b) and share one deliberate omission (c). These choices are intentional -- do not "fix" one to match the other without understanding the rationale.

**(a) Quote stripping on `.env` values.** `resolve-port.sh` strips surrounding `"` and `'` from `PORT=` values (so `PORT="3001"` resolves to `3001`). The `test-browser` inline cascade does not strip quotes. The script version is more robust for real-world `.env` files where quoting is common.

**(b) Comment stripping on `.env` values.** `resolve-port.sh` truncates at `#` after trimming whitespace (so `PORT=3001 # dev only` resolves to `3001`). The `test-browser` inline cascade does not strip comments. Same rationale: real `.env` files frequently contain inline comments.

**(c) No instruction-file port grep (shared).** Neither `resolve-port.sh` nor the `test-browser` inline cascade greps `AGENTS.md`/`CLAUDE.md` for port references. Instruction files carry natural language that may mention ports in contexts unrelated to the dev server (documentation, examples, troubleshooting), producing false positives that are hard to debug; the filename is also harness-specific. Framework config files and `.env` are the reliable sources of truth. A skill may still honor a dev-server port the agent reads from its in-context project instructions, but it does not shell-grep named instruction files.
