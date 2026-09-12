# Agent Instructions

This repository is the root of the `compound-engineering` coding-agent plugin and the marketplace/catalog metadata used to distribute it.

It also contains:
- the Bun/TypeScript CLI that converts Claude Code plugins into other agent platform formats
- shared release and metadata infrastructure for the CLI, marketplace, and plugin

`AGENTS.md` is the canonical repo instruction file. Root `CLAUDE.md` is a symlink to `AGENTS.md` so Claude Code and other tools that look for `CLAUDE.md` still find it at the expected path. Keep that symlink (do not replace it with a regular file): a real root `CLAUDE.md` makes `claude plugin validate --strict` fail because this checkout is also the plugin root.

## Quick Start

```bash
bun install
bun run test              # full test suite (also runs in CI; `--parallel` across worker processes)
bun run release:validate  # plugin/marketplace consistency (also runs in CI)
bun run plugin:validate   # Claude marketplace + plugin schema (also runs in CI; needs `claude` on PATH)
```

### Codex Local Plugin Development

When testing current skill files in Codex, run the repository workflow from the checkout or worktree you intend to test:

```bash
bun run codex:dev -- local    # link this worktree's skills and remove CE plugin installs
bun run codex:dev -- status   # show local/remote state and checkout provenance
bun run codex:dev -- remote   # restore the official marketplace-backed plugin
bun run codex:dev -- remove   # remove both supported CE installation surfaces
```

`refresh` is an idempotent alias for `local`. Local mode manages only the exact `$CODEX_HOME/skills/compound-engineering-local` symlink and Compound Engineering plugin IDs; it must not alter unrelated user skills. The symlink includes modified and untracked files from the selected worktree. Start a new Codex session after switching installation modes. Current Codex versions detect direct skill edits automatically; restart only if an edit does not appear. For live local testing, use this workflow instead of adding the repository as a marketplace: a marketplace install caches a snapshot, while local mode links the current skill files.

## Working Agreement

- **Branching:** Create a feature branch for any non-trivial change. If already on the correct branch for the task, keep using it; do not create additional branches or worktrees unless explicitly requested.
- **Merge policy:** All changes to `main` go through pull requests. Direct pushes and direct merges are not allowed; branch protection on `main` enforces this by requiring the `test` status check to pass. The direct path bypasses `release:validate`, the test suite, and PR title validation — past direct merges have caused version drift requiring multi-PR recovery (see `docs/solutions/workflow/release-please-version-drift-recovery.md`).
- **Contribution gate (non-maintainers):** If you are not a repository maintainer or admin, do not open a PR without a linked issue — file the issue first and reference it from the PR. Adding a **new skill** has a stricter gate: non-maintainers and non-admins must raise a discussion in an issue and get explicit maintainer approval **before** starting the work; do not open a new-skill PR that has not been approved this way. Maintainers and admins are exempt from both gates but still follow the merge policy above.
- **PR disclosure:** `.github/pull_request_template.md` ends with `## Security Disclosure` and `## Agent Disclosure` sections. Fill both when opening a PR — including PRs authored via `gh pr create --body`/`--body-file`, which bypass the template so nothing pre-fills them. State any security-relevant changes (or "No security-relevant changes"), and the model that did the bulk of the work — your harness plus the most specific model identity your own context gives you, e.g. `Claude Code · claude-opus-4-8` or `Codex CLI · GPT-5`. Copy an exact model ID verbatim when your harness states one; when it exposes only a generic family, report the family and stop. Measured 2026-07-24: Codex and Cursor agents cannot see their running model at all (Codex's "based on GPT-5" is fixed boilerplate), so do not upgrade a family to a version, and do not read config files for one — the configured default is often not the model actually running. Never invent a version or variant. The body above those sections stays freeform — add whatever sections best explain the change.
- **Safety:** Do not delete or overwrite user data. Avoid destructive commands.
- **Testing:** Run `bun run test` after changes that affect parsing, conversion, output, skill conventions, or other mechanical guards. Local `bun run test` is the same suite CI runs — there is no separate local-only unit-test lane. Prefer it over bare `bun test`: the package script carries `--parallel`, which is where the suite's speed comes from. Bare `bun test <file>` is still the right tool for iterating on one file. The suite uses disposable fixtures and has no production access. Run it, fix failures caused by the requested change, and rerun affected tests without asking for approval at each step.
- **Compounding learnings:** After a solved, verified problem, automatically invoke the `ce-compound` skill with `mode:non-interactive` at the completion checkpoint only when the work produced durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? If not, do not invoke it. Completion, effort, and diff size alone are not enough. Capture at the checkpoint so a qualifying learning can ship in the PR that produced it, and only where the repository treats captured learnings as tracked, committed knowledge. This repository does: `docs/solutions/` is tracked (see *Repository Docs Convention*). If `ce-compound` is not callable in the current harness (a checkout without the plugin installed or linked), do not block and do not skip silently: say in the completion report that a qualifying learning was left uncaptured, so the author can run it from a plugin-enabled session.
- **Release versioning:** Releases are prepared by release automation, not normal feature PRs. The repo has one root plugin/package release component (`compound-engineering`) plus marketplace components (`marketplace`, `cursor-marketplace`). GitHub release PRs and GitHub Releases are the canonical release-notes surface for new releases; root `CHANGELOG.md` is only a pointer to that history. Use conventional titles such as `feat:` and `fix:` so release automation can classify change intent, but do not hand-bump release-owned versions or hand-author release notes in routine PRs.
- **Output Paths:** Keep OpenCode output at `opencode.json` and `.opencode/{agents,skills,plugins}`. For OpenCode, commands go to `~/.config/opencode/commands/<name>.md`; `opencode.json` is deep-merged (never overwritten wholesale).
- **Scratch Space:** Default to OS temp. Use `.context/` only when the artifact is repo-bound and user-curated, branch-inseparable, or the path is core UX. Copy the scratch-root preamble from any shipped skill (for example `skills/ce-code-review/SKILL.md`); do not re-derive it. Durable outputs belong in `docs/`. Layout, `/tmp` probe, and Windows notes: `docs/solutions/developer-experience/always-on-agents-md.md`.
- **Character encoding:**
  - **Identifiers** (file names, agent names, command names): ASCII only -- converters and regex patterns depend on it.
  - **Markdown tables:** Use pipe-delimited (`| col | col |`), never box-drawing characters.
  - **Prose and skill content:** Unicode is fine (emoji, punctuation, etc.). Prefer ASCII arrows (`->`, `<-`) over Unicode arrows in code blocks and terminal examples.

## Directory Layout

```
src/              CLI entry point, parsers, converters, target writers
skills/           Compound Engineering plugin skills
docs/guides/      User-facing plugin guides (catalog and configuration)
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
- the docs site under `site/` (a Jekyll build layer over `README.md`, `docs/guides/`, and `docs/install/`) and its workflow `.github/workflows/pages.yml`

Do not assume a repo change is "just CLI" or "just plugin" without checking which surface owns the affected files.

## Plugin Maintenance

When changing plugin content:

- Update substantive docs like `README.md` when the plugin behavior, inventory, or usage changes.
- When adding a user-facing skill, document it: create a `docs/guides/<skill-name>.md` page (purpose, novel mechanics, when to use, chain position — follow the shape of the existing pages), add a catalog row under the right category in `docs/guides/README.md`, and bump the skill count in `tests/release-metadata.test.ts`. `docs/guides/README.md` is the **only** place a skill's prose description is maintained. The root `README.md` carries a grouped overview that lists skill *names* under a category, so a new skill also needs its name added to the right group row and the three stated skill counts bumped (badge, intro, section lead). `tests/release-metadata.test.ts` enforces that every skill name appears in that overview exactly once, that no unknown name appears, and that the three counts match the skill directories under `skills/` (each with a `SKILL.md`) — so the suite catches a missing name, a stale count, or a name left behind during a move. Choosing the *right* group is yours; a test that knew the correct category per skill would be the second inventory this arrangement exists to avoid — the previous three-way sync of full descriptions was unenforced and had already drifted, which is why descriptions now live in exactly one place. Every current user-facing skill has a page, including `lfg` and `ce-dogfood`.
- When adding, removing, renaming, or changing the meaning/default/consumer of a `.compound-engineering/config.yaml` option, update `skills/ce-setup/references/config-template.yaml`, its byte-identical `.compound-engineering/config.example.yaml` copy, the centralized `docs/guides/configuration.md` reference, and the affected consumer skill docs in the same change. Ordinary keys may also live in optional checkout-local `config.local.yaml` (overrides the repo file). `docs_root` belongs only in `config.yaml`. Durable team instructions still belong in the project's normal agent-instructions mechanism.
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

`AGENTS.md`, `CLAUDE.md` (symlink to `AGENTS.md`), and `GEMINI.md` are authoring context for this source repository. Skills are installed into end-user environments, where they run against the user's local instruction files, not this repo's. Behavioral rules that must affect a skill at runtime belong in that skill's `SKILL.md` or files under its own `references/` directory.

## Working on Skills

This repository authors each skill once and distributes it across multiple agent models and harnesses. A skill is a set of goals, not a state machine: it hands the agent the goal, the done condition, the safe failure direction, and the facts it cannot derive from the repo in front of it, then gets out of the way. `docs/solutions/skill-design/portable-agent-skill-authoring.md` is the standard; the rules in this file supplement it and take precedence where more specific.

**Before creating, editing, reviewing, or acting on review feedback for anything under `skills/**`, invoke the repo-local `ce-skill-work` skill** (`.agents/skills/ce-skill-work/`, which Codex and Cursor discover directly; `.claude/skills` is a symlink to `.agents/skills` for Claude Code). It carries the procedures for each of those four activities, the audit questions, the provenance rule for removals, and the validation contract. The same routing applies when a skill-authoring best practice itself changes or is newly learned — a prompt-guide lesson, a tuning that demonstrably worked, a standard-level correction: invoke `ce-skill-work` and record the practice in `docs/solutions/skill-design/portable-agent-skill-authoring.md` (and here when it must be always-loaded), never only in one skill's prose. This file states only what must be always-loaded; when the two disagree, fix the disagreement rather than following the shorter one.

Three rules that hold regardless of whether the skill was invoked:

- **State conditions, not procedures or cases.** When a block keeps absorbing "add the case we just found" — in authoring, in a review round, or in your own fix to a finding — the representation is wrong. Delete the additions and restate the goal, then re-verify against every path the additions served; a restatement that no longer names a path is a new defect, not a simplification.
- **Prescribe a mechanism only where it is owned.** A delegating skill states the condition, the safe failure direction, and the non-derivable callee facts, never a re-derivation of the callee's commands (`docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md`).
- **Bring the block you touch up to the standard**; leave untouched blocks alone and name them as follow-up. Skills predate the standard and evolve toward it.

### User-Facing Skill Invocations

Keep agent-to-agent or skill-to-skill routing semantic: format formal skill names as inline code (for example, `ce-plan`) and invoke the named skill through the active harness's callable skill mechanism. When a skill prints or copies a user-runnable invocation, default to `/skill-name`; use `$skill-name` only when the active harness is Codex or explicitly documents dollar-prefixed skill invocation. On oh-my-pi (`omp`), keep the default form for model-visible targets; use native `/skill:<name>` only when the target is not model-visible because it declares `disable-model-invocation` or `hide` (for example, `/skill:ce-polish`). In prose, render only the invocation as inline code; use a fenced block only when the command stands alone. Output exactly one form. Do not apply this rendering rule to built-in commands such as `/goal`.

At runtime, put the smallest self-contained rendering rule immediately before the smallest section that contains all affected user-copy seams. Do not repeat it in every step; repeat it only in a separately loaded reference that independently owns output.

### Reviewing a skill change (bots and humans)

Review bots read this file when reviewing a PR here. On `skills/**`:

- **A finding is a gap in the goal, the done condition, or the safe failure direction; over-prescription that degrades degrees of freedom; or a mechanism at the wrong owning layer** — commands prescribed in a skill that delegates that work, repeated command blocks where one parameterized recipe would decide the same behavior, a model-invoked description that opens with identity boilerplate or catalogs one branch, a category opener that omits the distinctive mechanism, a quoted-utterance catalog on a model-invoked skill, per-step done checks not protecting a fragile gate, repeated ask-first gates not marking a different external/destructive/scope/user-only boundary, a rule placed where it will not fire, a Claude-only construct in a cross-host skill, a rendering that breaks on another harness.
- **A case a stated condition already covers is not a finding.** Before filing "what if X" against a rule, check whether the rule's condition decides X. If it does, do not file; if the condition is wrong or missing, file *that*.
- **State the requested fix as a condition or an owning-layer move, never as a case to add.** "Command X fails in state Y" against a delegating skill is a finding about the representation; the fix is to drop the command and state the condition, not to correct the command.
- **A block restated to the standard is the expected shape of an edit**, not scope creep, when the restatement covers every path the old text served.
- Ordinary code under `src/`, `tests/`, and `scripts/` gets ordinary code review; these rules are about instruction prose.

### Acting on review feedback

This governs any agent or tool that acts on review feedback in this repository — `ce-resolve-pr-feedback`, another vendor's resolver, or a person — and on `skills/**` it takes precedence over the tool's own "default to fixing". Skill prose is not code: a natural-language instruction can always be made more specific, so a reviewer can produce a valid-looking edge case against any condition indefinitely, and patching each one dilutes the instruction (#1397: 24 findings over nine rounds on a two-condition step). A case the stated condition already decides is answered with the condition, not patched; only a wrong or missing condition, or a mechanism at the wrong owning layer, is a fix. On the second round against the same block, restate it rather than qualify it. The full procedure — Evidence, Owning layer, Mechanism, Reconcile, Stop the accretion loop — is `ce-skill-work`'s respond mode.

## Referencing Project Conventions in Skills

When a skill needs to discover a project convention at runtime — the issue tracker, coding standards, commit format, lint command, scope constraints, etc. — describe **what to look for in the agent's existing context**, not **which file to open**.

**On the read path, do not name instruction files (`AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `.cursor/rules`).** Phrase it as "the project's active instructions and conventions already in your context." Three reasons:

- **Redundant.** Every major harness auto-injects the project's root instruction file into context at session start (Claude Code loads `CLAUDE.md`, Codex `AGENTS.md`, Gemini `GEMINI.md`). Telling the agent to "read `AGENTS.md`" asks it to re-open content it already has.
- **Brittle / not portable.** The filename differs per harness, and this plugin is authored once and converted to all of them. A hardcoded "read `AGENTS.md` (or `CLAUDE.md`)" silently finds nothing on a harness that uses a different name.
- **Security smell.** Instructing an agent to go *read named instruction dotfiles* is the exact shape that prompt-injection defenses in some agent frameworks (e.g., Hermes) flag. Referencing context rather than filenames avoids tripping those guards.

**Name a concrete file only where the skill must do something a context reference can't express:**

- **Writing a convention back** (e.g., persisting `project_tracker: linear`) needs a target — name it minimally and as an example ("the project's root agent-instructions file, e.g., `AGENTS.md`; if it `@`-includes another, write to the substantive one").
- **Reading content that is genuinely not auto-loaded** — a subdirectory-scoped instruction file governing the area being changed, an optional project doc like `STRATEGY.md` / `CONCEPTS.md` / `README.md`, or any file a *fresh subagent* (which does not inherit the parent's loaded instructions) must open to do its job. Auditing tools that must enumerate every criteria file are a legitimate exception — they review the files, they don't re-read them for context. `ce-code-review`'s project-standards reviewer globs `CODING_STANDARDS.md`, the designated criteria source, and reads `CLAUDE.md`/`AGENTS.md` only as criteria for changed files that no `CODING_STANDARDS.md` governs.

**Describe the capability, not the tool.** Pair this with naming the *category* of thing rather than a closed set: "the project's issue tracker (e.g., GitHub Issues, Linear, Jira)" and "whatever interface that tracker exposes (connector/MCP, documented API, or a documented CLI)" — never assume a specific CLI exists, and never treat a missing binary / env var / MCP server as proof the capability is unavailable.

## Validating Agent and Skill Changes

Behavioral changes to a plugin skill or skill-local persona (anything under `skills/`) need a different validation path than mechanical code changes, because of how Claude Code loads plugins.

- **Test prose changes by injecting the current on-disk skill into a fresh agent.** Plugin skills cache at session start, so invoking the edited skill in the authoring session tests stale content. This repository does not ship an eval skill. The portable path is the host CLI you already have, against a skill dir extracted from a ref: `bun run test:skill-eval-cell`. Named scenarios (pre-change contract vs current tree) run with `bun run test:skill-eval-pack -- --skill <name> --arm ab`. That uses `claude` / `codex` / `grok` on PATH and bills those products, not a separate API key. Anthropic's `skill-creator` is an optional Claude-hosted helper, not required, and does not replace the cell.

- **Plugin agent and skill definitions both cache at session start.** Once a Claude Code session is open, dispatching a typed plugin agent runs the in-memory copy that was loaded when the session began. The same applies to skills: invoking a skill goes through the cached skill loader, so edits to skill scripts are also not tested via that path. File edits to either layer after session start do not propagate within the same session. Any iteration loop built around typed-agent dispatch or Skill-tool invocation in the same session is testing pre-edit content, not your changes.

- **Do NOT edit `~/.claude/plugins/cache/` or `~/.claude/plugins/marketplaces/` to try to force a reload.** Those paths are user machine state, not repo-managed. Modifying them does not reliably bypass the in-session cache (it didn't, in observed behavior), risks being silently overwritten by plugin updates, and is the wrong layer to test from. Inject current disk content into a fresh agent instead; if you genuinely need fresh-loaded behavior of the typed-agent dispatch path, restart the session.

- **Mechanical changes do not have this restriction.** Skill scripts (e.g., `extract-metadata.py`), parser logic, conversion code, and anything `bun test` exercises always run the current source. The caching issue only affects LLM-driven skill prose behavior dispatched through the plugin loader. Confirm a version-matched cache by content, not by version — see `docs/solutions/developer-experience/always-on-agents-md.md`.

## CI and Quality Gates

PR CI (`.github/workflows/ci.yml`) is the merge gate. It runs, in order: PR-title lint (PRs only), `bun run release:validate`, `bun run plugin:validate`, and `bun run test`. Do not invent a parallel local-only mechanical suite — if a check is deterministic and should block merges, put it in one of those steps (usually `bun run test`).

The `test` script is `scripts/run-tests.ts`: one `bun test --parallel` pass (implies `--isolate`), then, only if every first-pass failure is a `TimeoutError`, one serial re-run of those files in a fresh bun process. An assertion failure or error anywhere keeps the first result with no re-run. Do not add `retry` counts for this signature — a retry runs inside the same worker. A test file may not depend on another file's leftovers, and any test that writes outside its own `mktemp` directory is a latent flake. A test that runs a bundled script which inspects the repository must point that script at a throwaway repo, never this checkout. **Do not pin a worker count.** Size a test file by its measured time, not its line count. CI wall-time measurements and the per-file timing recipe: `docs/solutions/developer-experience/always-on-agents-md.md`. The TimeoutError re-run exists because bun can lose a child-exit inside a worker (oven-sh/bun#34069); details: `docs/solutions/developer-experience/bun-parallel-worker-loses-subprocess-exit.md`.

### What belongs where

| Kind of check | Where it lives | Notes |
|---|---|---|
| Deterministic invariants (frontmatter, parity, path safety, script behavior, converter/writer output, greppable skill contracts) | `bun test` / `release:validate` / `plugin:validate` | Must pass in CI |
| Skill *prose behavior* (routing judgment, restraint, cross-model peer outcomes) | Fresh-agent eval (on-disk skill injected), local / PR evidence | Not a CI job; non-deterministic and needs a model |

That split is intentional. See `docs/solutions/skill-design/portable-agent-skill-authoring.md` ("Evaluate proportionally"). Mechanical checks belong in CI; behavioral agent evals are best-effort evidence, not an exhaustive CI matrix.

### Right-size new mechanical guards

When a review bot or human finds a greppable invariant that `bun test` missed:

1. Prefer **tightening an existing guard** over adding a new suite (e.g. widen a regex that already documents the rule).
2. Pin the **smallest falsifiable unit** — a token, enum, path, heading, or one fixture that would have failed on the regressing diff. Do not snapshot whole skill bodies or pin incidental wording.
3. If the failure needs an LLM to judge, keep it as a behavioral eval; do not fake it as a brittle string test.

### Maintaining `plugin:validate`

- `package.json` `plugin:validate` must validate **both** the marketplace catalog and the plugin manifest, with `--strict` on each. Paths: `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json`. Do **not** use `claude plugin validate .` — that resolves this repo as a marketplace only (because `.claude-plugin/marketplace.json` exists with `source: "./"`) and skips plugin-root checks.
- CI pins `@anthropic-ai/claude-code` for reproducible schema rules. Bump the pin deliberately when adopting new upstream rules; do not float `@latest`.
- Root `CLAUDE.md` must remain a **symlink** to `AGENTS.md` (path stays at the repo root where contributors expect it). Upstream warns on a regular-file plugin-root `CLAUDE.md` because it is not loaded as end-user project context; the symlink avoids that warning so `--strict` can stay on. Do not replace the symlink with a regular `@AGENTS.md` shim or relocate the file just for validators.
- If `--strict` starts failing again on `CLAUDE.md` after an upstream bump, check whether the symlink was materialized into a regular file (Windows/`core.symlinks=false` checkouts) or whether the validator started following symlinks — fix the layout or pin, do not silently drop `--strict`.

### When CI comments look "stale"

If CI claims a deferred warning or a missing gate, reproduce with the **pinned** `claude` version against `.claude-plugin/plugin.json` before treating the comment as current. Marketplace-only validation can hide plugin warnings.

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

When adding a `--to` / `--also` target provider, follow the checklist in `docs/solutions/developer-experience/always-on-agents-md.md`.

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

## Lean Repo Grounding

Use the project's active instructions already in the main agent's context, then go directly to task-specific current evidence. Pass fresh subagents the relevant project and task context, or have them read the applicable current instruction source when operational rules affect their work. If a task cannot be scoped from that context, use one targeted probe. Do not create a reusable generic repo profile or run a default root, stack, or layout scan.

## Platform-Specific Variables in Skills

This plugin is authored once and converted for multiple agent platforms (Claude Code, Codex, Gemini CLI, etc.). Do not use platform-specific environment variables or string substitutions (e.g., `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_SESSION_ID}`, `CODEX_SANDBOX`, `CODEX_SESSION_ID`) in skill content without a graceful fallback that works when the variable is unavailable or unresolved.

Read-time references stay relative to the skill root. Executed bundled scripts use the model-filled `SKILL_DIR` anchor with a trailing `;` on the assignment line:

```
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
bash "$SKILL_DIR/scripts/my-script.sh" ARG
```

Keep the `;`. Avoid `${CLAUDE_SKILL_DIR}` in this cross-host plugin. **Do not use `!` load-time pre-resolution in skills** (`tests/skill-shell-safety.test.ts`). Gather context at runtime with one argv-style command per shell tool call. Tier details, flatten-safety, and the permission caveat: `docs/solutions/developer-experience/always-on-agents-md.md`.

## Repository Docs Convention

- **Guides** live in `docs/guides/` — the user-facing skill catalog and configuration reference. Keep them here, not under `skills/`, so they do not ship inside the plugin package.
- **Plans** live in `docs/plans/` — unified plan artifacts. New `ce-brainstorm` outputs are requirements-only unified plans; `ce-plan` adds implementation planning in place. Consumers assess contents and unresolved blockers rather than a readiness field. Historical `docs/brainstorms/*-requirements.*` files remain readable legacy inputs and should not be migrated just because a new plan is created.
- **Brainstorm evidence / legacy requirements** may live in `docs/brainstorms/` — historical requirements docs and specialized analysis artifacts such as `docs/brainstorms/riffrec-feedback/`. Do not treat this as the canonical output path for new `ce-brainstorm` artifacts.
- **Solutions** live in `docs/solutions/` — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.
- **Specs** live in `docs/specs/` — target platform format specifications.

### Solution categories (`docs/solutions/`)

This repo builds a plugin *for* developers. Categorize solutions from the perspective of the end user (a developer using the plugin), not a contributor to this repo.

- **`developer-experience/`** — Issues with contributing to *this repo*: local dev setup, shell aliases, test ergonomics, CI friction. If the fix only matters to someone with a checkout of this repo, it belongs here.
- **`integrations/`** — Issues where plugin output doesn't work correctly on a target platform or OS. Cross-platform bugs, target writer output problems, and converter compatibility issues go here.
- **`workflow/`**, **`skill-design/`** — Plugin skill and agent design patterns, workflow improvements.

When in doubt: if the bug affects someone running `bun install compound-engineering` or `bun convert`, it's an integration or product issue, not developer-experience.
