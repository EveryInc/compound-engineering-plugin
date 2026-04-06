---
title: "Beta skills framework: parallel skills with -beta suffix for safe rollouts"
category: skill-design
date: 2026-03-17
module: plugins/compound-engineering/skills
component: SKILL.md
tags:
  - skill-design
  - beta-testing
  - skill-versioning
  - rollout-safety
severity: medium
description: "Pattern for trialing new skill versions alongside stable ones using a -beta suffix. Covers naming, plan file naming, internal references, and promotion path."
related:
  - docs/solutions/skill-design/compound-refresh-skill-improvements.md
  - docs/solutions/skill-design/beta-promotion-orchestration-contract.md
---

## Problem

Core workflow skills like `ce:plan` are deeply chained (`ce:brainstorm` → `ce:plan` → `ce:work`) and orchestrated by `lfg` and `slfg`. Rewriting these skills risks breaking the entire workflow for all users simultaneously. There was no mechanism to let users trial new skill versions alongside stable ones.

Alternatives considered and rejected:
- **Beta gate in SKILL.md** with config-driven routing (`beta: true` in `compound-engineering.local.md`): relies on prompt-level conditional routing which risks instruction blending, requires setup integration, and adds complexity to the skill files themselves.
- **Pure router SKILL.md** with both versions in `references/`: adds file-read penalty and refactors stable skills unnecessarily.
- **Separate beta plugin**: heavy infrastructure for a temporary need.

## Solution

### Parallel skills with `-beta` suffix

Create separate skill directories alongside the stable ones. Each beta skill is a fully independent copy with its own frontmatter, instructions, and internal references.

```
skills/
├── ce-plan/SKILL.md           # Stable (unchanged)
└── ce-plan-beta/SKILL.md      # New version
```

### Naming and frontmatter conventions

- **Directory**: `<skill-name>-beta/`
- **Frontmatter name**: `<skill:name>-beta` (e.g., `ce:plan-beta`)
- **Description**: Write the intended stable description, then prefix with `[BETA]`. This ensures promotion is a simple prefix removal rather than a rewrite.
- **`disable-model-invocation: true`**: Prevents the model from auto-triggering the beta skill. Users invoke it manually with the slash command. Remove this field when promoting to stable.
- **Plan files**: Use `-beta-plan.md` suffix (e.g., `2026-03-17-001-feat-auth-flow-beta-plan.md`) to avoid clobbering stable plan files

### Internal references

Beta skills must reference other beta skills by their beta names. For example, if both `ce:plan` and `ce:review` have beta versions:
- `ce:plan-beta` references `ce:review-beta` (not `ce:review`)
- `ce:review-beta` references `ce:plan-beta` (not `ce:plan`)

### What doesn't change

- Stable skills are completely untouched
- `lfg`/`slfg` orchestration continues to use stable skills — no modification needed
- `ce:brainstorm` still hands off to stable `ce:plan` — no modification needed
- `ce:work` consumes plan files from either version (reads the file, doesn't care which skill wrote it)

### Tradeoffs

**Simplicity over seamless integration.** Beta skills exist as standalone, manually-invoked skills. They won't be auto-triggered by `ce:brainstorm` handoffs or `lfg`/`slfg` orchestration without further surgery to those skills, which isn't worth the complexity for a trial period.

**Intended usage pattern:** A user can run `/ce:plan` for the stable output, then run `/ce:plan-beta` on the same input to compare the two plan documents side by side. The `-beta-plan.md` suffix ensures both outputs coexist in `docs/plans/` without collision.

## Promotion path

When the beta version is validated:

1. Replace stable `SKILL.md` content with beta skill content
2. Restore stable frontmatter: remove `[BETA]` prefix from description, restore stable `name:`
3. Remove `disable-model-invocation: true` so the model can auto-trigger it
4. Update all internal references back to stable names
5. Restore stable plan file naming (remove `-beta` from the convention)
6. Delete the beta skill directory
7. Update README.md: remove from Beta Skills section, verify counts
8. Verify `lfg`/`slfg` work with the promoted skill
9. Verify `ce:work` consumes plans from the promoted skill

If the beta skill changed its invocation contract, promotion must also update all orchestration callers in the same PR instead of relying on the stable default behavior. See [beta-promotion-orchestration-contract.md](./beta-promotion-orchestration-contract.md) for the concrete review-skill example.

## Validation

After creating a beta skill, search its SKILL.md for references to the stable skill name it replaces. Any occurrence of the stable name without `-beta` is a missed rename — it would cause output collisions or route to the wrong skill.

Check for:
- **Output file paths** that use the stable naming convention instead of the `-beta` variant
- **Cross-skill references** that point to stable skill names instead of beta counterparts
- **User-facing text** (questions, confirmations) that mentions stable paths or names

## Prevention

- When adding a beta skill, always use the `-beta` suffix consistently in directory name, frontmatter name, description, plan file naming, and all internal skill-to-skill references
- After creating a beta skill, run the validation checks above to catch missed renames in file paths, user-facing text, and cross-skill references
- Always test that stable skills are completely unaffected by the beta skill's existence
- Keep beta and stable plan file suffixes distinct so outputs can coexist for comparison
