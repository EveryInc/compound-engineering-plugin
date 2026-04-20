import fs from "fs/promises"
import path from "path"
import { ensureDir, pathExists, readText, sanitizePathName, writeJson } from "../utils/files"

const MANAGED_INSTALL_MANIFEST = "install-manifest.json"

export type ManagedInstallManifest = {
  version: 1
  pluginName: string
  groups: Record<string, string[]>
}

export function sanitizeManagedPluginName(name: string): string {
  return sanitizePathName(name).replace(/[\\/]/g, "-")
}

/**
 * Returns the directory segment used to namespace managed install artifacts
 * (manifest, legacy-backup) under a target's root. When a sanitized plugin
 * name is supplied, it is used verbatim so multiple plugins installed into
 * the same target root keep independent manifests. When no plugin name is
 * supplied (legacy callers / bundles without `pluginName`), the historical
 * `compound-engineering` segment is returned to preserve pre-existing paths.
 */
export function resolveManagedSegment(pluginName?: string): string {
  return pluginName ?? "compound-engineering"
}

export async function readManagedInstallManifest(
  managedDir: string,
  pluginName: string,
): Promise<ManagedInstallManifest | null> {
  const manifestPath = path.join(managedDir, MANAGED_INSTALL_MANIFEST)
  try {
    const raw = await readText(manifestPath)
    const parsed = JSON.parse(raw) as Partial<ManagedInstallManifest>
    if (
      parsed.version === 1 &&
      parsed.pluginName === pluginName &&
      parsed.groups &&
      typeof parsed.groups === "object" &&
      !Array.isArray(parsed.groups) &&
      Object.values(parsed.groups).every((entries) => Array.isArray(entries))
    ) {
      return parsed as ManagedInstallManifest
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Ignoring unreadable install manifest at ${manifestPath}.`)
    }
  }
  return null
}

export async function writeManagedInstallManifest(
  managedDir: string,
  manifest: ManagedInstallManifest,
): Promise<void> {
  await writeJson(path.join(managedDir, MANAGED_INSTALL_MANIFEST), manifest)
}

export async function cleanupRemovedManagedDirectories(
  rootDir: string,
  manifest: ManagedInstallManifest | null,
  group: string,
  currentEntries: string[],
): Promise<void> {
  if (!manifest) return
  const current = new Set(currentEntries)
  for (const relativePath of manifest.groups[group] ?? []) {
    if (!current.has(relativePath)) {
      await fs.rm(resolveArtifactPath(rootDir, relativePath), { recursive: true, force: true })
    }
  }
}

export async function cleanupRemovedManagedFiles(
  rootDir: string,
  manifest: ManagedInstallManifest | null,
  group: string,
  currentEntries: string[],
): Promise<void> {
  if (!manifest) return
  const current = new Set(currentEntries)
  for (const relativePath of manifest.groups[group] ?? []) {
    if (!current.has(relativePath)) {
      await fs.rm(resolveArtifactPath(rootDir, relativePath), { force: true })
    }
  }
}

export async function cleanupCurrentManagedDirectory(
  targetDir: string,
  manifest: ManagedInstallManifest | null,
  group: string,
  entryName: string,
): Promise<void> {
  if (!manifest?.groups[group]?.includes(entryName)) return
  await fs.rm(targetDir, { recursive: true, force: true })
}

export async function moveLegacyArtifactToBackup(
  managedDir: string,
  kind: string,
  artifactRoot: string,
  relativePath: string,
  label: string,
): Promise<void> {
  const artifactPath = resolveArtifactPath(artifactRoot, relativePath)
  if (!(await pathExists(artifactPath))) return

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(managedDir, "legacy-backup", timestamp, kind, ...relativePath.split("/"))
  await ensureDir(path.dirname(backupPath))
  await fs.rename(artifactPath, backupPath)
  console.warn(`Moved legacy ${label} artifact to ${backupPath}`)
}

function resolveArtifactPath(rootDir: string, relativePath: string): string {
  return path.join(rootDir, ...relativePath.split("/"))
}
