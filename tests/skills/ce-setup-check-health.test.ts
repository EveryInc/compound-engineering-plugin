import { chmod, mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

const checkHealthScript = path.join(
  import.meta.dir,
  "..",
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "ce-setup",
  "scripts",
  "check-health",
)

type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

async function runCheckHealth(home: string, pathValue: string): Promise<RunResult> {
  const proc = Bun.spawn(["bash", checkHealthScript], {
    cwd: home,
    env: {
      ...process.env,
      HOME: home,
      PATH: pathValue,
    },
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

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content)
  await chmod(filePath, 0o755)
}

describe("ce-setup check-health", () => {
  test("detects global Codex skills under ~/.agents/skills when skills CLI misses them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await mkdir(path.join(root, ".agents", "skills", "ast-grep"), { recursive: true })

      const binDir = path.join(root, "bin")
      await writeExecutable(
        path.join(binDir, "npx"),
        "#!/usr/bin/env bash\nprintf '%s\\n' '[{\"name\":\"other-skill\"}]'\n",
      )

      const result = await runCheckHealth(root, `${binDir}:/usr/bin:/bin`)

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Skills  1/1")
      expect(result.stdout).toContain("1/1 skills")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
