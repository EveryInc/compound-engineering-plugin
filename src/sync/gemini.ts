import fs from "fs/promises"
import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import { forceSymlink, isValidSkillName } from "../utils/symlink"

type GeminiMcpServer = {
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

export async function syncToGemini(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  const skillsDir = path.join(outputRoot, "skills")
  await fs.mkdir(skillsDir, { recursive: true })

  for (const skill of config.skills) {
    if (!isValidSkillName(skill.name)) {
      console.warn(`Skipping skill with invalid name: ${skill.name}`)
      continue
    }
    const target = path.join(skillsDir, skill.name)
    await forceSymlink(skill.sourceDir, target)
  }

  if (Object.keys(config.mcpServers).length > 0) {
    const settingsPath = path.join(outputRoot, "settings.json")
    const existing = await readJsonSafe(settingsPath)
    const converted = convertMcpForGemini(config.mcpServers)
    const existingMcp =
      existing.mcpServers && typeof existing.mcpServers === "object"
        ? (existing.mcpServers as Record<string, unknown>)
        : {}
    const merged = {
      ...existing,
      mcpServers: { ...existingMcp, ...converted },
    }
    await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2), { mode: 0o600 })
  }
}

async function readJsonSafe(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return JSON.parse(content) as Record<string, unknown>
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {}
    }
    throw err
  }
}

function convertMcpForGemini(
  servers: Record<string, ClaudeMcpServer>,
): Record<string, GeminiMcpServer> {
  const result: Record<string, GeminiMcpServer> = {}
  for (const [name, server] of Object.entries(servers)) {
    const entry: GeminiMcpServer = {}
    if (server.command) {
      entry.command = server.command
      if (server.args && server.args.length > 0) entry.args = server.args
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env
    } else if (server.url) {
      entry.url = server.url
      if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers
    }
    result[name] = entry
  }
  return result
}
