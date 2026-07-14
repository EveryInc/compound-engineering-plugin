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
- **Output Paths:** Keep OpenCode output at `opencode.json` and `.opencode/{agents,skills,plugins}`. For OpenCode, commands go to `~/.config/opencode/commands/<name>.md`; `opencode.json` is deep-merged (never overwritten wholesale).
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
- When adding a user-facing skill, document it: create a `docs/skills/<skill-name>.md` page (purpose, novel mechanics, when to use, chain position — follow the shape of the existing pages) and add a catalog row under the right category in `docs/skills/README.md`, alongside the root `README.md` inventory row and the skill-count bump in `tests/release-metadata.test.ts`. Keep these in sync when a skill's purpose or inventory changes. This is convention, not yet validated by a test, so it is easy to miss — most skills have a page; the few that don't (e.g. `lfg`, `ce-dogfood-beta`) are the exception, not the rule.
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

## Cross-Model Skill Authoring

This repository authors each skill once and distributes it across multiple agent models and harnesses. Before creating, materially revising, or reviewing a skill or skill-local persona, read `docs/solutions/skill-design/portable-agent-skill-authoring.md`.

That field guide is the canonical reasoning layer for outcome-first authoring, model and harness portability, protocol versus judgment, proportional authority, tool adapters, evidence-backed review, and targeted behavioral evaluation. It is not a template: apply only the sections relevant to the skill. The repository-specific rules elsewhere in this file supplement the guide and take precedence where they are more specific.

### Skill Prose Admission Rules

- Keep a line only when it states a falsifiable constraint, counters a known default tendency or observed shortcut, or supplies domain knowledge that materially changes a decision.
- Do not keep vague effort or quality language such as "be thorough" or "produce high-quality work" as a standalone instruction. Replace it with an observable rule, or retain a targeted effort cue only when it counters a documented runtime tendency and has been evaluated there.
- Do not append motivational rationale to a directive that already stands on its own.
- Repeat an instruction only at a demonstrated drift point where placement changes whether it fires. Protect genuinely required always-loaded duplicates with a parity test.

### Applying Feedback to Skills

Applying review, peer, or eval feedback to a skill is a material revision governed by the authoring guide. An item is not addressed because a sentence landed; it is addressed when a demonstrated gap is closed at its owning layer by the smallest mechanism. Before editing:

1. **Evidence** — classify each item as Change, Verify, or Consider using the guide's evidence rules. Do not edit the skill for Verify or Consider items.
2. **Owning layer** — for each Change, identify its owning layer: activation contract, outcome spine or skill boundary, runtime protocol, loading or placement, deterministic enforcement, or shared authoring rule.
3. **Mechanism** — fix the gap at its owning layer. Add prose only when it is the smallest mechanism that closes the gap, and then only the smallest falsifiable unit per the Skill Prose Admission Rules.
4. **Reconcile** — reread the affected block; remove or rewrite text the change makes conflicting, duplicated, or obsolete. Resolve conflicting feedback items rather than stacking both.

When evidence shows the same cause across skills, fix the shared guide, rule, or mechanism unless the skills' contracts materially differ.

For a multi-item round, record one line per item in the existing PR body or work note: `item -> Change|Verify|Consider | owning layer | mechanism - why`. A single-item fix still follows the steps above; the written line is optional. Reviewer wording is a hypothesis about mechanism, not authority over it — the reviewer's one-line prose fix is sometimes exactly right.

### Skill Loading Supplements

- Keep every load-bearing action, route, and reference-load instruction inline at the point where it must fire (`docs/solutions/skill-design/post-menu-routing-belongs-inline.md`).
- Do not inline a summary complete enough to suppress loading the authoritative reference.
- Extract a block to `references/` when it is conditional or late-sequence and a meaningful share of the skill (~20%+). Replace it with a 1-3 line condition and backtick path.
- Never use `@` for an extracted block; it inlines at load time and defeats extraction.

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

- **A version-matched cache is not automatically stale — confirm by content, not by version.** When this working tree is the local marketplace source, a session (re)start re-copies it into `~/.claude/plugins/cache/.../compound-engineering/<version>/` (a plain copy, no `.git`; `<version>` is the working tree's `.claude-plugin/plugin.json` version), so the loaded plugin can be identical to — and as current as — your edits. Do not assume the running copy is stale just because it lives under the cache path; equally, do not assume a matching `<version>` means it includes your latest change. Version match is necessary but not sufficient: edits within a release do not bump the version, so a matching segment proves only that the cache was built from this release, not that it captured your most recent edit. To know which copy is actually loaded, diff the specific cache file against the working-tree file — identical means the running plugin is your current edit and you can trust it; differing means the session predates the edit, so restart (or use skill-creator). Never infer "stale" or "current" from the version segment alone.

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

## Shared Repo-Grounding Profile Cache

Repo-grounding skills (`ce-pov`, `ce-plan`, `ce-optimize`, `ce-ideate`, `ce-brainstorm`, `ce-code-review`, plus lighter consumers `ce-compound` — which still derives **and persists** on a miss — and `ce-debug`, which only opportunistically reads `conventions.testing` and never derives/persists) reuse one cached **question-agnostic project profile** (stack, deps, conventions, structure) instead of each re-deriving it. The profile is git-keyed and stored at `/tmp/compound-engineering/repo-profile/<root-sha>/<head-sha>.json`.

The mechanism is three **byte-duplicated** assets per consuming skill (the plugin has no cross-skill import — see "File References in Skills"):

- `references/repo-profile-cache.md` — the schema + protocol (authoritative; read it before wiring a new consumer).
- `scripts/repo-profile-cache.py` — deterministic `get`/`put`, invoked via the `SKILL_DIR` anchor (never the legacy `${CLAUDE_SKILL_DIR}` guard).
- `references/agents/repo-profiler.md` — the persona that derives the profile on a miss.

Rules:

- A consumer resolves the agnostic profile through the cache (`get` → HIT load / MISS derive-and-`put` / NO-CACHE derive-fresh), then runs **only its question-specific grounding fresh**. The cache is an optimization, never a correctness dependency, and must never let a stale profile change an output.
- **Always re-globbed fresh, never cached:** the `docs/solutions/` enumeration and subdirectory-scoped instruction files. Caching them would risk serving a stale match (e.g. a just-written learning), and re-globbing is ~free.
- **Adding a consumer:** drop byte-identical copies of the three assets into the skill, add its name to `CONSUMER_SKILLS` in `tests/repo-profile-cache-parity.test.ts`, and wire its grounding phase. The parity test guards *file* drift; the per-consumer `skill-creator` eval (agnostic-from-cache, question-specific-fresh) guards *integration* drift.
- Any change to the schema or protocol must be edited in **all** copies (the parity test fails otherwise) and bump `PROFILE_SCHEMA_VERSION` in the helper so older cache entries invalidate. Renaming or moving a profile **field** additionally requires updating every consumer `SKILL.md` that reads a named field path (grep the consumers for it, e.g. `conventions.testing`, `vocabulary`) — those per-skill field reads are not byte-duplicated, so the parity test does not guard them.

## Platform-Specific Variables in Skills

This plugin is authored once and converted for multiple agent platforms (Claude Code, Codex, Gemini CLI, etc.). Do not use platform-specific environment variables or string substitutions (e.g., `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_SESSION_ID}`, `CODEX_SANDBOX`, `CODEX_SESSION_ID`) in skill content without a graceful fallback that works when the variable is unavailable or unresolved.

How a bundled-file reference resolves depends on *who* resolves it and whether a shell is involved, so references fall into three tiers. Do not assume a bare `scripts/…` path behaves the same in all three.

**Tier 1 — Read-time file references (relative, no anchor):** When skill *content* points the agent at a co-located file to read (e.g., "read `references/schema.yaml`"), use a relative path from the skill root. The skill loader resolves these against the skill's own directory on all major platforms — no variable prefix needed. This is the rule in *File References in Skills* above.

**Tier 2 — Prose pointers to a bundled file the agent acts on (relative + a "from this skill's directory" cue):** When skill prose names a bundled file the agent will use but does *not* put it in an executed shell command (e.g., "drive the loop with `scripts/hitl-loop.template.sh`" or "generate the package with `scripts/review-package BASE HEAD`"), use a relative path plus an explicit "from this skill's directory" phrase. The cue tells the agent what to resolve against without the verbosity of an anchor.

**Tier 3 — Executed shell commands (the `SKILL_DIR` anchor):** When skill content puts a bundled script in a command the agent runs through the Bash tool — a fenced ` ```bash ` block **or** an inline `bash …` / `python …` — anchor it to the skill dir. The Bash tool's working directory is the user's **project**, not the skill directory, on Claude Code, Codex, and Cursor alike, so a bare `bash scripts/my-script.sh` resolves to `<project>/scripts/…`. Relative paths here *often still work* — a capable agent resolves them against the skill dir it loaded (which is how the agentskills.io spec and other ecosystems ship them) — but that relies on the agent translating the path, and the failure mode is a fenced block copied **verbatim** into a Bash call, which runs literally and misses (`exit 127`; recovery is a wasted round-trip that weaker models / mid-tier subagents botch). Anchoring bakes the resolution into the command, so it is **deterministic**. Use the anchor for executed shell as the house default — a conservative choice, not a claim that bare relative *cannot* work (recurring bug class: #764 `ce-worktree`, #811 `ce-code-review`, #898 `ce-compound`):

```
# set inline in the SAME command (shell state does not persist between Bash calls):
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
bash "$SKILL_DIR/scripts/my-script.sh" ARG
```

**Keep the trailing `;` on the assignment line.** Some hosts (observed on Codex) flatten a fenced multi-line block into a single line by replacing the newline with a space before executing it. Without the `;`, `SKILL_DIR="…"` + newline + `bash "$SKILL_DIR/…"` collapses to the env-var-prefix form `SKILL_DIR="…" bash "$SKILL_DIR/…"`, where the shell expands `$SKILL_DIR` *before* the prefix assignment takes effect — so it expands to empty and the script path becomes `/scripts/my-script.sh` (`No such file or directory`). The trailing `;` makes the assignment a complete statement that survives flattening; it is load-bearing, not a style choice, so do not remove it.

An existence guard (`if [ -f "$SKILL_DIR/scripts/my-script.sh" ]; then … else echo "not found — re-check the SKILL.md path"; fi`) is optional — useful when there's a real fallback, but see the permission caveat below before guarding a pinned call.

`SKILL_DIR` is a **model-filled** value, not a harness variable: every harness loads SKILL.md from a real absolute path the agent knows, so the skill instructs the agent to set `SKILL_DIR` to that directory. This works identically on Claude Code, Codex, and Cursor precisely because it depends on no host-specific variable — `SKILL_DIR`, `CLAUDE_SKILL_DIR`, `CODEX_SKILL_DIR`, `AGENT_SKILL_DIR` are **not** env vars on any of them, yet the script runs because the agent supplies the path. This is the production pattern used by widely-installed cross-host skills (e.g. `last30days`). Two constraints: (1) shell state does **not** persist between separate Bash-tool calls, so `SKILL_DIR` cannot be set once and reused — each invocation must carry the absolute path (set it inline in the same command). (2) A script that needs its *own* directory (to read a sibling file) derives it from `BASH_SOURCE`, not `SKILL_DIR`, since `SKILL_DIR` is the orchestrator's shell var and is not exported to the child process — see `skills/ce-code-review/scripts/cross-model-adversarial-review.sh` for the reference implementation. `last30days` adopted this anchor for its critical multi-host engine after a path-resolution regression; it is the right tool when a script must run *reliably*, which is why it is the tier-3 default — but tiers 1 and 2 deliberately stay lighter.

**Avoid `${CLAUDE_SKILL_DIR}` here — in this cross-agent plugin it is a footgun, not a neutral alternative.** Every skill in this repo is authored once and installed across Claude Code, Codex, Cursor, and Gemini, and `${CLAUDE_SKILL_DIR}` is a Claude-Code-only SKILL.md *content* substitution (not an env var) that is **empty on every other host**. So a `${CLAUDE_SKILL_DIR}`-guarded call's `then` branch quietly never fires off-Claude — the **genuine silent skip** — and a Claude-only mechanism breaks on Codex/Cursor because the converter doesn't rewrite these paths and the native Codex install loads raw `SKILL.md` (no `ce_platforms` filtering). The model-filled `SKILL_DIR` anchor works on every host, so it is the right replacement wherever a `${CLAUDE_SKILL_DIR}`-guarded executed-shell call exists today (tier 3). Do not reach for `${CLAUDE_SKILL_DIR}` as a "portable" option — it isn't. Reach for it only for behavior that is genuinely Claude-Code-only and will *never* run on another harness — which, given this plugin's cross-host install model, is essentially never; treat any new use as a smell to justify or remove. (Existing guarded uses such as `ce-compound`'s `validate-frontmatter.py` survive off-Claude only via an inline `else` fallback and should migrate to the anchor.)

So: a skill's *core* behavior **can** live in a bundled script across hosts — invoke it via the `SKILL_DIR`-from-read-path anchor. You no longer need to avoid bundled scripts for portability; anchor them instead. Read-time references (`references/*.md`) still resolve against the skill dir on all targets and need no anchor.

**Permission caveat (Claude Code).** Claude Code's permission checker evaluates every subcommand of a compound command, and a bare `[ -f … ]` test is not pre-approved — so wrapping a pinned `bash "…sh"` call in an `if … then … fi` guard defeats a narrow `Bash(bash *…sh)` allow-rule and prompts on every run. If a bundled-script call must stay auto-approved via such a pin, keep it a single pinned command rather than guarding it inline. Note the model-filled `SKILL_DIR` anchor produces a *dynamic* absolute path that won't match a static `Bash(bash /…/scripts/x.sh)` pin regardless of guarding — so for the anchor, expect a one-time approval prompt per distinct command (or use a broader allow-rule); the static-pin trick mainly applies to the fixed `${CLAUDE_SKILL_DIR}` form.

**Do not use `!` load-time pre-resolution in skills.** The `!`cmd`` SKILL.md syntax runs `cmd` at skill load and inlines its stdout, but it is banned here (enforced by `tests/skill-shell-safety.test.ts`) for two unfixable reasons: it runs **only on Claude Code** — on Codex, Cursor, Gemini, and Grok the line is inert literal text — and on Claude Code a command that exits **non-zero aborts skill load** with a user-facing error. Every real use was git context (`git rev-parse …`, `gh pr view …`) whose non-zero exit is a *normal* state (no PR yet, no `origin/HEAD`, detached HEAD, not a repo), so the ordinary case broke the skill. The POSIX guards that force exit 0 (`2>/dev/null || echo SENTINEL`) then fail to parse under Windows PowerShell 5.1, which broke skill load there instead (issue #1066). No single command string both exits 0 on the expected-failure states and parses under both POSIX sh and PowerShell, so the construct cannot be made safe.

**Gather context at runtime instead.** Have the agent run one argv-style command per shell tool call (`git …`, `gh …`) — no `;`, `&&`, `||`, pipes, `$(…)`, or redirects — and interpret each exit status as control flow. This parses identically under POSIX sh and PowerShell because it is a single external-program invocation, and a non-zero exit becomes data the agent reads rather than a load-time abort. See `ce-commit` / `ce-commit-push-pr` for the pattern.

**When a platform variable is unavoidable:** resolve it at runtime with a single shell tool call and include explicit fallback instructions, so the agent knows what to do if the value is empty, a literal command string, or an error — e.g. run `jq -r .version "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json"`; if it resolved to a semantic version use it, otherwise fall back to the versionless behavior. This applies equally to any platform's variables — a skill converted from Codex, Gemini, or any other platform will have the same problem if it assumes platform-only variables exist without a fallback.

## Repository Docs Convention

- **Plans** live in `docs/plans/` — unified plan artifacts. New `ce-brainstorm` outputs are requirements-only unified plans (`artifact_readiness: requirements-only`); `ce-plan` enriches them to implementation-ready plans (`artifact_readiness: implementation-ready`). Historical `docs/brainstorms/*-requirements.*` files remain readable legacy inputs and should not be migrated just because a new plan is created.
- **Brainstorm evidence / legacy requirements** may live in `docs/brainstorms/` — historical requirements docs and specialized analysis artifacts such as `docs/brainstorms/riffrec-feedback/`. Do not treat this as the canonical output path for new `ce-brainstorm` artifacts.
- **Solutions** live in `docs/solutions/` — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.
- **Specs** live in `docs/specs/` — target platform format specifications.

### Solution categories (`docs/solutions/`)

This repo builds a plugin *for* developers. Categorize solutions from the perspective of the end user (a developer using the plugin), not a contributor to this repo.

- **`developer-experience/`** — Issues with contributing to *this repo*: local dev setup, shell aliases, test ergonomics, CI friction. If the fix only matters to someone with a checkout of this repo, it belongs here.
- **`integrations/`** — Issues where plugin output doesn't work correctly on a target platform or OS. Cross-platform bugs, target writer output problems, and converter compatibility issues go here.
- **`workflow/`**, **`skill-design/`** — Plugin skill and agent design patterns, workflow improvements.

When in doubt: if the bug affects someone running `bun install compound-engineering` or `bun convert`, it's an integration or product issue, not developer-experience.
