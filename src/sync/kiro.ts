import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import type { KiroMcpServer } from "../types/kiro"
import { syncKiroCommands } from "./commands"
import { mergeJsonConfigAtKey } from "./json-config"
import { syncSkills } from "./skills"

export async function syncToKiro(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  await syncSkills(config.skills, path.join(outputRoot, "skills"))
  await syncKiroCommands(config, outputRoot)

  if (Object.keys(config.mcpServers).length > 0) {
    await mergeJsonConfigAtKey({
      configPath: path.join(outputRoot, "settings", "mcp.json"),
      key: "mcpServers",
      incoming: convertMcpForKiro(config.mcpServers),
    })
  }
}

function convertMcpForKiro(
  servers: Record<string, ClaudeMcpServer>,
): Record<string, KiroMcpServer> {
  const result: Record<string, KiroMcpServer> = {}

  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      result[name] = {
        command: server.command,
        args: server.args,
        env: server.env,
      }
      continue
    }

    if (server.url) {
      result[name] = {
        url: server.url,
        headers: server.headers,
      }
    }
  }

  return result
}
