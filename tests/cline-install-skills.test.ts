import { afterEach, describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

const tempDirs: string[] = []

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

const installScript = path.join(
  import.meta.dir,
  "..",
  ".cline",
  "scripts",
  "install-skills.sh",
)

const manualSkill = "ce-setup"
const invocableSkill = "ce-plan"

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
    const dest = await makeTempDir("cline-skills-dest-")
    const userSkill = await makeTempDir(`cline-user-${manualSkill}-`)
    await fs.writeFile(path.join(userSkill, "SKILL.md"), `# user ${manualSkill}\n`)

    await fs.symlink(userSkill, path.join(dest, manualSkill))

    const result = await runInstall({
      CLINE_SKILLS_DIR: dest,
    })

    expect(result.exitCode).toBe(0)
    expect(await pathExists(path.join(dest, manualSkill))).toBe(true)
    expect(result.stderr).not.toContain(`removed ${manualSkill}`)
  })

  test("does not overwrite an existing user-managed symlink for an invocable skill", async () => {
    const dest = await makeTempDir("cline-skills-user-invocable-")
    const userSkill = await makeTempDir("cline-user-ce-plan-")
    await fs.writeFile(path.join(userSkill, "SKILL.md"), "# user ce-plan\n")

    const link = path.join(dest, invocableSkill)
    await fs.symlink(userSkill, link)

    const result = await runInstall({
      CLINE_SKILLS_DIR: dest,
    })

    expect(result.exitCode).toBe(0)
    expect(await fs.realpath(link)).toBe(await fs.realpath(userSkill))
    expect(result.stderr).toContain(
      `skip ${invocableSkill}: ${link} is an existing user-managed symlink (not overwritten)`,
    )
  })

  test("removes stale CE-owned manual-only symlinks on default install", async () => {
    const dest = await makeTempDir("cline-skills-ce-")
    const repoRoot = path.join(import.meta.dir, "..")
    const ceManualSkill = path.join(repoRoot, "skills", manualSkill)

    await fs.symlink(ceManualSkill, path.join(dest, manualSkill))

    const result = await runInstall({
      CLINE_SKILLS_DIR: dest,
    })

    expect(result.exitCode).toBe(0)
    expect(await pathExists(path.join(dest, manualSkill))).toBe(false)
    expect(result.stderr).toContain(`removed ${manualSkill}: stale CE manual-only symlink`)
  })
})
