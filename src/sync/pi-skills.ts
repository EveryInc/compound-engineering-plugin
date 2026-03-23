import path from "path"
import type { ClaudeSkill } from "../types/claude"
import { ensureDir } from "../utils/files"
import { copySkillDirForPi, normalizePiSkillName, preparePiSkillTargetForReplacement, skillFileMatchesPiTarget, uniquePiSkillName, type PiNameMaps } from "../utils/pi-skills"
import { forceSymlink, isValidSkillName } from "../utils/symlink"

export async function syncPiSkills(
  skills: ClaudeSkill[],
  skillsDir: string,
  extraNameMaps?: PiNameMaps,
): Promise<void> {
  await ensureDir(skillsDir)

  const validSkills = skills
    .filter((skill) => {
      if (!isValidSkillName(skill.name)) {
        console.warn(`Skipping skill with unsafe name: ${skill.name}`)
        return false
      }
      return true
    })
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

  const usedNames = new Set<string>()
  const targetNames = validSkills.map((skill) =>
    uniquePiSkillName(normalizePiSkillName(skill.name), usedNames),
  )

  const skillMap: Record<string, string> = {}
  validSkills.forEach((skill, i) => { skillMap[skill.name] = targetNames[i] })
  const nameMaps: PiNameMaps = { skills: skillMap, prompts: extraNameMaps?.prompts }

  for (const [i, skill] of validSkills.entries()) {
    const targetName = targetNames[i]
    const target = path.join(skillsDir, targetName)
    const alreadyPiCompatible = await skillFileMatchesPiTarget(skill.skillPath, targetName, nameMaps)

    if (skill.name === targetName && alreadyPiCompatible) {
      await preparePiSkillTargetForReplacement(target)
      await forceSymlink(skill.sourceDir, target)
      continue
    }

    await copySkillDirForPi(skill.sourceDir, target, targetName, nameMaps)
  }
}
