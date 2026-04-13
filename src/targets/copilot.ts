import path from "path"
import { backupFile, copySkillDir, ensureDir, pathExists, readJson, sanitizePathName, writeJsonSecure, writeText } from "../utils/files"
import { transformContentForCopilot } from "../converters/claude-to-copilot"
import { DEFAULT_PLUGIN_NAMESPACE, namespacedSkillsDir } from "../utils/plugin-namespace"
import type { CopilotBundle } from "../types/copilot"

export async function writeCopilotBundle(outputRoot: string, bundle: CopilotBundle): Promise<void> {
  const paths = resolveCopilotPaths(outputRoot)
  await ensureDir(paths.githubDir)

  if (bundle.agents.length > 0) {
    const agentsDir = path.join(paths.githubDir, "agents")
    for (const agent of bundle.agents) {
      await writeText(path.join(agentsDir, `${sanitizePathName(agent.name)}.agent.md`), agent.content + "\n")
    }
  }

  const flatSkillsDir = path.join(paths.githubDir, "skills")
  const skillsDir = namespacedSkillsDir(flatSkillsDir, bundle.pluginName ?? DEFAULT_PLUGIN_NAMESPACE)

  if (bundle.generatedSkills.length > 0) {
    for (const skill of bundle.generatedSkills) {
      await writeText(path.join(skillsDir, sanitizePathName(skill.name), "SKILL.md"), skill.content + "\n")
    }
  }

  if (bundle.skillDirs.length > 0) {
    for (const skill of bundle.skillDirs) {
      await copySkillDir(skill.sourceDir, path.join(skillsDir, sanitizePathName(skill.name)), transformContentForCopilot)
    }
  }

  const mcpPath = path.join(paths.githubDir, "copilot-mcp-config.json")
  const merged = await mergeCopilotMcpConfig(mcpPath, bundle.mcpConfig ?? {})
  if (merged !== null) {
    const backupPath = await backupFile(mcpPath)
    if (backupPath) {
      console.log(`Backed up existing copilot-mcp-config.json to ${backupPath}`)
    }
    await writeJsonSecure(mcpPath, merged)
  }
}

const MANAGED_KEY = "_compound_managed_mcp"

async function mergeCopilotMcpConfig(
  configPath: string,
  incoming: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
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
  const incomingKeys = Object.keys(incoming)
  const hasTrackingKey = Array.isArray(existing[MANAGED_KEY])
  const prevManaged = hasTrackingKey
    ? existing[MANAGED_KEY] as string[]
    : incomingKeys.length > 0 ? Object.keys(existingMcp) : []
  for (const name of prevManaged) {
    if (!(name in incoming)) {
      delete existingMcp[name]
    }
  }

  const mergedMcp = { ...existingMcp, ...incoming }

  // Nothing to write — no user servers, no plugin servers, no existing file
  if (Object.keys(mergedMcp).length === 0 && Object.keys(existing).length === 0) {
    return null
  }

  // Always write tracking key (even as []) to prevent legacy fallback on future installs
  return {
    ...existing,
    mcpServers: mergedMcp,
    [MANAGED_KEY]: incomingKeys,
  }
}

function resolveCopilotPaths(outputRoot: string) {
  const base = path.basename(outputRoot)
  // If already pointing at .github, write directly into it
  if (base === ".github") {
    return { githubDir: outputRoot }
  }
  // Otherwise nest under .github
  return { githubDir: path.join(outputRoot, ".github") }
}
