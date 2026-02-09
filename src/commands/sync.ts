import { defineCommand } from "citty"
import os from "os"
import path from "path"
import { loadClaudeHome } from "../parsers/claude-home"
import { syncToOpenCode } from "../sync/opencode"
import { syncToCodex } from "../sync/codex"

function isValidTarget(value: string): value is "opencode" | "codex" {
  return value === "opencode" || value === "codex"
}

/** Check if any MCP servers have env vars that might contain secrets */
function hasPotentialSecrets(mcpServers: Record<string, unknown>): boolean {
  const sensitivePatterns = /key|token|secret|password|credential|api_key/i
  for (const server of Object.values(mcpServers)) {
    const env = (server as { env?: Record<string, string> }).env
    if (env) {
      for (const key of Object.keys(env)) {
        if (sensitivePatterns.test(key)) return true
      }
    }
  }
  return false
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
      throw new Error(`Unknown target: ${args.target}. Use 'opencode' or 'codex'.`)
    }

    const claudeHome = expandHome(args.claudeHome ?? path.join(os.homedir(), ".claude"))
    const config = await loadClaudeHome(claudeHome)

    // Warn about potential secrets in MCP env vars
    if (hasPotentialSecrets(config.mcpServers)) {
      console.warn(
        "⚠️  Warning: MCP servers contain env vars that may include secrets (API keys, tokens).\n" +
        "   These will be copied to the target config. Review before sharing the config file.",
      )
    }

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
