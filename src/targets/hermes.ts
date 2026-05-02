import fs from "fs/promises"
import path from "path"
import { dump, load } from "js-yaml"
import {
  backupFile,
  copySkillDir,
  ensureDir,
  pathExists,
  readText,
  sanitizePathName,
  writeText,
} from "../utils/files"
import { transformContentForHermes } from "../converters/claude-to-hermes"
import type { HermesBundle, HermesMcpConfig, HermesMcpServer } from "../types/hermes"
import { getLegacyHermesArtifacts } from "../data/plugin-legacy-artifacts"
import type { TargetScope } from "./index"
import {
  archiveLegacyInstallManifestIfOwned,
  cleanupCurrentManagedDirectory,
  moveLegacyArtifactToBackup,
  readManagedInstallManifestWithLegacyFallback,
  resolveManagedSegment,
  sanitizeManagedPluginName,
  writeManagedInstallManifest,
} from "./managed-artifacts"

const MANAGED_INSTALL_MANIFEST = "install-manifest.json"

type HermesPaths = {
  hermesDir: string
  managedDir: string
  skillsDir: string
  configPath: string
}

/**
 * Resolve filesystem layout for a Hermes install.
 *
 * Single basename-detection branch:
 *   - `.hermes` basename: treat root as already-rooted (`<root>/skills`,
 *     `<root>/config.yaml`, `<root>/<managedSegment>/install-manifest.json`).
 *   - Otherwise: nest under `.hermes/`.
 *
 * No `agent` basename branch — that's a Pi-specific convention; Hermes has
 * no documented `agent` subdirectory.
 */
export function resolveHermesPaths(outputRoot: string, pluginName?: string): HermesPaths {
  const managedSegment = resolveManagedSegment(pluginName)
  const base = path.basename(outputRoot)
  if (base === ".hermes") {
    return {
      hermesDir: outputRoot,
      managedDir: path.join(outputRoot, managedSegment),
      skillsDir: path.join(outputRoot, "skills"),
      configPath: path.join(outputRoot, "config.yaml"),
    }
  }
  return {
    hermesDir: path.join(outputRoot, ".hermes"),
    managedDir: path.join(outputRoot, ".hermes", managedSegment),
    skillsDir: path.join(outputRoot, ".hermes", "skills"),
    configPath: path.join(outputRoot, ".hermes", "config.yaml"),
  }
}

/**
 * Merge incoming Hermes config into existing config.
 *
 * Preserves every existing top-level key (user-owned: `model`, `gateway`,
 * `channels`, `tts`, etc.). For the `mcp_servers` block, existing entries win
 * on collision — defensive against clobbering user-tuned servers.
 */
export function mergeHermesConfig(
  existing: Record<string, unknown>,
  incoming: HermesMcpConfig,
): Record<string, unknown> {
  const existingMcp = (existing.mcp_servers && typeof existing.mcp_servers === "object" && !Array.isArray(existing.mcp_servers))
    ? (existing.mcp_servers as Record<string, HermesMcpServer>)
    : {}
  const merged = { ...incoming.mcp_servers, ...existingMcp }
  return {
    ...existing,
    mcp_servers: merged,
  }
}

export async function writeHermesBundle(
  outputRoot: string,
  bundle: HermesBundle,
  _scope?: TargetScope,
): Promise<void> {
  const pluginName = bundle.pluginName ? sanitizeManagedPluginName(bundle.pluginName) : undefined
  const paths = resolveHermesPaths(outputRoot, pluginName)
  const manifest = pluginName
    ? await readManagedInstallManifestWithLegacyFallback(paths.managedDir, pluginName)
    : null

  const currentSkills = [
    ...bundle.passthroughSkills.map((skill) => sanitizePathName(skill.name)),
    ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
  ]

  await ensureDir(paths.hermesDir)
  await ensureDir(paths.skillsDir)

  // Manifest-diff cleanup with realpath containment check.
  await cleanupRemovedManagedDirectoriesSafely(paths.skillsDir, manifest, "skills", currentSkills)

  // Cross-plugin collision detection. Iterate sibling managed dirs and refuse
  // to overwrite a skill dir owned by a different plugin's manifest.
  const blockedByOtherPlugin = await detectCrossPluginCollisions(
    paths.hermesDir,
    pluginName,
    currentSkills,
  )

  for (const skill of bundle.passthroughSkills) {
    const skillName = sanitizePathName(skill.name)
    if (blockedByOtherPlugin.has(skillName)) continue
    const targetDir = path.join(paths.skillsDir, skillName)
    await cleanupCurrentManagedDirectorySafely(targetDir, manifest, "skills", skillName)
    await copySkillDir(skill.sourceDir, targetDir, transformContentForHermes)
  }

  for (const skill of bundle.generatedSkills) {
    const skillName = sanitizePathName(skill.name)
    if (blockedByOtherPlugin.has(skillName)) continue
    const targetDir = path.join(paths.skillsDir, skillName)
    await cleanupCurrentManagedDirectorySafely(targetDir, manifest, "skills", skillName)
    await writeText(path.join(targetDir, "SKILL.md"), skill.content)
  }

  if (bundle.mcpConfig) {
    await writeHermesConfigYaml(paths.configPath, bundle.mcpConfig)
  }

  if (pluginName) {
    await writeManagedInstallManifest(paths.managedDir, {
      version: 1,
      pluginName,
      groups: {
        skills: currentSkills,
      },
    })
    await archiveLegacyInstallManifestIfOwned(paths.managedDir, pluginName)
    await cleanupKnownLegacyHermesArtifacts(paths, bundle)
  }

  emitWriterSummary(bundle, blockedByOtherPlugin)
}

/**
 * Cleanup helper: delete manifest-tracked directories that are no longer in
 * `currentEntries`, with `fs.realpath`-based containment check before any
 * `fs.rm`. Defends against user-created symlinks (e.g.
 * `~/.hermes/skills/my-link → /etc`) plus a tampered manifest entry letting
 * `fs.rm` follow the symlink out of the managed tree.
 */
async function cleanupRemovedManagedDirectoriesSafely(
  rootDir: string,
  manifest: Awaited<ReturnType<typeof readManagedInstallManifestWithLegacyFallback>>,
  group: string,
  currentEntries: string[],
): Promise<void> {
  if (!manifest) return
  const current = new Set(currentEntries)
  const toRemove = (manifest.groups[group] ?? []).filter((entry) => !current.has(entry))
  for (const relativePath of toRemove) {
    const targetPath = path.join(rootDir, relativePath)
    if (!(await pathExists(targetPath))) continue
    if (!(await isContainedAfterRealpath(rootDir, targetPath))) {
      console.warn(
        `Refusing to remove ${targetPath} for hermes: realpath escapes managed tree.`,
      )
      continue
    }
    await fs.rm(targetPath, { recursive: true, force: true })
  }
}

async function cleanupCurrentManagedDirectorySafely(
  targetDir: string,
  manifest: Awaited<ReturnType<typeof readManagedInstallManifestWithLegacyFallback>>,
  group: string,
  entryName: string,
): Promise<void> {
  if (!manifest?.groups[group]?.includes(entryName)) return
  const parent = path.dirname(targetDir)
  if (await pathExists(targetDir)) {
    if (!(await isContainedAfterRealpath(parent, targetDir))) {
      console.warn(
        `Refusing to remove ${targetDir} for hermes: realpath escapes managed tree.`,
      )
      return
    }
  }
  await cleanupCurrentManagedDirectory(targetDir, manifest, group, entryName)
}

/**
 * Resolve the real path of `targetPath` and verify it stays within
 * `rootDir`'s real path. Returns `true` when contained or when the target
 * doesn't exist (nothing to delete). Returns `false` when the realpath
 * escapes `rootDir`.
 */
async function isContainedAfterRealpath(rootDir: string, targetPath: string): Promise<boolean> {
  let resolvedRoot: string
  try {
    resolvedRoot = await fs.realpath(rootDir)
  } catch {
    // If the root itself doesn't resolve, fall back to path.resolve so we
    // still apply a basic containment check rather than skipping it entirely.
    resolvedRoot = path.resolve(rootDir)
  }
  let resolvedTarget: string
  try {
    resolvedTarget = await fs.realpath(targetPath)
  } catch {
    // Missing target: nothing to delete; skip the realpath check by reporting
    // contained.
    return true
  }
  if (resolvedTarget === resolvedRoot) return true
  return resolvedTarget.startsWith(resolvedRoot + path.sep)
}

/**
 * Detect cross-plugin skill-name collisions. For each skill we're about to
 * write, scan sibling managed dirs (`<hermesDir>/<otherPluginName>/install-manifest.json`)
 * and check whether the skill name appears in another plugin's manifest. If
 * so, emit a stderr warning and skip the write for that skill.
 */
async function detectCrossPluginCollisions(
  hermesDir: string,
  currentPluginName: string | undefined,
  currentSkills: string[],
): Promise<Set<string>> {
  const blocked = new Set<string>()
  if (currentSkills.length === 0) return blocked
  if (!(await pathExists(hermesDir))) return blocked

  let entries: string[]
  try {
    entries = await fs.readdir(hermesDir)
  } catch {
    return blocked
  }

  // Sibling managed dirs are direct children of hermesDir that contain an
  // install-manifest.json. Skip the current plugin's own dir, the `skills`
  // tree itself, and well-known non-managed entries (config.yaml, .env).
  for (const entry of entries) {
    if (entry === currentPluginName) continue
    if (entry === "skills") continue
    if (entry.startsWith(".")) continue
    const candidateManifestPath = path.join(hermesDir, entry, MANAGED_INSTALL_MANIFEST)
    if (!(await pathExists(candidateManifestPath))) continue
    let raw: string
    try {
      raw = await readText(candidateManifestPath)
    } catch {
      continue
    }
    let parsed: { groups?: { skills?: unknown }; pluginName?: unknown } | null
    try {
      parsed = JSON.parse(raw) as { groups?: { skills?: unknown }; pluginName?: unknown } | null
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== "object") continue
    const skills = parsed.groups?.skills
    if (!Array.isArray(skills)) continue
    const otherSkills = new Set(skills.filter((s): s is string => typeof s === "string"))
    for (const skillName of currentSkills) {
      if (otherSkills.has(skillName)) {
        blocked.add(skillName)
        const otherPluginLabel = typeof parsed.pluginName === "string" ? parsed.pluginName : entry
        console.warn(
          `Skipping hermes skill '${skillName}': already owned by plugin '${otherPluginLabel}'. Rename the skill in one of the colliding plugins to resolve the conflict.`,
        )
      }
    }
  }

  return blocked
}

/**
 * Atomic write of `config.yaml`:
 *
 *   1. Read existing config; on parse error WARN + backup + write fresh.
 *   2. `backupFile(configPath)` for human recovery.
 *   3. Merge (existing wins on `mcp_servers` collision).
 *   4. `dump` to `<configPath>.tmp` with mode 0o600.
 *   5. `fs.rename` over `configPath`.
 *
 * On rename failure, the `.tmp` file is cleaned up before re-throwing.
 */
async function writeHermesConfigYaml(
  configPath: string,
  incoming: HermesMcpConfig,
): Promise<void> {
  await ensureDir(path.dirname(configPath))

  let existingObject: Record<string, unknown> = {}
  let writeFresh = false

  if (await pathExists(configPath)) {
    let raw: string
    try {
      raw = await readText(configPath)
    } catch (err) {
      console.warn(
        `Warning: existing ${configPath} could not be read (${(err as Error).message}); writing plugin config without merging.`,
      )
      writeFresh = true
      raw = ""
    }
    if (!writeFresh) {
      try {
        const parsed = load(raw)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          existingObject = parsed as Record<string, unknown>
        } else if (parsed === null || parsed === undefined) {
          existingObject = {}
        } else {
          // YAML parsed to a non-object (string, array, scalar). Treat as
          // malformed for our merge purposes.
          throw new Error(`config.yaml did not parse to an object`)
        }
      } catch (err) {
        const backup = await backupFile(configPath)
        const recoveryPath = backup ?? `${configPath}.bak.<timestamp>`
        console.warn(
          `Failed to parse existing ${configPath} for hermes (${(err as Error).message}); backing up to ${recoveryPath} and writing fresh.`,
        )
        writeFresh = true
      }
    }
  }

  // Take a backup before overwrite for human recovery (separate from the
  // malformed-config backup, which we already created above).
  if (!writeFresh) {
    const backup = await backupFile(configPath)
    if (backup) {
      console.log(`Backed up existing config.yaml to ${backup}`)
    }
  }

  const merged = writeFresh
    ? { mcp_servers: incoming.mcp_servers }
    : mergeHermesConfig(existingObject, incoming)

  const yamlContent = dump(merged, { lineWidth: 120, noRefs: true })
  const tmpPath = `${configPath}.tmp`

  try {
    await fs.writeFile(tmpPath, yamlContent, { encoding: "utf8", mode: 0o600 })
  } catch (err) {
    // Best-effort cleanup; ignore secondary errors.
    await fs.rm(tmpPath, { force: true }).catch(() => {})
    throw err
  }

  try {
    await fs.rename(tmpPath, configPath)
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {})
    throw err
  }
}

async function cleanupKnownLegacyHermesArtifacts(
  paths: HermesPaths,
  bundle: HermesBundle,
): Promise<void> {
  const legacyArtifacts = getLegacyHermesArtifacts(bundle)
  for (const skillName of legacyArtifacts.skills) {
    await moveLegacyArtifactToBackup(paths.managedDir, "skills", paths.skillsDir, skillName, "Hermes skill")
  }
}

function emitWriterSummary(bundle: HermesBundle, blocked: Set<string>): void {
  const summaryParts: string[] = [
    `${bundle.passthroughSkills.length} passthrough skill(s)`,
    `${bundle.generatedSkills.length} generated skill(s)`,
  ]
  if (bundle.mcpConfig) {
    summaryParts.push(`${Object.keys(bundle.mcpConfig.mcp_servers).length} MCP server(s)`)
  }
  const pluginLabel = bundle.pluginName ?? "compound-engineering"
  console.log(`Installed ${pluginLabel} to hermes (${summaryParts.join(", ")})`)
  if (bundle.droppedCommands.length > 0) {
    console.log(`  Dropped commands: ${bundle.droppedCommands.join(", ")}`)
  }
  if (bundle.skippedMcpServers.length > 0) {
    console.log(`  Skipped MCP servers: ${bundle.skippedMcpServers.join(", ")}`)
  }
  if (blocked.size > 0) {
    console.log(
      `  Skipped due to cross-plugin skill-name collision: ${[...blocked].join(", ")}`,
    )
  }
}

/**
 * Cleanup entry point invoked by `cleanup --target hermes`. Reads the managed
 * install manifest at `<root>/.hermes/<pluginName>/install-manifest.json` (or
 * the basename-detected variant), removes manifest-tracked skills, and emits
 * a stderr note about MCP entries needing manual cleanup.
 *
 * Imported by `src/commands/cleanup.ts` in U4. Currently unused by the writer
 * itself.
 */
export async function cleanupHermesAtRoot(root: string): Promise<void> {
  const paths = resolveHermesPaths(root)
  if (!(await pathExists(paths.hermesDir))) return

  // Iterate every managed directory at this root and clean up skills owned by
  // each. A user could have multiple plugins installed; cleanup currently
  // handles the legacy/compound-engineering segment by default.
  let entries: string[]
  try {
    entries = await fs.readdir(paths.hermesDir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "skills") continue
    const candidateManifestPath = path.join(paths.hermesDir, entry, MANAGED_INSTALL_MANIFEST)
    if (!(await pathExists(candidateManifestPath))) continue
    let raw: string
    try {
      raw = await readText(candidateManifestPath)
    } catch {
      continue
    }
    let parsed: { pluginName?: unknown; groups?: { skills?: unknown } } | null
    try {
      parsed = JSON.parse(raw) as { pluginName?: unknown; groups?: { skills?: unknown } } | null
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== "object") continue
    const skills = parsed.groups?.skills
    if (Array.isArray(skills)) {
      for (const skillName of skills) {
        if (typeof skillName !== "string") continue
        const targetDir = path.join(paths.skillsDir, skillName)
        if (await pathExists(targetDir)) {
          if (!(await isContainedAfterRealpath(paths.skillsDir, targetDir))) {
            console.warn(
              `Refusing to remove ${targetDir} for hermes cleanup: realpath escapes managed tree.`,
            )
            continue
          }
          await fs.rm(targetDir, { recursive: true, force: true })
        }
      }
    }
    // Remove the per-plugin managed dir itself.
    await fs.rm(path.join(paths.hermesDir, entry), { recursive: true, force: true })
  }

  if (await pathExists(paths.configPath)) {
    console.warn(
      `Note: hermes cleanup did not modify ${paths.configPath}; remove any compound-engineering MCP entries manually if desired.`,
    )
  }
}
