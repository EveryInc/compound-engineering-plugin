# `.claude/launch.json` schema

Polish reads `.claude/launch.json` at the repo root to resolve the dev-server start command. The schema is a subset of VS Code's `launch.json` format — chosen because Claude Code, Cursor, and VS Code all understand it and because users often already have one for editor integration. `.vscode/launch.json` is not read; extra VS Code fields (`type`, `request`, `console`, …) are ignored, not an error.

## Fields polish consumes

Configurations live under a top-level `configurations` array (see the example below).

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | yes (when multiple configurations) | Used to disambiguate when the array has more than one entry. Polish asks the user to pick by `name`. |
| `runtimeExecutable` | yes | The binary polish spawns (e.g., `bin/dev`, `npm`, `overmind`, `bun`). |
| `runtimeArgs` | no | Array of arguments passed to `runtimeExecutable`. Default: empty array. |
| `port` | yes | The port the dev server will listen on. Polish probes `http://localhost:<port>` for reachability and uses it for the IDE browser handoff. |
| `cwd` | no | Repo-relative working directory for the dev server. Default: repo root. Useful for monorepos (`apps/web`, `packages/frontend`). |
| `env` | no | Additional environment variables for the dev-server process. Default: inherit polish's environment. |

## Example

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

Same shape for every framework — vary `name`, `runtimeExecutable`, `runtimeArgs`, and `port` per the framework table in SKILL.md (e.g. `overmind` + `["start", "-f", "Procfile.dev"]`, or `npm` + `["run", "dev"]` on 5173 for Vite).
