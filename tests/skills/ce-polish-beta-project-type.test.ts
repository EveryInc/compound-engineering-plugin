import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ce-polish-projtype-"))
  await runCommand(["git", "init", "-b", "main"], root)
  return root
}

async function touch(filePath: string, content = ""): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
}

// ── New framework root detection ────────────────────────────────────────────

describe("detect-project-type.sh — new signatures", () => {
  test("nuxt.config.ts at root -> 'nuxt'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "nuxt.config.ts"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("nuxt")
  })

  test("nuxt.config.mjs at root -> 'nuxt'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "nuxt.config.mjs"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("nuxt")
  })

  test("astro.config.mjs at root -> 'astro'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "astro.config.mjs"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("astro")
  })

  test("astro.config.ts at root -> 'astro'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "astro.config.ts"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("astro")
  })

  test("remix.config.js at root -> 'remix'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "remix.config.js"), "module.exports = {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("remix")
  })

  test("remix.config.ts at root -> 'remix'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "remix.config.ts"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("remix")
  })

  test("svelte.config.js at root -> 'sveltekit'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "svelte.config.js"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("sveltekit")
  })

  test("svelte.config.mjs at root -> 'sveltekit'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "svelte.config.mjs"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("sveltekit")
  })
})

// ── Monorepo probe ──────────────────────────────────────────────────────────

describe("detect-project-type.sh — monorepo probe", () => {
  // Single hit in monorepo
  test("apps/web/next.config.js (no root signature) -> 'next@apps/web'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "apps", "web", "next.config.js"), "module.exports = {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("next@apps/web")
  })

  test("packages/frontend/vite.config.ts (no root signature) -> 'vite@packages/frontend'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "packages", "frontend", "vite.config.ts"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("vite@packages/frontend")
  })

  test("apps/site/nuxt.config.ts (no root signature) -> 'nuxt@apps/site'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "apps", "site", "nuxt.config.ts"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("nuxt@apps/site")
  })

  test("apps/docs/astro.config.mjs (no root signature) -> 'astro@apps/docs'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "apps", "docs", "astro.config.mjs"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("astro@apps/docs")
  })

  // Multiple hits in monorepo
  test("multiple next apps in monorepo -> starts with 'multiple:' and contains both", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "apps", "web", "next.config.js"), "module.exports = {}\n")
    await touch(path.join(repo, "apps", "admin", "next.config.js"), "module.exports = {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    const output = result.stdout.trim()
    expect(output.startsWith("multiple:")).toBe(true)
    expect(output).toContain("next@apps/web")
    expect(output).toContain("next@apps/admin")
  })

  test("next + rails in monorepo -> starts with 'multiple:' and contains both types", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "apps", "web", "next.config.js"), "module.exports = {}\n")
    await touch(path.join(repo, "apps", "api", "Gemfile"), "source 'x'\n")
    await touch(path.join(repo, "apps", "api", "bin", "dev"), "#!/usr/bin/env bash\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    const output = result.stdout.trim()
    expect(output.startsWith("multiple:")).toBe(true)
    expect(output).toContain("next@apps/web")
    expect(output).toContain("rails@apps/api")
  })

  // Exclusion list
  test("node_modules/next/examples/next.config.js (no root signature) -> 'unknown'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "node_modules", "next", "examples", "next.config.js"), "module.exports = {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("unknown")
  })

  test("fixtures/sample/next.config.js (no root signature) -> 'unknown'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "fixtures", "sample", "next.config.js"), "module.exports = {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("unknown")
  })

  // Depth cap
  test("depth 4 is too deep -> 'unknown'", async () => {
    const repo = await initRepo()
    await touch(
      path.join(repo, "projects", "app", "web", "client", "next.config.js"),
      "module.exports = {}\n",
    )
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("unknown")
  })

  test("depth 2 (apps/web) is within limit -> detected", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "apps", "web", "next.config.js"), "module.exports = {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("next@apps/web")
  })

  test("depth 3 (services/api/server) is exactly at limit -> detected", async () => {
    const repo = await initRepo()
    await touch(
      path.join(repo, "services", "api", "server", "vite.config.ts"),
      "export default {}\n",
    )
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("vite@services/api/server")
  })

  // Root wins over monorepo probe
  test("rails at root + next inside apps/web -> 'rails' (root wins)", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "bin", "dev"), "#!/usr/bin/env bash\n")
    await touch(path.join(repo, "Gemfile"), "source 'x'\n")
    await touch(path.join(repo, "apps", "web", "next.config.js"), "module.exports = {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("rails")
  })

  test("next at root + vite inside packages/ui -> 'next' (root wins)", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "next.config.js"), "module.exports = {}\n")
    await touch(path.join(repo, "packages", "ui", "vite.config.ts"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("next")
  })

  // Still unknown
  test("only README.md, no signatures anywhere -> 'unknown'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "README.md"), "# nothing\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("unknown")
  })

  // Monorepo probe at depth 1
  test("apps/web/ with next.config.js directly in it -> 'next@apps/web'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "apps", "web", "next.config.js"), "module.exports = {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("next@apps/web")
  })
})

// ── Regressions ─────────────────────────────────────────────────────────────

describe("detect-project-type.sh — regressions", () => {
  test("bin/dev + Gemfile at root -> 'rails'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "bin", "dev"), "#!/usr/bin/env bash\n")
    await touch(path.join(repo, "Gemfile"), "source 'https://rubygems.org'\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("rails")
  })

  test("next.config.mjs at root -> 'next'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "next.config.mjs"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("next")
  })

  test("vite.config.ts at root -> 'vite'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "vite.config.ts"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("vite")
  })

  test("Procfile.dev without bin/dev -> 'procfile'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "Procfile.dev"), "web: node server.js\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("procfile")
  })

  test("Rails (bin/dev+Gemfile) + Procfile.dev -> 'rails' (rails wins, not multiple)", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "bin", "dev"), "#!/usr/bin/env bash\n")
    await touch(path.join(repo, "Gemfile"), "source 'x'\n")
    await touch(path.join(repo, "Procfile.dev"), "web: bin/rails s\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("rails")
  })

  test("Rails + Next at root -> 'multiple'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "bin", "dev"), "#!/usr/bin/env bash\n")
    await touch(path.join(repo, "Gemfile"), "source 'x'\n")
    await touch(path.join(repo, "next.config.mjs"), "export default {}\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("multiple")
  })

  test("No signatures -> 'unknown'", async () => {
    const repo = await initRepo()
    await touch(path.join(repo, "README.md"), "# nothing\n")
    const result = await runCommand(["bash", detectProjectType], repo)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("unknown")
  })
})
