import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// The runner is byte-duplicated per consuming skill (U2 adds the parity
// guard); exercise the canonical ce-doc-review copy here. These tests drive
// the full detached lifecycle with stub workers — never a real peer CLI.
const SCRIPT = path.join(
  __dirname,
  "../../skills/ce-doc-review/scripts/peer-job-runner.py",
)
const FIXTURE = path.join(__dirname, "../fixtures/peer-job-runner-unit.py")

const tempRoots: string[] = []
function mkTempRoot(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

// Every supervisor/worker pid the suite detached; teardown proves no orphans
// (the Verification gate: reaping kills whole trees).
const trackedPids: number[] = []

function pidAlive(pid: number): boolean {
  if (spawnSync("kill", ["-0", String(pid)]).status !== 0) return false
  // `kill -0` succeeds for a <defunct> zombie (reparented to PID 1, not yet
  // reaped); a zombie is not a live orphan, so treat a ps state of Z as dead.
  const ps = spawnSync("ps", ["-o", "state=", "-p", String(pid)])
  if (ps.status !== 0) return true
  return !ps.stdout.toString().trim().startsWith("Z")
}

afterAll(() => {
  // Supervisors exit moments after writing their terminal record; allow a
  // short settle before declaring anything an orphan.
  const deadline = Date.now() + 5000
  let remaining = trackedPids.filter(pidAlive)
  while (Date.now() < deadline && remaining.length > 0) {
    Bun.sleepSync(100)
    remaining = remaining.filter(pidAlive)
  }
  const orphans = remaining
  for (const p of orphans) spawnSync("kill", ["-9", String(p)])
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true })
  expect(orphans).toEqual([])
})

// Fast supervisor cadence so second-scale windows classify quickly; the
// idle/hard/byte windows themselves are set per test via the CE_PEER_* envs
// (defaults stay 240s/630s/10MB in the script).
const FAST = { CE_PEER_POLL_SECS: "0.2", CE_PEER_GRACE_SECS: "2" }

type RunResult = { code: number; stdout: string; stderr: string; ms: number }

function runner(
  root: string,
  env: Record<string, string>,
  args: string[],
): RunResult {
  const t0 = Date.now()
  const r = spawnSync("python3", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, CE_PEER_JOBS_ROOT: root, ...env },
  })
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    ms: Date.now() - t0,
  }
}

function makeRoot(): string {
  return mkTempRoot("peer-jobs-root-")
}

function writeStub(body: string): string {
  const dir = mkTempRoot("peer-stub-")
  const p = path.join(dir, "stub.sh")
  writeFileSync(p, "#!/bin/sh\n" + body)
  chmodSync(p, 0o755)
  return p
}

function jobDirOf(root: string, id: string, runId = "run1"): string {
  return path.join(root, "ce-doc-review", runId, "jobs", id)
}

const SCRATCH_HELPER = path.join(
  __dirname,
  "../../skills/ce-doc-review/scripts/scratch-root.py",
)

function startJob(
  root: string,
  env: Record<string, string>,
  worker: string[],
  opts: { runId?: string; resultPath?: string; extra?: string[] } = {},
): { id: string; dir: string; res: RunResult } {
  const runId = opts.runId ?? "run1"
  const args = ["start", "--skill", "ce-doc-review", "--run-id", runId]
  if (opts.resultPath) args.push("--result-path", opts.resultPath)
  if (opts.extra) args.push(...opts.extra)
  args.push("--", ...worker)
  const res = runner(root, env, args)
  const id = res.stdout.trim()
  return { id, dir: jobDirOf(root, id, runId), res }
}

/** Record the job's supervisor+worker pids for the no-orphans teardown. */
function trackJob(dir: string): { supervisor_pid: number; worker_pid: number } | null {
  const pidFile = path.join(dir, "pid")
  if (!existsSync(pidFile)) return null
  const doc = JSON.parse(readFileSync(pidFile, "utf8"))
  for (const k of ["supervisor_pid", "worker_pid"]) {
    if (typeof doc[k] === "number") trackedPids.push(doc[k])
  }
  return doc
}

function waitState(
  root: string,
  env: Record<string, string>,
  ref: string,
  maxSecs = 15,
): RunResult {
  return runner(root, env, ["wait", "--max-secs", String(maxSecs), ref])
}

describe("peer-job-runner lifecycle", () => {
  test("happy path: start -> done; result emits artifact; every call sub-2s", () => {
    const root = makeRoot()
    const resultPath = path.join(mkTempRoot("peer-res-"), "result.json")
    const stub = writeStub(
      `echo hello-from-worker\nprintf '%s' '{"ok":true}' > "$1"\nexit 0\n`,
    )
    const { id, dir, res } = startJob(root, FAST, [stub, resultPath], {
      resultPath,
    })
    expect(res.code).toBe(0)
    expect(res.ms).toBeLessThan(2000) // R1: start returns fast
    expect(id).toMatch(/^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/)
    expect(res.stdout.trim()).toBe(id) // parent prints ONLY the job id
    trackJob(dir)

    const w = waitState(root, FAST, id, 10)
    expect(w.code).toBe(0)
    expect(w.stdout.trim()).toBe("done")

    const st = runner(root, FAST, ["status", id])
    expect(st.code).toBe(0)
    expect(st.ms).toBeLessThan(2000) // R1
    expect(st.stdout.trim()).toBe("done")

    const stJson = runner(root, FAST, ["status", "--json", id])
    const rows = JSON.parse(stJson.stdout)
    expect(rows).toEqual([{ ref: id, job_dir: dir, state: "done" }])

    const rr = runner(root, FAST, ["result", id])
    expect(rr.code).toBe(0)
    expect(rr.ms).toBeLessThan(2000) // R1
    expect(rr.stdout).toBe('{"ok":true}')

    // R2: durable job state on disk
    expect(readFileSync(path.join(dir, "status"), "utf8").trim()).toBe("done")
    const meta = JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf8"))
    expect(meta.skill).toBe("ce-doc-review")
    expect(meta.run_id).toBe("run1")
    expect(meta.result_path).toBe(resultPath)
    expect(statSync(dir).mode & 0o777).toBe(0o700)
  }, 20000)

  test("detach survival: worker outlives the launching spawnSync and keeps writing", () => {
    const root = makeRoot()
    const stub = writeStub(
      `i=0\nwhile [ $i -lt 20 ]; do echo tick; sleep 0.2; i=$((i+1)); done\nexit 0\n`,
    )
    const { id, dir, res } = startJob(root, FAST, [stub])
    expect(res.code).toBe(0)
    expect(res.ms).toBeLessThan(2000) // returned while the ~4s worker still runs
    trackJob(dir)

    const size1 = statSync(path.join(dir, "out.log")).size
    Bun.sleepSync(1000)
    const st = runner(root, FAST, ["status", id])
    expect(st.stdout.trim()).toBe("running")
    const size2 = statSync(path.join(dir, "out.log")).size
    expect(size2).toBeGreaterThan(size1) // log grew AFTER start returned

    const w = waitState(root, FAST, id, 15)
    expect(w.stdout.trim()).toBe("done")
  }, 20000)

  test("bounded wait: returns early on terminal, and never exceeds --max-secs", () => {
    const root = makeRoot()
    // early return: worker finishes in ~1s, cap is 10s
    const quick = writeStub(`sleep 1\nexit 0\n`)
    const a = startJob(root, FAST, [quick])
    trackJob(a.dir)
    const wa = waitState(root, FAST, a.id, 10)
    expect(wa.stdout.trim()).toBe("done")
    expect(wa.ms).toBeLessThan(6000) // early, not the full cap

    // cap return: worker runs ~30s, cap is 2s
    const slow = writeStub(`sleep 30\nexit 0\n`)
    const b = startJob(root, FAST, [slow])
    trackJob(b.dir)
    const wb = waitState(root, FAST, b.id, 2)
    expect(wb.stdout.trim()).toBe("running")
    expect(wb.ms).toBeGreaterThan(1500)
    expect(wb.ms).toBeLessThan(8000) // never exceeds the cap (+ margin)
    expect(runner(root, FAST, ["reap", b.id]).code).toBe(0)
    expect(
      ["timeout", "died-without-result"],
    ).toContain(waitState(root, FAST, b.id, 10).stdout.trim())
  }, 25000)

  test("idle reap: silent worker classified timeout, whole tree gone", () => {
    const root = makeRoot()
    const env = { ...FAST, CE_PEER_IDLE_SECS: "1", CE_PEER_HARD_SECS: "60" }
    const stub = writeStub(`echo once\nsleep 60\nexit 0\n`)
    const { id, dir } = startJob(root, env, [stub])
    const pids = trackJob(dir)
    expect(pids).not.toBeNull()

    const w = waitState(root, env, id, 20)
    expect(w.stdout.trim()).toBe("timeout")
    expect(readFileSync(path.join(dir, "reason"), "utf8")).toContain("idle")
    // no orphans: the worker's tree is gone
    Bun.sleepSync(300)
    expect(pidAlive(pids!.worker_pid)).toBe(false)
  }, 25000)

  test("hard cap and margin race: supervisor reaps, and its record wins over a racing clean exit", () => {
    const root = makeRoot()
    const env = { ...FAST, CE_PEER_HARD_SECS: "2", CE_PEER_IDLE_SECS: "30" }

    // (a) worker that ignores every cap and never goes idle -> supervisor hard cap
    const resultPath = path.join(mkTempRoot("peer-res-"), "late.json")
    // Trap TERM to publish a result and exit 0 DURING the supervisor's reap:
    // the terminal record must still be the supervisor's `timeout` (R3).
    const stubborn = writeStub(
      `trap 'printf done > "$1"; exit 0' TERM\nwhile :; do echo tick; sleep 0.2; done\n`,
    )
    const a = startJob(root, env, [stubborn, resultPath], { resultPath })
    trackJob(a.dir)
    const wa = waitState(root, env, a.id, 20)
    expect(wa.stdout.trim()).toBe("timeout")
    expect(readFileSync(path.join(a.dir, "reason"), "utf8")).toContain("hard")
    // the race really happened: the worker did publish before dying...
    expect(existsSync(resultPath)).toBe(true)
    // ...but the supervisor's record wins, so result refuses (exit 3)
    expect(runner(root, env, ["result", a.id]).code).toBe(3)

    // (b) worker-side cap fires first (worker exits nonzero on its own) -> failed
    const selfCapped = writeStub(`echo capped >&2\nexit 7\n`)
    const b = startJob(root, env, [selfCapped])
    trackJob(b.dir)
    const wb = waitState(root, env, b.id, 10)
    expect(wb.stdout.trim()).toBe("failed")
    expect(readFileSync(path.join(b.dir, "reason"), "utf8")).toContain("7")
  }, 30000)

  test("byte cap on out.log: flooding worker reaped as failed with oversize reason", () => {
    const root = makeRoot()
    const env = { ...FAST, CE_PEER_LOG_MAX_BYTES: "1000" }
    const flood = writeStub(
      `while :; do echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; sleep 0.01; done\n`,
    )
    const { id, dir } = startJob(root, env, [flood])
    trackJob(dir)
    const w = waitState(root, env, id, 15)
    expect(w.stdout.trim()).toBe("failed")
    expect(readFileSync(path.join(dir, "reason"), "utf8")).toContain("byte cap")
  }, 20000)

  test("worker killed externally without result -> died-without-result", () => {
    const root = makeRoot()
    const resultPath = path.join(mkTempRoot("peer-res-"), "never.json")
    const stub = writeStub(`sleep 30\nexit 0\n`)
    const { id, dir } = startJob(root, FAST, [stub], { resultPath })
    const pids = trackJob(dir)
    expect(pids).not.toBeNull()
    spawnSync("kill", ["-9", String(pids!.worker_pid)])
    const w = waitState(root, FAST, id, 10)
    expect(w.stdout.trim()).toBe("died-without-result")
    // result of a non-done terminal job: distinct exit code
    expect(runner(root, FAST, ["result", id]).code).toBe(3)
  }, 15000)

  test("preflight failure: nothing detached, never-started, actionable stderr", () => {
    const root = makeRoot()
    // absolute path that does not exist
    const res = runner(root, FAST, [
      "start", "--skill", "ce-doc-review", "--run-id", "run1",
      "--", "/nonexistent/worker-xyz",
    ])
    expect(res.code).not.toBe(0)
    expect(res.ms).toBeLessThan(2000)
    expect(res.stdout.trim()).toBe("") // no job id printed
    expect(res.stderr.toLowerCase()).toContain("preflight")
    const jobs = readdirSync(path.join(root, "ce-doc-review", "run1", "jobs"))
    expect(jobs.length).toBe(1)
    const jd = path.join(root, "ce-doc-review", "run1", "jobs", jobs[0])
    expect(existsSync(path.join(jd, "pid"))).toBe(false) // nothing detached
    expect(runner(root, FAST, ["status", jd]).stdout.trim()).toBe("never-started")

    // command not on PATH is also caught before detach
    const res2 = runner(root, FAST, [
      "start", "--skill", "ce-doc-review", "--run-id", "run2",
      "--", "definitely-not-a-real-cmd-xyz",
    ])
    expect(res2.code).not.toBe(0)
    expect(res2.stderr.toLowerCase()).toContain("path")

    // KTD8: unsafe --skill/--run-id/--label are rejected outright
    for (const bad of [
      ["--skill", "../evil", "--run-id", "r"],
      ["--skill", "s", "--run-id", "a/b"],
      ["--skill", "s", "--run-id", "r", "--label", "x y"],
    ]) {
      const r = runner(root, FAST, ["start", ...bad, "--", "/bin/sh", "-c", "true"])
      expect(r.code).not.toBe(0)
      expect(r.stdout.trim()).toBe("")
    }
  }, 10000)

  test("retention: start sweeps only settled >24h-old runs and preserves active or recent runs", () => {
    const root = makeRoot()
    const skillDir = path.join(root, "ce-doc-review")
    const oldRun = path.join(skillDir, "old-run")
    mkdirSync(path.join(oldRun, "jobs"), { recursive: true })
    chmodSync(skillDir, 0o700)
    chmodSync(oldRun, 0o700)
    chmodSync(path.join(oldRun, "jobs"), 0o700)
    writeFileSync(path.join(oldRun, "stale.txt"), "x")
    const past = new Date(Date.now() - 25 * 3600 * 1000)
    utimesSync(oldRun, past, past)
    const recentRun = path.join(skillDir, "recent-run")
    mkdirSync(path.join(recentRun, "jobs"), { recursive: true })
    chmodSync(recentRun, 0o700)
    chmodSync(path.join(recentRun, "jobs"), 0o700)
    const activeRun = path.join(skillDir, "active-run")
    const activeJob = path.join(activeRun, "jobs", "still-running")
    mkdirSync(activeJob, { recursive: true })
    chmodSync(activeRun, 0o700)
    chmodSync(path.join(activeRun, "jobs"), 0o700)
    chmodSync(activeJob, 0o700)
    writeFileSync(path.join(activeJob, "pid"), String(process.pid))
    utimesSync(activeRun, past, past)

    const resultPath = path.join(mkTempRoot("peer-res-"), "r.json")
    const stub = writeStub(`printf ok > "$1"\nexit 0\n`)
    const { id, dir } = startJob(root, FAST, [stub, resultPath], {
      runId: "fresh",
      resultPath,
    })
    trackJob(dir)
    expect(existsSync(oldRun)).toBe(false) // swept
    expect(existsSync(recentRun)).toBe(true) // spared
    expect(existsSync(activeRun)).toBe(true) // active lease is never reaped by TTL

    expect(waitState(root, FAST, id, 10, ).stdout.trim()).toBe("done")
    expect(runner(root, FAST, ["result", id]).stdout).toBe("ok")

    // R14: orchestrator deletes the consumed job dir; later reads degrade
    // with a clean error, never a traceback
    expect(runner(root, FAST, ["delete", id]).code).toBe(0)
    expect(existsSync(dir)).toBe(false)
    const st = runner(root, FAST, ["status", id])
    expect(st.code).not.toBe(0)
    expect(st.stderr).not.toContain("Traceback")
  }, 15000)

  test("legacy retention never treats the reserved runs container as one run", () => {
    const root = makeRoot()
    const env = {
      ...process.env,
      ...FAST,
      COMPOUND_ENGINEERING_SCRATCH_ROOT: root,
    }
    delete env.CE_PEER_JOBS_ROOT
    const made = spawnSync(
      "python3",
      [SCRATCH_HELPER, "run-dir", "--skill", "ce-doc-review", "--run-id", "active"],
      { encoding: "utf8", env },
    )
    expect(made.status).toBe(0)
    const productionRun = made.stdout.trim()
    const slow = writeStub("sleep 30\nexit 0\n")
    const started = spawnSync(
      "python3",
      [
        SCRIPT,
        "start",
        "--skill", "ce-doc-review",
        "--run-id", "active",
        "--run-dir", productionRun,
        "--", slow,
      ],
      { encoding: "utf8", env },
    )
    expect(started.status).toBe(0)
    const productionId = started.stdout.trim()
    const productionJob = path.join(productionRun, "jobs", productionId)
    const productionPids = trackJob(productionJob)
    expect(productionPids).not.toBeNull()

    const runsContainer = path.dirname(productionRun)
    const past = new Date(Date.now() - 48 * 3600 * 1000)
    utimesSync(runsContainer, past, past)

    const legacy = startJob(root, FAST, [slow], { runId: "legacy-trigger" })
    const legacyPids = trackJob(legacy.dir)
    expect(legacy.res.code).toBe(0)
    expect(legacyPids).not.toBeNull()
    expect(existsSync(productionRun)).toBe(true)
    expect(pidAlive(productionPids!.supervisor_pid)).toBe(true)
    expect(pidAlive(productionPids!.worker_pid)).toBe(true)

    expect(runner(root, FAST, ["reap", productionId]).code).toBe(0)
    expect(runner(root, FAST, ["reap", legacy.id]).code).toBe(0)
  }, 15000)

  test("production path colocates jobs under the exact resolver-returned run", () => {
    const root = makeRoot()
    const env = {
      ...process.env,
      ...FAST,
      COMPOUND_ENGINEERING_SCRATCH_ROOT: root,
    }
    delete env.CE_PEER_JOBS_ROOT
    const made = spawnSync(
      "python3",
      [SCRATCH_HELPER, "run-dir", "--skill", "ce-doc-review", "--run-id", "opaque"],
      { encoding: "utf8", env },
    )
    expect(made.status).toBe(0)
    const runDir = made.stdout.trim()
    const stub = writeStub("echo ok\nexit 0\n")
    const started = spawnSync(
      "python3",
      [
        SCRIPT,
        "start",
        "--skill", "ce-doc-review",
        "--run-id", "opaque",
        "--run-dir", runDir,
        "--", stub,
      ],
      { encoding: "utf8", env },
    )
    expect(started.status).toBe(0)
    const id = started.stdout.trim()
    const jobDir = path.join(runDir, "jobs", id)
    expect(existsSync(jobDir)).toBe(true)
    trackJob(jobDir)
    expect(
      spawnSync("python3", [SCRIPT, "wait", "--max-secs", "10", id], {
        encoding: "utf8",
        env,
      }).stdout.trim(),
    ).toBe("done")
    expect(
      spawnSync("python3", [SCRIPT, "delete", id], { encoding: "utf8", env }).status,
    ).toBe(0)
    expect(existsSync(jobDir)).toBe(false)
  }, 15000)

  test("production path accepts only an existing direct resolver run child", () => {
    const root = makeRoot()
    const env = {
      ...process.env,
      ...FAST,
      COMPOUND_ENGINEERING_SCRATCH_ROOT: root,
    }
    delete env.CE_PEER_JOBS_ROOT
    const made = spawnSync(
      "python3",
      [SCRATCH_HELPER, "run-dir", "--skill", "ce-doc-review", "--run-id", "opaque"],
      { encoding: "utf8", env },
    )
    expect(made.status).toBe(0)
    const runDir = made.stdout.trim()
    const runsParent = path.dirname(runDir)
    const missingRun = path.join(runsParent, "guessed-run")
    const nestedRun = path.join(runDir, "nested")
    mkdirSync(nestedRun, { mode: 0o700 })
    const stub = writeStub("echo should-not-run\nexit 0\n")

    for (const candidate of [missingRun, runsParent, nestedRun]) {
      const started = spawnSync(
        "python3",
        [
          SCRIPT,
          "start",
          "--skill", "ce-doc-review",
          "--run-id", "opaque",
          "--run-dir", candidate,
          "--", stub,
        ],
        { encoding: "utf8", env },
      )
      expect(started.status).not.toBe(0)
      expect(started.stderr).not.toContain("Traceback")
    }
    expect(existsSync(missingRun)).toBe(false)
    expect(existsSync(path.join(runsParent, "jobs"))).toBe(false)
    expect(existsSync(path.join(nestedRun, "jobs"))).toBe(false)
  })

  test("delete refuses live or inferred-only jobs and removes published terminal jobs", () => {
    const root = makeRoot()
    const slow = writeStub("sleep 30\nexit 0\n")
    const running = startJob(root, FAST, [slow])
    trackJob(running.dir)
    const refused = runner(root, FAST, ["delete", running.id])
    expect(refused.code).toBe(2)
    expect(existsSync(running.dir)).toBe(true)
    expect(runner(root, FAST, ["reap", running.id]).code).toBe(0)
    expect(["timeout", "died-without-result"]).toContain(
      waitState(root, FAST, running.id, 10).stdout.trim(),
    )
    expect(runner(root, FAST, ["delete", running.id]).code).toBe(0)
    expect(existsSync(running.dir)).toBe(false)
  }, 15000)

  test("terminal status does not release a stopped supervisor lease", () => {
    const root = makeRoot()
    const env = { ...FAST, CE_PEER_GRACE_SECS: "1" }
    const slow = writeStub("sleep 30\nexit 0\n")
    const running = startJob(root, env, [slow])
    const pids = trackJob(running.dir)
    expect(pids).not.toBeNull()

    expect(spawnSync("kill", ["-STOP", String(pids!.supervisor_pid)]).status).toBe(0)
    writeFileSync(path.join(running.dir, "status"), "done\n")

    const refused = runner(root, env, ["delete", running.id])
    expect(refused.code).toBe(2)
    expect(refused.stderr).toContain("live lease")
    expect(existsSync(running.dir)).toBe(true)

    expect(runner(root, env, ["reap", running.id]).code).toBe(0)
    Bun.sleepSync(200)
    expect(pidAlive(pids!.supervisor_pid)).toBe(false)
    expect(pidAlive(pids!.worker_pid)).toBe(false)
    expect(runner(root, env, ["delete", running.id]).code).toBe(0)
    expect(existsSync(running.dir)).toBe(false)
  }, 15000)

  test("CE_PEER_JOBS_ROOT rejects relative, permissive, and symlinked roots", () => {
    const stub = writeStub("exit 0\n")
    const relative = runner("relative-root", FAST, [
      "start", "--skill", "ce-doc-review", "--run-id", "r", "--", stub,
    ])
    expect(relative.code).toBe(1)

    const base = makeRoot()
    const permissive = path.join(base, "permissive")
    mkdirSync(permissive, { mode: 0o755 })
    const wrongMode = runner(permissive, FAST, [
      "start", "--skill", "ce-doc-review", "--run-id", "r", "--", stub,
    ])
    expect(wrongMode.code).toBe(1)
    expect(statSync(permissive).mode & 0o777).toBe(0o755)

    const target = path.join(base, "target")
    mkdirSync(target, { mode: 0o700 })
    const link = path.join(base, "link")
    spawnSync("ln", ["-s", target, link])
    const linked = runner(link, FAST, [
      "start", "--skill", "ce-doc-review", "--run-id", "r", "--", stub,
    ])
    expect(linked.code).toBe(1)
  }, 10000)

  test("PID reuse or stale identity never counts as running or becomes a signal target", () => {
    const root = makeRoot()
    const result = runner(root, FAST, [
      "start", "--skill", "ce-doc-review", "--run-id", "stale",
      "--", "/nonexistent/worker-for-stale-pid",
    ])
    expect(result.code).toBe(1)
    const jobs = readdirSync(path.join(root, "ce-doc-review", "stale", "jobs"))
    const id = jobs[0]
    const dir = jobDirOf(root, id, "stale")
    writeFileSync(
      path.join(dir, "pid"),
      JSON.stringify({
        supervisor_pid: process.pid,
        supervisor_identity: "proc-start:not-this-process",
        worker_pid: process.pid,
        worker_identity: "proc-start:not-this-process",
        job_token: "not-present-in-this-process",
      }),
    )
    expect(runner(root, FAST, ["status", id]).stdout.trim()).toBe(
      "died-without-result",
    )
    expect(runner(root, FAST, ["delete", id]).code).toBe(4)
    expect(runner(root, FAST, ["reap", id]).code).toBe(0)
    expect(runner(root, FAST, ["status", id]).stdout.trim()).toBe(
      "died-without-result",
    )
  }, 10000)

  test("reap: fast return, supervisor classifies once, second reap is a no-op", () => {
    const root = makeRoot()
    const stub = writeStub(`sleep 60\nexit 0\n`)
    const { id, dir } = startJob(root, FAST, [stub])
    const pids = trackJob(dir)
    expect(pids).not.toBeNull()

    const r1 = runner(root, FAST, ["reap", id])
    expect(r1.code).toBe(0)
    expect(r1.ms).toBeLessThan(2000) // fast return; supervisor owns the kill

    const w = waitState(root, FAST, id, 10)
    expect(w.stdout.trim()).toBe("timeout")
    Bun.sleepSync(300)
    expect(pidAlive(pids!.worker_pid)).toBe(false)

    const r2 = runner(root, FAST, ["reap", id])
    expect(r2.code).toBe(0) // terminal job: safe no-op
    expect(r2.ms).toBeLessThan(2000)
    expect(readFileSync(path.join(dir, "status"), "utf8").trim()).toBe("timeout")
  }, 20000)

  test("reap fallback: dead supervisor -> reap kills the tree and writes the record itself", () => {
    const root = makeRoot()
    const env = { ...FAST, CE_PEER_GRACE_SECS: "1" }
    const stub = writeStub(`sleep 60\nexit 0\n`)
    const { id, dir } = startJob(root, env, [stub])
    const pids = trackJob(dir)
    expect(pids).not.toBeNull()

    spawnSync("kill", ["-9", String(pids!.supervisor_pid)])
    Bun.sleepSync(200)
    const r = runner(root, env, ["reap", id])
    expect(r.code).toBe(0)
    const st = runner(root, env, ["status", id]).stdout.trim()
    expect(["timeout", "died-without-result"]).toContain(st)
    Bun.sleepSync(300)
    expect(pidAlive(pids!.worker_pid)).toBe(false)

    expect(runner(root, env, ["reap", id]).code).toBe(0) // idempotent
  }, 15000)

  test("reap sweeps a live child in the worker pgid after the leader has exited", () => {
    // Regression: cmd_reap must call the dead-leader-safe kill_tree whenever it
    // has a worker pid, NOT only when the leader is still alive. A child can
    // survive in the worker's process group after the leader exits; guarding
    // the sweep on _pid_alive(worker) re-defeats kill_tree and leaks that child.
    const root = makeRoot()
    const env = { ...FAST, CE_PEER_GRACE_SECS: "1" }
    const coord = mkTempRoot("peer-reap-child-")
    const childPidFile = path.join(coord, "childpid")
    const gate = path.join(coord, "gate")
    writeFileSync(gate, "") // gate present => leader keeps running
    // Non-interactive /bin/sh has no job control, so the backgrounded child
    // stays in the leader's process group (pgid == worker_pid). The leader
    // blocks on the gate, then exits, leaving the child in that pgid.
    const stub = writeStub(
      `sleep 300 &\n` +
        `echo $! > "${childPidFile}"\n` +
        `while [ -e "${gate}" ]; do sleep 0.1; done\n` +
        `exit 0\n`,
    )
    const { id, dir } = startJob(root, env, [stub])
    const pids = trackJob(dir)
    expect(pids).not.toBeNull()

    const readChild = (): number => {
      const dl = Date.now() + 5000
      while (!existsSync(childPidFile) && Date.now() < dl) Bun.sleepSync(50)
      return Number(readFileSync(childPidFile, "utf8").trim())
    }
    const childPid = readChild()
    trackedPids.push(childPid)
    expect(childPid).toBeGreaterThan(0)

    // Kill the supervisor so it cannot classify, THEN release the gate so the
    // worker LEADER exits while its child keeps running in the leader's pgid.
    spawnSync("kill", ["-9", String(pids!.supervisor_pid)])
    rmSync(gate, { force: true })
    const ldl = Date.now() + 5000
    while (pidAlive(pids!.worker_pid) && Date.now() < ldl) Bun.sleepSync(50)
    expect(pidAlive(pids!.worker_pid)).toBe(false) // leader exited
    expect(pidAlive(childPid)).toBe(true) // orphan survives in the pgid

    // reap must sweep the pgid despite the dead leader, then classify.
    expect(runner(root, env, ["reap", id]).code).toBe(0)
    const sdl = Date.now() + 5000
    while (pidAlive(childPid) && Date.now() < sdl) Bun.sleepSync(50)
    expect(pidAlive(childPid)).toBe(false) // child swept, not leaked
    expect(runner(root, env, ["status", id]).stdout.trim()).toBe(
      "died-without-result",
    )
  }, 20000)

  test("reap honors a result the worker published after the supervisor died", () => {
    // Regression: if the supervisor dies mid-run and the worker THEN publishes
    // its declared result and exits, cmd_reap's fallback must classify from the
    // artifact (done), not discard it as died-without-result — else `result`
    // exits 3 on a job that actually succeeded.
    const root = makeRoot()
    const env = { ...FAST, CE_PEER_GRACE_SECS: "1" }
    const coord = mkTempRoot("peer-reap-result-")
    const resultPath = path.join(coord, "out.json")
    const gate = path.join(coord, "gate")
    writeFileSync(gate, "") // gate present => worker waits before publishing
    const stub = writeStub(
      `while [ -e "${gate}" ]; do sleep 0.1; done\n` +
        `printf '{"ok":true}' > "${resultPath}"\n` +
        `exit 0\n`,
    )
    const { id, dir } = startJob(root, env, [stub], { resultPath })
    const pids = trackJob(dir)
    expect(pids).not.toBeNull()

    // Kill the supervisor BEFORE it can classify, then let the worker publish
    // its result and exit — the exact ordering the fallback must handle.
    spawnSync("kill", ["-9", String(pids!.supervisor_pid)])
    rmSync(gate, { force: true })
    const dl = Date.now() + 5000
    while (pidAlive(pids!.worker_pid) && Date.now() < dl) Bun.sleepSync(50)
    expect(pidAlive(pids!.worker_pid)).toBe(false)

    expect(runner(root, env, ["reap", id]).code).toBe(0)
    // Classified from the published artifact, not died-without-result.
    expect(runner(root, env, ["status", id]).stdout.trim()).toBe("done")
    // ...and `result` emits it rather than exiting 3.
    const r = runner(root, env, ["result", id])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('{"ok":true}')
  }, 20000)

  test("result --path: verified read emits the exact file bytes; missing file exits 3", () => {
    const root = makeRoot()
    const artifact = path.join(mkTempRoot("peer-path-"), "artifact.txt")
    const payload = "payload-line-1\npayload-line-2\n"
    writeFileSync(artifact, payload)

    const ok = runner(root, FAST, ["result", "--path", artifact])
    expect(ok.code).toBe(0)
    expect(ok.stdout).toBe(payload) // exact bytes, no wrapping or truncation

    const missing = runner(root, FAST, [
      "result", "--path", path.join(mkTempRoot("peer-path-"), "nope.txt"),
    ])
    expect(missing.code).toBe(3)
    expect(missing.stdout).toBe("")
  }, 10000)

  test("result with neither a job nor --path is a usage error (exit 2)", () => {
    const root = makeRoot()
    const r = runner(root, FAST, ["result"])
    expect(r.code).toBe(2)
    expect(r.stdout).toBe("")
    expect(r.stderr).toContain("needs a job id or --path")
  }, 10000)

  test("ownership check and id-collision units (python fixture — must run, never skip)", () => {
    const r = spawnSync("python3", [FIXTURE], {
      encoding: "utf8",
      env: {
        ...process.env,
        PEER_JOB_RUNNER: SCRIPT,
        CE_PEER_JOBS_ROOT: makeRoot(),
      },
    })
    // Hard assertion on the fixture's own pass/fail — a crash (e.g. runner
    // missing or import error) fails here rather than skipping.
    expect(r.stderr).toContain("OK")
    expect(r.status).toBe(0)
  }, 20000)
})
