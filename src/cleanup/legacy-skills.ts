import { promises as fs } from "fs"
import path from "path"
import { DEFAULT_PLUGIN_NAMESPACE, namespacedSkillsDir } from "../utils/plugin-namespace"
import type { Dirent } from "fs"

export type StaleFlatSkillType = "symlink" | "directory"

export type StaleFlatSkillEntry = {
  path: string
  type: StaleFlatSkillType
}

export interface CleanupResult {
  target: string
  skillsRoot: string
  staleEntries: StaleFlatSkillEntry[]
  removed: string[]
  skipped: string[]
}

export async function findStaleFlatSkills(
  skillsRoot: string,
  pluginNamespace = DEFAULT_PLUGIN_NAMESPACE,
): Promise<StaleFlatSkillEntry[]> {
  const namespacedDir = namespacedSkillsDir(skillsRoot, pluginNamespace)
  const namespacedEntries = await readDirSafe(namespacedDir)
  if (namespacedEntries.length === 0) {
    return []
  }

  const namespacedNames = new Set<string>()
  for (const entry of namespacedEntries) {
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      namespacedNames.add(entry.name)
    }
  }
  if (namespacedNames.size === 0) {
    return []
  }

  const namespaceDirName = path.basename(namespacedDir)
  const flatEntries = await readDirSafe(skillsRoot)
  const staleEntries: StaleFlatSkillEntry[] = []

  for (const entry of flatEntries) {
    if (entry.name === namespaceDirName) continue
    if (entry.name.startsWith(".")) continue
    if (!namespacedNames.has(entry.name)) continue

    const flatPath = path.join(skillsRoot, entry.name)
    const namespacedPath = path.join(namespacedDir, entry.name)

    let stat: Awaited<ReturnType<typeof fs.lstat>>
    try {
      stat = await fs.lstat(flatPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
      throw error
    }

    if (stat.isSymbolicLink()) {
      if (await symlinkTargetsMatch(flatPath, namespacedPath)) {
        staleEntries.push({ path: flatPath, type: "symlink" })
      }
      continue
    }

    if (stat.isDirectory() && await pathExists(namespacedPath)) {
      staleEntries.push({ path: flatPath, type: "directory" })
    }
  }

  return staleEntries
}

export async function removeStaleFlatSkills(
  skillsRoot: string,
  options: { dryRun: boolean; pluginNamespace?: string; target?: string },
): Promise<CleanupResult> {
  const staleEntries = await findStaleFlatSkills(
    skillsRoot,
    options.pluginNamespace ?? DEFAULT_PLUGIN_NAMESPACE,
  )

  const removed: string[] = []
  const skipped: string[] = []

  if (!options.dryRun) {
    for (const entry of staleEntries) {
      try {
        if (entry.type === "symlink") {
          await fs.unlink(entry.path)
        } else {
          await fs.rm(entry.path, { recursive: true, force: true })
        }
        removed.push(entry.path)
      } catch {
        skipped.push(entry.path)
      }
    }
  }

  return {
    target: options.target ?? "unknown",
    skillsRoot,
    staleEntries,
    removed,
    skipped,
  }
}

async function readDirSafe(dirPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw error
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function symlinkTargetsMatch(flatPath: string, namespacedPath: string): Promise<boolean> {
  const [flatTarget, namespacedTarget] = await Promise.all([
    resolveSymlinkTarget(flatPath),
    resolveSymlinkTarget(namespacedPath),
  ])
  return Boolean(flatTarget && namespacedTarget && flatTarget === namespacedTarget)
}

async function resolveSymlinkTarget(candidatePath: string): Promise<string | null> {
  try {
    return await fs.realpath(candidatePath)
  } catch {
    return null
  }
}
