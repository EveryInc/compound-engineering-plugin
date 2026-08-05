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

  test("empty directory is flagged like an empty file", () => {
    const dir = caseDir()
    const emptyDir = path.join(dir, "empty-dir")
    mkdirSync(emptyDir)
    const claims = writeJson(dir, "claims.json", { artifacts: [emptyDir] })
    const out = runOk(["artifacts", "--claims", claims])
    expect(out.ok).toBe(false)
    expect(out.checks[0].ok).toBe(false)
    expect(out.checks[0].note).toContain("empty directory")
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

  test("committed claimed change with --base <pre-commit sha> -> ok", () => {
    const repo = caseDir()
    initRepoWithCommit(repo, { "a.txt": "one" })
    const base = git(repo, "rev-parse", "HEAD").stdout.trim()
    writeFileSync(path.join(repo, "a.txt"), "two", "utf8")
    git(repo, "add", "-A")
    git(
      repo,
      "-c", "user.email=gates@test.invalid",
      "-c", "user.name=gates",
      "-c", "commit.gpgsign=false",
      "commit", "-q", "-m", "change a",
    )
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: ["a.txt"] })
    const out = runOk(["diff-claims", "--claims", claims, "--repo", repo, "--base", base])
    expect(out.missing_claims).toEqual([])
    expect(out.ok).toBe(true)
  })

  test("same committed change without --base -> missing_claims (documents the HEAD-only limitation)", () => {
    const repo = caseDir()
    initRepoWithCommit(repo, { "a.txt": "one" })
    writeFileSync(path.join(repo, "a.txt"), "two", "utf8")
    git(repo, "add", "-A")
    git(
      repo,
      "-c", "user.email=gates@test.invalid",
      "-c", "user.name=gates",
      "-c", "commit.gpgsign=false",
      "commit", "-q", "-m", "change a",
    )
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: ["a.txt"] })
    const out = runOk(["diff-claims", "--claims", claims, "--repo", repo])
    expect(out.missing_claims).toEqual(["a.txt"])
    expect(out.ok).toBe(false)
  })

  test("--base with an unresolvable ref -> infrastructure failure", () => {
    const repo = caseDir()
    initRepoWithCommit(repo, { "a.txt": "one" })
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: [] })
    const r = run(["diff-claims", "--claims", claims, "--repo", repo, "--base", "no-such-ref"])
    expect(r.status).not.toBe(0)
  })

  test("filename with spaces and non-ASCII survives -z parsing byte-exact", () => {
    const repo = caseDir()
    const odd = "sp ace éü.txt"
    initRepoWithCommit(repo, { "seed.txt": "one" })
    writeFileSync(path.join(repo, odd), "content", "utf8")
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: [odd] })
    const out = runOk(["diff-claims", "--claims", claims, "--repo", repo])
    expect(out.missing_claims).toEqual([])
    expect(out.unclaimed_changes).not.toContain(`"${odd}"`)
    expect(out.ok).toBe(true)
  })

  test("staged rename resolves to the NEW path (extra -z origin field skipped)", () => {
    const repo = caseDir()
    initRepoWithCommit(repo, { "old-name.txt": "content" })
    git(repo, "mv", "old-name.txt", "new-name.txt")
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: ["new-name.txt"] })
    const out = runOk(["diff-claims", "--claims", claims, "--repo", repo])
    expect(out.missing_claims).toEqual([])
    expect(out.unclaimed_changes).not.toContain("old-name.txt -> new-name.txt")
    expect(out.ok).toBe(true)
  })

  test('filename containing a literal " -> " is not split into pieces', () => {
    const repo = caseDir()
    const tricky = "a -> b.txt"
    initRepoWithCommit(repo, { "seed.txt": "one" })
    writeFileSync(path.join(repo, tricky), "content", "utf8")
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: [tricky] })
    const out = runOk(["diff-claims", "--claims", claims, "--repo", repo])
    expect(out.missing_claims).toEqual([])
    expect(out.unclaimed_changes).not.toContain("b.txt")
    expect(out.ok).toBe(true)
  })

  test('scope [""] -> infrastructure failure naming the blank prefix', () => {
    const repo = caseDir()
    initRepoWithCommit(repo, { "a.txt": "one" })
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: [], scope: [""] })
    const r = run(["diff-claims", "--claims", claims, "--repo", repo])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("scope prefix")
  })

  test("absolute scope prefix -> infrastructure failure naming it", () => {
    const repo = caseDir()
    initRepoWithCommit(repo, { "a.txt": "one" })
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: [], scope: ["/etc"] })
    const r = run(["diff-claims", "--claims", claims, "--repo", repo])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("/etc")
  })

  test('scope ["."] means everything in scope (unclaimed stays informational)', () => {
    const repo = caseDir()
    initRepoWithCommit(repo, { "a.txt": "committed" })
    writeFileSync(path.join(repo, "a.txt"), "modified", "utf8")
    const claimsDir = caseDir()
    const claims = writeJson(claimsDir, "claims.json", { changed_files: [], scope: ["."] })
    const out = runOk(["diff-claims", "--claims", claims, "--repo", repo])
    expect(out.unclaimed_changes).toContain("a.txt")
    expect(out.ok).toBe(true)
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
    fixes_applied_status: "none-eligible",
    residuals_durable: null,
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

  test('mis-cased "GREEN" evidence status -> infrastructure failure, never silent green', () => {
    const dir = caseDir()
    const record = writeJson(dir, "acceptance.json", {
      accepted: true,
      inputs: { ...greenInputs, verification_evidence_status: "GREEN" },
    })
    const r = run(["verdict", "--acceptance", record])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("verification_evidence_status")
  })

  test("verdict_consistency_flagged: 1 (non-boolean) -> infrastructure failure", () => {
    const dir = caseDir()
    const record = writeJson(dir, "acceptance.json", {
      accepted: true,
      inputs: { ...greenInputs, verdict_consistency_flagged: 1 },
    })
    const r = run(["verdict", "--acceptance", record])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("verdict_consistency_flagged")
  })

  test("review_verdict null -> infrastructure failure", () => {
    const dir = caseDir()
    const record = writeJson(dir, "acceptance.json", {
      accepted: true,
      inputs: { ...greenInputs, review_verdict: null },
    })
    const r = run(["verdict", "--acceptance", record])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("review_verdict")
  })

  test("accepted:true with fixes_applied_status not-applied -> contradiction", () => {
    const dir = caseDir()
    const record = writeJson(dir, "acceptance.json", {
      accepted: true,
      inputs: { ...greenInputs, fixes_applied_status: "not-applied" },
    })
    const out = runOk(["verdict", "--acceptance", record])
    expect(out.ok).toBe(false)
    expect(out.contradictions.join(" ")).toContain("fixes_applied_status")
  })

  test("accepted:true with residuals_durable false -> contradiction", () => {
    const dir = caseDir()
    const record = writeJson(dir, "acceptance.json", {
      accepted: true,
      inputs: { ...greenInputs, residuals_durable: false },
    })
    const out = runOk(["verdict", "--acceptance", record])
    expect(out.ok).toBe(false)
    expect(out.contradictions.join(" ")).toContain("residuals_durable")
  })

  test("the two new fields green (applied + residuals_durable true) -> ok", () => {
    const dir = caseDir()
    const record = writeJson(dir, "acceptance.json", {
      accepted: true,
      inputs: { ...greenInputs, fixes_applied_status: "applied", residuals_durable: true },
    })
    const out = runOk(["verdict", "--acceptance", record])
    expect(out.ok).toBe(true)
    expect(out.contradictions).toEqual([])
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

  test('additionalProperties as the string "false" -> infrastructure failure naming the value', () => {
    const dir = caseDir()
    const schema = writeJson(dir, "schema.json", {
      type: "object",
      additionalProperties: "false",
      properties: { id: { type: "string" } },
    })
    const envelope = writeJson(dir, "envelope.json", { id: "abc" })
    const r = run(["validate", "--schema", schema, "--envelope", envelope])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("'false'")
  })

  test("unsupported name inside a type array fails even when the value matches an earlier name", () => {
    const dir = caseDir()
    const schema = writeJson(dir, "schema.json", {
      type: "object",
      properties: { id: { type: ["string", "bogus"] } },
    })
    const envelope = writeJson(dir, "envelope.json", { id: "abc" })
    const r = run(["validate", "--schema", schema, "--envelope", envelope])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("bogus")
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

  test("--record-file append works like --record", () => {
    const dir = caseDir()
    const file = path.join(dir, "journal.jsonl")
    const recFile = path.join(dir, "record.json")
    writeFileSync(recFile, record(), "utf8")
    const out = runOk(["journal", "--file", file, "--record-file", recFile])
    expect(out.ok).toBe(true)
    const lines = readFileSync(file, "utf8").trim().split("\n")
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).phase).toBe("plan")
  })

  test("--record-file with invalid JSON -> ok:false but exit 0", () => {
    const dir = caseDir()
    const file = path.join(dir, "journal.jsonl")
    const recFile = path.join(dir, "record.json")
    writeFileSync(recFile, "{broken", "utf8")
    const out = runOk(["journal", "--file", file, "--record-file", recFile])
    expect(out.ok).toBe(false)
    expect(existsSync(file)).toBe(false)
  })

  test("--record and --record-file together -> argparse rejection (non-zero)", () => {
    const dir = caseDir()
    const recFile = path.join(dir, "record.json")
    writeFileSync(recFile, record(), "utf8")
    const r = run([
      "journal",
      "--file", path.join(dir, "journal.jsonl"),
      "--record", record(),
      "--record-file", recFile,
    ])
    expect(r.status).not.toBe(0)
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

describe("seam schemas", () => {
  // U8 (R11/KTD7): the three shipped seam schema files in skills/lfg/references/
  // must (a) use only the keywords this script's `validate` subset supports —
  // an unsupported keyword is an infrastructure failure, not a quiet skip —
  // and (b) accept a minimal envelope conforming to the prose contract they pin.
  const SCHEMA_DIR = path.join(import.meta.dir, "..", "skills", "lfg", "references")

  const CE_WORK_ENVELOPE = {
    status: "complete",
    plan_path: "docs/plans/2026-08-05-feature.md",
    changed_files: ["src/a.ts"],
    u_ids_attempted: ["U1"],
    u_ids_completed: ["U1"],
    verification_results: ["bun test: pass"],
    verification_evidence: [
      {
        unit: "U1",
        behavior_changed: true,
        existing_tests_inspected: ["tests/a.test.ts"],
        tests_added_or_changed: ["tests/a.test.ts"],
        red_observed: "expected 2, got 1",
        verification: "bun test tests/a.test.ts: pass",
      },
    ],
    implementation_engine_binding: null,
    requested_route: "native",
    actual_route: "native",
    requested_model: "session",
    actual_model: "unverified",
    fallback_reason: null,
    run_id: null,
    source_kind: "plan",
    source_digest: "abc123",
    unit_receipts: [{ unit: "U1", route: "native", verification: "green" }],
    plan_checkpoint: null,
    blockers: [],
    recovery_path: null,
    settled_decision_conflicts: [],
    behavior_change: true,
    standalone_shipping_skipped: true,
  }

  const REVIEW_ENVELOPE = {
    status: "complete",
    verdict: "Ready to merge",
    scope: {
      base: "abc1234",
      branch: "feat/x",
      head_sha: "def5678",
      pr_url: null,
      files_changed: 2,
    },
    intent: "Adds the widget endpoint",
    intent_confidence: "explicit",
    reviewers: ["correctness", "security"],
    findings: [],
    actionable_findings: [],
    triage_groups: [],
    residual_risks: [],
    testing_gaps: [],
    coverage: {},
    verdict_consistency: [],
    artifact_path: "/tmp/run-dir",
    run_id: "r1",
  }

  const PLAN_ENVELOPE = {
    status: "complete",
    plan_path: "docs/plans/2026-08-05-feature.md",
    artifact_readiness: "implementation-ready",
    doc_review_state: "non-interactive ce-doc-review complete; 0 actionable findings",
  }

  const FIXTURES: Array<{ schema: string; envelope: unknown }> = [
    { schema: "ce-work-return-schema.json", envelope: CE_WORK_ENVELOPE },
    { schema: "review-result-schema.json", envelope: REVIEW_ENVELOPE },
    { schema: "plan-return-schema.json", envelope: PLAN_ENVELOPE },
  ]

  for (const { schema, envelope } of FIXTURES) {
    test(`${schema}: minimal conforming envelope validates ok:true`, () => {
      const dir = caseDir()
      const envFile = writeJson(dir, "envelope.json", envelope)
      const out = runOk(["validate", "--schema", path.join(SCHEMA_DIR, schema), "--envelope", envFile])
      expect(out.errors).toEqual([])
      expect(out.ok).toBe(true)
    })

    test(`${schema}: uses only validator-supported keywords (no infrastructure failure)`, () => {
      const dir = caseDir()
      // An empty envelope may fail validation (ok:false), but the schema itself must
      // load without an unsupported-keyword InfrastructureFailure (non-zero exit).
      const envFile = writeJson(dir, "empty.json", {})
      const r = run(["validate", "--schema", path.join(SCHEMA_DIR, schema), "--envelope", envFile])
      expect(r.status, `stderr: ${r.stderr}`).toBe(0)
      expect(r.stderr).not.toContain("unsupported schema keyword")
    })
  }

  test("ce-work envelope missing unit_receipts fails naming that field", () => {
    const dir = caseDir()
    const { unit_receipts: _omitted, ...withoutReceipts } = CE_WORK_ENVELOPE
    const envFile = writeJson(dir, "envelope.json", withoutReceipts)
    const out = runOk([
      "validate",
      "--schema",
      path.join(SCHEMA_DIR, "ce-work-return-schema.json"),
      "--envelope",
      envFile,
    ])
    expect(out.ok).toBe(false)
    expect(out.errors.join("\n")).toContain("unit_receipts")
  })
})
