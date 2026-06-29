import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// The cache helper is byte-duplicated per consuming skill (parity-guarded in
// repo-profile-cache-parity.test.ts). Behavior is identical, so exercise the
// canonical ce-pov copy here.
const SCRIPT = path.join(
  __dirname,
  "../skills/ce-pov/scripts/repo-profile-cache.py",
)

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`)
  }
  return r.stdout ?? ""
}

function run(
  cwd: string,
  ...args: string[]
): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("python3", [SCRIPT, ...args], { cwd, encoding: "utf8" })
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  }
}

/** Fresh git repo with a manifest + README, one commit. Unique root SHA. */
function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "repo-profile-"))
  git(dir, "init", "-q")
  git(dir, "config", "user.email", "test@example.com")
  git(dir, "config", "user.name", "Test")
  git(dir, "config", "commit.gpgsign", "false")
  writeFileSync(
    path.join(dir, "package.json"),
    '{"name":"x","version":"1.0.0"}\n',
  )
  writeFileSync(path.join(dir, "README.md"), "# x\n")
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", "init")
  return dir
}

/** Write a profile JSON file and `put` it; return the cache path. */
function putProfile(dir: string, profile: object): string {
  const profileFile = path.join(dir, "profile.json")
  writeFileSync(profileFile, JSON.stringify(profile))
  const res = run(dir, "put", profileFile)
  expect(res.code).toBe(0)
  return res.stdout.trim()
}

function getHitProfile(stdout: string): unknown {
  const nl = stdout.indexOf("\n")
  return JSON.parse(stdout.slice(nl + 1).trim())
}

describe("repo-profile-cache helper", () => {
  test("fresh repo with no entry → MISS + a cache path under /tmp", () => {
    const dir = makeRepo()
    const res = run(dir, "get")
    expect(res.code).toBe(0)
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
    const writePath = res.stdout.split("\n")[1]
    expect(writePath).toContain("/compound-engineering/repo-profile/")
    expect(writePath.endsWith(".json")).toBe(true)
  })

  test("put then get (clean tree) → HIT with the stored profile", () => {
    const dir = makeRepo()
    putProfile(dir, { stack: "bun", license: "MIT" })
    const res = run(dir, "get")
    expect(res.code).toBe(0)
    expect(res.stdout.startsWith("HIT\n")).toBe(true)
    expect(getHitProfile(res.stdout)).toEqual({ stack: "bun", license: "MIT" })
  })

  test("dirty NON-input file (untracked source) stays HIT", () => {
    const dir = makeRepo()
    putProfile(dir, { stack: "bun" })
    mkdirSync(path.join(dir, "src"))
    writeFileSync(path.join(dir, "src", "app.js"), "console.log(1)\n")
    const res = run(dir, "get")
    expect(res.stdout.startsWith("HIT\n")).toBe(true)
  })

  test("modified manifest → MISS (cardinal-rule input guard)", () => {
    const dir = makeRepo()
    putProfile(dir, { stack: "bun" })
    writeFileSync(
      path.join(dir, "package.json"),
      '{"name":"x","version":"2.0.0"}\n',
    )
    const res = run(dir, "get")
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
  })

  test("new UNTRACKED manifest (??) → MISS (untracked-input guard)", () => {
    const dir = makeRepo()
    putProfile(dir, { stack: "bun" })
    mkdirSync(path.join(dir, "packages", "sub"), { recursive: true })
    writeFileSync(
      path.join(dir, "packages", "sub", "package.json"),
      '{"name":"sub"}\n',
    )
    const res = run(dir, "get")
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
  })

  test("new untracked root AGENTS.md (??) → MISS", () => {
    const dir = makeRepo()
    putProfile(dir, { stack: "bun" })
    writeFileSync(path.join(dir, "AGENTS.md"), "# rules\n")
    const res = run(dir, "get")
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
  })

  test("schema-version mismatch → MISS", () => {
    const dir = makeRepo()
    const cachePath = putProfile(dir, { stack: "bun" })
    const doc = JSON.parse(readFileSync(cachePath, "utf8"))
    doc.profile_schema_version = "0"
    writeFileSync(cachePath, JSON.stringify(doc))
    const res = run(dir, "get")
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
  })

  test("malformed cache file → MISS (degrades, never raises)", () => {
    const dir = makeRepo()
    const cachePath = putProfile(dir, { stack: "bun" })
    writeFileSync(cachePath, "not json at all")
    const res = run(dir, "get")
    expect(res.code).toBe(0)
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
  })

  test("non-git directory → NO-CACHE", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "repo-profile-nogit-"))
    const res = run(dir, "get")
    expect(res.code).toBe(0)
    expect(res.stdout.trim()).toBe("NO-CACHE")
  })

  test("multi-root history yields a deterministic single-root path", () => {
    const dir = makeRepo()
    const orig = git(dir, "rev-parse", "--abbrev-ref", "HEAD").trim()
    git(dir, "checkout", "-q", "--orphan", "second")
    writeFileSync(path.join(dir, "other.txt"), "x\n")
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "second root")
    git(dir, "checkout", "-q", orig)
    git(dir, "merge", "-q", "--allow-unrelated-histories", "--no-edit", "second")
    const res = run(dir, "get")
    expect(res.code).toBe(0)
    const writePath = res.stdout.split("\n")[1]
    // The <root-sha> path component must be a single 40-hex SHA, not a
    // newline-joined pair from multiple roots.
    const rootComponent = writePath.split("/repo-profile/")[1].split("/")[0]
    expect(rootComponent).toMatch(/^[0-9a-f]{40}$/)
  })

  test("put rejects a non-object/empty profile → not cached (shape guard)", () => {
    for (const garbage of ["{}", '"oops"', "[]", "42", "null"]) {
      const dir = makeRepo()
      const f = path.join(dir, "bad.json")
      writeFileSync(f, garbage)
      const put = run(dir, "put", f)
      expect(put.code).toBe(0)
      expect(put.stdout.trim()).toBe("NO-CACHE") // refused to persist
      // and nothing was cached, so a subsequent get is a MISS, not a HIT
      const get = run(dir, "get")
      expect(get.stdout.startsWith("MISS\n")).toBe(true)
    }
  })

  test("usage error on missing/garbage subcommand → exit 2", () => {
    const dir = makeRepo()
    expect(run(dir).code).toBe(2)
    expect(run(dir, "frobnicate").code).toBe(2)
    expect(run(dir, "put").code).toBe(2) // put with no file
  })
})
