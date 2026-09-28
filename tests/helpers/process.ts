import { spawnSync } from "node:child_process"

/**
 * True while a process with this pid is running. A zombie counts as gone:
 * kill(pid, 0) still succeeds for one, and a container whose PID 1 does not
 * reap adopted orphans can leave a killed process as a zombie indefinitely.
 */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  const state = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" })
  if (state.status !== 0 && !state.stdout?.trim()) return false
  return !state.stdout.trim().startsWith("Z")
}
