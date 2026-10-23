import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const SCRIPT = path.join(import.meta.dir, "..", "..", "skills", "ce-optimize", "scripts", "experiment-worktree.sh")

let repo: string

function run(args: string[]) {
  return spawnSync("bash", [SCRIPT, ...args], { cwd: repo, encoding: "utf8" })
}

beforeAll(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ce-optimize-worktree-")))
  const git = (args: string[]) => spawnSync("git", args, { cwd: repo, encoding: "utf8" })
  git(["init", "-b", "main"])
  git(["config", "user.name", "test"])
  git(["config", "user.email", "test@example.test"])
  fs.writeFileSync(path.join(repo, "keep.txt"), "keep\n")
  fs.mkdirSync(path.join(repo, "data"))
  fs.writeFileSync(path.join(repo, "data", "rows.txt"), "rows\n")
  git(["add", "."])
  git(["commit", "-m", "seed"])
  git(["branch", "optimize/demo"])
})

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true })
})

describe("experiment-worktree.sh refuses inputs that could delete outside its worktrees", () => {
  // create replaces a shared directory inside the new worktree with `rm -rf`, so a
  // shared path that climbs out resolves to the repository itself.
  test.each(["../..", "data/../..", "/tmp", "./data"])("create rejects shared path %s", (shared) => {
    const result = run(["create", "demo", "1", "optimize/demo", shared])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("shared path must be relative and stay inside the repo")
    expect(fs.existsSync(path.join(repo, "keep.txt"))).toBe(true)
    expect(fs.existsSync(path.join(repo, ".git"))).toBe(true)
  })

  test.each(["../demo", "demo/../..", "Demo", ""])("spec name %p is rejected by every deleting command", (name) => {
    for (const args of [
      ["create", name, "1", "optimize/demo"],
      ["cleanup", name, "1"],
      ["cleanup-all", name],
    ]) {
      expect(run(args).status).not.toBe(0)
    }
    expect(fs.existsSync(path.join(repo, "keep.txt"))).toBe(true)
  })

  test("a valid create and cleanup still work, with a shared directory copied in", () => {
    const created = run(["create", "demo", "2", "optimize/demo", "data"])
    expect(created.status).toBe(0)
    const worktree = created.stdout.trim().split("\n").pop() as string
    expect(fs.existsSync(path.join(worktree, "data", "rows.txt"))).toBe(true)

    expect(run(["cleanup", "demo", "2"]).status).toBe(0)
    expect(fs.existsSync(worktree)).toBe(false)
    expect(fs.existsSync(path.join(repo, "data", "rows.txt"))).toBe(true)
  })
})
