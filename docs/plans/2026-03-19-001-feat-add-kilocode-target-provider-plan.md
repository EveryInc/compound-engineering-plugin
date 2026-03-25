---
title: Add KiloCode Target Provider
created: 2026-03-19
status: complete
scope: converter-cli
---

# Add KiloCode Target Provider

## Summary

Add a `kilocode` target provider to the compound-engineering-plugin converter CLI, enabling automatic conversion and installation of the compound-engineering plugin for KiloCode CLI users.

## Manual Installation Instructions (Interim Solution)

Until the converter is implemented, users can manually install the compound-engineering skills and agents into KiloCode.

### Skills Installation

**Option 1: Copy skills to project-level (recommended for team consistency)**

```bash
# Clone the repository
git clone https://github.com/EveryInc/compound-engineering-plugin.git
cd compound-engineering-plugin

# Copy skills to your project
cp -r plugins/compound-engineering/skills/* /path/to/your/project/.kilocode/skills/
```

**Option 2: Copy skills to global location**

```bash
# Copy skills globally
cp -r plugins/compound-engineering/skills/* ~/.kilocode/skills/
```

### MCP Server Configuration

KiloCode uses `kilo.json` for MCP configuration. Create or edit `~/.config/kilo/kilo.json` (global) or `./kilo.json` (project):

```json
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "enabled": true
    }
  }
}
```

### Custom Subagents (Optional)

To use compound-engineering agents as KiloCode subagents:

1. Copy agent files from `plugins/compound-engineering/agents/` to `~/.config/kilo/agents/` (global) or `.kilo/agents/` (project)
2. Convert the YAML frontmatter format:
   - Claude Code: `description:`, `model:`, `tools:`
   - KiloCode: `description:`, `mode: subagent`, `model:`, `permission:`

Example KiloCode agent file (`.kilo/agents/rails-reviewer.md`):

```yaml
---
description: Expert Ruby on Rails code reviewer
mode: subagent
model: anthropic/claude-sonnet-4-20250514
permission:
  edit: deny
  bash: deny
---

[Agent instructions from the original Claude agent body]
```

### AGENTS.md Support

KiloCode supports the AGENTS.md open standard. Copy the repository's AGENTS.md to your project root:

```bash
cp compound-engineering-plugin/AGENTS.md /path/to/your/project/AGENTS.md
```

### Available Skills (46 total)

| Category | Skills |
|----------|--------|
| **Core Workflows** | `ce-brainstorm`, `ce-plan`, `ce-work`, `ce-review`, `ce-compound`, `ce-ideate` |
| **Planning** | `deepen-plan`, `ce-plan-beta`, `deepen-plan-beta` |
| **Code Review** | `triage`, `proof`, `document-review` |
| **Testing** | `test-browser`, `test-xcode`, `reproduce-bug`, `report-bug` |
| **Git/Worktrees** | `git-worktree`, `resolve_parallel`, `resolve-pr-parallel`, `resolve-todo-parallel` |
| **Frontend/Design** | `frontend-design`, `every-style-editor`, `feature-video`, `gemini-imagegen` |
| **Ruby/Rails** | `dhh-rails-style`, `andrew-kane-gem-writer`, `dspy-ruby` |
| **Documentation** | `compound-docs`, `deploy-docs`, `changelog`, `agent-native-audit`, `agent-native-architecture` |
| **Utilities** | `setup`, `heal-skill`, `create-agent-skill`, `create-agent-skills`, `claude-permissions-optimizer`, `rclone`, `agent-browser` |
| **Quick Start** | `lfg`, `slfg`, `generate_command`, `file-todos`, `orchestrating-swarms`, `ce-compound-refresh` |

---

## Implementation Plan

Follow the 6-phase pattern from `docs/solutions/adding-converter-target-providers.md`.

### Phase 1: Type Definitions

**File:** `src/types/kilocode.ts`

```typescript
export type KiloCodePermission = "allow" | "ask" | "deny"

export type KiloCodeSkillDir = {
  name: string
  sourceDir: string
}

export type KiloCodeAgent = {
  name: string
  content: string  // Full file content with YAML frontmatter
  category?: string  // Maps to agents/<category>/<name>.md
}

export type KiloCodeMcpServer = {
  type: "local" | "remote"
  command?: string[]
  url?: string
  environment?: Record<string, string>
  headers?: Record<string, string>
  enabled?: boolean
}

export type KiloCodeConfig = {
  mcp?: Record<string, KiloCodeMcpServer>
}

export type KiloCodeBundle = {
  agents: KiloCodeAgent[]
  skillDirs: KiloCodeSkillDir[]
  mcpConfig: KiloCodeConfig
}
```

**Key mappings:**
- Claude `mcpServers` → KiloCode `mcp`
- Claude `http` type → KiloCode `remote` type
- Claude `stdio` type → KiloCode `local` type

### Phase 2: Converter

**File:** `src/converters/claude-to-kilocode.ts`

**Key transformations:**

1. **MCP Server conversion:**
   ```typescript
   function convertMcpServer(claudeServer: ClaudeMcpServer): KiloCodeMcpServer {
     if (claudeServer.type === "http") {
       return {
         type: "remote",
         url: claudeServer.url,
         enabled: true,
       }
     }
     // stdio type
     return {
       type: "local",
       command: claudeServer.command,
       environment: claudeServer.env,
       enabled: true,
     }
   }
   ```

2. **Agent content transformation:**
   - Preserve YAML frontmatter from Claude agents
   - Add `mode: subagent` field to KiloCode agents
   - Add default `permission: { edit: deny, bash: deny }` for safety
   - Transform content paths: `.claude/` → `.kilocode/`, `~/.claude/` → `~/.kilocode/`

3. **Skills:** Pass-through copy (SKILL.md format is compatible)

### Phase 3: Writer

**File:** `src/targets/kilocode.ts`

**Output structure:**

```
.kilocode/
├── skills/           # Copied from plugin skills
│   ├── ce-plan/
│   │   └── SKILL.md
│   └── ...
├── agents/           # Converted from plugin agents
│   ├── rails-reviewer.md
│   └── ...
└── kilo.json         # MCP config (backup existing)
```

**Key implementation:**

```typescript
export async function writeKiloCodeBundle(
  outputRoot: string,
  bundle: KiloCodeBundle,
  scope?: TargetScope,
): Promise<void> {
  const paths = resolveKiloCodePaths(outputRoot, scope)
  await ensureDir(paths.root)

  // Copy skills
  if (bundle.skillDirs.length > 0) {
    await ensureDir(paths.skillsDir)
    for (const skill of bundle.skillDirs) {
      await copyDir(skill.sourceDir, path.join(paths.skillsDir, skill.name))
    }
  }

  // Write agents
  if (bundle.agents.length > 0) {
    await ensureDir(paths.agentsDir)
    for (const agent of bundle.agents) {
      await writeText(
        path.join(paths.agentsDir, `${agent.name}.md`),
        agent.content + "\n",
      )
    }
  }

  // Write/merge MCP config
  if (bundle.mcpConfig.mcp && Object.keys(bundle.mcpConfig.mcp).length > 0) {
    const existing = await readJson(paths.configPath) || {}
    const merged = {
      ...existing,
      mcp: {
        ...existing.mcp,
        ...bundle.mcpConfig.mcp,
      },
    }
    await backupFile(paths.configPath)
    await writeJson(paths.configPath, merged, { mode: 0o600 })
  }
}

function resolveKiloCodePaths(outputRoot: string, scope?: TargetScope) {
  const base = path.basename(outputRoot)
  
  // Global scope: ~/.config/kilo/
  if (scope === "global") {
    const globalRoot = expandHome("~/.config/kilo")
    return {
      root: globalRoot,
      skillsDir: expandHome("~/.kilocode/skills"),
      agentsDir: path.join(globalRoot, "agents"),
      configPath: path.join(globalRoot, "kilo.json"),
    }
  }

  // Workspace scope: .kilocode/
  if (base === ".kilocode") {
    return {
      root: outputRoot,
      skillsDir: path.join(outputRoot, "skills"),
      agentsDir: path.join(outputRoot, "agents"),
      configPath: path.join(outputRoot, "kilo.json"),
    }
  }

  return {
    root: outputRoot,
    skillsDir: path.join(outputRoot, ".kilocode", "skills"),
    agentsDir: path.join(outputRoot, ".kilocode", "agents"),
    configPath: path.join(outputRoot, ".kilocode", "kilo.json"),
  }
}
```

### Phase 4: CLI Wiring

**File:** `src/targets/index.ts`

```typescript
import type { KiloCodeBundle } from "../types/kilocode"
import { convertClaudeToKiloCode } from "../converters/claude-to-kilocode"
import { writeKiloCodeBundle } from "./kilocode"

export const targets: Record<string, TargetHandler> = {
  // ... existing targets ...
  kilocode: {
    name: "kilocode",
    implemented: true,
    defaultScope: "workspace",
    supportedScopes: ["global", "workspace"],
    convert: convertClaudeToKiloCode as TargetHandler<KiloCodeBundle>["convert"],
    write: writeKiloCodeBundle as TargetHandler<KiloCodeBundle>["write"],
  },
}
```

### Phase 5: Sync Support (Optional)

**File:** `src/sync/kilocode.ts`

Sync personal Claude skills and MCP servers to KiloCode:

```typescript
export async function syncToKiloCode(outputRoot: string): Promise<void> {
  const personalSkillsDir = expandHome("~/.claude/skills")
  const personalSettings = loadSettings(expandHome("~/.claude/settings.json"))

  // Sync skills
  const skillsDest = expandHome("~/.kilocode/skills")
  await ensureDir(skillsDest)

  if (existsSync(personalSkillsDir)) {
    const skills = readdirSync(personalSkillsDir)
    for (const skill of skills) {
      if (!isValidSkillName(skill)) continue
      const source = path.join(personalSkillsDir, skill)
      const dest = path.join(skillsDest, skill)
      await forceSymlink(source, dest)
    }
  }

  // Sync MCP servers
  if (personalSettings.mcpServers) {
    const mcpPath = expandHome("~/.config/kilo/kilo.json")
    const existing = readJson(mcpPath) || {}
    const converted = convertMcpServers(personalSettings.mcpServers)
    const merged = {
      ...existing,
      mcp: {
        ...existing.mcp,
        ...converted,
      },
    }
    await writeJson(mcpPath, merged, { mode: 0o600 })
  }
}
```

### Phase 6: Tests

**Files:**
- `tests/kilocode-converter.test.ts`
- `tests/kilocode-writer.test.ts`

**Test coverage:**
1. Converter tests:
   - Agent name normalization
   - MCP type conversion (http → remote, stdio → local)
   - Content path transformation
   - Frontmatter field mapping (mode, permission)

2. Writer tests:
   - Skills copied correctly
   - Agents written with correct extension
   - MCP config merge with backup
   - Double-nesting prevention
   - Global vs. workspace scope

---

## Format Specification

**File:** `docs/specs/kilocode.md`

Document:
- Last verified date with link to official docs
- Config file locations (global vs. workspace)
- SKILL.md format (YAML frontmatter + Markdown)
- Agent format (YAML frontmatter with mode/permission)
- MCP configuration structure
- Character limits

---

## Dependencies

None blocking. KiloCode CLI uses similar conventions to Claude Code:
- SKILL.md format is compatible (YAML frontmatter + Markdown)
- MCP uses `mcp` key instead of `mcpServers`
- Agents use markdown files with YAML frontmatter

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Types | 1 hour |
| Phase 2: Converter | 2-3 hours |
| Phase 3: Writer | 1-2 hours |
| Phase 4: CLI Wiring | 30 min |
| Phase 5: Sync | 1 hour (optional) |
| Phase 6: Tests | 2 hours |
| Documentation | 1 hour |
| **Total** | **8-10 hours** |

---

## Acceptance Criteria

- [x] `bun run src/index.ts convert --to kilocode ./plugins/compound-engineering` produces valid `.kilocode/` output
- [x] `bun run src/index.ts install --to kilocode ./plugins/compound-engineering` installs to correct location
- [x] `bun run src/index.ts install --to kilocode --scope global ./plugins/compound-engineering` installs to `~/.config/kilo/`
- [x] All 46 skills copied correctly
- [x] MCP servers converted with correct type mapping
- [x] Existing `kilo.json` backed up before modification
- [x] `bun test` passes with new tests
- [x] `docs/specs/kilocode.md` created with format specification
- [x] README updated with kilocode in supported targets list

---

## References

- KiloCode Skills Documentation: https://kilocode.ai/docs/features/skills
- KiloCode MCP Documentation: https://kilocode.ai/docs/features/mcp
- KiloCode Custom Modes: https://kilocode.ai/docs/features/custom-modes
- `docs/solutions/adding-converter-target-providers.md`
- `src/targets/droid.ts` (reference implementation)
- `src/converters/claude-to-copilot.ts` (MCP conversion pattern)
