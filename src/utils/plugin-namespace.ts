import path from "path"
import { promises as fs } from "fs"

export const PLUGIN_NAMESPACE = "compound-engineering"

/**
 * Return the skills directory namespaced under the compound-engineering plugin.
 * Callers should write every skill directory beneath this path so plugin content
 * is grouped on disk instead of sprawling across the target tool's skills root.
 */
export function namespacedSkillsDir(skillsRoot: string): string {
  return path.join(skillsRoot, PLUGIN_NAMESPACE)
}

/**
 * Remove top-level skill entries left behind by pre-namespace installs.
 * Only entries whose names match the incoming bundle are touched, so user-authored
 * siblings in the same directory are left alone. Symlinks are removed too — sync
 * used to write them at the flat location, and without cleanup they'd point at
 * the same source as the namespaced copy.
 */
export async function removeLegacyFlatSkills(
  skillsRoot: string,
  skillNames: readonly string[],
): Promise<void> {
  for (const name of skillNames) {
    const legacyPath = path.join(skillsRoot, name)
    try {
      const stat = await fs.lstat(legacyPath)
      if (stat.isSymbolicLink()) {
        await fs.unlink(legacyPath)
      } else if (stat.isDirectory()) {
        await fs.rm(legacyPath, { recursive: true, force: true })
      } else if (stat.isFile()) {
        await fs.unlink(legacyPath)
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Warning: failed to remove legacy skill entry at ${legacyPath}: ${(err as Error).message}`)
      }
    }
  }
}
