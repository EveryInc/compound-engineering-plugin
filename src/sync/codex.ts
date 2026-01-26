import fs from "fs/promises"
import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"

export async function syncToCodex(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  // Ensure output directories exist
  const skillsDir = path.join(outputRoot, "skills")
  await fs.mkdir(skillsDir, { recursive: true })

  // Symlink skills
  for (const skill of config.skills) {
    const target = path.join(skillsDir, skill.name)
    await forceSymlink(skill.sourceDir, target)
  }

  // Append MCP servers to config.toml (TOML format)
  if (Object.keys(config.mcpServers).length > 0) {
    const configPath = path.join(outputRoot, "config.toml")
    const mcpToml = convertMcpForCodex(config.mcpServers)

    // Check if MCP servers already exist in config
    try {
      const existing = await fs.readFile(configPath, "utf-8")
      if (!existing.includes("[mcp_servers.")) {
        await fs.appendFile(configPath, "\n# MCP servers synced from Claude Code\n" + mcpToml)
      }
    } catch {
      // File doesn't exist, create it
      await fs.writeFile(configPath, "# Codex config - synced from Claude Code\n\n" + mcpToml)
    }
  }
}

async function forceSymlink(source: string, target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true })
  await fs.symlink(source, target)
}

function convertMcpForCodex(servers: Record<string, ClaudeMcpServer>): string {
  const sections: string[] = []

  for (const [name, server] of Object.entries(servers)) {
    if (!server.command) continue

    const lines: string[] = []
    lines.push(`[mcp_servers.${name}]`)
    lines.push(`command = "${server.command}"`)

    if (server.args && server.args.length > 0) {
      const argsStr = server.args.map((arg) => `"${arg}"`).join(", ")
      lines.push(`args = [${argsStr}]`)
    }

    if (server.env && Object.keys(server.env).length > 0) {
      lines.push("")
      lines.push(`[mcp_servers.${name}.env]`)
      for (const [key, value] of Object.entries(server.env)) {
        lines.push(`${key} = "${value}"`)
      }
    }

    sections.push(lines.join("\n"))
  }

  return sections.join("\n\n") + "\n"
}
