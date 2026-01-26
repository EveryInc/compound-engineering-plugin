import { defineCommand } from "citty"
import os from "os"
import path from "path"
import { loadClaudeHome } from "../parsers/claude-home"
import { syncToOpenCode } from "../sync/opencode"
import { syncToCodex } from "../sync/codex"

function isValidTarget(value: string): value is "opencode" | "codex" {
  return value === "opencode" || value === "codex"
}

export default defineCommand({
  meta: {
    name: "sync",
    description: "Sync Claude Code config (~/.claude/) to OpenCode or Codex",
  },
  args: {
    target: {
      type: "string",
      required: true,
      description: "Target: opencode | codex",
    },
    claudeHome: {
      type: "string",
      alias: "claude-home",
      description: "Path to Claude home (default: ~/.claude)",
    },
  },
  async run({ args }) {
    if (!isValidTarget(args.target)) {
      console.error(`Unknown target: ${args.target}. Use 'opencode' or 'codex'.`)
      process.exit(1)
    }

    const claudeHome = expandHome(args.claudeHome ?? path.join(os.homedir(), ".claude"))
    const config = await loadClaudeHome(claudeHome)

    console.log(
      `Syncing ${config.skills.length} skills, ${Object.keys(config.mcpServers).length} MCP servers...`,
    )

    const outputRoot =
      args.target === "opencode"
        ? path.join(os.homedir(), ".config", "opencode")
        : path.join(os.homedir(), ".codex")

    if (args.target === "opencode") {
      await syncToOpenCode(config, outputRoot)
    } else {
      await syncToCodex(config, outputRoot)
    }

    console.log(`✓ Synced to ${args.target}: ${outputRoot}`)
  },
})

function expandHome(value: string): string {
  if (value === "~") return os.homedir()
  if (value.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}
