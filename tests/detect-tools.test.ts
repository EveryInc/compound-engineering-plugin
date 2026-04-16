import { describe, expect, test, beforeEach, afterEach } from "bun:test"
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
    await fs.mkdir(path.join(tempHome, ".codeium", "windsurf"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".gemini"), { recursive: true })
    await fs.mkdir(path.join(tempHome, ".copilot"), { recursive: true })

    const results = await detectInstalledTools(tempHome, tempCwd)

    const codex = results.find((t) => t.name === "codex")
    expect(codex?.detected).toBe(true)
    expect(codex?.reason).toContain(".codex")

    const windsurf = results.find((t) => t.name === "windsurf")
    expect(windsurf?.detected).toBe(true)
    expect(windsurf?.reason).toContain(".codeium/windsurf")

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

    expect(results.length).toBe(10)
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
    await fs.mkdir(path.join(tempHome, ".openclaw"), { recursive: true })

    const results = await detectInstalledTools(tempHome, tempCwd)

    expect(results.find((t) => t.name === "opencode")?.detected).toBe(true)
    expect(results.find((t) => t.name === "droid")?.detected).toBe(true)
    expect(results.find((t) => t.name === "pi")?.detected).toBe(true)
    expect(results.find((t) => t.name === "openclaw")?.detected).toBe(true)
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

  test("detects opencode via OPENCODE_CONFIG_DIR env var", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-env-home-"))
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-env-cwd-"))
    const customConfigDir = path.join(tempHome, "custom-opencode-config")

    // Create dir at the custom path only — NOT at ~/.config/opencode
    await fs.mkdir(customConfigDir, { recursive: true })

    const savedEnv = process.env.OPENCODE_CONFIG_DIR
    try {
      process.env.OPENCODE_CONFIG_DIR = customConfigDir
      const results = await detectInstalledTools(tempHome, tempCwd)
      expect(results.find((t) => t.name === "opencode")?.detected).toBe(true)
    } finally {
      if (savedEnv === undefined) {
        delete process.env.OPENCODE_CONFIG_DIR
      } else {
        process.env.OPENCODE_CONFIG_DIR = savedEnv
      }
    }
  })

  test("does not detect opencode via OPENCODE_CONFIG_DIR when that dir does not exist", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-env-miss-"))
    const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), "detect-opencode-env-miss-cwd-"))
    const missingDir = path.join(tempHome, "nonexistent-opencode")

    const savedEnv = process.env.OPENCODE_CONFIG_DIR
    try {
      process.env.OPENCODE_CONFIG_DIR = missingDir
      // Also create ~/.config/opencode to confirm it is NOT used when env var points elsewhere
      await fs.mkdir(path.join(tempHome, ".config", "opencode"), { recursive: true })
      const results = await detectInstalledTools(tempHome, tempCwd)
      expect(results.find((t) => t.name === "opencode")?.detected).toBe(false)
    } finally {
      if (savedEnv === undefined) {
        delete process.env.OPENCODE_CONFIG_DIR
      } else {
        process.env.OPENCODE_CONFIG_DIR = savedEnv
      }
    }
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
