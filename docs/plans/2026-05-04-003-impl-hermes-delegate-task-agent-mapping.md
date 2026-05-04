# Map CE agents to Hermes delegate_task — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Refit the Hermes target so CE agents map to `delegate_task` calls instead of generated skills, preserving parallel dispatch semantics. Agents emit as payload files; orchestrator skills get body rewrites that point at `delegate_task`.

**Architecture:** Two-layer change: (1) converter drops agent-as-skill emit and produces `HermesAgentPayload` objects with `delegate_task`-shaped body rewrites; (2) writer materializes payloads to `~/.hermes/<pluginName>/agents/<name>.md` and tracks them in the install manifest under `agent_payloads`. Commands remain as `cmd-*` skills unchanged.

**Tech Stack:** TypeScript, Bun, js-yaml. Existing helpers: `copySkillDir`, `cleanupRemovedManagedDirectories`, `cleanupRemovedManagedFiles`, `isSafeManagedPath`, `sanitizePathName`.

---

## Task 1: Add HermesAgentPayload type and extend HermesBundle

**Objective:** Define the new payload type and add it to the bundle. Remove `"agent"` from `HermesGeneratedSkill.kind`.

**Files:**
- Modify: `src/types/hermes.ts`

**Step 1: Add HermesAgentPayload interface**

```ts
export interface HermesAgentPayload {
  name: string
  content: string
  toolsets: string[]
}
```

**Step 2: Extend HermesBundle**

```ts
export type HermesBundle = {
  pluginName?: string
  passthroughSkills: HermesPassthroughSkill[]
  generatedSkills: HermesGeneratedSkill[]
  agentPayloads: HermesAgentPayload[]
  mcpConfig?: HermesMcpConfig
  droppedCommands: string[]
  skippedMcpServers: string[]
}
```

**Step 3: Narrow HermesGeneratedSkill.kind**

```ts
export type HermesGeneratedSkill = {
  name: string
  content: string
  kind: "command"
}
```

**Step 4: Verify compilation**

Run: `bun tsc --noEmit`
Expected: Type errors in U2/U3 call sites (expected — fix in subsequent tasks).

**Step 5: Commit**

```bash
git add src/types/hermes.ts
git commit -m "feat(hermes): add HermesAgentPayload type and extend bundle"
```

---

## Task 2: Add makeHermesContentTransformer factory and update transformContentForHermes

**Objective:** Change `transformContentForHermes` from a plain function to a factory that accepts `pluginName` and returns a `(body: string) => string` transform. This preserves the `copySkillDir` callback shape while threading `pluginName` into the Task rewrite.

**Files:**
- Modify: `src/converters/claude-to-hermes.ts`

**Step 1: Rename and restructure**

```ts
// Old: export function transformContentForHermes(body: string): string
// New:
export function makeHermesContentTransformer(pluginName: string): (body: string) => string {
  return function transformContentForHermes(body: string): string {
    let result = body
    // ... existing transforms 2-5 stay unchanged ...
    // Transform 1 (Task rewrite) now uses pluginName from closure
    // ...
    return result
  }
}
```

**Step 2: Update Task rewrite to produce delegate_task prose**

Inside the replacement function (transform 1):

```ts
const payloadPath = `~/.hermes/${pluginName}/agents/${agentName}.md`
const trimmedArgs = args.trim().replace(/\s+/g, " ")
const goalHint = trimmedArgs
  ? `Set \`goal\` to: ${trimmedArgs}.`
  : `Set \`goal\` to a one-line summary of the requested work.`
return `${prefix}Delegate to the \`${agentName}\` agent via the \`delegate_task\` tool. Read the agent's prompt at \`${payloadPath}\` and use it as the \`context\` argument. ${goalHint} Use the toolsets declared in the payload's frontmatter.`
```

**Step 3: Add parallel-batch detection as second pass**

After the per-line Task substitution, add:

```ts
// Detect consecutive delegate lines and add batch trailer when parallel context exists
const delegateLinePattern = /^(\s*-?\s*)Delegate to the `[^`]+` agent[^\n]*$/gm
// Look for runs of 2+ consecutive delegate lines preceded by "in parallel" trigger
// within 3 lines. If found, append batch trailer once after the run.
```

Keep the detection conservative: require explicit "in parallel" / "concurrently" / "in a batch" within 3 lines before the run, AND 2+ consecutive delegate lines.

**Step 4: Export backward-compat alias**

```ts
// For tests that call transformContentForHermes(body) directly:
export const transformContentForHermes = makeHermesContentTransformer("compound-engineering")
```

Actually — better: don't export a default. Update all test call sites to use the factory. Remove the direct export.

**Step 5: Update all internal call sites in claude-to-hermes.ts**

- `convertCommand`: use `makeHermesContentTransformer(plugin.manifest.name)`
- `convertAgentPayload`: use the same factory
- Passthrough skills in writer: use `makeHermesContentTransformer(bundle.pluginName ?? "compound-engineering")`

**Step 6: Verify compilation**

Run: `bun tsc --noEmit`
Expected: Clean (no errors).

**Step 7: Commit**

```bash
git add src/converters/claude-to-hermes.ts
git commit -m "feat(hermes): add makeHermesContentTransformer with delegate_task rewrite"
```

---

## Task 3: Replace convertAgent with convertAgentPayload

**Objective:** Remove agent-as-skill emit. Add agent → payload conversion with toolset mapping.

**Files:**
- Modify: `src/converters/claude-to-hermes.ts`

**Step 1: Remove agent loop from generatedSkills**

Delete lines 63-65:
```ts
for (const agent of plugin.agents) {
  generatedSkills.push(convertAgent(agent, plugin, usedSkillNames))
}
```

**Step 2: Add agentPayloads array and separate dedup Set**

```ts
const agentPayloads: HermesAgentPayload[] = []
const usedPayloadNames = new Set<string>()

for (const agent of plugin.agents) {
  agentPayloads.push(convertAgentPayload(agent, plugin, usedPayloadNames))
}
```

**Step 3: Delete convertAgent function (lines 112-145)**

**Step 4: Add convertAgentPayload function**

```ts
function convertAgentPayload(
  agent: ClaudeAgent,
  plugin: ClaudePlugin,
  usedNames: Set<string>,
): HermesAgentPayload {
  const name = uniqueName(sanitizeHermesName(agent.name), usedNames)
  const description = sanitizeDescription(
    agent.description ?? `Converted from Claude agent ${agent.name}`,
  )

  // Map tools → toolsets
  const toolsets = mapAgentToolsToToolsets(agent.tools)

  const frontmatterLines = [
    "---",
    `name: ${name}`,
    `description: ${formatYamlValue(description)}`,
  ]
  if (plugin.manifest.version !== undefined) {
    frontmatterLines.push(`version: ${JSON.stringify(plugin.manifest.version)}`)
  }
  frontmatterLines.push("metadata:")
  frontmatterLines.push("  compound-engineering:")
  frontmatterLines.push("    kind: agent")
  frontmatterLines.push("    toolsets:")
  for (const ts of toolsets) {
    frontmatterLines.push(`      - ${ts}`)
  }
  frontmatterLines.push("---")
  const frontmatter = frontmatterLines.join("\n")

  const sections: string[] = []
  if (agent.capabilities && agent.capabilities.length > 0) {
    const items = agent.capabilities.map((c) => `- ${c}`).join("\n")
    sections.push(`## Capabilities\n${items}`)
  }

  const originalBody = agent.body.trim().length > 0
    ? agent.body.trim()
    : `Instructions converted from the ${agent.name} agent.`

  const combined = [...sections, originalBody].join("\n\n")
  const transform = makeHermesContentTransformer(plugin.manifest.name)
  const body = transform(combined)

  const content = `${frontmatter}\n\n${body}`.trimEnd() + "\n"

  return { name, content, toolsets }
}
```

**Step 5: Add mapAgentToolsToToolsets helper**

```ts
function mapAgentToolsToToolsets(tools: string | string[] | undefined): string[] {
  if (tools === "inherit" || tools === undefined || (Array.isArray(tools) && tools.length === 0)) {
    return ["file", "terminal"]
  }
  const input = Array.isArray(tools) ? tools : [tools]
  const toolsets = new Set<string>()
  for (const tool of input) {
    switch (tool) {
      case "Read":
      case "Write":
      case "Edit":
      case "MultiEdit":
      case "Glob":
      case "Grep":
        toolsets.add("file")
        break
      case "Bash":
        toolsets.add("terminal")
        break
      case "WebFetch":
      case "WebSearch":
        toolsets.add("web")
        break
      case "Task":
        toolsets.add("delegation")
        break
      default:
        if (tool.startsWith("mcp__")) {
          const parts = tool.split("__")
          if (parts.length >= 2) {
            toolsets.add(`mcp:${parts[1]}`)
          }
        }
        break
    }
  }
  return Array.from(toolsets).length > 0 ? Array.from(toolsets) : ["file", "terminal"]
}
```

**Step 6: Thread agentPayloads through bundle return**

```ts
return {
  pluginName: plugin.manifest.name,
  passthroughSkills,
  generatedSkills,
  agentPayloads,
  mcpConfig,
  droppedCommands,
  skippedMcpServers,
}
```

**Step 7: Verify compilation**

Run: `bun tsc --noEmit`
Expected: Clean.

**Step 8: Commit**

```bash
git add src/converters/claude-to-hermes.ts
git commit -m "feat(hermes): convert agents to payloads instead of skills"
```

---

## Task 4: Update converter tests — flip agent assertions to payload assertions

**Objective:** All existing tests that assert agent-as-skill must now assert agent-as-payload. Add new tests for delegate_task rewrite and toolset mapping.

**Files:**
- Modify: `tests/hermes-converter.test.ts`

**Step 1: Update test "agent body Task call also rewrites"**

Old assertion:
```ts
const agent = bundle.generatedSkills.find((s) => s.kind === "agent")!
expect(agent.name).toBe("agent-orchestrator")
expect(parsed.body).toContain("Use the ce-foo skill to: args")
```

New assertion:
```ts
expect(bundle.agentPayloads).toHaveLength(1)
const payload = bundle.agentPayloads[0]
expect(payload.name).toBe("orchestrator")
expect(payload.content).toContain("Delegate to the `ce-foo` agent via the `delegate_task` tool")
expect(payload.content).toContain("~/.hermes/fixture-plugin/agents/ce-foo.md")
expect(payload.content).toContain("Set `goal` to: args")
```

**Step 2: Update test "agent capabilities fold into Capabilities section"**

Old:
```ts
const agent = bundle.generatedSkills[0]
expect(agent.name).toBe("agent-research-analyst")
expect(parsed.body.trim()).toBe("## Capabilities\n- a\n- b\n- c\n\nAnalyst body.")
```

New:
```ts
const payload = bundle.agentPayloads[0]
expect(payload.name).toBe("research-analyst")
expect(payload.content).toContain("## Capabilities")
expect(payload.content).toContain("- a")
expect(payload.content).toContain("metadata:\n  compound-engineering:\n    kind: agent")
```

**Step 3: Update test "agent with no description gets fallback"**

Old:
```ts
const parsed = parseFrontmatter(bundle.generatedSkills[0].content)
expect(parsed.data.description).toBe("Converted from Claude agent lone-agent")
```

New:
```ts
const payload = bundle.agentPayloads[0]
expect(payload.content).toContain("description: \"Converted from Claude agent lone-agent\"")
```

**Step 4: Update test "agent.model is dropped"**

Old:
```ts
const generated = bundle.generatedSkills[0]
expect(generated.content).not.toContain("\nmodel:")
```

New:
```ts
const payload = bundle.agentPayloads[0]
expect(payload.content).not.toContain("\nmodel:")
```

**Step 5: Update test "collision: two agents both normalize to code-reviewer"**

Old:
```ts
const names = bundle.generatedSkills.map((s) => s.name)
expect(names).toEqual(["agent-code-reviewer", "agent-code-reviewer-2"])
```

New:
```ts
const names = bundle.agentPayloads.map((p) => p.name)
expect(names).toEqual(["code-reviewer", "code-reviewer-2"])
```

**Step 6: Add new test — no generatedSkills with kind "agent"**

```ts
test("agent conversion produces zero generatedSkills — agents are fully moved to payloads", () => {
  const plugin = makePlugin({
    agents: [
      { name: "reviewer", description: "R", body: "B.", sourcePath: "/tmp/a.md" },
    ],
  })
  const bundle = convertClaudeToHermes(plugin, baseOptions)!
  expect(bundle.generatedSkills.filter((s) => s.name.startsWith("agent-"))).toHaveLength(0)
  expect(bundle.agentPayloads).toHaveLength(1)
})
```

**Step 7: Add new test — Task rewrite with empty args**

```ts
test("Task ce-foo() with empty args uses goal fallback", () => {
  const transform = makeHermesContentTransformer("compound-engineering")
  const result = transform("Task ce-foo()")
  expect(result).toContain("Delegate to the `ce-foo` agent via the `delegate_task` tool")
  expect(result).toContain("Set `goal` to a one-line summary of the requested work")
})
```

**Step 8: Add new test — parallel batch detection**

```ts
test("parallel Task lines get batch trailer", () => {
  const transform = makeHermesContentTransformer("compound-engineering")
  const input = `Run these agents in parallel:
- Task ce-a(x)
- Task ce-b(y)`
  const result = transform(input)
  expect(result).toContain("Delegate to the `ce-a` agent")
  expect(result).toContain("Delegate to the `ce-b` agent")
  expect(result).toContain("delegate_task(tasks=[...])")
})
```

**Step 9: Add new test — non-parallel lines get no batch trailer**

```ts
test("non-parallel consecutive Task lines do NOT get batch trailer", () => {
  const transform = makeHermesContentTransformer("compound-engineering")
  const input = `- Task ce-a(x)
- Task ce-b(y)`
  const result = transform(input)
  expect(result).toContain("Delegate to the `ce-a` agent")
  expect(result).toContain("Delegate to the `ce-b` agent")
  expect(result).not.toContain("delegate_task(tasks=[...])")
})
```

**Step 10: Add new test — toolset mapping**

```ts
test("agent tools map to Hermes toolsets", () => {
  const plugin = makePlugin({
    agents: [
      {
        name: "tooly",
        description: "T",
        tools: ["Read", "Bash", "mcp__github__create_issue"],
        body: "B.",
        sourcePath: "/tmp/a.md",
      },
    ],
  })
  const bundle = convertClaudeToHermes(plugin, baseOptions)!
  expect(bundle.agentPayloads[0].toolsets).toEqual(["file", "terminal", "mcp:github"])
  expect(bundle.agentPayloads[0].content).toContain("- file")
  expect(bundle.agentPayloads[0].content).toContain("- terminal")
  expect(bundle.agentPayloads[0].content).toContain("- mcp:github")
})
```

**Step 11: Add new test — default toolsets when no tools field**

```ts
test("agent with no tools defaults to file+terminal", () => {
  const plugin = makePlugin({
    agents: [{ name: "bare", description: "B", body: "B.", sourcePath: "/tmp/a.md" }],
  })
  const bundle = convertClaudeToHermes(plugin, baseOptions)!
  expect(bundle.agentPayloads[0].toolsets).toEqual(["file", "terminal"])
})
```

**Step 12: Add new test — pluginName threaded into payload path**

```ts
test("payload path includes plugin name", () => {
  const transform = makeHermesContentTransformer("my-plugin")
  const result = transform("Task ce-foo(args)")
  expect(result).toContain("~/.hermes/my-plugin/agents/ce-foo.md")
})
```

**Step 13: Run tests**

Run: `bun test tests/hermes-converter.test.ts`
Expected: All pass.

**Step 14: Commit**

```bash
git add tests/hermes-converter.test.ts
git commit -m "test(hermes): flip agent assertions to payload, add delegate_task tests"
```

---

## Task 5: Update writer — add agentsDir, write payloads, extend manifest

**Objective:** Materialize agent payloads to disk, track in manifest, handle cleanup.

**Files:**
- Modify: `src/targets/hermes.ts`

**Step 1: Add agentsDir to HermesPaths and resolveHermesPaths**

```ts
type HermesPaths = {
  hermesDir: string
  managedDir: string
  skillsDir: string
  configPath: string
  agentsPath: string
  agentsDir: string
}
```

In both branches of `resolveHermesPaths`:
```ts
agentsDir: path.join(/* managedDir or equivalent */, "agents"),
```

Wait — `agentsDir` should be under `managedDir` (plugin-scoped), not under `skillsDir`. The managed dir is `<root>/.hermes/<pluginName>/`. So:

```ts
agentsDir: path.join(managedDir, "agents"),
```

**Step 2: Update AGENTS.md block text**

Replace the "Sub-agent dispatch" bullet (lines 51-54) with:

```
- **Sub-agent dispatch.** CE agents are stored as payload files at
  `~/.hermes/<pluginName>/agents/<name>.md`. Orchestrator skills that
  reference `Task ce-foo(args)` are rewritten to `delegate_task` invocations
  that read the payload as `context`. Parallel dispatch is preserved via
  `delegate_task(tasks=[...])` batches.
```

**Step 3: Update writeHermesBundle — add agent payload write loop**

After the generatedSkills write loop (line 193), before the MCP config block:

```ts
// Agent payloads
const currentAgentPayloads = bundle.agentPayloads.map((p) => p.name)
await cleanupRemovedManagedFiles(paths.agentsDir, manifest, "agent_payloads", currentAgentPayloads)
await ensureDir(paths.agentsDir)
for (const payload of bundle.agentPayloads) {
  const targetFile = path.join(paths.agentsDir, `${payload.name}.md`)
  if (!isSafeManagedPath(paths.agentsDir, targetFile)) continue
  await writeText(targetFile, payload.content)
}
```

**Step 4: Extend manifest write with agent_payloads group**

```ts
const ownedSkills = currentSkills.filter((name) => !blockedByOtherPlugin.has(name))
await writeManagedInstallManifest(paths.managedDir, {
  version: 1,
  pluginName,
  groups: {
    skills: ownedSkills,
    agent_payloads: currentAgentPayloads,
  },
})
```

**Step 5: Update cleanupHermesAtRoot to handle agent_payloads**

```ts
const agentPayloads = parsed.groups?.agent_payloads
if (Array.isArray(agentPayloads)) {
  for (const payloadName of agentPayloads) {
    if (typeof payloadName !== "string") continue
    const targetFile = path.join(paths.agentsDir, `${payloadName}.md`)
    if (await pathExists(targetFile)) {
      if (!(await isContainedAfterRealpath(paths.agentsDir, targetFile))) {
        console.warn(`Refusing to remove ${targetFile} for hermes cleanup: realpath escapes managed tree.`)
        continue
      }
      await fs.rm(targetFile, { force: true })
    }
  }
  // Remove agentsDir if empty
  if (await pathExists(paths.agentsDir)) {
    const remaining = await fs.readdir(paths.agentsDir)
    if (remaining.length === 0) {
      await fs.rm(paths.agentsDir, { recursive: true, force: true })
    }
  }
}
```

**Step 6: Update passthrough skill transform call**

Line 184:
```ts
// Old: await copySkillDir(skill.sourceDir, targetDir, transformContentForHermes)
// New:
const transform = makeHermesContentTransformer(bundle.pluginName ?? "compound-engineering")
await copySkillDir(skill.sourceDir, targetDir, transform)
```

Need to import `makeHermesContentTransformer` from the converter.

**Step 7: Verify compilation**

Run: `bun tsc --noEmit`
Expected: Clean.

**Step 8: Commit**

```bash
git add src/targets/hermes.ts
git commit -m "feat(hermes): write agent payloads, track in manifest, cleanup"
```

---

## Task 6: Update writer tests — add payload write assertions

**Objective:** Test the new writer behavior: payload files, manifest groups, cleanup.

**Files:**
- Modify: `tests/hermes-writer.test.ts`

**Step 1: Update emptyBundle helper**

```ts
function emptyBundle(overrides: Partial<HermesBundle> = {}): HermesBundle {
  return {
    pluginName: "compound-engineering",
    passthroughSkills: [],
    generatedSkills: [],
    agentPayloads: [],
    droppedCommands: [],
    skippedMcpServers: [],
    ...overrides,
  }
}
```

**Step 2: Update "full bundle materializes passthrough + generated skills" test**

Remove the `agent-reviewer` from `generatedSkills` in the test bundle. Add it as an `agentPayload` instead:

```ts
agentPayloads: [
  {
    name: "ce-reviewer",
    content: "---\nname: ce-reviewer\ndescription: Review\nversion: \"1.0.0\"\nmetadata:\n  compound-engineering:\n    kind: agent\n    toolsets:\n      - file\n      - terminal\n---\n\nReview body.\n",
    toolsets: ["file", "terminal"],
  },
],
```

Add assertions:
```ts
const payloadContent = await fs.readFile(
  path.join(tempRoot, ".hermes", "compound-engineering", "agents", "ce-reviewer.md"),
  "utf8",
)
expect(payloadContent).toContain("name: ce-reviewer")
expect(payloadContent).toContain("kind: agent")
```

Remove assertion for `agent-reviewer` skill dir.

**Step 3: Update manifest shape test**

Old:
```ts
expect(Object.keys(manifest.groups)).toEqual(["skills"])
```

New:
```ts
expect(Object.keys(manifest.groups).sort()).toEqual(["agent_payloads", "skills"])
expect(manifest.groups.agent_payloads).toContain("ce-reviewer")
```

**Step 4: Add new test — payload manifest-diff cleanup**

```ts
test("manifest-diff cleanup removes orphan agent payloads on reinstall", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-payload-clean-"))
  await writeHermesBundle(
    tempRoot,
    emptyBundle({
      agentPayloads: [
        { name: "a", content: "A", toolsets: ["file"] },
        { name: "b", content: "B", toolsets: ["file"] },
      ],
    }),
  )

  // Reinstall with only 'a'
  await writeHermesBundle(
    tempRoot,
    emptyBundle({
      agentPayloads: [{ name: "a", content: "A", toolsets: ["file"] }],
    }),
  )

  expect(await exists(path.join(tempRoot, ".hermes", "compound-engineering", "agents", "a.md"))).toBe(true)
  expect(await exists(path.join(tempRoot, ".hermes", "compound-engineering", "agents", "b.md"))).toBe(false)
})
```

**Step 5: Add new test — cleanup removes agent payloads**

Update the existing `cleanupHermesAtRoot` test or add a new one:

```ts
test("cleanupHermesAtRoot removes agent payloads", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-payload-clean-"))
  await writeHermesBundle(
    tempRoot,
    emptyBundle({
      agentPayloads: [{ name: "x", content: "X", toolsets: ["file"] }],
    }),
  )

  warnings.length = 0
  await cleanupHermesAtRoot(tempRoot)

  expect(await exists(path.join(tempRoot, ".hermes", "compound-engineering", "agents", "x.md"))).toBe(false)
})
```

**Step 6: Run tests**

Run: `bun test tests/hermes-writer.test.ts`
Expected: All pass.

**Step 7: Commit**

```bash
git add tests/hermes-writer.test.ts
git commit -m "test(hermes): add agent payload write and cleanup tests"
```

---

## Task 7: Update spec docs

**Objective:** Document the new agent-as-payload mapping in `docs/specs/hermes.md` and README.

**Files:**
- Modify: `docs/specs/hermes.md`
- Modify: `README.md`

**Step 1: Update hermes.md — Agents section**

Replace lines 90-94:

```markdown
## Agents

Agents do NOT emit as skills. They emit as **payload files** at `~/.hermes/<pluginName>/agents/<name>.md`.

Each payload is a markdown file with YAML frontmatter (`name`, `description`, `version`, `metadata.compound-engineering.{kind, toolsets}`) and a body that is the original Claude agent body run through `transformContentForHermes`.

Orchestrator skills that say `Task ce-foo(args)` in the source get rewritten to prose that instructs the host agent to call `delegate_task` with:
- `context` = the payload file content (or a `read_file` reference to it)
- `goal` = the args from the Task call
- `toolsets` = the toolsets declared in the payload frontmatter

Parallel dispatch is preserved via `delegate_task(tasks=[...])` when the surrounding prose declares "in parallel" or "in a batch".

Why payloads instead of skills? Hermes skills load into the host agent's context. Loading 8 reviewer personas into one context destroys the isolation guarantee that makes `/ce-code-review` fast and accurate. `delegate_task` gives each agent its own isolated session.
```

**Step 2: Update hermes.md — Passthrough vs generated skills table**

Drop the Agent row. The table now only has Passthrough skill and Command.

**Step 3: Update hermes.md — Body content rewrites table**

Replace the `Task <agent>(args)` row:

```markdown
| `Task <agent-name>(args)` | `Delegate to the \`<agent-name>\` agent via the \`delegate_task\` tool. Read the agent's prompt at \`~/.hermes/<pluginName>/agents/<agent-name>.md\` and use it as the \`context\` argument. Set \`goal\` to: args. Use the toolsets declared in the payload's frontmatter.` |
| `Task <agent-name>()` | Same, but `goal` falls back to "a one-line summary of the requested work" |
```

Add a note about the batch trailer:
```markdown
When 2+ consecutive `Task` lines appear within 3 lines of an "in parallel" / "concurrently" / "in a batch" trigger, a single batch trailer is appended after the last line: `(Use \`delegate_task(tasks=[...])\` to dispatch the agents above concurrently...)`.
```

**Step 4: Update hermes.md — Install manifest example**

Update the JSON example to include `agent_payloads`:

```json
{
  "version": 1,
  "pluginName": "compound-engineering",
  "groups": {
    "skills": ["cmd-ce-plan", "ce-code-review", "ce-doc-review"],
    "agent_payloads": ["ce-security-reviewer", "ce-performance-reviewer"]
  }
}
```

**Step 5: Update README.md — Hermes section**

Find the Hermes install section. Add one sentence:

```markdown
> **Agents on Hermes:** CE agents map to Hermes' `delegate_task` primitive (parallel sub-agents with isolated contexts). Commands still map to skills. See `docs/specs/hermes.md` for details.
```

**Step 6: Verify release:validate**

Run: `bun run release:validate`
Expected: Pass.

**Step 7: Commit**

```bash
git add docs/specs/hermes.md README.md
git commit -m "docs(hermes): document agent-as-payload mapping and delegate_task rewrite"
```

---

## Task 8: Full test suite verification

**Objective:** Ensure nothing is broken across the entire repo.

**Step 1: Run full test suite**

Run: `bun test`
Expected: All pass.

**Step 2: Run TypeScript check**

Run: `bun tsc --noEmit`
Expected: Clean.

**Step 3: Run release validation**

Run: `bun run release:validate`
Expected: Pass.

**Step 4: Verify fixture output**

Run a manual check on the sample-plugin fixture:
```bash
bun run convert --from claude --to hermes --plugin tests/fixtures/sample-plugin --out /tmp/hermes-verify
```

Inspect:
- `/tmp/hermes-verify/.hermes/skills/` — should have passthrough skills + `cmd-*` only, NO `agent-*`
- `/tmp/hermes-verify/.hermes/compound-engineering/agents/` — should have all agent payloads
- `/tmp/hermes-verify/.hermes/compound-engineering/install-manifest.json` — should have both `skills` and `agent_payloads` groups

**Step 5: Commit**

```bash
git commit -m "test(hermes): full suite verification passes"
```

---

## Verification Checklist

- [ ] `bun tsc --noEmit` — clean
- [ ] `bun test` — all pass
- [ ] `bun run release:validate` — pass
- [ ] Sample-plugin fixture: 0 `agent-*` skill dirs, N payload files in `agents/`
- [ ] Manifest has both `skills` and `agent_payloads` groups
- [ ] `cleanup --target hermes` removes both skills and payloads
- [ ] `docs/specs/hermes.md` updated and internally consistent
- [ ] README Hermes section mentions `delegate_task`
