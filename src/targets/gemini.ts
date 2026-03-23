import path from "path"
import { backupFile, copySkillDir, ensureDir, pathExists, readJson, resolveCommandPath, writeJson, writeText } from "../utils/files"
import { transformContentForGemini } from "../converters/claude-to-gemini"
import type { GeminiBundle } from "../types/gemini"

export async function writeGeminiBundle(outputRoot: string, bundle: GeminiBundle): Promise<void> {
  const paths = resolveGeminiPaths(outputRoot)
  await ensureDir(paths.geminiDir)

  if (bundle.generatedSkills.length > 0) {
    for (const skill of bundle.generatedSkills) {
      await writeText(path.join(paths.skillsDir, skill.name, "SKILL.md"), skill.content + "\n")
    }
  }

  if (bundle.skillDirs.length > 0) {
    for (const skill of bundle.skillDirs) {
      await copySkillDir(skill.sourceDir, path.join(paths.skillsDir, skill.name), transformContentForGemini)
    }
  }

  if (bundle.commands.length > 0) {
    for (const command of bundle.commands) {
      const dest = await resolveCommandPath(paths.commandsDir, command.name, ".toml")
      await writeText(dest, command.content + "\n")
    }
  }

  if (bundle.mcpServers && Object.keys(bundle.mcpServers).length > 0) {
    const settingsPath = path.join(paths.geminiDir, "settings.json")
    const backupPath = await backupFile(settingsPath)
    if (backupPath) {
      console.log(`Backed up existing settings.json to ${backupPath}`)
    }

    // Merge mcpServers into existing settings if present
    let existingSettings: Record<string, unknown> = {}
    if (await pathExists(settingsPath)) {
      try {
        existingSettings = await readJson<Record<string, unknown>>(settingsPath)
      } catch {
        console.warn("Warning: existing settings.json could not be parsed and will be replaced.")
      }
    }

    const existingMcp = (existingSettings.mcpServers && typeof existingSettings.mcpServers === "object")
      ? existingSettings.mcpServers as Record<string, unknown>
      : {}
    const merged = { ...existingSettings, mcpServers: { ...existingMcp, ...bundle.mcpServers } }
    await writeJson(settingsPath, merged)
  }
}

function resolveGeminiPaths(outputRoot: string) {
  const base = path.basename(outputRoot)
  // If already pointing at .gemini, write directly into it
  if (base === ".gemini") {
    return {
      geminiDir: outputRoot,
      skillsDir: path.join(outputRoot, "skills"),
      commandsDir: path.join(outputRoot, "commands"),
    }
  }
  // Otherwise nest under .gemini
  return {
    geminiDir: path.join(outputRoot, ".gemini"),
    skillsDir: path.join(outputRoot, ".gemini", "skills"),
    commandsDir: path.join(outputRoot, ".gemini", "commands"),
  }
}
