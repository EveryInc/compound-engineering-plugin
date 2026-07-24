import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

const repoRoot = path.join(import.meta.dir, "..", "..")
const checkHealthScript = path.join(repoRoot, "skills", "ce-setup", "scripts", "check-health")
const configTemplate = path.join(repoRoot, "skills", "ce-setup", "references", "config-template.yaml")
const configExample = path.join(repoRoot, ".compound-engineering", "config.local.example.yaml")
const configDocs = path.join(repoRoot, "docs", "skills", "configuration.md")
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

  test("documents every setup-template option in the centralized config reference", async () => {
    const [template, docs, setupDocs, catalog, instructions] = await Promise.all([
      readFile(configTemplate, "utf8"),
      readFile(configDocs, "utf8"),
      readFile(path.join(repoRoot, "docs", "skills", "ce-setup.md"), "utf8"),
      readFile(path.join(repoRoot, "docs", "skills", "README.md"), "utf8"),
      readFile(path.join(repoRoot, "AGENTS.md"), "utf8"),
    ])

    const keys = [...template.matchAll(/^# ([A-Za-z][A-Za-z0-9_]*):(?:\s|$)/gm)].map((match) => match[1])
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(docs).toContain(`\`${key}\``)
    }
    expect(docs).toContain("AGENTS.md")
    expect(docs).toContain("CLAUDE.md")
    expect(setupDocs).toContain("./configuration.md")
    expect(catalog).toContain("./configuration.md")
    expect(instructions).toContain("docs/skills/configuration.md")

    for (const consumer of [
      "ce-brainstorm",
      "ce-code-review",
      "ce-commit-push-pr",
      "ce-doc-review",
      "ce-ideate",
      "ce-plan",
      "ce-product-pulse",
      "ce-promote",
      "ce-sweep",
      "ce-work",
      "lfg",
    ]) {
      const consumerDocs = await readFile(path.join(repoRoot, "docs", "skills", `${consumer}.md`), "utf8")
      expect(consumerDocs).toContain("./configuration.md")
    }
  })

  test("does not advertise retired Codex work-delegation settings", async () => {
    const [template, skill] = await Promise.all([
      readFile(configTemplate, "utf8"),
      readFile(path.join(repoRoot, "skills", "ce-setup", "SKILL.md"), "utf8"),
    ])

    expect(template).not.toContain("work_delegate_")
    expect(skill).not.toMatch(/Codex delegation defaults/i)
  })

  test("advertises model-elevation keys and not the retired fable keys", async () => {
    const template = await readFile(configTemplate, "utf8")

    expect(template).toContain("plan_model")
    expect(template).toContain("brainstorm_model")
    expect(template).not.toContain("plan_use_fable")
    expect(template).not.toContain("brainstorm_use_fable")
    expect(template).not.toContain("fable_nudge")
  })

  test("routes retired and malformed dormant engine settings into preference repair", async () => {
    const skill = await readFile(path.join(repoRoot, "skills", "ce-setup", "SKILL.md"), "utf8")
    const step3 = skill.match(/### Step 3:[\s\S]*?(?=### Step 4:)/)?.[0] ?? ""
    const step6a = skill.match(/### Step 6a:[\s\S]*?(?=### Step 7:)/)?.[0] ?? ""

    for (const section of [step3, step6a]) {
      expect(section).toContain("retired scalar routing keys")
      expect(section).toContain("malformed dormant `work_engine_preferences`")
    }
    expect(step6a).toContain("remove any retired scalar routing keys")
    expect(step6a).toContain("remove malformed dormant preferences")
  })

  test("documents the cross-model configuration and lifecycle without overstating worktree isolation", async () => {
    const [ceWork, lfg, readme] = await Promise.all([
      readFile(ceWorkDocs, "utf8"),
      readFile(lfgDocs, "utf8"),
      readFile(path.join(repoRoot, "README.md"), "utf8"),
    ])

    for (const key of ["work_engine_mode", "work_engine_preferences", "harness", "model"]) {
      expect(ceWork).toContain(key)
    }
    expect(ceWork).not.toContain("work_engine_target")
    expect(ceWork).not.toContain("work_engine_model")
    expect(ceWork).toContain("not a security sandbox")
    expect(ceWork).toContain("does not create a temporary worktree for every unit")
    expect(ceWork).toContain("two-hour hard cap")
    expect(ceWork).toContain("resume exactly once")
    expect(ceWork).toContain("reap and ownership-checked cleanup")
    expect(ceWork).toContain("synthetic transport commit")
    expect(lfg).toContain("mode:return-to-caller implementation_engine:<compact-json> <plan-path>")
    expect(lfg).toContain("Neither carrier becomes plan content")
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

  async function repoWithLocalConfig(body: string): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))
    await initGitRepo(root)
    await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
    await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.example.yaml"))
    await writeFile(path.join(root, ".compound-engineering", "config.local.yaml"), body)
    await writeFile(path.join(root, ".gitignore"), ".compound-engineering/*.local.yaml\n")
    return root
  }

  test("warns on an active retired fable key and names its replacement", async () => {
    const root = await repoWithLocalConfig("plan_use_fable: true\n")
    try {
      const result = await runCheckHealth(root, "/usr/bin:/bin")
      expect(result.stdout).toContain("Retired config key 'plan_use_fable'")
      expect(result.stdout).toContain("plan_model")
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

  test("does not warn on a commented retired key", async () => {
    const root = await repoWithLocalConfig("# plan_use_fable: true\n")
    try {
      const result = await runCheckHealth(root, "/usr/bin:/bin")
      expect(result.stdout).not.toContain("Retired config key")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("does not warn when only the new model keys are set", async () => {
    const root = await repoWithLocalConfig("plan_model: fable\nbrainstorm_model: opus\n")
    try {
      const result = await runCheckHealth(root, "/usr/bin:/bin")
      expect(result.stdout).not.toContain("Retired config key")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("does not warn or error when no local config exists", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))
    try {
      await initGitRepo(root)
      await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
      await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.example.yaml"))
      const result = await runCheckHealth(root, "/usr/bin:/bin")
      expect(result.exitCode).toBe(0)
      expect(result.stdout).not.toContain("Retired config key")
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
    ["off", "CE Work implementation engine: native (standing preference is off)"],
    ["prefer", "CE Work implementation engine: prefer -> cursor@composer, codex@gpt-5.6, claude@default"],
    ["require", "CE Work implementation engine: require -> cursor@composer, codex@gpt-5.6, claude@default"],
  ])("resolves active %s mode with ordered harness/model preferences", async (mode, expected) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(
        root,
        `work_engine_mode: ${mode}\nwork_engine_preferences:\n  - harness: cursor\n    model: composer\n  - harness: codex\n    model: "gpt-5.6"\n  - harness: claude\n`,
      )

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(expected)
      if (mode === "off") {
        expect(result.stdout).toContain("ordered preferences ignored while standing mode is off")
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("invalid mode falls through to native and is reported", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, "work_engine_mode: sometimes\nwork_engine_preferences:\n  - harness: codex\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("invalid mode 'sometimes' ignored; native is the default")
      expect(result.stdout).toContain("1 project issue(s) found")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("enabled mode without ordered preferences is unavailable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, "work_engine_mode: prefer\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("CE Work implementation engine unavailable: prefer requires work_engine_preferences")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("diagnoses retired scalar routing keys instead of treating them as preferences", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, "work_engine_mode: prefer\nwork_engine_target: codex\nwork_engine_model: gpt-5.4-mini\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(
        "CE Work implementation engine unavailable: prefer cannot use retired scalar routing; migrate work_engine_target, work_engine_model to work_engine_preferences",
      )
      expect(result.stdout).toContain(
        "retired config key(s) work_engine_target, work_engine_model detected; migrate routing to work_engine_preferences entries with harness and optional model fields, then remove the retired keys",
      )
      expect(result.stdout).not.toContain("prefer requires work_engine_preferences")
      expect(result.stdout).toContain("1 project issue(s) found")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("reports retired scalar keys even when ordered preferences are valid", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(
        root,
        "work_engine_mode: prefer\nwork_engine_target: claude\nwork_engine_preferences:\n  - harness: codex\n",
      )

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("CE Work implementation engine: prefer -> codex@default")
      expect(result.stdout).toContain("retired config key(s) work_engine_target detected")
      expect(result.stdout).toContain("1 project issue(s) found")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test.each(["", "work_engine_mode: off\n"])(
    "surfaces malformed dormant preferences when mode is missing or off (%s)",
    async (modeConfig) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

      try {
        await initConfiguredRepo(root, `${modeConfig}work_engine_preferences:\n  - model: composer\n`)

        const result = await runCheckHealth(root, "/usr/bin:/bin")

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain(
          "invalid dormant work_engine_preferences: model 'composer' has no harness in work_engine_preferences",
        )
        expect(result.stdout).not.toContain("ordered preferences ignored while standing mode is off")
        expect(result.stdout).toContain("1 project issue(s) found")
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  test("enabled mode with an invalid harness is unavailable rather than guessed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, "work_engine_mode: require\nwork_engine_preferences:\n  - harness: mystery-harness\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("invalid harness 'mystery-harness' in work_engine_preferences")
      expect(result.stdout).not.toContain("require -> mystery-harness@default")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects a model entry that is not attached to a harness", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, "work_engine_mode: prefer\nwork_engine_preferences:\n  - model: composer\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("model 'composer' has no harness in work_engine_preferences")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test.each([
    ["zero-indented sequence", "work_engine_preferences:\n- harness: cursor\n  model: custom-1\n- harness: claude\n"],
    ["mapping keys in either order", "work_engine_preferences:\n  - model: custom-1\n    harness: cursor\n  - harness: claude\n"],
  ])("accepts %s", async (_name, preferences) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, `work_engine_mode: prefer\n${preferences}`)
      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("CE Work implementation engine: prefer -> cursor@custom-1, claude@default")
      expect(result.stdout).not.toContain("project issue(s) found")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test.each(["model@beta", "$(touch)", "-model-flag"])('rejects adapter-unsafe model token "%s"', async (model) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, `work_engine_mode: prefer\nwork_engine_preferences:\n  - harness: cursor\n    model: '${model}'\n`)
      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(`invalid model '${model}' in work_engine_preferences`)
      expect(result.stdout).not.toContain(`prefer -> cursor@${model}`)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("ce-setup check-health docs_root resolution", () => {
  async function repoWithConfigs(
    files: { local?: string; tracked?: string; extra?: (root: string) => Promise<void> },
  ): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-docsroot-"))
    await initGitRepo(root)
    await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
    if (files.local !== undefined) {
      await writeFile(path.join(root, ".compound-engineering", "config.local.yaml"), files.local)
      await writeFile(path.join(root, ".gitignore"), ".compound-engineering/*.local.yaml\n")
    }
    if (files.tracked !== undefined) {
      await writeFile(path.join(root, ".compound-engineering", "config.yaml"), files.tracked)
    }
    if (files.extra) await files.extra(root)
    return root
  }

  async function run(files: Parameters<typeof repoWithConfigs>[0]): Promise<RunResult> {
    const root = await repoWithConfigs(files)
    try {
      return await runCheckHealth(root, "/usr/bin:/bin")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  test("reports the default root when docs_root is unset (AE1)", async () => {
    const result = await run({ local: "# nothing set\n" })
    expect(result.stdout).toContain("Artifact root: docs/ (default")
  })

  test("reads docs_root from the tracked config.yaml layer", async () => {
    const result = await run({ tracked: "docs_root: .ce-artifacts\n" })
    expect(result.stdout).toContain("Artifact root: .ce-artifacts/ (from config.yaml)")
  })

  test("config.local.yaml overrides the tracked layer", async () => {
    const result = await run({ local: "docs_root: from-local\n", tracked: "docs_root: from-tracked\n" })
    expect(result.stdout).toContain("Artifact root: from-local/ (from config.local.yaml)")
    expect(result.stdout).not.toContain("from-tracked")
  })

  test("rejects an absolute value without defaulting (fail-closed)", async () => {
    const result = await run({ local: "docs_root: /etc\n" })
    expect(result.stdout).toContain("Invalid docs_root '/etc'")
    expect(result.stdout).toContain("absolute paths are not allowed")
    expect(result.stdout).toContain("project issue(s) found")
  })

  test("rejects a value that escapes the repository (AE3)", async () => {
    // `../outside` is caught by the up-front `..` traversal reject (a stricter,
    // earlier gate than the containment check); either way it fails closed.
    const result = await run({ local: "docs_root: ../outside\n" })
    expect(result.stdout).toContain("Invalid docs_root '../outside'")
    expect(result.stdout).toContain("path traversal ('..') is not allowed")
    expect(result.stdout).not.toContain("Artifact root:")
  })

  test("rejects `..` traversal through a non-existing segment (escape / repo-root / .git bypass)", async () => {
    // A `..` that traverses a not-yet-created path segment is NOT collapsed by
    // the existing-prefix symlink resolution, so without an explicit reject it
    // would escape the repo, hit the repo root, or reach .git/ while still
    // string-prefix matching the containment check. All must fail closed.
    for (const value of ["notexist/../../etc", "notexist/..", "notexist/../.git", "a/b/../c"]) {
      const result = await run({ local: `docs_root: ${value}\n` })
      expect(result.stdout, `${value} must be rejected`).toContain("path traversal ('..') is not allowed")
      expect(result.stdout, `${value} must not resolve`).not.toContain("Artifact root:")
    }
  })

  test("accepts a legitimate multi-segment repo-relative root", async () => {
    const result = await run({ local: "docs_root: .compound-engineering/artifacts\n" })
    expect(result.stdout).toContain("Artifact root: .compound-engineering/artifacts/")
    expect(result.stdout).not.toContain("Invalid docs_root")
  })

  test("rejects the repository root itself", async () => {
    const result = await run({ local: "docs_root: .\n" })
    expect(result.stdout).toContain("resolves to the repository root itself")
  })

  test("rejects a path inside .git/", async () => {
    const result = await run({ local: "docs_root: .git/foo\n" })
    expect(result.stdout).toContain("resolves inside .git/")
  })

  test("rejects an existing non-directory", async () => {
    const result = await run({
      local: "docs_root: afile\n",
      extra: async (root) => writeFile(path.join(root, "afile"), "x"),
    })
    expect(result.stdout).toContain("names an existing non-directory")
  })

  test("rejects a symlink whose real path escapes the repository", async () => {
    const result = await run({
      local: "docs_root: esclink/x\n",
      extra: async (root) => {
        await Bun.$`ln -s /tmp esclink`.cwd(root).quiet()
      },
    })
    expect(result.stdout).toContain("Invalid docs_root")
    expect(result.stdout).toContain("outside the repository")
  })

  test("rejects a docs_root whose intermediate component is an existing file", async () => {
    // `afile/nested` where `afile` is a file: the leaf-only non-directory check
    // passes (nested doesn't exist), but mkdir -p would fail, so /ce-setup must
    // not report it healthy.
    const result = await run({
      local: "docs_root: afile/nested\n",
      extra: async (root) => writeFile(path.join(root, "afile"), "x"),
    })
    expect(result.stdout).toContain("an intermediate path component is not a directory")
    expect(result.stdout).not.toContain("Artifact root:")
  })

  test("accepts a valid repo-relative root that does not yet exist (AE4)", async () => {
    const result = await run({ local: "docs_root: .ce-artifacts/nested\n" })
    expect(result.stdout).toContain("Artifact root: .ce-artifacts/nested/ (from config.local.yaml)")
    expect(result.stdout).not.toContain("Invalid docs_root")
  })
})
