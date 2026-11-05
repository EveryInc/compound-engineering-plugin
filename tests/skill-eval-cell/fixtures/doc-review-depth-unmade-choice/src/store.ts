import fs from "node:fs"

export type Task = { id: number; title: string; done: boolean; completedAt?: string }

export function loadTasks(): Task[] {
  return JSON.parse(fs.readFileSync(".tasks.json", "utf8")) as Task[]
}
