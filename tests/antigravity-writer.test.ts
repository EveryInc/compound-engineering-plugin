import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { convertClaudeToAntigravity } from "../src/converters/claude-to-antigravity"
import { writeAntigravityBundle } from "../src/targets/antigravity"
import type { AntigravityBundle } from "../src/types/antigravity"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function baseBundle(overrides: Partial<AntigravityBundle> = {}): AntigravityBundle {
  return {
    pluginName: "compound-engineering",
    version: "2.0.0",
    generatedSkills: [],
    skillDirs: [],
    agents: [],
    commands: [],
    ...overrides,
  }
}

describe("writeAntigravityBundle", () => {
  test("writes a plugin.json manifest with name and version into .agy", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agy-test-"))
    await writeAntigravityBundle(tempRoot, baseBundle())

    const manifestPath = path.join(tempRoot, ".agy", "plugin.json")
    expect(await exists(manifestPath)).toBe(true)
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
    expect(manifest).toEqual({ name: "compound-engineering", version: "2.0.0" })
  })

  test("writes generated skills, agents, and commands", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agy-test-"))
    await writeAntigravityBundle(
      tempRoot,
      baseBundle({
        generatedSkills: [{ name: "hello", content: "---\nname: hello\ndescription: Hi\n---\n\n# Hello" }],
        agents: [{ name: "reviewer", content: "---\nname: reviewer\ndescription: R\n---\n\nReview." }],
        commands: [{ name: "workflows/plan", content: 'description = "Plan"\nprompt = """\ngo\n"""' }],
      }),
    )

    expect(await exists(path.join(tempRoot, ".agy", "skills", "hello", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".agy", "agents", "reviewer.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".agy", "commands", "workflows", "plan.toml"))).toBe(true)
  })

  test.each(["", "workflows"])("preserves colliding command output in namespace %p", async (namespace) => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agy-command-collision-"))
    try {
      const names = ["review.docs", "review-docs-2", "review-docs"]
      const bundle = convertClaudeToAntigravity({
        root: tempRoot,
        manifest: { name: "fixture", version: "1.0.0" },
        agents: [],
        skills: [],
        commands: names.map((name, index) => ({
          name: namespace ? `${namespace}:${name}` : name,
          description: `Command ${index}`,
          body: `Prompt ${index}.`,
          sourcePath: `${index}.md`,
        })),
      }, { agentMode: "subagent", inferTemperature: false, permissions: "none" })
      const expected = ["review-docs", "review-docs-2", "review-docs-3"]
      expect(bundle.commands.map((command) => command.name)).toEqual(
        expected.map((name) => namespace ? `${namespace}/${name}` : name),
      )

      await writeAntigravityBundle(tempRoot, bundle)
      const commandDir = path.join(tempRoot, ".agy", "commands", namespace)
      expect((await fs.readdir(commandDir)).sort()).toEqual(expected.map((name) => `${name}.toml`).sort())
      for (const [index, name] of expected.entries()) {
        const content = await fs.readFile(path.join(commandDir, `${name}.toml`), "utf8")
        expect(content).toContain(`description = "Command ${index}"`)
        expect(content).toContain(`prompt = """\nPrompt ${index}.\n"""`)
      }
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test("writes mcp_config.json with serverUrl only when servers exist", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agy-test-"))
    await writeAntigravityBundle(
      tempRoot,
      baseBundle({ mcpServers: { remote: { serverUrl: "https://example.com/mcp" } } }),
    )

    const mcpPath = path.join(tempRoot, ".agy", "mcp_config.json")
    expect(await exists(mcpPath)).toBe(true)
    const mcp = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(mcp.mcpServers.remote.serverUrl).toBe("https://example.com/mcp")
  })

  test("omits mcp_config.json and hooks.json when absent", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agy-test-"))
    await writeAntigravityBundle(tempRoot, baseBundle())

    expect(await exists(path.join(tempRoot, ".agy", "mcp_config.json"))).toBe(false)
    expect(await exists(path.join(tempRoot, ".agy", "hooks.json"))).toBe(false)
  })

  test("writes hooks.json wrapped in a hooks container when present", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agy-test-"))
    await writeAntigravityBundle(
      tempRoot,
      baseBundle({ hooks: { PreToolUse: [{ matcher: "*", hooks: [] }] } }),
    )

    const hooksPath = path.join(tempRoot, ".agy", "hooks.json")
    expect(await exists(hooksPath)).toBe(true)
    const hooks = JSON.parse(await fs.readFile(hooksPath, "utf8"))
    expect(hooks.hooks.PreToolUse).toBeDefined()
  })

  test("treats an output root already named .agy as the bundle dir", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agy-test-"))
    const agyRoot = path.join(tempRoot, ".agy")
    await fs.mkdir(agyRoot, { recursive: true })
    await writeAntigravityBundle(agyRoot, baseBundle())

    expect(await exists(path.join(agyRoot, "plugin.json"))).toBe(true)
    expect(await exists(path.join(agyRoot, ".agy"))).toBe(false)
  })
})
