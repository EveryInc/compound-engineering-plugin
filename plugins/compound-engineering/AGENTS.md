# Plugin Instructions

These instructions apply when working under `plugins/compound-engineering/`.
They supplement the repo-root `AGENTS.md`.

# Compounding Engineering Plugin Development

## Versioning Requirements

**IMPORTANT**: Routine PRs should not cut releases for this plugin.

The repo uses an automated release process to prepare plugin releases, including version selection and changelog generation. Because multiple PRs may merge before the next release, contributors cannot know the final released version from within an individual PR.

### Contributor Rules

- Do **not** manually bump `.claude-plugin/plugin.json` version in a normal feature PR.
- Do **not** manually bump `.cursor-plugin/plugin.json` version in a normal feature PR.
- Do **not** manually bump `.codex-plugin/plugin.json` version in a normal feature PR — release-please owns this via `extra-files` in `.github/release-please-config.json`, parallel to the Claude and Cursor entries.
- Do **not** manually bump `.claude-plugin/marketplace.json` plugin version in a normal feature PR.
- Do **not** hand-edit `.agents/plugins/marketplace.json` except to add or remove a plugin. Plugin-list, name, and description drift between the Claude, Cursor, and Codex marketplaces is caught by `bun run release:validate`.
- Do **not** cut a release section in the canonical root `CHANGELOG.md` for a normal feature PR.
- Do update substantive docs that are part of the actual change, such as `README.md`, component tables, usage instructions, or counts when they would otherwise become inaccurate.

### Pre-Commit Checklist

Before committing ANY changes:

- [ ] No manual release-version bump in `.claude-plugin/plugin.json`
- [ ] No manual release-version bump in `.cursor-plugin/plugin.json`
- [ ] No manual release-version bump in `.codex-plugin/plugin.json`
- [ ] No manual release-version bump in `.claude-plugin/marketplace.json`
- [ ] No manual release entry added to the root `CHANGELOG.md`
- [ ] `bun run release:validate` passes (enforces Claude/Cursor/Codex manifest parity)
- [ ] README.md component counts verified
- [ ] README.md tables accurate (agents, commands, skills)
- [ ] plugin.json description matches current counts

### Directory Structure

```
agents/
└── ce-*.agent.md  # All agents live flat under agents/, prefixed with ce-

skills/
├── ce-*/          # Core workflow skills (ce-plan, ce-code-review, etc.)
└── */             # All other skills
```

Agents are grouped topically in `README.md` (Review, Document Review, Research, Design, Workflow, Docs) for reader navigation — those groupings are conceptual, not filesystem subdirectories.

> **Note:** Commands were migrated to skills in v2.39.0. All former
> `/command-name` slash commands now live under `skills/command-name/SKILL.md`
> and work identically in Claude Code. Other targets may convert or map these references differently.

## Debugging Plugin Bugs

Developers of this plugin also use it via their marketplace install (`~/.claude/plugins/`). When a developer reports a bug they experienced while using a skill or agent, the installed version may be older than the repo. Glob for the component name under `~/.claude/plugins/` and diff the installed content against the repo version.

- **Repo already has the fix**: The developer's install is stale. Tell them to reinstall the plugin or use `--plugin-dir` to load skills from the repo checkout. No code change needed.
- **Both versions have the bug**: Proceed with the fix normally.

Important: Just because the developer's installed plugin may be out of date, it's possible both old and current repo versions have the bug. The proper fix is to still fix the repo version.

## Naming Convention

**All skills and agents** use the `ce-` prefix to unambiguously identify them as compound-engineering components:
- `/ce-brainstorm` - Explore requirements and approaches before planning
- `/ce-plan` - Create implementation plans
- `/ce-code-review` - Run comprehensive code reviews
- `/ce-work` - Execute work items systematically
- `/ce-compound` - Document solved problems

**Why `ce-`?** Claude Code has built-in `/plan` and `/review` commands. The `ce-` prefix (short for compound-engineering) makes it immediately clear these components belong to this plugin. The hyphen is used instead of a colon to avoid filesystem issues on Windows and to align directory names with frontmatter names.

**Agents** follow the same convention: `ce-adversarial-reviewer`, `ce-learnings-researcher`, etc. When referencing agents from skills, use the bare `ce-<agent-name>` form (e.g., `ce-adversarial-reviewer`) — the `ce-` prefix is sufficient for uniqueness across plugins.

## Known External Limitations

**Proof HITL surfaces a ghost "AI collaborator" agent** (noted 2026-04-16, may change): The Proof API auto-joins any header-less `/state` read under a synthetic `ai:auto-<hash>` identity, so docs created by the `skills/proof/` HITL workflow show a phantom participant alongside `Compound Engineering`. The only way to suppress it is to set `ownerId: "agent:ai:compound-engineering"` on create — but that transfers document ownership to the agent and prevents the user from claiming it into their Proof library, so we don't use it. Treat as cosmetic noise; don't reintroduce the `ownerId` workaround. Tracked upstream: https://github.com/EveryInc/proof/issues/951.

## Skill Compliance Checklist

When adding or modifying skills, verify compliance with the skill spec:

### YAML Frontmatter (Required)

- [ ] `name:` present and matches directory name (lowercase-with-hyphens)
- [ ] `description:` present and describes **what it does and when to use it** (per official spec: "Explains code with diagrams. Use when exploring how code works.")
- [ ] `description:` is no longer than 1024 characters -- some coding harnesses reject longer skill descriptions. Enforced by `tests/frontmatter.test.ts`.
- [ ] `description:` value is quoted (single or double) if it contains colons -- unquoted colons break `js-yaml` strict parsing and crash `install --to opencode/codex`. Run `bun test tests/frontmatter.test.ts` to verify.
- [ ] `description:` value does not contain raw angle-bracket tokens like `<skill-name>`, `<tag>`, or `<placeholder>` -- Cowork's plugin validator parses descriptions as HTML and rejects unknown tags with a generic "Plugin validation failed" banner (see issue #602). Claude Code tolerates them, so the bug only surfaces downstream. Backtick-wrap the token (`` `<skill-name>` ``) or rephrase. Enforced by `tests/frontmatter.test.ts`.

### Reference File Inclusion (Required if references/ exists)

- [ ] Do NOT use markdown links like `[filename.md](./references/filename.md)` -- agents interpret these as Read instructions with CWD-relative paths, which fail because the CWD is never the skill directory
- [ ] **Default: use backtick paths.** Most reference files should be referenced with backtick paths so the agent can load them on demand:
  ```
  `references/architecture-patterns.md`
  ```
  This keeps the skill lean and avoids inflating the token footprint at load time. Use for: large reference docs, routing-table targets, code scaffolds, executable scripts/templates
- [ ] **Exception: `@` inline for small structural files** that the skill cannot function without and that are under ~150 lines (schemas, output contracts, subagent dispatch templates). Use `@` file inclusion on its own line:
  ```
  @./references/schema.json
  ```
  This resolves relative to the SKILL.md and substitutes content before the model sees it. If a file is over ~150 lines, prefer a backtick path even if it is always needed
- [ ] For files the agent needs to *execute* (scripts, shell templates), always use backtick paths -- `@` would inline the script as text content instead of keeping it as an executable file

### Conditional and Late-Sequence Extraction

Skill content loaded at trigger time is carried in every subsequent message — every tool call, agent dispatch, and response. This carrying cost compounds across the session. For skills that orchestrate many tool or agent calls, extract blocks to `references/` when they are conditional (only execute under specific conditions) or late-sequence (only needed after many prior calls) and represent a meaningful share of the skill (~20%+). The more tool/agent calls a skill makes, the more aggressively to extract. Replace extracted blocks with a 1-3 line stub stating the condition and a backtick path reference (e.g., "Read `references/deepening-workflow.md`"). Never use `@` for extracted blocks — it inlines content at load time, defeating the extraction.

### Writing Style

- [ ] Use imperative/infinitive form (verb-first instructions)
- [ ] Avoid second person ("you should") - use objective language ("To accomplish X, do Y")

### Rationale Discipline

Every line in `SKILL.md` loads on every invocation. Include rationale only when it changes what the agent does at runtime — if behavior wouldn't differ without the sentence, cut it.

Keep rationale at the highest-level location that covers it; restate behavioral directives at the point they take effect. A 500-line skill shouldn't hinge on the agent remembering line 9 by line 400. Portability notes, defenses against mistakes the agent wasn't going to make, and meta-commentary about this repo's authoring rules belong in commit messages or `docs/solutions/`, not in the skill body.

### Cross-Platform User Interaction

- [ ] When a skill needs to ask the user a question, instruct use of the platform's blocking question tool and name the known equivalents (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi via the `pi-ask-user` extension)
- [ ] For Claude Code, also instruct to load `AskUserQuestion` via `ToolSearch` with `select:AskUserQuestion` first if its schema isn't already loaded — `AskUserQuestion` is a deferred tool and won't be available at session start. A pending schema load is not a valid reason to fall back to text.
- [ ] Include a fallback: when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes where `request_user_input` is unavailable, or `ToolSearch` returns no match), present numbered options in chat and wait for the user's reply — never silently skip the question.
- [ ] **Narrow exception for legitimate option overflow:** when a menu has 5 or more genuinely relevant options — each a distinct destination or workflow, none removable without losing real user choice — render as a numbered list in chat rather than trimming to fit the 4-option cap. This is used with restraint, not as a convenience escape from the blocking tool. Default remains the blocking tool. Before invoking the exception, verify that (a) no option can be cut, (b) no two options can be merged, and (c) no option is better surfaced as contextual prose (e.g., a nudge adjacent to the menu). If any of those reductions work, prefer them over the fallback. When the exception applies, include a hint that free-form input is accepted (e.g., "Pick a number or describe what you want.") so the numbered list retains the blocking tool's open-endedness.

> **Platform-behavior note (April 2026, may change):** The specifics above reflect current behavior — `AskUserQuestion` is deferred in Claude Code, and `request_user_input` in Codex is exposed only in Plan mode. If Anthropic changes `AskUserQuestion` to a non-deferred tool, or Codex exposes `request_user_input` in edit modes, revisit this guidance rather than carrying the workaround forward indefinitely. Verify before assuming these constraints still hold.

### Interactive Question Tool Design

Design rules for blocking question menus (`AskUserQuestion` / `request_user_input` / `ask_user`). Violations silently degrade the UX in harnesses where secondary description text is hidden or labels are truncated.

- [ ] Each option label must be self-contained — some harnesses render only the label, not the accompanying description; the label alone must convey what the option does
- [ ] Keep total options to 4 or fewer (`AskUserQuestion` caps at 4 across platforms we target)
- [ ] Do not offer "still working" / "I'll come back" options — the blocking tool already waits; such options are no-op wrappers. If the user needs to go do something, they simply leave the prompt open
- [ ] Refer to the agent in third person ("the agent") in labels and stems — first-person "me" / "I'll" is ambiguous in a tool-mediated exchange where it's unclear whether the speaker is the user, the agent, or the tool
- [ ] Phrase labels from the user's intent, not the system's internal state — each option should complete "I want to ___" from the user's POV; avoid leaking mode names like "end-sync" or "phase-3" into labels
- [ ] Use the question stem as a teaching surface for first-time mechanics — teach the mechanic there (e.g., "Highlight text in Proof to leave a comment"), not in option descriptions that may be hidden
- [ ] When renaming a display label, rename its matching routing block (`**If user selects "X":**`) in the same edit — the model matches selections by verbatim label string, so a missed rename silently breaks routing
- [ ] Front-load the distinguishing word when options share a prefix — "Proceed to planning" vs "Proceed directly to work" look identical when truncated; put the differentiator in the first 3-4 words
- [ ] Name the target when an artifact is ambiguous — "save to my local file" beats "save to my file" when multiple artifacts (Proof doc, local markdown, cached copy) coexist
- [ ] Keep voice consistent across a menu — mixing imperative ("Pause") with user-voice status ("I'm done — save…") within the same set reads as authored by different agents

### Cross-Platform Task Tracking

- [ ] When a skill needs to create or track tasks, describe the intent (e.g., "create a task list") and name the known equivalents (`TaskCreate`/`TaskUpdate`/`TaskList` in Claude Code, `update_plan` in Codex)
- [ ] Do not reference `TodoWrite` or `TodoRead` — these are legacy Claude Code tools replaced by `TaskCreate`/`TaskUpdate`/`TaskList`

### Cross-Platform Sub-Agent Dispatch

- [ ] When a skill dispatches sub-agents, instruct use of the platform's subagent primitive and name the known equivalents (`Agent`/`Task` in Claude Code, `spawn_agent` in Codex, `subagent` in Pi via the `pi-subagents` extension)
- [ ] Prefer parallel execution but include a sequential fallback for platforms that do not support parallel dispatch
- [ ] Prefer sub-agents shipped with this plugin (`ce-*`) over platform built-ins. Built-ins have different names on each target (e.g., Claude Code's `Explore` is `explorer` on Codex via `spawn_agent`'s `agent_type`, `scout` on Pi via `pi-subagents`) — using our own avoids the enumeration tax. Exception: when a built-in offers a meaningful benefit worth keeping, enumerate the per-platform equivalents inline at the call site so the model can route correctly on each target.

### Script Path References in Skills

- [ ] In bash code blocks, reference co-located scripts using relative paths (e.g., `bash scripts/my-script ARG`) — not `${CLAUDE_PLUGIN_ROOT}` or other platform-specific variables
- [ ] All platforms resolve script paths relative to the skill's directory; no env var prefix is needed
- [ ] Reference the script with a backtick path (e.g., `` `scripts/my-script` ``) so agents can locate it; a markdown link is not needed since the bash code block already provides the invocation

### Cross-Platform Reference Rules

This plugin is authored once, then converted for other agent platforms. Commands and agents are transformed during that conversion, but `plugin.skills` are usually copied almost exactly as written.

- [ ] Because of that, slash references inside command or agent content are acceptable when they point to real published commands; target-specific conversion can remap them.
- [ ] Inside a pass-through `SKILL.md`, do not assume slash references will be remapped for another platform. Write references according to what will still make sense after the skill is copied as-is.
- [ ] When one skill refers to another skill, prefer semantic wording such as "load the `ce-doc-review` skill" rather than slash syntax.
- [ ] Use slash syntax only when referring to an actual published command or workflow such as `/ce-work` or `/ce-compound`.

### Tool Selection in Agents and Skills

Agents and skills that explore codebases must prefer native tools over shell commands.

Why: shell-heavy exploration causes avoidable permission prompts in sub-agent workflows; native file-search, content-search, and file-read tools avoid that.

- [ ] Never instruct agents to use `find`, `ls`, `cat`, `head`, `tail`, `grep`, `rg`, `wc`, or `tree` through a shell for routine file discovery, content search, or file reading
- [ ] Describe tools by capability class with platform hints — e.g., "Use the native file-search/glob tool (e.g., Glob in Claude Code)" — not by Claude Code-specific tool names alone
- [ ] When shell is the only option (e.g., `ast-grep`, `bundle show`, git commands), instruct one simple command at a time — no action chaining (`cmd1 && cmd2`, `cmd1 ; cmd2`) and no error suppression (`2>/dev/null`, `|| true`). Two narrow exceptions: boolean conditions within if/while guards (`[ -n "$X" ] || [ -n "$Y" ]`) are fine — that is normal conditional logic, not action chaining. **Value-producing preparatory commands** (`VAR=$(cmd1) && cmd2 "$VAR"`) are also fine when `cmd2` strictly consumes `cmd1`'s output and splitting would require manually threading the value through model context across bash calls (e.g., `BODY_FILE=$(mktemp -u) && cat > "$BODY_FILE" <<EOF ... EOF`). Simple pipes (e.g., `| jq .field`) and output redirection (e.g., `> file`) are acceptable when they don't obscure failures
- [ ] **Pre-resolution exception:** `!` backtick pre-resolution commands run at skill load time, not at agent runtime. They may use chaining (`&&`, `||`), error suppression (`2>/dev/null`), and fallback sentinels (e.g., `|| echo '__NO_CONFIG__'`) to produce a clean, parseable value for the model. This is the preferred pattern for environment probes (CLI availability, config file reads) that would otherwise require runtime shell calls with chaining. Example: `` !`command -v codex >/dev/null 2>&1 && echo "AVAILABLE" || echo "NOT_FOUND"` ``
- [ ] Do not encode shell recipes for routine exploration when native tools can do the job; encode intent and preferred tool classes instead
- [ ] For shell-only workflows (e.g., `gh`, `git`, `bundle show`, project CLIs), explicit command examples are acceptable when they are simple, task-scoped, and not chained together

### Passing Reference Material to Sub-Agents

When a skill orchestrates sub-agents that need codebase reference material, prefer passing file paths over file contents. The sub-agent reads only what it needs. Content-passing is fine for small, static material consumed in full (e.g., a JSON schema under ~50 lines).

### Sub-Agent Permission Mode

When dispatching sub-agents, **omit the `mode` parameter** on the Agent/Task tool call unless the skill explicitly needs a specific mode (e.g., `mode: "plan"` for plan-approval workflows). Passing `mode: "auto"` or any other value overrides the user's configured permission settings (e.g., `bypassPermissions` in their user-level config), which is never the intended behavior for routine subagent dispatch. Omitting `mode` lets the user's own `defaultMode` setting apply.

### Reading Config Files from Skills

Plugin config lives at `.compound-engineering/config.local.yaml` in the repo root. This file is gitignored (machine-local settings), which creates two gotchas:

1. **Path resolution:** Never read the config relative to CWD — the user may invoke a skill from a subdirectory. Always resolve from the repo root. In pre-resolution commands, use `git rev-parse --show-toplevel` to find the root.

2. **Worktrees:** Gitignored files are per-worktree. A config file created in the main checkout does not exist in worktrees. When reading config, fall back to the main repo root if the file is missing in the current worktree:
   ```
   !`cat "$(git rev-parse --show-toplevel 2>/dev/null)/.compound-engineering/config.local.yaml" 2>/dev/null || cat "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)")/.compound-engineering/config.local.yaml" 2>/dev/null || echo '__NO_CONFIG__'`
   ```
   The first `cat` tries the current worktree root. The second derives the main repo root from `git-common-dir` as a fallback. In a regular (non-worktree) checkout, both paths are identical.

If neither path has the file, fall through to defaults — never fail or block on missing config.

### Quick Validation Command

```bash
# Check for broken markdown link references (should return nothing)
grep -E '\[.*\]\(\./references/|\[.*\]\(\./assets/|\[.*\]\(references/|\[.*\]\(assets/' skills/*/SKILL.md

# Check description format - should describe what + when
grep -E '^description:' skills/*/SKILL.md
```

## Adding Components

- **New skill:** Create `skills/<name>/SKILL.md` with required YAML frontmatter (`name`, `description`). Reference files go in `skills/<name>/references/`. Add the skill to the appropriate category table in `README.md` and update the skill count.
- **New agent:** Create `agents/ce-<name>.agent.md` with frontmatter (the `ce-` prefix is required). Add the agent to the appropriate topical section of `README.md` (Review, Document Review, Research, Design, Workflow, Docs) and update the agent count.

### Adding a New Plugin to This Repo

When adding a new plugin alongside `compound-engineering` and `coding-tutor`, the repo ships to three marketplace formats (Claude, Cursor, Codex). All three must stay in parity or `bun run release:validate` will fail on next run. Checklist:

- [ ] `.claude-plugin/marketplace.json` — add the plugin to `plugins[]`
- [ ] `.cursor-plugin/marketplace.json` — add the plugin to `plugins[]`
- [ ] `.agents/plugins/marketplace.json` — add the plugin to `plugins[]` (Codex schema: nested `source: { source: "local", path: "./plugins/<name>" }`, `policy`, `category`)
- [ ] `plugins/<name>/.claude-plugin/plugin.json` — create with `name`, `version`, `description`
- [ ] `plugins/<name>/.cursor-plugin/plugin.json` — create with matching `name`, `version`, `description`
- [ ] `plugins/<name>/.codex-plugin/plugin.json` — create with matching `name`, `version`, `description`, plus Codex-specific fields (`skills: "./skills/"` if skills exist, plus `interface{}` block)
- [ ] `.github/release-please-config.json` — add a `plugins/<name>` package entry with `extra-files` for all three plugin.json paths
- [ ] `.github/.release-please-manifest.json` — add the initial version entry for the new package
- [ ] `src/release/metadata.ts` — extend `syncReleaseMetadata` with a cross-check target for the new plugin (follow the `codexPluginTargets` pattern)
- [ ] Run `bun run release:validate` and confirm it reports the new manifests without drift

The validator enforces: plugin-list parity across all three marketplaces, name/version/description parity across each plugin's three plugin.json files, and existence of any `skills:` directory declared in the Codex manifest. Note that only `description` drift is auto-corrected on `write: true` — version drift is detect-only because release-please owns the write.

## Beta Skills

Beta skills use a `-beta` suffix and `disable-model-invocation: true` to prevent accidental auto-triggering. See `docs/solutions/skill-design/beta-skills-framework.md` for naming, validation, and promotion rules.

**Caveat on non-beta use of `disable-model-invocation`:** The flag blocks all model-initiated invocations via the Skill tool, which includes scheduled re-entry from `/loop`. Only a user typing a slash command directly bypasses it. If a skill is intended to be schedulable (e.g., `resolve-pr-feedback`), do not set this flag — rely on description specificity and argument requirements to prevent accidental auto-fire instead.

### Stable/Beta Sync

When modifying a skill that has a `-beta` counterpart (or vice versa), always check the other version and **state your sync decision explicitly** before committing — e.g., "Propagated to beta — shared test guidance" or "Not propagating — this is the experimental delegate mode beta exists to test." Syncing to both, stable-only, and beta-only are all valid outcomes. The goal is deliberate reasoning, not a default rule.

## Documented Solutions

`docs/solutions/` holds documented solutions to past problems — bugs, architecture patterns, design patterns, tooling decisions, conventions, workflow practices, and other institutional knowledge. Entries use YAML frontmatter with fields including `module`, `tags`, and `problem_type`. Knowledge-track `problem_type` values are `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention`, `workflow_issue`, `developer_experience`, `documentation_gap`, and `best_practice` (fallback). Bug-track values cover `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `integration_issue`, and `logic_error`. Search this directory before designing new solutions so institutional memory compounds across changes.

## Documentation

See `docs/solutions/plugin-versioning-requirements.md` for detailed versioning workflow.
