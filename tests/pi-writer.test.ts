import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writePiBundle } from "../src/targets/pi"
import type { PiBundle } from "../src/types/pi"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("writePiBundle", () => {
  test("writes prompts, skills, extensions, mcporter config, and AGENTS.md block", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-writer-"))
    const outputRoot = path.join(tempRoot, ".pi")

    const bundle: PiBundle = {
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
})
