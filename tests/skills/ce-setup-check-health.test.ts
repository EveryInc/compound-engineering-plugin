import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..", "..")
const checkHealthScript = path.join(repoRoot, "skills", "ce-setup", "scripts", "check-health")
const configTemplate = path.join(repoRoot, "skills", "ce-setup", "references", "config-template.yaml")
const configExample = path.join(repoRoot, ".compound-engineering", "config.local.example.yaml")
const ceWorkDocs = path.join(repoRoot, "docs", "skills", "ce-work.md")
const lfgDocs = path.join(repoRoot, "docs", "skills", "lfg.md")

type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

async function runCheckHealth(cwd: string, pathValue: string): Promise<RunResult> {
  const proc = Bun.spawn(["bash", checkHealthScript], {
    cwd,
    env: {
      ...process.env,
      HOME: cwd,
      PATH: pathValue,
    },
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

async function initGitRepo(root: string): Promise<void> {
  await Bun.$`git init`.cwd(root).quiet()
}

async function initConfiguredRepo(root: string, localConfig: string): Promise<void> {
  await initGitRepo(root)
  await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
  await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.example.yaml"))
  await writeFile(path.join(root, ".compound-engineering", "config.local.yaml"), localConfig)
  await writeFile(path.join(root, ".gitignore"), ".compound-engineering/*.local.yaml\n")
}

describe("ce-setup check-health", () => {
  test("keeps the committed example identical to the bundled template", async () => {
    const [template, example] = await Promise.all([
      readFile(configTemplate, "utf8"),
      readFile(configExample, "utf8"),
    ])

    expect(example).toBe(template)
  })

  test("does not advertise retired Codex work-delegation settings", async () => {
    const [template, skill] = await Promise.all([
      readFile(configTemplate, "utf8"),
      readFile(path.join(repoRoot, "skills", "ce-setup", "SKILL.md"), "utf8"),
    ])

    expect(template).not.toContain("work_delegate_")
    expect(skill).not.toMatch(/Codex delegation defaults/i)
  })

  test("documents the cross-model configuration and lifecycle without overstating worktree isolation", async () => {
    const [ceWork, lfg, readme] = await Promise.all([
      readFile(ceWorkDocs, "utf8"),
      readFile(lfgDocs, "utf8"),
      readFile(path.join(repoRoot, "README.md"), "utf8"),
    ])

    for (const key of ["work_engine_mode", "work_engine_target", "work_engine_model"]) {
      expect(ceWork).toContain(key)
    }
    expect(ceWork).toContain("not a security sandbox")
    expect(ceWork).toContain("does not create a temporary worktree for every unit")
    expect(ceWork).toContain("two-hour hard cap")
    expect(ceWork).toContain("resume exactly once")
    expect(ceWork).toContain("reap and ownership-checked cleanup")
    expect(ceWork).toContain("synthetic transport commit")
    expect(lfg).toContain("mode:return-to-caller implementation_engine:<compact-json> <plan-path>")
    expect(lfg).toContain("The object never becomes plan content")
    expect(readme).toContain("qualified cross-model author")
    expect(ceWork).not.toMatch(/every (implementation )?unit (gets|uses|runs in) (a )?(detached )?worktree/i)
  })

  test("reports missing optional tools without treating them as setup failures", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Optional capabilities")
      expect(result.stdout).toContain("Missing optional tools do not block setup")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("reports a healthy repo config when local config is gitignored and example is current", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initGitRepo(root)
      await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
      await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.example.yaml"))
      await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.yaml"))
      await writeFile(path.join(root, ".gitignore"), ".compound-engineering/*.local.yaml\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Project config")
      expect(result.stdout).toContain("Local config is gitignored")
      expect(result.stdout).toContain("Project config healthy")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("reports unignored local config as a project issue", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initGitRepo(root)
      await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
      await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.example.yaml"))
      await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.yaml"))

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Local config is not safely gitignored")
      expect(result.stdout).toContain("1 project issue(s) found")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("commented or missing work-engine keys preserve native execution", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, await readFile(configTemplate, "utf8"))

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("CE Work implementation engine: native (setting is commented or missing)")
      expect(result.stdout).not.toContain("prefer ->")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("missing local config preserves native execution", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initGitRepo(root)
      await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
      await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.example.yaml"))

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("CE Work implementation engine: native (no local config)")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test.each([
    ["off", "codex", "CE Work implementation engine: native (standing preference is off)"],
    ["prefer", "codex", "CE Work implementation engine: prefer -> codex"],
    ["require", "composer", "CE Work implementation engine: require -> composer"],
  ])("resolves active %s mode with target %s", async (mode, target, expected) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(
        root,
        `work_engine_mode: ${mode}\nwork_engine_target: ${target}\nwork_engine_model: "pinned-model"\n`,
      )

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(expected)
      if (mode === "off") {
        expect(result.stdout).toContain("target/model ignored while standing mode is off")
      } else {
        expect(result.stdout).toContain("model pin: pinned-model")
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("invalid mode falls through to native and is reported", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, "work_engine_mode: sometimes\nwork_engine_target: codex\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("invalid mode 'sometimes' ignored; native is the default")
      expect(result.stdout).toContain("1 project issue(s) found")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("enabled mode without a target is unavailable and ignores a model pin", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, "work_engine_mode: prefer\nwork_engine_model: composer-2.5\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("CE Work implementation engine unavailable: prefer requires work_engine_target")
      expect(result.stdout).toContain("model 'composer-2.5' ignored without a target")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("enabled mode with an invalid target is unavailable rather than guessed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, "work_engine_mode: require\nwork_engine_target: mystery-harness\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("invalid target 'mystery-harness' for require")
      expect(result.stdout).not.toContain("require -> mystery-harness")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
