---
date: 2026-02-17
topic: copilot-skill-naming
---

# Copilot Skill Naming: Preserve Namespace

## What We're Building

Change the Copilot converter to preserve command namespaces when converting commands to skills. Currently `workflows:plan` flattens to `plan`, which is too generic and clashes with Copilot's own features in the chat suggestion UI.

## Why This Approach

The `flattenCommandName` function strips everything before the last colon, producing names like `plan`, `review`, `work` that are too generic for Copilot's skill discovery UI. Replacing colons with hyphens (`workflows:plan` -> `workflows-plan`) preserves context while staying within valid filename characters.

## Key Decisions

- **Replace colons with hyphens** instead of stripping the prefix: `workflows:plan` -> `workflows-plan`
- **Copilot only** — other converters (Cursor, Droid, etc.) keep their current flattening behavior
- **Content transformation too** — slash command references in body text also use hyphens: `/workflows:plan` -> `/workflows-plan`

## Changes Required

1. `src/converters/claude-to-copilot.ts` — change `flattenCommandName` to replace colons with hyphens
2. `src/converters/claude-to-copilot.ts` — update `transformContentForCopilot` slash command rewriting
3. `tests/copilot-converter.test.ts` — update affected tests

## Next Steps

-> Implement directly (small, well-scoped change)
