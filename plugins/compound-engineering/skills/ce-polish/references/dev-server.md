# Dev-server recipes (auto-detect fallback)

This is the unified dev-server recipe file. When `detect-project-type.sh` identifies a framework and there is no `.claude/launch.json`, read the matching section below.

## astro

### Signature

- `astro.config.js`, `astro.config.mjs`, or `astro.config.ts` exists
- `package.json` contains an `astro` dependency

### Start command

Standard:

```bash
npm run dev
```

The `dev` script in `package.json` typically wraps `astro dev`. Also valid (read `package.json` scripts to confirm which the project uses):

```bash
pnpm dev
yarn dev
bun run dev
```

Prefer the package manager indicated by the lockfile:
- `pnpm-lock.yaml` -> `pnpm dev`
- `yarn.lock` -> `yarn dev`
- `bun.lock` / `bun.lockb` -> `bun run dev`
- `package-lock.json` or none -> `npm run dev`

### Port

Default: `4321`. Astro respects `--port <port>` and the `server.port` field in `astro.config.*`. Overrides follow the cascade in `references/dev-server-detection.md`.

### Stub generation

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Astro dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 4321
    }
  ]
}
```

Substitute the resolved package manager (`npm` / `pnpm` / `yarn` / `bun`) and port.

### Common gotchas

- **SSR vs SSG:** `astro dev` runs identically for both output modes; the difference only matters at build time. Polish does not need to distinguish between them.
- **Astro config takes precedence over Vite config:** Astro uses Vite under the hood but ships its own config file. The `astro` type takes precedence over `vite` when both `astro.config.*` and `vite.config.*` exist. This is rare -- Astro projects do not usually have a separate Vite config file.
- **Dev toolbar (Astro 4+):** Astro 4+ includes a dev toolbar that adds overlay UI in the browser. It does not affect port binding or URL routing -- polish can ignore it.

## next

### Signature

- `next.config.js`, `next.config.mjs`, `next.config.ts`, or `next.config.cjs` exists
- `package.json` contains a `next` dependency

### Start command

Standard:

```bash
npm run dev
```

Also valid (read `package.json` scripts to confirm which the project uses):

```bash
pnpm dev
yarn dev
bun run dev
```

Prefer the package manager indicated by the lockfile:
- `pnpm-lock.yaml` -> `pnpm dev`
- `yarn.lock` -> `yarn dev`
- `bun.lock` / `bun.lockb` -> `bun run dev`
- `package-lock.json` or none -> `npm run dev`

### Port

Default: `3000`. Next.js respects `-p <port>` / `--port <port>` and the `PORT` env var. Overrides follow the cascade in `references/dev-server-detection.md`.

### Turbopack

Next.js 14+ supports `--turbo` (and 15+ makes it default). If the `dev` script in `package.json` includes `--turbo`, preserve it. Turbopack changes reload behavior but not port or URL conventions.

### Stub generation

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

Substitute the resolved package manager (`npm` / `pnpm` / `yarn` / `bun`) and port.

### Common gotchas

- **App Router vs Pages Router:** dev-server behavior is the same; polish doesn't care.
- **Monorepo roots:** in a pnpm/Turborepo monorepo, `npm run dev` at the root typically fans out to multiple packages. Users should set `cwd` in `.claude/launch.json` to the specific Next app (`cwd: "apps/web"`).
- **Env loading:** `.env.local` is loaded automatically by Next; polish does not need to export it.

## nuxt

### Signature

- `nuxt.config.js`, `nuxt.config.mjs`, or `nuxt.config.ts` exists
- `package.json` contains a `nuxt` dependency

### Start command

Standard:

```bash
npm run dev
```

Also valid (read `package.json` scripts to confirm which the project uses):

```bash
pnpm dev
yarn dev
bun run dev
```

Prefer the package manager indicated by the lockfile:
- `pnpm-lock.yaml` -> `pnpm dev`
- `yarn.lock` -> `yarn dev`
- `bun.lock` / `bun.lockb` -> `bun run dev`
- `package-lock.json` or none -> `npm run dev`

### Port

Default: `3000`. Nuxt respects `--port <port>` and the `PORT` env var. Overrides follow the cascade in `references/dev-server-detection.md`.

### Stub generation

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Nuxt dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

Substitute the resolved package manager (`npm` / `pnpm` / `yarn` / `bun`) and port.

### Common gotchas

- **Nitro server engine:** Nitro (Nuxt's server engine) adds its own dev server behind Nuxt's; polish only cares about the Nuxt port. Do not probe the Nitro internal port separately.
- **Port auto-increment:** Nuxt auto-increments the port if 3000 is already taken (unlike Next.js which errors). Polish's kill-by-port step handles this by reclaiming the port before starting, so the auto-increment behavior does not cause issues in practice.
- **Nuxt 3 vs Nuxt 2:** Nuxt 3 uses `nuxt.config.ts`, Nuxt 2 uses `nuxt.config.js` -- both are detected by the signature check. The dev-server command and port defaults are the same across both versions.

## procfile

### Signature

- `Procfile` or `Procfile.dev` exists at the repo root
- `bin/dev` is **not** present (if it is, use the Rails recipe)

### Start command

Prefer `overmind` when available — it handles socket files, supports hot-restart per process, and is the community default for multi-process dev:

```bash
overmind start -f Procfile.dev
```

Fallback to `foreman` when `overmind` is not installed:

```bash
foreman start -f Procfile.dev
```

If both are missing, prompt the user for the start command rather than guessing.

### Port

Default: `3000`. Procfile-based projects list their processes in `Procfile.dev`, so the authoritative port comes from the `web:` line:

```text
web: bundle exec puma -p 3000 -C config/puma.rb
worker: bundle exec sidekiq
```

Parse the `web:` line for `-p <n>` or `--port <n>`. If neither is present, fall through to the cascade in `references/dev-server-detection.md`.

### Stub generation

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Overmind dev",
      "runtimeExecutable": "overmind",
      "runtimeArgs": ["start", "-f", "Procfile.dev"],
      "port": 3000
    }
  ]
}
```

Substitute `foreman` if `overmind` is unavailable on the user's machine — the stub represents what the user will run, not a canonical recipe.

### Common gotchas

- **Socket files:** `overmind` writes a socket to `.overmind.sock` by default. Polish's kill-by-port logic reclaims the port but does not clean up the socket. If overmind is already running and polish restarts it, the new process may fail with "connection refused" until the stale socket is removed. The `OVERMIND_SOCKET` env var can redirect the socket to a per-run path if needed.
- **Procfile vs Procfile.dev:** production and development Procfiles often differ. Always prefer `Procfile.dev` for polish.
- **Multiple web processes:** some Procfiles split web traffic across multiple processes (API + frontend). Polish can only open one URL — users with multi-web setups should author `.claude/launch.json` explicitly to select which process is "the dev server" for polish.

## rails

### Signature

- `bin/dev` exists and is executable
- `Gemfile` exists

### Start command

```bash
bin/dev
```

`bin/dev` is the Rails 7+ convention for "start everything" (web + assets watcher + optional workers). It is a one-liner script that invokes `foreman start -f Procfile.dev` under the hood, so `Procfile.dev` is the canonical place to read the *actual* command if `bin/dev` is missing or non-executable.

### Port

Default: `3000`. Overrides follow the cascade in `references/dev-server-detection.md`:
1. `Procfile.dev` `web:` line may contain `-p <n>`
2. `config/puma.rb` may bind to a non-default port
3. `.env` / `.env.development` `PORT=<n>`
4. `AGENTS.md` / `CLAUDE.md` project instructions

### Stub generation for `.claude/launch.json`

When the user accepts "Save this as `.claude/launch.json`?", emit the Rails stub from `launch-json-schema.md`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Rails dev",
      "runtimeExecutable": "bin/dev",
      "runtimeArgs": [],
      "port": 3000
    }
  ]
}
```

If the cascade resolved a non-3000 port, substitute it in the stub's `port` field before writing.

### Common gotchas

- **Bundler path:** some machines require `bundle exec bin/dev`. If `bin/dev` fails with a load-path error, fall back to `bundle exec bin/dev`.
- **Foreman vs overmind:** `Procfile` vs `Procfile.dev` often both exist. Rails' `bin/dev` resolves to `Procfile.dev`; if the project uses `overmind` explicitly, prefer `overmind start -f Procfile.dev` (see the `## procfile` section above).
- **SSL dev server:** `rails s` with `--ssl` changes the URL scheme. Polish's reachability probe uses `http://`; users with SSL dev servers should set `port` explicitly in `.claude/launch.json`.

## remix

### Signature

- `remix.config.js` or `remix.config.ts` exists (classic Remix)
- Remix 2.x+ on Vite has no `remix.config.*` -- it uses `vite.config.ts` with the Remix plugin, so it resolves as `vite` type, not `remix`

### Start command

Standard:

```bash
npm run dev
```

The `dev` script in `package.json` typically wraps `remix dev`. Also valid (read `package.json` scripts to confirm which the project uses):

```bash
pnpm dev
yarn dev
bun run dev
```

Prefer the package manager indicated by the lockfile:
- `pnpm-lock.yaml` -> `pnpm dev`
- `yarn.lock` -> `yarn dev`
- `bun.lock` / `bun.lockb` -> `bun run dev`
- `package-lock.json` or none -> `npm run dev`

### Port

Default: `3000`. Remix respects `--port <port>` flag. Classic Remix dev server also reads the `PORT` env var. Overrides follow the cascade in `references/dev-server-detection.md`.

### Stub generation

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Remix dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

Substitute the resolved package manager (`npm` / `pnpm` / `yarn` / `bun`) and port.

### Common gotchas

- **Classic vs Vite:** Classic Remix uses `remix.config.js`; new Remix (v2+) uses Vite -- detected as `vite` type, not `remix`. The `remix` type is specifically for classic Remix projects that still have a `remix.config.*` file.
- **Remix v1 vs v2 dev server:** `remix dev` in v2 starts an Express-based dev server that binds a port; `remix dev` in v1 was a watcher only (no server). Polish needs v2+ for the dev server to bind a port and respond to reachability probes.
- **Remix on Vite inherits Vite's port:** When Remix runs on Vite (no `remix.config.*`), the default port is 5173 (Vite's default), not 3000. That case is handled by the `vite` recipe, not this one.

## sveltekit

### Signature

- `svelte.config.js`, `svelte.config.mjs`, or `svelte.config.ts` exists
- `package.json` contains a `@sveltejs/kit` dependency

### Start command

Standard:

```bash
npm run dev
```

The `dev` script in `package.json` typically wraps `vite dev` via SvelteKit. Also valid (read `package.json` scripts to confirm which the project uses):

```bash
pnpm dev
yarn dev
bun run dev
```

Prefer the package manager indicated by the lockfile:
- `pnpm-lock.yaml` -> `pnpm dev`
- `yarn.lock` -> `yarn dev`
- `bun.lock` / `bun.lockb` -> `bun run dev`
- `package-lock.json` or none -> `npm run dev`

### Port

Default: `5173` (inherited from Vite). SvelteKit respects `--port <port>` flag and Vite's `server.port` config in `vite.config.ts`. Overrides follow the cascade in `references/dev-server-detection.md`.

### Stub generation

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "SvelteKit dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 5173
    }
  ]
}
```

Substitute the resolved package manager (`npm` / `pnpm` / `yarn` / `bun`) and port.

### Common gotchas

- **Vite under the hood:** SvelteKit uses Vite internally -- same port default (5173), same HMR behavior. The `sveltekit` type exists because `svelte.config.js` is a more precise signal than a generic `vite.config.ts`, allowing polish to generate a SvelteKit-specific stub name and label.
- **Adapter does not matter for dev:** `adapter-auto`, `adapter-node`, `adapter-static`, and other adapters all produce the same dev server. The adapter only affects the production build output.
- **`svelte.config.js` is the primary signature:** `svelte.config.js` always exists in SvelteKit projects, even when `vite.config.ts` also exists. This is the file that distinguishes a SvelteKit project from a plain Vite project.

## vite

### Signature

- `vite.config.js`, `vite.config.ts`, `vite.config.mjs`, or `vite.config.cjs` exists

### Start command

Standard:

```bash
npm run dev
```

The `dev` script in `package.json` typically wraps `vite` directly. Prefer the package manager indicated by the lockfile (see the `## next` section for the lockfile -> command mapping).

### Port

Default: `5173`. Vite respects `--port <n>` and the `VITE_PORT` env var. The cascade in `references/dev-server-detection.md` picks up `--port` from `package.json` scripts and `PORT` from `.env*`.

Vite's `--strictPort` flag causes the dev server to fail rather than increment to the next available port when the requested port is in use. Polish's kill-by-port step will reclaim the port before starting, so `strictPort` is not a problem in practice — but users who disable port reclamation and run multiple Vite instances will see the port auto-increment unless `strictPort: true` is set in `vite.config.ts`.

### Host binding

Vite binds to `127.0.0.1` by default. For polish running inside a devcontainer or WSL, users may need `--host 0.0.0.0` in `runtimeArgs`.

### Stub generation

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Vite dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 5173
    }
  ]
}
```

### Common gotchas

- **HMR websocket port:** Vite's HMR uses a separate websocket that inherits the dev-server port by default. If the project pins `server.hmr.port` in `vite.config.ts`, the polish reachability probe against the dev-server port still works, but the embedded browser may need additional configuration to reach HMR.
- **Framework on top of Vite:** SvelteKit, SolidStart, Qwik City, and Astro all use Vite but add their own dev scripts. The `vite` signature catches them, and `npm run dev` is the right command for all of them. Different default ports apply (SvelteKit: 5173, Astro: 4321, Qwik: 5173) — rely on the cascade to pick up the actual port from `package.json` or `.env`.
