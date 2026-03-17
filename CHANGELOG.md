# Changelog

All notable changes to the `@every-env/compound-plugin` CLI tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release numbering now follows the repository `v*` tag line. Starting at `v2.34.0`, the root CLI package and this changelog stay on that shared version stream. Older entries below retain the previous `0.x` CLI numbering.

## [2.40.3](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.40.2...v2.40.3) (2026-03-17)


### Bug Fixes

* research agents prefer native tools over shell for repo exploration ([b290690](https://github.com/EveryInc/compound-engineering-plugin/commit/b2906906555810fca176fa4e0153bf080446c486))

## [2.40.2](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.40.1...v2.40.2) (2026-03-17)


### Bug Fixes

* harden codex copied skill rewriting ([#285](https://github.com/EveryInc/compound-engineering-plugin/issues/285)) ([6f561f9](https://github.com/EveryInc/compound-engineering-plugin/commit/6f561f94b4397ca6df2ab163e6f1253817bd7cea))

## [2.40.1](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.40.0...v2.40.1) (2026-03-17)


### Bug Fixes

* **kiro:** parse .mcp.json wrapper key and support remote MCP servers ([#259](https://github.com/EveryInc/compound-engineering-plugin/issues/259)) ([dfff20e](https://github.com/EveryInc/compound-engineering-plugin/commit/dfff20e1adab891b4645a53d0581d4b20577e3f1))

# [2.40.0](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.39.0...v2.40.0) (2026-03-17)


### Features

* specific model/harness/version in PR attribution ([#283](https://github.com/EveryInc/compound-engineering-plugin/issues/283)) ([fdbd584](https://github.com/EveryInc/compound-engineering-plugin/commit/fdbd584bac40ca373275b1b339ab81db65ac0958))

# [2.39.0](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.38.0...v2.39.0) (2026-03-16)


### Bug Fixes

* drop 'CLI' suffix from Codex and Gemini platform names ([ec8d685](https://github.com/EveryInc/compound-engineering-plugin/commit/ec8d68580f3da65852e72c127cccc6e66326369b))
* make brainstorm handoff auto-chain and cross-platform ([637653d](https://github.com/EveryInc/compound-engineering-plugin/commit/637653d2edf89c022b9e312ea02c0ac1a305d741))
* restore 'wait for the user's reply' fallback language ([fca3a40](https://github.com/EveryInc/compound-engineering-plugin/commit/fca3a4019c55c76b9f1ad326cc3d284f5007b8f4))


### Features

* add leverage check to brainstorm skill ([0100245](https://github.com/EveryInc/compound-engineering-plugin/commit/01002450cd077b800a917625c5eb6d12da061d0b))
* instruct brainstorm skill to use platform blocking question tools ([d2c4cee](https://github.com/EveryInc/compound-engineering-plugin/commit/d2c4cee6f9774a5fb2c8ca325c389dadb4a72b1c))
* refactor brainstorm skill into requirements-first workflow ([4d80a59](https://github.com/EveryInc/compound-engineering-plugin/commit/4d80a59e51b4b2e99ff8c2443e2a1b039d7475c9))

# [2.38.0](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.37.1...v2.38.0) (2026-03-16)


### Bug Fixes

* **skill:** align compound-refresh question tool guidance ([c2582fa](https://github.com/EveryInc/compound-engineering-plugin/commit/c2582fab675fe1571f32730634e66411aadc1820))
* **skills:** allow direct commit on main as non-default option ([0c333b0](https://github.com/EveryInc/compound-engineering-plugin/commit/0c333b08c9369d359613d030aba0fe16e929a665))
* **skills:** autonomous mode adapts to available permissions ([684814d](https://github.com/EveryInc/compound-engineering-plugin/commit/684814d9514a72c59da4d8f309f73ff0f7661d58))
* **skills:** enforce branch creation when committing on main ([6969014](https://github.com/EveryInc/compound-engineering-plugin/commit/696901453212aa43cff2400a75cfc6629e79939e))
* **skills:** enforce full report output in autonomous mode ([2ae6fc4](https://github.com/EveryInc/compound-engineering-plugin/commit/2ae6fc44580093ff6162fcb48145901a54138e9f))
* **skills:** improve ce:compound-refresh interaction and auto-archive behavior ([0dff943](https://github.com/EveryInc/compound-engineering-plugin/commit/0dff9431ceec8a24e576712c48198e8241c24752))
* **skills:** include tool constraint in subagent task prompts ([db8c84a](https://github.com/EveryInc/compound-engineering-plugin/commit/db8c84acb4f72c4ce3e1612365ff912fdfe3cea1))
* **skills:** prevent auto-archive when problem domain is still active ([4201361](https://github.com/EveryInc/compound-engineering-plugin/commit/42013612bde6e13152ade806ba7f861ce5d38e03))
* **skills:** remove prescriptive branch naming in compound-refresh ([e3e7748](https://github.com/EveryInc/compound-engineering-plugin/commit/e3e7748c564a24e74d86fdf847dd499284404cc8))
* **skills:** require specific branch names based on what was refreshed ([b7e4391](https://github.com/EveryInc/compound-engineering-plugin/commit/b7e43910fb1a2173e857c4c6b7fa6af9f9ca1be7))
* **skills:** specify markdown format for autonomous report output ([c271bd4](https://github.com/EveryInc/compound-engineering-plugin/commit/c271bd4729793de8f3ec2e47dd5fe3e8de65c305))
* **skills:** steer compound-refresh subagents toward file tools over shell commands ([187571c](https://github.com/EveryInc/compound-engineering-plugin/commit/187571ce97ca8c840734b4677cceb0a4c37c84bb))
* **skills:** strengthen autonomous mode to prevent blocking on user input ([d3aff58](https://github.com/EveryInc/compound-engineering-plugin/commit/d3aff58d9e48c44266f09cf765d85b41bf95a110))
* **skills:** use actual branch name in commit options instead of 'this branch' ([a47f7d6](https://github.com/EveryInc/compound-engineering-plugin/commit/a47f7d67a25ff23ce8c2bb85e92fdce85bed3982))


### Features

* **skills:** add autonomous mode to ce:compound-refresh ([699f484](https://github.com/EveryInc/compound-engineering-plugin/commit/699f484033f3c895c35fea49e147dd1742bc3d43))
* **skills:** add ce:compound-refresh skill for learning and pattern maintenance ([bd3088a](https://github.com/EveryInc/compound-engineering-plugin/commit/bd3088a851a3dec999d13f2f78951dfed5d9ac8c))
* **skills:** add Phase 5 commit workflow to ce:compound-refresh ([d4c12c3](https://github.com/EveryInc/compound-engineering-plugin/commit/d4c12c39fd04526c05cf484a512f9f73e91f5c3d))
* **skills:** add smart triage, drift classification, and replacement subagents to ce:compound-refresh ([95ad09d](https://github.com/EveryInc/compound-engineering-plugin/commit/95ad09d3e7d96367324c6ec7a10767e51d5788e8))

## [2.37.1](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.37.0...v2.37.1) (2026-03-16)


### Bug Fixes

* **compound:** remove overly defensive context budget precheck ([#278](https://github.com/EveryInc/compound-engineering-plugin/issues/278)) ([#279](https://github.com/EveryInc/compound-engineering-plugin/issues/279)) ([84ca52e](https://github.com/EveryInc/compound-engineering-plugin/commit/84ca52efdb198c7c8ae6c94ca06fc02d2c3ef648))

# [2.37.0](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.36.5...v2.37.0) (2026-03-15)


### Features

* sync agent-browser skill with upstream vercel-labs/agent-browser ([24860ec](https://github.com/EveryInc/compound-engineering-plugin/commit/24860ec3f1f1e7bfdee0f4408636ada1a3bb8f75))

## [2.36.5](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.36.4...v2.36.5) (2026-03-15)


### Bug Fixes

* **create-agent-skills:** remove literal dynamic context directives that break skill loading ([4b4d1ae](https://github.com/EveryInc/compound-engineering-plugin/commit/4b4d1ae2707895d6d4fd2e60a64d83ca50f094a6)), closes [anthropics/claude-code#27149](https://github.com/anthropics/claude-code/issues/27149) [#13655](https://github.com/EveryInc/compound-engineering-plugin/issues/13655)

## [2.36.4](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.36.3...v2.36.4) (2026-03-14)


### Bug Fixes

* **skills:** use fully-qualified agent namespace in Task invocations ([026602e](https://github.com/EveryInc/compound-engineering-plugin/commit/026602e6247d63a83502b80e72cd318232a06af7)), closes [#251](https://github.com/EveryInc/compound-engineering-plugin/issues/251)

## [2.36.3](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.36.2...v2.36.3) (2026-03-13)


### Bug Fixes

* **targets:** nest colon-separated command names into directories ([a84682c](https://github.com/EveryInc/compound-engineering-plugin/commit/a84682cd35e94b0408f6c6a990af0732c2acf03f)), closes [#226](https://github.com/EveryInc/compound-engineering-plugin/issues/226)

## [2.36.2](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.36.1...v2.36.2) (2026-03-13)


### Bug Fixes

* **plan:** remove deprecated /technical_review references ([0ab9184](https://github.com/EveryInc/compound-engineering-plugin/commit/0ab91847f278efba45477462d8e93db5f068e058)), closes [#244](https://github.com/EveryInc/compound-engineering-plugin/issues/244)

## [2.36.1](https://github.com/EveryInc/compound-engineering-plugin/compare/v2.36.0...v2.36.1) (2026-03-13)


### Bug Fixes

* **agents:** update learnings-researcher model from haiku to inherit ([30852b7](https://github.com/EveryInc/compound-engineering-plugin/commit/30852b72937091b0a85c22b7c8c45d513ab49fd1)), closes [#249](https://github.com/EveryInc/compound-engineering-plugin/issues/249)

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
