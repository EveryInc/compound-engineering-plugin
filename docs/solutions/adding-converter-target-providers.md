---
title: Adding New Converter Target Providers
category: architecture
tags: [converter, target-provider, plugin-conversion, multi-platform, pattern]
created: 2026-02-23
severity: medium
component: converter-cli
problem_type: architecture_pattern
root_cause: architectural_pattern
---

# Adding New Converter Target Providers

## Problem

When adding support for a new AI platform (e.g., Copilot, Windsurf, Qwen), the converter CLI architecture requires consistent implementation across types, converters, writers, CLI integration, and tests. Without documented patterns and learnings, new targets take longer to implement and risk architectural inconsistency.

## Solution

The compound-engineering-plugin uses a proven **6-phase target provider pattern** that has been successfully applied to 11+ targets (including high-fidelity cases exercising the full CE pipeline):

1. **OpenCode** (primary target, reference implementation)
2. **Codex** (second target, established pattern)
3. **Droid/Factory** (workflow/agent conversion)
4. **Pi** (MCPorter ecosystem)
5. **Gemini CLI** (content transformation patterns)
6. **Copilot** (GitHub native, MCP prefixing)
7. **Kiro** (limited MCP support)
8. **Windsurf** (rules-based format)
9. **OpenClaw** (open agent format)
10. **Qwen** (Qwen agent format)
11. **Grok** (self-contained clean layout; high-fidelity exemplar using full CE process + transform-layer-only rule + U3a/U3b shared tests + 002 readiness + live dogfood — see dedicated section below and the companion `best-practices/full-ce-process-grok-converter-target-fidelity.md`)

Each implementation follows this architecture precisely, ensuring consistency and maintainability. Future targets with complex dispatch or portability requirements should study the Grok case for the evolved high-fidelity patterns.

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
- Use intermediate types for complex sections to make section building independently testable
- Avoid target-specific fields in the base bundle unless essential — aim for shared structure across targets
- Include a `category` field if the target has file-type variants (agents vs. commands vs. rules)

**Reference Implementations:**
- OpenCode: `src/types/opencode.ts` (command + agent split)
- Copilot: `src/types/copilot.ts` (agents + skills + MCP)
- Windsurf: `src/types/windsurf.ts` (rules-based format)

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

Used when target has flat namespaces (Copilot, Windsurf) or when name collisions occur:

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

1. **Pre-scan for cross-references** — If target requires reference names (macros, URIs, IDs), build a map before conversion to avoid name collisions and enable deduplication.

2. **Content transformation is fragile** — Test extensively. Patterns that work for slash commands might false-match on file paths. Use negative lookahead to skip `/etc`, `/usr`, `/var`, etc.

3. **Simplify heuristics, trust structural mapping** — Don't try to parse agent body for "You are..." or "NEVER do..." patterns. Instead, map agent.description → Overview, agent.body → Procedure, agent.capabilities → Specifications. Heuristics fail on edge cases and are hard to test.

4. **Normalize early and consistently** — Use the same `normalizeName()` function throughout. Inconsistent normalization causes deduplication bugs.

5. **MCP servers need target-specific handling:**
   - **OpenCode:** Merge into `opencode.json` (preserve user keys)
   - **Copilot:** Prefix env vars with `COPILOT_MCP_`, emit JSON
   - **Windsurf:** Write MCP config in target-specific format
   - **Kiro:** Limited MCP support, check compatibility

6. **Warn on unsupported features** — Hooks, Gemini extensions, Kiro-incompatible MCP types. Emit to stderr and continue conversion.

**Reference Implementations:**
- OpenCode: `src/converters/claude-to-opencode.ts` (most comprehensive)
- Copilot: `src/converters/claude-to-copilot.ts` (MCP prefixing pattern)
- Windsurf: `src/converters/claude-to-windsurf.ts` (rules-based conversion)

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
   - Copilot: `.md` for agents (VS Code parses `.agent.md` as Copilot format and silently drops Claude-style tool names; `.md` triggers Claude format detection and maps tools to VS Code equivalents)
   - Windsurf: `.md` for rules
   - OpenCode: `.md` for commands

6. **Permissions for sensitive files** — MCP config with API keys should use `0o600`:
   ```typescript
   await writeJson(mcpPath, config, { mode: 0o600 })
   ```

**Reference Implementations:**
- Droid: `src/targets/droid.ts` (simpler pattern, good for learning)
- Copilot: `src/targets/copilot.ts` (double-nesting pattern)
- Windsurf: `src/targets/windsurf.ts` (rules-based output)

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
const toDescription = "Target format (opencode | codex | droid | cursor | pi | copilot | gemini | kiro | windsurf | openclaw | qwen | all)"
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
const validTargets = ["opencode", "codex", "droid", "pi", "copilot", "gemini", "kiro", "windsurf", "openclaw", "qwen", "{target}"] as const

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
| **Double-nesting** (`.copilot/.copilot/`) | Check `path.basename(outputRoot)` before nesting |
| **Inconsistent name normalization** | Use single `normalizeName()` function everywhere |
| **Fragile content transformation** | Test regex patterns against edge cases (file paths, URLs) |
| **Heuristic section extraction fails** | Use structural mapping (description → Overview, body → Procedure) instead |
| **MCP config overwrites user edits** | Always backup with timestamp before overwriting |
| **Skill body not loaded** | Verify `ClaudeSkill` has `skillPath` field for file reading |
| **Missing deduplication** | Build `usedNames` set before conversion, pass to each converter |
| **Unsupported features cause silent loss** | Always warn to stderr (hooks, incompatible MCP types, etc.) |
| **Test isolation failures** | Use unique temp directories per test, clean up afterward |
| **Command namespace collisions after flattening** | Use `uniqueName()` with deduplication, test multiple collisions |
| **Target-specific syntax leakage into universal source (portability breakage)** | Enforce core fidelity rule: *all* harness-specific syntax (tool names in instructions, date stamping commands, dispatch idioms, agent notes) lives *only* in the dedicated transform layer (`src/utils/{target}-content.ts`). Keep source portable with harness-agnostic phrasing; specialize at transform time only. Add contract tests asserting "source free of {target} syntax" + cross-target negatives + real roundtrips. (Grok U2 example: portable `date +%Y-%m-%d` phrasing in ce-plan + `rewriteDateStampingInstructions` in grok-content.ts only.) |
| **"Functional skeleton" or one-shot conversion for complex targets (missed fidelity, source pollution, late gaps)** | For non-trivial dispatch/30+ real skills: use *full CE pipeline* (brainstorm + detailed plan + U3 readiness pass exercising real skills e.g. `ce-code-review` excerpts *before* writer) + 002-style polish (cwd-aware version, primary roundtrips, explicit reconciliation recorded, live dogfood as arbiter). Add mandatory shared test coverage in converter.test.ts + cli.test.ts (U3a/U3b). See Grok high-fidelity section above and best-practices/full-ce-*.md. Never ship wiring without hardened transforms + real-skill validation. |
| **Skipping shared test surfaces or primary-tree contracts** | Per AGENTS.md + checklist: dedicated tests are required but *not sufficient*. Always extend shared `converter.test.ts` + `cli.test.ts` for spec coverage. Ensure primary tree (not just mirror) has full roundtrips/contracts post-reconciliation; record snapshot decisions in plan. |

---

## High-Fidelity Patterns for Complex Targets: Lessons from the Grok Converter Target (Full CE Pipeline + Fidelity Enforcement + 002 Readiness)

This architecture_pattern knowledge (best_practice / workflow style) captures what future implementers of new converter targets must do differently. It was produced via `/ce-compound` (Full mode, knowledge track) extracting from the successful Grok target work. See also the detailed primary record: `docs/solutions/best-practices/full-ce-process-grok-converter-target-fidelity.md`.

### Context

Prior one-off `/plan` conversions or "functional skeleton" implementations for new targets (e.g., the initial Grok port inside the target TUI) produced usable but noisy/incomplete output. Symptoms: verbose duplicated "Grok port notes" sprinkled across reference files, tables, and ce-*-reviewer entries; incomplete transforms for agent frontmatter (Claude `tools`/`model` leakage vs. Grok `prompt_mode`/`permission_mode`/`agents_md`), subagent dispatch (`Task`/`spawn_subagent` + `read_file` agent injection), tool/env/script variable mappings; fidelity gaps discovered only during dogfood or review. The official source tree had zero Grok target implementation (`src/types/grok.ts`, `claude-to-grok.ts`, `src/targets/grok.ts`, `grok-content.ts`, `docs/specs/grok.md` absent). A diagnosed parent-repo skeleton exhibited the exact anti-pattern later documented here: core wiring present, but hardened transforms + real-skill exercising absent, leaving high-risk areas (custom `ce-*` agent injection for 38+ skills) unvalidated.

The originating friction: ongoing maintenance burden (every skill change requires re-auditing port notes), blocked ability to dogfood the CE process itself (full brainstorm/plan/review vs. built-in planner one-off for the same meta-task), risk of shipping low-fidelity targets, and no official ownership/auto-validation. The solution applied the *full CE pipeline* (brainstorm/requirements → detailed 8-unit plan with explicit U3 "readiness pass" exercising real complex skills such as `ce-code-review` *before* the writer → post-`ce-code-review` fixes + 002 release-readiness polish) inside a clean test-mirror checkout. This produced observably superior mechanical mappings, a clean PR-ready implementation, and the lessons below. Subsequent 002 units closed release gaps (version, portability, tests, traceability); 003 dogfood served as final arbiter; primary tree became canonical after explicit reconciliation.

### Guidance

Follow the **full CE pipeline** (brainstorm → detailed numbered-unit plan with readiness gates → U3-style exercising of complex *real* skills *before* downstream implementation → `ce-code-review` + targeted fixes) rather than one-off planner output or partial skeletons when implementing high-fidelity converter targets (or other non-trivial cross-platform mechanical mappings). Enforce the **core fidelity rule** and **mandatory shared test placement**. Use live dogfood as the final arbiter. Make the primary tree the canonical source of truth.

**Concrete process steps and reusable patterns demonstrated on the Grok target (apply these to future targets):**

1. **Brainstorm/requirements phase** captured head-to-head comparison goal explicitly (A4: "CE process itself as dogfood consumer") and treated existing one-off port notes + skeleton review findings as first-class inputs. This prevented scope drift and made "higher fidelity than the prior `/plan` conversion" a measurable success criterion (fidelity cluster around agent frontmatter, cross-platform references, dispatch, portability).

2. **Detailed 8-unit plan** (e.g. 2026-05-20-001 + 2026-05-25-002) followed the canonical 6-phase pattern from `AGENTS.md` ("Adding a New Target Provider" checklist) + this doc exactly, while expanding for risk ordering. Fidelity work front-loaded.

3. **U3 "Skill/content transform hardening + port notes reconciliation" readiness pass** (highest-leverage unit) executed *before* U4 (writer) and U5 (CLI). It:
   - Produced the authoritative explicit `CLAUDE_TO_GROK_TOOLS` table (15+ mappings: `Bash` → `run_terminal_command`, `Read` → `read_file`, `Edit` → `search_replace`, `Task`/`Agent` → `spawn_subagent`, `TodoWrite` → `todo_write`, `AskUserQuestion` → `ask_user_question`, etc.).
   - Built hardened `rewriteTaskAndAgentCalls` covering 5+ real dispatch idioms observed in production CE skills (`Task ce-foo(...)`, `spawn ... ce-foo subagent`, "Use the Agent tool...", table-style mentions in `ce-code-review`, generic fallbacks).
   - Implemented defensive variable rewriting preserving exact `${VAR:-.}` style while mapping `CLAUDE_*` → `GROK_*`.
   - Defined `shouldInjectGrokAgentNote` + `GROK_AGENT_INJECTION_NOTE` policy: **minimal central note only** for detected heavy delegation; full recipe, tool table, env vars, differences live in `docs/specs/grok.md` (no per-skill duplication).
   - Exercised transforms against real excerpts from `ce-code-review`, `ce-plan`, etc. (see `tests/grok-content.test.ts` "U3 hardened" and "real CE excerpts (from U3 readiness)").

4. **Subsequent units** built on the hardened transform (U4 writer using `copySkillDir(..., transformContentForGrok, true)` for full reference coverage + emitting pre-transformed agents; dedicated tests + CLI extensions; spec with frontmatter mapping table; `release:validate` + dogfood).

5. **Final `ce-code-review`** (exercising converted plugin inside target) + post-review fixes (dispatch rewriter refactoring for maintainability + test strengthening) yielded "Ready to PR".

**Key reusable patterns to replicate for any new target:**

- **Core fidelity rule (transform layer only — never violate):** Grok-specific (or target-specific) syntax and guidance lives *only* in the transform layer (`src/utils/grok-content.ts` or equivalent; see `transformContentForGrok`, `rewriteDateStampingInstructions`, `rewriteTaskAndAgentCalls`, `CLAUDE_TO_GROK_TOOLS`). Never in universal portable sources under `plugins/compound-engineering/skills/**` or agents. 
  - Concrete example (date stamping, the P0 that triggered 002 U2): Portable source form (in `ce-plan/SKILL.md` Phase 3.1 and brainstorm templates): "obtain the *actual current calendar date* by running the appropriate terminal or shell execution command for your current harness. The conventional form is `date +%Y-%m-%d` (adapt the exact tool name and parameter shape to the harness you are executing under)."
  - Transform-only specialization for Grok: replaces with precise actionable `run_terminal_command` + `command: "date +%Y-%m-%d"` (or equivalent). `rewriteDateStampingInstructions` is high-specificity regex, called early in transform. Module contract: "Grok-specific syntax and guidance lives only here — never in the universal source skills..."
  - Protected by contract tests: "source files remain free of Grok-specific date syntax"; cross-target negative (non-Grok targets emit only portable); roundtrips on real `ce-plan`.

- **U3a/U3b: Mandatory spec coverage in shared test suites (in addition to dedicated):** Per AGENTS.md checklist item 4 + this doc's Phase 6 + 002 U3a/U3b:
  - Dedicated `tests/grok-*.test.ts` (and equivalents) for heavy real-plugin roundtrips/characterization (version emission, writer layout, full ce-plan transform roundtrip asserting specialized date in *output* while *source on disk* remains portable, dispatch on ce-code-review excerpts).
  - *Additionally required* (not a bypass): light but explicit coverage in *shared* `tests/converter.test.ts` (describe block: "convertClaudeToGrok (spec coverage per AGENTS.md checklist item 4 + 002 plan U3a)" exercising agent frontmatter mappings `prompt_mode`/`permission_mode`/`agents_md`, bundle shape, hook resilience) and `tests/cli.test.ts` ( "convert writes Grok output", "--also grok" cases exercising self-contained layout, version in logs, success messaging, plugin.json presence).
  - "update tests alongside implementation rather than treating docs or examples as sufficient proof."

- **002-style release-readiness polish (after initial CE impl):** cwd-aware version with logging/observability (`getGrokDevVersion(cwdHint?)` using explicit `cwd` + timeout + sanitization + console.warn on fallback; sha-suffixed version injected to `plugin.json` and visible in writer logs); date portability revert + transform-only; primary-tree roundtrips + contracts (also in `tests/pipeline-review-contract.test.ts` for the date rule); explicit snapshot reconciliation decision recorded in the plan (CE mirror was superior snapshot; decision: primary becomes canonical carrier after port); traceability fixes on goal docs.

- **Live dogfood (003 plan) as final arbiter (not unit tests alone):** Real regeneration:
  ```
  $ bun run src/index.ts convert ./plugins/compound-engineering --to grok -o /tmp/ce-grok-u6-dogfood
  ✅ Grok plugin written to: ... (version: 0.0.0-dev-grok-9a7901e)
  ```
  Verified in artifact (plugin.json has sha version; skills have specialized date rule). Then install in real target TUI and execute full CE workflows (`/ce-plan` produces plans with actual wall-clock dates in filenames via correct harness cmd; `/ce-code-review` etc. succeed; version visible in logs/plugin.json). This proved the 002 DoD and fidelity rule at scale.

- **Primary tree as canonical source of truth:** Mirror checkout used for initial full-CE dogfood/validation inside the target harness. Polished implementation (src, all tests including shared extensions, docs, plans, solutions) ported to primary. Explicit reconciliation + decision recorded in 002 plan and fidelity doc. Primary must satisfy full checklists for PR claim; "mirror for dogfood only."

- **Grok writer as self-contained layout exemplar (for targets preferring clean non-dotdir roots):** `src/targets/grok.ts` uses flat `<sanitized-plugin-name>/` layout (plugin.json + agents/*.md + skills/*/ + commands/ + .mcp.json), `copySkillDir(skill.sourceDir, targetDir, transformContentForGrok, true)` for full reference coverage (SKILL.md + all *.md under references/), agents pre-transformed by converter, cwd-hinted version + 4-line helpful console install guidance. No double-nesting issues. See `src/types/grok.ts` for bundle shape.

**Key practices summary for future targets:**
- Make transforms the primary artifact; keep explicit, table-driven, tested against *real* skill excerpts *early* (U3 before writer).
- Reconcile port notes into spec + minimal injection logic; keep official source tree 100% clean of target-specific pollution.
- Exercise the most complex real skills (e.g. `ce-code-review`'s dense tables and dispatch language) during readiness.
- Use the full pipeline (incl. document-review gates and final `ce-code-review`) even for meta-work such as "port the CE plugin itself."
- Primary tree + shared tests + live dogfood + recorded reconciliation = release-ready.

### Why This Matters

One-off `/plan` or skeleton-first approaches produce *functional but noisy and incomplete* output that pollutes the source tree (maintenance drag: every skill change requires re-auditing), creates ongoing fidelity debt, delays discovery of dispatch/env gaps until user dogfood or review, and blocks the repository from compounding its own knowledge via clean CE-process dogfood comparisons. The full CE process with explicit U3 readiness pass + transform-only fidelity rule + shared+dedicated tests + 002 polish + dogfood surfaces and hardens mappings while source remains single source of truth, produces a clean official tree, bakes in comprehensive testable contracts, and yields higher day-one usability for target users (working `spawn_subagent` + correct tool names + portable scripts + observable versions) at lower long-term cost.

It directly extends the canonical 6-phase architecture with proven evolved practices for complex cases and updates this doc (and AGENTS.md) so future targets start smarter.

### When to Apply

- When adding or porting a new converter target for a platform with non-trivial agent/subagent dispatch mechanics (e.g., `spawn_subagent` + `read_file` injection pattern for custom agents) and defensive environment/script handling requirements.
- When the documented "functional skeleton" anti-pattern (core wiring without hardened transforms and real-skill exercising) from this doc or the initial Grok skeleton review must be avoided.
- When the goal is a production-grade, maintainable, PR-ready target implementation (not a quick functional skeleton or one-off conversion).
- When dogfooding the CE process itself (full brainstorm + detailed plan with U3 readiness pass exercising complex skills such as `ce-code-review` + final `ce-code-review`) is feasible inside a clean mirror checkout to validate fidelity and enable head-to-head comparison against built-in planner output.
- For any high-stakes platform support where fidelity gaps (noisy duplicated port notes, incomplete transforms, frontmatter mismatches, broken variable references, target syntax leakage) would pollute the canonical `plugins/compound-engineering/` source or degrade end-user experience on install/marketplace.
- When the full `AGENTS.md` "Adding a New Target Provider" checklist plus the 6-phase pattern (this doc) is required for consistency — especially the "update tests alongside" and shared coverage mandates.
- Any time a conversion or mechanical mapping task involves 30+ real skills/agents/references/scripts with dense delegation patterns (shortcuts reliably miss coverage that only surfaces under `ce-code-review` or dogfood).
- Always enforce the transform-layer fidelity rule and U3a/U3b shared test placement for *every* new target (even simple ones); apply full pipeline + 002 polish + dogfood for complex ones.

### Examples

**Before (prior one-off `/plan` conversion inside Grok + skeleton):**
- Verbose "Grok port notes" and long "load agent definition and inject into spawn_subagent prompt" annotations duplicated across dozens of reference files, tables, and ce-*-reviewer lines (legacy noise in installed copy and initial skeleton).
- Ad-hoc or incomplete tool/env/script rewriting (inconsistent `Task`/`Bash`/`Read` handling; `CLAUDE_*` variables not uniformly rewritten with defensive fallbacks).
- Agent frontmatter gaps or leakage of Claude-specific fields; no explicit table-driven mapping to `prompt_mode: "full"`, `permission_mode: "default"`, `agents_md: true`, `model: "inherit"`.
- Transform coverage gaps only discovered later; no dedicated `grok-content.test.ts` exercising real `ce-code-review` excerpts during development; date-stamping instructions with target-specific `run_terminal_command` syntax leaked into universal `ce-plan/SKILL.md` (breaking portability for `--to gemini` etc.).
- Result: working layout but high-risk dispatch and portability issues; source pollution; no official ownership or auto-validation; blocked clean dogfood comparison.

**After (full CE process in clean test mirror + U3 readiness + 002 polish + primary reconciliation + 003 dogfood):**
- Official source tree remains 100% clean: "Official source (plugins/compound-engineering/skills/** and agents/) contains ZERO Grok/port notes (clean)." (U3 findings comment + contract in `grok-content.ts`).
- Explicit, authoritative `CLAUDE_TO_GROK_TOOLS` table + `rewriteTaskAndAgentCalls` (hardened, 5+ specific patterns + generic fallback) exercised against real CE excerpts (see `tests/grok-content.test.ts`).
- Minimal central `GROK_AGENT_INJECTION_NOTE` injected only via `shouldInjectGrokAgentNote` for heavy delegation content; full recipe/tool table/env vars/frontmatter table/loading pattern centralized in `docs/specs/grok.md`.
- Defensive `${GROK_PLUGIN_ROOT:-.}` rewriting for all `CLAUDE_*` vars while preserving the exact fallback style used across CE skills/scripts.
- Proper Grok agent frontmatter always emitted by `convertAgent` (explicit mapping in `claude-to-grok.ts`); self-contained writer layout (`src/targets/grok.ts`) with correct `plugin.json`, agents dir, `copySkillDir(..., transformContentForGrok, true)`.
- Comprehensive tests (dedicated + shared `converter.test.ts` + `cli.test.ts` per U3a), `release:validate` green, cwd-aware observable dev version (sha visible in plugin.json + logs), successful dogfood of full CE workflows (`ce-brainstorm` → `ce-plan` (real wall-clock dated plans) → `ce-code-review` → `ce-compound` + specialized agents + dispatch) inside real Grok TUI; final `ce-code-review` verdict "Ready to PR" after dispatch rewriter refactor and test strengthening.
- Primary tree is the single source of truth (explicit snapshot reconciliation recorded in 002 plan; mirror used only for dogfood).

The difference is mechanical, observable, and directly attributable to exercising real complex skills during U3 *before* the writer, the transform-only fidelity rule, mandatory shared test coverage, 002 polish, and live dogfood as final arbiter.

### Related

- [best-practices/full-ce-process-grok-converter-target-fidelity.md](../best-practices/full-ce-process-grok-converter-target-fidelity.md) — The canonical detailed primary source for the Grok work (001/002/003 units, before/after, refresh candidates including this doc at high priority, U3 findings). Incorporates all session-derived insights from the full CE execution.
- [docs/specs/grok.md](../specs/grok.md) — Grok target format spec (self-contained layout details, frontmatter table, agent loading pattern, install UX). Last verified post-002 + U3a closure.
- AGENTS.md — "Adding a New Target Provider" checklist (explicitly references shared test coverage in converter.test.ts + cli.test.ts + "search `docs/solutions/` for the Grok converter target (including transform-layer rules and test placement lessons) before adding new target providers"); "Solutions" docs convention.
- [integrations/cross-platform-model-field-normalization-2026-03-29.md](../integrations/cross-platform-model-field-normalization-2026-03-29.md) — Model/agent/command frontmatter normalization and per-target behaviors (Grok row/behavior now relevant).
- [integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md](../integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md) — Path sanitization for writers + converter dedupe (critical for cross-platform fidelity; applies to Grok writer).
- [codex-skill-prompt-entrypoints.md](../codex-skill-prompt-entrypoints.md) — Converter rewrite rules and frontmatter patterns (generalized in high-fidelity Grok work).
- Other solutions in `skill-design/`, `workflow/`, `integrations/` as cross-refs for CE process and converter evolution.
- Concrete code: `src/utils/grok-content.ts` (transform layer + fidelity contract), `src/targets/grok.ts` (writer + version), `src/converters/claude-to-grok.ts` (frontmatter + transform calls), `tests/grok-*.test.ts` + extensions in `tests/converter.test.ts:531` and `tests/cli.test.ts:1481`, `docs/plans/2026-05-25-002-*.md` (release-readiness units + DoD + reconciliation).

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
- [ ] **For all targets (U3a/U3b mandate):** Add explicit spec coverage to the *shared* `tests/converter.test.ts` (mappings, frontmatter, bundle shape, resilience) and `tests/cli.test.ts` (`--to {target}` / `--also` cases for output tree + version + logs + success paths). Do not treat dedicated tests as a bypass for AGENTS.md item 4 / this doc's "update tests alongside" requirement. See Grok example at `tests/converter.test.ts:531` ("spec coverage per AGENTS.md checklist item 4 + 002 plan U3a") and `tests/cli.test.ts:1481`.
- [ ] Run full test suite: `bun test`
- [ ] Manual test: `bun run src/index.ts convert --to {target} ./plugins/compound-engineering`
- [ ] **For complex targets (non-trivial dispatch, 30+ skills, portability):** Apply the full high-fidelity patterns in the "High-Fidelity Patterns for Complex Targets" section above (full CE pipeline with U3 real-skill exercising *before* writer, transform-layer-only fidelity rule + contracts, 002 release-readiness polish for cwd-aware version/roundtrips/reconciliation/dogfood, primary-tree canonical after recorded decision). See Grok as exemplar + `best-practices/full-ce-process-grok-converter-target-fidelity.md`.

### Documentation
- [ ] Create `docs/specs/{target}.md` with format specification
- [ ] Update `README.md` with target in list and usage examples
- [ ] Do not hand-add release notes; release automation owns GitHub release notes and release-owned versions

### Version Bumping
- [ ] Use a conventional `feat:` or `fix:` title so release automation can infer the right bump
- [ ] Do not hand-start or hand-bump release-owned version lines in `package.json` or plugin manifests
- [ ] Run `bun run release:validate` if component counts or descriptions changed

---

## References

### Implementation Examples

**Reference implementations by priority (easiest to hardest):**

1. **Droid** (`src/targets/droid.ts`, `src/converters/claude-to-droid.ts`) — Simplest pattern, good learning baseline
2. **Copilot** (`src/targets/copilot.ts`, `src/converters/claude-to-copilot.ts`) — MCP prefixing, double-nesting guard
3. **Windsurf** (`src/targets/windsurf.ts`, `src/converters/claude-to-windsurf.ts`) — Rules-based conversion
4. **OpenCode** (`src/converters/claude-to-opencode.ts`) — Most comprehensive, handles command structure and config merging
5. **Grok** (`src/targets/grok.ts`, `src/converters/claude-to-grok.ts`, `src/utils/grok-content.ts`) — **High-fidelity exemplar** for complex targets: self-contained clean layout (no dotdir), transform-layer-only fidelity (date portability, dispatch rewriter, tool table, minimal injection), U3a/U3b shared+dedicated tests, cwd-aware observable versioning, full CE pipeline + 002/003 dogfood. Study this *and* the companion best-practice doc before any non-trivial target. Concrete: `copySkillDir(..., transformContentForGrok, true)`, explicit Grok agent frontmatter in converter, primary-tree canonical after reconciliation.

### Key Utilities

- `src/utils/frontmatter.ts` — `formatFrontmatter()` and `parseFrontmatter()`
- `src/utils/files.ts` — `writeText()`, `writeJson()`, `copyDir()`, `backupFile()`, `ensureDir()`
- `src/utils/resolve-home.ts` — `expandHome()` for `~/.{target}` path resolution

### Existing Tests

- `tests/copilot-writer.test.ts` — Writer tests with temp directories
- `tests/sync-copilot.test.ts` — Sync pattern with symlinks and config merge

---

## Related Files

- `plugins/compound-engineering/.claude-plugin/plugin.json` — Version and component counts
- `CHANGELOG.md` — Pointer to canonical GitHub release history
- `README.md` — Usage examples for all targets
- `docs/solutions/plugin-versioning-requirements.md` — Checklist for releases
- `docs/solutions/best-practices/full-ce-process-grok-converter-target-fidelity.md` — Primary detailed record + refresh notes for the high-fidelity Grok patterns (this doc was refreshed as part of the work)
