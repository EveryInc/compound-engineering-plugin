# Changelog

All notable changes to the `@every-env/compound-plugin` CLI tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release numbering now follows the repository `v*` tag line. Starting at `v2.34.0`, the root CLI package and this changelog stay on that shared version stream. Older entries below retain the previous `0.x` CLI numbering.

# [2.36.0](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.35.0...v2.36.0) (2026-03-11)


### Bug Fixes

* **hooks:** wrap PreToolUse handlers in try-catch to prevent parallel tool call crashes ([598222e](https://github.com/EveryInc/compound-engineering-plugin/commit/598222e11cb2206a2e3347cb5dd38cacdc3830df)), closes [#85](https://github.com/EveryInc/compound-engineering-plugin/issues/85)
* **install:** merge config instead of overwriting on opencode target ([1db7680](https://github.com/EveryInc/compound-engineering-plugin/commit/1db76800f91fefcc1bb9c1798ef273ddd0b65f5c)), closes [#125](https://github.com/EveryInc/compound-engineering-plugin/issues/125)
* **review:** add serial mode to prevent context limit crashes ([d96671b](https://github.com/EveryInc/compound-engineering-plugin/commit/d96671b9e9ecbe417568b2ce7f7fa4d379c2bec2)), closes [#166](https://github.com/EveryInc/compound-engineering-plugin/issues/166)


### Features

* **compound:** add context budget precheck and compact-safe mode ([c4b1358](https://github.com/EveryInc/compound-engineering-plugin/commit/c4b13584312058cb8db3ad0f25674805bbb91b2d)), closes [#198](https://github.com/EveryInc/compound-engineering-plugin/issues/198)
* **plan:** add daily sequence number to plan filenames ([e94ca04](https://github.com/EveryInc/compound-engineering-plugin/commit/e94ca0409671efcfa2d4a8fcb2d60b79a848fd85)), closes [#135](https://github.com/EveryInc/compound-engineering-plugin/issues/135)
* **plugin:** release v2.39.0 with community contributions ([d2ab6c0](https://github.com/EveryInc/compound-engineering-plugin/commit/d2ab6c076882a4dacaa787c0a6f3c9d555d38af0))

# [2.35.0](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.34.7...v2.35.0) (2026-03-10)


### Bug Fixes

* **test-browser:** detect dev server port from project config ([94aedd5](https://github.com/EveryInc/compound-engineering-plugin/commit/94aedd5a7b6da4ce48de994b5a137953c0fd21c3)), closes [#164](https://github.com/EveryInc/compound-engineering-plugin/issues/164)


### Features

* **compound:** add context budget precheck and compact-safe mode ([7266062](https://github.com/EveryInc/compound-engineering-plugin/commit/726606286873c4059261a8c5f1b75c20fe11ac77)), closes [#198](https://github.com/EveryInc/compound-engineering-plugin/issues/198)
* **plan:** add daily sequence number to plan filenames ([4fc6ddc](https://github.com/EveryInc/compound-engineering-plugin/commit/4fc6ddc5db3e2b4b398c0ffa0c156e1177b35d05)), closes [#135](https://github.com/EveryInc/compound-engineering-plugin/issues/135)

## [2.34.7](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.34.6...v2.34.7) (2026-03-10)


### Bug Fixes

* **test-browser:** detect dev server port from project config ([50cb89e](https://github.com/EveryInc/compound-engineering-plugin/commit/50cb89efde7cee7d6dcd42008e6060e1bec44fcc)), closes [#164](https://github.com/EveryInc/compound-engineering-plugin/issues/164)

## [2.34.6](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.34.5...v2.34.6) (2026-03-10)


### Bug Fixes

* **mcp:** add API key auth support for Context7 server ([c649cfc](https://github.com/EveryInc/compound-engineering-plugin/commit/c649cfc17f895b58babf737dfdec2f6cc391e40a)), closes [#153](https://github.com/EveryInc/compound-engineering-plugin/issues/153)

## [2.34.5](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.34.4...v2.34.5) (2026-03-10)


### Bug Fixes

* **lfg:** enforce plan phase with explicit step gating ([b07f43d](https://github.com/EveryInc/compound-engineering-plugin/commit/b07f43ddf59cd7f2fe54b2e0a00d2b5b508b7f11)), closes [#227](https://github.com/EveryInc/compound-engineering-plugin/issues/227)

## [2.34.4](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.34.3...v2.34.4) (2026-03-04)


### Bug Fixes

* **openclaw:** emit empty configSchema in plugin manifests ([4e9899f](https://github.com/EveryInc/compound-engineering-plugin/commit/4e9899f34693711b8997cf73eaa337f0da2321d6)), closes [#224](https://github.com/EveryInc/compound-engineering-plugin/issues/224)

## [2.34.3](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.34.2...v2.34.3) (2026-03-03)


### Bug Fixes

* **release:** keep changelog header stable ([2fd29ff](https://github.com/EveryInc/compound-engineering-plugin/commit/2fd29ff6ed99583a8539b7a1e876194df5b18dd6))

## [2.34.2](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.34.1...v2.34.2) (2026-03-03)

### Bug Fixes

* **release:** add package repository metadata ([eab77bc](https://github.com/EveryInc/compound-engineering-plugin/commit/eab77bc5b5361dc73e2ec8aa4678c8bb6114f6e7))

## [2.34.1](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.34.0...v2.34.1) (2026-03-03)

### Bug Fixes

* **release:** align cli versioning with repo tags ([7c58eee](https://github.com/EveryInc/compound-engineering-plugin/commit/7c58eeeec6cf33675cbe2b9639c7d69b92ecef60))

## [2.34.0] - 2026-03-03

### Added

- **Sync parity across supported providers** — `sync` now uses a shared target registry and supports MCP sync for Codex, Droid, Gemini, Copilot, Pi, Windsurf, Kiro, and Qwen, with OpenClaw kept validation-gated for skills-only sync.
- **Personal command sync** — Personal Claude commands from `~/.claude/commands/` now sync into provider-native command surfaces, including Codex prompts and generated skills, Gemini TOML commands, OpenCode command markdown, Windsurf workflows, and converted skills where that is the closest available equivalent.

### Changed

- **Global user config targets** — Copilot sync now writes to `~/.copilot/` and Gemini sync writes to `~/.gemini/`, matching current documented user-level config locations.
- **Gemini skill deduplication** — Gemini sync now avoids mirroring skills that Gemini already resolves from `~/.agents/skills`, preventing duplicate skill conflict warnings after sync.

### Fixed

- **Safe skill sync replacement** — When a real directory already exists at a symlink target (for example `~/.config/opencode/skills/proof`), sync now logs a warning and skips instead of throwing an error.

---

## [0.12.0] - 2026-03-01

### Added

- **Auto-detect install targets** — `install --to all` and `convert --to all` auto-detect installed AI coding tools and install to all of them in one command
- **Gemini sync** — `sync --target gemini` symlinks personal skills to `.gemini/skills/` and merges MCP servers into `.gemini/settings.json`
- **Sync all targets** — `sync --target all` syncs personal config to all detected tools
- **Tool detection utility** — Checks config directories for OpenCode, Codex, Droid, Cursor, Pi, and Gemini

---

## [0.11.0] - 2026-03-01

### Added

- **OpenClaw target** — `--to openclaw` converts plugins to OpenClaw format. Agents become `.md` files, commands become `.md` files, pass-through skills copy unchanged, and MCP servers are written to `openclaw-extension.json`. Output goes to `~/.openclaw/extensions/<plugin-name>/` by default. Use `--openclaw-home` to override. ([#217](https://github.com/EveryInc/compound-engineering-plugin/pull/217)) — thanks [@TrendpilotAI](https://github.com/TrendpilotAI)!
- **Qwen Code target** — `--to qwen` converts plugins to Qwen Code extension format. Agents become `.yaml` files with Qwen-compatible fields, commands become `.md` files, MCP servers write to `qwen-extension.json`, and a `QWEN.md` context file is generated. Output goes to `~/.qwen/extensions/<plugin-name>/` by default. Use `--qwen-home` to override. ([#220](https://github.com/EveryInc/compound-engineering-plugin/pull/220)) — thanks [@rlam3](https://github.com/rlam3)!
- **Windsurf target** — `--to windsurf` converts plugins to Windsurf format. Claude agents become Windsurf skills (`skills/{name}/SKILL.md`), commands become flat workflows (`global_workflows/{name}.md` for global scope, `workflows/{name}.md` for workspace), and pass-through skills copy unchanged. MCP servers write to `mcp_config.json` (machine-readable, merged with existing config). ([#202](https://github.com/EveryInc/compound-engineering-plugin/pull/202)) — thanks [@rburnham52](https://github.com/rburnham52)!
- **Global scope support** — New `--scope global|workspace` flag (generic, Windsurf as first adopter). `--to windsurf` defaults to global scope (`~/.codeium/windsurf/`), making installed skills, workflows, and MCP servers available across all projects. Use `--scope workspace` for project-level `.windsurf/` output.
- **`mcp_config.json` integration** — Windsurf converter writes proper machine-readable MCP config supporting stdio, Streamable HTTP, and SSE transports. Merges with existing config (user entries preserved, plugin entries take precedence). Written with `0o600` permissions.
- **Shared utilities** — Extracted `resolveTargetOutputRoot` to `src/utils/resolve-output.ts` and `hasPotentialSecrets` to `src/utils/secrets.ts` to eliminate duplication.

### Fixed

- **OpenClaw code injection** — `generateEntryPoint` now uses `JSON.stringify()` for all string interpolation (was escaping only `"`, leaving `\n`/`\\` unguarded).
- **Qwen `plugin.manifest.name`** — context file header was `# undefined` due to using `plugin.name` (which doesn't exist on `ClaudePlugin`); fixed to `plugin.manifest.name`.
- **Qwen remote MCP servers** — curl fallback removed; HTTP/SSE servers are now skipped with a warning (Qwen only supports stdio transport).
- **`--openclaw-home` / `--qwen-home` CLI flags** — wired through to `resolveTargetOutputRoot` so custom home directories are respected.

---

## [0.9.1] - 2026-02-20

### Changed

- **Remove docs/reports and docs/decisions directories** — only `docs/plans/` is retained as living documents that track implementation progress
- **OpenCode commands as Markdown** — commands are now `.md` files with deep-merged config, permissions default to none ([#201](https://github.com/EveryInc/compound-engineering-plugin/pull/201)) — thanks [@0ut5ider](https://github.com/0ut5ider)!
- **Fix changelog GitHub link** ([#215](https://github.com/EveryInc/compound-engineering-plugin/pull/215)) — thanks [@XSAM](https://github.com/XSAM)!
- **Update Claude Code install command in README** ([#218](https://github.com/EveryInc/compound-engineering-plugin/pull/218)) — thanks [@ianguelman](https://github.com/ianguelman)!

---

## [0.9.0] - 2026-02-17

### Added

- **Kiro CLI target** — `--to kiro` converts plugins to `.kiro/` format with custom agent JSON configs, prompt files, skills, steering files, and `mcp.json`. Only stdio MCP servers are supported ([#196](https://github.com/EveryInc/compound-engineering-plugin/pull/196)) — thanks [@krthr](https://github.com/krthr)!

---

## [0.8.0] - 2026-02-17

### Added

- **GitHub Copilot target** — `--to copilot` converts plugins to `.github/` format with `.agent.md` files, `SKILL.md` skills, and `copilot-mcp-config.json`. Also supports `sync --target copilot` ([#192](https://github.com/EveryInc/compound-engineering-plugin/pull/192)) — thanks [@brayanjuls](https://github.com/brayanjuls)!
- **Native Cursor plugin support** — Cursor now installs via `/add-plugin compound-engineering` using Cursor's native plugin system instead of CLI conversion ([#184](https://github.com/EveryInc/compound-engineering-plugin/pull/184)) — thanks [@ericzakariasson](https://github.com/ericzakariasson)!

### Removed

- Cursor CLI conversion target (`--to cursor`) — replaced by native Cursor plugin install

---

## [0.6.0] - 2026-02-12

### Added

- **Droid sync target** — `sync --target droid` symlinks personal skills to `~/.factory/skills/`
- **Cursor sync target** — `sync --target cursor` symlinks skills to `.cursor/skills/` and merges MCP servers into `.cursor/mcp.json`
- **Pi target** — First-class `--to pi` converter with MCPorter config and subagent compatibility ([#181](https://github.com/EveryInc/compound-engineering-plugin/pull/181)) — thanks [@gvkhosla](https://github.com/gvkhosla)!

### Fixed

- **Bare Claude model alias resolution** — Fixed OpenCode converter not resolving bare model aliases like `claude-sonnet-4-5-20250514` ([#182](https://github.com/EveryInc/compound-engineering-plugin/pull/182)) — thanks [@waltbeaman](https://github.com/waltbeaman)!

### Changed

- Extracted shared `expandHome` / `resolveTargetHome` helpers to `src/utils/resolve-home.ts`, removing duplication across `convert.ts`, `install.ts`, and `sync.ts`

---

## [0.5.2] - 2026-02-09

### Fixed

- Fix cursor install defaulting to cwd instead of opencode config dir

## [0.5.1] - 2026-02-08

- Initial npm publish
