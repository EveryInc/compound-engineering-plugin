import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import type { WindsurfMcpServerEntry } from "../types/windsurf"
import { syncWindsurfCommands } from "./commands"
import { mergeJsonConfigAtKey } from "./json-config"
import { hasExplicitSseTransport } from "./mcp-transports"
import { syncSkills } from "./skills"

export async function syncToWindsurf(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  await syncSkills(config.skills, path.join(outputRoot, "skills"))
  await syncWindsurfCommands(config, outputRoot, "global")

  if (Object.keys(config.mcpServers).length > 0) {
    await mergeJsonConfigAtKey({
      configPath: path.join(outputRoot, "mcp_config.json"),
      key: "mcpServers",
      incoming: convertMcpForWindsurf(config.mcpServers),
    })
  }
}

function convertMcpForWindsurf(
  servers: Record<string, ClaudeMcpServer>,
): Record<string, WindsurfMcpServerEntry> {
  const result: Record<string, WindsurfMcpServerEntry> = {}

  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      result[name] = {
        command: server.command,
        args: server.args,
        env: server.env,
      }
      continue
    }

    if (!server.url) {
      continue
    }

    const entry: WindsurfMcpServerEntry = {
      headers: server.headers,
    }

    if (hasExplicitSseTransport(server)) {
      entry.url = server.url
    } else {
      entry.serverUrl = server.url
    }

    result[name] = entry
  }

  return result
}
