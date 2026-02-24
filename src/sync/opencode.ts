import fs from "fs/promises"
import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import type { OpenCodeMcpServer } from "../types/opencode"
import { readJsonSafe } from "../utils/files"
import { forceSymlink, isValidSkillName } from "../utils/symlink"

export async function syncToOpenCode(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  // Ensure output directories exist
  const skillsDir = path.join(outputRoot, "skills")
  await fs.mkdir(skillsDir, { recursive: true })

  // Symlink skills (with validation)
  for (const skill of config.skills) {
    if (!isValidSkillName(skill.name)) {
      console.warn(`Skipping skill with invalid name: ${skill.name}`)
      continue
    }
    const target = path.join(skillsDir, skill.name)
    await forceSymlink(skill.sourceDir, target)
  }

  // Merge MCP servers into opencode.json
  if (Object.keys(config.mcpServers).length > 0) {
    const configPath = path.join(outputRoot, "opencode.json")
    const existing = await readJsonSafe(configPath)
    const mcpConfig = convertMcpForOpenCode(config.mcpServers)
    existing.mcp = { ...(existing.mcp ?? {}), ...mcpConfig }
    await fs.writeFile(configPath, JSON.stringify(existing, null, 2), { mode: 0o600 })
  }
}

function convertMcpForOpenCode(
  servers: Record<string, ClaudeMcpServer>,
): Record<string, OpenCodeMcpServer> {
  const result: Record<string, OpenCodeMcpServer> = {}

  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      result[name] = {
        type: "local",
        command: [server.command, ...(server.args ?? [])],
        environment: server.env,
        enabled: true,
      }
      continue
    }

    if (server.url) {
      result[name] = {
        type: "remote",
        url: server.url,
        headers: server.headers,
        enabled: true,
      }
    }
  }

  return result
}
