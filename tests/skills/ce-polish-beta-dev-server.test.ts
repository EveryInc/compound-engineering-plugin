import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

const readLaunchJson = path.join(
  import.meta.dir,
  "..",
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "ce-polish-beta",
  "scripts",
  "read-launch-json.sh",
)

const detectProjectType = path.join(
  import.meta.dir,
  "..",
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "ce-polish-beta",
  "scripts",
  "detect-project-type.sh",
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-polish-devserver-"))
  await runCommand(["git", "init", "-b", "main"], root)
  return root
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}

async function touch(filePath: string, content = ""): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
}

describe("read-launch-json.sh", () => {
  test("emits __NO_LAUNCH_JSON__ when file is absent", async () => {
    const repo = await initRepo()
    const result = await runCommand(["bash", readLaunchJson], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("__NO_LAUNCH_JSON__")
  })

  test("emits __INVALID_LAUNCH_JSON__ for malformed JSON", async () => {
    const repo = await initRepo()
    const launchPath = path.join(repo, ".claude", "launch.json")
    await fs.mkdir(path.dirname(launchPath), { recursive: true })
    await fs.writeFile(launchPath, "{ not valid json ")
    const result = await runCommand(["bash", readLaunchJson], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("__INVALID_LAUNCH_JSON__")
  })

  test("emits __MISSING_CONFIGURATIONS__ when configurations array is absent", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, ".claude", "launch.json"), { version: "0.2.0" })
    const result = await runCommand(["bash", readLaunchJson], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("__MISSING_CONFIGURATIONS__")
  })

  test("returns the single configuration verbatim when there is exactly one", async () => {
    const repo = await initRepo()
    const config = {
      name: "Rails dev",
      runtimeExecutable: "bin/dev",
      runtimeArgs: [],
      port: 3000,
    }
    await writeJson(path.join(repo, ".claude", "launch.json"), {
      version: "0.2.0",
      configurations: [config],
    })

    const result = await runCommand(["bash", readLaunchJson], repo)
    expect(result.exitCode).toBe(0)

    const parsed = JSON.parse(result.stdout.trim())
    expect(parsed).toEqual(config)
  })

  test("emits __MULTIPLE_CONFIGS__ and name list when called without arg", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, ".claude", "launch.json"), {
      version: "0.2.0",
      configurations: [
        { name: "web", runtimeExecutable: "bin/dev", port: 3000 },
        { name: "worker", runtimeExecutable: "bundle", runtimeArgs: ["exec", "sidekiq"], port: 0 },
      ],
    })

    const result = await runCommand(["bash", readLaunchJson], repo)
    expect(result.exitCode).toBe(0)

    const lines = result.stdout.trim().split("\n")
    expect(lines[0]).toBe("__MULTIPLE_CONFIGS__")
    expect(JSON.parse(lines[1]!)).toEqual(["web", "worker"])
  })

  test("returns the named configuration when called with an arg", async () => {
    const repo = await initRepo()
    const web = { name: "web", runtimeExecutable: "bin/dev", port: 3000 }
    const worker = { name: "worker", runtimeExecutable: "bundle", port: 0 }
    await writeJson(path.join(repo, ".claude", "launch.json"), {
      version: "0.2.0",
      configurations: [web, worker],
    })

    const result = await runCommand(["bash", readLaunchJson, "worker"], repo)
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.trim())).toEqual(worker)
  })

  test("emits __CONFIG_NOT_FOUND__ when the named config does not exist in a multi-config file", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, ".claude", "launch.json"), {
      version: "0.2.0",
      configurations: [
        { name: "web", runtimeExecutable: "bin/dev", port: 3000 },
        { name: "worker", runtimeExecutable: "bundle", port: 0 },
      ],
    })

    const result = await runCommand(["bash", readLaunchJson, "missing"], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("__CONFIG_NOT_FOUND__")
  })
})

describe("detect-project-type.sh", () => {
  test("returns 'rails' when bin/dev + Gemfile are present", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "bin", "dev"), "#!/usr/bin/env bash\n")
    await touch(path.join(repo, "Gemfile"), "source 'https://rubygems.org'\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("rails")
  })

  test("returns 'next' when next.config.mjs is present", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "next.config.mjs"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("next")
  })

  test("returns 'next' for next.config.ts", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "next.config.ts"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.stdout.trim()).toBe("next")
  })

  test("returns 'vite' when vite.config.ts is present", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "vite.config.ts"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("vite")
  })

  test("returns 'procfile' when Procfile.dev is present without bin/dev", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "Procfile.dev"), "web: node server.js\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("procfile")
  })

  test("Rails wins over bare Procfile (common Rails layout has both)", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "bin", "dev"), "#!/usr/bin/env bash\n")
    await touch(path.join(repo, "Gemfile"), "source 'x'\n")
    await touch(path.join(repo, "Procfile.dev"), "web: bin/rails s\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.stdout.trim()).toBe("rails")
  })

  test("returns 'multiple' when Rails and Next both match", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "bin", "dev"), "#!/usr/bin/env bash\n")
    await touch(path.join(repo, "Gemfile"), "source 'x'\n")
    await touch(path.join(repo, "next.config.mjs"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.stdout.trim()).toBe("multiple")
  })

  test("returns 'multiple' for Next + Vite together", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "next.config.mjs"), "export default {}\n")
    await touch(path.join(repo, "vite.config.ts"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.stdout.trim()).toBe("multiple")
  })

  test("returns 'unknown' when no signatures match", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "README.md"), "# nothing\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("unknown")
  })

  test("returns 'unknown' when only a Gemfile is present (no bin/dev)", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "Gemfile"), "source 'x'\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    // Gemfile alone is not a Rails signature -- tons of gems have Gemfiles.
    expect(result.stdout.trim()).toBe("unknown")
  })
})
