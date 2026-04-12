import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import {
  PLUGIN_NAMESPACE,
  namespacedSkillsDir,
  removeLegacyFlatSkills,
} from "../src/utils/plugin-namespace"

describe("namespacedSkillsDir", () => {
  test("joins the plugin namespace onto the skills root", () => {
    expect(namespacedSkillsDir("/tmp/.codex/skills")).toBe(
      `/tmp/.codex/skills/${PLUGIN_NAMESPACE}`,
    )
  })
})

describe("removeLegacyFlatSkills", () => {
  async function setupTempSkillsDir(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), "legacy-flat-"))
  }

  async function exists(p: string): Promise<boolean> {
    try {
      await fs.lstat(p)
      return true
    } catch {
      return false
    }
  }

  test("removes flat directories named after bundle skills", async () => {
    const skillsRoot = await setupTempSkillsDir()
    const skillDir = path.join(skillsRoot, "agent-browser")
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "stale\n")

    await removeLegacyFlatSkills(skillsRoot, ["agent-browser"])

    expect(await exists(skillDir)).toBe(false)
  })

  test("removes flat symlinks (sync leftovers)", async () => {
    const skillsRoot = await setupTempSkillsDir()
    const source = await fs.mkdtemp(path.join(os.tmpdir(), "legacy-source-"))
    await fs.writeFile(path.join(source, "SKILL.md"), "from sync\n")
    const link = path.join(skillsRoot, "ce-plan")
    await fs.symlink(source, link)

    await removeLegacyFlatSkills(skillsRoot, ["ce-plan"])

    expect(await exists(link)).toBe(false)
    // Source directory is untouched
    expect(await exists(path.join(source, "SKILL.md"))).toBe(true)
  })

  test("leaves user-authored siblings alone", async () => {
    const skillsRoot = await setupTempSkillsDir()
    const pluginSkill = path.join(skillsRoot, "ce-brainstorm")
    const userSkill = path.join(skillsRoot, "my-personal-skill")
    await fs.mkdir(pluginSkill)
    await fs.mkdir(userSkill)

    await removeLegacyFlatSkills(skillsRoot, ["ce-brainstorm"])

    expect(await exists(pluginSkill)).toBe(false)
    expect(await exists(userSkill)).toBe(true)
  })

  test("is idempotent when legacy entries are already gone", async () => {
    const skillsRoot = await setupTempSkillsDir()
    await removeLegacyFlatSkills(skillsRoot, ["missing-skill"])
    // Second run should also not throw
    await removeLegacyFlatSkills(skillsRoot, ["missing-skill"])
    expect(await exists(path.join(skillsRoot, "missing-skill"))).toBe(false)
  })
})
