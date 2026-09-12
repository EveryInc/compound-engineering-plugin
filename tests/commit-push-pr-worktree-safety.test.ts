import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { devNull, tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, setDefaultTimeout, test } from "bun:test"

setDefaultTimeout(20_000)

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const referenceRoot = join(repoRoot, "skills/ce-commit-push-pr/references")
const readReference = (name: string) => readFileSync(join(referenceRoot, name), "utf8")
const routes = ["fresh base", "upstack"] as const
type Route = (typeof routes)[number]

// Execute the recipe in the shipping reference, not a separate copy of the fix.
// The recipes contain only whitespace-delimited or double-quoted argv tokens.
function checkoutArgs(route: Route, target: string): string[] {
  const recipe = route === "fresh base"
    ? readReference("branch-creation.md").match(/^git checkout [^\n]*\$BASE_REF[^\n]*$/m)?.[0]
    : readReference("stack-submit.md").match(/`(git checkout [^`]*<parent-tip>[^`]*)`/)?.[1]
  assert.ok(recipe, `missing ${route} checkout recipe`)
  const args = [...recipe.matchAll(/"([^"\n]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]!)
  assert.equal(args.shift(), "git")
  assert.equal(args[0], "checkout")
  return args.map((arg) => arg === "<branch-name>" ? "topic" :
    arg === "$BASE_REF" || arg === "<parent-tip>" ? target : arg)
}

function withRepo(run: (fixture: ReturnType<typeof createFixture>) => void): void {
  const root = mkdtempSync(join(tmpdir(), "ce-pr-worktree-"))
  try {
    run(createFixture(root))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function createFixture(root: string) {
  // Child-only configuration: no inherited Git directory, index, template,
  // hooks, global config, or signing setup, and no mutation of process.env/cwd.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")))
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" })
  const emptyTemplate = join(root, "empty-template")
  const cwd = join(root, "repo")
  mkdirSync(emptyTemplate)
  mkdirSync(cwd)
  function raw(...args: string[]) {
    const result = spawnSync("git", [
      "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false",
      "-c", `core.hooksPath=${emptyTemplate}`, ...args,
    ], { cwd, env, encoding: "utf8", timeout: 10_000 })
    if (result.error) throw result.error
    assert.equal(result.signal, null, `git ${args[0]} terminated: ${result.stderr}`)
    assert.notEqual(result.status, null)
    return result
  }
  function git(...args: string[]) {
    const result = raw(...args)
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`)
    return result.stdout
  }
  function write(path: string, contents: string) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), contents)
  }
  const read = (path: string) => readFileSync(join(cwd, path), "utf8")
  const snapshot = () => ({
    head: git("rev-parse", "HEAD"),
    branch: git("symbolic-ref", "HEAD"),
    refs: git("for-each-ref", "--format=%(refname):%(objectname)", "refs/heads", "refs/stash"),
    index: git("ls-files", "--stage", "-z"),
    status: git("status", "--porcelain=v1", "--untracked-files=all", "--ignored", "-z"),
    unstaged: git("diff", "--binary"),
    staged: git("diff", "--cached", "--binary"),
  })
  git("init", "--quiet", "--initial-branch=work", `--template=${emptyTemplate}`)
  write(".gitignore", ".env\nignored/\n")
  for (const path of ["tracked.txt", "staged.txt", "base-only.txt"]) write(path, "original\n")
  git("add", ".gitignore", "tracked.txt", "staged.txt", "base-only.txt")
  git("commit", "--quiet", "-m", "base")
  const base = git("rev-parse", "HEAD").trim()
  function target(path: string) {
    git("checkout", "--quiet", "-b", "target")
    write(path, "target contents\n")
    git("add", "-f", "--", path)
    git("commit", "--quiet", "-m", "target")
    const tip = git("rev-parse", "HEAD").trim()
    git("checkout", "--quiet", "work")
    return tip
  }
  return { base, raw, git, write, read, snapshot, target }
}

describe("commit-push-pr worktree preservation", () => {
  test("checkout recipes protect ignored files without automatic stashing", () => {
    for (const name of ["branch-creation.md", "stack-submit.md"]) {
      const content = readReference(name)
      assert.doesNotMatch(content, /stash\/pop only|^git stash push -u/m)
      assert.match(content, /--no-overwrite-ignore/)
    }
  })

  for (const route of routes) {
    for (const path of [".env", "ignored/local data.txt"]) {
      test(`${route} rejects an ignored collision without changing files, refs, or index: ${path}`, () => {
        withRepo((f) => {
          const tip = f.target(path)
          f.write(path, "synthetic local data: 한글\n")
          // Normal status really misses this local data, which is the original bug.
          assert.equal(f.git("status", "--porcelain=v1"), "")
          const before = f.snapshot()
          const result = f.raw(...checkoutArgs(route, tip))
          assert.notEqual(result.status, 0)
          assert.match(result.stderr, /would be overwritten/)
          assert.equal(f.read(path), "synthetic local data: 한글\n")
          assert.deepEqual(f.snapshot(), before)
        })
      })
    }

    for (const sameHead of [false, true]) {
      test(`${route} carries non-colliding staged, unstaged, untracked and ignored work (${sameHead ? "same HEAD" : "new tip"})`, () => {
        withRepo((f) => {
          const tip = sameHead ? f.base : f.target("base-only.txt")
          f.write("staged.txt", "staged change\n")
          f.git("add", "staged.txt")
          const local = { "tracked.txt": "unstaged change\n", "notes.txt": "untracked work\n", ".env": "synthetic private data\n" }
          for (const [path, contents] of Object.entries(local)) f.write(path, contents)
          const before = f.snapshot()
          const result = f.raw(...checkoutArgs(route, tip))
          assert.equal(result.status, 0, result.stderr)
          assert.equal(f.git("branch", "--show-current").trim(), "topic")
          assert.equal(f.git("rev-parse", "HEAD").trim(), tip)
          assert.equal(f.git("rev-parse", "work").trim(), f.base)
          assert.equal(f.read("staged.txt"), "staged change\n")
          for (const [path, contents] of Object.entries(local)) assert.equal(f.read(path), contents)
          const after = f.snapshot()
          assert.equal(after.status, before.status)
          assert.equal(after.staged, before.staged)
          assert.equal(after.unstaged, before.unstaged)
          assert.equal(f.git("for-each-ref", "refs/stash"), "")
        })
      })
    }

    for (const alsoUnstaged of [false, true]) {
      test(`${route} rejects a staged collision${alsoUnstaged ? " with additional unstaged edits" : ""} without changing files, refs, or index`, () => {
        withRepo((f) => {
          const tip = f.target("tracked.txt")
          f.write("tracked.txt", "staged work\n")
          f.git("add", "tracked.txt")
          if (alsoUnstaged) f.write("tracked.txt", "unstaged work\n")
          const before = f.snapshot()
          const result = f.raw(...checkoutArgs(route, tip))
          assert.notEqual(result.status, 0)
          assert.match(result.stderr, /would be overwritten/)
          assert.equal(f.read("tracked.txt"), alsoUnstaged ? "unstaged work\n" : "staged work\n")
          assert.equal(f.git("show", ":tracked.txt"), "staged work\n")
          assert.deepEqual(f.snapshot(), before)
        })
      })
    }

    for (const path of ["tracked.txt", "untracked.txt"]) {
      test(`${route} still rejects a conflicting ${path} without stashing`, () => {
        withRepo((f) => {
          const tip = f.target(path)
          f.write(path, "local work\n")
          const before = f.snapshot()
          const result = f.raw(...checkoutArgs(route, tip))
          assert.notEqual(result.status, 0)
          assert.match(result.stderr, /would be overwritten/)
          assert.equal(f.read(path), "local work\n")
          assert.deepEqual(f.snapshot(), before)
        })
      })
    }
  }
})
