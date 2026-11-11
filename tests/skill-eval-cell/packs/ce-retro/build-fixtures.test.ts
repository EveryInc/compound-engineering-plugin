import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { REPO_ROOT } from "../../extract"
import type { ScenarioFile } from "./scenarios"

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
