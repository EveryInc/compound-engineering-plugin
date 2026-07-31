import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"

// Drives tests/fixtures/pr-snapshot-platform.py, which pins the observable contract of
// pr-snapshot's three platform primitives: the state lock, the process-identity probe
// behind the PID-reuse guard, and the atomic rename (issue #1280).
//
// This run is the POSIX half. The windows-latest CI job runs the same fixture against
// real Win32 msvcrt/ctypes, which is the half that proves the Windows branches — those
// cannot execute here at all, because the module imports msvcrt only under win32.
const FIXTURE = path.join(__dirname, "../fixtures/pr-snapshot-platform.py")

// The fixture spawns real watchers and waits on real poll intervals.
setDefaultTimeout(90_000)

describe("ce-babysit-pr platform primitives", () => {
  test("state lock, process identity, and watcher replacement (python fixture — must run, never skip)", () => {
    const r = spawnSync("python3", [FIXTURE], { encoding: "utf8" })
    // Hard-assert the fixture's own result: an import error or a missing script must
    // fail here rather than silently skip.
    expect(r.stderr).toContain("OK")
    expect(r.status).toBe(0)
  })
})
