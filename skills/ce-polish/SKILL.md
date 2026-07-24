---
name: ce-polish
description: "Start the dev server, inspect the feature in browser, and iterate on polish."
disable-model-invocation: true
argument-hint: "[PR number, branch name, or blank for current branch]"
---

# Polish

Start the dev server, open the feature in a browser, and iterate. You use the feature, say what feels off, and fixes happen.

## Branch

1. If a PR number or branch name was provided, check it out (probe for existing worktrees first).
2. If blank, use the current branch.
3. Verify the current branch is not main/master.

## Start the server

Each block below sets `SKILL_DIR` inline (shell state does not persist between Bash calls) — fill it with the directory you loaded this `ce-polish` SKILL.md from, and keep the trailing `;`.

Read `.claude/launch.json` at the repo root first. If it yields a configuration, use it and skip auto-detection.

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/read-launch-json.sh"
```

Its shape and the fields polish consumes are in `references/launch-json-schema.md`.

With no launch.json, auto-detect. Identify the framework:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/detect-project-type.sh"
```

Resolve the package manager for the JS frameworks — it prints the binary on line 1 and its args on line 2 (`npm` + `run dev`, `pnpm` + `dev`, `bun` + `run dev`), which together are the `<pm> run dev` in the table below:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/resolve-package-manager.sh"
```

Resolve the port — this runs the whole cascade (framework config, `config/puma.rb`, `Procfile.dev`, `docker-compose.yml`, `package.json`, `.env*`, framework default) and prints one number:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/resolve-port.sh" --type <type>
```

The script deliberately does not grep instruction files, so if the project's active instructions in your context state a dev-server port, honor that over the script's answer.

| Type | Start command | Default port |
|------|---------------|--------------|
| `rails` | `bin/dev` — the Rails 7+ "start everything" entry point; it wraps `foreman start -f Procfile.dev`, so read `Procfile.dev` for the real command when `bin/dev` is missing or not executable | 3000 |
| `procfile` | `overmind start -f Procfile.dev`; fall back to `foreman start -f Procfile.dev`, and if both are missing ask the user for the start command | 3000 |
| `next` | `<pm> run dev` | 3000 |
| `nuxt` | `<pm> run dev` | 3000 |
| `remix` | `<pm> run dev` — classic Remix only (`remix.config.*` present) | 3000 |
| `vite` | `<pm> run dev` — also where Remix v2 lands, since Remix on Vite has no `remix.config.*` | 5173 |
| `sveltekit` | `<pm> run dev` | 5173 |
| `astro` | `<pm> run dev` | 4321 |
| `unknown` | Ask the user how to start the project | 3000 |

Gotchas, mostly so you don't debug a non-bug:

- **Rails bundler path:** if `bin/dev` fails with a load-path error, retry `bundle exec bin/dev`.
- **HTTPS dev server:** `rails s --ssl` serves over `https://`, but the probe, the handoff, and the printed URL are all `http://localhost:<port>` and `.claude/launch.json` has no scheme field. The probe failing against a healthy HTTPS server is expected — tell the user to open `https://localhost:<port>` rather than investigating.
- **Stale overmind socket:** if overmind was already running, a restart can fail with "connection refused" until the stale `.overmind.sock` is removed (or `OVERMIND_SOCKET` is pointed at a per-run path).
- **`Procfile.dev` over `Procfile`:** the production Procfile usually differs; always prefer `Procfile.dev`.
- **Multiple web processes:** polish can open only one URL, so a Procfile splitting API and frontend needs an explicit `.claude/launch.json` to select which process is the dev server.
- **Monorepos:** a root `run dev` often fans out to several packages — set `cwd` (e.g. `apps/web`) in `.claude/launch.json`.
- **Vite host binding:** Vite binds `127.0.0.1`, so under a devcontainer or WSL it needs `--host 0.0.0.0` in `runtimeArgs`.

Start the dev server in the background, log output to a temp file. Probe `http://localhost:<port>` for up to 30 seconds. If it doesn't come up, show the last 20 lines of the log and ask the user what to do.

Load `references/ide-detection.md` for the env-var probe table. Open the browser using the IDE's mechanism (Claude Code → `open`, Cursor → Cursor browser, VS Code → Simple Browser).

Tell the user:
```
Dev server running on http://localhost:<port>
Browse the feature and tell me what could be better.
```

## Iterate

- When the user describes something to fix → make the change, the dev server hot-reloads
- When the user asks to check something → use a browser-automation capability to screenshot or inspect the page; prefer `agent-browser` if it's installed, otherwise use whatever the host exposes
- When the user says they're done → commit the fixes and stop

No checklist. No envelope. Just conversation.
