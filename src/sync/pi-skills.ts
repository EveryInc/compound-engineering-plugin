import { promises as fs } from "fs"
import path from "path"
import type { ClaudeSkill } from "../types/claude"
import { ensureDir } from "../utils/files"
import { copySkillDirForPi, collectPiSameRunDependencies, type PiNameMaps } from "../utils/pi-skills"
import { isValidSkillName } from "../utils/symlink"
import type { PiSyncArtifactStatus } from "./commands"
import { classifyUnsupportedPiSyncStatus, isUnsupportedPiSyncArtifactError } from "./pi-artifact-status"

type SyncPiSkillHooks = {
  onBeforeMutate?: (skillName: string, targetPath: string, mode: "incremental" | "replace") => void | Promise<void>
}

export type SyncPiSkillResult = {
  sourceName: string
  emittedName: string
  status: PiSyncArtifactStatus
  warning?: string
  sameRunDependencies?: {
    skills: string[]
    prompts: string[]
  }
}

export async function collectSyncablePiSkills(skills: ClaudeSkill[]): Promise<ClaudeSkill[]> {
  const validSkills: ClaudeSkill[] = []

  for (const skill of [...skills].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (!isValidSkillName(skill.name)) {
      console.warn(`Skipping skill with unsafe name: ${skill.name}`)
      continue
    }

    const trustedRoot = skill.trustedRoot ?? skill.entryDir ?? skill.sourceDir
    const discoveryPath = skill.entryDir ?? skill.sourceDir
    const isWithinTrustedRoot = skill.entryDir
      ? isLexicalPathWithinRoot(discoveryPath, trustedRoot)
      : await isCanonicalPathWithinRoot(discoveryPath, trustedRoot)
    if (!isWithinTrustedRoot) {
      console.warn(`Skipping skill outside trusted root: ${skill.name}`)
      continue
    }

    validSkills.push(skill)
  }

  return validSkills
}

export async function syncPiSkills(
  skills: ClaudeSkill[],
  skillsDir: string,
  skillMap: Record<string, string>,
  nameMaps?: PiNameMaps,
  hooks?: SyncPiSkillHooks,
): Promise<SyncPiSkillResult[]> {
  await ensureDir(skillsDir)

  const materialized: SyncPiSkillResult[] = []

  for (const skill of skills) {
    const targetName = skillMap[skill.name]
    if (!targetName) continue
    const target = path.join(skillsDir, targetName)
    const trustedBoundary = skill.trustedBoundary ?? skill.sourceDir

    try {
      await copySkillDirForPi(
        skill.sourceDir,
        target,
        targetName,
        nameMaps,
        {
          trustedRoot: trustedBoundary,
        },
        {
          preserveUnknownQualifiedRefs: true,
          rejectUnknownQualifiedTaskRefs: true,
          rejectUnresolvedFirstPartyQualifiedRefs: true,
        },
        {
          onBeforeMutate: (mode) => hooks?.onBeforeMutate?.(skill.name, target, mode),
        },
      )
    } catch (error) {
      if (!isUnsupportedPiSyncArtifactError(error)) {
        throw error
      }
      materialized.push({
        sourceName: skill.name,
        emittedName: targetName,
        status: classifyUnsupportedPiSyncStatus(error instanceof Error ? error.message : String(error)),
        warning: `Skipping unsupported Pi sync skill ${skill.name}: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }
    materialized.push({
      sourceName: skill.name,
      emittedName: targetName,
      status: "published",
      sameRunDependencies: collectPiSameRunDependencies(await fs.readFile(skill.skillPath, "utf8").catch(() => "")),
    })
  }

  return materialized
}

async function isCanonicalPathWithinRoot(candidatePath: string, trustedRoot: string): Promise<boolean> {
  const [resolvedCandidate, resolvedRoot] = await Promise.all([
    canonicalizePath(candidatePath),
    canonicalizePath(trustedRoot),
  ])

  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + path.sep)
}

function isLexicalPathWithinRoot(candidatePath: string, trustedRoot: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath)
  const resolvedRoot = path.resolve(trustedRoot)
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + path.sep)
}

async function canonicalizePath(targetPath: string): Promise<string> {
  try {
    return await fs.realpath(targetPath)
  } catch {
    return path.resolve(targetPath)
  }
}
