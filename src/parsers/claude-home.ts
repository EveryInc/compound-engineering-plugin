import path from "path"
import os from "os"
import fs from "fs/promises"
import { parseFrontmatter } from "../utils/frontmatter"
import { walkFiles } from "../utils/files"
import type { ClaudeCommand, ClaudeSkill, ClaudeMcpServer } from "../types/claude"

export interface ClaudeHomeConfig {
  skills: ClaudeSkill[]
  commands?: ClaudeCommand[]
  mcpServers: Record<string, ClaudeMcpServer>
}

export async function loadClaudeHome(claudeHome?: string): Promise<ClaudeHomeConfig> {
  const home = claudeHome ?? path.join(os.homedir(), ".claude")

  const [skills, commands, mcpServers] = await Promise.all([
    loadPersonalSkills(path.join(home, "skills")),
    loadPersonalCommands(path.join(home, "commands")),
    loadSettingsMcp(path.join(home, "settings.json")),
  ])

  return { skills, commands, mcpServers }
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
        let data: Record<string, unknown> = {}
        try {
          const raw = await fs.readFile(skillPath, "utf8")
          data = parseFrontmatter(raw, skillPath).data
        } catch {
          // Keep syncing the skill even if frontmatter is malformed.
        }
        skills.push({
          name: entry.name,
          description: data.description as string | undefined,
          argumentHint: data["argument-hint"] as string | undefined,
          disableModelInvocation: data["disable-model-invocation"] === true ? true : undefined,
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

async function loadPersonalCommands(commandsDir: string): Promise<ClaudeCommand[]> {
  try {
    const files = (await walkFiles(commandsDir))
      .filter((file) => file.endsWith(".md"))
      .sort()

    const commands: ClaudeCommand[] = []
    for (const file of files) {
      const raw = await fs.readFile(file, "utf8")
      const { data, body } = parseFrontmatter(raw, file)
      commands.push({
        name: typeof data.name === "string" ? data.name : deriveCommandName(commandsDir, file),
        description: data.description as string | undefined,
        argumentHint: data["argument-hint"] as string | undefined,
        model: data.model as string | undefined,
        allowedTools: parseAllowedTools(data["allowed-tools"]),
        disableModelInvocation: data["disable-model-invocation"] === true ? true : undefined,
        body: body.trim(),
        sourcePath: file,
      })
    }

    return commands
  } catch {
    return []
  }
}

function deriveCommandName(commandsDir: string, filePath: string): string {
  const relative = path.relative(commandsDir, filePath)
  const withoutExt = relative.replace(/\.md$/i, "")
  return withoutExt.split(path.sep).join(":")
}

function parseAllowedTools(value: unknown): string[] | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) {
    return value.map((item) => String(item))
  }
  if (typeof value === "string") {
    return value
      .split(/,/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return undefined
}
