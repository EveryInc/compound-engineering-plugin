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
    await fs.writeFile(path.join(codexRoot, "skills", "ce-update", "SKILL.md"), "legacy pre-namespaced flat skill")
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
    // CE emits entries under `.agents/skills/` as symlinks into its own
    // managed Codex install root. Simulate that exact shape so cleanup sees
    // an ownership-valid symlink and backs it up. A plain directory here
    // would be user-owned (see the new regression coverage below) and must
    // not be touched -- this shape mirrors the install writer.
    const sharedAgentSymlinkTarget = path.join(
      codexRoot,
      "skills",
      "compound-engineering",
      "ce-plan",
    )
    await fs.mkdir(sharedAgentSymlinkTarget, { recursive: true })
    await fs.writeFile(path.join(sharedAgentSymlinkTarget, "SKILL.md"), "legacy shared skill")
    await fs.mkdir(path.join(agentsRoot, "skills"), { recursive: true })
    await fs.symlink(sharedAgentSymlinkTarget, path.join(agentsRoot, "skills", "ce-plan"))
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
    // 6 historical artifacts get backed up: ce:plan, ce:review-beta, ce-update
    // (pre-namespaced flat path; ce-update is a current skill but its managed
    // install is at ~/.codex/skills/compound-engineering/ce-update, so the
    // flat path is legacy), report-bug.md, the .agents/skills/ce-plan
    // symlink-equivalent, and the namespaced
    // compound-engineering/repo-research-analyst directory.
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

  test("cleanup only backs up CE-owned symlinks under ~/.agents/skills", async () => {
    // Regression coverage for PR #609 review: `~/.agents/skills/` is a shared
    // cross-plugin store, so a name collision alone is NOT sufficient signal
    // that CE installed an entry. CE only ever emits symlinks into this tree
    // pointing at skill directories inside its own Codex install root. This
    // test seeds three colliding entries at names that ARE in the legacy
    // allow-list and verifies cleanup:
    //   1. Moves a symlink pointing into a CE-managed Codex root.
    //   2. Leaves a symlink pointing elsewhere (user-created) alone.
    //   3. Leaves a plain directory (user-created) alone.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-codex-shared-ownership-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const agentsRoot = path.join(tempRoot, ".agents")
    const repoRoot = path.join(import.meta.dir, "..")

    // (1) CE-owned symlink: points inside `<codex>/skills/<plugin>/ce-plan`.
    const ceOwnedTarget = path.join(codexRoot, "skills", "compound-engineering", "ce-plan")
    await fs.mkdir(ceOwnedTarget, { recursive: true })
    await fs.writeFile(path.join(ceOwnedTarget, "SKILL.md"), "ce-owned skill")
    await fs.mkdir(path.join(agentsRoot, "skills"), { recursive: true })
    await fs.symlink(ceOwnedTarget, path.join(agentsRoot, "skills", "ce-plan"))

    // (2) User-authored symlink at a colliding legacy name -- points to a
    // directory the user controls, outside CE's managed roots.
    const userOwnedTarget = path.join(tempRoot, "user-skills", "ce-update")
    await fs.mkdir(userOwnedTarget, { recursive: true })
    const userSymlinkContent = "# user-authored skill reachable via symlink"
    await fs.writeFile(path.join(userOwnedTarget, "SKILL.md"), userSymlinkContent)
    await fs.symlink(userOwnedTarget, path.join(agentsRoot, "skills", "ce-update"))

    // (3) User-authored plain directory at a colliding legacy name. CE only
    // ever emitted symlinks into `~/.agents/skills/`, so a real directory
    // here is user-owned by definition and must not be touched.
    const userPlainDir = path.join(agentsRoot, "skills", "ce-debug")
    await fs.mkdir(userPlainDir, { recursive: true })
    const userPlainContent = "# user-authored skill, plain directory"
    await fs.writeFile(path.join(userPlainDir, "SKILL.md"), userPlainContent)

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

    // (1) CE-owned symlink was moved out of `.agents/skills/`.
    expect(await exists(path.join(agentsRoot, "skills", "ce-plan"))).toBe(false)
    // Its target directory is preserved (cleanupCodex leaves current
    // namespaced skills alone; the shared symlink cleanup only touches the
    // link, not its target).
    expect(await exists(ceOwnedTarget)).toBe(true)

    // (2) User-authored symlink and its target both survive intact.
    expect(await exists(path.join(agentsRoot, "skills", "ce-update"))).toBe(true)
    expect(await exists(path.join(userOwnedTarget, "SKILL.md"))).toBe(true)
    expect(await fs.readFile(path.join(userOwnedTarget, "SKILL.md"), "utf8")).toBe(userSymlinkContent)

    // (3) User-authored plain directory survives with its original content.
    expect(await exists(userPlainDir)).toBe(true)
    expect(await fs.readFile(path.join(userPlainDir, "SKILL.md"), "utf8")).toBe(userPlainContent)
  })

  test("cleanup migrates manifest-listed Codex artifacts that moved between CE versions", async () => {
    // Scenario: a prior CE install emitted agents as generated skills under
    // `skills/<plugin>/<agent-name>/` and wrote an install manifest listing
    // those agent-skills plus a stale prompt. The current CE emits agents as
    // TOML custom agents instead, so those manifest-listed skills and the
    // stale prompt are no longer in the current bundle. Cleanup alone (no
    // subsequent install) must migrate them to legacy-backup, otherwise they
    // shadow the current install.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-codex-manifest-"))
    const codexRoot = path.join(tempRoot, ".codex")
    const agentsRoot = path.join(tempRoot, ".agents")
    const repoRoot = path.join(import.meta.dir, "..")

    // Namespaced managed skills dir with stale agent-as-skill entries and one
    // current-named skill that must survive.
    const staleAgentSkills = [
      "ce-correctness-reviewer",  // current agent name, old generated-skill emission
      "ce-feasibility-reviewer",  // same
      "ce-adversarial-reviewer",  // same
    ]
    for (const skillName of staleAgentSkills) {
      const dir = path.join(codexRoot, "skills", "compound-engineering", skillName)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, "SKILL.md"), `stale agent-as-skill ${skillName}`)
    }
    // A current-named skill the prior install also tracked.
    await fs.mkdir(path.join(codexRoot, "skills", "compound-engineering", "ce-plan"), { recursive: true })
    await fs.writeFile(
      path.join(codexRoot, "skills", "compound-engineering", "ce-plan", "SKILL.md"),
      "current namespaced skill",
    )
    // Stale prompt from the prior install.
    await fs.mkdir(path.join(codexRoot, "prompts"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "prompts", "ce-plan.md"), "stale prompt from prior CE version")

    // Install manifest listing all the prior-install artifacts.
    const managedDir = path.join(codexRoot, "compound-engineering")
    await fs.mkdir(managedDir, { recursive: true })
    await fs.writeFile(
      path.join(managedDir, "install-manifest.json"),
      JSON.stringify(
        {
          version: 1,
          pluginName: "compound-engineering",
          skills: [...staleAgentSkills, "ce-plan"],
          prompts: ["ce-plan.md"],
          agents: [],
        },
        null,
        2,
      ),
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

    // Stale agent-skills migrated to legacy-backup.
    for (const skillName of staleAgentSkills) {
      expect(await exists(path.join(codexRoot, "skills", "compound-engineering", skillName))).toBe(false)
    }
    // Current-named namespaced skill survives (it's in the current bundle).
    expect(await exists(path.join(codexRoot, "skills", "compound-engineering", "ce-plan"))).toBe(true)
    // Stale prompt migrated (ce-plan is a skill now, not a command/prompt in current CE).
    expect(await exists(path.join(codexRoot, "prompts", "ce-plan.md"))).toBe(false)
    // Backup tree created.
    expect(await exists(path.join(codexRoot, "compound-engineering", "legacy-backup"))).toBe(true)
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

  test("cleanup defaults Gemini root to workspace ./.gemini when --gemini-home is not set", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-gemini-default-"))
    const workspaceRoot = path.join(tempRoot, "workspace")
    const workspaceGemini = path.join(workspaceRoot, ".gemini")
    const repoRoot = path.join(import.meta.dir, "..")

    // Seed a legacy artifact in the WORKSPACE-scoped Gemini root (`<cwd>/.gemini`),
    // which is where `install`/`convert` writes Gemini output by default.
    // Cleanup must find this without `--gemini-home`, mirroring the install
    // default.
    await fs.mkdir(path.join(workspaceGemini, "skills", "creating-agent-skills"), { recursive: true })
    await fs.writeFile(
      path.join(workspaceGemini, "skills", "creating-agent-skills", "SKILL.md"),
      "legacy deleted skill",
    )

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "gemini",
      "--output",
      workspaceRoot,
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
    expect(await exists(path.join(workspaceGemini, "skills", "creating-agent-skills"))).toBe(false)
    expect(await exists(path.join(workspaceGemini, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup backs up legacy Copilot workspace artifacts for native migration", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-copilot-"))
    const repoRoot = path.join(import.meta.dir, "..")
    const githubRoot = path.join(tempRoot, ".github")

    await fs.mkdir(path.join(githubRoot, "skills", "git-commit-push-pr"), { recursive: true })
    await fs.writeFile(path.join(githubRoot, "skills", "git-commit-push-pr", "SKILL.md"), "legacy skill")
    await fs.mkdir(path.join(githubRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(githubRoot, "agents", "repo-research-analyst.agent.md"), "legacy agent")

    // User-authored artifacts whose names match current CE bundle output but
    // are NOT on the historical allow-list. The Copilot writer has been
    // removed (users now install via `copilot plugin install`), so these
    // were never installed by CE — cleanup must leave them alone.
    await fs.mkdir(path.join(githubRoot, "skills", "ce-debug"), { recursive: true })
    await fs.writeFile(path.join(githubRoot, "skills", "ce-debug", "SKILL.md"), "user-authored skill")
    await fs.mkdir(path.join(githubRoot, "skills", "my-user-skill"), { recursive: true })
    await fs.writeFile(path.join(githubRoot, "skills", "my-user-skill", "SKILL.md"), "user-authored skill")
    await fs.writeFile(path.join(githubRoot, "agents", "ce-adversarial-reviewer.agent.md"), "user-authored agent")

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
    expect(await exists(path.join(githubRoot, "agents", "repo-research-analyst.agent.md"))).toBe(false)
    expect(await exists(path.join(githubRoot, "compound-engineering", "legacy-backup"))).toBe(true)

    // User-authored files that only match current CE bundle names (not on
    // the historical allow-list) must be left untouched.
    expect(await exists(path.join(githubRoot, "skills", "ce-debug"))).toBe(true)
    expect(await exists(path.join(githubRoot, "skills", "my-user-skill"))).toBe(true)
    expect(await exists(path.join(githubRoot, "agents", "ce-adversarial-reviewer.agent.md"))).toBe(true)
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

    // User-authored artifacts whose names match current CE bundle output (via
    // the Droid converter) but are NOT on the historical allow-list. These
    // must survive cleanup — the Droid writer was never wired up to install
    // these, so sweeping them would be destructive.
    await fs.writeFile(path.join(droidRoot, "droids", "ce-adversarial-reviewer.md"), "user-authored droid")
    await fs.writeFile(path.join(droidRoot, "commands", "my-user-command.md"), "user-authored command")
    await fs.mkdir(path.join(droidRoot, "skills", "my-user-skill"), { recursive: true })
    await fs.writeFile(path.join(droidRoot, "skills", "my-user-skill", "SKILL.md"), "user-authored skill")

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

    // User-authored files that only match current CE bundle names (not on the
    // historical allow-list) must be left untouched.
    expect(await exists(path.join(droidRoot, "droids", "ce-adversarial-reviewer.md"))).toBe(true)
    expect(await exists(path.join(droidRoot, "commands", "my-user-command.md"))).toBe(true)
    expect(await exists(path.join(droidRoot, "skills", "my-user-skill"))).toBe(true)
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

    // User-authored artifacts whose names match current CE bundle output but
    // are NOT on the historical allow-list. Windsurf's writer has been
    // removed, so these were never installed by CE — cleanup must leave them
    // alone.
    await fs.mkdir(path.join(windsurfRoot, "skills", "ce-debug"), { recursive: true })
    await fs.writeFile(path.join(windsurfRoot, "skills", "ce-debug", "SKILL.md"), "user-authored skill")
    await fs.mkdir(path.join(windsurfRoot, "skills", "my-user-skill"), { recursive: true })
    await fs.writeFile(path.join(windsurfRoot, "skills", "my-user-skill", "SKILL.md"), "user-authored skill")
    await fs.writeFile(path.join(windsurfRoot, "global_workflows", "my-user-workflow.md"), "user-authored workflow")

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

    // User-authored files that only match current CE bundle names (not on
    // the historical allow-list) must be left untouched.
    expect(await exists(path.join(windsurfRoot, "skills", "ce-debug"))).toBe(true)
    expect(await exists(path.join(windsurfRoot, "skills", "my-user-skill"))).toBe(true)
    expect(await exists(path.join(windsurfRoot, "global_workflows", "my-user-workflow.md"))).toBe(true)
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
    // Legacy Bun-install commands for colon-namespaced names (e.g. `compound:plan`)
    // landed at nested paths via resolveCommandPath; cleanup must back those up
    // too so they don't shadow native plugin commands after migration.
    await fs.mkdir(path.join(qwenRoot, "commands", "compound"), { recursive: true })
    await fs.writeFile(path.join(qwenRoot, "commands", "compound", "plan.md"), "legacy nested command")

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
    expect(await exists(path.join(qwenRoot, "commands", "compound", "plan.md"))).toBe(false)
    expect(await exists(path.join(qwenRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup preserves user-authored Qwen files at current-bundle names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-qwen-preserve-"))
    const qwenRoot = path.join(tempRoot, ".qwen")
    const repoRoot = path.join(import.meta.dir, "..")

    // Legacy artifacts from the historical allow-list (e.g. `ce:plan` sanitizes
    // to `ce-plan`, `compound:plan` flattens to `compound-plan.md` and nests to
    // `compound/plan.md`). These MUST be backed up.
    await fs.mkdir(path.join(qwenRoot, "skills", "ce-plan"), { recursive: true })
    await fs.writeFile(path.join(qwenRoot, "skills", "ce-plan", "SKILL.md"), "legacy skill")
    await fs.mkdir(path.join(qwenRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(qwenRoot, "agents", "repo-research-analyst.md"), "legacy agent")
    await fs.mkdir(path.join(qwenRoot, "commands", "compound"), { recursive: true })
    await fs.writeFile(path.join(qwenRoot, "commands", "compound-plan.md"), "legacy flat command")
    await fs.writeFile(path.join(qwenRoot, "commands", "compound", "plan.md"), "legacy nested command")

    // User-authored artifacts at names that match the CURRENT CE bundle but
    // are NOT on the historical allow-list. The Qwen writer is native
    // (`qwen extensions install`), so these were never installed by this
    // plugin — cleanup must leave them alone.
    await fs.mkdir(path.join(qwenRoot, "skills", "ce-debug"), { recursive: true })
    await fs.writeFile(path.join(qwenRoot, "skills", "ce-debug", "SKILL.md"), "user-authored skill")
    await fs.mkdir(path.join(qwenRoot, "skills", "my-user-skill"), { recursive: true })
    await fs.writeFile(path.join(qwenRoot, "skills", "my-user-skill", "SKILL.md"), "user-authored skill")
    await fs.writeFile(path.join(qwenRoot, "agents", "ce-correctness-reviewer.md"), "user-authored agent")
    await fs.writeFile(path.join(qwenRoot, "commands", "my-user-command.md"), "user-authored command")

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

    // Historical allow-list entries (including the nested colon-command form
    // preserved by the PRRT_kwDOP_gZVc58GrCI fix) are backed up.
    expect(await exists(path.join(qwenRoot, "skills", "ce-plan"))).toBe(false)
    expect(await exists(path.join(qwenRoot, "agents", "repo-research-analyst.md"))).toBe(false)
    expect(await exists(path.join(qwenRoot, "commands", "compound-plan.md"))).toBe(false)
    expect(await exists(path.join(qwenRoot, "commands", "compound", "plan.md"))).toBe(false)

    // User-authored files at names matching the current CE bundle survive.
    expect(await exists(path.join(qwenRoot, "skills", "ce-debug"))).toBe(true)
    expect(await exists(path.join(qwenRoot, "skills", "my-user-skill"))).toBe(true)
    expect(await exists(path.join(qwenRoot, "agents", "ce-correctness-reviewer.md"))).toBe(true)
    expect(await exists(path.join(qwenRoot, "commands", "my-user-command.md"))).toBe(true)
  })

  test("cleanup deduplicates Gemini roots when cwd === $HOME to avoid rename races", async () => {
    // Reproduces the concurrent-rename race: when `cwd` equals `$HOME` (or any
    // path whose `.gemini` child collides with `--gemini-home`), the two
    // default cleanup roots resolve to the same directory. Before the dedup
    // fix, `Promise.all` launched two cleanups against the same directory and
    // the loser of the rename race raised ENOENT, aborting cleanup
    // intermittently. The fix deduplicates on absolute path before fanning
    // out, so a single pass runs and the artifact is moved exactly once.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-gemini-dedup-"))
    const repoRoot = path.join(import.meta.dir, "..")
    // Make `cwd` and `$HOME` the same directory so `<cwd>/.gemini` ==
    // `$HOME/.gemini`, which is the collision the reviewer flagged.
    const sharedRoot = tempRoot
    const sharedGemini = path.join(sharedRoot, ".gemini")

    await fs.mkdir(path.join(sharedGemini, "skills", "creating-agent-skills"), { recursive: true })
    await fs.writeFile(
      path.join(sharedGemini, "skills", "creating-agent-skills", "SKILL.md"),
      "legacy deleted skill",
    )

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "gemini",
    ], {
      // cwd === HOME triggers the workspaceGemini === roots.geminiHome case.
      cwd: sharedRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: sharedRoot,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    // Cleanup runs exactly once (only one "Cleaned gemini" line) and the
    // legacy artifact is moved without an ENOENT race.
    const geminiLines = stdout.split("\n").filter((line) => line.startsWith("Cleaned gemini"))
    expect(geminiLines.length).toBe(1)
    expect(geminiLines[0]).toContain("backed up 1 artifact")
    expect(await exists(path.join(sharedGemini, "skills", "creating-agent-skills"))).toBe(false)
    expect(await exists(path.join(sharedGemini, "compound-engineering", "legacy-backup"))).toBe(true)
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
      "--include-skills",
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

  test("install --to codex default is agents-only (skills handled by native plugin install)", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-codex-agents-only-"))
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-codex-agents-only-ws-"))
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
    // Default omits skills; they're expected from `codex plugin install`.
    expect(await exists(path.join(codexRoot, "skills", "ce-plan", "SKILL.md"))).toBe(false)
    // Agents still land (as generated skills for now — Codex's native plugin
    // spec does not register custom agents, so the Bun converter fills the gap).
    expect(await exists(path.join(codexRoot, "skills"))).toBe(true)
    // AGENTS.md is emitted because --to codex always ensures a root AGENTS.md
    // exists for Codex's discovery chain.
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
      "--include-skills",
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
      "--include-skills",
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

  test("install --to codex --also opencode without --output writes opencode to global root, not nested", async () => {
    // Regression for the cluster bug: when --output was unset and --to was a
    // non-opencode primary, the --also flow joined `<opencode-global>/opencode`
    // because the install-side default root was hardcoded to the OpenCode
    // global config. The OpenCode default is now applied per-target inside
    // resolveTargetOutputRoot, so --also opencode lands at the global config
    // root regardless of the primary target.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-also-opencode-from-codex-"))
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
    const codexRoot = path.join(tempRoot, ".codex")
    const repoRoot = path.join(import.meta.dir, "..")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "install",
      fixtureRoot,
      "--to",
      "codex",
      "--also",
      "opencode",
      "--codex-home",
      codexRoot,
    ], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
        // Strip any inherited OPENCODE_CONFIG_DIR so we exercise the XDG
        // fallback path deterministically.
        OPENCODE_CONFIG_DIR: "",
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    const opencodeGlobalRoot = path.join(tempRoot, ".config", "opencode")
    // Flat global layout, not nested under .opencode/. The bug previously
    // wrote to `<global>/opencode/...` which is invisible to OpenCode.
    expect(await exists(path.join(opencodeGlobalRoot, "opencode.json"))).toBe(true)
    expect(await exists(path.join(opencodeGlobalRoot, "agents", "repo-research-analyst.md"))).toBe(true)
    expect(await exists(path.join(opencodeGlobalRoot, "opencode", "opencode.json"))).toBe(false)
    // Codex still landed at the explicit --codex-home.
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(true)
  })

  test("install --to opencode --also codex without --output keeps opencode at global root", async () => {
    // Symmetry check for the cluster bug: confirm the --also extras loop does
    // not push the primary OpenCode target through path.join(outputRoot, ...)
    // either. Without --output, opencode should still resolve to the global
    // config root.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-also-codex-from-opencode-"))
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
    const codexRoot = path.join(tempRoot, ".codex")
    const repoRoot = path.join(import.meta.dir, "..")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "install",
      fixtureRoot,
      "--to",
      "opencode",
      "--also",
      "codex",
      "--codex-home",
      codexRoot,
    ], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
        OPENCODE_CONFIG_DIR: "",
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    const opencodeGlobalRoot = path.join(tempRoot, ".config", "opencode")
    expect(await exists(path.join(opencodeGlobalRoot, "opencode.json"))).toBe(true)
    expect(await exists(path.join(opencodeGlobalRoot, "agents", "repo-research-analyst.md"))).toBe(true)
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(true)
  })

  test("install --to opencode without --output respects OPENCODE_CONFIG_DIR", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-opencode-env-"))
    const customRoot = path.join(tempRoot, "custom-opencode-config")
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
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
        OPENCODE_CONFIG_DIR: customRoot,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(await exists(path.join(customRoot, "opencode.json"))).toBe(true)
    expect(await exists(path.join(customRoot, "agents", "repo-research-analyst.md"))).toBe(true)
    // Make sure we did NOT also write to the XDG default path.
    expect(await exists(path.join(tempRoot, ".config", "opencode", "opencode.json"))).toBe(false)
  })

  test("cleanup --target opencode without --opencode-home respects OPENCODE_CONFIG_DIR", async () => {
    // Mirrors install: cleanup must scan the same directory install would
    // write to, so a setup that relocates OpenCode config via env (NixOS,
    // Docker, non-default XDG) gets its stale artifacts backed up.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-opencode-env-"))
    const customRoot = path.join(tempRoot, "custom-opencode-config")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(customRoot, "skills", "creating-agent-skills"), { recursive: true })
    await fs.writeFile(path.join(customRoot, "skills", "creating-agent-skills", "SKILL.md"), "legacy deleted skill")
    await fs.mkdir(path.join(customRoot, "agents"), { recursive: true })
    await fs.writeFile(path.join(customRoot, "agents", "bug-reproduction-validator.md"), "legacy deleted agent")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "opencode",
    ], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
        OPENCODE_CONFIG_DIR: customRoot,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Cleaned opencode")
    expect(stdout).toContain(customRoot)
    expect(await exists(path.join(customRoot, "skills", "creating-agent-skills"))).toBe(false)
    expect(await exists(path.join(customRoot, "agents", "bug-reproduction-validator.md"))).toBe(false)
    expect(await exists(path.join(customRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup --target opencode --output <workspace> scans workspace .opencode", async () => {
    // Mirror install: `install --to opencode --output <workspace>` writes
    // managed artifacts under `<workspace>/.opencode`. Cleanup must scan the
    // same workspace directory (and must NOT touch the global root) when
    // `--output` is supplied without an explicit `--opencode-home`.
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-opencode-output-"))
    const workspace = path.join(tempRoot, "workspace")
    const workspaceOpenCode = path.join(workspace, ".opencode")
    const globalRoot = path.join(tempRoot, "global-opencode")
    const repoRoot = path.join(import.meta.dir, "..")

    // Stale artifacts in the workspace install — these must be cleaned up.
    await fs.mkdir(path.join(workspaceOpenCode, "skills", "creating-agent-skills"), { recursive: true })
    await fs.writeFile(path.join(workspaceOpenCode, "skills", "creating-agent-skills", "SKILL.md"), "legacy deleted skill")
    await fs.mkdir(path.join(workspaceOpenCode, "agents"), { recursive: true })
    await fs.writeFile(path.join(workspaceOpenCode, "agents", "bug-reproduction-validator.md"), "legacy deleted agent")

    // A lookalike stale artifact in the global root — this must be UNTOUCHED
    // because the user scoped the cleanup to the workspace via `--output`.
    await fs.mkdir(path.join(globalRoot, "skills", "creating-agent-skills"), { recursive: true })
    await fs.writeFile(path.join(globalRoot, "skills", "creating-agent-skills", "SKILL.md"), "global stale skill")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(repoRoot, "src", "index.ts"),
      "cleanup",
      "--target",
      "opencode",
      "--output",
      workspace,
    ], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
        OPENCODE_CONFIG_DIR: globalRoot,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Cleaned opencode")
    expect(stdout).toContain(workspaceOpenCode)
    // Workspace install stale artifacts cleaned.
    expect(await exists(path.join(workspaceOpenCode, "skills", "creating-agent-skills"))).toBe(false)
    expect(await exists(path.join(workspaceOpenCode, "agents", "bug-reproduction-validator.md"))).toBe(false)
    expect(await exists(path.join(workspaceOpenCode, "compound-engineering", "legacy-backup"))).toBe(true)
    // Global root must NOT be swept — `--output` scoped the cleanup.
    expect(await exists(path.join(globalRoot, "skills", "creating-agent-skills"))).toBe(true)
    expect(stdout).not.toContain(globalRoot)
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
    // Claude agents now install at .pi/agents/<name>.md (Pi agent format) so
    // nicobailon/pi-subagents can resolve them via the `subagent` tool.
    expect(await exists(path.join(piRoot, "agents", "repo-research-analyst.md"))).toBe(true)
    // Pi installs no longer ship a plugin-authored compat extension; users install
    // community pi-subagents + pi-ask-user extensions directly in Pi. MCP servers
    // declared in plugin.json are still translated to mcporter.json so plugins
    // with MCP wiring keep their backends after conversion.
    expect(await exists(path.join(piRoot, "extensions", "compound-engineering-compat.ts"))).toBe(false)
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
    expect(await exists(path.join(piRoot, "extensions", "compound-engineering-compat.ts"))).toBe(false)
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
    // Codex `--to all` install uses the agents-only default — skills come from
    // `codex plugin install`, not the Bun converter. Verify agents landed
    // (the gap the converter fills) rather than skills (which the default suppresses).
    expect(await exists(path.join(tempHome, ".codex", "agents", "compound-engineering", "security-sentinel.toml"))).toBe(true)
    expect(await exists(path.join(tempHome, ".codex", "skills", "compound-engineering", "skill-one", "SKILL.md"))).toBe(false)
    expect(await exists(path.join(tempHome, ".pi", "agent", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempCwd, ".gemini", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempCwd, ".kiro", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempHome, ".qwen", "extensions", "compound-engineering", "qwen-extension.json"))).toBe(false)
  })
})
