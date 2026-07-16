import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
} from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"

async function scratchContractFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(root, entry.name)
      if (entry.isDirectory()) return scratchContractFiles(absolute)
      return entry.isFile() && /\.(md|py|sh)$/.test(entry.name) ? [absolute] : []
    }),
  )
  return nested.flat()
}

describe("owner-scoped scratch root contract", () => {
  const helper = path.join(
    process.cwd(),
    "skills",
    "ce-code-review",
    "scripts",
    "scratch-root.py",
  )

  function runHelper(
    args: string[],
    env: Record<string, string | undefined>,
  ): ReturnType<typeof spawnSync> {
    const cleanEnv = { ...process.env }
    delete cleanEnv.COMPOUND_ENGINEERING_SCRATCH_ROOT
    delete cleanEnv.COMPOUND_ENGINEERING_CACHE_ROOT
    delete cleanEnv.COMPOUND_ENGINEERING_STATE_ROOT
    delete cleanEnv.COMPOUND_ENGINEERING_DATA_ROOT
    delete cleanEnv.XDG_RUNTIME_DIR
    delete cleanEnv.XDG_CACHE_HOME
    delete cleanEnv.XDG_STATE_HOME
    delete cleanEnv.XDG_DATA_HOME
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete cleanEnv[key]
      else cleanEnv[key] = value
    }
    return spawnSync("python3", [helper, ...args], {
      encoding: "utf8",
      env: cleanEnv,
    })
  }

  test("skill instructions never use the legacy shared scratch root", async () => {
    const files = await scratchContractFiles(path.join(process.cwd(), "skills"))
    const offenders: string[] = []
    const unsafeConstructions = [
      "/tmp/compound-engineering/",
      'DEFAULT_ROOT = "/tmp/compound-engineering"',
      "DEFAULT_ROOT = '/tmp/compound-engineering'",
      'os.path.join("/tmp", "compound-engineering")',
      "os.path.join('/tmp', 'compound-engineering')",
    ]

    for (const file of files) {
      const content = await readFile(file, "utf8")
      if (unsafeConstructions.some((construction) => content.includes(construction))) {
        offenders.push(path.relative(process.cwd(), file))
      }
    }

    expect(offenders).toEqual([])
  })

  test("published skill guidance and plans never teach the legacy shared root", async () => {
    const roots = [
      path.join(process.cwd(), "docs", "skills"),
      path.join(process.cwd(), "docs", "plans"),
      path.join(process.cwd(), "docs", "solutions"),
    ]
    const intentionalIncidentAnalyses = new Set([
      path.join(
        process.cwd(),
        "docs",
        "solutions",
        "best-practices",
        "owner-scoped-scratch-space.md",
      ),
      path.join(
        process.cwd(),
        "docs",
        "solutions",
        "best-practices",
        "predictable-tmp-cache-ownership-check.md",
      ),
    ])
    const files = (await Promise.all(roots.map(scratchContractFiles))).flat()
    const offenders: string[] = []
    for (const file of files) {
      if (intentionalIncidentAnalyses.has(file)) continue
      const content = await readFile(file, "utf8")
      if (content.includes("/tmp/compound-engineering/")) {
        offenders.push(path.relative(process.cwd(), file))
      }
    }
    expect(offenders).toEqual([])
  })

  test("run-producing skills resolve a UID-scoped or overridden root", async () => {
    const runProducingSkills = [
      "ce-brainstorm",
      "ce-babysit-pr",
      "ce-code-review",
      "ce-compound",
      "ce-doc-review",
      "ce-explain",
      "ce-ideate",
      "ce-pov",
      "ce-sweep",
      "ce-test-browser",
    ]

    for (const skill of runProducingSkills) {
      const files = await scratchContractFiles(path.join(process.cwd(), "skills", skill))
      const content = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n")
      expect(content).toContain("COMPOUND_ENGINEERING_SCRATCH_ROOT")
      expect(content).toContain("scripts/scratch-root.py")
    }
  })

  test("resolver copies are present and byte-identical in every scratch consumer", async () => {
    const consumers = [
      "ce-babysit-pr",
      "ce-brainstorm",
      "ce-code-review",
      "ce-compound",
      "ce-debug",
      "ce-doc-review",
      "ce-explain",
      "ce-ideate",
      "ce-optimize",
      "ce-plan",
      "ce-pov",
      "ce-sweep",
      "ce-test-browser",
    ]
    const copies = await Promise.all(
      consumers.map((skill) =>
        readFile(path.join(process.cwd(), "skills", skill, "scripts", "scratch-root.py"), "utf8"),
      ),
    )
    for (const copy of copies.slice(1)) expect(copy).toBe(copies[0])
  })

  test("skill lifecycle handoffs use exact resolver paths and the correct namespace", async () => {
    const read = (relative: string) =>
      readFile(path.join(process.cwd(), relative), "utf8")
    const [
      ideate,
      webCache,
      postIdeation,
      brainstormHandoff,
      visualProbes,
      sweepSkill,
      sweepInterview,
      reviewerTemplate,
      povPanel,
      compound,
      docReviewCrossModel,
      explain,
      babysitPublished,
      planDeepening,
      browserPipeline,
      povScript,
      codeReviewScript,
      docReviewScript,
      optimize,
    ] = await Promise.all([
      read("skills/ce-ideate/SKILL.md"),
      read("skills/ce-ideate/references/web-research-cache.md"),
      read("skills/ce-ideate/references/post-ideation-workflow.md"),
      read("skills/ce-brainstorm/references/handoff.md"),
      read("skills/ce-brainstorm/references/visual-probes.md"),
      read("skills/ce-sweep/SKILL.md"),
      read("skills/ce-sweep/references/interview.md"),
      read("skills/ce-code-review/references/subagent-template.md"),
      read("skills/ce-pov/references/cross-model-panel.md"),
      read("skills/ce-compound/SKILL.md"),
      read("skills/ce-doc-review/references/cross-model-review.md"),
      read("skills/ce-explain/SKILL.md"),
      read("docs/skills/ce-babysit-pr.md"),
      read("skills/ce-plan/references/deepening-workflow.md"),
      read("skills/ce-test-browser/references/pipeline-orchestration.md"),
      read("skills/ce-pov/scripts/cross-model-pov.sh"),
      read("skills/ce-code-review/scripts/cross-model-adversarial-review.sh"),
      read("skills/ce-doc-review/scripts/cross-model-doc-review.sh"),
      read("skills/ce-optimize/SKILL.md"),
    ])

    expect(ideate).toContain("disposable artifacts in this run")
    expect(webCache).toContain('cache-subdir "ce-ideate-web-v15"')
    expect(webCache).not.toContain("RUNS_ROOT")
    expect(postIdeation).toContain('data-subdir "ideation"')
    expect(postIdeation).toContain("remove-run-dir --skill ce-ideate")
    expect(brainstormHandoff).toContain("<captured-scratch-dir>/grounding.md")
    expect(brainstormHandoff).not.toContain("$SCRATCH_ROOT/")
    expect(brainstormHandoff).toContain(
      'remove-run-dir --skill ce-brainstorm "$SCRATCH_DIR"',
    )
    expect(visualProbes).toContain("run-dir --skill ce-brainstorm")
    expect(visualProbes).not.toContain('state-subdir "ce-brainstorm')
    expect(sweepSkill).toContain(
      'remove-run-dir --skill ce-sweep "$RUN_DIR"',
    )
    expect(sweepSkill).not.toContain("retain the media")
    expect(sweepInterview).toContain('state-subdir "ce-sweep/<stable-repo-key>"')
    expect(sweepInterview).not.toContain('basename "$PWD"')
    expect(sweepInterview).not.toContain("/tmp path (solo)")
    expect(sweepInterview).toContain("owner-private persistent state path (solo)")
    expect(reviewerTemplate).toContain("Run directory: {run_dir}")
    expect(reviewerTemplate).toContain("| `{run_dir}` |")
    expect(povPanel).toContain('--run-dir "$SCRATCH_DIR"')
    expect(povPanel).toContain('CROSS_MODEL_SCRATCH_PARENT="$SCRATCH_DIR"')
    expect(povPanel).not.toContain("<scratch-root>/ce-pov/<run-id>")
    expect(compound).not.toContain("mktemp -d -t ce-compound-sessions")
    expect(compound).toContain(
      'remove-run-dir --skill ce-compound "$RUN_DIR"',
    )
    expect(docReviewCrossModel).toContain(
      'remove-run-dir --skill ce-doc-review "$RUN_DIR"',
    )
    expect(explain).not.toContain("temporary location that does not survive reboot")
    expect(explain).toContain("may survive reboot")
    expect(explain).toContain('remove-run-dir --skill ce-explain "$RUN_DIR"')
    expect(babysitPublished).toContain(
      'scratch-root.py state-subdir "ce-babysit-pr/<host>/<owner>/<repo>/<pr>"',
    )
    expect(babysitPublished).not.toContain("state-subdir --skill ce-babysit-pr")
    expect(planDeepening).toContain("scratch-root.py\" run-dir --skill ce-plan")
    expect(browserPipeline).not.toContain("/tmp/dev-server-")
    expect(browserPipeline).not.toContain("mktemp -d -t ce-test-browser-")
    expect(browserPipeline).toContain(
      'scratch-root.py" run-dir --skill ce-test-browser',
    )
    expect(browserPipeline).toContain('dev-server-supervisor.py" start')
    expect(browserPipeline).toContain('dev-server-supervisor.py" status')
    expect(browserPipeline).toContain(
      'dev-server-supervisor.py" stop --run-dir "$SERVER_RUN_DIR" --token "$SERVER_TOKEN"',
    )
    expect(browserPipeline).toContain("SERVER_TOKEN='<literal-server-token>'")
    expect(browserPipeline).toContain("verifies PID birth identities")
    expect(browserPipeline).toContain(
      "Server startup timed out and verified teardown failed; retained: $SERVER_RUN_DIR",
    )
    const startFailure = browserPipeline.slice(
      browserPipeline.indexOf("if ! START_JSON="),
      browserPipeline.indexOf("SERVER_TOKEN=$("),
    )
    expect(startFailure).not.toContain("scratch-root.py\" remove-run-dir")
    expect(startFailure).toContain("helper retained the owner-private lease")
    expect(browserPipeline).not.toContain("SERVER_SUPERVISOR_PID=$!")
    expect(browserPipeline).not.toContain("trap cleanup_server")
    expect(browserPipeline).not.toContain('kill -TERM "$SERVER_SUPERVISOR_PID"')
    expect(browserPipeline).not.toContain(
      'dev-server-supervisor.py" stop --run-dir "$SERVER_RUN_DIR" --token "$SERVER_TOKEN" 2>/dev/null || true',
    )
    expect(browserPipeline).toContain(
      'The pipeline run is not complete until the helper reports `"removed": true`',
    )
    expect(povScript).toContain('CROSS_MODEL_SCRATCH_PARENT:-$RUN_DIR')
    expect(codeReviewScript).toContain('TMPDIR="$RUN_DIR"')
    expect(docReviewScript).toContain('TMPDIR="$RUN_DIR"')
    expect(optimize).not.toContain("cat /tmp/optimize-exp-")
  })

  test("ce-sweep retries failed media analysis across invocations without retaining an opaque run", async () => {
    const sweep = await readFile(
      path.join(process.cwd(), "skills", "ce-sweep", "SKILL.md"),
      "utf8",
    )
    expect(sweep).toContain("sets the item back to `needs_download` (not `needs_analysis`)")
    expect(sweep).toContain("The next invocation of a `needs_download` item creates a fresh run")
    expect(sweep).toContain("The item state persists the count")
    expect(sweep).toContain('remove-run-dir --skill ce-sweep "$RUN_DIR"')
    expect(sweep).not.toContain("retain the media")
  })

  test("invalid explicit runtime overrides fall through without touching the candidate", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "ce-scratch-override-"))
    chmodSync(base, 0o700)
    const home = path.join(base, "home")
    mkdirSync(home, { mode: 0o700 })
    const fallback = path.join(home, ".cache", "compound-engineering", "tmp")

    const relative = runHelper(["root"], {
      COMPOUND_ENGINEERING_SCRATCH_ROOT: "relative/path",
      HOME: home,
    })
    expect(relative.status).toBe(0)
    expect(relative.stdout.trim()).toBe(fallback)

    const permissive = path.join(base, "permissive")
    mkdirSync(permissive, { mode: 0o755 })
    const wrongMode = runHelper(["root"], {
      COMPOUND_ENGINEERING_SCRATCH_ROOT: permissive,
      HOME: home,
    })
    expect(wrongMode.status).toBe(0)
    expect(wrongMode.stdout.trim()).toBe(fallback)
    expect(lstatSync(permissive).mode & 0o777).toBe(0o755)

    const target = path.join(base, "target")
    mkdirSync(target, { mode: 0o700 })
    const link = path.join(base, "link")
    symlinkSync(target, link)
    const symlinked = runHelper(["root"], {
      COMPOUND_ENGINEERING_SCRATCH_ROOT: link,
      HOME: home,
    })
    expect(symlinked.status).toBe(0)
    expect(symlinked.stdout.trim()).toBe(fallback)
  })

  test("same-owner legacy lifecycle descendants are tightened during upgrade", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ce-scratch-upgrade-"))
    chmodSync(root, 0o700)
    const skillDir = path.join(root, "ce-compound")
    const runsDir = path.join(skillDir, "runs")
    mkdirSync(runsDir, { recursive: true, mode: 0o775 })
    chmodSync(skillDir, 0o775)
    chmodSync(runsDir, 0o775)

    const result = runHelper(
      ["run-dir", "--skill", "ce-compound", "--run-id", "upgrade-proof"],
      { COMPOUND_ENGINEERING_SCRATCH_ROOT: root },
    )

    expect(result.status).toBe(0)
    expect(lstatSync(skillDir).mode & 0o777).toBe(0o700)
    expect(lstatSync(runsDir).mode & 0o777).toBe(0o700)
    expect(lstatSync(result.stdout.trim()).mode & 0o777).toBe(0o700)
  })

  test("canonical system temp supports macOS root-owned /tmp symlinks", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "ce-scratch-macos-tmp-"))
    chmodSync(base, 0o700)
    const target = path.join(base, "private-tmp")
    mkdirSync(target, { mode: 0o700 })
    const link = path.join(base, "tmp")
    symlinkSync(target, link)
    const probe = `
import importlib.util, stat, sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec = importlib.util.spec_from_file_location("scratch_root_probe", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
fake = SimpleNamespace(st_uid=0, st_mode=stat.S_IFLNK | 0o777)
real_lstat = module.os.lstat
def lstat(path):
    return fake if Path(path) == Path(sys.argv[2]) else real_lstat(path)
with patch.object(module.os, "lstat", side_effect=lstat):
    print(module._canonical_system_tmp(Path(sys.argv[2])))
`
    const result = spawnSync("python3", ["-c", probe, helper, link], {
      encoding: "utf8",
    })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(target)
  })

  test("hostile intermediate ancestors are skipped, not traversed or repaired", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "ce-scratch-hostile-"))
    chmodSync(base, 0o700)
    const home = path.join(base, "home")
    mkdirSync(home, { mode: 0o700 })
    const hostile = path.join(base, "hostile")
    mkdirSync(hostile, { mode: 0o777 })
    chmodSync(hostile, 0o777)
    const throughHostile = path.join(hostile, "private")
    mkdirSync(throughHostile, { mode: 0o700 })

    const result = runHelper(["root"], {
      COMPOUND_ENGINEERING_SCRATCH_ROOT: throughHostile,
      HOME: home,
    })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(
      path.join(home, ".cache", "compound-engineering", "tmp"),
    )
    expect(lstatSync(hostile).mode & 0o777).toBe(0o777)

    const real = path.join(base, "real")
    mkdirSync(real, { mode: 0o700 })
    const linkedParent = path.join(base, "linked-parent")
    symlinkSync(real, linkedParent)
    const symlinkResult = runHelper(["root"], {
      COMPOUND_ENGINEERING_SCRATCH_ROOT: path.join(linkedParent, "child"),
      HOME: home,
    })
    expect(symlinkResult.status).toBe(0)
    expect(existsSync(path.join(real, "child"))).toBe(false)
  })

  test("resolver prefers a valid XDG runtime dir, then owner-scoped HOME cache", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "ce-scratch-order-"))
    chmodSync(base, 0o700)
    const xdg = path.join(base, "xdg")
    const home = path.join(base, "home")
    mkdirSync(xdg, { mode: 0o700 })
    mkdirSync(home, { mode: 0o700 })

    const xdgResult = runHelper(["root"], { XDG_RUNTIME_DIR: xdg, HOME: home })
    expect(xdgResult.status).toBe(0)
    expect(xdgResult.stdout.trim()).toBe(path.join(xdg, "compound-engineering"))
    expect(lstatSync(xdgResult.stdout.trim()).mode & 0o777).toBe(0o700)

    chmodSync(xdg, 0o755)
    const homeResult = runHelper(["root"], { XDG_RUNTIME_DIR: xdg, HOME: home })
    expect(homeResult.status).toBe(0)
    expect(homeResult.stdout.trim()).toBe(
      path.join(home, ".cache", "compound-engineering", "tmp"),
    )
    expect(lstatSync(homeResult.stdout.trim()).mode & 0o777).toBe(0o700)
  })

  test("same-UID concurrent runs receive distinct private atomic directories", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ce-scratch-runs-"))
    chmodSync(root, 0o700)
    const env = { COMPOUND_ENGINEERING_SCRATCH_ROOT: root }
    const first = runHelper(["run-dir", "--skill", "ce-code-review", "--run-id", "same"], env)
    const second = runHelper(["run-dir", "--skill", "ce-code-review", "--run-id", "same"], env)
    expect(first.status).toBe(0)
    expect(second.status).toBe(0)
    expect(first.stdout.trim()).not.toBe(second.stdout.trim())
    for (const result of [first, second]) {
      expect(lstatSync(result.stdout.trim()).mode & 0o777).toBe(0o700)
    }
  })

  test("cache, state, and data lifecycles are persistent and independent of runtime XDG", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "ce-lifecycle-roots-"))
    chmodSync(base, 0o700)
    const home = path.join(base, "home")
    const runtimeA = path.join(base, "runtime-a")
    const runtimeB = path.join(base, "runtime-b")
    for (const dir of [home, runtimeA, runtimeB]) mkdirSync(dir, { mode: 0o700 })

    const firstEnv = { HOME: home, XDG_RUNTIME_DIR: runtimeA }
    const secondEnv = { HOME: home, XDG_RUNTIME_DIR: runtimeB }
    const stateA = runHelper(["state-subdir", "ce-babysit-pr/github/repo/1"], firstEnv)
    const stateB = runHelper(["state-subdir", "ce-babysit-pr/github/repo/1"], secondEnv)
    expect(stateA.status).toBe(0)
    expect(stateB.status).toBe(0)
    expect(stateB.stdout.trim()).toBe(stateA.stdout.trim())
    expect(stateA.stdout.trim()).toStartWith(path.join(home, ".local", "state"))

    const cache = runHelper(["cache-subdir", "repo-profile-v1"], firstEnv)
    const data = runHelper(["data-subdir", "ideation"], firstEnv)
    expect(cache.stdout.trim()).toStartWith(path.join(home, ".cache", "compound-engineering"))
    expect(data.stdout.trim()).toStartWith(path.join(home, ".local", "share"))
    expect(cache.stdout.trim()).not.toContain(`${path.sep}runs${path.sep}`)
    expect(data.stdout.trim()).not.toContain(`${path.sep}runs${path.sep}`)
  })

  test("remove-run-dir deletes only an exact direct run child", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ce-scratch-remove-"))
    chmodSync(root, 0o700)
    const env = { COMPOUND_ENGINEERING_SCRATCH_ROOT: root }
    const made = runHelper(["run-dir", "--skill", "ce-ideate", "--run-id", "cleanup"], env)
    const runDir = made.stdout.trim()
    expect(existsSync(runDir)).toBe(true)
    const removed = runHelper(["remove-run-dir", "--skill", "ce-ideate", runDir], env)
    expect(removed.status).toBe(0)
    expect(existsSync(runDir)).toBe(false)

    const refused = runHelper(["remove-run-dir", "--skill", "ce-ideate", root], env)
    expect(refused.status).toBe(1)
    expect(existsSync(root)).toBe(true)
  })

  test("the portability fallback is UID-scoped and never the legacy shared root", async () => {
    const source = await readFile(helper, "utf8")
    expect(source).toContain('_canonical_system_tmp() / f"compound-engineering-{uid}"')
    expect(source).not.toContain('Path("/tmp/compound-engineering")')

    const result = runHelper(["root"], { HOME: "relative-home" })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(
      path.join(realpathSync("/tmp"), `compound-engineering-${process.getuid!()}`),
    )
  })
})
