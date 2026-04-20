import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeOpenCodeBundle } from "../src/targets/opencode"
import { mergeJsonConfigAtKey } from "../src/utils/json-config"
import type { OpenCodeBundle } from "../src/types/opencode"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToOpenCode } from "../src/converters/claude-to-opencode"

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
      pluginName: "compound-engineering",
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
    expect(await exists(path.join(tempRoot, ".opencode", "compound-engineering", "install-manifest.json"))).toBe(true)
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
    const originalConfig = { $schema: "https://opencode.ai/config.json", custom: "value" }
    await fs.writeFile(configPath, JSON.stringify(originalConfig, null, 2))

    // Bundle adds mcp server but keeps user's custom key
    const bundle: OpenCodeBundle = {
      config: { 
        $schema: "https://opencode.ai/config.json", 
        mcp: { "plugin-server": { type: "local", command: "uvx", args: ["plugin-srv"] } } 
      },
      agents: [],
      plugins: [],
      commandFiles: [],
      skillDirs: [],
    }

    await writeOpenCodeBundle(outputRoot, bundle)

    // Merged config should have both user key and plugin key
    const newConfig = JSON.parse(await fs.readFile(configPath, "utf8"))
    expect(newConfig.custom).toBe("value")  // user key preserved
    expect(newConfig.mcp).toBeDefined()
    expect(newConfig.mcp["plugin-server"]).toBeDefined()

    // Backup should exist with original content
    const files = await fs.readdir(outputRoot)
    const backupFileName = files.find((f) => f.startsWith("opencode.json.bak."))
    expect(backupFileName).toBeDefined()

    const backupContent = JSON.parse(await fs.readFile(path.join(outputRoot, backupFileName!), "utf8"))
    expect(backupContent.custom).toBe("value")
  })

  test("merges mcp servers without overwriting user entry", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-merge-mcp-"))
    const outputRoot = path.join(tempRoot, ".opencode")
    const configPath = path.join(outputRoot, "opencode.json")

    // Create existing config with user's mcp server
    await fs.mkdir(outputRoot, { recursive: true })
    const existingConfig = { 
      mcp: { "user-server": { type: "local", command: "uvx", args: ["user-srv"] } } 
    }
    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2))

    // Bundle adds plugin server AND has conflicting user-server with different args
    const bundle: OpenCodeBundle = {
      config: { 
        $schema: "https://opencode.ai/config.json",
        mcp: { 
          "plugin-server": { type: "local", command: "uvx", args: ["plugin-srv"] },
          "user-server": { type: "local", command: "uvx", args: ["plugin-override"] }  // conflict
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
    expect(mergedConfig.mcp["user-server"].args[0]).toBe("user-srv")  // user wins on conflict
    expect(mergedConfig.mcp["plugin-server"].args[0]).toBe("plugin-srv")  // plugin entry present
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
        mcp: { "plugin-server": { type: "local", command: "uvx", args: ["plugin-srv"] } },
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

  test("rewrites FQ agent names in copied skill markdown (#477)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-skill-transform-"))
    const skillSrcDir = path.join(tempRoot, "src-skill")
    const refsDir = path.join(skillSrcDir, "references")
    await fs.mkdir(refsDir, { recursive: true })
    await fs.writeFile(
      path.join(skillSrcDir, "SKILL.md"),
      "---\nname: test-skill\n---\n\n- `compound-engineering:review:coherence-reviewer`\n"
    )
    await fs.writeFile(
      path.join(refsDir, "agents.md"),
      "Use `compound-engineering:research:repo-research-analyst` for codebase analysis.\n"
    )

    const outputRoot = path.join(tempRoot, ".opencode")
    const bundle: OpenCodeBundle = {
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [],
      plugins: [],
      commandFiles: [],
      skillDirs: [{ name: "test-skill", sourceDir: skillSrcDir }],
    }

    await writeOpenCodeBundle(outputRoot, bundle)

    const skillContent = await fs.readFile(
      path.join(outputRoot, "skills", "test-skill", "SKILL.md"),
      "utf8"
    )
    expect(skillContent).toContain("`coherence-reviewer`")
    expect(skillContent).not.toContain("compound-engineering:review:coherence-reviewer")

    const refContent = await fs.readFile(
      path.join(outputRoot, "skills", "test-skill", "references", "agents.md"),
      "utf8"
    )
    expect(refContent).toContain("`repo-research-analyst`")
    expect(refContent).not.toContain("compound-engineering:research:repo-research-analyst")
  })

  test("does not transform non-markdown files in skill directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-skill-nonmd-"))
    const skillSrcDir = path.join(tempRoot, "src-skill")
    const scriptsDir = path.join(skillSrcDir, "scripts")
    await fs.mkdir(scriptsDir, { recursive: true })
    await fs.writeFile(
      path.join(skillSrcDir, "SKILL.md"),
      "---\nname: test-skill\n---\n\nSkill body.\n"
    )
    const scriptContent = "#!/bin/bash\n# compound-engineering:review:security-sentinel\necho done\n"
    await fs.writeFile(path.join(scriptsDir, "run.sh"), scriptContent)

    const outputRoot = path.join(tempRoot, ".opencode")
    const bundle: OpenCodeBundle = {
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [],
      plugins: [],
      commandFiles: [],
      skillDirs: [{ name: "test-skill", sourceDir: skillSrcDir }],
    }

    await writeOpenCodeBundle(outputRoot, bundle)

    const copiedScript = await fs.readFile(
      path.join(outputRoot, "skills", "test-skill", "scripts", "run.sh"),
      "utf8"
    )
    // Non-markdown files should be copied verbatim — no FQ rewriting
    expect(copiedScript).toBe(scriptContent)
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

  test("removes previously managed OpenCode artifacts that disappear on reinstall", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-managed-cleanup-"))
    const outputRoot = path.join(tempRoot, ".opencode")

    await writeOpenCodeBundle(outputRoot, {
      pluginName: "compound-engineering",
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [{ name: "old-agent", content: "Agent content" }],
      plugins: [{ name: "hook.ts", content: "export {}" }],
      commandFiles: [{ name: "old:cmd", content: "old" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
    })

    await writeOpenCodeBundle(outputRoot, {
      pluginName: "compound-engineering",
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [{ name: "new-agent", content: "Agent content" }],
      plugins: [],
      commandFiles: [{ name: "new:cmd", content: "new" }],
      skillDirs: [],
    })

    expect(await exists(path.join(outputRoot, "agents", "old-agent.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "agents", "new-agent.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "plugins", "hook.ts"))).toBe(false)
    expect(await exists(path.join(outputRoot, "commands", "old", "cmd.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "commands", "new", "cmd.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "skill-one", "SKILL.md"))).toBe(false)
  })

  test("namespaces managed install manifests per plugin so installs do not collide", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-multi-plugin-"))
    const outputRoot = path.join(tempRoot, ".opencode")

    // Install plugin A first, with a skill and an agent
    await writeOpenCodeBundle(outputRoot, {
      pluginName: "compound-engineering",
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [{ name: "ce-agent", content: "ce agent" }],
      plugins: [],
      commandFiles: [],
      skillDirs: [
        {
          name: "ce-skill",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
    })

    // Install plugin B into the same OpenCode root
    await writeOpenCodeBundle(outputRoot, {
      pluginName: "coding-tutor",
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [{ name: "tutor-agent", content: "tutor agent" }],
      plugins: [],
      commandFiles: [],
      skillDirs: [
        {
          name: "tutor-skill",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
    })

    // Both plugins must keep their own namespaced manifest
    expect(await exists(path.join(outputRoot, "compound-engineering", "install-manifest.json"))).toBe(true)
    expect(await exists(path.join(outputRoot, "coding-tutor", "install-manifest.json"))).toBe(true)

    // Reinstall plugin A with no agents/skills — it must clean up only its own
    // managed artifacts, leaving plugin B's intact (the bug the namespacing fix
    // addresses: a shared manifest path would have lost B's manifest after A was
    // installed, and a later A reinstall would skip B's stale-file cleanup).
    await writeOpenCodeBundle(outputRoot, {
      pluginName: "compound-engineering",
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [],
      plugins: [],
      commandFiles: [],
      skillDirs: [],
    })

    expect(await exists(path.join(outputRoot, "agents", "ce-agent.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "ce-skill"))).toBe(false)
    expect(await exists(path.join(outputRoot, "agents", "tutor-agent.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "tutor-skill"))).toBe(true)
    expect(await exists(path.join(outputRoot, "coding-tutor", "install-manifest.json"))).toBe(true)
  })

  test("moves legacy OpenCode CE artifacts to a namespaced backup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-legacy-artifacts-"))
    const outputRoot = path.join(tempRoot, ".opencode")

    await fs.mkdir(path.join(outputRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "skills", "reproduce-bug", "SKILL.md"), "legacy removed skill")
    await fs.mkdir(path.join(outputRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "agents", "bug-reproduction-validator.md"), "legacy removed agent")
    await fs.mkdir(path.join(outputRoot, "commands"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "commands", "reproduce-bug.md"), "legacy removed command")
    await fs.writeFile(path.join(outputRoot, "commands", "report-bug.md"), "legacy deleted command")

    const plugin = await loadClaudePlugin(path.join(import.meta.dir, "..", "plugins", "compound-engineering"))
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })
    await writeOpenCodeBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "skills", "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(outputRoot, "agents", "bug-reproduction-validator.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "commands", "reproduce-bug.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "commands", "report-bug.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })
})

describe("mergeJsonConfigAtKey", () => {
  test("incoming plugin entries overwrite same-named servers", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "json-merge-"))
    const configPath = path.join(tempDir, "opencode.json")

    // User has an existing MCP server config
    const existingConfig = {
      model: "my-model",
      mcp: {
        "user-server": { type: "local", command: ["uvx", "user-srv"] },
      },
    }
    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2))

    // Plugin syncs its servers, overwriting same-named entries
    await mergeJsonConfigAtKey({
      configPath,
      key: "mcp",
      incoming: {
        "plugin-server": { type: "local", command: ["uvx", "plugin-srv"] },
        "user-server": { type: "local", command: ["uvx", "plugin-override"] },
      },
    })

    const merged = JSON.parse(await fs.readFile(configPath, "utf8"))

    // User's top-level keys preserved
    expect(merged.model).toBe("my-model")
    // Plugin server added
    expect(merged.mcp["plugin-server"]).toBeDefined()
    // Plugin server overwrites same-named existing entry
    expect(merged.mcp["user-server"].command[1]).toBe("plugin-override")
  })
})
