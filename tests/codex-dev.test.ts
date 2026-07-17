import { afterEach, describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  BunCommandRunner,
  activateLocalCollection,
  inspectCodexDevStatus,
  inspectLocalCollection,
  replaceManagedCollectionLink,
  removeManagedCollectionLink,
  removeCodexDevInstallation,
  removeLocalCollection,
  resolveCodexDevContext,
  runCodexDevCommand,
  switchToLocal,
  switchToRemote,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
  type InstalledPlugin,
} from "../src/dev/codex-dev"

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function makeTempRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Codex Dev Test",
      GIT_AUTHOR_EMAIL: "codex-dev@example.com",
      GIT_COMMITTER_NAME: "Codex Dev Test",
      GIT_COMMITTER_EMAIL: "codex-dev@example.com",
    },
  })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr}`)
  return stdout.trim()
}

async function createCeRepo(repoRoot: string): Promise<void> {
  await fs.mkdir(path.join(repoRoot, ".codex-plugin"), { recursive: true })
  await fs.mkdir(path.join(repoRoot, "skills", "ce-alpha"), { recursive: true })
  await fs.writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ name: "compound-engineering", version: "3.19.0" }) + "\n",
  )
  await fs.writeFile(
    path.join(repoRoot, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "compound-engineering", version: "3.19.0", skills: "./skills/" }) + "\n",
  )
  await fs.writeFile(
    path.join(repoRoot, "skills", "ce-alpha", "SKILL.md"),
    "---\nname: ce-alpha\ndescription: Alpha test skill.\n---\n",
  )
  await runGit(repoRoot, ["init", "-b", "main"])
  await runGit(repoRoot, ["add", "."])
  await runGit(repoRoot, ["commit", "-m", "initial"])
}

function testEnv(home: string, codexHome: string): NodeJS.ProcessEnv {
  return { ...process.env, HOME: home, CODEX_HOME: codexHome }
}

const officialMarketplace = {
  name: "compound-engineering-plugin",
  root: "/tmp/compound-engineering-plugin",
  marketplaceSource: {
    sourceType: "git",
    source: "https://github.com/EveryInc/compound-engineering-plugin.git",
  },
}

function plugin(pluginId: string, options: Partial<InstalledPlugin> = {}): InstalledPlugin {
  const marketplaceName = pluginId.split("@")[1]
  return {
    pluginId,
    name: "compound-engineering",
    marketplaceName,
    version: "3.19.0",
    installed: true,
    enabled: true,
    source: { source: "git", url: "https://github.com/EveryInc/compound-engineering-plugin.git" },
    marketplaceSource: {
      sourceType: "git",
      source: "https://github.com/EveryInc/compound-engineering-plugin.git",
    },
    ...options,
  }
}

class StatefulCodexRunner implements CommandRunner {
  plugins: InstalledPlugin[]
  marketplaces: typeof officialMarketplace[]
  calls: string[][] = []
  failAdd = false
  failRemove: string | null = null
  beforeFailedRemove?: () => Promise<void>

  constructor(plugins: InstalledPlugin[] = [], marketplaces: typeof officialMarketplace[] = []) {
    this.plugins = [...plugins]
    this.marketplaces = [...marketplaces]
  }

  async run(command: string, args: string[], _options?: CommandOptions): Promise<CommandResult> {
    this.calls.push([command, ...args])
    if (command !== "codex") return { exitCode: 127, stdout: "", stderr: "unexpected command" }
    const joined = args.join(" ")
    if (joined === "plugin list --available --json") {
      return { exitCode: 0, stdout: JSON.stringify({ installed: this.plugins, available: [] }), stderr: "" }
    }
    if (joined === "plugin marketplace list --json") {
      return { exitCode: 0, stdout: JSON.stringify({ marketplaces: this.marketplaces }), stderr: "" }
    }
    if (args[0] === "plugin" && args[1] === "remove") {
      if (this.failRemove === args[2]) {
        await this.beforeFailedRemove?.()
        return { exitCode: 1, stdout: "", stderr: "remove failed" }
      }
      this.plugins = this.plugins.filter((entry) => entry.pluginId !== args[2])
      return { exitCode: 0, stdout: "{}", stderr: "" }
    }
    if (joined === "plugin marketplace add EveryInc/compound-engineering-plugin --json") {
      this.marketplaces.push(officialMarketplace)
      return { exitCode: 0, stdout: "{}", stderr: "" }
    }
    if (joined === "plugin marketplace upgrade compound-engineering-plugin --json") {
      return { exitCode: 0, stdout: "{}", stderr: "" }
    }
    if (joined === "plugin add compound-engineering@compound-engineering-plugin --json") {
      if (this.failAdd) return { exitCode: 1, stdout: "", stderr: "install failed" }
      this.plugins = [
        ...this.plugins.filter((entry) => entry.pluginId !== "compound-engineering@compound-engineering-plugin"),
        plugin("compound-engineering@compound-engineering-plugin"),
      ]
      return { exitCode: 0, stdout: "{}", stderr: "" }
    }
    return { exitCode: 2, stdout: "", stderr: `unexpected args: ${joined}` }
  }
}

describe("Codex local development context", () => {
  test("uses the invoking linked worktree and reports provenance and dirty files", async () => {
    const root = await makeTempRoot("codex-dev-worktree-")
    const primary = path.join(root, "primary repo")
    const linked = path.join(root, "linked worktree with spaces")
    const home = path.join(root, "home")
    const codexHome = path.join(root, "codex profile")
    await fs.mkdir(primary, { recursive: true })
    await fs.mkdir(home, { recursive: true })
    await fs.mkdir(codexHome, { recursive: true })
    await createCeRepo(primary)
    await runGit(primary, ["worktree", "add", "-b", "feat/local", linked])
    await fs.appendFile(path.join(linked, "skills", "ce-alpha", "SKILL.md"), "\nlocal edit\n")
    await fs.mkdir(path.join(linked, "skills", "ce-beta"), { recursive: true })
    await fs.writeFile(
      path.join(linked, "skills", "ce-beta", "SKILL.md"),
      "---\nname: ce-beta\ndescription: Beta test skill.\n---\n",
    )

    const context = await resolveCodexDevContext(
      path.join(linked, "skills", "ce-alpha"),
      testEnv(home, codexHome),
      new BunCommandRunner(),
    )

    expect(context.repoRoot).toBe(await fs.realpath(linked))
    expect(context.skillsRoot).toBe(path.join(await fs.realpath(linked), "skills"))
    expect(context.codexHome).toBe(path.resolve(codexHome))
    expect(context.collectionPath).toBe(path.join(path.resolve(codexHome), "skills", "compound-engineering-local"))
    expect(context.linkedWorktree).toBe(true)
    expect(context.branch).toBe("feat/local")
    expect(context.head).toMatch(/^[0-9a-f]{40}$/)
    expect(context.modifiedCount).toBe(1)
    expect(context.untrackedCount).toBe(1)
    expect(context.skillNames).toEqual(["ce-alpha", "ce-beta"])
  })

  test("rejects a repository that is not Compound Engineering", async () => {
    const root = await makeTempRoot("codex-dev-wrong-repo-")
    const repo = path.join(root, "repo")
    const home = path.join(root, "home")
    const codexHome = path.join(root, "codex-home")
    await fs.mkdir(repo, { recursive: true })
    await fs.mkdir(home, { recursive: true })
    await fs.mkdir(codexHome, { recursive: true })
    await fs.writeFile(path.join(repo, "package.json"), JSON.stringify({ name: "something-else" }))
    await runGit(repo, ["init", "-b", "main"])

    await expect(
      resolveCodexDevContext(repo, testEnv(home, codexHome), new BunCommandRunner()),
    ).rejects.toThrow("not the compound-engineering repository")
  })
})

describe("Codex local skill collection", () => {
  test("creates one collection symlink and unlinking it preserves every source skill", async () => {
    const root = await makeTempRoot("codex-dev-link-")
    const repo = path.join(root, "repo")
    const home = path.join(root, "home")
    const codexHome = path.join(root, "codex-home")
    const unrelatedSkill = path.join(codexHome, "skills", "unrelated", "SKILL.md")
    await fs.mkdir(repo, { recursive: true })
    await fs.mkdir(home, { recursive: true })
    await fs.mkdir(path.dirname(unrelatedSkill), { recursive: true })
    await fs.writeFile(unrelatedSkill, "unrelated\n")
    await createCeRepo(repo)
    const sourceSkill = path.join(repo, "skills", "ce-alpha", "SKILL.md")
    const context = await resolveCodexDevContext(repo, testEnv(home, codexHome), new BunCommandRunner())

    await activateLocalCollection(context)
    const state = await inspectLocalCollection(context)
    expect(state.kind).toBe("valid")
    expect(await fs.realpath(context.collectionPath)).toBe(await fs.realpath(context.skillsRoot))

    expect(await removeLocalCollection(context)).toBe(true)
    expect(await fs.readFile(sourceSkill, "utf8")).toContain("name: ce-alpha")
    expect(await fs.readFile(unrelatedSkill, "utf8")).toBe("unrelated\n")
    await expect(fs.lstat(context.collectionPath)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("retargets a valid CE collection but refuses regular-path collisions", async () => {
    const root = await makeTempRoot("codex-dev-retarget-")
    const first = path.join(root, "first")
    const second = path.join(root, "second")
    const home = path.join(root, "home")
    const codexHome = path.join(root, "codex-home")
    await fs.mkdir(first, { recursive: true })
    await fs.mkdir(second, { recursive: true })
    await fs.mkdir(home, { recursive: true })
    await fs.mkdir(codexHome, { recursive: true })
    await createCeRepo(first)
    await createCeRepo(second)
    const firstContext = await resolveCodexDevContext(first, testEnv(home, codexHome), new BunCommandRunner())
    const secondContext = await resolveCodexDevContext(second, testEnv(home, codexHome), new BunCommandRunner())

    await activateLocalCollection(firstContext)
    await activateLocalCollection(secondContext)
    expect(await fs.realpath(secondContext.collectionPath)).toBe(await fs.realpath(secondContext.skillsRoot))

    await removeLocalCollection(secondContext)
    await fs.writeFile(secondContext.collectionPath, "user-owned\n")
    await expect(activateLocalCollection(firstContext)).rejects.toThrow("not a symlink")
    expect(await fs.readFile(secondContext.collectionPath, "utf8")).toBe("user-owned\n")
  })

  test("preserves a collision created after an absent collection was inspected", async () => {
    const root = await makeTempRoot("codex-dev-absent-race-")
    const collectionPath = path.join(root, "skills", "compound-engineering-local")
    const target = path.join(root, "checkout", "skills")
    await fs.mkdir(path.dirname(collectionPath), { recursive: true })
    await fs.mkdir(target, { recursive: true })

    await expect(fs.lstat(collectionPath)).rejects.toMatchObject({ code: "ENOENT" })
    await fs.writeFile(collectionPath, "raced-in user content\n")

    await expect(
      replaceManagedCollectionLink(collectionPath, target, { kind: "absent" }),
    ).rejects.toMatchObject({ code: "EEXIST" })
    expect(await fs.readFile(collectionPath, "utf8")).toBe("raced-in user content\n")
  })

  test("preserves a valid-link replacement created after the original link was inspected", async () => {
    const root = await makeTempRoot("codex-dev-valid-race-")
    const collectionPath = path.join(root, "skills", "compound-engineering-local")
    const originalTarget = path.join(root, "original", "skills")
    const desiredTarget = path.join(root, "desired", "skills")
    const racedTarget = path.join(root, "raced", "skills")
    await fs.mkdir(path.dirname(collectionPath), { recursive: true })
    await Promise.all([
      fs.mkdir(originalTarget, { recursive: true }),
      fs.mkdir(desiredTarget, { recursive: true }),
      fs.mkdir(racedTarget, { recursive: true }),
    ])
    await fs.symlink(originalTarget, collectionPath, "dir")
    const inspectedTarget = await fs.readlink(collectionPath)
    await fs.unlink(collectionPath)
    await fs.symlink(racedTarget, collectionPath, "dir")

    await expect(
      replaceManagedCollectionLink(collectionPath, desiredTarget, {
        kind: "valid",
        target: inspectedTarget,
      }),
    ).rejects.toThrow("changed since it was inspected")
    expect(await fs.readlink(collectionPath)).toBe(racedTarget)
    expect(await fs.realpath(collectionPath)).toBe(await fs.realpath(racedTarget))
  })

  test("preserves a user-owned file created after a removable link was inspected", async () => {
    const root = await makeTempRoot("codex-dev-remove-race-")
    const collectionPath = path.join(root, "skills", "compound-engineering-local")
    const originalTarget = path.join(root, "checkout", "skills")
    await fs.mkdir(path.dirname(collectionPath), { recursive: true })
    await fs.mkdir(originalTarget, { recursive: true })
    await fs.symlink(originalTarget, collectionPath, "dir")
    const inspectedTarget = await fs.readlink(collectionPath)
    await fs.unlink(collectionPath)
    await fs.writeFile(collectionPath, "raced-in user content\n")

    await expect(
      removeManagedCollectionLink(collectionPath, inspectedTarget),
    ).rejects.toThrow("changed since it was inspected")
    expect((await fs.lstat(collectionPath)).isFile()).toBe(true)
    expect(await fs.readFile(collectionPath, "utf8")).toBe("raced-in user content\n")
  })

  test("preserves an unrelated symlink created after a removable link was inspected", async () => {
    const root = await makeTempRoot("codex-dev-remove-symlink-race-")
    const collectionPath = path.join(root, "skills", "compound-engineering-local")
    const originalTarget = path.join(root, "checkout", "skills")
    const racedTarget = path.join(root, "user", "skills")
    await fs.mkdir(path.dirname(collectionPath), { recursive: true })
    await Promise.all([
      fs.mkdir(originalTarget, { recursive: true }),
      fs.mkdir(racedTarget, { recursive: true }),
    ])
    await fs.symlink(originalTarget, collectionPath, "dir")
    const inspectedTarget = await fs.readlink(collectionPath)
    await fs.unlink(collectionPath)
    await fs.symlink(racedTarget, collectionPath, "dir")

    await expect(
      removeManagedCollectionLink(collectionPath, inspectedTarget),
    ).rejects.toThrow("changed since it was inspected")
    expect(await fs.readlink(collectionPath)).toBe(racedTarget)
    expect(await fs.realpath(collectionPath)).toBe(await fs.realpath(racedTarget))
  })

  test("preserves a new occupant created after the expected link is atomically taken", async () => {
    const root = await makeTempRoot("codex-dev-remove-after-take-")
    const collectionPath = path.join(root, "skills", "compound-engineering-local")
    const originalTarget = path.join(root, "checkout", "skills")
    await fs.mkdir(path.dirname(collectionPath), { recursive: true })
    await fs.mkdir(originalTarget, { recursive: true })
    await fs.symlink(originalTarget, collectionPath, "dir")
    const inspectedTarget = await fs.readlink(collectionPath)
    let recoveryPath = ""

    await expect(
      removeManagedCollectionLink(collectionPath, inspectedTarget, {
        onTakenForTest: async (takenPath) => {
          recoveryPath = takenPath
          await fs.writeFile(collectionPath, "new occupant\n")
        },
      }),
    ).resolves.toBe(true)
    expect(await fs.readFile(collectionPath, "utf8")).toBe("new occupant\n")
    await expect(fs.lstat(recoveryPath)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("retains an unexpected taken entry at a reported recovery path when restoration races", async () => {
    const root = await makeTempRoot("codex-dev-remove-recovery-race-")
    const collectionPath = path.join(root, "skills", "compound-engineering-local")
    const expectedTarget = path.join(root, "checkout", "skills")
    const racedTarget = path.join(root, "user", "skills")
    await fs.mkdir(path.dirname(collectionPath), { recursive: true })
    await Promise.all([
      fs.mkdir(expectedTarget, { recursive: true }),
      fs.mkdir(racedTarget, { recursive: true }),
    ])
    await fs.symlink(racedTarget, collectionPath, "dir")
    let recoveryPath = ""

    const removal = removeManagedCollectionLink(collectionPath, expectedTarget, {
      onTakenForTest: async (takenPath) => {
        recoveryPath = takenPath
        await fs.writeFile(collectionPath, "new occupant\n")
      },
    })

    let removalError: unknown
    try {
      await removal
    } catch (error) {
      removalError = error
    }
    expect(recoveryPath).not.toBe("")
    expect(removalError).toBeInstanceOf(Error)
    expect((removalError as Error).message).toContain(`preserved at ${recoveryPath}`)
    expect((removalError as Error).message).toContain("the current entry at")
    expect(await fs.readFile(collectionPath, "utf8")).toBe("new occupant\n")
    expect(await fs.readlink(recoveryPath)).toBe(racedTarget)
  })

  test("reports the recovery path if deterministic post-take test setup fails", async () => {
    const root = await makeTempRoot("codex-dev-remove-test-hook-")
    const collectionPath = path.join(root, "skills", "compound-engineering-local")
    const expectedTarget = path.join(root, "checkout", "skills")
    await fs.mkdir(path.dirname(collectionPath), { recursive: true })
    await fs.mkdir(expectedTarget, { recursive: true })
    await fs.symlink(expectedTarget, collectionPath, "dir")
    let recoveryPath = ""

    const removal = removeManagedCollectionLink(collectionPath, expectedTarget, {
      onTakenForTest: async (takenPath) => {
        recoveryPath = takenPath
        throw new Error("injected failure")
      },
    })

    let removalError: unknown
    try {
      await removal
    } catch (error) {
      removalError = error
    }
    expect(removalError).toBeInstanceOf(Error)
    expect((removalError as Error).message).toContain(`preserved at ${recoveryPath}`)
    expect(await fs.readlink(recoveryPath)).toBe(expectedTarget)
  })
})

describe("Codex development installation transitions", () => {
  async function makeContext() {
    const root = await makeTempRoot("codex-dev-transition-")
    const repo = path.join(root, "repo with spaces")
    const home = path.join(root, "home")
    const codexHome = path.join(root, "codex home")
    await fs.mkdir(repo, { recursive: true })
    await fs.mkdir(home, { recursive: true })
    await fs.mkdir(codexHome, { recursive: true })
    await createCeRepo(repo)
    return resolveCodexDevContext(repo, testEnv(home, codexHome), new BunCommandRunner())
  }

  test("local mode removes every installed CE plugin variant and verifies the live worktree link", async () => {
    const context = await makeContext()
    const runner = new StatefulCodexRunner([
      plugin("compound-engineering@compound-engineering-plugin"),
      plugin("compound-engineering@personal", {
        marketplaceName: "personal",
        source: { source: "local", path: "/some/old/checkout" },
      }),
    ])

    const status = await switchToLocal(context, runner)

    expect(status.mode).toBe("local")
    expect(status.plugins).toHaveLength(0)
    expect(status.localTarget).toBe(await fs.realpath(context.skillsRoot))
    expect(runner.calls.filter((call) => call[1] === "plugin" && call[2] === "remove")).toEqual([
      ["codex", "plugin", "remove", "compound-engineering@compound-engineering-plugin", "--json"],
      ["codex", "plugin", "remove", "compound-engineering@personal", "--json"],
    ])
  })

  test("remote mode installs and verifies the official Git plugin before unlinking local skills", async () => {
    const context = await makeContext()
    await activateLocalCollection(context)
    const runner = new StatefulCodexRunner([], [officialMarketplace])

    const status = await switchToRemote(context, runner)

    expect(status.mode).toBe("remote")
    expect(status.plugins.map((entry) => entry.pluginId)).toEqual([
      "compound-engineering@compound-engineering-plugin",
    ])
    expect((await inspectLocalCollection(context)).kind).toBe("absent")
    expect(runner.calls).toContainEqual([
      "codex",
      "plugin",
      "marketplace",
      "upgrade",
      "compound-engineering-plugin",
      "--json",
    ])
  })

  test("keeps local skills active if the remote install fails", async () => {
    const context = await makeContext()
    await activateLocalCollection(context)
    const runner = new StatefulCodexRunner(
      [plugin("compound-engineering@compound-engineering-plugin")],
      [officialMarketplace],
    )
    runner.failAdd = true

    await expect(switchToRemote(context, runner)).rejects.toThrow("install failed")
    expect((await inspectLocalCollection(context)).kind).toBe("valid")
    expect(runner.plugins).toHaveLength(0)
  })

  test("restores the prior link state if switching to local cannot remove a plugin", async () => {
    const context = await makeContext()
    const runner = new StatefulCodexRunner([plugin("compound-engineering@personal")])
    runner.failRemove = "compound-engineering@personal"

    await expect(switchToLocal(context, runner)).rejects.toThrow("remove failed")
    expect((await inspectLocalCollection(context)).kind).toBe("absent")
  })

  test("removes its newly created link during rollback even if the target becomes broken", async () => {
    const context = await makeContext()
    const runner = new StatefulCodexRunner([plugin("compound-engineering@personal")])
    const movedSkills = `${context.skillsRoot}.moved`
    runner.failRemove = "compound-engineering@personal"
    runner.beforeFailedRemove = async () => {
      await fs.rename(context.skillsRoot, movedSkills)
    }

    await expect(switchToLocal(context, runner)).rejects.toThrow("remove failed")
    await expect(fs.lstat(context.collectionPath)).rejects.toMatchObject({ code: "ENOENT" })
    expect((await fs.stat(movedSkills)).isDirectory()).toBe(true)
  })

  test("leaves a replacement symlink in place during rollback", async () => {
    const context = await makeContext()
    const replacement = path.join(path.dirname(context.repoRoot), "replacement skills")
    const runner = new StatefulCodexRunner([plugin("compound-engineering@personal")])
    runner.failRemove = "compound-engineering@personal"
    runner.beforeFailedRemove = async () => {
      await fs.mkdir(replacement, { recursive: true })
      await fs.unlink(context.collectionPath)
      await fs.symlink(replacement, context.collectionPath, "dir")
    }

    await expect(switchToLocal(context, runner)).rejects.toThrow("remove failed")
    expect(await fs.readlink(context.collectionPath)).toBe(replacement)
    expect(await fs.realpath(context.collectionPath)).toBe(await fs.realpath(replacement))
  })

  test("reports mixed state and remove clears only CE-managed surfaces", async () => {
    const context = await makeContext()
    await activateLocalCollection(context)
    const runner = new StatefulCodexRunner([plugin("compound-engineering@personal")])

    expect((await inspectCodexDevStatus(context, runner)).mode).toBe("mixed")
    expect((await removeCodexDevInstallation(context, runner)).mode).toBe("absent")
  })

  test("status prints mode and worktree provenance without changing Codex state", async () => {
    const context = await makeContext()
    await activateLocalCollection(context)
    const runner = new StatefulCodexRunner()
    const output: string[] = []

    const exitCode = await runCodexDevCommand(
      "status",
      context.repoRoot,
      context.env,
      runner,
      (line) => output.push(line),
    )

    expect(exitCode).toBe(0)
    expect(output.join("\n")).toContain("Mode: local")
    expect(output.join("\n")).toContain(`Source checkout: ${context.repoRoot}`)
    expect(output.join("\n")).toContain(`Commit: ${context.head}`)
    expect(runner.calls).toEqual([["codex", "plugin", "list", "--available", "--json"]])
  })

  test("refresh is local reconciliation and reminds the developer to start a new session", async () => {
    const context = await makeContext()
    const runner = new StatefulCodexRunner([plugin("compound-engineering@personal")])
    const output: string[] = []

    expect(
      await runCodexDevCommand("refresh", context.repoRoot, context.env, runner, (line) => output.push(line)),
    ).toBe(0)
    expect(output.join("\n")).toContain("Mode: local")
    expect(output.join("\n")).toContain("Start a new Codex session")
  })
})

describe("Codex developer workflow contracts", () => {
  test("package.json exposes the repository command", async () => {
    const packageJson = JSON.parse(await fs.readFile(path.join(import.meta.dir, "..", "package.json"), "utf8"))
    expect(packageJson.scripts["codex:dev"]).toBe("bun run scripts/codex-dev.ts")
  })

  test("README and agent instructions expose every supported mode", async () => {
    const root = path.join(import.meta.dir, "..")
    const [readme, agents] = await Promise.all([
      fs.readFile(path.join(root, "README.md"), "utf8"),
      fs.readFile(path.join(root, "AGENTS.md"), "utf8"),
    ])
    for (const command of ["local", "refresh", "status", "remote", "remove"]) {
      expect(readme).toContain(`bun run codex:dev -- ${command}`)
    }
    expect(agents).toContain("bun run codex:dev -- local")
    expect(agents).toContain("$CODEX_HOME/skills/compound-engineering-local")
  })

  test("refuses an unrelated symlink at the managed collection path", async () => {
    const root = await makeTempRoot("codex-dev-unrelated-")
    const repo = path.join(root, "repo")
    const unrelated = path.join(root, "someone-elses-skills")
    const home = path.join(root, "home")
    const codexHome = path.join(root, "codex-home")
    await fs.mkdir(repo, { recursive: true })
    await fs.mkdir(unrelated, { recursive: true })
    await fs.mkdir(home, { recursive: true })
    await fs.mkdir(path.join(codexHome, "skills"), { recursive: true })
    await createCeRepo(repo)
    const context = await resolveCodexDevContext(repo, testEnv(home, codexHome), new BunCommandRunner())
    await fs.symlink(unrelated, context.collectionPath, "dir")

    await expect(activateLocalCollection(context)).rejects.toThrow("outside a Compound Engineering checkout")
    expect(await fs.realpath(context.collectionPath)).toBe(await fs.realpath(unrelated))
  })

  test("refuses skill-only mode when the Codex manifest gains another runtime component", async () => {
    const root = await makeTempRoot("codex-dev-runtime-component-")
    const repo = path.join(root, "repo")
    const home = path.join(root, "home")
    const codexHome = path.join(root, "codex-home")
    await fs.mkdir(repo, { recursive: true })
    await fs.mkdir(home, { recursive: true })
    await fs.mkdir(codexHome, { recursive: true })
    await createCeRepo(repo)
    const manifestPath = path.join(repo, ".codex-plugin", "plugin.json")
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
    manifest.mcpServers = { example: { command: "example" } }
    await fs.writeFile(manifestPath, JSON.stringify(manifest))

    await expect(
      resolveCodexDevContext(repo, testEnv(home, codexHome), new BunCommandRunner()),
    ).rejects.toThrow("cannot represent Codex runtime components")
  })

  test("refuses skill-only mode when default plugin hooks exist outside the manifest", async () => {
    const root = await makeTempRoot("codex-dev-default-hooks-")
    const repo = path.join(root, "repo")
    const home = path.join(root, "home")
    const codexHome = path.join(root, "codex-home")
    await fs.mkdir(repo, { recursive: true })
    await fs.mkdir(home, { recursive: true })
    await fs.mkdir(codexHome, { recursive: true })
    await createCeRepo(repo)
    await fs.mkdir(path.join(repo, "hooks"), { recursive: true })
    await fs.writeFile(path.join(repo, "hooks", "hooks.json"), JSON.stringify({ hooks: {} }))

    await expect(
      resolveCodexDevContext(repo, testEnv(home, codexHome), new BunCommandRunner()),
    ).rejects.toThrow("cannot represent default Codex hooks")
  })
})
