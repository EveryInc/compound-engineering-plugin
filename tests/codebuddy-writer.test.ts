import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { mergeCodeBuddyConfig, mergeCodeBuddyHooks, renderCodeBuddyMcpConfig, writeCodeBuddyBundle } from "../src/targets/codebuddy"
import type { CodeBuddyBundle } from "../src/types/codebuddy"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("renderCodeBuddyMcpConfig", () => {
  test("returns null for undefined MCP servers", () => {
    expect(renderCodeBuddyMcpConfig(undefined)).toBeNull()
  })

  test("returns null for empty MCP servers", () => {
    expect(renderCodeBuddyMcpConfig({})).toBeNull()
  })

  test("renders MCP servers as JSON", () => {
    const result = renderCodeBuddyMcpConfig({
      local: { command: "echo", args: ["hello"] },
    })
    expect(result).not.toBeNull()
    const parsed = JSON.parse(result!)
    expect(parsed.mcpServers.local.command).toBe("echo")
    expect(parsed.mcpServers.local.args).toEqual(["hello"])
  })

  test("renders URL-based MCP servers", () => {
    const result = renderCodeBuddyMcpConfig({
      remote: { url: "https://example.com/mcp" },
    })
    expect(result).not.toBeNull()
    const parsed = JSON.parse(result!)
    expect(parsed.mcpServers.remote.url).toBe("https://example.com/mcp")
  })

  test("skips MCP servers without command or url", () => {
    const result = renderCodeBuddyMcpConfig({
      invalid: {} as any,
    })
    expect(result).toBeNull()
  })
})

describe("mergeCodeBuddyConfig", () => {
  test("returns null for empty existing and null mcp", () => {
    expect(mergeCodeBuddyConfig("", null)).toBeNull()
  })

  test("preserves existing config when no MCP servers", () => {
    const existing = JSON.stringify({ theme: "dark" }, null, 2) + "\n"
    const result = mergeCodeBuddyConfig(existing, null)
    expect(result).not.toBeNull()
    const parsed = JSON.parse(result!)
    expect(parsed.theme).toBe("dark")
  })

  test("merges MCP servers into existing config", () => {
    const existing = JSON.stringify({ theme: "dark" }, null, 2) + "\n"
    const mcpJson = JSON.stringify({
      mcpServers: { local: { command: "echo", args: ["hello"] } },
    }, null, 2) + "\n"
    const result = mergeCodeBuddyConfig(existing, mcpJson)
    expect(result).not.toBeNull()
    const parsed = JSON.parse(result!)
    expect(parsed.theme).toBe("dark")
    expect(parsed.mcpServers.local.command).toBe("echo")
  })

  test("merges MCP servers by key, preserving non-plugin servers", () => {
    const existing = JSON.stringify({
      mcpServers: { old: { command: "old" } },
    }, null, 2) + "\n"
    const mcpJson = JSON.stringify({
      mcpServers: { new: { command: "new" } },
    }, null, 2) + "\n"
    const result = mergeCodeBuddyConfig(existing, mcpJson)
    const parsed = JSON.parse(result!)
    expect(parsed.mcpServers.old.command).toBe("old")
    expect(parsed.mcpServers.new.command).toBe("new")
  })

  test("new MCP server overrides existing server with same key", () => {
    const existing = JSON.stringify({
      mcpServers: { shared: { command: "old" } },
    }, null, 2) + "\n"
    const mcpJson = JSON.stringify({
      mcpServers: { shared: { command: "new" } },
    }, null, 2) + "\n"
    const result = mergeCodeBuddyConfig(existing, mcpJson)
    const parsed = JSON.parse(result!)
    expect(parsed.mcpServers.shared.command).toBe("new")
  })

  test("returns existing content when new config is invalid JSON", () => {
    const existing = JSON.stringify({ theme: "dark" }, null, 2) + "\n"
    const result = mergeCodeBuddyConfig(existing, "not json")
    expect(result).toBe(existing)
  })

  test("returns existing content when existing is invalid JSON", () => {
    const mcpJson = JSON.stringify({
      mcpServers: { local: { command: "echo" } },
    }, null, 2) + "\n"
    const result = mergeCodeBuddyConfig("not json", mcpJson)
    expect(result).toBe("not json")
  })
})

describe("mergeCodeBuddyHooks", () => {
  test("returns only plugin hooks when no existing hooks", () => {
    const result = mergeCodeBuddyHooks(null, {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo" }] }],
    }, "compound-engineering")
    expect(result.hooks).toBeDefined()
    const hooks = result.hooks as Record<string, unknown[]>
    expect(hooks.PreToolUse).toHaveLength(1)
  })

  test("merges plugin hooks with existing hooks", () => {
    const existing = {
      hooks: {
        PostToolUse: [{ matcher: "Read", hooks: [{ type: "command", command: "lint" }] }],
      },
    }
    const result = mergeCodeBuddyHooks(existing, {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo" }] }],
    }, "compound-engineering")
    const hooks = result.hooks as Record<string, unknown[]>
    expect(hooks.PostToolUse).toHaveLength(1)
    expect(hooks.PreToolUse).toHaveLength(1)
  })

  test("replaces plugin's own hooks on re-install", () => {
    const existing = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "old" }] }],
      },
      _managed: {
        "compound-engineering": { PreToolUse: [0] },
      },
    }
    const result = mergeCodeBuddyHooks(existing, {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "new" }] }],
    }, "compound-engineering")
    const hooks = result.hooks as Record<string, unknown[]>
    expect(hooks.PreToolUse).toHaveLength(1)
    const entry = hooks.PreToolUse[0] as { hooks: Array<{ command: string }> }
    expect(entry.hooks[0].command).toBe("new")
  })
})

describe("writeCodeBuddyBundle", () => {
  test("writes agent TOML file", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codebuddy-writer-"))
    const codebuddyRoot = path.join(tmpDir, ".codebuddy")

    const bundle: CodeBuddyBundle = {
      pluginName: "test-plugin",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [
        {
          name: "test-agent",
          description: "A test agent",
          instructions: "Do testing.",
        },
      ],
    }

    await writeCodeBuddyBundle(codebuddyRoot, bundle)

    const agentPath = path.join(codebuddyRoot, "agents", "test-plugin", "test-agent.toml")
    expect(await exists(agentPath)).toBe(true)

    const content = await fs.readFile(agentPath, "utf-8")
    expect(content).toContain('name = "test-agent"')
    expect(content).toContain('description = "A test agent"')
    expect(content).toContain('developer_instructions = "Do testing."')

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("writes prompts when present", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codebuddy-writer-"))
    const codebuddyRoot = path.join(tmpDir, ".codebuddy")

    const bundle: CodeBuddyBundle = {
      pluginName: "test-plugin",
      prompts: [
        { name: "my-prompt", content: "---\ndescription: Test\n---\n\nDo the thing.\n" },
      ],
      skillDirs: [],
      generatedSkills: [],
      agents: [],
    }

    await writeCodeBuddyBundle(codebuddyRoot, bundle)

    const promptPath = path.join(codebuddyRoot, "prompts", "my-prompt.md")
    expect(await exists(promptPath)).toBe(true)

    const content = await fs.readFile(promptPath, "utf-8")
    expect(content).toContain("Do the thing.")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("writes skills from skillDirs", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codebuddy-writer-"))
    const codebuddyRoot = path.join(tmpDir, ".codebuddy")

    // Create a source skill dir
    const sourceDir = path.join(tmpDir, "source-skill")
    await fs.mkdir(sourceDir, { recursive: true })
    await fs.writeFile(path.join(sourceDir, "SKILL.md"), "---\nname: my-skill\n---\n\n# My Skill\n")

    const bundle: CodeBuddyBundle = {
      pluginName: "test-plugin",
      prompts: [],
      skillDirs: [{ name: "my-skill", sourceDir }],
      generatedSkills: [],
      agents: [],
    }

    await writeCodeBuddyBundle(codebuddyRoot, bundle)

    const skillPath = path.join(codebuddyRoot, "skills", "test-plugin", "my-skill", "SKILL.md")
    expect(await exists(skillPath)).toBe(true)

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("writes generatedSkills", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codebuddy-writer-"))
    const codebuddyRoot = path.join(tmpDir, ".codebuddy")

    const bundle: CodeBuddyBundle = {
      pluginName: "test-plugin",
      prompts: [],
      skillDirs: [],
      generatedSkills: [
        { name: "gen-skill", content: "---\nname: gen-skill\n---\n\n# Generated\n" },
      ],
      agents: [],
    }

    await writeCodeBuddyBundle(codebuddyRoot, bundle)

    const skillPath = path.join(codebuddyRoot, "skills", "test-plugin", "gen-skill", "SKILL.md")
    expect(await exists(skillPath)).toBe(true)

    const content = await fs.readFile(skillPath, "utf-8")
    expect(content).toContain("# Generated")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("writes MCP config to settings.json", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codebuddy-writer-"))
    const codebuddyRoot = path.join(tmpDir, ".codebuddy")

    const bundle: CodeBuddyBundle = {
      pluginName: "test-plugin",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [],
      mcpServers: {
        local: { command: "echo", args: ["hello"] },
      },
    }

    await writeCodeBuddyBundle(codebuddyRoot, bundle)

    const settingsPath = path.join(codebuddyRoot, "settings.json")
    expect(await exists(settingsPath)).toBe(true)

    const content = await fs.readFile(settingsPath, "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed.mcpServers.local.command).toBe("echo")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("writes hooks.json when hooks present", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codebuddy-writer-"))
    const codebuddyRoot = path.join(tmpDir, ".codebuddy")

    const bundle: CodeBuddyBundle = {
      pluginName: "test-plugin",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      agents: [],
      hooks: {
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo" }] }],
        },
      },
    }

    await writeCodeBuddyBundle(codebuddyRoot, bundle)

    const hooksPath = path.join(codebuddyRoot, "hooks.json")
    expect(await exists(hooksPath)).toBe(true)

    const content = await fs.readFile(hooksPath, "utf-8")
    const parsed = JSON.parse(content)
    const hooks = parsed.hooks as Record<string, unknown[]>
    expect(hooks.PreToolUse).toHaveLength(1)

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("writes install manifest", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codebuddy-writer-"))
    const codebuddyRoot = path.join(tmpDir, ".codebuddy")

    const bundle: CodeBuddyBundle = {
      pluginName: "test-plugin",
      prompts: [{ name: "test-prompt", content: "---\ndescription: Test\n---\n\n# Test\n" }],
      skillDirs: [],
      generatedSkills: [{ name: "gen-skill", content: "---\nname: gen-skill\n---\n\n# Generated\n" }],
      agents: [{ name: "test-agent", description: "Agent", instructions: "Do." }],
    }

    await writeCodeBuddyBundle(codebuddyRoot, bundle)

    const manifestPath = path.join(codebuddyRoot, "test-plugin", "install-manifest.json")
    expect(await exists(manifestPath)).toBe(true)

    const content = await fs.readFile(manifestPath, "utf-8")
    const manifest = JSON.parse(content)
    expect(manifest.version).toBe(1)
    expect(manifest.pluginName).toBe("test-plugin")
    expect(manifest.prompts).toContain("test-prompt.md")
    expect(manifest.skills).toContain("gen-skill")
    expect(manifest.agents).toContain("test-agent.toml")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })
})
