import { promises as fs } from "fs"
import path from "path"

export type AtomicWriteFailureStage = "beforeWrite" | "beforeRename"

type AtomicWriteFailureHook = (filePath: string, stage: AtomicWriteFailureStage) => void | Promise<void>
type ManagedPathSnapshotHook = (targetPath: string) => void | Promise<void>

export type TextFileSnapshot = {
  filePath: string
  existed: boolean
  content?: string
  mode?: number
}

export type ManagedPathSnapshot =
  | {
    targetPath: string
    existed: false
  }
  | {
    targetPath: string
    existed: true
    kind: "symlink"
    linkTarget: string
  }
  | {
    targetPath: string
    existed: true
    kind: "file"
    tempPath: string
    mode?: number
  }
  | {
    targetPath: string
    existed: true
    kind: "directory"
    tempPath: string
    mode?: number
  }

let atomicWriteFailureHook: AtomicWriteFailureHook | null = null
let managedPathSnapshotHook: ManagedPathSnapshotHook | null = null

export function setAtomicWriteFailureHookForTests(hook: AtomicWriteFailureHook | null): void {
  atomicWriteFailureHook = hook
}

export function setManagedPathSnapshotHookForTests(hook: ManagedPathSnapshotHook | null): void {
  managedPathSnapshotHook = hook
}

export async function backupFile(filePath: string): Promise<string | null> {
  if (!(await pathExists(filePath))) return null

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = `${filePath}.bak.${timestamp}`
    const stats = await fs.lstat(filePath)
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Refusing to back up unexpected target ${filePath}`)
    }
    await assertNoSymlinkAncestors(backupPath)
    await fs.copyFile(filePath, backupPath)
    await fs.chmod(backupPath, stats.mode & 0o777)
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

export async function ensureManagedDir(dirPath: string): Promise<void> {
  const resolved = path.resolve(dirPath)
  const root = path.parse(resolved).root
  const relative = path.relative(root, resolved)
  if (!relative) return

  let current = root
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)

    const stats = await fs.lstat(current).catch(() => null)
    if (stats) {
      if (stats.isSymbolicLink()) {
        throw new Error(`Refusing to mutate through symlinked ancestor ${current}`)
      }
      if (!stats.isDirectory()) {
        throw new Error(`Refusing to mutate through non-directory ancestor ${current}`)
      }
      continue
    }

    try {
      await fs.mkdir(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error
      }
    }
    const rechecked = await fs.lstat(current)
    if (rechecked.isSymbolicLink()) {
      throw new Error(`Refusing to mutate through symlinked ancestor ${current}`)
    }
    if (!rechecked.isDirectory()) {
      throw new Error(`Refusing to mutate through non-directory ancestor ${current}`)
    }
  }
}

export async function ensureManagedParentDir(filePath: string): Promise<void> {
  await assertNoSymlinkAncestors(filePath)
  await ensureManagedDir(path.dirname(filePath))
  await assertNoSymlinkAncestors(filePath)
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8")
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readText(filePath)
  return JSON.parse(raw) as T
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureManagedParentDir(filePath)
  await fs.writeFile(filePath, content, "utf8")
}

export async function writeTextIfChanged(
  filePath: string,
  content: string,
  options?: { existingContent?: string | null },
): Promise<boolean> {
  return writeTextAtomicIfChanged({ filePath, content, existingContent: options?.existingContent })
}

export async function writeTextSecure(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, { encoding: "utf8", mode: 0o600 })
  await fs.chmod(filePath, 0o600)
}

export async function writeTextSecureIfChanged(filePath: string, content: string): Promise<boolean> {
  return writeTextAtomicIfChanged({ filePath, content, mode: 0o600 })
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2)
  await writeText(filePath, content + "\n")
}

export async function writeJsonIfChanged(filePath: string, data: unknown): Promise<boolean> {
  return writeJsonAtomicIfChanged({ filePath, data })
}

export async function removeDirIfExists(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }
}

export async function removeFileIfExists(filePath: string): Promise<void> {
  try {
    await assertNoSymlinkAncestors(filePath)
    const stats = await fs.lstat(filePath)
    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to remove symlink target ${filePath}`)
    }
    if (!stats.isFile()) {
      throw new Error(`Refusing to remove unexpected target ${filePath}`)
    }
    await assertNoSymlinkAncestors(filePath)
    const rechecked = await fs.lstat(filePath)
    if (rechecked.isSymbolicLink()) {
      throw new Error(`Refusing to remove symlink target ${filePath}`)
    }
    if (!rechecked.isFile()) {
      throw new Error(`Refusing to remove unexpected target ${filePath}`)
    }
    await fs.unlink(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }
}

/** Write JSON with restrictive permissions (0o600) for files containing secrets */
export async function writeJsonSecure(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2)
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content + "\n", { encoding: "utf8", mode: 0o600 })
  await fs.chmod(filePath, 0o600)
}

export async function writeJsonSecureIfChanged(filePath: string, data: unknown): Promise<boolean> {
  return writeJsonAtomicIfChanged({ filePath, data, mode: 0o600 })
}

export async function assertNoSymlinkTarget(filePath: string): Promise<void> {
  try {
    const stats = await fs.lstat(filePath)
    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to write through symlink target ${filePath}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return
    }
    throw error
  }
}

export async function assertNoSymlinkAncestors(targetPath: string): Promise<void> {
  const resolvedTarget = path.resolve(targetPath)
  const ancestors: string[] = []
  let current = path.dirname(resolvedTarget)

  while (true) {
    ancestors.push(current)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  for (const ancestor of ancestors.reverse()) {
    try {
      const stats = await fs.lstat(ancestor)
      if (stats.isSymbolicLink()) {
        throw new Error(`Refusing to mutate through symlinked ancestor ${ancestor}`)
      }
      if (!stats.isDirectory()) {
        throw new Error(`Refusing to mutate through non-directory ancestor ${ancestor}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue
      }
      throw error
    }
  }
}

export async function writeTextAtomicIfChanged(options: {
  filePath: string
  content: string
  mode?: number
  skipFailureHook?: boolean
  existingContent?: string | null
}): Promise<boolean> {
  const { filePath, content, mode, skipFailureHook = false, existingContent } = options
  await assertNoSymlinkAncestors(filePath)
  await assertNoSymlinkTarget(filePath)
  const existing = existingContent === undefined ? await readText(filePath).catch(() => null) : existingContent
  if (existing === content) {
    return false
  }

  await ensureManagedParentDir(filePath)
  await assertNoSymlinkTarget(filePath)
  await maybeFailAtomicWrite(filePath, "beforeWrite", skipFailureHook)

  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )

  try {
    await fs.writeFile(tempPath, content, {
      encoding: "utf8",
      mode: mode ?? 0o644,
    })
    if (mode !== undefined) {
      await fs.chmod(tempPath, mode)
    }
    await maybeFailAtomicWrite(filePath, "beforeRename", skipFailureHook)
    await assertNoSymlinkAncestors(filePath)
    await assertNoSymlinkTarget(filePath)
    await fs.rename(tempPath, filePath)
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined)
    throw error
  }

  return true
}

export async function writeFileAtomicIfChanged(options: {
  filePath: string
  content: Buffer
  mode?: number
  skipFailureHook?: boolean
}): Promise<boolean> {
  const { filePath, content, mode, skipFailureHook = false } = options
  await assertNoSymlinkAncestors(filePath)
  await assertNoSymlinkTarget(filePath)
  const existing = await fs.readFile(filePath).catch(() => null)
  if (existing && existing.equals(content)) {
    return false
  }

  await ensureManagedParentDir(filePath)
  await assertNoSymlinkTarget(filePath)
  await maybeFailAtomicWrite(filePath, "beforeWrite", skipFailureHook)

  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )

  try {
    await fs.writeFile(tempPath, content, { mode: mode ?? 0o644 })
    if (mode !== undefined) {
      await fs.chmod(tempPath, mode)
    }
    await maybeFailAtomicWrite(filePath, "beforeRename", skipFailureHook)
    await assertNoSymlinkAncestors(filePath)
    await assertNoSymlinkTarget(filePath)
    await fs.rename(tempPath, filePath)
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined)
    throw error
  }

  return true
}

export async function writeJsonAtomicIfChanged(options: {
  filePath: string
  data: unknown
  mode?: number
  skipFailureHook?: boolean
}): Promise<boolean> {
  return writeTextAtomicIfChanged({
    filePath: options.filePath,
    content: JSON.stringify(options.data, null, 2) + "\n",
    mode: options.mode,
    skipFailureHook: options.skipFailureHook,
  })
}

export async function captureTextFileSnapshot(filePath: string): Promise<TextFileSnapshot> {
  await assertNoSymlinkAncestors(filePath)
  try {
    const stats = await fs.lstat(filePath)
    if (!stats.isFile()) {
      if (stats.isSymbolicLink()) {
        throw new Error(`Refusing to snapshot symlink target ${filePath}`)
      }
      throw new Error(`Refusing to snapshot non-file target ${filePath}`)
    }

    return {
      filePath,
      existed: true,
      content: await fs.readFile(filePath, "utf8"),
      mode: stats.mode & 0o777,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { filePath, existed: false }
    }
    throw error
  }
}

export async function restoreTextFileSnapshot(snapshot: TextFileSnapshot): Promise<void> {
  if (!snapshot.existed) {
    await removeManagedFileIfExists(snapshot.filePath)
    return
  }

  await writeTextAtomicIfChanged({
    filePath: snapshot.filePath,
    content: snapshot.content ?? "",
    mode: snapshot.mode,
    skipFailureHook: true,
  })
}

export async function captureManagedPathSnapshot(targetPath: string, snapshotRoot: string): Promise<ManagedPathSnapshot> {
  if (managedPathSnapshotHook) {
    await managedPathSnapshotHook(targetPath)
  }
  await assertNoSymlinkAncestors(targetPath)
  const stats = await fs.lstat(targetPath).catch(() => null)
  if (!stats) {
    return { targetPath, existed: false }
  }

  if (stats.isSymbolicLink()) {
    return {
      targetPath,
      existed: true,
      kind: "symlink",
      linkTarget: await fs.readlink(targetPath),
    }
  }

  const tempPath = path.join(snapshotRoot, `${Date.now()}-${Math.random().toString(16).slice(2)}`)

  if (stats.isDirectory()) {
    await copyManagedSnapshotDirectory(targetPath, tempPath)
    return {
      targetPath,
      existed: true,
      kind: "directory",
      tempPath,
      mode: stats.mode & 0o777,
    }
  }

  if (!stats.isFile()) {
    throw new Error(`Refusing to snapshot non-file target ${targetPath}`)
  }

  await ensureDir(path.dirname(tempPath))
  await fs.copyFile(targetPath, tempPath)
  return {
    targetPath,
    existed: true,
    kind: "file",
    tempPath,
    mode: stats.mode & 0o777,
  }
}

export async function restoreManagedPathSnapshot(snapshot: ManagedPathSnapshot): Promise<void> {
  if (!snapshot.existed) {
    await removeManagedPathIfExists(snapshot.targetPath)
    return
  }

  await assertNoSymlinkAncestors(snapshot.targetPath)
  await removeManagedPathIfExists(snapshot.targetPath)

  if (snapshot.kind === "symlink") {
    await assertNoSymlinkAncestors(snapshot.targetPath)
    await ensureDir(path.dirname(snapshot.targetPath))
    await fs.symlink(snapshot.linkTarget, snapshot.targetPath)
    return
  }

  if (snapshot.kind === "directory") {
    await copyManagedSnapshotDirectory(snapshot.tempPath, snapshot.targetPath)
    if (snapshot.mode !== undefined) {
      await fs.chmod(snapshot.targetPath, snapshot.mode)
    }
    return
  }

  await assertNoSymlinkAncestors(snapshot.targetPath)
  await ensureDir(path.dirname(snapshot.targetPath))
  await fs.copyFile(snapshot.tempPath, snapshot.targetPath)
  if (snapshot.mode !== undefined) {
    await fs.chmod(snapshot.targetPath, snapshot.mode)
  }
}

export async function removeManagedPathIfExists(targetPath: string): Promise<void> {
  await assertNoSymlinkAncestors(targetPath)
  const stats = await fs.lstat(targetPath).catch(() => null)
  if (!stats) return
  if (stats.isSymbolicLink()) {
    await assertNoSymlinkAncestors(targetPath)
    const rechecked = await fs.lstat(targetPath)
    if (!rechecked.isSymbolicLink()) {
      throw new Error(`Refusing to remove unexpected target ${targetPath}`)
    }
    await fs.unlink(targetPath)
    return
  }
  if (stats.isDirectory()) {
    await assertNoSymlinkAncestors(targetPath)
    const rechecked = await fs.lstat(targetPath)
    if (!rechecked.isDirectory() || rechecked.isSymbolicLink()) {
      throw new Error(`Refusing to remove unexpected target ${targetPath}`)
    }
    await fs.rm(targetPath, { recursive: true, force: true })
    return
  }
  if (stats.isFile()) {
    await assertNoSymlinkAncestors(targetPath)
    const rechecked = await fs.lstat(targetPath)
    if (!rechecked.isFile() || rechecked.isSymbolicLink()) {
      throw new Error(`Refusing to remove unexpected target ${targetPath}`)
    }
    await fs.unlink(targetPath)
    return
  }
  throw new Error(`Refusing to remove unexpected target ${targetPath}`)
}

export async function removeManagedFileIfExists(filePath: string): Promise<void> {
  try {
    await assertNoSymlinkAncestors(filePath)
    const stats = await fs.lstat(filePath)
    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to remove symlink target ${filePath}`)
    }
    await fs.unlink(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return
    }
    throw error
  }
}

async function copyManagedSnapshotDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await assertNoSymlinkAncestors(targetDir)
  await ensureDir(targetDir)
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copyManagedSnapshotDirectory(sourcePath, targetPath)
      continue
    }

    if (entry.isFile()) {
      await assertNoSymlinkAncestors(targetPath)
      await ensureDir(path.dirname(targetPath))
      await fs.copyFile(sourcePath, targetPath)
      continue
    }

    throw new Error(`Refusing to snapshot unexpected target ${sourcePath}`)
  }
}

async function maybeFailAtomicWrite(filePath: string, stage: AtomicWriteFailureStage, skipFailureHook: boolean): Promise<void> {
  if (skipFailureHook || !atomicWriteFailureHook) return
  await atomicWriteFailureHook(filePath, stage)
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

export function isSafePathComponent(name: string): boolean {
  if (!name || name.length === 0) return false
  if (name === "." || name === "..") return false
  if (name.includes("\0")) return false
  if (name.includes("/") || name.includes("\\")) return false
  if (name.includes("..")) return false
  return true
}

export function assertSafePathComponent(name: string, label = "path component"): string {
  const value = String(name || "").trim()
  if (!isSafePathComponent(value)) {
    throw new Error(`Unsafe ${label}: ${name}`)
  }
  return value
}

export function sanitizeSafePathName(name: string, label = "path component"): string {
  const safeName = assertSafePathComponent(name, label)
  const sanitized = sanitizePathName(safeName)
  if (!isSafePathComponent(sanitized)) {
    throw new Error(`Unsafe ${label}: ${name}`)
  }
  return sanitized
}

export function assertPathWithinRoot(targetPath: string, root: string, label = "path"): string {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(targetPath)
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Refusing to use ${label} outside managed root ${resolvedTarget}`)
  }
  return resolvedTarget
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
 * Copy a skill directory, optionally transforming SKILL.md content.
 * All other files are copied verbatim. Used by target writers to apply
 * platform-specific content transforms to pass-through skills.
 */
export async function copySkillDir(
  sourceDir: string,
  targetDir: string,
  transformSkillContent?: (content: string) => string,
): Promise<void> {
  await ensureDir(targetDir)
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copySkillDir(sourcePath, targetPath, transformSkillContent)
    } else if (entry.isFile()) {
      if (entry.name === "SKILL.md" && transformSkillContent) {
        const content = await readText(sourcePath)
        await writeText(targetPath, transformSkillContent(content))
      } else {
        await ensureDir(path.dirname(targetPath))
        await fs.copyFile(sourcePath, targetPath)
      }
    }
  }
}
