import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import { ensureDir } from "../utils/files"
import { syncPiCommands } from "./commands"
import { mergeJsonConfigAtKey } from "./json-config"
import { syncSkills } from "./skills"

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

  await syncSkills(config.skills, path.join(outputRoot, "skills"))
  await syncPiCommands(config, outputRoot)

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
