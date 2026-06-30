---
name: ce-polish
description: "Start the dev server, inspect the feature in browser, and iterate on polish."
disable-model-invocation: true
argument-hint: "[PR number, branch name, or blank for current branch]"
---

# Polish

Start the dev server, open the feature in a browser, and iterate. You use the feature, say what feels off, and fixes happen.

## Phase 0: Get on the right branch

1. If a PR number or branch name was provided, check it out (probe for existing worktrees first).
2. If blank, use the current branch.
3. Verify the current branch is not main/master.

## Phase 1: Start the dev server

The scripts below ship in this skill's `scripts/` directory. The Bash tool's working directory is the user's project, not the skill directory, so a bare `scripts/<name>` path will not resolve — invoke each by the skill's own absolute path. Every runnable block below sets `SKILL_DIR` inline (shell state does not persist between Bash tool calls, so each command must carry it); replace the `<absolute path …>` placeholder with the directory you loaded this `ce-polish` SKILL.md from before running.

### 1.1 Check for `.claude/launch.json`

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>"
bash "$SKILL_DIR/scripts/read-launch-json.sh"
```

If it finds a configuration, use it — the user already told us how to start the project.

### 1.2 Auto-detect (when no launch.json)

Identify the framework:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>"
bash "$SKILL_DIR/scripts/detect-project-type.sh"
```

Route by type to the matching recipe reference for start command and port defaults:

| Type | Recipe |
|------|--------|
| `rails` | `references/dev-server-rails.md` |
| `next` | `references/dev-server-next.md` |
| `vite` | `references/dev-server-vite.md` |
| `nuxt` | `references/dev-server-nuxt.md` |
| `astro` | `references/dev-server-astro.md` |
| `remix` | `references/dev-server-remix.md` |
| `sveltekit` | `references/dev-server-sveltekit.md` |
| `procfile` | `references/dev-server-procfile.md` |
| `unknown` | Ask the user how to start the project |

For framework types that need a package manager, run the resolver and substitute the result into the start command:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>"
bash "$SKILL_DIR/scripts/resolve-package-manager.sh"
```

Resolve the port:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>"
bash "$SKILL_DIR/scripts/resolve-port.sh" --type <type>
```

### 1.3 Start the server

Start the dev server in the background, log output to a temp file. Probe `http://localhost:<port>` for up to 30 seconds. If it doesn't come up, show the last 20 lines of the log and ask the user what to do.

### 1.4 Open in browser

Load `references/ide-detection.md` for the env-var probe table. Open the browser using the IDE's mechanism (Claude Code → `open`, Cursor → Cursor browser, VS Code → Simple Browser).

Tell the user:
```
Dev server running on http://localhost:<port>
Browse the feature and tell me what could be better.
```

## Phase 2: Iterate

This is the core loop. The user browses the feature and tells you what to improve. You fix it. Repeat until they're happy.

- When the user describes something to fix → make the change, the dev server hot-reloads
- When the user asks to check something → use a browser-automation capability to screenshot or inspect the page; prefer `agent-browser` if it's installed, otherwise use whatever the host exposes
- When the user says they're done → commit the fixes and stop

No checklist. No envelope. Just conversation.

## References

Reference files (loaded on demand):
- `references/launch-json-schema.md` — launch.json schema + per-framework stubs
- `references/ide-detection.md` — host IDE detection and browser-handoff
- `references/dev-server-detection.md` — port resolution documentation
- `references/dev-server-rails.md` — Rails dev-server defaults
- `references/dev-server-next.md` — Next.js dev-server defaults
- `references/dev-server-vite.md` — Vite dev-server defaults
- `references/dev-server-nuxt.md` — Nuxt dev-server defaults
- `references/dev-server-astro.md` — Astro dev-server defaults
- `references/dev-server-remix.md` — Remix dev-server defaults
- `references/dev-server-sveltekit.md` — SvelteKit dev-server defaults
- `references/dev-server-procfile.md` — Procfile-based dev-server defaults

Scripts (invoked via `bash "$SKILL_DIR/scripts/<name>"` — see Phase 1 for `SKILL_DIR`):
- `scripts/read-launch-json.sh` — launch.json reader
- `scripts/detect-project-type.sh` — project-type classifier
- `scripts/resolve-package-manager.sh` — lockfile-based package-manager resolver
- `scripts/resolve-port.sh` — port resolution cascade
