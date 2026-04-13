import { defineCommand } from "citty"
import path from "path"
import readline from "readline"
import { removeStaleFlatSkills, type CleanupResult } from "../cleanup/legacy-skills"
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

function parseSkipList(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  )
}

function printDisclaimer(): void {
  console.log("")
  console.log("⚠️  Cleanup matches by directory name only.")
  console.log("   Any flat directory whose name matches a plugin skill will be removed,")
  console.log("   regardless of content. If you have user-authored skills that share")
  console.log("   names with plugin skills, exclude them with --skip name1,name2.")
  console.log("")
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    const answer: string = await new Promise((resolve) => {
      rl.question(message, (response) => {
        resolve(response)
      })
    })
    const normalized = answer.trim().toLowerCase()
    return normalized === "y" || normalized === "yes"
  } finally {
    rl.close()
  }
}

type PlannedRemoval = {
  targetName: SyncTargetName
  skillsRoot: string
  pluginNamespace: string
  result: CleanupResult
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
    skip: {
      type: "string",
      description:
        "Comma-separated skill names to preserve (e.g. --skip brainstorming,ce-plan). Protects user-authored skills whose names match plugin skills.",
    },
    yes: {
      type: "boolean",
      default: false,
      description: "Skip the interactive confirmation prompt when running with --execute.",
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

    const execute = Boolean(args.execute)
    const skipNames = parseSkipList(args.skip)
    const autoConfirm = Boolean(args.yes)

    const { home, cwd } = getDefaultSyncRegistryContext()
    const claudeHome = expandHome(args.claudeHome ?? path.join(home, ".claude"))
    const resolvedHome = path.dirname(claudeHome)

    const targetNames = args.target === "all" ? syncTargetNames : [args.target]

    printDisclaimer()

    if (skipNames.size > 0) {
      console.log(`Protecting: ${Array.from(skipNames).sort().join(", ")}`)
      console.log("")
    }

    // Phase 1: discover everything via a dry-run pass, print findings, collect a plan.
    const plan: PlannedRemoval[] = []
    let staleCount = 0
    let protectedCount = 0
    let affectedTargetCount = 0

    for (const targetName of targetNames) {
      const target = getSyncTarget(targetName)
      const skillsRoot = resolveSyncSkillsRoot(target, resolvedHome, cwd)

      if (!skillsRoot) {
        console.log(`Skipping ${targetName}: legacy flat skill cleanup is not supported for this target.`)
        continue
      }

      console.log(`Scanning ${targetName} (${skillsRoot}) ...`)

      let targetHadFindings = false
      for (const pluginNamespace of KNOWN_PLUGIN_NAMESPACES) {
        const result = await removeStaleFlatSkills(skillsRoot, {
          dryRun: true,
          pluginNamespace,
          skip: skipNames,
        })

        if (result.staleEntries.length === 0 && result.protectedEntries.length === 0) continue

        if (!targetHadFindings) {
          targetHadFindings = true
          affectedTargetCount += 1
        }

        for (const entry of result.staleEntries) {
          console.log(`  Would remove: ${entry.path} (${entry.type}, namespaced copy exists)`)
        }
        for (const entry of result.protectedEntries) {
          console.log(`  Protected (--skip): ${entry.path} (${entry.type})`)
        }

        if (result.staleEntries.length > 0) {
          plan.push({ targetName, skillsRoot, pluginNamespace, result })
          staleCount += result.staleEntries.length
        }
        protectedCount += result.protectedEntries.length
      }

      if (!targetHadFindings) {
        console.log("  No stale flat skills found.")
      }
    }

    // Phase 2: decide what to do based on mode + findings.
    if (staleCount === 0) {
      if (protectedCount > 0) {
        console.log(
          `\nNo removable entries. ${protectedCount} ${pluralize(protectedCount, "entry", "entries")} protected by --skip.`,
        )
      } else {
        console.log("\nNo stale flat skill directories found.")
      }
      return
    }

    if (!execute) {
      const summary = `\nFound ${staleCount} stale ${pluralize(staleCount, "entry", "entries")} across ${affectedTargetCount} ${pluralize(affectedTargetCount, "target")}.`
      const protectedSuffix =
        protectedCount > 0
          ? ` ${protectedCount} ${pluralize(protectedCount, "entry", "entries")} protected by --skip.`
          : ""
      console.log(`${summary}${protectedSuffix} Run with --execute to remove.`)
      return
    }

    // Phase 3: confirmation before deletion.
    if (!autoConfirm) {
      const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
      if (!isInteractive) {
        console.error(
          "\nRefusing to run --execute in a non-interactive session without --yes.",
        )
        console.error(
          "Pass --yes to confirm deletion non-interactively, or re-run without --execute to preview.",
        )
        process.exitCode = 1
        return
      }

      console.log("")
      const approved = await confirm(
        `Proceed with deleting ${staleCount} ${pluralize(staleCount, "entry", "entries")}? [y/N] `,
      )
      if (!approved) {
        console.log("Aborted. No changes made.")
        return
      }
    }

    // Phase 4: actually delete.
    console.log("")
    let removedCount = 0
    let skippedCount = 0

    for (const planned of plan) {
      const result = await removeStaleFlatSkills(planned.skillsRoot, {
        dryRun: false,
        pluginNamespace: planned.pluginNamespace,
        skip: skipNames,
      })

      removedCount += result.removed.length
      skippedCount += result.skipped.length

      for (const removedPath of result.removed) {
        console.log(`  Removed: ${removedPath}`)
      }
      for (const skippedPath of result.skipped) {
        console.warn(`  Skipped: ${skippedPath} (failed to remove)`)
      }
    }

    console.log("")
    const summary = `Cleaned up ${removedCount} stale ${pluralize(removedCount, "entry", "entries")} across ${affectedTargetCount} ${pluralize(affectedTargetCount, "target")}.`
    if (skippedCount > 0) {
      console.log(`${summary} ${skippedCount} ${pluralize(skippedCount, "entry", "entries")} could not be removed.`)
      return
    }
    console.log(summary)
  },
})
