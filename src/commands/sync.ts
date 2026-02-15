import { defineCommand } from "citty"
import os from "os"
import path from "path"
import { loadClaudeHome } from "../parsers/claude-home"
import { syncToOpenCode } from "../sync/opencode"
import { syncToCodex } from "../sync/codex"
import { syncToPi } from "../sync/pi"
import { syncToDroid } from "../sync/droid"
import { syncToCursor } from "../sync/cursor"
import { syncToGemini } from "../sync/gemini"
import { expandHome } from "../utils/resolve-home"
import { detectInstalledTools } from "../utils/detect-tools"

const validTargets = ["opencode", "codex", "pi", "droid", "cursor", "gemini", "all"] as const
type SyncTarget = (typeof validTargets)[number]

function isValidTarget(value: string): value is SyncTarget {
  return (validTargets as readonly string[]).includes(value)
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

function resolveOutputRoot(target: string): string {
  switch (target) {
    case "opencode":
      return path.join(os.homedir(), ".config", "opencode")
    case "codex":
      return path.join(os.homedir(), ".codex")
    case "pi":
      return path.join(os.homedir(), ".pi", "agent")
    case "droid":
      return path.join(os.homedir(), ".factory")
    case "cursor":
      return path.join(process.cwd(), ".cursor")
    case "gemini":
      return path.join(process.cwd(), ".gemini")
    default:
      throw new Error(`No output root for target: ${target}`)
  }
}

async function syncTarget(target: string, config: Awaited<ReturnType<typeof loadClaudeHome>>, outputRoot: string): Promise<void> {
  switch (target) {
    case "opencode":
      await syncToOpenCode(config, outputRoot)
      break
    case "codex":
      await syncToCodex(config, outputRoot)
      break
    case "pi":
      await syncToPi(config, outputRoot)
      break
    case "droid":
      await syncToDroid(config, outputRoot)
      break
    case "cursor":
      await syncToCursor(config, outputRoot)
      break
    case "gemini":
      await syncToGemini(config, outputRoot)
      break
  }
}

export default defineCommand({
  meta: {
    name: "sync",
    description: "Sync Claude Code config (~/.claude/) to OpenCode, Codex, Pi, Droid, Cursor, or Gemini",
  },
  args: {
    target: {
      type: "string",
      required: true,
      description: "Target: opencode | codex | pi | droid | cursor | gemini | all",
    },
    claudeHome: {
      type: "string",
      alias: "claude-home",
      description: "Path to Claude home (default: ~/.claude)",
    },
  },
  async run({ args }) {
    if (!isValidTarget(args.target)) {
      throw new Error(`Unknown target: ${args.target}. Use one of: ${validTargets.join(", ")}`)
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

    if (args.target === "all") {
      const detected = await detectInstalledTools()
      const activeTargets = detected.filter((t) => t.detected).map((t) => t.name)

      if (activeTargets.length === 0) {
        console.log("No AI coding tools detected.")
        return
      }

      console.log(`Syncing to ${activeTargets.length} detected tool(s)...`)
      for (const tool of detected) {
        console.log(`  ${tool.detected ? "✓" : "✗"} ${tool.name} — ${tool.reason}`)
      }

      for (const name of activeTargets) {
        const outputRoot = resolveOutputRoot(name)
        await syncTarget(name, config, outputRoot)
        console.log(`✓ Synced to ${name}: ${outputRoot}`)
      }
      return
    }

    console.log(
      `Syncing ${config.skills.length} skills, ${Object.keys(config.mcpServers).length} MCP servers...`,
    )

    const outputRoot = resolveOutputRoot(args.target)
    await syncTarget(args.target, config, outputRoot)
    console.log(`✓ Synced to ${args.target}: ${outputRoot}`)
  },
})
