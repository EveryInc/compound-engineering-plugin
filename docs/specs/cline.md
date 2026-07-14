# Cline Spec (Skills and CLI Plugins)

Last verified: 2026-06-30

## Primary sources

```
https://docs.cline.bot/customization/skills
https://docs.cline.bot/customization/plugins
https://docs.cline.bot/sdk/plugin-install
```

## Skills (primary CE install surface)

Cline skills follow the open [Agent Skills](https://agentskills.io) standard. Each skill is a directory containing `SKILL.md` with YAML frontmatter (`name`, `description`). Cline activates skills on demand via its `use_skill` tool when a request matches the skill description.

Skills is an experimental feature in the VS Code, Cursor, and JetBrains extensions. Enable it in **Settings -> Features -> Enable Skills** before CE skills appear.

### Discovery paths

| Scope | Path |
| --- | --- |
| Project (recommended) | `.cline/skills/<name>/` |
| Project (alternate) | `.clinerules/skills/<name>/` |
| Global (macOS/Linux) | `~/.cline/skills/<name>/` |
| Global (Windows) | `C:\Users\USERNAME\.cline\skills\<name>\` |

When a global skill and project skill share the same name, the global skill takes precedence.

CE ships skills at `./skills/<name>/SKILL.md` in this repository. Compound Engineering does **not** copy skills into a generated tree for Cline; users link the repository's invocable skill directories into one of the discovery paths above.

### Manual-only skills

Some CE skills set `disable-model-invocation: true` in frontmatter so Claude and Codex do not auto-invoke them (for example `lfg`, `ce-dogfood`, `ce-polish`, `ce-setup`). Cline has no equivalent flag — it auto-activates skills when descriptions match — so `.cline/scripts/install-skills.sh` **skips** manual-only skills by default. Default reruns remove only stale symlinks whose target resolves under this checkout's `skills/` directory. Re-run with `--include-manual` to link them for slash-command use; Cline may still auto-activate those skills when descriptions match.

## CLI plugins (secondary, not required for CE)

Cline CLI and SDK support `AgentPlugin` entry points installed with `cline plugin install` from git, npm, or local paths. That surface is for custom tools, hooks, and lifecycle extensions — not for loading `SKILL.md` bundles.

CE workflows are skills-first. This repo does not ship a Cline CLI plugin entry point because CE's value is the skill orchestration layer, which the skills install path covers for both the extension and the CLI.

## Instruction files

Cline reads project context from Cline rules and standard instruction files. This repository's canonical project instruction file is root `AGENTS.md`. CE skills reference "the project's active instructions and conventions already in your context" rather than hardcoding harness-specific filenames.

Do not add a root `CLINE.md` compatibility shim unless Cline documents support for that filename.

## Install commands

Global skills from a checkout:

```bash
/path/to/compound-engineering-plugin/.cline/scripts/install-skills.sh --global
```

Project-scoped skills from a checkout:

```bash
/path/to/compound-engineering-plugin/.cline/scripts/install-skills.sh --project
```

Manual-only skills (for example `ce-polish`, `ce-setup`) require the opt-in flag:

```bash
/path/to/compound-engineering-plugin/.cline/scripts/install-skills.sh --global --include-manual
```

After installing or updating skills, start a new Cline task so the skill list refreshes.

## Update and removal

Re-run the install script after pulling a newer CE release. It creates or replaces only CE-owned symlinks (those resolving under this checkout's `skills/` tree) and leaves an existing `<name>` symlink pointing at a user skill, fork, or other checkout untouched, mirroring the user-managed-symlink preservation the OpenCode/Codex/Pi writers apply.

To remove CE skills, delete the symlinks (or directories) named after CE skill ids (`ce-brainstorm`, `ce-plan`, etc.) from `~/.cline/skills/` or `.cline/skills/`.

## Subagent and tool notes

CE skills dispatch generic subagents with skill-local prompt assets under `references/agents/` and `references/personas/`. Cline's subagent and MCP capabilities vary by host (extension vs CLI). Skills degrade gracefully when a primitive is unavailable — the same cross-harness posture used for OpenCode and Pi.

Bundled shell scripts in skills use the model-filled `SKILL_DIR` anchor documented in the repository's contributor instructions so paths resolve when the agent's working directory is the user's project, not the skill directory.
