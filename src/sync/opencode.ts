import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import type { OpenCodeMcpServer } from "../types/opencode"
import { syncOpenCodeCommands } from "./commands"
import { mergeJsonConfigAtKey } from "./json-config"
import { syncSkills } from "./skills"

export async function syncToOpenCode(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  await syncSkills(config.skills, path.join(outputRoot, "skills"))
  await syncOpenCodeCommands(config, outputRoot)

  // Merge MCP servers into opencode.json
  if (Object.keys(config.mcpServers).length > 0) {
    const configPath = path.join(outputRoot, "opencode.json")
    const mcpConfig = convertMcpForOpenCode(config.mcpServers)
    await mergeJsonConfigAtKey({
      configPath,
      key: "mcp",
      incoming: mcpConfig,
    })
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
