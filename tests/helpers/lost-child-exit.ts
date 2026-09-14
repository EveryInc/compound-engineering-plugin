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
  // spawnSync's own timeout kill leaves no status and no output. A signal with
  // output attached (an OOM kill mid-run, a deliberate kill) is a real failure.
  const noOutput = !result.stdout && !result.stderr
  if ((result.signal === "SIGKILL" || result.signal === "SIGTERM") && (result.status == null || result.status === -1)) {
    return noOutput
  }
  // CI bun 1.4.2 returns status 120 for the 5s babysit spawnSync timeout, with
  // empty stdout and either empty stderr or bun's own "killed N dangling
  // process" line. A real exit 120 that printed its own output is a real failure.
  const empty = !result.stdout && !result.stderr
  if (result.status === 120) {
    return !result.stdout && (!result.stderr || /^killed \d+ dangling process(es)?\s*$/.test(result.stderr))
  }
  return empty && (result.status == null || result.status === -1)
}

export function throwLostChildExit(argv: string[]): never {
  const err = new Error(`${argv.join(" ")}: spawnSync timed out or lost child-exit`)
  err.name = "TimeoutError"
  throw err
}
