import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"

const installScript = path.join(
  import.meta.dir,
  "..",
  ".zeroclaw",
  "scripts",
  "install-skills.sh",
)

const sampleSkill = "ce-brainstorm"
const defaultDerivedSkills = (root: string) =>
  path.join(root, "agents", "default", "workspace", "skills", sampleSkill)

type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

async function runInstall(
  env: Record<string, string | undefined>,
  args: string[] = ["--global"],
): Promise<RunResult> {
  const proc = Bun.spawn(["bash", installScript, ...args], {
    cwd: path.join(import.meta.dir, ".."),
    env: { ...process.env, ...env },
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("zeroclaw install-skills.sh", () => {
  test("honors ZEROCLAW_DATA_DIR when config.toml lives at the data root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "zc-data-root-"))
    const dataRoot = path.join(root, "profile")
    await fs.mkdir(path.join(dataRoot, "agents", "default"), { recursive: true })
    await fs.writeFile(
      path.join(dataRoot, "config.toml"),
      "[agents.default]\n",
    )

    const result = await runInstall({
      ZEROCLAW_INSTALL_ROOT: undefined,
      ZEROCLAW_CONFIG_DIR: undefined,
      ZEROCLAW_DATA_DIR: dataRoot,
      ZEROCLAW_WORKSPACE: undefined,
    })

    expect(result.exitCode).toBe(0)
    expect(await pathExists(path.join(dataRoot, "agents", "default", "workspace", "skills", sampleSkill))).toBe(
      true,
    )
    expect(await pathExists(defaultDerivedSkills(root))).toBe(false)
  })

  test("honors ZEROCLAW_DATA_DIR when config.toml lives under parent .zeroclaw", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "zc-data-nested-"))
    const installRoot = path.join(root, "project", ".zeroclaw")
    const dataDir = path.join(root, "project", "data")
    await fs.mkdir(path.join(installRoot, "agents", "default"), { recursive: true })
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(path.join(installRoot, "config.toml"), "[agents.default]\n")

    const result = await runInstall({
      ZEROCLAW_INSTALL_ROOT: undefined,
      ZEROCLAW_CONFIG_DIR: undefined,
      ZEROCLAW_DATA_DIR: dataDir,
      ZEROCLAW_WORKSPACE: undefined,
    })

    expect(result.exitCode).toBe(0)
    expect(
      await pathExists(path.join(installRoot, "agents", "default", "workspace", "skills", sampleSkill)),
    ).toBe(true)
  })

  test("prefers ZEROCLAW_CONFIG_DIR over ZEROCLAW_DATA_DIR", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "zc-config-wins-"))
    const configRoot = path.join(root, "config-profile")
    const dataRoot = path.join(root, "data-profile")
    await fs.mkdir(path.join(configRoot, "agents", "default"), { recursive: true })
    await fs.mkdir(path.join(dataRoot, "agents", "default"), { recursive: true })
    await fs.writeFile(path.join(configRoot, "config.toml"), "[agents.default]\n")
    await fs.writeFile(path.join(dataRoot, "config.toml"), "[agents.default]\n")

    const result = await runInstall({
      ZEROCLAW_CONFIG_DIR: configRoot,
      ZEROCLAW_DATA_DIR: dataRoot,
      ZEROCLAW_INSTALL_ROOT: undefined,
      ZEROCLAW_WORKSPACE: undefined,
    })

    expect(result.exitCode).toBe(0)
    expect(
      await pathExists(path.join(configRoot, "agents", "default", "workspace", "skills", sampleSkill)),
    ).toBe(true)
    expect(
      await pathExists(path.join(dataRoot, "agents", "default", "workspace", "skills", sampleSkill)),
    ).toBe(false)
  })

  test("installs into [agents.<alias>.workspace.path] when configured", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "zc-custom-workspace-"))
    const installRoot = path.join(root, "install")
    const customWorkspace = path.join(root, "custom-workspace")
    await fs.mkdir(path.join(installRoot, "agents", "default"), { recursive: true })
    await fs.writeFile(
      path.join(installRoot, "config.toml"),
      `[agents.default]\n\n[agents.default.workspace]\npath = "${customWorkspace}"\n`,
    )

    const result = await runInstall({
      ZEROCLAW_INSTALL_ROOT: installRoot,
      ZEROCLAW_CONFIG_DIR: undefined,
      ZEROCLAW_DATA_DIR: undefined,
      ZEROCLAW_WORKSPACE: undefined,
    })

    expect(result.exitCode).toBe(0)
    expect(await pathExists(path.join(customWorkspace, "skills", sampleSkill))).toBe(true)
    expect(await pathExists(defaultDerivedSkills(installRoot))).toBe(false)
    expect(result.stdout).toContain(customWorkspace)
  })
})
