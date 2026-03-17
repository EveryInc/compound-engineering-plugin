# Plugin Instructions

These instructions apply when working under `plugins/compound-engineering/`.
They supplement the repo-root `AGENTS.md`.

# Compounding Engineering Plugin Development

## Versioning Requirements

**IMPORTANT**: Routine PRs should not cut releases for this plugin.

The repo uses an automatied release process to prepare plugin releases, including version selection and changelog generation. Because multiple PRs may merge before the next release, contributors cannot know the final released version from within an individual PR.

### Contributor Rules

- Do **not** manually bump `.claude-plugin/plugin.json` version in a normal feature PR.
- Do **not** manually bump `.claude-plugin/marketplace.json` plugin version in a normal feature PR.
- Do **not** cut a release section in `CHANGELOG.md` for a normal feature PR.
- Do update substantive docs that are part of the actual change, such as `README.md`, component tables, usage instructions, or counts when they would otherwise become inaccurate.

### Pre-Commit Checklist

Before committing ANY changes:

- [ ] No manual release-version bump in `.claude-plugin/plugin.json`
- [ ] No manual release-version bump in `.claude-plugin/marketplace.json`
- [ ] No manual release entry added to `CHANGELOG.md`
- [ ] README.md component counts verified
- [ ] README.md tables accurate (agents, commands, skills)
- [ ] plugin.json description matches current counts

### Directory Structure

```
agents/
├── review/     # Code review agents
├── research/   # Research and analysis agents
├── design/     # Design and UI agents
└── docs/       # Documentation agents

skills/
├── ce-*/          # Core workflow skills (ce:plan, ce:review, etc.)
└── */             # All other skills
```

> **Note:** Commands were migrated to skills in v2.39.0. All former
> `/command-name` slash commands now live under `skills/command-name/SKILL.md`
> and work identically in Claude Code. Other targets may convert or map these references differently.

## Command Naming Convention

**Workflow commands** use `ce:` prefix to unambiguously identify them as compound-engineering commands:
- `/ce:brainstorm` - Explore requirements and approaches before planning
- `/ce:plan` - Create implementation plans
- `/ce:review` - Run comprehensive code reviews
- `/ce:work` - Execute work items systematically
- `/ce:compound` - Document solved problems

**Why `ce:`?** Claude Code has built-in `/plan` and `/review` commands. The `ce:` namespace (short for compound-engineering) makes it immediately clear these commands belong to this plugin.

## Skill Compliance Checklist

When adding or modifying skills, verify compliance with the skill spec:

### YAML Frontmatter (Required)

- [ ] `name:` present and matches directory name (lowercase-with-hyphens)
- [ ] `description:` present and describes **what it does and when to use it** (per official spec: "Explains code with diagrams. Use when exploring how code works.")

### Reference Links (Required if references/ exists)

- [ ] All files in `references/` are linked as `[filename.md](./references/filename.md)`
- [ ] All files in `assets/` are linked as `[filename](./assets/filename)`
- [ ] All files in `scripts/` are linked as `[filename](./scripts/filename)`
- [ ] No bare backtick references like `` `references/file.md` `` - use proper markdown links

### Writing Style

- [ ] Use imperative/infinitive form (verb-first instructions)
- [ ] Avoid second person ("you should") - use objective language ("To accomplish X, do Y")

### Cross-Platform User Interaction

- [ ] When a skill needs to ask the user a question, instruct use of the platform's blocking question tool and name the known equivalents (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini)
- [ ] Include a fallback for environments without a question tool (e.g., present numbered options and wait for the user's reply before proceeding)

### Cross-Platform Reference Rules

This plugin is authored once, then converted for other agent platforms. Commands and agents are transformed during that conversion, but `plugin.skills` are usually copied almost exactly as written.

- [ ] Because of that, slash references inside command or agent content are acceptable when they point to real published commands; target-specific conversion can remap them.
- [ ] Inside a pass-through `SKILL.md`, do not assume slash references will be remapped for another platform. Write references according to what will still make sense after the skill is copied as-is.
- [ ] When one skill refers to another skill, prefer semantic wording such as "load the `document-review` skill" rather than slash syntax.
- [ ] Use slash syntax only when referring to an actual published command or workflow such as `/ce:work` or `/deepen-plan`.

### Tool Selection in Agents and Skills

Agents and skills that explore codebases must prefer native tools over shell commands.

Why: shell-heavy exploration causes avoidable permission prompts in sub-agent workflows; native file-search, content-search, and file-read tools avoid that.

- [ ] Never instruct agents to use `find`, `ls`, `cat`, `head`, `tail`, `grep`, `rg`, `wc`, or `tree` through a shell for routine file discovery, content search, or file reading
- [ ] Describe tools by capability class with platform hints — e.g., "Use the native file-search/glob tool (e.g., Glob in Claude Code)" — not by Claude Code-specific tool names alone
- [ ] When shell is the only option (e.g., `ast-grep`, `bundle show`, git commands), instruct one simple command at a time — no chaining (`&&`, `||`, `;`), pipes, or redirects
- [ ] Do not encode shell recipes for routine exploration when native tools can do the job; encode intent and preferred tool classes instead
- [ ] For shell-only workflows (e.g., `gh`, `git`, `bundle show`, project CLIs), explicit command examples are acceptable when they are simple, task-scoped, and not chained together

### Quick Validation Command

```bash
# Check for unlinked references in a skill
grep -E '`(references|assets|scripts)/[^`]+`' skills/*/SKILL.md
# Should return nothing if all refs are properly linked

# Check description format - should describe what + when
grep -E '^description:' skills/*/SKILL.md
```

## Beta Skills

Beta skills are experimental versions of core workflow skills, published as separate skills with a `-beta` suffix (e.g., `ce-plan-beta`, `deepen-plan-beta`). They live alongside the stable versions and are invoked directly.

See `docs/solutions/skill-design/beta-skills-framework.md` for the full pattern.

### Beta Skill Rules

- Beta skills use `-beta` suffix in directory name, skill name, and description prefix (`[BETA]`)
- Beta skills set `disable-model-invocation: true` to prevent accidental auto-triggering — users invoke them manually
- Beta skill descriptions should be the intended stable description prefixed with `[BETA]`, so promotion is a simple prefix removal
- Beta skills must reference other beta skills by their beta names (e.g., `/deepen-plan-beta`, not `/deepen-plan`)
- Beta plan output files use `-beta-plan.md` suffix to avoid clobbering stable plan files
- Beta skills are not wired into `lfg`/`slfg` orchestration — invoke them directly

### Beta Skill Validation

After creating or modifying a beta skill, search its SKILL.md for any reference to the stable skill name it replaces. Occurrences of the stable name without `-beta` are missed renames that would cause output collisions or misrouting. Check for:

- Output file paths using the stable naming convention instead of the `-beta` variant
- Cross-skill references pointing to stable names instead of beta counterparts
- User-facing text (questions, confirmations) mentioning stable paths or names

### Promoting Beta to Stable

When replacing a stable skill with its beta version:

- [ ] Replace stable `SKILL.md` content with beta skill content
- [ ] Restore stable frontmatter: remove `[BETA]` prefix from description, restore stable `name:` (e.g., `ce:plan` not `ce:plan-beta`)
- [ ] Remove `disable-model-invocation: true` so the model can auto-trigger the skill
- [ ] Update all internal references back to stable names (`/deepen-plan` not `/deepen-plan-beta`)
- [ ] Restore stable plan file naming (remove `-beta` from `-beta-plan.md` convention)
- [ ] Delete the beta skill directory
- [ ] Update README.md: remove from Beta Skills section, verify counts
- [ ] Verify `lfg`/`slfg` still work with the updated stable skill
- [ ] Verify `ce:work` consumes plans from the promoted skill correctly

## Documentation

See `docs/solutions/plugin-versioning-requirements.md` for detailed versioning workflow.
