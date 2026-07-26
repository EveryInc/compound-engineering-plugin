import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "fs/promises"
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

function testConfigPaths(root: string): { home: string; xdg: string; global: string } {
  const home = path.join(root, ".ce-setup-test-home")
  const xdg = path.join(root, ".ce-setup-test-xdg")
  return { home, xdg, global: path.join(xdg, "compound-engineering") }
}

async function writeGlobalConfig(root: string, body: string): Promise<string> {
  const configDir = testConfigPaths(root).global
  const configPath = path.join(configDir, "config.yaml")
  await mkdir(configDir, { recursive: true, mode: 0o700 })
  await writeFile(configPath, body, { mode: 0o600 })
  return configPath
}

async function runCheckHealth(cwd: string, pathValue: string): Promise<RunResult> {
  const configPaths = testConfigPaths(cwd)
  const proc = Bun.spawn(["bash", checkHealthScript], {
    cwd,
    env: {
      HOME: configPaths.home,
      LANG: "C.UTF-8",
      PATH: pathValue,
      XDG_CONFIG_HOME: configPaths.xdg,
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

  test("routes repairable engine settings through scoped compare-and-swap writes", async () => {
    const skill = await readFile(path.join(repoRoot, "skills", "ce-setup", "SKILL.md"), "utf8")
    const step3 = skill.match(/### Step 3:[\s\S]*?(?=### Step 4:)/)?.[0] ?? ""
    const step6a = skill.match(/### Step 6a:[\s\S]*?(?=### Step 7:)/)?.[0] ?? ""

    for (const section of [step3, step6a]) {
      expect(section).toContain("retired scalar routing keys")
    }
    expect(step3).toContain("malformed dormant `work_engine_preferences`")
    expect(step6a).toContain("patch_source")
    expect(step6a).toContain("do not guess")
    expect(step6a).toContain("make no automatic repair")
  })

  test("keeps project as the default writer and gates global compare-and-swap writes", async () => {
    const skill = await readFile(path.join(repoRoot, "skills", "ce-setup", "SKILL.md"), "utf8")

    expect(skill).toContain("The project layer is the default writer target")
    expect(skill).toMatch(/global layer only when the user explicitly asks/i)
    expect(skill).toContain("patch_source")
    expect(skill).toContain("sources.project.revision")
    expect(skill).toContain("sources.global.revision")
    expect(skill).toContain("expected_revision")
    expect(skill).toMatch(/writer[^\n]*ce-setup/)
    expect(skill).toContain("WRITE_CONFLICT")
    expect(skill).toMatch(/Never copy inherited `settings\.effective` values/)
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

  test("reports global-only effective settings without creating a local file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initGitRepo(root)
      await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
      await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.example.yaml"))
      const globalPath = await writeGlobalConfig(root, "plan_output: html\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(`Global source: ${globalPath} (present)`)
      expect(result.stdout).toContain("Project source:")
      expect(result.stdout).toContain("config.local.yaml (absent)")
      expect(result.stdout).toMatch(/revision=cecfg-v1:[0-9a-f]{64}; trusted=yes; authority_trusted=yes/)
      expect(result.stdout).toMatch(/plan_output = "html" \[source=global; revision=cecfg-v1:[0-9a-f]{64}; authority_trusted=yes\]/)
      expect(result.stdout).not.toContain(path.join(os.homedir(), ".config", "compound-engineering"))
      expect(await Bun.file(path.join(root, ".compound-engineering", "config.local.yaml")).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("preserves global values under a sparse project override", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await writeGlobalConfig(root, "plan_output: html\nbrainstorm_output: html\n")
      await initConfiguredRepo(root, "plan_output: md\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/plan_output = "md" \[source=project;/)
      expect(result.stdout).toMatch(/brainstorm_output = "html" \[source=global;/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("reports an explicit project null as a clearing override", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await writeGlobalConfig(root, "pulse_product_name: Spiral\n")
      await initConfiguredRepo(root, "pulse_product_name: null\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/pulse_product_name = null \[source=project;/)
      expect(result.stdout).not.toContain("pulse_product_name = \"Spiral\"")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test.each([
    ["Global", "global"],
    ["Project", "project"],
  ])("surfaces malformed %s configuration without partial settings", async (scope, malformedLayer) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      if (malformedLayer === "global") {
        await initGitRepo(root)
        await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
        await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.example.yaml"))
        await writeGlobalConfig(root, "plan_output: md\nplan_output: html\n")
      } else {
        await writeGlobalConfig(root, "brainstorm_output: html\n")
        await initConfiguredRepo(root, "plan_output: md\nplan_output: html\n")
      }

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(`${scope} CE configuration inspection failed [YAML_DUPLICATE_KEY]`)
      expect(result.stdout).toContain("No effective settings were reported")
      expect(result.stdout).not.toContain("settings.effective:")
      expect(result.stdout).not.toContain("Traceback")
      expect(result.stderr).not.toContain("Traceback")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("surfaces an unsafe project source with resolver provenance", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initGitRepo(root)
      await mkdir(path.join(root, ".compound-engineering"), { recursive: true })
      await copyFile(configTemplate, path.join(root, ".compound-engineering", "config.local.example.yaml"))
      await writeFile(path.join(root, ".gitignore"), ".compound-engineering/*.local.yaml\n")
      const target = path.join(root, "unsafe-config.yaml")
      await writeFile(target, "plan_output: html\n")
      await symlink(target, path.join(root, ".compound-engineering", "config.local.yaml"))

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Project CE configuration inspection failed [CONFIG_UNSAFE]")
      expect(result.stdout).toContain("reason=symlink")
      expect(result.stdout).not.toContain("settings.effective:")
      expect(result.stderr).not.toContain("Traceback")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("inspects global settings outside a repository", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      const globalPath = await writeGlobalConfig(root, "plan_output: html\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(`Global source: ${globalPath} (present)`)
      expect(result.stdout).toContain("Project source: not applicable outside a Git repository")
      expect(result.stdout).toMatch(/plan_output = "html" \[source=global;/)
      expect(result.stdout).toContain("Not inside a git repository")
      expect(result.stdout).toContain("CE settings healthy")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("reports trusted global authority from the effective view", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await writeGlobalConfig(
        root,
        "feedback_sources:\n  - { type: slack, id: slack-alpha, target: C0123, approved: true }\n",
      )

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('"approved":true')
      expect(result.stdout).toMatch(/feedback_sources = .*\[source=global; revision=cecfg-v1:[0-9a-f]{64}; authority_trusted=yes\]/)
      expect(result.stdout).toContain("effective authority: feedback_sources=approved")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("reports effective routing counts and normalized global CE Work state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await writeGlobalConfig(
        root,
        `work_engine_mode: prefer
work_engine_preferences:
  - { harness: codex, model: gpt-5-mini }
routing:
  profiles:
    economy:
      candidates:
        - { harness: codex, model: gpt-5-mini }
  classes:
    implementation: { profile: economy, policy: prefer }
  roles:
    ce-code-review.security-reviewer: { profile: economy, policy: require }
`,
      )

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Effective routing: 1 profile(s), 1 class binding(s), 1 role binding(s)")
      expect(result.stdout).toMatch(/Dispatch role coverage: [1-9][0-9]* registered, 0 unclassified/)
      expect(result.stdout).toContain("CE Work implementation engine: prefer -> codex@gpt-5-mini")
      expect(result.stdout).toMatch(/work_engine_mode = "prefer" \[source=global;/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("does not require jq for effective settings inspection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await writeGlobalConfig(root, "plan_output: html\n")
      const bin = path.join(root, "bin")
      await mkdir(bin)
      for (const tool of ["bash", "git", "python3"]) {
        const executable = Bun.which(tool)
        if (!executable) throw new Error(`${tool} is required for this test`)
        await symlink(executable, path.join(bin, tool))
      }

      const result = await runCheckHealth(root, bin)

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/plan_output = "html" \[source=global;/)
      expect(result.stdout).toContain("jq -- unavailable")
      expect(result.stderr).toBe("")
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

  test("invalid mode fails closed without guessing native state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ce-setup-health-"))

    try {
      await initConfiguredRepo(root, "work_engine_mode: sometimes\nwork_engine_preferences:\n  - harness: codex\n")

      const result = await runCheckHealth(root, "/usr/bin:/bin")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Project CE configuration inspection failed [SETTING_INVALID]")
      expect(result.stdout).toContain("invalid value for work_engine_mode")
      expect(result.stdout).toContain("setting=work_engine_mode")
      expect(result.stdout).not.toContain("CE Work implementation engine:")
      expect(result.stdout).not.toContain("Traceback")
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
      expect(result.stdout).toContain("1 CE settings issue(s) found")
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
      expect(result.stdout).toContain("1 CE settings issue(s) found")
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
        expect(result.stdout).toContain("Project CE configuration inspection failed [SETTING_INVALID]")
        expect(result.stdout).toContain("work_engine_preferences entry is missing 'harness'")
        expect(result.stdout).toContain("setting=work_engine_preferences")
        expect(result.stdout).not.toContain("ordered preferences ignored while standing mode is off")
        expect(result.stdout).not.toContain("CE Work implementation engine:")
        expect(result.stdout).not.toContain("Traceback")
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
      expect(result.stdout).toContain("invalid value for work_engine_preferences.harness")
      expect(result.stdout).toContain("setting=work_engine_preferences.harness")
      expect(result.stdout).not.toContain("require -> mystery-harness@default")
      expect(result.stdout).not.toContain("Traceback")
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
      expect(result.stdout).toContain("work_engine_preferences entry is missing 'harness'")
      expect(result.stdout).toContain("setting=work_engine_preferences")
      expect(result.stdout).not.toContain("CE Work implementation engine:")
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
      expect(result.stdout).toContain("invalid work_engine_preferences.model")
      expect(result.stdout).toContain("setting=work_engine_preferences.model")
      expect(result.stdout).not.toContain(`prefer -> cursor@${model}`)
      expect(result.stdout).not.toContain("Traceback")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
