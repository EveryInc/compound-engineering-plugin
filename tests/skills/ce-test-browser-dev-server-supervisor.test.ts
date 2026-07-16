import { spawn, spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"

const REPO = process.cwd()
const SCRIPT = path.join(
  REPO,
  "skills",
  "ce-test-browser",
  "scripts",
  "dev-server-supervisor.py",
)
const RESOLVER = path.join(
  REPO,
  "skills",
  "ce-test-browser",
  "scripts",
  "scratch-root.py",
)

function isolatedEnv(root: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    COMPOUND_ENGINEERING_SCRATCH_ROOT: root,
  }
}

function makeRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "ce-browser-supervisor-"))
  chmodSync(root, 0o700)
  return root
}

function makeRun(root: string, runId: string): string {
  const result = spawnSync(
    "python3",
    [RESOLVER, "run-dir", "--skill", "ce-test-browser", "--run-id", runId],
    { encoding: "utf8", env: isolatedEnv(root) },
  )
  expect(result.status, result.stderr).toBe(0)
  return result.stdout.trim()
}

function supervisor(
  root: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): ReturnType<typeof spawnSync> {
  return spawnSync("python3", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...isolatedEnv(root), ...env },
    timeout: 15_000,
  })
}

function freePort(): number {
  const result = spawnSync(
    "python3",
    [
      "-c",
      "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()",
    ],
    { encoding: "utf8" },
  )
  expect(result.status, result.stderr).toBe(0)
  return Number(result.stdout.trim())
}

function processAlive(pid: number): boolean {
  const result = spawnSync("ps", ["-o", "state=", "-p", String(pid)], {
    encoding: "utf8",
  })
  const state = result.stdout.trim()
  return result.status === 0 && Boolean(state) && !state.startsWith("Z")
}

function waitUntil(predicate: () => boolean, timeoutMs = 5_000): boolean {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    Bun.sleepSync(50)
  }
  return predicate()
}

function listenerResponds(port: number): boolean {
  const result = spawnSync(
    "python3",
    [
      "-c",
      "import sys,urllib.request; urllib.request.urlopen(sys.argv[1], timeout=.5).read(1)",
      `http://127.0.0.1:${port}/`,
    ],
    { encoding: "utf8", timeout: 2_000 },
  )
  return result.status === 0
}

describe("ce-test-browser detached dev-server supervisor", () => {
  test("server and descendants survive startup return, then cross-call stop removes tree before run", () => {
    const root = makeRoot()
    const run = makeRun(root, "detach-tree")
    const port = freePort()
    const wrapper = [
      "import subprocess,sys,time",
      "subprocess.Popen([sys.executable,'-m','http.server',sys.argv[1],'--bind','127.0.0.1'])",
      "time.sleep(300)",
    ].join("; ")
    let token = ""
    let processIds: number[] = []

    try {
      // start is a complete process invocation. The supervisor and server must
      // still be alive after spawnSync returns and that launching process is gone.
      const started = supervisor(root, [
        "start",
        "--run-dir",
        run,
        "--log-file",
        path.join(run, "server.log"),
        "--grace",
        "0.2",
        "--",
        "python3",
        "-c",
        wrapper,
        String(port),
      ])
      expect(started.status, started.stderr).toBe(0)
      const startRecord = JSON.parse(started.stdout)
      token = startRecord.token

      expect(
        waitUntil(() => {
          const status = supervisor(root, [
            "status",
            "--run-dir",
            run,
            "--token",
            token,
          ])
          if (status.status !== 0) return false
          const record = JSON.parse(status.stdout)
          processIds = [startRecord.supervisor_pid, ...record.server_processes]
          return record.supervisor_alive && record.server_processes.length >= 2
        }),
      ).toBe(true)
      expect(waitUntil(() => listenerResponds(port))).toBe(true)

      // A token mismatch is fail-closed: no process or scratch is touched.
      const rejected = supervisor(root, [
        "stop",
        "--run-dir",
        run,
        "--token",
        "0".repeat(48),
        "--grace",
        "0.2",
      ])
      expect(rejected.status).toBe(1)
      expect(rejected.stderr).toContain("token mismatch")
      expect(existsSync(run)).toBe(true)
      expect(listenerResponds(port)).toBe(true)

      // stop is a separate process invocation. It must prove the wrapper,
      // listener descendant, and detached supervisor are all gone before remove.
      const stopped = supervisor(root, [
        "stop",
        "--run-dir",
        run,
        "--token",
        token,
        "--grace",
        "0.2",
      ])
      expect(stopped.status, stopped.stderr).toBe(0)
      expect(JSON.parse(stopped.stdout).removed).toBe(true)
      expect(existsSync(run)).toBe(false)
      expect(listenerResponds(port)).toBe(false)
      for (const pid of processIds) expect(processAlive(pid)).toBe(false)
      token = ""
    } finally {
      if (token && existsSync(run)) {
        supervisor(root, [
          "stop",
          "--run-dir",
          run,
          "--token",
          token,
          "--grace",
          "0.2",
        ])
      }
      rmSync(root, { recursive: true, force: true })
    }
  }, 20_000)

  test("stale reused PID identity is never signaled", () => {
    const root = makeRoot()
    const run = makeRun(root, "stale-pid")
    const unrelated = spawn("sleep", ["60"], {
      detached: true,
      stdio: "ignore",
    })
    unrelated.unref()
    const unrelatedPid = unrelated.pid!
    const token = "a".repeat(48)

    try {
      writeFileSync(
        path.join(run, "server-lease.json"),
        `${JSON.stringify({
          version: 1,
          token,
          supervisor_pid: unrelatedPid,
          supervisor_identity: "proc-start:stale-supervisor",
          worker_pid: unrelatedPid,
          worker_identity: "proc-start:stale-worker",
          worker_pgid: unrelatedPid,
          log_path: path.join(run, "server.log"),
        })}\n`,
        { mode: 0o600 },
      )

      const stopped = supervisor(root, [
        "stop",
        "--run-dir",
        run,
        "--token",
        token,
        "--grace",
        "0.2",
      ])
      expect(stopped.status, stopped.stderr).toBe(0)
      expect(JSON.parse(stopped.stdout)).toEqual({
        removed: true,
        supervisor_signaled: false,
      })
      expect(existsSync(run)).toBe(false)
      expect(processAlive(unrelatedPid)).toBe(true)
    } finally {
      try {
        process.kill(-unrelatedPid, "SIGKILL")
      } catch {}
      rmSync(root, { recursive: true, force: true })
    }
  }, 10_000)

  test("stop recovers the token-bearing tree after the detached supervisor is killed", () => {
    const root = makeRoot()
    const run = makeRun(root, "crashed-supervisor")
    const wrapper = [
      "import subprocess,time",
      "subprocess.Popen(['sleep','300'])",
      "time.sleep(300)",
    ].join("; ")
    let token = ""
    let processIds: number[] = []

    try {
      const started = supervisor(root, [
        "start",
        "--run-dir",
        run,
        "--log-file",
        path.join(run, "server.log"),
        "--grace",
        "0.2",
        "--",
        "python3",
        "-c",
        wrapper,
      ])
      expect(started.status, started.stderr).toBe(0)
      const startRecord = JSON.parse(started.stdout)
      token = startRecord.token

      expect(
        waitUntil(() => {
          const status = supervisor(root, [
            "status",
            "--run-dir",
            run,
            "--token",
            token,
          ])
          if (status.status !== 0) return false
          const record = JSON.parse(status.stdout)
          processIds = record.server_processes
          return record.supervisor_alive && processIds.length >= 2
        }),
      ).toBe(true)

      process.kill(startRecord.supervisor_pid, "SIGKILL")
      expect(waitUntil(() => !processAlive(startRecord.supervisor_pid))).toBe(true)

      const stopped = supervisor(root, [
        "stop",
        "--run-dir",
        run,
        "--token",
        token,
        "--grace",
        "0.2",
      ])
      expect(stopped.status, stopped.stderr).toBe(0)
      expect(JSON.parse(stopped.stdout)).toEqual({
        removed: true,
        supervisor_signaled: false,
      })
      expect(existsSync(run)).toBe(false)
      for (const pid of processIds) expect(processAlive(pid)).toBe(false)
      token = ""
    } finally {
      if (token && existsSync(run)) {
        supervisor(root, [
          "stop",
          "--run-dir",
          run,
          "--token",
          token,
          "--grace",
          "0.2",
        ])
      }
      rmSync(root, { recursive: true, force: true })
    }
  }, 10_000)

  test("post-fork acknowledgment timeout proves zero survivors before removing the run", () => {
    const root = makeRoot()
    const run = makeRun(root, "ack-timeout")
    const pidFile = path.join(root, "ack-timeout-pids")
    const wrapper = [
      "import os,subprocess,sys,time",
      "child=subprocess.Popen(['sleep','300'])",
      "open(sys.argv[1],'w').write(f'{os.getpid()} {child.pid}')",
      "time.sleep(300)",
    ].join("; ")

    try {
      const started = supervisor(
        root,
        [
          "start",
          "--run-dir",
          run,
          "--log-file",
          path.join(run, "server.log"),
          "--grace",
          "0.2",
          "--ack-timeout",
          "0.1",
          "--",
          "python3",
          "-c",
          wrapper,
          pidFile,
        ],
        { CE_TEST_BROWSER_TEST_ACK_DELAY_SECS: "2" },
      )
      expect(started.status).toBe(1)
      expect(started.stderr).toContain(
        "verified rollback removed exact run after process-tree extinction",
      )
      expect(existsSync(run)).toBe(false)
      expect(existsSync(pidFile)).toBe(true)
      const processIds = readFileSync(pidFile, "utf8")
        .trim()
        .split(/\s+/)
        .map(Number)
      expect(processIds).toHaveLength(2)
      for (const pid of processIds) expect(processAlive(pid)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10_000)

  test("pre-lease timeout retains the run until an authenticated lease can recover it", () => {
    const root = makeRoot()
    const run = makeRun(root, "pre-lease-timeout")
    const wrapper = [
      "import subprocess,time",
      "subprocess.Popen(['sleep','300'])",
      "time.sleep(300)",
    ].join("; ")
    let token = ""
    let processIds: number[] = []

    try {
      const started = supervisor(
        root,
        [
          "start",
          "--run-dir",
          run,
          "--log-file",
          path.join(run, "server.log"),
          "--grace",
          "0.2",
          "--ack-timeout",
          "0.1",
          "--",
          "python3",
          "-c",
          wrapper,
        ],
        {
          CE_TEST_BROWSER_TEST_PRE_LEASE_DELAY_SECS: "2",
          CE_TEST_BROWSER_TEST_ACK_DELAY_SECS: "2",
        },
      )
      expect(started.status).toBe(1)
      expect(started.stderr).toContain(
        "authenticated supervisor lease is unavailable",
      )
      expect(started.stderr).toContain("retained for recovery")
      expect(existsSync(run)).toBe(true)

      expect(
        waitUntil(() => {
          try {
            const lease = JSON.parse(
              readFileSync(path.join(run, "server-lease.json"), "utf8"),
            )
            if (!lease.worker_pid) return false
            token = lease.token
            const status = supervisor(root, [
              "status",
              "--run-dir",
              run,
              "--token",
              token,
            ])
            if (status.status !== 0) return false
            const record = JSON.parse(status.stdout)
            processIds = [lease.supervisor_pid, ...record.server_processes]
            return record.supervisor_alive && record.server_processes.length >= 2
          } catch {
            return false
          }
        }, 4_000),
      ).toBe(true)

      const stopped = supervisor(root, [
        "stop",
        "--run-dir",
        run,
        "--token",
        token,
        "--grace",
        "0.2",
      ])
      expect(stopped.status, stopped.stderr).toBe(0)
      expect(JSON.parse(stopped.stdout).removed).toBe(true)
      expect(existsSync(run)).toBe(false)
      for (const pid of processIds) expect(processAlive(pid)).toBe(false)
      token = ""
    } finally {
      if (token && existsSync(run)) {
        supervisor(root, [
          "stop",
          "--run-dir",
          run,
          "--token",
          token,
          "--grace",
          "0.2",
        ])
      }
      rmSync(root, { recursive: true, force: true })
    }
  }, 10_000)

  test("failed exec is parent-classified and removes the run only after verified rollback", () => {
    const root = makeRoot()
    const run = makeRun(root, "failed-exec")

    try {
      const started = supervisor(root, [
        "start",
        "--run-dir",
        run,
        "--log-file",
        path.join(run, "server.log"),
        "--grace",
        "0.2",
        "--",
        "/definitely/not/a/real/dev-server",
      ])
      expect(started.status).toBe(1)
      expect(started.stderr).toContain("No such file or directory")
      expect(started.stderr).toContain(
        "verified rollback removed exact run after process-tree extinction",
      )
      expect(started.stderr).not.toContain("retained for recovery")
      expect(existsSync(run)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10_000)

  test("ps fallback identity stays matchable across timezone and locale changes", () => {
    const root = makeRoot()
    const run = makeRun(root, "ps-fallback")
    const wrapper = [
      "import subprocess,time",
      "subprocess.Popen(['sleep','300'])",
      "time.sleep(300)",
    ].join("; ")
    let token = ""
    let processIds: number[] = []

    try {
      const started = supervisor(
        root,
        [
          "start",
          "--run-dir",
          run,
          "--log-file",
          path.join(run, "server.log"),
          "--grace",
          "0.2",
          "--",
          "python3",
          "-c",
          wrapper,
        ],
        {
          CE_TEST_BROWSER_TEST_FORCE_PS_IDENTITY: "1",
          TZ: "UTC",
          LC_ALL: "C",
        },
      )
      expect(started.status, started.stderr).toBe(0)
      const startRecord = JSON.parse(started.stdout)
      token = startRecord.token
      expect(startRecord.supervisor_identity).toStartWith("ps-start:")

      const laterEnvironment = {
        TZ: "America/Chicago",
        LC_ALL: "C.UTF-8",
      }
      const status = supervisor(
        root,
        ["status", "--run-dir", run, "--token", token],
        laterEnvironment,
      )
      expect(status.status, status.stderr).toBe(0)
      const statusRecord = JSON.parse(status.stdout)
      expect(statusRecord.supervisor_alive).toBe(true)
      expect(statusRecord.server_processes.length).toBeGreaterThanOrEqual(2)
      processIds = [startRecord.supervisor_pid, ...statusRecord.server_processes]

      const stopped = supervisor(
        root,
        [
          "stop",
          "--run-dir",
          run,
          "--token",
          token,
          "--grace",
          "0.2",
        ],
        laterEnvironment,
      )
      expect(stopped.status, stopped.stderr).toBe(0)
      expect(JSON.parse(stopped.stdout)).toEqual({
        removed: true,
        supervisor_signaled: true,
      })
      expect(existsSync(run)).toBe(false)
      for (const pid of processIds) expect(processAlive(pid)).toBe(false)
      token = ""
    } finally {
      if (token && existsSync(run)) {
        supervisor(root, [
          "stop",
          "--run-dir",
          run,
          "--token",
          token,
          "--grace",
          "0.2",
        ])
      }
      rmSync(root, { recursive: true, force: true })
    }
  }, 10_000)
})
