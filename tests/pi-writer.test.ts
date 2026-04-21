import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writePiBundle } from "../src/targets/pi"
import { parseFrontmatter } from "../src/utils/frontmatter"
import type { PiBundle } from "../src/types/pi"
import { loadClaudePlugin } from "../src/parsers/claude"
import { convertClaudeToPi } from "../src/converters/claude-to-pi"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function pluginDescription(relativePath: string): Promise<string> {
  const raw = await fs.readFile(path.join(import.meta.dir, "..", relativePath), "utf8")
  const { data } = parseFrontmatter(raw, relativePath)
  if (typeof data.description !== "string") {
    throw new Error(`Missing description in ${relativePath}`)
  }
  return data.description
}

describe("writePiBundle", () => {
  test("removes stale generated agent skills without touching prompt files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-cleanup-targets-"))
    const outputRoot = path.join(tempRoot, ".pi")

    const sessionHistorianDescription = await pluginDescription(
      "plugins/compound-engineering/agents/ce-session-historian.agent.md",
    )

    await fs.mkdir(path.join(outputRoot, "skills", "session-historian"), { recursive: true })
    await fs.writeFile(
      path.join(outputRoot, "skills", "session-historian", "SKILL.md"),
      `---\nname: session-historian\ndescription: ${JSON.stringify(sessionHistorianDescription)}\n---\n\nLegacy agent\n`,
    )
    await fs.mkdir(path.join(outputRoot, "prompts"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "prompts", "session-historian.md"), "user-owned prompt")

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "skills", "session-historian"))).toBe(false)
    expect(await exists(path.join(outputRoot, "prompts", "session-historian.md"))).toBe(true)
  })

  test("writes prompts, skills, extensions, mcporter config, and AGENTS.md block", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-"))
    const outputRoot = path.join(tempRoot, ".pi")

    const bundle: PiBundle = {
      pluginName: "compound-engineering",
      prompts: [{ name: "workflows-plan", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "repo-research-analyst", content: "---\nname: repo-research-analyst\n---\n\nBody" }],
      extensions: [{ name: "compound-engineering-compat.ts", content: "export default function () {}" }],
      mcporterConfig: {
        mcpServers: {
          context7: { baseUrl: "https://mcp.context7.com/mcp" },
        },
      },
    }

    await writePiBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "prompts", "workflows-plan.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "repo-research-analyst", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "extensions", "compound-engineering-compat.ts"))).toBe(true)
    expect(await exists(path.join(outputRoot, "compound-engineering", "mcporter.json"))).toBe(true)
    expect(await exists(path.join(outputRoot, "compound-engineering", "install-manifest.json"))).toBe(true)

    const agentsPath = path.join(outputRoot, "AGENTS.md")
    const agentsContent = await fs.readFile(agentsPath, "utf8")
    expect(agentsContent).toContain("BEGIN COMPOUND PI TOOL MAP")
    expect(agentsContent).toContain("MCPorter")
  })

  test("transforms Task calls in copied SKILL.md files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-transform-"))
    const outputRoot = path.join(tempRoot, ".pi")
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

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const installedSkill = await fs.readFile(
      path.join(outputRoot, "skills", "ce-plan", "SKILL.md"),
      "utf8",
    )

    expect(installedSkill).toContain('Run subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(installedSkill).toContain('Run subagent with agent="learnings-researcher" and task="feature_description".')
    expect(installedSkill).toContain('Run subagent with agent="code-simplicity-reviewer".')
    expect(installedSkill).not.toContain("Task compound-engineering:")
  })

  test("writes to ~/.pi/agent style roots without nesting under .pi", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-agent-root-"))
    const outputRoot = path.join(tempRoot, "agent")

    const bundle: PiBundle = {
      prompts: [{ name: "workflows-work", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "prompts", "workflows-work.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, ".pi"))).toBe(false)
  })

  test("backs up existing mcporter config before overwriting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-backup-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const configPath = path.join(outputRoot, "compound-engineering", "mcporter.json")

    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify({ previous: true }, null, 2))

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
      mcporterConfig: {
        mcpServers: {
          linear: { baseUrl: "https://mcp.linear.app/mcp" },
        },
      },
    }

    await writePiBundle(outputRoot, bundle)

    const files = await fs.readdir(path.dirname(configPath))
    const backupFileName = files.find((file) => file.startsWith("mcporter.json.bak."))
    expect(backupFileName).toBeDefined()

    const currentConfig = JSON.parse(await fs.readFile(configPath, "utf8")) as { mcpServers: Record<string, unknown> }
    expect(currentConfig.mcpServers.linear).toBeDefined()
  })

  test("removes previously managed Pi artifacts that disappear on reinstall", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-managed-cleanup-"))
    const outputRoot = path.join(tempRoot, ".pi")

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "old-prompt", content: "Prompt content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "old-agent", content: "---\nname: old-agent\n---\n\nBody" }],
      extensions: [{ name: "compound-engineering-compat.ts", content: "export default function first() {}" }],
    })

    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "new-prompt", content: "Prompt content" }],
      skillDirs: [],
      generatedSkills: [{ name: "new-agent", content: "---\nname: new-agent\n---\n\nBody" }],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, "prompts", "old-prompt.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "prompts", "new-prompt.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "skill-one", "SKILL.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "old-agent", "SKILL.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "new-agent", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "extensions", "compound-engineering-compat.ts"))).toBe(false)
  })

  test("namespaces managed install manifests per plugin so installs do not collide", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-multi-plugin-"))
    const outputRoot = path.join(tempRoot, ".pi")

    // Install plugin A first, with a prompt, skill, generated skill, and extension
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [{ name: "ce-prompt", content: "CE prompt" }],
      skillDirs: [
        {
          name: "ce-skill",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "ce-gen-skill", content: "---\nname: ce-gen-skill\n---\n\nBody" }],
      extensions: [{ name: "ce-ext.ts", content: "export default function () {}" }],
    })

    // Install plugin B into the same Pi root
    await writePiBundle(outputRoot, {
      pluginName: "coding-tutor",
      prompts: [{ name: "tutor-prompt", content: "Tutor prompt" }],
      skillDirs: [
        {
          name: "tutor-skill",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
      generatedSkills: [{ name: "tutor-gen-skill", content: "---\nname: tutor-gen-skill\n---\n\nBody" }],
      extensions: [{ name: "tutor-ext.ts", content: "export default function () {}" }],
    })

    // Both plugins must keep their own namespaced manifest
    expect(await exists(path.join(outputRoot, "compound-engineering", "install-manifest.json"))).toBe(true)
    expect(await exists(path.join(outputRoot, "coding-tutor", "install-manifest.json"))).toBe(true)

    // Reinstall plugin A with no artifacts — it must clean up only its own
    // managed artifacts, leaving plugin B's intact (the bug the namespacing fix
    // addresses: a shared manifest path would have lost B's manifest after A
    // was installed, and a later A reinstall would skip B's stale-file cleanup).
    await writePiBundle(outputRoot, {
      pluginName: "compound-engineering",
      prompts: [],
      skillDirs: [],
      generatedSkills: [],
      extensions: [],
    })

    expect(await exists(path.join(outputRoot, "prompts", "ce-prompt.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "ce-skill"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "ce-gen-skill"))).toBe(false)
    expect(await exists(path.join(outputRoot, "extensions", "ce-ext.ts"))).toBe(false)
    expect(await exists(path.join(outputRoot, "prompts", "tutor-prompt.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "tutor-skill"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "tutor-gen-skill"))).toBe(true)
    expect(await exists(path.join(outputRoot, "extensions", "tutor-ext.ts"))).toBe(true)
    expect(await exists(path.join(outputRoot, "coding-tutor", "install-manifest.json"))).toBe(true)
  })

  test("moves legacy flat Pi CE artifacts to a namespaced backup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-legacy-artifacts-"))
    const outputRoot = path.join(tempRoot, ".pi")

    await fs.mkdir(path.join(outputRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "skills", "reproduce-bug", "SKILL.md"), "legacy removed skill")
    await fs.mkdir(path.join(outputRoot, "skills", "bug-reproduction-validator"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "skills", "bug-reproduction-validator", "SKILL.md"), "legacy removed agent skill")
    await fs.mkdir(path.join(outputRoot, "prompts"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "prompts", "reproduce-bug.md"), "legacy removed prompt")
    await fs.writeFile(path.join(outputRoot, "prompts", "report-bug.md"), "legacy deleted command prompt")

    const plugin = await loadClaudePlugin(path.join(import.meta.dir, "..", "plugins", "compound-engineering"))
    const bundle = convertClaudeToPi(plugin, {
      agentMode: "subagent",
      inferTemperature: true,
      permissions: "none",
    })
    await writePiBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "skills", "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "bug-reproduction-validator"))).toBe(false)
    expect(await exists(path.join(outputRoot, "prompts", "reproduce-bug.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "prompts", "report-bug.md"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "ce-plan", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "skills", "ce-repo-research-analyst", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(outputRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })
})
