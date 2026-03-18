import fs from "fs/promises"
import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import { renderCodexConfig } from "../targets/codex"
import { writeTextSecure } from "../utils/files"
import { syncCodexCommands } from "./commands"
import { syncSkills } from "./skills"

const CURRENT_START_MARKER = "# BEGIN compound-plugin Claude Code MCP"
const CURRENT_END_MARKER = "# END compound-plugin Claude Code MCP"
const LEGACY_MARKER = "# MCP servers synced from Claude Code"

export async function syncToCodex(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  await syncSkills(config.skills, path.join(outputRoot, "skills"))
  await syncCodexCommands(config, outputRoot)

  // Write MCP servers to config.toml (TOML format)
  if (Object.keys(config.mcpServers).length > 0) {
    const configPath = path.join(outputRoot, "config.toml")
    const mcpToml = renderCodexConfig(config.mcpServers)
    if (!mcpToml) {
      return
    }

    // Read existing config and merge idempotently
    let existingContent = ""
    try {
      existingContent = await fs.readFile(configPath, "utf-8")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err
      }
    }

    const managedBlock = [
      CURRENT_START_MARKER,
      mcpToml.trim(),
      CURRENT_END_MARKER,
      "",
    ].join("\n")

    const withoutCurrentBlock = existingContent.replace(
      new RegExp(
        `${escapeForRegex(CURRENT_START_MARKER)}[\\s\\S]*?${escapeForRegex(CURRENT_END_MARKER)}\\n?`,
        "g",
      ),
      "",
    ).trimEnd()

    const legacyMarkerIndex = withoutCurrentBlock.indexOf(LEGACY_MARKER)
    const cleaned = legacyMarkerIndex === -1
      ? withoutCurrentBlock
      : withoutCurrentBlock.slice(0, legacyMarkerIndex).trimEnd()

    const newContent = cleaned
      ? `${cleaned}\n\n${managedBlock}`
      : `${managedBlock}`

    await writeTextSecure(configPath, newContent)
  }
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
