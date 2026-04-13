# Plugin Instructions

These instructions apply when working under `plugins/compound-engineering/`.
They supplement the repo-root `AGENTS.md`.

# Compounding Engineering Plugin Development

## Versioning Requirements

**IMPORTANT**: Routine PRs should not cut releases for this plugin.

The repo uses an automated release process to prepare plugin releases, including version selection and changelog generation. Because multiple PRs may merge before the next release, contributors cannot know the final released version from within an individual PR.

### Contributor Rules

- Do **not** manually bump `.claude-plugin/plugin.json` version in a normal feature PR.
- Do **not** manually bump `.claude-plugin/marketplace.json` plugin version in a normal feature PR.
- Do **not** cut a release section in the canonical root `CHANGELOG.md` for a normal feature PR.
- Do update substantive docs that are part of the actual change, such as `README.md`, component tables, usage instructions, or counts when they would otherwise become inaccurate.

### Pre-Commit Checklist

Before committing ANY changes:

- [ ] No manual release-version bump in `.claude-plugin/plugin.json`
- [ ] No manual release-version bump in `.claude-plugin/marketplace.json`
- [ ] No manual release entry added to the root `CHANGELOG.md`
- [ ] README.md component counts verified
- [ ] README.md tables accurate (agents, commands, skills)
- [ ] plugin.json description matches current counts

### Directory Structure

```
agents/
├── review/           # Code review agents
├── document-review/  # Plan and requirements document review agents
├── research/         # Research and analysis agents
├── design/           # Design and UI agents
└── docs/             # Documentation agents

skills/
├── ce-*/          # Core workflow skills (ce:plan, ce:review, etc.)
└── */             # All other skills
```

> **Note:** Commands were migrated to skills in v2.39.0. All former
> `/command-name` slash commands now live under `skills/command-name/SKILL.md`
> and work identically in Claude Code. Other targets may convert or map these references differently.

## Debugging Plugin Bugs

Developers of this plugin also use it via their marketplace install (`~/.claude/plugins/`). When a developer reports a bug they experienced while using a skill or agent, the installed version may be older than the repo. Glob for the component name under `~/.claude/plugins/` and diff the installed content against the repo version.

- **Repo already has the fix**: The developer's install is stale. Tell them to reinstall the plugin or use `--plugin-dir` to load skills from the repo checkout. No code change needed.
- **Both versions have the bug**: Proceed with the fix normally.

Important: Just because the developer's installed plugin may be out of date, it's possible both old and current repo versions have the bug. The proper fix is to still fix the repo version.

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
- [ ] `description:` value is quoted (single or double) if it contains colons -- unquoted colons break `js-yaml` strict parsing and crash `install --to opencode/codex`. Run `bun test tests/frontmatter.test.ts` to verify.

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

### Cross-Platform User Interaction

- [ ] When a skill needs to ask the user a question, instruct use of the platform's blocking question tool and name the known equivalents (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini)
- [ ] Include a fallback for environments without a question tool (e.g., present numbered options and wait for the user's reply before proceeding)

### Cross-Platform Task Tracking

- [ ] When a skill needs to create or track tasks, describe the intent (e.g., "create a task list") and name the known equivalents (`TaskCreate`/`TaskUpdate`/`TaskList` in Claude Code, `update_plan` in Codex)
- [ ] Do not reference `TodoWrite` or `TodoRead` — these are legacy Claude Code tools replaced by `TaskCreate`/`TaskUpdate`/`TaskList`
- [ ] When a skill dispatches sub-agents, prefer parallel execution but include a sequential fallback for platforms that do not support parallel dispatch

### Script Path References in Skills

- [ ] In bash code blocks, reference co-located scripts using relative paths (e.g., `bash scripts/my-script ARG`) — not `${CLAUDE_PLUGIN_ROOT}` or other platform-specific variables
- [ ] All platforms resolve script paths relative to the skill's directory; no env var prefix is needed
- [ ] Reference the script with a backtick path (e.g., `` `scripts/my-script` ``) so agents can locate it; a markdown link is not needed since the bash code block already provides the invocation

### Cross-Platform Reference Rules

This plugin is authored once, then converted for other agent platforms. Commands and agents are transformed during that conversion, but `plugin.skills` are usually copied almost exactly as written.

- [ ] Because of that, slash references inside command or agent content are acceptable when they point to real published commands; target-specific conversion can remap them.
- [ ] Inside a pass-through `SKILL.md`, do not assume slash references will be remapped for another platform. Write references according to what will still make sense after the skill is copied as-is.
- [ ] When one skill refers to another skill, prefer semantic wording such as "load the `document-review` skill" rather than slash syntax.
- [ ] Use slash syntax only when referring to an actual published command or workflow such as `/ce:work` or `/ce:compound`.

### Tool Selection in Agents and Skills

Agents and skills that explore codebases must prefer native tools over shell commands.

Why: shell-heavy exploration causes avoidable permission prompts in sub-agent workflows; native file-search, content-search, and file-read tools avoid that.

- [ ] Never instruct agents to use `find`, `ls`, `cat`, `head`, `tail`, `grep`, `rg`, `wc`, or `tree` through a shell for routine file discovery, content search, or file reading
- [ ] Describe tools by capability class with platform hints — e.g., "Use the native file-search/glob tool (e.g., Glob in Claude Code)" — not by Claude Code-specific tool names alone
- [ ] When shell is the only option (e.g., `ast-grep`, `bundle show`, git commands), instruct one simple command at a time — no action chaining (`cmd1 && cmd2`, `cmd1 ; cmd2`) and no error suppression (`2>/dev/null`, `|| true`). Boolean conditions within if/while guards (`[ -n "$X" ] || [ -n "$Y" ]`) are fine — that is normal conditional logic, not action chaining. Simple pipes (e.g., `| jq .field`) and output redirection (e.g., `> file`) are acceptable when they don't obscure failures
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
- **New agent:** Create `agents/<category>/<name>.md` with frontmatter. Categories: `review`, `document-review`, `research`, `design`, `docs`, `workflow`. Add the agent to `README.md` and update the agent count.

## Beta Skills

Beta skills use a `-beta` suffix and `disable-model-invocation: true` to prevent accidental auto-triggering. See `docs/solutions/skill-design/beta-skills-framework.md` for naming, validation, and promotion rules.

### Stable/Beta Sync

When modifying a skill that has a `-beta` counterpart (or vice versa), always check the other version and **state your sync decision explicitly** before committing — e.g., "Propagated to beta — shared test guidance" or "Not propagating — this is the experimental delegate mode beta exists to test." Syncing to both, stable-only, and beta-only are all valid outcomes. The goal is deliberate reasoning, not a default rule.

## Documentation

See `docs/solutions/plugin-versioning-requirements.md` for detailed versioning workflow.
