import { loadTasks } from "../store"

export function listCommand(argv: string[]): string {
  const tasks = loadTasks()
  const done = argv.includes("--done")
  return tasks
    .filter((t) => (done ? t.done : !t.done))
    .map((t) => `${t.id}\t${t.title}`)
    .join("\n")
}
