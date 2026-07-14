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

const HISTORICAL_AGENT_DESCRIPTIONS: Record<string, string> = {
  "bug-reproduction-validator":
    "Systematically reproduces and validates bug reports to confirm whether reported behavior is an actual bug. Use when you receive a bug report or issue that needs verification.",
  "ce-adversarial-reviewer":
    "Conditional code-review persona, selected when the diff is large (>=50 changed lines) or touches high-risk domains like auth, payments, data mutations, or external APIs. Actively constructs failure scenarios to break the implementation rather than checking against known patterns.",
  "ce-repo-research-analyst":
    "Conducts thorough research on repository structure, documentation, conventions, and implementation patterns. Use when onboarding to a new codebase or understanding project conventions.",
}

const HISTORICAL_SKILL_DESCRIPTIONS: Record<string, string> = {
  "ce-plan":
    "Create structured plans for multi-step tasks -- software features, research workflows, events, study plans, or any goal that benefits from breakdown. Also deepens existing plans with interactive sub-agent review. Use when the user says 'plan this', 'create a plan', 'how should we build', 'break this down', or when a brainstorm doc is ready for planning. Use 'deepen the plan' or 'deepening pass' for the deepening flow. For exploratory requests, prefer ce-brainstorm first.",
  "ce:plan":
    "Create structured plans for multi-step tasks -- software features, research workflows, events, study plans, or any goal that benefits from breakdown. Also deepens existing plans with interactive sub-agent review. Use when the user says 'plan this', 'create a plan', 'how should we build', 'break this down', or when a brainstorm doc is ready for planning. Use 'deepen the plan' or 'deepening pass' for the deepening flow. For exploratory requests, prefer ce-brainstorm first.",
  "ce:review-beta":
    "[BETA] Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
  "ce-update":
    "Check if the compound-engineering plugin is up to date and recommend the\nupdate command if not. Use when the user says \"update compound engineering\",\n\"check compound engineering version\", \"ce update\", \"is compound engineering\nup to date\", \"update ce plugin\", or reports issues that might stem from a\nstale compound-engineering plugin version. This skill only works in Claude\nCode — it relies on the plugin harness cache layout.\n",
  "git-commit-push-pr":
    "Commit, push, and open a PR with an adaptive, value-first description that scales in depth with the change. Use when the user says \"commit and PR\", \"ship this\", \"create a PR\", or \"open a pull request\". Also handles description-only flows (\"write a PR description\", \"rewrite the PR body\", \"describe this PR\") without committing or pushing.",
  "reproduce-bug":
    "Systematically reproduce and investigate a bug from a GitHub issue. Use when the user provides a GitHub issue number or URL for a bug they want reproduced or investigated.",
}

function historicalAgentDescription(name: string): string {
  const description = HISTORICAL_AGENT_DESCRIPTIONS[name]
  if (!description) throw new Error(`Missing historical agent description for ${name}`)
  return description
}

function historicalSkillDescription(name: string): string {
  const description = HISTORICAL_SKILL_DESCRIPTIONS[name]
  if (!description) throw new Error(`Missing historical skill description for ${name}`)
  return description
}

function skillContent(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n`
}

function agentContent(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\nBody\n`
}

function qwenAgentYaml(name: string, description: string): string {
  return `name: ${name}\ndescription: ${JSON.stringify(description)}\ninstructions: Body\n`
}

function kiroAgentConfigContent(name: string, description: string): string {
  return JSON.stringify({
    name,
    description,
    prompt: `file://./prompts/${name}.md`,
    tools: ["*"],
    resources: [
      "file://.kiro/steering/**/*.md",
      "skill://.kiro/skills/**/SKILL.md",
    ],
    includeMcpJson: true,
    welcomeMessage: `Switching to the ${name} agent. ${description}`,
  })
}

function envWithoutOpenCodeConfig(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...overrides }
  delete env.OPENCODE_CONFIG_DIR
  return env
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
      env: envWithoutOpenCodeConfig({ HOME: tempRoot }),
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
    await fs.writeFile(path.join(codexRoot, "skills", "ce:plan", "SKILL.md"), skillContent("ce:plan", historicalSkillDescription("ce:plan")))
    await fs.mkdir(path.join(codexRoot, "skills", "ce:review-beta"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "ce:review-beta", "SKILL.md"), skillContent("ce:review-beta", historicalSkillDescription("ce:review-beta")))
    await fs.mkdir(path.join(codexRoot, "skills", "ce-update"), { recursive: true })
    await fs.writeFile(path.join(codexRoot, "skills", "ce-update", "SKILL.md"), skillContent("ce-update", historicalSkillDescription("ce-update")))
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
      skillContent("repo-research-analyst", historicalAgentDescription("ce-repo-research-analyst")),
    )
    await fs.mkdir(path.join(codexRoot, "skills", "compound-engineering", "ce-plan"), { recursive: true })
    await fs.writeFile(
      path.join(codexRoot, "skills", "compound-engineering", "ce-plan", "SKILL.md"),
      "current namespaced skill",
    )
    await fs.mkdir(path.join(codexRoot, "agents", "compound-engineering"), { recursive: true })
    await fs.writeFile(
      path.join(codexRoot, "agents", "compound-engineering", "ce-learnings-researcher.toml"),
      "legacy namespaced agent toml",
    )
    await fs.writeFile(
      path.join(codexRoot, "agents", "ce-repo-research-analyst.toml"),
      "legacy flat agent toml",
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
    // 7 historical artifacts get backed up: ce:plan, ce:review-beta, ce-update
    // (pre-namespaced flat path; ce-update is a current skill but its managed
    // install is at ~/.codex/skills/compound-engineering/ce-update, so the
    // flat path is legacy), report-bug.md, the .agents/skills/ce-plan
    // symlink-equivalent, and the namespaced
    // compound-engineering/repo-research-analyst directory, plus the old
    // namespaced Codex TOML agent. The unowned flat Codex TOML collision and
    // user-authored ce-debug skill are preserved.
    expect(stdout).toContain("backed up 7 artifact")
    expect(await exists(path.join(codexRoot, "skills", "ce:plan"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "ce:review-beta"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "ce-update"))).toBe(false)
    expect(await exists(path.join(codexRoot, "prompts", "report-bug.md"))).toBe(false)
    expect(await exists(path.join(agentsRoot, "skills", "ce-plan"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "compound-engineering", "repo-research-analyst"))).toBe(false)
    expect(await exists(path.join(codexRoot, "agents", "compound-engineering", "ce-learnings-researcher.toml"))).toBe(false)
    expect(await exists(path.join(codexRoot, "agents", "ce-repo-research-analyst.toml"))).toBe(true)
    expect(await exists(path.join(codexRoot, "skills", "compound-engineering", "ce-plan"))).toBe(true)
    expect(await exists(path.join(codexRoot, "compound-engineering", "legacy-backup"))).toBe(true)
    expect(await exists(path.join(agentsRoot, "compound-engineering", "legacy-backup"))).toBe(true)

    // The user's flat-path skill survives with its original content.
    expect(await exists(path.join(userOwnedSkillDir, "SKILL.md"))).toBe(true)
    expect(await fs.readFile(path.join(userOwnedSkillDir, "SKILL.md"), "utf8")).toBe(userOwnedSkillContent)
  })

  test("cleanup backs up CE-owned legacy Pi agent files on demand", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-pi-agents-"))
    const piRoot = path.join(tempRoot, ".pi")
    const repoRoot = path.join(import.meta.dir, "..")
    const agentsRoot = path.join(piRoot, "agents")
    await fs.mkdir(agentsRoot, { recursive: true })
    await fs.writeFile(
      path.join(agentsRoot, "repo-research-analyst.md"),
      [
        "---",
        "name: repo-research-analyst",
        "description: Conducts thorough research on repository structure, documentation, conventions, and implementation patterns. Use when onboarding to a new codebase or understanding project conventions.",
        "---",
        "",
        "Legacy CE agent body",
        "",
      ].join("\n"),
    )
    const userAgentBody = [
      "---",
      "name: ce-repo-research-analyst",
      "description: Personal Pi agent for local research",
      "---",
      "",
      "User-authored agent body",
      "",
    ].join("\n")
    await fs.writeFile(path.join(agentsRoot, "ce-repo-research-analyst.md"), userAgentBody)

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
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain("Cleaned pi")
    expect(stdout).toContain("backed up 1 artifact")
    expect(await exists(path.join(agentsRoot, "repo-research-analyst.md"))).toBe(false)
    expect(await exists(path.join(agentsRoot, "ce-repo-research-analyst.md"))).toBe(true)
    expect(await fs.readFile(path.join(agentsRoot, "ce-repo-research-analyst.md"), "utf8")).toBe(userAgentBody)
    expect(await exists(path.join(piRoot, "compound-engineering", "legacy-backup"))).toBe(true)
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

    await fs.mkdir(path.join(opencodeRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(opencodeRoot, "skills", "reproduce-bug", "SKILL.md"), skillContent("reproduce-bug", historicalSkillDescription("reproduce-bug")))
    await fs.mkdir(path.join(opencodeRoot, "agents"), { recursive: true })
    await fs.writeFile(
      path.join(opencodeRoot, "agents", "bug-reproduction-validator.md"),
      agentContent("bug-reproduction-validator", historicalAgentDescription("bug-reproduction-validator")),
    )
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
    expect(await exists(path.join(opencodeRoot, "skills", "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(opencodeRoot, "agents", "bug-reproduction-validator.md"))).toBe(false)
    expect(await exists(path.join(opencodeRoot, "commands", "compound", "plan.md"))).toBe(false)
    expect(await exists(path.join(opencodeRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup backs up legacy Pi artifacts on demand", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-pi-"))
    const piRoot = path.join(tempRoot, ".pi", "agent")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(piRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(piRoot, "skills", "reproduce-bug", "SKILL.md"), skillContent("reproduce-bug", historicalSkillDescription("reproduce-bug")))
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
    expect(await exists(path.join(piRoot, "skills", "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(piRoot, "prompts", "compound-plan.md"))).toBe(false)
    expect(await exists(path.join(piRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("cleanup backs up legacy Copilot workspace artifacts for native migration", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-copilot-"))
    const repoRoot = path.join(import.meta.dir, "..")
    const githubRoot = path.join(tempRoot, ".github")

    await fs.mkdir(path.join(githubRoot, "skills", "git-commit-push-pr"), { recursive: true })
    await fs.writeFile(
      path.join(githubRoot, "skills", "git-commit-push-pr", "SKILL.md"),
      skillContent("git-commit-push-pr", historicalSkillDescription("git-commit-push-pr")),
    )
    await fs.mkdir(path.join(githubRoot, "agents"), { recursive: true })
    await fs.writeFile(
      path.join(githubRoot, "agents", "repo-research-analyst.agent.md"),
      agentContent("repo-research-analyst", historicalAgentDescription("ce-repo-research-analyst")),
    )

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

    expect(await exists(path.join(githubRoot, "skills", "ce-debug"))).toBe(true)
    expect(await exists(path.join(githubRoot, "skills", "my-user-skill"))).toBe(true)
    expect(await exists(path.join(githubRoot, "agents", "ce-adversarial-reviewer.agent.md"))).toBe(true)
  })

  test("cleanup backs up legacy Droid artifacts for native migration", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-droid-"))
    const droidRoot = path.join(tempRoot, ".factory")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(droidRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(droidRoot, "skills", "reproduce-bug", "SKILL.md"), skillContent("reproduce-bug", historicalSkillDescription("reproduce-bug")))
    await fs.mkdir(path.join(droidRoot, "droids"), { recursive: true })
    await fs.writeFile(
      path.join(droidRoot, "droids", "bug-reproduction-validator.md"),
      agentContent("bug-reproduction-validator", historicalAgentDescription("bug-reproduction-validator")),
    )
    await fs.mkdir(path.join(droidRoot, "commands"), { recursive: true })
    await fs.writeFile(path.join(droidRoot, "commands", "plan.md"), "legacy flattened command")

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
    expect(await exists(path.join(droidRoot, "skills", "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(droidRoot, "droids", "bug-reproduction-validator.md"))).toBe(false)
    expect(await exists(path.join(droidRoot, "commands", "plan.md"))).toBe(false)
    expect(await exists(path.join(droidRoot, "compound-engineering", "legacy-backup"))).toBe(true)

    expect(await exists(path.join(droidRoot, "droids", "ce-adversarial-reviewer.md"))).toBe(true)
    expect(await exists(path.join(droidRoot, "commands", "my-user-command.md"))).toBe(true)
    expect(await exists(path.join(droidRoot, "skills", "my-user-skill"))).toBe(true)
  })

  test("cleanup backs up deprecated Windsurf artifacts", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-windsurf-"))
    const windsurfRoot = path.join(tempRoot, ".codeium", "windsurf")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(windsurfRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(windsurfRoot, "skills", "reproduce-bug", "SKILL.md"), skillContent("reproduce-bug", historicalSkillDescription("reproduce-bug")))
    await fs.mkdir(path.join(windsurfRoot, "skills", "repo-research-analyst"), { recursive: true })
    await fs.writeFile(
      path.join(windsurfRoot, "skills", "repo-research-analyst", "SKILL.md"),
      skillContent("repo-research-analyst", historicalAgentDescription("ce-repo-research-analyst")),
    )
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
    await fs.writeFile(path.join(qwenRoot, "skills", "ce-plan", "SKILL.md"), skillContent("ce-plan", historicalSkillDescription("ce-plan")))
    await fs.mkdir(path.join(qwenRoot, "agents"), { recursive: true })
    await fs.writeFile(
      path.join(qwenRoot, "agents", "repo-research-analyst.yaml"),
      qwenAgentYaml("repo-research-analyst", historicalAgentDescription("ce-repo-research-analyst")),
    )
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
    await fs.writeFile(path.join(qwenRoot, "skills", "ce-plan", "SKILL.md"), skillContent("ce-plan", historicalSkillDescription("ce-plan")))
    await fs.mkdir(path.join(qwenRoot, "agents"), { recursive: true })
    await fs.writeFile(
      path.join(qwenRoot, "agents", "repo-research-analyst.md"),
      agentContent("repo-research-analyst", historicalAgentDescription("ce-repo-research-analyst")),
    )
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

    expect(await exists(path.join(qwenRoot, "skills", "ce-debug"))).toBe(true)
    expect(await exists(path.join(qwenRoot, "skills", "my-user-skill"))).toBe(true)
    expect(await exists(path.join(qwenRoot, "agents", "ce-correctness-reviewer.md"))).toBe(true)
    expect(await exists(path.join(qwenRoot, "commands", "my-user-command.md"))).toBe(true)
  })

  test("cleanup backs up Kiro artifacts on demand", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cleanup-kiro-"))
    const kiroRoot = path.join(tempRoot, ".kiro")
    const repoRoot = path.join(import.meta.dir, "..")

    await fs.mkdir(path.join(kiroRoot, "skills", "ce-plan"), { recursive: true })
    await fs.writeFile(path.join(kiroRoot, "skills", "ce-plan", "SKILL.md"), skillContent("ce-plan", historicalSkillDescription("ce-plan")))
    await fs.mkdir(path.join(kiroRoot, "skills", "compound-plan"), { recursive: true })
    await fs.writeFile(path.join(kiroRoot, "skills", "compound-plan", "SKILL.md"), "user-authored command-like skill")
    await fs.mkdir(path.join(kiroRoot, "agents", "prompts"), { recursive: true })
    await fs.writeFile(
      path.join(kiroRoot, "agents", "ce-repo-research-analyst.json"),
      kiroAgentConfigContent("ce-repo-research-analyst", historicalAgentDescription("ce-repo-research-analyst")),
    )
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
    expect(await exists(path.join(kiroRoot, "skills", "compound-plan"))).toBe(true)
    expect(await exists(path.join(kiroRoot, "agents", "ce-repo-research-analyst.json"))).toBe(false)
    expect(await exists(path.join(kiroRoot, "agents", "prompts", "ce-repo-research-analyst.md"))).toBe(false)
    expect(await exists(path.join(kiroRoot, "compound-engineering", "legacy-backup"))).toBe(true)
  })

  test("list returns a root plugin in a temp workspace", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-list-root-"))
    const pluginRoot = path.join(tempRoot, ".claude-plugin")
    await fs.mkdir(pluginRoot, { recursive: true })
    await fs.writeFile(path.join(pluginRoot, "plugin.json"), "{\n  \"name\": \"demo-root-plugin\",\n  \"version\": \"1.0.0\"\n}\n")

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

    expect(stdout).toContain("demo-root-plugin")
  })

  test("list keeps legacy plugins directory fallback", async () => {
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
    const pluginRoot = repoRoot

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
      env: envWithoutOpenCodeConfig({
        HOME: tempRoot,
        COMPOUND_PLUGIN_GITHUB_SOURCE: repoRoot,
      }),
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
    expect(await exists(path.join(tempRoot, ".config", "opencode", "skills", "ce-plan", "SKILL.md"))).toBe(true)
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
        CODEX_HOME: codexRoot,
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
    // Native Codex no longer needs a managed Claude-compat tool map in AGENTS.md.
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(false)
  })

  test("install --to codex default omits skills and agents for native plugin install", async () => {
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
        CODEX_HOME: codexRoot,
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
    // Default omits skills; they're expected from native Codex plugin install.
    expect(await exists(path.join(codexRoot, "skills", "ce-plan", "SKILL.md"))).toBe(false)
    expect(await exists(path.join(codexRoot, "skills", "compound-engineering", "ce-plan", "SKILL.md"))).toBe(false)
    // Compound Engineering no longer ships standalone agents, so the default
    // Codex converter followup has no CE payload to emit.
    expect(await exists(path.join(codexRoot, "agents", "compound-engineering"))).toBe(false)
    // Convert/install no longer creates AGENTS.md; it only strips a legacy tool map if present.
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(false)
  })

  test("install --to codex strips a legacy Compound Codex tool map from AGENTS.md", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-codex-strip-map-"))
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-codex-strip-map-ws-"))
    const projectRoot = path.join(import.meta.dir, "..")
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
    const codexRoot = path.join(tempRoot, ".codex")
    await fs.mkdir(codexRoot, { recursive: true })
    await fs.writeFile(
      path.join(codexRoot, "AGENTS.md"),
      [
        "# Keep me",
        "",
        "<!-- BEGIN COMPOUND CODEX TOOL MAP -->",
        "legacy map",
        "<!-- END COMPOUND CODEX TOOL MAP -->",
        "",
      ].join("\n"),
    )

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(projectRoot, "src", "index.ts"),
      "install",
      fixtureRoot,
      "--to",
      "codex",
    ], {
      cwd: workspaceRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
        CODEX_HOME: codexRoot,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    const agentsMd = await fs.readFile(path.join(codexRoot, "AGENTS.md"), "utf8")
    expect(agentsMd).toContain("# Keep me")
    expect(agentsMd).not.toContain("<!-- BEGIN COMPOUND CODEX TOOL MAP -->")
    expect(agentsMd).not.toContain("legacy map")
  })

  test("install --to codex respects CODEX_HOME when --codex-home is omitted", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-codex-env-home-"))
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-codex-env-home-ws-"))
    const projectRoot = path.join(import.meta.dir, "..")
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
    const codexHome = path.join(tempRoot, "profiles", "sstk")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(projectRoot, "src", "index.ts"),
      "install",
      fixtureRoot,
      "--to",
      "codex",
    ], {
      cwd: workspaceRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: tempRoot,
        CODEX_HOME: codexHome,
      },
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    if (exitCode !== 0) {
      throw new Error(`CLI failed (exit ${exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`)
    }

    expect(stdout).toContain(codexHome)
    expect(await exists(path.join(codexHome, "agents", "compound-engineering", "security-sentinel.toml"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".codex", "agents", "compound-engineering", "security-sentinel.toml"))).toBe(false)
  })

  test("install --to codex treats --codex-home as the Codex root even when it is not named .codex", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-codex-explicit-home-"))
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cli-codex-explicit-home-ws-"))
    const projectRoot = path.join(import.meta.dir, "..")
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "sample-plugin")
    const codexHome = path.join(tempRoot, "profiles", "sstk")

    const proc = Bun.spawn([
      "bun",
      "run",
      path.join(projectRoot, "src", "index.ts"),
      "install",
      fixtureRoot,
      "--to",
      "codex",
      "--codex-home",
      codexHome,
    ], {
      cwd: workspaceRoot,
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

    expect(await exists(path.join(codexHome, "agents", "compound-engineering", "security-sentinel.toml"))).toBe(true)
    expect(await exists(path.join(codexHome, ".codex", "agents", "compound-engineering", "security-sentinel.toml"))).toBe(false)
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
    const pluginRoot = repoRoot
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
    const pluginRoot = repoRoot

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
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(false)
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
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(false)
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
    // Codex still landed at the explicit --codex-home without creating AGENTS.md.
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(false)
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
    expect(await exists(path.join(codexRoot, "AGENTS.md"))).toBe(false)
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

    await fs.mkdir(path.join(customRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(customRoot, "skills", "reproduce-bug", "SKILL.md"), skillContent("reproduce-bug", historicalSkillDescription("reproduce-bug")))
    await fs.mkdir(path.join(customRoot, "agents"), { recursive: true })
    await fs.writeFile(
      path.join(customRoot, "agents", "bug-reproduction-validator.md"),
      agentContent("bug-reproduction-validator", historicalAgentDescription("bug-reproduction-validator")),
    )

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
    expect(await exists(path.join(customRoot, "skills", "reproduce-bug"))).toBe(false)
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
    await fs.mkdir(path.join(workspaceOpenCode, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(workspaceOpenCode, "skills", "reproduce-bug", "SKILL.md"), skillContent("reproduce-bug", historicalSkillDescription("reproduce-bug")))
    await fs.mkdir(path.join(workspaceOpenCode, "agents"), { recursive: true })
    await fs.writeFile(
      path.join(workspaceOpenCode, "agents", "bug-reproduction-validator.md"),
      agentContent("bug-reproduction-validator", historicalAgentDescription("bug-reproduction-validator")),
    )

    // A lookalike stale artifact in the global root — this must be UNTOUCHED
    // because the user scoped the cleanup to the workspace via `--output`.
    await fs.mkdir(path.join(globalRoot, "skills", "reproduce-bug"), { recursive: true })
    await fs.writeFile(path.join(globalRoot, "skills", "reproduce-bug", "SKILL.md"), skillContent("reproduce-bug", historicalSkillDescription("reproduce-bug")))

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
    expect(await exists(path.join(workspaceOpenCode, "skills", "reproduce-bug"))).toBe(false)
    expect(await exists(path.join(workspaceOpenCode, "agents", "bug-reproduction-validator.md"))).toBe(false)
    expect(await exists(path.join(workspaceOpenCode, "compound-engineering", "legacy-backup"))).toBe(true)
    // Global root must NOT be swept — `--output` scoped the cleanup.
    expect(await exists(path.join(globalRoot, "skills", "reproduce-bug"))).toBe(true)
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
    // Claude agents install at .pi/agents/<name>.md for runtimes and tools
    // that read Pi agent files.
    expect(await exists(path.join(piRoot, "agents", "repo-research-analyst.md"))).toBe(true)
    // Pi installs no longer ship a plugin-authored compat extension. MCP
    // servers declared in plugin.json are still translated to mcporter.json so
    // plugins with MCP wiring keep their backends after conversion.
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
    await fs.mkdir(path.join(tempHome, ".gemini", "antigravity-cli"), { recursive: true })
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
      env: envWithoutOpenCodeConfig({
        HOME: tempHome,
        CODEX_HOME: path.join(tempHome, ".codex"),
      }),
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
    expect(stdout).toContain("Installed compound-engineering to antigravity")
    expect(stdout).toContain("droid — native plugin install; skipped")
    expect(stdout).toContain("copilot — native plugin install; skipped")
    expect(stdout).toContain("qwen — native plugin install; skipped")
    expect(stdout).not.toContain("cursor")

    expect(await exists(path.join(tempHome, ".config", "opencode", "opencode.json"))).toBe(true)
    // Codex `--to all` for the fixture plugin still uses the agents-only
    // default; skills come from native plugin install.
    expect(await exists(path.join(tempHome, ".codex", "agents", "compound-engineering", "security-sentinel.toml"))).toBe(true)
    expect(await exists(path.join(tempHome, ".codex", "skills", "compound-engineering", "skill-one", "SKILL.md"))).toBe(false)
    expect(await exists(path.join(tempHome, ".pi", "agent", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempCwd, ".agy", "skills", "skill-one", "SKILL.md"))).toBe(true)
    expect(await exists(path.join(tempCwd, ".kiro", "skills", "skill-one", "SKILL.md"))).toBe(false)
    expect(await exists(path.join(tempHome, ".qwen", "extensions", "compound-engineering", "qwen-extension.json"))).toBe(false)
  })
})
