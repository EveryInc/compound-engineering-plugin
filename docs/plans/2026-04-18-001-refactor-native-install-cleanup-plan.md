---
title: "refactor: Recenter installs on native packages and shared skill cleanup"
type: refactor
status: active
date: 2026-04-18
---

# Recenter Installs on Native Packages and Shared Skill Cleanup

## Overview

Rework the install strategy around current agent-harness behavior:

- Use native package/plugin installers where they can install the full Compound Engineering payload.
- Avoid `~/.agents` for CE-owned installs because shared skills there can shadow native plugin installs such as Copilot.
- Keep agents target-native unless the harness's package format explicitly supports bundled agents.
- Add a first-class cleanup path for old CE-owned flat installs, renamed skills, removed skills, converted-agent skills, prompts, commands, and target-specific artifacts.

This plan supersedes the Copilot-only native plugin plan because the same decision now affects Codex, Gemini, Pi, OpenCode, and every retained custom converter target.

## Problem Frame

The current CLI grew when most targets did not have native package/plugin support. That is no longer uniformly true:

- Claude Code has native plugin marketplaces.
- Copilot CLI has plugin marketplaces and can install repo-hosted plugins.
- Gemini CLI has native extensions and shared `~/.agents/skills` skill discovery.
- Pi has native packages via `pi install` and also reads `~/.agents/skills`.
- Codex has native plugins, but current public docs still make non-official distribution depend on local/repo/personal marketplace files.
- OpenCode also reads `~/.agents/skills`, but CE should avoid that root by default because it can shadow Copilot plugin skills.
- Windsurf no longer needs active support and should be deprecated from user-facing conversion/install flows while preserving cleanup for old CE artifacts.

At the same time, our legacy installs leave stale flat artifacts behind. Examples include removed skills such as `reproduce-bug`, renamed workflows such as `workflows:*` -> `ce:*`, old prompt files, and agents that older converters flattened into skills. We cannot delete all of `~/.agents/skills` or `~/.codex/skills` because users may have non-CE skills there.

## Requirements Trace

- R1. Prefer native installers when they install the full useful payload with a reasonable user flow.
- R2. Do not write CE-owned installs to `~/.agents`; treat it as a legacy cleanup surface only.
- R3. Preserve target-specific agent behavior where the harness supports agents.
- R4. Continue converting agents to skills only for targets that lack compatible agent packaging or invocation.
- R5. Track all CE legacy skills, agents, commands, prompts, and generated aliases so cleanup can remove stale CE-owned artifacts without touching user-owned items.
- R6. Any remaining custom install path must run legacy cleanup on every install.
- R7. Native-install targets must have a documented one-time cleanup command users can run before switching from old Bun installs.
- R8. Forward installs must write a manifest so removed or renamed artifacts can be cleaned without expanding the hand-maintained legacy list forever.
- R9. The README and target specs must clearly distinguish native installer paths from legacy/custom converter paths.
- R10. Deprecate Windsurf support and preserve cleanup for old CE Windsurf installs.

## External Research Summary

| Harness | Shared `~/.agents/skills` | Native package/plugin install | Agent support path | Planning conclusion |
| --- | --- | --- | --- | --- |
| Claude Code | Not the primary install path for this repo | Yes, `/plugin marketplace add` + `/plugin install` | Plugin `agents/` | Keep Claude native plugin as canonical. No Bun install needed for Claude. |
| Codex | Yes, but CE should avoid it to prevent Copilot plugin shadowing. Codex also discovers `~/.codex/skills` in current local behavior. | Yes, but current docs describe official plugin directory plus local repo/personal marketplace files. | Custom agents are TOML under `~/.codex/agents` or `.codex/agents`, not `~/.agents/agents`. | Keep custom Codex install. Write CE skills under `~/.codex/skills/compound-engineering` and convert Claude agents to flat Codex TOML custom agents under `~/.codex/agents`. |
| Copilot CLI | Yes. Docs list project `.agents/skills` and personal `~/.agents/skills`. | Yes. `copilot plugin marketplace add OWNER/REPO`, then `copilot plugin install NAME@MARKETPLACE`. Copilot can read existing `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json`. | Personal `~/.copilot/agents`, project `.github/agents`, Claude-compatible `~/.claude/agents` / `.claude/agents`, and plugin `agents/`. No documented `~/.agents/agents`. | Move Copilot to native plugin distribution using the existing Claude plugin metadata. Remove user-facing Bun install. |
| Gemini CLI | Yes, but CE should avoid it to prevent Copilot plugin shadowing. | Yes. `gemini extensions install <github-url-or-local-path>`, but monorepo subdirectory install is not documented. | Project `.gemini/agents`, user `~/.gemini/agents`, and extension `agents/`. The verified `.agents/*` alias is for skills, not subagents. | Keep custom Bun install to `~/.gemini/{skills,agents,commands}` for now; revisit native extension distribution later. |
| Pi | Yes. Docs list `~/.agents/skills` and `.agents/skills`. | Yes. `pi install npm:...`, `pi install git:...`, URL, or local path. | Core Pi has no built-in subagents; subagents are extension/package-provided. Packages can bundle extensions, skills, prompts, themes. | Prefer a Pi package if we can package the existing compat extension, prompts, and skills cleanly. Until then, keep custom writer and cleanup. |
| OpenCode | Yes, but CE should avoid it to prevent Copilot plugin shadowing. | Partial. OpenCode has plugins/config, but no equivalent repo marketplace install for our full payload in current target design. | Agents are OpenCode markdown/config under `~/.config/opencode/agents` or `.opencode/agents`. | Keep custom writer for agents/config; do not share pass-through skills via `~/.agents/skills` by default. |
| Factory Droid | No confirmed `~/.agents/skills`; docs mention `.factory/skills`, `~/.factory/skills`, and project `.agent/skills` compatibility. | Yes. `droid plugin marketplace add <repo>`, then `droid plugin install NAME@MARKETPLACE`. Droid can install Claude Code-compatible plugins directly. | Plugin agents load through the native plugin translation path. | Move Droid to native plugin distribution and remove user-facing Bun install. |
| Kiro | No confirmed `~/.agents/skills` in current docs. | Has import flows, but not a CE-wide plugin install path in current target. | Agents are `.kiro/agents` JSON + prompt files. | Keep custom writer. |
| Windsurf | No longer relevant for CE support. | N/A | Current converter maps agents to skills. | Deprecate/remove user-facing support; keep legacy cleanup for old CE Windsurf installs. |
| Qwen Code | No shared `~/.agents` conclusion needed. | Extension-oriented target already has per-plugin root. | Qwen supports target-native agents. | Keep custom writer/package output. |

Sources checked:

- Codex skills: `https://developers.openai.com/codex/skills`
- Codex plugins: `https://developers.openai.com/codex/plugins` and `https://developers.openai.com/codex/plugins/build`
- Codex subagents: `https://developers.openai.com/codex/subagents`
- Copilot agents/skills/plugins: `https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli`, `https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills`, `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference`
- Gemini skills/subagents/extensions: `https://geminicli.com/docs/cli/skills/`, `https://geminicli.com/docs/core/subagents/`, `https://geminicli.com/docs/extensions/reference/`, `https://developers.googleblog.com/subagents-have-arrived-in-gemini-cli/`
- Pi skills/packages: `https://buildwithpi.ai/README.md`, `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md`, `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md`
- OpenCode skills/agents: `https://opencode.ai/docs/skills`, `https://opencode.ai/docs/agents/`
- Factory Droid skills: `https://docs.factory.ai/cli/configuration/skills`
- Kiro skills/agents: `https://kiro.dev/docs/skills/`, `https://kiro.dev/docs/cli/custom-agents/configuration-reference/`

## Key Decisions

### 1. Do not make `~/.agents` a CE-managed install root

`~/.agents/plugins/marketplace.json` is documented by Codex as a personal marketplace file, not as a cross-harness plugin installation convention. Copilot installs plugins under `~/.copilot/installed-plugins`, Gemini installs extensions under `~/.gemini/extensions`, and Pi packages install through Pi settings plus npm/git/local package storage.

`~/.agents/skills` is also unsafe as a CE-managed install root. Copilot loads personal/project skills before plugin skills and deduplicates by `SKILL.md` `name`. A CE skill installed into `~/.agents/skills` for another target can silently shadow the same skill from Copilot's native plugin.

Treat `~/.agents` as a legacy cleanup surface, not a forward install surface.

### 2. Use native package distribution by target, not one universal folder

Native targets should have target-native packaging:

- Claude: existing `.claude-plugin` marketplace/plugin.
- Copilot: reuse existing `.claude-plugin` marketplace/plugin metadata. Do not add a parallel `.github/plugin` surface unless a future Copilot-only manifest field becomes necessary.
- Gemini: custom Bun install to `~/.gemini/{skills,agents,commands}` for now; future `gemini-extension.json` distribution remains possible.
- Pi: npm/git/local package with `package.json` `pi` manifest.
- Codex: `~/.codex/skills/compound-engineering`, `~/.codex/agents`, and optional future `.codex-plugin/plugin.json`, but do not retire custom install until remote install UX is verified.

### 3. Agents are not portable via `~/.agents`

`~/.agents/skills` is increasingly common. `~/.agents/agents` is not documented by the primary sources checked for Codex, Copilot, or Gemini. Agent support must remain per target:

- Copilot agents: markdown agent files under `~/.copilot/agents`, `.github/agents`, Claude-compatible `.claude/agents` / `~/.claude/agents`, or plugin `agents`.
- Gemini sub-agents: markdown files under `.gemini/agents`, `~/.gemini/agents`, or extension `agents/`.
- Codex custom agents: TOML files under `.codex/agents` / `~/.codex/agents`. CE should generate these from Claude Markdown agents instead of degrading them into skills.
- OpenCode agents: markdown/config under `.opencode/agents` / `~/.config/opencode/agents`.
- Kiro agents: JSON configs and prompt files under `.kiro/agents`.
- Pi: no built-in subagents; package an extension if CE needs subagent behavior.

This means the previous "convert agents to skills" behavior remains legitimate for targets without compatible agent packaging, but it should not be applied to Copilot and Gemini unless intentionally degraded. Gemini's April 2026 subagent support makes this more important: Gemini output should package CE agents as subagents under Gemini-owned roots, while `~/.agents` remains cleanup-only.

### 4. Cleanup must be a product feature, not incidental writer behavior

Current cleanup work in `src/data/plugin-legacy-artifacts.ts` is the right direction, but it is too writer-bound. We need a standalone cleanup command that can run before switching users from old Bun installs to native harness installers.

Custom writers should still invoke cleanup automatically. Native installers cannot clean old CE artifacts in unrelated roots, so users need an explicit CE cleanup command.

### 5. Legacy inventory should be generated and validated against git history

The hand-maintained legacy list should be backed by a script that scans historical plugin inventories from git history:

- `plugins/compound-engineering/skills/*`
- `plugins/compound-engineering/agents/*`
- `plugins/compound-engineering/commands/*`
- historical `prompts/*` or converted command outputs
- renamed colon/underscore/hyphen variants per target

The result should be committed as data, and tests should fail when the current or historical source inventory includes an untracked CE artifact.

## Implementation Units

- [ ] **Unit 1: Add a platform install strategy spec**

**Goal:** Replace ad hoc target assumptions with one repo-owned matrix for native vs custom install, shared-skill support, and agent support.

**Requirements:** R1, R2, R3, R4, R9

**Files:**
- Create: `docs/solutions/integrations/native-plugin-install-strategy-2026-04-19.md`
- Modify: `README.md`
- Modify as needed: `docs/specs/codex.md`, `docs/specs/copilot.md`, `docs/specs/gemini.md`, `docs/specs/opencode.md`

**Approach:**
- Document why CE avoids `~/.agents/skills` despite broad discovery support.
- Document target-native package locations and install commands.
- Mark each current target as `native-primary`, `custom-primary`, or `hybrid`.
- Explicitly list whether source Claude agents become target agents or generated skills.

**Test scenarios:**
- README no longer implies all targets require the same Bun install path.
- Target specs agree on whether a target uses native install or custom writer.

---

- [ ] **Unit 2: Build a standalone CE cleanup command**

**Goal:** Give users one command to remove stale CE-owned artifacts from old installs before or during migration to native installers.

**Requirements:** R5, R6, R7, R8

**Files:**
- Create: `src/commands/cleanup.ts`
- Create or Modify: `src/cleanup/*`
- Modify: `src/index.ts`
- Modify: `src/targets/*` custom writers to call shared cleanup helpers
- Modify: `tests/cli.test.ts`
- Add targeted cleanup tests under `tests/`

**Approach:**
- Add a command such as `compound cleanup compound-engineering --targets codex,copilot,gemini,pi,opencode,droid --apply`.
- Default to dry-run unless the existing CLI convention strongly favors direct action.
- Move matched legacy artifacts to a timestamped backup rather than hard-deleting.
- Only touch known CE-owned artifacts, existing install-manifest entries, and symlinks whose targets are CE-managed.
- Cover `~/.agents/skills`, `~/.codex/skills`, `~/.codex/prompts`, `~/.copilot/skills`, `~/.copilot/agents`, `~/.gemini/skills`, `~/.gemini/agents`, `~/.gemini/commands`, `~/.pi/agent/{skills,prompts,extensions}`, `~/.config/opencode/{skills,agents,commands,plugins}`, `~/.factory/{skills,commands,droids}`, deprecated `~/.codeium/windsurf/{skills,workflows,mcp_config.json}`, and other current writer roots.

**Test scenarios:**
- Dry run reports stale `reproduce-bug` without moving it.
- Apply moves stale CE artifacts to backup.
- Non-CE skill with the same parent directory root is preserved.
- A CE-managed symlink in `~/.agents/skills` is removed or moved safely.
- A real user-owned directory at a CE-looking path is skipped unless manifest/history proves CE ownership.

---

- [ ] **Unit 3: Generate and validate the historical CE artifact manifest**

**Goal:** Prevent future cleanup gaps when skills or agents are removed, renamed, or converted.

**Requirements:** R5, R8

**Files:**
- Modify: `src/data/plugin-legacy-artifacts.ts`
- Create: `scripts/generate-legacy-artifacts.ts` or similar
- Create: `tests/plugin-legacy-artifacts-history.test.ts`
- Modify: existing `tests/plugin-legacy-artifacts.test.ts`

**Approach:**
- Scan git history for CE plugin directories and normalize names per target.
- Preserve hand-added aliases only for cases not recoverable from source directory history.
- Commit generated data in a stable sorted form.
- Test that current source artifacts and known removed artifacts are included.

**Test scenarios:**
- Removed `reproduce-bug` remains in cleanup data.
- If `document-review` is renamed to `ce-doc-review`, both old and new cleanup-relevant names are tracked.
- Historical `prompts` outputs remain cleanup candidates.
- Colon, underscore, and hyphen variants normalize correctly for Codex, Gemini, Pi, and OpenCode.

---

- [ ] **Unit 4: Move Copilot to native plugin distribution through existing Claude metadata**

**Goal:** Replace user-facing `bunx ... --to copilot` with Copilot marketplace/plugin install.

**Requirements:** R1, R3, R4, R7, R9

**Files:**
- Modify: `README.md`
- Modify: `docs/specs/copilot.md`
- Modify: CLI target registration/tests if direct install is deprecated
- Reassess/remove: `src/converters/claude-to-copilot.ts`, `src/targets/copilot.ts`, `src/types/copilot.ts`, and Copilot writer/converter tests if they no longer serve release validation

**Approach:**
- Use the existing root `.claude-plugin/marketplace.json`; Copilot CLI explicitly looks there for marketplace metadata.
- Use the existing plugin-local `.claude-plugin/plugin.json`; Copilot CLI can discover plugin manifests from `.claude-plugin/plugin.json`.
- Document Copilot native install instructions:
  - `copilot plugin marketplace add EveryInc/compound-engineering-plugin`
  - `copilot plugin install compound-engineering@compound-engineering-plugin`
- Keep plugin agents as agents, not generated skills.
- Do not create parallel `.github/plugin` metadata or `agents-copilot/` output unless a real compatibility failure is proven.
- Run or recommend `compound cleanup compound-engineering --targets copilot,codex --apply` before switching old installs.
- Treat stale Copilot skills as a shadowing risk, not only a duplicate-display risk. Copilot deduplicates skills by `SKILL.md` `name` with first-found-wins precedence, and personal/project skill roots such as `~/.agents/skills` load before plugin skills.

**Test scenarios:**
- Existing `.claude-plugin/marketplace.json` parses and has a `compound-engineering` entry whose `source` points at `plugins/compound-engineering`.
- Existing `plugins/compound-engineering/.claude-plugin/plugin.json` parses and is valid enough for both Claude and Copilot.
- Copilot docs/spec record the native install commands and the `.claude-plugin` compatibility.
- README does not advertise old direct Copilot Bun install as the primary path.
- If possible, a local-path Copilot plugin install in a temporary config directory succeeds without modifying the user's real Copilot home.
- A seeded stale `~/.agents/skills/ce-plan/SKILL.md` shadows a plugin-provided `ce-plan` in docs/tests or manual verification, proving cleanup is required even when Copilot does not show duplicate skills.

---

- [ ] **Unit 5: Update Gemini custom install and defer extension packaging**

**Goal:** Keep Gemini on the custom Bun installer for now, but make it write Gemini-native skills and subagents under `~/.gemini` without using `~/.agents`.

**Requirements:** R1, R3, R4, R7, R9

**Files:**
- Create or Generate: Gemini skill/agent/command payloads as needed
- Modify: `docs/specs/gemini.md`
- Modify: `README.md`
- Reassess: `src/converters/claude-to-gemini.ts`, `src/targets/gemini.ts`

**Approach:**
- Write pass-through skills to `~/.gemini/skills`.
- Write normalized flat Gemini subagents to `~/.gemini/agents`.
- Write command TOML files to `~/.gemini/commands` if CE ships commands again.
- Write a managed manifest to `~/.gemini/compound-engineering/install-manifest.json`.
- Do not write CE-owned Gemini artifacts to `~/.agents/skills`.
- Do not assume `gemini extensions install` supports `--path` for a monorepo subdirectory. Current docs and local help list GitHub repository URL or local path sources, while `--path` is documented for `gemini skills install`.
- Defer native extension distribution until we choose a shape where the installed source root contains `gemini-extension.json`: dedicated Gemini extension repo, generated distribution branch/package, or release asset.
- Preserve agent prompt bodies where possible; the necessary work is flattening agent files into direct `agents/*.md` entries and stripping/translating Claude-specific frontmatter such as `color` and string-form `tools`.

**Test scenarios:**
- Bun install writes to Gemini-owned roots and does not write to `~/.agents/skills`.
- Gemini-specific agents are packaged as extension sub-agents, not flattened into skills unless deliberately configured.
- Generated Gemini agents are flat direct files under `~/.gemini/agents`, contain strict Gemini-compatible frontmatter, and load without validation errors.
- Legacy `.gemini` direct install cleanup still runs from the cleanup command.

---

- [ ] **Unit 6: Add or defer Pi package distribution**

**Goal:** Decide whether CE can be installed with `pi install` and, if yes, package the existing Pi output as a real Pi package.

**Requirements:** R1, R4, R6, R7, R9

**Files:**
- Create or Modify: package metadata for Pi package distribution
- Modify: `docs/specs/pi.md` if created, otherwise add one
- Modify: `README.md`
- Reassess: `src/converters/claude-to-pi.ts`, `src/targets/pi.ts`

**Approach:**
- Prefer npm package distribution if we want to avoid asking users to manually clone a repository.
- Package Pi resources with `package.json` `pi` manifest: `skills`, `prompts`, and `extensions`.
- Resolve the existing compat-extension conflict risk before promoting Pi native package as primary.
- Until packaged and tested, keep the custom Pi writer and have it call shared cleanup every install.

**Test scenarios:**
- Pi package manifest includes skills/prompts/extensions.
- Existing `compound-engineering-compat.ts` does not conflict with popular subagent packages or is made conditional.
- Cleanup removes old direct writer artifacts under `~/.pi/agent`.

---

- [x] **Unit 7: Rationalize remaining custom targets and deprecate Windsurf**

**Goal:** Make explicit which targets still need the Bun converter/install path, remove Windsurf from active support, and ensure each retained or deprecated target has cleanup coverage.

**Requirements:** R4, R6, R8, R9, R10

**Files:**
- Modify: `src/targets/index.ts`
- Modify: `src/targets/{codex,opencode,kiro,qwen}.ts`
- Delete: custom plugin install writers for native-marketplace targets such as Droid and Copilot
- Delete: `src/converters/claude-to-windsurf.ts`, `src/types/windsurf.ts`, `src/targets/windsurf.ts`, `src/sync/windsurf.ts`, `tests/windsurf-*.test.ts`
- Modify: README target table
- Modify: target writer tests

**Approach:**
- Keep custom targets where native install does not cover the full payload or is not documented enough.
- Run shared cleanup for each custom install.
- Deprecate Windsurf from user-facing `convert`, `install`, `sync`, README, and target lists.
- Preserve Windsurf cleanup support so old CE artifacts can be removed from `~/.codeium/windsurf/` even after active support is gone.
- For Codex, keep current custom install as primary until native plugin distribution from a GitHub repo is as simple as Copilot/Gemini/Pi or until official directory publishing is available.
- For Codex skills, write to `~/.codex/skills/compound-engineering/<skill>` with a manifest under `~/.codex/compound-engineering/`; do not write to `~/.agents/skills`.
- For Codex agents, convert Claude Markdown agents to flat TOML custom agents under `~/.codex/agents` using CE-prefixed names such as `ce-review-correctness-reviewer`, and update converted skill content so `Task`/agent references explicitly ask Codex to spawn the named custom agent.
- The Codex skill-plus-agent split was smoke-tested on 2026-04-18: a skill in `~/.agents/skills/ce-codex-agent-smoke` successfully spawned a TOML custom agent from `~/.codex/agents/ce-codex-agent-smoke.toml` and returned `CODEX_TOML_AGENT_SMOKE_OK`.
- Codex duplicate discovery was also smoke-tested on 2026-04-18: the same skill name installed under both `~/.agents/skills` and legacy `~/.codex/skills` appeared twice in the skill picker. Codex cleanup must remove old CE-owned skills from both roots before writing the namespaced `~/.codex/skills/compound-engineering` install.
- Shared skill nesting was smoke-tested on 2026-04-18: Codex discovered flat, nested, and Superpowers-style symlink-pack skills under `~/.agents/skills`, but Copilot and Gemini only discovered the flat direct `~/.agents/skills/<skill>/SKILL.md` shape. CE should avoid this root anyway because of Copilot shadowing.
- For OpenCode, do not share pass-through skills via `~/.agents/skills` unless the user explicitly opts into cross-harness shared skills and understands Copilot shadowing.

**Test scenarios:**
- Each custom writer calls cleanup with the correct target roots.
- Target writer manifests remove artifacts that disappear between installs.
- Windsurf is no longer advertised or selectable as an active install target.
- Cleanup can still identify and back up old CE Windsurf artifacts.
- README table matches registered target behavior.

## Sequencing

1. Land the strategy spec and cleanup command first. This reduces migration risk no matter which native packaging target lands next.
2. Promote Copilot native install next because its plugin marketplace flow is documented and closest to Claude's model.
3. Add Gemini extension packaging after Copilot because Gemini can bundle skills, commands, and preview sub-agents through extensions.
4. Decide Pi packaging after resolving the extension conflict and npm-package shape.
5. Revisit Codex native plugins last; the platform supports plugins, but the public distribution UX still appears less direct than Copilot/Gemini/Pi for a GitHub-hosted third-party plugin.
6. Deprecate Windsurf and keep the remaining custom targets, with cleanup mandatory and manifest-backed.

## Open Questions

- Should the cleanup command default to dry-run or apply? Recommendation: dry-run for standalone use, apply automatically inside custom install writers.
- Should native package payloads be checked in or generated during release validation? Recommendation: generated but checked for determinism in CI if the target package must be present in the repo.
- Should the existing `@every-env/compound-plugin` npm package also become the Pi package, or should Pi get a smaller dedicated npm package? Recommendation: investigate package contents first; avoid bloating Pi installs with converter-only code if avoidable.
- Should Codex native plugin support be documented as experimental alongside custom install? Recommendation: yes, but do not retire custom install until remote marketplace install is verified end to end.

## Verification

- `bun test` after implementation units touching CLI, writers, or conversion.
- `bun run release:validate` after native package manifests or plugin inventory changes.
- Manual smoke tests for native installers:
  - Claude: `/plugin install compound-engineering`
  - Copilot: `copilot plugin marketplace add EveryInc/compound-engineering-plugin` then install
  - Gemini: `gemini extensions install <repo-url-or-local-path>`
  - Pi: `pi install npm:<package>` or local package path
- Cleanup smoke test with seeded temp homes for `~/.agents`, `~/.codex`, `~/.copilot`, `~/.gemini`, `~/.pi`, `~/.config/opencode`, and `~/.factory`.
