/** True while a process with this pid exists and is signalable by us. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
