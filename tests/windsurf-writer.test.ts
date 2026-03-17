import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeWindsurfBundle } from "../src/targets/windsurf"
import type { WindsurfBundle } from "../src/types/windsurf"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const emptyBundle: WindsurfBundle = {
  agentSkills: [],
  commandWorkflows: [],
  skillDirs: [],
  mcpConfig: null,
}

describe("writeWindsurfBundle", () => {
  test("creates correct directory structure with all components", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-test-"))
    const bundle: WindsurfBundle = {
      agentSkills: [
        {
          name: "security-reviewer",
          content: "---\nname: security-reviewer\ndescription: Security-focused agent\n---\n\n# security-reviewer\n\nReview code for vulnerabilities.\n",
        },
      ],
      commandWorkflows: [
        {
          name: "workflows-plan",
          description: "Planning command",
          body: "> Arguments: [FOCUS]\n\nPlan the work.",
        },
      ],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      mcpConfig: {
        mcpServers: {
          local: { command: "echo", args: ["hello"] },
        },
      },
    }

    await writeWindsurfBundle(tempRoot, bundle)

    // No AGENTS.md — removed in v0.11.0
    expect(await exists(path.join(tempRoot, "AGENTS.md"))).toBe(false)

    // Agent skill written as skills/<name>/SKILL.md
    const agentSkillPath = path.join(tempRoot, "skills", "security-reviewer", "SKILL.md")
    expect(await exists(agentSkillPath)).toBe(true)
    const agentContent = await fs.readFile(agentSkillPath, "utf8")
    expect(agentContent).toContain("name: security-reviewer")
    expect(agentContent).toContain("description: Security-focused agent")
    expect(agentContent).toContain("Review code for vulnerabilities.")

    // No workflows/agents/ or workflows/commands/ subdirectories (flat per spec)
    expect(await exists(path.join(tempRoot, "workflows", "agents"))).toBe(false)
    expect(await exists(path.join(tempRoot, "workflows", "commands"))).toBe(false)

    // Command workflow flat in outputRoot/workflows/ (per spec)
    const cmdWorkflowPath = path.join(tempRoot, "workflows", "workflows-plan.md")
    expect(await exists(cmdWorkflowPath)).toBe(true)
    const cmdContent = await fs.readFile(cmdWorkflowPath, "utf8")
    expect(cmdContent).toContain("description: Planning command")
    expect(cmdContent).toContain("Plan the work.")

    // Copied skill directly in outputRoot/skills/
    expect(await exists(path.join(tempRoot, "skills", "skill-one", "SKILL.md"))).toBe(true)

    // MCP config directly in outputRoot/
    const mcpPath = path.join(tempRoot, "mcp_config.json")
    expect(await exists(mcpPath)).toBe(true)
    const mcpContent = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(mcpContent.mcpServers.local).toEqual({ command: "echo", args: ["hello"] })
  })

  test("writes directly into outputRoot without nesting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-direct-"))
    const bundle: WindsurfBundle = {
      ...emptyBundle,
      agentSkills: [
        {
          name: "reviewer",
          content: "---\nname: reviewer\ndescription: A reviewer\n---\n\n# reviewer\n\nReview content.\n",
        },
      ],
    }

    await writeWindsurfBundle(tempRoot, bundle)

    // Skill should be directly in outputRoot/skills/reviewer/SKILL.md
    expect(await exists(path.join(tempRoot, "skills", "reviewer", "SKILL.md"))).toBe(true)
    // Should NOT create a .windsurf subdirectory
    expect(await exists(path.join(tempRoot, ".windsurf"))).toBe(false)
  })

  test("handles empty bundle gracefully", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-empty-"))

    await writeWindsurfBundle(tempRoot, emptyBundle)
    expect(await exists(tempRoot)).toBe(true)
    // No mcp_config.json for null mcpConfig
    expect(await exists(path.join(tempRoot, "mcp_config.json"))).toBe(false)
  })

  test("path traversal in agent skill name is rejected", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-traversal-"))
    const bundle: WindsurfBundle = {
      ...emptyBundle,
      agentSkills: [
        { name: "../escape", content: "Bad content." },
      ],
    }

    expect(writeWindsurfBundle(tempRoot, bundle)).rejects.toThrow("unsafe path")
  })

  test("path traversal in command workflow name is rejected", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-traversal2-"))
    const bundle: WindsurfBundle = {
      ...emptyBundle,
      commandWorkflows: [
        { name: "../escape", description: "Malicious", body: "Bad content." },
      ],
    }

    expect(writeWindsurfBundle(tempRoot, bundle)).rejects.toThrow("unsafe path")
  })

  test("skill directory containment check prevents escape", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-skill-escape-"))
    const bundle: WindsurfBundle = {
      ...emptyBundle,
      skillDirs: [
        { name: "../escape", sourceDir: "/tmp/fake-skill" },
      ],
    }

    expect(writeWindsurfBundle(tempRoot, bundle)).rejects.toThrow("unsafe path")
  })

  test("agent skill files have YAML frontmatter with name and description", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-fm-"))
    const bundle: WindsurfBundle = {
      ...emptyBundle,
      agentSkills: [
        {
          name: "test-agent",
          content: "---\nname: test-agent\ndescription: Test agent description\n---\n\n# test-agent\n\nDo test things.\n",
        },
      ],
    }

    await writeWindsurfBundle(tempRoot, bundle)

    const skillPath = path.join(tempRoot, "skills", "test-agent", "SKILL.md")
    const content = await fs.readFile(skillPath, "utf8")
    expect(content).toContain("---")
    expect(content).toContain("name: test-agent")
    expect(content).toContain("description: Test agent description")
    expect(content).toContain("# test-agent")
    expect(content).toContain("Do test things.")
  })

  // MCP config merge tests

  test("writes mcp_config.json to outputRoot", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-mcp-"))
    const bundle: WindsurfBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcpServers: {
          myserver: { command: "serve", args: ["--port", "3000"] },
        },
      },
    }

    await writeWindsurfBundle(tempRoot, bundle)

    const mcpPath = path.join(tempRoot, "mcp_config.json")
    expect(await exists(mcpPath)).toBe(true)
    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcpServers.myserver.command).toBe("serve")
    expect(content.mcpServers.myserver.args).toEqual(["--port", "3000"])
  })

  test("merges with existing mcp_config.json preserving user servers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-merge-"))
    const mcpPath = path.join(tempRoot, "mcp_config.json")

    // Write existing config with a user server
    await fs.writeFile(mcpPath, JSON.stringify({
      mcpServers: {
        "user-server": { command: "my-tool", args: ["--flag"] },
      },
    }, null, 2))

    const bundle: WindsurfBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcpServers: {
          "plugin-server": { command: "plugin-tool" },
        },
      },
    }

    await writeWindsurfBundle(tempRoot, bundle)

    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    // Both servers should be present
    expect(content.mcpServers["user-server"].command).toBe("my-tool")
    expect(content.mcpServers["plugin-server"].command).toBe("plugin-tool")
  })

  test("backs up existing mcp_config.json before overwrite", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-backup-"))
    const mcpPath = path.join(tempRoot, "mcp_config.json")

    await fs.writeFile(mcpPath, '{"mcpServers":{}}')

    const bundle: WindsurfBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcpServers: { new: { command: "new-tool" } },
      },
    }

    await writeWindsurfBundle(tempRoot, bundle)

    // A backup file should exist
    const files = await fs.readdir(tempRoot)
    const backupFiles = files.filter((f) => f.startsWith("mcp_config.json.bak."))
    expect(backupFiles.length).toBeGreaterThanOrEqual(1)
  })

  test("handles corrupted existing mcp_config.json with warning", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-corrupt-"))
    const mcpPath = path.join(tempRoot, "mcp_config.json")

    await fs.writeFile(mcpPath, "not valid json{{{")

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...msgs: unknown[]) => warnings.push(msgs.map(String).join(" "))

    const bundle: WindsurfBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcpServers: { new: { command: "new-tool" } },
      },
    }

    await writeWindsurfBundle(tempRoot, bundle)
    console.warn = originalWarn

    expect(warnings.some((w) => w.includes("could not be parsed"))).toBe(true)
    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcpServers.new.command).toBe("new-tool")
  })

  test("handles existing mcp_config.json with array at root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-array-"))
    const mcpPath = path.join(tempRoot, "mcp_config.json")

    await fs.writeFile(mcpPath, "[1,2,3]")

    const bundle: WindsurfBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcpServers: { new: { command: "new-tool" } },
      },
    }

    await writeWindsurfBundle(tempRoot, bundle)

    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcpServers.new.command).toBe("new-tool")
    // Array root should be replaced with object
    expect(Array.isArray(content)).toBe(false)
  })

  test("preserves non-mcpServers keys in existing file", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-preserve-"))
    const mcpPath = path.join(tempRoot, "mcp_config.json")

    await fs.writeFile(mcpPath, JSON.stringify({
      customSetting: true,
      version: 2,
      mcpServers: { old: { command: "old-tool" } },
    }, null, 2))

    const bundle: WindsurfBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcpServers: { new: { command: "new-tool" } },
      },
    }

    await writeWindsurfBundle(tempRoot, bundle)

    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.customSetting).toBe(true)
    expect(content.version).toBe(2)
    expect(content.mcpServers.new.command).toBe("new-tool")
    expect(content.mcpServers.old.command).toBe("old-tool")
  })

  test("server name collision: plugin entry wins", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-collision-"))
    const mcpPath = path.join(tempRoot, "mcp_config.json")

    await fs.writeFile(mcpPath, JSON.stringify({
      mcpServers: { shared: { command: "old-version" } },
    }, null, 2))

    const bundle: WindsurfBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcpServers: { shared: { command: "new-version" } },
      },
    }

    await writeWindsurfBundle(tempRoot, bundle)

    const content = JSON.parse(await fs.readFile(mcpPath, "utf8"))
    expect(content.mcpServers.shared.command).toBe("new-version")
  })

  test("mcp_config.json written with restrictive permissions", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "windsurf-perms-"))
    const bundle: WindsurfBundle = {
      ...emptyBundle,
      mcpConfig: {
        mcpServers: { server: { command: "tool" } },
      },
    }

    await writeWindsurfBundle(tempRoot, bundle)

    const mcpPath = path.join(tempRoot, "mcp_config.json")
    const stat = await fs.stat(mcpPath)
    // On Unix: 0o600 = owner read+write only. On Windows, permissions work differently.
    if (process.platform !== "win32") {
      const mode = stat.mode & 0o777
      expect(mode).toBe(0o600)
    }
  })
})
