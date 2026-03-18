---
title: "feat: Add GitHub Copilot converter target"
type: feat
date: 2026-02-14
status: complete
---

# feat: Add GitHub Copilot Converter Target

## Overview

Add GitHub Copilot as a converter target following the established `TargetHandler` pattern. This converts the compound-engineering Claude Code plugin into Copilot's native format: custom agents (`.agent.md`), agent skills (`SKILL.md`), and MCP server configuration JSON.

**Brainstorm:** `docs/brainstorms/2026-02-14-copilot-converter-target-brainstorm.md`

## Problem Statement

The CLI tool (`compound`) already supports converting Claude Code plugins to 5 target formats (OpenCode, Codex, Droid, Cursor, Pi). GitHub Copilot is a widely-used AI coding assistant that now supports custom agents, skills, and MCP servers — but there's no converter target for it.

## Proposed Solution

Follow the existing converter pattern exactly:

1. Define types (`src/types/copilot.ts`)
2. Implement converter (`src/converters/claude-to-copilot.ts`)
3. Implement writer (`src/targets/copilot.ts`)
4. Register target (`src/targets/index.ts`)
5. Add sync support (`src/sync/copilot.ts`, `src/commands/sync.ts`)
6. Write tests and documentation

### Component Mapping

| Claude Code | Copilot | Output Path |
|-------------|---------|-------------|
| Agents (`.md`) | Custom Agents (`.agent.md`) | `.github/agents/{name}.agent.md` |
| Commands (`.md`) | Agent Skills (`SKILL.md`) | `.github/skills/{name}/SKILL.md` |
| Skills (`SKILL.md`) | Agent Skills (`SKILL.md`) | `.github/skills/{name}/SKILL.md` |
| MCP Servers | Config JSON | `.github/copilot-mcp-config.json` |
| Hooks | Skipped | Warning to stderr |

## Technical Approach

### Phase 1: Types

**File:** `src/types/copilot.ts`

```typescript
export type CopilotAgent = {
  name: string
  content: string // Full .agent.md content with frontmatter
}

export type CopilotGeneratedSkill = {
  name: string
  content: string // SKILL.md content with frontmatter
}

export type CopilotSkillDir = {
  name: string
  sourceDir: string
}

export type CopilotMcpServer = {
  type: string
  command?: string
  args?: string[]
  url?: string
  tools: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
}

export type CopilotBundle = {
  agents: CopilotAgent[]
  generatedSkills: CopilotGeneratedSkill[]
  skillDirs: CopilotSkillDir[]
  mcpConfig?: Record<string, CopilotMcpServer>
}
```

### Phase 2: Converter

**File:** `src/converters/claude-to-copilot.ts`

**Agent conversion:**
- Frontmatter: `description` (required, fallback to `"Converted from Claude agent {name}"`), `tools: ["*"]`, `infer: true`
- Pass through `model` if present
- Fold `capabilities` into body as `## Capabilities` section (same as Cursor)
- Use `formatFrontmatter()` utility
- Warn if body exceeds 30,000 characters (`.length`)

**Command → Skill conversion:**
- Convert to SKILL.md format with frontmatter: `name`, `description`
- Flatten namespaced names: `workflows:plan` → `plan`
- Drop `allowed-tools`, `model`, `disable-model-invocation` silently
- Include `argument-hint` as `## Arguments` section in body

**Skill pass-through:**
- Map to `CopilotSkillDir` as-is (same as Cursor)

**MCP server conversion:**
- Transform env var names: `API_KEY` → `COPILOT_MCP_API_KEY`
- Skip vars already prefixed with `COPILOT_MCP_`
- Add `type: "local"` for command-based servers, `type: "sse"` for URL-based
- Set `tools: ["*"]` for all servers

**Content transformation (`transformContentForCopilot`):**

| Pattern | Input | Output |
|---------|-------|--------|
| Task calls | `Task repo-research-analyst(desc)` | `Use the repo-research-analyst skill to: desc` |
| Slash commands | `/workflows:plan` | `/plan` |
| Path rewriting | `.claude/` | `.github/` |
| Home path rewriting | `~/.claude/` | `~/.copilot/` |
| Agent references | `@security-sentinel` | `the security-sentinel agent` |

**Hooks:** Warn to stderr if present, skip.

### Phase 3: Writer

**File:** `src/targets/copilot.ts`

**Path resolution:**
- If `outputRoot` basename is `.github`, write directly into it (avoid `.github/.github/` double-nesting)
- Otherwise, nest under `.github/`

**Write operations:**
- Agents → `.github/agents/{name}.agent.md` (note: `.agent.md` extension)
- Generated skills (from commands) → `.github/skills/{name}/SKILL.md`
- Skill dirs → `.github/skills/{name}/` (copy via `copyDir`)
- MCP config → `.github/copilot-mcp-config.json` (backup existing with `backupFile`)

### Phase 4: Target Registration

**File:** `src/targets/index.ts`

Add import and register:

```typescript
import { convertClaudeToCopilot } from "../converters/claude-to-copilot"
import { writeCopilotBundle } from "./copilot"

// In targets record:
copilot: {
  name: "copilot",
  implemented: true,
  convert: convertClaudeToCopilot as TargetHandler<CopilotBundle>["convert"],
  write: writeCopilotBundle as TargetHandler<CopilotBundle>["write"],
},
```

### Phase 5: Sync Support

**File:** `src/sync/copilot.ts`

Follow the Cursor sync pattern (`src/sync/cursor.ts`):
- Symlink skills to `.github/skills/` using `forceSymlink`
- Validate skill names with `isValidSkillName`
- Convert MCP servers with `COPILOT_MCP_` prefix transformation
- Merge MCP config into existing `.github/copilot-mcp-config.json`

**File:** `src/commands/sync.ts`

- Add `"copilot"` to `validTargets` array
- Add case in `resolveOutputRoot()`: `case "copilot": return path.join(process.cwd(), ".github")`
- Add import and switch case for `syncToCopilot`
- Update meta description to include "Copilot"

### Phase 6: Tests

**File:** `tests/copilot-converter.test.ts`

Test cases (following `tests/cursor-converter.test.ts` pattern):

```
describe("convertClaudeToCopilot")
  ✓ converts agents to .agent.md with Copilot frontmatter
  ✓ agent description is required, fallback generated if missing
  ✓ agent with empty body gets default body
  ✓ agent capabilities are prepended to body
  ✓ agent model field is passed through
  ✓ agent tools defaults to ["*"]
  ✓ agent infer defaults to true
  ✓ warns when agent body exceeds 30k characters
  ✓ converts commands to skills with SKILL.md format
  ✓ flattens namespaced command names
  ✓ command name collision after flattening is deduplicated
  ✓ command allowedTools is silently dropped
  ✓ command with argument-hint gets Arguments section
  ✓ passes through skill directories
  ✓ skill and generated skill name collision is deduplicated
  ✓ converts MCP servers with COPILOT_MCP_ prefix
  ✓ MCP env vars already prefixed are not double-prefixed
  ✓ MCP servers get type field (local vs sse)
  ✓ warns when hooks are present
  ✓ no warning when hooks are absent
  ✓ plugin with zero agents produces empty agents array
  ✓ plugin with only skills works

describe("transformContentForCopilot")
  ✓ rewrites .claude/ paths to .github/
  ✓ rewrites ~/.claude/ paths to ~/.copilot/
  ✓ transforms Task agent calls to skill references
  ✓ flattens slash commands
  ✓ transforms @agent references to agent references
```

**File:** `tests/copilot-writer.test.ts`

Test cases (following `tests/cursor-writer.test.ts` pattern):

```
describe("writeCopilotBundle")
  ✓ writes agents, generated skills, copied skills, and MCP config
  ✓ agents use .agent.md file extension
  ✓ writes directly into .github output root without double-nesting
  ✓ handles empty bundles gracefully
  ✓ writes multiple agents as separate .agent.md files
  ✓ backs up existing copilot-mcp-config.json before overwriting
  ✓ creates skill directories with SKILL.md
```

**File:** `tests/sync-copilot.test.ts`

Test cases (following `tests/sync-cursor.test.ts` pattern):

```
describe("syncToCopilot")
  ✓ symlinks skills to .github/skills/
  ✓ skips skills with invalid names
  ✓ merges MCP config with existing file
  ✓ transforms MCP env var names to COPILOT_MCP_ prefix
  ✓ writes MCP config with restricted permissions (0o600)
```

### Phase 7: Documentation

**File:** `docs/specs/copilot.md`

Follow `docs/specs/cursor.md` format:
- Last verified date
- Primary sources (GitHub Docs URLs)
- Config locations table
- Agents section (`.agent.md` format, frontmatter fields)
- Skills section (`SKILL.md` format)
- MCP section (config structure, env var prefix requirement)
- Character limits (30k agent body)

**File:** `README.md`

- Add "copilot" to the list of supported targets
- Add usage example: `compound convert --to copilot ./plugins/compound-engineering`
- Add sync example: `compound sync copilot`

## Acceptance Criteria

### Converter
- [x] Agents convert to `.agent.md` with `description`, `tools: ["*"]`, `infer: true`
- [x] Agent `model` passes through when present
- [x] Agent `capabilities` fold into body as `## Capabilities`
- [x] Missing description generates fallback
- [x] Empty body generates fallback
- [x] Body exceeding 30k chars triggers stderr warning
- [x] Commands convert to SKILL.md format
- [x] Command names flatten (`workflows:plan` → `plan`)
- [x] Name collisions deduplicated with `-2`, `-3` suffix
- [x] Command `allowed-tools` dropped silently
- [x] Skills pass through as `CopilotSkillDir`
- [x] MCP env vars prefixed with `COPILOT_MCP_`
- [x] Already-prefixed env vars not double-prefixed
- [x] MCP servers get `type` field (`local` or `sse`)
- [x] Hooks trigger warning, skip conversion
- [x] Content transformation: Task calls, slash commands, paths, @agent refs

### Writer
- [x] Agents written to `.github/agents/{name}.agent.md`
- [x] Generated skills written to `.github/skills/{name}/SKILL.md`
- [x] Skill dirs copied to `.github/skills/{name}/`
- [x] MCP config written to `.github/copilot-mcp-config.json`
- [x] Existing MCP config backed up before overwrite
- [x] No double-nesting when outputRoot is `.github`
- [x] Empty bundles handled gracefully

### CLI Integration
- [x] `compound convert --to copilot` works
- [x] `compound sync copilot` works
- [x] Copilot registered in `src/targets/index.ts`
- [x] Sync resolves output to `.github/` in current directory

### Tests
- [x] `tests/copilot-converter.test.ts` — all converter tests pass
- [x] `tests/copilot-writer.test.ts` — all writer tests pass
- [x] `tests/sync-copilot.test.ts` — all sync tests pass

### Documentation
- [x] `docs/specs/copilot.md` — format specification
- [x] `README.md` — updated with copilot target

## Files to Create

| File | Purpose |
|------|---------|
| `src/types/copilot.ts` | Type definitions |
| `src/converters/claude-to-copilot.ts` | Converter logic |
| `src/targets/copilot.ts` | Writer logic |
| `src/sync/copilot.ts` | Sync handler |
| `tests/copilot-converter.test.ts` | Converter tests |
| `tests/copilot-writer.test.ts` | Writer tests |
| `tests/sync-copilot.test.ts` | Sync tests |
| `docs/specs/copilot.md` | Format specification |

## Files to Modify

| File | Change |
|------|--------|
| `src/targets/index.ts` | Register copilot target |
| `src/commands/sync.ts` | Add copilot to valid targets, output root, switch case |
| `README.md` | Add copilot to supported targets |

## References

- [Custom agents configuration - GitHub Docs](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [About Agent Skills - GitHub Docs](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
- [MCP and coding agent - GitHub Docs](https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent)
- Existing converter: `src/converters/claude-to-cursor.ts`
- Existing writer: `src/targets/cursor.ts`
- Existing sync: `src/sync/cursor.ts`
- Existing tests: `tests/cursor-converter.test.ts`, `tests/cursor-writer.test.ts`
