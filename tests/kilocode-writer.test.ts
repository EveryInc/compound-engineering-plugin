import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeKiloCodeBundle, resolveKiloCodePaths } from "../src/targets/kilocode"
import type { KiloCodeBundle } from "../src/types/kilocode"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const emptyBundle: KiloCodeBundle = {
  agents: [],
  skillDirs: [],
  mcpConfig: {},
}

describe("writeKiloCodeBundle", () => {
  test("creates correct directory structure with all components", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-test-"))
    const bundle: KiloCodeBundle = {
      agents: [
        {
          name: "security-reviewer",
          content: "---\nname: security-reviewer\ndescription: Security-focused agent\n---\n\n# security-reviewer\n\nReview code for vulnerabilities.\n",
        },
      ],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      mcpConfig: {
        mcp: {
          local: { type: "local", command: ["echo", "hello"] },
        },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".kilo"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".kilo", "agents"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".kilocode", "skills"))).toBe(true)

    const agentPath = path.join(tempRoot, ".kilo", "agents", "security-reviewer.md")
    expect(await exists(agentPath)).toBe(true)
    const agentContent = await fs.readFile(agentPath, "utf8")
    expect(agentContent).toContain("name: security-reviewer")
    expect(agentContent).toContain("description: Security-focused agent")
    expect(agentContent).toContain("Review code for vulnerabilities.")

    expect(await exists(path.join(tempRoot, ".kilocode", "skills", "skill-one", "SKILL.md"))).toBe(true)

    const mcpPath = path.join(tempRoot, "kilo.json")
    expect(await exists(mcpPath)).toBe(true)
    const mcpContent = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(mcpContent.mcp.local.type).toBe("local")
    expect(mcpContent.mcp.local.command).toEqual(["echo", "hello"])
  })

  test("writes agents to agents directory with .md extension", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-agents-"))
    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      agents: [
        {
          name: "code-reviewer",
          content: "---\nname: code-reviewer\n---\n\n# Code Reviewer\n\nReviews code.",
        },
        {
          name: "test-writer",
          content: "---\nname: test-writer\n---\n\n# Test Writer\n\nWrites tests.",
        },
      ],
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".kilo", "agents", "code-reviewer.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".kilo", "agents", "test-writer.md"))).toBe(true)

    const content = await fs.readFile(path.join(tempRoot, ".kilo", "agents", "code-reviewer.md"), "utf8")
    expect(content).toContain("name: code-reviewer")
  })

  test("writes skill directories by copying", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-skills-"))
    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".kilocode", "skills", "skill-one"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".kilocode", "skills", "skill-one", "SKILL.md"))).toBe(true)
  })

  test("writes MCP config to kilo.json with mcp key", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-mcp-"))
    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcp: {
          myserver: { type: "local", command: ["serve", "--port", "3000"] },
        },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    const mcpPath = path.join(tempRoot, "kilo.json")
    expect(await exists(mcpPath)).toBe(true)
    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcp.myserver.type).toBe("local")
    expect(content.mcp.myserver.command).toEqual(["serve", "--port", "3000"])
  })

  test("MCP config backup before overwrite", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-backup-"))
    const mcpPath = path.join(tempRoot, "kilo.json")

    await fs.writeFile(mcpPath, JSON.stringify({ mcp: {} }))

    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcp: { new: { type: "local", command: ["new-tool"] } },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    const files = await fs.readdir(tempRoot)
    const backupFiles = files.filter((f) => f.startsWith("kilo.json.bak."))
    expect(backupFiles.length).toBeGreaterThanOrEqual(1)
  })

  test("MCP config merge with existing preserving user servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-merge-"))
    const mcpPath = path.join(tempRoot, "kilo.json")

    await fs.writeFile(
      mcpPath,
      JSON.stringify({
        mcp: {
          "user-server": { type: "local", command: ["my-tool", "--flag"] },
        },
      }, null, 2),
    )

    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcp: {
          "plugin-server": { type: "local", command: ["plugin-tool"] },
        },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcp["user-server"].command).toEqual(["my-tool", "--flag"])
    expect(content.mcp["plugin-server"].command).toEqual(["plugin-tool"])
  })

  test("handles corrupted existing kilo.json with warning", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-corrupt-"))
    const mcpPath = path.join(tempRoot, "kilo.json")

    await fs.writeFile(mcpPath, "not valid json{{{")

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...msgs: unknown[]) => warnings.push(msgs.map(String).join(" "))

    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcp: { new: { type: "local", command: ["new-tool"] } },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)
    console.warn = originalWarn

    expect(warnings.some((w) => w.includes("could not be parsed"))).toBe(true)
    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcp.new.command).toEqual(["new-tool"])
  })

  test("preserves non-mcp keys in existing kilo.json", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-preserve-"))
    const mcpPath = path.join(tempRoot, "kilo.json")

    await fs.writeFile(
      mcpPath,
      JSON.stringify({
        customSetting: true,
        version: 2,
        mcp: { old: { type: "local", command: ["old-tool"] } },
      }, null, 2),
    )

    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcp: { new: { type: "local", command: ["new-tool"] } },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.customSetting).toBe(true)
    expect(content.version).toBe(2)
    expect(content.mcp.new.command).toEqual(["new-tool"])
    expect(content.mcp.old.command).toEqual(["old-tool"])
  })

  test("server name collision: plugin entry wins", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-collision-"))
    const mcpPath = path.join(tempRoot, "kilo.json")

    await fs.writeFile(
      mcpPath,
      JSON.stringify({
        mcp: { shared: { type: "local", command: ["old-version"] } },
      }, null, 2),
    )

    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcp: { shared: { type: "local", command: ["new-version"] } },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcp.shared.command).toEqual(["new-version"])
  })

  test("kilo.json written with restrictive permissions (0o600)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-perms-"))
    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcp: { server: { type: "local", command: ["tool"] } },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    const mcpPath = path.join(tempRoot, "kilo.json")
    const stat = await fs.stat(mcpPath)
    if (process.platform !== "win32") {
      const mode = stat.mode & 0o777
      expect(mode).toBe(0o600)
    }
  })

  test("handles empty bundle gracefully", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-empty-"))

    await writeKiloCodeBundle(tempRoot, emptyBundle)
    expect(await exists(tempRoot)).toBe(true)
    expect(await exists(path.join(tempRoot, "kilo.json"))).toBe(false)
  })

  test("path traversal in agent name is rejected", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-traversal-"))
    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      agents: [{ name: "../escape", content: "Bad content." }],
    }

    expect(writeKiloCodeBundle(tempRoot, bundle)).rejects.toThrow("unsafe path")
  })

  test("path traversal in skill directory name is rejected", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-skill-escape-"))
    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      skillDirs: [{ name: "../escape", sourceDir: "/tmp/fake-skill" }],
    }

    expect(writeKiloCodeBundle(tempRoot, bundle)).rejects.toThrow("unsafe path")
  })

  test("handles existing kilo.json with array at root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-array-"))
    const mcpPath = path.join(tempRoot, "kilo.json")

    await fs.writeFile(mcpPath, "[1,2,3]")

    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcp: { new: { type: "local", command: ["new-tool"] } },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcp.new.command).toEqual(["new-tool"])
    expect(Array.isArray(content)).toBe(false)
  })

  test("handles existing kilo.json with mcp as array", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-mcp-array-"))
    const mcpPath = path.join(tempRoot, "kilo.json")

    await fs.writeFile(mcpPath, JSON.stringify({ mcp: [1, 2, 3] }, null, 2))

    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcp: { new: { type: "local", command: ["new-tool"] } },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcp.new.command).toEqual(["new-tool"])
  })

  test("does not write kilo.json when mcpConfig.mcp is empty", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-no-mcp-"))
    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: { mcp: {} },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, "kilo.json"))).toBe(false)
  })

  test("writes remote MCP server config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-remote-"))
    const bundle: KiloCodeBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcp: {
          remote: {
            type: "remote",
            url: "https://mcp.example.com/mcp",
            headers: { Authorization: "Bearer token" },
          },
        },
      },
    }

    await writeKiloCodeBundle(tempRoot, bundle)

    const mcpPath = path.join(tempRoot, "kilo.json")
    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcp.remote.type).toBe("remote")
    expect(content.mcp.remote.url).toBe("https://mcp.example.com/mcp")
    expect(content.mcp.remote.headers.Authorization).toBe("Bearer token")
  })
})

describe("resolveKiloCodePaths", () => {
  test("workspace scope paths resolve correctly", () => {
    const outputRoot = "/project/root"
    const paths = resolveKiloCodePaths(outputRoot, "workspace")

    expect(paths.configDir).toBe("/project/root/.kilo")
    expect(paths.agentsDir).toBe("/project/root/.kilo/agents")
    expect(paths.skillsDir).toBe("/project/root/.kilocode/skills")
    expect(paths.mcpPath).toBe("/project/root/kilo.json")
  })

  test("global scope paths resolve correctly", () => {
    const outputRoot = "/project/root"
    const originalHome = process.env.HOME
    process.env.HOME = "/home/testuser"

    const paths = resolveKiloCodePaths(outputRoot, "global")

    expect(paths.configDir).toBe("/home/testuser/.config/kilo")
    expect(paths.agentsDir).toBe("/home/testuser/.config/kilo/agents")
    expect(paths.skillsDir).toBe("/home/testuser/.kilocode/skills")
    expect(paths.mcpPath).toBe("/home/testuser/.config/kilo/kilo.json")

    process.env.HOME = originalHome
  })

  test("defaults to workspace scope when scope is undefined", () => {
    const outputRoot = "/project/root"
    const paths = resolveKiloCodePaths(outputRoot)

    expect(paths.configDir).toBe("/project/root/.kilo")
    expect(paths.agentsDir).toBe("/project/root/.kilo/agents")
    expect(paths.skillsDir).toBe("/project/root/.kilocode/skills")
    expect(paths.mcpPath).toBe("/project/root/kilo.json")
  })

  test("global scope falls back to USERPROFILE when HOME is not set", () => {
    const originalHome = process.env.HOME
    const originalUserprofile = process.env.USERPROFILE
    delete process.env.HOME
    process.env.USERPROFILE = "C:\\Users\\testuser"

    const paths = resolveKiloCodePaths("/project/root", "global")

    expect(paths.configDir).toContain("testuser")
    expect(paths.configDir).toContain(".config")
    expect(paths.configDir).toContain("kilo")

    process.env.HOME = originalHome
    process.env.USERPROFILE = originalUserprofile
  })
})
