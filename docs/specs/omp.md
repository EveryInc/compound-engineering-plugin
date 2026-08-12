# oh-my-pi (omp) Spec (Plugins and Skills)

Last verified: 2026-08-05 against omp 17.2.9

## Primary sources

```
https://github.com/can1357/oh-my-pi/blob/v17.2.9/README.md
https://github.com/can1357/oh-my-pi/blob/v17.2.9/docs/skills.md
https://github.com/can1357/oh-my-pi/blob/v17.2.9/docs/marketplace.md
https://github.com/can1357/oh-my-pi/blob/v17.2.9/docs/session.md
https://github.com/can1357/oh-my-pi/blob/v17.2.9/docs/config-usage.md
https://github.com/can1357/oh-my-pi/blob/v17.2.9/docs/environment-variables.md
https://github.com/can1357/oh-my-pi/blob/v17.2.9/docs/task-agent-discovery.md
```

## Plugin loading

omp discovers plugins natively. Two committed metadata surfaces in this repository cover it:

- The `package.json#pi` manifest — the same pi package metadata Pi already consumes. omp's shared plugin loader accepts `package.json.omp || package.json.pi`, so the existing `pi` field is the discovery gate that marks this repository as a plugin package.
- The native omp marketplace catalog at `.omp-plugin/marketplace.json`, which omp reads first. `.claude-plugin/marketplace.json` remains as the Claude Code copy and as omp's fallback when `.omp-plugin/marketplace.json` is absent; the two coexist, and omp ignores the Claude copy when both are present (verified 2026-08-05: discovery output and the cached catalog both come from the `.omp-plugin` copy).

Skill loading is structural, not extension-driven: omp's skill providers scan the plugin package's root `skills/` directory (`omp-plugins` provider for npm/link installs, `claude-plugins` provider for marketplace installs). The bundled extension `.pi/extensions/compound-engineering.ts` is a **no-op on omp** — it registers skill paths through the `resources_discover` hook, and omp implements `ExtensionRunner.emitResourcesDiscover(...)` with no `AgentSession` callsites. The extension still matters in one narrow way: install validates that every declared `extensions` entry resolves and imports to a factory function, and rolls the install back if it does not. So the `pi` block is a discovery gate and an install-time validation risk, but it is not what surfaces the skills.

A dry run of `omp install` against this repository confirms the metadata surfaces resolve. No CE converter, writer, or `--to omp` CLI target exists or is planned: per CONCEPTS.md "Native plugin surface", omp support lives in platform metadata, docs, and release validation instead of a new Converter and Writer.

## Updates

omp's update checker (`checkForUpdates()`) compares the installed plugin version against the **catalog plugin-entry `version`** and permanently skips entries that lack one:

```ts
catalogVersion = catalog.plugins.find(p => p.name === parsed.name)?.version;
if (!catalogVersion || catalogVersion === installed.version) continue;
```

`.omp-plugin/marketplace.json` therefore carries a release-managed `version` on the plugin entry, bumped by release-please through the root component's `extra-files` (`$.plugins[0].version`). This is what makes `omp plugin upgrade`, the 24h catalog refresh, and `marketplace.autoUpdate` (`off` / `notify` / `auto`) see CE releases at all. Note the default `notify` mode writes update availability only to the debug log — it shows no user-facing notification — so `omp config set marketplace.autoUpdate auto` is the setting that actually keeps an install current. Verified end to end on 17.2.9: with the catalog version bumped, `omp plugin upgrade` reinstalls into a new version-keyed cache directory and repoints the `node_modules` symlink; without it, the same change reports "up to date".

Only the marketplace install path has an update story. `omp install <git-url>` (npm-style plugin install) has none — treat it as pinning a snapshot.

## Install commands

Marketplace flow — the recommended install (marketplace name `compound-engineering-plugin`, plugin name `compound-engineering`, both from `.omp-plugin/marketplace.json`):

```text
omp plugin marketplace add EveryInc/compound-engineering-plugin
omp plugin install compound-engineering@compound-engineering-plugin
```

Stay current:

```bash
omp config set marketplace.autoUpdate auto   # or: omp plugin upgrade compound-engineering@compound-engineering-plugin
```

Pin-style direct install from a path or Git URL (no update mechanism; user scope by default):

```text
omp install https://github.com/EveryInc/compound-engineering-plugin
```

Local development link from a checkout:

```bash
omp plugin link "$PWD"
```

Verify an install plan before applying it:

```text
omp install <path-or-git> --dry-run --json
```

`/reload-plugins` refreshes skills and slash commands in a live session; restart omp for tools, hooks, or extension changes to apply.

## Runtime contracts CE skills rely on

| Contract | omp behavior |
| --- | --- |
| Model-routed skill prompt | An otherwise unknown `/skill-name ...` prompt reaches the model, which can select a visible discovered skill; this is convenient, not deterministic |
| Native deterministic skill invocation | `/skill:<name>` — one registered command per discovered skill; use this for manual-only or hidden skills that are not model-visible |
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

Known gap: CE's session-history discovery does not yet support omp. The entire integration — including default, override, named-profile, and XDG-relocated roots — is deferred to [#1333](https://github.com/EveryInc/compound-engineering-plugin/pull/1333).
