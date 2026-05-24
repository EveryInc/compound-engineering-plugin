import path from "path"
import { backupFile, copySkillDir, ensureDir, pathExists, readJson, sanitizePathName, writeJson, writeText } from "../utils/files"
import { transformContentForKiro } from "../converters/claude-to-kiro"
import type { KiroBundle } from "../types/kiro"
import { cleanupStaleSkillDirs, cleanupStaleAgents } from "../utils/legacy-cleanup"
import { getLegacyKiroArtifacts } from "../data/plugin-legacy-artifacts"
import { moveLegacyArtifactToBackup, sanitizeManagedPluginName } from "./managed-artifacts"

export async function writeKiroBundle(outputRoot: string, bundle: KiroBundle): Promise<void> {
  const paths = resolveKiroPaths(outputRoot)
  const pluginName = bundle.pluginName ? sanitizeManagedPluginName(bundle.pluginName) : undefined
  await ensureDir(paths.kiroDir)

  // TODO(cleanup): Remove after v3 transition (circa Q3 2026)
  await cleanupStaleSkillDirs(paths.skillsDir)
  await cleanupStaleAgents(path.join(paths.agentsDir, "prompts"), ".md")
  await cleanupStaleAgents(paths.agentsDir, ".json")

  // Write agents
  if (bundle.agents.length > 0) {
    for (const agent of bundle.agents) {
      // Validate name doesn't escape agents directory
      validatePathSafe(agent.name, "agent")

      // Write agent JSON config
      await writeJson(
        path.join(paths.agentsDir, `${sanitizePathName(agent.name)}.json`),
        agent.config,
      )

      // Write agent prompt file
      await writeText(
        path.join(paths.agentsDir, "prompts", `${sanitizePathName(agent.name)}.md`),
        agent.promptContent + "\n",
      )
    }
  }

  // Write generated skills (from commands)
  if (bundle.generatedSkills.length > 0) {
    for (const skill of bundle.generatedSkills) {
      validatePathSafe(skill.name, "skill")
      await writeText(
        path.join(paths.skillsDir, sanitizePathName(skill.name), "SKILL.md"),
        skill.content + "\n",
      )
    }
  }

  // Copy skill directories (pass-through)
  if (bundle.skillDirs.length > 0) {
    for (const skill of bundle.skillDirs) {
      validatePathSafe(skill.name, "skill directory")
      const destDir = path.join(paths.skillsDir, sanitizePathName(skill.name))

      // Validate destination doesn't escape skills directory
      const resolvedDest = path.resolve(destDir)
      if (!resolvedDest.startsWith(path.resolve(paths.skillsDir))) {
        console.warn(`Warning: Skill name "${skill.name}" escapes .kiro/skills/. Skipping.`)
        continue
      }

      const knownAgentNames = bundle.agents.map((a) => a.name)
      await copySkillDir(skill.sourceDir, destDir, (content) =>
        transformContentForKiro(content, knownAgentNames),
      )
    }
  }

  // Write steering files
  if (bundle.steeringFiles.length > 0) {
    for (const file of bundle.steeringFiles) {
      validatePathSafe(file.name, "steering file")
      await writeText(
        path.join(paths.steeringDir, `${sanitizePathName(file.name)}.md`),
        file.content + "\n",
      )
    }
  }

  // Write MCP servers to mcp.json
  if (Object.keys(bundle.mcpServers).length > 0) {
    const mcpPath = path.join(paths.settingsDir, "mcp.json")
    const backupPath = await backupFile(mcpPath)
    if (backupPath) {
      console.log(`Backed up existing mcp.json to ${backupPath}`)
    }

    // Merge with existing mcp.json if present
    let existingConfig: Record<string, unknown> = {}
    if (await pathExists(mcpPath)) {
      try {
        existingConfig = await readJson<Record<string, unknown>>(mcpPath)
      } catch {
        console.warn("Warning: existing mcp.json could not be parsed and will be replaced.")
      }
    }

    const existingServers =
      existingConfig.mcpServers && typeof existingConfig.mcpServers === "object"
        ? (existingConfig.mcpServers as Record<string, unknown>)
        : {}
    const merged = { ...existingConfig, mcpServers: { ...existingServers, ...bundle.mcpServers } }
    await writeJson(mcpPath, merged)
  }

  if (pluginName) {
    await cleanupKnownLegacyKiroArtifacts(paths, bundle)
  }
}

function resolveKiroPaths(outputRoot: string) {
  const base = path.basename(outputRoot)
  // If already pointing at .kiro, write directly into it
  if (base === ".kiro") {
    return {
      kiroDir: outputRoot,
      managedDir: path.join(outputRoot, "compound-engineering"),
      agentsDir: path.join(outputRoot, "agents"),
      skillsDir: path.join(outputRoot, "skills"),
      steeringDir: path.join(outputRoot, "steering"),
      settingsDir: path.join(outputRoot, "settings"),
    }
  }
  // Otherwise nest under .kiro
  const kiroDir = path.join(outputRoot, ".kiro")
  return {
    kiroDir,
    managedDir: path.join(kiroDir, "compound-engineering"),
    agentsDir: path.join(kiroDir, "agents"),
    skillsDir: path.join(kiroDir, "skills"),
    steeringDir: path.join(kiroDir, "steering"),
    settingsDir: path.join(kiroDir, "settings"),
  }
}

async function cleanupKnownLegacyKiroArtifacts(
  paths: ReturnType<typeof resolveKiroPaths>,
  bundle: KiroBundle,
): Promise<void> {
  const legacyArtifacts = getLegacyKiroArtifacts(bundle)
  for (const skillName of legacyArtifacts.skills) {
    await moveLegacyArtifactToBackup(paths.managedDir, "skills", paths.skillsDir, skillName, "Kiro skill")
  }
  for (const agentName of legacyArtifacts.agents) {
    await moveLegacyArtifactToBackup(paths.managedDir, "agents", paths.agentsDir, `${agentName}.json`, "Kiro agent")
    await moveLegacyArtifactToBackup(
      paths.managedDir,
      "agents",
      path.join(paths.agentsDir, "prompts"),
      `${agentName}.md`,
      "Kiro agent prompt",
    )
  }
}

function validatePathSafe(name: string, label: string): void {
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`${label} name contains unsafe path characters: ${name}`)
  }
}
