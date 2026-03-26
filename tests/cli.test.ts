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

describe("CLI", () => {
  test("install converts fixture plugin to OpenCode output", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-opencode-"))
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "install",
      fixtureRoot,
      "--to",
      "opencode",
      "--output",
      tempRoot,
    ], {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Installed compound-engineering")
    expect(await exists(path.join(tempRoot, "opencode.json"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".opencode", "agents", "repo-research-analyst.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".opencode", "agents", "security-sentinel.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".opencode", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".opencode", "plugins", "converted-hooks.ts"))).toBe(true)
  })

  test("install defaults output to ~/.config/opencode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-local-default-"))
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

    const repoRoot = path.join(import.meta.dir, "..")
    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "install",
      fixtureRoot,
      "--to",
      "opencode",
    ], {
      cwd: tempRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Installed compound-engineering")
    // OpenCode global config lives at ~/.config/opencode per XDG spec
    expect(await exists(path.join(tempRoot, ".config", "opencode", "opencode.json"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".config", "opencode", "agents", "repo-research-analyst.md"))).toBe(true)
  })

  test("list returns plugins in a temp workspace", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-list-"))
    const pluginsRoot = path.join(tempRoot, "plugins", "demo-plugin", ".claude-plugin")
    await fs.mkdir(pluginsRoot, { recursive: true })
    await fs.writeFile(path.join(pluginsRoot, "plugin.json"), "{\n  \"name\": \"demo-plugin\",\n  \"version\": \"1.0.0\"\n}\n")

    const repoRoot = path.join(import.meta.dir, "..")
    const proc = Bun.spawn(["bun", "run", path.join(repoRoot, "src", "index.ts"), "list"], {
      cwd: tempRoot,
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("demo-plugin")
  })

  test("install pulls from GitHub when local path is missing", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-github-install-"))
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-github-workspace-"))
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-github-repo-"))
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
    const pluginRoot = path.join(repoRoot, "plugins", "compound-engineering")

    await fs.mkdir(path.dirname(pluginRoot), { recursive: true })
    await fs.cp(fixtureRoot, pluginRoot, { recursive: true })

    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    }

    await runGit(["init"], repoRoot, gitEnv)
    await runGit(["add", "."], repoRoot, gitEnv)
    await runGit(["commit", "-m", "fixture"], repoRoot, gitEnv)

    const projectRoot = path.join(import.meta.dir, "..")
    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(projectRoot, "src", "index.ts"),
      "install",
      "compound-engineering",
      "--to",
      "opencode",
    ], {
      cwd: workspaceRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
        COMPOUND_PLUGIN_GITHUB_SOURCE: repoRoot,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Installed compound-engineering")
    // OpenCode global config lives at ~/.config/opencode per XDG spec
    expect(await exists(path.join(tempRoot, ".config", "opencode", "opencode.json"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".config", "opencode", "agents", "repo-research-analyst.md"))).toBe(true)
  })

  test("install uses bundled compound-engineering plugin for codex output", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-bundled-codex-home-"))
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-bundled-codex-workspace-"))
    const projectRoot = path.join(import.meta.dir, "..")
    const codexRoot = path.join(tempRoot, ".codex")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(projectRoot, "src", "index.ts"),
      "install",
      "compound-engineering",
      "--to",
      "codex",
    ], {
      cwd: workspaceRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
        COMPOUND_PLUGIN_GITHUB_SOURCE: "/definitely-not-a-valid-plugin-source",
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Installed compound-engineering")
    expect(stdout).toContain(codexRoot)
    expect(await exists(path.join(codexRoot, "prompts", "ce-plan.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "skills", "ce:plan", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(true)
  })

  test("install by name ignores same-named local directory", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-shadow-"))
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-shadow-workspace-"))
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-shadow-repo-"))

    // Create a directory with the plugin name that is NOT a valid plugin
    const shadowDir = path.join(workspaceRoot, "compound-engineering")
    await fs.mkdir(shadowDir, { recursive: true })
    await fs.writeFile(path.join(shadowDir, "README.md"), "Not a plugin")

    // Set up a fake GitHub source with a valid plugin
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
    const pluginRoot = path.join(repoRoot, "plugins", "compound-engineering")
    await fs.mkdir(path.dirname(pluginRoot), { recursive: true })
    await fs.cp(fixtureRoot, pluginRoot, { recursive: true })

    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    }
    await runGit(["init"], repoRoot, gitEnv)
    await runGit(["add", "."], repoRoot, gitEnv)
    await runGit(["commit", "-m", "fixture"], repoRoot, gitEnv)

    const projectRoot = path.join(import.meta.dir, "..")
    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(projectRoot, "src", "index.ts"),
      "install",
      "compound-engineering",
      "--to",
      "opencode",
      "--output",
      tempRoot,
    ], {
      cwd: workspaceRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
        COMPOUND_PLUGIN_GITHUB_SOURCE: repoRoot,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    // Should succeed by fetching from GitHub, NOT failing on the local shadow directory
    expect(stdout).toContain("Installed compound-engineering")
    expect(await exists(path.join(tempRoot, "opencode.json"))).toBe(true)
  })

  test("convert writes OpenCode output", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-convert-"))
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "convert",
      fixtureRoot,
      "--to",
      "opencode",
      "--output",
      tempRoot,
    ], {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Converted compound-engineering")
    expect(await exists(path.join(tempRoot, "opencode.json"))).toBe(true)
  })

  test("convert supports --codex-home for codex output", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-codex-home-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "convert",
      fixtureRoot,
      "--to",
      "codex",
      "--codex-home",
      codexRoot,
    ], {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Converted compound-engineering")
    expect(stdout).toContain(codexRoot)
    expect(await exists(path.join(codexRoot, "prompts", "workflows-review.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "skills", "workflows-review", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(true)
  })

  test("install supports --also with codex output", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-also-"))
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
    const codexRoot = path.join(tempRoot, ".codex")

    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "install",
      fixtureRoot,
      "--to",
      "opencode",
      "--also",
      "codex",
      "--codex-home",
      codexRoot,
      "--output",
      tempRoot,
    ], {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Installed compound-engineering")
    expect(stdout).toContain(codexRoot)
    expect(await exists(path.join(codexRoot, "prompts", "workflows-review.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "skills", "workflows-review", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(true)
  })

  test("convert supports --pi-home for pi output", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-pi-home-"))
    const piRoot = path.join(tempRoot, ".pi")
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "convert",
      fixtureRoot,
      "--to",
      "pi",
      "--pi-home",
      piRoot,
    ], {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Converted compound-engineering")
    expect(stdout).toContain(piRoot)
    expect(await exists(path.join(piRoot, "prompts", "workflows-review.md"))).toBe(true)
    expect(await exists(path.join(piRoot, "skills", "repo-research-analyst", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(piRoot, "extensions", "compound-engineering-compat.ts"))).toBe(true)
    expect(await exists(path.join(piRoot, "compound-engineering", "mcporter.json"))).toBe(true)
  })

  test("install supports --also with pi output", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-also-pi-"))
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
    const piRoot = path.join(tempRoot, ".pi")

    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "install",
      fixtureRoot,
      "--to",
      "opencode",
      "--also",
      "pi",
      "--pi-home",
      piRoot,
      "--output",
      tempRoot,
    ], {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Installed compound-engineering")
    expect(stdout).toContain(piRoot)
    expect(await exists(path.join(piRoot, "prompts", "workflows-review.md"))).toBe(true)
    expect(await exists(path.join(piRoot, "extensions", "compound-engineering-compat.ts"))).toBe(true)
  })

  test("install --to opencode uses permissions:none by default", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-perms-none-"))
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "install",
      fixtureRoot,
      "--to",
      "opencode",
      "--output",
      tempRoot,
    ], {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Installed compound-engineering")

    const opencodeJsonPath = path.join(tempRoot, "opencode.json")
    const content = await fs.readFile(opencodeJsonPath, "utf-8")
    const json = JSON.parse(content)

    expect(json).not.toHaveProperty("permission")
    expect(json).not.toHaveProperty("tools")
  })

  test("install --to opencode --permissions broad writes permission block", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-perms-broad-"))
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

    const proc = Bun.spawn([
      "bun",
      "run",
      "src/index.ts",
      "install",
      fixtureRoot,
      "--to",
      "opencode",
      "--permissions",
      "broad",
      "--output",
      tempRoot,
    ], {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Installed compound-engineering")

    const opencodeJsonPath = path.join(tempRoot, "opencode.json")
    const content = await fs.readFile(opencodeJsonPath, "utf-8")
    const json = JSON.parse(content)

    expect(json).toHaveProperty("permission")
    expect(json.permission).not.toBeNull()
  })

  test("sync --target all detects new sync targets and ignores stale cursor directories", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "cli-sync-home-"))
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "cli-sync-cwd-"))
    const repoRoot = path.join(import.meta.dir, "..")
    const fixtureSkillDir = path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one")
    const claudeSkillsDir = path.join(tempHome, ".claude", "skills", "skill-one")
    const claudeCommandsDir = path.join(tempHome, ".claude", "commands", "workflows")

    await fs.mkdir(path.dirname(claudeSkillsDir), { recursive: true })
    await fs.cp(fixtureSkillDir, claudeSkillsDir, { recursive: true })
    await fs.mkdir(claudeCommandsDir, { recursive: true })
    await fs.writeFile(
      path.join(claudeCommandsDir, "plan.md"),
      [
        "---",
        "name: workflows:plan",
        "description: Plan work",
        "argument-hint: \"[goal]\"",
        "---",
        "",
        "Plan the work.",
      ].join("\n"),
    )
    await fs.writeFile(
      path.join(tempHome, ".claude", "settings.json"),
      JSON.stringify({
        mcpServers: {
          local: { command: "echo", args: ["hello"] },
          remote: { url: "https://example.com/mcp" },
          legacy: { type: "sse", url: "https://example.com/sse" },
        },
      }, null, 2),
    )

    await fs.mkdir(path.join(tempHome, ".config", "opencode"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".codex"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".pi"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".factory"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".copilot"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".gemini"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".codeium", "windsurf"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".kiro"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".qwen"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".openclaw"), { recursive: true })
    await fs.mkdir(path.join(tempCwd, ".cursor"), { recursive: true })

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "sync",
      "--target",
      "all",
    ], {
      cwd: tempCwd,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempHome,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Synced to codex")
    expect(stdout).toContain("Synced to opencode")
    expect(stdout).toContain("Synced to pi")
    expect(stdout).toContain("Synced to droid")
    expect(stdout).toContain("Synced to windsurf")
    expect(stdout).toContain("Synced to kiro")
    expect(stdout).toContain("Synced to qwen")
    expect(stdout).toContain("Synced to openclaw")
    expect(stdout).toContain("Synced to copilot")
    expect(stdout).toContain("Synced to gemini")
    expect(stdout).not.toContain("cursor")

    expect(await exists(path.join(tempHome, ".config", "opencode", "commands", "workflows:plan.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".codex", "config.toml"))).toBe(true)
    expect(await exists(path.join(tempHome, ".codex", "prompts", "workflows-plan.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".codex", "skills", "workflows-plan", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".pi", "agent", "prompts", "workflows-plan.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".factory", "commands", "plan.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".codeium", "windsurf", "mcp_config.json"))).toBe(true)
    expect(await exists(path.join(tempHome, ".codeium", "windsurf", "global_workflows", "workflows-plan.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".kiro", "settings", "mcp.json"))).toBe(true)
    expect(await exists(path.join(tempHome, ".kiro", "skills", "workflows-plan", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".qwen", "settings.json"))).toBe(true)
    expect(await exists(path.join(tempHome, ".qwen", "commands", "workflows", "plan.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".copilot", "mcp-config.json"))).toBe(true)
    expect(await exists(path.join(tempHome, ".copilot", "skills", "workflows-plan", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".gemini", "settings.json"))).toBe(true)
    expect(await exists(path.join(tempHome, ".gemini", "commands", "workflows", "plan.toml"))).toBe(true)
    expect(await exists(path.join(tempHome, ".openclaw", "skills", "skill-one"))).toBe(true)
  })
})
