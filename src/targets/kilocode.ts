import path from "path"
import { backupFile, copyDir, ensureDir, pathExists, readJson, writeJsonSecure, writeText } from "../utils/files"
import type { KiloCodeBundle } from "../types/kilocode"
import type { TargetScope } from "./index"

export async function writeKiloCodeBundle(
  outputRoot: string,
  bundle: KiloCodeBundle,
  scope?: TargetScope,
): Promise<void> {
  const paths = resolveKiloCodePaths(outputRoot, scope)
  await ensureDir(paths.configDir)

  if (bundle.agents.length > 0) {
    const agentsDir = paths.agentsDir
    await ensureDir(agentsDir)
    for (const agent of bundle.agents) {
      validatePathSafe(agent.name, "agent")
      const destPath = path.join(agentsDir, `${agent.name}.md`)
      await writeText(destPath, agent.content + "\n")
    }
  }

  if (bundle.skillDirs.length > 0) {
    const skillsDir = paths.skillsDir
    await ensureDir(skillsDir)
    for (const skill of bundle.skillDirs) {
      validatePathSafe(skill.name, "skill directory")
      const destDir = path.join(skillsDir, skill.name)

      const resolvedDest = path.resolve(destDir)
      if (!resolvedDest.startsWith(path.resolve(skillsDir))) {
        console.warn(`Warning: Skill name "${skill.name}" escapes skills/. Skipping.`)
        continue
      }

      await copyDir(skill.sourceDir, destDir)
    }
  }

  if (bundle.mcpConfig && bundle.mcpConfig.mcp && Object.keys(bundle.mcpConfig.mcp).length > 0) {
    const mcpPath = paths.mcpPath
    const backupPath = await backupFile(mcpPath)
    if (backupPath) {
      console.log(`Backed up existing kilo.json to ${backupPath}`)
    }

    let existingConfig: Record<string, unknown> = {}
    if (await pathExists(mcpPath)) {
      try {
        const parsed = await readJson<unknown>(mcpPath)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          existingConfig = parsed as Record<string, unknown>
        }
      } catch {
        console.warn("Warning: existing kilo.json could not be parsed and will be replaced.")
      }
    }

    const existingMcp =
      existingConfig.mcp &&
      typeof existingConfig.mcp === "object" &&
      !Array.isArray(existingConfig.mcp)
        ? (existingConfig.mcp as Record<string, unknown>)
        : {}
    const merged = { ...existingConfig, mcp: { ...existingMcp, ...bundle.mcpConfig.mcp } }
    await writeJsonSecure(mcpPath, merged)
  }
}

export function resolveKiloCodePaths(
  outputRoot: string,
  scope?: TargetScope,
): {
  configDir: string
  agentsDir: string
  skillsDir: string
  mcpPath: string
} {
  if (scope === "global") {
    const home = process.env.HOME || process.env.USERPROFILE || ""
    return {
      configDir: path.join(home, ".config", "kilo"),
      agentsDir: path.join(home, ".config", "kilo", "agents"),
      skillsDir: path.join(home, ".kilocode", "skills"),
      mcpPath: path.join(home, ".config", "kilo", "kilo.json"),
    }
  }

  return {
    configDir: path.join(outputRoot, ".kilo"),
    agentsDir: path.join(outputRoot, ".kilo", "agents"),
    skillsDir: path.join(outputRoot, ".kilocode", "skills"),
    mcpPath: path.join(outputRoot, "kilo.json"),
  }
}

function validatePathSafe(name: string, label: string): void {
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`${label} name contains unsafe path characters: ${name}`)
  }
}
