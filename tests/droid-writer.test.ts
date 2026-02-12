import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeDroidBundle } from "../src/targets/droid"
import type { DroidBundle } from "../src/types/droid"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("writeDroidBundle", () => {
  test("writes commands, droids, and skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "droid-test-"))
    const bundle: DroidBundle = {
      commands: [{ name: "plan", content: "Plan command content" }],
      droids: [{ name: "security-reviewer", content: "Droid content" }],
      skillDirs: [
        {
          name: "skill-one",
          sourceDir: path.join(import.meta.dir, "fixtures", "sample-plugin", "skills", "skill-one"),
        },
      ],
    }

    await writeDroidBundle(tempRoot, bundle)

    expect(await exists(path.join(tempRoot, ".factory", "commands", "plan.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".factory", "droids", "security-reviewer.md"))).toBe(true)
    expect(await exists(path.join(tempRoot, ".factory", "skills", "skill-one", "SKILL.md"))).toBe(true)

    const commandContent = await fs.readFile(
      path.join(tempRoot, ".factory", "commands", "plan.md"),
      "utf8",
    )
    expect(commandContent).toContain("Plan command content")

    const droidContent = await fs.readFile(
      path.join(tempRoot, ".factory", "droids", "security-reviewer.md"),
      "utf8",
    )
    expect(droidContent).toContain("Droid content")
  })

  test("writes directly into a .factory output root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "droid-home-"))
    const factoryRoot = path.join(tempRoot, ".factory")
    const bundle: DroidBundle = {
      commands: [{ name: "plan", content: "Plan content" }],
      droids: [{ name: "reviewer", content: "Reviewer content" }],
      skillDirs: [],
    }

    await writeDroidBundle(factoryRoot, bundle)

    expect(await exists(path.join(factoryRoot, "commands", "plan.md"))).toBe(true)
    expect(await exists(path.join(factoryRoot, "droids", "reviewer.md"))).toBe(true)
    // Should not double-nest under .factory/.factory
    expect(await exists(path.join(factoryRoot, ".factory"))).toBe(false)
  })

  test("handles empty bundles gracefully", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "droid-empty-"))
    const bundle: DroidBundle = {
      commands: [],
      droids: [],
      skillDirs: [],
    }

    await writeDroidBundle(tempRoot, bundle)

    // Root should exist but no subdirectories created
    expect(await exists(tempRoot)).toBe(true)
  })

  test("writes multiple commands as separate files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "droid-multi-"))
    const factoryRoot = path.join(tempRoot, ".factory")
    const bundle: DroidBundle = {
      commands: [
        { name: "plan", content: "Plan content" },
        { name: "work", content: "Work content" },
        { name: "brainstorm", content: "Brainstorm content" },
      ],
      droids: [],
      skillDirs: [],
    }

    await writeDroidBundle(factoryRoot, bundle)

    expect(await exists(path.join(factoryRoot, "commands", "plan.md"))).toBe(true)
    expect(await exists(path.join(factoryRoot, "commands", "work.md"))).toBe(true)
    expect(await exists(path.join(factoryRoot, "commands", "brainstorm.md"))).toBe(true)
  })
})
