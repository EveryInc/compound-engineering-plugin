import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import { syncCopilotCommands } from "./commands"
import { mergeJsonConfigAtKey } from "./json-config"
import { hasExplicitSseTransport } from "./mcp-transports"
import { syncSkills } from "./skills"

type CopilotMcpServer = {
  type: "local" | "http" | "sse"
  command?: string
  args?: string[]
  url?: string
  tools: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
}

type CopilotMcpConfig = {
  mcpServers: Record<string, CopilotMcpServer>
}

export async function syncToCopilot(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  await syncSkills(config.skills, path.join(outputRoot, "skills"))
  await syncCopilotCommands(config, outputRoot)

  if (Object.keys(config.mcpServers).length > 0) {
    const mcpPath = path.join(outputRoot, "mcp-config.json")
    const converted = convertMcpForCopilot(config.mcpServers)
    await mergeJsonConfigAtKey({
      configPath: mcpPath,
      key: "mcpServers",
      incoming: converted,
    })
  }
}

function convertMcpForCopilot(
  servers: Record<string, ClaudeMcpServer>,
): Record<string, CopilotMcpServer> {
  const result: Record<string, CopilotMcpServer> = {}
  for (const [name, server] of Object.entries(servers)) {
    const entry: CopilotMcpServer = {
      type: server.command ? "local" : hasExplicitSseTransport(server) ? "sse" : "http",
      tools: ["*"],
    }

    if (server.command) {
      entry.command = server.command
      if (server.args && server.args.length > 0) entry.args = server.args
    } else if (server.url) {
      entry.url = server.url
      if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers
    }

    if (server.env && Object.keys(server.env).length > 0) {
      entry.env = prefixEnvVars(server.env)
    }

    result[name] = entry
  }
  return result
}

function prefixEnvVars(env: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("COPILOT_MCP_")) {
      result[key] = value
    } else {
      result[`COPILOT_MCP_${key}`] = value
    }
  }
  return result
}
