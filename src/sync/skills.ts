import path from "path"
import type { ClaudeSkill } from "../types/claude"
import { ensureDir, sanitizePathName } from "../utils/files"
import { forceSymlink, isValidSkillName } from "../utils/symlink"

export async function syncSkills(
  skills: ClaudeSkill[],
  skillsDir: string,
): Promise<void> {
  await ensureDir(skillsDir)

  const seen = new Set<string>()
  for (const skill of skills) {
    if (!isValidSkillName(skill.name)) {
      console.warn(`Skipping skill with invalid name: ${skill.name}`)
      continue
    }

    const safeName = sanitizePathName(skill.name)
    if (seen.has(safeName)) {
      console.warn(`Skipping skill "${skill.name}": sanitized name "${safeName}" collides with another skill`)
      continue
    }
    seen.add(safeName)

    const target = path.join(skillsDir, safeName)
    await forceSymlink(skill.sourceDir, target)
  }
}
