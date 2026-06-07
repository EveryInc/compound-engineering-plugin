import { afterEach, describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { detectInstalledTools, getDetectedTargetNames } from "../src/utils/detect-tools"

const __tempRoots: string[] = []

afterEach(async () => {
  for (const dir of __tempRoots.splice(0, __tempRoots.length)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

describe("detectInstalledTools", () => {
  test("detects tools when config directories exist", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-tools-"))
    __tempRoots.push(tempHome)
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-tools-cwd-"))
    __tempRoots.push(tempCwd)

    // Create directories for some tools
    await fs.mkdir(path.join(tempHome, ".codex"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".gemini"), { recursive: true })

    const results = await detectInstalledTools(tempHome, tempCwd)

    const codex = results.find((t) => t.name === "codex")
    expect(codex?.detected).toBe(true)
    expect(codex?.reason).toContain(".codex")

    const gemini = results.find((t) => t.name === "gemini")
    expect(gemini?.detected).toBe(true)
    expect(gemini?.reason).toContain(".gemini")

    // Tools without directories should not be detected
    const opencode = results.find((t) => t.name === "opencode")
    expect(opencode?.detected).toBe(false)

    const pi = results.find((t) => t.name === "pi")
    expect(pi?.detected).toBe(false)
  })

  test("returns all tools with detected=false when no directories exist", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-empty-"))
    __tempRoots.push(tempHome)
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-empty-cwd-"))
    __tempRoots.push(tempCwd)

    const results = await detectInstalledTools(tempHome, tempCwd)

    expect(results.length).toBe(6)
    for (const tool of results) {
      expect(tool.detected).toBe(false)
      expect(tool.reason).toBe("not found")
    }
  })

  test("detects home-based tools", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-home-"))
    __tempRoots.push(tempHome)
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-home-cwd-"))
    __tempRoots.push(tempCwd)

    await fs.mkdir(path.join(tempHome, ".config", "opencode"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".pi"), { recursive: true })

    const results = await detectInstalledTools(tempHome, tempCwd)

    expect(results.find((t) => t.name === "opencode")?.detected).toBe(true)
    expect(results.find((t) => t.name === "pi")?.detected).toBe(true)
  })

  describe("opencode OPENCODE_CONFIG_DIR", () => {
    const originalEnv = process.env.OPENCODE_CONFIG_DIR

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.OPENCODE_CONFIG_DIR
      } else {
        process.env.OPENCODE_CONFIG_DIR = originalEnv
      }
    })

    test("detects opencode at OPENCODE_CONFIG_DIR when set, even if ~/.config/opencode is absent", async () => {
      const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-env-home-"))
      __tempRoots.push(tempHome)
      const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-env-cwd-"))
      __tempRoots.push(tempCwd)
      const customRoot = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-env-root-"))
      __tempRoots.push(customRoot)

      // Ensure no ~/.config/opencode exists under the sandbox home.
      process.env.OPENCODE_CONFIG_DIR = customRoot

      const results = await detectInstalledTools(tempHome, tempCwd)
      const opencode = results.find((t) => t.name === "opencode")
      expect(opencode?.detected).toBe(true)
      expect(opencode?.reason).toContain(customRoot)
    })

    test("opencode is not detected when OPENCODE_CONFIG_DIR points at a missing directory", async () => {
      const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-missing-home-"))
      __tempRoots.push(tempHome)
      const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-missing-cwd-"))
      __tempRoots.push(tempCwd)
      const missingRoot = path.join(os.tmpdir(), `detect-opencode-missing-${Date.now()}-${Math.random()}`)

      process.env.OPENCODE_CONFIG_DIR = missingRoot

      const results = await detectInstalledTools(tempHome, tempCwd)
      expect(results.find((t) => t.name === "opencode")?.detected).toBe(false)
    })
  })

  describe("codex CODEX_HOME", () => {
    const originalEnv = process.env.CODEX_HOME

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = originalEnv
      }
    })

    test("detects codex at CODEX_HOME for default real-user detection", async () => {
      const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-codex-env-cwd-"))
      __tempRoots.push(tempCwd)
      const customRoot = await fs.mkdtemp(path.join(os.tmpdir(), "detect-codex-env-root-"))
      __tempRoots.push(customRoot)

      process.env.CODEX_HOME = customRoot

      const results = await detectInstalledTools(undefined, tempCwd)
      const codex = results.find((t) => t.name === "codex")
      expect(codex?.detected).toBe(true)
      expect(codex?.reason).toContain(customRoot)
    })

    test("ignores ambient CODEX_HOME when caller provides an explicit home", async () => {
      const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-codex-explicit-home-"))
      __tempRoots.push(tempHome)
      const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-codex-explicit-cwd-"))
      __tempRoots.push(tempCwd)
      const customRoot = await fs.mkdtemp(path.join(os.tmpdir(), "detect-codex-explicit-root-"))
      __tempRoots.push(customRoot)

      process.env.CODEX_HOME = customRoot

      const results = await detectInstalledTools(tempHome, tempCwd)
      const codex = results.find((t) => t.name === "codex")
      expect(codex?.detected).toBe(false)
      expect(codex?.reason).toBe("not found")
    })
  })

})

describe("getDetectedTargetNames", () => {
  test("returns only names of detected tools", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-names-"))
    __tempRoots.push(tempHome)
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-names-cwd-"))
    __tempRoots.push(tempCwd)

    await fs.mkdir(path.join(tempHome, ".codex"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".gemini"), { recursive: true })

    const names = await getDetectedTargetNames(tempHome, tempCwd)

    expect(names).toContain("codex")
    expect(names).toContain("gemini")
    expect(names).not.toContain("opencode")
    expect(names).not.toContain("pi")
    expect(names).not.toContain("cursor")
  })

  test("returns empty array when nothing detected", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-none-"))
    __tempRoots.push(tempHome)
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-none-cwd-"))
    __tempRoots.push(tempCwd)

    const names = await getDetectedTargetNames(tempHome, tempCwd)
    expect(names).toEqual([])
  })
})
