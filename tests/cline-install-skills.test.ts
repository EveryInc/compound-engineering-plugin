import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

const installScript = path.join(
  import.meta.dir,
  "..",
  ".cline",
  "scripts",
  "install-skills.sh",
)

const manualSkill = "lfg"

type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

async function runInstall(
  env: Record<string, string | undefined>,
  args: string[] = ["--global"],
): Promise<RunResult> {
  const proc = Bun.spawn(["bash", installScript, ...args], {
    cwd: path.join(import.meta.dir, ".."),
    env: { ...process.env, ...env },
    stderr: "pipe",
    stdout: "pipe",
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  return { exitCode, stdout, stderr }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("cline install-skills.sh", () => {
  test("does not remove unrelated manual-only skill symlinks", async () => {
    const dest = await fs.mkdtemp(path.join(os.tmpdir(), "cline-skills-dest-"))
    const userSkill = await fs.mkdtemp(path.join(os.tmpdir(), "cline-user-lfg-"))
    await fs.writeFile(path.join(userSkill, "SKILL.md"), "# user lfg\n")

    await fs.symlink(userSkill, path.join(dest, manualSkill))

    const result = await runInstall({
      CLINE_SKILLS_DIR: dest,
    })

    expect(result.exitCode).toBe(0)
    expect(await pathExists(path.join(dest, manualSkill))).toBe(true)
    expect(result.stderr).not.toContain("removed lfg")
  })

  test("removes stale CE-owned manual-only symlinks on default install", async () => {
    const dest = await fs.mkdtemp(path.join(os.tmpdir(), "cline-skills-ce-"))
    const repoRoot = path.join(import.meta.dir, "..")
    const ceManualSkill = path.join(repoRoot, "skills", manualSkill)

    await fs.symlink(ceManualSkill, path.join(dest, manualSkill))

    const result = await runInstall({
      CLINE_SKILLS_DIR: dest,
    })

    expect(result.exitCode).toBe(0)
    expect(await pathExists(path.join(dest, manualSkill))).toBe(false)
    expect(result.stderr).toContain("removed lfg: stale CE manual-only symlink")
  })
})
