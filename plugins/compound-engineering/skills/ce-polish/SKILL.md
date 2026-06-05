---
name: ce-polish
description: "Start the dev server, open the feature in a browser, and iterate on improvements together. Manual invocation only — type /ce-polish to run it."
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

### 1.1 Check for `.claude/launch.json`

Run `bash scripts/read-launch-json.sh`. If it finds a configuration, use it — the user already told us how to start the project.

### 1.2 Auto-detect (when no launch.json)

Run `bash scripts/detect-project-type.sh` to identify the framework.

Route by type to the matching recipe reference for start command and port defaults:

| Type | Recipe |
|------|--------|
| `rails` | `references/dev-server.md` §`## rails` |
| `next` | `references/dev-server.md` §`## next` |
| `vite` | `references/dev-server.md` §`## vite` |
| `nuxt` | `references/dev-server.md` §`## nuxt` |
| `astro` | `references/dev-server.md` §`## astro` |
| `remix` | `references/dev-server.md` §`## remix` |
| `sveltekit` | `references/dev-server.md` §`## sveltekit` |
| `procfile` | `references/dev-server.md` §`## procfile` |
| `unknown` | Ask the user how to start the project |

For framework types that need a package manager, run `bash scripts/resolve-package-manager.sh` and substitute the result into the start command.

Resolve the port with `bash scripts/resolve-port.sh --type <type>`.

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
- When the user asks to check something → use `agent-browser` to screenshot or inspect the page
- When the user says they're done → commit the fixes and stop

No checklist. No envelope. Just conversation.

## References

Reference files (loaded on demand):
- `references/launch-json-schema.md` — launch.json schema + per-framework stubs
- `references/ide-detection.md` — host IDE detection and browser-handoff
- `references/dev-server-detection.md` — port resolution documentation
- `references/dev-server.md` — unified dev-server recipes (rails, next, vite, nuxt, astro, remix, sveltekit, procfile)

Scripts (invoked via `bash scripts/<name>`):
- `scripts/read-launch-json.sh` — launch.json reader
- `scripts/detect-project-type.sh` — project-type classifier
- `scripts/resolve-package-manager.sh` — lockfile-based package-manager resolver
- `scripts/resolve-port.sh` — port resolution cascade
