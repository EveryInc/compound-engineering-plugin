---
title: Codex native skills, legacy prompts, and converter entry points
category: architecture
tags: [codex, converter, skills, prompts, workflows, deprecation]
created: 2026-03-15
last_refreshed: 2026-06-20
severity: medium
component: codex-target
problem_type: convention
root_cause: outdated_target_model
---

# Codex native skills, legacy prompts, and converter entry points

## Problem

The Codex target used to treat Compound workflow entrypoints as converter-generated skill/prompt artifacts. That made sense when Codex lacked a native plugin install path and the plugin still shipped standalone agents, but it is no longer the primary model.

The current Compound Engineering package is root-native and skills-only:

- Codex native install reads `.codex-plugin/plugin.json`.
- The Codex manifest declares `skills: "./skills/"`.
- User-facing skills are root directories like `skills/ce-plan`, `skills/ce-work`, and `skills/ce-code-review`.
- Specialist review/research behavior lives in skill-local prompt assets under `references/agents/` or `references/personas/`.
- There are 0 standalone CE agents in the plugin surface.

The old copied-skill/prompt-wrapper model still matters for legacy cleanup and for `--to codex --codex-include-skills` style converter tests, but it should not be documented as the normal install path.

## Current Codex model

### Native install is the source of skills

For users, Codex skills come from the native plugin install:

```json
{
  "name": "compound-engineering",
  "skills": "./skills/"
}
```

The Bun converter's default `--to codex` behavior is intentionally not a second skill installer. It suppresses skills, prompts, command-skills, and MCP so the native plugin install remains the sole source for those artifact types.

### Converter default mode is compatibility-only

`convertClaudeToCodex()` still converts formal Claude agents to Codex custom-agent TOML because older plugin shapes and fixtures may contain agents. For the current Compound Engineering package, `plugin.agents` is empty, so default Codex conversion emits no standalone agents.

Default mode passes `externallyManagedSkillNames` to the writer so cleanup does not mistake natively installed skills for stale converter-owned artifacts.

### Full converter mode is legacy

When `codexIncludeSkills` is enabled, the converter can still emit copied skills and generated prompts. That mode exists for compatibility and tests, not for the current recommended install documentation.

In that mode:

- Deprecated `workflows:*` aliases are filtered or canonicalized.
- Command prompts delegate to generated command-skills.
- `transformContentForCodex()` rewrites known slash references while preserving unknown routes, URLs, and application paths.

## Rewrite and cleanup rules

When maintaining Codex conversion code:

- Do not reintroduce prompt wrappers for current native CE skills.
- Keep unknown slash references unchanged in copied skill content; otherwise the converter can corrupt URLs or app routes.
- Treat old `ce:*` and `workflows:*` names as legacy artifacts for cleanup and reference rewriting only.
- Keep native skill names hyphenated (`ce-plan`, not `ce:plan`) because current source directories and frontmatter use hyphenated names.
- Preserve `externallyManagedSkillNames` in default mode so re-running `install --to codex` cannot sweep active native skills into backup.

## Prevention

Before changing the Codex converter again:

1. Decide whether the target behavior belongs to native plugin install, default compatibility conversion, or full legacy conversion.
2. Verify whether the artifact surface is a skill, prompt, custom agent, or cleanup-only legacy path.
3. Add tests for copied skill content when changing full converter mode.
4. Add cleanup tests when changing stale prompt or old `ce:*` ownership detection.
5. Keep README language focused on native Codex plugin install, not converter-generated prompts.

## Related files

- `src/converters/claude-to-codex.ts`
- `src/targets/codex.ts`
- `src/types/codex.ts`
- `src/utils/codex-content.ts`
- `src/utils/legacy-cleanup.ts`
- `tests/codex-converter.test.ts`
- `tests/codex-writer.test.ts`
- `tests/legacy-cleanup.test.ts`
- `.codex-plugin/plugin.json`
- `README.md`
- `skills/ce-brainstorm/SKILL.md`
- `skills/ce-plan/SKILL.md`
- `docs/solutions/integrations/native-plugin-install-strategy.md`
