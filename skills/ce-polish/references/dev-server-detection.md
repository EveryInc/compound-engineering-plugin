# Dev-server port detection

Port resolution runs via `scripts/resolve-port.sh`. This document explains the probe order, framework defaults, and the script's intentional parsing choices.

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

## `.env` parsing choices

`resolve-port.sh` makes two deliberate parsing choices for real-world `.env` files; do not "simplify" them away:

**(a) Quote stripping on `.env` values.** Strips surrounding `"` and `'` from `PORT=` values (so `PORT="3001"` resolves to `3001`), because quoting is common in real `.env` files.

**(b) Comment stripping on `.env` values.** Truncates at `#` after trimming whitespace (so `PORT=3001 # dev only` resolves to `3001`), because inline comments are common.

**(c) No instruction-file port grep.** The script does not grep `AGENTS.md`/`CLAUDE.md` for port references. Instruction files carry natural language that may mention ports in contexts unrelated to the dev server (documentation, examples, troubleshooting), producing false positives that are hard to debug; the filename is also harness-specific. Framework config files and `.env` are the reliable sources of truth. The agent may still honor a dev-server port it reads from its in-context project instructions, but the script does not shell-grep named instruction files.
