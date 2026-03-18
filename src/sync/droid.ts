import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import { syncDroidCommands } from "./commands"
import { mergeJsonConfigAtKey } from "./json-config"
import { syncSkills } from "./skills"

type DroidMcpServer = {
  type: "stdio" | "http"
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  disabled: boolean
}

export async function syncToDroid(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  await syncSkills(config.skills, path.join(outputRoot, "skills"))
  await syncDroidCommands(config, outputRoot)

  if (Object.keys(config.mcpServers).length > 0) {
    await mergeJsonConfigAtKey({
      configPath: path.join(outputRoot, "mcp.json"),
      key: "mcpServers",
      incoming: convertMcpForDroid(config.mcpServers),
    })
  }
}

function convertMcpForDroid(
  servers: Record<string, ClaudeMcpServer>,
): Record<string, DroidMcpServer> {
  const result: Record<string, DroidMcpServer> = {}

  for (const [name, server] of Object.entries(servers)) {
    if (server.command) {
      result[name] = {
        type: "stdio",
        command: server.command,
        args: server.args,
        env: server.env,
        disabled: false,
      }
      continue
    }

    if (server.url) {
      result[name] = {
        type: "http",
        url: server.url,
        headers: server.headers,
        disabled: false,
      }
    }
  }

  return result
}
