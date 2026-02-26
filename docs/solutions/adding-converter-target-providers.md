---
title: Adding New Converter Target Providers
category: architecture
tags: [converter, target-provider, plugin-conversion, multi-platform, pattern]
created: 2026-02-23
severity: medium
component: converter-cli
problem_type: best_practice
root_cause: architectural_pattern
---

# Adding New Converter Target Providers

## Problem

When adding support for a new AI platform (e.g., Devin, Cursor, Copilot), the converter CLI architecture requires consistent implementation across types, converters, writers, CLI integration, and tests. Without documented patterns and learnings, new targets take longer to implement and risk architectural inconsistency.

## Solution

The compound-engineering-plugin uses a proven **6-phase target provider pattern** that has been successfully applied to 8 targets:

1. **OpenCode** (primary target, reference implementation)
2. **Codex** (second target, established pattern)
3. **Droid/Factory** (workflow/agent conversion)
4. **Pi** (MCPorter ecosystem)
5. **Gemini CLI** (content transformation patterns)
6. **Cursor** (command flattening, rule formats)
7. **Copilot** (GitHub native, MCP prefixing)
8. **Kiro** (limited MCP support)
9. **Devin** (playbook conversion, knowledge entries)

Each implementation follows this architecture precisely, ensuring consistency and maintainability.

## Architecture: The 6-Phase Pattern

### Phase 1: Type Definitions (`src/types/{target}.ts`)

**Purpose:** Define TypeScript types for the intermediate bundle format

**Key Pattern:**

```typescript
// Exported bundle type used by converter and writer
export type {TargetName}Bundle = {
  // Component arrays matching the target format
  agents?: {TargetName}Agent[]
  commands?: {TargetName}Command[]
  skillDirs?: {TargetName}SkillDir[]
  mcpServers?: Record<string, {TargetName}McpServer>
  // Target-specific fields
  setup?: string  // Instructions file content
}

// Individual component types
export type {TargetName}Agent = {
  name: string
  content: string  // Full file content (with frontmatter if applicable)
  category?: string  // e.g., "agent", "rule", "playbook"
  meta?: Record<string, unknown>  // Target-specific metadata
}
```

**Key Learnings:**

- Always include a `content` field (full file text) rather than decomposed fields — it's simpler and matches how files are written
- Use intermediate types for complex sections (e.g., `DevinPlaybookSections` in Devin converter) to make section building independently testable
- Avoid target-specific fields in the base bundle unless essential — aim for shared structure across targets
- Include a `category` field if the target has file-type variants (agents vs. commands vs. rules)

**Reference Implementations:**
- OpenCode: `src/types/opencode.ts` (command + agent split)
- Devin: `src/types/devin.ts` (playbooks + knowledge entries)
- Copilot: `src/types/copilot.ts` (agents + skills + MCP)

---

### Phase 2: Converter (`src/converters/claude-to-{target}.ts`)

**Purpose:** Transform Claude Code plugin format → target-specific bundle format

**Key Pattern:**

```typescript
export type ClaudeTo{Target}Options = ClaudeToOpenCodeOptions  // Reuse common options

export function convertClaudeTo{Target}(
  plugin: ClaudePlugin,
  _options: ClaudeTo{Target}Options,
): {Target}Bundle {
  // Pre-scan: build maps for cross-reference resolution (agents, commands)
  // Needed if target requires deduplication or reference tracking
  const refMap: Record<string, string> = {}
  for (const agent of plugin.agents) {
    refMap[normalize(agent.name)] = macroName(agent.name)
  }

  // Phase 1: Convert agents
  const agents = plugin.agents.map(a => convert{Target}Agent(a, usedNames, refMap))

  // Phase 2: Convert commands (may depend on agent names for dedup)
  const commands = plugin.commands.map(c => convert{Target}Command(c, usedNames, refMap))

  // Phase 3: Handle skills (usually pass-through, sometimes conversion)
  const skillDirs = plugin.skills.map(s => ({ name: s.name, sourceDir: s.sourceDir }))

  // Phase 4: Convert MCP servers (target-specific prefixing/type mapping)
  const mcpConfig = convertMcpServers(plugin.mcpServers)

  // Phase 5: Warn on unsupported features
  if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) {
    console.warn("Warning: {Target} does not support hooks. Hooks were skipped.")
  }

  return { agents, commands, skillDirs, mcpConfig }
}
```

**Content Transformation (`transformContentFor{Target}`):**

Applied to both agent bodies and command bodies to rewrite paths, command references, and agent mentions:

```typescript
export function transformContentFor{Target}(body: string): string {
  let result = body

  // 1. Rewrite paths (.claude/ → .github/, ~/.claude/ → ~/.{target}/)
  result = result
    .replace(/~\/\.claude\//g, `~/.${targetDir}/`)
    .replace(/\.claude\//g, `.${targetDir}/`)

  // 2. Transform Task agent calls (to natural language)
  const taskPattern = /Task\s+([a-z][a-z0-9-]*)\(([^)]+)\)/gm
  result = result.replace(taskPattern, (_match, agentName: string, args: string) => {
    const skillName = normalize(agentName)
    return `Use the ${skillName} skill to: ${args.trim()}`
  })

  // 3. Flatten slash commands (/workflows:plan → /plan)
  const slashPattern = /(?<![:\w])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}`]|$)/gi
  result = result.replace(slashPattern, (match, commandName: string) => {
    if (commandName.includes("/")) return match  // Skip file paths
    const normalized = normalize(commandName)
    return `/${normalized}`
  })

  // 4. Transform @agent-name references
  const agentPattern = /@([a-z][a-z0-9-]*-(?:agent|reviewer|analyst|...))/gi
  result = result.replace(agentPattern, (_match, agentName: string) => {
    return `the ${normalize(agentName)} agent`  // or "rule", "playbook", etc.
  })

  // 5. Remove examples (if target doesn't support them)
  result = result.replace(/<examples>[\s\S]*?<\/examples>/g, "")

  return result
}
```

**Deduplication Pattern (`uniqueName`):**

Used when target has flat namespaces (Cursor, Copilot, Devin) or when name collisions occur:

```typescript
function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let index = 2
  while (used.has(`${base}-${index}`)) {
    index += 1
  }
  const name = `${base}-${index}`
  used.add(name)
  return name
}

function normalizeName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return "item"
  const normalized = trimmed
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/[:\s]+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "item"
}

// Flatten: drops namespace prefix (workflows:plan → plan)
function flattenCommandName(name: string): string {
  const normalized = normalizeName(name)
  return normalized.replace(/^[a-z]+-/, "")  // Drop prefix before first dash
}
```

**Key Learnings:**

1. **Pre-scan for cross-references** — If target requires reference names (macros, URIs, IDs), build a map before conversion. Example: Devin needs macro names like `agent_kieran_rails_reviewer`, so pre-scan builds the map.

2. **Content transformation is fragile** — Test extensively. Patterns that work for slash commands might false-match on file paths. Use negative lookahead to skip `/etc`, `/usr`, `/var`, etc.

3. **Simplify heuristics, trust structural mapping** — Don't try to parse agent body for "You are..." or "NEVER do..." patterns. Instead, map agent.description → Overview, agent.body → Procedure, agent.capabilities → Specifications. Heuristics fail on edge cases and are hard to test.

4. **Normalize early and consistently** — Use the same `normalizeName()` function throughout. Inconsistent normalization causes deduplication bugs.

5. **MCP servers need target-specific handling:**
   - **OpenCode:** Merge into `opencode.json` (preserve user keys)
   - **Copilot:** Prefix env vars with `COPILOT_MCP_`, emit JSON
   - **Devin:** Write setup instructions file (config is via web UI)
   - **Cursor:** Pass through as-is

6. **Warn on unsupported features** — Hooks, Gemini extensions, Kiro-incompatible MCP types. Emit to stderr and continue conversion.

**Reference Implementations:**
- OpenCode: `src/converters/claude-to-opencode.ts` (most comprehensive)
- Devin: `src/converters/claude-to-devin.ts` (content transformation + cross-references)
- Copilot: `src/converters/claude-to-copilot.ts` (MCP prefixing pattern)

---

### Phase 3: Writer (`src/targets/{target}.ts`)

**Purpose:** Write converted bundle to disk in target-specific directory structure

**Key Pattern:**

```typescript
export async function write{Target}Bundle(outputRoot: string, bundle: {Target}Bundle): Promise<void> {
  const paths = resolve{Target}Paths(outputRoot)
  await ensureDir(paths.root)

  // Write each component type
  if (bundle.agents?.length > 0) {
    const agentsDir = path.join(paths.root, "agents")
    for (const agent of bundle.agents) {
      await writeText(path.join(agentsDir, `${agent.name}.ext`), agent.content + "\n")
    }
  }

  if (bundle.commands?.length > 0) {
    const commandsDir = path.join(paths.root, "commands")
    for (const command of bundle.commands) {
      await writeText(path.join(commandsDir, `${command.name}.ext`), command.content + "\n")
    }
  }

  // Copy skills (pass-through case)
  if (bundle.skillDirs?.length > 0) {
    const skillsDir = path.join(paths.root, "skills")
    for (const skill of bundle.skillDirs) {
      await copyDir(skill.sourceDir, path.join(skillsDir, skill.name))
    }
  }

  // Write generated skills (converted from commands)
  if (bundle.generatedSkills?.length > 0) {
    const skillsDir = path.join(paths.root, "skills")
    for (const skill of bundle.generatedSkills) {
      await writeText(path.join(skillsDir, skill.name, "SKILL.md"), skill.content + "\n")
    }
  }

  // Write MCP config (target-specific location and format)
  if (bundle.mcpServers && Object.keys(bundle.mcpServers).length > 0) {
    const mcpPath = path.join(paths.root, "mcp.json")  // or copilot-mcp-config.json, etc.
    const backupPath = await backupFile(mcpPath)
    if (backupPath) {
      console.log(`Backed up existing MCP config to ${backupPath}`)
    }
    await writeJson(mcpPath, { mcpServers: bundle.mcpServers })
  }

  // Write instructions or setup guides
  if (bundle.setupInstructions) {
    const setupPath = path.join(paths.root, "setup-instructions.md")
    await writeText(setupPath, bundle.setupInstructions + "\n")
  }
}

// Avoid double-nesting (.target/.target/)
function resolve{Target}Paths(outputRoot: string) {
  const base = path.basename(outputRoot)
  // If already pointing at .target, write directly into it
  if (base === ".target") {
    return { root: outputRoot }
  }
  // Otherwise nest under .target
  return { root: path.join(outputRoot, ".target") }
}
```

**Backup Pattern (MCP configs only):**

MCP configs are often pre-existing and user-edited. Backup before overwrite:

```typescript
// From src/utils/files.ts
export async function backupFile(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dirname = path.dirname(filePath)
  const basename = path.basename(filePath)
  const ext = path.extname(basename)
  const name = basename.slice(0, -ext.length)
  const backupPath = path.join(dirname, `${name}.${timestamp}${ext}`)
  await copyFile(filePath, backupPath)
  return backupPath
}
```

**Key Learnings:**

1. **Always check for double-nesting** — If output root is already `.target`, don't nest again. Pattern:
   ```typescript
   if (path.basename(outputRoot) === ".target") {
     return { root: outputRoot }  // Write directly
   }
   return { root: path.join(outputRoot, ".target") }  // Nest
   ```

2. **Use `writeText` and `writeJson` helpers** — These handle directory creation and line endings consistently

3. **Backup MCP configs before overwriting** — MCP JSON files are often hand-edited. Always backup with timestamp.

4. **Empty bundles should succeed gracefully** — Don't fail if a component array is empty. Many plugins may have no commands or no skills.

5. **File extensions matter** — Match target conventions exactly:
   - Copilot: `.agent.md` (note the dot)
   - Cursor: `.mdc` for rules
   - Devin: `.devin.md` for playbooks
   - OpenCode: `.md` for commands

6. **Permissions for sensitive files** — MCP config with API keys should use `0o600`:
   ```typescript
   await writeJson(mcpPath, config, { mode: 0o600 })
   ```

**Reference Implementations:**
- Droid: `src/targets/droid.ts` (simpler pattern, good for learning)
- Copilot: `src/targets/copilot.ts` (double-nesting pattern)
- Devin: `src/targets/devin.ts` (setup instructions file)

---

### Phase 4: CLI Wiring

**File: `src/targets/index.ts`**

Register the new target in the global target registry:

```typescript
import { convertClaudeTo{Target} } from "../converters/claude-to-{target}"
import { write{Target}Bundle } from "./{target}"
import type { {Target}Bundle } from "../types/{target}"

export const targets: Record<string, TargetHandler<any>> = {
  // ... existing targets ...
  {target}: {
    name: "{target}",
    implemented: true,
    convert: convertClaudeTo{Target} as TargetHandler<{Target}Bundle>["convert"],
    write: write{Target}Bundle as TargetHandler<{Target}Bundle>["write"],
  },
}
```

**File: `src/commands/convert.ts` and `src/commands/install.ts`**

Add output root resolution:

```typescript
// In resolveTargetOutputRoot()
if (targetName === "{target}") {
  return path.join(outputRoot, ".{target}")
}

// Update --to flag description
const toDescription = "Target format (opencode | codex | droid | cursor | copilot | kiro | {target})"
```

---

### Phase 5: Sync Support (Optional)

**File: `src/sync/{target}.ts`**

If the target supports syncing personal skills and MCP servers:

```typescript
export async function syncTo{Target}(outputRoot: string): Promise<void> {
  const personalSkillsDir = path.join(expandHome("~/.claude/skills"))
  const personalSettings = loadSettings(expandHome("~/.claude/settings.json"))

  const skillsDest = path.join(outputRoot, ".{target}", "skills")
  await ensureDir(skillsDest)

  // Symlink personal skills
  if (existsSync(personalSkillsDir)) {
    const skills = readdirSync(personalSkillsDir)
    for (const skill of skills) {
      if (!isValidSkillName(skill)) continue
      const source = path.join(personalSkillsDir, skill)
      const dest = path.join(skillsDest, skill)
      await forceSymlink(source, dest)
    }
  }

  // Merge MCP servers if applicable
  if (personalSettings.mcpServers) {
    const mcpPath = path.join(outputRoot, ".{target}", "mcp.json")
    const existing = readJson(mcpPath) || {}
    const merged = {
      ...existing,
      mcpServers: {
        ...existing.mcpServers,
        ...personalSettings.mcpServers,
      },
    }
    await writeJson(mcpPath, merged, { mode: 0o600 })
  }
}
```

**File: `src/commands/sync.ts`**

```typescript
// Add to validTargets array
const validTargets = ["opencode", "codex", "droid", "cursor", "pi", "{target}"] as const

// In resolveOutputRoot()
case "{target}":
  return path.join(process.cwd(), ".{target}")

// In main switch
case "{target}":
  await syncTo{Target}(outputRoot)
  break
```

---

### Phase 6: Tests

**File: `tests/{target}-converter.test.ts`**

Test converter using inline `ClaudePlugin` fixtures:

```typescript
describe("convertClaudeTo{Target}", () => {
  it("converts agents to {target} format", () => {
    const plugin: ClaudePlugin = {
      name: "test",
      agents: [
        {
          name: "test-agent",
          description: "Test description",
          body: "Test body",
          capabilities: ["Cap 1", "Cap 2"],
        },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeTo{Target}(plugin, {})

    expect(bundle.agents).toHaveLength(1)
    expect(bundle.agents[0].name).toBe("test-agent")
    expect(bundle.agents[0].content).toContain("Test description")
  })

  it("normalizes agent names", () => {
    const plugin: ClaudePlugin = {
      name: "test",
      agents: [
        { name: "Test Agent", description: "", body: "", capabilities: [] },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeTo{Target}(plugin, {})
    expect(bundle.agents[0].name).toBe("test-agent")
  })

  it("deduplicates colliding names", () => {
    const plugin: ClaudePlugin = {
      name: "test",
      agents: [
        { name: "Agent Name", description: "", body: "", capabilities: [] },
        { name: "Agent Name", description: "", body: "", capabilities: [] },
      ],
      commands: [],
      skills: [],
    }

    const bundle = convertClaudeTo{Target}(plugin, {})
    expect(bundle.agents.map(a => a.name)).toEqual(["agent-name", "agent-name-2"])
  })

  it("transforms content paths (.claude → .{target})", () => {
    const result = transformContentFor{Target}("See ~/.claude/config")
    expect(result).toContain("~/.{target}/config")
  })

  it("warns when hooks are present", () => {
    const spy = jest.spyOn(console, "warn")
    const plugin: ClaudePlugin = {
      name: "test",
      agents: [],
      commands: [],
      skills: [],
      hooks: { hooks: { "file:save": "test" } },
    }

    convertClaudeTo{Target}(plugin, {})
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("hooks"))
  })
})
```

**File: `tests/{target}-writer.test.ts`**

Test writer using temp directories (from `tmp` package):

```typescript
describe("write{Target}Bundle", () => {
  it("writes agents to {target} format", async () => {
    const tmpDir = await tmp.dir()
    const bundle: {Target}Bundle = {
      agents: [{ name: "test", content: "# Test\nBody" }],
      commands: [],
      skillDirs: [],
    }

    await write{Target}Bundle(tmpDir.path, bundle)

    const written = readFileSync(path.join(tmpDir.path, ".{target}", "agents", "test.ext"), "utf-8")
    expect(written).toContain("# Test")
  })

  it("does not double-nest when output root is .{target}", async () => {
    const tmpDir = await tmp.dir()
    const targetDir = path.join(tmpDir.path, ".{target}")
    await ensureDir(targetDir)

    const bundle: {Target}Bundle = {
      agents: [{ name: "test", content: "# Test" }],
      commands: [],
      skillDirs: [],
    }

    await write{Target}Bundle(targetDir, bundle)

    // Should write to targetDir directly, not targetDir/.{target}
    const written = path.join(targetDir, "agents", "test.ext")
    expect(existsSync(written)).toBe(true)
  })

  it("backs up existing MCP config", async () => {
    const tmpDir = await tmp.dir()
    const mcpPath = path.join(tmpDir.path, ".{target}", "mcp.json")
    await ensureDir(path.dirname(mcpPath))
    await writeJson(mcpPath, { existing: true })

    const bundle: {Target}Bundle = {
      agents: [],
      commands: [],
      skillDirs: [],
      mcpServers: { "test": { command: "test" } },
    }

    await write{Target}Bundle(tmpDir.path, bundle)

    // Backup should exist
    const backups = readdirSync(path.dirname(mcpPath)).filter(f => f.includes("mcp") && f.includes("-"))
    expect(backups.length).toBeGreaterThan(0)
  })
})
```

**Key Testing Patterns:**

- Test normalization, deduplication, content transformation separately
- Use inline plugin fixtures (not file-based)
- For writer tests, use temp directories and verify file existence
- Test edge cases: empty names, empty bodies, special characters
- Test error handling: missing files, permission issues

---

## Documentation Requirements

**File: `docs/specs/{target}.md`**

Document the target format specification:

- Last verified date (link to official docs)
- Config file locations (project-level vs. user-level)
- Agent/command/skill format with field descriptions
- MCP configuration structure
- Character limits (if any)
- Example file

**File: `README.md`**

Add to supported targets list and include usage examples.

---

## Common Pitfalls and Solutions

| Pitfall | Solution |
|---------|----------|
| **Double-nesting** (`.cursor/.cursor/`) | Check `path.basename(outputRoot)` before nesting |
| **Inconsistent name normalization** | Use single `normalizeName()` function everywhere |
| **Fragile content transformation** | Test regex patterns against edge cases (file paths, URLs) |
| **Heuristic section extraction fails** | Use structural mapping (description → Overview, body → Procedure) instead |
| **MCP config overwrites user edits** | Always backup with timestamp before overwriting |
| **Skill body not loaded** | Verify `ClaudeSkill` has `skillPath` field for file reading |
| **Missing deduplication** | Build `usedNames` set before conversion, pass to each converter |
| **Unsupported features cause silent loss** | Always warn to stderr (hooks, incompatible MCP types, etc.) |
| **Test isolation failures** | Use unique temp directories per test, clean up afterward |
| **Command namespace collisions after flattening** | Use `uniqueName()` with deduplication, test multiple collisions |

---

## Checklist for Adding a New Target

Use this checklist when adding a new target provider:

### Implementation
- [ ] Create `src/types/{target}.ts` with bundle and component types
- [ ] Implement `src/converters/claude-to-{target}.ts` with converter and content transformer
- [ ] Implement `src/targets/{target}.ts` with writer
- [ ] Register target in `src/targets/index.ts`
- [ ] Update `src/commands/convert.ts` (add output root resolution, update help text)
- [ ] Update `src/commands/install.ts` (same as convert.ts)
- [ ] (Optional) Implement `src/sync/{target}.ts` and update `src/commands/sync.ts`

### Testing
- [ ] Create `tests/{target}-converter.test.ts` with converter tests
- [ ] Create `tests/{target}-writer.test.ts` with writer tests
- [ ] (Optional) Create `tests/sync-{target}.test.ts` with sync tests
- [ ] Run full test suite: `bun test`
- [ ] Manual test: `bun run src/index.ts convert --to {target} ./plugins/compound-engineering`

### Documentation
- [ ] Create `docs/specs/{target}.md` with format specification
- [ ] Update `README.md` with target in list and usage examples
- [ ] Update `CHANGELOG.md` with new target

### Version Bumping
- [ ] Bump version in `package.json` (minor for new target)
- [ ] Update plugin.json description if component counts changed
- [ ] Verify CHANGELOG entry is clear

---

## References

### Implementation Examples

**Reference implementations by priority (easiest to hardest):**

1. **Droid** (`src/targets/droid.ts`, `src/converters/claude-to-droid.ts`) — Simplest pattern, good learning baseline
2. **Copilot** (`src/targets/copilot.ts`, `src/converters/claude-to-copilot.ts`) — MCP prefixing, double-nesting guard
3. **Devin** (`src/converters/claude-to-devin.ts`) — Content transformation, cross-references, intermediate types
4. **OpenCode** (`src/converters/claude-to-opencode.ts`) — Most comprehensive, handles command structure and config merging

### Key Utilities

- `src/utils/frontmatter.ts` — `formatFrontmatter()` and `parseFrontmatter()`
- `src/utils/files.ts` — `writeText()`, `writeJson()`, `copyDir()`, `backupFile()`, `ensureDir()`
- `src/utils/resolve-home.ts` — `expandHome()` for `~/.{target}` path resolution

### Existing Tests

- `tests/cursor-converter.test.ts` — Comprehensive converter tests
- `tests/copilot-writer.test.ts` — Writer tests with temp directories
- `tests/sync-copilot.test.ts` — Sync pattern with symlinks and config merge

---

## Related Files

- `/C:/Source/compound-engineering-plugin/.claude-plugin/plugin.json` — Version and component counts
- `/C:/Source/compound-engineering-plugin/CHANGELOG.md` — Recent additions and patterns
- `/C:/Source/compound-engineering-plugin/README.md` — Usage examples for all targets
- `/C:/Source/compound-engineering-plugin/docs/solutions/plugin-versioning-requirements.md` — Checklist for releases
