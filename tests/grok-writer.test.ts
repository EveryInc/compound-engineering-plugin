import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeGrokBundle } from "../src/targets/grok"
import type { GrokBundle } from "../src/types/grok"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("writeGrokBundle", () => {
  test("writes clean self-contained Grok plugin layout (no managed artifacts)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "grok-writer-test-"))

    const bundle: GrokBundle = {
      pluginName: "compound-engineering",
      generatedSkills: [],
      skillDirs: [],
      agents: [
        {
          name: "ce-correctness-reviewer",
          content: "---\nname: ce-correctness-reviewer\nprompt_mode: full\nmodel: inherit\npermission_mode: default\nagents_md: true\n---\n\nReview for logic errors.",
        },
      ],
      commands: [],
      mcpServers: undefined,
      pluginJson: {
        name: "compound-engineering",
        version: "0.0.0-dev-grok",
        description: "Test Grok plugin",
      },
    }

    await writeGrokBundle(tempRoot, bundle)

    const root = path.join(tempRoot, "compound-engineering")
    expect(await exists(path.join(root, "plugin.json"))).toBe(true)
    expect(await exists(path.join(root, "agents", "ce-correctness-reviewer.md"))).toBe(true)

    const pj = JSON.parse(await fs.readFile(path.join(root, "plugin.json"), "utf8"))
    expect(pj.name).toBe("compound-engineering")
  })

  test("writes skills with transform applied when skillDirs provided (integration with grok-content)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "grok-writer-skill-"))
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")

    const bundle: GrokBundle = {
      pluginName: "test-grok",
      generatedSkills: [],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: fixtureSkillDir,
        },
      ],
      agents: [],
      commands: [],
    }

    await writeGrokBundle(tempRoot, bundle)

    const writtenSkill = path.join(tempRoot, "test-grok", "skills", "skill-one", "SKILL.md")
    expect(await exists(writtenSkill)).toBe(true)

    const content = await fs.readFile(writtenSkill, "utf8")
    // The writer uses transformContentForGrok with transformAllMarkdown=true
    // We don't assert specific transform here (covered in grok-content.test.ts), just that it wrote
    expect(content.length).toBeGreaterThan(10)
  })

  test("logs helpful grok plugin install instructions", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "grok-log-"))
    const bundle: GrokBundle = {
      pluginName: "compound-engineering",
      generatedSkills: [],
      skillDirs: [],
      agents: [],
      commands: [],
    }

    // Capture console.log
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: any[]) => logs.push(args.join(" "))

    await writeGrokBundle(tempRoot, bundle)
    console.log = origLog

    const combined = logs.join("\n")
    expect(combined).toContain("grok plugin install")
    expect(combined).toContain("--plugin-dir")
  })
})
