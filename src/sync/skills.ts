import path from "path"
import type { ClaudeSkill } from "../types/claude"
import { ensureDir, sanitizePathName } from "../utils/files"
import { namespacedSkillsDir, removeLegacyFlatSkills } from "../utils/plugin-namespace"
import { forceSymlink, isValidSkillName } from "../utils/symlink"

export async function syncSkills(
  skills: ClaudeSkill[],
  skillsDir: string,
): Promise<void> {
  await ensureDir(skillsDir)

  const safeNames: string[] = []
  const seen = new Set<string>()
  const resolved: Array<{ skill: ClaudeSkill; safeName: string }> = []
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
    safeNames.push(safeName)
    resolved.push({ skill, safeName })
  }

  if (resolved.length === 0) return

  await removeLegacyFlatSkills(skillsDir, safeNames)

  const namespaced = namespacedSkillsDir(skillsDir)
  await ensureDir(namespaced)

  for (const { skill, safeName } of resolved) {
    const target = path.join(namespaced, safeName)
    await forceSymlink(skill.sourceDir, target)
  }
}
