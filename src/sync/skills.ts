import path from "path"
import type { ClaudeSkill } from "../types/claude"
import { ensureDir } from "../utils/files"
import { forceSymlink, isValidSkillName } from "../utils/symlink"

export async function syncSkills(
  skills: ClaudeSkill[],
  skillsDir: string,
): Promise<void> {
  await ensureDir(skillsDir)

  for (const skill of skills) {
    if (!isValidSkillName(skill.name)) {
      console.warn(`Skipping skill with invalid name: ${skill.name}`)
      continue
    }

    const target = path.join(skillsDir, skill.name)
    await forceSymlink(skill.sourceDir, target)
  }
}
