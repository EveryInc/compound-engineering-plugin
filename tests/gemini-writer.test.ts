import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeGeminiBundle } from "../src/targets/gemini"
import type { GeminiBundle } from "../src/types/gemini"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToGemini } from "../src/converters/claude-to-gemini"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("writeGeminiBundle", () => {
  test("removes stale generated agent skill dirs before writing Gemini generated skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-cleanup-"))
    const legacySkillPath = path.join(tempRoot, ".gemini", "skills", "security-reviewer", "SKILL.md")
    await fs.mkdir(path.dirname(legacySkillPath), { recursive: true })
    await fs.writeFile(
      legacySkillPath,
      `---\nname: security-reviewer\ndescription: ${JSON.stringify("Conditional code-review persona, selected when the diff touches auth middleware, public endpoints, user input handling, or permission checks. Reviews code for exploitable vulnerabilities.")}\n---\n\nLegacy agent\n`,
    )

    const bundle: GeminiBundle = {
      generatedSkills: [
        {
          name: "security-reviewer",
          content: "---\nname: security-reviewer\ndescription: Security\n---\n\nFresh generated skill.",
        },
      ],
      skillDirs: [],
      commands: [],
    }

    await writeGeminiBundle(tempRoot, bundle)

    const rewritten = await fs.readFile(legacySkillPath, "utf8")
    expect(rewritten).toContain("Fresh generated skill.")
  })

  test("writes agents, skills, commands, and settings.json", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-test-"))
    const bundle: GeminiBundle = {
      pluginName: "compound-engineering",
      generatedSkills: [],
      agents: [
        {
          name: "security-reviewer",
          content: "---\nname: security-reviewer\ndescription: Security\n---\n\nReview code.",
        },
      ],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      commands: [
        {
          name: "plan",
          content: 'description = "Plan"\nprompt = """\nPlan the work.\n"""',
        },
      ],
      mcpServers: {
        playwright: { command: "npx", args: ["-y", "@anthropic/mcp-playwright"] },
      },
    }

    await writeGeminiBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".gemini", "agents", "security-reviewer.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".gemini", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".gemini", "commands", "plan.toml"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".gemini", "settings.json"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".gemini", "compound-engineering", "install-manifest.json"))).toBe(true)

    const agentContent = await fs.readFile(
      path.join(tempRoot, ".gemini", "agents", "security-reviewer.md"),
      "utf8",
    )
    expect(agentContent).toContain("Review code.")

    const commandContent = await fs.readFile(
      path.join(tempRoot, ".gemini", "commands", "plan.toml"),
      "utf8",
    )
    expect(commandContent).toContain("Plan the work.")

    const settingsContent = JSON.parse(
      await fs.readFile(path.join(tempRoot, ".gemini", "settings.json"), "utf8"),
    )
    expect(settingsContent.mcpServers.playwright.command).toBe("npx")
  })

  test("transforms Task calls in copied SKILL.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-skill-transform-"))
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      `---
name: ce-plan
description: Planning workflow
---

Run these research agents:

- Task compound-engineering:research:repo-research-analyst(feature_description)
- Task compound-engineering:research:learnings-researcher(feature_description)
- Task compound-engineering:review:code-simplicity-reviewer()
`,
    )

    const bundle: GeminiBundle = {
      generatedSkills: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      commands: [],
    }

    await writeGeminiBundle(tempRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(tempRoot, ".gemini", "skills", "ce-plan", "SKILL.md"),
      "utf8",
    )

    expect(installedSkill).toContain("Use the @repo-research-analyst subagent to: feature_description")
    expect(installedSkill).toContain("Use the @learnings-researcher subagent to: feature_description")
    expect(installedSkill).toContain("Use the @code-simplicity-reviewer subagent")
    expect(installedSkill).not.toContain("Task compound-engineering:")
  })

  test("namespaced commands create subdirectories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-ns-"))
    const bundle: GeminiBundle = {
      generatedSkills: [],
      skillDirs: [],
      commands: [
        {
          name: "workflows/plan",
          content: 'description = "Plan"\nprompt = """\nPlan.\n"""',
        },
      ],
    }

    await writeGeminiBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".gemini", "commands", "workflows", "plan.toml"))).toBe(true)
  })

  test("does not double-nest when output root is .gemini", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-home-"))
    const geminiRoot = path.join(tempRoot, ".gemini")
    const bundle: GeminiBundle = {
      generatedSkills: [],
      agents: [{ name: "reviewer", content: "Reviewer agent content" }],
      skillDirs: [],
      commands: [
        { name: "plan", content: "Plan content" },
      ],
    }

    await writeGeminiBundle(geminiRoot, bundle)

    expect(await exists(path.join(geminiRoot, "agents", "reviewer.md"))).toBe(true)
    expect(await exists(path.join(geminiRoot, "commands", "plan.toml"))).toBe(true)
    // Should NOT double-nest under .gemini/.gemini
    expect(await exists(path.join(geminiRoot, ".gemini"))).toBe(false)
  })

  test("handles empty bundles gracefully", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-empty-"))
    const bundle: GeminiBundle = {
      generatedSkills: [],
      skillDirs: [],
      commands: [],
    }

    await writeGeminiBundle(tempRoot, bundle)
    expect(await exists(tempRoot)).toBe(true)
  })

  test("backs up existing settings.json before overwrite", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-backup-"))
    const geminiRoot = path.join(tempRoot, ".gemini")
    await fs.mkdir(geminiRoot, { recursive: true })

    // Write existing settings.json
    const settingsPath = path.join(geminiRoot, "settings.json")
    await fs.writeFile(settingsPath, JSON.stringify({ mcpServers: { old: { command: "old-cmd" } } }))

    const bundle: GeminiBundle = {
      generatedSkills: [],
      skillDirs: [],
      commands: [],
      mcpServers: {
        newServer: { command: "new-cmd" },
      },
    }

    await writeGeminiBundle(geminiRoot, bundle)

    // New settings.json should have the new content
    const newContent = JSON.parse(await fs.readFile(settingsPath, "utf8"))
    expect(newContent.mcpServers.newServer.command).toBe("new-cmd")

    // A backup file should exist
    const files = await fs.readdir(geminiRoot)
    const backupFiles = files.filter((f) => f.startsWith("settings.json.bak."))
    expect(backupFiles.length).toBeGreaterThanOrEqual(1)
  })

  test("merges mcpServers into existing settings.json without clobbering other keys", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-merge-"))
    const geminiRoot = path.join(tempRoot, ".gemini")
    await fs.mkdir(geminiRoot, { recursive: true })

    // Write existing settings.json with other keys
    const settingsPath = path.join(geminiRoot, "settings.json")
    await fs.writeFile(settingsPath, JSON.stringify({
      model: "gemini-2.5-pro",
      mcpServers: { old: { command: "old-cmd" } },
    }))

    const bundle: GeminiBundle = {
      generatedSkills: [],
      skillDirs: [],
      commands: [],
      mcpServers: {
        newServer: { command: "new-cmd" },
      },
    }

    await writeGeminiBundle(geminiRoot, bundle)

    const content = JSON.parse(await fs.readFile(settingsPath, "utf8"))
    // Should preserve existing model key
    expect(content.model).toBe("gemini-2.5-pro")
    // Should preserve existing MCP server
    expect(content.mcpServers.old.command).toBe("old-cmd")
    // Should add new MCP server
    expect(content.mcpServers.newServer.command).toBe("new-cmd")
  })

  test("removes previously managed Gemini artifacts that disappear on reinstall", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-managed-cleanup-"))

    await writeGeminiBundle(tempRoot, {
      pluginName: "compound-engineering",
      generatedSkills: [],
      agents: [{ name: "old-agent", content: "---\nname: old-agent\n---\n\nBody" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      commands: [{ name: "old/cmd", content: 'description = "Old"\nprompt = """\nold\n"""' }],
    })

    await writeGeminiBundle(tempRoot, {
      pluginName: "compound-engineering",
      generatedSkills: [],
      agents: [{ name: "new-agent", content: "---\nname: new-agent\n---\n\nBody" }],
      skillDirs: [],
      commands: [{ name: "new/cmd", content: 'description = "New"\nprompt = """\nnew\n"""' }],
    })

    expect(await exists(path.join(tempRoot, ".gemini", "skills", "skill-one", "SKILL.md"))).toBe(false)
    expect(await exists(path.join(tempRoot, ".gemini", "agents", "old-agent.md"))).toBe(false)
    expect(await exists(path.join(tempRoot, ".gemini", "agents", "new-agent.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".gemini", "commands", "old", "cmd.toml"))).toBe(false)
    expect(await exists(path.join(tempRoot, ".gemini", "commands", "new", "cmd.toml"))).toBe(true)
  })

  test("namespaces managed install manifests per plugin so installs do not collide", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-multi-plugin-"))

    // Install plugin A first, with a skill and an agent
    await writeGeminiBundle(tempRoot, {
      pluginName: "compound-engineering",
      generatedSkills: [],
      agents: [{ name: "ce-agent", content: "---\nname: ce-agent\n---\n\nBody" }],
      skillDirs: [
        {
          name: "ce-skill",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      commands: [],
    })

    // Install plugin B into the same Gemini root
    await writeGeminiBundle(tempRoot, {
      pluginName: "coding-tutor",
      generatedSkills: [],
      agents: [{ name: "tutor-agent", content: "---\nname: tutor-agent\n---\n\nBody" }],
      skillDirs: [
        {
          name: "tutor-skill",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      commands: [],
    })

    // Both plugins must keep their own namespaced manifest
    expect(await exists(path.join(tempRoot, ".gemini", "compound-engineering", "install-manifest.json"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".gemini", "coding-tutor", "install-manifest.json"))).toBe(true)

    // Reinstall plugin A with no agents/skills — it must clean up only its own
    // managed artifacts, leaving plugin B's intact (the bug the namespacing fix
    // addresses: a shared manifest path would have lost B's manifest after A
    // was installed, and a later A reinstall would skip B's stale-file cleanup).
    await writeGeminiBundle(tempRoot, {
      pluginName: "compound-engineering",
      generatedSkills: [],
      agents: [],
      skillDirs: [],
      commands: [],
    })

    expect(await exists(path.join(tempRoot, ".gemini", "agents", "ce-agent.md"))).toBe(false)
    expect(await exists(path.join(tempRoot, ".gemini", "skills", "ce-skill"))).toBe(false)
    expect(await exists(path.join(tempRoot, ".gemini", "agents", "tutor-agent.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".gemini", "skills", "tutor-skill"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".gemini", "coding-tutor", "install-manifest.json"))).toBe(true)
  })

  test("moves legacy Gemini CE artifacts to a namespaced backup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-legacy-artifacts-"))
    const geminiRoot = path.join(tempRoot, ".gemini")

    await fs.mkdir(path.join(geminiRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(geminiRoot, "skills", "reproduce-bug", "SKILL.md"), "legacy removed skill")
    await fs.mkdir(path.join(geminiRoot, "skills", "bug-reproduction-validator"), { recursive: true })
    await fs.writeFile(path.join(geminiRoot, "skills", "bug-reproduction-validator", "SKILL.md"), "legacy removed agent skill")
    await fs.mkdir(path.join(geminiRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(geminiRoot, "agents", "bug-reproduction-validator.md"), "legacy removed agent")
    await fs.mkdir(path.join(geminiRoot, "commands"), { recursive: true })
    await fs.writeFile(path.join(geminiRoot, "commands", "reproduce-bug.toml"), "legacy removed command")
    await fs.writeFile(path.join(geminiRoot, "commands", "report-bug.toml"), "legacy deleted command")

    const plugin = await loadClaudePlugin(path.join(import.meta.dir, "..", "plugins", "compound-engineering"))
    const bundle = convertClaudeToGemini(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })
    await writeGeminiBundle(geminiRoot, bundle)

    expect(await exists(path.join(geminiRoot, "skills", "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(geminiRoot, "skills", "bug-reproduction-validator"))).toBe(false)
    expect(await exists(path.join(geminiRoot, "agents", "bug-reproduction-validator.md"))).toBe(false)
    expect(await exists(path.join(geminiRoot, "commands", "reproduce-bug.toml"))).toBe(false)
    expect(await exists(path.join(geminiRoot, "commands", "report-bug.toml"))).toBe(false)
    expect(await exists(path.join(geminiRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })
})
