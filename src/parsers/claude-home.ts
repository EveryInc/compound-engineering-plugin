import path from "path"
import os from "os"
import fs from "fs/promises"
import type { ClaudeSkill, ClaudeMcpServer } from "../types/claude"

export interface ClaudeHomeConfig {
  root: string
  skills: ClaudeSkill[]
  mcpServers: Record<string, ClaudeMcpServer>
}

export async function loadClaudeHome(claudeHome?: string): Promise<ClaudeHomeConfig> {
  const home = claudeHome ?? path.join(os.homedir(), ".claude")

  const [skills, mcpServers] = await Promise.all([
    loadPersonalSkills(path.join(home, "skills")),
    loadSettingsMcp(path.join(home, "settings.json")),
  ])

  return { root: home, skills, mcpServers }
}

async function loadPersonalSkills(skillsDir: string): Promise<ClaudeSkill[]> {
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true })
    const skills: ClaudeSkill[] = []

    for (const entry of entries) {
      // Check if directory or symlink (symlinks are common for skills)
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

      const entryPath = path.join(skillsDir, entry.name)
      const skillPath = path.join(entryPath, "SKILL.md")

      try {
        await fs.access(skillPath)
        // Resolve symlink to get the actual source directory
        const sourceDir = entry.isSymbolicLink()
          ? await fs.realpath(entryPath)
          : entryPath
        skills.push({
          name: entry.name,
          sourceDir,
          skillPath,
        })
      } catch {
        // No SKILL.md, skip
      }
    }
    return skills
  } catch {
    return [] // Directory doesn't exist
  }
}

async function loadSettingsMcp(
  settingsPath: string,
): Promise<Record<string, ClaudeMcpServer>> {
  try {
    const content = await fs.readFile(settingsPath, "utf-8")
    const settings = JSON.parse(content) as { mcpServers?: Record<string, ClaudeMcpServer> }
    return settings.mcpServers ?? {}
  } catch {
    return {} // File doesn't exist or invalid JSON
  }
}
