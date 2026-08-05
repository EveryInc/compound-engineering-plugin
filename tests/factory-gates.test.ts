import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"

// Executes the real canonical gate script (execute-don't-shape-check, per
// tests/scratch-root-preamble-executes.test.ts). Runs on every platform; CI runs it
// under real win32 via an explicit windows-native job step.
//
// Exit-code contract under test (KTD4): exit 0 = the gate ran and produced a result
// (even all-failing checks); non-zero = infrastructure failure only. `journal` alone
// always exits 0.

const SCRIPT = path.join(import.meta.dir, "..", "skills", "ce-work", "scripts", "factory-gates.py")

// Probe by execution, not presence: on native Windows `python3` can be the
// Microsoft Store stub (a real file on PATH that exits non-zero). See
// docs/solutions/conventions/resolve-python-interpreter-not-python3.md.
const PYTHON = ["python3", "python", "py"].find(
  (cand) => spawnSync(cand, ["-c", ""], { encoding: "utf8" }).status === 0,
)
if (!PYTHON) throw new Error("no working Python 3 interpreter on PATH (tried python3, python, py)")

// Every test spawns at least one subprocess; git-backed tests spawn several. Well past
// bun's 5s default once `bun run test --parallel` has workers competing for process
// creation, which is slowest exactly where this file matters most (Windows).
setDefaultTimeout(120_000)

const ROOT = mkdtempSync(path.join(tmpdir(), "factory-gates-"))
afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

let caseCounter = 0
function caseDir(): string {
  const dir = path.join(ROOT, `case-${caseCounter++}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeJson(dir: string, name: string, value: unknown): string {
  const p = path.join(dir, name)
  writeFileSync(p, JSON.stringify(value), "utf8")
  return p
}

function run(args: string[]) {
  return spawnSync(PYTHON, [SCRIPT, ...args], { encoding: "utf8" })
}

/** Run and require the ran-and-produced-a-result exit class (0), returning parsed stdout. */
function runOk(args: string[]): any {
  const r = run(args)
  expect(r.status, `stderr: ${r.stderr}`).toBe(0)
  return JSON.parse(r.stdout)
}

function git(repo: string, ...args: string[]) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" })
  expect(r.status, `git ${args.join(" ")} failed: ${r.stderr}`).toBe(0)
  return r
}

function initRepoWithCommit(dir: string, files: Record<string, string>): void {
  git(dir, "init", "-q")
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel)
    mkdirSync(path.dirname(p), { recursive: true })
    writeFileSync(p, content, "utf8")
  }
  git(dir, "add", "-A")
  git(
    dir,
    "-c", "user.email=gates@test.invalid",
    "-c", "user.name=gates",
    "-c", "commit.gpgsign=false",
    "commit", "-q", "-m", "seed",
  )
}

describe("artifacts", () => {
  test("all claimed files exist and are non-empty -> ok with per-item checks", () => {
    const dir = caseDir()
    const a = path.join(dir, "a.txt")
    const b = path.join(dir, "b.txt")
    writeFileSync(a, "alpha", "utf8")
    writeFileSync(b, "beta", "utf8")
    const claims = writeJson(dir, "claims.json", { artifacts: [a, b] })
    const out = runOk(["artifacts", "--claims", claims])
    expect(out.ok).toBe(true)
    expect(out.checks).toHaveLength(2)
    for (const check of out.checks) expect(check.ok).toBe(true)
  })

  test("one missing artifact -> ok:false naming exactly that path", () => {
    const dir = caseDir()
    const present = path.join(dir, "present.txt")
    writeFileSync(present, "content", "utf8")
    const missing = path.join(dir, "does-not-exist.txt")
    const claims = writeJson(dir, "claims.json", { artifacts: [present, missing] })
    const out = runOk(["artifacts", "--claims", claims])
    expect(out.ok).toBe(false)
    const failed = out.checks.filter((c: any) => !c.ok)
    expect(failed).toHaveLength(1)
    expect(failed[0].item).toBe(missing)
    expect(failed[0].note).toContain("missing")
  })

  test("empty file is flagged distinctly from missing", () => {
    const dir = caseDir()
    const empty = path.join(dir, "empty.txt")
    writeFileSync(empty, "", "utf8")
    const claims = writeJson(dir, "claims.json", { artifacts: [empty] })
    const out = runOk(["artifacts", "--claims", claims])
    expect(out.ok).toBe(false)
    expect(out.checks[0].ok).toBe(false)
    expect(out.checks[0].note).toContain("empty")
    expect(out.checks[0].note).not.toContain("missing")
  })

  test("empty claims list -> explicit vacuous pass with zero checks", () => {
    const dir = caseDir()
    const claims = writeJson(dir, "claims.json", { artifacts: [] })
    const out = runOk(["artifacts", "--claims", claims])
    expect(out.ok).toBe(true)
    expect(out.checks).toEqual([])
  })

  test("malformed claims JSON -> infrastructure failure (non-zero)", () => {
    const dir = caseDir()
    const bad = path.join(dir, "bad.json")
    writeFileSync(bad, "{not json", "utf8")
    const r = run(["artifacts", "--claims", bad])
    expect(r.status).not.toBe(0)
  })
})

describe("diff-claims", () => {
  test("claimed file untouched in git -> missing_claims and ok:false", () => {
    const repo = caseDir()
    initRepoWithCommit(repo, { "a.txt": "one" })
    const claims = writeJson(repo, "claims.json", { changed_files: ["a.txt"] })
    const out = runOk(["diff-claims", "--claims", claims, "--repo", repo])
    // claims.json itself is an unclaimed change, but claimed-but-untouched is what
    // must degrade the outcome here.
    expect(out.missing_claims).toEqual(["a.txt"])
    expect(out.ok).toBe(false)
  })

  test("touched-but-unclaimed inside scope is informational only", () => {
    const repo = caseDir()
    initRepoWithCommit(repo, { "src/b.txt": "committed" })
    writeFileSync(path.join(repo, "src", "b.txt"), "modified", "utf8")
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: [], scope: ["src"] })
    const out = runOk(["diff-claims", "--claims", claims, "--repo", repo])
    expect(out.unclaimed_changes).toContain("src/b.txt")
    expect(out.missing_claims).toEqual([])
    expect(out.ok).toBe(true)
  })

  test("touched-but-unclaimed outside scope -> ok:false", () => {
    const repo = caseDir()
    initRepoWithCommit(repo, { "a.txt": "committed", "src/b.txt": "committed" })
    writeFileSync(path.join(repo, "a.txt"), "modified", "utf8")
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: [], scope: ["src"] })
    const out = runOk(["diff-claims", "--claims", claims, "--repo", repo])
    expect(out.unclaimed_changes).toContain("a.txt")
    expect(out.ok).toBe(false)
  })

  test("untracked new file claimed and present -> ok", () => {
    const repo = caseDir()
    git(repo, "init", "-q")
    writeFileSync(path.join(repo, "new.txt"), "fresh", "utf8")
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: ["new.txt"] })
    const out = runOk(["diff-claims", "--claims", claims, "--repo", repo])
    expect(out.missing_claims).toEqual([])
    expect(out.ok).toBe(true)
  })

  test("run outside a git repo -> infrastructure failure, not a false pass", () => {
    const plain = caseDir()
    const claims = writeJson(plain, "claims.json", { changed_files: [] })
    const r = run(["diff-claims", "--claims", claims, "--repo", plain])
    expect(r.status).not.toBe(0)
  })
})

describe("verdict --report", () => {
  test("Ready to merge with an open P0 actionable finding -> contradiction", () => {
    const dir = caseDir()
    const report = writeJson(dir, "report.json", {
      verdict: "Ready to merge",
      actionable_findings: [{ severity: "P0", title: "data loss on retry" }],
    })
    const out = runOk(["verdict", "--report", report])
    expect(out.ok).toBe(false)
    expect(out.contradictions).toHaveLength(1)
    expect(out.contradictions[0]).toContain("P0")
  })

  test("Not ready with nothing named (no findings, no risks, no reason) -> contradiction", () => {
    const dir = caseDir()
    const report = writeJson(dir, "report.json", {
      verdict: "Not ready",
      actionable_findings: [],
      residual_risks: [],
    })
    const out = runOk(["verdict", "--report", report])
    expect(out.ok).toBe(false)
    expect(out.contradictions).toHaveLength(1)
  })

  test("Ready with fixes and zero findings carrying a suggested_fix -> contradiction", () => {
    const dir = caseDir()
    const report = writeJson(dir, "report.json", {
      verdict: "Ready with fixes",
      actionable_findings: [{ severity: "P2", title: "naming nit" }],
    })
    const out = runOk(["verdict", "--report", report])
    expect(out.ok).toBe(false)
    expect(out.contradictions).toHaveLength(1)
  })

  test("consistent Ready with fixes report -> ok", () => {
    const dir = caseDir()
    const report = writeJson(dir, "report.json", {
      verdict: "Ready with fixes",
      actionable_findings: [
        { severity: "P2", title: "naming nit", suggested_fix: "rename x to y" },
      ],
    })
    const out = runOk(["verdict", "--report", report])
    expect(out.ok).toBe(true)
    expect(out.contradictions).toEqual([])
  })

  test("malformed report JSON -> infrastructure failure", () => {
    const dir = caseDir()
    const bad = path.join(dir, "bad.json")
    writeFileSync(bad, "not json at all", "utf8")
    const r = run(["verdict", "--report", bad])
    expect(r.status).not.toBe(0)
  })
})

describe("verdict --acceptance", () => {
  const greenInputs = {
    review_verdict: "Ready to merge",
    verdict_consistency_flagged: false,
    verification_evidence_status: "green",
    babysit_status: null,
  }

  test("accepted:true with failed verification evidence -> contradiction naming the red input", () => {
    const dir = caseDir()
    const record = writeJson(dir, "acceptance.json", {
      accepted: true,
      reason: "all stages green",
      inputs: { ...greenInputs, verification_evidence_status: "red" },
    })
    const out = runOk(["verdict", "--acceptance", record])
    expect(out.ok).toBe(false)
    expect(out.contradictions.join(" ")).toContain("verification_evidence_status")
  })

  test("accepted:true with all inputs green -> ok", () => {
    const dir = caseDir()
    const record = writeJson(dir, "acceptance.json", {
      accepted: true,
      reason: "review clean, verification green",
      inputs: greenInputs,
    })
    const out = runOk(["verdict", "--acceptance", record])
    expect(out.ok).toBe(true)
    expect(out.contradictions).toEqual([])
  })

  test("accepted:false with all inputs green -> ok (conservative acceptance is never a contradiction)", () => {
    const dir = caseDir()
    const record = writeJson(dir, "acceptance.json", {
      accepted: false,
      reason: "residual risk too high for unattended merge",
      inputs: greenInputs,
    })
    const out = runOk(["verdict", "--acceptance", record])
    expect(out.ok).toBe(true)
    expect(out.contradictions).toEqual([])
  })

  test("missing structured-input fields -> infrastructure failure", () => {
    const dir = caseDir()
    const record = writeJson(dir, "acceptance.json", {
      accepted: true,
      reason: "looks fine",
      inputs: { review_verdict: "Ready to merge" },
    })
    const r = run(["verdict", "--acceptance", record])
    expect(r.status).not.toBe(0)
  })
})

describe("validate", () => {
  const SCHEMA = {
    type: "object",
    required: ["status"],
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["done", "failed"] },
      note: { type: ["string", "null"] },
      artifacts: { type: "array", items: { type: "string" } },
    },
  }

  test("envelope matching schema -> ok", () => {
    const dir = caseDir()
    const schema = writeJson(dir, "schema.json", SCHEMA)
    const envelope = writeJson(dir, "envelope.json", {
      status: "done",
      note: "fine",
      artifacts: ["a.txt"],
    })
    const out = runOk(["validate", "--schema", schema, "--envelope", envelope])
    expect(out.ok).toBe(true)
    expect(out.errors).toEqual([])
  })

  test("missing required field -> named error", () => {
    const dir = caseDir()
    const schema = writeJson(dir, "schema.json", SCHEMA)
    const envelope = writeJson(dir, "envelope.json", { note: "no status here" })
    const out = runOk(["validate", "--schema", schema, "--envelope", envelope])
    expect(out.ok).toBe(false)
    expect(out.errors.join(" ")).toContain("status")
  })

  test("extra property under additionalProperties:false -> named error", () => {
    const dir = caseDir()
    const schema = writeJson(dir, "schema.json", SCHEMA)
    const envelope = writeJson(dir, "envelope.json", { status: "done", surprise: 1 })
    const out = runOk(["validate", "--schema", schema, "--envelope", envelope])
    expect(out.ok).toBe(false)
    expect(out.errors.join(" ")).toContain("surprise")
  })

  test("null value against a type-array allowing null -> ok", () => {
    const dir = caseDir()
    const schema = writeJson(dir, "schema.json", SCHEMA)
    const envelope = writeJson(dir, "envelope.json", { status: "failed", note: null })
    const out = runOk(["validate", "--schema", schema, "--envelope", envelope])
    expect(out.ok).toBe(true)
  })

  test("schema with a keyword outside the supported subset -> infrastructure failure naming it", () => {
    const dir = caseDir()
    const schema = writeJson(dir, "schema.json", {
      type: "object",
      properties: { id: { type: "string", pattern: "^[a-z]+$" } },
    })
    const envelope = writeJson(dir, "envelope.json", { id: "abc" })
    const r = run(["validate", "--schema", schema, "--envelope", envelope])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("pattern")
  })
})

describe("journal", () => {
  const record = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      ts: "2026-08-05T12:00:00Z",
      run_id: "run-1",
      skill: "lfg",
      phase: "plan",
      status: "started",
      ...over,
    })

  test("first append creates parent dirs and file", () => {
    const dir = caseDir()
    const file = path.join(dir, "nested", "deeper", "journal.jsonl")
    const out = runOk(["journal", "--file", file, "--record", record()])
    expect(out.ok).toBe(true)
    expect(existsSync(file)).toBe(true)
  })

  test("two sequential appends yield two parseable JSONL lines", () => {
    const dir = caseDir()
    const file = path.join(dir, "journal.jsonl")
    runOk(["journal", "--file", file, "--record", record()])
    runOk(["journal", "--file", file, "--record", record({ phase: "work", status: "completed" })])
    const lines = readFileSync(file, "utf8").trim().split("\n")
    expect(lines).toHaveLength(2)
    const parsed = lines.map((l) => JSON.parse(l))
    expect(parsed[0].phase).toBe("plan")
    expect(parsed[1].status).toBe("completed")
  })

  test("record missing status -> ok:false but exit 0", () => {
    const dir = caseDir()
    const file = path.join(dir, "journal.jsonl")
    const bad = JSON.stringify({ ts: "t", run_id: "r", skill: "s", phase: "p" })
    const out = runOk(["journal", "--file", file, "--record", bad])
    expect(out.ok).toBe(false)
    expect(out.note).toContain("status")
    expect(existsSync(file)).toBe(false)
  })

  test("invalid record JSON -> ok:false but exit 0", () => {
    const dir = caseDir()
    const file = path.join(dir, "journal.jsonl")
    const out = runOk(["journal", "--file", file, "--record", "{broken"])
    expect(out.ok).toBe(false)
  })

  test("unwritable path -> exit 0 with failure note (never blocks the caller)", () => {
    const dir = caseDir()
    // A regular file as a path segment makes the parent un-creatable on every OS,
    // unlike chmod-based setups (no-op for root, unreliable on Windows).
    const blocker = path.join(dir, "blocker")
    writeFileSync(blocker, "i am a file", "utf8")
    const file = path.join(blocker, "sub", "journal.jsonl")
    const out = runOk(["journal", "--file", file, "--record", record()])
    expect(out.ok).toBe(false)
    expect(out.note.length).toBeGreaterThan(0)
  })
})
