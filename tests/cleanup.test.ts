import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import {
  findStaleFlatSkills,
  removeStaleFlatSkills,
} from "../src/cleanup/legacy-skills"
import { DEFAULT_PLUGIN_NAMESPACE, KNOWN_PLUGIN_NAMESPACES } from "../src/utils/plugin-namespace"

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

describe("legacy skill cleanup", () => {
  test("dry-run reports stale flat directories and symlinks without deleting", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-dry-run-"))
    const skillsRoot = path.join(tempRoot, "skills")
    const namespacedRoot = path.join(skillsRoot, DEFAULT_PLUGIN_NAMESPACE)
    await fs.mkdir(namespacedRoot, { recursive: true })

    await fs.mkdir(path.join(skillsRoot, "skill-directory"), { recursive: true })
    await fs.mkdir(path.join(namespacedRoot, "skill-directory"), { recursive: true })

    const symlinkSource = path.join(tempRoot, "symlink-source")
    await fs.mkdir(symlinkSource, { recursive: true })
    await fs.symlink(symlinkSource, path.join(skillsRoot, "skill-link"))
    await fs.symlink(symlinkSource, path.join(namespacedRoot, "skill-link"))

    const result = await removeStaleFlatSkills(skillsRoot, { dryRun: true, target: "codex" })
    const entries = result.staleEntries.map((entry) => ({
      name: path.basename(entry.path),
      type: entry.type,
    }))

    expect(entries).toContainEqual({ name: "skill-directory", type: "directory" })
    expect(entries).toContainEqual({ name: "skill-link", type: "symlink" })
    expect(result.removed).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
    expect(await exists(path.join(skillsRoot, "skill-directory"))).toBe(true)
    expect(await exists(path.join(skillsRoot, "skill-link"))).toBe(true)
  })

  test("execute removes stale flat entries when namespaced copies exist", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-execute-"))
    const skillsRoot = path.join(tempRoot, "skills")
    const namespacedRoot = path.join(skillsRoot, DEFAULT_PLUGIN_NAMESPACE)
    await fs.mkdir(namespacedRoot, { recursive: true })

    await fs.mkdir(path.join(skillsRoot, "copy-skill"), { recursive: true })
    await fs.mkdir(path.join(namespacedRoot, "copy-skill"), { recursive: true })

    const symlinkSource = path.join(tempRoot, "shared-source")
    await fs.mkdir(symlinkSource, { recursive: true })
    await fs.symlink(symlinkSource, path.join(skillsRoot, "linked-skill"))
    await fs.symlink(symlinkSource, path.join(namespacedRoot, "linked-skill"))

    const result = await removeStaleFlatSkills(skillsRoot, { dryRun: false, target: "codex" })

    expect(result.removed).toContain(path.join(skillsRoot, "copy-skill"))
    expect(result.removed).toContain(path.join(skillsRoot, "linked-skill"))
    expect(await exists(path.join(skillsRoot, "copy-skill"))).toBe(false)
    expect(await exists(path.join(skillsRoot, "linked-skill"))).toBe(false)
    expect(await exists(path.join(namespacedRoot, "copy-skill"))).toBe(true)
    expect(await exists(path.join(namespacedRoot, "linked-skill"))).toBe(true)
  })

  test("does not remove symlinks that point to a different source than the namespaced entry", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-mismatch-"))
    const skillsRoot = path.join(tempRoot, "skills")
    const namespacedRoot = path.join(skillsRoot, DEFAULT_PLUGIN_NAMESPACE)
    await fs.mkdir(namespacedRoot, { recursive: true })

    const namespacedSource = path.join(tempRoot, "namespaced-source")
    const flatSource = path.join(tempRoot, "flat-source")
    await fs.mkdir(namespacedSource, { recursive: true })
    await fs.mkdir(flatSource, { recursive: true })

    await fs.symlink(namespacedSource, path.join(namespacedRoot, "skill-link"))
    await fs.symlink(flatSource, path.join(skillsRoot, "skill-link"))

    const stale = await findStaleFlatSkills(skillsRoot)
    expect(stale).toHaveLength(0)

    const result = await removeStaleFlatSkills(skillsRoot, { dryRun: false, target: "codex" })
    expect(result.staleEntries).toHaveLength(0)
    expect(result.removed).toHaveLength(0)
    expect(await exists(path.join(skillsRoot, "skill-link"))).toBe(true)
  })

  test("skips cleanup when no namespaced directory is present", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-no-namespace-"))
    const skillsRoot = path.join(tempRoot, "skills")
    await fs.mkdir(path.join(skillsRoot, "legacy-skill"), { recursive: true })

    const result = await removeStaleFlatSkills(skillsRoot, { dryRun: false, target: "codex" })
    expect(result.staleEntries).toHaveLength(0)
    expect(result.removed).toHaveLength(0)
    expect(await exists(path.join(skillsRoot, "legacy-skill"))).toBe(true)
  })

  test("finds stale flat skills across multiple plugin namespaces", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-multi-ns-"))
    const skillsRoot = path.join(tempRoot, "skills")

    for (const ns of KNOWN_PLUGIN_NAMESPACES) {
      const namespacedRoot = path.join(skillsRoot, ns)
      await fs.mkdir(path.join(namespacedRoot, `${ns}-skill`), { recursive: true })
      await fs.mkdir(path.join(skillsRoot, `${ns}-skill`), { recursive: true })
    }

    const allStale: string[] = []
    for (const ns of KNOWN_PLUGIN_NAMESPACES) {
      const result = await removeStaleFlatSkills(skillsRoot, {
        dryRun: false,
        target: "codex",
        pluginNamespace: ns,
      })
      allStale.push(...result.removed)
    }

    expect(allStale).toHaveLength(KNOWN_PLUGIN_NAMESPACES.length)
    for (const ns of KNOWN_PLUGIN_NAMESPACES) {
      expect(allStale).toContain(path.join(skillsRoot, `${ns}-skill`))
      expect(await exists(path.join(skillsRoot, `${ns}-skill`))).toBe(false)
      expect(await exists(path.join(skillsRoot, ns, `${ns}-skill`))).toBe(true)
    }
  })
})
