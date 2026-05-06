import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

const resolvePackageManager = path.join(
  import.meta.dir,
  "..",
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "ce-polish-beta",
  "scripts",
  "resolve-package-manager.sh",
)

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
}

type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

async function runCommand(cmd: string[], cwd: string): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: gitEnv,
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

async function initRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-polish-pkgmgr-"))
  await runCommand(["git", "init", "-b", "main"], root)
  return root
}

async function touch(filePath: string, content = ""): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}

describe("resolve-package-manager.sh", () => {
  // --- Happy paths ---

  test("pnpm-lock.yaml present -> pnpm / dev", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, "package.json"), { name: "test" })
    await touch(path.join(repo, "pnpm-lock.yaml"))
    const result = await runCommand(["bash", resolvePackageManager], repo)
    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines[0]).toBe("pnpm")
    expect(lines[1]).toBe("dev")
  })

  test("yarn.lock present -> yarn / dev", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, "package.json"), { name: "test" })
    await touch(path.join(repo, "yarn.lock"))
    const result = await runCommand(["bash", resolvePackageManager], repo)
    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines[0]).toBe("yarn")
    expect(lines[1]).toBe("dev")
  })

  test("bun.lockb present -> bun / run dev", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, "package.json"), { name: "test" })
    await touch(path.join(repo, "bun.lockb"))
    const result = await runCommand(["bash", resolvePackageManager], repo)
    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines[0]).toBe("bun")
    expect(lines[1]).toBe("run dev")
  })

  test("bun.lock (text format) present -> bun / run dev", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, "package.json"), { name: "test" })
    await touch(path.join(repo, "bun.lock"))
    const result = await runCommand(["bash", resolvePackageManager], repo)
    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines[0]).toBe("bun")
    expect(lines[1]).toBe("run dev")
  })

  test("package-lock.json present -> npm / run dev", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, "package.json"), { name: "test" })
    await touch(path.join(repo, "package-lock.json"))
    const result = await runCommand(["bash", resolvePackageManager], repo)
    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines[0]).toBe("npm")
    expect(lines[1]).toBe("run dev")
  })

  test("no lockfile but package.json present -> npm / run dev (safe default)", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, "package.json"), { name: "test" })
    const result = await runCommand(["bash", resolvePackageManager], repo)
    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines[0]).toBe("npm")
    expect(lines[1]).toBe("run dev")
  })

  // --- Priority / edge cases ---

  test("both pnpm-lock.yaml and yarn.lock present -> pnpm wins (priority order)", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, "package.json"), { name: "test" })
    await touch(path.join(repo, "pnpm-lock.yaml"))
    await touch(path.join(repo, "yarn.lock"))
    const result = await runCommand(["bash", resolvePackageManager], repo)
    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines[0]).toBe("pnpm")
    expect(lines[1]).toBe("dev")
  })

  test("both bun.lockb and bun.lock present -> bun.lock wins (text preferred over binary)", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, "package.json"), { name: "test" })
    await touch(path.join(repo, "bun.lockb"))
    await touch(path.join(repo, "bun.lock"))
    // bun.lock (text) is checked before bun.lockb (binary) in priority order,
    // so the result is the same either way -- but both present should still resolve to bun.
    const result = await runCommand(["bash", resolvePackageManager], repo)
    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines[0]).toBe("bun")
    expect(lines[1]).toBe("run dev")
  })

  test("positional path arg pointing to subdir (apps/web) -> reads lockfile from that subdir", async () => {
    const repo = await initRepo()
    const webDir = path.join(repo, "apps", "web")
    await writeJson(path.join(webDir, "package.json"), { name: "web" })
    await touch(path.join(webDir, "yarn.lock"))
    const result = await runCommand(["bash", resolvePackageManager, webDir], repo)
    expect(result.exitCode).toBe(0)
    const lines = result.stdout.trim().split("\n")
    expect(lines[0]).toBe("yarn")
    expect(lines[1]).toBe("dev")
  })

  // --- Sentinel cases ---

  test("directory without package.json -> __NO_PACKAGE_JSON__, exit 0", async () => {
    const repo = await initRepo()
    const result = await runCommand(["bash", resolvePackageManager], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("__NO_PACKAGE_JSON__")
  })

  // --- Error cases ---

  test("not in a git repo AND no positional arg -> stderr contains ERROR:, exit 1", async () => {
    // Create a plain directory (not a git repo)
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ce-polish-pkgmgr-nogit-"))
    const result = await runCommand(["bash", resolvePackageManager], dir)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("ERROR:")
  })

  test("positional path doesn't exist -> stderr contains ERROR:, exit 1", async () => {
    const repo = await initRepo()
    const result = await runCommand(
      ["bash", resolvePackageManager, path.join(repo, "nonexistent")],
      repo,
    )
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("ERROR:")
  })
})
