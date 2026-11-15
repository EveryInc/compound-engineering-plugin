# DeepSeek Harness (DSH) Spec (Skills)

Last verified: 2026-11-15

## Primary sources

DSH is in developer preview and does not publish a stable host specification yet. This spec was verified against the desktop app's runtime **0.2.2-rc.3**, using:

```
the bundled @deepseek-ai/dsh-skill-filesystem plugin README
```

Re-verify these roots and flags when DSH publishes public documentation.

## Skills

DSH loads skills from directories containing `SKILL.md` with YAML frontmatter (`name`, `description`, and optional `whenToUse`/`metadata`). It injects a catalog of names and descriptions into each session and loads a body on demand when the model calls its `skill` tool, so CE's progressive-disclosure shape works unchanged.

Skills are plugin-scoped in DSH: a skill can be mounted for one agent preset instead of every session. The install paths below use the user-level filesystem provider, which every session sees.

### Discovery paths

| Scope | Path |
| --- | --- |
| Project (recommended) | `<project>/.dsh/skills/<name>/` |
| Project, shared agent config | `<project>/.agents/skills/<name>/` |
| Global DSH root | `${DSH_HOME:-~/.dsh}/skills/<name>/` |
| Global shared agent root | `${AGENTS_HOME:-~/.agents}/skills/<name>/` |

The project root is the nearest ancestor directory containing `.git`, falling back to the current directory. When the same skill name appears in more than one root, the earlier row wins.

CE ships skills at `./skills/<name>/SKILL.md` in this repository. Compound Engineering does **not** copy skills into a generated tree for DSH; users link the repository's invocable skill directories into one of the discovery paths above.

### Manual-only skills

Some CE skills set `disable-model-invocation: true` in frontmatter so Claude and Codex do not auto-invoke them (for example `ce-help`, `ce-polish`, `ce-test-xcode`, `wtf`). DSH enforces that flag natively: the model cannot select those skills, while the user can still invoke them. No installer flag or special-casing is needed, so `.dsh/scripts/install-skills.sh` links all CE skills.

## Instruction files

DSH's instruction plugin loads the project's `AGENTS.md` chain, so CE's canonical project instruction file is read without a host-specific shim. CE skills reference "the project's active instructions and conventions already in your context" rather than hardcoding harness-specific filenames.

## Install commands

Global skills from a checkout:

```bash
/path/to/compound-engineering-plugin/.dsh/scripts/install-skills.sh --global
```

Project-scoped skills from a checkout:

```bash
/path/to/compound-engineering-plugin/.dsh/scripts/install-skills.sh --project /path/to/project
```

After installing or updating skills, start a new DSH session so the catalog refreshes.

## Update and removal

Re-run the install script after pulling a newer CE release. It creates or replaces only CE-owned symlinks (those resolving under this checkout's `skills/` tree) and leaves an existing entry pointing at a user skill, fork, or other checkout untouched.

To remove CE skills, run the script with `--uninstall`, or delete the symlinks named after CE skill ids (`ce-brainstorm`, `ce-plan`, etc.) from the chosen root.

## Subagent and tool notes

CE skills dispatch generic subagents with skill-local prompt assets under `references/agents/` and `references/personas/`. DSH provides the primitives CE expects, with graceful degradation when an optional one is absent:

| CE concept | DSH surface |
| --- | --- |
| Blocking question | `ask_user_question` |
| Delegation / Task | `subagent`, with per-instance model selection and discovery |
| Todos | `todo_write` |
| Shell and files | `bash`, `read`, `write`, `edit`, `glob`, `grep` |
| Web | host-provided `web_fetch` / `web_search` |
| Worktrees | `create_worktree` |
| Session memory | DSH session store; `session_search` and `session_event_*` when the session-search plugin is enabled |
| Manual-only | `disable-model-invocation: true` (native) |

CE workflows that assume a specific host CLI (for example cross-model review scripts that shell out to other agents) should degrade to the host's own delegation primitive or state the missing capability rather than assume another CLI is installed.

## Preview status

DSH is a developer preview. This spec covers skills discovery, manual-only flags, and instruction files only; plugin-scoped skill mounts and preset composition are host features outside this repository's install surface.
