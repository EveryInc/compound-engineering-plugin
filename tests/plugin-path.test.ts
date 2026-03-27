import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: env ?? process.env,
  })
  const exitCode = await proc.exited
  const stderr = await new Response(proc.stderr).text()
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed (exit ${exitCode}).\nstderr: ${stderr}`)
  }
}

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
}

const projectRoot = path.join(import.meta.dir, "..")
const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

async function createTestRepo(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-path-repo-"))
  const pluginRoot = path.join(repoRoot, "plugins", "compound-engineering")
  await fs.mkdir(path.dirname(pluginRoot), { recursive: true })
  await fs.cp(fixtureRoot, pluginRoot, { recursive: true })

  await runGit(["init", "-b", "main"], repoRoot, gitEnv)
  await runGit(["add", "."], repoRoot, gitEnv)
  await runGit(["commit", "-m", "initial"], repoRoot, gitEnv)
  return repoRoot
}

describe("plugin-path", () => {
  test("clones a branch to a stable cache path", async () => {
    const repoRoot = await createTestRepo()
    await runGit(["checkout", "-b", "feat/test-branch"], repoRoot, gitEnv)
    await runGit(["checkout", "main"], repoRoot, gitEnv)

    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-path-home-"))

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(projectRoot, "src", "index.ts"),
      "plugin-path",
      "compound-engineering",
      "--branch",
      "feat/test-branch",
    ], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...gitEnv,
        HOME: tempHome,
        COMPOUND_PLUGIN_GITHUB_SOURCE: repoRoot,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    const cacheDir = path.join(tempHome, ".cache", "compound-engineering", "branches", "compound-engineering-feat~test-branch")
    const pluginDir = path.join(cacheDir, "plugins", "compound-engineering")

    expect(stderr).toContain("claude --plugin-dir")
    expect(stdout.trim()).toBe(pluginDir)
    expect(await exists(path.join(pluginDir, ".claude-plugin", "plugin.json"))).toBe(true)
  })

  test("sanitizes branch names with slashes into stable directory names", async () => {
    const repoRoot = await createTestRepo()
    await runGit(["checkout", "-b", "feat/deep/nested/branch"], repoRoot, gitEnv)
    await runGit(["checkout", "main"], repoRoot, gitEnv)

    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-path-sanitize-"))

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(projectRoot, "src", "index.ts"),
      "plugin-path",
      "compound-engineering",
      "--branch",
      "feat/deep/nested/branch",
    ], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...gitEnv,
        HOME: tempHome,
        COMPOUND_PLUGIN_GITHUB_SOURCE: repoRoot,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("compound-engineering-feat~deep~nested~branch")
    expect(stderr).toContain("claude --plugin-dir")
  })

  test("updates existing checkout on re-run", async () => {
    const repoRoot = await createTestRepo()
    await runGit(["checkout", "-b", "feat/update-test"], repoRoot, gitEnv)

    // Add a marker file on the branch
    const markerPath = path.join(repoRoot, "plugins", "compound-engineering", "MARKER.txt")
    await fs.writeFile(markerPath, "v1")
    await runGit(["add", "."], repoRoot, gitEnv)
    await runGit(["commit", "-m", "add marker v1"], repoRoot, gitEnv)

    await runGit(["checkout", "main"], repoRoot, gitEnv)

    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-path-update-"))
    const cacheDir = path.join(tempHome, ".cache", "compound-engineering", "branches", "compound-engineering-feat~update-test")

    const runPluginPath = async () => {
      const proc = Bun.spawn([
        "bun",
        "run",
        path.join(projectRoot, "src", "index.ts"),
        "plugin-path",
        "compound-engineering",
        "--branch",
        "feat/update-test",
      ], {
        cwd: projectRoot,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...gitEnv,
          HOME: tempHome,
          COMPOUND_PLUGIN_GITHUB_SOURCE: repoRoot,
        },
      })
      const exitCode = await proc.exited
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      if (exitCode !== 0) {
        throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
      }
      return { stdout, stderr }
    }

    // First run: clone
    const first = await runPluginPath()
    expect(first.stderr).toContain("Cloning")
    const cachedMarker = path.join(cacheDir, "plugins", "compound-engineering", "MARKER.txt")
    expect(await fs.readFile(cachedMarker, "utf-8")).toBe("v1")

    // Push a new commit to the branch
    await runGit(["checkout", "feat/update-test"], repoRoot, gitEnv)
    await fs.writeFile(markerPath, "v2")
    await runGit(["add", "."], repoRoot, gitEnv)
    await runGit(["commit", "-m", "update marker to v2"], repoRoot, gitEnv)
    await runGit(["checkout", "main"], repoRoot, gitEnv)

    // Second run: update
    const second = await runPluginPath()
    expect(second.stderr).toContain("Updating")
    expect(await fs.readFile(cachedMarker, "utf-8")).toBe("v2")
  })

  test("fails with a clear error for a nonexistent branch", async () => {
    const repoRoot = await createTestRepo()
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-path-noexist-"))

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(projectRoot, "src", "index.ts"),
      "plugin-path",
      "compound-engineering",
      "--branch",
      "does-not-exist",
    ], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...gitEnv,
        HOME: tempHome,
        COMPOUND_PLUGIN_GITHUB_SOURCE: repoRoot,
      },
    })

    const exitCode = await proc.exited
    expect(exitCode).not.toBe(0)
  })

  test("produces distinct cache paths for branches that differ only by slash placement", async () => {
    const repoRoot = await createTestRepo()
    await runGit(["checkout", "-b", "feat/foo-bar"], repoRoot, gitEnv)
    await runGit(["checkout", "main"], repoRoot, gitEnv)
    await runGit(["checkout", "-b", "feat-foo/bar"], repoRoot, gitEnv)
    await runGit(["checkout", "main"], repoRoot, gitEnv)

    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-path-collision-"))

    const runForBranch = async (branch: string) => {
      const proc = Bun.spawn([
        "bun",
        "run",
        path.join(projectRoot, "src", "index.ts"),
        "plugin-path",
        "compound-engineering",
        "--branch",
        branch,
      ], {
        cwd: projectRoot,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...gitEnv,
          HOME: tempHome,
          COMPOUND_PLUGIN_GITHUB_SOURCE: repoRoot,
        },
      })
      const exitCode = await proc.exited
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      if (exitCode !== 0) {
        throw new Error(`CLI failed for branch '${branch}' (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
      }
      return stdout.trim()
    }

    const path1 = await runForBranch("feat/foo-bar")
    const path2 = await runForBranch("feat-foo/bar")

    expect(path1).not.toBe(path2)
    expect(path1).toContain("feat~foo-bar")
    expect(path2).toContain("feat-foo~bar")
  })

  test("fails when plugin name does not exist in the repo", async () => {
    const repoRoot = await createTestRepo()
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-path-noplugin-"))

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(projectRoot, "src", "index.ts"),
      "plugin-path",
      "nonexistent-plugin",
      "--branch",
      "main",
    ], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...gitEnv,
        HOME: tempHome,
        COMPOUND_PLUGIN_GITHUB_SOURCE: repoRoot,
      },
    })

    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()
    expect(exitCode).not.toBe(0)
    expect(stderr).toContain("Plugin directory not found")
  })
})
