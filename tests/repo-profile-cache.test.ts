import { describe, expect, test } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
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

function runWithEnv(
  cwd: string,
  env: Record<string, string>,
  ...args: string[]
): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("python3", [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  })
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  }
}

function runAsync(
  cwd: string,
  env: Record<string, string>,
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("python3", [SCRIPT, ...args], {
      cwd,
      env: { ...process.env, ...env },
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()))
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()))
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
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

/** A full, valid agnostic profile — `put` now requires every top-level key. */
const VALID_PROFILE = {
  stack: { languages: ["bun"] },
  dependencies: { top_level: [], project_license: "MIT" },
  topology: { monorepo: false, module_layout: "src/" },
  conventions: { testing: "bun test" },
  vocabulary: { concepts_present: false, terms: [] },
}

/** Write a profile JSON file and `put` it; return the cache path. */
function putProfile(dir: string, profile: object = VALID_PROFILE): string {
  // Keep the profile file outside the repo so later `git add -A` commits in
  // the same fixture cannot pick it up and change the path-shaped digest.
  const profileFile = path.join(
    mkdtempSync(path.join(tmpdir(), "repo-profile-put-")),
    "profile.json",
  )
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
  test("fresh repo with no entry → MISS + a UID-scoped cache path under /tmp", () => {
    const dir = makeRepo()
    const res = run(dir, "get")
    expect(res.code).toBe(0)
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
    const writePath = res.stdout.split("\n")[1]
    expect(writePath).toContain(
      `/compound-engineering-${process.getuid()}/repo-profile/`,
    )
    expect(writePath.endsWith(".json")).toBe(true)
  })

  test("owner-scoped roots isolate sibling users", () => {
    const dir = makeRepo()
    const roots = mkdtempSync(path.join(tmpdir(), "repo-profile-owners-"))
    const ownerA = path.join(roots, "compound-engineering-1001")
    const ownerB = path.join(roots, "compound-engineering-1002")
    const profileFile = path.join(dir, "profile.json")
    writeFileSync(profileFile, JSON.stringify(VALID_PROFILE))

    const put = runWithEnv(
      dir,
      { COMPOUND_ENGINEERING_SCRATCH_ROOT: ownerA },
      "put",
      profileFile,
    )
    expect(put.code).toBe(0)
    expect(put.stdout.trim().startsWith(ownerA)).toBe(true)
    expect(
      runWithEnv(dir, { COMPOUND_ENGINEERING_SCRATCH_ROOT: ownerA }, "get")
        .stdout.startsWith("HIT\n"),
    ).toBe(true)

    const ownerBGet = runWithEnv(
      dir,
      { COMPOUND_ENGINEERING_SCRATCH_ROOT: ownerB },
      "get",
    )
    expect(ownerBGet.stdout.startsWith("MISS\n")).toBe(true)
    expect(ownerBGet.stdout.split("\n")[1].startsWith(ownerB)).toBe(true)
  })

  test("concurrent puts remain readable and atomic", async () => {
    const dir = makeRepo()
    const scratchRoot = mkdtempSync(path.join(tmpdir(), "repo-profile-concurrent-"))
    const profileFile = path.join(dir, "profile.json")
    writeFileSync(profileFile, JSON.stringify(VALID_PROFILE))
    const env = { COMPOUND_ENGINEERING_SCRATCH_ROOT: scratchRoot }

    const puts = await Promise.all(
      Array.from({ length: 8 }, () => runAsync(dir, env, "put", profileFile)),
    )
    expect(puts.every((result) => result.code === 0)).toBe(true)
    expect(new Set(puts.map((result) => result.stdout.trim())).size).toBe(1)

    const get = runWithEnv(dir, env, "get")
    expect(get.code).toBe(0)
    expect(get.stdout.startsWith("HIT\n")).toBe(true)
    expect(getHitProfile(get.stdout)).toEqual(VALID_PROFILE)
  })

  test("put then get (clean tree) → HIT with the stored profile", () => {
    const dir = makeRepo()
    putProfile(dir)
    const res = run(dir, "get")
    expect(res.code).toBe(0)
    expect(res.stdout.startsWith("HIT\n")).toBe(true)
    expect(getHitProfile(res.stdout)).toEqual(VALID_PROFILE)
  })

  test("put path is keyed by inputs-digest (64-hex), not HEAD", () => {
    const dir = makeRepo()
    const cachePath = putProfile(dir)
    expect(cachePath).toContain(`/compound-engineering-${process.getuid()}/repo-profile/`)
    const digestComponent = cachePath.split("/repo-profile/")[1].split("/")[1]
    expect(digestComponent).toMatch(/^[0-9a-f]{64}\.json$/)
    const head = git(dir, "rev-parse", "HEAD").trim()
    expect(digestComponent).not.toBe(`${head}.json`)
  })

  test("content edit to existing non-input file at new HEAD → HIT", () => {
    const dir = makeRepo()
    mkdirSync(path.join(dir, "src"))
    writeFileSync(path.join(dir, "src", "app.js"), "console.log(1)\n")
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "add src")
    putProfile(dir)
    writeFileSync(path.join(dir, "src", "app.js"), "console.log(2)\n")
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "edit src content only")
    const res = run(dir, "get")
    expect(res.stdout.startsWith("HIT\n")).toBe(true)
    expect(getHitProfile(res.stdout)).toEqual(VALID_PROFILE)
  })

  test("new non-input path at new HEAD → MISS (tree-shape in digest)", () => {
    const dir = makeRepo()
    putProfile(dir)
    mkdirSync(path.join(dir, "src", "db", "migrations"), { recursive: true })
    writeFileSync(path.join(dir, "src", "db", "migrations", "001.sql"), "SELECT 1;\n")
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "add migrations layout")
    expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
  })

  test("advancing a submodule gitlink → MISS", () => {
    const dir = makeRepo()
    const shaA = git(dir, "rev-parse", "HEAD").trim()
    writeFileSync(
      path.join(dir, ".gitmodules"),
      '[submodule "vendor/x"]\n\tpath = vendor/x\n\turl = https://example.com/x.git\n',
    )
    git(dir, "add", ".gitmodules")
    const link = spawnSync(
      "git",
      ["update-index", "--add", "--cacheinfo", `160000,${shaA},vendor/x`],
      { cwd: dir, encoding: "utf8" },
    )
    expect(link.status).toBe(0)
    git(dir, "commit", "-q", "-m", "add submodule gitlink")
    putProfile(dir)
    const shaB = git(dir, "rev-parse", "HEAD").trim()
    const adv = spawnSync(
      "git",
      ["update-index", "--cacheinfo", `160000,${shaB},vendor/x`],
      { cwd: dir, encoding: "utf8" },
    )
    expect(adv.status).toBe(0)
    git(dir, "commit", "-q", "-m", "advance submodule")
    expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
  })

  test("dirty uncommitted submodule pointer advance → MISS", () => {
    const dir = makeRepo()
    const shaA = git(dir, "rev-parse", "HEAD").trim()
    writeFileSync(
      path.join(dir, ".gitmodules"),
      '[submodule "vendor/x"]\n\tpath = vendor/x\n\turl = https://example.com/x.git\n',
    )
    git(dir, "add", ".gitmodules")
    expect(
      spawnSync(
        "git",
        ["update-index", "--add", "--cacheinfo", `160000,${shaA},vendor/x`],
        { cwd: dir, encoding: "utf8" },
      ).status,
    ).toBe(0)
    git(dir, "commit", "-q", "-m", "add submodule gitlink")
    putProfile(dir)
    const shaB = git(dir, "rev-parse", "HEAD").trim()
    expect(
      spawnSync(
        "git",
        ["update-index", "--cacheinfo", `160000,${shaB},vendor/x`],
        { cwd: dir, encoding: "utf8" },
      ).status,
    ).toBe(0)
    // Staged but uncommitted gitlink advance — must not HIT.
    expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
  })

  test("editing symlink target of a profile input → MISS", () => {
    const dir = makeRepo()
    mkdirSync(path.join(dir, "docs"))
    writeFileSync(path.join(dir, "docs", "README.md"), "# docs readme v1\n")
    spawnSync("rm", ["-f", path.join(dir, "README.md")])
    spawnSync("ln", ["-s", "docs/README.md", path.join(dir, "README.md")])
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "symlink root README")
    putProfile(dir)
    writeFileSync(path.join(dir, "docs", "README.md"), "# docs readme v2\n")
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "edit symlink target only")
    expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
  })

  test("editing final target of a symlink chain → MISS", () => {
    const dir = makeRepo()
    mkdirSync(path.join(dir, "docs"))
    writeFileSync(path.join(dir, "docs", "README.md"), "# final v1\n")
    spawnSync("ln", ["-s", "README.md", path.join(dir, "docs", "link.md")])
    spawnSync("rm", ["-f", path.join(dir, "README.md")])
    spawnSync("ln", ["-s", "docs/link.md", path.join(dir, "README.md")])
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "symlink chain README")
    putProfile(dir)
    writeFileSync(path.join(dir, "docs", "README.md"), "# final v2\n")
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "edit chain final target")
    expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
  })

  test("dirty symlink target of a profile input → MISS", () => {
    const dir = makeRepo()
    mkdirSync(path.join(dir, "docs"))
    writeFileSync(path.join(dir, "docs", "README.md"), "# docs readme v1\n")
    spawnSync("rm", ["-f", path.join(dir, "README.md")])
    spawnSync("ln", ["-s", "docs/README.md", path.join(dir, "README.md")])
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "symlink root README")
    putProfile(dir)
    writeFileSync(path.join(dir, "docs", "README.md"), "# dirty target\n")
    expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
  })

  test("input-changing commit at new HEAD → MISS (new inputs digest)", () => {
    const dir = makeRepo()
    putProfile(dir)
    writeFileSync(
      path.join(dir, "package.json"),
      '{"name":"x","version":"2.0.0"}\n',
    )
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "bump package")
    const res = run(dir, "get")
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
  })

  test("dirty NON-input file (untracked source) stays HIT", () => {
    const dir = makeRepo()
    putProfile(dir)
    mkdirSync(path.join(dir, "src"))
    writeFileSync(path.join(dir, "src", "app.js"), "console.log(1)\n")
    const res = run(dir, "get")
    expect(res.stdout.startsWith("HIT\n")).toBe(true)
  })

  test("modified manifest → MISS (cardinal-rule input guard)", () => {
    const dir = makeRepo()
    putProfile(dir)
    writeFileSync(
      path.join(dir, "package.json"),
      '{"name":"x","version":"2.0.0"}\n',
    )
    const res = run(dir, "get")
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
  })

  test("new UNTRACKED manifest (??) → MISS (untracked-input guard)", () => {
    const dir = makeRepo()
    putProfile(dir)
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
    putProfile(dir)
    writeFileSync(path.join(dir, "AGENTS.md"), "# rules\n")
    const res = run(dir, "get")
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
  })

  test("schema-version mismatch → MISS", () => {
    const dir = makeRepo()
    const cachePath = putProfile(dir)
    const doc = JSON.parse(readFileSync(cachePath, "utf8"))
    doc.profile_schema_version = "0"
    writeFileSync(cachePath, JSON.stringify(doc))
    const res = run(dir, "get")
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
  })

  test("malformed cache file → MISS (degrades, never raises)", () => {
    const dir = makeRepo()
    const cachePath = putProfile(dir)
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

  test("put rejects a non-object / empty / partial profile → not cached", () => {
    // empty, non-object, AND partial / wrapper objects missing required keys
    // (a profiler failure that still returns JSON must not be cached + served)
    const bad = ["{}", '"oops"', "[]", "42", "null", '{"stack":{}}', '{"oops":"x"}']
    for (const garbage of bad) {
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
  }, 30000)

  test("put refuses a profile derived from a dirty tree (revert-staleness guard)", () => {
    const dir = makeRepo()
    // dirty a profile input, then derive + put while dirty
    writeFileSync(path.join(dir, "package.json"), '{"name":"x","version":"DIRTY"}\n')
    const f = path.join(dir, "profile.json")
    writeFileSync(f, JSON.stringify(VALID_PROFILE))
    expect(run(dir, "put", f).stdout.trim()).toBe("NO-CACHE") // not persisted — dirty
    // revert → clean tree at the same HEAD; must still MISS, not serve the dirty profile
    writeFileSync(path.join(dir, "package.json"), '{"name":"x","version":"1.0.0"}\n')
    expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
  })

  test("usage error on missing/garbage subcommand → exit 2", () => {
    const dir = makeRepo()
    expect(run(dir).code).toBe(2)
    expect(run(dir, "frobnicate").code).toBe(2)
    expect(run(dir, "put").code).toBe(2) // put with no file
  })
})

describe("repo-profile-cache helper — review-driven invalidation cases", () => {
  test("renaming a profile input AWAY → MISS (both rename endpoints count)", () => {
    const dir = makeRepo()
    putProfile(dir)
    git(dir, "mv", "package.json", "pkg.json") // R package.json -> pkg.json
    const res = run(dir, "get")
    expect(res.stdout.startsWith("MISS\n")).toBe(true)
  })

  test("renaming a NON-input file → stays HIT", () => {
    const dir = makeRepo()
    mkdirSync(path.join(dir, "src"))
    writeFileSync(path.join(dir, "src", "lib.js"), "export const x = 1\n")
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "add lib")
    putProfile(dir)
    git(dir, "mv", "src/lib.js", "src/lib2.js")
    expect(run(dir, "get").stdout.startsWith("HIT\n")).toBe(true)
  })

  test("nested (subdir) instruction file stays HIT; only root invalidates", () => {
    const dir = makeRepo()
    putProfile(dir)
    mkdirSync(path.join(dir, "sub"))
    writeFileSync(path.join(dir, "sub", "AGENTS.md"), "# nested\n")
    expect(run(dir, "get").stdout.startsWith("HIT\n")).toBe(true)
  })

  test("CI/config prefixes invalidate; non-workflow .github file does not", () => {
    // .cursor/ and .github/workflows/ are profile inputs (MISS)
    for (const p of [".cursor/rules", ".github/workflows/ci.yml"]) {
      const dir = makeRepo()
      putProfile(dir)
      mkdirSync(path.join(dir, path.dirname(p)), { recursive: true })
      writeFileSync(path.join(dir, p), "x\n")
      expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
    }
    // a .github file NOT under workflows/ is not an input (HIT)
    const dir = makeRepo()
    putProfile(dir)
    mkdirSync(path.join(dir, ".github"))
    writeFileSync(path.join(dir, ".github", "ISSUE_TEMPLATE.md"), "x\n")
    expect(run(dir, "get").stdout.startsWith("HIT\n")).toBe(true)
  }, 30000)

  test("non-JS ecosystem + monorepo + IaC + deploy inputs invalidate", () => {
    for (const p of [
      "App.csproj", // .NET project-file suffix
      "Package.swift", // Swift/iOS
      "go.work", // Go workspace
      "nx.json", // monorepo orchestrator
      "infra.tf", // Terraform (.tf suffix)
      "terraform/main.tf", // Terraform dir prefix
      "k8s/deployment.yaml", // Kubernetes dir prefix
      "Pulumi.yaml", // Pulumi IaC
      ".nvmrc", // runtime version selector
      ".tool-versions", // asdf/mise version selector
      ".cursorrules", // legacy root Cursor rules
      "vercel.json", // deploy descriptor
      ".gitlab-ci.yml", // non-GitHub CI
    ]) {
      const dir = makeRepo()
      putProfile(dir)
      const fp = path.join(dir, p)
      mkdirSync(path.dirname(fp), { recursive: true })
      writeFileSync(fp, "x\n")
      expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
    }
  }, 30000)

  test("revert of a dirtied input restores the HIT (recompute determinism)", () => {
    const dir = makeRepo()
    const orig = '{"name":"x","version":"1.0.0"}\n'
    putProfile(dir)
    writeFileSync(path.join(dir, "package.json"), '{"name":"x","version":"9"}\n')
    expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
    writeFileSync(path.join(dir, "package.json"), orig) // revert → clean again
    expect(run(dir, "get").stdout.startsWith("HIT\n")).toBe(true)
  })

  test("cached doc with mismatched inputs_digest → MISS", () => {
    const dir = makeRepo()
    const cachePath = putProfile(dir)
    const doc = JSON.parse(readFileSync(cachePath, "utf8"))
    doc.inputs_digest = "0".repeat(64)
    writeFileSync(cachePath, JSON.stringify(doc))
    expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
  })

  test("cached doc with a non-object profile → MISS (get-side shape guard)", () => {
    const dir = makeRepo()
    const cachePath = putProfile(dir)
    const doc = JSON.parse(readFileSync(cachePath, "utf8"))
    doc.profile = null // externally corrupted / poisoned
    writeFileSync(cachePath, JSON.stringify(doc))
    expect(run(dir, "get").stdout.startsWith("MISS\n")).toBe(true)
  })
})
