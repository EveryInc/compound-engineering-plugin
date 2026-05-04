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
import { makeHermesContentTransformer } from "../converters/claude-to-hermes"
import type { HermesBundle, HermesMcpConfig, HermesMcpServer } from "../types/hermes"
import { getLegacyHermesArtifacts } from "../data/plugin-legacy-artifacts"
import {
  archiveLegacyInstallManifestIfOwned,
  cleanupCurrentManagedDirectory,
  cleanupRemovedManagedFiles,
  moveLegacyArtifactToBackup,
  readManagedInstallManifestWithLegacyFallback,
  resolveManagedSegment,
  sanitizeManagedPluginName,
  writeManagedInstallManifest,
} from "./managed-artifacts"
import { isSafeManagedPath } from "../utils/files"

const MANAGED_INSTALL_MANIFEST = "install-manifest.json"

const HERMES_AGENTS_BLOCK_START = "<!-- BEGIN COMPOUND HERMES TOOL MAP -->"
const HERMES_AGENTS_BLOCK_END = "<!-- END COMPOUND HERMES TOOL MAP -->"
const HERMES_AGENTS_BLOCK_BODY = `## Compound Engineering (Hermes compatibility)

This block is managed by compound-plugin and rewritten on every reinstall.
Edits inside the markers will be overwritten; edits elsewhere in this file
are preserved.

CE skills installed under \`~/.hermes/skills/\` follow these conventions:

- **Blocking questions.** Several CE workflows (\`/ce-work\`, \`/ce-plan\`,
  \`/ce-brainstorm\`, \`/ce-doc-review\`, \`git-commit-push-pr\`, etc.) pause
  to ask the user a question. Hermes has no dedicated blocking-question
  primitive, so each skill renders its options as a numbered list in the
  active conversation channel and waits for the user's reply. Reply with
  the letter or label to continue.

- **Slash commands.** Skill bodies may reference \`/ce-plan\`, \`/ce-work\`,
  etc. These resolve to skills installed under
  \`~/.hermes/skills/cmd-<command-name>/\`. On Hermes surfaces with native
  slash-command support the trigger is direct; elsewhere the skill is
  invoked via \`skill_view\`.

- **Sub-agent dispatch.** CE agents are stored as payload files at
   \`~/.hermes/<pluginName>/agents/<name>.md\`. Orchestrator skills that
   reference \`Task ce-foo(args)\` are rewritten to \`delegate_task\` invocations
   that read the payload as \`context\`. Parallel dispatch is preserved via
   \`delegate_task(tasks=[...])\` batches.

- **Restart after install.** Run \`hermes config reload\` (or restart the
  agent / gateway) after each \`bunx ... install --to hermes\` so MCP
  configuration in \`~/.hermes/config.yaml\` takes effect.

- **Unattended workflows.** True-autonomous Hermes execution (cron jobs,
  gateway hooks with no attached user) cannot answer blocking questions.
  Skills that ask user input will pause until a user attaches; for fully
  unattended runs prefer skills that don't require input, or filter
  interactive skills out at the source via \`ce_platforms: [claude]\`.
`

// Local copy of TargetScope to avoid the circular import edge other targets
// don't have (hermes.ts -> ./index -> ./hermes). Kept in sync with
// `src/targets/index.ts:TargetScope`.
type TargetScope = "global" | "workspace"

type HermesPaths = {
  hermesDir: string
  managedDir: string
  skillsDir: string
  configPath: string
  agentsPath: string
  agentsDir: string
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
      agentsPath: path.join(outputRoot, "AGENTS.md"),
      agentsDir: path.join(outputRoot, managedSegment, "agents"),
    }
  }
  return {
    hermesDir: path.join(outputRoot, ".hermes"),
    managedDir: path.join(outputRoot, ".hermes", managedSegment),
    skillsDir: path.join(outputRoot, ".hermes", "skills"),
    configPath: path.join(outputRoot, ".hermes", "config.yaml"),
    agentsPath: path.join(outputRoot, ".hermes", "AGENTS.md"),
    agentsDir: path.join(outputRoot, ".hermes", managedSegment, "agents"),
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
  const rawExistingMcp = existing.mcp_servers
  const existingMcp: Record<string, HermesMcpServer> = {}

  if (rawExistingMcp && typeof rawExistingMcp === "object" && !Array.isArray(rawExistingMcp)) {
    for (const [key, value] of Object.entries(rawExistingMcp)) {
      if (value && typeof value === "object" && !Array.isArray(value) && ("command" in value || "url" in value)) {
        existingMcp[key] = value as HermesMcpServer
      }
    }
  } else if (rawExistingMcp !== undefined && rawExistingMcp !== null) {
    // Non-object mcp_servers (string, array, scalar) — surface explicitly so
    // the user knows their data is being replaced rather than merged.
    console.warn(
      `Warning: existing config.yaml mcp_servers is not an object map (got ${Array.isArray(rawExistingMcp) ? "array" : typeof rawExistingMcp}); ignoring it and writing fresh entries.`,
    )
  }

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

  const currentSkills = Array.from(
    new Set([
      ...bundle.passthroughSkills.map((skill) => sanitizePathName(skill.name)),
      ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
    ]),
  )

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
    const transform = makeHermesContentTransformer(bundle.pluginName ?? "compound-engineering")
    await copySkillDir(skill.sourceDir, targetDir, transform)
  }

  for (const skill of bundle.generatedSkills) {
    const skillName = sanitizePathName(skill.name)
    if (blockedByOtherPlugin.has(skillName)) continue
    const targetDir = path.join(paths.skillsDir, skillName)
    await cleanupCurrentManagedDirectorySafely(targetDir, manifest, "skills", skillName)
    await writeText(path.join(targetDir, "SKILL.md"), skill.content)
  }

  // Agent payloads
  const currentAgentPayloads = bundle.agentPayloads.map((p) => p.name)
  await cleanupRemovedManagedFiles(paths.agentsDir, manifest, "agent_payloads", currentAgentPayloads)
  await ensureDir(paths.agentsDir)
  for (const payload of bundle.agentPayloads) {
    const targetFile = path.join(paths.agentsDir, `${payload.name}.md`)
    if (!isSafeManagedPath(paths.agentsDir, `${payload.name}.md`)) continue
    await writeText(targetFile, payload.content)
  }

  if (bundle.mcpConfig) {
    await writeHermesConfigYaml(paths.configPath, bundle.mcpConfig)
  }

  // Upsert the AGENTS.md compatibility block so Hermes' runtime sees CE
  // guidance as part of the user's own agent instructions. The block is
  // delimited by markers and rewritten in place; user content outside the
  // markers is preserved untouched.
  await ensureHermesAgentsBlock(paths.agentsPath)

  if (pluginName) {
    // Skills blocked by another plugin's manifest must not appear in this
    // plugin's manifest — otherwise next reinstall's manifest-diff cleanup
    // would delete the OTHER plugin's content (cross-plugin cascade).
    const ownedSkills = currentSkills.filter((name) => !blockedByOtherPlugin.has(name))
    await writeManagedInstallManifest(paths.managedDir, {
      version: 1,
      pluginName,
      groups: {
        skills: ownedSkills,
        agent_payloads: currentAgentPayloads,
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
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      // Root itself doesn't exist yet — pre-create scenario. Use path.resolve
      // for a lexical containment check; nothing has been resolved through
      // symlinks but there's also nothing to be deceived by.
      resolvedRoot = path.resolve(rootDir)
    } else {
      // EACCES, ELOOP, EIO etc. — refuse the rm rather than silently
      // degrading to lexical comparison. The wrapper logs a warning naming
      // the path it refused to touch.
      console.warn(
        `Refusing realpath check for ${rootDir} for hermes: ${(err as Error).message}.`,
      )
      return false
    }
  }
  let resolvedTarget: string
  try {
    resolvedTarget = await fs.realpath(targetPath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      // Missing target: nothing to delete; report contained.
      return true
    }
    console.warn(
      `Refusing realpath check for ${targetPath} for hermes: ${(err as Error).message}.`,
    )
    return false
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
  // install-manifest.json. Skip:
  //   - the current plugin's own dir
  //   - the `skills` tree itself
  //   - hidden / config-shaped entries (`config.yaml`, `.env`, `legacy-backup`)
  // We additionally require the directory name to match the manifest's
  // `pluginName` field — backups (`compound-engineering.bak.<timestamp>`) and
  // hand-copied dirs would otherwise spoof ownership and block legitimate
  // reinstalls.
  for (const entry of entries) {
    if (entry === currentPluginName) continue
    if (entry === "skills") continue
    // Skip exact known non-managed sibling files. A plugin name starting with
    // `.` is technically possible after `sanitizeManagedPluginName`, but
    // practically rare; the explicit list keeps us conservative without
    // excluding legitimate plugin dirs.
    if (entry === "config.yaml" || entry === ".env" || entry === "legacy-backup") continue
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
    // Refuse manifests whose pluginName field doesn't match the directory
    // name. Backup dirs (e.g. `compound-engineering.bak.20260501`) carry the
    // original pluginName (`compound-engineering`) and would otherwise spoof
    // ownership of every skill on the next install.
    if (typeof parsed.pluginName !== "string" || parsed.pluginName !== entry) continue
    const skills = parsed.groups?.skills
    if (!Array.isArray(skills)) continue
    const otherSkills = new Set(skills.filter((s): s is string => typeof s === "string"))
    for (const skillName of currentSkills) {
      if (otherSkills.has(skillName)) {
        blocked.add(skillName)
        console.warn(
          `Skipping hermes skill '${skillName}': already owned by plugin '${parsed.pluginName}'. Rename the skill in one of the colliding plugins to resolve the conflict.`,
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
      // Read failed — back up the unreadable file before overwrite so the user
      // has at least a byte-for-byte copy on disk.
      const backup = await backupFile(configPath)
      if (backup) {
        console.warn(
          `Warning: existing ${configPath} could not be read (${(err as Error).message}); backed up to ${backup} before overwrite.`,
        )
      } else {
        console.warn(
          `Warning: existing ${configPath} could not be read (${(err as Error).message}) AND backup failed; the file will be overwritten with no recovery copy.`,
        )
      }
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
        if (backup) {
          console.warn(
            `Failed to parse existing ${configPath} for hermes (${(err as Error).message}); backed up to ${backup} and writing fresh. User top-level keys (model, gateway, channels, tts) are preserved in the backup but absent from the live file until restored.`,
          )
        } else {
          console.warn(
            `Failed to parse existing ${configPath} for hermes (${(err as Error).message}) AND backup failed; the file will be overwritten with no recovery copy. User top-level keys (model, gateway, channels, tts) will be lost.`,
          )
        }
        writeFresh = true
      }
    }
  }

  // Take a backup before overwrite for human recovery (separate from the
  // malformed-config / read-failure backups, which we already created above).
  if (!writeFresh) {
    const backup = await backupFile(configPath)
    if (backup) {
      console.log(`Backed up existing config.yaml to ${backup}`)
    } else if (await pathExists(configPath)) {
      console.warn(
        `Warning: backup of ${configPath} failed; proceeding with overwrite. No human recovery copy is available.`,
      )
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

/**
 * Upsert the CE compatibility block into Hermes' AGENTS.md so runtime guidance
 * lives next to the user's other agent instructions. The block is bounded by
 * `<!-- BEGIN COMPOUND HERMES TOOL MAP -->` / `<!-- END ... -->` markers and
 * is rewritten in place on every reinstall. User content outside the markers
 * is preserved untouched.
 */
async function ensureHermesAgentsBlock(filePath: string): Promise<void> {
  const block = [HERMES_AGENTS_BLOCK_START, HERMES_AGENTS_BLOCK_BODY.trim(), HERMES_AGENTS_BLOCK_END].join("\n")

  await ensureDir(path.dirname(filePath))

  if (!(await pathExists(filePath))) {
    await writeText(filePath, block + "\n")
    return
  }

  const existing = await readText(filePath)
  const updated = upsertHermesAgentsBlock(existing, block)
  if (updated !== existing) {
    await writeText(filePath, updated)
  }
}

function upsertHermesAgentsBlock(existing: string, block: string): string {
  const startIndex = existing.indexOf(HERMES_AGENTS_BLOCK_START)
  const endIndex = existing.indexOf(HERMES_AGENTS_BLOCK_END)

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex).trimEnd()
    const after = existing.slice(endIndex + HERMES_AGENTS_BLOCK_END.length).trimStart()
    return [before, block, after].filter(Boolean).join("\n\n") + "\n"
  }

  if (existing.trim().length === 0) {
    return block + "\n"
  }

  return existing.trimEnd() + "\n\n" + block + "\n"
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
  // Advisory lines route to stderr so agents parsing stdout for the success
  // token can separate it from advisory output. Matches the converter's
  // stderr-warning convention for dropped commands and skipped MCP servers.
  if (bundle.droppedCommands.length > 0) {
    console.warn(`  Dropped commands: ${bundle.droppedCommands.join(", ")}`)
  }
  if (bundle.skippedMcpServers.length > 0) {
    console.warn(`  Skipped MCP servers: ${bundle.skippedMcpServers.join(", ")}`)
  }
  if (blocked.size > 0) {
    console.warn(
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
    let parsed: { pluginName?: unknown; groups?: { skills?: unknown; agent_payloads?: unknown } } | null
    try {
      parsed = JSON.parse(raw) as { pluginName?: unknown; groups?: { skills?: unknown; agent_payloads?: unknown } } | null
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
    const agentPayloads = parsed.groups?.agent_payloads
    if (Array.isArray(agentPayloads)) {
      for (const payloadName of agentPayloads) {
        if (typeof payloadName !== "string") continue
        const targetFile = path.join(paths.agentsDir, `${payloadName}.md`)
        if (await pathExists(targetFile)) {
          if (!(await isContainedAfterRealpath(paths.agentsDir, targetFile))) {
            console.warn(`Refusing to remove ${targetFile} for hermes cleanup: realpath escapes managed tree.`)
            continue
          }
          await fs.rm(targetFile, { force: true })
        }
      }
      if (await pathExists(paths.agentsDir)) {
        try {
          const remaining = await fs.readdir(paths.agentsDir)
          if (remaining.length === 0) {
            await fs.rm(paths.agentsDir, { recursive: true, force: true })
          }
        } catch {
          // ignore
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
