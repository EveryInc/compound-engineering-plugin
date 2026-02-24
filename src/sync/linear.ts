/**
 * Core bidirectional sync logic between file-based todos and Linear.
 * Pure functions — no CLI concerns.
 */

import path from "path"
import { promises as fs } from "fs"
import { parseFrontmatter, formatFrontmatter } from "../utils/frontmatter"
import { readText, writeText, walkFiles, pathExists, ensureDir } from "../utils/files"
import * as api from "./linear-api"
import type {
  LinearConfig,
  LinearIssue,
  TodoFile,
  TodoFrontmatter,
  PlanFrontmatter,
  SyncResult,
  StatusEntry,
  LinearState,
} from "../types/linear"
import { DEFAULT_STATUS_MAP, DEFAULT_PRIORITY_MAP } from "../types/linear"

export type LoadedFile =
  | { kind: "todo"; file: TodoFile }
  | { kind: "plan"; file: TodoFile; planFrontmatter: PlanFrontmatter }

// ─── File Parsing ────────────────────────────────────────────────

export async function loadTodoFiles(todosDir: string): Promise<TodoFile[]> {
  if (!(await pathExists(todosDir))) return []
  const files = await walkFiles(todosDir)
  const mdFiles = files.filter((f) => f.endsWith(".md"))
  const todos: TodoFile[] = []

  for (const filePath of mdFiles) {
    const raw = await readText(filePath)
    const { data, body } = parseFrontmatter(raw)
    if (!data.status || !data.priority || !data.issue_id) continue

    todos.push({
      path: filePath,
      frontmatter: {
        status: String(data.status),
        priority: String(data.priority),
        issue_id: String(data.issue_id),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        dependencies: Array.isArray(data.dependencies) ? data.dependencies.map(String) : [],
        linear_id: data.linear_id ? String(data.linear_id) : undefined,
        linear_synced_at: data.linear_synced_at ? String(data.linear_synced_at) : undefined,
      },
      body,
    })
  }

  return todos
}

/** Map plan status values to todo-compatible statuses for Linear sync. */
function planStatusToTodoStatus(planStatus: string): string {
  switch (planStatus.toLowerCase()) {
    case "draft":
      return "pending"
    case "active":
      return "in_progress"
    case "completed":
      return "complete"
    default:
      return "pending"
  }
}

/**
 * Load a single file as either a todo or plan for Linear operations.
 * Handles both frontmatter formats: todo (status/priority/issue_id)
 * and plan (title/type/status/date).
 */
export async function loadSingleFile(filePath: string): Promise<LoadedFile | null> {
  if (!(await pathExists(filePath))) return null
  const raw = await readText(filePath)
  const { data, body } = parseFrontmatter(raw)

  // Try as todo first
  if (data.status && data.priority && data.issue_id) {
    return {
      kind: "todo",
      file: {
        path: filePath,
        frontmatter: {
          status: String(data.status),
          priority: String(data.priority),
          issue_id: String(data.issue_id),
          tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
          dependencies: Array.isArray(data.dependencies) ? data.dependencies.map(String) : [],
          linear_id: data.linear_id ? String(data.linear_id) : undefined,
          linear_synced_at: data.linear_synced_at ? String(data.linear_synced_at) : undefined,
        },
        body,
      },
    }
  }

  // Try as plan (has title and type/status)
  if (data.title && data.status) {
    const planFm: PlanFrontmatter = {
      title: String(data.title),
      type: String(data.type ?? "feat"),
      status: String(data.status),
      date: String(data.date ?? new Date().toISOString().split("T")[0]),
      linear_issue: data.linear_issue ? String(data.linear_issue) : undefined,
      linear_synced_at: data.linear_synced_at ? String(data.linear_synced_at) : undefined,
    }

    // Synthesize a TodoFile from the plan for Linear operations
    return {
      kind: "plan",
      planFrontmatter: planFm,
      file: {
        path: filePath,
        frontmatter: {
          status: planStatusToTodoStatus(planFm.status),
          priority: "p3", // plans default to Normal priority
          issue_id: "000", // synthetic — not used for plan push
          tags: [],
          dependencies: [],
          linear_id: planFm.linear_issue,
          linear_synced_at: planFm.linear_synced_at,
        },
        body,
      },
    }
  }

  return null
}

// ─── Mapping Helpers ─────────────────────────────────────────────

export function fileStatusToLinearState(
  status: string,
  states: LinearState[],
  config: LinearConfig,
): LinearState | undefined {
  const map = config.statusMap ?? DEFAULT_STATUS_MAP
  const targetName = (map as Record<string, string>)[status]
  if (!targetName) return undefined
  return states.find(
    (s) => s.name.toLowerCase() === targetName.toLowerCase(),
  )
}

export function linearStateToFileStatus(
  stateName: string,
  config: LinearConfig,
): string | undefined {
  const map = config.statusMap ?? DEFAULT_STATUS_MAP
  for (const [fileStatus, linearName] of Object.entries(map)) {
    if (linearName.toLowerCase() === stateName.toLowerCase()) {
      return fileStatus
    }
  }
  return undefined
}

export function filePriorityToLinear(priority: string, config: LinearConfig): number {
  const map = config.priorityMap ?? DEFAULT_PRIORITY_MAP
  return (map as Record<string, number>)[priority] ?? 3
}

export function linearPriorityToFile(priority: number, _config: LinearConfig): string {
  if (priority <= 1) return "p1"
  if (priority === 2) return "p2"
  return "p3"
}

function extractTitle(body: string): string {
  const match = body.match(/^#\s+(.+)/m)
  return match ? match[1].trim() : "Untitled"
}

// ─── File Mutation Helpers ───────────────────────────────────────

export function renameTodoFile(
  oldPath: string,
  newStatus: string,
  newPriority: string,
): string {
  const dir = path.dirname(oldPath)
  const basename = path.basename(oldPath, ".md")
  const parts = basename.split("-")
  // Format: {issue_id}-{status}-{priority}-{description}
  if (parts.length < 4) return oldPath
  const issueId = parts[0]
  const description = parts.slice(3).join("-")
  return path.join(dir, `${issueId}-${newStatus}-${newPriority}-${description}.md`)
}

export async function updateTodoFrontmatter(
  filePath: string,
  updates: Partial<TodoFrontmatter>,
): Promise<void> {
  const raw = await readText(filePath)
  const { data, body } = parseFrontmatter(raw)
  const merged = { ...data, ...updates }
  if (updates.linear_id !== undefined || updates.linear_synced_at !== undefined) {
    merged.linear_synced_at = updates.linear_synced_at ?? new Date().toISOString()
  }
  await writeText(filePath, formatFrontmatter(merged, body))
}

/** Update a plan file's frontmatter with Linear tracking fields. */
export async function updatePlanFrontmatter(
  filePath: string,
  updates: { linear_issue?: string; linear_synced_at?: string },
): Promise<void> {
  const raw = await readText(filePath)
  const { data, body } = parseFrontmatter(raw)
  const merged = { ...data, ...updates }
  if (updates.linear_issue !== undefined || updates.linear_synced_at !== undefined) {
    merged.linear_synced_at = updates.linear_synced_at ?? new Date().toISOString()
  }
  await writeText(filePath, formatFrontmatter(merged, body))
}

// ─── Push Operations ─────────────────────────────────────────────

export async function pushCreate(
  todo: TodoFile,
  config: LinearConfig,
  states: LinearState[],
  parentLinearId?: string,
  opts?: { skipFileWrite?: boolean },
): Promise<string> {
  const title = extractTitle(todo.body)
  const state = fileStatusToLinearState(todo.frontmatter.status, states, config)
  const priority = filePriorityToLinear(todo.frontmatter.priority, config)

  const issue = await api.createIssue({
    teamId: config.teamId,
    title,
    description: todo.body.trim(),
    priority,
    stateId: state?.id,
    parentId: parentLinearId,
    projectId: config.projectId,
  })

  // Write linear_id back to file (caller can skip for plan files that use linear_issue)
  if (!opts?.skipFileWrite) {
    await updateTodoFrontmatter(todo.path, {
      linear_id: issue.identifier,
      linear_synced_at: new Date().toISOString(),
    } as Partial<TodoFrontmatter>)
  }

  return issue.identifier
}

export async function pushUpdate(
  todo: TodoFile,
  config: LinearConfig,
  states: LinearState[],
): Promise<void> {
  if (!todo.frontmatter.linear_id) return

  const issue = await api.getIssueByIdentifier(todo.frontmatter.linear_id)
  const state = fileStatusToLinearState(todo.frontmatter.status, states, config)
  const priority = filePriorityToLinear(todo.frontmatter.priority, config)
  const title = extractTitle(todo.body)

  const input: Record<string, unknown> = {}
  if (state && state.id !== issue.state.id) input.stateId = state.id
  if (priority !== issue.priority) input.priority = priority
  if (title !== issue.title) input.title = title

  if (Object.keys(input).length > 0) {
    await api.updateIssue(issue.id, input)
  }

  await updateTodoFrontmatter(todo.path, {
    linear_synced_at: new Date().toISOString(),
  } as Partial<TodoFrontmatter>)
}

export async function pushCancel(
  linearId: string,
  states: LinearState[],
  comment?: string,
): Promise<void> {
  const issue = await api.getIssueByIdentifier(linearId)
  const cancelledState = states.find(
    (s) => s.type === "canceled" || s.name.toLowerCase() === "cancelled",
  )
  if (cancelledState) {
    await api.updateIssue(issue.id, { stateId: cancelledState.id })
  }
  if (comment) {
    await api.createComment(issue.id, comment)
  }
}

// ─── Pull Operations ─────────────────────────────────────────────

/** Pull state/priority from a pre-fetched Linear issue into a local file. */
export async function pullStateFromIssue(
  issue: LinearIssue,
  todoPath: string,
  config: LinearConfig,
): Promise<{ changed: boolean; newPath?: string }> {
  const raw = await readText(todoPath)
  const { data, body } = parseFrontmatter(raw)

  const newStatus = linearStateToFileStatus(issue.state.name, config)
  const newPriority = linearPriorityToFile(issue.priority, config)
  const currentStatus = String(data.status)
  const currentPriority = String(data.priority)

  if (newStatus === currentStatus && newPriority === currentPriority) {
    // Still update synced_at timestamp
    const merged = { ...data, linear_synced_at: new Date().toISOString() }
    await writeText(todoPath, formatFrontmatter(merged, body))
    return { changed: false }
  }

  const updates: Partial<TodoFrontmatter> = {}
  let needsRename = false

  if (newStatus && newStatus !== currentStatus) {
    updates.status = newStatus
    needsRename = true
  }
  if (newPriority !== currentPriority) {
    updates.priority = newPriority
    needsRename = true
  }

  updates.linear_synced_at = new Date().toISOString()
  const merged = { ...data, ...updates }
  await writeText(todoPath, formatFrontmatter(merged, body))

  let newPath: string | undefined
  if (needsRename) {
    const finalStatus = updates.status ?? currentStatus
    const finalPriority = updates.priority ?? currentPriority
    newPath = renameTodoFile(todoPath, finalStatus, finalPriority)
    if (newPath !== todoPath) {
      await fs.rename(todoPath, newPath)
    }
  }

  return { changed: true, newPath }
}

/** Pull state/priority from Linear by fetching the issue first. */
export async function pullState(
  linearId: string,
  todoPath: string,
  config: LinearConfig,
): Promise<{ changed: boolean; newPath?: string }> {
  const issue = await api.getIssueByIdentifier(linearId)
  return pullStateFromIssue(issue, todoPath, config)
}

/** Append new comments from a pre-fetched issue into a file's Work Log. */
export async function pullCommentsFromIssue(
  issue: LinearIssue,
  todoPath: string,
  since: string,
): Promise<number> {
  const comments = issue.comments?.nodes ?? []
  const sinceDate = new Date(since)
  const newComments = comments.filter((c) => new Date(c.createdAt) > sinceDate)

  if (newComments.length === 0) return 0

  const raw = await readText(todoPath)
  const { data, body } = parseFrontmatter(raw)

  let appendText = ""
  for (const comment of newComments) {
    const date = comment.createdAt.split("T")[0]
    const author = comment.user?.displayName ?? comment.user?.name ?? "Linear User"
    appendText += `\n### ${date} - Linear Comment\n\n`
    appendText += `**By:** ${author}\n\n`
    appendText += `${comment.body}\n\n---\n`
  }

  const updatedBody = body.trimEnd() + "\n" + appendText
  const merged = { ...data, linear_synced_at: new Date().toISOString() }
  await writeText(todoPath, formatFrontmatter(merged, updatedBody))

  return newComments.length
}

/** Append new comments by fetching the issue first. */
export async function pullComments(
  linearId: string,
  todoPath: string,
  since: string,
): Promise<number> {
  const issue = await api.getIssueByIdentifier(linearId)
  return pullCommentsFromIssue(issue, todoPath, since)
}

export async function pullNewIssues(
  config: LinearConfig,
  todosDir: string,
  existingLinearIds: Set<string>,
  maxExistingId?: number,
): Promise<TodoFile[]> {
  const issues = await api.listIssues({
    teamId: config.teamId,
    projectId: config.projectId,
  })

  const newIssues = issues.filter(
    (issue) => !existingLinearIds.has(issue.identifier),
  )

  if (newIssues.length === 0) return []

  // Determine next issue_id — use passed-in max if available to avoid re-reading
  let maxId = maxExistingId ?? 0
  if (maxId === 0) {
    const existing = await loadTodoFiles(todosDir)
    for (const todo of existing) {
      const num = parseInt(todo.frontmatter.issue_id, 10)
      if (num > maxId) maxId = num
    }
  }

  await ensureDir(todosDir)

  const created: TodoFile[] = []
  for (const issue of newIssues) {
    maxId++
    const issueId = String(maxId).padStart(3, "0")
    const status = linearStateToFileStatus(issue.state.name, config) ?? "pending"
    const priority = linearPriorityToFile(issue.priority, config)
    const slug = issue.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50)

    const filename = `${issueId}-${status}-${priority}-${slug}.md`
    const filePath = path.join(todosDir, filename)

    const frontmatter: TodoFrontmatter = {
      status,
      priority,
      issue_id: issueId,
      tags: issue.labels?.nodes.map((l) => l.name.toLowerCase()) ?? [],
      dependencies: [],
      linear_id: issue.identifier,
      linear_synced_at: new Date().toISOString(),
    }

    const body = `# ${issue.title}\n\n## Problem Statement\n\n${issue.description ?? "Imported from Linear."}\n\n## Work Log\n\n### ${new Date().toISOString().split("T")[0]} - Imported from Linear\n\n**By:** compound-plugin linear sync\n\n**Actions:**\n- Imported ${issue.identifier} from Linear\n- Original state: ${issue.state.name}\n- Original priority: ${issue.priority}\n`

    const content = formatFrontmatter(frontmatter as unknown as Record<string, unknown>, body)
    await writeText(filePath, content)

    created.push({ path: filePath, frontmatter, body })
  }

  return created
}

/** Import a single Linear issue by identifier. Does not pull other issues. */
export async function importSingleIssue(
  identifier: string,
  config: LinearConfig,
  todosDir: string,
): Promise<TodoFile> {
  const issue = await api.getIssueByIdentifier(identifier)

  // Determine next issue_id
  const existing = await loadTodoFiles(todosDir)
  let maxId = 0
  for (const todo of existing) {
    const num = parseInt(todo.frontmatter.issue_id, 10)
    if (num > maxId) maxId = num
  }
  maxId++

  const issueId = String(maxId).padStart(3, "0")
  const status = linearStateToFileStatus(issue.state.name, config) ?? "pending"
  const priority = linearPriorityToFile(issue.priority, config)
  const slug = issue.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)

  const filename = `${issueId}-${status}-${priority}-${slug}.md`
  const filePath = path.join(todosDir, filename)

  const frontmatter: TodoFrontmatter = {
    status,
    priority,
    issue_id: issueId,
    tags: issue.labels?.nodes.map((l) => l.name.toLowerCase()) ?? [],
    dependencies: [],
    linear_id: issue.identifier,
    linear_synced_at: new Date().toISOString(),
  }

  const body = `# ${issue.title}\n\n## Problem Statement\n\n${issue.description ?? "Imported from Linear."}\n\n## Work Log\n\n### ${new Date().toISOString().split("T")[0]} - Imported from Linear\n\n**By:** compound-plugin linear import\n\n**Actions:**\n- Imported ${issue.identifier} from Linear\n- Original state: ${issue.state.name}\n- Original priority: ${issue.priority}\n`

  await ensureDir(todosDir)
  const content = formatFrontmatter(frontmatter as unknown as Record<string, unknown>, body)
  await writeText(filePath, content)

  return { path: filePath, frontmatter, body }
}

// ─── Bidirectional Sync ──────────────────────────────────────────

async function getFileMtime(filePath: string): Promise<Date> {
  const stat = await fs.stat(filePath)
  return stat.mtime
}

export async function syncAll(
  todosDir: string,
  config: LinearConfig,
  opts: { dryRun: boolean },
): Promise<SyncResult> {
  const result: SyncResult = {
    pushed: { created: 0, updated: 0 },
    pulled: { updated: 0, comments: 0, created: 0 },
    conflicts: [],
    skipped: 0,
    errors: [],
  }

  const states = await api.listStates(config.teamId)
  const todos = await loadTodoFiles(todosDir)
  const existingLinearIds = new Set<string>()
  let maxIssueId = 0

  for (const todo of todos) {
    const num = parseInt(todo.frontmatter.issue_id, 10)
    if (num > maxIssueId) maxIssueId = num
  }

  // Process each local file
  for (const todo of todos) {
    if (todo.frontmatter.linear_id) {
      existingLinearIds.add(todo.frontmatter.linear_id)

      try {
        // Fetch the issue once and reuse for state pull + comment pull
        const issue = await api.getIssueByIdentifier(todo.frontmatter.linear_id)
        const syncedAt = todo.frontmatter.linear_synced_at
          ? new Date(todo.frontmatter.linear_synced_at)
          : new Date(0)
        const linearUpdated = new Date(issue.updatedAt)
        const fileMtime = await getFileMtime(todo.path)

        const linearChanged = linearUpdated > syncedAt
        const fileChanged = fileMtime > syncedAt

        if (linearChanged && fileChanged) {
          // Conflict — last write wins
          const winner = linearUpdated > fileMtime ? "linear" : "file"
          const fileStatus = todo.frontmatter.status
          const linearStatus = linearStateToFileStatus(issue.state.name, config) ?? issue.state.name

          if (fileStatus !== linearStatus) {
            result.conflicts.push({
              file: path.basename(todo.path),
              linearId: todo.frontmatter.linear_id,
              field: "status",
              fileValue: fileStatus,
              linearValue: linearStatus,
              winner,
              reason: `${winner === "linear" ? "Linear" : "File"} was modified more recently`,
            })
          }

          if (!opts.dryRun) {
            if (winner === "linear") {
              await pullStateFromIssue(issue, todo.path, config)
              result.pulled.updated++
            } else {
              await pushUpdate(todo, config, states)
              result.pushed.updated++
            }
          }
        } else if (fileChanged && !linearChanged) {
          // Push file changes to Linear
          if (!opts.dryRun) {
            await pushUpdate(todo, config, states)
          }
          result.pushed.updated++
        } else if (linearChanged && !fileChanged) {
          // Pull Linear changes to file
          if (!opts.dryRun) {
            const pullResult = await pullStateFromIssue(issue, todo.path, config)
            if (pullResult.changed) result.pulled.updated++

            // Pull comments using the already-fetched issue
            if (todo.frontmatter.linear_synced_at) {
              const commentPath = pullResult.newPath ?? todo.path
              const commentCount = await pullCommentsFromIssue(
                issue,
                commentPath,
                todo.frontmatter.linear_synced_at,
              )
              result.pulled.comments += commentCount
            }
          } else {
            result.pulled.updated++
          }
        } else {
          result.skipped++
        }
      } catch (err) {
        result.errors.push(
          `Error syncing ${path.basename(todo.path)}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    } else {
      // No linear_id — push-create
      if (!opts.dryRun) {
        try {
          const identifier = await pushCreate(todo, config, states)
          console.log(`  Created ${identifier} for ${path.basename(todo.path)}`)
          result.pushed.created++
        } catch (err) {
          result.errors.push(
            `Error creating Linear issue for ${path.basename(todo.path)}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      } else {
        console.log(`  Would create Linear issue for ${path.basename(todo.path)}`)
        result.pushed.created++
      }
    }
  }

  // Pull new Linear issues that have no local file
  if (!opts.dryRun) {
    try {
      const newTodos = await pullNewIssues(config, todosDir, existingLinearIds, maxIssueId)
      result.pulled.created = newTodos.length
      for (const todo of newTodos) {
        console.log(`  Pulled ${todo.frontmatter.linear_id} → ${path.basename(todo.path)}`)
      }
    } catch (err) {
      result.errors.push(
        `Error pulling new issues: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return result
}

// ─── Status Dashboard ────────────────────────────────────────────

export async function getStatus(
  todosDir: string,
  config: LinearConfig,
): Promise<StatusEntry[]> {
  const todos = await loadTodoFiles(todosDir)
  const entries: StatusEntry[] = []

  for (const todo of todos) {
    const entry: StatusEntry = {
      file: path.basename(todo.path),
      linearId: todo.frontmatter.linear_id,
      fileStatus: todo.frontmatter.status,
      filePriority: todo.frontmatter.priority,
      inSync: true,
    }

    if (todo.frontmatter.linear_id) {
      try {
        const issue = await api.getIssueByIdentifier(todo.frontmatter.linear_id)
        entry.linearStatus = issue.state.name
        entry.linearPriority = issue.priority

        const expectedStatus = linearStateToFileStatus(issue.state.name, config)
        const expectedPriority = linearPriorityToFile(issue.priority, config)

        if (expectedStatus !== todo.frontmatter.status || expectedPriority !== todo.frontmatter.priority) {
          entry.inSync = false

          const syncedAt = todo.frontmatter.linear_synced_at
            ? new Date(todo.frontmatter.linear_synced_at)
            : new Date(0)
          const linearUpdated = new Date(issue.updatedAt)
          const fileMtime = await getFileMtime(todo.path)

          if (fileMtime > syncedAt && linearUpdated <= syncedAt) {
            entry.direction = "push"
          } else if (linearUpdated > syncedAt && fileMtime <= syncedAt) {
            entry.direction = "pull"
          } else {
            entry.direction = "conflict"
          }
        }
      } catch {
        entry.inSync = false
        entry.linearStatus = "ERROR"
      }
    } else {
      entry.inSync = false
      entry.direction = "push"
    }

    entries.push(entry)
  }

  return entries
}

// ─── Config Resolution ───────────────────────────────────────────

export async function resolveConfig(projectRoot?: string): Promise<LinearConfig> {
  const apiKey = process.env.LINEAR_API_KEY
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY not set")
  }

  let teamId = process.env.LINEAR_TEAM_ID ?? ""
  let teamKey = process.env.LINEAR_TEAM_KEY ?? ""
  let projectId = process.env.LINEAR_PROJECT_ID

  // Try to read from compound-engineering.local.md
  if (projectRoot) {
    const localPath = path.join(projectRoot, "compound-engineering.local.md")
    if (await pathExists(localPath)) {
      const raw = await readText(localPath)
      const { data } = parseFrontmatter(raw)
      if (data.linear_team_id) teamId = String(data.linear_team_id)
      if (data.linear_team_key) teamKey = String(data.linear_team_key)
      if (data.linear_project_id) projectId = String(data.linear_project_id)
    }
  }

  // Auto-detect team if not configured
  if (!teamId || !teamKey) {
    const teams = await api.listTeams()
    if (teams.length === 1) {
      teamId = teams[0].id
      teamKey = teams[0].key
    } else if (teams.length > 1) {
      console.log("Multiple teams found. Set LINEAR_TEAM_ID or linear_team_id in compound-engineering.local.md:")
      for (const team of teams) {
        console.log(`  ${team.key}: ${team.name} (${team.id})`)
      }
      throw new Error("Multiple teams found — please specify which one to use")
    } else {
      throw new Error("No teams found in your Linear workspace")
    }
  }

  return {
    teamId,
    teamKey,
    projectId,
    apiKey,
    statusMap: DEFAULT_STATUS_MAP,
    priorityMap: DEFAULT_PRIORITY_MAP,
  }
}
