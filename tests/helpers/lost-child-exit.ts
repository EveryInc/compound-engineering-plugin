/** bun#34069: spawnSync timeout after a lost child-exit. Must be TimeoutError so run-tests.ts can re-run. */
export function isLostChildExit(result: {
  status: number | null
  signal: NodeJS.Signals | null
  error?: { code?: string } | Error | null
  stdout?: string | null
  stderr?: string | null
}): boolean {
  const timedOut = Boolean(result.error && "code" in result.error && result.error.code === "ETIMEDOUT")
  if (timedOut) return true
  if ((result.signal === "SIGKILL" || result.signal === "SIGTERM") && (result.status == null || result.status === -1)) {
    return true
  }
  // CI bun 1.4.2 has returned this as the 5s babysit spawnSync timeout status.
  if (result.status === 120) return true
  const empty = !result.stdout && !result.stderr
  return empty && (result.status == null || result.status === -1)
}

export function throwLostChildExit(argv: string[]): never {
  const err = new Error(`${argv.join(" ")}: spawnSync timed out or lost child-exit`)
  err.name = "TimeoutError"
  throw err
}
