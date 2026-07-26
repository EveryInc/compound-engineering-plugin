import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"

const ROOT = path.join(import.meta.dir, "../..")
const WORKTREE_SCRIPT = path.join(ROOT, "skills/ce-optimize/scripts/experiment-worktree.sh")
const PROBE_SCRIPT = path.join(ROOT, "skills/ce-optimize/scripts/parallel-probe.sh")

async function run(argv: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  const proc = Bun.spawn(argv, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

async function runChecked(argv: string[], cwd: string) {
  const result = await run(argv, cwd)
  expect(result.exitCode, `${argv.join(" ")}\n${result.stderr}`).toBe(0)
  return result
}

async function exists(filePath: string) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function repoFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ce-optimize-isolation-"))
  const repo = path.join(root, "repo")
  await mkdir(repo, { recursive: true })
  await runChecked(["git", "init", "-q"], repo)
  await runChecked(["git", "config", "user.email", "test@example.com"], repo)
  await runChecked(["git", "config", "user.name", "Test User"], repo)
  await writeFile(path.join(repo, "tracked.txt"), "baseline\n")
  await runChecked(["git", "add", "tracked.txt"], repo)
  await runChecked(["git", "commit", "-q", "-m", "baseline"], repo)
  return { root, repo }
}

describe("ce-optimize worktree isolation", () => {
  test("copies only an explicitly sanctioned canonical input and never auto-copies .env files", async () => {
    const f = await repoFixture()
    try {
      await mkdir(path.join(f.repo, "inputs"), { recursive: true })
      await writeFile(path.join(f.repo, "inputs", "sanctioned.json"), "{}\n")
      await writeFile(path.join(f.repo, "undeclared.secret"), "hidden\n")
      await writeFile(path.join(f.repo, ".env"), "TOKEN=secret\n")
      await writeFile(path.join(f.repo, ".env.local"), "TOKEN=secret\n")

      const created = await run([
        "bash", WORKTREE_SCRIPT, "create", "isolation", "1", "HEAD", "--routed", "inputs/sanctioned.json",
      ], f.repo, {
        AWS_SECRET_ACCESS_KEY: "ambient-secret",
        GITHUB_TOKEN: "ambient-token",
      })
      expect(created.exitCode, created.stderr).toBe(0)
      const worktree = created.stdout.trim()

      expect(await readFile(path.join(worktree, "inputs", "sanctioned.json"), "utf8")).toBe("{}\n")
      expect(await exists(path.join(worktree, "undeclared.secret"))).toBe(false)
      expect(await exists(path.join(worktree, ".env"))).toBe(false)
      expect(await exists(path.join(worktree, ".env.local"))).toBe(false)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("no-routing worktrees retain the v3.20.0 environment-file behavior", async () => {
    const f = await repoFixture()
    try {
      await writeFile(path.join(f.repo, ".env"), "LEGACY=value\n")
      await writeFile(path.join(f.repo, ".env.local"), "LEGACY=local\n")
      await writeFile(path.join(f.repo, ".env.example"), "IGNORED=example\n")

      const created = await run([
        "bash", WORKTREE_SCRIPT, "create", "legacy", "1", "HEAD", "--legacy-no-routing",
      ], f.repo)
      expect(created.exitCode, created.stderr).toBe(0)
      const worktree = created.stdout.trim()

      expect(await readFile(path.join(worktree, ".env"), "utf8")).toBe("LEGACY=value\n")
      expect(await readFile(path.join(worktree, ".env.local"), "utf8")).toBe("LEGACY=local\n")
      expect(await exists(path.join(worktree, ".env.example"))).toBe(false)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("a routed recipient is denied when tracked checkout material contains .env files", async () => {
    const f = await repoFixture()
    try {
      await writeFile(path.join(f.repo, ".env.committed"), "SECRET=value\n")
      await runChecked(["git", "add", ".env.committed"], f.repo)
      await runChecked(["git", "commit", "-q", "-m", "tracked env fixture"], f.repo)

      for (const [spec, option] of [["tracked-env-default", ""], ["tracked-env-explicit", "--routed"]]) {
        const created = await run([
          "bash", WORKTREE_SCRIPT, "create", spec, "1", "HEAD", ...(option ? [option] : []),
        ], f.repo)
        expect(created.exitCode).not.toBe(0)
        expect(created.stderr).toMatch(/routed.*\.env|\.env.*routed/i)
      }
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test.each([
    ["path escape", "../outside.txt", /escape|relative|outside/i],
    ["dot-env input", ".env.example", /\.env/i],
    ["symlink input", "inputs/link.txt", /symlink/i],
  ])("rejects %s before creating a worktree", async (_name, sharedPath, errorPattern) => {
    const f = await repoFixture()
    try {
      await writeFile(path.join(f.root, "outside.txt"), "outside\n")
      await writeFile(path.join(f.repo, ".env.example"), "EXAMPLE=true\n")
      await mkdir(path.join(f.repo, "inputs"), { recursive: true })
      await symlink(path.join(f.root, "outside.txt"), path.join(f.repo, "inputs", "link.txt"))

      const created = await run([
        "bash", WORKTREE_SCRIPT, "create", "unsafe-input", "1", "HEAD", sharedPath,
      ], f.repo)
      expect(created.exitCode).not.toBe(0)
      expect(created.stderr).toMatch(errorPattern)
      expect(await exists(path.join(f.repo, ".worktrees", "optimize-unsafe-input-exp-001"))).toBe(false)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects a shared directory containing nested symlinks or .env material", async () => {
    const f = await repoFixture()
    try {
      const shared = path.join(f.repo, "shared")
      await mkdir(shared, { recursive: true })
      await writeFile(path.join(shared, "data.json"), "{}\n")
      await writeFile(path.join(shared, ".env.answers"), "ANSWER=hidden\n")

      const envResult = await run([
        "bash", WORKTREE_SCRIPT, "create", "nested-env", "1", "HEAD", "shared",
      ], f.repo)
      expect(envResult.exitCode).not.toBe(0)
      expect(envResult.stderr).toMatch(/\.env/i)

      await rm(path.join(shared, ".env.answers"))
      await symlink(path.join(f.repo, "tracked.txt"), path.join(shared, "linked.txt"))
      const linkResult = await run([
        "bash", WORKTREE_SCRIPT, "create", "nested-link", "1", "HEAD", "shared",
      ], f.repo)
      expect(linkResult.exitCode).not.toBe(0)
      expect(linkResult.stderr).toMatch(/symlink/i)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("rejects a symlinked worktree root before creating or cleaning experiments", async () => {
    const f = await repoFixture()
    try {
      const outside = path.join(f.root, "outside-worktrees")
      await mkdir(outside)
      await symlink(outside, path.join(f.repo, ".worktrees"))

      const created = await run([
        "bash", WORKTREE_SCRIPT, "create", "unsafe-root", "1", "HEAD", "--routed",
      ], f.repo)
      expect(created.exitCode).not.toBe(0)
      expect(created.stderr).toMatch(/worktree root.*symlink/i)

      const cleanup = await run([
        "bash", WORKTREE_SCRIPT, "cleanup-all", "unsafe-root",
      ], f.repo)
      expect(cleanup.exitCode).not.toBe(0)
      expect(cleanup.stderr).toMatch(/worktree root.*symlink/i)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("a result marker prevents reset and cleanup until its log checkpoint is acknowledged", async () => {
    const f = await repoFixture()
    try {
      const created = await run([
        "bash", WORKTREE_SCRIPT, "create", "recovery", "1", "HEAD",
      ], f.repo)
      expect(created.exitCode, created.stderr).toBe(0)
      const worktree = created.stdout.trim()
      await writeFile(path.join(worktree, "result.yaml"), "iteration: 1\n")

      const reused = await run([
        "bash", WORKTREE_SCRIPT, "create", "recovery", "1", "HEAD",
      ], f.repo)
      expect(reused.exitCode).not.toBe(0)
      expect(reused.stderr).toMatch(/result marker/i)
      expect(await exists(path.join(worktree, "result.yaml"))).toBe(true)

      const unacknowledgedCleanup = await run([
        "bash", WORKTREE_SCRIPT, "cleanup", "recovery", "1",
      ], f.repo)
      expect(unacknowledgedCleanup.exitCode).not.toBe(0)
      expect(unacknowledgedCleanup.stderr).toMatch(/result.*recorded|checkpoint/i)
      expect(await exists(worktree)).toBe(true)

      const cleanup = await run([
        "bash", WORKTREE_SCRIPT, "cleanup", "recovery", "1", "--result-recorded",
      ], f.repo)
      expect(cleanup.exitCode, cleanup.stderr).toBe(0)
      expect(await exists(worktree)).toBe(false)
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("parallel probe scans only canonical declared paths", async () => {
    const f = await repoFixture()
    try {
      await mkdir(path.join(f.repo, "safe"), { recursive: true })
      await mkdir(path.join(f.repo, "unrelated"), { recursive: true })
      await writeFile(path.join(f.repo, "safe", "evaluate.py"), "print('{}')\n")
      await writeFile(path.join(f.repo, "unrelated", "ambient.sqlite"), "not scanned\n")

      const clean = await run([
        "bash", PROBE_SCRIPT, f.repo, "python evaluate.py", "safe",
      ], f.repo)
      expect(clean.exitCode, clean.stderr).toBe(0)
      expect(JSON.parse(clean.stdout)).toMatchObject({ mode: "parallel", blocker_count: 0 })

      await symlink(path.join(f.repo, "unrelated"), path.join(f.repo, "linked"))
      for (const unsafe of ["../outside", "linked", ".env.local"]) {
        const probed = await run([
          "bash", PROBE_SCRIPT, f.repo, "python evaluate.py", "safe", unsafe,
        ], f.repo)
        expect(probed.exitCode, probed.stderr).toBe(0)
        const body = JSON.parse(probed.stdout)
        expect(body.blockers.some((item: any) => item.type === "unsafe_path")).toBe(true)
        expect(body.mode).toBe("serial")
      }
    } finally {
      await rm(f.root, { recursive: true, force: true })
    }
  })

  test("spec and prompts isolate scope, sanctioned environment, and hidden answers", async () => {
    const [skill, schema, experimentPrompt, judgePrompt, logSchema] = await Promise.all([
      readFile(path.join(ROOT, "skills/ce-optimize/SKILL.md"), "utf8"),
      readFile(path.join(ROOT, "skills/ce-optimize/references/optimize-spec-schema.yaml"), "utf8"),
      readFile(path.join(ROOT, "skills/ce-optimize/references/experiment-prompt-template.md"), "utf8"),
      readFile(path.join(ROOT, "skills/ce-optimize/references/judge-prompt-template.md"), "utf8"),
      readFile(path.join(ROOT, "skills/ce-optimize/references/experiment-log-schema.yaml"), "utf8"),
    ])

    expect(schema).toContain("sanctioned_env")
    expect(schema).toContain("hidden_reference_paths")
    expect(schema).toMatch(/scope\.mutable.*scope\.immutable.*canonical|canonical.*scope\.mutable.*scope\.immutable/is)
    expect(schema).toMatch(/shared_files.*immutable/is)
    expect(schema).toMatch(/symlink/i)
    expect(schema).toMatch(/path escape|escape.*repository/i)
    expect(schema).toMatch(/\.env\*/i)

    expect(skill).toMatch(/ambient credentials.*never|never.*ambient credentials/is)
    expect(skill).toMatch(/sanctioned_env.*only/is)
    expect(skill).toMatch(/cannot enforce.*environment.*unavailable/is)
    expect(experimentPrompt).toContain("{sanctioned_shared_inputs}")
    expect(experimentPrompt).toMatch(/do not.*measurement harness/i)
    expect(experimentPrompt).toMatch(/hidden reference|answer key/i)
    expect(judgePrompt).toMatch(/separate.*experiment author/i)
    expect(judgePrompt).toMatch(/hidden reference|answer key/i)
    expect(judgePrompt).toMatch(/do not.*workspace|no.*workspace/i)
    expect(logSchema).toContain("constraints_digest")
    expect(logSchema).toContain("author_receipt")
    expect(logSchema).toContain("judge_receipts")
  })

  test("append-before-display, immutable measurement, bounded dispatch, and recovery remain load-bearing", async () => {
    const skill = await readFile(path.join(ROOT, "skills/ce-optimize/SKILL.md"), "utf8")

    expect(skill).toMatch(/write.*routing.*receipt.*before.*(?:display|present|report)/is)
    expect(skill).toMatch(/result\.yaml.*routing_snapshot_id/is)
    expect(skill).toMatch(/immutable.*measurement harness/is)
    expect(skill).toMatch(/bounded dispatch.*backpressure/is)
    expect(skill).toMatch(/worktree.*isolat/is)
    expect(skill).toMatch(/author.*judge.*separate/is)
    expect(skill).toMatch(/resume.*result\.yaml/is)
  })
})
