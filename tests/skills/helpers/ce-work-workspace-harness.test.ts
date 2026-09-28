import { describe, expect, test } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { alive } from "../../helpers/process"
import { ctlWithScript, isLostChildExit, makeRepo, throwLostChildExit, tmp } from "./ce-work-workspace-harness"

describe("ce-work workspace harness: lost child-exit", () => {
  test("detects the spawnSync timeout signature and throws TimeoutError", () => {
    expect(isLostChildExit({ status: null, signal: "SIGKILL" })).toBe(true)
    expect(isLostChildExit({ status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT" } })).toBe(true)
    expect(isLostChildExit({ status: 120, signal: null, stdout: "", stderr: "" })).toBe(true)
    expect(isLostChildExit({ status: 120, signal: null, stderr: "assertion failed\n" })).toBe(false)
    expect(isLostChildExit({ status: 0, signal: null, stdout: "READY\n" })).toBe(false)
    expect(isLostChildExit({ status: 1, signal: null, stderr: "traceback\n" })).toBe(false)
    try {
      throwLostChildExit(["python3", "unit-workspace.py", "resume"])
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).name).toBe("TimeoutError")
      return
    }
    throw new Error("expected throwLostChildExit to throw")
  })
})

describe("ce-work workspace harness: repo template", () => {
  test("makeRepo reseeds when the cached template directory has gone missing", () => {
    const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("ce-work-repo-template-")))
    const first = makeRepo()
    expect(existsSync(path.join(first.repo, "docs", "plans", "plan.md"))).toBe(true)
    const created = readdirSync(tmpdir()).filter((name) => name.startsWith("ce-work-repo-template-") && !before.has(name))
    expect(created.length).toBe(1)
    // CI has lost this directory mid-file after a timed-out test; every later makeRepo then threw ENOENT.
    rmSync(path.join(tmpdir(), created[0]), { recursive: true, force: true })

    const second = makeRepo()
    expect(existsSync(path.join(second.repo, "docs", "plans", "plan.md"))).toBe(true)
    expect(second.base).toMatch(/^[0-9a-f]{40}$/)
  })
})

const RUN_IN_GROUP = path.join(__dirname, "run-in-group.py")

describe("ce-work workspace harness: process-group timeout", () => {
  test("a timeout kills the command's whole group, including a grandchild holding its output", () => {
    const dir = tmp("ce-work-group-")
    const started = Date.now()
    const r = spawnSync(
      "python3",
      [RUN_IN_GROUP, "1", "bash", "-c", "sleep 300 & echo $! > grandchild.pid; echo started; sleep 300"],
      { cwd: dir, encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL" },
    )
    const grandchild = Number(readFileSync(path.join(dir, "grandchild.pid"), "utf8"))
    try {
      expect(Date.now() - started).toBeLessThan(15_000)
      expect(r.status).toBe(124)
      expect(r.stdout).toContain("started")
      expect(alive(grandchild)).toBe(false)
    } finally {
      if (alive(grandchild)) process.kill(grandchild, "SIGKILL")
    }
  })

  test("interrupting the helper kills the command's whole group too", async () => {
    const dir = tmp("ce-work-group-int-")
    const helper = spawn("python3", [RUN_IN_GROUP, "60", "bash", "-c", "sleep 300 & echo $! > grandchild.pid; echo $$ > child.pid; sleep 300"], {
      cwd: dir,
      stdio: "ignore",
    })
    const exited = new Promise<void>((resolve) => helper.on("exit", () => resolve()))
    const deadline = Date.now() + 15_000
    while (!(existsSync(path.join(dir, "grandchild.pid")) && existsSync(path.join(dir, "child.pid"))) && Date.now() < deadline) {
      await Bun.sleep(50)
    }
    const pids = ["child.pid", "grandchild.pid"].map((name) => Number(readFileSync(path.join(dir, name), "utf8")))
    try {
      helper.kill("SIGTERM")
      await exited
      await Bun.sleep(200)
      for (const pid of pids) expect(alive(pid)).toBe(false)
    } finally {
      for (const pid of pids) if (alive(pid)) process.kill(pid, "SIGKILL")
    }
  })

  test("a command that finishes passes its status, output, and signal through unchanged", () => {
    const done = spawnSync("python3", [RUN_IN_GROUP, "10", "bash", "-c", "echo out; echo err >&2; exit 3"], { encoding: "utf8" })
    expect([done.status, done.stdout, done.stderr]).toEqual([3, "out\n", "err\n"])
    const killed = spawnSync("python3", [RUN_IN_GROUP, "10", "bash", "-c", "kill -TERM $$"], { encoding: "utf8" })
    expect(killed.signal).toBe("SIGTERM")
  })

  test("a controller that prints and then hangs still surfaces as a lost child exit", () => {
    const script = path.join(tmp("ce-work-hang-"), "hang.py")
    writeFileSync(script, "import sys, time\nprint('PARTIAL', flush=True)\ntime.sleep(300)\n")
    let thrown: unknown
    try {
      ctlWithScript(script, tmp("ce-work-hang-runs-"))
    } catch (error) {
      thrown = error
    }
    expect((thrown as Error | undefined)?.name).toBe("TimeoutError")
  }, 60_000)
})
