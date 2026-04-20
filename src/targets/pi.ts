import fs from "fs/promises"
import path from "path"
import {
  backupFile,
  copySkillDir,
  ensureDir,
  pathExists,
  readText,
  sanitizePathName,
  writeJson,
  writeText,
} from "../utils/files"
import { transformContentForPi } from "../converters/claude-to-pi"
import type { PiBundle } from "../types/pi"
import { getLegacyPiArtifacts } from "../data/plugin-legacy-artifacts"
import { cleanupStaleAgents } from "../utils/legacy-cleanup"
import { resolveManagedSegment } from "./managed-artifacts"

const PI_AGENTS_BLOCK_START = "<!-- BEGIN COMPOUND PI TOOL MAP -->"
const PI_AGENTS_BLOCK_END = "<!-- END COMPOUND PI TOOL MAP -->"
const PI_INSTALL_MANIFEST = "install-manifest.json"

const PI_AGENTS_BLOCK_BODY = `## Compound Engineering (Pi compatibility)

This block is managed by compound-plugin.

Compatibility notes:
- Claude Task(agent, args) maps to the subagent extension tool
- For parallel agent runs, batch multiple subagent calls with multi_tool_use.parallel
- AskUserQuestion maps to the ask_user_question extension tool
- MCP access uses MCPorter via mcporter_list and mcporter_call extension tools
- MCPorter config path: .pi/compound-engineering/mcporter.json (project) or ~/.pi/agent/compound-engineering/mcporter.json (global)
`

type PiInstallManifest = {
  version: 1
  pluginName: string
  skills: string[]
  prompts: string[]
  extensions: string[]
}

type PiPaths = {
  managedDir: string
  skillsDir: string
  promptsDir: string
  extensionsDir: string
  mcporterConfigPath: string
  agentsPath: string
}

export async function writePiBundle(outputRoot: string, bundle: PiBundle): Promise<void> {
  const pluginName = bundle.pluginName ? sanitizeCodexPathComponent(bundle.pluginName) : undefined
  const paths = resolvePiPaths(outputRoot, pluginName)
  const manifest = pluginName ? await readInstallManifest(paths.managedDir, pluginName) : null
  const currentPrompts = bundle.prompts.map((prompt) => `${sanitizePathName(prompt.name)}.md`)
  const currentSkills = [
    ...bundle.skillDirs.map((skill) => sanitizePathName(skill.name)),
    ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
  ]
  const currentExtensions = bundle.extensions.map((extension) => extension.name)

  await ensureDir(paths.skillsDir)
  await ensureDir(paths.promptsDir)
  await ensureDir(paths.extensionsDir)

  await cleanupStaleAgents(paths.skillsDir, null)
  await cleanupRemovedPrompts(paths.promptsDir, manifest, currentPrompts)
  await cleanupRemovedSkills(paths.skillsDir, manifest, currentSkills)
  await cleanupRemovedExtensions(paths.extensionsDir, manifest, currentExtensions)

  for (const prompt of bundle.prompts) {
    await writeText(path.join(paths.promptsDir, `${sanitizePathName(prompt.name)}.md`), prompt.content + "\n")
  }

  for (const skill of bundle.skillDirs) {
    const skillName = sanitizePathName(skill.name)
    const targetDir = path.join(paths.skillsDir, skillName)
    await cleanupCurrentManagedSkillDir(targetDir, manifest, skillName)
    await copySkillDir(skill.sourceDir, targetDir, transformContentForPi)
  }

  for (const skill of bundle.generatedSkills) {
    const skillName = sanitizePathName(skill.name)
    const targetDir = path.join(paths.skillsDir, skillName)
    await cleanupCurrentManagedSkillDir(targetDir, manifest, skillName)
    await writeText(path.join(targetDir, "SKILL.md"), skill.content + "\n")
  }

  for (const extension of bundle.extensions) {
    await writeText(path.join(paths.extensionsDir, extension.name), extension.content + "\n")
  }

  if (bundle.mcporterConfig) {
    const backupPath = await backupFile(paths.mcporterConfigPath)
    if (backupPath) {
      console.log(`Backed up existing MCPorter config to ${backupPath}`)
    }
    await writeJson(paths.mcporterConfigPath, bundle.mcporterConfig)
  }

  await ensurePiAgentsBlock(paths.agentsPath)

  if (pluginName) {
    await writeInstallManifest(paths.managedDir, {
      version: 1,
      pluginName,
      skills: currentSkills,
      prompts: currentPrompts,
      extensions: currentExtensions,
    })
    await cleanupKnownLegacyPiArtifacts(paths, bundle)
  }
}

function resolvePiPaths(outputRoot: string, pluginName?: string): PiPaths {
  // Namespace the managed install directory per plugin so multiple plugins
  // installed into the same Pi root do not share (and overwrite) each other's
  // install manifests. `resolveManagedSegment` falls back to the legacy
  // "compound-engineering" segment when no plugin name is supplied.
  const managedSegment = resolveManagedSegment(pluginName)
  const base = path.basename(outputRoot)

  if (base === "agent") {
    return {
      managedDir: path.join(outputRoot, managedSegment),
      skillsDir: path.join(outputRoot, "skills"),
      promptsDir: path.join(outputRoot, "prompts"),
      extensionsDir: path.join(outputRoot, "extensions"),
      mcporterConfigPath: path.join(outputRoot, managedSegment, "mcporter.json"),
      agentsPath: path.join(outputRoot, "AGENTS.md"),
    }
  }

  if (base === ".pi") {
    return {
      managedDir: path.join(outputRoot, managedSegment),
      skillsDir: path.join(outputRoot, "skills"),
      promptsDir: path.join(outputRoot, "prompts"),
      extensionsDir: path.join(outputRoot, "extensions"),
      mcporterConfigPath: path.join(outputRoot, managedSegment, "mcporter.json"),
      agentsPath: path.join(outputRoot, "AGENTS.md"),
    }
  }

  return {
    managedDir: path.join(outputRoot, ".pi", managedSegment),
    skillsDir: path.join(outputRoot, ".pi", "skills"),
    promptsDir: path.join(outputRoot, ".pi", "prompts"),
    extensionsDir: path.join(outputRoot, ".pi", "extensions"),
    mcporterConfigPath: path.join(outputRoot, ".pi", managedSegment, "mcporter.json"),
    agentsPath: path.join(outputRoot, "AGENTS.md"),
  }
}

async function ensurePiAgentsBlock(filePath: string): Promise<void> {
  const block = buildPiAgentsBlock()

  if (!(await pathExists(filePath))) {
    await writeText(filePath, block + "\n")
    return
  }

  const existing = await readText(filePath)
  const updated = upsertBlock(existing, block)
  if (updated !== existing) {
    await writeText(filePath, updated)
  }
}

function buildPiAgentsBlock(): string {
  return [PI_AGENTS_BLOCK_START, PI_AGENTS_BLOCK_BODY.trim(), PI_AGENTS_BLOCK_END].join("\n")
}

function upsertBlock(existing: string, block: string): string {
  const startIndex = existing.indexOf(PI_AGENTS_BLOCK_START)
  const endIndex = existing.indexOf(PI_AGENTS_BLOCK_END)

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex).trimEnd()
    const after = existing.slice(endIndex + PI_AGENTS_BLOCK_END.length).trimStart()
    return [before, block, after].filter(Boolean).join("\n\n") + "\n"
  }

  if (existing.trim().length === 0) {
    return block + "\n"
  }

  return existing.trimEnd() + "\n\n" + block + "\n"
}

function sanitizeCodexPathComponent(name: string): string {
  return sanitizePathName(name).replace(/[\\/]/g, "-")
}

async function readInstallManifest(managedDir: string, pluginName: string): Promise<PiInstallManifest | null> {
  const manifestPath = path.join(managedDir, PI_INSTALL_MANIFEST)
  try {
    const raw = await readText(manifestPath)
    const parsed = JSON.parse(raw) as Partial<PiInstallManifest>
    if (
      parsed.version === 1 &&
      parsed.pluginName === pluginName &&
      Array.isArray(parsed.skills) &&
      Array.isArray(parsed.prompts) &&
      Array.isArray(parsed.extensions)
    ) {
      return parsed as PiInstallManifest
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Ignoring unreadable Pi install manifest at ${manifestPath}.`)
    }
  }
  return null
}

async function writeInstallManifest(managedDir: string, manifest: PiInstallManifest): Promise<void> {
  await writeJson(path.join(managedDir, PI_INSTALL_MANIFEST), manifest)
}

async function cleanupRemovedSkills(
  skillsDir: string,
  manifest: PiInstallManifest | null,
  currentSkills: string[],
): Promise<void> {
  if (!manifest) return
  const current = new Set(currentSkills)
  for (const skillName of manifest.skills) {
    if (!current.has(skillName)) {
      await fs.rm(path.join(skillsDir, skillName), { recursive: true, force: true })
    }
  }
}

async function cleanupRemovedPrompts(
  promptsDir: string,
  manifest: PiInstallManifest | null,
  currentPrompts: string[],
): Promise<void> {
  if (!manifest) return
  const current = new Set(currentPrompts)
  for (const promptFile of manifest.prompts) {
    if (!current.has(promptFile)) {
      await fs.rm(path.join(promptsDir, promptFile), { force: true })
    }
  }
}

async function cleanupRemovedExtensions(
  extensionsDir: string,
  manifest: PiInstallManifest | null,
  currentExtensions: string[],
): Promise<void> {
  if (!manifest) return
  const current = new Set(currentExtensions)
  for (const extensionFile of manifest.extensions) {
    if (!current.has(extensionFile)) {
      await fs.rm(path.join(extensionsDir, extensionFile), { force: true })
    }
  }
}

async function cleanupCurrentManagedSkillDir(
  targetDir: string,
  manifest: PiInstallManifest | null,
  skillName: string,
): Promise<void> {
  if (!manifest?.skills.includes(skillName)) return
  await fs.rm(targetDir, { recursive: true, force: true })
}

async function cleanupKnownLegacyPiArtifacts(paths: PiPaths, bundle: PiBundle): Promise<void> {
  const pluginName = bundle.pluginName
  if (!pluginName) return

  const legacyArtifacts = getLegacyPiArtifacts(bundle)
  for (const skillName of legacyArtifacts.skills) {
    const legacySkillPath = path.join(paths.skillsDir, skillName)
    await moveLegacyArtifactToBackup(paths.managedDir, "skills", legacySkillPath)
  }

  for (const promptFile of legacyArtifacts.prompts) {
    const legacyPromptPath = path.join(paths.promptsDir, promptFile)
    await moveLegacyArtifactToBackup(paths.managedDir, "prompts", legacyPromptPath)
  }
}

async function moveLegacyArtifactToBackup(
  managedDir: string,
  kind: "skills" | "prompts",
  artifactPath: string,
): Promise<void> {
  if (!(await pathExists(artifactPath))) return
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupDir = path.join(managedDir, "legacy-backup", timestamp, kind)
  const backupPath = path.join(backupDir, path.basename(artifactPath))
  await ensureDir(backupDir)
  await fs.rename(artifactPath, backupPath)
  console.warn(`Moved legacy Pi ${kind.slice(0, -1)} artifact to ${backupPath}`)
}
