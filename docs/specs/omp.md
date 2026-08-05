# oh-my-pi (omp) Spec (Plugins and Skills)

Last verified: 2026-08-05 against omp 17.2.7

## Primary sources

```
https://github.com/can1357/oh-my-pi/blob/v17.2.7/README.md
https://github.com/can1357/oh-my-pi/blob/v17.2.7/docs/skills.md
https://github.com/can1357/oh-my-pi/blob/v17.2.7/docs/marketplace.md
https://github.com/can1357/oh-my-pi/blob/v17.2.7/docs/session.md
https://github.com/can1357/oh-my-pi/blob/v17.2.7/docs/config-usage.md
https://github.com/can1357/oh-my-pi/blob/v17.2.7/docs/environment-variables.md
https://github.com/can1357/oh-my-pi/blob/v17.2.7/docs/task-agent-discovery.md
```

## Plugin loading

omp discovers plugins natively. Two committed metadata surfaces in this repository cover it:

- The `package.json#pi` manifest, with `extensions` (`./.pi/extensions/compound-engineering.ts`) and `skills` (`./skills`) arrays — the same pi package metadata Pi already consumes.
- The Claude marketplace catalog at `.claude-plugin/marketplace.json`, which omp reads as a fallback when `.omp-plugin/marketplace.json` is absent. omp prefers `.omp-plugin/marketplace.json` only when that file is present; Compound Engineering deliberately ships only the Claude catalog for cross-host parity.

A dry run of `omp install` against this repository confirms both surfaces resolve. No CE converter, writer, or `--to omp` CLI target exists or is planned: per CONCEPTS.md "Native plugin surface", omp support lives in platform metadata, docs, and release validation instead of a new Converter and Writer.

## Install commands

Direct install from a path or Git URL (user scope by default):

```text
omp install https://github.com/EveryInc/compound-engineering-plugin
```

Local development link from a checkout:

```bash
omp plugin link "$PWD"
```

Marketplace flow (marketplace name `compound-engineering-plugin`, plugin name `compound-engineering`, both from `.claude-plugin/marketplace.json`):

```text
omp plugin marketplace add EveryInc/compound-engineering-plugin
omp plugin install compound-engineering@compound-engineering-plugin
```

Verify an install plan before applying it:

```text
omp install <path-or-git> --dry-run --json
```

`/reload-plugins` refreshes skills and slash commands in a live session; restart omp for tools, hooks, or extension changes to apply.

## Runtime contracts CE skills rely on

| Contract | omp behavior |
| --- | --- |
| User skill invocation | `/skill:<name>` — one command per discovered skill; NOT `/skill-name` and NOT `$skill-name` |
| Blocking questions | Built-in `ask` tool |
| Subagent dispatch | Built-in `task` tool, with worktree isolation and schema-checked results |
| Task tracking | Built-in `todo` tool |
| MCP | Native MCP server support |
| Bundled skill files | `skill://<name>/<path>` URL resolution |

## Instruction files

omp auto-loads `AGENTS.md`, walking ancestors from the current working directory. This repo's root `AGENTS.md` is already the canonical project instruction file for omp, so no CE action is needed.

## Session storage

omp writes sessions as JSONL under a session root resolved in this order:

1. `$PI_CODING_AGENT_SESSION_DIR` — direct override; files are stored flat in it.
2. `$PI_CODING_AGENT_DIR` — agent-dir override, honored for the default profile only; sessions land in `<agentDir>/sessions/`.
3. `$HOME/${PI_CONFIG_DIR:-.omp}/agent/sessions/` — default location.

Named profiles (`OMP_PROFILE` or `PI_PROFILE`) relocate the root to `$HOME/${PI_CONFIG_DIR:-.omp}/profiles/<name>/agent/sessions/`.

Inside the session root, per-project buckets come in two shapes. omp 17.2.9 restored the legacy project-scoped naming scheme and removed its automatic migration ([#7646](https://github.com/can1357/oh-my-pi/issues/7646)), so both shapes occur in the wild and discovery must scan both:

- Raw (current again since 17.2.9): `-<home-relative>` for cwds under the canonical home, `-tmp-<tmp-relative>` for cwds under the temp root, and `--<abs>--` otherwise, with path separators and `:` encoded as `-` and the basename kept verbatim (spaces included).
- Hashed (intermediate releases): `<scope>-<sanitized-basename>-<sha256hex-of-canonical-cwd>`, where `scope` is `home`, `tmp`, or `abs` and the basename is sanitized (`[^a-zA-Z0-9._-]+` runs become `-`, edge dashes stripped, capped at its last 80 chars, empty falls back to `project`).

Each bucket holds `<timestamp>_<sessionId>.jsonl` files.

Every session JSONL physically begins with a fixed-width 256-byte `{"type":"title","v":1,...,"pad":"..."}` slot line, followed by a pi-shaped `{"type":"session","version":3,...,"cwd":...}` header. This title-slot-first shape distinguishes omp session files from pi session files, which start directly with the `type:"session"` header.

Known gap: XDG-relocated roots (`$XDG_DATA_HOME/omp`) are not scanned by CE's session-discovery script.
