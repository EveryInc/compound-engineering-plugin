import fs from "fs/promises"

/**
 * Create a symlink, safely replacing any existing symlink at target.
 * Only removes existing symlinks - refuses to delete real directories.
 */
export async function forceSymlink(source: string, target: string): Promise<void> {
  try {
    const stat = await fs.lstat(target)
    if (stat.isSymbolicLink()) {
      // Safe to remove existing symlink
      await fs.unlink(target)
    } else if (stat.isDirectory()) {
      // Refuse to delete real directories
      throw new Error(
        `Cannot create symlink at ${target}: a real directory exists there. ` +
        `Remove it manually if you want to replace it with a symlink.`
      )
    } else {
      // Regular file - remove it
      await fs.unlink(target)
    }
  } catch (err) {
    // ENOENT means target doesn't exist, which is fine
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err
    }
  }
  await fs.symlink(source, target)
}

/**
 * Validate a skill name to prevent path traversal attacks.
 * Returns true if safe, false if potentially malicious.
 */
export function isValidSkillName(name: string): boolean {
  if (!name || name.length === 0) return false
  if (name.includes("/") || name.includes("\\")) return false
  if (name.includes("..")) return false
  if (name.includes("\0")) return false
  if (name === "." || name === "..") return false
  return true
}
