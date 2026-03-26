import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import { ensureDir, writeText } from "../utils/files"
import { normalizePiSkillName, uniquePiSkillName } from "../utils/pi-skills"
import { PI_COMPAT_EXTENSION_SOURCE } from "../templates/pi/compat-extension"
import { syncPiCommands } from "./commands"
import { mergeJsonConfigAtKey } from "./json-config"
import { syncPiSkills } from "./pi-skills"

type McporterServer = {
  baseUrl?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
}

type McporterConfig = {
  mcpServers: Record<string, McporterServer>
}

export async function syncToPi(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  const mcporterPath = path.join(outputRoot, "compound-engineering", "mcporter.json")

  const commands = [...(config.commands ?? [])].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const promptNames = new Set<string>()
  const promptMap: Record<string, string> = {}
  for (const command of commands) {
    if (command.disableModelInvocation) continue
    const targetName = uniquePiSkillName(normalizePiSkillName(command.name), promptNames)
    promptMap[command.name] = targetName
  }

  await syncPiSkills(config.skills, path.join(outputRoot, "skills"), { prompts: promptMap })
  await syncPiCommands(config, outputRoot)

  if (config.skills.length > 0) {
    await ensureDir(path.join(outputRoot, "extensions"))
    await writeText(
      path.join(outputRoot, "extensions", "compound-engineering-compat.ts"),
      PI_COMPAT_EXTENSION_SOURCE + "\n",
    )
  }

  if (Object.keys(config.mcpServers).length > 0) {
    await ensureDir(path.dirname(mcporterPath))
    const converted = convertMcpToMcporter(config.mcpServers)
    await mergeJsonConfigAtKey({
      configPath: mcporterPath,
      key: "mcpServers",
      incoming: converted.mcpServers,
    })
  }
}

function convertMcpToMcporter(servers: Record<string, ClaudeMcpServer>): McporterConfig {
  const mcpServers: Record<string, McporterServer> = {}

  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      mcpServers[name] = {
        command: server.command,
        args: server.args,
        env: server.env,
        headers: server.headers,
      }
      continue
    }

    if (server.url) {
      mcpServers[name] = {
        baseUrl: server.url,
        headers: server.headers,
      }
    }
  }

  return { mcpServers }
}
