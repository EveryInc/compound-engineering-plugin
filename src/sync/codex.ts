import fs from "fs/promises"
import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import type { ClaudeMcpServer } from "../types/claude"
import { forceSymlink, isValidSkillName } from "../utils/symlink"

export async function syncToCodex(
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

  // Write MCP servers to config.toml (TOML format)
  if (Object.keys(config.mcpServers).length > 0) {
    const configPath = path.join(outputRoot, "config.toml")
    const mcpToml = convertMcpForCodex(config.mcpServers)

    // Read existing config and merge idempotently
    let existingContent = ""
    try {
      existingContent = await fs.readFile(configPath, "utf-8")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err
      }
    }

    // Remove any existing Claude Code MCP section to make idempotent
    const marker = "# MCP servers synced from Claude Code"
    const markerIndex = existingContent.indexOf(marker)
    if (markerIndex !== -1) {
      existingContent = existingContent.slice(0, markerIndex).trimEnd()
    }

    const newContent = existingContent
      ? existingContent + "\n\n" + marker + "\n" + mcpToml
      : "# Codex config - synced from Claude Code\n\n" + mcpToml

    await fs.writeFile(configPath, newContent, { mode: 0o600 })
  }
}

/** Escape a string for TOML double-quoted strings */
function escapeTomlString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
}

function convertMcpForCodex(servers: Record<string, ClaudeMcpServer>): string {
  const sections: string[] = []

  for (const [name, server] of Object.entries(servers)) {
    if (!server.command) continue

    const lines: string[] = []
    lines.push(`[mcp_servers.${name}]`)
    lines.push(`command = "${escapeTomlString(server.command)}"`)

    if (server.args && server.args.length > 0) {
      const argsStr = server.args.map((arg) => `"${escapeTomlString(arg)}"`).join(", ")
      lines.push(`args = [${argsStr}]`)
    }

    if (server.env && Object.keys(server.env).length > 0) {
      lines.push("")
      lines.push(`[mcp_servers.${name}.env]`)
      for (const [key, value] of Object.entries(server.env)) {
        lines.push(`${key} = "${escapeTomlString(value)}"`)
      }
    }

    sections.push(lines.join("\n"))
  }

  return sections.join("\n\n") + "\n"
}
