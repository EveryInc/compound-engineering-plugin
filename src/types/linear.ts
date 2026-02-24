/**
 * Type definitions for Linear integration.
 */

export type LinearConfig = {
  teamId: string
  teamKey: string // e.g. "ENG"
  projectId?: string
  apiKey: string
  statusMap: StatusMap
  priorityMap: PriorityMap
}

export type StatusMap = {
  pending: string // Linear state name for "pending" (e.g. "Triage" or "Backlog")
  ready: string // Linear state name for "ready" (e.g. "Todo")
  in_progress: string // Linear state name for in-progress (e.g. "In Progress")
  complete: string // Linear state name for "complete" (e.g. "Done")
  cancelled: string // Linear state name for cancelled (e.g. "Cancelled")
}

export type PriorityMap = {
  p1: number // Linear priority for p1 (1 = Urgent)
  p2: number // Linear priority for p2 (2 = High)
  p3: number // Linear priority for p3 (3 = Normal)
}

export type LinearIssue = {
  id: string
  identifier: string // e.g. "ENG-142"
  title: string
  description?: string
  state: { id: string; name: string }
  priority: number // 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low
  parent?: { id: string; identifier: string }
  children?: { nodes: Array<{ id: string; identifier: string }> }
  comments?: { nodes: LinearComment[] }
  updatedAt: string // ISO timestamp
  createdAt: string
  labels?: { nodes: Array<{ id: string; name: string }> }
}

export type LinearComment = {
  id: string
  body: string
  createdAt: string
  updatedAt: string
  user?: { name: string; displayName: string }
}

export type LinearState = {
  id: string
  name: string
  type: string // "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled"
}

export type LinearTeam = {
  id: string
  name: string
  key: string
}

export type LinearProject = {
  id: string
  name: string
  state: string
}

export type TodoFrontmatter = {
  status: string
  priority: string
  issue_id: string
  tags: string[]
  dependencies: string[]
  linear_id?: string
  linear_synced_at?: string
}

export type PlanFrontmatter = {
  title: string
  type: string
  status: string
  date: string
  linear_issue?: string
  linear_synced_at?: string
}

export type TodoFile = {
  path: string
  frontmatter: TodoFrontmatter
  body: string
}

export type SyncResult = {
  pushed: { created: number; updated: number }
  pulled: { updated: number; comments: number; created: number }
  conflicts: ConflictEntry[]
  skipped: number
  errors: string[]
}

export type ConflictEntry = {
  file: string
  linearId: string
  field: string
  fileValue: string
  linearValue: string
  winner: "file" | "linear"
  reason: string
}

export type StatusEntry = {
  file: string
  linearId?: string
  fileStatus: string
  linearStatus?: string
  filePriority: string
  linearPriority?: number
  inSync: boolean
  direction?: "push" | "pull" | "conflict"
}

export const DEFAULT_STATUS_MAP: StatusMap = {
  pending: "Triage",
  ready: "Todo",
  in_progress: "In Progress",
  complete: "Done",
  cancelled: "Cancelled",
}

export const DEFAULT_PRIORITY_MAP: PriorityMap = {
  p1: 1,
  p2: 2,
  p3: 3,
}
