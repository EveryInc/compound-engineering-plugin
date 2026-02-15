# Changelog

All notable changes to the `@every-env/compound-plugin` CLI tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-02-14

### Added

- **Auto-detect install targets** — `install --to all` and `convert --to all` auto-detect installed AI coding tools and install to all of them
- **Gemini sync** — `sync --target gemini` symlinks personal skills to `.gemini/skills/` and merges MCP servers into `.gemini/settings.json`
- **Sync all targets** — `sync --target all` syncs personal config to all detected tools
- **Tool detection utility** — Checks config directories for OpenCode, Codex, Droid, Cursor, Pi, and Gemini

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
