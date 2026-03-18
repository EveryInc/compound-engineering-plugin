import path from "path"
import { backupFile, copyDir, ensureDir, pathExists, readJson, writeJson, writeText } from "../utils/files"
import type { KiroBundle } from "../types/kiro"

export async function writeKiroBundle(outputRoot: string, bundle: KiroBundle): Promise<void> {
  const paths = resolveKiroPaths(outputRoot)
  await ensureDir(paths.kiroDir)

  // Write agents
  if (bundle.agents.length > 0) {
    for (const agent of bundle.agents) {
      // Validate name doesn't escape agents directory
      validatePathSafe(agent.name, "agent")

      // Write agent JSON config
      await writeJson(
        path.join(paths.agentsDir, `${agent.name}.json`),
        agent.config,
      )

      // Write agent prompt file
      await writeText(
        path.join(paths.agentsDir, "prompts", `${agent.name}.md`),
        agent.promptContent + "\n",
      )
    }
  }

  // Write generated skills (from commands)
  if (bundle.generatedSkills.length > 0) {
    for (const skill of bundle.generatedSkills) {
      validatePathSafe(skill.name, "skill")
      await writeText(
        path.join(paths.skillsDir, skill.name, "SKILL.md"),
        skill.content + "\n",
      )
    }
  }

  // Copy skill directories (pass-through)
  if (bundle.skillDirs.length > 0) {
    for (const skill of bundle.skillDirs) {
      validatePathSafe(skill.name, "skill directory")
      const destDir = path.join(paths.skillsDir, skill.name)

      // Validate destination doesn't escape skills directory
      const resolvedDest = path.resolve(destDir)
      if (!resolvedDest.startsWith(path.resolve(paths.skillsDir))) {
        console.warn(`Warning: Skill name "${skill.name}" escapes .kiro/skills/. Skipping.`)
        continue
      }

      await copyDir(skill.sourceDir, destDir)
    }
  }

  // Write steering files
  if (bundle.steeringFiles.length > 0) {
    for (const file of bundle.steeringFiles) {
      validatePathSafe(file.name, "steering file")
      await writeText(
        path.join(paths.steeringDir, `${file.name}.md`),
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
}

function resolveKiroPaths(outputRoot: string) {
  const base = path.basename(outputRoot)
  // If already pointing at .kiro, write directly into it
  if (base === ".kiro") {
    return {
      kiroDir: outputRoot,
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
    agentsDir: path.join(kiroDir, "agents"),
    skillsDir: path.join(kiroDir, "skills"),
    steeringDir: path.join(kiroDir, "steering"),
    settingsDir: path.join(kiroDir, "settings"),
  }
}

function validatePathSafe(name: string, label: string): void {
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`${label} name contains unsafe path characters: ${name}`)
  }
}
