import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import type { QwenMcpServer } from "../types/qwen"
import { syncQwenCommands } from "./commands"
import { mergeJsonConfigAtKey } from "./json-config"
import { hasExplicitRemoteTransport, hasExplicitSseTransport } from "./mcp-transports"
import { syncSkills } from "./skills"

export async function syncToQwen(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  await syncSkills(config.skills, path.join(outputRoot, "skills"))
  await syncQwenCommands(config, outputRoot)

  if (Object.keys(config.mcpServers).length > 0) {
    await mergeJsonConfigAtKey({
      configPath: path.join(outputRoot, "settings.json"),
      key: "mcpServers",
      incoming: convertMcpForQwen(config.mcpServers),
    })
  }
}

function convertMcpForQwen(
  servers: Record<string, ClaudeMcpServer>,
): Record<string, QwenMcpServer> {
  const result: Record<string, QwenMcpServer> = {}

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

    if (hasExplicitSseTransport(server)) {
      result[name] = {
        url: server.url,
        headers: server.headers,
      }
      continue
    }

    if (!hasExplicitRemoteTransport(server)) {
      console.warn(
        `Warning: Qwen MCP server "${name}" has an ambiguous remote transport; defaulting to Streamable HTTP.`,
      )
    }

    result[name] = {
      httpUrl: server.url,
      headers: server.headers,
    }
  }

  return result
}
