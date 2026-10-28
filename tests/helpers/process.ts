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

/**
 * Returns the pids still alive once all have exited or `timeoutMs` passes.
 * A process SIGKILLed just before its killer exits can still be running for a
 * moment on a loaded runner; checking at one instant flakes, so poll instead.
 */
export async function survivors(pids: number[], timeoutMs = 5_000): Promise<number[]> {
  const deadline = Date.now() + timeoutMs
  let left = pids.filter(alive)
  while (left.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    left = left.filter(alive)
  }
  return left
}
