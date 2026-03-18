# Feature: OpenCode Commands as .md Files, Config Merge, and Permissions Default Fix

**Type:** feature + bug fix (consolidated)
**Date:** 2026-02-20
**Starting point:** Branch `main` at commit `174cd4c`
**Create feature branch:** `feature/opencode-commands-md-merge-permissions`
**Baseline tests:** 180 pass, 0 fail (run `bun test` to confirm before starting)

---

## Context

### User-Facing Goal

When running `bunx @every-env/compound-plugin install compound-engineering --to opencode`, three problems exist:

1. **Commands overwrite `opencode.json`**: Plugin commands are written into the `command` key of `opencode.json`, which replaces the user's existing configuration file (the writer does `writeJson(configPath, bundle.config)` — a full overwrite). The user loses their personal settings (model, theme, provider keys, MCP servers they previously configured).

2. **Commands should be `.md` files, not JSON**: OpenCode supports defining commands as individual `.md` files in `~/.config/opencode/commands/`. This is additive and non-destructive — one file per command, never touches `opencode.json`.

3. **`--permissions broad` is the default and pollutes global config**: The `--permissions` flag defaults to `"broad"`, which writes 14 `permission: allow` entries and 14 `tools: true` entries into `opencode.json` on every install. These are global settings that affect ALL OpenCode sessions, not just plugin commands. Even `--permissions from-commands` is semantically wrong — it unions per-command `allowedTools` restrictions into a single global block, which inverts restriction semantics (a command allowing only `Read` gets merged with one allowing `Bash`, producing global `bash: allow`).

### Expected Behavior After This Plan

- Commands are written as `~/.config/opencode/commands/<name>.md` with YAML frontmatter (`description`, `model`). The `command` key is never written to `opencode.json`.
- `opencode.json` is deep-merged (not overwritten): existing user keys survive, plugin's MCP servers are added. User values win on conflict.
- `--permissions` defaults to `"none"` — no `permission` or `tools` entries are written to `opencode.json` unless the user explicitly passes `--permissions broad` or `--permissions from-commands`.

### Relevant File Paths

| File | Current State on `main` | What Changes |
|---|---|---|
| `src/types/opencode.ts` | `OpenCodeBundle` has no `commandFiles` field. Has `OpenCodeCommandConfig` type and `command` field on `OpenCodeConfig`. | Add `OpenCodeCommandFile` type. Add `commandFiles` to `OpenCodeBundle`. Remove `OpenCodeCommandConfig` type and `command` field from `OpenCodeConfig`. |
| `src/converters/claude-to-opencode.ts` | `convertCommands()` returns `Record<string, OpenCodeCommandConfig>`. Result set on `config.command`. `applyPermissions()` writes `config.permission` and `config.tools`. | `convertCommands()` returns `OpenCodeCommandFile[]`. `config.command` is never set. No changes to `applyPermissions()` itself. |
| `src/targets/opencode.ts` | `writeOpenCodeBundle()` does `writeJson(configPath, bundle.config)` — full overwrite. No `commandsDir`. No merge logic. | Add `commandsDir` to path resolver. Write command `.md` files with backup. Replace overwrite with `mergeOpenCodeConfig()` — read existing, deep-merge, write back. |
| `src/commands/install.ts` | `--permissions` default is `"broad"` (line 51). | Change default to `"none"`. Update description string. |
| `src/utils/files.ts` | Has `readJson()`, `pathExists()`, `backupFile()` already. | No changes needed — utilities already exist. |
| `tests/converter.test.ts` | Tests reference `bundle.config.command` (lines 19, 74, 202-214, 243). Test `"maps commands, permissions, and agents"` tests `from-commands` mode. | Update all to use `bundle.commandFiles`. Rename permission-related test to clarify opt-in nature. |
| `tests/opencode-writer.test.ts` | 4 tests, none have `commandFiles` in bundles. `"backs up existing opencode.json before overwriting"` test expects full overwrite. | Add `commandFiles: []` to all existing bundles. Rewrite backup test to test merge behavior. Add new tests for command file writing and merge. |
| `tests/cli.test.ts` | 10 tests. None check for commands directory. | Add test for `--permissions none` default. Add test for command `.md` file existence. |
| `AGENTS.md` | Line 10: "Keep OpenCode output at `opencode.json` and `.opencode/{agents,skills,plugins}`." | Update to document commands go to `commands/<name>.md`, `opencode.json` is deep-merged. |
| `README.md` | Line 54: "OpenCode output is written to `~/.config/opencode` by default, with `opencode.json` at the root..." | Update to document `.md` command files, merge behavior, `--permissions` default. |

### Prior Context (Pre-Investigation)

- **No `docs/decisions/` directory on `main`**: ADRs will be created fresh during this plan.
- **No prior plans touch the same area**: The `2026-02-08-feat-convert-local-md-settings-for-opencode-codex-plan.md` discusses path rewriting in command bodies but does not touch command output format or permissions.
- **OpenCode docs (confirmed via context7 MCP, library `/sst/opencode`):**
  - Command `.md` frontmatter supports: `description`, `agent`, `model`. Does NOT support `permission` or `tools`. Placed in `~/.config/opencode/commands/` (global) or `.opencode/commands/` (project).
  - Agent `.md` frontmatter supports: `description`, `mode`, `model`, `temperature`, `tools`, `permission`. Placed in `~/.config/opencode/agents/` or `.opencode/agents/`.
  - `opencode.json` is the only place for: `mcp`, global `permission`, global `tools`, `model`, `provider`, `theme`, `server`, `compaction`, `watcher`, `share`.

### Rejected Approaches

**1. Map `allowedTools` to per-agent `.md` frontmatter permissions.**
Rejected: Claude commands are not agents. There is no per-command-to-per-agent mapping. Commands don't specify which agent to run with. Even if they did, the union of multiple commands' restrictions onto a single agent's permissions loses the per-command scoping. Agent `.md` files DO support `permission` in frontmatter, but this would require creating synthetic agents just to hold permissions — misleading and fragile.

**2. Write permissions into command `.md` file frontmatter.**
Rejected: OpenCode command `.md` files only support `description`, `agent`, `model` in frontmatter. There is no `permission` or `tools` key. Confirmed via context7 docs. Anything else is silently ignored.

**3. Keep `from-commands` as the default but fix the flattening logic.**
Rejected: There is no correct way to flatten per-command tool restrictions into a single global permission block. Any flattening loses information and inverts semantics.

**4. Remove the `--permissions` flag entirely.**
Rejected: Some users may want to write permissions to `opencode.json` as a convenience. Keeping the flag with a changed default preserves optionality.

**5. Write commands as both `.md` files AND in `opencode.json` `command` block.**
Rejected: Redundant and defeats the purpose of avoiding `opencode.json` pollution. `.md` files are the sole output format.

---

## Decision Record

### Decision 1: Commands emitted as individual `.md` files, never in `opencode.json`

- **Decision:** `convertCommands()` returns `OpenCodeCommandFile[]` (one `.md` file per command with YAML frontmatter). The `command` key is never set on `OpenCodeConfig`. The writer creates `<commandsDir>/<name>.md` for each file.
- **Context:** OpenCode supports two equivalent formats for commands — JSON in config and `.md` files. The `.md` format is additive (new files) rather than destructive (rewriting JSON). This is consistent with how agents and skills are already handled as `.md` files.
- **Alternatives rejected:** JSON-only (destructive), both formats (redundant). See Rejected Approaches above.
- **Assumptions:** OpenCode resolves commands from the `commands/` directory at runtime. Confirmed via docs.
- **Reversal trigger:** If OpenCode deprecates `.md` command files or the format changes incompatibly.

### Decision 2: `opencode.json` deep-merged, not overwritten

- **Decision:** `writeOpenCodeBundle()` reads the existing `opencode.json` (if present), deep-merges plugin-provided keys (MCP servers, and optionally permission/tools if `--permissions` is not `none`) without overwriting user-set values, and writes the merged result. User keys always win on conflict.
- **Context:** Users have personal configuration in `opencode.json` (API keys, model preferences, themes, existing MCP servers). The current full-overwrite destroys all of this.
- **Alternatives rejected:** Skip writing `opencode.json` entirely — rejected because MCP servers must be written there (no `.md` alternative exists for MCP).
- **Assumptions:** `readJson()` and `pathExists()` already exist in `src/utils/files.ts`. Malformed JSON in existing file should warn and fall back to plugin-only config (do not crash, do not destroy).
- **Reversal trigger:** If OpenCode adds a separate mechanism for plugin MCP server registration that doesn't involve `opencode.json`.

### Decision 3: `--permissions` default changed from `"broad"` to `"none"`

- **Decision:** The `--permissions` CLI flag default changes from `"broad"` to `"none"`. No `permission` or `tools` keys are written to `opencode.json` unless the user explicitly opts in.
- **Context:** `"broad"` silently writes 14 global tool permissions. `"from-commands"` has a semantic inversion bug (unions per-command restrictions into global allows). Both are destructive to user config. `applyPermissions()` already short-circuits on `"none"` (line 299: `if (mode === "none") return`), so no changes to that function are needed.
- **Alternatives rejected:** Fix `from-commands` flattening — impossible to do correctly with global-only target. Remove flag entirely — too restrictive for power users.
- **Assumptions:** The `applyPermissions()` function with mode `"none"` leaves `config.permission` and `config.tools` as `undefined`.
- **Reversal trigger:** If OpenCode adds per-command permission scoping, `from-commands` could become meaningful again.

---

## ADRs To Create

Create `docs/decisions/` directory (does not exist on `main`). ADRs follow `AGENTS.md` numbering convention: `0001-short-title.md`.

### ADR 0001: OpenCode commands written as `.md` files, not in `opencode.json`

- **Context:** OpenCode supports two equivalent formats for custom commands. Writing to `opencode.json` requires overwriting or merging the user's config file. Writing `.md` files is additive and non-destructive.
- **Decision:** The OpenCode target always emits commands as individual `.md` files in the `commands/` subdirectory. The `command` key is never written to `opencode.json` by this tool.
- **Consequences:**
  - Positive: Installs are non-destructive. Commands are visible as individual files, easy to inspect. Consistent with agents/skills handling.
  - Negative: Users inspecting `opencode.json` won't see plugin commands; they must look in `commands/`.
  - Neutral: Requires OpenCode >= the version with command file support (confirmed stable).

### ADR 0002: Plugin merges into existing `opencode.json` rather than replacing it

- **Context:** Users have existing `opencode.json` files with personal configuration. The install command previously backed up and replaced this file entirely, destroying user settings.
- **Decision:** `writeOpenCodeBundle` reads existing `opencode.json` (if present), deep-merges plugin-provided keys without overwriting user-set values, and writes the merged result. User keys always win on conflict.
- **Consequences:**
  - Positive: User config preserved across installs. Re-installs are idempotent for user-set values.
  - Negative: Plugin cannot remove or update an MCP server entry if the user already has one with the same name.
  - Neutral: Backup of pre-merge file is still created for safety.

### ADR 0003: Global permissions not written to `opencode.json` by default

- **Context:** Claude commands carry `allowedTools` as per-command restrictions. OpenCode has no per-command permission mechanism. Writing per-command restrictions as global permissions is semantically incorrect and pollutes the user's global config.
- **Decision:** `--permissions` defaults to `"none"`. The plugin never writes `permission` or `tools` to `opencode.json` unless the user explicitly passes `--permissions broad` or `--permissions from-commands`.
- **Consequences:**
  - Positive: User's global OpenCode permissions are never silently modified.
  - Negative: Users who relied on auto-set permissions must now pass the flag explicitly.
  - Neutral: The `"broad"` and `"from-commands"` modes still work as documented for opt-in use.

---

## Assumptions & Invalidation Triggers

- **Assumption:** OpenCode command `.md` frontmatter supports `description`, `agent`, `model` and does NOT support `permission` or `tools`.
  - **If this changes:** The converter could emit per-command permissions in command frontmatter, making `from-commands` mode semantically correct. Phase 2 would need a new code path.

- **Assumption:** `readJson()` and `pathExists()` exist in `src/utils/files.ts` and work as expected.
  - **If this changes:** Phase 4's merge logic needs alternative I/O utilities.

- **Assumption:** `applyPermissions()` with mode `"none"` returns early at line 299 and does not set `config.permission` or `config.tools`.
  - **If this changes:** The merge logic in Phase 4 might still merge stale data. Verify before implementing.

- **Assumption:** 180 tests pass on `main` at commit `174cd4c` with `bun test`.
  - **If this changes:** Do not proceed until the discrepancy is understood.

- **Assumption:** `formatFrontmatter()` in `src/utils/frontmatter.ts` handles `Record<string, unknown>` data and string body, producing valid YAML frontmatter. It filters out `undefined` values (line 35). It already supports nested objects/arrays via `formatYamlLine()`.
  - **If this changes:** Phase 2's command file content generation would produce malformed output.

- **Assumption:** The `backupFile()` function in `src/utils/files.ts` returns `null` if the file does not exist, and returns the backup path if it does. It does NOT throw on missing files.
  - **If this changes:** Phase 4's backup-before-write for command files would need error handling.

---

## Phases

### Phase 1: Add `OpenCodeCommandFile` type and update `OpenCodeBundle`

**What:** In `src/types/opencode.ts`:
- Add a new type `OpenCodeCommandFile` with `name: string` (command name, used as filename stem) and `content: string` (full file content: YAML frontmatter + body).
- Add `commandFiles: OpenCodeCommandFile[]` field to `OpenCodeBundle`.
- Remove `command?: Record<string, OpenCodeCommandConfig>` from `OpenCodeConfig`.
- Remove the `OpenCodeCommandConfig` type entirely (lines 23-28).

**Why:** This is the foundational type change that all subsequent phases depend on. Commands move from the config object to individual file entries in the bundle.

**Test first:**

File: `tests/converter.test.ts`

Before making any type changes, update the test file to reflect the new shape. The existing tests will fail because they reference `bundle.config.command` and `OpenCodeBundle` doesn't have `commandFiles` yet.

Tests to modify (they will fail after type changes, then pass after Phase 2):
- `"maps commands, permissions, and agents"` (line 11): Change `bundle.config.command?.["workflows:review"]` to `bundle.commandFiles.find(f => f.name === "workflows:review")`. Change `bundle.config.command?.["plan_review"]` to `bundle.commandFiles.find(f => f.name === "plan_review")`.
- `"normalizes models and infers temperature"` (line 60): Change `bundle.config.command?.["workflows:work"]` to check `bundle.commandFiles.find(f => f.name === "workflows:work")` and parse its frontmatter for model.
- `"excludes commands with disable-model-invocation from command map"` (line 202): Change `bundle.config.command?.["deploy-docs"]` to `bundle.commandFiles.find(f => f.name === "deploy-docs")`.
- `"rewrites .claude/ paths to .opencode/ in command bodies"` (line 217): Change `bundle.config.command?.["review"]?.template` to access `bundle.commandFiles.find(f => f.name === "review")?.content`.

Also update `tests/opencode-writer.test.ts`:
- Add `commandFiles: []` to every `OpenCodeBundle` literal in all 4 existing tests (lines 20, 43, 67, 98). These bundles currently only have `config`, `agents`, `plugins`, `skillDirs`.

**Implementation:**

In `src/types/opencode.ts`:
1. Remove lines 23-28 (`OpenCodeCommandConfig` type).
2. Remove line 10 (`command?: Record<string, OpenCodeCommandConfig>`) from `OpenCodeConfig`.
3. Add after line 47:
```typescript
export type OpenCodeCommandFile = {
  name: string    // command name, used as the filename stem: <name>.md
  content: string // full file content: YAML frontmatter + body
}
```
4. Add `commandFiles: OpenCodeCommandFile[]` to `OpenCodeBundle` (between `agents` and `plugins`).

In `src/converters/claude-to-opencode.ts`:
- Update the import on line 11: Remove `OpenCodeCommandConfig` from the import. Add `OpenCodeCommandFile`.

**Code comments required:**
- Above the `commandFiles` field in `OpenCodeBundle`: `// Commands are written as individual .md files, not in opencode.json. See ADR-001.`

**Verification:** `bun test` will show failures in converter tests (they reference the old command format). This is expected — Phase 2 fixes them.

---

### Phase 2: Convert `convertCommands()` to emit `.md` command files

**What:** In `src/converters/claude-to-opencode.ts`:
- Rewrite `convertCommands()` (line 114) to return `OpenCodeCommandFile[]` instead of `Record<string, OpenCodeCommandConfig>`.
- Each command becomes a `.md` file with YAML frontmatter (`description`, optionally `model`) and body (the template text with Claude path rewriting applied).
- In `convertClaudeToOpenCode()` (line 64): replace `commandMap` with `commandFiles`. Remove `config.command` assignment. Add `commandFiles` to returned bundle.

**Why:** This is the core conversion logic change that implements ADR-001.

**Test first:**

File: `tests/converter.test.ts`

The tests were already updated in Phase 1 to reference `bundle.commandFiles`. Now they need to pass. Specific assertions:

1. Rename `"maps commands, permissions, and agents"` to `"from-commands mode: maps allowedTools to global permission block"` — to clarify this tests an opt-in mode, not the default.
   - Assert `bundle.config.command` is `undefined` (it no longer exists on the type, but accessing it returns `undefined`).
   - Assert `bundle.commandFiles.find(f => f.name === "workflows:review")` is defined.
   - Assert `bundle.commandFiles.find(f => f.name === "plan_review")` is defined.
   - Permission assertions remain unchanged (they test `from-commands` mode explicitly).

2. `"normalizes models and infers temperature"`:
   - Find `workflows:work` in `bundle.commandFiles`, parse its frontmatter with `parseFrontmatter()`, assert `data.model === "openai/gpt-4o"`.

3. `"excludes commands with disable-model-invocation from command map"` — rename to `"excludes commands with disable-model-invocation from commandFiles"`:
   - Assert `bundle.commandFiles.find(f => f.name === "deploy-docs")` is `undefined`.
   - Assert `bundle.commandFiles.find(f => f.name === "workflows:review")` is defined.

4. `"rewrites .claude/ paths to .opencode/ in command bodies"`:
   - Find `review` in `bundle.commandFiles`, assert `content` contains `"compound-engineering.local.md"`.

5. Add NEW test: `"command .md files include description in frontmatter"`:
   - Create a minimal `ClaudePlugin` with one command (`name: "test-cmd"`, `description: "Test description"`, `body: "Do the thing"`).
   - Convert with `permissions: "none"`.
   - Find the command file, parse frontmatter, assert `data.description === "Test description"`.
   - Assert the body (after frontmatter) contains `"Do the thing"`.

**Implementation:**

In `src/converters/claude-to-opencode.ts`:

Replace lines 114-128 (`convertCommands` function):
```typescript
// Commands are written as individual .md files rather than entries in opencode.json.
// Chosen over JSON map because opencode resolves commands by filename at runtime (ADR-001).
function convertCommands(commands: ClaudeCommand[]): OpenCodeCommandFile[] {
  const files: OpenCodeCommandFile[] = []
  for (const command of commands) {
    if (command.disableModelInvocation) continue
    const frontmatter: Record<string, unknown> = {
      description: command.description,
    }
    if (command.model && command.model !== "inherit") {
      frontmatter.model = normalizeModel(command.model)
    }
    const content = formatFrontmatter(frontmatter, rewriteClaudePaths(command.body))
    files.push({ name: command.name, content })
  }
  return files
}
```

Replace lines 64-87 (`convertClaudeToOpenCode` function body):
- Change line 69: `const commandFiles = convertCommands(plugin.commands)`
- Change lines 73-77 (config construction): Remove the `command: ...` line. Config should only have `$schema` and `mcp`.
- Change line 81-86 (return): Replace `plugins` in the return with `commandFiles, plugins` (add `commandFiles` field to returned bundle).

**Code comments required:**
- Above `convertCommands()`: `// Commands are written as individual .md files rather than entries in opencode.json.` and `// Chosen over JSON map because opencode resolves commands by filename at runtime (ADR-001).`

**Verification:** Run `bun test tests/converter.test.ts`. All converter tests must pass. Then run `bun test` — writer tests should still fail (they expect the old bundle shape; fixed in Phase 1's test updates) but converter tests pass.

---

### Phase 3: Add `commandsDir` to path resolver and write command files

**What:** In `src/targets/opencode.ts`:
- Add `commandsDir` to the return value of `resolveOpenCodePaths()` for both branches (global and custom output dir).
- In `writeOpenCodeBundle()`, iterate `bundle.commandFiles` and write each as `<commandsDir>/<name>.md` with backup-before-overwrite.

**Why:** This creates the file output mechanism for command `.md` files. Separated from Phase 4 (merge logic) for testability.

**Test first:**

File: `tests/opencode-writer.test.ts`

Add these new tests:

1. `"writes command files as .md in commands/ directory"`:
   - Create a bundle with one `commandFiles` entry: `{ name: "my-cmd", content: "---\ndescription: Test\n---\n\nDo something." }`.
   - Use an output root of `path.join(tempRoot, ".config", "opencode")` (global-style).
   - Assert `exists(path.join(outputRoot, "commands", "my-cmd.md"))` is true.
   - Read the file, assert content matches (with trailing newline: `content + "\n"`).

2. `"backs up existing command .md file before overwriting"`:
   - Pre-create `commands/my-cmd.md` with old content.
   - Write a bundle with a `commandFiles` entry for `my-cmd`.
   - Assert a `.bak.` file exists in `commands/` directory.
   - Assert new content is written.

**Implementation:**

In `resolveOpenCodePaths()`:
- In the global branch (line 39-46): Add `commandsDir: path.join(outputRoot, "commands")` with comment: `// .md command files; alternative to the command key in opencode.json`
- In the custom branch (line 49-56): Add `commandsDir: path.join(outputRoot, ".opencode", "commands")` with same comment.

In `writeOpenCodeBundle()`:
- After the agents loop (line 18), add:
```typescript
const commandsDir = paths.commandsDir
for (const commandFile of bundle.commandFiles) {
  const dest = path.join(commandsDir, `${commandFile.name}.md`)
  const cmdBackupPath = await backupFile(dest)
  if (cmdBackupPath) {
    console.log(`Backed up existing command file to ${cmdBackupPath}`)
  }
  await writeText(dest, commandFile.content + "\n")
}
```

**Code comments required:**
- Inline comment on `commandsDir` in both `resolveOpenCodePaths` branches: `// .md command files; alternative to the command key in opencode.json`

**Verification:** Run `bun test tests/opencode-writer.test.ts`. The two new command file tests must pass. Existing tests must still pass (they have `commandFiles: []` from Phase 1 updates).

---

### Phase 4: Replace config overwrite with deep-merge

**What:** In `src/targets/opencode.ts`:
- Replace `writeJson(paths.configPath, bundle.config)` (line 13) with a call to a new `mergeOpenCodeConfig()` function.
- `mergeOpenCodeConfig()` reads the existing `opencode.json` (if present), merges plugin-provided keys using user-wins-on-conflict strategy, and returns the merged config.
- Import `pathExists` and `readJson` from `../utils/files` (add to existing import on line 2).

**Why:** This implements ADR-002 — the user's existing config is preserved across installs.

**Test first:**

File: `tests/opencode-writer.test.ts`

Modify existing test and add new tests:

1. Rename `"backs up existing opencode.json before overwriting"` (line 88) to `"merges plugin config into existing opencode.json without destroying user keys"`:
   - Pre-create `opencode.json` with `{ $schema: "https://opencode.ai/config.json", custom: "value" }`.
   - Write a bundle with `config: { $schema: "...", mcp: { "plugin-server": { type: "local", command: "uvx", args: ["plugin-srv"] } } }`.
   - Assert merged config has BOTH `custom: "value"` (user key) AND `mcp["plugin-server"]` (plugin key).
   - Assert backup file exists with original content.

2. NEW: `"merges mcp servers without overwriting user entries"`:
   - Pre-create `opencode.json` with `{ mcp: { "user-server": { type: "local", command: "uvx", args: ["user-srv"] } } }`.
   - Write a bundle with `config.mcp` containing both `"plugin-server"` (new) and `"user-server"` (conflict — different args).
   - Assert both servers exist in merged output.
   - Assert `user-server` keeps user's original args (user wins on conflict).
   - Assert `plugin-server` is present with plugin's args.

3. NEW: `"preserves unrelated user keys when merging opencode.json"`:
   - Pre-create `opencode.json` with `{ model: "my-model", theme: "dark", mcp: {} }`.
   - Write a bundle with `config: { $schema: "...", mcp: { "plugin-server": ... }, permission: { "bash": "allow" } }`.
   - Assert `model` and `theme` are preserved.
   - Assert plugin additions are present.

**Implementation:**

Add to imports in `src/targets/opencode.ts` line 2:
```typescript
import { backupFile, copyDir, ensureDir, pathExists, readJson, writeJson, writeText } from "../utils/files"
import type { OpenCodeBundle, OpenCodeConfig } from "../types/opencode"
```

Add `mergeOpenCodeConfig()` function:
```typescript
async function mergeOpenCodeConfig(
  configPath: string,
  incoming: OpenCodeConfig,
): Promise<OpenCodeConfig> {
  // If no existing config, write plugin config as-is
  if (!(await pathExists(configPath))) return incoming

  let existing: OpenCodeConfig
  try {
    existing = await readJson<OpenCodeConfig>(configPath)
  } catch {
    // Safety first per AGENTS.md -- do not destroy user data even if their config is malformed.
    // Warn and fall back to plugin-only config rather than crashing.
    console.warn(
      `Warning: existing ${configPath} is not valid JSON. Writing plugin config without merging.`
    )
    return incoming
  }

  // User config wins on conflict -- see ADR-002
  // MCP servers: add plugin entries, skip keys already in user config.
  const mergedMcp = {
    ...(incoming.mcp ?? {}),
    ...(existing.mcp ?? {}), // existing takes precedence (overwrites same-named plugin entries)
  }

  // Permission: add plugin entries, skip keys already in user config.
  const mergedPermission = incoming.permission
    ? {
        ...(incoming.permission),
        ...(existing.permission ?? {}), // existing takes precedence
      }
    : existing.permission

  // Tools: same pattern
  const mergedTools = incoming.tools
    ? {
        ...(incoming.tools),
        ...(existing.tools ?? {}),
      }
    : existing.tools

  return {
    ...existing,                    // all user keys preserved
    $schema: incoming.$schema ?? existing.$schema,
    mcp: Object.keys(mergedMcp).length > 0 ? mergedMcp : undefined,
    permission: mergedPermission,
    tools: mergedTools,
  }
}
```

In `writeOpenCodeBundle()`, replace line 13 (`await writeJson(paths.configPath, bundle.config)`) with:
```typescript
const merged = await mergeOpenCodeConfig(paths.configPath, bundle.config)
await writeJson(paths.configPath, merged)
```

**Code comments required:**
- Above `mergeOpenCodeConfig()`: `// Merges plugin config into existing opencode.json. User keys win on conflict. See ADR-002.`
- On the `...(existing.mcp ?? {})` line: `// existing takes precedence (overwrites same-named plugin entries)`
- On malformed JSON catch: `// Safety first per AGENTS.md -- do not destroy user data even if their config is malformed.`

**Verification:** Run `bun test tests/opencode-writer.test.ts`. All tests must pass including the renamed test and the 2 new merge tests.

---

### Phase 5: Change `--permissions` default to `"none"`

**What:** In `src/commands/install.ts`, change line 51 `default: "broad"` to `default: "none"`. Update the description string.

**Why:** This implements ADR-003 — stops polluting user's global config with permissions by default.

**Test first:**

File: `tests/cli.test.ts`

Add these tests:

1. `"install --to opencode uses permissions:none by default"`:
   - Run install with no `--permissions` flag against the fixture plugin.
   - Read the written `opencode.json`.
   - Assert it does NOT contain a `permission` key.
   - Assert it does NOT contain a `tools` key.

2. `"install --to opencode --permissions broad writes permission block"`:
   - Run install with `--permissions broad` against the fixture plugin.
   - Read the written `opencode.json`.
   - Assert it DOES contain a `permission` key with values.

**Implementation:**

In `src/commands/install.ts`:
- Line 51: Change `default: "broad"` to `default: "none"`.
- Line 52: Change description to `"Permission mapping written to opencode.json: none (default) | broad | from-commands"`.

**Code comments required:**
- On the `default: "none"` line: `// Default is "none" -- writing global permissions to opencode.json pollutes user config. See ADR-003.`

**Verification:** Run `bun test tests/cli.test.ts`. All CLI tests must pass including the 2 new permission tests. Then run `bun test` — all tests (180 original + new ones) must pass.

---

### Phase 6: Update `AGENTS.md` and `README.md`

**What:** Update documentation to reflect all three changes.

**Why:** Keeps docs accurate for future contributors and users.

**Test first:** No tests required for documentation changes.

**Implementation:**

In `AGENTS.md` line 10, replace:
```
- **Output Paths:** Keep OpenCode output at `opencode.json` and `.opencode/{agents,skills,plugins}`.
```
with:
```
- **Output Paths:** Keep OpenCode output at `opencode.json` and `.opencode/{agents,skills,plugins}`. For OpenCode, commands go to `~/.config/opencode/commands/<name>.md`; `opencode.json` is deep-merged (never overwritten wholesale).
```

In `README.md` line 54, replace:
```
OpenCode output is written to `~/.config/opencode` by default, with `opencode.json` at the root and `agents/`, `skills/`, and `plugins/` alongside it.
```
with:
```
OpenCode output is written to `~/.config/opencode` by default. Commands are written as individual `.md` files to `~/.config/opencode/commands/<name>.md`. Agents, skills, and plugins are written to the corresponding subdirectories alongside. `opencode.json` (MCP servers) is deep-merged into any existing file -- user keys such as `model`, `theme`, and `provider` are preserved, and user values win on conflicts. Command files are backed up before being overwritten.
```

Also update `AGENTS.md` to add a Repository Docs Conventions section if not present:
```
## Repository Docs Conventions

- **ADRs** live in `docs/decisions/` and are numbered with 4-digit zero-padding: `0001-short-title.md`, `0002-short-title.md`, etc.
- **Orchestrator run reports** live in `docs/reports/`.

When recording a significant decision (new provider, output format change, merge strategy), create an ADR in `docs/decisions/` following the numbering sequence.
```

**Code comments required:** None.

**Verification:** Read the updated files and confirm accuracy. Run `bun test` to confirm no regressions.

---

## TDD Enforcement

The executing agent MUST follow this sequence for every phase that touches source code:

1. Write the test(s) first in the test file.
2. Run `bun test <test-file>` and confirm the new/modified tests FAIL (red).
3. Implement the code change.
4. Run `bun test <test-file>` and confirm the new/modified tests PASS (green).
5. Run `bun test` (all tests) and confirm no regressions.

**Exception:** Phase 6 is documentation only. Run `bun test` after to confirm no regressions but no red/green cycle needed.

**Note on Phase 1:** Type changes alone will cause test failures. Phase 1 and Phase 2 are tightly coupled — the tests updated in Phase 1 will not pass until Phase 2's implementation is complete. The executing agent should:
1. Update tests in Phase 1 (expect them to fail — both due to type errors and logic changes).
2. Implement type changes in Phase 1.
3. Implement converter changes in Phase 2.
4. Confirm all converter tests pass after Phase 2.

---

## Constraints

**Do not modify:**
- `src/converters/claude-to-opencode.ts` lines 294-417 (`applyPermissions()`, `normalizeTool()`, `parseToolSpec()`, `normalizePattern()`) — these functions are correct for `"broad"` and `"from-commands"` modes. Only the default that triggers them is changing.
- Any files under `tests/fixtures/` — these are data files, not test logic.
- `src/types/claude.ts` — no changes to source types.
- `src/parsers/claude.ts` — no changes to parser logic.
- `src/utils/files.ts` — all needed utilities already exist. Do not add new utility functions.
- `src/utils/frontmatter.ts` — already handles the needed formatting.

**Dependencies not to add:** None. No new npm/bun packages.

**Patterns to follow:**
- Existing writer tests in `tests/opencode-writer.test.ts` use `fs.mkdtemp()` for temp directories and the local `exists()` helper function.
- Existing CLI tests in `tests/cli.test.ts` use `Bun.spawn()` to invoke the CLI.
- Existing converter tests in `tests/converter.test.ts` use `loadClaudePlugin(fixtureRoot)` for real fixtures and inline `ClaudePlugin` objects for isolated tests.
- ADR format: Follow `AGENTS.md` numbering convention `0001-short-title.md` with sections: Status, Date, Context, Decision, Consequences, Plan Reference.
- Commits: Use conventional commit format. Reference ADRs in commit bodies.
- Branch: Create `feature/opencode-commands-md-merge-permissions` from `main`.

## Final Checklist

After all phases complete:
- [ ] `bun test` passes all tests (180 original + new ones, 0 fail)
- [ ] `docs/decisions/0001-opencode-command-output-format.md` exists
- [ ] `docs/decisions/0002-opencode-json-merge-strategy.md` exists
- [ ] `docs/decisions/0003-opencode-permissions-default-none.md` exists
- [ ] `opencode.json` is never fully overwritten — merge logic confirmed by test
- [ ] Commands are written as `.md` files — confirmed by test
- [ ] `--permissions` defaults to `"none"` — confirmed by CLI test
- [ ] `AGENTS.md` and `README.md` updated to reflect new behavior
