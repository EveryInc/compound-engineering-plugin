# Devin CLI Spec (Plugins and Skills)

Last verified: 2026-07-05, empirically against Devin CLI 3000.1.23 on macOS (binary inspection plus a live local install of this repo), following the convention in `docs/solutions/conventions/antigravity-target-empirical-format-verification.md`. Facts below come from the CLI's own behavior unless marked as documentation-sourced. The `Subagent profiles` section carries its own verification line against 3000.10.27.

## Primary sources

Devin CLI ships its documentation on disk with the install (Homebrew cask layout):

```text
<devin-install>/share/devin/docs/extensibility/plugins/overview.mdx
<devin-install>/share/devin/docs/extensibility/skills/overview.mdx
<devin-install>/share/devin/docs/extensibility/skills/creating-skills.mdx
```

## Plugin manifest

A Devin plugin is a directory (GitHub repo, git URL, or local path) with a manifest at exactly:

```text
<plugin_root>/.devin-plugin/plugin.json
```

There is no root-level manifest alternative — install fails with "could not read manifest at .../.devin-plugin/plugin.json" when the file is absent (verified). The manifest is parsed as a fixed field set (an 11-field `RawManifest` observed in the binary); tolerance of unknown fields is unverified, so CE ships documented fields only.

| Field | CE usage |
| --- | --- |
| `name` | Required plugin id, set to `compound-engineering`; also the slash-command namespace (`/compound-engineering:<skill>`) and must be unique among installed plugins |
| `version` | Root plugin version, bumped by release-please |
| `description`, `author`, `homepage`, `repository`, `license`, `keywords` | Shared display metadata (`author` is an object: `{ "name": ..., "email": ... }`) |
| `requiredPlugins`, `optionalPlugins`, `forbiddenPlugins` | Dependency/governance lists — not used by CE |

There is **no `skills` path field** (unlike Kimi and Codex manifests): Devin loads skills from the root `skills/` directory by convention. The release metadata sync therefore performs no declared-skills-path validation for Devin.

## Skills

- `skills/<name>/SKILL.md` at the plugin root, standard YAML frontmatter — the layout this repo already ships. All CE skills registered without transformation (verified: full live install).
- Installed skills surface as `/compound-engineering:<skill>` slash commands.
- Plugins load at **session start**. A mid-session install does not register skills in the running session (verified); users must start a new Devin session after install or update.
- Local-path installs are linked to the source directory, not copied — edits apply on the next session without reinstalling. GitHub installs are fetched copies updated via `devin plugins update`.

## Skill frontmatter compatibility

Devin parses Claude-style skill frontmatter natively. Observed in the binary's `SkillFrontmatter` schema and probed live:

- `name`, `description`, `argument-hint`, `model` — supported directly.
- `disable-model-invocation` and `user-invocable` — parsed natively, so CE's user-only skills (e.g. `ce-promote`, `ce-polish`, `ce-sweep`, `ce-product-pulse`) keep their invocation semantics.
- `allowed-tools` — parsed, with **partial name mapping** (verified by live probe):

| Claude tool name | Devin handling |
| --- | --- |
| `Read`, `Grep`, `Glob`, `Edit` | Mapped (case-insensitive) to `read`, `grep`, `glob`, `edit` |
| `Bash`, `Write`, `Task`, `WebFetch`, `WebSearch`, `AskUserQuestion`, patterned forms like `Bash(git *)` | Dropped silently |

Degradation is graceful: in Devin, `allowed-tools` is an **auto-approval list, not a hard restriction** — tools with dropped names remain available but prompt for user permission ("Other tools can still be used but will require user permission", verified). CE skills that declare `Bash`/`Write` (e.g. `ce-sweep`, `ce-product-pulse`) work, with extra permission prompts.

- Dynamic content (`$ARGUMENTS`/`$1`, `@file` inclusion, `` !`command` `` output) is supported per the CLI docs.

## Install commands

Direct install from GitHub (also accepts any git URL or a local path):

```bash
devin plugins install EveryInc/compound-engineering-plugin
```

Management:

```bash
devin plugins list
devin plugins info compound-engineering
devin plugins update compound-engineering
devin plugins remove compound-engineering
```

`install`, `list`, and `info` verified live; `update`/`remove` semantics are documentation-sourced. Pass `-y`/`--yes` to skip the pre-install summary prompt.

## No marketplace catalog

Devin has no marketplace concept — plugins install straight from a repo/URL/path, and dependency distribution runs through the manifest's `requiredPlugins`/`optionalPlugins` lists instead of a catalog file. There is no `.devin-plugin/marketplace.json` to ship, and `release:validate` performs no marketplace parity checks for Devin. Revisit if Devin ships a catalog schema.

## Instruction files

Devin reads `AGENTS.md` (and `CLAUDE.md` as a compatibility shim) for project instructions, plus `.claude/` project directories for commands/agents/hooks compatibility. No `DEVIN.md` file exists or is needed — the existing root `AGENTS.md` already serves Devin sessions in this repo.

## Subagent profiles (dispatch model selection)

Documentation-sourced from the installed docs of Devin CLI 3000.10.27 (`subagents.mdx`, `models.mdx`, `reference/configuration/config-file.mdx`, `enterprise/controls.mdx`); `devin doctor` and `devin models list` verified live on that build.

- `run_subagent` requires a `profile` argument selecting a subagent profile, not a raw model id. Two profiles ship built in:
  - `subagent_explore`: read-only codebase tools plus web search; no `exec`, no file writes. Runs the organisation's configured default subagent model.
  - `subagent_general`: full foreground tool set (a pre-approved set in the background). Always inherits the parent model; the default subagent model setting does not apply to it.
- Custom profiles live in `.devin/agents/<name>/AGENT.md`, `.agents/agents/<name>/AGENT.md`, `~/.config/devin/agents/<name>/AGENT.md` (`%APPDATA%\devin\agents\` on Windows). Frontmatter fields: `name`, `description`, optional `model` (an exact model id; when omitted the profile runs the org default subagent model), `allowed-tools` (hard restriction on the child's toolset, unlike the skill-frontmatter auto-approval semantics above), and `max-nesting` for profiles whose agents dispatch their own subagents.
- A custom profile whose `name` collides with a built-in is skipped with a warning.
- Custom profiles are experimental: format, behaviour, and configuration may change.
- `devin doctor` validates custom profile frontmatter (verified live: `pass  custom subagent profiles  none configured` on an install with no profiles).
- Devin Desktop's Devin Local agent shares the same agent harness as the CLI, so the same profile locations and semantics apply there.
- `devin models list` showed `swe-2-high` as a valid model id on the tested account. Model availability is per-account, so it is documented as an example only, never a default.
- Observability limit: the subagent panel labels profile, title, status, elapsed time, and tool-call count, but not which model is running. The model that actually served a custom profile is not machine-verifiable from the CLI.
- The installed docs do not specify the behaviour of `run_subagent` with an unknown or unavailable profile name. Callers should confirm resolution where the host exposes the profile set and otherwise degrade transparently, never reporting an unverified profile or model as having run.

## Open questions

- Whether the manifest parser tolerates unknown fields (CE avoids the question by shipping documented fields only).
- Whether Devin will map `Bash` -> `exec` (and `Write` -> `edit`) in `allowed-tools` compatibility handling; if so, the README note about permission prompts can be dropped.
- Whether plugin skills participate in Devin's model-invocable skill discovery identically to project skills (CE skills carry `description` frontmatter either way).
- What `run_subagent` does with an unknown or unavailable profile name (reject versus fallback), and whether the subagent panel will expose the running model for a profile that pins one.
