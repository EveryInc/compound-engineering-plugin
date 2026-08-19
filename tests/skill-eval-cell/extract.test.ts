import { afterAll, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { WORKTREE_REF, extractSkill, mintCellDir } from "./extract"

const cells: string[] = []
afterAll(() => {
  for (const dir of cells) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
    }
  }
})

test("extractSkill archives skills/<name> from a git ref into dest/skills/<name>", () => {
  const dest = mintCellDir()
  cells.push(dest)
  const { skillDir } = extractSkill({ skill: "ce-debug", ref: "HEAD", dest })
  expect(fs.existsSync(`${skillDir}/SKILL.md`)).toBe(true)
  expect(fs.existsSync(`${skillDir}/references/pipeline-mode.md`)).toBe(true)
  expect(skillDir.endsWith("skills/ce-debug")).toBe(true)
})

test("the WORKTREE ref picks up an edit that is not committed yet", () => {
  const repo = mintCellDir()
  cells.push(repo)
  const skillDir = path.join(repo, "skills", "x")
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "committed body\n")
  const git = (args: string[]) => spawnSync("git", args, { cwd: repo, encoding: "utf8" })
  git(["init", "-b", "main"])
  git(["config", "user.name", "CE"])
  git(["config", "user.email", "ce@example.test"])
  git(["add", "."])
  git(["commit", "-m", "seed"])
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "uncommitted edit\n")

  const headDest = mintCellDir()
  cells.push(headDest)
  const head = extractSkill({ skill: "x", ref: "HEAD", dest: headDest, repoRoot: repo })
  expect(fs.readFileSync(path.join(head.skillDir, "SKILL.md"), "utf8")).toContain("committed body")

  const treeDest = mintCellDir()
  cells.push(treeDest)
  const tree = extractSkill({ skill: "x", ref: WORKTREE_REF, dest: treeDest, repoRoot: repo })
  expect(fs.readFileSync(path.join(tree.skillDir, "SKILL.md"), "utf8")).toContain("uncommitted edit")
  expect(tree.skillDir.endsWith(path.join("skills", "x"))).toBe(true)
})

test("reusing a dest drops a reference that was deleted from the working tree", () => {
  const repo = mintCellDir()
  cells.push(repo)
  const skillDir = path.join(repo, "skills", "x", "references")
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(repo, "skills", "x", "SKILL.md"), "body\n")
  fs.writeFileSync(path.join(skillDir, "gone.md"), "stale\n")

  const dest = mintCellDir()
  cells.push(dest)
  const first = extractSkill({ skill: "x", ref: WORKTREE_REF, dest, repoRoot: repo })
  expect(fs.existsSync(path.join(first.skillDir, "references/gone.md"))).toBe(true)

  fs.rmSync(path.join(skillDir, "gone.md"))
  const second = extractSkill({ skill: "x", ref: WORKTREE_REF, dest, repoRoot: repo })
  expect(fs.existsSync(path.join(second.skillDir, "references/gone.md"))).toBe(false)
  expect(fs.existsSync(path.join(second.skillDir, "SKILL.md"))).toBe(true)
})
