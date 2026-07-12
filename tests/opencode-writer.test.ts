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

const REPRODUCE_BUG_DESCRIPTION =
  "Systematically reproduce and investigate a bug from a GitHub issue. Use when the user provides a GitHub issue number or URL for a bug they want reproduced or investigated."
const BUG_REPRODUCTION_VALIDATOR_DESCRIPTION =
  "Systematically reproduces and validates bug reports to confirm whether reported behavior is an actual bug. Use when you receive a bug report or issue that needs verification."

function skillContent(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n`
}

function agentContent(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\nLegacy agent\n`
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

  test("scope='global' forces flat layout for OPENCODE_CONFIG_DIR-style roots with non-conventional basenames", async () => {
    // Simulates OPENCODE_CONFIG_DIR pointing to a directory whose basename is
    // neither "opencode" nor ".opencode" (e.g. NixOS, Docker, custom XDG_CONFIG_HOME).
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-env-dir-"))
    const outputRoot = path.join(tempRoot, "custom-opencode-config")
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

    await writeOpenCodeBundle(outputRoot, bundle, "global")

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

    const bundle: OpenCodeBundle = {
      pluginName: "compound-engineering",
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [],
      plugins: [],
      commandFiles: [{ name: "my-cmd", content: "---\ndescription: New\n---\n\nNew content." }],
      skillDirs: [],
    }

    // First install establishes ownership of my-cmd.md in the install
    // manifest -- an unowned pre-existing file would be preserved, not
    // backed up and overwritten.
    await writeOpenCodeBundle(outputRoot, bundle)

    const cmdPath = path.join(commandsDir, "my-cmd.md")
    // Simulate drift between two installs: same managed file, stale content.
    await fs.writeFile(cmdPath, "old content\n")

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
    await fs.writeFile(path.join(outputRoot, "skills", "reproduce-bug", "SKILL.md"), skillContent("reproduce-bug", REPRODUCE_BUG_DESCRIPTION))
    await fs.mkdir(path.join(outputRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "agents", "bug-reproduction-validator.md"), agentContent("bug-reproduction-validator", BUG_REPRODUCTION_VALIDATOR_DESCRIPTION))
    await fs.mkdir(path.join(outputRoot, "commands"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "commands", "reproduce-bug.md"), "legacy removed command")
    await fs.writeFile(path.join(outputRoot, "commands", "report-bug.md"), "legacy deleted command")

    const plugin = await loadClaudePlugin(path.join(import.meta.dir, ".."))
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

  test("preserves user-authored legacy-name OpenCode agents during install cleanup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-legacy-agent-preserve-"))
    const outputRoot = path.join(tempRoot, ".opencode")
    const agentsRoot = path.join(outputRoot, "agents")
    await fs.mkdir(agentsRoot, { recursive: true })
    const userAgent = agentContent("ce-repo-research-analyst", "Personal OpenCode research helper.")
    await fs.writeFile(path.join(agentsRoot, "ce-repo-research-analyst.md"), userAgent)

    const plugin = await loadClaudePlugin(path.join(import.meta.dir, ".."))
    const bundle = convertClaudeToOpenCode(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })
    await writeOpenCodeBundle(outputRoot, bundle)

    expect(await exists(path.join(agentsRoot, "ce-repo-research-analyst.md"))).toBe(true)
    expect(await fs.readFile(path.join(agentsRoot, "ce-repo-research-analyst.md"), "utf8")).toBe(userAgent)
  })

  test("upgrades from pre-namespacing legacy shared manifest for non-CE plugins", async () => {
    // Pre-namespacing, ALL plugins wrote their install manifest to the same
    // shared path: `<root>/compound-engineering/install-manifest.json`. After
    // the namespacing fix, a plugin like `coding-tutor` reads from its own
    // scoped path (`<root>/coding-tutor/install-manifest.json`), which does
    // not exist on the first reinstall after upgrade. Without a fallback, the
    // manifest resolves to null and the writer skips cleanup, leaving stale
    // files from the pre-namespacing install in place. This test exercises
    // the fallback read of the legacy shared manifest.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-legacy-manifest-"))
    const outputRoot = path.join(tempRoot, ".opencode")

    // Seed the legacy shared manifest at the OLD path, recording artifacts
    // that the previous coding-tutor install placed in the root.
    await fs.mkdir(path.join(outputRoot, "compound-engineering"), { recursive: true })
    await fs.writeFile(
      path.join(outputRoot, "compound-engineering", "install-manifest.json"),
      JSON.stringify({
        version: 1,
        pluginName: "coding-tutor",
        groups: {
          agents: ["stale-tutor-agent.md"],
          commands: ["stale-tutor-cmd.md"],
          plugins: [],
          skills: ["stale-tutor-skill"],
        },
      }),
    )

    // Seed the stale artifacts on disk as they'd exist from the prior install.
    await fs.mkdir(path.join(outputRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "agents", "stale-tutor-agent.md"), "stale")
    await fs.mkdir(path.join(outputRoot, "commands"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "commands", "stale-tutor-cmd.md"), "stale")
    await fs.mkdir(path.join(outputRoot, "skills", "stale-tutor-skill"), { recursive: true })
    await fs.writeFile(
      path.join(outputRoot, "skills", "stale-tutor-skill", "SKILL.md"),
      "stale",
    )

    // Reinstall coding-tutor with a new, non-overlapping set of artifacts.
    await writeOpenCodeBundle(outputRoot, {
      pluginName: "coding-tutor",
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [{ name: "fresh-tutor-agent", content: "fresh" }],
      plugins: [],
      commandFiles: [],
      skillDirs: [
        {
          name: "fresh-tutor-skill",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
    })

    // Stale artifacts from the legacy manifest must be cleaned up.
    expect(await exists(path.join(outputRoot, "agents", "stale-tutor-agent.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "commands", "stale-tutor-cmd.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "stale-tutor-skill"))).toBe(false)

    // Fresh artifacts must be written under the plugin-scoped manifest path.
    expect(await exists(path.join(outputRoot, "agents", "fresh-tutor-agent.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "fresh-tutor-skill", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "coding-tutor", "install-manifest.json"))).toBe(true)

    // The legacy shared manifest must be archived so it doesn't keep
    // misleading a future install (and must no longer exist at the old path).
    expect(await exists(path.join(outputRoot, "compound-engineering", "install-manifest.json"))).toBe(false)
    expect(await exists(path.join(outputRoot, "coding-tutor", "legacy-backup"))).toBe(true)
  })

  test("leaves legacy shared manifest alone when it belongs to a different plugin", async () => {
    // Reinforces the cross-plugin safety: a legacy manifest owned by plugin
    // A must not be consumed or cleaned up by plugin B's first namespaced
    // install. Plugin A's own next install is responsible for migrating it.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-legacy-other-plugin-"))
    const outputRoot = path.join(tempRoot, ".opencode")

    await fs.mkdir(path.join(outputRoot, "compound-engineering"), { recursive: true })
    const legacyManifest = {
      version: 1,
      pluginName: "some-other-plugin",
      groups: {
        agents: ["other-plugin-agent.md"],
        commands: [],
        plugins: [],
        skills: [],
      },
    }
    await fs.writeFile(
      path.join(outputRoot, "compound-engineering", "install-manifest.json"),
      JSON.stringify(legacyManifest),
    )
    await fs.mkdir(path.join(outputRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "agents", "other-plugin-agent.md"), "other")

    await writeOpenCodeBundle(outputRoot, {
      pluginName: "coding-tutor",
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [{ name: "tutor-agent", content: "tutor" }],
      plugins: [],
      commandFiles: [],
      skillDirs: [],
    })

    // Other plugin's artifact is left alone.
    expect(await exists(path.join(outputRoot, "agents", "other-plugin-agent.md"))).toBe(true)
    // Other plugin's legacy manifest is left at the legacy path.
    expect(
      await exists(path.join(outputRoot, "compound-engineering", "install-manifest.json")),
    ).toBe(true)
    const preserved = JSON.parse(
      await fs.readFile(
        path.join(outputRoot, "compound-engineering", "install-manifest.json"),
        "utf8",
      ),
    )
    expect(preserved.pluginName).toBe("some-other-plugin")
  })
})

// Probed at module load (not beforeAll) because test.skipIf evaluates its
// condition at registration time. Directory and file symlinks are probed
// separately: on Windows without Developer Mode, junctions succeed while
// file symlinks throw EPERM.
async function probeSymlinkSupport(): Promise<{ canDirSymlink: boolean; canFileSymlink: boolean }> {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-symlink-probe-"))
  const probeTarget = path.join(probeRoot, "target")
  await fs.mkdir(probeTarget, { recursive: true })
  let canDirSymlink = true
  try {
    await fs.symlink(probeTarget, path.join(probeRoot, "link"), "junction")
  } catch {
    canDirSymlink = false
  }
  const probeFile = path.join(probeRoot, "target.md")
  await fs.writeFile(probeFile, "probe")
  let canFileSymlink = true
  try {
    await fs.symlink(probeFile, path.join(probeRoot, "link.md"))
  } catch {
    canFileSymlink = false
  }
  return { canDirSymlink, canFileSymlink }
}

const { canDirSymlink, canFileSymlink } = await probeSymlinkSupport()

describe("writeOpenCodeBundle preserves user-managed skill and command paths", () => {
  async function readInstallManifest(outputRoot: string): Promise<{ groups: Record<string, string[]> }> {
    const raw = await fs.readFile(
      path.join(outputRoot, "compound-engineering", "install-manifest.json"),
      "utf8",
    )
    return JSON.parse(raw) as { groups: Record<string, string[]> }
  }

  test.skipIf(!canDirSymlink)(
    "preserves a symlinked skill directory and leaves its target content untouched",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-preserve-skill-symlink-"))
      const outputRoot = path.join(tempRoot, ".opencode")
      const forkDir = path.join(tempRoot, "user-fork", "skill-one")
      await fs.mkdir(forkDir, { recursive: true })
      await fs.writeFile(path.join(forkDir, "SKILL.md"), "# user fork content\n")

      await fs.mkdir(path.join(outputRoot, "skills"), { recursive: true })
      await fs.symlink(forkDir, path.join(outputRoot, "skills", "skill-one"), "junction")

      const bundle: OpenCodeBundle = {
        pluginName: "compound-engineering",
        config: { $schema: "https://opencode.ai/config.json" },
        agents: [],
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

      const linkStat = await fs.lstat(path.join(outputRoot, "skills", "skill-one"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(path.join(forkDir, "SKILL.md"), "utf8")).toBe("# user fork content\n")

      const manifest = await readInstallManifest(outputRoot)
      expect(manifest.groups.skills).not.toContain("skill-one")
    },
  )

  test("preserves an unmanaged real skill directory (not previously owned by this tool)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-preserve-skill-unmanaged-"))
    const outputRoot = path.join(tempRoot, ".opencode")

    await fs.mkdir(path.join(outputRoot, "skills", "skill-one"), { recursive: true })
    await fs.writeFile(
      path.join(outputRoot, "skills", "skill-one", "SKILL.md"),
      "# hand-authored, never installed by this tool\n",
    )

    const bundle: OpenCodeBundle = {
      pluginName: "compound-engineering",
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [],
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

    expect(await fs.readFile(path.join(outputRoot, "skills", "skill-one", "SKILL.md"), "utf8")).toBe(
      "# hand-authored, never installed by this tool\n",
    )

    const manifest = await readInstallManifest(outputRoot)
    expect(manifest.groups.skills).not.toContain("skill-one")
  })

  test("still replaces a real skill directory previously installed by this tool", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-replace-managed-skill-"))
    const outputRoot = path.join(tempRoot, ".opencode")

    const bundle: OpenCodeBundle = {
      pluginName: "compound-engineering",
      config: { $schema: "https://opencode.ai/config.json" },
      agents: [],
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
    // Simulate drift between two installs: same managed dir, different upstream content.
    await fs.writeFile(path.join(outputRoot, "skills", "skill-one", "SKILL.md"), "stale managed content")

    await writeOpenCodeBundle(outputRoot, bundle)

    const content = await fs.readFile(path.join(outputRoot, "skills", "skill-one", "SKILL.md"), "utf8")
    expect(content).not.toBe("stale managed content")
    expect(content).toContain("Skill body")

    const manifest = await readInstallManifest(outputRoot)
    expect(manifest.groups.skills).toContain("skill-one")
  })

  test.skipIf(!canDirSymlink)(
    "a preserved skill symlink survives a later install run where the skill is dropped from the bundle",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-preserve-skill-symlink-second-run-"))
      const outputRoot = path.join(tempRoot, ".opencode")

      const bundleWithSkill: OpenCodeBundle = {
        pluginName: "compound-engineering",
        config: { $schema: "https://opencode.ai/config.json" },
        agents: [],
        plugins: [],
        commandFiles: [],
        skillDirs: [
          {
            name: "skill-one",
            sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
          },
        ],
      }

      // First run: normal managed install, tracked in the manifest.
      await writeOpenCodeBundle(outputRoot, bundleWithSkill)
      const manifestAfterFirstRun = await readInstallManifest(outputRoot)
      expect(manifestAfterFirstRun.groups.skills).toContain("skill-one")

      // User swaps the managed directory for a symlink into a personal fork,
      // while the on-disk manifest from the first run still claims ownership.
      const forkDir = path.join(tempRoot, "user-fork", "skill-one")
      await fs.mkdir(forkDir, { recursive: true })
      await fs.writeFile(path.join(forkDir, "SKILL.md"), "# user fork content\n")
      await fs.rm(path.join(outputRoot, "skills", "skill-one"), { recursive: true, force: true })
      await fs.symlink(forkDir, path.join(outputRoot, "skills", "skill-one"), "junction")

      // Second run: the plugin drops the skill from the bundle entirely, which
      // exercises cleanupRemovedManagedDirectories against the stale manifest
      // entry.
      const bundleWithoutSkill: OpenCodeBundle = {
        pluginName: "compound-engineering",
        config: { $schema: "https://opencode.ai/config.json" },
        agents: [],
        plugins: [],
        commandFiles: [],
        skillDirs: [],
      }
      await writeOpenCodeBundle(outputRoot, bundleWithoutSkill)

      const linkStat = await fs.lstat(path.join(outputRoot, "skills", "skill-one"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(path.join(forkDir, "SKILL.md"), "utf8")).toBe("# user fork content\n")

      const manifestAfterSecondRun = await readInstallManifest(outputRoot)
      expect(manifestAfterSecondRun.groups.skills).not.toContain("skill-one")
    },
  )

  test.skipIf(!canFileSymlink)(
    "preserves a symlinked agent file and leaves its target content untouched",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-preserve-agent-symlink-"))
      const outputRoot = path.join(tempRoot, ".opencode")
      const forkAgentPath = path.join(tempRoot, "user-fork-agent.md")
      await fs.writeFile(forkAgentPath, "# user fork agent content\n")

      await fs.mkdir(path.join(outputRoot, "agents"), { recursive: true })
      await fs.symlink(forkAgentPath, path.join(outputRoot, "agents", "agent-one.md"))

      const bundle: OpenCodeBundle = {
        pluginName: "compound-engineering",
        config: { $schema: "https://opencode.ai/config.json" },
        agents: [{ name: "agent-one", content: "Agent content" }],
        plugins: [],
        commandFiles: [],
        skillDirs: [],
      }

      await writeOpenCodeBundle(outputRoot, bundle)

      const linkStat = await fs.lstat(path.join(outputRoot, "agents", "agent-one.md"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(forkAgentPath, "utf8")).toBe("# user fork agent content\n")

      const manifest = await readInstallManifest(outputRoot)
      expect(manifest.groups.agents).not.toContain("agent-one.md")
    },
  )

  test.skipIf(!canFileSymlink)(
    "preserves a symlinked plugin file and leaves its target content untouched",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-preserve-plugin-symlink-"))
      const outputRoot = path.join(tempRoot, ".opencode")
      const forkPluginPath = path.join(tempRoot, "user-fork-plugin.ts")
      await fs.writeFile(forkPluginPath, "// user fork plugin content\n")

      await fs.mkdir(path.join(outputRoot, "plugins"), { recursive: true })
      await fs.symlink(forkPluginPath, path.join(outputRoot, "plugins", "hook.ts"))

      const bundle: OpenCodeBundle = {
        pluginName: "compound-engineering",
        config: { $schema: "https://opencode.ai/config.json" },
        agents: [],
        plugins: [{ name: "hook.ts", content: "export {}" }],
        commandFiles: [],
        skillDirs: [],
      }

      await writeOpenCodeBundle(outputRoot, bundle)

      const linkStat = await fs.lstat(path.join(outputRoot, "plugins", "hook.ts"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(forkPluginPath, "utf8")).toBe("// user fork plugin content\n")

      const manifest = await readInstallManifest(outputRoot)
      expect(manifest.groups.plugins).not.toContain("hook.ts")
    },
  )

  test.skipIf(!canFileSymlink)(
    "preserves a symlinked command file and leaves its target content untouched",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-preserve-command-symlink-"))
      const outputRoot = path.join(tempRoot, ".opencode")
      const forkCommandPath = path.join(tempRoot, "user-fork-command.md")
      await fs.writeFile(forkCommandPath, "# user fork command content\n")

      await fs.mkdir(path.join(outputRoot, "commands"), { recursive: true })
      await fs.symlink(forkCommandPath, path.join(outputRoot, "commands", "my-cmd.md"))

      const bundle: OpenCodeBundle = {
        pluginName: "compound-engineering",
        config: { $schema: "https://opencode.ai/config.json" },
        agents: [],
        plugins: [],
        commandFiles: [{ name: "my-cmd", content: "New content." }],
        skillDirs: [],
      }

      await writeOpenCodeBundle(outputRoot, bundle)

      const linkStat = await fs.lstat(path.join(outputRoot, "commands", "my-cmd.md"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(forkCommandPath, "utf8")).toBe("# user fork command content\n")
      // No stray backup should have been created either -- the guard must
      // fire before the pre-write backupFile call, not just before the write.
      const files = await fs.readdir(path.join(outputRoot, "commands"))
      expect(files.some((file) => file.startsWith("my-cmd.md.bak."))).toBe(false)

      const manifest = await readInstallManifest(outputRoot)
      expect(manifest.groups.commands).not.toContain("my-cmd.md")
    },
  )

  test.skipIf(!canDirSymlink)(
    "a legacy-named skill symlinked to a user fork is not swept into legacy-backup",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-preserve-legacy-skill-symlink-"))
      const outputRoot = path.join(tempRoot, ".opencode")

      // Worst case: the fork keeps the CE fingerprint (name + description), so
      // the readFile-based ownership check follows the symlink and matches.
      const forkDir = path.join(tempRoot, "user-fork", "reproduce-bug")
      await fs.mkdir(forkDir, { recursive: true })
      const forkContent = skillContent("reproduce-bug", REPRODUCE_BUG_DESCRIPTION)
      await fs.writeFile(path.join(forkDir, "SKILL.md"), forkContent)

      await fs.mkdir(path.join(outputRoot, "skills"), { recursive: true })
      await fs.symlink(forkDir, path.join(outputRoot, "skills", "reproduce-bug"), "junction")

      const plugin = await loadClaudePlugin(path.join(import.meta.dir, ".."))
      const bundle = convertClaudeToOpenCode(plugin, {
        agentMode: "subagent",
        inferTemperature: true,
        permissions: "none",
      })
      await writeOpenCodeBundle(outputRoot, bundle)

      const linkStat = await fs.lstat(path.join(outputRoot, "skills", "reproduce-bug"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(path.join(forkDir, "SKILL.md"), "utf8")).toBe(forkContent)

      const legacyBackupRoot = path.join(outputRoot, "compound-engineering", "legacy-backup")
      if (await exists(legacyBackupRoot)) {
        for (const timestamp of await fs.readdir(legacyBackupRoot)) {
          const skillsBackup = path.join(legacyBackupRoot, timestamp, "skills")
          if (!(await exists(skillsBackup))) continue
          expect(await fs.readdir(skillsBackup)).not.toContain("reproduce-bug")
        }
      }
    },
  )
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

describe("writeOpenCodeBundle guards against ancestor-symlink traversal", () => {
  async function readInstallManifest(outputRoot: string): Promise<{ groups: Record<string, string[]> }> {
    const raw = await fs.readFile(path.join(outputRoot, "compound-engineering", "install-manifest.json"), "utf8")
    return JSON.parse(raw) as { groups: Record<string, string[]> }
  }

  test.skipIf(!canDirSymlink)(
    "does not write through a store dir that is itself a symlink into a user fork",
    async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-ancestor-store-symlink-"))
      const outputRoot = path.join(tempRoot, ".opencode")
      const forkStore = path.join(tempRoot, "user-fork-store")
      await fs.mkdir(forkStore, { recursive: true })
      await fs.writeFile(path.join(forkStore, "MARKER.md"), "# user store\n")
      await fs.mkdir(outputRoot, { recursive: true })
      await fs.symlink(forkStore, path.join(outputRoot, "skills"), "junction")

      const bundle: OpenCodeBundle = {
        pluginName: "compound-engineering",
        config: { $schema: "https://opencode.ai/config.json" },
        agents: [],
        plugins: [],
        commandFiles: [],
        skillDirs: [{ name: "skill-one", sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one") }],
      }

      await writeOpenCodeBundle(outputRoot, bundle)

      const linkStat = await fs.lstat(path.join(outputRoot, "skills"))
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await exists(path.join(forkStore, "skill-one"))).toBe(false)
      expect(await fs.readFile(path.join(forkStore, "MARKER.md"), "utf8")).toBe("# user store\n")
      expect((await readInstallManifest(outputRoot)).groups.skills).not.toContain("skill-one")
    },
  )
})
