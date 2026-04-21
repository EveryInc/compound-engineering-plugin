import fs from "fs/promises"
import path from "path"
import { ensureDir, isSafeManagedPath, pathExists, readText, sanitizePathName, writeJson } from "../utils/files"

const MANAGED_INSTALL_MANIFEST = "install-manifest.json"
const LEGACY_MANAGED_SEGMENT = "compound-engineering"

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
  return pluginName ?? LEGACY_MANAGED_SEGMENT
}

/**
 * Resolves the legacy shared managed directory that lived next to the
 * current plugin-scoped directory before the per-plugin namespacing fix.
 * `managedDir` is the plugin-scoped path (e.g. `<root>/coding-tutor`);
 * the legacy sibling is `<root>/compound-engineering`. When `pluginName`
 * is the historical `compound-engineering`, the legacy path and the
 * current path are the same, so there is nothing to migrate -- this
 * returns null in that case.
 */
export function resolveLegacyManagedDir(managedDir: string, pluginName: string): string | null {
  if (pluginName === LEGACY_MANAGED_SEGMENT) return null
  return path.join(path.dirname(managedDir), LEGACY_MANAGED_SEGMENT)
}

/**
 * Reads the plugin-scoped install manifest, falling back to the legacy
 * shared manifest at `<root>/compound-engineering/install-manifest.json`
 * when the plugin-scoped one is missing. The legacy manifest is only
 * returned when its recorded `pluginName` matches the current plugin --
 * `readManagedInstallManifest` enforces that match, so a legacy manifest
 * belonging to a different plugin is left untouched for that plugin's
 * own next install to migrate.
 */
export async function readManagedInstallManifestWithLegacyFallback(
  managedDir: string,
  pluginName: string,
): Promise<ManagedInstallManifest | null> {
  const current = await readManagedInstallManifest(managedDir, pluginName)
  if (current) return current
  const legacyDir = resolveLegacyManagedDir(managedDir, pluginName)
  if (!legacyDir) return null
  return readManagedInstallManifest(legacyDir, pluginName)
}

/**
 * After a plugin-scoped manifest has been written, archive the legacy
 * shared manifest if it belongs to the current plugin, so the legacy
 * path doesn't keep shadowing or misleading a future install. The
 * legacy file is renamed into a timestamped backup under the new
 * plugin-scoped managed dir rather than deleted outright, for parity
 * with the `legacy-backup/` archival done for removed artifacts.
 *
 * If the legacy manifest does not exist, or it exists but is owned by
 * a different plugin, this is a no-op.
 */
export async function archiveLegacyInstallManifestIfOwned(
  managedDir: string,
  pluginName: string,
): Promise<void> {
  const legacyDir = resolveLegacyManagedDir(managedDir, pluginName)
  if (!legacyDir) return
  const legacyManifestPath = path.join(legacyDir, MANAGED_INSTALL_MANIFEST)
  if (!(await pathExists(legacyManifestPath))) return

  // Only archive when the legacy manifest belongs to the current plugin;
  // `readManagedInstallManifest` validates `pluginName` and returns null
  // otherwise, so a null result means "not ours, leave it alone."
  const owned = await readManagedInstallManifest(legacyDir, pluginName)
  if (!owned) return

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(managedDir, "legacy-backup", timestamp, MANAGED_INSTALL_MANIFEST)
  await ensureDir(path.dirname(backupPath))
  await fs.rename(legacyManifestPath, backupPath)
  console.warn(`Moved legacy install manifest to ${backupPath}`)
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
      // Filter manifest entries at read time: cleanup joins these strings
      // into fs.rm paths, so a corrupted or tampered manifest with entries
      // like `../../config.toml` could delete outside the managed root.
      // We drop unsafe entries here (primary defense) and warn so operators
      // see the corruption signal. Cleanup functions also re-check each
      // entry (defense in depth).
      const safeGroups: Record<string, string[]> = {}
      for (const [group, entries] of Object.entries(parsed.groups)) {
        const safe: string[] = []
        for (const entry of entries as unknown[]) {
          if (isSafeManagedPath(managedDir, entry)) {
            safe.push(entry)
          } else {
            console.warn(
              `Dropping unsafe install-manifest entry in ${manifestPath} (group "${group}"): ${JSON.stringify(entry)}`,
            )
          }
        }
        safeGroups[group] = safe
      }
      return { version: 1, pluginName, groups: safeGroups }
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
    if (current.has(relativePath)) continue
    // Defense in depth: `readManagedInstallManifest` already drops unsafe
    // entries, but re-check here so any future caller that bypasses the
    // read layer cannot trigger out-of-tree deletes.
    if (!isSafeManagedPath(rootDir, relativePath)) continue
    await fs.rm(resolveArtifactPath(rootDir, relativePath), { recursive: true, force: true })
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
    if (current.has(relativePath)) continue
    if (!isSafeManagedPath(rootDir, relativePath)) continue
    await fs.rm(resolveArtifactPath(rootDir, relativePath), { force: true })
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
