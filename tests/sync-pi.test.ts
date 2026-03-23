import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { syncToPi } from "../src/sync/pi"
import type { ClaudeHomeConfig } from "../src/parsers/claude-home"

describe("syncToPi", () => {
  test("symlinks skills and writes MCPorter config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-"))
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "skill-one",
          sourceDir: fixtureSkillDir,
          skillPath: path.join(fixtureSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
        local: { command: "echo", args: ["hello"] },
      },
    }

    await syncToPi(config, tempRoot)

    const linkedSkillPath = path.join(tempRoot, "skills", "skill-one")
    const linkedStat = await fs.lstat(linkedSkillPath)
    expect(linkedStat.isSymbolicLink()).toBe(true)

    const mcporterPath = path.join(tempRoot, "compound-engineering", "mcporter.json")
    const mcporterConfig = JSON.parse(await fs.readFile(mcporterPath, "utf8")) as {
      mcpServers: Record<string, { baseUrl?: string; command?: string }>
    }

    expect(mcporterConfig.mcpServers.context7?.baseUrl).toBe("https://mcp.context7.com/mcp")
    expect(mcporterConfig.mcpServers.local?.command).toBe("echo")
  })

  test("materializes invalid skill names into Pi-safe directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-invalid-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce:plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce:plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const materializedSkillPath = path.join(tempRoot, "skills", "ce-plan")
    const skillStat = await fs.lstat(materializedSkillPath)
    expect(skillStat.isSymbolicLink()).toBe(false)

    const copiedSkill = await fs.readFile(path.join(materializedSkillPath, "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("name: ce-plan")
    expect(copiedSkill).not.toContain("name: ce:plan")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
  })

  test("materializes valid Pi-named skills when body needs Pi-specific rewrites", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-transform-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-valid")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const syncedSkillPath = path.join(tempRoot, "skills", "ce-plan")
    const skillStat = await fs.lstat(syncedSkillPath)
    expect(skillStat.isSymbolicLink()).toBe(false)

    const copiedSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
  })

  test("replaces a previously materialized Pi skill directory with a symlink once rewrites are no longer needed", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-dir-to-symlink-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-transition")
    const syncedSkillPath = path.join(tempRoot, "skills", "ce-plan")
    const skillPath = path.join(sourceSkillDir, "SKILL.md")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      skillPath,
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath,
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)
    expect((await fs.lstat(syncedSkillPath)).isSymbolicLink()).toBe(false)

    await fs.writeFile(
      skillPath,
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "No Pi rewrite needed.",
        "Updated from source.",
      ].join("\n"),
    )

    await syncToPi(config, tempRoot)

    const syncedStat = await fs.lstat(syncedSkillPath)
    expect(syncedStat.isSymbolicLink()).toBe(true)

    const liveSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(liveSkill).toContain("Updated from source.")
    expect(liveSkill).not.toContain("Run ce_subagent")

    const files = await fs.readdir(path.join(tempRoot, "skills"))
    const backupDirName = files.find((file) => file.startsWith("ce-plan.bak."))
    expect(backupDirName).toBeDefined()
  })

  test("replaces an existing symlink when Pi-specific materialization is required", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-symlink-migration-"))
    const existingTargetDir = path.join(tempRoot, "existing-skill")
    const sourceSkillDir = path.join(tempRoot, "claude-skill-migrated")
    const syncedSkillPath = path.join(tempRoot, "skills", "ce-plan")

    await fs.mkdir(existingTargetDir, { recursive: true })
    await fs.writeFile(path.join(existingTargetDir, "SKILL.md"), "---\nname: ce-plan\ndescription: Existing\n---\n\n# Existing\n")
    await fs.mkdir(path.dirname(syncedSkillPath), { recursive: true })
    await fs.symlink(existingTargetDir, syncedSkillPath)

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const skillStat = await fs.lstat(syncedSkillPath)
    expect(skillStat.isSymbolicLink()).toBe(false)

    const copiedSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
  })

  test("backs up an existing real directory before Pi-specific materialization", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-backup-dir-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-updated")
    const syncedSkillPath = path.join(tempRoot, "skills", "ce-plan")

    await fs.mkdir(syncedSkillPath, { recursive: true })
    await fs.writeFile(
      path.join(syncedSkillPath, "SKILL.md"),
      "---\nname: ce-plan\ndescription: Existing\n---\n\n# Existing\n\nLocal edits\n",
    )

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const copiedSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")

    const files = await fs.readdir(path.join(tempRoot, "skills"))
    const backupDirName = files.find((file) => file.startsWith("ce-plan.bak."))
    expect(backupDirName).toBeDefined()

    const backupSkill = await fs.readFile(path.join(tempRoot, "skills", backupDirName!, "SKILL.md"), "utf8")
    expect(backupSkill).toContain("Local edits")
  })

  test("merges existing MCPorter config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-merge-"))
    const mcporterPath = path.join(tempRoot, "compound-engineering", "mcporter.json")
    await fs.mkdir(path.dirname(mcporterPath), { recursive: true })

    await fs.writeFile(
      mcporterPath,
      JSON.stringify({ mcpServers: { existing: { baseUrl: "https://example.com/mcp" } } }, null, 2),
    )

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }

    await syncToPi(config, tempRoot)

    const merged = JSON.parse(await fs.readFile(mcporterPath, "utf8")) as {
      mcpServers: Record<string, { baseUrl?: string }>
    }

    expect(merged.mcpServers.existing?.baseUrl).toBe("https://example.com/mcp")
    expect(merged.mcpServers.context7?.baseUrl).toBe("https://mcp.context7.com/mcp")
  })

  test("syncs without crashing when a skill has malformed frontmatter", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-malformed-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: [broken",
        "description: broken frontmatter",
        "---",
        "",
        "# Broken skill",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "broken-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const syncedSkillPath = path.join(tempRoot, "skills", "broken-skill")
    const skillStat = await fs.lstat(syncedSkillPath)
    expect(skillStat.isDirectory()).toBe(true)

    const copiedSkill = await fs.readFile(path.join(syncedSkillPath, "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
    expect(copiedSkill).toContain("name: [broken")
  })

  test("rewrites frontmatterless skills during Pi sync", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-frontmatterless-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill-frontmatterless")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "# Personal skill",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "frontmatterless-skill",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const copiedSkill = await fs.readFile(path.join(tempRoot, "skills", "frontmatterless-skill", "SKILL.md"), "utf8")
    expect(copiedSkill).toContain("Run ce_subagent with agent=\"repo-research-analyst\" and task=\"feature_description\".")
    expect(copiedSkill).not.toContain("name:")
  })

  test("resolves /skill: refs to deduped targets when personal skill names collide", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-skill-collision-"))
    const skillDirHyphen = path.join(tempRoot, "generate-command")
    const skillDirUnderscore = path.join(tempRoot, "generate_command")

    await fs.mkdir(skillDirHyphen, { recursive: true })
    await fs.writeFile(
      path.join(skillDirHyphen, "SKILL.md"),
      [
        "---",
        "name: generate-command",
        "description: Hyphen skill",
        "---",
        "",
        "# Hyphen skill",
        "",
        "Then run /skill:generate_command for the other one.",
      ].join("\n"),
    )

    await fs.mkdir(skillDirUnderscore, { recursive: true })
    await fs.writeFile(
      path.join(skillDirUnderscore, "SKILL.md"),
      [
        "---",
        "name: generate_command",
        "description: Underscore skill",
        "---",
        "",
        "# Underscore skill",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "generate_command",
          sourceDir: skillDirUnderscore,
          skillPath: path.join(skillDirUnderscore, "SKILL.md"),
        },
        {
          name: "generate-command",
          sourceDir: skillDirHyphen,
          skillPath: path.join(skillDirHyphen, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    // After codepoint sorting: generate-command (0x2D) < generate_command (0x5F)
    // generate-command gets base name, generate_command gets -2
    const baseSkill = await fs.readFile(path.join(tempRoot, "skills", "generate-command", "SKILL.md"), "utf8")
    expect(baseSkill).toContain("/skill:generate-command-2")

    const suffixedSkill = await fs.readFile(path.join(tempRoot, "skills", "generate-command-2", "SKILL.md"), "utf8")
    expect(suffixedSkill).toContain("name: generate-command-2")
  })

  test("writes compat extension when skills-only config has Task calls", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-skills-only-compat-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const compatPath = path.join(tempRoot, "extensions", "compound-engineering-compat.ts")
    const compatContent = await fs.readFile(compatPath, "utf8")
    expect(compatContent).toContain('name: "ce_subagent"')
  })

  test("copies symlinked file assets when Pi sync materializes a skill", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-symlink-asset-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")
    const sharedAssetPath = path.join(tempRoot, "shared.txt")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.writeFile(sharedAssetPath, "shared asset\n")
    await fs.symlink(sharedAssetPath, path.join(sourceSkillDir, "asset.txt"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await syncToPi(config, tempRoot)

    const copiedAsset = await fs.readFile(path.join(tempRoot, "skills", "ce-plan", "asset.txt"), "utf8")
    expect(copiedAsset).toBe("shared asset\n")
  })

  test("rejects cyclic directory symlinks during Pi sync materialization", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-pi-cycle-"))
    const sourceSkillDir = path.join(tempRoot, "claude-skill")

    await fs.mkdir(sourceSkillDir, { recursive: true })
    await fs.symlink(sourceSkillDir, path.join(sourceSkillDir, "loop"))
    await fs.writeFile(
      path.join(sourceSkillDir, "SKILL.md"),
      [
        "---",
        "name: ce-plan",
        "description: Plan workflow",
        "---",
        "",
        "# Plan",
        "",
        "- Task compound-engineering:research:repo-research-analyst(feature_description)",
      ].join("\n"),
    )

    const config: ClaudeHomeConfig = {
      skills: [
        {
          name: "ce-plan",
          sourceDir: sourceSkillDir,
          skillPath: path.join(sourceSkillDir, "SKILL.md"),
        },
      ],
      mcpServers: {},
    }

    await expect(syncToPi(config, tempRoot)).rejects.toThrow("cyclic directory symlink")
  })
})
