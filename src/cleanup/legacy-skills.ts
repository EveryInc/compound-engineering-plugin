import { promises as fs } from "fs"
import path from "path"
import { pathExists, readDirSafe } from "../utils/files"
import { DEFAULT_PLUGIN_NAMESPACE, namespacedSkillsDir } from "../utils/plugin-namespace"

export type StaleFlatSkillType = "symlink" | "directory"

export type StaleFlatSkillEntry = {
  path: string
  type: StaleFlatSkillType
}

export interface CleanupResult {
  skillsRoot: string
  staleEntries: StaleFlatSkillEntry[]
  protectedEntries: StaleFlatSkillEntry[]
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
  options: {
    dryRun: boolean
    pluginNamespace?: string
    skip?: Iterable<string>
  },
): Promise<CleanupResult> {
  const allEntries = await findStaleFlatSkills(
    skillsRoot,
    options.pluginNamespace ?? DEFAULT_PLUGIN_NAMESPACE,
  )

  // Filter out entries whose names the caller explicitly asked to preserve.
  // Cleanup matches by directory name only -- this is the user's escape hatch
  // when a plugin skill name collides with a user-authored skill directory.
  const skipSet = options.skip ? new Set(options.skip) : null
  const staleEntries = skipSet
    ? allEntries.filter((entry) => !skipSet.has(path.basename(entry.path)))
    : allEntries
  const protectedEntries = skipSet
    ? allEntries.filter((entry) => skipSet.has(path.basename(entry.path)))
    : []

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
    skillsRoot,
    staleEntries,
    protectedEntries,
    removed,
    skipped,
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
