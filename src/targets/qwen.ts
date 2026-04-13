import path from "path"
import { backupFile, copyDir, ensureDir, readJson, resolveCommandPath, sanitizePathName, pathExists, writeJsonSecure, writeText } from "../utils/files"
import { namespacedSkillsDir } from "../utils/plugin-namespace"
import type { QwenBundle, QwenExtensionConfig } from "../types/qwen"

export async function writeQwenBundle(outputRoot: string, bundle: QwenBundle): Promise<void> {
  const qwenPaths = resolveQwenPaths(outputRoot)
  await ensureDir(qwenPaths.root)

  // Merge qwen-extension.json config, preserving existing user MCP servers
  const configPath = qwenPaths.configPath
  const backupPath = await backupFile(configPath)
  if (backupPath) {
    console.log(`Backed up existing config to ${backupPath}`)
  }
  const merged = await mergeQwenConfig(configPath, bundle.config)
  await writeJsonSecure(configPath, merged)

  // Write context file (QWEN.md)
  if (bundle.contextFile) {
    await writeText(qwenPaths.contextPath, bundle.contextFile + "\n")
  }

  // Write agents
  const agentsDir = qwenPaths.agentsDir
  await ensureDir(agentsDir)
  for (const agent of bundle.agents) {
    const ext = agent.format === "yaml" ? "yaml" : "md"
    await writeText(path.join(agentsDir, `${sanitizePathName(agent.name)}.${ext}`), agent.content + "\n")
  }

  // Write commands
  const commandsDir = qwenPaths.commandsDir
  await ensureDir(commandsDir)
  for (const commandFile of bundle.commandFiles) {
    const dest = await resolveCommandPath(commandsDir, commandFile.name, ".md")
    await writeText(dest, commandFile.content + "\n")
  }

  // Copy skills
  if (bundle.skillDirs.length > 0) {
    const flatSkillsRoot = qwenPaths.skillsDir
    await ensureDir(flatSkillsRoot)
    const skillsRoot = namespacedSkillsDir(flatSkillsRoot, bundle.pluginName)
    for (const skill of bundle.skillDirs) {
      await copyDir(skill.sourceDir, path.join(skillsRoot, sanitizePathName(skill.name)))
    }
  }
}

const MANAGED_KEY = "_compound_managed_mcp"
const MANAGED_KEYS_KEY = "_compound_managed_keys"
const TRACKING_KEYS = new Set([MANAGED_KEY, MANAGED_KEYS_KEY])

async function mergeQwenConfig(
  configPath: string,
  incoming: QwenExtensionConfig,
): Promise<QwenExtensionConfig> {
  let existing: Record<string, unknown> = {}
  if (await pathExists(configPath)) {
    try {
      const parsed = await readJson<unknown>(configPath)
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>
      }
    } catch {
      // Unparseable file — proceed with incoming only
    }
  }

  const existingMcp = (typeof existing.mcpServers === "object" && existing.mcpServers !== null && !Array.isArray(existing.mcpServers))
    ? { ...(existing.mcpServers as Record<string, unknown>) }
    : {}

  // Remove previously-managed plugin servers that are no longer in the bundle.
  // Legacy migration: if no tracking key exists AND plugin has servers, assume all
  // existing servers are plugin-managed (the old writer overwrote the entire file).
  // When incoming is empty, skip pruning — there's nothing to migrate and we'd
  // wrongly delete user servers from a pre-existing untracked config.
  const incomingMcp = incoming.mcpServers ?? {}
  const hasTrackingKey = Array.isArray(existing[MANAGED_KEY])
  const prevManaged = hasTrackingKey
    ? existing[MANAGED_KEY] as string[]
    : Object.keys(incomingMcp).length > 0 ? Object.keys(existingMcp) : []
  for (const name of prevManaged) {
    if (!(name in incomingMcp)) {
      delete existingMcp[name]
    }
  }

  const mergedMcp = { ...existingMcp, ...incomingMcp }
  const { mcpServers: _, ...incomingRest } = incoming
  const incomingTopKeys = Object.keys(incomingRest).filter((k) => !TRACKING_KEYS.has(k))

  // Prune top-level keys from previous installs that are no longer in the incoming bundle.
  // Only prune keys we previously tracked; skip on first install (no tracking key yet).
  const prevManagedKeys = Array.isArray(existing[MANAGED_KEYS_KEY])
    ? existing[MANAGED_KEYS_KEY] as string[]
    : []
  for (const key of prevManagedKeys) {
    if (!incomingTopKeys.includes(key) && key in existing) {
      delete existing[key]
    }
  }

  const merged = { ...existing, ...incomingRest } as QwenExtensionConfig & Record<string, unknown>

  if (Object.keys(mergedMcp).length > 0) {
    merged.mcpServers = mergedMcp as QwenExtensionConfig["mcpServers"]
  } else {
    delete merged.mcpServers
  }

  // Always write tracking keys (even as []) so future installs know what to prune.
  merged[MANAGED_KEY] = Object.keys(incomingMcp)
  merged[MANAGED_KEYS_KEY] = incomingTopKeys

  return merged as QwenExtensionConfig
}

function resolveQwenPaths(outputRoot: string) {
  return {
    root: outputRoot,
    configPath: path.join(outputRoot, "qwen-extension.json"),
    contextPath: path.join(outputRoot, "QWEN.md"),
    agentsDir: path.join(outputRoot, "agents"),
    commandsDir: path.join(outputRoot, "commands"),
    skillsDir: path.join(outputRoot, "skills"),
  }
}
