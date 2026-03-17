import path from "path"
import type { ClaudeHomeConfig } from "../parsers/claude-home"
import { warnUnsupportedOpenClawCommands } from "./commands"
import { syncSkills } from "./skills"

export async function syncToOpenClaw(
  config: ClaudeHomeConfig,
  outputRoot: string,
): Promise<void> {
  await syncSkills(config.skills, path.join(outputRoot, "skills"))
  warnUnsupportedOpenClawCommands(config)

  if (Object.keys(config.mcpServers).length > 0) {
    console.warn(
      "Warning: OpenClaw MCP sync is skipped because the current official OpenClaw docs do not clearly document an MCP server config contract.",
    )
  }
}
