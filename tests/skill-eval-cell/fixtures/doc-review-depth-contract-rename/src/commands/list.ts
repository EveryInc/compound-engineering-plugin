import { loadTasks } from "../store"

export function listCommand(argv: string[]): string {
  const tasks = loadTasks()
  const done = argv.includes("--done")
  const shown = tasks.filter((t) => (done ? t.done : !t.done))
  if (argv.includes("--json")) return JSON.stringify(shown.map(({ id, title, done }) => ({ id, title, done })))
  return shown.map((t) => `${t.id}\t${t.title}`).join("\n")
}
