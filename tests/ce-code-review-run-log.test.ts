import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { spawnSync } from "node:child_process"
import { describe, expect, setDefaultTimeout, test } from "bun:test"

// Per-stage cost instrumentation for ce-code-review (plan 2026-09-15-1322, U6).
// The script is the only writer of stages.jsonl and the last writer of
// metadata.json; these tests pin the contract the references name.

// Each test launches Python several times; a loaded runner crosses the 5s default.
setDefaultTimeout(20_000)

const SCRIPT = path.join(process.cwd(), "skills", "ce-code-review", "scripts", "run-log.py")

// Every host attestation variable run-log.py recognizes; the suite may itself
// run inside one of these hosts, so the unknown-host test must clear them all.
const HOST_ATTESTATION_VARS = [
  "CLAUDECODE",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CODEX_SESSION_ID",
  "CODEX_THREAD_ID",
  "CODEX_CI",
  "GROK_AGENT",
  "GROK_SESSION_ID",
  "CURSOR_AGENT",
  "CURSOR_CONVERSATION_ID",
  "OPENCODE_TERMINAL",
]

function hostlessEnv(overrides: Record<string, string> = {}) {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const name of HOST_ATTESTATION_VARS) delete env[name]
  return { ...env, ...overrides }
}

function runLog(runDir: string, ...args: string[]) {
  const result = spawnSync("python3", [SCRIPT, ...args, "--run-dir", runDir], {
    encoding: "utf8",
    env: hostlessEnv(),
  })
  expect(result.status, result.stderr).toBe(0)
  return result
}

function freshRunDir() {
  return mkdtempSync(path.join(tmpdir(), "ce-run-log-"))
}

function metadata(runDir: string) {
  return JSON.parse(readFileSync(path.join(runDir, "metadata.json"), "utf8"))
}

describe("ce-code-review run-log", () => {
  test("a stage boundary in one call records an end and a start with an elapsed time", async () => {
    const dir = freshRunDir()
    runLog(dir, "event", "--start", "scope")
    await Bun.sleep(30)
    runLog(dir, "event", "--end", "scope", "--start", "select", "--fact", "exec_nontest_lines=12", "--fact", 'size_band="small"')
    const lines = readFileSync(path.join(dir, "stages.jsonl"), "utf8").trim().split("\n")
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[1])).toMatchObject({ stage: "scope", phase: "end", facts: { exec_nontest_lines: 12, size_band: "small" } })
    expect(JSON.parse(lines[2])).toMatchObject({ stage: "select", phase: "start" })

    runLog(dir, "summarize")
    const cost = metadata(dir).cost
    const scope = cost.stages.find((s: { stage: string }) => s.stage === "scope")
    expect(scope.elapsed_seconds).toBeGreaterThan(0)
    expect(scope.elapsed_seconds).toBeLessThan(5)
    expect(cost.scope).toEqual({ exec_nontest_lines: 12, size_band: "small" })
  })

  test("summarize merges into an existing metadata.json and leaves its fields unchanged", () => {
    const dir = freshRunDir()
    const existing = { run_id: "r1", branch: "b", head_sha: "abc", verdict: "Ready to merge", completed_at: "2026-09-15T00:00:00Z" }
    writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(existing))
    runLog(dir, "event", "--start", "scope")
    runLog(dir, "event", "--end", "scope", "--start", "review")
    runLog(dir, "event", "--end", "review", "--start", "receipt")
    runLog(dir, "event", "--end", "receipt")
    runLog(dir, "summarize")
    const meta = metadata(dir)
    for (const [k, v] of Object.entries(existing)) expect(meta[k]).toBe(v)
    expect(meta.cost.status).toBe("complete")
    expect(meta.cost.stages.map((s: { stage: string }) => s.stage)).toEqual(["scope", "review", "receipt"])
  })

  test("a truncated trailing line is counted, not fatal, and a dangling start makes the run partial", () => {
    const dir = freshRunDir()
    runLog(dir, "event", "--start", "scope")
    runLog(dir, "event", "--end", "scope", "--start", "dispatch", "--reviewers", "4")
    runLog(dir, "event", "--end", "dispatch", "--start", "merge", "--candidates", "9")
    appendFileSync(path.join(dir, "stages.jsonl"), '{"ts": "2026-09-15T00:00:00+00:00", "stage": "mer')
    runLog(dir, "summarize")
    const cost = metadata(dir).cost
    expect(cost.truncated_events).toBe(1)
    expect(cost.status).toBe("partial")
    expect(cost.dangling_stages).toEqual(["merge"])
    expect(cost.totals.reviewers).toBe(4)
    expect(cost.totals.candidates).toBe(9)
  })

  test("total candidates count only producing stages, not the merge and validate filters", () => {
    const dir = freshRunDir()
    runLog(dir, "event", "--start", "dispatch")
    runLog(dir, "event", "--end", "dispatch", "--start", "merge", "--candidates", "12")
    runLog(dir, "event", "--end", "merge", "--start", "validate", "--candidates", "5")
    runLog(dir, "event", "--end", "validate", "--start", "report", "--candidates", "2")
    runLog(dir, "event", "--end", "report")
    runLog(dir, "summarize")
    const cost = metadata(dir).cost
    expect(cost.totals.candidates).toBe(12)
    expect(cost.stages.find((s: { stage: string }) => s.stage === "merge").candidates).toBe(5)
  })

  test("summarize with no stage log writes an unavailable cost block and still exits 0", () => {
    const dir = freshRunDir()
    runLog(dir, "summarize")
    const cost = metadata(dir).cost
    expect(cost.status).toBe("unavailable")
    expect(cost.reason).toMatch(/no stage log/)
  })

  test("tokens are optional and a peer usage file is folded under peer", () => {
    const dir = freshRunDir()
    writeFileSync(path.join(dir, "adversarial-codex-usage.json"), JSON.stringify({ input_tokens: 1200, output_tokens: 40 }))
    runLog(dir, "event", "--start", "peer")
    runLog(dir, "event", "--end", "peer", "--start", "report", "--tokens", "555")
    runLog(dir, "event", "--end", "report")
    runLog(dir, "summarize")
    const cost = metadata(dir).cost
    expect(cost.peer).toMatchObject({ provider: "codex", input_tokens: 1200, output_tokens: 40 })
    expect(cost.totals.tokens).toBe(555)
    const peer = cost.stages.find((s: { stage: string }) => s.stage === "peer")
    expect(peer.tokens).toBe(555)
    expect(cost.stages.find((s: { stage: string }) => s.stage === "report").tokens).toBeUndefined()
  })

  test("an explicit zero token count stays in the totals", () => {
    const dir = freshRunDir()
    runLog(dir, "event", "--start", "peer")
    runLog(dir, "event", "--end", "peer", "--start", "receipt", "--tokens", "0")
    runLog(dir, "event", "--end", "receipt")
    runLog(dir, "summarize")
    expect(metadata(dir).cost.totals.tokens).toBe(0)
  })

  test("artifact bytes sum the run directory and exclude the jobs directory", () => {
    const dir = freshRunDir()
    writeFileSync(path.join(dir, "full.diff"), "x".repeat(100))
    mkdirSync(path.join(dir, "jobs", "j1"), { recursive: true })
    writeFileSync(path.join(dir, "jobs", "j1", "out.log"), "y".repeat(5000))
    runLog(dir, "event", "--start", "receipt")
    runLog(dir, "event", "--end", "receipt")
    runLog(dir, "summarize")
    const bytes = metadata(dir).cost.totals.artifact_bytes
    expect(bytes).toBeGreaterThanOrEqual(100)
    expect(bytes).toBeLessThan(5000)
  })

  test("the host is read from the harness attestation and defaults to unknown", () => {
    const dir = freshRunDir()
    runLog(dir, "event", "--start", "receipt")
    runLog(dir, "event", "--end", "receipt")
    runLog(dir, "summarize")
    expect(metadata(dir).cost.host).toBe("unknown")
    const claude = spawnSync("python3", [SCRIPT, "summarize", "--run-dir", dir], {
      encoding: "utf8",
      env: hostlessEnv({ CLAUDECODE: "1" }),
    })
    expect(claude.status).toBe(0)
    expect(metadata(dir).cost.host).toBe("claude")
  })
})
