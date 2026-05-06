import { promises as fs } from "fs"
import path from "path"

export async function backupFile(filePath: string): Promise<string | null> {
  if (!(await pathExists(filePath))) return null

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = `${filePath}.bak.${timestamp}`
    await fs.copyFile(filePath, backupPath)
    return backupPath
  } catch {
    return null
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8")
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readText(filePath)
  return JSON.parse(raw) as T
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, "utf8")
}

export async function writeTextSecure(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, { encoding: "utf8", mode: 0o600 })
  await fs.chmod(filePath, 0o600)
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2)
  await writeText(filePath, content + "\n")
}

/** Write JSON with restrictive permissions (0o600) for files containing secrets */
export async function writeJsonSecure(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2)
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content + "\n", { encoding: "utf8", mode: 0o600 })
  await fs.chmod(filePath, 0o600)
}

export async function walkFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const results: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      const nested = await walkFiles(fullPath)
      results.push(...nested)
    } else if (entry.isFile()) {
      results.push(fullPath)
    }
  }
  return results
}

/**
 * Sanitize a name for use as a filesystem path component.
 * Replaces colons with hyphens so colon-namespaced names
 * (e.g. "ce:brainstorm") become flat directory names ("ce-brainstorm")
 * instead of failing on Windows where colons are illegal in filenames.
 */
export function sanitizePathName(name: string): string {
  return name.replace(/:/g, "-")
}

/**
 * Validate that a manifest-supplied relative path is safe to join against a
 * managed root before deleting or moving anything at that location.
 *
 * Install manifests (`install-manifest.json`) are read back from disk during
 * reinstall/cleanup and fed into `fs.rm`/`fs.rename`. An attacker or a
 * corrupted file could include entries like `../../config.toml` or
 * `/etc/passwd` that would cause the cleanup to operate outside the intended
 * managed tree. This helper rejects:
 *
 *   - non-string values
 *   - empty strings
 *   - absolute paths (POSIX `/foo`, Windows `C:\foo`)
 *   - any `..` path segment (including `foo/../bar`)
 *   - paths that, when joined with `rootDir`, resolve outside `rootDir`
 *
 * The `rootDir` check is defense-in-depth against edge cases the first two
 * checks miss (e.g. platform-specific separators or encoded traversal the
 * split-based check didn't catch).
 */
export function isSafeManagedPath(rootDir: string, candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || candidate.length === 0) return false
  if (path.isAbsolute(candidate)) return false
  // Reject any traversal segment (`..`) split on either separator so the
  // check is uniform across platforms.
  const segments = candidate.split(/[\\/]/)
  if (segments.some((segment) => segment === "..")) return false
  // Final containment check: the fully-resolved candidate must stay inside
  // the resolved root. This catches anything the above two checks missed.
  const resolvedRoot = path.resolve(rootDir)
  const resolvedCandidate = path.resolve(resolvedRoot, candidate)
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(resolvedRoot + path.sep)) {
    return false
  }
  return true
}

/**
 * Resolve a colon-separated command name into a filesystem path.
 * e.g. resolveCommandPath("/commands", "ce:plan", ".md") -> "/commands/ce/plan.md"
 * Creates intermediate directories as needed.
 */
export async function resolveCommandPath(dir: string, name: string, ext: string): Promise<string> {
  const parts = name.split(":")
  if (parts.length > 1) {
    const nestedDir = path.join(dir, ...parts.slice(0, -1))
    await ensureDir(nestedDir)
    return path.join(nestedDir, `${parts[parts.length - 1]}${ext}`)
  }
  return path.join(dir, `${name}${ext}`)
}

export async function copyDir(sourceDir: string, targetDir: string): Promise<void> {
  await ensureDir(targetDir)
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath)
    } else if (entry.isFile()) {
      await ensureDir(path.dirname(targetPath))
      await fs.copyFile(sourcePath, targetPath)
    }
  }
}

/**
 * Copy a skill directory, optionally transforming markdown content.
 * Non-markdown files are copied verbatim. Used by target writers to apply
 * platform-specific content transforms to pass-through skills.
 *
 * By default only SKILL.md is transformed (safe for slash-command rewrites
 * that shouldn't touch reference files). Set `transformAllMarkdown` to also
 * transform reference .md files — needed when the transform rewrites content
 * that appears in reference files (e.g. fully-qualified agent names).
 */
export async function copySkillDir(
  sourceDir: string,
  targetDir: string,
  transformSkillContent?: (content: string) => string,
  transformAllMarkdown?: boolean,
): Promise<void> {
  await ensureDir(targetDir)
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copySkillDir(sourcePath, targetPath, transformSkillContent, transformAllMarkdown)
    } else if (entry.isFile()) {
      const shouldTransform = transformSkillContent && (
        entry.name === "SKILL.md" || (transformAllMarkdown && entry.name.endsWith(".md"))
      )
      if (shouldTransform) {
        const content = await readText(sourcePath)
        await writeText(targetPath, transformSkillContent(content))
      } else {
        await ensureDir(path.dirname(targetPath))
        await fs.copyFile(sourcePath, targetPath)
      }
    }
  }
}
