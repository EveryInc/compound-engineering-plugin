import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const SCRIPT = path.join(import.meta.dir, "../skills/ce-dream/scripts/dream-state.py")
const NOW = "2026-09-14T10:00:00+00:00"

function run(...args: string[]): { status: string; payload: any } {
  const r = spawnSync("python3", [SCRIPT, ...args], { encoding: "utf8" })
  expect(r.status, r.stderr).toBe(0)
  const [first, ...rest] = (r.stdout ?? "").split("\n")
  const body = rest.join("\n").trim()
  return { status: first.trim(), payload: body ? JSON.parse(body) : undefined }
}

// A fixture knowledge folder in the `none` layout: inbox/ + learnings/ with
// memory/ nested under learnings/, the state file where ce-dream keeps it.
function folder(): { root: string; state: string } {
  const root = mkdtempSync(path.join(tmpdir(), "dream-state-"))
  mkdirSync(path.join(root, "inbox"))
  mkdirSync(path.join(root, "learnings", "memory"), { recursive: true })
  writeFileSync(path.join(root, "inbox", "2026-09-01-a.md"), "---\ntitle: a\ntype: source\n---\nbody\n")
  writeFileSync(path.join(root, "learnings", "2026-08-01-l.md"), "---\ntitle: l\ntype: learning\n---\nbody\n")
  return { root, state: path.join(root, "learnings", "memory", "state.yml") }
}

const FP_ARGS = (root: string) => ["--root", root, "--paths", "inbox/", "learnings/", "--exclude", "learnings/memory/"]

function fingerprint(root: string): string {
  return run("fingerprint", ...FP_ARGS(root)).payload.fingerprint
}

describe("dream-state.py lease", () => {
  test("acquire is re-entrant for the same writer and LOCKED for another within the TTL", () => {
    const { state } = folder()
    expect(run("lease-acquire", "--state", state, "--writer", "w1", "--now", NOW).status).toBe("OK")
    expect(run("lease-acquire", "--state", state, "--writer", "w1", "--now", NOW).status).toBe("OK")
    expect(run("lease-acquire", "--state", state, "--writer", "w2", "--now", "2026-09-14T10:30:00+00:00").status).toBe("LOCKED")
    // The locked writer cannot release the holder's lease.
    expect(run("lease-release", "--state", state, "--writer", "w2").status).toBe("LEASE-LOST")
    expect(run("lease-release", "--state", state, "--writer", "w1").status).toBe("OK")
    expect(run("read", "--state", state).payload.lease).toBeUndefined()
  })

  test("a lease older than its TTL is reclaimed and the previous holder is reported", () => {
    const { state } = folder()
    run("lease-acquire", "--state", state, "--writer", "w1", "--ttl-minutes", "60", "--now", NOW)
    const r = run("lease-acquire", "--state", state, "--writer", "w2", "--now", "2026-09-14T11:01:00+00:00")
    expect(r.status).toBe("STALE-RECLAIMED")
    expect(r.payload).toEqual({ previous_writer: "w1", previous_timestamp: NOW })
    expect(run("read", "--state", state).payload.lease.writer).toBe("w2")
  })

  test("an unparseable lease timestamp is never treated as stale", () => {
    const { state } = folder()
    writeFileSync(state, 'schema_version: 1\nlease:\n  writer: "w1"\n  timestamp: "not-a-date"\n  ttl_minutes: 1\n')
    expect(run("lease-acquire", "--state", state, "--writer", "w2", "--now", NOW).status).toBe("LOCKED")
  })

  test("a corrupt state file is reported, never overwritten", () => {
    const { state } = folder()
    writeFileSync(state, "this is: not: our schema\n")
    expect(run("read", "--state", state).status).toBe("CORRUPT")
    expect(run("lease-acquire", "--state", state, "--writer", "w1", "--now", NOW).status).toBe("CORRUPT")
    expect(readFileSync(state, "utf8")).toBe("this is: not: our schema\n")
  })
})

describe("dream-state.py idempotency", () => {
  test("a second run on an unchanged folder is a no-op; any content change is CHANGED", () => {
    const { root, state } = folder()
    const first = run("changed", "--state", state, ...FP_ARGS(root))
    expect(first.status).toBe("NO-STATE")
    const fp = first.payload.fingerprint
    expect(fp).toBe(fingerprint(root))

    run("lease-acquire", "--state", state, "--writer", "w1", "--now", NOW)
    expect(
      run(
        "run-record", "--state", state, "--writer", "w1", "--outcome", "completed",
        "--timestamp", NOW, "--fingerprint", fp, "--report", "learnings/memory/dreams/2026-09-14.md",
        "--counts", JSON.stringify({ proposed: 1, conflicts: 0 }),
      ).status,
    ).toBe("OK")
    run("lease-release", "--state", state, "--writer", "w1")

    // Writing the report and the state file (both under memory/) does not count as change.
    mkdirSync(path.join(root, "learnings", "memory", "dreams"), { recursive: true })
    writeFileSync(path.join(root, "learnings", "memory", "dreams", "2026-09-14.md"), "# dream\n")
    const second = run("changed", "--state", state, ...FP_ARGS(root))
    expect(second.status).toBe("UNCHANGED")
    expect(second.payload).toEqual({ fingerprint: fp, last_run: NOW })

    // mtime alone is not change: rewrite the same bytes.
    writeFileSync(path.join(root, "inbox", "2026-09-01-a.md"), "---\ntitle: a\ntype: source\n---\nbody\n")
    expect(run("changed", "--state", state, ...FP_ARGS(root)).status).toBe("UNCHANGED")

    // A new inbox item is change.
    writeFileSync(path.join(root, "inbox", "2026-09-13-b.md"), "---\ntitle: b\ntype: idea\n---\n")
    const third = run("changed", "--state", state, ...FP_ARGS(root))
    expect(third.status).toBe("CHANGED")
    expect(third.payload.fingerprint).not.toBe(fp)
  })

  test("only a completed run establishes the no-change baseline", () => {
    const { root, state } = folder()
    const fp = fingerprint(root)
    run("run-record", "--state", state, "--writer", "w1", "--outcome", "partial", "--timestamp", NOW, "--fingerprint", fp)
    expect(run("changed", "--state", state, ...FP_ARGS(root)).status).toBe("CHANGED")
    run("run-record", "--state", state, "--writer", "w1", "--outcome", "completed", "--timestamp", "2026-09-14T11:00:00+00:00", "--fingerprint", fp)
    expect(run("changed", "--state", state, ...FP_ARGS(root)).status).toBe("UNCHANGED")
  })

  test("run-record keeps the last ten runs, round-trips through the YAML subset, and leaves a lock sidecar only", () => {
    const { root, state } = folder()
    const fp = fingerprint(root)
    for (let i = 0; i < 12; i++) {
      const ts = `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00+00:00`
      run("run-record", "--state", state, "--writer", "w1", "--outcome", "completed", "--timestamp", ts, "--fingerprint", fp, "--counts", `{"moved": ${i}}`)
    }
    const data = run("read", "--state", state).payload
    expect(Object.keys(data.runs).length).toBe(10)
    expect(data.last_run.timestamp).toBe("2026-09-12T10:00:00+00:00")
    expect(data.last_run.counts).toEqual({ moved: 11 })
    expect(data.runs["2026-09-12T10:00:00+00:00"].fingerprint).toBe(fp)
    // Timestamp keys contain ':' and are emitted quoted so the file re-parses.
    expect(readFileSync(state, "utf8")).toContain('  "2026-09-12T10:00:00+00:00":')
    expect(existsSync(`${state}.lock`)).toBe(true)
  })
})
