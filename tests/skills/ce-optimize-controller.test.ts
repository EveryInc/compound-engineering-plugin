import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"

const ROOT = path.join(import.meta.dir, "../..")
const CONTROLLER = path.join(ROOT, "skills/ce-optimize/scripts/optimize-controller.py")
const LANDLOCK = path.join(ROOT, "skills/ce-optimize/scripts/optimize-landlock.py")
const CONTROLLER_PROTOCOL = path.join(ROOT, "skills/ce-optimize/references/controller-protocol.md")
const WORKTREE = path.join(ROOT, "skills/ce-optimize/scripts/experiment-worktree.sh")
const MEASURE = path.join(ROOT, "skills/ce-optimize/scripts/measure.sh")

type Result = { exitCode: number; word: string; body: any; stderr: string }

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function sha256(value: any): string {
  return new Bun.CryptoHasher("sha256").update(canonical(value)).digest("hex")
}

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
  fakeMode?: "receipt" | "forged" | "sleep" | "scope" | "measurementEscape" | "setsid"
  measurementMode?: "normal" | "repeat" | "sleep" | "setsid" | "credential" | "string" | "undeclared" | "transient" | "baselineEscape" | "rawNetwork" | "mutableOutput"
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
  const measurementMode = options.measurementMode ?? "normal"
  const measureSource = measurementMode === "repeat"
    ? "import json, os, pathlib\np = pathlib.Path(os.environ['TMPDIR']) / 'repeat-count'\nn = int(p.read_text()) + 1 if p.exists() else 0\np.write_text(str(n))\nprint(json.dumps({'score': [1, 9, 3][n]}))\n"
    : measurementMode === "sleep"
      ? "import json, time\ntime.sleep(1)\nprint(json.dumps({'score': 1}))\n"
      : measurementMode === "setsid"
        ? "import json, os, pathlib, time\nchild = os.fork()\nif child == 0:\n os.setsid()\n grandchild = os.fork()\n if grandchild == 0:\n  time.sleep(1)\n  pathlib.Path('late-measure').write_text('escaped\\n')\n  os._exit(0)\n os._exit(0)\nos.waitpid(child, 0)\nprint(json.dumps({'score': 1}))\n"
        : measurementMode === "credential"
          ? `import json, os, pathlib
target = pathlib.Path(${JSON.stringify(path.join(controllerRoot, "run/attempts/attempt-credential/worker-env/codex-home/auth.json"))})
try:
 target.read_text()
 readable = True
except Exception:
 readable = False
print(json.dumps({'score': 1 if not readable and 'CODEX_HOME' not in os.environ else -1}))
`
          : measurementMode === "string"
            ? "import json\nprint(json.dumps({'score': 'secret-bytes'}))\n"
            : measurementMode === "undeclared"
              ? "import json\nprint(json.dumps({'score': 1, 'forged': 999}))\n"
              : measurementMode === "transient"
                ? "import json, pathlib\np = pathlib.Path('mutable.txt')\noriginal = p.read_text()\np.write_text('forged\\n')\np.write_text(original)\nprint(json.dumps({'score': 999}))\n"
                : measurementMode === "baselineEscape"
                  ? `import ctypes, errno, json, os, pathlib, socket, time
denied = 0
try: pathlib.Path(${JSON.stringify(outside)}).read_text()
except Exception: denied += 1
try: pathlib.Path(${JSON.stringify(outside)}).write_text('changed')
except Exception: denied += 1
try: socket.socket()
except Exception: denied += 1
child = os.fork()
if child == 0:
 os.setsid()
 grandchild = os.fork()
 if grandchild == 0:
  time.sleep(1)
  pathlib.Path(os.environ['CE_OPTIMIZE_SCRATCH'], 'late-baseline').write_text('escaped')
  os._exit(0)
 os._exit(0)
os.waitpid(child, 0)
print(json.dumps({'score': 1 if denied == 3 else -1}))
`
                  : measurementMode === "rawNetwork"
                    ? `import ctypes, errno, json, platform
machine = platform.machine().lower()
numbers = [41, 53, 425, 0x40000029, 0x40000035, 0x40000066, 0x400001a9] if machine in {'x86_64', 'amd64'} else [198, 199, 425]
libc = ctypes.CDLL(None, use_errno=True)
denied = 0
for number in numbers:
 ctypes.set_errno(0)
 result = libc.syscall(number, 2, 1, 0, 0, 0, 0)
 if result == -1 and ctypes.get_errno() == errno.EPERM: denied += 1
print(json.dumps({'score': 1 if denied == len(numbers) else -1}))
`
                    : measurementMode === "mutableOutput"
                      ? "import json, pathlib\np = pathlib.Path('build-output/value.txt')\np.write_text('temporary\\n')\nprint(json.dumps({'score': 1}))\n"
                      : "import json\ntry:\n import candidate\n score = candidate.score()\nexcept ImportError:\n score = 1\nprint(json.dumps({'score': score}))\n"
  await writeFile(path.join(repo, "measure.py"), measureSource)
  await writeFile(path.join(repo, ".gitignore"), "ignored.dat\n")
  await checked(["git", "add", "mutable.txt", "measure.py", ".gitignore"], repo, {})
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
if ${JSON.stringify(fakeMode)} == "measurementEscape":
    pathlib.Path("candidate.py").write_text(${JSON.stringify(`import pathlib, socket
def score():
    denied = 0
    for target in [${JSON.stringify(outside)}, ${JSON.stringify(path.join(home, "home-secret"))}]:
        try: pathlib.Path(target).read_text()
        except Exception: denied += 1
    try: socket.socket()
    except Exception: denied += 1
    return 1 if denied == 3 else -1
`)})
if ${JSON.stringify(fakeMode)} == "setsid":
    child = os.fork()
    if child == 0:
        os.setsid()
        grandchild = os.fork()
        if grandchild == 0:
            time.sleep(1)
            pathlib.Path("late-author").write_text("escaped\\n")
            os._exit(0)
        os._exit(0)
    os.waitpid(child, 0)
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
    measurement: {
      command: "python3 measure.py",
      metric_names: ["score"],
      mutable_outputs: [],
      working_directory: ".",
      timeout_seconds: 10,
      stability: { mode: "stable", repeat_count: 1, aggregation: "median", noise_threshold: 0.02 },
    },
    scope: { mutable: ["mutable.txt", "capture.json", "started", "candidate.py", "late-author", "late-measure"], immutable: ["measure.py", ".gitignore"] },
    execution: { mode: "serial", max_concurrent: 1 },
    judge: options.judge ? { adapter: "codex", rubric: "test" } : null,
    stopping: { max_iterations: 2 },
    shared_files: [],
    sanctioned_env: { SAFE_INPUT: "approved" },
    experiment_log: ".context/compound-engineering/ce-optimize/controller-test/experiment-log.yaml",
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
  return { root, repo, home, controllerRoot, bin, fake, spec, constraints, prompt, authManifest, env }
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

async function writeCheckpoint(f: Awaited<ReturnType<typeof fixture>>, attemptId: string, marker: any, overrides: Record<string, unknown> = {}) {
  const checkpointPath = path.join(f.repo, ".context/compound-engineering/ce-optimize/controller-test/experiment-log.yaml")
  await mkdir(path.dirname(checkpointPath), { recursive: true })
  await writeFile(checkpointPath, JSON.stringify({ experiments: [{
    run_id: "run",
    attempt_id: attemptId,
    routing_snapshot_id: marker.routing_snapshot_id,
    spec_digest: marker.spec_digest,
    author_attempt_lock_digest: marker.attempt_lock_digest,
    author_receipt_digest: marker.author_receipt_digest,
    constraints_digest: marker.constraints_digest,
    measurement_digest: marker.measurement_digest,
    result_marker_digest: marker.marker_digest,
    metrics_digest: marker.metrics_digest,
    ...overrides,
  }] }))
  return checkpointPath
}

async function prepareAcceptedAuthor(
  f: Awaited<ReturnType<typeof fixture>>,
  spec: string,
  attemptId: string,
) {
  await start(f)
  const worktree = await createWorktree(f, spec)
  await lock(f, worktree, attemptId, 0, spec)
  await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", attemptId, "--prompt", f.prompt], f.repo, f.env)
  await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", attemptId], f.repo, f.env)
  return worktree
}

async function waitForNonemptyFile(file: string) {
  for (let index = 0; index < 100; index++) {
    try {
      if ((await stat(file)).size > 0) return
    } catch {}
    await Bun.sleep(20)
  }
  throw new Error(`timed out waiting for ${file}`)
}

describe("ce-optimize controller", () => {
  test("documents candidate ordinal independently from experiment instance identity", async () => {
    const protocol = await readFile(CONTROLLER_PROTOCOL, "utf8")
    expect(protocol).toContain('--instance-id "experiment-<experiment-number>" --ordinal <candidate-ordinal>')
    expect(protocol).toMatch(/candidate ordinal starts\s+at 0 and is never the experiment number/i)
  })

  test("fails closed instead of claiming network confinement on an unsupported architecture", async () => {
    const source = "import importlib.util,sys; spec=importlib.util.spec_from_file_location('landlock',sys.argv[1]); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); module.platform.machine=lambda:'unsupported-test'; module.seccomp_architecture()"
    const result = await run(["python3", "-I", "-S", "-c", source, LANDLOCK], ROOT, {})
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toMatch(/unsupported seccomp architecture/i)
  })

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
      const judgeFinalized = await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "judge-attempt"], f.repo, f.env)
      const judgeCheckpoint = path.join(f.repo, ".context/compound-engineering/ce-optimize/controller-test/experiment-log.yaml")
      await mkdir(path.dirname(judgeCheckpoint), { recursive: true })
      await writeFile(judgeCheckpoint, JSON.stringify({ experiments: [{
        run_id: "run",
        attempt_id: "judge-attempt",
        routing_snapshot_id: first.body.snapshot_id,
        spec_digest: state.spec_digest,
        constraints_digest: first.body.constraints_digest,
        judge_attempt_lock_digest: judgeLock.body.lock_digest,
        judge_receipt_digest: sha256(judgeFinalized.body.receipt),
      }] }))
      await checked(["python3", "-I", "-S", CONTROLLER, "checkpoint", "--run-id", "run", "--attempt-id", "judge-attempt", "--checkpoint-path", judgeCheckpoint], f.repo, f.env)

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
        mutable_scope: ["mutable.txt", "capture.json", "started", "candidate.py", "late-author", "late-measure"],
        immutable_scope: ["measure.py", ".gitignore"],
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
        repeat_count: 1,
        metrics: { score: 1 },
      })
      const marker = JSON.parse(await readFile(path.join(worktree, "result.yaml"), "utf8"))
      expect(marker.marker_digest).toBe(measured.body.marker_digest)
      const checkpointPath = path.join(f.repo, ".context/compound-engineering/ce-optimize/controller-test/experiment-log.yaml")
      await mkdir(path.dirname(checkpointPath), { recursive: true })
      await writeFile(checkpointPath, JSON.stringify({ experiments: [{
        run_id: "run",
        attempt_id: "attempt-live",
        routing_snapshot_id: marker.routing_snapshot_id,
        spec_digest: marker.spec_digest,
        author_attempt_lock_digest: marker.attempt_lock_digest,
        author_receipt_digest: marker.author_receipt_digest,
        constraints_digest: marker.constraints_digest,
        measurement_digest: marker.measurement_digest,
        result_marker_digest: marker.marker_digest,
        metrics_digest: marker.metrics_digest,
      }] }))
      await checked(["python3", "-I", "-S", CONTROLLER, "checkpoint", "--run-id", "run", "--attempt-id", "attempt-live", "--checkpoint-path", checkpointPath], f.repo, f.env)
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
      const authorized = await checked([
        "python3", "-I", "-S", CONTROLLER, "authorize-host", "--run-id", "run", "--attempt-id", "attempt-host",
      ], f.repo, f.env)
      const receiptPath = path.join(f.root, "host-receipt.json")
      await writeFile(receiptPath, JSON.stringify({
        protocol: "ce-optimize-host-receipt/v1",
        attempt_id: "attempt-host",
        lock_digest: locked.body.lock_digest,
        launch_token: authorized.body.launch_token,
        outcome: "ok",
        process: {
          terminal: true,
          exit_code: 0,
          launch_authority_recorded: true,
          all_descendants_gone: true,
          confinement: "inherited-landlock",
        },
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

  test.each(["LD_PRELOAD", "BASH_ENV", "PYTHONPATH", "NODE_OPTIONS", "RUBYOPT"])(
    "rejects pre-confinement and loader environment hook %s",
    async (name) => {
      const f = await fixture()
      try {
        const constraints = JSON.parse(await readFile(f.constraints, "utf8"))
        constraints.sanctioned_env[name] = "/tmp/inject"
        await writeFile(f.constraints, JSON.stringify(constraints), { mode: 0o600 })
        const refused = await run([
          "python3", "-I", "-S", CONTROLLER, "start", "--run-id", "run",
          "--repo", f.repo, "--spec", f.spec, "--constraints", f.constraints,
        ], f.repo, f.env)
        expect(refused.exitCode).toBe(4)
        expect(refused.stderr).toMatch(/environment name is forbidden/i)
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    },
  )

  test("rejects ignored files and symlinks from the full pre-dispatch inventory", async () => {
    const f = await fixture()
    try {
      await start(f)
      const worktree = await createWorktree(f, "inventory")
      await writeFile(path.join(worktree, "ignored.dat"), "metric gaming\n")
      let refused = await run([
        "python3", "-I", "-S", CONTROLLER, "lock-attempt", "--run-id", "run",
        "--attempt-id", "ignored", "--role", "author", "--instance-id", "ignored",
        "--ordinal", "0", "--adapter", "codex", "--worktree", worktree,
        "--executable", f.fake, "--auth-manifest", f.authManifest,
      ], f.repo, f.env)
      expect(refused.exitCode).toBe(4)
      expect(refused.stderr).toMatch(/ignored\/untracked/i)

      await rm(path.join(worktree, "ignored.dat"))
      await symlink(path.join(f.root, "outside-secret"), path.join(worktree, "candidate.py"))
      refused = await run([
        "python3", "-I", "-S", CONTROLLER, "lock-attempt", "--run-id", "run",
        "--attempt-id", "symlink", "--role", "author", "--instance-id", "symlink",
        "--ordinal", "0", "--adapter", "codex", "--worktree", worktree,
        "--executable", f.fake, "--auth-manifest", f.authManifest,
      ], f.repo, f.env)
      expect(refused.exitCode).toBe(4)
      expect(refused.stderr).toMatch(/symlink/i)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("confines candidate code imported by controller measurement and denies network", async () => {
    const f = await fixture({ fakeMode: "measurementEscape" })
    try {
      await start(f)
      const worktree = await createWorktree(f, "measurement-escape")
      await lock(f, worktree, "attempt-escape", 0, "escape")
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-escape", "--prompt", f.prompt], f.repo, f.env)
      await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-escape"], f.repo, f.env)
      const measured = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-escape"], f.repo, f.env)
      expect(measured.body.metrics).toEqual({ score: 1 })
      expect(measured.body.exit_code).toBe(0)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("runs the Phase 1 baseline through read/write/network/descendant confinement", async () => {
    const f = await fixture({ measurementMode: "baselineEscape" })
    try {
      await start(f)
      const baseline = await checked(["bash", MEASURE, "run"], f.repo, f.env)
      expect(baseline.word).toBe("BASELINED")
      expect(baseline.body).toMatchObject({ metrics: { score: 1 }, exit_code: 0, repeat_count: 1 })
      expect(await readFile(path.join(f.root, "outside-secret"), "utf8")).toBe("hidden-outside\n")
      await Bun.sleep(1200)
      await expect(stat(path.join(f.controllerRoot, "run/baseline/environment/scratch/late-baseline"))).rejects.toThrow()
      const evidence = JSON.parse(await readFile(path.join(f.controllerRoot, "run/baseline/supervisor-measurement-1.json"), "utf8"))
      expect(evidence).toMatchObject({ mode: "measurement", all_descendants_gone: true })
      expect(evidence.runs[0]).not.toHaveProperty("stdout_b64")
      expect(evidence.runs[0]).not.toHaveProperty("stderr_b64")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("enforces the frozen timeout during Phase 1 baseline supervision", async () => {
    const f = await fixture()
    try {
      await writeFile(path.join(f.repo, "measure.py"), "import json, time\ntime.sleep(5)\nprint(json.dumps({'score': 1}))\n")
      const constraints = JSON.parse(await readFile(f.constraints, "utf8"))
      constraints.measurement.timeout_seconds = 1
      await writeFile(f.constraints, JSON.stringify(constraints), { mode: 0o600 })
      await start(f)
      const started = Date.now()
      const baseline = await run(["bash", MEASURE, "run"], f.repo, f.env)
      expect(baseline.exitCode).toBe(4)
      expect(baseline.word).toBe("BASELINE_FAILED")
      expect(baseline.body).toMatchObject({ metrics: {}, exit_code: 124 })
      expect(Date.now() - started).toBeLessThan(4000)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("keeps staged provider auth and config pointers outside measurement", async () => {
    const f = await fixture({ measurementMode: "credential" })
    try {
      const worktree = await prepareAcceptedAuthor(f, "credential", "attempt-credential")
      const measured = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-credential"], f.repo, f.env)
      expect(measured.body.metrics).toEqual({ score: 1 })
      const config = JSON.parse(await readFile(path.join(f.controllerRoot, "run/attempts/attempt-credential/confinement-measurement.json"), "utf8"))
      expect(config.child_env).not.toHaveProperty("CODEX_HOME")
      expect(config.child_env).not.toHaveProperty("SAFE_INPUT")
      expect(config.read_write.map((entry: any) => entry.path)).not.toContain(path.join(f.controllerRoot, "run/attempts/attempt-credential/worker-env"))
      expect(await readFile(path.join(worktree, "mutable.txt"), "utf8")).toBe("baseline\n")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each(["string", "undeclared"] as const)("rejects %s measurement metrics without persisting raw values", async (measurementMode) => {
    const f = await fixture({ measurementMode })
    try {
      await start(f)
      const baseline = await run(["bash", MEASURE, "run"], f.repo, f.env)
      expect(baseline.exitCode).toBe(4)
      expect(baseline.word).toBe("BASELINE_FAILED")
      expect(baseline.body.metrics).toEqual({})
      const evidence = await readFile(path.join(f.controllerRoot, "run/baseline/supervisor-measurement-1.json"), "utf8")
      expect(evidence).not.toContain("secret-bytes")
      expect(evidence).not.toContain("forged")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("denies transient candidate modification before forged metrics are accepted", async () => {
    const f = await fixture({ measurementMode: "transient" })
    try {
      const worktree = await prepareAcceptedAuthor(f, "transient", "attempt-transient")
      const measured = await run(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-transient"], f.repo, f.env)
      expect(measured.exitCode).toBe(4)
      expect(measured.word).toBe("MEASUREMENT_FAILED")
      expect(measured.body.metrics).toEqual({})
      expect(await readFile(path.join(worktree, "mutable.txt"), "utf8")).toBe("baseline\n")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("denies raw socket, socketcall, socketpair, x32, and io_uring setup syscalls", async () => {
    const f = await fixture({ measurementMode: "rawNetwork" })
    try {
      await start(f)
      const baseline = await checked(["bash", MEASURE, "run"], f.repo, f.env)
      expect(baseline.body.metrics).toEqual({ score: 1 })
      const state = JSON.parse(await readFile(path.join(f.controllerRoot, "run/state.json"), "utf8"))
      expect(state.measurement_confinement.network).toBe("seccomp-deny-network-v2")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("limits mutable measurement output to absent disposable roots and removes them", async () => {
    const f = await fixture({ measurementMode: "mutableOutput" })
    try {
      const constraints = JSON.parse(await readFile(f.constraints, "utf8"))
      constraints.measurement.mutable_outputs = ["build-output"]
      await writeFile(f.constraints, JSON.stringify(constraints), { mode: 0o600 })
      await start(f)
      const baseline = await checked(["bash", MEASURE, "run"], f.repo, f.env)
      expect(baseline.body.metrics).toEqual({ score: 1 })
      await expect(stat(path.join(f.repo, "build-output"))).rejects.toThrow()

      const invalid = await fixture()
      try {
        const invalidConstraints = JSON.parse(await readFile(invalid.constraints, "utf8"))
        invalidConstraints.measurement.mutable_outputs = ["measure.py"]
        await writeFile(invalid.constraints, JSON.stringify(invalidConstraints), { mode: 0o600 })
        const refused = await run([
          "python3", "-I", "-S", CONTROLLER, "start", "--run-id", "run",
          "--repo", invalid.repo, "--spec", invalid.spec, "--constraints", invalid.constraints,
        ], invalid.repo, invalid.env)
        expect(refused.exitCode).toBe(4)
        expect(refused.stderr).toMatch(/mutable_outputs.*overlap/i)
      } finally {
        await rm(invalid.root, { recursive: true, force: true })
      }
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("executes the frozen repeat count once and deterministically aggregates before marking", async () => {
    const f = await fixture({ measurementMode: "repeat" })
    try {
      const constraints = JSON.parse(await readFile(f.constraints, "utf8"))
      constraints.measurement.stability = { mode: "repeat", repeat_count: 3, aggregation: "median", noise_threshold: 20 }
      await writeFile(f.constraints, JSON.stringify(constraints), { mode: 0o600 })
      await start(f)
      const worktree = await createWorktree(f, "repeat")
      await lock(f, worktree, "attempt-repeat", 0, "repeat")
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-repeat", "--prompt", f.prompt], f.repo, f.env)
      await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-repeat"], f.repo, f.env)
      const measured = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-repeat"], f.repo, f.env)
      expect(measured.body.repeat_count).toBe(3)
      expect(measured.body.repeat_digests).toHaveLength(3)
      expect(measured.body.metrics).toEqual({ score: 3 })
      const duplicate = await run(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-repeat"], f.repo, f.env)
      expect(duplicate.exitCode).toBe(4)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("refuses duplicate ordinals and recipient advancement after measurement integration", async () => {
    const f = await fixture({ policy: "prefer", models: ["openai/expected", "openai/second"] })
    try {
      await start(f)
      const worktree = await createWorktree(f, "ordinal")
      await lock(f, worktree, "attempt-ordinal", 0, "same-instance")
      const duplicate = await run([
        "python3", "-I", "-S", CONTROLLER, "lock-attempt", "--run-id", "run",
        "--attempt-id", "attempt-duplicate", "--role", "author", "--instance-id", "same-instance",
        "--ordinal", "0", "--adapter", "codex", "--worktree", worktree,
        "--executable", f.fake, "--auth-manifest", f.authManifest,
      ], f.repo, f.env)
      expect(duplicate.exitCode).toBe(4)
      expect(duplicate.stderr).toMatch(/already have an attempt/i)
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-ordinal", "--prompt", f.prompt], f.repo, f.env)
      await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-ordinal"], f.repo, f.env)
      await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-ordinal"], f.repo, f.env)
      const advanced = await run([
        "python3", "-I", "-S", CONTROLLER, "lock-attempt", "--run-id", "run",
        "--attempt-id", "attempt-after-effect", "--role", "author", "--instance-id", "same-instance",
        "--ordinal", "1", "--adapter", "codex", "--worktree", worktree,
        "--executable", f.fake, "--auth-manifest", f.authManifest,
      ], f.repo, f.env)
      expect(advanced.exitCode).toBe(4)
      expect(advanced.stderr).toMatch(/measured.*integrated effect|integrated effect/i)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("recovers a crashed measurement controller and refuses concurrent measurement", async () => {
    const f = await fixture({ measurementMode: "sleep" })
    try {
      await start(f)
      const worktree = await createWorktree(f, "measurement-crash")
      await lock(f, worktree, "attempt-measure-crash", 0, "measurement-crash")
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-measure-crash", "--prompt", f.prompt], f.repo, f.env)
      await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-measure-crash"], f.repo, f.env)
      const first = Bun.spawn(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-measure-crash"], {
        cwd: f.repo, env: { ...process.env, ...f.env }, stdout: "pipe", stderr: "pipe",
      })
      await Bun.sleep(200)
      const concurrent = await run(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-measure-crash"], f.repo, f.env)
      expect(concurrent.exitCode).toBe(4)
      first.kill(9)
      await first.exited
      await Bun.sleep(1300)
      const recovered = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-measure-crash"], f.repo, f.env)
      expect(recovered.word).toBe("MEASURED")
      expect(recovered.body.metrics).toEqual({ score: 1 })
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each(["route", "measurement"])(
    "records a terminal controller-owned cancellation when %s Popen fails before spawn",
    async (mode) => {
      const f = await fixture()
      try {
        const attemptId = `attempt-${mode}-pre-spawn`
        let worktree: string
        if (mode === "route") {
          await start(f)
          worktree = await createWorktree(f, "route-pre-spawn")
          await lock(f, worktree, attemptId, 0, "route-pre-spawn")
        } else {
          worktree = await prepareAcceptedAuthor(f, "measurement-pre-spawn", attemptId)
        }
        const command = mode === "route"
          ? ["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", attemptId, "--prompt", f.prompt]
          : ["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", attemptId]
        const failed = await run(command, f.repo, {
          ...f.env,
          CE_OPTIMIZE_TEST_LAUNCH_FAULT: `${mode}-pre-spawn`,
        })
        expect(failed.exitCode).toBe(4)
        expect(failed.stderr).toMatch(/launch failed before spawn.*cancellation recorded/i)
        const status = await checked(["python3", "-I", "-S", CONTROLLER, "status", "--run-id", "run"], f.repo, f.env)
        const lifecycle = mode === "route"
          ? status.body.attempts[attemptId].process
          : status.body.attempts[attemptId].measurement_process
        expect(lifecycle).toMatchObject({ state: "launch-cancelled", pid: null, exit_code: 125 })
        if (mode === "route") {
          expect(status.body.attempts[attemptId].state).toBe("terminal")
          await expect(stat(path.join(worktree, "capture.json"))).rejects.toThrow()
        }
        const abandoned = await checked([
          "python3", "-I", "-S", CONTROLLER, "abandon", "--run-id", "run",
          "--attempt-id", attemptId, "--reason", "verified-pre-spawn-cancellation",
        ], f.repo, f.env)
        expect(abandoned.word).toBe("ABANDONED")
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    },
  )

  test.each(["route", "measurement"])(
    "recovers %s supervisor cancellation after a spawn-before-PID controller crash",
    async (mode) => {
      const f = await fixture()
      try {
        const attemptId = `attempt-${mode}-post-spawn`
        let worktree: string
        if (mode === "route") {
          await start(f)
          worktree = await createWorktree(f, "route-post-spawn")
          await lock(f, worktree, attemptId, 0, "route-post-spawn")
        } else {
          worktree = await prepareAcceptedAuthor(f, "measurement-post-spawn", attemptId)
        }
        const command = mode === "route"
          ? ["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", attemptId, "--prompt", f.prompt]
          : ["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", attemptId]
        const crashed = Bun.spawn(command, {
          cwd: f.repo,
          env: { ...process.env, ...f.env, CE_OPTIMIZE_TEST_LAUNCH_FAULT: `${mode}-post-spawn-pre-pid` },
          stdout: "pipe",
          stderr: "pipe",
        })
        expect(await crashed.exited).toBe(86)
        await Promise.all([new Response(crashed.stdout).text(), new Response(crashed.stderr).text()])
        const evidencePath = mode === "route"
          ? path.join(f.controllerRoot, "run", "attempts", attemptId, "supervisor-route.json")
          : path.join(f.controllerRoot, "run", "attempts", attemptId, "supervisor-measurement-1.json")
        await waitForNonemptyFile(evidencePath)
        const evidence = JSON.parse(await readFile(evidencePath, "utf8"))
        expect(evidence).toMatchObject({ launch_cancelled: true, runs: [], all_descendants_gone: true })

        const beforeRecovery = await checked(["python3", "-I", "-S", CONTROLLER, "status", "--run-id", "run"], f.repo, f.env)
        const lifecycle = mode === "route"
          ? beforeRecovery.body.attempts[attemptId].process
          : beforeRecovery.body.attempts[attemptId].measurement_process
        expect(lifecycle.pid).toBeNull()
        expect(lifecycle.state).toBe(mode === "route" ? "dispatching" : "launch-authorized")

        if (mode === "route") {
          const recovered = await checked(command, f.repo, f.env)
          expect(recovered.body).toMatchObject({ outcome: "unavailable", exit_code: 125 })
          await expect(stat(path.join(worktree, "capture.json"))).rejects.toThrow()
          const abandoned = await checked([
            "python3", "-I", "-S", CONTROLLER, "abandon", "--run-id", "run",
            "--attempt-id", attemptId, "--reason", "verified-barrier-cancellation",
          ], f.repo, f.env)
          expect(abandoned.word).toBe("ABANDONED")
        } else {
          const recovered = await checked(command, f.repo, f.env)
          expect(recovered.word).toBe("MEASURED")
          const status = await checked(["python3", "-I", "-S", CONTROLLER, "status", "--run-id", "run"], f.repo, f.env)
          expect(status.body.attempts[attemptId].measurement_process).toMatchObject({ state: "done", generation: 2 })
        }
      } finally {
        await rm(f.root, { recursive: true, force: true })
      }
    },
  )

  test("reaps double-forked setsid author descendants before terminal evidence", async () => {
    const f = await fixture({ fakeMode: "setsid" })
    try {
      await start(f)
      const worktree = await createWorktree(f, "setsid")
      await lock(f, worktree, "attempt-setsid", 0, "setsid")
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-setsid", "--prompt", f.prompt], f.repo, f.env)
      await Bun.sleep(1200)
      await expect(stat(path.join(worktree, "late-author"))).rejects.toThrow()
      const state = await checked(["python3", "-I", "-S", CONTROLLER, "status", "--run-id", "run"], f.repo, f.env)
      expect(state.body.attempts["attempt-setsid"].process.state).toBe("done")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("reaps double-forked setsid measurement descendants before marking", async () => {
    const f = await fixture({ measurementMode: "setsid" })
    try {
      await start(f)
      const worktree = await createWorktree(f, "setsid-measure")
      await lock(f, worktree, "attempt-setsid-measure", 0, "setsid-measure")
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-setsid-measure", "--prompt", f.prompt], f.repo, f.env)
      await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-setsid-measure"], f.repo, f.env)
      const measured = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-setsid-measure"], f.repo, f.env)
      expect(measured.body.exit_code).toBe(0)
      await Bun.sleep(1200)
      await expect(stat(path.join(worktree, "late-measure"))).rejects.toThrow()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects a forged CP-3 row instead of accepting caller-supplied hashes", async () => {
    const f = await fixture()
    try {
      await start(f)
      const worktree = await createWorktree(f, "forged-checkpoint")
      await lock(f, worktree, "attempt-checkpoint", 0, "checkpoint")
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-checkpoint", "--prompt", f.prompt], f.repo, f.env)
      await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-checkpoint"], f.repo, f.env)
      const measured = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-checkpoint"], f.repo, f.env)
      const checkpointPath = await writeCheckpoint(f, "attempt-checkpoint", measured.body, { result_marker_digest: "0".repeat(64) })
      const forged = await run(["python3", "-I", "-S", CONTROLLER, "checkpoint", "--run-id", "run", "--attempt-id", "attempt-checkpoint", "--checkpoint-path", checkpointPath], f.repo, f.env)
      expect(forged.exitCode).toBe(4)
      expect(forged.stderr).toMatch(/CP-3 evidence/i)
      const state = await checked(["python3", "-I", "-S", CONTROLLER, "status", "--run-id", "run"], f.repo, f.env)
      expect(state.body.attempts["attempt-checkpoint"].final_state).toBeNull()
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("keeps a completed checkpoint valid when later rows append and allowed outcome fields change", async () => {
    const f = await fixture()
    try {
      const attemptId = "attempt-append-safe"
      await prepareAcceptedAuthor(f, "append-safe", attemptId)
      const measured = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", attemptId], f.repo, f.env)
      const checkpointPath = await writeCheckpoint(f, attemptId, measured.body, { outcome: "candidate" })
      const checkpoint = await checked(["python3", "-I", "-S", CONTROLLER, "checkpoint", "--run-id", "run", "--attempt-id", attemptId, "--checkpoint-path", checkpointPath], f.repo, f.env)
      expect(checkpoint.body.digest).toMatch(/^[a-f0-9]{64}$/)

      const log = JSON.parse(await readFile(checkpointPath, "utf8"))
      log.experiments[0].outcome = "winner"
      log.experiments[0].notes = "updated after comparison"
      log.experiments.push({ run_id: "other-run", attempt_id: attemptId, outcome: "candidate" })
      await writeFile(checkpointPath, JSON.stringify(log))

      const status = await checked(["python3", "-I", "-S", CONTROLLER, "status", "--run-id", "run"], f.repo, f.env)
      expect(status.body.attempts[attemptId].final_state).toBe("completed")
      expect(status.body.attempts[attemptId].checkpoint.digest).toBe(checkpoint.body.digest)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("blocks a completed checkpoint when its immutable controller evidence changes", async () => {
    const f = await fixture()
    try {
      const attemptId = "attempt-immutable-checkpoint"
      await prepareAcceptedAuthor(f, "immutable-checkpoint", attemptId)
      const measured = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", attemptId], f.repo, f.env)
      const checkpointPath = await writeCheckpoint(f, attemptId, measured.body)
      await checked(["python3", "-I", "-S", CONTROLLER, "checkpoint", "--run-id", "run", "--attempt-id", attemptId, "--checkpoint-path", checkpointPath], f.repo, f.env)

      const log = JSON.parse(await readFile(checkpointPath, "utf8"))
      log.experiments[0].metrics_digest = "0".repeat(64)
      await writeFile(checkpointPath, JSON.stringify(log))
      const blocked = await run(["python3", "-I", "-S", CONTROLLER, "status", "--run-id", "run"], f.repo, f.env)
      expect(blocked.exitCode).toBe(4)
      expect(blocked.stderr).toMatch(/checkpoint.*immutable|CP-3 evidence/i)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("excludes project-owned Codex executables before dispatch", async () => {
    const f = await fixture()
    try {
      await start(f)
      const worktree = await createWorktree(f, "project-executable")
      const projectExecutable = path.join(f.repo, "codex")
      await writeFile(projectExecutable, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
      await chmod(projectExecutable, 0o755)
      const unavailable = await checked([
        "python3", "-I", "-S", CONTROLLER, "lock-attempt", "--run-id", "run",
        "--attempt-id", "project-executable", "--role", "author", "--instance-id", "project-executable",
        "--ordinal", "0", "--adapter", "codex", "--worktree", worktree,
        "--executable", projectExecutable, "--auth-manifest", f.authManifest,
      ], f.repo, f.env)
      expect(unavailable.word).toBe("UNAVAILABLE")
      expect(unavailable.body.preflight_error).toMatch(/project or experiment worktree/i)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([0o775, 0o777])("rejects a mode %o group/world-writable Codex executable", async (mode) => {
    const f = await fixture()
    try {
      await start(f)
      const worktree = await createWorktree(f, `executable-${mode.toString(8)}`)
      await chmod(f.fake, mode)
      const unavailable = await lock(f, worktree, `attempt-executable-${mode.toString(8)}`, 0, `executable-${mode.toString(8)}`)
      expect(unavailable.word).toBe("UNAVAILABLE")
      expect(unavailable.body.preflight_error).toMatch(/owner\/mode trusted/i)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects an executable below an unsafe non-sticky writable ancestor", async () => {
    const f = await fixture()
    try {
      await start(f)
      const worktree = await createWorktree(f, "unsafe-executable-ancestor")
      await chmod(f.bin, 0o777)
      const unavailable = await lock(f, worktree, "attempt-unsafe-ancestor", 0, "unsafe-ancestor")
      expect(unavailable.word).toBe("UNAVAILABLE")
      expect(unavailable.body.preflight_error).toContain(f.bin)
      expect(unavailable.body.preflight_error).toMatch(/owner\/mode trusted/i)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("denies cleanup when the managed worktree is checked out on a different branch", async () => {
    const f = await fixture()
    try {
      const attemptId = "attempt-branch-mismatch"
      const worktree = await prepareAcceptedAuthor(f, "branch-mismatch", attemptId)
      const measured = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", attemptId], f.repo, f.env)
      const checkpointPath = await writeCheckpoint(f, attemptId, measured.body)
      await checked(["python3", "-I", "-S", CONTROLLER, "checkpoint", "--run-id", "run", "--attempt-id", attemptId, "--checkpoint-path", checkpointPath], f.repo, f.env)
      await checked(["git", "-C", worktree, "checkout", "-q", "-b", "optimize-exp/mismatch/exp-999"], f.repo, f.env)

      const cleanup = await run(["bash", WORKTREE, "cleanup", "branch-mismatch", "1"], f.repo, f.env)
      expect(cleanup.exitCode).not.toBe(0)
      expect(cleanup.stderr).toMatch(/unexpected branch/i)
      expect((await stat(worktree)).isDirectory()).toBe(true)
      const originalBranch = await run(["git", "show-ref", "--verify", "refs/heads/optimize-exp/branch-mismatch/exp-001"], f.repo, f.env)
      expect(originalBranch.exitCode).toBe(0)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("holds the worktree lock across cleanup so a new attempt cannot race mutation", async () => {
    const f = await fixture()
    try {
      await start(f)
      const worktree = await createWorktree(f, "cleanup-race")
      await lock(f, worktree, "attempt-cleanup", 0, "cleanup")
      await checked(["python3", "-I", "-S", CONTROLLER, "dispatch", "--run-id", "run", "--attempt-id", "attempt-cleanup", "--prompt", f.prompt], f.repo, f.env)
      await checked(["python3", "-I", "-S", CONTROLLER, "finalize", "--run-id", "run", "--attempt-id", "attempt-cleanup"], f.repo, f.env)
      const measured = await checked(["python3", "-I", "-S", CONTROLLER, "measure", "--run-id", "run", "--attempt-id", "attempt-cleanup"], f.repo, f.env)
      const checkpointPath = await writeCheckpoint(f, "attempt-cleanup", measured.body)
      await checked(["python3", "-I", "-S", CONTROLLER, "checkpoint", "--run-id", "run", "--attempt-id", "attempt-cleanup", "--checkpoint-path", checkpointPath], f.repo, f.env)

      const cleanup = Bun.spawn(["bash", WORKTREE, "cleanup", "cleanup-race", "1"], {
        cwd: f.repo,
        env: { ...process.env, ...f.env, CE_OPTIMIZE_TEST_MUTATION_PAUSE: "1" },
        stdout: "pipe",
        stderr: "pipe",
      })
      await Bun.sleep(200)
      const racingLock = await run([
        "python3", "-I", "-S", CONTROLLER, "lock-attempt", "--run-id", "run",
        "--attempt-id", "attempt-racing", "--role", "author", "--instance-id", "racing",
        "--ordinal", "0", "--adapter", "codex", "--worktree", worktree,
        "--executable", f.fake, "--auth-manifest", f.authManifest,
      ], f.repo, f.env)
      const cleanupStderr = await new Response(cleanup.stderr).text()
      expect(await cleanup.exited, cleanupStderr).toBe(0)
      expect(racingLock.exitCode).toBe(4)
      const state = await checked(["python3", "-I", "-S", CONTROLLER, "status", "--run-id", "run"], f.repo, f.env)
      expect(state.body.attempts).not.toHaveProperty("attempt-racing")
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })
})
