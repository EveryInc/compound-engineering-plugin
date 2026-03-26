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
name: ce:plan
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

    expect(installedSkill).toContain("name: ce-plan")
    expect(installedSkill).toContain('Run ce_subagent with agent="repo-research-analyst" and task="feature_description".')
    expect(installedSkill).toContain('Run ce_subagent with agent="learnings-researcher" and task="feature_description".')
    expect(installedSkill).toContain('Run ce_subagent with agent="code-simplicity-reviewer".')
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

  test("rewrites copied skill frontmatter names to match Pi-safe directory names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-frontmatter-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: generate_command",
        "description: Generate a command",
        "---",
        "",
        "# Generate command",
        "",
        "1. Task compound-engineering:workflow:pr-comment-resolver(comment1)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [
        {
          name: "generate-command",
          sourceDir: sourceSkillDir,
        },
      ],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const copiedSkill = await fs.readFile(path.join(outputRoot, "skills", "generate-command", "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("name: generate-command")
    expect(copiedSkill).not.toContain("name: generate_command")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"pr-comment-resolver\" and task=\"comment1\".")
  })

  test("preserves nested frontmatter objects when rewriting copied Pi skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-nested-frontmatter-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: nested_skill",
        "description: Nested metadata",
        "metadata:",
        "  owner: dragos",
        "  flags:",
        "    sync: true",
        "---",
        "",
        "# Nested skill",
        "",
        "No Pi rewrite needed.",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [
        {
          name: "nested-skill",
          sourceDir: sourceSkillDir,
        },
      ],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const copiedSkill = await fs.readFile(path.join(outputRoot, "skills", "nested-skill", "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("name: nested-skill")
    expect(copiedSkill).toContain("metadata:\n  owner: dragos\n  flags:\n    sync: true")
    expect(copiedSkill).not.toContain("[object Object]")
  })

  test("copies symlinked file assets when Pi skill materialization is required", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-symlink-asset-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")
    const sharedAssetPath = path.join(tempRoot, "shared.txt")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(sharedAssetPath, "shared asset\n")
    await fs.symlink(sharedAssetPath, path.join(sourceSkillDir, "asset.txt"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce:plan",
        "description: Planning workflow",
        "---",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await writePiBundle(outputRoot, bundle)

    const copiedAsset = await fs.readFile(path.join(outputRoot, "skills", "ce-plan", "asset.txt"), "utf8")
    expect(copiedAsset).toBe("shared asset\n")
  })

  test("rejects cyclic directory symlinks during Pi skill materialization", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-skill-cycle-"))
    const outputRoot = path.join(tempRoot, ".pi")
    const sourceSkillDir = path.join(tempRoot, "source-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.symlink(sourceSkillDir, path.join(sourceSkillDir, "loop"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce:plan",
        "description: Planning workflow",
        "---",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const bundle: PiBundle = {
      prompts: [],
      skillDirs: [{ name: "ce-plan", sourceDir: sourceSkillDir }],
      generatedSkills: [],
      extensions: [],
    }

    await expect(writePiBundle(outputRoot, bundle)).rejects.toThrow("cyclic directory symlink")
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
