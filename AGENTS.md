# Agent Instructions

This repository contains a Bun/TypeScript CLI that converts Claude Code plugins into other agent platform formats.

It also acts as:
- a home for the distributed plugins under `plugins/`
- the Claude marketplace catalog under `.claude-plugin/`
- shared release and metadata infrastructure for those components

`AGENTS.md` is the canonical repo instruction file. Root `CLAUDE.md` exists only as a compatibility shim for tools and conversions that still look for it.

## Working Agreement

- **Branching:** Create a feature branch for any non-trivial change. If already on the correct branch for the task, keep using it; do not create additional branches or worktrees unless explicitly requested.
- **Safety:** Do not delete or overwrite user data. Avoid destructive commands.
- **Testing:** Run `bun test` after changes that affect parsing, conversion, or output.
- **Release versioning:** Releases are prepared by release automation, not normal feature PRs. The repo now has multiple release components (`cli`, `compound-engineering`, `coding-tutor`, `marketplace`) and one canonical root `CHANGELOG.md`. Use conventional titles such as `feat:` and `fix:` so release automation can classify change intent, but do not hand-bump release-owned versions or changelog entries in routine PRs.
- **Output Paths:** Keep OpenCode output at `opencode.json` and `.opencode/{agents,skills,plugins}`. For OpenCode, command go to `~/.config/opencode/commands/<name>.md`; `opencode.json` is deep-merged (never overwritten wholesale).
- **ASCII-first:** Use ASCII unless the file already contains Unicode.

## Adding a New Target Provider (e.g., Codex)

Use this checklist when introducing a new target provider:

1. **Define the target entry**
   - Add a new handler in `src/targets/index.ts` with `implemented: false` until complete.
   - Use a dedicated writer module (e.g., `src/targets/codex.ts`).

2. **Define types and mapping**
   - Add provider-specific types under `src/types/`.
   - Implement conversion logic in `src/converters/` (from Claude → provider).
   - Keep mappings explicit: tools, permissions, hooks/events, model naming.

3. **Wire the CLI**
   - Ensure `convert` and `install` support `--to <provider>` and `--also`.
   - Keep behavior consistent with OpenCode (write to a clean provider root).

4. **Tests (required)**
   - Extend fixtures in `tests/fixtures/sample-plugin`.
   - Add spec coverage for mappings in `tests/converter.test.ts`.
   - Add a writer test for the new provider output tree.
   - Add a CLI test for the provider (similar to `tests/cli.test.ts`).

5. **Docs**
   - Update README with the new `--to` option and output locations.

## When to Add a Provider

Add a new provider when at least one of these is true:

- A real user/workflow needs it now.
- The target format is stable and documented.
- There’s a clear mapping for tools/permissions/hooks.
- You can write fixtures + tests that validate the mapping.

Avoid adding a provider if the target spec is unstable or undocumented.

## Agent References in Skills

When referencing agents from within skill SKILL.md files (e.g., via the `Agent` or `Task` tool), always use the **fully-qualified namespace**: `compound-engineering:<category>:<agent-name>`. Never use the short agent name alone.

Example:
- `compound-engineering:research:learnings-researcher` (correct)
- `learnings-researcher` (wrong - will fail to resolve at runtime)

This prevents resolution failures when the plugin is installed alongside other plugins that may define agents with the same short name.

## Repository Docs Convention

- **Plans** live in `docs/plans/` and track implementation progress.
