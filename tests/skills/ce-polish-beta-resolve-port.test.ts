import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

const resolvePort = path.join(
  import.meta.dir,
  "..",
  "..",
  "plugins",
  "compound-engineering",
  "skills",
  "ce-polish-beta",
  "scripts",
  "resolve-port.sh",
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-polish-resolve-port-"))
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

describe("resolve-port.sh", () => {
  // Explicit override
  test("--port 8080 returns 8080", async () => {
    const repo = await initRepo()
    const result = await runCommand(["bash", resolvePort, repo, "--port", "8080"], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("8080")
  })

  // Framework config probes
  test("next.config.js with port: 4000 returns 4000", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "next.config.js"), `module.exports = { server: { port: 4000 } }`)
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("4000")
  })

  test("next.config.ts with server: { port: 4000 } returns 4000", async () => {
    const repo = await initRepo()
    await touch(
      path.join(repo, "next.config.ts"),
      `export default { server: { port: 4000 } }`,
    )
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("4000")
  })

  test("vite.config.ts with server: { port: 8888 } returns 8888", async () => {
    const repo = await initRepo()
    await touch(
      path.join(repo, "vite.config.ts"),
      `export default { server: { port: 8888 } }`,
    )
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("8888")
  })

  // Rails
  test("config/puma.rb with port 3001 returns 3001 (with --type rails)", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "config", "puma.rb"), `port 3001\n`)
    const result = await runCommand(["bash", resolvePort, repo, "--type", "rails"], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3001")
  })

  test("multiline next.config.js with port on its own line returns port", async () => {
    const repo = await initRepo()
    await touch(
      path.join(repo, "next.config.js"),
      ["module.exports = {", "  server: {", "    port: 3000", "  }", "}"].join("\n"),
    )
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3000")
  })

  // Procfile
  test("Procfile.dev web line with -p 4567 returns 4567", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "Procfile.dev"), "web: bundle exec puma -p 4567\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("4567")
  })

  test("Procfile.dev web line with compact -p3000 returns 3000", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "Procfile.dev"), "web: rails s -p3000\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3000")
  })

  // docker-compose
  test('docker-compose.yml with ports: ["9000:9000"] returns 9000', async () => {
    const repo = await initRepo()
    await touch(
      path.join(repo, "docker-compose.yml"),
      [
        "version: '3'",
        "services:",
        "  web:",
        "    image: myapp",
        "    ports:",
        '      - "9000:9000"',
      ].join("\n") + "\n",
    )
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("9000")
  })

  // package.json
  test("package.json dev script with --port 4000 returns 4000", async () => {
    const repo = await initRepo()
    await writeJson(path.join(repo, "package.json"), {
      scripts: {
        dev: "next dev --port 4000",
      },
    })
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("4000")
  })

  // .env parsing
  test(".env PORT=3001 returns 3001", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, ".env"), "PORT=3001\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3001")
  })

  test('.env PORT="3001" returns 3001 (quotes stripped)', async () => {
    const repo = await initRepo()
    await touch(path.join(repo, ".env"), 'PORT="3001"\n')
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3001")
  })

  test(".env PORT='3001' returns 3001 (single quotes stripped)", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, ".env"), "PORT='3001'\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3001")
  })

  test(".env PORT=3001 # dev only returns 3001 (comment stripped)", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, ".env"), "PORT=3001 # dev only\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3001")
  })

  test('.env PORT="3001" # quoted+commented returns 3001', async () => {
    const repo = await initRepo()
    await touch(path.join(repo, ".env"), 'PORT="3001" # quoted and commented\n')
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3001")
  })

  // .env override order
  test(".env.local PORT=4000 + .env PORT=3000 -> .env.local wins", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, ".env.local"), "PORT=4000\n")
    await touch(path.join(repo, ".env"), "PORT=3000\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("4000")
  })

  test(".env.development PORT=4000 + .env PORT=3000 -> .env.development wins", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, ".env.development"), "PORT=4000\n")
    await touch(path.join(repo, ".env"), "PORT=3000\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("4000")
  })

  test(".env.local PORT=4000 + .env.development PORT=5000 -> .env.local wins", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, ".env.local"), "PORT=4000\n")
    await touch(path.join(repo, ".env.development"), "PORT=5000\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("4000")
  })

  // Priority: framework config beats .env
  test("next.config.js port: 3000 + .env.local PORT=4000 -> framework config wins", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "next.config.js"), `module.exports = { server: { port: 3000 } }`)
    await touch(path.join(repo, ".env.local"), "PORT=4000\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3000")
  })

  test("multiple probes hit -- framework config wins over .env", async () => {
    const repo = await initRepo()
    await touch(
      path.join(repo, "vite.config.ts"),
      `export default { server: { port: 7777 } }`,
    )
    await touch(path.join(repo, ".env"), "PORT=9999\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("7777")
  })

  // Defaults
  test("no probe matches, --type next -> 3000", async () => {
    const repo = await initRepo()
    const result = await runCommand(["bash", resolvePort, repo, "--type", "next"], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3000")
  })

  test("no probe matches, --type vite -> 5173", async () => {
    const repo = await initRepo()
    const result = await runCommand(["bash", resolvePort, repo, "--type", "vite"], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("5173")
  })

  test("no probe matches, --type astro -> 4321", async () => {
    const repo = await initRepo()
    const result = await runCommand(["bash", resolvePort, repo, "--type", "astro"], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("4321")
  })

  test("no probe matches, --type sveltekit -> 5173", async () => {
    const repo = await initRepo()
    const result = await runCommand(["bash", resolvePort, repo, "--type", "sveltekit"], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("5173")
  })

  test("no probe matches, no --type -> 3000", async () => {
    const repo = await initRepo()
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3000")
  })

  // Error / fallthrough
  test("malformed docker-compose.yml -> probe misses, falls through", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "docker-compose.yml"), "this is not yaml at all\n")
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3000")
  })

  test("next.config.js with computed port: getPort() -> regex misses, falls through to default", async () => {
    const repo = await initRepo()
    await touch(
      path.join(repo, "next.config.js"),
      `module.exports = { server: { port: getPort() } }`,
    )
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3000")
  })

  test('next.config.js with "port: process.env.PORT || 3000" -> probe rejects, falls through', async () => {
    const repo = await initRepo()
    await touch(
      path.join(repo, "next.config.js"),
      `module.exports = { server: { port: process.env.PORT || 3000 } }`,
    )
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    // The regex should NOT match "port: process.env.PORT || 3000" because it
    // contains non-numeric content. Falls through to default.
    expect(result.stdout.trim()).toBe("3000")
  })

  test("positional path doesn't exist -> stderr ERROR: + exit 1", async () => {
    const repo = await initRepo()
    const result = await runCommand(
      ["bash", resolvePort, path.join(repo, "nonexistent")],
      repo,
    )
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("ERROR:")
  })

  // Regression: AGENTS.md/CLAUDE.md NOT scanned
  test("AGENTS.md mentioning port 8443 -> ignored (returns default 3000)", async () => {
    const repo = await initRepo()
    await touch(
      path.join(repo, "AGENTS.md"),
      "# Instructions\n\nThe dev server runs on port 8443.\n",
    )
    const result = await runCommand(["bash", resolvePort, repo], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("3000")
  })
})
