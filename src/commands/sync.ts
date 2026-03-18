import { defineCommand } from "citty"
import path from "path"
import { loadClaudeHome } from "../parsers/claude-home"
import {
  getDefaultSyncRegistryContext,
  getSyncTarget,
  isSyncTargetName,
  syncTargetNames,
  type SyncTargetName,
} from "../sync/registry"
import { expandHome } from "../utils/resolve-home"
import { hasPotentialSecrets } from "../utils/secrets"
import { detectInstalledTools } from "../utils/detect-tools"

const validTargets = [...syncTargetNames, "all"] as const
type SyncTarget = SyncTargetName | "all"

function isValidTarget(value: string): value is SyncTarget {
  return value === "all" || isSyncTargetName(value)
}

export default defineCommand({
  meta: {
    name: "sync",
    description: "Sync Claude Code config (~/.claude/) to supported provider configs and skills",
  },
  args: {
    target: {
      type: "string",
      default: "all",
      description: `Target: ${syncTargetNames.join(" | ")} | all (default: all)`,
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

    const { home, cwd } = getDefaultSyncRegistryContext()
    const claudeHome = expandHome(args.claudeHome ?? path.join(home, ".claude"))
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
        const target = getSyncTarget(name as SyncTargetName)
        const outputRoot = target.resolveOutputRoot(home, cwd)
        await target.sync(config, outputRoot)
        console.log(`✓ Synced to ${name}: ${outputRoot}`)
      }
      return
    }

    console.log(
      `Syncing ${config.skills.length} skills, ${config.commands?.length ?? 0} commands, ${Object.keys(config.mcpServers).length} MCP servers...`,
    )

    const target = getSyncTarget(args.target as SyncTargetName)
    const outputRoot = target.resolveOutputRoot(home, cwd)
    await target.sync(config, outputRoot)
    console.log(`✓ Synced to ${args.target}: ${outputRoot}`)
  },
})
