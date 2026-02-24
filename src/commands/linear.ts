/**
 * CLI subcommand: compound-plugin linear
 *
 * Bidirectional sync between file-based todos and Linear.
 */

import { defineCommand } from "citty"
import path from "path"
import { hasApiKey } from "../sync/linear-api"
import * as api from "../sync/linear-api"
import {
  syncAll,
  getStatus,
  pushCreate,
  pushUpdate,
  pushCancel,
  pullState,
  pullComments,
  pullNewIssues,
  importSingleIssue,
  loadTodoFiles,
  loadSingleFile,
  updatePlanFrontmatter,
  resolveConfig,
} from "../sync/linear"

function checkApiKey(): boolean {
  if (!hasApiKey()) {
    console.log("LINEAR_API_KEY not set — skipping Linear operations.")
    console.log("Get your key from Linear Settings → API → Personal API keys.")
    return false
  }
  return true
}

// ─── Subcommands ─────────────────────────────────────────────────

const syncCommand = defineCommand({
  meta: { name: "sync", description: "Bidirectional sync between file todos and Linear" },
  args: {
    "todos-dir": {
      type: "string",
      default: "./todos",
      description: "Path to todos directory",
    },
    "dry-run": {
      type: "boolean",
      default: false,
      description: "Show what would change without applying",
    },
  },
  async run({ args }) {
    if (!checkApiKey()) return
    const config = await resolveConfig(process.cwd())
    const todosDir = path.resolve(args["todos-dir"])
    const dryRun = args["dry-run"]

    console.log(`Syncing ${todosDir} ↔ Linear (team: ${config.teamKey})...`)
    if (dryRun) console.log("  (dry run — no changes will be applied)")

    const result = await syncAll(todosDir, config, { dryRun })

    console.log("\nSync complete:")
    console.log(`  Pushed: ${result.pushed.created} created, ${result.pushed.updated} updated`)
    console.log(`  Pulled: ${result.pulled.created} new files, ${result.pulled.updated} updated, ${result.pulled.comments} comments`)
    console.log(`  In sync: ${result.skipped}`)

    if (result.conflicts.length > 0) {
      console.log(`\n  Conflicts resolved (${result.conflicts.length}):`)
      for (const c of result.conflicts) {
        console.log(`    ${c.file} [${c.field}]: file="${c.fileValue}" linear="${c.linearValue}" → winner: ${c.winner}`)
      }
    }

    if (result.errors.length > 0) {
      console.log(`\n  Errors (${result.errors.length}):`)
      for (const e of result.errors) {
        console.log(`    ${e}`)
      }
    }
  },
})

const pushCommand = defineCommand({
  meta: { name: "push", description: "Push local changes to Linear" },
  args: {
    "todos-dir": {
      type: "string",
      default: "./todos",
      description: "Path to todos directory",
    },
    file: {
      type: "string",
      description: "Push a specific file only",
    },
  },
  async run({ args }) {
    if (!checkApiKey()) return
    const config = await resolveConfig(process.cwd())
    const states = await api.listStates(config.teamId)

    if (args.file) {
      const filePath = path.resolve(args.file)
      const loaded = await loadSingleFile(filePath)
      if (!loaded) {
        console.error(`File not found or unrecognized format: ${filePath}`)
        process.exit(1)
      }
      if (loaded.file.frontmatter.linear_id) {
        await pushUpdate(loaded.file, config, states)
        console.log(`Updated ${loaded.file.frontmatter.linear_id}`)
      } else {
        const isPlan = loaded.kind === "plan"
        const id = await pushCreate(
          loaded.file, config, states, undefined,
          isPlan ? { skipFileWrite: true } : undefined,
        )
        if (isPlan) {
          await updatePlanFrontmatter(filePath, {
            linear_issue: id,
            linear_synced_at: new Date().toISOString(),
          })
        }
        console.log(`Created ${id} for ${path.basename(filePath)}`)
      }
    } else {
      const todosDir = path.resolve(args["todos-dir"])
      const todos = await loadTodoFiles(todosDir)
      let created = 0
      let updated = 0
      for (const todo of todos) {
        if (todo.frontmatter.linear_id) {
          await pushUpdate(todo, config, states)
          updated++
        } else {
          const id = await pushCreate(todo, config, states)
          console.log(`  Created ${id} for ${path.basename(todo.path)}`)
          created++
        }
      }
      console.log(`Push complete: ${created} created, ${updated} updated`)
    }
  },
})

const pullCommand = defineCommand({
  meta: { name: "pull", description: "Pull Linear changes into local files" },
  args: {
    "todos-dir": {
      type: "string",
      default: "./todos",
      description: "Path to todos directory",
    },
  },
  async run({ args }) {
    if (!checkApiKey()) return
    const config = await resolveConfig(process.cwd())
    const todosDir = path.resolve(args["todos-dir"])
    const todos = await loadTodoFiles(todosDir)

    let updated = 0
    let comments = 0
    const existingIds = new Set<string>()

    for (const todo of todos) {
      if (!todo.frontmatter.linear_id) continue
      existingIds.add(todo.frontmatter.linear_id)

      const { changed, newPath } = await pullState(todo.frontmatter.linear_id, todo.path, config)
      if (changed) {
        console.log(`  Updated ${path.basename(newPath ?? todo.path)}`)
        updated++
      }

      if (todo.frontmatter.linear_synced_at) {
        const commentPath = newPath ?? todo.path
        const count = await pullComments(
          todo.frontmatter.linear_id,
          commentPath,
          todo.frontmatter.linear_synced_at,
        )
        comments += count
      }
    }

    // Pull new issues
    const newTodos = await pullNewIssues(config, todosDir, existingIds)
    for (const todo of newTodos) {
      console.log(`  Created ${path.basename(todo.path)} from ${todo.frontmatter.linear_id}`)
    }

    console.log(`Pull complete: ${newTodos.length} new, ${updated} updated, ${comments} comments`)
  },
})

const statusCommand = defineCommand({
  meta: { name: "status", description: "Show sync status between file todos and Linear" },
  args: {
    "todos-dir": {
      type: "string",
      default: "./todos",
      description: "Path to todos directory",
    },
  },
  async run({ args }) {
    if (!checkApiKey()) return
    const config = await resolveConfig(process.cwd())
    const todosDir = path.resolve(args["todos-dir"])
    const entries = await getStatus(todosDir, config)

    if (entries.length === 0) {
      console.log("No todo files found.")
      return
    }

    console.log("File                                          | Linear      | Status     | Priority  | Sync")
    console.log("----------------------------------------------|-------------|------------|-----------|------")

    for (const entry of entries) {
      const file = entry.file.padEnd(45)
      const linear = (entry.linearId ?? "—").padEnd(11)
      const status = `${entry.fileStatus}/${entry.linearStatus ?? "—"}`.padEnd(10)
      const prio = `${entry.filePriority}/${entry.linearPriority ?? "—"}`.padEnd(9)
      const sync = entry.inSync ? "✓" : `✗ ${entry.direction ?? ""}`
      console.log(`${file} | ${linear} | ${status} | ${prio} | ${sync}`)
    }

    const inSync = entries.filter((e) => e.inSync).length
    const outOfSync = entries.length - inSync
    console.log(`\n${inSync} in sync, ${outOfSync} need attention`)
  },
})

const importCommand = defineCommand({
  meta: { name: "import", description: "Import a Linear issue as a local todo file" },
  args: {
    identifier: {
      type: "positional",
      required: true,
      description: "Linear issue identifier (e.g. ENG-123)",
    },
    "todos-dir": {
      type: "string",
      default: "./todos",
      description: "Path to todos directory",
    },
  },
  async run({ args }) {
    if (!checkApiKey()) return
    const config = await resolveConfig(process.cwd())
    const todosDir = path.resolve(args["todos-dir"])

    // Check if already imported
    const existingTodos = await loadTodoFiles(todosDir)
    const existing = existingTodos.find((t) => t.frontmatter.linear_id === args.identifier)
    if (existing) {
      console.log(`Issue ${args.identifier} already exists: ${path.basename(existing.path)}`)
      return
    }

    // Import only the single requested issue
    const imported = await importSingleIssue(args.identifier, config, todosDir)
    console.log(`Imported ${args.identifier} → ${path.basename(imported.path)}`)
  },
})

const createCommand = defineCommand({
  meta: { name: "create", description: "Create a Linear issue from a todo or plan file" },
  args: {
    file: {
      type: "positional",
      required: true,
      description: "Path to the todo or plan file",
    },
    parent: {
      type: "string",
      description: "Parent Linear issue identifier for sub-issues",
    },
  },
  async run({ args }) {
    if (!checkApiKey()) return
    const config = await resolveConfig(process.cwd())
    const states = await api.listStates(config.teamId)
    const filePath = path.resolve(args.file)

    const loaded = await loadSingleFile(filePath)
    if (!loaded) {
      console.error(`File not found or unrecognized format: ${filePath}`)
      process.exit(1)
    }

    const existingId = loaded.file.frontmatter.linear_id
    if (existingId) {
      console.log(`Already linked to ${existingId}`)
      return
    }

    let parentLinearId: string | undefined
    if (args.parent) {
      const parentIssue = await api.getIssueByIdentifier(args.parent)
      parentLinearId = parentIssue.id
    }

    const isPlan = loaded.kind === "plan"
    const identifier = await pushCreate(
      loaded.file, config, states, parentLinearId,
      isPlan ? { skipFileWrite: true } : undefined,
    )

    // Write back the correct field based on file type
    if (isPlan) {
      await updatePlanFrontmatter(filePath, {
        linear_issue: identifier,
        linear_synced_at: new Date().toISOString(),
      })
    }
    // For todos, pushCreate already writes linear_id back

    console.log(`Created ${identifier} for ${path.basename(filePath)}`)
  },
})

const cancelCommand = defineCommand({
  meta: { name: "cancel", description: "Mark a Linear issue as cancelled" },
  args: {
    linearId: {
      type: "positional",
      required: true,
      description: "Linear issue identifier (e.g. ENG-123)",
    },
    comment: {
      type: "string",
      description: "Optional comment explaining cancellation",
    },
  },
  async run({ args }) {
    if (!checkApiKey()) return
    const config = await resolveConfig(process.cwd())
    const states = await api.listStates(config.teamId)

    await pushCancel(args.linearId, states, args.comment)
    console.log(`Cancelled ${args.linearId}`)
  },
})

const configCommand = defineCommand({
  meta: { name: "config", description: "Show resolved Linear configuration" },
  args: {},
  async run() {
    if (!checkApiKey()) return
    try {
      const config = await resolveConfig(process.cwd())
      console.log("Resolved Linear configuration:")
      console.log(`  Team: ${config.teamKey} (${config.teamId})`)
      console.log(`  Project: ${config.projectId ?? "(none)"}`)
      console.log(`  Status mapping:`)
      for (const [file, linear] of Object.entries(config.statusMap)) {
        console.log(`    ${file} → ${linear}`)
      }
      console.log(`  Priority mapping:`)
      for (const [file, linear] of Object.entries(config.priorityMap)) {
        console.log(`    ${file} → ${linear}`)
      }
    } catch (err) {
      console.error(`Config error: ${err instanceof Error ? err.message : String(err)}`)
    }
  },
})

// ─── Main Command ────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "linear",
    description: "Bidirectional sync between file-based todos and Linear",
  },
  subCommands: {
    sync: () => syncCommand,
    push: () => pushCommand,
    pull: () => pullCommand,
    status: () => statusCommand,
    import: () => importCommand,
    create: () => createCommand,
    cancel: () => cancelCommand,
    config: () => configCommand,
  },
})
