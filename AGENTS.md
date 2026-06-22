# Agent Instructions

This repository is the root of the `compound-engineering` coding-agent plugin and the marketplace/catalog metadata used to distribute it.

It also contains:
- the Bun/TypeScript CLI that converts Claude Code plugins into other agent platform formats
- shared release and metadata infrastructure for the CLI, marketplace, and plugin

`AGENTS.md` is the canonical repo instruction file. Root `CLAUDE.md` exists only as a compatibility shim for tools and conversions that still look for it.

## Quick Start

```bash
bun install
bun test                  # full test suite
bun run release:validate  # check plugin/marketplace consistency
```

## Working Agreement

- **Branching:** Create a feature branch for any non-trivial change. If already on the correct branch for the task, keep using it; do not create additional branches or worktrees unless explicitly requested.
- **Merge policy:** All changes to `main` go through pull requests. Direct pushes and direct merges are not allowed; branch protection on `main` enforces this by requiring the `test` status check to pass. The direct path bypasses `release:validate`, the test suite, and PR title validation — past direct merges have caused version drift requiring multi-PR recovery (see `docs/solutions/workflow/release-please-version-drift-recovery.md`).
- **Safety:** Do not delete or overwrite user data. Avoid destructive commands.
- **Testing:** Run `bun test` after changes that affect parsing, conversion, or output.
- **Release versioning:** Releases are prepared by release automation, not normal feature PRs. The repo has one root plugin/package release component (`compound-engineering`) plus marketplace components (`marketplace`, `cursor-marketplace`). GitHub release PRs and GitHub Releases are the canonical release-notes surface for new releases; root `CHANGELOG.md` is only a pointer to that history. Use conventional titles such as `feat:` and `fix:` so release automation can classify change intent, but do not hand-bump release-owned versions or hand-author release notes in routine PRs.
- **Output Paths:** Keep OpenCode output at `opencode.json` and `.opencode/{agents,skills,plugins}`. For OpenCode, command go to `~/.config/opencode/commands/<name>.md`; `opencode.json` is deep-merged (never overwritten wholesale).
- **Scratch Space:** Default to OS temp. Use `.context/` only when explicitly justified by the rules below.
  - **Default: OS temp** — covers most scratch, including per-run throwaway AND cross-invocation reusable, regardless of whether a repo is present or whether other skills may read the files. A stable OS-temp prefix handles cross-skill and cross-invocation coordination equally well as an in-repo path; repo-adjacency is rarely the relevant property.
    - **Per-run throwaway**: `mktemp -d -t <prefix>-XXXXXX` (OS handles cleanup). Use for files consumed once and discarded — captured screenshots, stitched GIFs, intermediate build outputs, recordings, delegation prompts/results, single-run checkpoints. The resulting path is opaque (on macOS it resolves under `$TMPDIR`/`/var/folders/...`) — that is appropriate for throwaway files users are not meant to access.
    - **Cross-invocation reusable**: stable path `/tmp/compound-engineering/<skill-name>/<run-id>/` — **not** `mktemp -d` — so later invocations of the same skill can discover sibling run-ids. Use `/tmp` directly rather than `$TMPDIR` so paths stay accessible: `$TMPDIR` on macOS resolves to `/var/folders/64/.../T/`, which is hostile for users who want to inspect checkpoints, grep them, or copy them out. The per-user isolation `$TMPDIR` provides is not valuable for cross-invocation reusable scratch where users are the intended audience. Use for caches keyed by session, checkpoints meant to survive context compaction within a loose session, or any state where later runs of the same skill need to locate prior outputs.
  - **Exception: `.context/`** — use only when the artifact is genuinely bound to the CWD repo AND meets at least one of:
    - (a) **User-curated**: the user is expected to inspect, manipulate, or manually curate the artifact outside the skill (e.g., a per-repo TODO database, a per-spec optimization log that survives across sessions on the same checkout).
    - (b) **Repo+branch-inseparable**: the artifact's meaning is inseparable from this specific repo or branch (e.g., branch-specific resume state that a user expects to pick up again in the same checkout).
    - (c) **Path is core UX**: surfacing the artifact path back to the user is a core part of the skill's output and that path is easier to communicate as a repo-relative location than an OS-temp one.
    Namespace under `.context/compound-engineering/<workflow-or-skill-name>/`, add a per-run subdirectory when concurrent runs are plausible, and decide cleanup behavior per the artifact's lifecycle (per-run scratch clears on success; user-curated state persists). "Shared between skills" is not by itself sufficient — OS temp handles that equally well.
  - **Durable outputs** (plans, specs, learnings, docs, final deliverables) belong in `docs/` or another repo-tracked location, not in either scratch tier.
  - **Cross-platform note:** `/tmp` is writable on macOS (symlink to `/private/tmp`), Linux, and WSL. `mktemp -d -t <prefix>-XXXXXX` also works on all three. Skills authored here assume Unix-like shells; native Windows is not a current target.
- **Character encoding:**
  - **Identifiers** (file names, agent names, command names): ASCII only -- converters and regex patterns depend on it.
  - **Markdown tables:** Use pipe-delimited (`| col | col |`), never box-drawing characters.
  - **Prose and skill content:** Unicode is fine (emoji, punctuation, etc.). Prefer ASCII arrows (`->`, `<-`) over Unicode arrows in code blocks and terminal examples.

## Directory Layout

```
src/              CLI entry point, parsers, converters, target writers
skills/           Compound Engineering plugin skills
.claude-plugin/   Claude plugin manifest and marketplace catalog metadata
.codex-plugin/    Codex plugin manifest
.cursor-plugin/   Cursor plugin manifest and marketplace catalog metadata
.opencode/        OpenCode package entrypoint and install docs
.pi/              Pi extension entrypoint
tests/            Converter, writer, and CLI tests + fixtures
docs/             Requirements, plans, solutions, and target specs
CONCEPTS.md       Shared domain vocabulary (glossary of project-specific terms)
```

## Repo Surfaces

Changes in this repo may affect one or more of these surfaces:

- root plugin content under `skills/`, `AGENTS.md`, `README.md`, and platform manifests
- marketplace catalogs under `.claude-plugin/`, `.cursor-plugin/`, and `.agents/plugins/`
- the converter/install CLI in `src/` and `package.json`

Do not assume a repo change is "just CLI" or "just plugin" without checking which surface owns the affected files.

## Plugin Maintenance

When changing plugin content:

- Update substantive docs like `README.md` when the plugin behavior, inventory, or usage changes.
- Do not hand-bump release-owned versions in plugin or marketplace manifests.
- Do not hand-add release entries to `CHANGELOG.md` or treat it as the canonical source for new releases.
- Run `bun run release:validate` if agents, commands, skills, MCP servers, or release-owned descriptions/counts may have changed.
- When removing a skill, agent, or command, add its name to both cleanup registries so stale flat-install artifacts are swept on upgrade:
  - `STALE_SKILL_DIRS` / `STALE_AGENT_NAMES` / `STALE_PROMPT_FILES` in `src/utils/legacy-cleanup.ts`
  - `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"]` in `src/data/plugin-legacy-artifacts.ts`

Useful validation commands:

```bash
bun run release:validate
cat .claude-plugin/marketplace.json | jq .
cat .claude-plugin/plugin.json | jq .
```

## Runtime vs Authoring Context

`AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` are authoring context for this source repository. Skills are installed into end-user environments, where they run against the user's local instruction files, not this repo's. Behavioral rules that must affect a skill at runtime belong in that skill's `SKILL.md` or files under its own `references/` directory.

## Referencing Project Conventions in Skills

When a skill needs to discover a project convention at runtime — the issue tracker, coding standards, commit format, lint command, scope constraints, etc. — describe **what to look for in the agent's existing context**, not **which file to open**.

**On the read path, do not name instruction files (`AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `.cursor/rules`).** Phrase it as "the project's active instructions and conventions already in your context." Three reasons:

- **Redundant.** Every major harness auto-injects the project's root instruction file into context at session start (Claude Code loads `CLAUDE.md`, Codex `AGENTS.md`, Gemini `GEMINI.md`). Telling the agent to "read `AGENTS.md`" asks it to re-open content it already has.
- **Brittle / not portable.** The filename differs per harness, and this plugin is authored once and converted to all of them. A hardcoded "read `AGENTS.md` (or `CLAUDE.md`)" silently finds nothing on a harness that uses a different name.
- **Security smell.** Instructing an agent to go *read named instruction dotfiles* is the exact shape that prompt-injection defenses in some agent frameworks (e.g., Hermes) flag. Referencing context rather than filenames avoids tripping those guards.

**Name a concrete file only where the skill must do something a context reference can't express:**

- **Writing a convention back** (e.g., persisting `project_tracker: linear`) needs a target — name it minimally and as an example ("the project's root agent-instructions file, e.g., `AGENTS.md`; if it `@`-includes another, write to the substantive one").
- **Reading content that is genuinely not auto-loaded** — a subdirectory-scoped instruction file governing the area being changed, an optional project doc like `STRATEGY.md` / `CONCEPTS.md` / `README.md`, or any file a *fresh subagent* (which does not inherit the parent's loaded instructions) must open to do its job. Auditing tools that must enumerate every standards file (e.g., `ce-code-review`'s project-standards reviewer globbing all `CLAUDE.md`/`AGENTS.md`) are a legitimate exception — they review the files, they don't re-read them for context.

**Describe the capability, not the tool.** Pair this with naming the *category* of thing rather than a closed set: "the project's issue tracker (e.g., GitHub Issues, Linear, Jira)" and "whatever interface that tracker exposes (connector/MCP, documented API, or a documented CLI)" — never assume a specific CLI exists, and never treat a missing binary / env var / MCP server as proof the capability is unavailable.

## Validating Agent and Skill Changes

Behavioral changes to a plugin skill or skill-local persona (anything under `skills/`) need a different validation path than mechanical code changes, because of how Claude Code loads plugins.

- **Use the `skill-creator` skill to test changes.** Skill-creator is purpose-built for this: it spawns a generic subagent and injects the agent or skill content into the subagent's prompt at dispatch time, so each run reads the current source from disk. Invoke `/skill-creator` and use its eval workflow rather than reaching for ad-hoc workarounds.

- **Plugin agent and skill definitions both cache at session start.** Once a Claude Code session is open, dispatching a typed plugin agent runs the in-memory copy that was loaded when the session began. The same applies to skills: invoking a skill goes through the cached skill loader, so edits to skill scripts are also not tested via that path. File edits to either layer after session start do not propagate within the same session. Any iteration loop built around typed-agent dispatch or Skill-tool invocation in the same session is testing pre-edit content, not your changes.

- **Do NOT edit `~/.claude/plugins/cache/` or `~/.claude/plugins/marketplaces/` to try to force a reload.** Those paths are user machine state, not repo-managed. Modifying them does not reliably bypass the in-session cache (it didn't, in observed behavior), risks being silently overwritten by plugin updates, and is the wrong layer to test from. The skill-creator pattern is the proper approach; if you genuinely need fresh-loaded behavior of the typed-agent dispatch path, restart the Claude Code session — but skill-creator is preferred for fast iteration.

- **Mechanical changes do not have this restriction.** Skill scripts (e.g., `extract-metadata.py`), parser logic, conversion code, and anything `bun test` exercises always run the current source. The caching issue only affects LLM-driven skill prose behavior dispatched through the plugin loader.

## Coding Conventions

- Prefer explicit mappings over implicit magic when converting between platforms.
- Keep target-specific behavior in dedicated converters/writers instead of scattering conditionals across unrelated files.
- Preserve stable output paths and merge semantics for installed targets; do not casually change generated file locations.
- When adding or changing a target, update fixtures/tests alongside implementation rather than treating docs or examples as sufficient proof.

## Commit Conventions

- **Prefix is based on intent, not file type.** Use conventional prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, etc.) but classify by what the change does, not the file extension. Files under `skills/` and plugin manifests are product code even though they are Markdown or JSON. Reserve `docs:` for files whose sole purpose is documentation (`README.md`, `docs/`, `CHANGELOG.md`).
- **Type selection — classify by intent, not diff shape.** Where `fix:` and `feat:` could both seem to fit, default to `fix:`: a change that remedies broken or missing behavior is `fix:` even when implemented by adding code, and net additions do not turn a fix into a `feat:`. Reserve `feat:` for capabilities the user could not previously accomplish where nothing was broken. Other conventional types (`chore:`, `refactor:`, `docs:`, `perf:`, `test:`, `ci:`, `build:`, `style:`) remain primary when they describe the change more precisely than either. Heuristic: if a regression test you could write today would have failed *before* the change, it's `fix:`. The user may override this default for a specific change.
- **Include a component scope.** The scope appears verbatim in the changelog. Pick the narrowest useful label: skill/agent name (`document-review`, `learnings-researcher`), CLI or marketplace area (`cli`, `marketplace`), or shared area when cross-cutting (`review`, `research`, `converters`). Never use `compound-engineering` — it's the entire plugin and tells the reader nothing. Omit scope only when no single label adds clarity.
- **Never use `!` or a `BREAKING CHANGE:` footer without explicit user confirmation.** These markers trigger release-please's automatic major version bump — a decision the user may not want even when a change is technically breaking. If a change appears breaking, surface that to the user and let them decide whether to apply the marker.

## Adding a New Target Provider

Only add a provider when the target format is stable, documented, and has a clear mapping for tools/permissions/hooks. Use this checklist:

1. **Define the target entry**
   - Add a new handler in `src/targets/index.ts` with `implemented: false` until complete.
   - Use a dedicated writer module (e.g., `src/targets/codex.ts`).

2. **Define types and mapping**
   - Add provider-specific types under `src/types/`.
   - Implement conversion logic in `src/converters/` (from Claude → provider).
   - Keep mappings explicit: tools, permissions, hooks/events, model naming.

3. **Wire the CLI**
   - Ensure `convert` and `install` support `--to <provider>` and `--also`.
   - Keep behavior consistent with OpenCode (write to a clean provider root).

4. **Tests (required)**
   - Extend fixtures in `tests/fixtures/sample-plugin`.
   - Add spec coverage for mappings in `tests/converter.test.ts`.
   - Add a writer test for the new provider output tree.
   - Add a CLI test for the provider (similar to `tests/cli.test.ts`).

5. **Docs**
   - Update README with the new `--to` option and output locations.

## Specialist Prompt Assets in Skills

The compound-engineering plugin no longer ships standalone agent definitions under `agents/`. When a skill needs a specialist persona, store it inside that skill directory, usually under `references/agents/` or `references/personas/`, and have the calling skill dispatch a generic subagent with that file's contents in the prompt.

Internal prompt asset file names should be descriptive and unprefixed because they are not externally exposed agent names.

Example:
- `references/agents/learnings-researcher.md` (correct)
- `references/agents/ce-learnings-researcher.md` (wrong for an internal prompt asset)

These prompt assets must not include YAML frontmatter. Model selection, tool constraints, and dispatch policy belong in the calling skill's `SKILL.md`, not in the prompt asset.

## File References in Skills

Each skill directory is a self-contained unit. A SKILL.md file must only reference files within its own directory tree (e.g., `references/`, `assets/`, `scripts/`) using relative paths from the skill root. Never reference files outside the skill directory — whether by relative traversal or absolute path.

Broken patterns:

- `../other-skill/references/schema.yaml` — relative traversal into a sibling skill
- `/home/user/compound-engineering-plugin/skills/other-skill/file.md` — absolute path to another skill
- `~/.claude/plugins/cache/marketplace/compound-engineering/1.0.0/skills/other-skill/file.md` — absolute path to an installed plugin location

Why this matters:

- **Runtime resolution:** Skills execute from the user's working directory, not the skill directory. Cross-directory paths and absolute paths will not resolve as expected.
- **Unpredictable install paths:** Plugins installed from the marketplace are cached at versioned paths. Absolute paths that worked in the source repo will not match the installed layout, and the version segment changes on every release.
- **Converter portability:** The CLI copies each skill directory as an isolated unit when converting to other agent platforms. Cross-directory references break because sibling directories are not included in the copy.

If two skills need the same supporting file, duplicate it into each skill's directory. Prefer small, self-contained reference files over shared dependencies.

> **Note (March 2026):** This constraint reflects current Claude Code skill resolution behavior and known path-resolution bugs ([#11011](https://github.com/anthropics/claude-code/issues/11011), [#17741](https://github.com/anthropics/claude-code/issues/17741), [#12541](https://github.com/anthropics/claude-code/issues/12541)). If Anthropic introduces a shared-files mechanism or cross-skill imports in the future, this guidance should be revisited with supporting documentation.

## Platform-Specific Variables in Skills

This plugin is authored once and converted for multiple agent platforms (Claude Code, Codex, Gemini CLI, etc.). Do not use platform-specific environment variables or string substitutions (e.g., `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_SESSION_ID}`, `CODEX_SANDBOX`, `CODEX_SESSION_ID`) in skill content without a graceful fallback that works when the variable is unavailable or unresolved.

Whether a relative path resolves against the skill directory depends on *who* resolves it, so the two cases below must be handled differently. Do not assume a bare `scripts/…` path works in both.

**Read-time file references — resolve against the skill directory:** When skill *content* points the agent at a co-located file to read (e.g., "read `references/schema.yaml`"), use a relative path from the skill root. The skill loader resolves these against the skill's own directory on all major platforms — no variable prefix needed. This is the rule in *File References in Skills* above.

**Runtime script invocations via the Bash tool — resolve against the project CWD:** When skill content tells the agent to *execute* a bundled script through the Bash tool, a bare relative path does **not** work on Claude Code. The Bash tool's working directory is the user's project, not the skill directory, so `bash scripts/my-script.sh` resolves to `<project>/scripts/…`, finds nothing, and the step is silently skipped. This is a recurring bug class — see #764 (`ce-worktree`), #811 (`ce-code-review`), and #898 (`ce-compound`). Wrap the invocation in a file-existence guard on `${CLAUDE_SKILL_DIR}` so it runs on Claude Code and degrades **visibly** elsewhere:

```
if [ -n "${CLAUDE_SKILL_DIR}" ] && [ -f "${CLAUDE_SKILL_DIR}/scripts/my-script.sh" ]; then
  bash "${CLAUDE_SKILL_DIR}/scripts/my-script.sh" ARG
else
  echo "<this step's bundled script is unavailable on this platform; do X instead>"
fi
```

(The `[ -n "${CLAUDE_SKILL_DIR}" ]` guard keeps an unset variable from probing a root-level `/scripts/…` path.)

`${CLAUDE_SKILL_DIR}` is substituted into SKILL.md content by Claude Code, covering both marketplace-cached installs and `claude --plugin-dir` local dev; it resolves to the skill's own directory, so the `then` branch runs there. Note `${CLAUDE_SKILL_DIR}` is a SKILL.md *content* substitution, not an environment variable available inside the executed process — a script that needs its own directory should derive it from `BASH_SOURCE` rather than reading `$CLAUDE_SKILL_DIR`. `ce-compound`'s `validate-frontmatter.py` invocation is the canonical example of this guard pattern.

**Why the guard, and why not the old `${CLAUDE_SKILL_DIR:-.}` shell default (issue #943).** On other targets (Codex, Gemini CLI, etc.) `${CLAUDE_SKILL_DIR}` is unset. The earlier `:-.` form degraded to a project-CWD-relative `./scripts/…` — *syntactically* valid, but resolving to a path that does not exist: the bundled script lives in that runtime's own skill store (e.g. `~/.codex/skills/<plugin>/<skill>/scripts/…`), so the call silently missed. The existence guard makes that case explicit — the `then` branch never fires, and the `else` branch tells the agent what to do instead of running a broken path or claiming success. Two facts make this a real product gap, not a converter bug:

- The converter does not rewrite these paths (`src/utils/codex-content.ts` has no `CLAUDE_SKILL_DIR` case), and in the default `--to codex` mode skills are not emitted by the converter at all.
- **This plugin also ships as a *native* Codex plugin** (installed via Codex's `/plugins` TUI marketplace). That path never runs the converter — Codex loads the raw `SKILL.md` verbatim. The `ce_platforms` frontmatter is honored only by the converter's `filterSkillsByPlatform`, so it does **not** keep a Claude-only skill out of a native Codex install. The only protection both install paths respect is the SKILL.md content itself.

So: do not gate a skill's *core* behavior on a runtime bundled-script call when portability matters. The existence guard above suits an **optional** guard script (e.g. `ce-compound`'s `validate-frontmatter.py`), where the `else` branch runs an equivalent inline check so the protection still fires off-Claude instead of silently skipping. For a skill whose *entire* behavior is a bundled script, a guard does not make it work off-Claude — prefer logic the agent can perform inline, or content the agent reads (read-time references resolve against the skill dir on all targets).

**Permission caveat (Claude Code).** Claude Code's permission checker evaluates every subcommand of a compound command, and a bare `[ -f … ]` test is not pre-approved — so wrapping a pinned `bash "…sh"` call in an `if … then … fi` guard defeats a narrow `Bash(bash *…sh)` allow-rule and prompts on every run. If a bundled-script call must stay auto-approved via such a pin, keep it a single pinned command rather than guarding it inline.

**When a platform variable is unavoidable:** Use the pre-resolution pattern (`!` backtick syntax) and include explicit fallback instructions in the skill content, so the agent knows what to do if the value is empty, literal, or an error:

```
**Plugin version (pre-resolved):** !`jq -r .version "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json"`

If the line above resolved to a semantic version (e.g., `2.42.0`), use it.
Otherwise (empty, a literal command string, or an error), use the versionless fallback.
Do not attempt to resolve the version at runtime.
```

This applies equally to any platform's variables — a skill converted from Codex, Gemini, or any other platform will have the same problem if it assumes platform-only variables exist without a fallback.

## Repository Docs Convention

- **Requirements** live in `docs/brainstorms/` — requirements exploration and ideation.
- **Plans** live in `docs/plans/` — implementation plans and progress tracking.
- **Task-graphs** live in `docs/plans/<project>/` — a committed markdown `index.md` plus one file per node, produced by `ce-decompose-beta` to decompose a multi-feature project into dependency-mapped, individually-drivable nodes; read one when coordinating work whose status spans several tickets or PRs.
- **Solutions** live in `docs/solutions/` — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.
- **Specs** live in `docs/specs/` — target platform format specifications.

### Solution categories (`docs/solutions/`)

This repo builds a plugin *for* developers. Categorize solutions from the perspective of the end user (a developer using the plugin), not a contributor to this repo.

- **`developer-experience/`** — Issues with contributing to *this repo*: local dev setup, shell aliases, test ergonomics, CI friction. If the fix only matters to someone with a checkout of this repo, it belongs here.
- **`integrations/`** — Issues where plugin output doesn't work correctly on a target platform or OS. Cross-platform bugs, target writer output problems, and converter compatibility issues go here.
- **`workflow/`**, **`skill-design/`** — Plugin skill and agent design patterns, workflow improvements.

When in doubt: if the bug affects someone running `bun install compound-engineering` or `bun convert`, it's an integration or product issue, not developer-experience.
