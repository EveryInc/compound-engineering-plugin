# Zed Skill Tree Specification

Version: 0.1.0
Status: draft

## Layout

```text
<root>/skills/<name>/SKILL.md
<root>/skills/<name>/references/*.md
```

- `<root>` is either a project-local `.agents` directory or a user-level Zed config directory.
- Do not place skill content directly under `<root>/skills`; every skill must be namespaced by folder name.
- Keep each skill self-contained: all supporting content lives inside the skill folder.

## Naming

- Use lowercase ASCII letters and hyphens only: `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`
- Limit to 64 characters.
- Avoid generic collisions; use `ce-` prefix for Compound Engineering skills.

## Frontmatter

- Preserve the source skill `name` and `description` fields.
- Add a `target: zed` marker when the skill is Zed-specific or freshly converted.

## Prompt mechanics

- Zed dispatches subagents with `spawn_agent`.
- Prompts must be self-contained: include role, constraints, output schema, and merge instructions in one prompt block.
- Prefer inline prompts over sibling prompt files; this avoids cross-skill traversal and keeps skills portable.

## Verification

- Skills load in Zed's AI > Skills panel without warning.
- Reference files under `references/` resolve relative to the skill folder.
