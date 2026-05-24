import path from "path"
import { backupFile, copySkillDir, ensureDir, pathExists, readJson, sanitizePathName, writeJson, writeText } from "../utils/files"
import { transformSkillContentForOpenCode } from "../converters/claude-to-opencode"
import type { OpenCodeBundle, OpenCodeConfig } from "../types/opencode"
import { getLegacyOpenCodeArtifacts } from "../data/plugin-legacy-artifacts"
import {
  archiveLegacyInstallManifestIfOwned,
  cleanupCurrentManagedDirectory,
  cleanupRemovedManagedDirectories,
  cleanupRemovedManagedFiles,
  moveLegacyArtifactToBackup,
  readManagedInstallManifestWithLegacyFallback,
  resolveManagedSegment,
  sanitizeManagedPluginName,
  writeManagedInstallManifest,
} from "./managed-artifacts"

async function mergeOpenCodeConfig(
  configPath: string,
  incoming: OpenCodeConfig,
): Promise<OpenCodeConfig> {
  if (!(await pathExists(configPath))) return incoming

  let existing: OpenCodeConfig
  try {
    existing = await readJson<OpenCodeConfig>(configPath)
  } catch {
    console.warn(
      `Warning: existing ${configPath} is not valid JSON. Writing plugin config without merging.`
    )
    return incoming
  }

  const mergedMcp = {
    ...(incoming.mcp ?? {}),
    ...(existing.mcp ?? {}),
  }

  const mergedPermission = incoming.permission
    ? {
        ...(incoming.permission),
        ...(existing.permission ?? {}),
      }
    : existing.permission

  const mergedTools = incoming.tools
    ? {
        ...(incoming.tools),
        ...(existing.tools ?? {}),
      }
    : existing.tools

  return {
    ...existing,
    $schema: incoming.$schema ?? existing.$schema,
    mcp: Object.keys(mergedMcp).length > 0 ? mergedMcp : undefined,
    permission: mergedPermission,
    tools: mergedTools,
  }
}

export async function writeOpenCodeBundle(
  outputRoot: string,
  bundle: OpenCodeBundle,
  scope?: string,
): Promise<void> {
  const pluginName = bundle.pluginName ? sanitizeManagedPluginName(bundle.pluginName) : undefined
  const openCodePaths = resolveOpenCodePaths(outputRoot, pluginName, scope)
  const manifest = pluginName
    ? await readManagedInstallManifestWithLegacyFallback(openCodePaths.managedDir, pluginName)
    : null
  const currentAgents = bundle.agents.map((agent) => `${sanitizePathName(agent.name)}.md`)
  const currentCommands = bundle.commandFiles.map((commandFile) => `${commandFile.name.split(":").join("/")}.md`)
  const currentPlugins = bundle.plugins.map((plugin) => plugin.name)
  const currentSkills = bundle.skillDirs.map((skill) => sanitizePathName(skill.name))

  await ensureDir(openCodePaths.root)
  await cleanupRemovedManagedFiles(openCodePaths.agentsDir, manifest, "agents", currentAgents)
  await cleanupRemovedManagedFiles(openCodePaths.commandDir, manifest, "commands", currentCommands)
  await cleanupRemovedManagedFiles(openCodePaths.pluginsDir, manifest, "plugins", currentPlugins)
  await cleanupRemovedManagedDirectories(openCodePaths.skillsDir, manifest, "skills", currentSkills)

  const hadExistingConfig = await pathExists(openCodePaths.configPath)
  const backupPath = await backupFile(openCodePaths.configPath)
  if (backupPath) {
    console.log(`Backed up existing config to ${backupPath}`)
  }
  const merged = await mergeOpenCodeConfig(openCodePaths.configPath, bundle.config)
  await writeJson(openCodePaths.configPath, merged)
  if (hadExistingConfig) {
    console.log("Merged plugin config into existing opencode.json (user settings preserved)")
  }

  const seenAgents = new Set<string>()
  for (const agent of bundle.agents) {
    const safeName = sanitizePathName(agent.name)
    if (seenAgents.has(safeName)) {
      console.warn(`Skipping agent "${agent.name}": sanitized name "${safeName}" collides with another agent`)
      continue
    }
    seenAgents.add(safeName)
    await writeText(path.join(openCodePaths.agentsDir, `${safeName}.md`), agent.content + "\n")
  }

  for (const commandFile of bundle.commandFiles) {
    const dest = path.join(openCodePaths.commandDir, ...commandFile.name.split(":")) + ".md"
    const cmdBackupPath = await backupFile(dest)
    if (cmdBackupPath) {
      console.log(`Backed up existing command file to ${cmdBackupPath}`)
    }
    await writeText(dest, commandFile.content + "\n")
  }

  if (bundle.plugins.length > 0) {
    for (const plugin of bundle.plugins) {
      await writeText(path.join(openCodePaths.pluginsDir, plugin.name), plugin.content + "\n")
    }
  }

  if (bundle.skillDirs.length > 0) {
    for (const skill of bundle.skillDirs) {
      const skillName = sanitizePathName(skill.name)
      const targetDir = path.join(openCodePaths.skillsDir, skillName)
      await cleanupCurrentManagedDirectory(targetDir, manifest, "skills", skillName)
      await copySkillDir(
        skill.sourceDir,
        targetDir,
        transformSkillContentForOpenCode,
        true,
      )
    }
  }

  if (pluginName) {
    await writeManagedInstallManifest(openCodePaths.managedDir, {
      version: 1,
      pluginName,
      groups: {
        agents: currentAgents,
        commands: currentCommands,
        plugins: currentPlugins,
        skills: currentSkills,
      },
    })
    await archiveLegacyInstallManifestIfOwned(openCodePaths.managedDir, pluginName)
    await cleanupKnownLegacyOpenCodeArtifacts(openCodePaths, bundle)
  }
}

function resolveOpenCodePaths(outputRoot: string, pluginName?: string, scope?: string) {
  // Namespace the managed install directory per plugin so multiple plugins
  // installed into the same OpenCode root do not share (and overwrite) each
  // other's install manifests. `resolveManagedSegment` falls back to the
  // legacy "compound-engineering" segment when no plugin name is supplied.
  const managedSegment = resolveManagedSegment(pluginName)
  const base = path.basename(outputRoot)
  // Global layout: explicit scope="global" (from OPENCODE_CONFIG_DIR or the XDG
  // default), or a basename that matches OpenCode's conventional roots.
  // Project layout: nested under ".opencode/".
  const isGlobal = scope === "global" || base === "opencode" || base === ".opencode"
  if (isGlobal) {
    return {
      root: outputRoot,
      managedDir: path.join(outputRoot, managedSegment),
      configPath: path.join(outputRoot, "opencode.json"),
      agentsDir: path.join(outputRoot, "agents"),
      pluginsDir: path.join(outputRoot, "plugins"),
      skillsDir: path.join(outputRoot, "skills"),
      commandDir: path.join(outputRoot, "commands"),
    }
  }

  return {
    root: outputRoot,
    managedDir: path.join(outputRoot, ".opencode", managedSegment),
    configPath: path.join(outputRoot, "opencode.json"),
    agentsDir: path.join(outputRoot, ".opencode", "agents"),
    pluginsDir: path.join(outputRoot, ".opencode", "plugins"),
    skillsDir: path.join(outputRoot, ".opencode", "skills"),
    commandDir: path.join(outputRoot, ".opencode", "commands"),
  }
}

async function cleanupKnownLegacyOpenCodeArtifacts(
  paths: ReturnType<typeof resolveOpenCodePaths>,
  bundle: OpenCodeBundle,
): Promise<void> {
  const legacyArtifacts = getLegacyOpenCodeArtifacts(bundle)
  for (const skillName of legacyArtifacts.skills) {
    await moveLegacyArtifactToBackup(paths.managedDir, "skills", paths.skillsDir, skillName, "OpenCode skill")
  }
  for (const commandPath of legacyArtifacts.commands) {
    await moveLegacyArtifactToBackup(paths.managedDir, "commands", paths.commandDir, commandPath, "OpenCode command")
  }
  for (const agentPath of legacyArtifacts.agents) {
    await moveLegacyArtifactToBackup(paths.managedDir, "agents", paths.agentsDir, agentPath, "OpenCode agent")
  }
}
