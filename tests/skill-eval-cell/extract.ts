import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export const REPO_ROOT = path.resolve(import.meta.dir, "../..")

export function extractSkill(opts: {
  skill: string
  ref?: string
  dest: string
  repoRoot?: string
}): { skillDir: string } {
  const repoRoot = opts.repoRoot ?? REPO_ROOT
  const ref = opts.ref ?? "HEAD"
  const prefix = `skills/${opts.skill}`
  fs.mkdirSync(opts.dest, { recursive: true })
  const archive = spawnSync("git", ["archive", ref, prefix], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  })
  if (archive.status !== 0) {
    throw new Error(`git archive ${ref} ${prefix} failed:\n${archive.stderr.toString()}`)
  }
  const tar = spawnSync("tar", ["-x", "-C", opts.dest], {
    cwd: repoRoot,
    input: archive.stdout,
    encoding: "buffer",
  })
  if (tar.status !== 0) {
    throw new Error(`tar extract failed:\n${tar.stderr.toString()}`)
  }
  const skillDir = path.join(opts.dest, prefix)
  if (!fs.existsSync(path.join(skillDir, "SKILL.md"))) {
    throw new Error(`extracted skill missing SKILL.md at ${skillDir}`)
  }
  return { skillDir }
}

export function mintCellDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ce-skill-eval-cell-"))
}
