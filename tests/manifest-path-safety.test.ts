import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { isSafeManagedPath } from "../src/utils/files"
import {
  readManagedInstallManifest,
  writeManagedInstallManifest,
  cleanupRemovedManagedDirectories,
  cleanupRemovedManagedFiles,
} from "../src/targets/managed-artifacts"
import { readCodexInstallManifest } from "../src/targets/codex"

describe("isSafeManagedPath", () => {
  const root = "/tmp/managed-root"

  test("accepts simple relative names", () => {
    expect(isSafeManagedPath(root, "skill-name")).toBe(true)
    expect(isSafeManagedPath(root, "foo.md")).toBe(true)
    expect(isSafeManagedPath(root, "foo/bar")).toBe(true)
    expect(isSafeManagedPath(root, "foo/bar/baz.toml")).toBe(true)
  })

  test("rejects non-string values", () => {
    expect(isSafeManagedPath(root, undefined as unknown)).toBe(false)
    expect(isSafeManagedPath(root, null as unknown)).toBe(false)
    expect(isSafeManagedPath(root, 42 as unknown)).toBe(false)
    expect(isSafeManagedPath(root, {} as unknown)).toBe(false)
  })

  test("rejects empty strings", () => {
    expect(isSafeManagedPath(root, "")).toBe(false)
  })

  test("rejects absolute POSIX paths", () => {
    expect(isSafeManagedPath(root, "/etc/passwd")).toBe(false)
    expect(isSafeManagedPath(root, "/tmp/anything")).toBe(false)
  })

  test("rejects path traversal segments", () => {
    expect(isSafeManagedPath(root, "..")).toBe(false)
    expect(isSafeManagedPath(root, "../escape")).toBe(false)
    expect(isSafeManagedPath(root, "../../../etc/passwd")).toBe(false)
    expect(isSafeManagedPath(root, "foo/../bar")).toBe(false)
    expect(isSafeManagedPath(root, "foo/../../escape")).toBe(false)
  })

  test("rejects windows-style absolute paths", () => {
    // path.isAbsolute recognizes drive letters on win32 only; on posix
    // the backslash form is treated as a literal filename, but the
    // traversal split catches mixed separators.
    expect(isSafeManagedPath(root, "..\\escape")).toBe(false)
    expect(isSafeManagedPath(root, "foo\\..\\..\\escape")).toBe(false)
  })

  test("rejects entries that resolve outside root", () => {
    // Even without `..` segments, the final containment check catches
    // anything that would resolve outside the root.
    expect(isSafeManagedPath(root, "..")).toBe(false)
  })
})

describe("readManagedInstallManifest filters unsafe entries", () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "managed-manifest-"))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  test("drops traversal and absolute entries, keeps safe ones", async () => {
    const managedDir = path.join(tempRoot, "managed")
    await fs.mkdir(managedDir, { recursive: true })
    const manifest = {
      version: 1,
      pluginName: "compound-engineering",
      groups: {
        skills: [
          "safe-skill",
          "../../../etc/passwd",
          "/etc/passwd",
          "foo/../bar",
          "foo/../../escape",
          "another-safe",
        ],
        commands: ["ok.md"],
      },
    }
    await fs.writeFile(path.join(managedDir, "install-manifest.json"), JSON.stringify(manifest))

    const result = await readManagedInstallManifest(managedDir, "compound-engineering")
    expect(result).not.toBeNull()
    expect(result!.groups.skills).toEqual(["safe-skill", "another-safe"])
    expect(result!.groups.commands).toEqual(["ok.md"])
  })

  test("returns null for wrong pluginName", async () => {
    const managedDir = path.join(tempRoot, "managed")
    await fs.mkdir(managedDir, { recursive: true })
    const manifest = {
      version: 1,
      pluginName: "other-plugin",
      groups: { skills: ["safe"] },
    }
    await fs.writeFile(path.join(managedDir, "install-manifest.json"), JSON.stringify(manifest))

    const result = await readManagedInstallManifest(managedDir, "compound-engineering")
    expect(result).toBeNull()
  })
})

describe("cleanupRemovedManagedFiles does not escape root (defense in depth)", () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "managed-cleanup-"))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  test("skips unsafe entries even when fed directly (bypass read-time filter)", async () => {
    const rootDir = path.join(tempRoot, "root")
    await fs.mkdir(rootDir, { recursive: true })
    const outsideFile = path.join(tempRoot, "outside.txt")
    await fs.writeFile(outsideFile, "keep me")

    // Simulate a manifest object assembled without going through
    // readManagedInstallManifest's filter.
    const hostileManifest = {
      version: 1 as const,
      pluginName: "compound-engineering",
      groups: {
        prompts: ["../outside.txt", "/etc/passwd"],
      },
    }

    await cleanupRemovedManagedFiles(rootDir, hostileManifest, "prompts", [])
    expect(await fs.readFile(outsideFile, "utf8")).toBe("keep me")
  })

  test("skips unsafe directory entries", async () => {
    const rootDir = path.join(tempRoot, "root")
    await fs.mkdir(rootDir, { recursive: true })
    const outsideDir = path.join(tempRoot, "outside")
    await fs.mkdir(outsideDir)
    await fs.writeFile(path.join(outsideDir, "file.txt"), "keep me")

    const hostileManifest = {
      version: 1 as const,
      pluginName: "compound-engineering",
      groups: {
        skills: ["../outside"],
      },
    }

    await cleanupRemovedManagedDirectories(rootDir, hostileManifest, "skills", [])
    expect(await fs.readFile(path.join(outsideDir, "file.txt"), "utf8")).toBe("keep me")
  })

  test("still cleans up safe entries correctly", async () => {
    const rootDir = path.join(tempRoot, "root")
    await fs.mkdir(rootDir, { recursive: true })
    const safeFile = path.join(rootDir, "safe-prompt.md")
    await fs.writeFile(safeFile, "remove me")

    await writeManagedInstallManifest(rootDir, {
      version: 1,
      pluginName: "compound-engineering",
      groups: { prompts: ["safe-prompt.md"] },
    })

    const manifest = await readManagedInstallManifest(rootDir, "compound-engineering")
    expect(manifest).not.toBeNull()

    // Simulate a follow-up install where "safe-prompt.md" is no longer
    // in the current bundle — cleanup should remove it.
    await cleanupRemovedManagedFiles(rootDir, manifest, "prompts", [])
    let exists = true
    try {
      await fs.stat(safeFile)
    } catch {
      exists = false
    }
    expect(exists).toBe(false)
  })
})

describe("readCodexInstallManifest filters unsafe entries", () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-manifest-"))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  test("drops traversal/absolute entries from skills, prompts, agents", async () => {
    const codexRoot = path.join(tempRoot, ".codex")
    const pluginDir = path.join(codexRoot, "compound-engineering")
    await fs.mkdir(pluginDir, { recursive: true })
    const manifest = {
      version: 1,
      pluginName: "compound-engineering",
      skills: ["safe-skill", "../../../etc/passwd", "/etc/passwd"],
      prompts: ["ok.md", "../../evil.md", "foo/../../escape.md"],
      agents: ["safe-agent.toml", "/tmp/abs.toml", "../escape.toml"],
    }
    await fs.writeFile(path.join(pluginDir, "install-manifest.json"), JSON.stringify(manifest))

    const result = await readCodexInstallManifest(codexRoot, "compound-engineering")
    expect(result).not.toBeNull()
    expect(result!.skills).toEqual(["safe-skill"])
    expect(result!.prompts).toEqual(["ok.md"])
    expect(result!.agents).toEqual(["safe-agent.toml"])
  })

  test("keeps all entries when all are safe", async () => {
    const codexRoot = path.join(tempRoot, ".codex")
    const pluginDir = path.join(codexRoot, "compound-engineering")
    await fs.mkdir(pluginDir, { recursive: true })
    const manifest = {
      version: 1,
      pluginName: "compound-engineering",
      skills: ["a", "b", "c"],
      prompts: ["p.md"],
      agents: ["agent.toml"],
    }
    await fs.writeFile(path.join(pluginDir, "install-manifest.json"), JSON.stringify(manifest))

    const result = await readCodexInstallManifest(codexRoot, "compound-engineering")
    expect(result).not.toBeNull()
    expect(result!.skills).toEqual(["a", "b", "c"])
    expect(result!.prompts).toEqual(["p.md"])
    expect(result!.agents).toEqual(["agent.toml"])
  })
})
