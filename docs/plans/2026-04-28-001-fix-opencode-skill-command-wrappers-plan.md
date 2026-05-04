---
title: Fix OpenCode Skill Command Wrappers
type: fix
status: complete
date: 2026-04-28
---

# Fix OpenCode Skill Command Wrappers

## Summary

OpenCode installs currently copy Compound Engineering skills and agents, but they do not expose the skills as slash commands because the plugin has no source `commands/` payload. This plan makes the OpenCode converter emit small command wrappers for installed skills so `/ce-plan`, `/ce-setup`, and related commands work after installing from this fork.

## Requirements

- R1. Installing `plugins/compound-engineering` to OpenCode must create slash commands for every copied CE skill.
- R2. The generated command must run the corresponding skill content from the installed OpenCode skill path instead of depending on OpenCode's skill discovery behavior.
- R3. The command wrapper set must be managed by the existing install manifest so removed skills clean up on reinstall.
- R4. Existing source plugin commands must continue to be converted unchanged.
- R5. Tests must prove command wrapper generation and existing command behavior.

## Blast Radius

- Changed files: `src/converters/claude-to-opencode.ts`, `tests/opencode-writer.test.ts`, this plan file.
- Impacted modules: OpenCode converter output, OpenCode writer manifest cleanup, OpenCode install smoke path.
- Break risk: low. The change only appends generated command files to OpenCode bundles and reuses the existing writer path.

## Implementation Units

- U1. **Generate skill command wrappers**

**Goal:** Extend `convertClaudeToOpenCode` so every copied OpenCode skill has a matching command file when no source command already owns that name.

**Files:**
- Modify: `src/converters/claude-to-opencode.ts`
- Test: `tests/opencode-writer.test.ts`

**Approach:**
- Compute filtered OpenCode skill dirs once.
- Build existing command names from `convertCommands(plugin.commands)`.
- Append generated `OpenCodeCommandFile` entries for skills whose command name is not already present.
- Use a wrapper body that reads `~/.config/opencode/skills/<skill>/SKILL.md` for global installs and `.opencode/skills/<skill>/SKILL.md` for project-local installs only if necessary. Prefer a stable global-path wrapper for the current fork need.

**Test scenarios:**
- Happy path: converting the real compound-engineering plugin includes `ce-plan`, `ce-setup`, and `lfg` command files.
- Edge case: if a source command already uses a skill name, the converter does not emit a duplicate wrapper.
- Regression: existing source command conversion still writes nested `name:with:colon` paths through the writer.

**Verification:**
- Targeted Bun tests pass.
- Local OpenCode install from this checkout writes command wrappers into `~/.config/opencode/commands`.

- U2. **Install forked checkout into OpenCode**

**Goal:** Replace the current generated OpenCode CE install with output from the local fork.

**Files:**
- Runtime output only: `~/.config/opencode/agents`, `~/.config/opencode/skills`, `~/.config/opencode/commands`, `~/.config/opencode/compound-engineering/install-manifest.json`, `~/.config/opencode/opencode.json` backup.

**Approach:**
- Run the local CLI: `bun run src/index.ts install ./plugins/compound-engineering --to opencode`.
- Verify OpenCode resolved config includes `ce-plan` and `ce-setup` command entries.
- Verify the install manifest records command wrappers.

**Test scenarios:**
- Smoke: `opencode debug config` reports generated CE command entries.
- Smoke: install manifest command count matches the generated skill command wrapper count.

**Verification:**
- Restart OpenCode and use `/ce-plan` or `/ce-setup`.

## Verification Notes

- `bun test tests/converter.test.ts` passed.
- `bun test tests/opencode-writer.test.ts` passed.
- `bun run release:validate` passed.
- Installed the local fork with `bun run src/index.ts install ./plugins/compound-engineering --to opencode`.
- OpenCode install manifest now records 34 managed CE command wrappers and 34 OpenCode-supported CE skills, including `ce-plan.md`, `ce-setup.md`, and `lfg.md`.
