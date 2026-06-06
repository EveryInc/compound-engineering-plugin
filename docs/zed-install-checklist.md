# Zed Install Checklist

## Prerequisites

- Zed installed and running.
- Project has a git checkout.
- User-level or project-level `AGENTS.md` updated if needed.

## Install

1. Copy the skill tree into the Zed skill root:
   - Project-local: `.agents/skills/ce-code-review/`
   - User-global: `~/.config/zed/skills/ce-code-review/`
2. Confirm folder structure exists:
   - `SKILL.md`
   - `references/reviewers.md`
   - `references/checklist.md`
   - `references/sections.md`

## Validate

1. Open **AI > Skills** in Zed.
2. Confirm `ce-code-review` is listed.
3. Invoke the skill with no arguments on a branch with changes.
4. Verify output includes the section contract from `references/sections.md`.

## Rollback

- Remove the copied skill folder to uninstall.
