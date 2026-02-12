---
title: Add Cursor CLI as a Target Provider
type: feat
date: 2026-02-12
---

# Add Cursor CLI as a Target Provider

## Overview

Add `cursor` as a fourth target provider in the converter CLI, alongside `opencode`, `codex`, and `droid`. This enables `--to cursor` for both `convert` and `install` commands, converting Claude Code plugins into Cursor-compatible format.

Cursor CLI (`cursor-agent`) launched in August 2025 and supports rules (`.mdc`), commands (`.md`), skills (`SKILL.md` standard), and MCP servers (`.cursor/mcp.json`). The mapping from Claude Code is straightforward because Cursor adopted the open SKILL.md standard and has a similar command format.

## Component Mapping

| Claude Code | Cursor Equivalent | Notes |
|---|---|---|
| `agents/*.md` | `.cursor/rules/*.mdc` | Agents become "Agent Requested" rules (`alwaysApply: false`, `description` set) so the AI activates them on demand rather than flooding context |
| `commands/*.md` | `.cursor/commands/*.md` | Plain markdown files; Cursor commands have no frontmatter support -- description becomes a markdown heading |
| `skills/*/SKILL.md` | `.cursor/skills/*/SKILL.md` | **Identical standard** -- copy directly |
| MCP servers | `.cursor/mcp.json` | Same JSON structure (`mcpServers` key), compatible format |
| `hooks/` | No equivalent | Cursor has no hook system; emit `console.warn` and skip |
| `.claude/` paths | `.cursor/` paths | Content rewriting needed |

### Key Design Decisions

**1. Agents use `alwaysApply: false` (Agent Requested mode)**

With 29 agents, setting `alwaysApply: true` would flood every Cursor session's context. Instead, agents become "Agent Requested" rules: `alwaysApply: false` with a populated `description` field. Cursor's AI reads the description and activates the rule only when relevant -- matching how Claude Code agents are invoked on demand.

**2. Commands are plain markdown (no frontmatter)**

Cursor commands (`.cursor/commands/*.md`) are simple markdown files where the filename becomes the command name. Unlike Claude Code commands, they do not support YAML frontmatter. The converter emits the description as a leading markdown comment, then the command body.

**3. Flattened command names with deduplication**

Cursor uses flat command names (no namespaces). `workflows:plan` becomes `plan`. If two commands flatten to the same name, the `uniqueName()` pattern from the codex converter appends `-2`, `-3`, etc.

### Rules (`.mdc`) Frontmatter Format

```yaml
---
description: "What this rule does and when it applies"
globs: ""
alwaysApply: false
---
```

- `description` (string): Used by the AI to decide relevance -- maps from agent `description`
- `globs` (string): Comma-separated file patterns for auto-attachment -- leave empty for converted agents
- `alwaysApply` (boolean): Set `false` for Agent Requested mode

### MCP Servers (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "package-name"],
      "env": { "KEY": "value" }
    }
  }
}
```

Supports both local (command-based) and remote (url-based) servers. Pass through `headers` for remote servers.

## Acceptance Criteria

- [x] `bun run src/index.ts convert --to cursor ./plugins/compound-engineering` produces valid Cursor config
- [x] Agents convert to `.cursor/rules/*.mdc` with `alwaysApply: false` and populated `description`
- [x] Commands convert to `.cursor/commands/*.md` as plain markdown (no frontmatter)
- [x] Flattened command names that collide are deduplicated (`plan`, `plan-2`, etc.)
- [x] Skills copied to `.cursor/skills/` (identical format)
- [x] MCP servers written to `.cursor/mcp.json` with backup of existing file
- [x] Content transformation rewrites `.claude/` and `~/.claude/` paths to `.cursor/` and `~/.cursor/`
- [x] `/workflows:plan` transformed to `/plan` (flat command names)
- [x] `Task agent-name(args)` transformed to natural-language skill reference
- [x] Plugins with hooks emit `console.warn` about unsupported hooks
- [x] Writer does not double-nest `.cursor/.cursor/` (follows droid writer pattern)
- [x] `model` and `allowedTools` fields silently dropped (no Cursor equivalent)
- [x] Converter and writer tests pass
- [x] Existing tests still pass (`bun test`)

## Implementation

### Phase 1: Types

**Create `src/types/cursor.ts`**

```typescript
export type CursorRule = {
  name: string
  content: string  // Full .mdc file with YAML frontmatter
}

export type CursorCommand = {
  name: string
  content: string  // Plain markdown (no frontmatter)
}

export type CursorSkillDir = {
  name: string
  sourceDir: string
}

export type CursorBundle = {
  rules: CursorRule[]
  commands: CursorCommand[]
  skillDirs: CursorSkillDir[]
  mcpServers?: Record<string, {
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    headers?: Record<string, string>
  }>
}
```

### Phase 2: Converter

**Create `src/converters/claude-to-cursor.ts`**

Core functions:

1. **`convertClaudeToCursor(plugin, options)`** -- main entry point
   - Convert each agent to a `.mdc` rule via `convertAgentToRule()`
   - Convert each command (including `disable-model-invocation` ones) via `convertCommand()`
   - Pass skills through as directory references
   - Convert MCP servers to JSON-compatible object
   - Emit `console.warn` if `plugin.hooks` has entries

2. **`convertAgentToRule(agent, usedNames)`** -- agent -> `.mdc` rule
   - Frontmatter fields: `description` (from agent description), `globs: ""`, `alwaysApply: false`
   - Body: agent body with content transformations applied
   - Prepend capabilities section if present
   - Deduplicate names via `uniqueName()`
   - Silently drop `model` field (no Cursor equivalent)

3. **`convertCommand(command, usedNames)`** -- command -> plain `.md`
   - Flatten namespace: `workflows:plan` -> `plan`
   - Deduplicate flattened names via `uniqueName()`
   - Emit as plain markdown: description as `<!-- description -->` comment, then body
   - Include `argument-hint` as a `## Arguments` section if present
   - Body: apply `transformContentForCursor()` transformations
   - Silently drop `allowedTools` (no Cursor equivalent)

4. **`transformContentForCursor(body)`** -- content rewriting
   - `.claude/` -> `.cursor/` and `~/.claude/` -> `~/.cursor/`
   - `Task agent-name(args)` -> `Use the agent-name skill to: args` (same as codex)
   - `/workflows:command` -> `/command` (flatten slash commands)
   - `@agent-name` references -> `the agent-name rule` (use codex's suffix-matching pattern)
   - Skip file paths (containing `/`) and common non-command patterns

5. **`convertMcpServers(servers)`** -- MCP config
   - Map each `ClaudeMcpServer` entry to Cursor-compatible JSON
   - Pass through: `command`, `args`, `env`, `url`, `headers`
   - Drop `type` field (Cursor infers transport from `command` vs `url`)

### Phase 3: Writer

**Create `src/targets/cursor.ts`**

Output structure:

```
.cursor/
├── rules/
│   ├── agent-name-1.mdc
│   └── agent-name-2.mdc
├── commands/
│   ├── command-1.md
│   └── command-2.md
├── skills/
│   └── skill-name/
│       └── SKILL.md
└── mcp.json
```

Core function: `writeCursorBundle(outputRoot, bundle)`

- `resolveCursorPaths(outputRoot)` -- detect if path already ends in `.cursor` to avoid double-nesting (follow droid writer pattern at `src/targets/droid.ts:31-50`)
- Write rules to `rules/` as `.mdc` files
- Write commands to `commands/` as `.md` files
- Copy skill directories to `skills/` via `copyDir()`
- Write `mcp.json` via `writeJson()` with `backupFile()` for existing files

### Phase 4: Wire into CLI

**Modify `src/targets/index.ts`**

```typescript
import { convertClaudeToCursor } from "../converters/claude-to-cursor"
import { writeCursorBundle } from "./cursor"
import type { CursorBundle } from "../types/cursor"

// Add to targets:
cursor: {
  name: "cursor",
  implemented: true,
  convert: convertClaudeToCursor as TargetHandler<CursorBundle>["convert"],
  write: writeCursorBundle as TargetHandler<CursorBundle>["write"],
},
```

**Modify `src/commands/convert.ts`**

- Update `--to` description: `"Target format (opencode | codex | droid | cursor)"`
- Add to `resolveTargetOutputRoot`: `if (targetName === "cursor") return path.join(outputRoot, ".cursor")`

**Modify `src/commands/install.ts`**

- Same two changes as convert.ts

### Phase 5: Tests

**Create `tests/cursor-converter.test.ts`**

Test cases (use inline `ClaudePlugin` fixtures, following codex converter test pattern):

- Agent converts to rule with `.mdc` frontmatter (`alwaysApply: false`, `description` populated)
- Agent with empty description gets default description text
- Agent with capabilities prepended to body
- Agent `model` field silently dropped
- Agent with empty body gets default body text
- Command converts with flattened name (`workflows:plan` -> `plan`)
- Command name collision after flattening is deduplicated (`plan`, `plan-2`)
- Command with `disable-model-invocation` is still included
- Command `allowedTools` silently dropped
- Command with `argument-hint` gets Arguments section
- Skills pass through as directory references
- MCP servers convert to JSON config (local and remote)
- MCP `headers` pass through for remote servers
- Content transformation: `.claude/` paths -> `.cursor/`
- Content transformation: `~/.claude/` paths -> `~/.cursor/`
- Content transformation: `Task agent(args)` -> natural language
- Content transformation: slash commands flattened
- Hooks present -> `console.warn` emitted
- Plugin with zero agents produces empty rules array
- Plugin with only skills works correctly

**Create `tests/cursor-writer.test.ts`**

Test cases (use temp directories, following droid writer test pattern):

- Full bundle writes rules, commands, skills, mcp.json
- Rules written as `.mdc` files in `rules/` directory
- Commands written as `.md` files in `commands/` directory
- Skills copied to `skills/` directory
- MCP config written as valid JSON `mcp.json`
- Existing `mcp.json` is backed up before overwrite
- Output root already ending in `.cursor` does NOT double-nest
- Empty bundle (no rules, commands, skills, or MCP) produces no output

### Phase 6: Documentation

**Create `docs/specs/cursor.md`**

Document the Cursor CLI spec as a reference, following `docs/specs/codex.md` pattern:

- Rules format (`.mdc` with `description`, `globs`, `alwaysApply` frontmatter)
- Commands format (plain markdown, no frontmatter)
- Skills format (identical SKILL.md standard)
- MCP server configuration (`.cursor/mcp.json`)
- CLI permissions (`.cursor/cli.json` -- for reference, not converted)
- Config file locations (project-level vs global)

**Update `README.md`**

Add `cursor` to the supported targets in the CLI usage section.

## What We're NOT Doing

- Not converting hooks (Cursor has no hook system -- warn and skip)
- Not generating `.cursor/cli.json` permissions (user-specific, not plugin-scoped)
- Not creating `AGENTS.md` (Cursor reads it natively, but not part of plugin conversion)
- Not using `globs` field intelligently (would require analyzing agent content to guess file patterns)
- Not adding sync support (follow-up task)
- Not transforming content inside copied SKILL.md files (known limitation -- skills may reference `.claude/` paths internally)
- Not clearing old output before writing (matches existing target behavior -- re-runs accumulate)

## Complexity Assessment

This is a **medium change**. The converter architecture is well-established with three existing targets, so this is mostly pattern-following. The key novelties are:

1. The `.mdc` frontmatter format (different from all other targets)
2. Agents map to "rules" rather than a direct equivalent
3. Commands are plain markdown (no frontmatter) unlike other targets
4. Name deduplication needed for flattened command namespaces

Skills being identical across platforms simplifies things significantly. MCP config is nearly 1:1.

## References

- Cursor Rules: `.cursor/rules/*.mdc` with `description`, `globs`, `alwaysApply` frontmatter
- Cursor Commands: `.cursor/commands/*.md` (plain markdown, no frontmatter)
- Cursor Skills: `.cursor/skills/*/SKILL.md` (open standard, identical to Claude Code)
- Cursor MCP: `.cursor/mcp.json` with `mcpServers` key
- Cursor CLI: `cursor-agent` command (launched August 2025)
- Existing codex converter: `src/converters/claude-to-codex.ts` (has `uniqueName()` deduplication pattern)
- Existing droid writer: `src/targets/droid.ts` (has double-nesting guard pattern)
- Existing codex plan: `docs/plans/2026-02-08-feat-convert-local-md-settings-for-opencode-codex-plan.md`
- Target provider checklist: `AGENTS.md` section "Adding a New Target Provider"
