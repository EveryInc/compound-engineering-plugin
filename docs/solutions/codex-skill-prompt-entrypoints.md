---
title: Codex Conversion Skills, Prompts, and Canonical Entry Points
category: architecture
tags: [codex, converter, skills, prompts, workflows, deprecation]
created: 2026-03-15
severity: medium
component: codex-target
problem_type: convention
root_cause: outdated_target_model
---

# Codex Conversion Skills, Prompts, and Canonical Entry Points

## Problem

The Codex target had two conflicting assumptions:

1. Compound workflow entrypoints like `ce:brainstorm` and `ce:plan` were treated in docs as slash-command-style surfaces.
2. The Codex converter installed those entries as copied skills, not as generated prompts.

That created an inconsistent runtime for cross-workflow handoffs. Copied skill content still contained Claude-style references like `/ce:plan`, but no Codex-native translation was applied to copied `SKILL.md` files, and there was no clear canonical Codex entrypoint model for those workflow skills.

## What We Learned

### 1. Codex supports both skills and prompts, and they are different surfaces

- Skills are loaded from skill roots such as `~/.codex/skills`, and newer Codex code also supports `.agents/skills`.
- Prompts are a separate explicit entrypoint surface under `.codex/prompts`.
- A skill is not automatically a prompt, and a prompt is not automatically a skill.

For this repo, that means a copied skill like `ce:plan` is only a skill unless the converter also generates a prompt wrapper for it.

### 2. Codex skill names come from the directory name

Codex derives the skill name from the skill directory basename, not from our normalized hyphenated converter name.

Implication:

- `~/.codex/skills/ce:plan` loads as the skill `ce:plan`
- Rewriting that to `ce-plan` is wrong for skill-to-skill references

### 3. The original bug was structural, not just wording

The issue was not that `ce:brainstorm` needed slightly different prose. The real problem was:

- copied skills bypassed Codex-specific transformation
- workflow handoffs referenced a surface that was not clearly represented in installed Codex artifacts

### 4. Deprecated `workflows:*` aliases add noise in Codex

The `workflows:*` names exist only for backward compatibility in Claude.

Copying them into Codex would:

- duplicate user-facing entrypoints
- complicate handoff rewriting
- increase ambiguity around which name is canonical

For Codex, the simpler model is to treat `ce:*` as the only canonical workflow namespace and omit `workflows:*` aliases from installed output.

## Recommended Codex Model

Use a two-layer mapping for workflow entrypoints:

1. **Skills remain the implementation units**
   - Copy the canonical workflow skills using their exact names, such as `ce:plan`
   - Preserve exact skill names for any Codex skill references

2. **Prompts are the explicit entrypoint layer**
   - Generate prompt wrappers for canonical user-facing workflow entrypoints
   - Use Codex-safe prompt slugs such as `ce-plan`, `ce-work`, `ce-review`
   - Prompt wrappers delegate to the exact underlying skill name, such as `ce:plan`

This gives Codex one clear manual invocation surface while preserving the real loaded skill names internally.

## Rewrite Rules

When converting copied `SKILL.md` content for Codex:

- References to canonical workflow entrypoints should point to generated prompt wrappers
  - `/ce:plan` -> `/prompts:ce-plan`
  - `/ce:work` -> `/prompts:ce-work`
- References to deprecated aliases should canonicalize to the modern `ce:*` prompt
  - `/workflows:plan` -> `/prompts:ce-plan`
- References to non-entrypoint skills should use the exact skill name, not a normalized alias
- Actual Claude commands that are converted to Codex prompts can continue using `/prompts:...`

### Regression hardening

When rewriting copied `SKILL.md` files, only known workflow and command references should be rewritten.

Do not rewrite arbitrary slash-shaped text such as:

- application routes like `/users` or `/settings`
- API path segments like `/state` or `/ops`
- URLs such as `https://www.proofeditor.ai/...`

Unknown slash references should remain unchanged in copied skill content. Otherwise Codex installs silently corrupt unrelated skills while trying to canonicalize workflow handoffs.

Personal skills loaded from `~/.claude/skills` also need tolerant metadata parsing:

- malformed YAML frontmatter should not cause the entire skill to disappear
- keep the directory name as the stable skill name
- treat frontmatter metadata as best-effort only

## Future Entry Points

Do not hard-code an allowlist of workflow names in the converter.

Instead, use a stable rule:

- `ce:*` = canonical workflow entrypoint
  - auto-generate a prompt wrapper
- `workflows:*` = deprecated alias
  - omit from Codex output
  - rewrite references to the canonical `ce:*` target
- non-`ce:*` skills = skill-only by default
  - if a non-`ce:*` skill should also be a prompt entrypoint, mark it explicitly with Codex-specific metadata

This means future skills like `ce:ideate` should work without manual converter changes.

## Implementation Guidance

For the Codex target:

1. Parse enough skill frontmatter to distinguish command-like entrypoint skills from background skills
2. Filter deprecated `workflows:*` alias skills out of Codex installation
3. Generate prompt wrappers for canonical `ce:*` workflow skills
4. Apply Codex-specific transformation to copied `SKILL.md` files
5. Preserve exact Codex skill names internally
6. Update README language so Codex entrypoints are documented as Codex-native surfaces, not assumed to be identical to Claude slash commands

## Prevention

Before changing the Codex converter again:

1. Verify whether the target surface is a skill, a prompt, or both
2. Check how Codex derives names from installed artifacts
3. Decide which names are canonical before copying deprecated aliases
4. Add tests for copied skill content, not just generated prompt content

## Related Files

- `src/converters/claude-to-codex.ts`
- `src/targets/codex.ts`
- `src/types/codex.ts`
- `tests/codex-converter.test.ts`
- `tests/codex-writer.test.ts`
- `README.md`
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md`
- `plugins/compound-engineering/skills/ce-plan/SKILL.md`
- `docs/solutions/adding-converter-target-providers.md`
