import { spawnSync } from "child_process"
import { createHash } from "crypto"
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs"
import { tmpdir } from "os"
import path from "path"
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { isolatedGitEnv, knowledgeFile, writeKnowledgeFile } from "./helpers/packs-fixtures"

// Deterministic proof for the Compound Packs resolver (plan AE1-AE7): fixture repos
// and file:// git sources built per test, cache isolated via CE_PACKS_CACHE_ROOT.
setDefaultTimeout(30000)

const COPIES = [
  "skills/ce-plan/scripts/packs-resolve.py",
  "skills/ce-brainstorm/scripts/packs-resolve.py",
  "skills/ce-setup/scripts/packs-resolve.py",
  "skills/ce-code-review/scripts/packs-resolve.py",
  "skills/ce-doc-review/scripts/packs-resolve.py",
  "skills/ce-compound/scripts/packs-resolve.py",
  "skills/ce-dogfood/scripts/packs-resolve.py",
]
const RESOLVER = path.join(process.cwd(), COPIES[0])

const scratch = mkdtempSync(path.join(tmpdir(), "ce-packs-resolver-"))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let counter = 0
function tempDir(name: string): string {
  const dir = path.join(scratch, `${name}-${counter++}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function git(cwd: string, ...args: string[]): void {
  const res = spawnSync("git", args, { cwd, encoding: "utf8", env: isolatedGitEnv })
  if (res.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${res.stderr}`)
}

function commit(cwd: string, message: string): void {
  git(cwd, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", message)
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

/** A git repo publishing packs under an optional subfolder, tagged v1. */
function makePackRepo(packNames: string[], subfolder = ""): string {
  const dir = tempDir("packrepo")
  git(dir, "init", "-q")
  for (const name of packNames) {
    writeKnowledgeFile(path.join(dir, subfolder, name), `${name}-rule.md`, `${name} rule`)
  }
  git(dir, "add", "-A")
  commit(dir, "packs")
  git(dir, "tag", "v1")
  return dir
}

function resolve(projectDir: string, cacheDir?: string, extraEnv: Record<string, string> = {}, args: string[] = []) {
  const res = spawnSync("python3", [RESOLVER, ...args], {
    cwd: projectDir,
    encoding: "utf8",
    env: { ...process.env, CE_PACKS_CACHE_ROOT: cacheDir ?? tempDir("cache"), CE_PACKS_GIT_TIMEOUT: "20", ...extraEnv },
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
    expect(out).toEqual({ roots: [], warnings: [], errors: [], entries: 0 })
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

  // Local adds, never replaces: on a duplicate id the first-declared root (the
  // team's config.yaml entry) stays installed and the later one is dropped, so a
  // personal config.local.yaml collision cannot uninstall a team pack.
  test("AE4: duplicate id across the two config files errors loudly and keeps the first-declared root", () => {
    const team = makePackRepo(["rails"])
    const local = tempDir("localdup")
    writeKnowledgeFile(path.join(local, "rails"), "other.md", "other rails")
    const dir = makeProject(
      `packs:\n  - source: file://${team}\n    ref: v1\n`,
      `packs:\n  - source: ${local}/rails\n`,
    )
    const out = resolve(dir)
    expect(ids(out)).toEqual(["rails"])
    expect(out.roots[0].ref).toBe("v1") // the git-sourced team root, not the local path
    expect(out.errors.length).toBe(1)
    expect(out.errors[0]).toContain("duplicate pack id `rails`")
    expect(out.errors[0]).toContain("config.local.yaml:2 ignored")
    expect(out.errors[0]).toContain("config.yaml:2 kept")
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
    commit(repo, "nested")
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
    expect(out).toEqual({ roots: [], warnings: [], errors: [], entries: 0 })
  })

  test("a non-empty value on the packs: key line is a loud error, not an absent key", () => {
    for (const config of ["packs: [packs/local-rules]\n", "packs: packs/local-rules\n"]) {
      const out = resolve(makeProject(config))
      expect(out.roots).toEqual([])
      expect(out.errors.length).toBe(1)
      expect(out.errors[0]).toContain("config.yaml:1")
      expect(out.errors[0]).toContain("must be a block list")
    }
  })

  test("a non-string path: on one entry errors for that entry; the other entries still resolve", () => {
    const repo = makePackRepo(["rails"])
    const ok = tempDir("okpath")
    writeKnowledgeFile(path.join(ok, "good"), "g.md", "good")
    const out = resolve(
      makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n    path: [a, b]\n  - source: ${ok}/good\n`),
    )
    expect(ids(out)).toEqual(["good"])
    expect(out.errors.length).toBe(1)
    expect(out.errors[0]).toContain("config.yaml:2")
    expect(out.errors[0]).toContain("`path:` must be a single string")
  })

  test("an unexpected exception while resolving one entry becomes that entry's error", () => {
    const ok = tempDir("okboom")
    writeKnowledgeFile(path.join(ok, "good"), "g.md", "good")
    const project = makeProject(`packs:\n  - source: ${ok}/boom\n  - source: ${ok}/good\n`)
    // Force a crash inside resolve_entry for one entry only; the resolver must
    // still print valid JSON with the other entry's root.
    const probe = spawnSync(
      "python3",
      ["-c", `
import importlib.util, sys
spec = importlib.util.spec_from_file_location("pr", ${JSON.stringify(RESOLVER)})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
real = m.resolve_entry
def flaky(entry, *a, **kw):
    if str(entry.get("source", "")).endswith("/boom"):
        raise RuntimeError("kaboom")
    return real(entry, *a, **kw)
m.resolve_entry = flaky
sys.exit(m.main())
`],
      { cwd: project, encoding: "utf8", env: { ...process.env, CE_PACKS_CACHE_ROOT: tempDir("cache") } },
    )
    expect(probe.status).toBe(0)
    const out = JSON.parse(probe.stdout)
    expect(ids(out)).toEqual(["good"])
    expect(out.errors.length).toBe(1)
    expect(out.errors[0]).toContain("config.yaml:2: unexpected error resolving entry: kaboom")
  })
})

describe("rule file detection", () => {
  test("a BOM-prefixed rule and one whose frontmatter exceeds 4096 bytes both publish without a skip warning", () => {
    const local = tempDir("bom")
    const pack = path.join(local, "rules")
    mkdirSync(pack, { recursive: true })
    writeFileSync(path.join(pack, "bom.md"), "\ufeff" + knowledgeFile("bom rule"))
    const tags = Array.from({ length: 600 }, (_, i) => `  - tag-${i}-${"x".repeat(8)}`).join("\n")
    const longFrontmatter = `---\ntitle: long rule\ntags:\n${tags}\napplies_when:\n  - always\n---\n\nRule body.\n`
    expect(Buffer.byteLength(longFrontmatter)).toBeGreaterThan(4096)
    writeFileSync(path.join(pack, "long.md"), longFrontmatter)

    const out = resolve(makeProject(`packs:\n  - source: ${local}/rules\n`))
    expect(ids(out)).toEqual(["rules"])
    expect(out.warnings).toEqual([])
  })
})

// Pack layout: a rule is discovered only as a top-level `.md` with `title` and
// `applies_when`; subdirectories are storage. A pack author put 23 decision
// records under `research/` with a top-level README and nothing was ever
// discovered, with no signal why. The resolver now names the misplaced files
// once per pack, and a description-only README stops drawing a skip warning.
describe("pack layout", () => {
  test("a pack with a top-level rule keeps nested rule-shaped files as storage: published from the top level, no warning, counted on the root", () => {
    const local = tempDir("nested-rules")
    const pack = path.join(local, "house-rules")
    writeKnowledgeFile(pack, "top-rule.md", "top rule")
    writeKnowledgeFile(path.join(pack, "research"), "observation-001.md", "an unresolved observation")
    writeKnowledgeFile(path.join(local, "plain"), "r.md", "rule")
    const out = resolve(makeProject(`packs:\n  - source: ${local}/house-rules\n  - source: ${local}/plain\n`))
    expect(ids(out)).toEqual(["house-rules", "plain"])
    const house = out.roots.find((r: any) => r.id === "house-rules")
    expect(house.dir).toBe(realpathSync(pack))
    expect(house.nested_rule_shaped).toBe(1)
    expect(out.roots.find((r: any) => r.id === "plain").nested_rule_shaped).toBe(0)
    expect(out.errors).toEqual([])
    expect(out.warnings).toEqual([])
  })

  test("the nested count scans one level down only and never counts a README", () => {
    const local = tempDir("nested-depth")
    const pack = path.join(local, "house-rules")
    writeKnowledgeFile(pack, "top-rule.md", "top rule")
    writeKnowledgeFile(path.join(pack, "research"), "obs-001.md", "counted")
    writeKnowledgeFile(path.join(pack, "research"), "README.md", "a README is documentation wherever it sits")
    writeKnowledgeFile(path.join(pack, "research", "deeper"), "obs-002.md", "two levels down is not scanned")
    writeKnowledgeFile(path.join(pack, ".hidden"), "obs-003.md", "hidden directories are not scanned")
    const out = resolve(makeProject(`packs:\n  - source: ${local}/house-rules\n`))
    expect(out.roots[0].nested_rule_shaped).toBe(1)
    expect(out.warnings).toEqual([])
  })

  test("a README.md is documentation, never a rule: excluded from publication whatever its frontmatter, never warned", () => {
    const local = tempDir("readme-rule-shaped")
    writeKnowledgeFile(path.join(local, "design"), "spacing.md", "spacing rule")
    writeKnowledgeFile(path.join(local, "design"), "README.md", "About this pack")
    // A source whose only .md is a frontmatter'd README publishes nothing.
    writeKnowledgeFile(path.join(local, "only-readme"), "ReadMe.md", "About this pack")
    const out = resolve(makeProject(`packs:\n  - source: ${local}/design\n  - source: ${local}/only-readme\n`))
    expect(ids(out)).toEqual(["design"])
    expect(out.errors).toEqual([])
    expect(out.warnings.length).toBe(1)
    expect(out.warnings[0]).toContain("`" + local + "/only-readme` publishes no packs")
    expect(out.warnings.join(" ")).not.toMatch(/skipped pack file/)
  })

  test("a top-level README.md without frontmatter is not a skipped pack file; any other frontmatter-less .md still is", () => {
    const local = tempDir("readme")
    writeKnowledgeFile(path.join(local, "rules"), "r.md", "rule")
    writeFileSync(path.join(local, "rules", "README.md"), "# House rules\n\nWhat this pack is for.\n")
    writeFileSync(path.join(local, "rules", "notes.md"), "just notes, no frontmatter\n")
    writeKnowledgeFile(path.join(local, "lower"), "r.md", "rule")
    writeFileSync(path.join(local, "lower", "readme.md"), "lowercase readme\n")
    const out = resolve(makeProject(`packs:\n  - source: ${local}/rules\n  - source: ${local}/lower\n`))
    expect(ids(out)).toEqual(["lower", "rules"])
    expect(out.warnings.length).toBe(1)
    expect(out.warnings[0]).toContain("skipped pack file `rules/notes.md`")
    expect(out.warnings.join(" ")).not.toMatch(/readme/i)
  })

  test("a source whose only rule-shaped files are nested publishes nothing and says why", () => {
    const local = tempDir("only-nested")
    const pack = path.join(local, "compound-packs", "house-rules")
    mkdirSync(pack, { recursive: true })
    writeFileSync(path.join(pack, "README.md"), "# House rules\n\nSee research/ for the decisions.\n")
    for (const n of [1, 2, 3]) writeKnowledgeFile(path.join(pack, "research"), `adr-00${n}.md`, `decision ${n}`)
    const out = resolve(makeProject(`packs:\n  - source: ${local}/compound-packs\n`))
    expect(ids(out)).toEqual([])
    expect(out.errors).toEqual([])
    expect(out.warnings.length).toBe(2)
    expect(out.warnings[0]).toContain("publishes no packs")
    expect(out.warnings[1]).toContain("pack `house-rules` has 3 rule-shaped file(s) under `research/` that discovery never reads")
    expect(out.warnings[1]).toContain("https://everyinc.github.io/compound-engineering-plugin/guides/packs/")
  })
})

describe("--declared-only", () => {
  test("reports the declaration from the config alone: declared path pack, no key, broken entry", () => {
    const local = tempDir("declonly")
    writeKnowledgeFile(path.join(local, "rules"), "r.md", "rule")
    const declared = resolve(makeProject(`packs:\n  - source: ${local}/rules\n`), undefined, {}, ["--declared-only"])
    expect(declared).toEqual({ declared: true, entries: 1, errors: [] })

    const none = resolve(makeProject("docs_root: docs\n"), undefined, {}, ["--declared-only"])
    expect(none).toEqual({ declared: false, entries: 0, errors: [] })

    const broken = resolve(makeProject("packs:\n  - ref: v1\n"), undefined, {}, ["--declared-only"])
    expect(broken.declared).toBe(true)
    expect(broken.entries).toBe(1)
    expect(broken.errors.join(" ")).toContain("no `source:`")

    // Outside any repository there is no config to read: null, not false.
    const nowhere = resolve(tempDir("not-a-repo"), undefined, {}, ["--declared-only"])
    expect(nowhere).toEqual({ declared: null, entries: 0, errors: [] })
  })

  test("does no git or cache work: an unreachable git source is declared, never fetched", () => {
    const cache = tempDir("cache-declonly")
    const gone = path.join(scratch, "never-cloned")
    const out = resolve(makeProject(`packs:\n  - source: file://${gone}\n    ref: v1\n`), cache, {}, ["--declared-only"])
    expect(out).toEqual({ declared: true, entries: 1, errors: [] })
    expect(readdirSync(cache)).toEqual([])
  })

  test("the normal output carries the parsed entry count", () => {
    const local = tempDir("entries")
    writeKnowledgeFile(path.join(local, "rules"), "r.md", "rule")
    const out = resolve(makeProject(`packs:\n  - source: ${local}/rules\n  - source: ${local}/missing\n`))
    expect(out.entries).toBe(2)
    expect(ids(out)).toEqual(["rules"])
  })
})

describe("cache and failure modes", () => {
  // KTD-3: a missing git binary degrades git entries only. The repository is
  // then located by walking up from the cwd, so path sources still resolve.
  test("without a git binary on PATH, path sources resolve and each git source warns and is skipped", () => {
    const personal = tempDir("nogit-personal")
    writeKnowledgeFile(path.join(personal, "kk-style"), "style.md", "kk style")
    const repo = makePackRepo(["rails"])
    const project = makeProject(`packs:\n  - source: ${personal}/kk-style\n  - source: file://${repo}\n    ref: v1\n`)
    const python = Bun.which("python3")
    expect(python).toBeTruthy()
    const res = spawnSync(python as string, [RESOLVER], {
      cwd: path.join(project, ".compound-engineering"), // below the top level: exercises the walk-up
      encoding: "utf8",
      env: { ...process.env, PATH: tempDir("empty-path"), CE_PACKS_CACHE_ROOT: tempDir("cache-nogit") },
    })
    expect(res.status, res.stderr).toBe(0)
    const out = JSON.parse(res.stdout)
    expect(ids(out)).toEqual(["kk-style"])
    expect(out.errors).toEqual([])
    expect(out.warnings.length).toBe(1)
    expect(out.warnings[0]).toContain("git binary not found")
  })

  test("second resolve reuses the cache: branch ref stays at its cached resolution", () => {
    const repo = makePackRepo(["rails"])
    const branch = spawnSync("git", ["-C", repo, "branch", "--show-current"], { encoding: "utf8" }).stdout.trim()
    const cache = tempDir("cache-reuse")
    const project = makeProject(`packs:\n  - source: file://${repo}\n    ref: ${branch}\n`)
    expect(ids(resolve(project, cache))).toEqual(["rails"])
    // mutate upstream: add a pack after the first resolution
    writeKnowledgeFile(path.join(repo, "later"), "l.md", "later rule")
    git(repo, "add", "-A")
    commit(repo, "later")
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
    commit(repo, "p")
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
    expect(ids(resolve(project, undefined, { HOME: home }))).toEqual(["kk"])
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

  test("a frontmatter-less .md inside an installed pack warns at resolve time", () => {
    const local = tempDir("skipwarn")
    writeKnowledgeFile(path.join(local, "rules"), "r.md", "rule")
    writeFileSync(path.join(local, "rules", "notes.md"), "just notes, no frontmatter\n")
    const out = resolve(makeProject(`packs:\n  - source: ${local}/rules\n`))
    expect(ids(out)).toEqual(["rules"])
    expect(out.warnings.join(" ")).toContain("skipped pack file `rules/notes.md`")
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

// Containment: a planted symlink -- at the keyed cache path or inside a pack
// repo -- must never become a pack root or a rule file read from outside its
// source (review findings #1, #2, #8 on the packs branch).
describe("symlink and ownership containment", () => {
  const cacheKey = (repo: string, ref: string) =>
    createHash("sha256").update(`file://${repo}\n${ref}`).digest("hex")

  test("a symlink planted at the keyed cache path is unlinked and refetched, never returned as a root", () => {
    const repo = makePackRepo(["rails"])
    const decoy = tempDir("decoy")
    writeKnowledgeFile(path.join(decoy, "planted"), "p.md", "planted rule")
    const cache = tempDir("cache-planted")
    const linkPath = path.join(cache, cacheKey(repo, "v1"))
    symlinkSync(decoy, linkPath)

    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n`), cache)
    expect(ids(out)).toEqual(["rails"])
    const decoyReal = realpathSync(decoy)
    for (const root of out.roots) expect(root.dir.startsWith(decoyReal)).toBe(false)
    expect(out.warnings.join(" ")).toContain("refetching")
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(false)
    // The link was removed, not followed: the decoy's contents are untouched.
    expect(existsSync(path.join(decoy, "planted", "p.md"))).toBe(true)
  })

  test("a pack-repo child directory linking outside the checkout is skipped with one warning naming it", () => {
    const outside = tempDir("outside")
    writeKnowledgeFile(path.join(outside, "leak"), "l.md", "leaked rule")
    const repo = makePackRepo(["honest"])
    symlinkSync(path.join(outside, "leak"), path.join(repo, "leak"))
    git(repo, "add", "-A")
    commit(repo, "link out")
    git(repo, "tag", "-f", "v1")

    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n`))
    expect(ids(out)).toEqual(["honest"])
    expect(out.errors).toEqual([])
    expect(out.warnings.length).toBe(1)
    expect(out.warnings[0]).toContain("`leak`")
    expect(out.warnings[0]).toContain("outside the source")
  })

  // Consumers list a published pack directory themselves, so skipping the one
  // escaping file at resolve time is not containment: the pack is refused.
  test("a rule file linking outside the checkout refuses the whole pack, naming the link", () => {
    const outside = tempDir("outside-file")
    writeKnowledgeFile(outside, "secret.md", "leaked rule")
    const repo = makePackRepo(["honest"])
    symlinkSync(path.join(outside, "secret.md"), path.join(repo, "honest", "secret.md"))
    git(repo, "add", "-A")
    commit(repo, "link out")
    git(repo, "tag", "-f", "v1")

    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n`))
    expect(ids(out)).toEqual([])
    expect(out.errors.length).toBe(1)
    expect(out.errors[0]).toContain("pack `honest` not published")
    expect(out.errors[0]).toContain("`secret.md`")
    expect(out.errors[0]).toContain("outside the source")
  })

  test("a link that leaves the source below the pack's top level refuses that pack; siblings publish", () => {
    const outside = tempDir("outside-nested")
    writeFileSync(path.join(outside, "keys.md"), "not a rule, still readable")
    const repo = makePackRepo(["honest", "clean"])
    mkdirSync(path.join(repo, "honest", "resources"))
    symlinkSync(path.join(outside, "keys.md"), path.join(repo, "honest", "resources", "keys.md"))
    git(repo, "add", "-A")
    commit(repo, "nested link out")
    git(repo, "tag", "-f", "v1")

    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n`))
    expect(ids(out)).toEqual(["clean"])
    expect(out.warnings).toEqual([])
    expect(out.errors.length).toBe(1)
    expect(out.errors[0]).toContain("pack `honest` not published")
    expect(out.errors[0]).toContain("`resources/keys.md`")
  })

  test("a symlink that stays inside the checkout is ordinary content", () => {
    const repo = makePackRepo(["honest"])
    symlinkSync("honest", path.join(repo, "alias"))
    git(repo, "add", "-A")
    commit(repo, "alias")
    git(repo, "tag", "-f", "v1")

    const out = resolve(makeProject(`packs:\n  - source: file://${repo}\n    ref: v1\n`))
    expect(ids(out)).toEqual(["alias", "honest"])
    expect(out.warnings).toEqual([])
  })

  test("_private_root_usable repairs a pre-existing owned root to mode 0700", () => {
    const loose = tempDir("loose-root")
    chmodSync(loose, 0o755)
    const probe = spawnSync(
      "python3",
      ["-c", `
import importlib.util, os, stat
spec = importlib.util.spec_from_file_location("pr", ${JSON.stringify(RESOLVER)})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
root = ${JSON.stringify(loose)}
print(m._private_root_usable(root), oct(stat.S_IMODE(os.stat(root).st_mode)))
`],
      { encoding: "utf8" },
    )
    expect(probe.stdout.trim()).toBe("True 0o700")
  })
})
