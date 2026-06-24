import fs from "fs/promises"
import path from "path"
import {
  backupFile,
  copyDir,
  copySkillDir,
  ensureDir,
  isSafeManagedPath,
  pathExists,
  sanitizePathName,
  writeJson,
  writeJsonSecure,
  writeText,
  writeTextSecure,
} from "../utils/files"
import type { KimiBundle } from "../types/kimi"
import type { ClaudeHooks, ClaudeMcpServer } from "../types/claude"
import { isKimiHookEvent, transformContentForKimi } from "../utils/kimi-content"

const MANAGED_INSTALL_MANIFEST = "install-manifest.json"
const HOOKS_START_MARKER = "# BEGIN Compound Engineering plugin hooks -- do not edit this block"
const HOOKS_END_MARKER = "# END Compound Engineering plugin hooks"

export type KimiInstallManifest = {
  version: 1
  pluginName: string
  skills: string[]
  mcpServers: string[]
}

export type KimiWriteOptions = {
  /** When true, `outputRoot` is already the Kimi root (e.g. ~/.kimi). */
  outputIsKimiRoot?: boolean
}

export async function writeKimiBundle(
  outputRoot: string,
  bundle: KimiBundle,
  options: KimiWriteOptions = {},
): Promise<void> {
  const kimiRoot = resolveKimiRoot(outputRoot, options)
  await ensureDir(kimiRoot)

  const pluginName = bundle.pluginName ? sanitizeKimiPathComponent(bundle.pluginName) : undefined
  const manifest = pluginName ? await readInstallManifest(kimiRoot, pluginName) : null

  // Skills are written FLAT into <kimiRoot>/skills/<name>/ -- Kimi discovers
  // skills by scanning the skills root directly, so a per-plugin subdirectory
  // (as Codex uses) would be invisible. Cleanup is driven entirely by the
  // install manifest's recorded skill names, never by sweeping the shared dir.
  const skillsRoot = path.join(kimiRoot, "skills")
  const currentSkills = Array.from(
    new Set([
      ...bundle.skillDirs.map((skill) => sanitizePathName(skill.name)),
      ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
    ]),
  )

  await cleanupRemovedSkills(skillsRoot, manifest, currentSkills)

  for (const skill of bundle.skillDirs) {
    const targetDir = path.join(skillsRoot, sanitizePathName(skill.name))
    await fs.rm(targetDir, { recursive: true, force: true })
    await copySkillDir(skill.sourceDir, targetDir, (content) =>
      transformContentForKimi(content, bundle.invocationTargets),
    )
  }

  for (const skill of bundle.generatedSkills) {
    const skillDir = path.join(skillsRoot, sanitizePathName(skill.name))
    await fs.rm(skillDir, { recursive: true, force: true })
    await writeText(path.join(skillDir, "SKILL.md"), skill.content + "\n")
    for (const sidecar of skill.sidecarDirs ?? []) {
      await copyDir(sidecar.sourceDir, path.join(skillDir, sidecar.targetName))
    }
  }

  const mcpNames = await writeMcpJson(kimiRoot, bundle.mcpServers ?? {}, manifest)
  await writeHooksConfig(kimiRoot, bundle.hooks)

  if (pluginName) {
    await writeInstallManifest(kimiRoot, {
      version: 1,
      pluginName,
      skills: currentSkills,
      mcpServers: mcpNames,
    })
  }
}

function resolveKimiRoot(outputRoot: string, options: KimiWriteOptions): string {
  if (options.outputIsKimiRoot) return outputRoot
  return path.basename(outputRoot) === ".kimi" ? outputRoot : path.join(outputRoot, ".kimi")
}

function sanitizeKimiPathComponent(name: string): string {
  return sanitizePathName(name).replace(/[\\/]/g, "-")
}

// ── Install manifest ───────────────────────────────────────

async function readInstallManifest(
  kimiRoot: string,
  pluginName: string,
): Promise<KimiInstallManifest | null> {
  const manifestPath = path.join(kimiRoot, pluginName, MANAGED_INSTALL_MANIFEST)
  try {
    const raw = await fs.readFile(manifestPath, "utf8")
    const parsed = JSON.parse(raw) as Partial<KimiInstallManifest>
    if (parsed.version === 1 && parsed.pluginName === pluginName && Array.isArray(parsed.skills)) {
      const mcpServers = Array.isArray(parsed.mcpServers) ? parsed.mcpServers : []
      return {
        version: 1,
        pluginName,
        skills: filterSafeManifestEntries(parsed.skills, kimiRoot, manifestPath, "skills"),
        mcpServers: mcpServers.filter((name) => typeof name === "string"),
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Ignoring unreadable Kimi install manifest at ${manifestPath}.`)
    }
  }
  return null
}

function filterSafeManifestEntries(
  entries: unknown[],
  kimiRoot: string,
  manifestPath: string,
  group: string,
): string[] {
  const safe: string[] = []
  for (const entry of entries) {
    if (isSafeManagedPath(kimiRoot, entry)) {
      safe.push(entry)
    } else {
      console.warn(
        `Dropping unsafe Kimi install-manifest entry in ${manifestPath} (group "${group}"): ${JSON.stringify(entry)}`,
      )
    }
  }
  return safe
}

async function writeInstallManifest(kimiRoot: string, manifest: KimiInstallManifest): Promise<void> {
  await writeJson(path.join(kimiRoot, manifest.pluginName, MANAGED_INSTALL_MANIFEST), manifest)
}

async function cleanupRemovedSkills(
  skillsRoot: string,
  manifest: KimiInstallManifest | null,
  currentSkills: string[],
): Promise<void> {
  if (!manifest) return
  const current = new Set(currentSkills)
  for (const skillName of manifest.skills) {
    if (current.has(skillName)) continue
    // Defense in depth: entries are already filtered on read, but re-check
    // before issuing any fs.rm against the shared skills root.
    if (!isSafeManagedPath(skillsRoot, skillName)) continue
    await fs.rm(path.join(skillsRoot, skillName), { recursive: true, force: true })
  }
}

// ── MCP servers (~/.kimi/mcp.json) ─────────────────────────

type McpJson = { mcpServers?: Record<string, ClaudeMcpServer> } & Record<string, unknown>

async function writeMcpJson(
  kimiRoot: string,
  servers: Record<string, ClaudeMcpServer>,
  manifest: KimiInstallManifest | null,
): Promise<string[]> {
  const mcpPath = path.join(kimiRoot, "mcp.json")
  const existing = await readJsonSafe(mcpPath)
  const ourNames = Object.keys(servers)

  // Start from existing user content; drop only servers we previously owned
  // that are no longer present, then layer ours on top.
  const merged: Record<string, ClaudeMcpServer> = { ...(existing?.mcpServers ?? {}) }
  for (const name of manifest?.mcpServers ?? []) {
    if (!ourNames.includes(name)) delete merged[name]
  }
  for (const [name, server] of Object.entries(servers)) {
    merged[name] = server
  }

  // Nothing to write and no file to clean up.
  if (existing === null && Object.keys(merged).length === 0) return ourNames

  const next: McpJson = { ...(existing ?? {}) }
  if (Object.keys(merged).length > 0) {
    next.mcpServers = merged
  } else {
    delete next.mcpServers
  }

  const nextContent = JSON.stringify(next, null, 2) + "\n"
  const existingContent = existing !== null ? JSON.stringify(existing, null, 2) + "\n" : null
  if (nextContent !== existingContent) {
    if (existing !== null) {
      const backupPath = await backupFile(mcpPath)
      if (backupPath) console.log(`Backed up existing Kimi MCP config to ${backupPath}`)
    }
    await writeJsonSecure(mcpPath, next)
  }
  return ourNames
}

async function readJsonSafe(filePath: string): Promise<McpJson | null> {
  try {
    const content = await fs.readFile(filePath, "utf8")
    return JSON.parse(content) as McpJson
  } catch {
    return null
  }
}

// ── Hooks (~/.kimi/config.toml [[hooks]]) ──────────────────

const KIMI_TOOL_NAMES: Record<string, string> = {
  Write: "WriteFile",
  Edit: "StrReplaceFile",
  MultiEdit: "StrReplaceFile",
  Read: "ReadFile",
  Bash: "Shell",
  Grep: "Grep",
  Glob: "Glob",
  WebFetch: "FetchURL",
  WebSearch: "SearchWeb",
  Task: "Agent",
  TodoWrite: "SetTodoList",
}

async function writeHooksConfig(kimiRoot: string, hooks?: ClaudeHooks): Promise<void> {
  const configPath = path.join(kimiRoot, "config.toml")
  const existing = await readFileSafe(configPath)
  const hooksToml = renderKimiHooksToml(hooks)
  const merged = mergeKimiConfig(existing, hooksToml)
  if (merged === null) return
  if (merged === existing) return
  if (existing) {
    const backupPath = await backupFile(configPath)
    if (backupPath) console.log(`Backed up existing Kimi config to ${backupPath}`)
  }
  await writeTextSecure(configPath, merged)
}

export function renderKimiHooksToml(hooks?: ClaudeHooks): string | null {
  if (!hooks?.hooks) return null
  const blocks: string[] = []
  for (const [event, matchers] of Object.entries(hooks.hooks)) {
    if (!isKimiHookEvent(event)) continue
    for (const matcher of matchers) {
      for (const entry of matcher.hooks) {
        // Kimi hooks are shell commands only; prompt/agent hooks have no
        // shell-command equivalent and are skipped.
        if (entry.type !== "command" || !entry.command) continue
        const lines = ["[[hooks]]", `event = ${tomlString(event)}`]
        const remapped = remapMatcher(matcher.matcher)
        if (remapped) lines.push(`matcher = ${tomlString(remapped)}`)
        lines.push(`command = ${tomlString(entry.command)}`)
        if (typeof entry.timeout === "number") lines.push(`timeout = ${entry.timeout}`)
        blocks.push(lines.join("\n"))
      }
    }
  }
  return blocks.length > 0 ? blocks.join("\n\n") : null
}

function remapMatcher(matcher?: string): string {
  const raw = (matcher ?? "").trim()
  if (!raw || raw === "*") return ""
  return raw
    .split("|")
    .map((token) => {
      const trimmed = token.trim()
      return KIMI_TOOL_NAMES[trimmed] ?? trimmed
    })
    .join("|")
}

export function mergeKimiConfig(existing: string, hooksToml: string | null): string | null {
  const blockPattern = new RegExp(
    `${escapeForRegex(HOOKS_START_MARKER)}[\\s\\S]*?${escapeForRegex(HOOKS_END_MARKER)}\\n?`,
    "g",
  )
  const stripped = existing.replace(blockPattern, "")
  const removedManagedBlock = stripped !== existing

  if (!hooksToml) {
    if (!existing) return null
    return removedManagedBlock ? stripped.trimEnd() + "\n" : existing
  }

  const managedBlock = [HOOKS_START_MARKER, hooksToml.trim(), HOOKS_END_MARKER, ""].join("\n")
  const base = stripped.trimEnd()
  return base ? `${base}\n\n${managedBlock}` : managedBlock
}

async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    return ""
  }
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
