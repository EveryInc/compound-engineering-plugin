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

  test("install rejects native marketplace-only plugin targets", async () => {
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
    const repoRoot = path.join(import.meta.dir, "..")

    for (const target of ["copilot", "droid", "qwen"]) {
      const proc = Bun.spawn([
        "bun",
        "run",
        path.join(repoRoot, "src", "index.ts"),
        "install",
        fixtureRoot,
        "--to",
        target,
      ], {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      })

      const exitCode = await proc.exited
      const stderr = await new Response(proc.stderr).text()

      expect(exitCode).not.toBe(0)
      expect(stderr).toContain(`Unknown target: ${target}`)
    }
  })

  test("cleanup backs up legacy Codex artifacts on demand", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-codex-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const agentsRoot = path.join(tempRoot, ".agents")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(codexRoot, "skills", "ce:plan"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "ce:plan", "SKILL.md"), "legacy raw colon skill")
    await fs.mkdir(path.join(codexRoot, "skills", "ce:review-beta"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "ce:review-beta", "SKILL.md"), "legacy raw colon beta skill")
    await fs.mkdir(path.join(codexRoot, "skills", "ce-update"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "ce-update", "SKILL.md"), "legacy claude-only skill")
    // A user-authored skill at a flat path whose name happens to collide with
    // a current CE skill name (ce-debug is a current CE skill that has never
    // been on the historical flat-path allow-list). The cleanup MUST NOT move
    // it -- otherwise we silently destroy unrelated user content. This guards
    // against the regression flagged in PR #609.
    const userOwnedSkillDir = path.join(codexRoot, "skills", "ce-debug")
    await fs.mkdir(userOwnedSkillDir, { recursive: true })
    const userOwnedSkillContent = "# user-authored skill, not from CE"
    await fs.writeFile(path.join(userOwnedSkillDir, "SKILL.md"), userOwnedSkillContent)
    await fs.mkdir(path.join(codexRoot, "prompts"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "prompts", "report-bug.md"), "legacy prompt")
    await fs.mkdir(path.join(agentsRoot, "skills", "ce-plan"), { recursive: true })
    await fs.writeFile(path.join(agentsRoot, "skills", "ce-plan", "SKILL.md"), "legacy shared skill")
    await fs.mkdir(path.join(codexRoot, "skills", "compound-engineering", "repo-research-analyst"), { recursive: true })
    await fs.writeFile(
      path.join(codexRoot, "skills", "compound-engineering", "repo-research-analyst", "SKILL.md"),
      "legacy namespaced generated agent skill",
    )
    await fs.mkdir(path.join(codexRoot, "skills", "compound-engineering", "ce-plan"), { recursive: true })
    await fs.writeFile(
      path.join(codexRoot, "skills", "compound-engineering", "ce-plan", "SKILL.md"),
      "current namespaced skill",
    )

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "codex",
      "--codex-home",
      codexRoot,
      "--agents-home",
      agentsRoot,
    ], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Cleaned codex")
    // 6 historical artifacts get backed up: ce:plan, ce:review-beta, ce-update,
    // report-bug.md, the .agents/skills/ce-plan symlink-equivalent, and the
    // namespaced compound-engineering/repo-research-analyst directory.
    // The user-authored ce-debug skill is preserved.
    expect(stdout).toContain("backed up 6 artifact")
    expect(await exists(path.join(codexRoot, "skills", "ce:plan"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "ce:review-beta"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "ce-update"))).toBe(false)
    expect(await exists(path.join(codexRoot, "prompts", "report-bug.md"))).toBe(false)
    expect(await exists(path.join(agentsRoot, "skills", "ce-plan"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "compound-engineering", "repo-research-analyst"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "compound-engineering", "ce-plan"))).toBe(true)
    expect(await exists(path.join(codexRoot, "compound-engineering", "legacy-backup"))).toBe(true)
    expect(await exists(path.join(agentsRoot, "compound-engineering", "legacy-backup"))).toBe(true)

    // The user's flat-path skill survives with its original content.
    expect(await exists(path.join(userOwnedSkillDir, "SKILL.md"))).toBe(true)
    expect(await fs.readFile(path.join(userOwnedSkillDir, "SKILL.md"), "utf8")).toBe(userOwnedSkillContent)
  })

  test("cleanup backs up legacy OpenCode artifacts on demand", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-opencode-"))
    const opencodeRoot = path.join(tempRoot, ".opencode")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(opencodeRoot, "skills", "creating-agent-skills"), { recursive: true })
    await fs.writeFile(path.join(opencodeRoot, "skills", "creating-agent-skills", "SKILL.md"), "legacy deleted skill")
    await fs.mkdir(path.join(opencodeRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(opencodeRoot, "agents", "bug-reproduction-validator.md"), "legacy deleted agent")
    await fs.mkdir(path.join(opencodeRoot, "commands", "compound"), { recursive: true })
    await fs.writeFile(path.join(opencodeRoot, "commands", "compound", "plan.md"), "legacy command")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "opencode",
      "--opencode-home",
      opencodeRoot,
    ], {
      cwd: repoRoot,
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

    expect(stdout).toContain("Cleaned opencode")
    expect(await exists(path.join(opencodeRoot, "skills", "creating-agent-skills"))).toBe(false)
    expect(await exists(path.join(opencodeRoot, "agents", "bug-reproduction-validator.md"))).toBe(false)
    expect(await exists(path.join(opencodeRoot, "commands", "compound", "plan.md"))).toBe(false)
    expect(await exists(path.join(opencodeRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup backs up legacy Pi artifacts on demand", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-pi-"))
    const piRoot = path.join(tempRoot, ".pi", "agent")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(piRoot, "skills", "creating-agent-skills"), { recursive: true })
    await fs.writeFile(path.join(piRoot, "skills", "creating-agent-skills", "SKILL.md"), "legacy deleted skill")
    await fs.mkdir(path.join(piRoot, "prompts"), { recursive: true })
    await fs.writeFile(path.join(piRoot, "prompts", "compound-plan.md"), "legacy command prompt")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "pi",
      "--pi-home",
      piRoot,
    ], {
      cwd: repoRoot,
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

    expect(stdout).toContain("Cleaned pi")
    expect(await exists(path.join(piRoot, "skills", "creating-agent-skills"))).toBe(false)
    expect(await exists(path.join(piRoot, "prompts", "compound-plan.md"))).toBe(false)
    expect(await exists(path.join(piRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup backs up legacy Gemini artifacts on demand", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-gemini-"))
    const geminiRoot = path.join(tempRoot, ".gemini")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(geminiRoot, "skills", "creating-agent-skills"), { recursive: true })
    await fs.writeFile(path.join(geminiRoot, "skills", "creating-agent-skills", "SKILL.md"), "legacy deleted skill")
    await fs.mkdir(path.join(geminiRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(geminiRoot, "agents", "bug-reproduction-validator.md"), "legacy deleted agent")
    await fs.mkdir(path.join(geminiRoot, "commands", "compound"), { recursive: true })
    await fs.writeFile(path.join(geminiRoot, "commands", "compound", "plan.toml"), "legacy command")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "gemini",
      "--gemini-home",
      geminiRoot,
    ], {
      cwd: repoRoot,
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

    expect(stdout).toContain("Cleaned gemini")
    expect(await exists(path.join(geminiRoot, "skills", "creating-agent-skills"))).toBe(false)
    expect(await exists(path.join(geminiRoot, "agents", "bug-reproduction-validator.md"))).toBe(false)
    expect(await exists(path.join(geminiRoot, "commands", "compound", "plan.toml"))).toBe(false)
    expect(await exists(path.join(geminiRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup backs up legacy Copilot workspace artifacts for native migration", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-copilot-"))
    const repoRoot = path.join(import.meta.dir, "..")
    const githubRoot = path.join(tempRoot, ".github")

    await fs.mkdir(path.join(githubRoot, "skills", "git-commit-push-pr"), { recursive: true })
    await fs.writeFile(path.join(githubRoot, "skills", "git-commit-push-pr", "SKILL.md"), "legacy skill")
    await fs.mkdir(path.join(githubRoot, "skills", "ce-plan"), { recursive: true })
    await fs.writeFile(path.join(githubRoot, "skills", "ce-plan", "SKILL.md"), "current CE skill from old manual install")
    await fs.mkdir(path.join(githubRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(githubRoot, "agents", "repo-research-analyst.agent.md"), "legacy agent")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "copilot",
      "--output",
      tempRoot,
    ], {
      cwd: repoRoot,
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

    expect(stdout).toContain("Cleaned copilot")
    expect(await exists(path.join(githubRoot, "skills", "git-commit-push-pr"))).toBe(false)
    expect(await exists(path.join(githubRoot, "skills", "ce-plan"))).toBe(false)
    expect(await exists(path.join(githubRoot, "agents", "repo-research-analyst.agent.md"))).toBe(false)
    expect(await exists(path.join(githubRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup backs up legacy Droid artifacts for native migration", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-droid-"))
    const droidRoot = path.join(tempRoot, ".factory")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(droidRoot, "skills", "creating-agent-skills"), { recursive: true })
    await fs.writeFile(path.join(droidRoot, "skills", "creating-agent-skills", "SKILL.md"), "legacy deleted skill")
    await fs.mkdir(path.join(droidRoot, "droids"), { recursive: true })
    await fs.writeFile(path.join(droidRoot, "droids", "bug-reproduction-validator.md"), "legacy deleted droid")
    await fs.mkdir(path.join(droidRoot, "commands"), { recursive: true })
    await fs.writeFile(path.join(droidRoot, "commands", "plan.md"), "legacy flattened command")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "droid",
      "--droid-home",
      droidRoot,
    ], {
      cwd: repoRoot,
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

    expect(stdout).toContain("Cleaned droid")
    expect(await exists(path.join(droidRoot, "skills", "creating-agent-skills"))).toBe(false)
    expect(await exists(path.join(droidRoot, "droids", "bug-reproduction-validator.md"))).toBe(false)
    expect(await exists(path.join(droidRoot, "commands", "plan.md"))).toBe(false)
    expect(await exists(path.join(droidRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup backs up deprecated Windsurf artifacts", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-windsurf-"))
    const windsurfRoot = path.join(tempRoot, ".codeium", "windsurf")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(windsurfRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(windsurfRoot, "skills", "reproduce-bug", "SKILL.md"), "legacy skill")
    await fs.mkdir(path.join(windsurfRoot, "skills", "repo-research-analyst"), { recursive: true })
    await fs.writeFile(path.join(windsurfRoot, "skills", "repo-research-analyst", "SKILL.md"), "legacy agent skill")
    await fs.mkdir(path.join(windsurfRoot, "global_workflows"), { recursive: true })
    await fs.writeFile(path.join(windsurfRoot, "global_workflows", "workflows-plan.md"), "legacy workflow")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "windsurf",
      "--windsurf-home",
      windsurfRoot,
    ], {
      cwd: repoRoot,
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

    expect(stdout).toContain("Cleaned windsurf")
    expect(await exists(path.join(windsurfRoot, "skills", "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(windsurfRoot, "skills", "repo-research-analyst"))).toBe(false)
    expect(await exists(path.join(windsurfRoot, "global_workflows", "workflows-plan.md"))).toBe(false)
    expect(await exists(path.join(windsurfRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup backs up legacy Qwen Bun artifacts for native migration", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-qwen-"))
    const qwenRoot = path.join(tempRoot, ".qwen")
    const extensionRoot = path.join(qwenRoot, "extensions", "compound-engineering")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(extensionRoot, { recursive: true })
    await fs.writeFile(
      path.join(extensionRoot, "qwen-extension.json"),
      JSON.stringify({
        name: "compound-engineering",
        _compound_managed_mcp: [],
        _compound_managed_keys: ["name", "skills", "agents"],
      }),
    )
    await fs.mkdir(path.join(qwenRoot, "skills", "ce-plan"), { recursive: true })
    await fs.writeFile(path.join(qwenRoot, "skills", "ce-plan", "SKILL.md"), "legacy skill")
    await fs.mkdir(path.join(qwenRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(qwenRoot, "agents", "repo-research-analyst.yaml"), "legacy agent")
    await fs.mkdir(path.join(qwenRoot, "commands"), { recursive: true })
    await fs.writeFile(path.join(qwenRoot, "commands", "compound-plan.md"), "legacy command")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "qwen",
      "--qwen-home",
      qwenRoot,
    ], {
      cwd: repoRoot,
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

    expect(stdout).toContain("Cleaned qwen")
    expect(await exists(extensionRoot)).toBe(false)
    expect(await exists(path.join(qwenRoot, "skills", "ce-plan"))).toBe(false)
    expect(await exists(path.join(qwenRoot, "agents", "repo-research-analyst.yaml"))).toBe(false)
    expect(await exists(path.join(qwenRoot, "commands", "compound-plan.md"))).toBe(false)
    expect(await exists(path.join(qwenRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup backs up Kiro artifacts on demand", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-kiro-"))
    const kiroRoot = path.join(tempRoot, ".kiro")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(kiroRoot, "skills", "ce-plan"), { recursive: true })
    await fs.writeFile(path.join(kiroRoot, "skills", "ce-plan", "SKILL.md"), "legacy skill")
    await fs.mkdir(path.join(kiroRoot, "skills", "compound-plan"), { recursive: true })
    await fs.writeFile(path.join(kiroRoot, "skills", "compound-plan", "SKILL.md"), "legacy generated command skill")
    await fs.mkdir(path.join(kiroRoot, "agents", "prompts"), { recursive: true })
    await fs.writeFile(path.join(kiroRoot, "agents", "ce-repo-research-analyst.json"), "{}")
    await fs.writeFile(path.join(kiroRoot, "agents", "prompts", "ce-repo-research-analyst.md"), "legacy agent prompt")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "kiro",
      "--kiro-home",
      kiroRoot,
    ], {
      cwd: repoRoot,
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

    expect(stdout).toContain("Cleaned kiro")
    expect(await exists(path.join(kiroRoot, "skills", "ce-plan"))).toBe(false)
    expect(await exists(path.join(kiroRoot, "skills", "compound-plan"))).toBe(false)
    expect(await exists(path.join(kiroRoot, "agents", "ce-repo-research-analyst.json"))).toBe(false)
    expect(await exists(path.join(kiroRoot, "agents", "prompts", "ce-repo-research-analyst.md"))).toBe(false)
    expect(await exists(path.join(kiroRoot, "compound-engineering", "legacy-backup"))).toBe(true)
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
    expect(await exists(path.join(tempRoot, ".config", "opencode", "agents", "ce-repo-research-analyst.md"))).toBe(true)
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
    expect(await exists(path.join(codexRoot, "skills", "compound-engineering", "ce-plan", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".agents", "skills", "ce-plan"))).toBe(false)
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

  test("install --branch clones a specific branch for non-Claude targets", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-branch-install-"))
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-branch-repo-"))
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

    await runGit(["init", "-b", "main"], repoRoot, gitEnv)
    await runGit(["add", "."], repoRoot, gitEnv)
    await runGit(["commit", "-m", "initial"], repoRoot, gitEnv)
    await runGit(["checkout", "-b", "feat/test-branch"], repoRoot, gitEnv)
    await fs.writeFile(path.join(pluginRoot, "BRANCH_MARKER.txt"), "from-branch")
    await runGit(["add", "."], repoRoot, gitEnv)
    await runGit(["commit", "-m", "branch commit"], repoRoot, gitEnv)
    await runGit(["checkout", "main"], repoRoot, gitEnv)

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
      "--branch",
      "feat/test-branch",
    ], {
      cwd: tempRoot,
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
    expect(await exists(path.join(codexRoot, "skills", "compound-engineering", "workflows-review", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".agents", "skills", "workflows-review"))).toBe(false)
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
    expect(await exists(path.join(codexRoot, "skills", "compound-engineering", "workflows-review", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "skills", "compound-engineering", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".agents", "skills", "workflows-review"))).toBe(false)
    expect(await exists(path.join(tempRoot, ".agents", "skills", "skill-one"))).toBe(false)
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

  test("install --to all detects custom-install targets and ignores stale cursor directories", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "cli-install-all-home-"))
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "cli-install-all-cwd-"))
    const repoRoot = path.join(import.meta.dir, "..")
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")

    await fs.mkdir(path.join(tempHome, ".config", "opencode"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".codex"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".pi"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".factory"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".copilot"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".gemini"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".kiro"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".qwen"), { recursive: true })
    await fs.mkdir(path.join(tempCwd, ".cursor"), { recursive: true })

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "install",
      fixtureRoot,
      "--to",
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

    expect(stdout).toContain("Installed compound-engineering to codex")
    expect(stdout).toContain("Installed compound-engineering to opencode")
    expect(stdout).toContain("Installed compound-engineering to pi")
    expect(stdout).toContain("Installed compound-engineering to kiro")
    expect(stdout).toContain("Installed compound-engineering to gemini")
    expect(stdout).toContain("droid — native plugin install; skipped")
    expect(stdout).toContain("copilot — native plugin install; skipped")
    expect(stdout).toContain("qwen — native plugin install; skipped")
    expect(stdout).not.toContain("cursor")

    expect(await exists(path.join(tempHome, ".config", "opencode", "opencode.json"))).toBe(true)
    expect(await exists(path.join(tempHome, ".codex", "skills", "compound-engineering", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".pi", "agent", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempCwd, ".gemini", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempCwd, ".kiro", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".qwen", "extensions", "compound-engineering", "qwen-extension.json"))).toBe(false)
  })
})
