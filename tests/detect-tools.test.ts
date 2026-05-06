import { afterEach, describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { detectInstalledTools, getDetectedTargetNames } from "../src/utils/detect-tools"

describe("detectInstalledTools", () => {
  test("detects tools when config directories exist", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-tools-"))
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-tools-cwd-"))

    // Create directories for some tools
    await fs.mkdir(path.join(tempHome, ".codex"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".gemini"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".copilot"), { recursive: true })

    const results = await detectInstalledTools(tempHome, tempCwd)

    const codex = results.find((t) => t.name === "codex")
    expect(codex?.detected).toBe(true)
    expect(codex?.reason).toContain(".codex")

    const gemini = results.find((t) => t.name === "gemini")
    expect(gemini?.detected).toBe(true)
    expect(gemini?.reason).toContain(".gemini")

    const copilot = results.find((t) => t.name === "copilot")
    expect(copilot?.detected).toBe(true)
    expect(copilot?.reason).toContain(".copilot")

    // Tools without directories should not be detected
    const opencode = results.find((t) => t.name === "opencode")
    expect(opencode?.detected).toBe(false)

    const droid = results.find((t) => t.name === "droid")
    expect(droid?.detected).toBe(false)

    const pi = results.find((t) => t.name === "pi")
    expect(pi?.detected).toBe(false)
  })

  test("returns all tools with detected=false when no directories exist", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-empty-"))
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-empty-cwd-"))

    const results = await detectInstalledTools(tempHome, tempCwd)

    expect(results.length).toBe(8)
    for (const tool of results) {
      expect(tool.detected).toBe(false)
      expect(tool.reason).toBe("not found")
    }
  })

  test("detects home-based tools", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-home-"))
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-home-cwd-"))

    await fs.mkdir(path.join(tempHome, ".config", "opencode"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".factory"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".pi"), { recursive: true })

    const results = await detectInstalledTools(tempHome, tempCwd)

    expect(results.find((t) => t.name === "opencode")?.detected).toBe(true)
    expect(results.find((t) => t.name === "droid")?.detected).toBe(true)
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
      const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-env-cwd-"))
      const customRoot = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-env-root-"))

      // Ensure no ~/.config/opencode exists under the sandbox home.
      process.env.OPENCODE_CONFIG_DIR = customRoot

      const results = await detectInstalledTools(tempHome, tempCwd)
      const opencode = results.find((t) => t.name === "opencode")
      expect(opencode?.detected).toBe(true)
      expect(opencode?.reason).toContain(customRoot)
    })

    test("opencode is not detected when OPENCODE_CONFIG_DIR points at a missing directory", async () => {
      const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-missing-home-"))
      const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-missing-cwd-"))
      const missingRoot = path.join(os.tmpdir(), `detect-opencode-missing-${Date.now()}-${Math.random()}`)

      process.env.OPENCODE_CONFIG_DIR = missingRoot

      const results = await detectInstalledTools(tempHome, tempCwd)
      expect(results.find((t) => t.name === "opencode")?.detected).toBe(false)
    })
  })

  test("detects copilot from project-specific skills without generic .github false positives", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-copilot-home-"))
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-copilot-cwd-"))

    await fs.mkdir(path.join(tempCwd, ".github"), { recursive: true })

    let results = await detectInstalledTools(tempHome, tempCwd)
    expect(results.find((t) => t.name === "copilot")?.detected).toBe(false)

    await fs.mkdir(path.join(tempCwd, ".github", "skills"), { recursive: true })

    results = await detectInstalledTools(tempHome, tempCwd)
    expect(results.find((t) => t.name === "copilot")?.detected).toBe(true)
    expect(results.find((t) => t.name === "copilot")?.reason).toContain(".github/skills")
  })
})

describe("getDetectedTargetNames", () => {
  test("returns only names of detected tools", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-names-"))
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-names-cwd-"))

    await fs.mkdir(path.join(tempHome, ".codex"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".gemini"), { recursive: true })

    const names = await getDetectedTargetNames(tempHome, tempCwd)

    expect(names).toContain("codex")
    expect(names).toContain("gemini")
    expect(names).not.toContain("opencode")
    expect(names).not.toContain("droid")
    expect(names).not.toContain("pi")
    expect(names).not.toContain("cursor")
  })

  test("returns empty array when nothing detected", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-none-"))
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-none-cwd-"))

    const names = await getDetectedTargetNames(tempHome, tempCwd)
    expect(names).toEqual([])
  })
})
