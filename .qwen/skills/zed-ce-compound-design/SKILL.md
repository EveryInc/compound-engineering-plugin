---
name: zed-ce-compound-design
description: 'Design Zed-native ce-compound skill from the Claude Code source tree: review the source asset structure under plugins/compound-engineering/skills/ce-compound, then create .agents/skills/ce-compound/{SKILL.md, assets, references} without executing the workflow.'
source: auto-skill
extracted_at: '2026-06-06T05:52:02.744Z'
---

# zed-ce-compound-design

## Goal

Mirror the Claude Code source tree for `ce-compound` into a Zed-loadable form under `.agents/skills/ce-compound/`.

## Steps

1. Read `/Users/laobaibai/Documents/compound-engineering-plugin/plugins/compound-engineering/skills/ce-compound/SKILL.md` and inspect its references and assets.
2. List `.agents/skills/ce-compound/` to see what is already present. Treat each listed element (`SKILL.md`, `assets/resolution-template.md`, `references/schema.yaml`, etc.) as part of the design surface even if the directory appears empty in a prior scan.
3. If an expected source file is missing in the source tree, note that as a gap and continue with the rest of the tree.
4. Create or update the matching destinations under `.agents/skills/ce-compound/`. Root into the source tree one-to-one: `assets/*` stays under `.agents/skills/ce-compound/assets/`, and `references/*` stays under `.agents/skills/ce-compound/references/`.
5. In the output, return a short report: created paths, skipped paths, and any gaps that need manual resolution before running `.agents/skills/ce-compound/SKILL.md`.

## Output contract

Do not execute `ce-compound`. This skill is a design skill only. The report should be concise and path-based so a follow-on verification skill can consume it.
