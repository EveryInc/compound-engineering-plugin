import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const SCRIPT = path.join(import.meta.dir, "..", "skills", "ce-babysit-pr", "scripts", "intake-overlap")

// Probe by execution, not presence: on native Windows `python3` can be the
// Microsoft Store stub. See docs/solutions/conventions/resolve-python-interpreter-not-python3.md.
const PYTHON = ["python3", "python", "py"].find(
  (cand) => spawnSync(cand, ["-c", ""], { encoding: "utf8" }).status === 0,
)
if (!PYTHON) throw new Error("no working Python 3 interpreter on PATH (tried python3, python, py)")

setDefaultTimeout(30_000)

const ROOT = mkdtempSync(path.join(os.tmpdir(), "intake-overlap-"))
afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

const ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  SYSTEMROOT: process.env.SYSTEMROOT,
  HOME: ROOT,
  USERPROFILE: ROOT,
  XDG_CONFIG_HOME: ROOT,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: path.join(ROOT, "gitconfig"),
  GIT_TERMINAL_PROMPT: "0",
}
writeFileSync(path.join(ROOT, "gitconfig"), "")

const PR = 7
// Long enough that rename detection pairs a moved file with its source.
const body = (name: string) => `${name}\n${"shared line of content\n".repeat(20)}`

type Repo = {
  dir: string
  git: (...args: string[]) => string
  write: (files: Record<string, string>) => void
  commit: (message: string) => void
}

function makeRepo(name: string): { remote: string; work: Repo } {
  const base = path.join(ROOT, name)
  const remote = path.join(base, "remote.git")
  const dir = path.join(base, "work")
  mkdirSync(base, { recursive: true })
  const run = (cwd: string, args: string[]) => {
    const r = spawnSync("git", ["-c", "init.defaultBranch=main", ...args], { cwd, env: ENV, encoding: "utf8" })
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`)
    return r.stdout
  }
  run(base, ["init", "--bare", "-b", "main", remote])
  run(base, ["init", "-b", "main", dir])
  const git = (...args: string[]) => run(dir, args)
  git("config", "user.email", "test@test")
  git("config", "user.name", "test")
  git("config", "commit.gpgsign", "false")
  git("remote", "add", "origin", remote)
  const write = (files: Record<string, string>) => {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      writeFileSync(path.join(dir, file), content)
    }
  }
  const commit = (message: string) => {
    git("add", "-A")
    git("commit", "-q", "--allow-empty", "-m", message)
  }
  return { remote, work: { dir, git, write, commit } }
}

// Seed on main, branch the PR off it, then move main. Pushes main and the PR ref.
function scenario(
  name: string,
  seed: Record<string, string>,
  pr: (r: Repo) => void,
  base: ((r: Repo) => void) | null,
): string {
  const { work } = makeRepo(name)
  work.write(seed)
  work.commit("seed")
  work.git("checkout", "-q", "-b", "pr")
  pr(work)
  work.commit("pr change")
  work.git("push", "-q", "origin", `HEAD:refs/pull/${PR}/head`)
  work.git("checkout", "-q", "main")
  if (base) {
    base(work)
    work.commit("base change")
  }
  work.git("push", "-q", "origin", "main")
  return work.dir
}

function overlap(dir: string) {
  const r = spawnSync(PYTHON!, [SCRIPT, "--repo-dir", dir, "--remote", "origin", "--base", "main", "--pr", String(PR)], {
    env: ENV,
    encoding: "utf8",
  })
  expect(r.stderr).toBe("")
  expect(r.status).toBe(0)
  return JSON.parse(r.stdout)
}

describe("intake-overlap", () => {
  test("base deleting the directory a PR adds into is directory-gone", () => {
    const dir = scenario(
      "dir-gone",
      { "pkg/agents/a.md": body("a"), "pkg/b.md": body("b"), "README.md": body("r") },
      (r) => r.write({ "pkg/agents/review/new.md": body("new") }),
      (r) => r.git("rm", "-q", "-r", "pkg"),
    )
    const out = overlap(dir)
    expect(out.overlap).toBe(true)
    expect(out.reasons).toContainEqual({
      kind: "directory-gone",
      pr_path: "pkg/agents/review/new.md",
      base_path: "pkg/agents",
      base_status: "deleted",
    })
    expect(out.base_oid).toMatch(/^[0-9a-f]{40}$/)
    expect(out.head_oid).toMatch(/^[0-9a-f]{40}$/)
    expect(out.merge_base).toMatch(/^[0-9a-f]{40}$/)
    expect(out.error).toBeNull()
  })

  test("both sides editing one file is same-path", () => {
    const dir = scenario(
      "same-path",
      { "src/a.ts": body("a") },
      (r) => r.write({ "src/a.ts": body("a-pr") }),
      (r) => r.write({ "src/a.ts": body("a-base") }),
    )
    const out = overlap(dir)
    expect(out.overlap).toBe(true)
    expect(out.reasons).toEqual([
      { kind: "same-path", pr_path: "src/a.ts", base_path: "src/a.ts", base_status: "modified" },
    ])
  })

  test("PR renaming a file the base edits overlaps on the old name", () => {
    const dir = scenario(
      "pr-rename",
      { "src/a.ts": body("a") },
      (r) => r.git("mv", "src/a.ts", "src/b.ts"),
      (r) => r.write({ "src/a.ts": body("a-base") }),
    )
    const out = overlap(dir)
    expect(out.overlap).toBe(true)
    expect(out.reasons).toContainEqual({
      kind: "same-path",
      pr_path: "src/a.ts",
      base_path: "src/a.ts",
      base_status: "modified",
    })
  })

  test("base renaming a file the PR edits names both paths", () => {
    const dir = scenario(
      "base-rename",
      { "src/a.ts": body("a") },
      (r) => r.write({ "src/a.ts": `${body("a")}pr line\n` }),
      (r) => {
        mkdirSync(path.join(r.dir, "lib"))
        r.git("mv", "src/a.ts", "lib/a.ts")
      },
    )
    const out = overlap(dir)
    expect(out.overlap).toBe(true)
    expect(out.reasons).toContainEqual({
      kind: "same-path",
      pr_path: "src/a.ts",
      base_path: "lib/a.ts",
      base_status: "renamed",
    })
  })

  test("a directory the PR creates is not overlap with unrelated base changes", () => {
    const dir = scenario(
      "new-dir",
      { "skills/old/SKILL.md": body("old"), "other/x.md": body("x") },
      (r) => r.write({ "skills/new/SKILL.md": body("new") }),
      (r) => r.write({ "other/x.md": body("x-base") }),
    )
    const out = overlap(dir)
    expect(out.overlap).toBe(false)
    expect(out.reasons).toEqual([])
    expect(out.error).toBeNull()
  })

  test("root-level files are not siblings", () => {
    const dir = scenario(
      "root",
      { "README.md": body("r"), LICENSE: body("l") },
      (r) => r.write({ "README.md": body("r-pr") }),
      (r) => r.write({ LICENSE: body("l-base") }),
    )
    const out = overlap(dir)
    expect(out.overlap).toBe(false)
    expect(out.reasons).toEqual([])
  })

  test("a base edit in the same directory is sibling", () => {
    const dir = scenario(
      "sibling",
      { "src/a.ts": body("a"), "src/c.ts": body("c") },
      (r) => r.write({ "src/a.ts": body("a-pr") }),
      (r) => r.write({ "src/c.ts": body("c-base") }),
    )
    const out = overlap(dir)
    expect(out.overlap).toBe(true)
    expect(out.reasons).toEqual([
      { kind: "sibling", pr_path: "src/a.ts", base_path: "src/c.ts", base_status: "modified" },
    ])
  })

  test("merge-base at the base tip is no overlap", () => {
    const dir = scenario("current", { "src/a.ts": body("a") }, (r) => r.write({ "src/a.ts": body("a-pr") }), null)
    const out = overlap(dir)
    expect(out.overlap).toBe(false)
    expect(out.reasons).toEqual([])
    expect(out.merge_base).toBe(out.base_oid)
  })

  test("unrelated histories are unknown, exit 0", () => {
    const { work } = makeRepo("unrelated")
    work.write({ "src/a.ts": body("a") })
    work.commit("seed")
    work.git("push", "-q", "origin", "main")
    work.git("checkout", "-q", "--orphan", "pr")
    work.write({ "src/a.ts": body("orphan") })
    work.commit("orphan")
    work.git("push", "-q", "origin", `HEAD:refs/pull/${PR}/head`)
    const out = overlap(work.dir)
    expect(out.overlap).toBe("unknown")
    expect(out.merge_base).toBeNull()
    expect(out.error).toContain("merge-base")
  })

  test("a missing PR ref is unknown with the fetch error, exit 0", () => {
    const { work } = makeRepo("missing-pr")
    work.write({ "src/a.ts": body("a") })
    work.commit("seed")
    work.git("push", "-q", "origin", "main")
    const out = overlap(work.dir)
    expect(out.overlap).toBe("unknown")
    expect(out.error).toContain("fetch")
    expect(out.reasons).toEqual([])
  })
})
