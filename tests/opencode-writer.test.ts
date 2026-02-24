import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeOpenCodeBundle } from "../src/targets/opencode"
import type { OpenCodeBundle } from "../src/types/opencode"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("writeOpenCodeBundle", () => {
  test("writes config, agents, plugins, and skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-test-"))
    const bundle: OpenCodeBundle = {
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [{ name: "agent-one", content: "Agent content" }],
      plugins: [{ name: "hook.ts", content: "export {}" }],
      commandFiles: [],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
    }

    await writeOpenCodeBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, "opencode.json"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".opencode", "agents", "agent-one.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".opencode", "plugins", "hook.ts"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".opencode", "skills", "skill-one", "SKILL.md"))).toBe(true)
  })

  test("writes directly into a .opencode output root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-root-"))
    const outputRoot = path.join(tempRoot, ".opencode")
    const bundle: OpenCodeBundle = {
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [{ name: "agent-one", content: "Agent content" }],
      plugins: [],
      commandFiles: [],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
    }

    await writeOpenCodeBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "opencode.json"))).toBe(true)
    expect(await exists(path.join(outputRoot, "agents", "agent-one.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, ".opencode"))).toBe(false)
  })

  test("writes directly into ~/.config/opencode style output root", async () => {
    // Simulates the global install path: ~/.config/opencode
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "config-opencode-"))
    const outputRoot = path.join(tempRoot, ".config", "opencode")
    const bundle: OpenCodeBundle = {
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [{ name: "agent-one", content: "Agent content" }],
      plugins: [],
      commandFiles: [],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
    }

    await writeOpenCodeBundle(outputRoot, bundle)

    // Should write directly, not nested under .opencode
    expect(await exists(path.join(outputRoot, "opencode.json"))).toBe(true)
    expect(await exists(path.join(outputRoot, "agents", "agent-one.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, ".opencode"))).toBe(false)
  })

  test("merges plugin config into existing opencode.json without destroying user keys", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-backup-"))
    const outputRoot = path.join(tempRoot, ".opencode")
    const configPath = path.join(outputRoot, "opencode.json")

    // Create existing config with user keys
    await fs.mkdir(outputRoot, { recursive: true })
    const originalConfig = {
      $schema: "https://opencode.ai/config.json",
      model: "gpt-4o",
      mcp: { "existing-server": { type: "local", command: ["node", "server.js"], enabled: true } },
      command: { "my-cmd": { description: "My custom command", template: "echo hi" } },
    }
    await fs.writeFile(configPath, JSON.stringify(originalConfig, null, 2))

    // Bundle adds mcp server but keeps user's custom key
    const bundle: OpenCodeBundle = {
      config: {
        $schema: "https://opencode.ai/config.json",
        mcp: { "plugin-server": { type: "local", command: ["uvx", "plugin-srv"] } }
      },
      agents: [],
      plugins: [],
      commandFiles: [],
      skillDirs: [],
    }

    await writeOpenCodeBundle(outputRoot, bundle)

    // Merged config should have both user key and plugin key
    const newConfig = JSON.parse(await fs.readFile(configPath, "utf8"))
    expect(newConfig.model).toBe("gpt-4o")
    expect(newConfig.mcp).toBeDefined()
    expect(newConfig.mcp["plugin-server"]).toBeDefined()
    expect(newConfig.mcp["existing-server"]).toBeDefined()

    // Backup should exist with original content
    const files = await fs.readdir(outputRoot)
    const backupFileName = files.find((f) => f.startsWith("opencode.json.bak."))
    expect(backupFileName).toBeDefined()

    const backupContent = JSON.parse(await fs.readFile(path.join(outputRoot, backupFileName!), "utf8"))
    expect(backupContent.model).toBe("gpt-4o")
  })

  test("merges mcp servers without overwriting user entry", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-merge-mcp-"))
    const outputRoot = path.join(tempRoot, ".opencode")
    const configPath = path.join(outputRoot, "opencode.json")

    // Create existing config with user's mcp server
    await fs.mkdir(outputRoot, { recursive: true })
    const existingConfig = {
      mcp: { "user-server": { type: "local", command: ["uvx", "user-srv"] } }
    }
    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2))

    // Bundle adds plugin server AND has conflicting user-server with different args
    const bundle: OpenCodeBundle = {
      config: {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          "plugin-server": { type: "local", command: ["uvx", "plugin-srv"] },
          "user-server": { type: "local", command: ["uvx", "plugin-override"] }  // conflict
        }
      },
      agents: [],
      plugins: [],
      commandFiles: [],
      skillDirs: [],
    }

    await writeOpenCodeBundle(outputRoot, bundle)

    // Merged config should have both servers, with user-server keeping user's original args
    const mergedConfig = JSON.parse(await fs.readFile(configPath, "utf8"))
    expect(mergedConfig.mcp).toBeDefined()
    expect(mergedConfig.mcp["plugin-server"]).toBeDefined()
    expect(mergedConfig.mcp["user-server"]).toBeDefined()
    expect(mergedConfig.mcp["user-server"].command[1]).toBe("user-srv")  // user wins on conflict
    expect(mergedConfig.mcp["plugin-server"].command[1]).toBe("plugin-srv")  // plugin entry present
  })

  test("preserves unrelated user keys when merging opencode.json", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-preserve-"))
    const outputRoot = path.join(tempRoot, ".opencode")
    const configPath = path.join(outputRoot, "opencode.json")

    // Create existing config with multiple user keys
    await fs.mkdir(outputRoot, { recursive: true })
    const existingConfig = {
      model: "my-model",
      theme: "dark",
      mcp: {}
    }
    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2))

    // Bundle adds plugin-specific keys
    const bundle: OpenCodeBundle = {
      config: {
        $schema: "https://opencode.ai/config.json",
        mcp: { "plugin-server": { type: "local", command: ["uvx", "plugin-srv"] } },
        permission: { "bash": "allow" }
      },
      agents: [],
      plugins: [],
      commandFiles: [],
      skillDirs: [],
    }

    await writeOpenCodeBundle(outputRoot, bundle)

    // All user keys preserved
    const mergedConfig = JSON.parse(await fs.readFile(configPath, "utf8"))
    expect(mergedConfig.model).toBe("my-model")
    expect(mergedConfig.theme).toBe("dark")
    expect(mergedConfig.mcp["plugin-server"]).toBeDefined()
    expect(mergedConfig.permission["bash"]).toBe("allow")
  })

  test("writes command files as .md in commands/ directory", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-cmd-"))
    const outputRoot = path.join(tempRoot, ".config", "opencode")
    const bundle: OpenCodeBundle = {
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [],
      plugins: [],
      commandFiles: [{ name: "my-cmd", content: "---\ndescription: Test\n---\n\nDo something." }],
      skillDirs: [],
    }

    await writeOpenCodeBundle(outputRoot, bundle)

    const cmdPath = path.join(outputRoot, "commands", "my-cmd.md")
    expect(await exists(cmdPath)).toBe(true)

    const content = await fs.readFile(cmdPath, "utf8")
    expect(content).toBe("---\ndescription: Test\n---\n\nDo something.\n")
  })

  test("backs up existing command .md file before overwriting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-cmd-backup-"))
    const outputRoot = path.join(tempRoot, ".opencode")
    const commandsDir = path.join(outputRoot, "commands")
    await fs.mkdir(commandsDir, { recursive: true })

    const cmdPath = path.join(commandsDir, "my-cmd.md")
    await fs.writeFile(cmdPath, "old content\n")

    const bundle: OpenCodeBundle = {
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [],
      plugins: [],
      commandFiles: [{ name: "my-cmd", content: "---\ndescription: New\n---\n\nNew content." }],
      skillDirs: [],
    }

    await writeOpenCodeBundle(outputRoot, bundle)

    // New content should be written
    const content = await fs.readFile(cmdPath, "utf8")
    expect(content).toBe("---\ndescription: New\n---\n\nNew content.\n")

    // Backup should exist
    const files = await fs.readdir(commandsDir)
    const backupFileName = files.find((f) => f.startsWith("my-cmd.md.bak."))
    expect(backupFileName).toBeDefined()

    const backupContent = await fs.readFile(path.join(commandsDir, backupFileName!), "utf8")
    expect(backupContent).toBe("old content\n")
  })
})
