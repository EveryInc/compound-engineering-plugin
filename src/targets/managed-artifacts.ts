import fs from "fs/promises"
import type { Stats } from "fs"
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
    const targetPath = resolveArtifactPath(rootDir, relativePath)
    // The manifest can lag reality: a prior install owned this name, but the
    // user has since replaced it with a symlink (e.g. into a personal fork).
    // Never delete through a symlink node even when the stale manifest still
    // claims ownership.
    if (await isPreservedSymlink(targetPath)) continue
    await fs.rm(targetPath, { recursive: true, force: true })
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
    const targetPath = resolveArtifactPath(rootDir, relativePath)
    if (await isPreservedSymlink(targetPath)) continue
    await fs.rm(targetPath, { force: true })
  }
}

// Returns true when the existing path was preserved (skip cleanup AND the
// subsequent copy/write -- writing through a preserved symlink would clobber
// the user's fork, which is worse than not overwriting at all).
export async function cleanupCurrentManagedDirectory(
  targetDir: string,
  manifest: ManagedInstallManifest | null,
  group: string,
  entryName: string,
): Promise<boolean> {
  const stat = await lstatOrNull(targetDir)
  if (!stat) return false
  if (stat.isSymbolicLink()) {
    console.warn(`Skipping ${targetDir}: existing user-managed symlink (not overwritten)`)
    return true
  }
  if (!manifest?.groups[group]?.includes(entryName)) {
    console.warn(`Skipping ${targetDir}: existing unmanaged directory (not overwritten)`)
    return true
  }
  await fs.rm(targetDir, { recursive: true, force: true })
  return false
}

export async function moveLegacyArtifactToBackup(
  managedDir: string,
  kind: string,
  artifactRoot: string,
  relativePath: string,
  label: string,
  options: { skipSymlinkGuard?: boolean } = {},
): Promise<void> {
  const artifactPath = resolveArtifactPath(artifactRoot, relativePath)
  // Ownership fingerprinting reads THROUGH a symlink, so a user fork of a
  // legacy-named artifact still matches — never move the symlink node into
  // legacy-backup, or the user's override is silently deactivated.
  // `skipSymlinkGuard` is for callers (e.g. the shared `~/.agents/skills/`
  // sweep in `src/commands/cleanup.ts`) that have already independently
  // verified via a stronger signal (the symlink's resolved target lives
  // inside a CE-managed root) that this specific symlink node IS the
  // CE-owned artifact to relocate, not a user override to preserve.
  if (!options.skipSymlinkGuard && (await isPreservedSymlink(artifactPath))) return
  // Ancestor-symlink containment: `isPreservedSymlink` only catches a symlinked
  // leaf; block the rename when the artifact resolves outside the target root
  // via a symlinked ancestor (e.g. the whole store dir repointed at a fork).
  // Every caller passes a store dir that is a direct child of the target root,
  // so its parent is that root. `skipSymlinkGuard` callers are exempt for the
  // same reason as above.
  if (!options.skipSymlinkGuard && !(await isPathWithinRoot(path.dirname(artifactRoot), artifactPath))) return
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

export async function lstatOrNull(targetPath: string): Promise<Stats | null> {
  try {
    return await fs.lstat(targetPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
}

export async function isPreservedSymlink(targetPath: string): Promise<boolean> {
  const stat = await lstatOrNull(targetPath)
  if (!stat?.isSymbolicLink()) return false
  console.warn(`Skipping ${targetPath}: existing user-managed symlink (not overwritten)`)
  return true
}

/**
 * Realpath of the nearest existing ancestor of `targetPath` (the path itself
 * when it exists). A not-yet-created descendant cannot introduce a new symlink
 * hop, so resolving the nearest existing ancestor is enough to decide whether
 * `targetPath` escapes a root -- and it lets the containment check run before a
 * fresh store directory has been created.
 */
async function realpathNearestExisting(targetPath: string): Promise<string> {
  let current = path.resolve(targetPath)
  for (;;) {
    try {
      return await fs.realpath(current)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
      const parent = path.dirname(current)
      if (parent === current) return current
      current = parent
    }
  }
}

/**
 * True when `targetPath`, after resolving symlinks on every existing ancestor,
 * still lives inside `rootDir`. The leaf-node guards (`isPreservedSymlink`)
 * only inspect the final path component, so a symlinked *ancestor* -- e.g. a
 * whole store directory (`~/.codex/skills/<plugin>`) repointed at a personal
 * fork -- slips past them, and the subsequent fs.rm / copy then operates
 * THROUGH the link into the fork. Both sides are realpath'd so a config root
 * that was legitimately relocated as a whole (its entire tree moved behind one
 * symlink) still reads as contained.
 */
/**
 * Pure containment predicate over two already-resolved absolute paths: true
 * when `targetResolved` is `rootResolved` itself or a descendant of it.
 */
export function isContainedPath(rootResolved: string, targetResolved: string): boolean {
  const rel = path.relative(rootResolved, targetResolved)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

export async function isPathWithinRoot(rootDir: string, targetPath: string): Promise<boolean> {
  return isContainedPath(await realpathNearestExisting(rootDir), await realpathNearestExisting(targetPath))
}

/**
 * Guards a managed store directory against ancestor-symlink traversal. Returns
 * true (and warns once) when `storeDir` escapes `rootDir` via a symlinked
 * ancestor, meaning the caller must skip EVERY operation on that store --
 * cleanup sweeps and writes alike -- since all of them would otherwise act
 * through the link into whatever the user pointed it at. `rootDir` is the
 * writer's target root (e.g. `~/.codex`), not the store dir itself.
 */
export async function storeRootEscapesManagedRoot(rootDir: string, storeDir: string): Promise<boolean> {
  if (await isPathWithinRoot(rootDir, storeDir)) return false
  console.warn(`Skipping ${storeDir}: resolves outside the managed root via a symlinked ancestor (not modified)`)
  return true
}
