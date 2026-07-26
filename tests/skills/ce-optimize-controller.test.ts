import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"

const ROOT = path.join(import.meta.dir, "../..")
const CONTROLLER = path.join(ROOT, "skills/ce-optimize/scripts/optimize-controller.py")
const WORKTREE = path.join(ROOT, "skills/ce-optimize/scripts/experiment-worktree.sh")

type Result = { exitCode: number; word: string; body: any; stderr: string }

async function run(argv: string[], cwd: string, env: Record<string, string>): Promise<Result> {
  const proc = Bun.spawn(argv, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const lines = stdout.trim().split("\n")
  let body: any = null
  if (lines.length > 1) {
    try { body = JSON.parse(lines.slice(1).join("\n")) } catch { body = null }
  }
  return { exitCode, word: lines[0] ?? "", body, stderr }
}

async function checked(argv: string[], cwd: string, env: Record<string, string>) {
  const result = await run(argv, cwd, env)
  expect(result.exitCode, `${argv.join(" ")}\n${result.stderr}`).toBe(0)
  return result
}

async function fixture(options: {
  policy?: "prefer" | "require"
  models?: string[]
  noRouting?: boolean
  fakeMode?: "receipt" | "forged" | "sleep" | "scope"
  judge?: boolean
  backend?: "codex" | "worktree"
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ce-optimize-controller-"))
  const repo = path.join(root, "repo")
  const home = path.join(root, "home")
  const controllerRoot = path.join(root, "controller")
  const auth = path.join(root, "auth.json")
  const outside = path.join(root, "outside-secret")
  const bin = path.join(root, "bin")
  await mkdir(repo, { recursive: true })
  await mkdir(home, { recursive: true, mode: 0o700 })
  await mkdir(controllerRoot, { recursive: true, mode: 0o700 })
  await mkdir(bin, { recursive: true })
  await checked(["git", "init", "-q"], repo, {})
  await checked(["git", "config", "user.email", "test@example.com"], repo, {})
  await checked(["git", "config", "user.name", "Test User"], repo, {})
  await writeFile(path.join(repo, "mutable.txt"), "baseline\n")
  await writeFile(path.join(repo, "measure.py"), "import json\nprint(json.dumps({'score': 1}))\n")
  await checked(["git", "add", "mutable.txt", "measure.py"], repo, {})
  await checked(["git", "commit", "-q", "-m", "baseline"], repo, {})
  await writeFile(path.join(home, "home-secret"), "hidden-home\n")
  await writeFile(path.join(home, ".env"), "TOKEN=hidden-env\n")
  await writeFile(outside, "hidden-outside\n")
  await writeFile(auth, JSON.stringify({ token: "explicit-auth" }), { mode: 0o600 })
  await chmod(auth, 0o600)

  const models = options.models ?? ["openai/expected"]
  if (!options.noRouting) {
    await writeFile(path.join(home, "config.yaml"), [
      "routing:",
      "  profiles:",
      "    optimize-test:",
      "      candidates:",
      ...models.map((model) => `        - { harness: codex, model: ${model} }`),
      "  roles:",
      `    ce-optimize.experiment-author: { profile: optimize-test, policy: ${options.policy ?? "require"} }`,
      ...(options.judge ? [`    ce-optimize.semantic-judge: { profile: optimize-test, policy: ${options.policy ?? "require"} }`] : []),
      "",
    ].join("\n"), { mode: 0o600 })
    await chmod(path.join(home, "config.yaml"), 0o600)
  }

  const fakeMode = options.fakeMode ?? "receipt"
  const fake = path.join(bin, "codex")
  await writeFile(fake, `#!/usr/bin/python3
import json, os, pathlib, sys, time
capture = pathlib.Path("capture.json")
def readable(value):
    try:
        return pathlib.Path(value).read_text()
    except Exception:
        return None
if ${JSON.stringify(fakeMode)} == "sleep":
    pathlib.Path("started").write_text("started\\n")
    time.sleep(2)
if ${JSON.stringify(fakeMode)} == "scope":
    pathlib.Path("measure.py").write_text("print('tampered')\\n")
capture.write_text(json.dumps({
    "argv": sys.argv[1:],
    "env": dict(os.environ),
    "workspace": readable("mutable.txt"),
    "auth": readable(pathlib.Path(os.environ["CODEX_HOME"]) / "auth.json"),
    "outside": readable(${JSON.stringify(outside)}),
    "home": readable(${JSON.stringify(path.join(home, "home-secret"))}),
    "dotenv": readable(${JSON.stringify(path.join(home, ".env"))}),
}))
model = None
if "--model" in sys.argv:
    model = sys.argv[sys.argv.index("--model") + 1]
if ${JSON.stringify(fakeMode)} == "forged":
    print(json.dumps({"type": "item.completed", "item": {"model_actual": model}}))
else:
    actual = "openai/wrong" if model == "openai/first" else model
    if actual:
        print(json.dumps({"type": "system", "subtype": "init", "model": actual}))
`, { mode: 0o755 })
  await chmod(fake, 0o755)

  const spec = path.join(root, "spec.yaml")
  const constraints = path.join(root, "constraints.json")
  const prompt = path.join(root, "prompt.md")
  const authManifest = path.join(root, "auth-manifest.json")
  await writeFile(spec, "name: controller-test\n")
  await writeFile(constraints, JSON.stringify({
    backend: options.backend ?? "codex",
    codex_security: "full-auto",
    measurement: { command: "python3 measure.py", working_directory: ".", timeout_seconds: 10 },
    scope: { mutable: ["mutable.txt", "capture.json", "started"], immutable: ["measure.py"] },
    execution: { mode: "serial", max_concurrent: 1 },
    judge: options.judge ? { adapter: "codex", rubric: "test" } : null,
    stopping: { max_iterations: 2 },
    shared_files: [],
    sanctioned_env: { SAFE_INPUT: "approved" },
  }), { mode: 0o600 })
  await chmod(constraints, 0o600)
  await writeFile(prompt, "bounded prompt\n", { mode: 0o600 })
  await chmod(prompt, 0o600)
  await writeFile(authManifest, JSON.stringify({
    route: "codex",
    files: [{ source: auth, destination: "auth.json" }],
  }), { mode: 0o600 })
  await chmod(authManifest, 0o600)
  const env = {
    CE_OPTIMIZE_RUN_ROOT: controllerRoot,
    HOME: home,
    COMPOUND_ENGINEERING_HOME: home,
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    GITHUB_TOKEN: "ambient-token",
    AWS_SECRET_ACCESS_KEY: "ambient-secret",
  }
  return { root, repo, home, controllerRoot, fake, spec, constraints, prompt, authManifest, env }
}

async function start(f: Awaited<ReturnType<typeof fixture>>, runId = "run", judge = false) {
  return checked([
    "python3", "-I", "-S", CONTROLLER, "start", "--run-id", runId,
    "--repo", f.repo, "--spec", f.spec, "--constraints", f.constraints,
    "--host-harness", "codex", "--serving-family", "openai",
  ], f.repo, f.env)
}

async function createWorktree(f: Awaited<ReturnType<typeof fixture>>, spec = "controller", index = "1") {
  const created = await checked(["bash", WORKTREE, "create", spec, index, "HEAD", "--routed"], f.repo, f.env)
  return created.word
}

async function lock(
  f: Awaited<ReturnType<typeof fixture>>,
  worktree: string,
  attemptId: string,
  ordinal: number,
  instanceId = "experiment-1",
) {
  return checked([
    "python3", "-I", "-S", CONTROLLER, "lock-attempt", "--run-id", "run",
    "--attempt-id", attemptId, "--role", "author", "--instance-id", instanceId,
    "--ordinal", String(ordinal), "--adapter", "codex", "--worktree", worktree,
    "--executable", f.fake, "--auth-manifest", f.authManifest,
  ], f.repo, f.env)
}

describe("ce-optimize controller", () => {
  test("freezes one self-validating role snapshot and ignores live config drift on resume", async () => {
    const f = await fixture({ judge: true })
    try {
      const first = await start(f)
      expect(first.word).toBe("STARTED")
      const statePath = path.join(f.controllerRoot, "run", "state.json")
      const state = JSON.parse(await readFile(statePath, "utf8"))
      expect(state.routing.snapshot.id).toBe(first.body.snapshot_id)
      expect(state.routing.snapshot.source_revisions).toEqual(first.body.source_revisions)
      expect(state.routing.resolutions.map((item: any) => item.role)).toEqual([
        "ce-optimize.experiment-author",
        "ce-optimize.semantic-judge",
      ])
      expect(state.routing.resolutions.every((item: any) => item.binding_digest && item.attempt_locks.length === 1)).toBe(true)

      const judgeLock = await checked([
        "python3", "-I", "-S", CONTROLLER, "lock-attempt", "--run-id", "run",
        "--attempt-id", "judge-attempt", "--role", "judge", "--instance-id", "judge-batch-1",
        "--ordinal", "0", "--adapter", "codex", "--executable", f.fake, "--auth-manifest", f.authManifest,
      ], f.repo, f.env)
      expect(judgeLock.body.worktree).toBeNull()
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "judge-attempt", "--prompt", f.prompt], f.repo, f.env)
      const judgeCapture = JSON.parse(await readFile(path.join(judgeLock.body.environment_root, "capture.json"), "utf8"))
      expect(judgeCapture.workspace).toBeNull()
      expect(judgeCapture.outside).toBeNull()
      expect(judgeCapture.auth).toContain("explicit-auth")
      await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "judge-attempt"], f.repo, f.env)

      await writeFile(path.join(f.home, "config.yaml"), (await readFile(path.join(f.home, "config.yaml"), "utf8")).replaceAll("openai/expected", "openai/drifted"), { mode: 0o600 })
      const resumed = await start(f)
      expect(resumed.word).toBe("RESUMED")
      expect(resumed.body.snapshot_id).toBe(first.body.snapshot_id)

      const changedConstraints = JSON.parse(await readFile(f.constraints, "utf8"))
      changedConstraints.execution.max_concurrent = 2
      await writeFile(f.constraints, JSON.stringify(changedConstraints), { mode: 0o600 })
      const drifted = await run([
        "python3", "-I", "-S", CONTROLLER, "start", "--run-id", "run",
        "--repo", f.repo, "--spec", f.spec, "--constraints", f.constraints,
        "--host-harness", "codex", "--serving-family", "openai",
      ], f.repo, f.env)
      expect(drifted.exitCode).toBe(4)
      expect(drifted.stderr).toMatch(/resume input differs/i)

      const resumedState = JSON.parse(await readFile(statePath, "utf8"))
      resumedState.routing.resolutions[0].binding_digest = `cebind-v1:${"0".repeat(64)}`
      await writeFile(statePath, `${JSON.stringify(resumedState)}\n`, { mode: 0o600 })
      const tampered = await run(["python3", "-I", "-S", CONTROLLER, "status", "--run-id", "run"], f.repo, f.env)
      expect(tampered.exitCode).toBe(4)
      expect(tampered.stderr).toMatch(/self-validation|binding digest/i)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("sanitizes and confines Codex while finalizing only adapter-owned serving evidence", async () => {
    const f = await fixture()
    try {
      await start(f)
      const worktree = await createWorktree(f)
      const changedBackend = await run([
        "python3", "-I", "-S", CONTROLLER, "lock-attempt", "--run-id", "run",
        "--attempt-id", "wrong-backend", "--role", "author", "--instance-id", "experiment-wrong",
        "--ordinal", "0", "--adapter", "host", "--worktree", worktree,
      ], f.repo, f.env)
      expect(changedBackend.exitCode).toBe(4)
      expect(changedBackend.stderr).toMatch(/change the frozen backend/i)
      const locked = await lock(f, worktree, "attempt-1", 0)
      expect(locked.word).toBe("LOCKED")
      expect(locked.body).toMatchObject({
        backend: "codex",
        worktree,
        mutable_scope: ["mutable.txt", "capture.json", "started"],
        immutable_scope: ["measure.py"],
        execution: { mode: "serial", max_concurrent: 1 },
        stopping: { max_iterations: 2 },
      })
      const dispatched = await checked([
        "python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run",
        "--attempt-id", "attempt-1", "--prompt", f.prompt,
      ], f.repo, f.env)
      expect(dispatched.word).toBe("TERMINAL")

      const capture = JSON.parse(await readFile(path.join(worktree, "capture.json"), "utf8"))
      expect(capture.workspace).toBe("baseline\n")
      expect(capture.argv).toContain("--full-auto")
      expect(capture.argv).toEqual(expect.arrayContaining(["--model", "openai/expected"]))
      expect(JSON.parse(capture.auth)).toEqual({ token: "explicit-auth" })
      expect(capture.outside).toBeNull()
      expect(capture.home).toBeNull()
      expect(capture.dotenv).toBeNull()
      expect(capture.env.HOME).toStartWith(path.join(f.controllerRoot, "run", "attempts", "attempt-1"))
      expect(capture.env.SAFE_INPUT).toBe("approved")
      expect(capture.env.GITHUB_TOKEN).toBeUndefined()
      expect(capture.env.AWS_SECRET_ACCESS_KEY).toBeUndefined()

      const finalized = await checked([
        "python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-1",
      ], f.repo, f.env)
      expect(finalized.word).toBe("ACCEPT")
      expect(finalized.body.receipt).toMatchObject({ identity_status: "verified", model_actual: "openai/expected" })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("advances preferred ordinals only after rejected output is terminal and abandoned", async () => {
    const f = await fixture({ policy: "prefer", models: ["openai/first", "openai/second"] })
    try {
      await start(f)
      let worktree = await createWorktree(f, "fallback")
      await lock(f, worktree, "attempt-first", 0)
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-first", "--prompt", f.prompt], f.repo, f.env)
      const first = await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-first"], f.repo, f.env)
      expect(first.word).toBe("NEXT_CANDIDATE")
      expect(first.body.receipt.attempts).toHaveLength(1)

      worktree = await createWorktree(f, "fallback")
      await lock(f, worktree, "attempt-second", 1)
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-second", "--prompt", f.prompt], f.repo, f.env)
      const second = await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-second"], f.repo, f.env)
      expect(second.word).toBe("ACCEPT")
      expect(second.body.receipt.attempts).toHaveLength(2)
      expect(second.body.receipt.model_actual).toBe("openai/second")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("scope violations block instead of authorizing recipient fallback", async () => {
    const f = await fixture({ policy: "prefer", models: ["openai/first", "openai/second"], fakeMode: "scope" })
    try {
      await start(f)
      const worktree = await createWorktree(f, "scope")
      await lock(f, worktree, "attempt-scope", 0)
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-scope", "--prompt", f.prompt], f.repo, f.env)
      const blocked = await run(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-scope"], f.repo, f.env)
      expect(blocked.exitCode).toBe(4)
      expect(blocked.word).toBe("BLOCK")
      expect(blocked.body).toMatchObject({ action: "block", error: { code: "SCOPE_VIOLATION" } })
      expect(blocked.body).not.toHaveProperty("next_candidate")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("blocks forged serving evidence, changed wrappers, and substituted receipts", async () => {
    const forged = await fixture({ fakeMode: "forged" })
    try {
      await start(forged)
      const worktree = await createWorktree(forged, "forged")
      await lock(forged, worktree, "attempt-forged", 0)
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-forged", "--prompt", forged.prompt], forged.repo, forged.env)
      const blocked = await run(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-forged"], forged.repo, forged.env)
      expect(blocked.exitCode).toBe(4)
      expect(blocked.word).toBe("BLOCK")
      expect(blocked.body.receipt.identity_status).toBe("unverified")
    } finally {
      await rm(forged.root, { recursive: true, force: true })
    }

    const wrapper = await fixture()
    try {
      await start(wrapper)
      const worktree = await createWorktree(wrapper, "wrapper")
      await lock(wrapper, worktree, "attempt-wrapper", 0)
      await writeFile(wrapper.fake, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
      await chmod(wrapper.fake, 0o755)
      const substituted = await run(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-wrapper", "--prompt", wrapper.prompt], wrapper.repo, wrapper.env)
      expect(substituted.exitCode).toBe(4)
      expect(substituted.stderr).toMatch(/executable changed/i)
    } finally {
      await rm(wrapper.root, { recursive: true, force: true })
    }

    const receipt = await fixture()
    try {
      await start(receipt)
      const worktree = await createWorktree(receipt, "receipt")
      await lock(receipt, worktree, "attempt-receipt", 0)
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-receipt", "--prompt", receipt.prompt], receipt.repo, receipt.env)
      const receiptPath = path.join(receipt.controllerRoot, "run", "attempts", "attempt-receipt", "adapter-receipt.json")
      await writeFile(receiptPath, "{}\n", { mode: 0o600 })
      const substituted = await run(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-receipt"], receipt.repo, receipt.env)
      expect(substituted.exitCode).toBe(4)
      expect(substituted.stderr).toMatch(/receipt.*changed/i)
    } finally {
      await rm(receipt.root, { recursive: true, force: true })
    }
  })

  test("denies live and unknown worktree reset, then permits a measured checkpoint", async () => {
    const f = await fixture({ fakeMode: "sleep" })
    try {
      await start(f)
      const worktree = await createWorktree(f, "lease")
      await lock(f, worktree, "attempt-live", 0)
      const dispatch = Bun.spawn([
        "python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-live", "--prompt", f.prompt,
      ], { cwd: f.repo, env: { ...process.env, ...f.env }, stdout: "pipe", stderr: "pipe" })
      for (let index = 0; index < 40; index++) {
        try { await stat(path.join(worktree, "started")); break } catch { await Bun.sleep(50) }
      }
      const liveReset = await run(["bash", WORKTREE, "create", "lease", "1", "HEAD", "--routed"], f.repo, f.env)
      expect(liveReset.exitCode).not.toBe(0)
      expect(liveReset.stderr).toMatch(/controller lease/i)
      expect(await dispatch.exited).toBe(0)
      await new Response(dispatch.stdout).text()
      await new Response(dispatch.stderr).text()

      await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-live"], f.repo, f.env)
      const measured = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-live"], f.repo, f.env)
      expect(measured.body).toMatchObject({
        protocol: "ce-optimize-result-marker/v1",
        routing_snapshot_id: expect.stringMatching(/^cesnap-v1:/),
        attempt_lock_digest: expect.any(String),
        measurement_digest: expect.any(String),
        exit_code: 0,
      })
      expect(JSON.parse(await readFile(path.join(worktree, "result.yaml"), "utf8")).marker_digest).toBe(measured.body.marker_digest)
      const checkpoint = "a".repeat(64)
      await checked(["python3", "-I", "-S", CONTROLLER, "checkpoint", "--run-id", "run", "--attempt-id", "attempt-live", "--checkpoint-digest", checkpoint], f.repo, f.env)
      const reset = await run(["bash", WORKTREE, "create", "lease", "1", "HEAD", "--routed"], f.repo, f.env)
      expect(reset.exitCode, reset.stderr).toBe(0)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("keeps a crashed dispatch lease unknown until explicit terminal abandonment", async () => {
    const f = await fixture({ fakeMode: "sleep" })
    try {
      await start(f)
      const worktree = await createWorktree(f, "crash")
      await lock(f, worktree, "attempt-crash", 0)
      const dispatch = Bun.spawn([
        "python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-crash", "--prompt", f.prompt,
      ], { cwd: f.repo, env: { ...process.env, ...f.env }, stdout: "pipe", stderr: "pipe" })
      for (let index = 0; index < 40; index++) {
        try { await stat(path.join(worktree, "started")); break } catch { await Bun.sleep(50) }
      }
      dispatch.kill(9)
      await dispatch.exited
      await Bun.sleep(2300)

      const unknownReset = await run(["bash", WORKTREE, "create", "crash", "1", "HEAD", "--routed"], f.repo, f.env)
      expect(unknownReset.exitCode).not.toBe(0)
      const status = await checked(["python3", "-I", "-S", CONTROLLER, "status", "--run-id", "run"], f.repo, f.env)
      expect(status.body.attempts["attempt-crash"].process.state).toBe("dispatching")

      const abandoned = await checked([
        "python3", "-I", "-S", CONTROLLER, "abandon", "--run-id", "run",
        "--attempt-id", "attempt-crash", "--reason", "controller-crashed-before-receipt",
      ], f.repo, f.env)
      expect(abandoned.word).toBe("ABANDONED")
      const reset = await run(["bash", WORKTREE, "create", "crash", "1", "HEAD", "--routed"], f.repo, f.env)
      expect(reset.exitCode, reset.stderr).toBe(0)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("preserves no-routing CE-default behavior while still locking attempts", async () => {
    const f = await fixture({ noRouting: true })
    try {
      const started = await start(f)
      expect(started.word).toBe("STARTED")
      const state = JSON.parse(await readFile(path.join(f.controllerRoot, "run", "state.json"), "utf8"))
      expect(state.routing.resolutions[0].binding.kind).toBe("ce-default")
      const worktree = await createWorktree(f, "default")
      await lock(f, worktree, "attempt-default", 0)
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-default", "--prompt", f.prompt], f.repo, f.env)
      const finalized = await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-default"], f.repo, f.env)
      expect(finalized.word).toBe("ACCEPT")
      expect(finalized.body.receipt.identity_status).toBe("ce-default")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("accepts serving evidence only from a lock-bound owning host receipt", async () => {
    const f = await fixture({ backend: "worktree" })
    try {
      await start(f)
      const worktree = await createWorktree(f, "host")
      const locked = await checked([
        "python3", "-I", "-S", CONTROLLER, "lock-attempt", "--run-id", "run",
        "--attempt-id", "attempt-host", "--role", "author", "--instance-id", "host-experiment",
        "--ordinal", "0", "--adapter", "host", "--worktree", worktree,
      ], f.repo, f.env)
      const receiptPath = path.join(f.root, "host-receipt.json")
      await writeFile(receiptPath, JSON.stringify({
        protocol: "ce-optimize-host-receipt/v1",
        attempt_id: "attempt-host",
        lock_digest: locked.body.lock_digest,
        outcome: "ok",
        process: { terminal: true, exit_code: 0 },
        serving_report: { model_actual: "openai/expected" },
      }), { mode: 0o600 })
      await chmod(receiptPath, 0o600)
      const terminal = await checked([
        "python3", "-I", "-S", CONTROLLER, "record-host", "--run-id", "run",
        "--attempt-id", "attempt-host", "--receipt", receiptPath,
      ], f.repo, f.env)
      expect(terminal.word).toBe("TERMINAL")
      const finalized = await checked([
        "python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-host",
      ], f.repo, f.env)
      expect(finalized.body.receipt).toMatchObject({ identity_status: "verified", model_actual: "openai/expected" })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})
