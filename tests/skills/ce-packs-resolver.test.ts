import { spawnSync } from "child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"

// Deterministic proof for the CE Packs resolver (plan AE1-AE7): fixture repos
// and file:// git sources built per test, cache isolated via CE_PACKS_CACHE_ROOT.
// Exercise the canonical ce-brainstorm copy; the other skill copies stay
// byte-identical via the parity test below.
setDefaultTimeout(30000)

const RESOLVER = path.join(process.cwd(), "skills/ce-brainstorm/scripts/packs-resolve.py")
const COPIES = [
  "skills/ce-brainstorm/scripts/packs-resolve.py",
  "skills/ce-plan/scripts/packs-resolve.py",
  "skills/ce-setup/scripts/packs-resolve.py",
  "skills/ce-code-review/scripts/packs-resolve.py",
  "skills/ce-doc-review/scripts/packs-resolve.py",
]

const scratch = mkdtempSync(path.join(tmpdir(), "ce-packs-resolver-"))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let counter = 0
function tempDir(name: string): string {
  const dir = path.join(scratch, `${name}-${counter++}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function git(cwd: string, ...args: string[]): void {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (res.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${res.stderr}`)
}

/** A git repo usable as the consuming project, with .compound-engineering config. */
function makeProject(config: string, localConfig?: string): string {
  const dir = tempDir("project")
  git(dir, "init", "-q")
  const ce = path.join(dir, ".compound-engineering")
  mkdirSync(ce)
  writeFileSync(path.join(ce, "config.yaml"), config)
  if (localConfig !== undefined) writeFileSync(path.join(ce, "config.local.yaml"), localConfig)
  return dir
}

function writeKnowledgeFile(dir: string, name: string, title: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, name),
    `---\ntitle: ${title}\napplies_when:\n  - adding a page that needs server data\ntags: [fixture]\n---\n\nRule body for ${title}.\n`,
  )
}

/** A git repo publishing packs under an optional subfolder, tagged v1. */
function makePackRepo(packNames: string[], subfolder = ""): string {
  const dir = tempDir("packrepo")
  git(dir, "init", "-q")
  for (const name of packNames) {
    writeKnowledgeFile(path.join(dir, subfolder, name), `${name}-rule.md`, `${name} rule`)
  }
  git(dir, "add", "-A")
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "packs")
  git(dir, "tag", "v1")
  return dir
}

function resolve(projectDir: string, cacheDir?: string) {
  const res = spawnSync("python3", [RESOLVER], {
    cwd: projectDir,
    encoding: "utf8",
    env: { ...process.env, CE_PACKS_CACHE_ROOT: cacheDir ?? tempDir("cache"), CE_PACKS_GIT_TIMEOUT: "20" },
  })
  expect(res.status).toBe(0)
  return JSON.parse(res.stdout)
}

const ids = (out: { roots: { id: string }[] }) => out.roots.map((r) => r.id).sort()

describe("packs-resolve.py copies", () => {
  test("all skill copies are byte-identical", () => {
    const contents = COPIES.map((p) => readFileSync(path.join(process.cwd(), p), "utf8"))
    for (let i = 1; i < contents.length; i++) expect(contents[i]).toBe(contents[0])
  })
})

describe("declaration and absence", () => {
  test("AE6: no packs key anywhere yields empty roots, no warnings, no errors", () => {
    const out = resolve(makeProject("docs_root: docs\n"))
    expect(out).toEqual({ roots: [], warnings: [], errors: [] })
  })

  test("AE4: config.yaml and config.local.yaml entries concatenate", () => {
    const team = makePackRepo(["rails"])
    const personal = tempDir("personal")
    writeKnowledgeFile(path.join(personal, "kk-style"), "style.md", "kk style")
    const dir = makeProject(
      `packs:\n  - source: file://${team}\n    ref: v1\n`,
      `packs:\n  - source: ${personal}/kk-style\n`,
    )
    expect(ids(resolve(dir))).toEqual(["kk-style", "rails"])
  })

  test("AE4: duplicate id across the two config files errors loudly and neither installs", () => {
    const team = makePackRepo(["rails"])
    const local = tempDir("localdup")
    writeKnowledgeFile(path.join(local, "rails"), "other.md", "other rails")
    const dir = makeProject(
      `packs:\n  - source: file://${team}\n    ref: v1\n`,
      `packs:\n  - source: ${local}/rails\n`,
    )
    const out = resolve(dir)
    expect(ids(out)).toEqual([])
    expect(out.errors.join(" ")).toContain("duplicate pack id `rails`")
  })
})

describe("selection and publishing", () => {
  test("AE1: all-packs git entry installs everything the source publishes", () => {
    const repo = makePackRepo(["security", "privacy"])
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n`))
    expect(ids(out)).toEqual(["privacy", "security"])
  })

  test("pack: with a flow-style list installs exactly those", () => {
    const repo = makePackRepo(["rails", "inertia", "extra"])
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n    pack: [rails, inertia]\n`))
    expect(ids(out)).toEqual(["inertia", "rails"])
  })

  test("pack: with a block-style list installs exactly those", () => {
    const repo = makePackRepo(["rails", "inertia", "extra"])
    const out = resolve(
      makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n    pack:\n      - rails\n      - extra\n`),
    )
    expect(ids(out)).toEqual(["extra", "rails"])
  })

  test("AE2: missing named pack errors listing available ids; other entries still resolve", () => {
    const repo = makePackRepo(["rails"])
    const other = tempDir("ok")
    writeKnowledgeFile(path.join(other, "good"), "g.md", "good")
    const dir = makeProject(
      `packs:\n  - source: file://${repo}\n    ref: v1\n    pack: railz\n  - source: ${other}/good\n`,
    )
    const out = resolve(dir)
    expect(ids(out)).toEqual(["good"])
    expect(out.errors.join(" ")).toContain("railz")
    expect(out.errors.join(" ")).toContain("available: rails")
  })

  test("source dir holding knowledge files directly is a single pack; id: renames it", () => {
    const single = tempDir("single")
    writeKnowledgeFile(path.join(single, "local-rules"), "r.md", "local rule")
    const out = resolve(
      makeProject(`packs:\n  - source: ${single}/local-rules\n    id: house-rules\n`),
    )
    expect(ids(out)).toEqual(["house-rules"])
  })

  test("nested directories inside a pack are content, not packs", () => {
    const repo = makePackRepo(["outer"])
    // add a nested dir with knowledge files inside the outer pack
    writeKnowledgeFile(path.join(repo, "outer", "nested"), "n.md", "nested rule")
    git(repo, "add", "-A")
    git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "nested")
    git(repo, "tag", "-f", "v1")
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n`))
    expect(ids(out)).toEqual(["outer"])
  })
})

describe("ref and path rules", () => {
  test("AE3: ref on a path source errors loudly; entry does not install", () => {
    const local = tempDir("pathref")
    writeKnowledgeFile(path.join(local, "rules"), "r.md", "rule")
    const out = resolve(makeProject(`packs:\n  - source: ${local}/rules\n    ref: v1\n`))
    expect(ids(out)).toEqual([])
    expect(out.errors.join(" ")).toContain("only valid on git sources")
  })

  test("git source without ref errors loudly", () => {
    const out = resolve(makeProject("packs:\n  - source: https://github.com/o/r\n"))
    expect(out.errors.join(" ")).toContain("requires `ref:`")
  })

  test("~/absolute path source outside the repo resolves; nonexistent path errors", () => {
    const abs = tempDir("abs")
    writeKnowledgeFile(path.join(abs, "styleguide"), "s.md", "style")
    const dir = makeProject(
      `packs:\n  - source: ${abs}/styleguide\n  - source: ${abs}/missing\n`,
    )
    const out = resolve(dir)
    expect(ids(out)).toEqual(["styleguide"])
    expect(out.errors.join(" ")).toContain("does not exist")
  })

  test("repo-relative source escaping the repo errors", () => {
    const dir = makeProject("packs:\n  - source: ../outside\n")
    const out = resolve(dir)
    expect(out.errors.join(" ")).toContain("outside the repository")
  })

  test("AE7: GitHub tree URL normalizes to url + ref + path (parse-level: conflict detection)", () => {
    // Conflicting explicit ref proves the sugar parsed the embedded ref.
    const out = resolve(
      makeProject(
        "packs:\n  - source: https://github.com/o/r/tree/main/packs\n    ref: v9\n",
      ),
    )
    expect(out.errors.join(" ")).toContain("tree URL pins ref `main`")
  })

  test("path: scopes enumeration to the subfolder of a git source", () => {
    const repo = makePackRepo(["rails", "inertia"], "packs")
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n    path: packs\n`))
    expect(ids(out)).toEqual(["inertia", "rails"])
  })
})

describe("parser strictness", () => {
  test("an unclassifiable line under packs: errors naming file and line", () => {
    const out = resolve(makeProject("packs:\n  - source: x\n    what even is this\n"))
    expect(out.errors.join(" ")).toContain("config.yaml:3")
  })

  test("unknown entry keys error", () => {
    const out = resolve(makeProject("packs:\n  - source: x\n    refs: v1\n"))
    expect(out.errors.join(" ")).toContain("unknown packs entry key `refs:`")
  })

  test("commented packs examples are inert", () => {
    const out = resolve(makeProject("# packs:\n#   - source: packs/x\n"))
    expect(out).toEqual({ roots: [], warnings: [], errors: [] })
  })
})

describe("cache and failure modes", () => {
  test("second resolve reuses the cache: branch ref stays at its cached resolution", () => {
    const repo = makePackRepo(["rails"])
    const branch = spawnSync("git", ["-C", repo, "branch", "--show-current"], { encoding: "utf8" }).stdout.trim()
    const cache = tempDir("cache-reuse")
    const project = makeProject(`packs:\n  - source: file://${repo}\n    ref: ${branch}\n`)
    expect(ids(resolve(project, cache))).toEqual(["rails"])
    // mutate upstream: add a pack after the first resolution
    writeKnowledgeFile(path.join(repo, "later"), "l.md", "later rule")
    git(repo, "add", "-A")
    git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "later")
    // cached branch resolution does not advance
    expect(ids(resolve(project, cache))).toEqual(["rails"])
  })

  test("a partial cache directory (no completed rename) is treated as a miss", () => {
    const repo = makePackRepo(["rails"])
    const cache = tempDir("cache-partial")
    // Pre-seed junk that is NOT at the keyed path (simulates an interrupted
    // temp clone left behind); the resolver must still produce a clean clone.
    mkdirSync(path.join(cache, "deadbeef.part-xyz"), { recursive: true })
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n`), cache)
    expect(ids(out)).toEqual(["rails"])
  })

  test("AE5: unreachable git source warns once and the run continues", () => {
    const gone = path.join(scratch, "no-such-repo")
    const ok = tempDir("stillok")
    writeKnowledgeFile(path.join(ok, "good"), "g.md", "good")
    const dir = makeProject(
      `packs:\n  - source: file://${gone}\n    ref: v1\n  - source: ${ok}/good\n`,
    )
    const out = resolve(dir)
    expect(ids(out)).toEqual(["good"])
    expect(out.warnings.length).toBe(1)
    expect(out.errors).toEqual([])
  })

  test("id: override on a multi-pack entry errors", () => {
    const repo = makePackRepo(["a", "b"])
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n    id: one\n`))
    expect(out.errors.join(" ")).toContain("exactly one pack")
  })
})

describe("review regressions", () => {
  test("zero-indent list items under packs: parse as entries", () => {
    const local = tempDir("zeroindent")
    writeKnowledgeFile(path.join(local, "rules"), "r.md", "rule")
    const out = resolve(makeProject(`packs:\n- source: ${local}/rules\n`))
    expect(ids(out)).toEqual(["rules"])
  })

  test("a commit sha works as ref via the fetch fallback", () => {
    const repo = makePackRepo(["rails"])
    const sha = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim()
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: ${sha}\n`))
    expect(ids(out)).toEqual(["rails"])
  })

  test("a git source that is itself a single pack gets its URL tail as id, never the cache key", () => {
    const repo = tempDir("singlegit")
    git(repo, "init", "-q")
    writeKnowledgeFile(repo, "r.md", "root rule")
    git(repo, "add", "-A")
    git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "p")
    git(repo, "tag", "v1")
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n`))
    expect(out.roots.length).toBe(1)
    expect(out.roots[0].id).toBe(path.basename(repo))
    expect(out.roots[0].id).not.toMatch(/^[0-9a-f]{64}$/)
  })

  test("an option-shaped ref is rejected before any git call", () => {
    const out = resolve(makeProject("packs:\n  - source: https://github.com/o/r\n    ref: --upload-pack=/bin/false\n"))
    expect(out.errors.join(" ")).toContain("may not begin with `-`")
  })

  test("a git path: escaping the checkout errors", () => {
    const repo = makePackRepo(["rails"], "packs")
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n    path: ../outside\n`))
    expect(out.errors.join(" ")).toContain("escapes the source checkout")
  })

  test("a literal ~ source expands against HOME", () => {
    const home = tempDir("home")
    writeKnowledgeFile(path.join(home, "packs", "kk"), "k.md", "kk rule")
    const project = makeProject("packs:\n  - source: ~/packs/kk\n")
    const res = spawnSync("python3", [RESOLVER], {
      cwd: project,
      encoding: "utf8",
      env: { ...process.env, HOME: home, CE_PACKS_CACHE_ROOT: tempDir("cache") },
    })
    expect(res.status).toBe(0)
    expect(ids(JSON.parse(res.stdout))).toEqual(["kk"])
  })

  test("id: renames a single-pack git entry and keeps its git metadata", () => {
    const repo = makePackRepo(["rails"])
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n    pack: rails\n    id: team-rails\n`))
    expect(ids(out)).toEqual(["team-rails"])
    expect(out.roots[0].ref).toBe("v1")
  })

  test("CRLF-terminated config parses identically", () => {
    const local = tempDir("crlf")
    writeKnowledgeFile(path.join(local, "rules"), "r.md", "rule")
    const config = `packs:\r\n  - source: ${local}/rules\r\n`
    const out = resolve(makeProject(config))
    expect(ids(out)).toEqual(["rules"])
  })

  test("empty pack: selection warns instead of silently installing nothing", () => {
    const repo = makePackRepo(["rails"])
    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n    pack: []\n`))
    expect(ids(out)).toEqual([])
    expect(out.warnings.join(" ")).toContain("lists no ids")
  })

  test("an apostrophe in a value does not absorb a trailing comment", () => {
    const local = tempDir("apos")
    writeKnowledgeFile(path.join(local, "o'brien-rules"), "r.md", "rule")
    const out = resolve(makeProject(`packs:\n  - source: ${local}/o'brien-rules  # team's rules\n`))
    expect(ids(out)).toEqual(["o'brien-rules"])
  })

  test("tree-URL normalization resolves base, ref, and path groups", () => {
    const probe = spawnSync(
      "python3",
      ["-c", `
import importlib.util
spec = importlib.util.spec_from_file_location("pr", ${JSON.stringify(RESOLVER)})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
t = m._TREE_URL_RE.match("https://github.com/o/r/tree/v2.0.0/packs/sub")
print(t.group("base"), t.group("ref"), t.group("path"))
`],
      { encoding: "utf8" },
    )
    expect(probe.stdout.trim()).toBe("https://github.com/o/r v2.0.0 packs/sub")
  })
})
