import { defineCommand } from "citty"
import path from "path"
import { removeStaleFlatSkills } from "../cleanup/legacy-skills"
import {
  getDefaultSyncRegistryContext,
  getSyncTarget,
  isSyncTargetName,
  resolveSyncSkillsRoot,
  syncTargetNames,
  type SyncTargetName,
} from "../sync/registry"
import { KNOWN_PLUGIN_NAMESPACES } from "../utils/plugin-namespace"
import { expandHome } from "../utils/resolve-home"

const validTargets = [...syncTargetNames, "all"] as const
type CleanupTarget = SyncTargetName | "all"

function isValidTarget(value: string): value is CleanupTarget {
  return value === "all" || isSyncTargetName(value)
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural
}

export default defineCommand({
  meta: {
    name: "cleanup",
    description: "Clean up legacy flat skill directories replaced by namespaced installs",
  },
  args: {
    target: {
      type: "string",
      default: "all",
      description: `Target: ${syncTargetNames.join(" | ")} | all (default: all)`,
    },
    execute: {
      type: "boolean",
      default: false,
      description: "Remove stale entries instead of running a dry-run",
    },
    dryRun: {
      type: "boolean",
      alias: "dry-run",
      default: false,
      description: "Explicitly run in dry-run mode (default behavior)",
    },
    claudeHome: {
      type: "string",
      alias: "claude-home",
      description: "Path to Claude home (default: ~/.claude)",
    },
  },
  async run({ args }) {
    if (!isValidTarget(args.target)) {
      throw new Error(`Unknown target: ${args.target}. Expected one of: ${validTargets.join(", ")}`)
    }

    if (args.execute && args.dryRun) {
      throw new Error("Cannot pass both --execute and --dry-run.")
    }

    const execute = Boolean(args.execute) && !Boolean(args.dryRun)
    const dryRun = !execute

    const { home, cwd } = getDefaultSyncRegistryContext()
    const claudeHome = expandHome(args.claudeHome ?? path.join(home, ".claude"))
    const resolvedHome = path.dirname(claudeHome)

    const targetNames = args.target === "all" ? syncTargetNames : [args.target]

    let staleCount = 0
    let removedCount = 0
    let skippedCount = 0
    let affectedTargetCount = 0

    for (const targetName of targetNames) {
      const target = getSyncTarget(targetName)
      const skillsRoot = resolveSyncSkillsRoot(target, resolvedHome, cwd)

      if (!skillsRoot) {
        console.log(`Skipping ${targetName}: legacy flat skill cleanup is not supported for this target.`)
        continue
      }

      console.log(`Scanning ${targetName} (${skillsRoot}) ...`)

      let targetHadStale = false
      for (const pluginNamespace of KNOWN_PLUGIN_NAMESPACES) {
        const result = await removeStaleFlatSkills(skillsRoot, {
          dryRun,
          target: targetName,
          pluginNamespace,
        })

        if (result.staleEntries.length === 0) continue

        if (!targetHadStale) {
          targetHadStale = true
          affectedTargetCount += 1
        }
        staleCount += result.staleEntries.length
        removedCount += result.removed.length
        skippedCount += result.skipped.length
        const removedPaths = new Set(result.removed)

        for (const entry of result.staleEntries) {
          if (dryRun) {
            console.log(`  Would remove: ${entry.path} (${entry.type}, namespaced copy exists)`)
          } else if (removedPaths.has(entry.path)) {
            console.log(`  Removed: ${entry.path}`)
          }
        }

        for (const skippedPath of result.skipped) {
          console.warn(`  Skipped: ${skippedPath} (failed to remove)`)
        }
      }

      if (!targetHadStale) {
        console.log("  No stale flat skills found.")
      }
    }

    if (dryRun) {
      if (staleCount === 0) {
        console.log("No stale flat skill directories found.")
        return
      }

      console.log(
        `Found ${staleCount} stale ${pluralize(staleCount, "entry", "entries")} across ${affectedTargetCount} ${pluralize(affectedTargetCount, "target")}. Run with --execute to remove.`,
      )
      return
    }

    if (staleCount === 0) {
      console.log("No stale flat skill directories found.")
      return
    }

    const summary = `Cleaned up ${removedCount} stale ${pluralize(removedCount, "entry", "entries")} across ${affectedTargetCount} ${pluralize(affectedTargetCount, "target")}.`
    if (skippedCount > 0) {
      console.log(`${summary} ${skippedCount} ${pluralize(skippedCount, "entry", "entries")} could not be removed.`)
      return
    }

    console.log(summary)
  },
})
