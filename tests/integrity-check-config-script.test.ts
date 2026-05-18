import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
}

const integrityCheckScript = path.join(
  import.meta.dir,
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "ce-code-review-beta",
  "scripts",
  "integrity-check-config.sh",
)

type RunResult = {
  exitCode: number
  stderr: string
  stdout: string
}

async function runCommand(
  cmd: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: env ?? process.env,
    stderr: "pipe",
    stdout: "pipe",
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  return { exitCode, stderr, stdout }
}

async function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<void> {
  const result = await runCommand(["git", ...args], cwd, env ?? gitEnv)
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.exitCode}).\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    )
  }
}

async function initRepo(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "integrity-check-config-repo-"))
  await runGit(["init", "-b", "main"], repoRoot)
  return repoRoot
}

async function writeConfig(repoRoot: string): Promise<void> {
  await fs.mkdir(path.join(repoRoot, ".compound-engineering"), { recursive: true })
  await fs.writeFile(
    path.join(repoRoot, ".compound-engineering", "config.local.yaml"),
    "review_delegate: false\n",
  )
}

async function runIntegrityCheck(
  repoRoot: string,
  env?: NodeJS.ProcessEnv,
): Promise<RunResult> {
  return runCommand(["bash", integrityCheckScript, repoRoot], repoRoot, env ?? gitEnv)
}

describe("integrity-check-config.sh — gitignore source validation", () => {
  test("accepts repo-local .gitignore match", async () => {
    const repoRoot = await initRepo()
    await writeConfig(repoRoot)
    await fs.writeFile(
      path.join(repoRoot, ".gitignore"),
      ".compound-engineering/config.local.yaml\n",
    )

    const result = await runIntegrityCheck(repoRoot)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^OK:.+config\.local\.yaml$/)
  })

  test("accepts .git/info/exclude match", async () => {
    const repoRoot = await initRepo()
    await writeConfig(repoRoot)
    await fs.appendFile(
      path.join(repoRoot, ".git", "info", "exclude"),
      "\n.compound-engineering/config.local.yaml\n",
    )

    const result = await runIntegrityCheck(repoRoot)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^OK:.+config\.local\.yaml$/)
  })

  test("rejects global core.excludesfile match only", async () => {
    const repoRoot = await initRepo()
    await writeConfig(repoRoot)
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "integrity-check-home-"))
    const excludesFile = path.join(home, "global-ignore")
    await fs.writeFile(excludesFile, ".compound-engineering/config.local.yaml\n")
    await fs.writeFile(
      path.join(home, ".gitconfig"),
      `[core]\n\texcludesfile = ${excludesFile}\n`,
    )

    const result = await runIntegrityCheck(repoRoot, {
      ...gitEnv,
      HOME: home,
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout.trim()).toMatch(/^ERROR:config\.local\.yaml is not covered by a repository-local gitignore source/)
  })

  test("rejects config that is not ignored", async () => {
    const repoRoot = await initRepo()
    await writeConfig(repoRoot)

    const result = await runIntegrityCheck(repoRoot)

    expect(result.exitCode).toBe(1)
    expect(result.stdout.trim()).toMatch(/^ERROR:config\.local\.yaml is not covered by \.gitignore/)
  })
})
