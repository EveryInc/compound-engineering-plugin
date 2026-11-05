import fs from "node:fs"

export type Task = { id: number; title: string; done: boolean }

export function loadTasks(): Task[] {
  return JSON.parse(fs.readFileSync(".tasks.json", "utf8")) as Task[]
}

export function saveTasks(tasks: Task[]): void {
  fs.writeFileSync(".tasks.json", JSON.stringify(tasks))
}

export function archiveDone(tasks: Task[]): Task[] {
  const kept = tasks.filter((t) => !t.done)
  fs.appendFileSync(".archive.json", JSON.stringify(tasks.filter((t) => t.done)))
  return kept
}
