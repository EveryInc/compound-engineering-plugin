import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { REPO_ROOT } from "../../extract"
import type { ScenarioFile } from "./scenarios"
import { relocate } from "./run-scenario"

setDefaultTimeout(30_000)

const BUILDER = path.join(import.meta.dir, "build-fixtures.ts")
const SCRIPTS = path.join(REPO_ROOT, "skills", "ce-retro", "scripts", "session-history")
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ce-retro-fixtures-")))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

function build(out: string, scenario: string) {
  return spawnSync("bun", [BUILDER, "--out", out, "--scenario", scenario], { encoding: "utf8" })
}

describe("ce-retro eval fixtures", () => {
  test("the builder refuses an --out inside this repository", () => {
    const r = build(path.join(REPO_ROOT, ".ce-retro-fixture-probe"), "no-user")
    expect(r.status).toBe(2)
    expect(fs.existsSync(path.join(REPO_ROOT, ".ce-retro-fixture-probe"))).toBe(false)
  })

  test("a copied worktree cell links only to itself and leaves the source untouched", () => {
    const out = path.join(tmp, "isolate")
    expect(build(out, "worktree-run").status).toBe(0)
    const src = path.join(out, "worktree-run", "cell")
    const s: ScenarioFile = JSON.parse(fs.readFileSync(path.join(out, "worktree-run", "scenario.json"), "utf8"))
    const before = fs.readFileSync(path.join(src, s.worktree_dir!, ".git"), "utf8")
    const copy = path.join(tmp, "isolate-copy", "cell")
    fs.cpSync(src, copy, { recursive: true })
    relocate(src, copy, s)
    const listed = spawnSync("git", ["-C", path.join(copy, s.repo_dir), "worktree", "list", "--porcelain"], { encoding: "utf8" })
      .stdout.split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.slice(9))
    expect(listed).toHaveLength(2)
    for (const p of listed) expect(fs.realpathSync(p).startsWith(fs.realpathSync(copy) + path.sep)).toBe(true)
    expect(fs.readFileSync(path.join(copy, s.worktree_dir!, ".git"), "utf8")).toContain(copy)
    expect(fs.readFileSync(path.join(src, s.worktree_dir!, ".git"), "utf8")).toBe(before)
    const srcListed = spawnSync("git", ["-C", path.join(src, s.repo_dir), "worktree", "list", "--porcelain"], { encoding: "utf8" }).stdout
    expect(srcListed).not.toContain(copy)
  })

  test("the skill's session scripts discover every session of a worktree scenario", () => {
    const r = build(tmp, "worktree-run")
    expect(r.status).toBe(0)
    const s: ScenarioFile = JSON.parse(fs.readFileSync(path.join(tmp, "worktree-run", "scenario.json"), "utf8"))
    const cell = path.join(tmp, "worktree-run", "cell")
    const roots = [path.join(cell, s.repo_dir), path.join(cell, s.worktree_dir!)]
    const env = { ...process.env, HOME: path.join(tmp, "home"), CLAUDE_CONFIG_DIR: path.join(cell, "stores", "claude"), CODEX_HOME: path.join(cell, "stores", "codex") }
    const files = spawnSync("bash", [path.join(SCRIPTS, "discover-sessions.sh"), s.repo_dir, "14", "--include-subagents", ...roots.flatMap((r) => ["--cwd", r])], { env, encoding: "utf8" })
      .stdout.split("\n").filter(Boolean)
    const meta = spawnSync("python3", [path.join(SCRIPTS, "extract-metadata.py"), "--no-ancestor", ...roots.flatMap((r) => ["--cwd-filter", r]), ...files], { env, encoding: "utf8" })
      .stdout.split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.platform)
    expect(meta).toHaveLength(s.session_ids.length)
    expect(new Set(meta.map((m) => m.cwd))).toEqual(new Set(roots))
    expect(meta.filter((m) => m.parent_session)).toHaveLength(s.session_ids.filter((x) => x.parent).length)
  })
})
